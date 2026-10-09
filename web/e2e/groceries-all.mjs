// Groceries "every product" lists (founder 2026-10-09): the entry link on the Groceries screen, a shop's full list (search, type, card price, sort,
// show more), and a product from it (price, card price, the shop's picture with its credit, "nutrition not read yet", the shop's own page; a barcode we
// already have numbers for links to the full page). Files are stubbed so the test needs no real data.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const rows = [
  ["sainsburys-greek-style-natural-yogurt-500g", "Sainsbury's Greek Style Natural Yogurt 500g", 1.15, 2.3, "per kg", null, null, 0, "6325944", "5012345678900"],
  ["sainsburys-multiseed-loaf-800g", "Sainsbury's Multiseed Loaf 800g", 1.6, 2, "per kg", 1.2, 0, 1, "", "", [250, 9.5, 41, 4.2, 0.6, 3.1, 7, 1.1, 1060, "g"]],
  ["sainsburys-semi-skimmed-milk-2l", "Sainsbury's Semi Skimmed Milk 2L", 1.55, 0.78, "per litre", null, null, 0, "777", "5099999999999"],
];
for (let i = 0; i < 70; i++) rows.push([`filler-${i}`, `Filler Crackers ${i}`, 5 + i / 100, 3, "per kg", null, null, 1, "", ""]);
const file = { v: 1, retailer: "sainsburys", name: "Sainsbury's", checkedOn: "2026-10-08", nutritionCheckedOn: "2026-10-09", pageBase: "https://www.sainsburys.co.uk/groceries/product/", photoBase: "https://assets.sainsburys-groceries.co.uk/gol/", categories: ["Chilled food", "Bakery"], schemes: ["Nectar price"], products: rows };
const allManifest = { v: 1, retailers: [{ id: "sainsburys", name: "Sainsbury's", file: "sainsburys.json", count: rows.length, checkedOn: "2026-10-08", sha256: "" }] };
// the Groceries catalogue knows only the yogurt's barcode (so only that one links to the full nutrition page)
const yogurt = { gtin: "5012345678900", name: "Greek Style Yogurt", brand: "Sainsbury's", size: "500 g", per: "g", kcal: 97, protein: 9, carbs: 4.2, fat: 5, allergens: null, category: "dairy-eggs" };
const catFile = { v: 1, retailer: "sainsburys", name: "Sainsbury's", generatedOn: "2026-10-09", source: "t", products: [yogurt] };
const manifest = { v: 1, generatedOn: "2026-10-09", source: "Open Food Facts contributors", retailers: [{ id: "sainsburys", name: "Sainsbury's", file: "sainsburys.json", count: 1, sha256: "" }], categories: [{ id: "dairy-eggs", label: "Dairy and eggs" }] };

async function newPage({ allow = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  const asked = [];
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/sainsburys.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(catFile) }));
  await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(allow ? allManifest : { v: 1, retailers: [] }) }));
  await page.route("**/groceries/all/sainsburys.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(file) }));
  await page.route("**/assets.sainsburys-groceries.co.uk/**", (r) => { asked.push(r.request().url()); return r.fulfill({ contentType: "image/png", body: PNG }); });
  await page.route("**/images.openfoodfacts.org/**", (r) => r.abort());
  return { ctx, page, asked };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("the Groceries screen links to a shop's full list only when there is one", async () => {
  const a = await newPage();
  await a.page.goto(BASE + "/app/groceries");
  await a.page.getByRole("link", { name: /Every Sainsbury's product/ }).waitFor();
  await a.ctx.close();
  const b = await newPage({ allow: false });
  await b.page.goto(BASE + "/app/groceries");
  await b.page.getByText("1 product", { exact: true }).waitFor();
  expect((await b.page.getByRole("link", { name: /Every .* product/ }).count()) === 0, "no link without a list");
  await b.ctx.close();
});

await step("full list: count, search by words, type filter, card price, sort, show more", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("link", { name: /Every Sainsbury's product/ }).click();
  await page.getByRole("heading", { level: 1, name: /Every Sainsbury's product/ }).waitFor();
  await page.getByText("73 products", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("greek yog");
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has a card price" }).click();
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Multiseed Loaf/ }).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has a card price" }).click();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has nutrition" }).click();
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByText(/250 kcal · 9.5g protein · 41g carbs · 4.2g fat per 100 g/).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has nutrition" }).click();
  await page.getByRole("combobox").selectOption("density");
  const top = await page.locator("a[href*='/groceries/shop/item']").first().innerText();
  expect(/Multiseed Loaf/.test(top), `most protein per 100 kcal first, got ${top.slice(0, 50)}`);
  await page.getByRole("combobox").selectOption("price");
  const first = await page.locator("a[href*='/groceries/shop/item']").first().innerText();
  expect(/Greek Style Natural Yogurt/.test(first), `cheapest first, got ${first.slice(0, 60)}`);
  await page.getByRole("button", { name: /Show 13 more/ }).click();
  await page.getByText("73 products", { exact: true }).waitFor();
  const n = await page.locator("a[href*='/groceries/shop/item']").count();
  expect(n === 73, `all rows after show more, got ${n}`);
  await ctx.close();
});

await step("product from the list: price, card price, the shop's picture and credit, no nutrition claim, the shop's own page", async () => {
  const { ctx, page, asked } = await newPage();
  await page.goto(BASE + "/app/groceries/shop/item?r=sainsburys&id=sainsburys-multiseed-loaf-800g");
  await page.getByRole("heading", { level: 1, name: /Multiseed Loaf/ }).waitFor();
  await page.getByText("£1.60").first().waitFor();
  await page.getByText("£1.20").first().waitFor();
  await page.getByText(/with Nectar/).waitFor();
  await page.getByRole("heading", { name: "Nutrition per 100 g" }).waitFor();
  await page.getByText("250", { exact: true }).waitFor();
  await page.getByText("9.5g", { exact: true }).waitFor();
  await page.getByText("1,060 kJ", { exact: true }).waitFor();
  await page.getByText(/Read from the product's own page on Sainsbury's website, checked 9 Oct 2026/).waitFor();
  await page.getByText(/Allergens aren't shown for this product yet/).waitFor();
  expect((await page.getByText(/haven't read the nutrition/).count()) === 0, "no 'not read' line when we have the numbers");
  const link = page.getByRole("link", { name: /Open it on Sainsbury's website/ });
  expect((await link.getAttribute("href")) === "https://www.sainsburys.co.uk/groceries/product/sainsburys-multiseed-loaf-800g", "the shop's own page");
  expect((await link.getAttribute("rel")) === "noopener noreferrer", "rel");
  // this one has no picture in the list: no figure at all
  expect((await page.locator("figure").count()) === 0, "no picture box when the list has none");
  await page.goto(BASE + "/app/groceries/shop/item?r=sainsburys&id=sainsburys-semi-skimmed-milk-2l");
  await page.getByText("Photo from the Sainsbury's website").waitFor();
  expect(asked.some((u) => u.endsWith("/gol/777/image.jpg")), `picture asked from the shop's host, got ${asked}`);
  await ctx.close();
});

await step("a barcode we already have numbers for links to the full page; one we don't does not", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/shop/item?r=sainsburys&id=sainsburys-greek-style-natural-yogurt-500g");
  await page.getByRole("link", { name: "See the nutrition" }).waitFor();
  expect((await page.getByRole("link", { name: "See the nutrition" }).getAttribute("href")) === "/app/groceries/product?code=5012345678900&r=sainsburys", "link to the full page");
  await page.goto(BASE + "/app/groceries/shop/item?r=sainsburys&id=sainsburys-semi-skimmed-milk-2l");
  await page.getByText(/haven't read the nutrition for this product yet/).waitFor();
  expect((await page.getByRole("link", { name: "See the nutrition" }).count()) === 0, "no nutrition link without a catalogue match");
  await page.goto(BASE + "/app/groceries/shop/item?r=sainsburys&id=nope");
  await page.getByText("That product isn't in the list.").waitFor();
  await ctx.close();
});

await step("accessibility: the full list and a product with nutrition have no axe violations in light and dark", async () => {
  for (const scheme of ["light", "dark"]) {
    for (const path of ["/app/groceries/shop?r=sainsburys", "/app/groceries/shop/item?r=sainsburys&id=sainsburys-multiseed-loaf-800g"]) {
      const { ctx, page } = await newPage();
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(BASE + path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.getByText(/products?$/).first().waitFor().catch(() => undefined);
      await page.addScriptTag({ path: AXE });
      const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
      expect(result.violations.length === 0, `${scheme} ${path}: ${result.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", ")}`);
      await ctx.close();
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
