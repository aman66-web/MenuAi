// Shared moves through the welcome steps for the browser tests. Onboarding in eight screens, then the account (founder, 20 November 2026, 12:21-12:37: one
// question a screen, a big input, far fewer words, pictures over text; the colours added 26 November 2026; app/app/welcome/, lib/mm/welcomeSteps.ts):
//    1 What's your goal? · 2 Anything you avoid? · 3 Where do you shop? · 4 Recipes from {shop} · 5 About you · 6 How active are you? · 7 Your plan ·
//    8 Pick your colours · 9 the account ("Save your plan"; a run that starts signed in has no account step)
// No "Step n of N" is written on screen (the bar alone); a screen reader hears it with each headline (its accessible name ends ", Step n of N").
// Top-right "Skip" on 1-3 skips that question; on 5-6 it skips the questions about the person, to Your plan with the starting numbers.
// Not a test on its own: imported by showcase.mjs, onboarding-body.mjs, smoke.mjs, largetext.mjs, a11y.mjs and the other suites that walk the steps.

/** Every step's headline, in order (step 4's names the shop, so it is matched by its start). */
export const HEADLINES = {
  goal: "What's your goal?",
  avoid: "Anything you avoid?",
  shops: "Where do you shop?",
  recipes: /^(Pick a recipe|Recipes)( from |\s*,|$)/,
  about: "Let's work out your numbers",
  active: "How active are you?",
  plan: /^Your (starting )?plan(\s*,|$)/,
  colours: "Pick your colours",
  save: "Save your plan for free",
};
/** The step ids in order, as lib/mm/welcomeSteps.ts WELCOME_STEPS. */
export const STEPS = ["goal", "avoid", "shops", "recipes", "about", "active", "plan", "colours", "save"];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const vis = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout });
/** A step's level-1 headline (its accessible name also carries " , Step n of N", read with it by a screen reader). */
export const headline = (page, id) => {
  const h = HEADLINES[id];
  return page.getByRole("heading", { level: 1, name: typeof h === "string" ? new RegExp(`^${esc(h)}(\\s*,|$)`) : h });
};
export const onStep = (page, id, timeout) => vis(headline(page, id), timeout);
export const press = (page, name) => page.getByRole("button", { name, exact: true }).click();
/** "Step n of N" as a screen reader hears it with the headline (nothing is written on screen). */
export const counter = async (page) => {
  const name = await page.locator("main h1").first().evaluate((h) => h.querySelector(".sr-only")?.textContent ?? "").catch(() => "");
  return name.replace(/^,\s*/, "");
};
export const expectCounter = async (page, n, total = 9) => {
  const got = await counter(page);
  if (got !== `Step ${n} of ${total}`) throw new Error(`the headline says "${got}", not "Step ${n} of ${total}"`);
};
/** The bar's segments (0 where there is none). */
export const segments = (page) => page.evaluate(() => [...document.querySelectorAll("main div[aria-hidden='true']")].find((d) => d.className.includes("gap-1") && d.children.length > 1 && [...d.children].every((c) => c.className.includes("h-1.5")))?.children.length ?? 0);
/** How many of the bar's segments are lit. */
export const litSegments = (page) => page.evaluate(() => {
  const bar = [...document.querySelectorAll("main div[aria-hidden='true']")].find((d) => d.className.includes("gap-1") && d.children.length > 1 && [...d.children].every((c) => c.className.includes("h-1.5")));
  return bar ? [...bar.children].filter((c) => c.className.includes("bg-[var(--bar)]")).length : 0;
});
/** The top-right Skip pill. */
export const skipButton = (page) => page.getByRole("button", { name: "Skip", exact: true });
/** The round back arrow at the top left. */
export const backButton = (page) => page.getByRole("button", { name: "Back to the previous step", exact: true });

/** The cover (no bar), then Get started, to step 1. */
export async function startSteps(page, base, path = "/app/welcome") {
  await page.goto(base + path);
  await vis(page.getByRole("button", { name: "Get started", exact: true }), 120000);
  await press(page, "Get started");
  await onStep(page, "goal");
}
/** Step 1: a goal tapped (by its tile's name) and Continue, or Skip (null). */
export async function goal(page, name = "Maintain") {
  await onStep(page, "goal");
  if (name === null) await skipButton(page).click();
  else {
    await page.getByRole("radiogroup", { name: "Your goal" }).getByRole("radio", { name: new RegExp(`^${esc(name)}`) }).click();
    await press(page, "Continue");
  }
  await onStep(page, "avoid");
}
/** A diet's picture tile on step 2 (its name is all its words: the diet, then its short line). */
export const dietTile = (page, name) => page.getByRole("group", { name: /^(Your diet|More diets)$/ }).getByRole("button", { name: new RegExp(`^${esc(name)}(?: |$)`) }).first();
/** An allergy chip on step 2 (its name is the allergen and its hint). Step 2 shows the allergies first, the common seven (Gluten, Milk, Eggs, Peanuts, Tree
 *  nuts, Soya, Fish) then "More" for the rest of the 14 (the review of 20 November evening): see showAllergy. */
export const allergyChip = (page, name) => page.getByRole("group", { name: "Allergies to avoid" }).getByRole("button", { name: new RegExp(`^${esc(name)}(?: |$)`) }).first();
/** Step 2's "More" chip, which brings out the other seven allergies (it goes once tapped). */
export const moreAllergies = (page) => page.getByRole("group", { name: "Allergies to avoid" }).getByRole("button", { name: "More", exact: true });
/** An allergy chip on step 2, with "More" tapped first when it is one of the rest. */
export async function showAllergy(page, name) {
  if (!(await allergyChip(page, name).count()) && (await moreAllergies(page).count())) await moreAllergies(page).click();
  return allergyChip(page, name);
}
/** Step 2: the diets and allergies tapped, then Continue; none: "Nothing to avoid"; null: Skip. */
export async function avoid(page, { diets = [], allergies = [] } = {}) {
  await onStep(page, "avoid");
  if (diets === null) {
    await skipButton(page).click();
  } else {
    for (const d of diets) await dietTile(page, d).click();
    for (const a of allergies) await (await showAllergy(page, a)).click();
    await press(page, diets.length || allergies.length ? "Continue" : "Nothing to avoid");
  }
  await onStep(page, "shops");
}
/** A shop's tile (step 3) or row (Settings): its name is all the words on it, so it is found by the shop's name at the start. */
export const shopTile = (scope, name) => scope.getByRole("button", { name: new RegExp(`^${esc(name)}(?: |$)`) });
/** Step 3: the shops ticked (their names), then Continue; null: Skip. */
export async function shops(page, names = []) {
  await onStep(page, "shops");
  if (names === null) await skipButton(page).click();
  else {
    for (const n of names) await shopTile(page.getByRole("group", { name: "Your supermarkets" }), n).click();
    await press(page, "Continue");
  }
  await onStep(page, "recipes");
}
/** Step 4's two recipe tiles: RecipeTile's own choose mode, a radio each in the group "Your first recipe" (aria-checked). */
export const recipeTiles = (page) => page.getByRole("radiogroup", { name: "Your first recipe" }).getByRole("radio");
/** A tile's recipe name (the radio's name is all its words: name, calories, protein, carbs, fat, price, minutes and the hint). */
export const recipeTileName = async (tile) => (await tile.locator("span.line-clamp-3").first().innerText()).trim();
/** Step 4: optionally chooses the first recipe tile (waits for the tiles), then Continue. */
export async function recipes(page, { choose = false } = {}) {
  await onStep(page, "recipes");
  let name = null;
  if (choose) {
    const tile = recipeTiles(page).first();
    await vis(tile, 45000);
    name = await recipeTileName(tile);
    await tile.click();
  }
  await press(page, "Continue");
  await onStep(page, "about");
  return name;
}
/** From the cover to "About you": steps 1 to 4 with the given answers (null = Skip). */
export async function toAbout(page, base, { goalName = "Maintain", diets = [], allergies = [], shopNames = [], choose = false, path } = {}) {
  await startSteps(page, base, path);
  await goal(page, goalName);
  await avoid(page, { diets, allergies });
  await shops(page, shopNames);
  return recipes(page, { choose });
}
/** About you: the sex tile, the units ("uk" ft and in with st and lb, or "metric" cm with kg; each row has its own switch since 20 Nov), age, height and weight typed. */
export async function aboutYou(page, { sex = "Male", units = "uk", age = "", height = [], weight = [] } = {}) {
  await onStep(page, "about");
  if (sex) await page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio", { name: sex, exact: true }).click();
  const [h, w] = units === "metric" ? ["cm", "kg"] : ["ft and in", "st and lb"];
  await page.getByRole("radiogroup", { name: "Height unit" }).getByRole("radio", { name: h, exact: true }).click();
  await page.getByRole("radiogroup", { name: "Weight unit" }).getByRole("radio", { name: w, exact: true }).click();
  if (age !== "") await page.getByLabel("Age in years", { exact: true }).fill(String(age));
  if (units === "metric") {
    if (height[0] !== undefined) await page.getByLabel("Centimetres", { exact: true }).fill(String(height[0]));
    if (weight[0] !== undefined) await page.getByLabel("Kilograms", { exact: true }).fill(String(weight[0]));
  } else {
    if (height[0] !== undefined) await page.getByLabel("Feet", { exact: true }).fill(String(height[0]));
    if (height[1] !== undefined) await page.getByLabel("Inches", { exact: true }).fill(String(height[1]));
    if (weight[0] !== undefined) await page.getByLabel("Stone", { exact: true }).fill(String(weight[0]));
    if (weight[1] !== undefined) await page.getByLabel("Pounds", { exact: true }).fill(String(weight[1]));
  }
}
/** About you's Continue, to How active are you? (or Your plan for an under-18). */
export async function aboutNext(page, to = "active") {
  await press(page, "Continue");
  await onStep(page, to);
}
/** How active are you?: the tile tapped, then See my plan, to Your plan. */
export async function active(page, name = "Lightly active") {
  await onStep(page, "active");
  await page.getByRole("radiogroup", { name: "Activity" }).getByRole("radio", { name, exact: true }).click();
  await press(page, "See my plan");
  await onStep(page, "plan");
}
/** Skip on About you or How active are you?: both skipped, to Your plan with the starting numbers. */
export async function skipBody(page) {
  await skipButton(page).click();
  await onStep(page, "plan");
}
/** The big calories and protein on Your plan, as numbers (null where they show "–"). */
export async function planNumbers(page) {
  return page.evaluate(() => {
    const read = (label) => {
      const card = [...document.querySelectorAll("main p")].find((p) => p.textContent?.trim() === label)?.parentElement;
      const n = card?.querySelector("p.app-numbers span")?.textContent?.replace(/,/g, "") ?? "";
      return /^\d+$/.test(n) ? Number(n) : null;
    };
    return { calories: read("Calories a day"), protein: read("Protein a day") };
  });
}
/** Your plan's button: "Continue", to Pick your colours; then (unless `stopAtColours`) the colours' Continue with Lime kept (signed out, to the account; signed in,
 *  to Home). */
export async function planNext(page, { stopAtColours = false } = {}) {
  await onStep(page, "plan");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (!stopAtColours) await coloursNext(page);
}
/** Pick your colours: optionally a scheme tapped (its name: "Ocean"), then Continue. */
export async function coloursNext(page, scheme = null) {
  await onStep(page, "colours");
  if (scheme) await page.getByRole("radiogroup", { name: "Colours" }).getByRole("radio", { name: scheme, exact: true }).click();
  await press(page, "Continue");
}
/** The account step where sign-in is optional: "Not now", to Home. */
export async function notNow(page) {
  await onStep(page, "save", 20000);
  await press(page, "Not now");
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/", { timeout: 30000 });
}
/** From Your plan to Home where sign-in is optional: Continue, then Not now. */
export async function finishFromPlan(page) {
  await planNext(page);
  await notNow(page);
}
/** The whole way with every question skipped, to Home (sign-in optional). */
export async function skipToHome(page, base, path) {
  await startSteps(page, base, path);
  await goal(page, null);
  await avoid(page, { diets: null });
  await shops(page, null);
  await recipes(page);
  await skipBody(page);
  await finishFromPlan(page);
}
