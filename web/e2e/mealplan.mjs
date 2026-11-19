// The meal plan (founder 2026-11-18: a third card on Home with Premium on it; Pip asks one thing a screen; several shops; swap any meal for another; add it all to
// the shopping list). Run against a server: BASE=http://localhost:3005 node e2e/mealplan.mjs (a build without Premium switched on shows no Premium gate.)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = (patch = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], ...patch } });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 3).join(" | ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function context(patch) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
    sessionStorage.setItem("seeded", "1");
  }, settings(patch));
  return ctx;
}

const ctx = await context();
const page = await ctx.newPage();

await step("Home's third card is the meal plan, the whole width under the two", async () => {
  await page.goto(BASE + "/app");
  const card = page.getByRole("link", { name: /^Meal plan/ });
  await card.waitFor({ timeout: 120000 });
  const [a, b] = await Promise.all([page.getByRole("link", { name: /^Shopping list/ }).first().boundingBox(), card.boundingBox()]);
  expect(b.y >= a.y + a.height - 1, "under the two cards");
  expect(b.width > 300 && b.height >= 44, `the whole width, a big target: ${JSON.stringify(b)}`);
  await card.click();
  await page.waitForURL((u) => u.pathname.startsWith("/app/plan"));
});

await step("Pip asks one thing a screen: numbers, meals and snacks, diet, foods, shops (two chosen)", async () => {
  await page.getByText("Step 1 of 6").waitFor({ timeout: 60000 });
  await page.getByRole("heading", { level: 1, name: "Your daily numbers" }).waitFor();
  expect(await page.evaluate(() => document.activeElement?.tagName === "H1"), "the headline has the focus");
  await page.getByRole("button", { name: "Continue" }).click();
  // meals and snacks (founder 2026-11-18: "how many meals and how many snacks they want a day as well")
  await page.getByRole("heading", { level: 1, name: "Your meals and snacks" }).waitFor();
  for (const m of ["Breakfast", "Lunch", "Dinner"]) expect((await page.getByRole("button", { name: m, exact: true }).getAttribute("aria-pressed")) === "true", `${m} starts chosen`);
  for (const m of ["Breakfast", "Lunch", "Dinner"]) await page.getByRole("button", { name: m, exact: true }).click();
  await page.getByText("Pick at least one meal.").waitFor();
  expect(await page.getByRole("button", { name: "Continue" }).isDisabled(), "no meals: can't go on");
  for (const m of ["Breakfast", "Lunch", "Dinner"]) await page.getByRole("button", { name: m, exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).click();
  await page.getByText(/^2 snacks$/).waitFor();
  await page.getByText(/^about \d+ kcal each$/).waitFor();
  // how often a meal comes round (founder 2026-11-18: "they can choose if they want any foods repeated")
  expect((await page.getByRole("radio", { name: /^Some repeats/ }).getAttribute("aria-checked")) === "true", "some repeats to start with");
  await page.getByRole("radio", { name: /^Meal prep/ }).click();
  expect((await page.getByRole("radio", { name: /^Meal prep/ }).getAttribute("aria-checked")) === "true", "meal prep chosen");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { level: 1, name: "Your diet and allergies" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { level: 1, name: "Foods you'd rather not have" }).waitFor();
  await page.getByRole("button", { name: "Mushrooms", exact: true }).click();
  expect((await page.getByRole("button", { name: "Mushrooms", exact: true }).getAttribute("aria-pressed")) === "true", "Mushrooms chosen");
  // Pip says what's left as they tap, and won't go on with a meal that has none (founder 2026-11-18: "we won't be able to give them a plan if they are so picky?")
  await page.getByRole("status").filter({ hasText: /I can choose from \d+ breakfasts, \d+ lunches, \d+ dinners and \d+ snacks/ }).waitFor();
  for (const w of ["avocado", "oats", "bread", "yoghurt", "milk", "banana", "toast", "porridge", "granola", "berries", "pancake", "muffin"]) {
    await page.getByRole("textbox", { name: "Another food to leave out" }).fill(w);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  const status = await page.getByRole("status").filter({ hasText: /breakfast|choose from/ }).first().innerText();
  if (/no breakfast recipes left/.test(status)) {
    expect(await page.getByRole("button", { name: "Continue" }).isDisabled(), "Continue stops with a meal that has none");
  }
  for (const w of ["avocado", "oats", "bread", "yoghurt", "milk", "banana", "toast", "porridge", "granola", "berries", "pancake", "muffin"]) await page.getByRole("button", { name: w, exact: true }).click();
  await page.getByRole("status").filter({ hasText: /I can choose from/ }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { level: 1, name: "Where you shop" }).waitFor();
  const sains = page.getByRole("checkbox", { name: /Sainsbury/ });
  await sains.waitFor({ timeout: 60000 });
  expect((await sains.getAttribute("aria-checked")) === "true", "the person's own shop starts chosen");
  await page.getByText(/^Everything will come from Sainsbury's: one shop, one shopping list/).waitFor();
  await page.getByRole("status").filter({ hasText: /With one shop/ }).filter({ hasText: /real Sainsbury's product/ }).waitFor();
  await page.getByRole("checkbox", { name: /Morrisons/ }).click();
  await page.getByText(/^I'll share your meals between Sainsbury's and Morrisons, using the best shop for each meal/).waitFor();
  await page.getByRole("status").filter({ hasText: /With 2 shops/ }).filter({ hasText: /split by shop/ }).waitFor();
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 100)}`));
  expect(v.length === 0, v.join(" | "));
  await page.getByRole("button", { name: "Continue" }).click();
});

await step("the budget slider: from the cheapest week for the goal to better products, a green spot at the best fit, the plain line follows the slider", async () => {
  await page.getByRole("heading", { level: 1, name: "Your budget for the week" }).waitFor();
  const slider = page.getByRole("slider", { name: "Budget for the week" });
  await slider.waitFor({ timeout: 180000 });
  const [min, max, now] = await Promise.all(["min", "max", "value"].map((a) => slider.evaluate((el, a) => Number(el[a]), a)));
  expect(min < max && now >= min && now <= max, `range ${min}-${max}, at ${now}`);
  await page.getByText("The green spot: the best week for your goal.").waitFor();
  for (const w of ["Cheapest", "Best fit", "Better products"]) await page.getByText(w, { exact: true }).first().waitFor();
  expect(/^£\d+ a week$/.test(await slider.getAttribute("aria-valuetext")), "VoiceOver hears the amount");
  await slider.focus();
  await page.keyboard.press("End");
  await page.getByText("Better products wherever your shops have them.").waitFor();
  await page.keyboard.press("Home");
  await page.getByText(/^The cheapest week for your goal/).waitFor();
  await page.getByRole("button", { name: /^Back to the green spot/ }).click();
  await page.getByText("The green spot: the best week for your goal.").waitFor();
  const box = await slider.boundingBox();
  expect(box.height >= 44, "a big target");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Make my plan" }).click();
});

await step("making the plan: Pip shows each step with its real figure for about ten seconds, then the week opens", async () => {
  const began = Date.now();
  await page.getByRole("heading", { level: 1, name: "Making your plan" }).waitFor({ timeout: 30000 });
  await page.locator("li").filter({ hasText: /^Reading \d+ recipes that suit your diet/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Looking through [\d,]+ products at Sainsbury's and Morrisons/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Planning the packs so \d+% of the fresh food gets eaten/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Writing your shopping list: \d+ products/ }).waitFor();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 30000 });
  const took = Date.now() - began;
  expect(took >= 8000 && took <= 20000, `took ${took} ms`);
});

await step("the week: 21 meals from the two shops, a shop on each meal, the shopping per shop with totals", async () => {
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 120000 });
  await page.getByText(/for the week's shopping/).waitFor();
  const days = page.getByRole("radiogroup", { name: "Day" }).getByRole("radio");
  expect((await days.count()) === 7, "seven days");
  const meals = page.locator("section[aria-labelledby='day-h'] li");
  expect((await meals.count()) === 5, "three meals and two snacks a day");
  const labels = await page.locator("section[aria-labelledby='day-h'] li > p").allInnerTexts();
  expect(labels.map((x) => x.toLowerCase()).join() === "breakfast,lunch,dinner,snack 1,snack 2", `slots: ${labels.join(", ")}`);
  const buy = page.locator("section[aria-labelledby='buy-h'] h3");
  const shops = await buy.allInnerTexts();
  expect(shops.length >= 1 && shops.every((s) => /Sainsbury|Morrisons/.test(s)), `shops: ${shops.join(", ")}`);
  expect(await page.getByText(/ total$/).count() === shops.length, "a total for each shop");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  expect(stored.shops.join() === "sainsburys,morrisons" && typeof stored.budget === "number" && stored.leaveOut.join() === "mushrooms", JSON.stringify(stored).slice(0, 200));
  expect(JSON.stringify(stored.slots) === JSON.stringify(["breakfast", "lunch", "dinner", "snack", "snack"]), `slots kept: ${JSON.stringify(stored.slots)}`);
  expect(stored.variety === 2, `variety kept: ${stored.variety}`);
  // meal prep: two recipes for each meal over the week
  const breakfasts = new Set(stored.ids.map((d) => d[0]));
  expect(breakfasts.size === 2, `breakfast recipes: ${breakfasts.size}`);
  await page.getByText(/^\d+% of the fresh food you buy is eaten this week\./).waitFor();
  // every product to buy has its picture (or the quiet "no photo" tile) and opens the product
  const rows = page.locator("section[aria-labelledby='buy-h'] ul > li > a");
  const pictures = page.locator("section[aria-labelledby='buy-h'] ul > li > a img");
  await pictures.first().waitFor({ timeout: 30000 });
  expect((await rows.count()) > 5 && (await pictures.count()) > 0, `rows ${await rows.count()}, pictures ${await pictures.count()}`);
  expect(/\/app\/groceries\/shop\/item\?r=/.test(await rows.first().getAttribute("href")), "a row opens the product");
});

await step("swap a meal: a list of other recipes for that meal, the one tapped takes its place", async () => {
  const first = page.locator("section[aria-labelledby='day-h'] li").first();
  const before = await first.locator("a span.font-bold").first().innerText();
  await first.getByRole("button", { name: "Swap this meal" }).click();
  const sheet = page.getByRole("dialog", { name: /^Swap breakfast/ });
  await sheet.waitFor();
  const options = sheet.getByRole("button").filter({ hasText: /kcal/ });
  expect((await options.count()) >= 3, `choices: ${await options.count()}`);
  const pick = (await options.nth(1).innerText()).split("\n")[0];
  await options.nth(1).click();
  await sheet.waitFor({ state: "hidden" });
  const after = await page.locator("section[aria-labelledby='day-h'] li").first().locator("a span.font-bold").first().innerText();
  expect(after === pick && after !== before, `swapped from ${before} to ${pick}: now ${after}`);
});

await step("add all to the shopping list, then the list holds them", async () => {
  await page.getByRole("button", { name: "Add all to my shopping list" }).click();
  await page.getByText(/^Added \d+ products to your shopping list\./).waitFor();
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping")).data.length);
  expect(n > 5, `items on the list: ${n}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
});

await step("the plan opens again as it was; Make a new plan starts Pip's questions with the answers kept", async () => {
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 120000 });
  // "Make a new plan" is at the top of the plan now (founder 2026-11-19), and again at the foot
  const top = page.getByRole("button", { name: "Make a new plan" }).first();
  const box = await top.boundingBox();
  expect(box && box.y < 400, "Make a new plan is near the top: " + JSON.stringify(box));
  await top.click();
  await page.getByText("Step 1 of 6").waitFor();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  expect((await page.getByRole("button", { name: "Mushrooms", exact: true }).getAttribute("aria-pressed")) === "true", "foods kept");
  await page.getByRole("button", { name: "Keep my plan" }).click();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor();
});

await step("a new plan keeps the old one under Earlier plans; Open makes it the plan again; Remove takes one away with Undo", async () => {
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  await page.getByRole("button", { name: "Make a new plan" }).first().click();
  await page.getByText("Step 1 of 6").waitFor();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("slider").waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "Make my plan" }).click();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 30000 });
  const earlier = page.locator("section[aria-labelledby='earlier-h']");
  await earlier.waitFor();
  expect((await earlier.locator("li").count()) === 1, "one earlier plan");
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.earlierPlans")).data);
  expect(kept.length === 1 && JSON.stringify(kept[0].ids) === JSON.stringify(first.ids), "the old plan is the earlier one");
  // Open: the old plan is followed again, and the newer one takes its place among the earlier ones
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  await earlier.getByRole("button", { name: "Open this plan" }).click();
  await page.waitForFunction((ids) => JSON.stringify(JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data.ids) === ids, JSON.stringify(first.ids));
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.earlierPlans")).data);
  expect(after.length === 1 && JSON.stringify(after[0].ids) === JSON.stringify(second.ids), "the newer plan went to the earlier ones");
  // Remove, then Undo
  await earlier.getByRole("button", { name: "Remove" }).click();
  await page.getByText("Plan removed.").waitFor();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.earlierPlans")).data.length)) === 0, "removed");
  await page.getByRole("button", { name: "Undo" }).click();
  await earlier.locator("li").first().waitFor();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.earlierPlans")).data.length)) === 1, "Undo put it back");
});

await ctx.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
