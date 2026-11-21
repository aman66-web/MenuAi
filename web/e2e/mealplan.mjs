// The meal plan (founder 2026-11-18: a third card on Home with Premium on it; Pip asks one thing a screen; several shops; swap any meal for another; add it all to
// the shopping list). The first open, with no plan yet, starts on the check screen filled in from the person's settings, "Who's eating: Just me" first (the
// onboarding meeting, 20 November 2026), and its Make my plan makes the same week PremiumIntro shows; a GLP-1 meal cap is explained, never "your day adds up".
// Since the 30-person audit (20 November 2026) a step opened from the check screen's Change is that one step: its button says Done and goes back to the check
// (one change, one screen); "Make a new plan" still walks every step from the first with Continue.
// Run against a server: BASE=http://localhost:3005 node e2e/mealplan.mjs (a build without Premium switched on shows no Premium gate.)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
// the style step's screenshots (402 x 874 and 375 x 667) go here; SHOTS=<folder> to choose another
const SHOTS = process.env.SHOTS ?? "/tmp";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
// devProOverride: a build with Premium switched on lets this tester in (the dev server's Premium preview); a build without it ignores it
const settings = (patch = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, devProOverride: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], ...patch } });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 3).join(" | ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
/** The week's two figures (founder 2026-11-20): "Your first shop: about £N" and "Each week after: about £M", as numbers, from within `scope`. */
async function twoWeeks(scope, timeout = 60000) {
  const first = scope.getByText(/^Your first shop: about £[\d,]+$/);
  await first.first().waitFor({ timeout });
  const pounds = async (l) => Number((await l.first().innerText()).replace(/[^\d]/g, ""));
  return { first: await pounds(first), after: await pounds(scope.getByText(/^Each week after: about £[\d,]+$/)), why: await scope.getByText(/^It includes .+(, which last for weeks| that last for weeks)\.$/).first().innerText() };
}
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

await step("Home: the meal plan is a row of its own across the width, under the day's numbers, then Cook with what you already have under it (founder 2026-11-19: \"the meal plan is a big thing it should have its own row\")", async () => {
  await page.goto(BASE + "/app");
  const card = page.getByRole("link", { name: /^Meal plan/ });
  await card.waitFor({ timeout: 120000 });
  const [n, b, a] = await Promise.all([page.locator('[data-coach="home-numbers"]').boundingBox(), card.boundingBox(), page.getByRole("link", { name: /^Cook with what you already have/ }).boundingBox()]);
  expect(b.y >= n.y + n.height - 1, "under the day's numbers");
  expect(b.width > 300 && b.height >= 44, `the whole width, a big target: ${JSON.stringify(b)}`);
  expect(a.y >= b.y + b.height - 1 && a.width > 300, `Cook with what you already have is the next row: ${JSON.stringify([b, a])}`);
  expect((await card.innerText()).includes("7 days of meals for your goal, with one shopping list."), "the card says what it does");
  await card.click();
  await page.waitForURL((u) => u.pathname.startsWith("/app/plan"));
});

await step("the first open starts on the check screen, filled in from the person's settings: Who's eating: Just me first, their shop, no budget; Back goes Home; axe", async () => {
  await page.getByRole("heading", { level: 1, name: "Ready to make your plan?" }).waitFor({ timeout: 60000 });
  expect(await page.evaluate(() => document.activeElement?.tagName === "H1"), "the headline has the focus");
  expect((await page.getByText(/^Step \d+ of \d+$/).count()) === 0, "no step count on a first open");
  const rows = page.locator("main ul li");
  const first = await rows.first().innerText();
  expect(/^Who's eating\s+Just me\s+Change$/.test(first.trim()), "Who's eating first: " + first);
  await page.locator("main ul li", { hasText: "Where you shop" }).getByText("Sainsbury's", { exact: true }).waitFor({ timeout: 60000 });
  await page.getByText("No budget: the best week for your goal", { exact: true }).waitFor();
  // the week Make my plan would make, its first shop and each week after, under the budget row (founder 2026-11-20)
  const budgetRow = page.locator("main ul li", { hasText: "Your budget" });
  const w = await twoWeeks(budgetRow, 180000);
  expect(w.first > w.after && w.after > 0, "the check screen's two figures: " + JSON.stringify(w));
  expect((await budgetRow.getByText(/budget\.$/).count()) === 0, "a budget line with no budget");
  await page.getByText(/^I've filled this in from your settings\./).waitFor();
  expect((await page.getByRole("link", { name: /^Back/ }).getAttribute("href")) === "/app", "Back goes Home, not to a step");
  await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180000 });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 100)}`));
  expect(v.length === 0, v.join(" | "));
});

/** A line's Change on the check screen: that one step, "Step n of 9" (heard, not written, since 20 November 2026: the bar alone), whose button says Done and goes
 *  back to the check. Just me has nine steps since the style step (How do you like to eat?) of 20 November 2026. */
async function change(line, heading, n) {
  await page.getByRole("heading", { level: 1, name: "Ready to make your plan?" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: `Change: ${line}` }).click();
  await page.getByText(`Step ${n} of 9`).waitFor({ timeout: 60000 });
  expect(await page.getByText(`Step ${n} of 9`).evaluate((el) => el.classList.contains("sr-only")), "'Step n of N' is written on screen");
  await page.getByRole("heading", { level: 1, name: heading }).waitFor();
}
const done = async () => {
  await page.getByRole("button", { name: "Done", exact: true }).last().click();
  await page.getByRole("heading", { level: 1, name: "Ready to make your plan?" }).waitFor({ timeout: 60000 });
};

await step("Pip asks one thing a screen, each opened by its Change and back with Done: how many people (Just me), meals and snacks, shops (two chosen), diet, the food you like, foods", async () => {
  await change("Who's eating", "How many people are you cooking for?", 1);
  expect(await page.evaluate(() => document.activeElement?.tagName === "H1"), "the headline has the focus");
  expect((await page.getByRole("radio", { name: "Just me" }).getAttribute("aria-checked")) === "true", "Just me to begin with");
  expect((await page.getByRole("button", { name: "Back to the check screen" }).count()) === 1, "Back goes to the check screen");
  await done();
  // meals and snacks (founder 2026-11-18: "how many meals and how many snacks they want a day as well")
  await change("Meals and snacks", "Your meals and snacks", 2);
  for (const m of ["Breakfast", "Lunch", "Dinner"]) expect((await page.getByRole("button", { name: m, exact: true }).getAttribute("aria-pressed")) === "true", `${m} starts chosen`);
  for (const m of ["Breakfast", "Lunch", "Dinner"]) await page.getByRole("button", { name: m, exact: true }).click();
  await page.getByText("Pick at least one meal.").first().waitFor(); // said above the meals and again as the reason over the greyed button
  expect(await page.getByRole("button", { name: "Done", exact: true }).last().isDisabled(), "no meals: can't go on");
  for (const m of ["Breakfast", "Lunch", "Dinner"]) await page.getByRole("button", { name: m, exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).click();
  await page.getByText(/^2 snacks$/).waitFor();
  await page.getByText(/^about \d+ kcal each$/).waitFor();
  // how often a meal comes round (founder 2026-11-18: "they can choose if they want any foods repeated")
  expect((await page.getByRole("radio", { name: /^Some repeats/ }).getAttribute("aria-checked")) === "true", "some repeats to start with");
  await page.getByRole("radio", { name: /^Meal prep/ }).click();
  expect((await page.getByRole("radio", { name: /^Meal prep/ }).getAttribute("aria-checked")) === "true", "meal prep chosen");
  await done();
  await change("Where you shop", "Where you shop", 3);
  const sains = page.getByRole("checkbox", { name: /Sainsbury/ });
  await sains.waitFor({ timeout: 60000 });
  expect((await sains.getAttribute("aria-checked")) === "true", "the person's own shop starts chosen");
  await page.getByText(/^Everything from Sainsbury's\. Pick another to share the meals\./).waitFor();
  await page.getByRole("status").filter({ hasText: /With one shop/ }).filter({ hasText: /real Sainsbury's product/ }).waitFor();
  await page.getByRole("checkbox", { name: /Morrisons/ }).click();
  await page.getByText(/^I'll share your meals between Sainsbury's and Morrisons\./).waitFor();
  await page.getByRole("status").filter({ hasText: /With 2 shops/ }).filter({ hasText: /split by shop/ }).waitFor();
  // Pip pops up again when his words change: axe reads the bubble once it has landed (half-faded words read as low contrast)
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 100)}`));
  expect(v.length === 0, v.join(" | "));
  await done();
  await change("Your diet and allergies", "Your diet and allergies", 4);
  await done();
  // how they like to eat (founder 2026-11-20): a picture tile for every style (22:00, "as many options as you can think about people would choose"), Balanced
  // first and to start with, Longevity second (22:25, his own pick), never the same picture twice, none greyed at Sainsbury's with no diet; High protein
  // chosen, then Longevity, then Balanced again
  await change("How you like to eat", "How do you like to eat?", 5);
  const styles = page.getByRole("radiogroup", { name: "How do you like to eat?" }).getByRole("radio");
  expect((await styles.count()) === 15, "fifteen ways to eat: " + (await styles.count()));
  expect((await styles.nth(0).innerText()).startsWith("Balanced") && (await styles.nth(1).innerText()).startsWith("Longevity"), "Balanced, then Longevity");
  expect((await page.getByRole("radio", { name: /^Balanced/ }).getAttribute("aria-checked")) === "true", "Balanced to start with");
  for (const [name, line] of [["Longevity", "Vegetables, beans, nuts, olive oil and fish"], ["Keto", "Carbs: at most 10% of calories"], ["Pescatarian", "fish, no meat"], ["Quick", "Ready in 20 minutes or less"], ["Lower salt", "Salt: at most 1 g a meal"]]) {
    await page.getByRole("radio", { name: new RegExp(`^${name}`) }).getByText(line, { exact: true }).waitFor();
  }
  const pictures = await page.getByRole("radiogroup", { name: "How do you like to eat?" }).locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  expect(pictures.length === 15 && new Set(pictures).size === pictures.length, "a picture on every tile, never one twice: " + pictures.join(" "));
  await page.waitForTimeout(3000);
  expect((await page.locator('[role="radio"][aria-disabled="true"]').count()) === 0, "nothing greyed at Sainsbury's with no diet");
  await page.setViewportSize({ width: 402, height: 874 });
  await page.screenshot({ path: `${SHOTS}/style-402x874.png` });
  // on a short phone (375 x 667) the pictures are flatter: the first row shows whole above the pinned Done, and the last tile scrolls up clear of it
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/style-375x667.png` });
  const band = async () => page.getByRole("button", { name: "Done", exact: true }).last().evaluate((el) => el.closest(".sticky").getBoundingClientRect().top);
  const second = await styles.nth(1).boundingBox();
  expect(second.y + second.height <= (await band()) + 0.5, `the first row shows whole above the pinned Done at 375 x 667: ${JSON.stringify(second)}`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/style-375x667-end.png` });
  const lowest = await styles.last().boundingBox();
  expect(lowest.y + lowest.height <= (await band()) + 0.5, `the last tile scrolls clear of the pinned Done at 375 x 667: ${JSON.stringify(lowest)}`);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 375, "no sideways scroll at 375: " + width);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: /^High protein/ }).click();
  expect((await page.getByRole("radio", { name: /^High protein/ }).getAttribute("aria-checked")) === "true", "High protein chosen");
  await page.getByRole("radio", { name: /^Longevity/ }).click();
  expect((await page.getByRole("radio", { name: /^Longevity/ }).getAttribute("aria-checked")) === "true", "Longevity chosen");
  await page.getByRole("radio", { name: /^Balanced/ }).click();
  await done();
  // the food they like (founder 2026-11-19: "choose the cuisine or have the option to do any cuisine"): Any to start with, then Italian and Indian
  await change("The food you like", "The food you like", 6);
  expect((await page.getByRole("button", { name: "Any", exact: true }).getAttribute("aria-pressed")) === "true", "Any to start with");
  await page.getByRole("button", { name: /^Italian/ }).click();
  await page.getByRole("button", { name: /^Indian/ }).click();
  await page.getByText(/^Lunches and dinners from Italian or Indian\./).waitFor();
  expect((await page.getByRole("button", { name: "Any", exact: true }).getAttribute("aria-pressed")) === "false", "Any is off once a cuisine is chosen");
  await done();
  await change("Foods left out", "Foods you'd rather not have", 7);
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
    expect(await page.getByRole("button", { name: "Done", exact: true }).last().isDisabled(), "the button stops with a meal that has none");
  }
  for (const w of ["avocado", "oats", "bread", "yoghurt", "milk", "banana", "toast", "porridge", "granola", "berries", "pancake", "muffin"]) await page.getByRole("button", { name: w, exact: true }).click();
  await page.getByRole("status").filter({ hasText: /I can choose from/ }).waitFor();
  await done();
});

await step("the budget slider: from the cheapest week for the goal to pricier products, a green spot at the best fit, the plain line follows the slider", async () => {
  await change("Your budget", "Your budget for the week", 8);
  const slider = page.getByRole("slider", { name: "Budget for the week" });
  await slider.waitFor({ timeout: 180000 });
  const [min, max, now] = await Promise.all(["min", "max", "value"].map((a) => slider.evaluate((el, a) => Number(el[a]), a)));
  expect(min < max && now >= min && now <= max, `range ${min}-${max}, at ${now}`);
  await page.getByText("The green spot: the best week for your goal.").waitFor();
  for (const w of ["Cheapest", "Best fit", "Pricier products"]) await page.getByText(w, { exact: true }).first().waitFor(); // "pricier", never "better" (CLAUDE.md rule 3)
  expect(/^£\d+ a week$/.test(await slider.getAttribute("aria-valuetext")), "VoiceOver hears the amount");
  await slider.focus();
  await page.keyboard.press("End");
  await page.getByText("Pricier products wherever your shops have them.").waitFor();
  await page.keyboard.press("Home");
  await page.getByText(/^The cheapest week for your goal/).waitFor();
  await page.getByRole("button", { name: /^Back to the green spot/ }).click();
  await page.getByText("The green spot: the best week for your goal.").waitFor();
  const box = await slider.boundingBox();
  expect(box.height >= 44, "a big target");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Done", exact: true }).last().click();
  // the check screen (the 20-agent meeting, 2026-11-19): everyone sees it, Just me too, with Change on every line
  await page.getByRole("heading", { level: 1, name: "Ready to make your plan?" }).waitFor();
  expect((await page.locator("main ul li").first().innerText()).includes("Just me"), "Who's eating: Just me, first");
  expect((await page.getByRole("button", { name: /^Change: / }).count()) >= 6, "a Change on every line");
  // with a budget: the two figures and where they sit against it, in a few words
  const budgetRow = page.locator("main ul li", { hasText: "Your budget" });
  const w = await twoWeeks(budgetRow, 180000);
  expect(w.first > w.after, "the check screen's two figures: " + JSON.stringify(w));
  await budgetRow.getByText(/^(Both are within your £\d+ budget\.|Only your first shop is over your £\d+ budget\.|£[\d.]+ over your £\d+ budget: the cheapest week our recipes allow\.)$/).waitFor();
  await page.getByRole("button", { name: "Make my plan" }).click();
});

await step("making the plan: Pip shows each step with its real figure for about 20 seconds (founder 2026-11-20), then the week opens", async () => {
  const began = Date.now();
  await page.getByRole("heading", { level: 1, name: "Making your plan" }).waitFor({ timeout: 30000 });
  await page.locator("li").filter({ hasText: /^Reading \d+ recipes that suit your diet/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Looking through [\d,]+ products at Sainsbury's and Morrisons/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Planning the packs so \d+% of the fresh food gets eaten/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Writing your shopping list: \d+ products/ }).waitFor();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 45000 });
  const took = Date.now() - began;
  expect(took >= 17000 && took <= 32000, `took ${took} ms`);
});

await step("the week: 21 meals from the two shops, a shop on each meal, the shopping per shop with totals", async () => {
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 120000 });
  // the money card's headline: the first shop and each week after (founder 2026-11-20), where they sit against the budget, and what lasts
  const w = await twoWeeks(page);
  expect(w.first > w.after && w.after > 0, "the two figures: " + JSON.stringify(w));
  expect((await page.getByText(/for the week's shopping/).count()) === 0, "the one figure as well as the two");
  // no Pip on the money card (founder 2026-11-20: "keep him as the guide, not the decoration")
  const money = page.locator("div").filter({ has: page.getByText(/^Your first shop: about £/) }).filter({ hasText: /budget/ }).last();
  await money.getByText(/^(Both are within your £\d+ budget\.|Only your first shop is over your £\d+ budget\.|£[\d.]+ over your £\d+ budget(: the cheapest week our recipes allow| with your swaps)\.)$/).waitFor();
  expect((await money.locator("svg, img").count()) === 0, "no Pip on the money card");
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
  expect(JSON.stringify(stored.cuisines) === JSON.stringify(["italian", "indian"]), `cuisines kept: ${JSON.stringify(stored.cuisines)}`);
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
  await first.getByRole("button", { name: /^Swap this meal: / }).click();
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

// The Swap sheet as a small Recipes screen (founder 2026-11-20: "they also should be able to search ... choose an item that they want to put in instead"): every
// recipe the plan priced for that meal, the week's own marked In your plan and still there, the Recipes screen's tiles, fields and search.
await step("swap by search and filter: every dinner the plan priced; a tile narrows them and Clear brings them back; a word finds one further down, and the one tapped is the day's", async () => {
  const dinnerRow = () => page.locator("section[aria-labelledby='day-h'] > ul > li").nth(2);
  await dinnerRow().getByRole("button", { name: /^Swap this meal: / }).click();
  const sheet = page.getByRole("dialog", { name: /^Swap dinner/ });
  await sheet.waitFor();
  const options = sheet.getByRole("button").filter({ hasText: /kcal/ });
  const status = sheet.getByRole("status");
  const count = async (re) => Number((await status.innerText()).match(re)?.[1] ?? NaN);
  const all = await count(/^(\d+) recipes$/);
  expect(all > 10, `every dinner priced, more than the ten the sheet listed before: ${all}`);
  expect((await options.count()) === Math.min(all, 20), `the first 20 rows: ${await options.count()}`);
  expect((await sheet.getByText("In your plan", { exact: true }).count()) >= 1, "the week's other dinners are marked");
  for (const name of ["Cuisine", "Serving price", "Sort by"]) await sheet.getByText(name, { exact: true }).first().waitFor();
  // a quick-filter tile narrows the list; Clear brings every dinner back
  const tile = sheet.getByRole("group", { name: "Filters" }).getByRole("button").first();
  const tileName = (await tile.innerText()).trim();
  await tile.click();
  expect((await tile.getAttribute("aria-pressed")) === "true", "the tile is on");
  await status.filter({ hasText: /match/ }).waitFor();
  const narrowed = await count(/^(\d+) recipes? match/);
  expect(narrowed >= 1 && narrowed < all, `${tileName}: ${narrowed} of ${all}`);
  await sheet.getByRole("button", { name: "Clear", exact: true }).click();
  await status.filter({ hasText: new RegExp(`^${all} recipes$`) }).waitFor();
  // the sort: Lowest price puts the cheapest first
  await sheet.getByLabel("Sort by").selectOption("price");
  const prices = await options.evaluateAll((bs) => bs.map((b) => Number((b.innerText.match(/£(\d+\.\d\d)/) ?? [])[1])));
  expect(prices.every((p, i) => i === 0 || prices[i - 1] <= p), `cheapest first: ${prices.slice(0, 6).join(", ")}`);
  await sheet.getByLabel("Sort by").selectOption("fit");
  // a word from a recipe further down the list finds it; tapping it puts it in the day
  const want = (await options.last().innerText()).split("\n")[0];
  const word = want.split(/[\s,]+/).sort((a, b) => b.length - a.length)[0];
  await sheet.getByRole("searchbox", { name: "Search recipes" }).fill(word);
  await status.filter({ hasText: /match/ }).waitFor();
  const found = await count(/^(\d+) recipes? match/);
  expect(found >= 1 && found < all, `"${word}": ${found} of ${all}`);
  expect(await sheet.evaluate((d) => d.querySelector(".sheet-panel").scrollWidth <= d.querySelector(".sheet-panel").clientWidth), "no sideways scroll in the sheet");
  await options.filter({ hasText: want }).first().click();
  await sheet.waitFor({ state: "hidden" });
  const now = await dinnerRow().locator("a span.font-bold").first().innerText();
  expect(now === want, `searched "${word}", chose ${want}: the day shows ${now}`);
});

await step("add all to the shopping list, then the list holds them", async () => {
  await page.getByRole("button", { name: "Add all to my shopping list" }).click();
  await page.getByText(/^Added \d+ products to .+\./).waitFor(); // names the list it went on (several shopping lists)
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
  await page.getByText("Step 1 of 9").waitFor();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Continue" }).click(); // how many, meals, shops, diet, how you like to eat
  expect((await page.getByRole("button", { name: /^Italian/ }).getAttribute("aria-pressed")) === "true", "cuisines kept");
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await page.getByRole("button", { name: "Mushrooms", exact: true }).getAttribute("aria-pressed")) === "true", "foods kept");
  await page.getByRole("button", { name: "Keep my plan" }).click();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor();
});

await step("a new plan keeps the old one under Earlier plans; Open makes it the plan again; Remove takes one away with Undo", async () => {
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  await page.getByRole("button", { name: "Make a new plan" }).first().click();
  await page.getByText("Step 1 of 9").waitFor();
  for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "Continue" }).click(); // to the budget
  await page.getByRole("slider").waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Make my plan" }).click();
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 45000 });
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

// The week shown before Premium is the week the first open makes (the onboarding meeting: "not bait"). Only on a build that sells Premium; elsewhere there is no
// PremiumIntro, and the step says so.
const sold = await context({ devProOverride: false });
const p2 = await sold.newPage();
await step("before Premium: the same week the first open's Make my plan makes, from the person's shop, the first shop and each week after as plain lines", async () => {
  await p2.goto(BASE + "/app/plan");
  const intro = p2.getByRole("button", { name: "See Premium", exact: true }); // "Premium" is the one name; "See Premium" the one button (19-20 November 2026)
  const check = p2.getByRole("heading", { level: 1, name: "Ready to make your plan?" });
  await Promise.race([intro.waitFor({ timeout: 60000 }), check.waitFor({ timeout: 60000 })]);
  if (!(await intro.isVisible())) { console.log("     (no Premium sold on this build: no PremiumIntro to check)"); return; }
  const preview = p2.locator("section[aria-labelledby='preview-h']");
  await preview.getByText(/^Breakfast · /).waitFor({ timeout: 180000 });
  const shown = (await preview.locator("li").allInnerTexts()).map((x) => x.replace(/^(Breakfast|Lunch|Dinner) · /, ""));
  expect(shown.length === 3, "three meals: " + shown.join(", "));
  // the first shop and each week after (founder 2026-11-20), then the shop's shelf-price line
  const seen = await twoWeeks(preview);
  expect(seen.first > seen.after, "the preview's two figures: " + JSON.stringify(seen));
  await preview.getByText(/^Prices are Sainsbury's shelf prices, checked .+, and vary by store\.$/).waitFor();
  await preview.getByText(/^About [\d,]+ kcal and \d+ g protein a day \(your target is 2,000 kcal\)\.$/).waitFor();
  // now with Premium: the first open's Make my plan, untouched
  await p2.evaluate(() => { const s = JSON.parse(localStorage.getItem("mm.v1.settings")); s.data.devProOverride = true; localStorage.setItem("mm.v1.settings", JSON.stringify(s)); });
  await p2.reload();
  await check.waitFor({ timeout: 60000 });
  await p2.getByRole("button", { name: "Make my plan" }).and(p2.locator(":enabled")).waitFor({ timeout: 180000 });
  await p2.getByRole("button", { name: "Make my plan" }).click();
  await p2.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 45000 });
  const made = await p2.locator("section[aria-labelledby='day-h'] li a span.font-bold").allInnerTexts();
  expect(JSON.stringify(made.slice(0, 3)) === JSON.stringify(shown), `the same first day: ${made.join(", ")} vs ${shown.join(", ")}`);
  const plan = await twoWeeks(p2);
  expect(plan.first === seen.first && plan.after === seen.after, `the same two figures: ${JSON.stringify(plan)} vs ${JSON.stringify(seen)}`);
  const stored = await p2.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  expect(stored.budget === null && stored.shops.join() === "sainsburys", JSON.stringify(stored).slice(0, 160));
  await p2.getByText("No budget set.", { exact: true }).waitFor();
});
await sold.close();

// A GLP-1 meal cap (founder 2026-11-20): the meals can't add up to the day, so the plan says why, with the way to change it, and Pip never says it adds up.
const glp = await context({ goal: "glp1", glp1MealCap: 450, dailyCalories: 2000 });
const p3 = await glp.newPage();
await step("GLP-1: the check screen and the meals step say the comfortable meal size is 450 kcal, 1,350 of 2,000, with Change it (the Daily targets page); no 'adds up'", async () => {
  await p3.goto(BASE + "/app/plan");
  await p3.getByRole("heading", { level: 1, name: "Ready to make your plan?" }).waitFor({ timeout: 60000 });
  // in the app's voice, no goal name and no medication (the 30-person audit, 20 November 2026)
  const line = "Your meal size is 450 kcal, so your meals come to 1,350 of your 2,000 kcal.";
  await p3.getByText(line, { exact: true }).waitFor();
  expect((await p3.getByRole("link", { name: "Change it", exact: true }).getAttribute("href")) === "/app/targets", "the link goes to the meal size");
  await p3.getByRole("button", { name: "Change: Meals and snacks" }).click();
  await p3.getByRole("heading", { level: 1, name: "Your meals and snacks" }).waitFor();
  await p3.getByText(line, { exact: true }).waitFor();
  expect((await p3.getByText(/your day adds up/).count()) === 0, "Pip doesn't say the day adds up");
  const box = await p3.getByRole("link", { name: "Change it", exact: true }).boundingBox();
  expect(box && box.height >= 44, "a big target: " + JSON.stringify(box));
});
await glp.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
