// Recipes from your shop: list (165 recipes: meal chips, search, paging), filters, sort, cuisine and occasion, a recipe with swap, substitutes and "add all to my
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

await step("recipes list: picked for you, 165 recipes priced at Sainsbury's, 24 at a time, meal tiles, search, filters, sort by price under More, save with the heart", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const picks = page.getByRole("region", { name: "Picked for you" }).locator("a[href*='/app/recipes/view']");
  await picks.first().waitFor();
  expect((await picks.count()) === 8, `8 picked for you, got ${await picks.count()}`);
  const cards = page.getByRole("region", { name: /All recipes/ }).locator("a[href*='/app/recipes/view']");
  await cards.first().waitFor();
  await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  expect((await cards.count()) === 24, `24 shown first, got ${await cards.count()}`);
  // every card shows calories, protein, carbs and fat as four chips (founder 2026-10-16: "Add the fats and carbs to each of the recipes also")
  const cardText = await cards.evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  const noFour = cardText.filter((s) => !(/\d\s*kcal/.test(s) && /\d+g\s*protein/.test(s) && /\d+g\s*carbs/.test(s) && /\d+g\s*fat/.test(s)));
  expect(noFour.length === 0, `${noFour.length} of 24 cards lack kcal, protein, carbs or fat: ${noFour[0] ?? ""}`);
  await page.getByRole("button", { name: "Show more recipes (141 more)" }).click();
  expect((await cards.count()) === 48, `48 after Show more, got ${await cards.count()}`);
  const tiles = page.getByRole("group", { name: "Filters" });
  await tiles.getByRole("button", { name: "Snacks" }).click();
  await page.getByRole("status").filter({ hasText: /^17 recipes match$/ }).waitFor();
  expect((await page.getByRole("region", { name: "Picked for you" }).count()) === 0, "picks hide while filtering");
  // founder 2026-11-18: several meals at once show any of them (17 snacks and 31 breakfasts)
  await tiles.getByRole("button", { name: "Breakfast" }).click();
  await page.getByRole("status").filter({ hasText: /^48 recipes match$/ }).waitFor();
  await tiles.getByRole("button", { name: "Snacks" }).click();
  await page.getByRole("status").filter({ hasText: /^31 recipes match$/ }).waitFor();
  await tiles.getByRole("button", { name: "Quick" }).click();
  const quick = Number(/^(\d+) recipes? match$/.exec((await page.getByRole("status").filter({ hasText: /match$/ }).innerText()).trim())?.[1]);
  expect(quick >= 1 && quick < 20, `quick breakfasts, got ${quick}`);
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  await tiles.getByRole("button", { name: "Vegan" }).click();
  const vegan = Number(/^(\d+) recipes match$/.exec((await page.getByRole("status").filter({ hasText: /match$/ }).innerText()).trim())?.[1]);
  expect(vegan >= 40 && vegan < 80, `vegan recipes, got ${vegan}`);
  await tiles.getByRole("button", { name: "Vegan" }).click();
  await page.getByLabel("Search recipes").fill("curry");
  await page.getByRole("link", { name: /Chicken curry/ }).first().waitFor();
  const curries = await cards.count();
  expect(curries >= 5 && curries < 25, `a handful of curries, got ${curries}`);
  await page.getByLabel("Search recipes").fill("zzzz");
  await page.getByText("No recipes match.").last().waitFor();
  await page.getByRole("button", { name: "Show all recipes" }).click();
  await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  await tiles.getByRole("button", { name: "No meat or fish" }).click();
  const m = Number(/^(\d+) recipes match$/.exec((await page.getByRole("status").filter({ hasText: /recipes match$/ }).innerText()).trim())?.[1]);
  expect(m >= 30 && m < 100, `30+ meat-free recipes, got ${m}`);
  await tiles.getByRole("button", { name: "No meat or fish" }).click();
  await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  await tiles.getByRole("button", { name: "More" }).click();
  await page.getByRole("radio", { name: "Lowest price" }).click();
  await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: "Show 165 recipes" }).click();
  await page.waitForTimeout(200);
  const prices = [];
  for (let i = 0; i < 3; i++) prices.push(money((await cards.nth(i).innerText()).replace(/\n/g, " ")));
  expect(prices.every((p, i) => i === 0 || prices[i - 1] <= p), `cheapest first, got ${prices}`);
  await page.getByText(/Prices from Sainsbury's website, checked/).waitFor();
  // the heart on a card saves it to My meals, and the heart at the top counts it
  const first = cards.first().locator("xpath=..");
  await first.getByRole("button", { name: "Save to My meals", pressed: false }).click();
  await first.getByRole("button", { name: "Saved to My meals", pressed: true }).waitFor();
  await page.getByRole("link", { name: "My recipes · 1" }).waitFor();
  await ctx.close();
});

await step("a recipe: per-serving numbers, what to buy, swap an ingredient, add all to the list, list total", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes/view?id=beef-chilli&r=sainsburys");
  await page.getByRole("heading", { level: 1, name: "Beef chilli and rice" }).waitFor();
  await page.getByRole("group", { name: /Beef chilli and rice, For 1 serving/ }).waitFor();
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
  expect((await section.getByRole("checkbox").count()) === 6, "6 items on the list (not the cumin)"); // the card's last row is "Add more from Sainsbury's", not an item
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

await step("My meals: the heart takes a saved recipe out with an Undo at the top of the screen that puts it back where it was, with its date; the empty state says how to save one", async () => {
  const { ctx, page } = await newPage();
  const seed = (data) => page.evaluate((d) => localStorage.setItem("mm.v1.savedRecipes", JSON.stringify({ v: 1, data: d })), data);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.savedRecipes") ?? "null")?.data);
  const curry = { id: "chicken-curry", savedAt: "2026-10-10T10:00:00.000Z" };
  const chilli = { id: "beef-chilli", savedAt: "2026-10-09T10:00:00.000Z" };
  await page.goto(BASE + "/app/meals?tab=recipes");
  await page.getByRole("tab", { name: /^Recipes/, selected: true }).waitFor();
  await seed([curry]);
  await page.reload();
  const card = page.locator("a[href*='/app/recipes/view?id=chicken-curry']");
  await card.waitFor();
  // the numbers sit on one strip of three under the name: protein, carbs, fat
  const strip = await card.evaluate((a) => [...a.querySelectorAll(".grid-cols-3 > span")].map((s) => s.textContent));
  expect(strip.length === 3 && /^\d+g protein$/.test(strip[0]) && /^\d+g carbs$/.test(strip[1]) && /^\d+g fat$/.test(strip[2]), "one strip of protein, carbs, fat: " + JSON.stringify(strip));
  const heart = card.locator("xpath=..").getByRole("button", { name: "Saved to My meals", pressed: true });
  await heart.click();
  await card.waitFor({ state: "detached" });
  const bar = page.getByRole("status").filter({ hasText: "Removed “Chicken curry with rice” from My meals." });
  await bar.waitFor();
  const box = await bar.boundingBox();
  expect(box && box.y < 120, `the Undo bar sits at the top of the screen, y=${box?.y}`);
  await page.getByText("No saved recipes yet").waitFor();
  await page.getByText("Tap the heart on any recipe, or Save at the top of a recipe, and it will be here next time.").waitFor();
  expect((await page.getByText("Save to My meals”").count()) === 0, "the empty state no longer names a button that doesn't exist");
  expect(JSON.stringify(await stored()) === "[]", "taken out of the store: " + JSON.stringify(await stored()));
  await bar.getByRole("button", { name: "Undo" }).click();
  await card.waitFor();
  await card.locator("xpath=..").getByRole("button", { name: "Saved to My meals", pressed: true }).waitFor();
  await bar.waitFor({ state: "detached" });
  expect(JSON.stringify(await stored()) === JSON.stringify([curry]), "put back with its date: " + JSON.stringify(await stored()));
  // with two saved, taking out the first and undoing puts it back first, not at the end
  await seed([curry, chilli]);
  await page.reload();
  await page.locator("a[href*='/app/recipes/view?id=beef-chilli']").waitFor();
  await card.locator("xpath=..").getByRole("button", { name: "Saved to My meals", pressed: true }).click();
  await card.waitFor({ state: "detached" });
  await bar.getByRole("button", { name: "Undo" }).click();
  await card.waitFor();
  expect(JSON.stringify(await stored()) === JSON.stringify([curry, chilli]), "back in its old place: " + JSON.stringify(await stored()));
  await ctx.close();
});

await step("a substitute: use Quorn or tofu instead of chicken, and back again", async () => {
  const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, recipeMeal: { size: "written", moreProtein: false } } }));
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByRole("heading", { level: 1, name: "Chicken curry with rice" }).waitFor();
  const row = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
  const kcalBefore = await page.getByRole("group", { name: /, For \d+ servings?/ }).innerText();
  await page.getByRole("button", { name: /^Swap Chicken/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("heading", { name: "Use something else instead" }).waitFor();
  const sub = sheet.getByRole("button", { name: /Quorn|tofu/i }).first();
  const subName = (await sub.innerText()).split("\n")[0];
  await sub.click();
  await sheet.waitFor({ state: "hidden" });
  await row.getByText(/^Instead of chicken/).waitFor();
  expect((await row.innerText()).includes(subName), `the row shows ${subName}`);
  expect((await page.getByRole("group", { name: /, For \d+ servings?/ }).innerText()) !== kcalBefore, "the numbers follow the substitute");
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
  await page.getByRole("link", { name: /^Back( to recipes)?$/ }).waitFor(); // "Back to recipes" when opened by address (as here), plain "Back" when reached from another page of the app
  await page.getByRole("button", { name: "Save to My meals", pressed: false }).click();
  await page.getByRole("button", { name: "Saved to My meals", pressed: true }).waitFor();
  const chicken = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
  // founder 2026-11-17: each ingredient shows what the amount used costs ("£1.39 used"), in the green of "a serving"; it grows with the people
  const usedOf = async () => Number(((await chicken.innerText()).match(/£(\d+\.\d\d) used/) ?? [])[1] ?? NaN);
  const used1 = await usedOf();
  expect(used1 > 0, "the first ingredient shows the cost of the amount used: " + (await chicken.innerText()).replace(/\n/g, " | "));
  // founder 2026-11-16: a recipe opens for one person; + cooks for more, and the amounts and the numbers shown follow
  await page.getByText("Serves 1", { exact: true }).waitFor();
  expect(!(await page.getByRole("button", { name: "Fewer servings" }).isEnabled()), "opens at 1, not below 1");
  expect(lines(await chicken.innerText()).includes("150 g"), "150 g chicken for 1");
  await page.getByRole("group", { name: /, For 1 serving\b/ }).waitFor();
  const kcal = async () => Number(/^([\d,]+)/.exec(await page.getByRole("group", { name: /, For \d+ servings?/ }).innerText())?.[1]?.replace(",", ""));
  const one = await kcal();
  expect((await page.getByText(/^Each serving: /).count()) === 0, "no each-serving line for one person");
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByText("Serves 2", { exact: true }).waitFor();
  expect(lines(await chicken.innerText()).includes("300 g"), "300 g chicken for 2");
  await page.getByRole("group", { name: /, For 2 servings\b/ }).waitFor();
  const two = await kcal();
  expect(Math.abs(two - 2 * one) <= 1, `the calories are for both servings (${one} -> ${two} kcal)`);
  await page.getByText(new RegExp(`^Each serving: ${one.toLocaleString("en-GB")} kcal`)).waitFor();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByText("Serves 4", { exact: true }).waitFor();
  const four = lines(await chicken.innerText());
  expect(four.includes("600 g"), `600 g chicken for 4, got ${four.join(" | ")}`);
  expect(Math.abs((await kcal()) - 4 * one) <= 2, "the calories are for all four");
  expect(Math.abs((await usedOf()) - 4 * used1) <= 0.05, `the cost of the amount used is for all four: ${used1} x 4 = ${await usedOf()}`);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Fewer servings" }).click();
  await page.getByText("Serves 1", { exact: true }).waitFor();
  expect(!(await page.getByRole("button", { name: "Fewer servings" }).isEnabled()), "not below 1");
  // two tabs, like the reference: the method is one tap away and the ingredients come back as they were
  await page.getByRole("tab", { name: "Ingredients", selected: true }).waitFor();
  await page.getByRole("tab", { name: "Method" }).click();
  await page.getByRole("heading", { name: "How to make it" }).waitFor();
  // founder 2026-11-16: each step has a short bold title (its own heading) above the instruction, with the step's time beside it
  await page.getByRole("heading", { name: "Check the chicken", exact: true }).waitFor();
  await page.getByText("Cut into the thickest part of the biggest piece.", { exact: false }).waitFor();
  // founder 2026-11-17: each ingredient's amount for this many people sits in the step right after the words that first name it ("the chicken (150 g)")
  const method = await page.locator("#recipe-panel-method").innerText();
  const amounts = method.match(/\((?:[\d¼½¾][^)]*?(?:g|ml|tsp|tbsp|eggs?|sprays)|a pinch[^)]*)\)/g) ?? [];
  expect(amounts.length >= 3, `amounts in the steps (${amounts.length})`);
  expect(/chicken \(150\u00a0g/.test(method), "the chicken's 150 g for one person is in the step that first names it");
  await page.getByText(/^The cooking times are for 2 servings/).waitFor();
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

// founder 2026-10-16: "the maths doesn't work when you increase the servings" (chicken chow mein showed 451, 456, 451 kcal at Serves 4, 3, 2), and 2026-11-16:
// a recipe opens for one person and the numbers shown are for everyone it serves. So: the numbers for n people are n times one serving, "Each serving" and the
// price a serving are the same text at every Serves value, and the amounts, the packs and "to buy it all" follow the people.
await step("numbers for n people are n servings, and a serving and its price stay the same at Serves 1, 2, 3, 4, 5 and 12: chow mein (as written and fitted), eggs, wraps", async () => {
  const written = { recipeMeal: { size: "written", moreProtein: false } };
  const fitted = { recipeMeal: { size: "normal", moreProtein: true } };
  const cases = [
    ["chicken-chow-mein", "Chicken chow mein", written, "as written"],
    ["chicken-chow-mein", "Chicken chow mein", fitted, "fitted to the meal"],
    ["smoked-salmon-eggs", null, written, "eggs, as written"],
    ["smoked-salmon-eggs", null, fitted, "eggs, fitted"],
    ["breakfast-burrito", null, written, "wraps, as written"],
    ["breakfast-burrito", null, fitted, "wraps, fitted"],
  ];
  for (const [id, title, extra, label] of cases) {
    const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, ...extra } }));
    await page.goto(BASE + `/app/recipes/view?id=${id}&r=sainsburys`);
    await page.getByRole("heading", { level: 1, name: title ?? /.+/ }).waitFor();
    await page.getByRole("group", { name: /, For 1 serving\b/ }).waitFor();
    const serves = async (n) => {
      for (let guard = 0; guard < 14; guard++) {
        const now = Number(/\d+/.exec(await page.getByText(/^Serves \d+$/).innerText())[0]);
        if (now === n) return;
        await page.getByRole("button", { name: now < n ? "More servings" : "Fewer servings" }).click();
        await page.getByText(`Serves ${now < n ? now + 1 : now - 1}`, { exact: true }).waitFor();
      }
      throw new Error(`could not reach Serves ${n}`);
    };
    const kcalOf = (text) => Number(/^([\d,]+)/.exec(text)?.[1]?.replace(",", ""));
    const read = async () => ({
      group: await page.getByRole("group", { name: /, For \d+ servings?/ }).innerText(),
      each: (await page.getByText(/^Each serving: /).count()) ? await page.getByText(/^Each serving: /).innerText() : null,
      price: await page.locator("#recipe-panel-ingredients").getByText("a serving", { exact: true }).locator("xpath=following-sibling::p[1]").innerText(),
      first: await page.locator("#recipe-panel-ingredients ul li").first().innerText(),
    });
    const one = await read();
    const kcal1 = kcalOf(one.group);
    expect(kcal1 > 0 && /£\d/.test(one.price) && one.each === null, `${label}: one serving's numbers and price: ${JSON.stringify(one.group)} ${one.price}`);
    let each2 = null;
    const firstGrams = [];
    for (const n of [1, 2, 3, 4, 5, 12]) {
      await serves(n);
      const got = await read();
      await page.getByRole("group", { name: new RegExp(`, For ${n} servings?\\b`) }).waitFor();
      expect(Math.abs(kcalOf(got.group) - n * kcal1) <= n, `${label}: Serves ${n} shows ${kcalOf(got.group)} kcal, not about ${n} x ${kcal1}`);
      expect(got.price === one.price, `${label}: Serves ${n} price a serving ${got.price}, not ${one.price}`);
      if (n > 1) {
        each2 ??= got.each;
        expect(got.each !== null && got.each === each2 && got.each.startsWith(`Each serving: ${kcal1.toLocaleString("en-GB")} kcal`), `${label}: Serves ${n} each serving ${JSON.stringify(got.each)}`);
      }
      firstGrams.push(Number(/(\d[\d,]*) (?:g|ml)\b/.exec(got.first)?.[1]?.replace(",", "") ?? NaN));
    }
    // what changes is the shopping: the first ingredient's amount grows with the people
    expect(firstGrams.every((g) => g > 0), `${label}: amounts shown ${firstGrams}`);
    expect(firstGrams[5] > firstGrams[0], `${label}: 12 people need more than 1 (${firstGrams[5]} vs ${firstGrams[0]})`);
    await ctx.close();
  }
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
  expect(lines(written).includes("150 g"), `as written, for 1: 150 g chicken, got ${written.slice(0, 60)}`);
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
  await page.locator("#recipe-panel-ingredients").getByText(/Halal chicken breast fillets/).first().waitFor();
  await page.getByRole("link", { name: /Halal/ }).first().waitFor();
  await page.getByText(/check each pack before you buy/).waitFor();
  await ctx.close();
});

await step("allergies: Recipes > More has the 14 allergens; choosing Milk leaves out recipes with milk, says so, shows in the diet line and in Settings; unchoosing brings them back", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("heading", { level: 1, name: "What's cooking today?" }).waitFor();
  const total = async () => Number(/·\s*(\d+)/.exec(await page.locator("#all-heading").textContent())?.[1] ?? "0");
  await page.locator("#all-heading").getByText(/·\s*\d+/).waitFor({ timeout: 60000 });
  const before = await total();
  expect(before >= 90, "all recipes at first: " + before);
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "More" }).click();
  const group = page.getByRole("group", { name: "Allergies to avoid" });
  await group.waitFor();
  expect((await group.getByRole("button").count()) === 14, "the 14 allergens");
  expect((await page.getByText(/allergen labels, so check each pack/).count()) === 0, "no caution until one is chosen");
  const milk = group.getByRole("button", { name: "Milk", exact: true });
  expect((await milk.getAttribute("aria-pressed")) === "false", "Milk starts off");
  await milk.click();
  expect((await milk.getAttribute("aria-pressed")) === "true", "Milk is on");
  await page.getByText(/recipes? (is|are) left out for your diet/).waitFor();
  const after = await total();
  expect(after < before && after > 0, `recipes with milk leave the list: ${before} -> ${after}`);
  await page.getByText("No milk").first().waitFor();
  await page.getByText(/We haven't read these products' allergen labels, so check each pack before you buy/).waitFor();
  // the same setting as Settings' own picker
  await page.goto(BASE + "/app/settings");
  const settingsMilk = page.getByRole("group", { name: "Allergies to avoid" }).getByRole("button", { name: "Milk", exact: true });
  await settingsMilk.waitFor();
  expect((await settingsMilk.getAttribute("aria-pressed")) === "true", "Settings shows Milk chosen");
  // and back: choosing it off here brings every recipe back
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "More" }).click();
  const milk2 = page.getByRole("group", { name: "Allergies to avoid" }).getByRole("button", { name: "Milk", exact: true });
  expect((await milk2.getAttribute("aria-pressed")) === "true", "still on after a visit elsewhere");
  await milk2.click();
  await page.waitForFunction((n) => Number(/·\s*(\d+)/.exec(document.querySelector("#all-heading")?.textContent ?? "")?.[1]) === n, before, { timeout: 15000 });
  expect((await page.getByText(/allergen labels, so check each pack/).count()) === 0, "the caution goes with the last allergy");
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

// founder 2026-10-16: "a way to customise by niche, for example for Christmas, or like Chinese cuisine or Indian": a Cuisine and an Occasion field under the
// meal tiles. Founder 2026-11-18: side by side, and any number of choices in each ("they can select more filters multiple as many as they want"), so each field
// opens the Filters sheet at its choices. Every choice says how many recipes it has with everything else as it is; one with none is greyed out unless chosen;
// within a field the choices are alternatives, the two fields together both apply; the choice lives in the address; Clear all resets it.
await step("cuisine and occasion: side by side, each opens the Filters sheet at its choices, several at once with counts, AND with the tiles and the diet, kept in the address and by Back, bad addresses ignored, Clear all", async () => {
  const { ctx, page } = await newPage();
  const status = () => page.getByRole("status").filter({ hasText: /recipes? match$/ });
  const matchCount = async () => Number(/^(\d+) recipes? match$/.exec((await status().innerText()).trim())?.[1]);
  const sheet = page.getByRole("dialog", { name: "Filters" });
  const chips = (group) => sheet.getByRole("group", { name: group, exact: true }).getByRole("button");
  const chipTexts = async (group) => (await chips(group).allInnerTexts()).map((x) => x.trim());
  const countOf = async (group, word) => Number(new RegExp(`^${word} · (\\d+)$`).exec((await chipTexts(group)).find((x) => x.startsWith(word)) ?? "")?.[1]);
  const chip = (group, word) => chips(group).filter({ hasText: new RegExp(`^${word}( · \\d+)?$`) });
  const showButton = () => sheet.getByRole("button", { name: /^Show \d+ recipes?$|^No recipes match\.$/ });
  const noSideways = async (where) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scroll`);
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  const cuisine = page.getByRole("button", { name: /^Cuisine/ });
  const occasion = page.getByRole("button", { name: /^Occasion/ });
  await cuisine.waitFor();
  await occasion.waitFor();
  // the two fields sit side by side under the meal tiles, above "Picked for you"
  const boxes = await Promise.all([page.getByRole("group", { name: "Filters" }).boundingBox(), cuisine.boundingBox(), occasion.boundingBox(), page.getByRole("region", { name: "Picked for you" }).boundingBox()]);
  expect(boxes.every(Boolean) && boxes[0].y + boxes[0].height <= boxes[1].y && Math.abs(boxes[1].y - boxes[2].y) < 2 && boxes[1].x + boxes[1].width <= boxes[2].x && boxes[1].y + boxes[1].height <= boxes[3].y, `order: tiles, Cuisine beside Occasion, Picked for you ${JSON.stringify(boxes.map((x) => x && [Math.round(x.x), Math.round(x.y)]))}`);
  expect(boxes[1].height >= 44 && boxes[2].height >= 44, "44 pt fields");
  expect((await cuisine.innerText()).includes("Any cuisine") && (await occasion.innerText()).includes("Any occasion"), "nothing chosen at first");
  await noSideways("fields");
  // the Cuisine field opens the sheet with every filter: the meals, the three others, then the cuisines and occasions with counts
  await cuisine.click();
  await sheet.waitFor();
  expect((await chipTexts("Meal")).join("|") === "Breakfast|Lunch|Dinner|Snacks", "the four meals: " + (await chipTexts("Meal")).join("|"));
  expect((await chipTexts("Only show")).join("|") === "Quick|No meat or fish|Vegan", "the three others: " + (await chipTexts("Only show")).join("|"));
  const cuisines = await chipTexts("Cuisine");
  for (const w of ["British", "Chinese", "Indian", "Italian", "Mexican", "Middle Eastern"]) expect(cuisines.some((x) => new RegExp(`^${w} · \\d+$`).test(x)), `${w} with a count: ${cuisines.join(" | ")}`);
  expect(cuisines.length === 6, `six cuisines: ${cuisines.join(" | ")}`);
  const occasions = await chipTexts("Occasion");
  for (const w of ["Lunchbox", "Party food", "Picnic", "Summer barbecue"]) expect(occasions.some((x) => new RegExp(`^${w} · \\d+$`).test(x)), `${w} with a count: ${occasions.join(" | ")}`);
  expect(occasions.every((x) => !/Easter|Pancake|Sunday|Date night/.test(x)), "no Easter, Pancake Day...");
  // Bonfire Night is offered from 15 October to 10 November only; Christmas from 1 November to 6 January
  const nowD = new Date();
  const bonfire = (nowD.getMonth() === 9 && nowD.getDate() >= 15) || (nowD.getMonth() === 10 && nowD.getDate() <= 10);
  expect(occasions.some((x) => x.startsWith("Bonfire Night")) === bonfire, `Bonfire Night ${bonfire ? "is" : "is not"} offered today: ${occasions.join(" | ")}`);
  const christmas = nowD.getMonth() >= 10 || (nowD.getMonth() === 0 && nowD.getDate() <= 6);
  expect(occasions.some((x) => /^Christmas · \d+$/.test(x)) === christmas, `Christmas ${christmas ? "is" : "is not"} offered today: ${occasions.join(" | ")}`);
  const chinese = await countOf("Cuisine", "Chinese");
  const indianAll = await countOf("Cuisine", "Indian");
  expect(chinese >= 8 && indianAll >= 8, `Chinese and Indian have plenty: ${chinese}, ${indianAll}`);
  const historyBefore = await page.evaluate(() => history.length);
  // choose Chinese: the count line says the same number, the address says so, no history entry is added, the button says how many
  await chip("Cuisine", "Chinese").click();
  await status().waitFor();
  expect((await chip("Cuisine", "Chinese").getAttribute("aria-pressed")) === "true", "Chinese is chosen");
  expect((await matchCount()) === chinese, `${chinese} Chinese recipes, the count line says ${await matchCount()}`);
  await page.waitForURL((u) => u.searchParams.get("cuisine") === "chinese" && u.searchParams.get("r") === null);
  expect((await page.evaluate(() => history.length)) === historyBefore, "choosing adds no history entry");
  expect((await showButton().innerText()).trim() === `Show ${chinese} recipes`, "the button says how many: " + (await showButton().innerText()));
  // and Indian as well: a recipe of either cuisine
  await chip("Cuisine", "Indian").click();
  await page.waitForURL((u) => u.search.includes("cuisine=chinese,indian"));
  expect((await matchCount()) === chinese + indianAll, `Chinese or Indian: ${chinese} + ${indianAll}, the count line says ${await matchCount()}`);
  await showButton().click();
  await sheet.waitFor({ state: "hidden" });
  expect((await cuisine.innerText()).includes("Chinese, Indian"), "the field shows both: " + (await cuisine.innerText()));
  expect((await page.getByRole("region", { name: "Picked for you" }).count()) === 0, "picks hide while a cuisine is chosen");
  expect((await page.getByRole("link", { name: /Egg chow mein with vegetables/ }).count()) === 1, "a Chinese recipe is in the list");
  await noSideways("two cuisines chosen");
  // the tiles narrow it further and the sheet shows the same choice: Dinner, then Snacks as well (dinners or snacks)
  const tiles = page.getByRole("group", { name: "Filters" });
  await tiles.getByRole("button", { name: "Dinner" }).click();
  const dinner = await matchCount();
  expect(dinner >= 4 && dinner < chinese + indianAll, `Chinese or Indian dinners ${dinner}`);
  await tiles.getByRole("button", { name: "Snacks" }).click();
  expect((await tiles.getByRole("button", { name: "Dinner" }).getAttribute("aria-pressed")) === "true" && (await tiles.getByRole("button", { name: "Snacks" }).getAttribute("aria-pressed")) === "true", "two meal tiles at once");
  const dinnerOrSnack = await matchCount();
  expect(dinnerOrSnack >= dinner, `dinners or snacks ${dinnerOrSnack} >= dinners ${dinner}`);
  await tiles.getByRole("button", { name: "More" }).click();
  await sheet.waitFor();
  expect((await chip("Meal", "Dinner").getAttribute("aria-pressed")) === "true" && (await chip("Meal", "Snacks").getAttribute("aria-pressed")) === "true", "the sheet shows the tiles' choice");
  expect((await countOf("Cuisine", "Chinese")) + (await countOf("Cuisine", "Indian")) === dinnerOrSnack, "the two counts add up to what is shown");
  // only snacks: nothing Chinese or Indian; every choice with nothing left is greyed out, a chosen one never is
  await chip("Meal", "Dinner").click();
  await page.getByText("No recipes match.").last().waitFor();
  for (const group of ["Cuisine", "Occasion"]) {
    const n = await chips(group).count();
    for (let i = 0; i < n; i++) {
      const c = chips(group).nth(i);
      const text = (await c.innerText()).trim();
      const pressed = (await c.getAttribute("aria-pressed")) === "true";
      expect((await c.isDisabled()) === (/ · 0$/.test(text) && !pressed), `${group} ${text}: greyed out only when it has none and is not chosen`);
    }
  }
  await sheet.getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  await page.waitForURL((u) => u.search === "");
  for (const group of ["Meal", "Only show", "Cuisine", "Occasion"]) expect((await sheet.getByRole("group", { name: group, exact: true }).locator("[aria-pressed=true]").count()) === 0, `Clear all takes off every ${group} choice`);
  await sheet.getByRole("button", { name: "Close" }).click();
  // a bad address is read as no choice: an unknown name, a cuisine with too few recipes, an occasion that does not exist, another separator
  for (const q of ["?cuisine=klingon&occasion=nope", "?cuisine=japanese", "?cuisine=thai&occasion=easter", "?cuisine=chinese;indian"]) {
    await page.goto(BASE + "/app/recipes" + q);
    await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
    await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
    expect((await cuisine.innerText()).includes("Any cuisine") && (await occasion.innerText()).includes("Any occasion"), `${q}: no choice`);
  }
  // a link with two cuisines, a reload and Back from a recipe keep the choice
  await page.goto(BASE + "/app/recipes?cuisine=indian,chinese");
  await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  await status().waitFor();
  expect((await matchCount()) === chinese + indianAll && (await cuisine.innerText()).includes("Chinese, Indian"), "?cuisine=indian,chinese: both chosen, in the catalogue's order");
  await page.goto(BASE + "/app/recipes?cuisine=indian");
  await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  await status().waitFor();
  const indian = await matchCount();
  expect(indian === indianAll && (await cuisine.innerText()).includes("Indian"), `?cuisine=indian: ${indian} Indian recipes chosen`);
  await page.reload();
  await status().waitFor();
  expect((await matchCount()) === indian && (await cuisine.innerText()).includes("Indian"), "kept after a reload");
  const first = page.getByRole("region", { name: /All recipes/ }).locator("a[href*='/app/recipes/view']").first();
  await first.click();
  await page.waitForURL((u) => u.pathname.startsWith("/app/recipes/view"));
  await page.getByRole("button", { name: /^Save to My meals/ }).waitFor();
  await page.goBack();
  await status().waitFor();
  expect((await cuisine.innerText()).includes("Indian") && (await matchCount()) === indian, "Back from a recipe finds Indian still chosen");
  await ctx.close();
  // the diet applies: for a vegan the Indian choice counts fewer, and says what choosing it shows
  const vegan = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, preferences: { ...baseSettings.preferences, veganOnly: true } } }));
  const vSheet = vegan.page.getByRole("dialog", { name: "Filters" });
  await vegan.page.goto(BASE + "/app/recipes");
  await vegan.page.getByRole("heading", { name: /All recipes · \d+/ }).waitFor();
  await vegan.page.getByRole("button", { name: /^Cuisine/ }).click();
  const vIndian = vSheet.getByRole("group", { name: "Cuisine", exact: true }).getByRole("button").filter({ hasText: /^Indian · \d+$/ });
  const veganIndian = Number(/· (\d+)$/.exec((await vIndian.innerText()).trim())?.[1]);
  expect(veganIndian >= 1 && veganIndian < indian, `vegan: fewer Indian recipes (${veganIndian} of ${indian})`);
  await vIndian.click();
  await vegan.page.getByRole("status").filter({ hasText: /recipes? match$/ }).waitFor();
  expect(Number(/^(\d+)/.exec(await vegan.page.getByRole("status").filter({ hasText: /recipes? match$/ }).innerText())?.[1]) === veganIndian, "the vegan count line equals the choice");
  await vegan.ctx.close();
  // an occasion with a cuisine: both apply, and Clear resets both
  const b = await newPage();
  const bp = b.page;
  const bSheet = bp.getByRole("dialog", { name: "Filters" });
  const bChip = (group, word) => bSheet.getByRole("group", { name: group, exact: true }).getByRole("button").filter({ hasText: new RegExp(`^${word} · \\d+$`) });
  const bCount = async (group, word) => Number(/· (\d+)$/.exec((await bChip(group, word).innerText()).trim())?.[1]);
  const bStatus = () => bp.getByRole("status").filter({ hasText: /recipes? match$/ });
  await bp.goto(BASE + "/app/recipes");
  await bp.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  await bp.getByRole("button", { name: /^Occasion/ }).click();
  const picnic = await bCount("Occasion", "Picnic");
  expect(picnic >= 8, `Picnic has plenty: ${picnic}`);
  await bChip("Occasion", "Picnic").click();
  await bStatus().waitFor();
  expect(Number(/^(\d+)/.exec(await bStatus().innerText())?.[1]) === picnic, "the Picnic count line equals the choice");
  await bp.waitForURL((u) => u.searchParams.get("occasion") === "picnic");
  // the Middle Eastern count now counts only picnic recipes, and choosing it gives exactly that
  const me = await bCount("Cuisine", "Middle Eastern");
  expect(me >= 1 && me < picnic, `Middle Eastern picnics ${me} of ${picnic}`);
  await bChip("Cuisine", "Middle Eastern").click();
  await bp.waitForURL((u) => u.searchParams.get("occasion") === "picnic" && u.searchParams.get("cuisine") === "middle-eastern");
  expect(Number(/^(\d+)/.exec(await bStatus().innerText())?.[1]) === me, "both together: the Middle Eastern picnics");
  await bSheet.getByRole("button", { name: /^Show \d+ recipes?$/ }).click();
  await bp.getByRole("link", { name: /Houmous with vegetable sticks/ }).waitFor();
  await bp.getByRole("button", { name: "Clear" }).click();
  await bp.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  expect((await bp.getByRole("button", { name: /^Cuisine/ }).innerText()).includes("Any cuisine") && (await bp.getByRole("button", { name: /^Occasion/ }).innerText()).includes("Any occasion"), "Clear resets both fields");
  // the search finds a recipe by its cuisine or occasion word
  await bp.getByLabel("Search recipes").fill("chinese");
  await bStatus().waitFor();
  expect(Number(/^(\d+)/.exec(await bStatus().innerText())?.[1]) >= chinese, "searching 'chinese' finds at least the Chinese recipes");
  await bp.getByLabel("Search recipes").fill("bbq");
  await bStatus().waitFor();
  expect(Number(/^(\d+)/.exec(await bStatus().innerText())?.[1]) >= 4, "searching 'bbq' finds the barbecue recipes");
  await bp.getByRole("link", { name: /Chicken and pepper kebabs/ }).waitFor();
  await b.ctx.close();
});

await step("Shopping at (Recipes page): one shop beside the search with its logo and name, a tap opens a choice of one shop, a pick is saved at once as the person's first shop and shows a short working moment, the recipes change to that shop, axe", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const search = page.getByLabel("Search recipes");
  const shop = page.getByRole("button", { name: /^Shopping at/ });
  expect((await shop.getAttribute("aria-label")) === "Shopping at: Sainsbury's", "label: " + (await shop.getAttribute("aria-label")));
  const s = await search.boundingBox();
  const b = await shop.boundingBox();
  expect(b.height >= 44 && b.width >= 44, `the button is ${b.width} x ${b.height}`);
  expect(b.x >= s.x + s.width && Math.abs(b.y + b.height / 2 - (s.y + s.height / 2)) < 4, "the button should sit right of the search, on the same line");
  expect(b.x + b.width <= 390, "the button runs off the screen");
  await shop.click();
  const sheet = page.getByRole("dialog", { name: "Shopping at" });
  await sheet.waitFor();
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, `the open sheet: ${v.join(", ")}`);
  // one shop at a time: radios, Sainsbury's chosen; only shops whose labels we've read are offered (Tesco, Asda... are not)
  expect((await sheet.getByRole("radio").count()) >= 2, "at least two shops can make recipes");
  expect((await sheet.getByRole("radio", { name: /Sainsbury/ }).getAttribute("aria-checked")) === "true", "Sainsbury's is the chosen shop");
  expect((await sheet.getByRole("radio", { name: /Tesco/ }).count()) === 0, "a shop we can't read isn't offered");
  const mor = sheet.getByRole("radio", { name: /Morrisons/ });
  await mor.click();
  // saved at once as the first of the person's supermarkets, the others stay ticked for Groceries
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.shops);
  expect(JSON.stringify(saved) === JSON.stringify(["morrisons", "sainsburys"]), "saved at once, Morrisons first: " + JSON.stringify(saved));
  await sheet.getByRole("status").filter({ hasText: /Saving your shop/ }).waitFor({ timeout: 1500 });
  const t0 = Date.now();
  await sheet.waitFor({ state: "hidden", timeout: 6000 });
  expect(Date.now() - t0 < 4000, "the working moment lasted too long");
  expect((await shop.getAttribute("aria-label")) === "Shopping at: Morrisons", "after: " + (await shop.getAttribute("aria-label")));
  await page.getByText(/Every ingredient is a real product at Morrisons/).waitFor();
  // Morrisons makes fewer of the recipes than Sainsbury's (labels read so far): the page says so
  await page.getByText(/more recipes? needs? something we haven't found at Morrisons yet\. Choose another shop/).waitFor();
  await page.reload();
  await page.getByText(/Every ingredient is a real product at Morrisons/).waitFor();
  await ctx.close();
});

await step("Shopping at (a recipe): one shop in the header with its logo and name, a button that opens the choice, shops that can't make this recipe say so, switching changes every ingredient to that shop's; Swap can take one ingredient from another shop; axe", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes/view?id=overnight-oats&r=sainsburys");
  await page.getByRole("heading", { name: "What to buy" }).waitFor();
  // the shop sits in the line above the recipe's name: "RECIPE ·", then the shop as a button (logo, plain-text name, a small arrow)
  const header = page.locator("h1").locator("xpath=preceding-sibling::div[1]");
  const shopBtn = header.getByRole("button", { name: /^Shopping at: Sainsbury's/ });
  const sb = await shopBtn.boundingBox();
  expect(sb && sb.height >= 44, `the shop button is ${sb?.width} x ${sb?.height}`);
  await shopBtn.click();
  const sheet = page.getByRole("dialog", { name: "Shopping at" });
  await sheet.waitFor();
  // Morrisons (and other shops) have no usable numbers for something this recipe needs, so they can't be chosen for it, and say so
  await sheet.getByText("Can't make this recipe").first().waitFor();
  expect(await sheet.getByRole("radio", { name: /Morrisons/ }).isDisabled(), "Morrisons can't be chosen for a recipe it can't make");
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, `the open sheet: ${v.join(", ")}`);
  await sheet.getByRole("button", { name: "Close" }).click();
  await sheet.waitFor({ state: "hidden" });
  // a recipe both shops make: switching moves every ingredient to Morrisons' products and saves Morrisons as the first shop
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByRole("heading", { name: "What to buy" }).waitFor();
  const rows = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li");
  expect((await rows.first().innerText()).includes("Sainsbury's"), "the first ingredient is Sainsbury's: " + (await rows.first().innerText()).replace(/\n/g, " | "));
  await header.getByRole("button", { name: /^Shopping at: Sainsbury's/ }).click();
  await sheet.waitFor();
  const mor = sheet.getByRole("radio", { name: /Morrisons/ });
  await mor.waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("Checking which shops can make this recipe"), null, { timeout: 15000 });
  expect(await mor.isEnabled(), "Morrisons can make chicken curry");
  await mor.click();
  await sheet.waitFor({ state: "hidden" });
  await header.getByRole("button", { name: /^Shopping at: Morrisons/ }).waitFor();
  await page.getByRole("heading", { name: "What to buy" }).waitFor();
  const all = await rows.allInnerTexts();
  expect(all.length > 3 && all.every((t) => t.includes("Morrisons") && !t.includes("Sainsbury")), "every ingredient is now Morrisons': " + all.map((t) => t.split("\n")[1] ?? "").join(" | "));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.shops);
  expect(JSON.stringify(saved) === JSON.stringify(["morrisons", "sainsburys"]), "Morrisons saved first: " + JSON.stringify(saved));
  // Swap: the sheet offers each shop; one ingredient can come from the other shop and says so
  await page.getByRole("button", { name: /^Swap Chicken/ }).click();
  const swap = page.getByRole("dialog");
  await swap.getByRole("button", { name: "Sainsbury's", exact: true }).waitFor({ timeout: 15000 });
  await swap.getByRole("button", { name: "Sainsbury's", exact: true }).click();
  const first = swap.locator("ul").last().getByRole("button").first();
  await first.click();
  await swap.waitFor({ state: "hidden" });
  const row = rows.first();
  expect((await row.innerText()).includes("Sainsbury's"), "the swapped ingredient is Sainsbury's: " + (await row.innerText()).replace(/\n/g, " | "));
  const rest = (await rows.allInnerTexts()).slice(1);
  expect(rest.every((t) => !t.includes("Sainsbury")), "the other ingredients stay at Morrisons");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "nothing runs off the side");
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
    await page.goto(BASE + "/app/recipes?cuisine=middle-eastern&occasion=lunchbox");
    await page.getByRole("status").filter({ hasText: /recipes? match$/ }).waitFor();
    await axe("/app/recipes with a cuisine and an occasion chosen");
    await page.goto(BASE + "/app/recipes?cuisine=indian&occasion=picnic");
    await page.getByText("No recipes match.").last().waitFor();
    await axe("/app/recipes with nothing matching");
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
