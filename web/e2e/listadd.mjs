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
  for (const [label, o] of [["360 px", { extra: { viewport: { width: 360, height: 780 } } }], ["Extra large", { st: { textSize: "xlarge" } }]]) {
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

// Undo on the Shopping list (code audit 2026-10-29): "Clear" and "−" at quantity 1 used to remove things at once, with no way back.
const TESCO_PHOTO = { src: "https://digitalcontent.api.tesco.com/v2/media/ghs/1ae5ef44-e50e-42f5-8844-13346be3a111/b38866f9-6933-43ad-a388-15a1baf5b669.jpeg?h=225&w=225", from: "retailer", shop: "tesco" };
/** The same list whatever order each item's keys were written in (the page writes what it read back, the test seeded its own). */
const canon = (list) => JSON.stringify(list.map((i) => Object.fromEntries(Object.entries(i).sort(([a], [b]) => a.localeCompare(b)))));
const undoButton = (page) => page.getByRole("button", { name: "Undo", exact: true });

await step("Clear empties the list with an Undo pill at the top; Undo puts it back exactly (the same items in the same order, ticks, quantities, prices, pictures)", async () => {
  const before = [asdaItem, { ...tescoItem, qty: 3, done: true, photo: TESCO_PHOTO }, typedItem];
  const { ctx, page, errors } = await open(before);
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Asda").waitFor({ timeout: 90000 });
  // tick and untick Milk, so the store writes the list as the page holds it (read back through its checks) to compare with after Undo
  await page.getByRole("checkbox", { name: /^Milk:/ }).tap();
  await page.getByRole("checkbox", { name: /^Milk:/ }).tap();
  const held = await stored(page);
  expect(held.length === 3 && held[1].qty === 3 && held[1].done === true && held[1].photo?.src === TESCO_PHOTO.src, "the seeded list didn't read back: " + JSON.stringify(held));
  await page.getByRole("button", { name: "Clear", exact: true }).tap();
  await page.getByRole("link", { name: "Browse groceries" }).waitFor();
  expect((await stored(page)).length === 0, "the list was not cleared");
  const undo = undoButton(page);
  await undo.waitFor();
  await page.getByRole("status").filter({ hasText: "Shopping list cleared." }).waitFor(); // read out through the status line that is always there
  const box = await undo.boundingBox();
  expect(box.y < 200, "the pill sits at the top, clear of the rows: y " + box.y);
  expect(box.height >= 44 && box.width >= 44, "Undo is a proper tap target: " + JSON.stringify(box));
  await undo.tap();
  await more(page, "Asda").waitFor();
  const back = await stored(page);
  expect(canon(back) === canon(held), "not restored exactly: " + JSON.stringify(back));
  expect(await page.getByRole("checkbox", { name: /Abra Ca Debora Sweet Pancakes.*in the basket/ }).isVisible(), "the tick came back");
  expect((await undo.count()) === 0, "the pill stays after Undo");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("\"−\" at quantity 1 takes the item off with \"Removed “…”.\" and an Undo that puts it back in its place; above 1 it only counts down; after 8 seconds the pill goes and the item stays off", async () => {
  const second = { ...asdaItem, gtin: "5000128002056", name: "Second Asda Thing", qty: 2 };
  const { ctx, page } = await open([asdaItem, second, tescoItem]);
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Asda").waitFor({ timeout: 90000 });
  // the quantity is words a screen reader reads (an aria-label on a plain span is ignored), with the figure drawn beside it
  await page.getByText("Quantity 2", { exact: true }).waitFor();
  expect((await page.locator("span[aria-label^='Quantity']").count()) === 0, "a quantity still hangs on an aria-label");
  await page.getByRole("button", { name: "One fewer Second Asda Thing" }).tap();
  expect((await stored(page)).find((i) => i.name === "Second Asda Thing")?.qty === 1, "2 → 1");
  expect((await undoButton(page).count()) === 0, "counting down from 2 offered Undo");
  await page.getByRole("button", { name: /^One fewer Aaila/ }).tap();
  await undoButton(page).waitFor();
  await page.getByRole("status").filter({ hasText: `Removed “${asdaItem.name}”.` }).waitFor();
  expect(!(await stored(page)).some((i) => i.name === asdaItem.name), "still on the list");
  await undoButton(page).tap();
  await page.getByRole("checkbox", { name: new RegExp(`^${asdaItem.name.slice(0, 20)}`) }).waitFor();
  const back = await stored(page);
  expect(back.map((i) => i.name).join("|") === [asdaItem.name, "Second Asda Thing", tescoItem.name].join("|") && back[0].qty === 1, "not back in its place: " + back.map((i) => `${i.name} ${i.qty}`).join(", "));
  // no Undo: the pill goes by itself and the item stays off
  await page.getByRole("button", { name: /^One fewer Abra Ca Debora/ }).tap();
  await undoButton(page).waitFor();
  await page.waitForTimeout(9000);
  expect((await undoButton(page).count()) === 0, "the pill stayed after 8 seconds");
  expect(!(await stored(page)).some((i) => i.retailer === "tesco"), "the Tesco item came back by itself");
  await ctx.close();
});

await step("when the list of shops can't be downloaded: \"Add more from Tesco\" still opens Tesco's own list (Co-op, which has none, goes to Which shop?), and the recipe tile never says it is still looking", async () => {
  const { ctx, page } = await open([tescoItem, coopItem]);
  await page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ status: 503, body: "" }));
  await page.goto(BASE + "/app/groceries/list");
  await more(page, "Tesco").waitFor({ timeout: 90000 });
  await page.getByText("See recipes that use what's on your list.").waitFor({ timeout: 15000 });
  expect((await page.getByText("Looking through the recipes…").count()) === 0, "the tile still says it is looking");
  expect((await more(page, "Tesco").getAttribute("href")) === "/app/groceries/shop?r=tesco", "Tesco's row goes to " + (await more(page, "Tesco").getAttribute("href")));
  expect((await more(page, "Co-op").getAttribute("href")) === "/app/groceries", "Co-op's row goes to " + (await more(page, "Co-op").getAttribute("href")));
  await ctx.close();
  // a list of shops where none has labels we've read (so none can make a recipe): the tile offers the recipes instead of looking for ever
  const b = await open([tescoItem]);
  await b.page.route("**/groceries/all/all-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, retailers: [{ id: "tesco", name: "Tesco", file: "tesco.json", count: 1, checkedOn: "2026-10-09", sha256: "" }] }) }));
  await b.page.goto(BASE + "/app/groceries/list");
  await b.page.getByText("See recipes that use what's on your list.").waitFor({ timeout: 90000 });
  await b.page.waitForTimeout(1500);
  expect((await b.page.getByText("Looking through the recipes…").count()) === 0, "no recipe shop: the tile still says it is looking");
  await b.ctx.close();
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
