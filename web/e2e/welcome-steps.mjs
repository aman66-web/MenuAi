// Shared moves through the welcome steps for the browser tests (the onboarding redesign meeting of 20 November 2026, approved by the founder; app/app/welcome/,
// lib/mm/welcomeSteps.ts): after the cover, eleven steps in one counter ("Step n of 11"; a run that starts signed in has 10):
//    1 What's your goal? · 2 Anything you avoid? · 3 Know before you order · 4 Where do you shop? · 5 Recipes from {shop} · 6 About you ·
//    7 Your height and weight · 8 How active are you? · 9 Your daily targets · 10 Your week, planned · 11 Save your plan: make your free account
// Not a test on its own: imported by showcase.mjs, onboarding-body.mjs, smoke.mjs, largetext.mjs, a11y.mjs and the other suites that walk the steps.

/** Every step's headline, in order (step 5's names the shop, so it is matched by its start). */
export const HEADLINES = {
  goal: "What's your goal?",
  avoid: "Anything you avoid?",
  eatOut: "Know before you order",
  shops: "Where do you shop?",
  recipes: /^Recipes( from | ?,|$)/,
  about: "About you",
  size: "Your height and weight",
  active: "How active are you?",
  targets: "Your daily targets",
  week: "Your week, planned",
  save: "Save your plan: make your free account",
};
/** The step ids in order, as lib/mm/welcomeSteps.ts WELCOME_STEPS. */
export const STEPS = ["goal", "avoid", "eatOut", "shops", "recipes", "about", "size", "active", "targets", "week", "save"];

const vis = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout });
/** A step's level-1 headline (its accessible name also carries ", Step n of N", read with it by a screen reader). */
export const headline = (page, id) => {
  const h = HEADLINES[id];
  return page.getByRole("heading", { level: 1, name: typeof h === "string" ? new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : h });
};
export const onStep = (page, id, timeout) => vis(headline(page, id), timeout);
export const press = (page, name) => page.getByRole("button", { name, exact: true }).click();
/** "Step n of N" as the bar shows it (hidden from screen readers: it is read with the headline). */
export const counter = (page) => page.locator("p.app-numbers").filter({ hasText: /^Step \d+ of \d+$/ }).first().innerText().catch(() => "");
export const expectCounter = async (page, n, total = 11) => {
  await vis(page.locator("p.app-numbers").filter({ hasText: new RegExp(`^Step ${n} of ${total}$`) }));
};
/** The bar's segments (0 where there is none). */
export const segments = (page) => page.evaluate(() => [...document.querySelectorAll("main div[aria-hidden='true']")].find((d) => d.className.includes("gap-1") && [...d.children].every((c) => c.classList.contains("h-1")))?.children.length ?? 0);

/** The cover (no counter), then Get started, to step 1. */
export async function startSteps(page, base, path = "/app/welcome") {
  await page.goto(base + path);
  await vis(page.getByRole("button", { name: "Get started", exact: true }), 120000);
  await press(page, "Get started");
  await onStep(page, "goal");
}
/** Step 1: a goal tapped (by its tile's name) and Continue, or Skip. */
export async function goal(page, name = "Maintain") {
  await onStep(page, "goal");
  if (name === null) await press(page, "Skip");
  else {
    await page.getByRole("radio", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
    await press(page, "Continue");
  }
  await onStep(page, "avoid");
}
/** Step 2: the chips tapped (names as the DietPicker writes them), then Continue; none: "Nothing to avoid". */
export async function avoid(page, chips = []) {
  await onStep(page, "avoid");
  for (const c of chips) await page.getByRole("button", { name: c, exact: true }).click();
  await press(page, chips.length ? "Continue" : "Nothing to avoid");
  await onStep(page, "eatOut");
}
/** Step 3: waits for the first chip (or its plain line), then Next. */
export async function eatOut(page, { wait = true } = {}) {
  await onStep(page, "eatOut");
  if (wait) await vis(page.locator("[role='radiogroup'][aria-label='Restaurants'], section[aria-label='A look at Eat out'] p[role='status']").first(), 30000).catch(() => undefined);
  await press(page, "Next: where you shop");
  await onStep(page, "shops");
}
/** Step 4: the shops ticked (their names), then Continue. */
export async function shops(page, names = []) {
  await onStep(page, "shops");
  for (const n of names) await page.getByRole("group", { name: "Your supermarkets" }).getByRole("button", { name: n, exact: true }).click();
  await press(page, "Continue");
  await onStep(page, "recipes");
}
/** Step 5: optionally chooses the first recipe tile (waits for the tiles), then Next. */
export async function recipes(page, { choose = false } = {}) {
  await onStep(page, "recipes");
  if (choose) {
    const tile = page.locator("section[aria-label='A look at Recipes'] button[aria-pressed]").first();
    await vis(tile, 30000);
    await tile.click();
  }
  await press(page, "Next: your daily numbers");
  await onStep(page, "about");
}
/** From the cover to "About you": steps 1 to 5 with the given answers. */
export async function toAbout(page, base, { goalName = "Maintain", chips = [], shopNames = [], path } = {}) {
  await startSteps(page, base, path);
  await goal(page, goalName);
  await avoid(page, chips);
  await eatOut(page);
  await shops(page, shopNames);
  await recipes(page);
}
/** Steps 6 to 8 skipped with "Skip these questions" (from About you), to "Your daily targets". */
export async function skipBody(page) {
  await press(page, "Skip these questions");
  await onStep(page, "targets");
}
/** Step 9's Next (its words: "Next: plan my week", or "Next" for an under-18), to step 10. */
export async function targetsNext(page) {
  await onStep(page, "targets");
  await page.getByRole("button", { name: /^Next(: plan my week)?$/ }).click();
  await onStep(page, "week");
}
/** Step 10's Next, to step 11 (a run started signed out) or Home (signed in: "Save and go to Home"). */
export async function weekNext(page) {
  await onStep(page, "week");
  await page.getByRole("button", { name: /^(Next: save your plan|Save and go to Home)$/ }).click();
}
/** Step 11 where sign-in is optional: "Not now", to Home. */
export async function notNow(page) {
  await onStep(page, "save");
  await press(page, "Not now");
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/", { timeout: 20000 });
}
/** From "Your daily targets" to Home where sign-in is optional: steps 9, 10 and 11 ("Not now"). */
export async function finishFromTargets(page) {
  await targetsNext(page);
  await weekNext(page);
  await notNow(page);
}
/** The whole way with every question skipped, to Home (sign-in optional). */
export async function skipToHome(page, base, path) {
  await toAbout(page, base, { goalName: null, path });
  await skipBody(page);
  await finishFromTargets(page);
}
