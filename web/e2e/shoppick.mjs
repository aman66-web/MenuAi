// Groceries "Which shop?": a "Select" button at the bottom right of each shop's tile, "{n} shops selected" and a button at the foot of the screen that says what it opens (founder 2026-11-17; moved to the bottom and named 2026-11-18), and the page
// that shows the selected shops together (/app/groceries/shops?r=a,b). Files are stubbed (two shops with a few products each, one of them with a Nectar-style
// card price), so the test needs no real data.  Run: BASE=http://localhost:3101 node e2e/shoppick.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// [id, name, price, unitPrice, unit, memberAmount, memberScheme?, category index, photoId, gtin, nutrition?] as the existing groceries tests write them
const sains = ["sainsburys", "Sainsbury's", "https://www.sainsburys.co.uk/groceries/product/", "https://assets.sainsburys-groceries.co.uk/gol/", [
  ["s-yogurt", "Sainsbury's Greek Style Natural Yogurt 500g", 1.15, 2.3, "per kg", null, null, 0, "6325944", ""],
  ["s-chicken", "Sainsbury's Chicken Breast Fillets 640g", 4.5, 7.03, "per kg", null, null, 0, "", ""],
  ["s-bread", "Sainsbury's Multiseed Loaf 800g", 1.6, 2, "per kg", null, null, 1, "", ""],
]];
const tesco = ["tesco", "Tesco", "https://www.tesco.com/groceries/en-GB/products/", "https://digitalcontent.api.tesco.com/", [
  ["t-yogurt", "Tesco Greek Style Natural Yogurt 500g", 1.05, 2.1, "per kg", null, null, 0, "", ""],
  ["t-eggs", "Tesco Free Range Eggs 12 Pack", 2.3, 0.19, "each", null, null, 0, "", ""],
  ["t-chicken", "Tesco Chicken Breast Fillets 650g", 4.6, 7.08, "per kg", null, null, 0, "", ""],
]];
const asda = ["asda", "Asda", "https://groceries.asda.com/product/", "https://asdagroceries.scene7.com/is/image/", [
  ["a-milk", "Asda Semi Skimmed Milk 2L", 1.5, 0.75, "per litre", null, null, 0, "", ""],
]];
const mk = ([retailer, name, pageBase, photoBase, products]) => ({ v: 1, retailer, name, checkedOn: "2026-11-17", pageBase, photoBase, categories: ["Chilled food", "Bakery"], schemes: [], products });
const SHOPS = [sains, tesco, asda];
const allManifest = { v: 1, retailers: SHOPS.map(([id, name, , , p]) => ({ id, name, file: `${id}.json`, count: p.length, checkedOn: "2026-11-17", sha256: "" })) };

async function newPage({ width = 390, height = 844, failTesco = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); if (!localStorage.getItem("mm.v1.tour")) localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 })); }, settings);
  const page = await ctx.newPage();
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, generatedOn: "2026-11-17", source: "t", retailers: [], categories: [] }) }));
  await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(allManifest) }));
  for (const s of SHOPS) await page.route(`**/groceries/all/${s[0]}.json`, (r) => (failTesco && s[0] === "tesco" ? r.abort() : r.fulfill({ contentType: "application/json", body: JSON.stringify(mk(s)) })));
  await page.route(/assets\.sainsburys|digitalcontent|scene7|openfoodfacts/, (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const select = (page, shop) => page.getByRole("button", { name: new RegExp(`^Select(ed)? ${shop}$`) });

await step("every shop's tile has a 'Select' button at its bottom right; nothing is selected at first, so there is no bar or Go", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("heading", { name: "Which shop?" }).waitFor();
  for (const s of ["Sainsbury's", "Tesco", "Asda"]) await select(page, s).waitFor();
  expect((await page.getByRole("button", { name: /^Select(ed)? / }).count()) === 3, "one Select button per shop");
  expect((await page.getByText(/shops? selected/).count()) === 0 && (await page.getByRole("link", { name: /^See .*products/ }).count()) === 0, "no bar before a shop is selected");
  // bottom right of its own tile, and a full 44 px target that never sits on the shop's name or count
  const tile = await page.getByRole("link", { name: /^Tesco\b.*products/ }).boundingBox();
  const btn = await select(page, "Tesco").boundingBox();
  expect(btn.width >= 44 && btn.height >= 44, `Select is a 44 px target (${btn.width} x ${btn.height})`);
  expect(btn.x + btn.width <= tile.x + tile.width + 1 && btn.y + btn.height <= tile.y + tile.height + 1, "inside its tile");
  expect(btn.x > tile.x + tile.width / 2 && btn.y > tile.y + tile.height / 2, "in the tile's bottom right");
  const count = await page.getByText(/^\d[\d,]* products?$/).first().boundingBox();
  expect(!(count.y + count.height > btn.y && count.x + count.width > btn.x), "the count doesn't run under the button");
  // tapping a shop's name still opens that one shop, as before
  await page.getByRole("link", { name: /^Asda\b.*products?/ }).click();
  await page.getByRole("heading", { level: 1, name: "Asda" }).waitFor();
  await ctx.close();
});

await step("selecting counts them ('1 shop selected', '2 shops selected') with a button at the foot of the screen that says what it opens; Selected can be undone; the choice survives Back", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await select(page, "Sainsbury's").click();
  await page.getByText("1 shop selected").waitFor();
  await page.getByRole("button", { name: "Selected Sainsbury's" }).waitFor();
  // founder 2026-11-18: the button says what it opens
  expect((await page.getByRole("link", { name: "See Sainsbury's products" }).getAttribute("href")) === "/app/groceries/shop?r=sainsburys", "one shop: its own products");
  await select(page, "Tesco").click();
  await page.getByText("2 shops selected").waitFor();
  await select(page, "Tesco").click();
  await page.getByText("1 shop selected").waitFor();
  await select(page, "Tesco").click();
  await page.getByText("2 shops selected").waitFor();
  const go = page.getByRole("link", { name: "See products from Sainsbury's and Tesco" });
  expect((await go.getAttribute("href")) === "/app/groceries/shops?r=sainsburys,tesco", "Go links to the two shops in the order ticked: " + (await go.getAttribute("href")));
  const gb = await go.boundingBox();
  expect(gb.height >= 44, "Go is a 44 px target");
  // founder 2026-11-18: at the foot of the screen, just above the tab bar, before and after the list is scrolled
  expect(gb.y > 844 / 2 && gb.y + gb.height <= 844, `the button sits in the lower half of the screen (${Math.round(gb.y)})`);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);
  const after = await go.boundingBox();
  expect(after.y > 844 / 2 && after.y + after.height <= 844, "still at the foot of the screen when scrolled");
  await go.click();
  await page.getByRole("heading", { level: 1, name: "Your selected shops" }).waitFor();
  await page.goBack();
  await page.getByText("2 shops selected").waitFor();
  expect((await select(page, "Tesco").textContent())?.includes("Selected"), "Tesco still shows Selected");
  await ctx.close();
});

await step("Go with two shops lists both shops' products, each row naming its shop, with search, a shop chip and sort", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await select(page, "Sainsbury's").click();
  await select(page, "Tesco").click();
  await page.getByRole("link", { name: "See products from Sainsbury's and Tesco" }).click();
  await page.getByRole("heading", { level: 1, name: "Your selected shops" }).waitFor();
  await page.getByText("6 products", { exact: true }).waitFor();
  expect((await page.getByText("Products from Sainsbury's and Tesco").count()) === 1, "names the shops");
  const rows = page.locator("ul.space-y-3 > li");
  expect((await rows.filter({ hasText: "Sainsbury's Greek Style" }).count()) === 1 && (await rows.filter({ hasText: "Tesco Greek Style" }).count()) === 1, "a product sold at both shops is two rows");
  // each row says whose it is: the shop's logo at the row's right (founder 2026-11-19), its name for a screen reader
  for (const li of await rows.all()) {
    const said = (await li.locator(".sr-only").first().textContent()) ?? "";
    const logo = await li.locator("a > span[aria-hidden]:last-of-type img, a > span[aria-hidden]:last-of-type [aria-hidden]").count();
    expect(/^(Tesco|Sainsbury's), $/.test(said) && logo >= 1, "each row names its shop: " + said + " / logo " + logo);
  }
  // search across both
  await page.getByRole("searchbox", { name: "Search these shops' products" }).fill("chicken");
  await page.getByText("2 products", { exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Search these shops' products" }).fill("");
  // a shop chip shows only that shop; All selected shops brings the rest back
  await page.getByRole("button", { name: "Tesco", exact: true }).click();
  await page.getByText("3 products", { exact: true }).waitFor();
  expect((await page.getByText("Sainsbury's Multiseed").count()) === 0, "only Tesco's rows");
  await page.getByRole("button", { name: "All selected shops" }).click();
  await page.getByText("6 products", { exact: true }).waitFor();
  // sort by price, lowest first: Tesco yogurt (1.05) leads
  await page.getByLabel("Sort").selectOption("price");
  expect(/Tesco Greek Style/.test(await rows.first().innerText()), "lowest price first");
  // a row opens that shop's product page
  await rows.filter({ hasText: "Tesco Free Range Eggs" }).getByRole("link").click();
  await page.waitForURL(/\/app\/groceries\/shop\/item\?r=tesco&id=t-eggs/);
  await ctx.close();
});

await step("one selected shop's button opens that shop's own list; a bad or empty address says to choose a shop; a failed shop is named and the other still shows", async () => {
  const one = await newPage();
  await one.page.goto(BASE + "/app/groceries");
  await select(one.page, "Asda").click();
  await one.page.getByRole("link", { name: "See Asda's products" }).click();
  await one.page.waitForURL(/\/app\/groceries\/shop\?r=asda$/);
  await one.page.getByRole("heading", { level: 1, name: "Asda" }).waitFor();
  await one.page.goto(BASE + "/app/groceries/shops?r=../../x,<b>");
  await one.page.getByText("Choose a supermarket first.").waitFor();
  await one.ctx.close();
  const bad = await newPage({ failTesco: true });
  await bad.page.goto(BASE + "/app/groceries/shops?r=sainsburys,tesco");
  await bad.page.getByText("Couldn't load Tesco. Check your connection.").waitFor();
  await bad.page.getByText("3 products", { exact: true }).waitFor();
  await bad.ctx.close();
});

await step("360 px, Extra large text, a long shop name: no sideways scroll on Groceries with a selection or on the shops page; axe", async () => {
  for (const [width, big] of [[360, false], [390, true]]) {
    const { ctx, page } = await newPage({ width, height: 800 });
    if (big) await page.addInitScript(() => { try { localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, textSize: "xlarge", preferences: { vegetarianOnly: false, noPork: false, noBeef: false } } })); } catch {} });
    await page.goto(BASE + "/app/groceries");
    await select(page, "Sainsbury's").click();
    await select(page, "Tesco").click();
    await select(page, "Asda").click();
    await page.getByText("3 shops selected").waitFor();
    expect((await overflow(page)) <= 1, `no sideways scroll on Groceries (${width}${big ? ", Extra large" : ""})`);
    if (!big) {
      await page.addScriptTag({ path: AXE });
      await page.waitForTimeout(800);
      const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
      expect(res.violations.length === 0, "axe on Groceries: " + res.violations.map((v) => v.id + " " + v.nodes[0]?.html.slice(0, 120)).join("; "));
    }
    await page.getByRole("link", { name: "See products from 3 shops" }).click();
    await page.getByRole("heading", { level: 1, name: "Your selected shops" }).waitFor();
    await page.getByText("7 products", { exact: true }).waitFor();
    expect((await overflow(page)) <= 1, `no sideways scroll on the shops page (${width}${big ? ", Extra large" : ""})`);
    if (!big) {
      await page.addScriptTag({ path: AXE });
      await page.waitForTimeout(800);
      const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
      expect(res.violations.length === 0, "axe on the shops page: " + res.violations.map((v) => v.id + " " + v.nodes[0]?.html.slice(0, 120)).join("; "));
    }
    await ctx.close();
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
