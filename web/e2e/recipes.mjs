// Recipes from your shop: list, filters, sort, a recipe with swap and "add all to my list", the list's price total, Home's four tiles, axe.
// Uses the real published Sainsbury's list (public/groceries/all/sainsburys.json); the shop's pictures are answered locally.
// Run against a production build: BASE=http://localhost:3101 node e2e/recipes.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function newPage(colorScheme = "light") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  await page.route("**/assets.sainsburys-groceries.co.uk/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const money = (t) => Number(/£(\d+\.\d\d)/.exec(t)?.[1] ?? NaN);

await step("Home shows eat out, shop, cook and the list; Cook opens the recipes", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("link", { name: "Find restaurants near you" }).waitFor();
  await page.getByRole("link", { name: "Browse supermarket groceries" }).waitFor();
  await page.getByRole("link", { name: /Your shopping list/ }).waitFor();
  await page.getByRole("link", { name: "Cook from your shop" }).click();
  await page.getByRole("heading", { level: 1, name: "Recipes from your shop" }).waitFor();
  await ctx.close();
});

await step("recipes list: every recipe priced at Sainsbury's, meat-free filter, sort by price", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const cards = page.locator("a[href*='/app/recipes/view']");
  await cards.first().waitFor();
  const n = await cards.count();
  expect(n === 12, `12 recipes, got ${n}`);
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "No meat or fish" }).click();
  await page.waitForTimeout(200);
  const m = await cards.count();
  expect(m === 4, `4 meat-free recipes, got ${m}`);
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "All recipes" }).click();
  await page.getByRole("radio", { name: "Lowest price" }).click();
  await page.waitForTimeout(200);
  const prices = [];
  for (let i = 0; i < 3; i++) prices.push(money((await cards.nth(i).innerText()).replace(/\n/g, " ")));
  expect(prices.every((p, i) => i === 0 || prices[i - 1] <= p), `cheapest first, got ${prices}`);
  await page.getByText(/Prices from Sainsbury's website, checked/).waitFor();
  await ctx.close();
});

await step("a recipe: per-serving numbers, what to buy, swap an ingredient, add all to the list, list total", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes/view?id=beef-chilli&r=sainsburys");
  await page.getByRole("heading", { level: 1, name: "Beef chilli and rice" }).waitFor();
  await page.getByRole("group", { name: /Beef chilli and rice, per serving/ }).waitFor();
  await page.getByText("a serving", { exact: true }).waitFor();
  await page.getByText("to buy it all", { exact: true }).waitFor();
  const buy = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li");
  expect((await buy.count()) === 4, "4 ingredients");
  const riceRow = buy.nth(3);
  const before = await riceRow.innerText();
  await page.getByRole("button", { name: "Swap Rice" }).click();
  const sheet = page.getByRole("dialog", { name: "Swap rice" });
  await sheet.waitFor();
  const options = sheet.locator("button[aria-pressed]");
  expect((await options.count()) > 1, "more than one rice to choose from");
  expect((await options.first().getAttribute("aria-pressed")) === "true", "the current pick is marked");
  const second = (await options.nth(1).innerText()).split("\n")[0];
  await options.nth(1).click();
  await sheet.waitFor({ state: "hidden" });
  const after = await riceRow.innerText();
  expect(after !== before && after.includes(second), `swapped to ${second}`);
  await page.getByRole("button", { name: "Add all to my shopping list" }).click();
  await page.getByText("Added 4 products to your Sainsbury's list.").waitFor();
  await page.getByRole("link", { name: "See list" }).click();
  await page.getByRole("heading", { level: 1, name: "Shopping list" }).waitFor();
  const section = page.getByRole("region", { name: "Sainsbury's" });
  expect((await section.locator("li").count()) === 4, "4 items on the list");
  await section.getByText(second).waitFor();
  await section.getByText(/for the items with a price, at Sainsbury's prices checked/).waitFor();
  await page.getByRole("heading", { name: "How to make it" }).count(); // not on this page; just making sure nothing threw
  await ctx.close();
});

await step("a shop product can be added to the list from its own page", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/shop/item?r=sainsburys&id=sainsburys-red-kidney-beans-in-water-400g-240g");
  await page.getByRole("heading", { level: 1, name: /Red Kidney Beans/ }).waitFor();
  await page.getByRole("button", { name: "Add to my list" }).click();
  await page.getByText("Added to your Sainsbury's list.").waitFor();
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("link", { name: /Red Kidney Beans in Water 400g/ }).waitFor();
  await ctx.close();
});

for (const scheme of ["light", "dark"]) {
  await step(`axe: recipes list and a recipe (${scheme})`, async () => {
    const { ctx, page } = await newPage(scheme);
    for (const path of ["/app/recipes", "/app/recipes/view?id=chickpea-curry&r=sainsburys"]) {
      await page.goto(BASE + path);
      await page.locator(path.includes("view") ? "text=How to make it" : "a[href*='/app/recipes/view']").first().waitFor();
      await page.waitForTimeout(600);
      await page.addScriptTag({ path: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
      expect(v.length === 0, `${path}: ${v.join(", ")}`);
    }
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
