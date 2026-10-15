// Shopping list: a way to add more (founder 2026-10-15, on a list holding one Asda product: "After they've added from a shop there is no way to add a product from
// the same shop or choose a different shop"). The last row of each shop's card is "Add more from {shop}" (that shop's own list of products); below the shops is
// "Add from another shop" (the page that asks "Which shop?"). Touch is on, like an iPhone. The supermarkets' image servers can't be reached from here, so a
// stand-in picture is served for them.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const iso = "2026-10-15T10:00:00.000Z";
const asdaItem = { gtin: "5030039010492", retailer: "asda", name: "Aaila Chicken Tikka Keema 500g Halal (HMC)", brand: "", size: "", qty: 1, addedAt: iso, price: 5.99, checkedOn: "2026-10-08" };
const tescoItem = { gtin: "", shopId: "272407558", retailer: "tesco", name: "Abra Ca Debora Sweet Pancakes 6 Pack, 375 G", brand: "", size: "", qty: 1, addedAt: iso, price: 2.4, checkedOn: "2026-10-09" };
const typedItem = { gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: iso, custom: true };
const coopItem = { gtin: "5000128002056", retailer: "coop", name: "Co-op Semi Skimmed Milk 2 Pints", brand: "", size: "", qty: 1, addedAt: iso };

async function open(list, { extra = {}, st = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript(([s, l]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    if (l) localStorage.setItem("mm.v1.shopping", JSON.stringify({ v: 1, data: l }));
  }, [JSON.stringify({ v: 1, data: { ...settings, ...st } }), list]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.route(/digitalcontent\.api\.tesco\.com|assets\.sainsburys-groceries\.co\.uk|asdagroceries\.scene7\.com|images\.openfoodfacts\.org/, (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  return { ctx, page, errors };
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []);
const more = (page, shop) => page.getByRole("link", { name: `Add more from ${shop}`, exact: true });
const another = (page) => page.getByRole("link", { name: "Add from another shop", exact: true });

await step("a list with one Asda product: its card ends with \"Add more from Asda\", which opens Asda's own list; adding there puts a second product on the list", async () => {
  const { ctx, page, errors } = await open([asdaItem]);
  await page.goto(BASE + "/app/groceries/list");
  const link = more(page, "Asda");
  await link.waitFor({ timeout: 90000 });
  expect((await link.getAttribute("href")) === "/app/groceries/shop?r=asda", "goes to " + (await link.getAttribute("href")));
  // it is the last row of the Asda card, after the item, not a row of its own elsewhere
  const card = page.locator("ul", { has: link });
  const rows = await card.locator("> li").count();
  expect(rows === 2, "rows in the card: " + rows);
  const itemBox = await card.getByRole("checkbox").boundingBox(), linkBox = await link.boundingBox();
  expect(linkBox.y > itemBox.y + itemBox.height - 1, "the link sits below the item");
  expect(linkBox.height >= 44, "a proper tap target: " + linkBox.height);
  await link.tap();
  await page.getByRole("heading", { level: 1, name: "Asda" }).waitFor({ timeout: 60000 });
  await page.locator("a[href*='/app/groceries/shop/item']").nth(2).tap(); // not the first: that one is the product already on the list
  await page.getByRole("button", { name: "Add to my list" }).tap();
  await page.getByRole("link", { name: "See list" }).tap();
  await more(page, "Asda").waitFor();
  const items = await stored(page);
  expect(items.length === 2 && items.every((i) => i.retailer === "asda"), "two Asda products: " + JSON.stringify(items.map((i) => i.name)));
  expect((await page.getByRole("link", { name: /^Add more from Asda$/ }).count()) === 1, "one row per shop, not per product");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("two shops: each card has its own \"Add more\" row; \"Add from another shop\" asks Which shop?", async () => {
  const { ctx, page } = await open([asdaItem, tescoItem]);
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Asda").waitFor({ timeout: 90000 });
  expect((await more(page, "Tesco").getAttribute("href")) === "/app/groceries/shop?r=tesco", "Tesco's row goes to Tesco's list");
  expect((await page.getByRole("checkbox").count()) === 2, "the new rows are not items (two ticks)");
  const button = another(page);
  expect(await button.isVisible(), "no 'Add from another shop'");
  expect((await button.getAttribute("href")) === "/app/groceries", "goes to " + (await button.getAttribute("href")));
  expect((await button.boundingBox()).height >= 44, "tap target");
  await button.tap();
  await page.getByRole("heading", { name: "Which shop?" }).waitFor({ timeout: 60000 });
  await ctx.close();
});

await step("only typed-in items: no shop row (they are for any shop), and the button asks for a shop", async () => {
  const { ctx, page } = await open([typedItem]);
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("link", { name: "Add products from a shop", exact: true }).waitFor({ timeout: 90000 });
  expect((await page.getByRole("link", { name: /^Add more from/ }).count()) === 0, "a shop row under 'Any shop'");
  expect((await another(page).count()) === 0, "the other label is shown too");
  await page.getByRole("link", { name: "Add products from a shop", exact: true }).tap();
  await page.getByRole("heading", { name: "Which shop?" }).waitFor({ timeout: 60000 });
  await ctx.close();
});

await step("a shop with no list of products of its own (Co-op) sends its row to Which shop? instead of an empty page", async () => {
  const { ctx, page } = await open([coopItem, asdaItem]);
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Asda").waitFor({ timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('a[href="/app/groceries"]') !== null, null, { timeout: 15000 });
  const coop = more(page, "Co-op");
  expect((await coop.getAttribute("href")) === "/app/groceries", "Co-op's row goes to " + (await coop.getAttribute("href")));
  expect((await more(page, "Asda").getAttribute("href")) === "/app/groceries/shop?r=asda", "Asda's still goes to its list");
  await ctx.close();
});

await step("an empty list is unchanged (Browse groceries, See recipes), and ticking, quantity and Remove ticked still work", async () => {
  const empty = await open(null);
  await empty.page.goto(BASE + "/app/groceries/list");
  await empty.page.getByRole("link", { name: "Browse groceries" }).waitFor({ timeout: 90000 });
  expect((await empty.page.getByRole("link", { name: /Add more from|Add from another shop|Add products from a shop/ }).count()) === 0, "add links on an empty list");
  await empty.ctx.close();
  const { ctx, page } = await open([asdaItem, tescoItem]);
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Asda").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: /One more Aaila/ }).tap();
  expect((await stored(page)).find((i) => i.retailer === "asda").qty === 2, "quantity");
  await page.getByRole("checkbox", { name: /Aaila/ }).tap();
  await page.getByRole("button", { name: /Remove ticked \(1\)/ }).tap();
  expect((await stored(page)).length === 1, "ticked item removed");
  await more(page, "Asda").waitFor({ state: "detached" }); // its card is gone with its last item, and so is its row
  await more(page, "Tesco").waitFor();
  await ctx.close();
});

await step("nothing runs sideways at 360 px, at Extra large text or right to left, and the rows read in order (item, add more, total, another shop)", async () => {
  for (const [label, o] of [["360 px", { extra: { viewport: { width: 360, height: 780 } } }], ["Extra large", { st: { textSize: "xlarge" } }], ["Arabic", { extra: { locale: "ar" }, st: { language: "ar" } }]]) {
    const { ctx, page } = await open([asdaItem, tescoItem, typedItem], o);
    await page.goto(BASE + "/app/groceries/list");
    const links = page.locator('a[href^="/app/groceries/shop?r="]');
    await links.first().waitFor({ timeout: 90000 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over <= 0, `${label}: sideways scroll ${over}`);
    expect((await links.count()) === 2, `${label}: ${await links.count()} shop rows`);
    const a = await links.first().boundingBox();
    expect(a.height >= 44, `${label}: row height ${a.height}`);
    const total = await page.locator("section", { has: links.first() }).locator("> p").first().boundingBox(); // the line with the total (its words are translated)
    expect(total.y > a.y, `${label}: the total follows the card`);
    const rtl = label === "Arabic";
    if (rtl) expect((await page.evaluate(() => getComputedStyle(document.querySelector('a[href^="/app/groceries/shop?r="]')).direction)) === "rtl", "direction");
    await ctx.close();
  }
});

await step("axe: no violations with the new rows and button", async () => {
  const { ctx, page } = await open([asdaItem, tescoItem, typedItem, { ...asdaItem, gtin: "", shopId: "x", name: "Ticked thing", done: true }]);
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Asda").waitFor({ timeout: 90000 });
  await page.waitForTimeout(900);
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
  expect(res.violations.length === 0, res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 100)).join(" | "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
