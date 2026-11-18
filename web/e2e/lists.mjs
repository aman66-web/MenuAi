// More than one shopping list, and Swap in the list (founder 2026-11-18: "There should also be an option to create multiple shopping lists ... they'd go to
// shopping list and then there'd be a way to press plus and what do you want to create a shopping list for? And they could press like M&S"; "if they're in
// the shopping list, they can always swap out ingredients when they're at the supermarket and they can't find something"). Touch is on, like an iPhone. The
// supermarkets' image servers can't be reached from here, so a stand-in picture is served for them.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3007";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// Pip's tips on the real screens are stopped in this test, as if the person had pressed "Stop the tips": e2e/coach.mjs covers them.
{
  const openContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await openContext(options);
    await c.addInitScript(() => { try { if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } })); } catch { /* storage blocked */ } });
    return c;
  };
}

const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const iso = "2026-11-18T10:00:00.000Z";
const MNS = { id: "abcd1234", shop: "marks-and-spencer", name: "M&S" };
const MNS2 = { id: "efgh5678", shop: "marks-and-spencer", name: "M&S 2" };
const yogurt = { gtin: "", shopId: "fdp60023388", retailer: "marks-and-spencer", name: "Low Fat Greek Style Live Yogurt 500 g", brand: "", size: "", qty: 2, addedAt: iso, price: 1.15, checkedOn: "2026-11-10" };
const asdaItem = { gtin: "5030039010492", retailer: "asda", name: "Aaila Chicken Tikka Keema 500g Halal (HMC)", brand: "", size: "", qty: 1, addedAt: iso, price: 5.99, checkedOn: "2026-10-08" };
const typedItem = { gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: iso, custom: true };

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
  await page.route(/digitalcontent\.api\.tesco\.com|assets\.sainsburys-groceries\.co\.uk|asdagroceries\.scene7\.com|images\.openfoodfacts\.org|marksandspencer\.app/, (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  return { ctx, page, errors };
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []);
const storedLists = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") ?? "null")?.data?.shoppingLists ?? []);
const chips = (page) => page.getByRole("navigation", { name: "Your shopping lists" });
const newList = (page) => page.getByRole("button", { name: "New list", exact: true });
const sheet = (page, name) => page.getByRole("dialog", { name });
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

await step("with no lists of their own, the list is as before, with \"New list\" near the top (no chips)", async () => {
  const { ctx, page, errors } = await open([asdaItem, typedItem]);
  await page.goto(BASE + "/app/groceries/list");
  await newList(page).waitFor({ timeout: 90000 });
  expect((await chips(page).getByRole("link").count()) === 0, "chips shown with no lists");
  const box = await newList(page).boundingBox();
  const form = await page.getByRole("textbox", { name: "Add something to your list" }).boundingBox();
  expect(box.height >= 44, "New list height " + box.height);
  expect(box.y < form.y, "New list is above the typing field");
  expect((await page.getByRole("checkbox").count()) === 2, "both items still on the main list");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("New list asks what it's for with the shops as tiles; choosing M&S makes \"M&S\" and opens it; a second is \"M&S 2\"", async () => {
  const { ctx, page, errors } = await open([asdaItem]);
  await page.goto(BASE + "/app/groceries/list");
  await newList(page).tap();
  const s = sheet(page, "What do you want to make a shopping list for?");
  await s.waitFor({ timeout: 15000 });
  const tile = s.getByRole("button", { name: "M&S", exact: true });
  await tile.waitFor({ timeout: 30000 });
  expect((await s.getByRole("button", { name: /^(Sainsbury's|Tesco|Asda|Aldi|Lidl|Morrisons|Waitrose|Iceland|M&S)$/ }).count()) >= 5, "the shops are offered");
  expect((await tile.boundingBox()).height >= 44, "tile height");
  await tile.tap();
  await page.waitForURL(/\?l=[a-z0-9]{8}$/, { timeout: 15000 });
  await page.getByText("Nothing on M&S yet.").waitFor({ timeout: 15000 });
  expect(await page.getByRole("link", { name: "Add products from M&S" }).getAttribute("href") === "/app/groceries/shop?r=marks-and-spencer", "add link");
  const nav = chips(page);
  expect((await nav.getByRole("link", { name: "M&S", exact: true }).getAttribute("aria-current")) === "page", "M&S chip is the one shown");
  expect((await nav.getByRole("link", { name: "Shopping list", exact: true }).count()) === 1, "a chip for the main list");
  expect((await page.getByRole("checkbox").count()) === 0, "the Asda item is not on the M&S list");
  await newList(page).tap();
  await sheet(page, "What do you want to make a shopping list for?").getByRole("button", { name: "M&S", exact: true }).tap();
  await nav.getByRole("link", { name: "M&S 2", exact: true }).waitFor({ timeout: 15000 });
  const lists = await storedLists(page);
  expect(lists.length === 2 && lists.every((l) => l.shop === "marks-and-spencer") && lists.map((l) => l.name).join() === "M&S,M&S 2", JSON.stringify(lists));
  // the main list is one tap away and still has its item
  await nav.getByRole("link", { name: "Shopping list", exact: true }).tap();
  await page.getByRole("checkbox", { name: /Aaila/ }).waitFor({ timeout: 15000 });
  expect(!page.url().includes("?l="), "the main list has no ?l=: " + page.url());
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("adding a product from a shop with lists asks \"Add to which list?\"; one with none goes straight on the main list", async () => {
  const { ctx, page, errors } = await open([], { st: { shoppingLists: [MNS, MNS2] } });
  await page.goto(BASE + "/app/groceries/shop/item?r=marks-and-spencer&id=fdp60023388");
  await page.getByRole("button", { name: "Add to my list" }).tap({ timeout: 90000 });
  const s = sheet(page, "Add to which list?");
  await s.waitFor({ timeout: 15000 });
  const names = await s.getByRole("button").allInnerTexts();
  expect(names.map((x) => x.trim()).filter(Boolean).join("|") === "M&S|M&S 2|Shopping list", "choices: " + names.join("|"));
  await s.getByRole("button", { name: "M&S 2", exact: true }).tap();
  await page.getByRole("status").filter({ hasText: "Added to M&S 2." }).waitFor({ timeout: 5000 });
  let items = await stored(page);
  expect(items.length === 1 && items[0].list === MNS2.id && items[0].shopId === "fdp60023388", JSON.stringify(items));
  await page.getByRole("link", { name: "See list" }).tap();
  await page.waitForURL(/\?l=efgh5678/, { timeout: 15000 });
  await page.getByRole("checkbox", { name: /Low Fat Greek Style/ }).waitFor({ timeout: 15000 });
  // Asda: no list of the person's own, so no question
  await page.goto(BASE + "/app/groceries/product?code=5030039010492&r=asda");
  await page.getByRole("button", { name: /Add · Asda/ }).first().tap({ timeout: 90000 });
  await page.getByText("Added to your list for Asda.").waitFor({ timeout: 5000 });
  expect((await sheet(page, "Add to which list?").isVisible()) === false, "asked for Asda");
  items = await stored(page);
  expect(items.length === 2 && items[1].retailer === "asda" && !("list" in items[1]), JSON.stringify(items.map((i) => [i.retailer, i.list])));
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a list for one shop shows only its items and its total; Clear list there leaves the main list alone", async () => {
  const { ctx, page } = await open([asdaItem, { ...yogurt, list: MNS.id }, { ...typedItem, list: MNS.id }], { st: { shoppingLists: [MNS] } });
  await page.goto(BASE + `/app/groceries/list?l=${MNS.id}`);
  await page.getByRole("checkbox", { name: /Low Fat Greek Style/ }).waitFor({ timeout: 90000 });
  expect((await page.getByRole("checkbox").count()) === 2, "the yogurt and the typed milk");
  expect((await page.getByRole("checkbox", { name: /Aaila/ }).count()) === 0, "the Asda item is on the main list only");
  await page.getByRole("heading", { level: 2, name: "M&S" }).waitFor();
  expect((await page.getByRole("link", { name: "Add more from M&S", exact: true }).count()) === 1, "Add more from M&S");
  expect((await page.getByRole("link", { name: "Add from another shop" }).count()) === 0, "no other shop on a one-shop list");
  await page.getByText("£2.30").first().waitFor(); // 2 x £1.15
  await page.getByRole("button", { name: "Clear list", exact: true }).tap();
  await page.getByText("Nothing on M&S yet.").waitFor({ timeout: 5000 });
  const items = await stored(page);
  expect(items.length === 1 && items[0].retailer === "asda", JSON.stringify(items.map((i) => i.name)));
  await ctx.close();
});

await step("Swap: similar products at the same shop with photo, name and price; choosing one takes the item's place (same quantity, unticked, same list)", async () => {
  const { ctx, page, errors } = await open([{ ...yogurt, list: MNS.id, done: true }, { ...typedItem, list: MNS.id }], { st: { shoppingLists: [MNS] } });
  await page.goto(BASE + `/app/groceries/list?l=${MNS.id}`);
  const swap = page.getByRole("button", { name: `Swap ${yogurt.name}`, exact: true });
  await swap.waitFor({ timeout: 90000 });
  expect((await swap.innerText()).trim() === "Swap", "the word is visible");
  expect((await swap.boundingBox()).height >= 44, "Swap height");
  expect((await page.getByRole("button", { name: /^Swap Milk/ }).count()) === 0, "a typed item has no Swap");
  await swap.tap();
  const s = sheet(page, `Swap ${yogurt.name}`);
  await s.waitFor({ timeout: 15000 });
  const options = s.locator("ul > li > button");
  await options.first().waitFor({ timeout: 60000 });
  const n = await options.count();
  expect(n >= 3 && n <= 12, "options: " + n);
  const texts = await options.allInnerTexts();
  expect(texts.every((x) => !x.startsWith(yogurt.name + "\n")), "the item itself is offered");
  expect(texts.every((x) => /£\d|Price in store/.test(x)), "every option has a price: " + texts[0]);
  expect((await s.locator("ul > li img").count()) > 0, "photos");
  const chosen = texts[0].split("\n")[0].trim();
  await options.first().tap();
  await page.getByRole("status").filter({ hasText: `Swapped for “${chosen}”.` }).waitFor({ timeout: 5000 });
  const items = await stored(page);
  const it = items.find((i) => i.name === chosen);
  expect(items.length === 2 && it && it.qty === 2 && it.list === MNS.id && !it.done && it.retailer === "marks-and-spencer" && it.shopId !== yogurt.shopId, JSON.stringify(items));
  expect(!items.some((i) => i.shopId === yogurt.shopId), "the old one is gone");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("Swap when the shop's products can't load says so, with Try again", async () => {
  const { ctx, page } = await open([yogurt]);
  await page.route("**/groceries/all/marks-and-spencer.json", (r) => r.fulfill({ status: 500, body: "no" }));
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("button", { name: `Swap ${yogurt.name}` }).tap({ timeout: 90000 });
  const s = sheet(page, `Swap ${yogurt.name}`);
  await s.getByRole("alert").filter({ hasText: "Couldn't load M&S's products." }).waitFor({ timeout: 30000 });
  await page.unroute("**/groceries/all/marks-and-spencer.json");
  await s.getByRole("button", { name: "Try again" }).tap();
  await s.locator("ul > li > button").first().waitFor({ timeout: 60000 });
  await ctx.close();
});

await step("Delete this list asks first, says how many items go, then deletes the list and its items and shows the main list", async () => {
  const { ctx, page } = await open([asdaItem, { ...yogurt, list: MNS.id }], { st: { shoppingLists: [MNS] } });
  await page.goto(BASE + `/app/groceries/list?l=${MNS.id}`);
  await page.getByRole("button", { name: "Delete this list" }).tap({ timeout: 90000 });
  const s = sheet(page, "Delete this list?");
  await s.getByText("This deletes M&S and the 1 item on it. It can't be undone.").waitFor({ timeout: 5000 });
  await s.getByRole("button", { name: "Keep it" }).tap();
  expect((await stored(page)).length === 2, "Keep it deleted something");
  await page.getByRole("button", { name: "Delete this list" }).tap();
  await sheet(page, "Delete this list?").getByRole("button", { name: "Delete the list" }).tap();
  await page.getByRole("status").filter({ hasText: "Deleted M&S." }).waitFor({ timeout: 5000 });
  await page.getByRole("checkbox", { name: /Aaila/ }).waitFor({ timeout: 5000 });
  await page.waitForURL((u) => !u.search.includes("l="), { timeout: 10000 }); // back on the main list
  expect((await chips(page).getByRole("link").count()) === 0, "no chips once the last list is gone");
  expect((await stored(page)).map((i) => i.retailer).join() === "asda", "items left");
  expect((await storedLists(page)).length === 0, "the list is gone from the settings");
  await ctx.close();
});

await step("Select: Select all ticks every item, Remove takes them all off this list at once, Undo puts them back; another list is left alone", async () => {
  const onMns = { ...yogurt, list: MNS.id };
  const { ctx, page, errors } = await open([asdaItem, typedItem, { ...yogurt, qty: 1 }, onMns], { st: { shoppingLists: [MNS] } });
  await page.goto(BASE + "/app/groceries/list");
  const select = page.getByRole("button", { name: "Select", exact: true });
  await select.waitFor({ timeout: 90000 });
  await page.getByText(/^3 items$/).waitFor();
  await select.tap();
  await page.getByText("0 selected").waitFor();
  const remove = page.getByRole("button", { name: /^Remove \d+ items?$/ });
  expect(await remove.isDisabled(), "nothing chosen: Remove is off");
  await page.getByRole("checkbox", { name: "Select Milk" }).tap();
  await page.getByText("1 selected").waitFor();
  await page.getByRole("button", { name: "Select all" }).tap();
  await page.getByText("3 selected").waitFor();
  expect((await page.getByRole("button", { name: /^Swap / }).count()) === 0, "Swap hidden while selecting");
  const box = await remove.boundingBox();
  expect(box && box.y + box.height <= 844, "Remove is in view");
  await page.getByRole("button", { name: "Remove 3 items" }).tap();
  await page.getByText("Removed 3 items from your list.").waitFor();
  let left = await stored(page);
  expect(left.length === 1 && left[0].list === MNS.id, `only the M&S list's item is left: ${JSON.stringify(left.map((x) => x.name))}`);
  await page.getByRole("button", { name: "Undo" }).tap();
  await page.getByText(/^3 items$/).waitFor();
  left = await stored(page);
  expect(left.length === 4, `Undo put them back: ${left.length}`);
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("nothing runs sideways at 390 px with Extra large text: the chips, the rows with Swap, the New list and Swap sheets", async () => {
  const lists = [MNS, MNS2, { id: "sains001", shop: "sainsburys", name: "Sainsbury's" }, { id: "sains002", shop: "sainsburys", name: "Sainsbury's 2" }];
  const { ctx, page } = await open([{ ...yogurt, list: MNS.id }, { ...typedItem, list: MNS.id }, asdaItem], { st: { textSize: "xlarge", shoppingLists: lists } });
  await page.goto(BASE + `/app/groceries/list?l=${MNS.id}`);
  const swap = page.getByRole("button", { name: `Swap ${yogurt.name}` });
  await swap.waitFor({ timeout: 90000 });
  expect((await sideways(page)) <= 0, "list: sideways " + (await sideways(page)));
  const boxes = await chips(page).locator("a, button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.height]; }));
  expect(boxes.every(([l, r, h]) => l >= 0 && r <= 390 && h >= 44), "a chip off the screen or too small: " + JSON.stringify(boxes));
  expect(new Set(boxes.map(([l]) => Math.round(l))).size < boxes.length, "the chips wrap onto more than one line");
  await swap.tap();
  await sheet(page, `Swap ${yogurt.name}`).locator("ul > li > button").first().waitFor({ timeout: 60000 });
  expect((await sideways(page)) <= 0, "Swap sheet: sideways");
  const sheetOver = await page.evaluate(() => { const d = document.querySelector("dialog[open] .sheet-panel"); return d ? d.scrollWidth - d.clientWidth : 0; });
  expect(sheetOver <= 0, "Swap sheet runs sideways " + sheetOver);
  await page.keyboard.press("Escape");
  await newList(page).tap();
  await sheet(page, "What do you want to make a shopping list for?").getByRole("button", { name: "M&S", exact: true }).waitFor({ timeout: 30000 });
  const newOver = await page.evaluate(() => { const d = document.querySelector("dialog[open] .sheet-panel"); return d ? d.scrollWidth - d.clientWidth : 0; });
  expect(newOver <= 0, "New list sheet runs sideways " + newOver);
  await ctx.close();
});

await step("axe: no violations on a list with chips and Swap, and in the New list, Add to which list and Swap sheets", async () => {
  const run = async (page, where) => {
    await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
    expect(res.violations.length === 0, where + ": " + res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 100)).join(" | "));
  };
  const { ctx, page } = await open([{ ...yogurt, list: MNS.id }, { ...yogurt, done: true }, typedItem], { st: { shoppingLists: [MNS, MNS2] } });
  await page.goto(BASE + `/app/groceries/list?l=${MNS.id}`);
  await page.getByRole("button", { name: `Swap ${yogurt.name}` }).waitFor({ timeout: 90000 });
  await page.waitForTimeout(900);
  await run(page, "list");
  await page.getByRole("button", { name: `Swap ${yogurt.name}` }).tap();
  await sheet(page, `Swap ${yogurt.name}`).locator("ul > li > button").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await run(page, "Swap sheet");
  await page.keyboard.press("Escape");
  await newList(page).tap();
  await sheet(page, "What do you want to make a shopping list for?").getByRole("button", { name: "M&S", exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await run(page, "New list sheet");
  await page.goto(BASE + "/app/groceries/shop/item?r=marks-and-spencer&id=fdp60023388");
  await page.getByRole("button", { name: "Add to my list" }).tap({ timeout: 90000 });
  await sheet(page, "Add to which list?").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await run(page, "Add to which list sheet");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
