// Diet settings everywhere (founder 2026-10-11: "I put in vegetarian and it's suggesting meat items"): with Vegetarian on, Groceries, a shop's full list
// and search leave out what plainly doesn't fit, say so, and show everything again with one tap; a product page that doesn't fit says so.
// Grocery files are stubbed; search uses the build's own menus (sample chains on: NEXT_PUBLIC_SHOW_SAMPLE_DATA=1).
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = (prefs) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false, ...prefs }, hasCompletedOnboarding: true } });

const chicken = { gtin: "4056489000011", name: "Chicken Breast Fillets", brand: "Aldi", size: "650 g", per: "g", kcal: 110, protein: 24, carbs: 0.5, fat: 1.5, allergens: null, category: "meat" };
const tuna = { gtin: "4056489000028", name: "Tuna Chunks in Spring Water", brand: "Aldi", size: "160 g", per: "g", kcal: 105, protein: 25, carbs: 0, fat: 0.6, allergens: { contains: ["fish"], mayContain: [] }, category: "cupboard" };
const yogurt = { gtin: "5012345678900", name: "Greek Style Yogurt", brand: "Mamia", size: "500 g", per: "g", kcal: 97, protein: 9, carbs: 4.2, fat: 5, allergens: { contains: ["milk"], mayContain: [] }, category: "dairy-eggs" };
const ap = (amount) => ({ amount, url: "https://www.aldi.co.uk/product/1", checkedOn: "2026-10-09" }); // a shop counts only where it shows a price
const aldi = { v: 1, retailer: "aldi", name: "Aldi", generatedOn: "2026-10-09", source: "t", products: [{ ...chicken, price: ap(3.49) }, { ...tuna, price: ap(0.89) }, { ...yogurt, price: ap(1.25) }] };
const manifest = { v: 1, generatedOn: "2026-10-09", source: "Open Food Facts contributors", retailers: [{ id: "aldi", name: "Aldi", file: "aldi.json", count: 3, sha256: "" }], categories: [{ id: "meat", label: "Meat" }, { id: "cupboard", label: "Cupboard" }, { id: "dairy-eggs", label: "Dairy and eggs" }] };
const rows = [
  ["sainsburys-chicken-thighs-1kg", "Sainsbury's British Chicken Thighs 1kg", 3.5, 3.5, "per kg", null, null, 0, "", ""],
  ["this-isnt-bacon-120g", "This Isn't Bacon Rashers 120g", 2.75, 22.92, "per kg", null, null, 0, "", ""],
  ["sainsburys-multiseed-loaf-800g", "Sainsbury's Multiseed Loaf 800g", 1.6, 2, "per kg", null, null, 1, "", ""],
];
const shopFile = { v: 1, retailer: "sainsburys", name: "Sainsbury's", checkedOn: "2026-10-08", pageBase: "https://www.sainsburys.co.uk/groceries/product/", photoBase: "https://assets.sainsburys-groceries.co.uk/gol/", categories: ["Meat & fish", "Bakery"], schemes: [], products: rows };
const allManifest = { v: 1, retailers: [{ id: "sainsburys", name: "Sainsbury's", file: "sainsburys.json", count: rows.length, checkedOn: "2026-10-08", sha256: "" }] };

async function newPage(prefs = { vegetarianOnly: true }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings(prefs));
  const page = await ctx.newPage();
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(aldi) }));
  await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(allManifest) }));
  await page.route("**/groceries/all/sainsburys.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(shopFile) }));
  await page.route(/\/groceries\/(?!all\/|aldi\.json|groceries-manifest\.json)[a-z-]+\.json$/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("**/assets.sainsburys-groceries.co.uk/**", (r) => r.abort());
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("Groceries: vegetarian leaves out the chicken and the tuna, says so, and one tap shows them", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/search");
  await page.getByText("1 product", { exact: true }).waitFor();
  expect(await page.getByText("Greek Style Yogurt").isVisible(), "yogurt shown");
  expect((await page.getByText("Chicken Breast Fillets").count()) === 0, "no chicken");
  expect((await page.getByText("Tuna Chunks", { exact: false }).count()) === 0, "no tuna");
  await page.getByText(/can't promise a product is vegetarian/).waitFor();
  const chip = page.getByRole("button", { name: "Fits my diet" });
  expect((await chip.getAttribute("aria-pressed")) === "true", "chip on");
  await chip.click();
  await page.getByText("3 products", { exact: true }).waitFor();
  await ctx.close();
});

await step("Groceries: pescatarian leaves out the chicken, keeps the tuna and the yogurt, and says so", async () => {
  const { ctx, page } = await newPage({ pescatarianOnly: true });
  await page.goto(BASE + "/app/groceries/search");
  await page.getByText("2 products", { exact: true }).waitFor();
  expect(await page.getByText("Greek Style Yogurt").isVisible(), "yogurt shown");
  expect(await page.getByText("Tuna Chunks", { exact: false }).first().isVisible(), "tuna shown");
  expect((await page.getByText("Chicken Breast Fillets").count()) === 0, "no chicken");
  await page.getByText(/can't promise a product is pescatarian/).waitFor();
  await ctx.close();
});

await step("Settings: the diet picker has Pescatarian, and it stays on", async () => {
  const { ctx, page } = await newPage({});
  await page.goto(BASE + "/app/settings");
  const tile = page.getByRole("button", { name: "Pescatarian", exact: true });
  await tile.waitFor();
  expect((await tile.getAttribute("aria-pressed")) === "false", "starts off");
  await tile.click();
  expect((await tile.getAttribute("aria-pressed")) === "true", "turns on");
  await page.reload();
  expect((await page.getByRole("button", { name: "Pescatarian", exact: true }).getAttribute("aria-pressed")) === "true", "still on after a reload");
  await ctx.close();
});

await step("Groceries: no diet set, no chip and everything listed", async () => {
  const { ctx, page } = await newPage({});
  await page.goto(BASE + "/app/groceries/search");
  await page.getByText("3 products", { exact: true }).waitFor();
  expect((await page.getByRole("button", { name: "Fits my diet" }).count()) === 0, "no chip");
  await ctx.close();
});

await step("a product page that doesn't fit the diet says so", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/product?code=4056489000011");
  await page.getByRole("heading", { level: 1, name: "Chicken Breast Fillets" }).waitFor();
  await page.getByText("This product doesn't fit your diet settings, going by its name, type and label.").waitFor();
  await page.goto(BASE + "/app/groceries/product?code=5012345678900");
  await page.getByRole("heading", { level: 1, name: "Greek Style Yogurt" }).waitFor();
  expect((await page.getByText("doesn't fit your diet settings").count()) === 0, "no note on the yogurt");
  await ctx.close();
});

await step("a shop's full list: vegetarian keeps the bread and the meat-free bacon, not the chicken; the allergy note shows", async () => {
  const { ctx, page } = await newPage({ vegetarianOnly: true, avoidAllergens: ["milk"] });
  await page.goto(BASE + "/app/groceries/shop?r=sainsburys");
  await page.getByText("2 products", { exact: true }).waitFor();
  expect((await page.getByText("Sainsbury's British Chicken Thighs 1kg").count()) === 0, "no chicken");
  expect(await page.getByText("This Isn't Bacon Rashers 120g").isVisible(), "meat-free bacon kept");
  await page.getByText("We haven't read allergens for these products, so your allergy settings can't hide any here. Always check the pack.").waitFor();
  await page.getByRole("button", { name: "Fits my diet" }).click();
  await page.getByText("3 products", { exact: true }).waitFor();
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => v.id));
  expect(r.length === 0, "axe: " + r.join(", "));
  await ctx.close();
});

await step("search: vegetarian leaves out the sample Chicken bowl, and one tap brings it back", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/search");
  await page.getByRole("searchbox").fill("chicken bowl");
  const chip = page.getByRole("button", { name: "Fits my diet" });
  await chip.waitFor({ timeout: 20000 });
  const sample = page.getByRole("link", { name: /^Chicken bowl · Bowl & Co\./ });
  expect((await sample.count()) === 0, "sample chicken bowl hidden");
  await chip.click();
  await sample.first().waitFor({ timeout: 10000 });
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
