// Recipes from your shop: list (100 recipes: meal chips, search, paging), filters, sort, a recipe with swap, substitutes and "add all to my
// list", the list's price total, Home's four tiles, Pip's recipe maker (Pro only), axe.
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
const AI_ANSWER = { name: "Chicken and bean rice", blurb: "A warming one-pot dinner.", servings: 2, minutes: 35, ingredients: [{ key: "chicken", amount: 300, role: "protein" }, { key: "kidney-beans", amount: 240, role: "other" }, { key: "chopped-tomatoes", amount: 400, role: "other" }, { key: "rice", amount: 150, role: "carb" }], method: ["Cook the rice as the pack says.", "Brown the chicken until cooked through with no pink left.", "Stir in the tomatoes and beans and simmer for 10 minutes."], extras: ["Smoked paprika"] };
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

await step("recipes list: 100 recipes priced at Sainsbury's, 24 at a time, meal chips, search, meat-free filter, sort by price", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Every ingredient is a real product at Sainsbury's/).waitFor();
  const cards = page.locator("a[href*='/app/recipes/view']");
  await cards.first().waitFor();
  await page.getByRole("heading", { name: /All recipes · 100/ }).waitFor();
  await page.getByRole("status").filter({ hasText: /^100 recipes$/ }).waitFor();
  expect((await cards.count()) === 24, `24 shown first, got ${await cards.count()}`);
  await page.getByRole("button", { name: "Show more recipes (76 more)" }).click();
  expect((await cards.count()) === 48, `48 after Show more, got ${await cards.count()}`);
  await page.getByRole("group", { name: "Which meal" }).getByRole("button", { name: "Snacks" }).click();
  await page.getByRole("status").filter({ hasText: /^11 recipes match$/ }).waitFor();
  await page.getByRole("group", { name: "Which meal" }).getByRole("button", { name: "Breakfast" }).click();
  await page.getByRole("status").filter({ hasText: /^20 recipes match$/ }).waitFor();
  await page.getByRole("group", { name: "Which meal" }).getByRole("button", { name: "Any meal" }).click();
  await page.getByLabel("Search recipes").fill("curry");
  await page.getByRole("link", { name: /Chicken curry/ }).first().waitFor();
  const curries = await cards.count();
  expect(curries >= 5 && curries < 15, `a handful of curries, got ${curries}`);
  await page.getByLabel("Search recipes").fill("zzzz");
  await page.getByText("No recipes match.").waitFor();
  await page.getByRole("button", { name: "Show all recipes" }).click();
  await page.getByRole("status").filter({ hasText: /^100 recipes$/ }).waitFor();
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "No meat or fish" }).click();
  const m = Number(/^(\d+) recipes match$/.exec((await page.getByRole("status").filter({ hasText: /recipes match$/ }).innerText()).trim())?.[1]);
  expect(m >= 30 && m < 100, `30+ meat-free recipes, got ${m}`);
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
  const cards = page.locator("a[href*='/app/recipes/view']");
  await cards.first().waitFor();
  await page.getByRole("radio", { name: /^Small, 400 kcal/ }).click();
  await page.getByText("Each recipe is fitted to about 400 kcal a serving.").waitFor();
  await page.getByRole("radio", { name: /^More protein/ }).click();
  await page.getByText("Each recipe is fitted to about 400 kcal and 30 g protein a serving.").waitFor();
  const first = (await cards.first().innerText()).replace(/\n/g, " ");
  const kcal = Number(/(\d[\d,]*) kcal/i.exec(first)?.[1]?.replace(",", "") ?? /(\d+)\s*KCAL/.exec(first)?.[1]);
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

await step("a fitted recipe shows the full label and can be seen as written", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByRole("heading", { name: "Full nutrition per serving" }).waitFor();
  for (const row of ["Energy", "Fat", "of which saturates", "Carbohydrate", "of which sugars", "Fibre", "Protein", "Salt"]) await page.getByRole("term").filter({ hasText: new RegExp(`^${row}$`) }).first().waitFor();
  await page.getByText(/The amounts below are changed to fit\./).waitFor();
  const chicken = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
  const fitted = await chicken.innerText();
  await page.getByRole("button", { name: "Show it as written" }).click();
  await page.getByText("Showing the recipe as written.").waitFor();
  const written = await chicken.innerText();
  expect(written.startsWith("300 g"), `as written: 300 g chicken, got ${written.slice(0, 30)}`);
  expect(fitted !== written, "fitting changed the chicken amount");
  await ctx.close();
});

await step("halal: chicken recipes use halal-named chicken, others are left out and said so", async () => {
  const { ctx, page } = await newPage("light", JSON.stringify({ v: 1, data: { ...baseSettings, preferences: { ...baseSettings.preferences, halalOnly: true } } }));
  await page.goto(BASE + "/app/recipes");
  await page.getByText(/Your diet:/).waitFor();
  await page.getByText("Halal", { exact: false }).first().waitFor();
  await page.getByText(/recipes? (is|are) left out for your diet/).waitFor();
  expect((await page.getByRole("link", { name: /Turkey bolognese/ }).count()) === 0, "turkey left out for halal");
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByText(/Halal chicken breast fillets/).waitFor();
  await page.getByRole("link", { name: /Halal/ }).first().waitFor();
  await page.getByText(/check each pack before you buy/).waitFor();
  await ctx.close();
});

await step("Ask Pip is Pro: the card opens the paywall, the page offers Pro", async () => {
  const { ctx, page } = await newPage();
  await page.route("**/api/v1/recipe", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true }) }));
  await page.goto(BASE + "/app/recipes");
  const card = page.getByRole("button", { name: /Ask Pip to make a recipe/ });
  await card.getByText("Pro", { exact: true }).waitFor();
  await card.click();
  const paywall = page.getByRole("dialog");
  await paywall.getByText("Pip makes new recipes just for you").waitFor();
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/recipes/make?r=sainsburys");
  await page.getByText(/Making a new recipe just for you is part of Menu Math Pro/).waitFor();
  expect((await page.getByRole("button", { name: "Make my recipe" }).count()) === 0, "no maker for free users");
  await page.getByRole("button", { name: "See Pro" }).click();
  await page.getByRole("dialog").getByText("Pip makes new recipes just for you").waitFor();
  await ctx.close();
});

await step("Ask Pip (Pro): big buttons, what is sent, the recipe from real products, save it, and an honest error", async () => {
  const { ctx, page } = await newPage("light", proSettings);
  let sent = null;
  let fail = false;
  await page.route("**/api/v1/recipe", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true }) });
    sent = JSON.parse(r.request().postData() ?? "{}");
    await new Promise((res) => setTimeout(res, 400));
    return fail ? r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "no_recipe", message: "Pip couldn't make a recipe this time. Please try again, maybe with different words." }) }) : r.fulfill({ contentType: "application/json", body: JSON.stringify({ recipe: AI_ANSWER }) });
  });
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("button", { name: /Ask Pip to make a recipe/ }).click();
  await page.getByRole("heading", { level: 1, name: "Ask Pip" }).waitFor();
  await page.getByRole("radio", { name: "Dinner" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "Comfort food" }).click();
  await page.getByText(/Pip uses AI from Anthropic/).waitFor();
  await page.getByRole("button", { name: "Make my recipe" }).click();
  await page.getByText("I'm writing your recipe now…").waitFor();
  await page.getByRole("heading", { level: 1, name: "Chicken and bean rice" }).waitFor({ timeout: 15000 });
  expect(JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(["diet", "meal", "pantry", "servings", "shop", "target", "wish"]), `only the choices are sent, got ${Object.keys(sent)}`);
  expect(sent.meal === "dinner" && sent.servings === 2 && sent.wish === "Comfort food" && sent.target.kcal === 700 && sent.target.protein === 55, `choices sent: ${JSON.stringify({ ...sent, pantry: sent.pantry.length })}`);
  expect(sent.pantry.length > 20 && sent.pantry.every((p) => p.key && p.product && typeof p.kcal === "number"), "the pantry of real products");
  await page.getByText("Made by Pip").first().waitFor();
  await page.getByText(/Pip wrote this recipe with AI from real products/).waitFor();
  await page.getByRole("heading", { name: "Full nutrition per serving" }).waitFor();
  await page.getByRole("button", { name: "Save this recipe" }).click();
  await page.getByText("Saved to Your recipes.").waitFor();
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("heading", { name: "Your recipes" }).waitFor();
  await page.getByRole("link", { name: /Made by Pip.*Chicken and bean rice/s }).click();
  await page.getByRole("heading", { level: 1, name: "Chicken and bean rice" }).waitFor();
  fail = true;
  await page.goto(BASE + "/app/recipes/make?r=sainsburys");
  await page.getByRole("button", { name: "Make my recipe" }).click();
  await page.getByText(/Pip couldn't make a recipe this time/).waitFor({ timeout: 15000 });
  await ctx.close();
});

for (const scheme of ["light", "dark"]) {
  await step(`axe: recipes list and a recipe (${scheme})`, async () => {
    const { ctx, page } = await newPage(scheme, proSettings);
    await page.route("**/api/v1/recipe", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true }) }));
    for (const path of ["/app/recipes", "/app/recipes/view?id=chickpea-curry&r=sainsburys", "/app/recipes/make?r=sainsburys"]) {
      await page.goto(BASE + path);
      await page.locator(path.includes("view") ? "text=How to make it" : path.includes("make") ? "text=Make my recipe" : "a[href*='/app/recipes/view']").first().waitFor();
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
