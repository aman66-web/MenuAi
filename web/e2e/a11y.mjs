import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// Pip's tips on the real screens (CoachMarks, 2026-11-18) are stopped in this test, as if the person had pressed "Stop the tips": e2e/coach.mjs covers them.
{
  const open = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await open(options);
    await c.addInitScript(() => { try { if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } })); if (!localStorage.getItem("mm.v1.homePages")) localStorage.setItem("mm.v1.homePages", JSON.stringify({ v: 1, data: { seen: false, slid: true, hintDays: 0, lastHintDay: "" } })); } catch { /* storage blocked */ } });
    return c;
  };
}
const settings = (pro) => JSON.stringify({ v: 1, data: { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: pro } });
const saved = JSON.stringify({ v: 1, data: [{ id: "s1", createdAt: "2026-10-05T12:00:00Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl · double chicken", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "white-rice", qty: 1 }, { id: "chicken", qty: 2 }, { id: "black-beans", qty: 1 }, { id: "tomato-salsa", qty: 1 }, { id: "cheese", qty: 1 }] }], nutrients: { calories: 835, protein: 82, carbs: 67, fat: 27.5 }, dataVersionAtSave: 1 }] });
const log = JSON.stringify({ v: 1, data: [{ id: "l1", loggedAt: new Date().toISOString(), chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl", nutrients: { calories: 655, protein: 50, carbs: 67, fat: 20.5 }, source: "item" }] });

// Nearby: a pretend location in Westminster, with the map tiles blocked (list only) or left alone (the real map canvas).
async function nearby(p, blockTiles) {
  const c = p.context();
  await c.grantPermissions(["geolocation"]);
  await c.setGeolocation({ latitude: 51.5007, longitude: -0.1246 });
  if (blockTiles) await p.route("**/tiles.openfreemap.org/**", (r) => r.abort());
  const locate = p.getByRole("button", { name: "Use my location" });
  const change = p.getByRole("button", { name: "Change" }); // already located: the page shows this instead once permission is granted
  await Promise.race([locate.waitFor(), change.waitFor()]);
  if (await locate.isVisible()) await locate.click();
  await p.getByRole("heading", { name: /(restaurants?|No restaurants here)$/ }).waitFor();
}

// Onboarding, up to the screen asked for (the welcome screen, Pip's arrival, then "Skip tour" and "Set up my daily numbers"). Used by the questions about the person
// and the targets. Everyone here is set up already (the settings below), so the saved goal shows ticked; the foods-to-avoid button says "Nothing to avoid" while
// nothing is ticked, and an activity is tapped (nothing is picked for the person).
const next = (p) => p.getByRole("button", { name: "Continue", exact: true }).click();
async function toGoal(p) {
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("button", { name: "Show me around" }).click();
  await p.getByRole("button", { name: "Skip tour" }).click();
  await p.getByRole("button", { name: "Set up my daily numbers" }).click();
  await p.getByRole("heading", { name: "What's your goal?" }).waitFor();
}
async function toAvoid(p) {
  await toGoal(p);
  await next(p);
  await p.getByRole("heading", { name: "Anything you avoid?" }).waitFor();
}
async function toAbout(p) {
  await toAvoid(p);
  await p.getByRole("button", { name: "Nothing to avoid", exact: true }).click();
  await p.getByRole("heading", { name: "About you" }).waitFor();
}
async function toSize(p) {
  await toAbout(p);
  await p.getByLabel("Age", { exact: true }).fill("34");
  await next(p);
  await p.getByRole("heading", { name: "Your height and weight" }).waitFor();
}
async function toActive(p) {
  await toSize(p);
  await p.getByLabel("Stone").fill("11"); await p.getByLabel("Pounds").fill("4"); await p.getByLabel("Feet").fill("5"); await p.getByLabel("Inches").fill("10");
  await next(p);
  await p.getByRole("heading", { name: "How active are you?" }).waitFor();
}
async function toTargets(p) {
  await toActive(p);
  await p.getByRole("radio", { name: "Lightly active", exact: true }).click();
  await next(p);
  await p.getByRole("heading", { name: "Your daily targets" }).waitFor();
}
/** A first-run stop of the welcome tour: its headline says "stop n of 4" to a screen reader (Chrome's name has a space before the comma). */
const stop = (p, tab, n) => p.getByRole("heading", { level: 1, name: new RegExp(`^${tab} ?, stop ${n} of 4$`) }).waitFor();
/** Through the tour from Pip's arrival to the stop asked for (1-4). */
async function toStop(p, tab, n) {
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("button", { name: "Show me around" }).click();
  for (let i = 1; i < n; i++) { await p.waitForTimeout(150); await p.getByRole("button", { name: "Continue" }).click(); }
  await stop(p, tab, n);
  await p.waitForTimeout(1200);
}
// What the onboarding meeting of 19 November asked of these screens beyond axe (each failure is counted with the violations): the cover's headline is its first
// heading, Pip's arrival names him once, and a − or + on the targets says the new number.
const problems = [];
const must = (cond, what) => { if (!cond) problems.push(what); };

const pages = [
  ["welcome", "/app/welcome", false, async (p) => {
    await p.getByRole("button", { name: "Get started" }).waitFor();
    // the writing comes before the picture in the page, so a screen reader meets the headline first
    must((await p.evaluate(() => document.querySelector("main :is(h1, h2, h3, h4, h5, h6)")?.tagName)) === "H1", "welcome: the first heading in the page is not the h1");
  }],
  ["intro (Pip arrives)", "/app/welcome", false, async (p) => {
    await p.getByRole("button", { name: "Get started" }).click(); await p.getByRole("heading", { name: "Hi, I'm Pip!" }).waitFor(); await p.waitForTimeout(1800);
    // the one place Pip has a name: a picture named for a screen reader
    const pip = p.getByRole("img", { name: "Pip, a small round green character with a sprout on top.", exact: true });
    must((await pip.count()) === 1 && (await pip.evaluate((el) => el.tagName.toLowerCase())) === "svg", "Pip arrives: Pip is not one svg named 'Pip, a small round green character with a sprout on top.'");
  }],
  // every stop of the walk (Community is off; no text size screen since 2026-11-19)
  ["intro (Pip's walk: Home)", "/app/welcome", false, async (p) => { await toStop(p, "Home", 1); }],
  ["intro (Pip's walk: Recipes)", "/app/welcome", false, async (p) => { await toStop(p, "Recipes", 2); }],
  ["intro (Pip's walk: Groceries)", "/app/welcome", false, async (p) => { await toStop(p, "Groceries", 3); }],
  ["intro (Pip's walk: Eat out, the last tab while Community is off)", "/app/welcome", false, async (p) => { await toStop(p, "Eat out", 4); }],
  ["tour: let's make it yours", "/app/welcome", false, async (p) => { await p.getByRole("button", { name: "Get started" }).click(); await p.getByRole("button", { name: "Show me around" }).click(); await p.getByRole("button", { name: "Skip tour" }).click(); await p.getByRole("heading", { name: "Let's make it yours" }).waitFor(); await p.waitForTimeout(800); }],
  ["tour: replay (Settings › Help)", "/app/welcome?tour=1", false, async (p) => { await p.getByText("Step 1 of 4").waitFor(); await p.getByRole("heading", { level: 1, name: "Home", exact: true }).waitFor(); await p.waitForTimeout(1200); }],
  ["home", "/app", true, async () => {}],
  ["home (free)", "/app", false, async () => {}],
  ["eat out", "/app/eat-out", true, async () => {}],
  ["groceries", "/app/groceries", true, async (p) => { await p.getByRole("heading", { name: "Which shop?" }).waitFor(); }],
  ["search", "/app/search", true, async (p) => { await p.getByLabel("Search restaurants and items").fill("chicken"); await p.waitForTimeout(800); }],
  ["chain (free)", "/app/chain?id=bowl-and-co", false, async (p) => { await p.waitForTimeout(500); }],
  ["chain (pro)", "/app/chain?id=bowl-and-co", true, async (p) => { await p.waitForTimeout(500); }],
  ["item", "/app/item?chain=cluck-house&item=pumpkin-shake", true, async () => {}],
  ["builder", "/app/builder?chain=bowl-and-co&item=chicken-bowl", true, async () => {}],
  ["paywall", "/app/today", false, async (p) => { await p.getByRole("button", { name: /See Premium/ }).click(); await p.waitForTimeout(400); }],
  ["report sheet", "/app/item?chain=cluck-house&item=waffle-fries", true, async (p) => { await p.getByRole("button", { name: "Report a number" }).click(); await p.waitForTimeout(400); }],
  ["my meals: restaurant meals", "/app/meals?tab=restaurant", true, async () => {}],
  ["compare: two dishes side by side", "/app/compare?tab=dish", true, async (p) => { await p.evaluate(() => localStorage.setItem("mm.v1.compare", JSON.stringify({ v: 1, data: [1, 2].map((n) => ({ key: `dish:bowl-and-co:d${n}`, kind: "dish", name: `Bowl ${n}`, from: "Bowl & Co", fromId: "bowl-and-co", href: "/app/item?chain=bowl-and-co&item=chicken-bowl", basis: "serving", source: "restaurant", addedAt: "2026-10-11T12:00:00.000Z", numbers: { kcal: 500 + n * 50, protein: 30 + n, carbs: 50, sugars: null, fat: 15, saturates: null, fibre: 6, salt: 2 } })) }))); await p.reload(); await p.getByRole("heading", { name: "Side by side" }).waitFor(); }],
  ["restaurant page: halal quote opened", "/app/chain?id=kfc", true, async (p) => { const b = p.getByRole("button", { name: /What KFC says/ }); if (await b.count()) await b.click(); }],
  ["today", "/app/today", true, async () => {}],
  ["settings", "/app/settings", true, async () => {}],
  ["numbers", "/app/settings/numbers", true, async () => {}],
  ["where these numbers come from", "/app/settings/sources", true, async () => {}],
  ["community", "/app/community", true, async () => {}],
  ["friends (signed out)", "/app/community/friends", true, async (p) => { await p.getByRole("button", { name: "Sign in", exact: true }).waitFor(); }],
  ["shared with you (signed out)", "/app/community/inbox", true, async (p) => { await p.getByRole("button", { name: "Sign in", exact: true }).waitFor(); }],
  ["food blogs", "/app/community/blog", true, async (p) => { await p.getByRole("group", { name: "Topics" }).getByRole("button").nth(1).click(); await p.waitForTimeout(300); }],
  ["article", "/app/community/blog/view?id=where-our-numbers-come-from", true, async (p) => { await p.locator("article h1").waitFor(); }],
  ["offline", "/app/offline", true, async () => {}],
  ["welcome shops", "/app/welcome", false, async (p) => { await toGoal(p); for (let i = 0; i < 4; i++) await p.getByRole("button", { name: "Skip", exact: true }).click(); await p.getByRole("heading", { name: "Where do you shop?" }).waitFor(); await p.getByRole("button", { name: "Sainsbury's", exact: true }).click(); await p.getByText("Got it. I'll show those shops first.").waitFor(); await p.getByText("Not in recipes yet").first().waitFor(); }],
  ["welcome: foods to avoid", "/app/welcome", false, async (p) => { await toAvoid(p); await p.getByRole("button", { name: "Peanuts", exact: true }).click(); await p.getByText("Got it. I'll hide dishes that list them", { exact: false }).waitFor(); await p.waitForTimeout(500); }],
  // the one last screen: what was chosen, the free and Premium line on a gated build, and the first recipes
  ["welcome: you're all set, with its first recipes", "/app/welcome", false, async (p) => { await toGoal(p); for (let i = 0; i < 5; i++) await p.getByRole("button", { name: "Skip", exact: true }).click(); await p.getByRole("heading", { name: "You're all set!" }).waitFor(); await p.locator('a[href^="/app/recipes/view?id="]').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800); }],
  ["recipe swap", "/app/recipes/view?id=tuna-pasta&r=sainsburys", false, async (p) => { await p.getByRole("button", { name: /^Swap Tuna/ }).click(); await p.waitForTimeout(500); }],
  ["shopping list", "/app/groceries/list", false, async (p) => { await p.goto(p.url().replace("/list", "/shop/item?r=sainsburys&id=sainsburys-red-kidney-beans-in-water-400g-240g")); await p.getByRole("button", { name: "Add to my list" }).click(); await p.goto(p.url().split("/app/")[0] + "/app/groceries/list"); await p.waitForTimeout(500); }],
  ["list recipes", "/app/groceries/list/recipes", false, async (p) => { await p.evaluate(() => localStorage.setItem("mm.v1.shopping", JSON.stringify({ v: 1, data: [{ gtin: "", retailer: "own", name: "Chicken", brand: "", size: "", qty: 1, addedAt: "2026-10-10T10:00:00.000Z", custom: true }] }))); await p.reload(); await p.getByText(/recipes? uses? something on your list/).first().waitFor(); }],
  ["my meals: recipes", "/app/meals?tab=recipes", false, async (p) => { await p.evaluate(() => localStorage.setItem("mm.v1.savedRecipes", JSON.stringify({ v: 1, data: [{ id: "chicken-curry", savedAt: "2026-10-10T10:00:00.000Z" }] }))); await p.reload(); await p.locator("a[href*='/app/recipes/view']").first().waitFor(); }],
  ["eat out by type", "/app/eat-out", false, async (p) => { await p.getByRole("button", { name: "More ways to find a restaurant" }).click(); await p.getByRole("group", { name: "Browse by type" }).getByRole("button", { name: /^Coffee/ }).click(); await p.waitForTimeout(300); }],
  ["search recent", "/app/search", false, async (p) => { await p.evaluate(() => localStorage.setItem("mm.v1.recentSearches", '["latte"]')); await p.reload(); await p.waitForTimeout(600); }],
  ["long menu", "/app/chain?id=puccinos", false, async (p) => { await p.getByRole("button", { name: "Change" }).click(); await p.getByRole("dialog").getByRole("button", { name: "No pork" }).click(); await p.getByRole("button", { name: "Done" }).click(); await p.getByRole("button", { name: "Tea", exact: true }).click(); await p.waitForTimeout(1500); }],
  ["menu search", "/app/chain?id=puccinos", false, async (p) => { await p.getByRole("searchbox").fill("latte oat"); await p.waitForTimeout(400); }],
  ["real item", "/app/item?chain=nandos&item=chicken-chorizo", false, async () => {}],
  ["allergens", "/app/item?chain=farmer-j&item=smashed-avo-preserved-lemon-toast", false, async () => {}],
  ["nearby (list)", "/app/map", false, async (p) => { await nearby(p, true); }],
  ["nearby (map)", "/app/map", false, async (p) => { await nearby(p, false); await p.waitForTimeout(4000); }],
  ["welcome: about you", "/app/welcome", false, async (p) => { await toAbout(p); await p.getByLabel("Age", { exact: true }).fill("150"); await p.locator("[role='alert']").filter({ hasText: /\S/ }).first().waitFor(); await p.waitForTimeout(500); }],
  ["welcome: your height and weight", "/app/welcome", false, async (p) => { await toSize(p); await p.getByLabel("Stone").fill("11.5"); await p.getByLabel("Feet").fill("5.10"); await p.locator("[role='alert']").filter({ hasText: /\S/ }).first().waitFor(); await p.waitForTimeout(500); }],
  ["welcome: how active", "/app/welcome", false, async (p) => { await toActive(p); await p.waitForTimeout(500); }],
  ["welcome: your daily targets", "/app/welcome", false, async (p) => {
    await toTargets(p);
    // a tap on + says the new number in a polite live region ("Calories, 1,550"); typing says nothing
    const before = await p.locator("#target-calories").inputValue();
    await p.getByRole("button", { name: "Increase", exact: true }).first().click();
    const after = await p.locator("#target-calories").inputValue();
    const said = await p.locator("#target-calories").evaluate((el) => el.closest(".group\\/step")?.querySelector("[aria-live='polite']")?.textContent ?? null);
    must(after !== before && said === `Calories, ${Number(after).toLocaleString("en-GB")}`, `targets: + from ${before} to ${after} said ${JSON.stringify(said)}`);
    await p.locator("#target-calories").fill(before);
    must((await p.locator("#target-calories").evaluate((el) => el.closest(".group\\/step")?.querySelector("[aria-live='polite']")?.textContent)) === "", "targets: typing a number still has the live region speaking");
    await p.getByLabel("Protein (g)").focus(); await p.waitForTimeout(700);
  }],
  ["welcome: targets, suggest form", "/app/welcome", false, async (p) => { await toGoal(p); await next(p); await p.getByRole("button", { name: "Skip", exact: true }).click(); await p.getByRole("button", { name: "Skip", exact: true }).click(); await p.getByRole("button", { name: "Not sure? Suggest targets for me" }).click(); await p.locator("form").getByRole("button", { name: "Suggest targets", exact: true }).click(); await p.locator("[role='alert']").filter({ hasText: /\S/ }).first().waitFor(); await p.waitForTimeout(500); }],
  ["site", "/", false, async () => {}],
  ["friend invite page", "/f#K7M2QXWA", false, async (p) => { await p.getByRole("heading", { level: 1, name: /A friend invited you/ }).waitFor(); }],
];

let total = 0;
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: "block" });
  for (const [name, path, pro, prep] of pages) {
    // SKIP="paywall,..." leaves pages out (the paywall needs a build with Premium on: a dev server without it has no "See Premium")
    if ((process.env.SKIP ?? "").split(",").includes(name)) { console.log(`${scheme.padEnd(5)} ${name.padEnd(14)} skipped`); continue; }
    const page = await ctx.newPage();
    await page.addInitScript(([s, sv, lg]) => { localStorage.setItem("mm.v1.settings", s); localStorage.setItem("mm.v1.saved", sv); localStorage.setItem("mm.v1.log", lg); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 })); }, [settings(pro), saved, log]);
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await prep(page);
    // wait for fades and slides to end (never the endless ones, such as the welcome logo wall), so axe judges the colours people see
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    await page.addScriptTag({ path: AXE });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
    const v = result.violations;
    total += v.length;
    console.log(`${scheme.padEnd(5)} ${name.padEnd(14)} ${v.length === 0 ? "ok" : v.length + " violation(s)"}`);
    for (const x of v) console.log(`      [${x.impact}] ${x.id}: ${x.help} — ${x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    await page.close();
  }
  await ctx.close();
}
for (const x of problems) console.log(`      [check] ${x}`);
total += problems.length;
console.log("\nTotal violations:", total, problems.length ? `(${problems.length} of them failed checks)` : "");
await browser.close();
