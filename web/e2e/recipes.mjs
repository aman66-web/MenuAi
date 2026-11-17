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
  await tiles.getByRole("button", { name: "Breakfast" }).click();
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
  // each ingredient's amount for this many people sits under the first step that uses it
  const needs = page.locator("#recipe-panel-method p", { hasText: /^You'll need:/ });
  expect((await needs.count()) >= 3, `amounts under the steps (${await needs.count()})`);
  expect((await needs.allInnerTexts()).some((x) => / 150 g\b/.test(x)), "the chicken's 150 g for one person is under a step");
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
// meal tiles. Every choice says how many recipes it would show; one that would show none is greyed out; the choice lives in the address; Clear resets it.
await step("cuisine and occasion: two fields with counts, one tap to choose, AND with the tiles and the diet, kept in the address and by Back, bad addresses ignored, Clear", async () => {
  const { ctx, page } = await newPage();
  const status = () => page.getByRole("status").filter({ hasText: /recipes? match$/ });
  const matchCount = async () => Number(/^(\d+) recipes? match$/.exec((await status().innerText()).trim())?.[1]);
  const options = (name) => page.getByRole("combobox", { name }).locator("option");
  const optionTexts = async (name) => (await options(name).allInnerTexts()).map((x) => x.trim());
  const countOf = async (name, word) => Number(new RegExp(`^${word} · (\\d+)$`).exec((await optionTexts(name)).find((x) => x.startsWith(word)) ?? "")?.[1]);
  const noSideways = async (where) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scroll`);
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  const cuisine = page.getByRole("combobox", { name: "Cuisine" });
  const occasion = page.getByRole("combobox", { name: "Occasion" });
  await cuisine.waitFor();
  await occasion.waitFor();
  // the fields sit under the meal tiles, above "Picked for you", and are full width
  const boxes = await Promise.all([page.getByRole("group", { name: "Filters" }).boundingBox(), cuisine.locator("xpath=..").boundingBox(), occasion.locator("xpath=..").boundingBox(), page.getByRole("region", { name: "Picked for you" }).boundingBox()]);
  expect(boxes.every(Boolean) && boxes[0].y + boxes[0].height <= boxes[1].y && boxes[1].y + boxes[1].height <= boxes[2].y && boxes[2].y + boxes[2].height <= boxes[3].y, `order: tiles, Cuisine, Occasion, Picked for you ${JSON.stringify(boxes.map((b) => b && Math.round(b.y)))}`);
  expect(boxes[1].width > 300 && boxes[2].width > 300, "full-width fields");
  await noSideways("fields");
  const cuisines = await optionTexts("Cuisine");
  expect(cuisines[0] === "Any cuisine", `first option Any cuisine, got ${cuisines[0]}`);
  for (const w of ["British", "Chinese", "Indian", "Italian", "Mexican", "Middle Eastern"]) expect(cuisines.some((x) => new RegExp(`^${w} · \\d+$`).test(x)), `${w} with a count: ${cuisines.join(" | ")}`);
  expect(cuisines.length === 7, `six cuisines and Any: ${cuisines.join(" | ")}`);
  expect(cuisines.every((x) => !/Thai|Japanese|Greek|American|Christmas/.test(x)), "only the cuisines on offer");
  const occasions = await optionTexts("Occasion");
  expect(occasions[0] === "Any occasion", `first option Any occasion, got ${occasions[0]}`);
  for (const w of ["Lunchbox", "Party food", "Picnic", "Summer barbecue"]) expect(occasions.some((x) => new RegExp(`^${w} · \\d+$`).test(x)), `${w} with a count: ${occasions.join(" | ")}`);
  expect(occasions.every((x) => !/Easter|Pancake|Sunday|Date night/.test(x)), "no Easter, Pancake Day...");
  // Bonfire Night is offered from 15 October to 10 November only
  const nowD = new Date();
  const bonfire = (nowD.getMonth() === 9 && nowD.getDate() >= 15) || (nowD.getMonth() === 10 && nowD.getDate() <= 10);
  expect(occasions.some((x) => x.startsWith("Bonfire Night")) === bonfire, `Bonfire Night ${bonfire ? "is" : "is not"} offered today: ${occasions.join(" | ")}`);
  // Christmas is offered from 1 November to 6 January only
  const christmas = nowD.getMonth() >= 10 || nowD.getMonth() === 11 || (nowD.getMonth() === 0 && nowD.getDate() <= 6);
  expect(occasions.some((x) => /^Christmas · \d+$/.test(x)) === christmas, `Christmas ${christmas ? "is" : "is not"} offered today: ${occasions.join(" | ")}`);
  const chinese = await countOf("Cuisine", "Chinese");
  expect(chinese >= 8, `Chinese has plenty: ${chinese}`);
  const historyBefore = await page.evaluate(() => history.length);
  // choose Chinese: the count line says the same number, the picks go, the address says so, and no history entry is added
  await cuisine.selectOption("chinese");
  await status().waitFor();
  expect((await matchCount()) === chinese, `${chinese} Chinese recipes, the count line says ${await matchCount()}`);
  expect((await page.getByRole("region", { name: "Picked for you" }).count()) === 0, "picks hide while a cuisine is chosen");
  await page.waitForURL((u) => u.searchParams.get("cuisine") === "chinese" && u.searchParams.get("r") === null);
  expect((await page.evaluate(() => history.length)) === historyBefore, "choosing adds no history entry");
  expect((await page.getByRole("link", { name: /Egg chow mein with vegetables/ }).count()) === 1, "a new Chinese recipe is in the list");
  await noSideways("a cuisine chosen");
  expect((await cuisine.evaluate((el) => el.options[el.selectedIndex].text.trim())) === `Chinese · ${chinese}`, "the field shows the choice and its count");
  // the tiles narrow it further, and the counts follow: Dinner, then Snacks (no Chinese snack)
  const tiles = page.getByRole("group", { name: "Filters" });
  await tiles.getByRole("button", { name: "Dinner" }).click();
  const dinner = await matchCount();
  expect(dinner >= 4 && dinner < chinese, `Chinese dinners ${dinner} of ${chinese}`);
  expect((await countOf("Cuisine", "Chinese")) === dinner, "the Chinese option follows the Dinner tile");
  expect((await countOf("Cuisine", "Indian")) !== dinner, "other cuisines count the Dinner tile too");
  await tiles.getByRole("button", { name: "Snacks" }).click();
  await page.getByText("No recipes match.").last().waitFor();
  await page.getByText("Try another cuisine, occasion, word or meal.").waitFor();
  expect(!(await options("Cuisine").filter({ hasText: /^Chinese/ }).evaluate((el) => el.disabled)), "the chosen cuisine stays enabled so it can be undone");
  expect(await options("Cuisine").filter({ hasText: /^Chinese/ }).evaluate((el) => el.selected), "and chosen");
  expect(await options("Cuisine").filter({ hasText: /^Indian/ }).evaluate((el) => el.disabled), "a cuisine with no snack is greyed out");
  expect((await options("Cuisine").filter({ hasText: /^Indian · 0$/ }).count()) === 1, "and says 0");
  expect(await options("Occasion").filter({ hasText: /^Picnic · 0$/ }).evaluate((el) => el.disabled), "no Chinese recipe suits a picnic: greyed out");
  await page.getByRole("button", { name: "Show all recipes" }).click();
  await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  await page.waitForURL((u) => u.search === "");
  expect((await cuisine.inputValue()) === "", "Show all recipes clears the cuisine and the address");
  // a bad address is read as no choice: an unknown name, a cuisine with too few recipes, an occasion that does not exist
  for (const q of ["?cuisine=klingon&occasion=nope", "?cuisine=japanese", "?cuisine=thai&occasion=easter", "?cuisine=chinese,indian"]) {
    await page.goto(BASE + "/app/recipes" + q);
    await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
    await page.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
    expect((await page.getByRole("combobox", { name: "Cuisine" }).inputValue()) === "" && (await page.getByRole("combobox", { name: "Occasion" }).inputValue()) === "", `${q}: no choice`);
  }
  // a link and a reload keep the choice; Back from a recipe comes back to the same choice
  await page.goto(BASE + "/app/recipes?cuisine=indian");
  await page.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  await status().waitFor();
  const indian = await matchCount();
  expect(indian >= 8 && (await cuisine.inputValue()) === "indian", `?cuisine=indian: ${indian} Indian recipes chosen`);
  expect((await countOf("Cuisine", "Indian")) === indian, "the option and the count line agree");
  await page.reload();
  await status().waitFor();
  expect((await matchCount()) === indian && (await cuisine.inputValue()) === "indian", "kept after a reload");
  const first = page.getByRole("region", { name: /All recipes/ }).locator("a[href*='/app/recipes/view']").first();
  await first.click();
  await page.waitForURL((u) => u.pathname.startsWith("/app/recipes/view"));
  await page.getByRole("button", { name: /^Save to My meals/ }).waitFor();
  await page.goBack();
  await status().waitFor();
  expect((await cuisine.inputValue()) === "indian" && (await matchCount()) === indian, "Back from a recipe finds Indian still chosen");
  // the diet applies: for a vegan the Indian option counts fewer, and says what choosing it shows
  await ctx.close();
  const vegan = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, preferences: { ...baseSettings.preferences, veganOnly: true } } }));
  await vegan.page.goto(BASE + "/app/recipes");
  await vegan.page.getByRole("heading", { name: /All recipes · \d+/ }).waitFor();
  const veganIndian = Number(new RegExp("^Indian · (\\d+)$").exec((await vegan.page.getByRole("combobox", { name: "Cuisine" }).locator("option").allInnerTexts()).map((x) => x.trim()).find((x) => x.startsWith("Indian")) ?? "")?.[1]);
  expect(veganIndian >= 1 && veganIndian < indian, `vegan: fewer Indian recipes (${veganIndian} of ${indian})`);
  await vegan.page.getByRole("combobox", { name: "Cuisine" }).selectOption("indian");
  await vegan.page.getByRole("status").filter({ hasText: /recipes? match$/ }).waitFor();
  expect(Number(/^(\d+)/.exec(await vegan.page.getByRole("status").filter({ hasText: /recipes? match$/ }).innerText())?.[1]) === veganIndian, "the vegan count line equals the option");
  await vegan.ctx.close();
  // an occasion, with the cuisine: AND, and Clear resets both
  const b = await newPage();
  const bp = b.page;
  const bStatus = () => bp.getByRole("status").filter({ hasText: /recipes? match$/ });
  await bp.goto(BASE + "/app/recipes");
  await bp.getByRole("heading", { name: /All recipes · 165/ }).waitFor();
  const occ = (await bp.getByRole("combobox", { name: "Occasion" }).locator("option").allInnerTexts()).map((x) => x.trim());
  const picnic = Number(/^Picnic · (\d+)$/.exec(occ.find((x) => x.startsWith("Picnic")) ?? "")?.[1]);
  expect(picnic >= 8, `Picnic has plenty: ${picnic}`);
  await bp.getByRole("combobox", { name: "Occasion" }).selectOption("picnic");
  await bStatus().waitFor();
  expect(Number(/^(\d+)/.exec(await bStatus().innerText())?.[1]) === picnic, "the Picnic count line equals the option");
  await bp.waitForURL((u) => u.searchParams.get("occasion") === "picnic");
  // Picnic recipes of one cuisine: the option text of that cuisine now counts only the picnic ones, and choosing it gives exactly that
  const me = Number(/^Middle Eastern · (\d+)$/.exec((await bp.getByRole("combobox", { name: "Cuisine" }).locator("option").allInnerTexts()).map((x) => x.trim()).find((x) => x.startsWith("Middle Eastern")) ?? "")?.[1]);
  expect(me >= 1 && me < picnic, `Middle Eastern picnics ${me} of ${picnic}`);
  await bp.getByRole("combobox", { name: "Cuisine" }).selectOption("middle-eastern");
  await bp.waitForURL((u) => u.searchParams.get("occasion") === "picnic" && u.searchParams.get("cuisine") === "middle-eastern");
  expect(Number(/^(\d+)/.exec(await bStatus().innerText())?.[1]) === me, "both together: the Middle Eastern picnics");
  await bp.getByRole("link", { name: /Houmous with vegetable sticks/ }).waitFor();
  await bp.getByRole("button", { name: "Clear" }).click();
  await bp.getByRole("status").filter({ hasText: /^165 recipes$/ }).waitFor();
  expect((await bp.getByRole("combobox", { name: "Cuisine" }).inputValue()) === "" && (await bp.getByRole("combobox", { name: "Occasion" }).inputValue()) === "", "Clear resets both fields");
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

await step("Your supermarkets beside the search: the chosen shops' logos, a tap opens the same list as Settings, every tick is saved at once, Done stays in view and shows a short working moment, Close keeps the ticks, recipes still say Sainsbury's, axe", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const search = page.getByLabel("Search recipes");
  const shops = page.getByRole("button", { name: /^Your supermarkets/ });
  expect((await shops.getAttribute("aria-label")) === "Your supermarkets: Sainsbury's", "label: " + (await shops.getAttribute("aria-label")));
  expect((await search.getAttribute("placeholder")) === "Search recipes", "placeholder: " + (await search.getAttribute("placeholder")));
  const s = await search.boundingBox();
  const b = await shops.boundingBox();
  expect(b.height >= 44 && b.width >= 44, `the button is ${b.width} x ${b.height}`);
  expect(b.x >= s.x + s.width && Math.abs(b.y + b.height / 2 - (s.y + s.height / 2)) < 4, "the button should sit right of the search, on the same line");
  expect(b.x + b.width <= 390, "the button runs off the screen");
  await shops.click();
  const sheet = page.getByRole("dialog", { name: "Your supermarkets" });
  await sheet.waitFor();
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, `the open sheet: ${v.join(", ")}`);
  const tesco = sheet.getByRole("button", { name: /Tesco/ });
  await tesco.click();
  expect((await tesco.getAttribute("aria-pressed")) === "true", "Tesco was not chosen");
  // founder 2026-11-17: the tick is saved at once, and Done is on the screen without scrolling
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.shops);
  expect(JSON.stringify(saved) === JSON.stringify(["sainsburys", "tesco"]), "saved at once: " + JSON.stringify(saved));
  const done = sheet.getByRole("button", { name: "Done" });
  const db = await done.boundingBox();
  expect(db && db.y + db.height <= 844 && db.height >= 44, `Done is in view without scrolling (at ${db && Math.round(db.y)})`);
  await done.click();
  await sheet.getByRole("status").filter({ hasText: /Saving your supermarkets/ }).waitFor({ timeout: 1500 });
  await sheet.getByText("Working out each serving's price and nutrition…").waitFor();
  const t0 = Date.now();
  await sheet.waitFor({ state: "hidden", timeout: 6000 });
  expect(Date.now() - t0 < 4000, "the working moment lasted too long");
  expect((await shops.getAttribute("aria-label")) === "Your supermarkets: Sainsbury's, Tesco", "after: " + (await shops.getAttribute("aria-label")));
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.shops);
  expect(JSON.stringify(stored) === JSON.stringify(["sainsburys", "tesco"]), "stored: " + JSON.stringify(stored));
  await page.reload();
  await page.getByRole("button", { name: "Your supermarkets: Sainsbury's, Tesco" }).click();
  await sheet.getByRole("button", { name: /Asda/ }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await sheet.waitFor({ state: "hidden" });
  expect((await shops.getAttribute("aria-label")) === "Your supermarkets: Sainsbury's, Tesco, Asda", "Close keeps what was ticked: " + (await shops.getAttribute("aria-label")));
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
