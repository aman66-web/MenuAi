import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
import { createRequire } from "node:module";
import { recipeTiles, shopTile } from "./welcome-steps.mjs";
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

// Onboarding, up to the screen asked for (the seven-screen onboarding of 20 November 2026: the cover's Get started, then What's your goal?, Anything you avoid?,
// Where do you shop?, Recipes from {shop}, About you, How active are you?, Your plan and the account step). Everyone here is set up already (the settings
// below), so the saved goal shows ticked; the foods-to-avoid button says "Nothing to avoid" while nothing is ticked, and an activity is tapped.
const next = (p) => p.getByRole("button", { name: "Continue", exact: true }).click();
async function toGoal(p) {
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("heading", { level: 1, name: /^What's your goal\?/ }).waitFor();
}
async function toAvoid(p) {
  await toGoal(p);
  await next(p);
  await p.getByRole("heading", { level: 1, name: /^Anything you avoid\?/ }).waitFor();
}
async function toShops(p) {
  await toAvoid(p);
  await p.getByRole("button", { name: "Nothing to avoid", exact: true }).click();
  await p.getByRole("heading", { level: 1, name: /^Where do you shop\?/ }).waitFor();
}
async function toRecipes(p) {
  await toShops(p);
  await next(p);
  await p.getByRole("heading", { level: 1, name: /^Recipes/ }).waitFor();
}
async function toAbout(p) {
  await toRecipes(p);
  await next(p);
  await p.getByRole("heading", { level: 1, name: /^About you/ }).waitFor();
}
async function toActive(p) {
  await toAbout(p);
  await p.getByRole("radio", { name: "Female", exact: true }).click();
  await p.getByLabel("Age in years").fill("34");
  await p.getByLabel("Stone").fill("11"); await p.getByLabel("Pounds").fill("4"); await p.getByLabel("Feet").fill("5"); await p.getByLabel("Inches").fill("10");
  await next(p);
  await p.getByRole("heading", { level: 1, name: /^How active are you\?/ }).waitFor();
}
async function toPlan(p) {
  await toActive(p);
  await p.getByRole("radio", { name: "Lightly active", exact: true }).click();
  await p.getByRole("button", { name: "See my plan" }).click();
  await p.getByRole("heading", { level: 1, name: /^Your plan/ }).waitFor();
  await p.getByText(/^About £[\d,]+ for the week$/).or(p.getByText("Meal plan makes your week from your shop, with one shopping list.")).first().waitFor({ timeout: 60000 });
}
/** The replay's screen n (1-2) of Settings › Help › "Show me what Numbite can do": Recipes from {shop}, then Your plan. */
async function toReplay(p, n) {
  await p.getByRole("heading", { level: 1, name: /^Recipes/ }).waitFor({ timeout: 30000 });
  if (n === 2) { await p.getByRole("button", { name: "Next", exact: true }).click(); await p.getByRole("heading", { level: 1, name: /^Your plan/ }).waitFor(); }
  await p.waitForTimeout(1500);
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
  ["welcome: step 1 (Pip arrives)", "/app/welcome", false, async (p) => {
    await toGoal(p); await p.waitForTimeout(1200);
    // the one place Pip has a name: a picture named for a screen reader
    const pip = p.getByRole("img", { name: "Pip, a small round green character with a sprout on top.", exact: true });
    must((await pip.count()) === 1 && (await pip.evaluate((el) => el.tagName.toLowerCase())) === "svg", "step 1: Pip is not one svg named 'Pip, a small round green character with a sprout on top.'");
  }],
  // the two screens that show the app working (the recipes with one chosen, Your plan with its week and restaurant photos) and the account step
  ["welcome: recipes from your shop", "/app/welcome", false, async (p) => { await toRecipes(p); const tile = recipeTiles(p).first(); await tile.waitFor({ timeout: 45000 }); await tile.click(); await p.waitForTimeout(800); }],
  ["welcome: your plan", "/app/welcome", false, async (p) => { await toPlan(p); await p.waitForTimeout(1500); }],
  ["welcome: your plan, changing the numbers", "/app/welcome", false, async (p) => {
    await toPlan(p);
    await p.getByRole("button", { name: "Change", exact: true }).click();
    // a tap on + says the new number in a polite live region ("Calories, 1,550"); typing says nothing
    const before = await p.locator("#plan-calories").inputValue();
    await p.getByRole("button", { name: "Increase", exact: true }).first().click();
    const after = await p.locator("#plan-calories").inputValue();
    const said = await p.locator("#plan-calories").evaluate((el) => el.closest(".group\\/step")?.querySelector("[aria-live='polite']")?.textContent ?? null);
    must(after !== before && said === `Calories, ${Number(after).toLocaleString("en-GB")}`, `your plan: + from ${before} to ${after} said ${JSON.stringify(said)}`);
    await p.locator("#plan-calories").fill(before);
    must((await p.locator("#plan-calories").evaluate((el) => el.closest(".group\\/step")?.querySelector("[aria-live='polite']")?.textContent)) === "", "your plan: typing a number still has the live region speaking");
    await p.waitForTimeout(500);
  }],
  ["welcome: save your plan", "/app/welcome", false, async (p) => { await toPlan(p); await p.getByRole("button", { name: /^(Save my plan|Save and go to Home)$/ }).click(); await p.getByRole("heading", { level: 1, name: /^Save your plan/ }).waitFor(); await p.waitForTimeout(800); }],
  // Settings › Help › "Show me what Numbite can do" (it replaced the tour's replay)
  ["welcome: replay 1 of 2 (Settings › Help)", "/app/welcome?showcase=1", false, async (p) => { await toReplay(p, 1); }],
  ["welcome: replay 2 of 2", "/app/welcome?showcase=1", false, async (p) => { await toReplay(p, 2); }],
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
  ["welcome shops", "/app/welcome", false, async (p) => { await toShops(p); await shopTile(p.getByRole("group", { name: "Your supermarkets" }), "Sainsbury's").click(); await p.waitForTimeout(500); }],
  ["welcome: foods to avoid", "/app/welcome", false, async (p) => { await toAvoid(p); await p.getByRole("group", { name: "Allergies to avoid" }).getByRole("button", { name: /^Peanuts/ }).click(); await p.getByRole("group", { name: "Your diet" }).getByRole("button", { name: /^Vegan/ }).click(); await p.waitForTimeout(500); }],
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
  ["welcome: about you", "/app/welcome", false, async (p) => { await toAbout(p); await p.getByLabel("Age in years").fill("150"); await p.getByRole("button", { name: "Continue", exact: true }).click({ force: true }); await p.getByText("Enter your age as a whole number from 18 to 100.").waitFor(); await p.waitForTimeout(500); }],
  ["welcome: about you, part of a stone", "/app/welcome", false, async (p) => { await toAbout(p); await p.getByLabel("Stone").fill("11.5"); await p.getByText("Use the pounds box for part of a stone.").waitFor(); await p.waitForTimeout(500); }],
  ["welcome: about you, cm and kg", "/app/welcome", false, async (p) => { await toAbout(p); await p.getByRole("radiogroup", { name: "Height unit" }).getByRole("radio", { name: "cm", exact: true }).click(); await p.getByRole("radiogroup", { name: "Weight unit" }).getByRole("radio", { name: "kg", exact: true }).click(); await p.getByLabel("Kilograms").fill("70"); await p.waitForTimeout(500); }],
  ["welcome: how active", "/app/welcome", false, async (p) => { await toActive(p); await p.waitForTimeout(500); }],
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
    // (each page starts on the welcome cover's Get started: a step reached on an earlier page is forgotten, not offered as "Carry on")
    await page.addInitScript(([s, sv, lg]) => { localStorage.setItem("mm.v1.settings", s); localStorage.setItem("mm.v1.saved", sv); localStorage.setItem("mm.v1.log", lg); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); localStorage.removeItem("mm.v1.welcomeProgress"); }, [settings(pro), saved, log]);
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
