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

await step("Groceries asks \"Which shop?\" and offers only the shops that have a list", async () => {
  const a = await newPage();
  await a.page.goto(BASE + "/app/groceries");
  await a.page.getByRole("heading", { name: "Which shop?" }).waitFor();
  await a.page.getByRole("link", { name: /^Sainsbury's\b.*products/ }).waitFor();
  await a.page.getByText(/Not here yet: Tesco, Asda/).waitFor();
  await a.page.getByRole("link", { name: "Search every shop at once" }).waitFor();
  await a.page.getByRole("button", { name: "Scan a barcode" }).waitFor();
  await a.ctx.close();
  const b = await newPage({ allow: false });
  await b.page.goto(BASE + "/app/groceries");
  await b.page.getByText(/Not here yet: Tesco, Sainsbury's/).waitFor();
  expect((await b.page.getByRole("link", { name: /products$/ }).count()) === 0, "no shop without a list");
  await b.ctx.close();
});

await step("full list: count, search by words, type filter, card price, sort, show more", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("link", { name: /^Sainsbury's\b.*products/ }).click();
  await page.getByRole("heading", { level: 1, name: "Sainsbury's" }).waitFor();
  await page.getByText("73 products", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("greek yog");
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has a card price" }).click();
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Multiseed Loaf/ }).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has a card price" }).click();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has nutrition" }).click();
  // the loaf's numbers come from its own page; the yogurt's from the catalogue's record for the same barcode
  await page.getByText("2 products", { exact: true }).waitFor();
  await page.getByText(/250 kcal · 9.5g protein · 41g carbs · 4.2g fat per 100 g/).waitFor();
  await page.getByText(/97 kcal · 9g protein · 4.2g carbs · 5g fat per 100 g/).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "Has nutrition" }).click();
  await page.getByRole("combobox", { name: "Sort" }).selectOption("density");
  const top = await page.locator("a[href*='/groceries/shop/item']").first().innerText();
  expect(/Greek Style Natural Yogurt/.test(top), `most protein per 100 kcal first (the yogurt: 9 g in 97 kcal), got ${top.slice(0, 50)}`);
  await page.getByRole("combobox", { name: "Sort" }).selectOption("price");
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

await step("another shop's list (founder 2026-10-11): its own photo template, its sitemap page link, and both lists on the Groceries screen", async () => {
  const aldi = { v: 1, retailer: "aldi", name: "Aldi", checkedOn: "2026-10-08", pageBase: "https://www.aldi.co.uk/product/", photoBase: "https://dm.emea.cms.aldi.cx/",
    photoTemplate: "https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/{photo}/image", categories: ["Fresh Food"], schemes: [],
    products: [["340660002", "NATURE'S PICK Apple + Grape Snack Pack", 0.39, null, "", null, null, 0, "b55a9555-b044-484b-b1a0-9b4490319df5", "", null, "nature-s-pick-apple-grape-snack-pack-000000000340660002"]] };
  const two = { v: 1, retailers: [allManifest.retailers[0], { id: "aldi", name: "Aldi", file: "aldi.json", count: 1, checkedOn: "2026-10-08", sha256: "" }] };
  const { ctx, page } = await newPage();
  const askedAldi = [];
  await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(two) }));
  await page.route("**/groceries/all/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(aldi) }));
  await page.route("**/dm.emea.cms.aldi.cx/**", (r) => { askedAldi.push(r.request().url()); return r.fulfill({ contentType: "image/png", body: PNG }); });
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("link", { name: /^Sainsbury's\b.*products/ }).waitFor();
  await page.getByRole("link", { name: /^Aldi\b.*product/ }).click();
  await page.getByRole("heading", { level: 1, name: "Aldi" }).waitFor();
  await page.getByText("1 product", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Apple \+ Grape Snack Pack/ }).click();
  await page.getByRole("heading", { level: 1, name: /Apple \+ Grape Snack Pack/ }).waitFor();
  await page.getByText("Photo from the Aldi website").waitFor();
  expect(askedAldi.some((u) => u.endsWith("/scaleWidth/400/b55a9555-b044-484b-b1a0-9b4490319df5/image")), `picture from Aldi's own host, got ${askedAldi}`);
  const link = page.getByRole("link", { name: /Open it on Aldi's website/ });
  expect((await link.getAttribute("href")) === "https://www.aldi.co.uk/product/nature-s-pick-apple-grape-snack-pack-000000000340660002", "the product's own page from the sitemap");
  await ctx.close();
});

await step("Lidl's everyday range (founder 2026-10-11): a product Lidl prints no price for says \"Price in store\", never a made-up price", async () => {
  const img = "mn0YeAqoX/sm:0/w:1500/h:1125/cz/M6Ly9w.jpg";
  const lidl = { v: 1, retailer: "lidl", name: "Lidl", checkedOn: "2026-10-11", pageBase: "https://www.lidl.co.uk/p/", photoBase: "https://imgproxy-retcat.assets.schwarz/",
    photoTemplate: "https://imgproxy-retcat.assets.schwarz/{photo}", categories: ["Frozen", "Food Cupboard"], schemes: ["Lidl Plus"],
    products: [
      ["p10003405", "Spinach", null, null, "", null, null, 0, img, "", null, "spinach/p10003405"],
      ["p10052648", "KULJANKA Vegetable Salad", 1.49, 3.47, "per kg", 1.29, 0, 1, img, "", null, "kuljanka-vegetable-salad/p10052648"],
      ["p10054828", "BELBAKE Mincemeat", 2.99, null, "", null, null, 1, img, "", null, "belbake-mincemeat/p10054828"],
    ] };
  const two = { v: 1, retailers: [allManifest.retailers[0], { id: "lidl", name: "Lidl", file: "lidl.json", count: 3, priced: 2, checkedOn: "2026-10-11", sha256: "" }] };
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(two) }));
    await page.route("**/groceries/all/lidl.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(lidl) }));
    await page.route("**/imgproxy-retcat.assets.schwarz/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
    await page.goto(BASE + "/app/groceries/shop?r=lidl");
    await page.getByRole("heading", { level: 1, name: "Lidl" }).waitFor();
    await page.getByText(/3 products from Lidl's website, checked .*2 show a price\. Lidl shows the others' prices only in store\./).waitFor();
    expect(await page.getByRole("link", { name: /Spinach.*Price in store/ }).isVisible(), "the row says Price in store");
    expect(await page.getByRole("link", { name: /Vegetable Salad.*£1\.49/ }).isVisible(), "an offer keeps its printed price");
    await page.getByLabel("Sort").selectOption({ label: "Price, lowest first" });
    const names = await page.locator("a[href*='/app/groceries/shop/item']").allInnerTexts();
    expect(/Spinach/.test(names[names.length - 1] ?? ""), `no price sorts last, got ${names.map((n) => n.split("\n")[0])}`);
    await page.getByRole("link", { name: /Spinach/ }).click();
    await page.getByRole("heading", { level: 1, name: "Spinach" }).waitFor();
    await page.getByText("Lidl shows prices on its website only for its weekly offers. Check this product's price in store.").waitFor();
    expect((await page.getByText(/£/).count()) === 0, "no price shown anywhere on the page");
    expect((await page.getByRole("link", { name: /Open it on Lidl's website/ }).getAttribute("href")) === "https://www.lidl.co.uk/p/spinach/p10003405", "Lidl's own page");
    await page.addScriptTag({ path: AXE });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
    expect(result.violations.length === 0, `${scheme}: ${result.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", ")}`);
    await ctx.close();
  }
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
