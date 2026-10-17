// A "Done" for the keyboard (founder 2026-10-15, on Compare's "Add a product" box with the keyboard up: "There needs to be like a done box here").
// Every search box that filters as you type shows a Done button inside it while it is in use; tapping it (or the keyboard's Return key) puts the
// keyboard away and keeps the words and the results. The number boxes of Eat out's "Your numbers" have no Return key on an iPhone, so the
// group gets a Done at the card's corner. Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function open(extra = {}, settings = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }));
  return { ctx, page: await ctx.newPage() };
}
const focused = (page) => page.evaluate(() => document.activeElement?.tagName ?? "");
const doneButton = (page) => page.getByRole("button", { name: "Done", exact: true });

/** One search box: Done appears when it is in use, sits inside the box, and tapping it lets go of the field but keeps the words. */
async function searchBox(page, { url, find, text, hint, autofocus = false }) {
  await page.goto(BASE + url);
  const input = find(page);
  await input.waitFor({ timeout: 90000 });
  const done = doneButton(page);
  if (!autofocus) expect(!(await done.first().isVisible().catch(() => false)), "no Done before the box is used");
  await input.tap();
  await input.fill(text);
  await done.first().waitFor({ state: "visible", timeout: 5000 });
  const box = await done.first().boundingBox();
  const field = await input.boundingBox();
  expect(box && field && box.x >= field.x && box.x + box.width <= field.x + field.width && box.y >= field.y && box.y + box.height <= field.y + field.height, "Done sits inside the box");
  expect(box.height >= 32, "Done is a proper size: " + Math.round(box.height));
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  expect((await focused(page)) === "BODY", "tapping Done lets go of the field (focus: " + (await focused(page)) + ")");
  expect((await input.inputValue()) === text, "the typed words stay");
  expect(!(await done.first().isVisible().catch(() => false)), "Done is gone again");
  // the keyboard's own Return key does the same, and says so
  await input.tap();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  expect((await focused(page)) === "BODY", "the Return key puts the keyboard away");
  expect((await input.getAttribute("enterkeyhint")) === hint, "the keyboard's key reads " + hint + ", got " + (await input.getAttribute("enterkeyhint")));
}

const BOXES = [
  { name: "Compare: Add a product", url: "/app/compare", find: (p) => p.getByLabel("Add a product"), text: "Bak", hint: "done" },
  { name: "Recipes", url: "/app/recipes", find: (p) => p.getByLabel("Search recipes"), text: "chic", hint: "done" },
  { name: "Groceries: search every shop", url: "/app/groceries/search", find: (p) => p.getByLabel("Search products or type a barcode"), text: "beans", hint: "done" },
  { name: "My favourite restaurants", url: "/app/eat-out/favourites", find: (p) => p.getByLabel("Search restaurants"), text: "kfc", hint: "done" },
  { name: "A restaurant's menu", url: "/app/chain?id=kfc", find: (p) => p.getByLabel(/Search the .* menu/), text: "wrap", hint: "done" },
  { name: "A shop's full list", url: "/app/groceries/shop?r=sainsburys", find: (p) => p.getByLabel(/Search .* products/), text: "milk", hint: "done" },
  // opens with the keyboard up (autofocus), and its Return key keeps the search in "Recent searches" as before
  { name: "Search", url: "/app/search", find: (p) => p.getByLabel("Search restaurants and items"), text: "chick", hint: "search", autofocus: true },
];
for (const b of BOXES) {
  await step(`${b.name}: Done shows while the box is in use and puts the keyboard away`, async () => {
    const { ctx, page } = await open();
    await searchBox(page, b);
    await ctx.close();
  });
}

await step("Compare: the results stay under the box after Done", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/compare");
  const input = page.getByLabel("Add a product");
  await input.waitFor({ timeout: 90000 });
  await input.tap();
  await input.fill("beans");
  await page.getByRole("button", { name: /^Add\b/ }).first().waitFor({ timeout: 60000 });
  await doneButton(page).first().tap();
  await page.waitForTimeout(300);
  expect((await page.getByRole("button", { name: /^Add\b/ }).count()) > 0, "results are still listed");
  await ctx.close();
});

await step("Search: the clear button and Done sit side by side, and the clear button still clears", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/search");
  const input = page.getByLabel("Search restaurants and items");
  await input.waitFor({ timeout: 90000 });
  await input.fill("chick");
  const clear = page.getByRole("button", { name: "Clear search" });
  await clear.waitFor();
  const c = await clear.boundingBox(), d = await doneButton(page).first().boundingBox();
  expect(c.x + c.width <= d.x + 1, "the clear button is before Done, not under it");
  await clear.tap();
  expect((await input.inputValue()) === "", "clear empties the box");
  await ctx.close();
});

await step("Eat out › Your numbers: a Done at the card\'s corner while a box is in use (the number pad has no Return key) puts the keyboard away and keeps the number, and nothing moves when the box lets go", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("button", { name: "Find by numbers or allergies" }).tap();
  const cal = page.getByLabel("Calories, up to");
  await cal.waitFor();
  const bar = doneButton(page);
  expect(!(await bar.isVisible().catch(() => false)), "no Done before a box is used");
  await cal.tap();
  await cal.fill("500");
  await bar.waitFor({ state: "visible", timeout: 5000 });
  const b = await bar.boundingBox();
  const card = await page.getByText("Your numbers", { exact: true }).first().boundingBox();
  const boxTop = (await cal.boundingBox()).y;
  expect(b.y < boxTop && Math.abs(b.y + b.height / 2 - (card.y + card.height / 2)) < 16, "Done sits in the card's top corner, level with the heading, above the boxes");
  expect(b.height >= 30, "Done is a proper size: " + Math.round(b.height));
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  expect((await focused(page)) === "BODY", "focus left the box");
  expect(!(await bar.isVisible().catch(() => false)), "Done is gone again");
  expect((await cal.inputValue()) === "500", "the number stays");
  // nothing moves when a box lets go, so the very next tap (an allergy tile) lands first time
  await cal.tap();
  const milk = page.getByRole("button", { name: "Milk", exact: true });
  const before = (await milk.boundingBox()).y;
  await milk.tap();
  expect((await milk.getAttribute("aria-pressed")) === "true", "the first tap on the next thing registers");
  expect(Math.abs((await milk.boundingBox()).y - before) < 1, "the page didn't shift under the finger");
  await ctx.close();
});

await step("a keyboard user can Tab from the box to Done and press it (no touch needed)", async () => {
  const { ctx, page } = await open({ hasTouch: false, isMobile: false });
  await page.goto(BASE + "/app/recipes");
  const input = page.getByLabel("Search recipes");
  await input.waitFor({ timeout: 90000 });
  await input.focus();
  await page.keyboard.press("Tab");
  const name = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(name === "Done", "Tab lands on Done (got " + name + ")");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  expect((await focused(page)) === "BODY", "Enter on Done lets go");
  await ctx.close();
});

await step("Extra large text: Done fits with no sideways scroll", async () => {
  const big = await open({}, { textSize: "xlarge" });
  await big.page.goto(BASE + "/app/compare");
  const input2 = big.page.getByLabel("Add a product");
  await input2.waitFor({ timeout: 90000 });
  await input2.tap();
  await input2.fill("Bak");
  await doneButton(big.page).first().waitFor({ state: "visible", timeout: 5000 });
  const over = await big.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over <= 0, "no sideways scroll: " + over);
  await big.ctx.close();
});

await step("axe: no violations with the Done button showing (Compare and Eat out numbers)", async () => {
  const { ctx, page } = await open();
  for (const [url, prep] of [
    ["/app/compare", async () => { const i = page.getByLabel("Add a product"); await i.waitFor({ timeout: 90000 }); await i.tap(); await i.fill("Bak"); }],
    ["/app/eat-out", async () => { await page.getByRole("button", { name: "Find by numbers or allergies" }).tap(); const c = page.getByLabel("Calories, up to"); await c.tap(); await c.fill("500"); }],
  ]) {
    await page.goto(BASE + url);
    await prep();
    await doneButton(page).first().waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(800); // let fades end before colours are judged
    await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
    expect(res.violations.length === 0, url + ": " + res.violations.map((v) => v.id + " " + v.nodes[0]?.html.slice(0, 80)).join(" | "));
  }
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
