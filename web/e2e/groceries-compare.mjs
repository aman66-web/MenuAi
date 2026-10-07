// Groceries, the same product at several supermarkets: each shop's own name and numbers, prices at the other shops with the lowest
// marked, switching shop on the page, other sizes, the price check against similar products, and what a shop's own page adds
// (ingredients, allergy wording, extra label rows). Product files are stubbed so the test needs no real data.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

const px = (amount, perUnit, member) => ({ amount, url: "https://shop.example/p", checkedOn: "2026-10-07", ...(perUnit ? { perUnit } : {}), ...(member ? { member } : {}) });
const base = { brand: "Cowbelle", per: "ml", kcal: 50, protein: 3.4, carbs: 4.8, fat: 1.7, allergens: { contains: ["milk"], mayContain: [] }, category: "dairy-eggs", type: "semi-skimmed-milks" };
const milk2 = "5011111111111", milk1 = "5011111111128";
const peers = [0.85, 0.95, 1.05, 1.15, 1.25, 1.35].map((v, i) => ({ ...base, gtin: `50222222222${String(i).padStart(2, "0")}`, name: `Peer Milk ${i + 1}`, brand: `Peer ${i + 1}`, size: "1L", price: px(v) }));
const files = {
  tesco: { v: 1, retailer: "tesco", name: "Tesco", generatedOn: "2026-10-07", source: "t", products: [
    { ...base, gtin: milk2, name: "Cowbelle Semi Skimmed Milk 2 Litres", size: "2 litres", price: px(1.6, { amount: 0.8, unit: "per litre" }, { amount: 1.2, scheme: "Clubcard Price", ends: "until 13 Oct" }),
      source: "retailer", ingredients: "Semi skimmed milk.", advice: "For allergens, including cereals containing gluten, see ingredients in bold.", other: "Calcium: 120mg; Vitamin B12: 0.4µg",
      portion: "Serving 200ml: 100 kcal", pageUrl: "https://www.tesco.com/groceries/en-GB/products/1", checkedOn: "2026-10-07" },
    { ...base, gtin: milk1, name: "Cowbelle Semi Skimmed Milk 1 Litre", size: "1 litre", price: px(1.1) }, ...peers] },
  sainsburys: { v: 1, retailer: "sainsburys", name: "Sainsbury's", generatedOn: "2026-10-07", source: "t", products: [
    { ...base, gtin: milk2, name: "Cowbelle Semi-Skimmed Milk 2L", size: "2L", price: px(1.45) }] },
  aldi: { v: 1, retailer: "aldi", name: "Aldi", generatedOn: "2026-10-07", source: "t", products: [{ ...base, gtin: milk2, name: "Cowbelle Milk", size: "2L" }] },
};
const manifest = { v: 1, generatedOn: "2026-10-07", source: "Open Food Facts contributors", retailers: Object.values(files).map((f) => ({ id: f.retailer, name: f.name, file: `${f.retailer}.json`, count: f.products.length, sha256: "" })),
  categories: [{ id: "dairy-eggs", label: "Dairy and eggs" }] };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  for (const f of Object.values(files)) await page.route(`**/groceries/${f.retailer}.json`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(f) }));
  await page.route("**/images.openfoodfacts.org/**", (r) => r.abort());
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("opened from Tesco: Tesco's own name and price lead, the others are listed below with the lowest marked", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=tesco`);
  await page.getByRole("heading", { name: "Cowbelle Semi Skimmed Milk 2 Litres", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Price at Tesco" }).waitFor();
  await page.getByText("£1.60").first().waitFor();
  const others = page.getByRole("heading", { name: "At other supermarkets" }).locator("xpath=ancestor::div[1]");
  await others.getByRole("link", { name: "Sainsbury's", exact: true }).waitFor();
  await others.getByRole("link", { name: /£1\.45/ }).waitFor();
  await others.getByText("£0.15 cheaper").waitFor();
  await others.getByText("Lowest", { exact: true }).waitFor();
  await others.getByText("price not read yet").waitFor(); // Aldi lists it but has no price
  await ctx.close();
});

await step("a loyalty-card price sits beside the regular price, never instead of it, with its own 'lowest' label", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=tesco`);
  await page.getByRole("heading", { name: "Price at Tesco" }).waitFor();
  await page.getByText("£1.60").first().waitFor(); // the regular price is still the big one
  await page.getByText("£1.20").first().waitFor();
  await page.getByText("with Clubcard", { exact: true }).waitFor();
  await page.getByText(/Needs Tesco's loyalty card, until 13 Oct/).waitFor();
  await page.getByText("Lowest price with a loyalty card").waitFor(); // £1.20 with the card beats Sainsbury's £1.45
  // from Sainsbury's page the other shop's card price is listed under its regular price
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=sainsburys`);
  await page.getByRole("heading", { name: "Price at Sainsbury's" }).waitFor();
  await page.getByText("£1.20 with Clubcard", { exact: true }).waitFor();
  await page.getByText("Lowest with card", { exact: true }).waitFor();
  await ctx.close();
});

await step("switching shop shows that shop's own name and price", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=tesco`);
  await page.getByRole("heading", { name: "Cowbelle Semi Skimmed Milk 2 Litres", level: 1 }).waitFor();
  await page.getByRole("navigation", { name: "Supermarket" }).getByRole("link", { name: "Sainsbury's" }).click();
  await page.getByRole("heading", { name: "Cowbelle Semi-Skimmed Milk 2L", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Price at Sainsbury's" }).waitFor();
  await page.getByText("Lowest price of the supermarkets we've checked").waitFor();
  await ctx.close();
});

await step("a shop's own page adds ingredients, allergy wording, extra label rows and the portion line", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=tesco`);
  await page.getByRole("heading", { name: "Ingredients" }).waitFor();
  await page.getByText("Semi skimmed milk.", { exact: true }).waitFor();
  await page.getByText("Tesco's allergy advice:").waitFor();
  await page.getByRole("heading", { name: "More from the label" }).waitFor();
  await page.getByText("Calcium").waitFor();
  await page.getByText("120mg").waitFor();
  await page.getByRole("heading", { name: "Per portion" }).waitFor();
  await page.getByText("Numbers from Tesco's own product page", { exact: false }).waitFor();
  // Sainsbury's has no details of its own: community numbers, and no ingredients section
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=sainsburys`);
  await page.getByRole("heading", { name: "Price at Sainsbury's" }).waitFor();
  await page.getByText("Numbers from Open Food Facts contributors (community data), not the supermarket.").waitFor();
  expect((await page.getByRole("heading", { name: "Ingredients" }).count()) === 0, "no ingredients section without the shop's own page");
  await ctx.close();
});

await step("other sizes of the same product are one tap away", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=tesco`);
  const sizes = page.getByRole("heading", { name: "Other sizes" }).locator("xpath=ancestor::section[1]");
  await sizes.getByRole("link", { name: "1 litre" }).waitFor();
  await sizes.getByRole("link", { name: "2 litres" }).waitFor();
  await sizes.getByRole("link", { name: "1 litre" }).click();
  await page.getByRole("heading", { name: "Cowbelle Semi Skimmed Milk 1 Litre", level: 1 }).waitFor();
  await ctx.close();
});

await step("price check: where the price sits among similar products, about price only", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=sainsburys`);
  await page.getByRole("heading", { name: "Price check" }).waitFor();
  await page.getByText("Lower price than most similar products").waitFor();
  await page.getByText(/Costs less per litre than \d+% of 6 similar products/).waitFor();
  await page.getByText("This is about price only.").waitFor();
  await page.getByText(/g of protein for every £1/).waitFor();
  await ctx.close();
});

await step("a list under a supermarket filter reads as that supermarket names the product", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/app/groceries`);
  await page.getByRole("group", { name: "Supermarket" }).getByRole("button", { name: "Sainsbury's" }).click();
  await page.getByRole("link", { name: /Cowbelle Semi-Skimmed Milk 2L/ }).waitFor();
  await ctx.close();
});

await step("accessibility: the compare page has no axe violations in light and dark", async () => {
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${BASE}/app/groceries/product?code=${milk2}&r=tesco`);
    await page.getByRole("heading", { name: "Price check" }).waitFor();
    await page.addScriptTag({ path: AXE });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
    expect(result.violations.length === 0, `${scheme}: ${result.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", ")}`);
    await ctx.close();
  }
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
