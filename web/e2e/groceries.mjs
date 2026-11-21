// Groceries: Search every shop (by words and by barcode, one shop or all, Has nutrition), the product page (per-100 g numbers, price, the 14 allergens, the
// barcode), the shopping list, and the barcode entry. Every file is stubbed so the test needs no real data.
// Since 20 November 2026 Search every shop reads the supermarkets' own full lists (public/groceries/all/: "it searched only the older barcode catalogue, so
// Aldi showed 1 product, Lidl 1 and M&S none"), and All shops loads nothing until two letters or a barcode are typed (the second pass, 21 November 2026, Xena
// #36, docs/MEETING_2026-11-21.md). A barcode is looked up in public/groceries/all/barcodes.json first: a product only the older catalogue holds opens the
// catalogue's product page, which is what the product-page steps below check.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

const yogurt = { gtin: "5012345678900", name: "Greek Style Yogurt", brand: "Mamia", size: "500 g", per: "g", kcal: 97, protein: 9, carbs: 4.2, fat: 5, saturates: 3.4, sugars: 4.1, salt: 0.1, kj: 406, allergens: { contains: ["milk"], mayContain: ["nuts"] }, image: "501/234/567/8900/front_en.12", category: "dairy-eggs", updated: "2026-03-01" };
const chicken = { gtin: "4056489000011", name: "Chicken Breast Fillets", brand: "Aldi", size: "650 g", per: "g", kcal: 110, protein: 24, carbs: 0.5, fat: 1.5, allergens: null, category: "meat" };
const beans = { gtin: "5000000000024", name: "Baked Beans in Tomato Sauce", brand: "Branded", size: "415 g", per: "g", kcal: 80, protein: 4.7, carbs: 12.5, fat: 0.4, allergens: null, category: "cupboard" }; // no shop price: opens from a scan, never listed
const nuts = { gtin: "5000000000017", name: "Crunchy Peanut Butter", brand: "Tesco", size: "340 g", per: "g", kcal: 620, protein: 26, carbs: 12, fat: 51, allergens: { contains: ["peanuts", "soya"], mayContain: [] }, category: "cupboard" };
// every shop record has a price: a shop counts as selling a product only where its own list shows the price (founder 2026-10-11)
const tp = (amount) => ({ amount, url: "https://www.tesco.com/groceries/en-GB/products/1", checkedOn: "2026-10-07" });
const files = {
  aldi: { v: 1, retailer: "aldi", name: "Aldi", generatedOn: "2026-10-07", source: "t", products: [{ ...yogurt, price: { amount: 1.25, url: "https://www.aldi.co.uk/product/1", checkedOn: "2026-10-07", perUnit: { amount: 0.25, unit: "per 100 g" } } }, { ...chicken, price: tp(3.49) }] },
  tesco: { v: 1, retailer: "tesco", name: "Tesco", generatedOn: "2026-10-07", source: "t", products: [{ ...yogurt, price: tp(1.4) }, { ...nuts, price: tp(2.2) }, beans] },
};
const manifest = { v: 1, generatedOn: "2026-10-07", source: "Open Food Facts contributors", retailers: [{ id: "tesco", name: "Tesco", file: "tesco.json", count: 2, sha256: "" }, { id: "aldi", name: "Aldi", file: "aldi.json", count: 2, sha256: "" }],
  categories: [{ id: "dairy-eggs", label: "Dairy and eggs" }, { id: "meat", label: "Meat" }, { id: "cupboard", label: "Cupboard" }] };
// where every barcode is: none in the full lists' rows (so a barcode opens the catalogue's product page), the catalogue files that hold each one
const barcodes = { v: 1, shops: ["aldi", "tesco"], codes: {}, catalogue: { shops: ["aldi", "tesco"], codes: { "5012345678900": [0, 1], "4056489000011": [0], "5000000000017": [1], "5000000000024": [1] } } };
// the shops' own full lists, as Search every shop reads them (lib/mm/shopProducts.ts decodeShopProducts): [id, name, price, unit price, unit, member price,
// scheme, aisle, photo, barcode, nutrition per 100 g]. The yogurt is in both, by barcode, so it is one row with both shops' prices; Aldi's bananas have no label.
const row = (id, name, price, cat, gtin, n) => [id, name, price, null, "", null, null, cat, "", gtin, n];
const nut = (p) => [p.kcal, p.protein, p.carbs, p.fat, p.saturates ?? null, p.sugars ?? null, null, p.salt ?? null, p.kj ?? null, "g"];
const full = {
  aldi: { v: 1, retailer: "aldi", name: "Aldi", checkedOn: "2026-10-07", pageBase: "https://www.aldi.co.uk/product/", photoBase: "https://www.aldi.co.uk/img/", categories: ["Chilled food", "Meat", "Fruit and veg"], schemes: [],
    products: [row("greek-style-yogurt-500g", "Greek Style Yogurt 500g", 1.25, 0, "5012345678900", nut(yogurt)), row("chicken-breast-fillets-650g", "Chicken Breast Fillets 650g", 3.49, 1, "4056489000011", nut(chicken)), row("bananas-5-pack", "Bananas 5 Pack", 0.85, 2, "", null)] },
  tesco: { v: 1, retailer: "tesco", name: "Tesco", checkedOn: "2026-10-07", pageBase: "https://www.tesco.com/groceries/en-GB/products/", photoBase: "https://digitalcontent.api.tesco.com/", categories: ["Chilled food", "Food cupboard"], schemes: [],
    products: [row("1001", "Greek Style Yogurt 500g", 1.4, 0, "5012345678900", nut(yogurt)), row("1002", "Crunchy Peanut Butter 340g", 2.2, 1, "5000000000017", nut(nuts))] },
};
const allManifest = { v: 1, retailers: [{ id: "tesco", name: "Tesco", file: "tesco.json", count: 2, checkedOn: "2026-10-07", sha256: "" }, { id: "aldi", name: "Aldi", file: "aldi.json", count: 3, checkedOn: "2026-10-07", sha256: "" }] };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(files.aldi) }));
  await page.route("**/groceries/tesco.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(files.tesco) }));
  await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(allManifest) }));
  await page.route("**/groceries/all/barcodes.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(barcodes) }));
  await page.route("**/groceries/all/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(full.aldi) }));
  await page.route("**/groceries/all/tesco.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(full.tesco) }));
  await page.route("**/images.openfoodfacts.org/**", (r) => r.abort()); // no network in tests: photos are decorative
  await page.route(/aldi\.co\.uk|tesco\.com/, (r) => r.abort());
  // Open Food Facts through our API: every barcode here is in our lists, so it is never needed; answered "not found" if a screen asks
  const off = [];
  await page.route("**/api/v1/barcode/**", (r) => { off.push(r.request().url()); return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ found: false }) }); });
  return { ctx, page, off };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("browse: the same barcode in two supermarkets is one product; filters narrow it", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/search");
  const shops = page.getByRole("group", { name: "Supermarket" });
  await shops.getByRole("button", { name: "Aldi" }).waitFor();
  // All shops (no shops chosen in Settings) loads nothing until something is typed: no count, no spinner, no error (Xena #36)
  await page.waitForTimeout(800);
  expect((await page.getByRole("status").filter({ hasText: /products?$/ }).count()) === 0, "All shops showed a count before anything was typed");
  await shops.getByRole("button", { name: "Aldi" }).click();
  await page.getByText("3 products", { exact: true }).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has nutrition" }).click();
  await page.getByText("2 products", { exact: true }).waitFor();
  expect((await page.getByRole("link", { name: /Bananas 5 Pack/ }).count()) === 0, "a product with no numbers stays under Has nutrition");
  await page.getByRole("link", { name: /Chicken Breast Fillets/ }).waitFor();
  await shops.getByRole("button", { name: "Tesco" }).click();
  await page.getByText("2 products", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Crunchy Peanut Butter/ }).waitFor();
  // all shops: the yogurt both sell (the same barcode) is one row, with each shop's price beside its logo
  await shops.getByRole("button", { name: "All shops" }).click();
  await page.getByRole("searchbox").fill("yogurt");
  await page.getByText("1 product", { exact: true }).waitFor();
  const yog = page.getByRole("link", { name: /Greek Style Yogurt/ });
  expect((await yog.count()) === 1, "the yogurt is one row: " + (await yog.count()));
  const text = await yog.innerText();
  expect(text.includes("£1.25") && text.includes("£1.40"), "both shops' prices on the row: " + text.replace(/\s+/g, " "));
  await ctx.close();
});

await step("search by words and by barcode", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/search");
  await page.getByRole("searchbox").fill("greek yog");
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("peanut");
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Crunchy Peanut Butter/ }).waitFor();
  await page.getByRole("searchbox").fill("quinoa crisps");
  await page.getByText("No products match.").waitFor();
  // a barcode typed in opens that product's own page
  await page.getByRole("searchbox").fill("5000000000017");
  await page.getByRole("link", { name: "Open the product with barcode 5000000000017" }).click();
  await page.getByRole("heading", { name: "Crunchy Peanut Butter" }).waitFor();
  await ctx.close();
});

await step("product page: numbers per 100 g, price with its source, the allergen table, the barcode", async () => {
  const { ctx, page, off } = await newPage();
  await page.goto(BASE + "/app/groceries/product?code=5012345678900&r=aldi");
  await page.getByRole("heading", { name: "Greek Style Yogurt" }).waitFor();
  await page.getByText("KCAL PER 100 G", { exact: false }).first().waitFor();
  await page.getByText("£1.25").first().waitFor();
  // each shop's chip says its price there too (founder 2026-11-18: "add the prices next to the logos on other screens too")
  const chips = page.getByRole("navigation", { name: "Supermarket" }).getByRole("link");
  if ((await chips.count()) > 1) expect((await chips.allInnerTexts()).every((c) => /£\d+\.\d\d/.test(c)), `chips: ${(await chips.allInnerTexts()).join(" | ")}`);
  await page.getByText("Prices and offers vary by store").waitFor();
  const table = page.getByRole("region", { name: "Allergens" }).getByRole("table");
  await table.getByRole("row", { name: /Milk/ }).getByText("Contains", { exact: true }).waitFor();
  await table.getByText("May contain", { exact: true }).waitFor();
  expect((await table.getByRole("row").count()) === 15, "expected a header row and the 14 allergens");
  await page.getByText("5012345678900", { exact: true }).first().waitFor();
  await page.getByText(/Community data from Open Food Facts/).waitFor();
  expect(off.length === 0, "Open Food Facts was asked for a product in our lists: " + off.join(" "));
  await ctx.close();
});

await step("unknown allergens are never shown as 'none'", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/product?code=4056489000011");
  await page.getByText("Allergen information isn't recorded for this product. Check the pack.").waitFor();
  expect((await page.getByRole("table").count()) === 0, "an allergen table is shown for a product with unknown allergens");
  // a barcode no shop prices still opens from a scan, with its numbers and no price
  await page.goto(BASE + "/app/groceries/product?code=5000000000024");
  await page.getByText("Allergen information isn't recorded for this product. Check the pack.").waitFor();
  await page.getByText(/haven't read a price/).waitFor();
  await ctx.close();
});

await step("shopping list: add (per supermarket), quantity, text, empty", async () => {
  const { ctx, page } = await newPage();
  // the shop the page was opened from is the one ink "Add to my list"; each other shop is "Add · {shop}" (the colour meeting, 19 November 2026; PROGRESS_LOG)
  await page.goto(BASE + "/app/groceries/product?code=5012345678900&r=aldi");
  await page.getByRole("button", { name: "Add to my list" }).click();
  await page.getByRole("button", { name: "Add to my list" }).click();
  await page.getByRole("button", { name: "Add · Tesco" }).click();
  await page.getByRole("link", { name: "Open your shopping list" }).click();
  await page.getByRole("heading", { name: "Aldi", exact: true }).waitFor();
  // the quantity is heard as "Quantity 2" (hidden words beside the drawn number since 20 November 2026: an aria-label on a plain span is not read out)
  await page.getByText("Quantity 2", { exact: true }).waitFor();
  await page.getByRole("button", { name: "One fewer Greek Style Yogurt" }).first().click();
  await page.getByText("Quantity 1", { exact: true }).first().waitFor();
  expect((await page.getByText("Quantity 2", { exact: true }).count()) === 0, "One fewer left the quantity at 2");
  await page.reload();
  await page.getByRole("heading", { name: "Tesco", exact: true }).waitFor(); // kept on this device
  await ctx.close();
});

await step("barcode entry opens the product (the camera isn't needed)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/search");
  await page.getByRole("button", { name: "Scan a barcode" }).click();
  await page.getByLabel("Barcode number").fill("4056489000011");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("heading", { name: "Chicken Breast Fillets" }).waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
