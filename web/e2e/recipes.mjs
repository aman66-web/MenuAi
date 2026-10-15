// Recipes from your shop: list (100 recipes: meal chips, search, paging), filters, sort, a recipe with swap, substitutes and "add all to my
// list", the list's price total, Home's four tiles, Pip's recipe maker switched off (free launch), axe.
// Uses the real published Sainsbury's list (public/groceries/all/sainsburys.json); the shop's pictures are answered locally.
// Run against a production build: BASE=http://localhost:3101 node e2e/recipes.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
const settings = JSON.stringify({ v: 1, data: baseSettings });
const proSettings = JSON.stringify({ v: 1, data: { ...baseSettings, devProOverride: true } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function newPage(colorScheme = "light", data = settings) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, data);
  const page = await ctx.newPage();
  await page.route("**/assets.sainsburys-groceries.co.uk/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const money = (t) => Number(/£(\d+\.\d\d)/.exec(t)?.[1] ?? NaN);
const lines = (text) => text.split("\n").map((l) => l.trim());

await step("the tab bar opens Recipes; Home's My meals tile opens one page with two tabs; the old addresses forward to it", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("link", { name: /Shopping list/ }).waitFor();
  await page.getByRole("link", { name: /My meals/ }).click();
  await page.getByRole("heading", { level: 1, name: "My meals" }).waitFor();
  await page.getByRole("tab", { name: /^Recipes/, selected: true }).waitFor();
  await page.getByText("No saved recipes yet").waitFor();
  await page.getByRole("tab", { name: /Restaurant meals/ }).click();
  await page.getByText("No saved orders yet").waitFor();
  await page.waitForURL("**/app/meals?tab=restaurant");
  await page.goto(BASE + "/app/recipes/saved");
  await page.waitForURL("**/app/meals?tab=recipes");
  await page.getByRole("tab", { name: /^Recipes/, selected: true }).waitFor();
  await page.goto(BASE + "/app/saved");
  await page.waitForURL("**/app/meals?tab=restaurant");
  await page.getByRole("tab", { name: /Restaurant meals/, selected: true }).waitFor();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" }).click();
  await page.getByRole("heading", { level: 1, name: "What's cooking today?" }).waitFor();
  await ctx.close();
});

await step("recipes list: picked for you, 100 recipes priced at Sainsbury's, 24 at a time, meal tiles, search, filters, sort by price under More, save with the heart", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const picks = page.getByRole("region", { name: "Picked for you" }).locator("a[href*='/app/recipes/view']");
  await picks.first().waitFor();
  expect((await picks.count()) === 8, `8 picked for you, got ${await picks.count()}`);
  const cards = page.getByRole("region", { name: /All recipes/ }).locator("a[href*='/app/recipes/view']");
  await cards.first().waitFor();
  await page.getByRole("heading", { name: /All recipes · 100/ }).waitFor();
  await page.getByRole("status").filter({ hasText: /^100 recipes$/ }).waitFor();
  expect((await cards.count()) === 24, `24 shown first, got ${await cards.count()}`);
  await page.getByRole("button", { name: "Show more recipes (76 more)" }).click();
  expect((await cards.count()) === 48, `48 after Show more, got ${await cards.count()}`);
  const tiles = page.getByRole("group", { name: "Filters" });
  await tiles.getByRole("button", { name: "Snacks" }).click();
  await page.getByRole("status").filter({ hasText: /^11 recipes match$/ }).waitFor();
  expect((await page.getByRole("region", { name: "Picked for you" }).count()) === 0, "picks hide while filtering");
  await tiles.getByRole("button", { name: "Breakfast" }).click();
  await page.getByRole("status").filter({ hasText: /^20 recipes match$/ }).waitFor();
  await tiles.getByRole("button", { name: "Quick" }).click();
  const quick = Number(/^(\d+) recipes? match$/.exec((await page.getByRole("status").filter({ hasText: /match$/ }).innerText()).trim())?.[1]);
  expect(quick >= 1 && quick < 20, `quick breakfasts, got ${quick}`);
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("status").filter({ hasText: /^100 recipes$/ }).waitFor();
  await tiles.getByRole("button", { name: "Vegan" }).click();
  const vegan = Number(/^(\d+) recipes match$/.exec((await page.getByRole("status").filter({ hasText: /match$/ }).innerText()).trim())?.[1]);
  expect(vegan >= 12 && vegan < 40, `vegan recipes, got ${vegan}`);
  await tiles.getByRole("button", { name: "Vegan" }).click();
  await page.getByLabel("Search recipes").fill("curry");
  await page.getByRole("link", { name: /Chicken curry/ }).first().waitFor();
  const curries = await cards.count();
  expect(curries >= 5 && curries < 15, `a handful of curries, got ${curries}`);
  await page.getByLabel("Search recipes").fill("zzzz");
  await page.getByText("No recipes match.").waitFor();
  await page.getByRole("button", { name: "Show all recipes" }).click();
  await page.getByRole("status").filter({ hasText: /^100 recipes$/ }).waitFor();
  await tiles.getByRole("button", { name: "No meat or fish" }).click();
  const m = Number(/^(\d+) recipes match$/.exec((await page.getByRole("status").filter({ hasText: /recipes match$/ }).innerText()).trim())?.[1]);
  expect(m >= 30 && m < 100, `30+ meat-free recipes, got ${m}`);
  await tiles.getByRole("button", { name: "No meat or fish" }).click();
  await page.getByRole("status").filter({ hasText: /^100 recipes$/ }).waitFor();
  await tiles.getByRole("button", { name: "More" }).click();
  await page.getByRole("radio", { name: "Lowest price" }).click();
  await page.waitForTimeout(200);
  const prices = [];
  for (let i = 0; i < 3; i++) prices.push(money((await cards.nth(i).innerText()).replace(/\n/g, " ")));
  expect(prices.every((p, i) => i === 0 || prices[i - 1] <= p), `cheapest first, got ${prices}`);
  await page.getByText(/Prices from Sainsbury's website, checked/).waitFor();
  // the heart on a card saves it to My meals, and the heart at the top counts it
  const first = cards.first().locator("xpath=..");
  await first.getByRole("button", { name: "Save to My meals", pressed: false }).click();
  await first.getByRole("button", { name: "Saved to My meals", pressed: true }).waitFor();
  await page.getByRole("link", { name: "My meals · 1" }).waitFor();
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
  expect((await buy.count()) === 7, "7 ingredients: everything the method uses, down to the cumin");
  // a store-cupboard item can be left off the basket and the list ("I have this"); its share stays in the price a serving
  const cumin = buy.filter({ hasText: "Ground cumin" });
  await cumin.getByText("You may have this already.").waitFor();
  const basketBefore = await page.getByText("to buy it all", { exact: true }).locator("xpath=..").innerText();
  await cumin.getByRole("button", { name: "I have this" }).click();
  await cumin.getByText("Left off your list and the price to buy it all.").waitFor();
  expect((await cumin.getByRole("button", { name: "I have this" }).getAttribute("aria-pressed")) === "true", "ticked");
  const basketAfter = await page.getByText("to buy it all", { exact: true }).locator("xpath=..").innerText();
  expect(basketAfter !== basketBefore, `the price to buy it all drops (${basketBefore} -> ${basketAfter})`);
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
  await page.getByText("Added 6 products to your Sainsbury's list.").waitFor();
  await page.getByRole("link", { name: "See list" }).click();
  await page.getByRole("heading", { level: 1, name: "Shopping list" }).waitFor();
  const section = page.getByRole("region", { name: "Sainsbury's" });
  expect((await section.locator("li").count()) === 6, "6 items on the list (not the cumin)");
  await section.getByText(second).waitFor();
  await section.getByText(/for the items with a price, at Sainsbury's prices checked/).waitFor();
  await page.getByRole("heading", { name: "How to make it" }).count(); // not on this page; just making sure nothing threw
  await ctx.close();
});

await step("Shopping list: type an item, tick it off, see the recipes it makes, add what one still needs, save a recipe to My meals", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("heading", { level: 1, name: "Shopping list" }).waitFor();
  await page.getByLabel("Add something to your list").fill("Chicken");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("Added “Chicken”.").waitFor();
  const tick = page.getByRole("checkbox", { name: "Chicken: still to get" });
  await tick.click();
  await page.getByRole("checkbox", { name: "Chicken: in the basket", checked: true }).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping")).data[0]);
  expect(stored.custom === true && stored.done === true && stored.retailer === "own", JSON.stringify(stored));
  await page.getByText(/\d+ recipes use something on your list/).first().waitFor();
  await page.getByRole("heading", { name: "You might also need" }).waitFor();
  await page.getByRole("link", { name: /What can I cook with this\?/ }).click();
  await page.getByRole("heading", { level: 1, name: "Cook with your shopping list" }).waitFor();
  const first = page.locator("ul > li.glass").first();
  await first.getByText(/You have 1 of \d+ ingredients/).waitFor();
  await first.getByRole("button", { name: /^Add the (other \d+|last one) to my list$/ }).click();
  await first.getByText(/Added \d+ products? to your Sainsbury's list\./).waitFor();
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping")).data.length);
  expect(n > 1, `list has ${n} items`);
  await first.getByRole("link").first().click();
  await page.getByRole("button", { name: "Save to My meals" }).click();
  await page.getByRole("button", { name: "Saved to My meals", pressed: true }).waitFor();
  await page.goto(BASE + "/app/meals");
  await page.getByRole("tab", { name: /^Recipes · 1/, selected: true }).waitFor();
  await page.locator("a[href*='/app/recipes/view']").first().waitFor();
  expect((await page.locator("a[href*='/app/recipes/view']").count()) === 1, "one saved recipe");
  await ctx.close();
});

await step("a substitute: use Quorn or tofu instead of chicken, and back again", async () => {
  const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, recipeMeal: { size: "written", moreProtein: false } } }));
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByRole("heading", { level: 1, name: "Chicken curry with rice" }).waitFor();
  const row = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
  const kcalBefore = await page.getByRole("group", { name: /per serving/ }).innerText();
  await page.getByRole("button", { name: /^Swap Chicken/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("heading", { name: "Use something else instead" }).waitFor();
  const sub = sheet.getByRole("button", { name: /Quorn|tofu/i }).first();
  const subName = (await sub.innerText()).split("\n")[0];
  await sub.click();
  await sheet.waitFor({ state: "hidden" });
  await row.getByText(/^Instead of chicken/).waitFor();
  expect((await row.innerText()).includes(subName), `the row shows ${subName}`);
  expect((await page.getByRole("group", { name: /per serving/ }).innerText()) !== kcalBefore, "the numbers follow the substitute");
  await page.getByRole("button", { name: new RegExp(`^Swap ${subName.slice(0, 5)}`) }).click();
  await page.getByRole("dialog").getByRole("button", { name: /As the recipe has it/ }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  expect((await row.getByText(/^Instead of/).count()) === 0, "back to chicken");
  await ctx.close();
});

await step("a recipe page: Back and Save on the picture, cook for more or fewer people, Ingredients and Method tabs", async () => {
  const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, recipeMeal: { size: "written", moreProtein: false } } }));
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByRole("heading", { level: 1, name: "Chicken curry with rice" }).waitFor();
  await page.getByRole("link", { name: "Back to recipes" }).waitFor();
  await page.getByRole("button", { name: "Save to My meals", pressed: false }).click();
  await page.getByRole("button", { name: "Saved to My meals", pressed: true }).waitFor();
  const chicken = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
  expect(lines(await chicken.innerText()).includes("300 g"), "300 g chicken for 2");
  await page.getByText("Serves 2", { exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Fewer servings" }).isEnabled(), "can go down to 1");
  const kcal = async () => Number(/^([\d,]+)/.exec(await page.getByRole("group", { name: /per serving/ }).innerText())?.[1]?.replace(",", ""));
  const before = await kcal();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByText("Serves 4", { exact: true }).waitFor();
  const four = lines(await chicken.innerText());
  expect(four.includes("600 g"), `600 g chicken for 4, got ${four.join(" | ")}`);
  const after = await kcal();
  expect(Math.abs(after - before) / before < 0.08, `a serving stays about the same (${before} -> ${after} kcal)`);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Fewer servings" }).click();
  await page.getByText("Serves 1", { exact: true }).waitFor();
  expect(!(await page.getByRole("button", { name: "Fewer servings" }).isEnabled()), "not below 1");
  // two tabs, like the reference: the method is one tap away and the ingredients come back as they were
  await page.getByRole("tab", { name: "Ingredients", selected: true }).waitFor();
  await page.getByRole("tab", { name: "Method" }).click();
  await page.getByRole("heading", { name: "How to make it" }).waitFor();
  await page.getByText("Cook the rice as the pack says.").waitFor();
  expect((await page.getByRole("heading", { name: "What to buy" }).count()) === 0, "ingredients hidden on the Method tab");
  await page.getByRole("tab", { name: "Method", selected: true }).press("ArrowLeft");
  await page.getByRole("tab", { name: "Ingredients", selected: true }).waitFor();
  await page.getByRole("heading", { name: "What to buy" }).waitFor();
  expect(lines(await chicken.innerText()).includes("150 g"), "still 1 serving: 150 g chicken");
  // the button to add everything stays in reach while the list scrolls
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  const add = page.getByRole("button", { name: "Add all to my shopping list" });
  const box = await add.boundingBox();
  expect(box && box.y + box.height <= 844 && box.y > 500, `Add all is kept in view near the bottom, at ${box && Math.round(box.y)}`);
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

await step("your meal: sizes fit every recipe, own numbers, and recipes as written", async () => {
  const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, goal: "maintain", dailyCalories: 2000 } }));
  await page.goto(BASE + "/app/recipes");
  await page.getByText("Each recipe is fitted to about 600 kcal a serving.").waitFor();
  const cards = page.getByRole("region", { name: /All recipes/ }).locator("a[href*='/app/recipes/view']");
  await cards.first().waitFor();
  expect((await page.getByRole("radio", { name: /^Small/ }).count()) === 0, "meal sizes shown before Adjust");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.getByRole("radio", { name: /^Small, 400 kcal/ }).click();
  await page.getByText("Each recipe is fitted to about 400 kcal a serving.").waitFor();
  await page.getByRole("radio", { name: /^More protein/ }).click();
  await page.getByText("Each recipe is fitted to about 400 kcal and 30 g protein a serving.").waitFor();
  const first = (await cards.first().innerText()).replace(/\n/g, " ");
  const kcal = Number(/(\d[\d,]*)\s*kcal/i.exec(first)?.[1]?.replace(",", ""));
  expect(kcal > 300 && kcal < 520, `closest fit near 400 kcal first, got ${kcal} in ${first.slice(0, 80)}`);
  await page.getByRole("button", { name: "Type my own numbers" }).click();
  await page.getByLabel("Calories a serving").fill("550");
  await page.getByLabel("Protein (g)").fill("40");
  await page.getByLabel("Fat, at most (g)").fill("18");
  await page.getByRole("button", { name: "Use my numbers" }).click();
  await page.getByText("Each recipe is fitted to about 550 kcal and 40 g protein, no more than 18 g fat a serving.").waitFor();
  await page.getByRole("button", { name: "Show recipes as written" }).click();
  await page.getByText("Recipes are shown as written.").waitFor();
  await page.reload();
  await page.getByText("Recipes are shown as written.").waitFor(); // remembered
  await ctx.close();
});

await step("a fitted recipe shows the full label (under More detail) and can be seen as written", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  const more = page.getByRole("button", { name: /^More detail/, expanded: false });
  await more.waitFor();
  expect((await page.getByRole("heading", { name: "Full nutrition per serving" }).count()) === 0, "the full label waits for More detail");
  await more.click();
  await page.getByRole("heading", { name: "Full nutrition per serving" }).waitFor();
  for (const row of ["Energy", "Fat", "of which saturates", "Carbohydrate", "of which sugars", "Fibre", "Protein", "Salt"]) await page.getByRole("term").filter({ hasText: new RegExp(`^${row}$`) }).first().waitFor();
  await page.getByText(/The amounts below are changed to fit\./).waitFor();
  const chicken = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
  const fitted = await chicken.innerText();
  await page.getByRole("button", { name: "Show it as written" }).click();
  await page.getByText("Showing the recipe as written.").waitFor();
  const written = await chicken.innerText();
  expect(lines(written).includes("300 g"), `as written: 300 g chicken, got ${written.slice(0, 60)}`);
  expect(fitted !== written, "fitting changed the chicken amount");
  await ctx.close();
});

await step("halal: chicken recipes use halal-named chicken, others are left out and said so", async () => {
  const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, preferences: { ...baseSettings.preferences, halalOnly: true } } }));
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Your diet:/).waitFor();
  await page.getByText("Halal", { exact: false }).first().waitFor();
  await page.getByText(/recipes? (is|are) left out for your diet/).waitFor();
  expect((await page.getByRole("link", { name: /Ham and cheese omelette/ }).count()) === 0, "ham left out for halal");
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByText(/Halal chicken breast fillets/).waitFor();
  await page.getByRole("link", { name: /Halal/ }).first().waitFor();
  await page.getByText(/check each pack before you buy/).waitFor();
  await ctx.close();
});

// Pip's AI recipe maker is switched off for the free launch (AI_RECIPES_ENABLED in lib/mm/config.ts, founder 2026-10-12). Its own
// steps (Pro gate, big buttons, what is sent, saving) come back here when it is switched on again (see git history of this file).
await step("Pip's recipe maker is off: no card even when the server says it's on, its address opens the recipes, and its API answers 404", async () => {
  const { ctx, page } = await newPage("light", proSettings);
  let asked = 0;
  await page.route("**/api/v1/recipe", (r) => { asked++; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true }) }); });
  await page.goto(BASE + "/app/recipes");
  await page.locator("a[href*='/app/recipes/view']").first().waitFor();
  expect((await page.getByRole("button", { name: /Ask Pip to make a recipe/ }).count()) === 0, "no Ask Pip card");
  expect(asked === 0, `the recipes page never asks the recipe server, asked ${asked}`);
  await page.goto(BASE + "/app/recipes/make?r=sainsburys");
  await page.waitForURL((u) => u.pathname === "/app/recipes" || u.pathname === "/app/recipes/");
  expect((await page.getByRole("button", { name: "Make my recipe" }).count()) === 0, "no maker form");
  await page.unroute("**/api/v1/recipe");
  const api = await page.request.get(BASE + "/api/v1/recipe");
  expect(api.status() === 404, `GET /api/v1/recipe is ${api.status()}`);
  const post = await page.request.post(BASE + "/api/v1/recipe", { data: {}, headers: { Origin: BASE } });
  expect(post.status() === 404, `POST /api/v1/recipe is ${post.status()}`);
  await ctx.close();
});

for (const scheme of ["light", "dark"]) {
  await step(`axe: recipes list and a recipe (${scheme})`, async () => {
    const { ctx, page } = await newPage(scheme, proSettings);
    const axe = async (where) => {
      await page.waitForTimeout(600);
      await page.addScriptTag({ path: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
      expect(v.length === 0, `${where}: ${v.join(", ")}`);
    };
    await page.goto(BASE + "/app/recipes");
    await page.locator("a[href*='/app/recipes/view']").first().waitFor();
    await axe("/app/recipes");
    await page.goto(BASE + "/app/recipes/view?id=chickpea-curry&r=sainsburys");
    await page.getByRole("heading", { name: "What to buy" }).waitFor();
    await page.getByRole("button", { name: /^More detail/ }).click();
    await axe("a recipe, Ingredients and its full label");
    await page.getByRole("tab", { name: "Method" }).click();
    await axe("a recipe, Method");
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
