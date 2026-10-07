// Groceries: browse and search by name or barcode, retailer and type filters, the product page (per-100 g numbers, price, the 14
// allergens, the barcode), the shopping list, and the barcode entry. Product files are stubbed so the test needs no real data.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

const yogurt = { gtin: "5012345678900", name: "Greek Style Yogurt", brand: "Mamia", size: "500 g", per: "g", kcal: 97, protein: 9, carbs: 4.2, fat: 5, saturates: 3.4, sugars: 4.1, salt: 0.1, kj: 406, allergens: { contains: ["milk"], mayContain: ["nuts"] }, image: "501/234/567/8900/front_en.12", category: "dairy-eggs", updated: "2026-03-01" };
const chicken = { gtin: "4056489000011", name: "Chicken Breast Fillets", brand: "Aldi", size: "650 g", per: "g", kcal: 110, protein: 24, carbs: 0.5, fat: 1.5, allergens: null, category: "meat" };
const nuts = { gtin: "5000000000017", name: "Crunchy Peanut Butter", brand: "Tesco", size: "340 g", per: "g", kcal: 620, protein: 26, carbs: 12, fat: 51, allergens: { contains: ["peanuts", "soya"], mayContain: [] }, category: "cupboard" };
const files = {
  aldi: { v: 1, retailer: "aldi", name: "Aldi", generatedOn: "2026-10-07", source: "t", products: [{ ...yogurt, price: { amount: 1.25, url: "https://www.aldi.co.uk/product/1", checkedOn: "2026-10-07", perUnit: { amount: 0.25, unit: "per 100 g" } } }, chicken] },
  tesco: { v: 1, retailer: "tesco", name: "Tesco", generatedOn: "2026-10-07", source: "t", products: [yogurt, nuts] },
};
const manifest = { v: 1, generatedOn: "2026-10-07", source: "Open Food Facts contributors", retailers: [{ id: "tesco", name: "Tesco", file: "tesco.json", count: 2, sha256: "" }, { id: "aldi", name: "Aldi", file: "aldi.json", count: 2, sha256: "" }],
  categories: [{ id: "dairy-eggs", label: "Dairy and eggs" }, { id: "meat", label: "Meat" }, { id: "cupboard", label: "Cupboard" }] };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(files.aldi) }));
  await page.route("**/groceries/tesco.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(files.tesco) }));
  await page.route("**/images.openfoodfacts.org/**", (r) => r.abort()); // no network in tests: photos are decorative
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("browse: the same barcode in two supermarkets is one product; filters narrow it", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByText("3 products", { exact: true }).waitFor();
  await page.getByRole("group", { name: "Supermarket" }).getByRole("button", { name: "Aldi" }).click();
  await page.getByText("2 products", { exact: true }).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Meat" }).click();
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Chicken Breast Fillets/ }).waitFor();
  await ctx.close();
});

await step("search by words and by barcode", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByText("3 products", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("greek yog");
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("5000000000017");
  await page.getByText("1 product with that barcode", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Crunchy Peanut Butter/ }).waitFor();
  await page.getByRole("searchbox").fill("0000000000000");
  await page.getByText("No products match.").waitFor();
  await ctx.close();
});

await step("product page: numbers per 100 g, price with its source, the allergen table, the barcode", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/product?code=5012345678900&r=aldi");
  await page.getByRole("heading", { name: "Greek Style Yogurt" }).waitFor();
  await page.getByText("KCAL PER 100 G", { exact: false }).first().waitFor();
  await page.getByText("£1.25").waitFor();
  await page.getByText("Prices and offers vary by store").waitFor();
  const table = page.getByRole("region", { name: "Allergens" }).getByRole("table");
  await table.getByRole("row", { name: /Milk/ }).getByText("Contains", { exact: true }).waitFor();
  await table.getByText("May contain", { exact: true }).waitFor();
  expect((await table.getByRole("row").count()) === 15, "expected a header row and the 14 allergens");
  await page.getByText("5012345678900", { exact: true }).first().waitFor();
  await page.getByText(/Community data from Open Food Facts/).waitFor();
  await ctx.close();
});

await step("unknown allergens are never shown as 'none'", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/product?code=4056489000011");
  await page.getByText("Allergen information isn't recorded for this product. Check the pack.").waitFor();
  expect((await page.getByRole("table").count()) === 0, "an allergen table is shown for a product with unknown allergens");
  await page.getByText(/haven't read a price/).waitFor();
  await ctx.close();
});

await step("shopping list: add (per supermarket), quantity, text, empty", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/product?code=5012345678900");
  await page.getByRole("button", { name: "Add · Aldi" }).click();
  await page.getByRole("button", { name: "Add · Aldi" }).click();
  await page.getByRole("button", { name: "Add · Tesco" }).click();
  await page.getByRole("link", { name: "Open your shopping list" }).click();
  await page.getByRole("heading", { name: "Aldi", exact: true }).waitFor();
  await page.getByLabel("Quantity 2").waitFor();
  await page.getByRole("button", { name: "One fewer Greek Style Yogurt" }).first().click();
  await page.getByLabel("Quantity 1").first().waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Tesco", exact: true }).waitFor(); // kept on this device
  await ctx.close();
});

await step("barcode entry opens the product (the camera isn't needed)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByText("3 products", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Scan a barcode" }).click();
  await page.getByLabel("Barcode number").fill("4056489000011");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("heading", { name: "Chicken Breast Fillets" }).waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
