// A meal plan for everyone at home (founder 2026-11-19: "people normally live with people ... a plan for everyone"; the 20-agent meeting's conclusion):
// the first open's check screen ("Who's eating: Just me" first; the onboarding meeting, 20 November 2026), its Change to how many, then each other person (an
// age group, an optional name, a portion), the home's allergies and diets (every diet the person's own picker knows, the six newer ones behind "More diets"),
// the check screen, then a week cooked as written for everyone with each person's servings, only the user's own numbers, the allergy sentence, and "Add my
// portion". The household stays on the phone: a saved plan keeps ages, portions and diets, never names.
// Run against a server with Premium previewed: BASE=http://localhost:3005 node e2e/household.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const AXE = new URL("./node_modules/axe-core/axe.min.js", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 3).join(" | ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, locale: "en-GB" });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
  localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 1800, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true } }));
  localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const h1 = (name) => page.getByRole("heading", { level: 1, name, exact: true });
const tap = (name) => page.getByRole("button", { name, exact: true }).last().click();
async function axe(where) {
  // after Pip's pop-in and the bubble's (finite animations; his blink never ends): half-faded words read as low contrast
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 90)}`));
  expect(v.length === 0, `${where}: ${v.join(" | ")}`);
}

await step("the first open's check screen: Who's eating: Just me first; its Change asks how many: Just me to begin with, then 3 of us; the steps become nine", async () => {
  await page.goto(BASE + "/app/plan");
  await h1("Ready to make your plan?").waitFor({ timeout: 120000 });
  const first = await page.locator("main ul li").first().innerText();
  expect(first.includes("Who's eating") && first.includes("Just me"), "Who's eating first: " + first);
  await tap("Change: Who's eating");
  await h1("How many people are you cooking for?").waitFor();
  await page.getByText("Step 1 of 8").waitFor();
  expect((await page.getByRole("radio", { name: "Just me" }).getAttribute("aria-checked")) === "true", "Just me to begin with");
  await page.getByRole("radio", { name: "3 of us" }).click();
  await page.getByText("Step 1 of 9").waitFor();
  await tap("Continue");
});

await step("who's eating: a card for each other person, a grown-up to begin with; Pip says each portion in words; axe", async () => {
  await h1("Who's eating with you?").waitFor();
  const cards = page.locator("main li");
  expect((await cards.count()) === 2, "two cards");
  await page.getByText("Person 2 of 3").waitFor();
  expect((await cards.nth(0).getByRole("radio", { name: /^Adult/ }).getAttribute("aria-checked")) === "true", "a grown-up to begin with");
  await cards.nth(0).getByText("I'll give them a grown-up's portion.").waitFor();
  await cards.nth(1).getByRole("radio", { name: /^Child/ }).click();
  await cards.nth(1).getByText("I'll give them ¾ of a grown-up's portion.").waitFor();
  await cards.nth(1).getByRole("radio", { name: "Bigger" }).click();
  await cards.nth(1).getByText("I'll give them a grown-up's portion.").waitFor();
  await cards.nth(1).getByRole("radio", { name: "Usual" }).click();
  await cards.nth(1).getByLabel("Their name (you can leave it out)").fill("Sam");
  await axe("who's eating");
  await tap("Continue");
});

await step("meals, shops, then the home's allergies (the button says the usual answer) and diets (More diets opens the rest), and the foods anyone won't eat; axe", async () => {
  await h1("Your meals and snacks").waitFor();
  await page.getByText(/^Your portions: 1,800 kcal/).waitFor();
  await tap("Continue");
  await h1("Where you shop").waitFor();
  await tap("Continue");
  await h1("Any food allergies at home?").waitFor();
  await page.getByRole("button", { name: "No allergies at home", exact: true }).waitFor();
  await tap("Peanuts");
  await tap("Continue");
  await h1("Any diets at home?").waitFor();
  await page.getByRole("button", { name: "No diets at home", exact: true }).waitFor();
  for (const d of ["Vegetarian", "Vegan", "Pescatarian", "Halal", "No pork", "No beef"]) await page.getByRole("button", { name: new RegExp(`^${d}`) }).waitFor();
  expect((await page.getByRole("button", { name: /^Jain/ }).count()) === 0, "the six newer diets wait behind More diets");
  const more = page.getByRole("button", { name: "More diets" });
  expect((await more.getAttribute("aria-expanded")) === "false", "More diets starts closed");
  await more.click();
  for (const d of ["Jain", "No onion or garlic", "Kosher style", "No red meat", "No alcohol", "No halal or kosher meat"]) await page.getByRole("button", { name: new RegExp(`^${d}`) }).waitFor();
  await page.getByRole("button", { name: /^Kosher style/ }).getByText("We can't check kosher certification.").waitFor();
  await page.getByRole("button", { name: /^No onion or garlic/ }).click();
  expect((await page.getByRole("button", { name: /^No onion or garlic/ }).getAttribute("aria-pressed")) === "true", "ticked");
  await axe("diets at home");
  await tap("Continue");
  await h1("Anything someone won't eat?").waitFor();
  await tap("Nothing to leave out");
});

await step("the budget, then the check screen: who's eating, the allergies in the one fixed sentence, the home's diets, Change on every line; axe", async () => {
  await h1("Your budget for the week").waitFor();
  await page.getByRole("slider").waitFor({ timeout: 180000 });
  await tap("Continue");
  await h1("Ready to make your plan?").waitFor();
  const rows = await page.locator("main ul li").allInnerTexts();
  expect(rows[0].includes("You, Person 2 (adult) and Sam (child)"), "who's eating first: " + rows[0]);
  expect(rows[1].includes("Recipes made with peanuts are left out. Always check the label."), "then the allergies: " + rows[1]);
  expect(rows[2].includes("For everyone: No onion or garlic"), "then the home's diets: " + rows[2]);
  await axe("check screen");
  await tap("Make my plan");
});

await step("the week: for 3, only the user's numbers, the allergy sentence, each meal's servings for everyone, Add my portion; the plan keeps no names", async () => {
  // "Making your plan" takes about 20 seconds (founder 2026-11-20)
  await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 120000 });
  await page.getByText(/for the week's shopping for 3 people/).waitFor();
  await page.getByText(/Every meal fits your diet: .*No onion or garlic/).waitFor();
  await page.getByText("Recipes made with peanuts are left out. Always check the label.").waitFor();
  const card = page.locator("li", { hasText: "Servings each" }).first();
  const line = await card.locator("p", { hasText: "Servings each" }).innerText();
  expect(/^Servings each: you [\d¼½¾]+, Person 2 [\d¼½¾]+ and Sam [\d¼½¾]+\.$/.test(line), line);
  expect(/&n=\d+&w=1$/.test(await card.locator("a").first().getAttribute("href")), "the recipe opens for everyone, as written");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  expect(JSON.stringify(saved.home) === JSON.stringify({ others: [{ group: "adult", portion: "usual" }, { group: "child", portion: "usual" }], allergies: ["peanuts"], diets: ["noOnionGarlic"] }), JSON.stringify(saved.home));
  // no recipe in the week uses onion or garlic (the shopping list names the products)
  const buy = (await page.locator("section[aria-labelledby='buy-h']").innerText()).toLowerCase();
  expect(!/\bonions?\b|\bgarlic\b|\bleeks?\b|\bshallots?\b/.test(buy), "no onion or garlic bought");
  expect(!JSON.stringify(saved).includes("Sam"), "no name in the plan");
  await card.getByRole("button", { name: /^Add my portion to / }).click();
  await page.getByRole("status").filter({ hasText: "Added your portion" }).waitFor({ timeout: 10000 });
  const [e] = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.log")).data);
  expect(e && e.source === "recipe" && e.nutrients.calories > 0, "logged: " + JSON.stringify(e));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, "no sideways scroll");
  expect(errors.length === 0, errors.join(" | "));
});

await step("Clear data empties the household", async () => {
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: /Clear (data|everything)/ }).first().click();
  await page.locator("dialog[open]").getByRole("button", { name: /Clear/ }).first().click();
  await page.waitForTimeout(1500);
  const h = await page.evaluate(() => localStorage.getItem("mm.v1.household"));
  expect(!h || JSON.parse(h).data.others.length === 0, "household left: " + h);
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
