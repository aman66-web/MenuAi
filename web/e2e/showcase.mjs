// The welcome steps as rebuilt on 20 November 2026 (founder, 12:21-12:37: one question a screen, a short heading, a big input, far fewer words, pictures over
// text, no labels on what the app shows, no "Step n of N" written, no Pip speech bubbles): seven screens, then the account, then straight to Home with its one
// toast and the one-time Start here card (app/app/welcome/, lib/mm/welcomeSteps.ts):
//    1 What's your goal? · 2 Anything you avoid? · 3 Where do you shop? · 4 Recipes from {shop} · 5 About you · 6 How active are you? · 7 Your plan ·
//    8 Save your plan (the account; a run that starts signed in has 7 steps and no account step)
// Checked here:
// - (a) a plain run: the bar (8 segments, nothing written), "Step n of 8" heard with each headline, Skip only on 1, 2, 3, 5 and 6, Pip only beside step 1's
//   heading with no bubble, the goal tiles, the diets as pictures of our own recipes, the shops' logo tiles, the two recipes and the one chosen, About you on one
//   screen, the activity tiles, Your plan (the big numbers, the picture week with its two chips and its first shop and each week after at Sainsbury's, the
//   restaurant row in the chains' own photos with their
//   captions, never Costa), the account's three ways in and "Not now", Home's toast and Start here card, and what is (and isn't) stored or sent;
// - (b) the questions about the person skipped (Skip on 5 or 6): "Starting numbers.", Back to About you; an age under 18 goes straight to Your plan with no
//   numbers and no Change; About you's grey Continue says what is missing and focuses that box;
// - (c) Skip on 1 to 3 saves nothing for that question; Back goes to the last screen shown;
// - (d) vegan with milk avoided: the recipes, the week and the restaurant dishes fit; (e) GLP-1's note under the tiles and on Your plan;
// - (f) leaving and coming back: "Carry on from step {n}" (About you for the questions about the person, the account with "Welcome back. Your plan is still
//   here."), "Start again", and a note left by the eleven-step screens (eatOut, week) read in the new steps;
// - (g) a run that starts signed in (7 steps, "Continue" on Your plan); (h) an existing account signing in at the account step (its own settings win) through a
//   fake backend that uses the real merge rules;
// - (i) no connection for the menus or the shops' files (plain lines, no digits) and the account step offline;
// - (j) 375x667 and 320x568: the account's three ways on screen without scrolling, no sideways scroll; (k) Reduce Motion; (l) 200% text at 360x780: no sideways
//   scroll and 44 px targets on all eight screens; (m) axe on every screen; (n) the replay (?showcase=1): screens 4 and 7 with Close, Next and Done, nothing kept.
// Runs where sign-in is optional (the account step has "Not now"), as the dev server and the test builds with sample data are. Run with the server's switches:
//   BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 node e2e/showcase.mjs        (ONLY="(c)" runs one step)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mergeStates, validateState } from "../lib/mm/syncMerge.ts";
import * as W from "./welcome-steps.mjs";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
/** Premium is sold in this build (lib/mm/config.ts GATING_ENABLED): Your plan's week shows Meal plan's one Premium badge. */
const GATED = process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

let passed = 0, failed = 0;
async function step(name, fn) { if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return; try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0], [...String(e.stack).matchAll(/(showcase|welcome-steps)\.mjs:\d+/g)].map((m) => m[0]).join(" < ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

// ------------------------------------------------------------------------------------------------ a fake backend for the sign-in steps (the real merge rules)
const server = { rows: new Map(), apiCalls: [] };
const rowsOf = (uid) => (server.rows.has(uid) ? server.rows.get(uid) : server.rows.set(uid, new Map()).get(uid));
async function install(ctx, device) {
  await ctx.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
    server.apiCalls.push(`${req.method()} ${path}`);
    const respond = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (path === "auth/session") return respond(200, { user: device.user });
    if (path === "auth/email/start") return respond(200, { ok: true });
    if (path === "auth/email/verify") {
      if (body.code !== "123456") return respond(400, { error: "invalid_code", message: "That code isn't right, or it has run out. Ask for a new one." });
      device.user = { id: `user-${body.email}`, email: body.email };
      return respond(200, { ok: true, user: device.user });
    }
    if (path === "auth/signout") { device.user = null; return respond(200, { ok: true }); }
    if (!device.user) return respond(401, { error: "unauthorized" });
    if (path === "sync" && req.method() === "GET") return respond(200, { ok: true, stores: Object.fromEntries(rowsOf(device.user.id)) });
    const m = /^sync\/(\w+)$/.exec(path);
    if (m && req.method() === "PUT") {
      const sent = validateState(m[1], body.state);
      if (!sent) return respond(400, { error: "invalid_request" });
      const rows = rowsOf(device.user.id);
      const stored = rows.get(m[1]);
      const merged = stored ? mergeStates(m[1], stored, sent, Date.now()) : mergeStates(m[1], sent, sent, Date.now());
      rows.set(m[1], merged);
      return respond(200, { ok: true, state: merged });
    }
    return respond(404, { error: "not_found" });
  });
}

/** A new phone: its own storage, Pip's tips stopped (e2e/coach.mjs covers them). `signIn`: the fake backend answers its sign-in and sync. */
async function phone({ viewport = { width: 402, height: 874 }, reducedMotion = "no-preference", seed = null, signIn = false } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"] } }));
    for (const [k, v] of Object.entries(s ?? {})) localStorage.setItem(k, v);
  }, seed);
  const device = { user: null };
  if (signIn) await install(ctx, device);
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, device, requests, errors };
}
const env = (data) => JSON.stringify({ v: 1, data });
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null")?.data ?? null, key);
const settingsOf = (page) => stored(page, "mm.v1.settings");
const OWN_DATA_KEYS = ["mm.v1.log", "mm.v1.saved", "mm.v1.favorites", "mm.v1.shopping", "mm.v1.savedRecipes", "mm.v1.myRecipes", "mm.v1.water", "mm.v1.reminders"];
const pips = (page) => page.locator("main svg.pip, main [role='img'][aria-label^='Pip']").count();
const bubbles = (page) => page.locator("main .speech").count();
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
const running = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName ?? a.transitionProperty ?? "animation"));
async function axe(page, where) {
  await settle(page);
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, `${where}: ` + v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
}
/** Every button and link on screen at least 44 px both ways (the inert recipe tiles under their own choose buttons don't count). */
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll("button, a[href]")].flatMap((el) => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none" || el.closest("dialog:not([open]), [inert], nextjs-portal")) return [];
  return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
}));
/** The digits drawn in a region (none while it loads or after a failure: CLAUDE.md rule 1). */
const digitsIn = (page, name) => page.getByRole("region", { name, exact: true }).evaluate((el) => (el.innerText.match(/\d/g) ?? []).length);
/** "Step n of N" written where it can be seen (it must only be heard, in the headline's screen-reader text). */
const writtenCounter = (page) => page.evaluate(() => [...document.querySelectorAll("main *")].some((el) => !el.closest(".sr-only") && [...el.childNodes].some((n) => n.nodeType === 3 && /Step \d+ of \d+/.test(n.textContent ?? ""))));
const home = (page) => page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/", { timeout: 30000 });
/** Your plan's week, once it is made (its two chips), or its words-only line. */
const weekSettled = (page) => page.getByText("An example of what you can make.", { exact: true }).or(page.getByText("Meal plan makes your week from your shop, with one shopping list.")).first().waitFor({ timeout: 60000 });
/** The restaurant row's dishes, once they are there (each card's screen-reader line: "{dish} at {chain}: {kcal} calories."). */
const dishLines = (page) => page.getByRole("region", { name: "Restaurants", exact: true }).locator("li .sr-only").allInnerTexts();
/** Email sign-in on the full screens (the account step): "What's your email?", Continue, "Enter the code" (it goes on with the sixth digit). */
async function emailSignIn(scope, email) {
  await scope.getByRole("button", { name: "Continue with email" }).click();
  await scope.getByLabel("What's your email?").fill(email);
  await scope.getByRole("button", { name: "Continue", exact: true }).click();
  await scope.getByLabel("Enter the code").fill("123456");
}
// (not "butter", "milk" or "cream": peanut butter, oat milk and coconut cream are vegan)
const MEAT = /\b(chicken|beef|pork|bacon|fish|salmon|tuna|prawns?|ham|cheese|cheddar|mozzarella|halloumi|feta|egg|eggs|turkey|lamb|yogh?urt|honey|chorizo)\b/i;

// ------------------------------------------------------------------------------------------------ the steps

await step("(a) a plain run: the bar alone with 8 segments, 'Step n of 8' heard with each headline; Skip only on 1, 2, 3, 5 and 6; Pip only beside step 1's heading, with no bubble; pictures for the diets and shops; Your plan's numbers, picture week and restaurant photos; the account's three ways and 'Not now'; Home's toast and Start here; only the settings, the marks and Home's note stored", async () => {
  const { ctx, page, requests, errors } = await phone();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started", exact: true }).waitFor({ timeout: 120000 });
  expect((await W.segments(page)) === 0, "the cover has a bar");
  await W.press(page, "Get started");
  const check = async (id, n, { skip, pip = 0 }) => {
    await W.onStep(page, id);
    await W.expectCounter(page, n, 8);
    expect((await W.segments(page)) === 8, `${id}: ${await W.segments(page)} segments`);
    expect((await W.litSegments(page)) === n, `${id}: ${await W.litSegments(page)} segments lit, not ${n}`);
    expect(!(await writtenCounter(page)), `${id}: "Step n of N" is written on screen`);
    expect((await W.skipButton(page).count()) === (skip ? 1 : 0), `${id}: Skip ${skip ? "missing" : "shown"}`);
    expect((await pips(page)) === pip, `${id}: ${await pips(page)} Pips`);
    expect((await bubbles(page)) === 0, `${id}: a speech bubble`);
  };
  // 1: big goal tiles, nothing ticked, Continue grey with its reason
  await check("goal", 1, { skip: true, pip: 1 });
  expect((await page.getByRole("radiogroup", { name: "Your goal" }).getByRole("radio").count()) === 5, "five goals");
  expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, "a goal is ticked before a tap");
  expect(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), "Continue works before a goal is tapped");
  await page.getByText("Pick one, or tap Skip.").waitFor();
  await W.goal(page, "Build muscle");
  // 2: the diets as pictures of our own recipes (each different), the allergies as chips
  await check("avoid", 2, { skip: true });
  const pics = await page.getByRole("group", { name: "Your diet" }).locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  expect(pics.length >= 6 && new Set(pics).size === pics.length && pics.every((s) => /recipe/i.test(s ?? "")), "the diet pictures: " + JSON.stringify(pics));
  await page.getByRole("button", { name: "Nothing to avoid", exact: true }).waitFor();
  await W.allergyChip(page, "Peanuts").click();
  expect((await W.allergyChip(page, "Peanuts").getAttribute("aria-pressed")) === "true", "Peanuts isn't ticked");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // 3: the shops' logo tiles; "No recipes yet" the only extra words
  await check("shops", 3, { skip: true });
  const shopGroup = page.getByRole("group", { name: "Your supermarkets" });
  expect((await shopGroup.getByRole("button").count()) >= 8, "the shop tiles");
  expect((await shopGroup.locator("img").count()) >= 6, "the shops' logos");
  expect(/No recipes yet/.test(await W.shopTile(shopGroup, "Tesco").innerText()), "Tesco's tile doesn't say No recipes yet");
  await W.shops(page, ["Sainsbury's"]);
  // 4: two recipes at Sainsbury's, one chosen
  await check("recipes", 4, { skip: false });
  await W.headline(page, "recipes").filter({ hasText: "Recipes from Sainsbury's" }).waitFor();
  await page.getByText("Tap one to cook first.").waitFor();
  const tiles = W.recipeTiles(page);
  await tiles.first().waitFor({ timeout: 45000 });
  expect((await tiles.count()) === 2, `${await tiles.count()} recipes`);
  const recipe = await W.recipeTileName(tiles.first());
  await tiles.first().click();
  expect((await tiles.first().getAttribute("aria-checked")) === "true", "the recipe tapped isn't chosen");
  await page.getByText("Your first recipe", { exact: true }).first().waitFor();
  expect(!/\bFree\b/.test(await page.locator("main").innerText()), "a Free tag on the recipes");
  await W.press(page, "Continue");
  // 5: About you on one screen: the privacy line, sex, one unit switch, age (never a date of birth), height and weight
  await check("about", 5, { skip: true });
  await page.getByText("Only used to work out your numbers. Never saved or sent.").waitFor();
  expect(!/birth|name/i.test(await page.locator("main").innerText()), "a date of birth or name is asked for");
  await W.aboutYou(page, { sex: "Male", age: 34, height: [5, 11], weight: [12, 4] });
  await W.aboutNext(page);
  // 6: the activity tiles; See my plan grey until one is tapped
  await check("active", 6, { skip: true });
  expect(await page.getByRole("button", { name: "See my plan", exact: true }).isDisabled(), "See my plan works before a tile is tapped");
  await W.active(page, "Lightly active");
  // 7: Your plan
  await check("plan", 7, { skip: false });
  const nums = await W.planNumbers(page);
  expect(nums.calories > 1500 && nums.calories < 4000 && nums.protein > 60, "the plan's numbers: " + JSON.stringify(nums));
  expect((await page.getByText("Starting numbers.", { exact: true }).count()) === 0, "'Starting numbers.' for numbers worked out");
  await page.getByText("Suggested starting points, not medical advice. Adjust any time.").waitFor();
  await page.getByRole("button", { name: /Where these numbers come from/ }).first().waitFor();
  await weekSettled(page);
  await page.getByText("1 shopping list", { exact: true }).waitFor();
  const days = await page.getByRole("region", { name: "Your week", exact: true }).locator("ul.sr-only li").allInnerTexts();
  // an example week (founder 2026-11-20): pictures and dish names only, no calories a day
  expect(days.length === 7 && days.every((d) => /^\w+day: .+\.$/.test(d) && !/calories/.test(d)), "the week: " + JSON.stringify(days.slice(0, 2)));
  await page.getByText("Your shop's prices", { exact: true }).waitFor();
  // its shopping at Sainsbury's (founder 2026-11-20, "week one cost and then the week afterwards costs"): the first shop more than each week after, why, and
  // the shop's own shelf prices; still "An example of what you can make."
  const weekBox = page.getByRole("region", { name: "Your week", exact: true });
  const firstShop = weekBox.getByText(/^Your first shop: about £[\d,]+$/);
  await firstShop.waitFor({ timeout: 60000 });
  const pounds = async (l) => Number((await l.innerText()).replace(/[^\d]/g, ""));
  const [weekOne, weekAfter] = [await pounds(firstShop), await pounds(weekBox.getByText(/^Each week after: about £[\d,]+$/))];
  expect(weekOne > weekAfter && weekAfter > 0, `the first shop £${weekOne}, each week after £${weekAfter}`);
  await weekBox.getByText(/^It includes .+(, which last for weeks| that last for weeks)\.$/).waitFor();
  await weekBox.getByText(/^Prices are Sainsbury's shelf prices, checked .+, and vary by store\.$/).waitFor();
  await weekBox.getByText("An example of what you can make.", { exact: true }).waitFor();
  expect((await page.getByText(/^About £[\d,]+ for the week$/).count()) === 0 && (await page.getByText(/kcal yet/).count()) === 0, "a worked-out week (a price or a calorie gap) on Your plan");
  expect((await page.getByRole("region", { name: "Your week", exact: true }).locator("img").count()) >= 7, "the week's pictures");
  expect((await page.getByRole("region", { name: "Your week", exact: true }).getByText("Premium", { exact: true }).count()) === (GATED ? 1 : 0), "Meal plan's Premium badge");
  await page.getByRole("heading", { level: 2, name: /^[\d,]+ restaurants, their own figures$/ }).waitFor({ timeout: 45000 });
  const dishes = await dishLines(page);
  expect(dishes.length >= 3 && dishes.every((d) => / at .+: [\d,]+ calories\.$/.test(d)) && !dishes.some((d) => /at Costa/.test(d)), "the restaurant dishes: " + JSON.stringify(dishes));
  const captions = await page.getByRole("region", { name: "Restaurants", exact: true }).locator("figcaption").allInnerTexts();
  expect(captions.length > 0 && captions.every((c) => /^Photo from the .+ website$/.test(c)), "the photo captions: " + JSON.stringify(captions));
  await page.getByText("Not affiliated with any restaurant or shop shown.").waitFor();
  // Change: the calorie and protein boxes, Save keeps the number
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.locator("#plan-calories").fill("2500");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).waitFor();
  expect((await W.planNumbers(page)).calories === 2500, "Change and Save didn't keep 2,500");
  expect((await settingsOf(page)).dailyCalories === 2500, "2,500 isn't saved");
  await W.planNext(page);
  // 8: the account: one line, the recipe waiting, three ways in, Not now; no Pip (founder 2026-11-20: Pip taken off the account step)
  await check("save", 8, { skip: false });
  await page.getByText("Free, and it keeps your plan safe on any phone.").waitFor();
  await page.getByText(`Waiting for you on Home: ${recipe}.`).waitFor();
  for (const way of ["Continue with Apple", "Continue with Google", "Continue with email"]) expect(await page.getByText(way, { exact: true }).isVisible(), `${way} isn't offered`);
  await W.press(page, "Not now");
  await home(page);
  await page.getByText("You're in. Sign in any time in Settings to keep your goal and numbers safe.").waitFor({ timeout: 20000 });
  await page.getByRole("region", { name: "Start here" }).getByText(`Your first recipe: ${recipe}`).waitFor();
  // stored: the settings, the marks and Home's note; nothing of the person's own, no body answers, no progress note
  const s = await settingsOf(page);
  expect(s.hasCompletedOnboarding === true && s.goal === "buildMuscle" && JSON.stringify(s.shops) === JSON.stringify(["sainsburys"]) && s.hasSetTargets === true && s.dailyCalories === 2500 && (s.preferences?.avoidAllergens ?? []).includes("peanuts"), "settings: " + JSON.stringify(s));
  expect((await stored(page, "mm.v1.tour")) === 2, "mm.v1.tour " + (await stored(page, "mm.v1.tour")));
  expect((await page.evaluate(() => localStorage.getItem("mm.v1.welcomeProgress"))) === null, "the progress note is still there");
  for (const k of OWN_DATA_KEYS) { const v = await stored(page, k); expect(v === null || (Array.isArray(v) && v.length === 0), `${k} was written: ${JSON.stringify(v)}`); }
  const all = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie + location.href);
  expect(!/"age"\s*:|"weight"\s*:|"height"\s*:|"sex"\s*:|"activity"\s*:|birth/i.test(all), "an answer about the body was stored");
  const sent = requests.filter((r) => /"(age|sex|weight|height|activity)"|mm\.v1\.welcomeProgress/.test(r.body) || /age=34|welcomeProgress/.test(r.url));
  expect(sent.length === 0, "sent: " + sent.slice(0, 2).map((r) => r.url).join(" | "));
  expect(errors.length === 0, "page errors: " + errors.join(" | "));
  await ctx.close();
});

await step("(b) the questions about the person skipped: Skip on About you and on How active are you? both go to Your plan with 'Starting numbers.'; Back to About you; an age under 18 goes straight to Your plan with no numbers, no Change and no week; About you's grey Continue says what is missing and focuses that box", async () => {
  const { ctx, page } = await phone();
  await W.toAbout(page, BASE);
  // nothing typed: the button offers to skip (founder 2026-11-20); something typed: the grey Continue (aria-disabled, still tappable), the reason, the Age box focused
  await page.getByRole("button", { name: "Skip these", exact: true }).waitFor();
  await page.getByLabel("Feet", { exact: true }).fill("6");
  await page.getByText("Add your age, height and weight, or tap Skip.").waitFor();
  expect((await page.getByRole("button", { name: "Continue", exact: true }).getAttribute("aria-disabled")) === "true", "About you's Continue isn't grey with only the feet typed");
  await page.getByRole("button", { name: "Continue", exact: true }).click({ force: true });
  await W.onStep(page, "about");
  expect(await page.evaluate(() => document.activeElement?.id === "welcome-age"), "the Age box isn't focused after the grey Continue");
  await W.skipBody(page);
  await W.expectCounter(page, 7, 8);
  await page.getByText("Starting numbers.", { exact: true }).waitFor();
  expect((await W.litSegments(page)) === 7, "the bar after the jump");
  await W.backButton(page).click();
  await W.onStep(page, "about");
  // Skip on How active are you? goes there too
  await W.aboutYou(page, { sex: "Female", age: 52, height: [5, 4], weight: [10, 2] });
  await W.aboutNext(page);
  await W.skipBody(page);
  await page.getByText("Starting numbers.", { exact: true }).waitFor();
  await W.backButton(page).click();
  await W.onStep(page, "about");
  expect((await page.getByLabel("Age in years").inputValue()) === "", "the age was kept after Skip");
  // under 18: straight to Your plan, nothing worked out
  await page.getByLabel("Age in years").fill("16");
  await W.aboutNext(page, "plan");
  await page.getByText("Ask a doctor or dietitian for targets.").waitFor();
  expect((await page.getByRole("button", { name: "Change", exact: true }).count()) === 0, "Change for an under-18");
  expect((await page.getByText(/^About £[\d,]+ for the week$/).count()) === 0, "a priced week for an under-18");
  await W.backButton(page).click();
  await W.onStep(page, "about");
  await ctx.close();
});

await step("(c) Skip on 1, 2 and 3 saves nothing for that question; Back goes to the last screen shown; the whole way skipped reaches Home with starting numbers", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await W.goal(page, null);
  await W.backButton(page).click();
  await W.onStep(page, "goal");
  expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, "a goal is ticked after Skip");
  await W.goal(page, null);
  await W.dietTile(page, "Vegan").click();
  await W.skipButton(page).click();
  await W.onStep(page, "shops");
  await W.shopTile(page.getByRole("group", { name: "Your supermarkets" }), "Asda").click();
  await W.skipButton(page).click();
  await W.onStep(page, "recipes");
  await W.backButton(page).click();
  await W.onStep(page, "shops");
  expect((await W.shopTile(page.getByRole("group", { name: "Your supermarkets" }), "Asda").getAttribute("aria-pressed")) !== "true", "Asda is still ticked after Skip");
  await W.backButton(page).click();
  await W.onStep(page, "avoid");
  expect((await W.dietTile(page, "Vegan").getAttribute("aria-pressed")) !== "true", "Vegan is still ticked after Skip");
  await W.backButton(page).click();
  await W.onStep(page, "goal");
  await W.backButton(page).click();
  await page.getByRole("button", { name: "Get started", exact: true }).or(page.getByRole("button", { name: /^Carry on from step / })).first().waitFor();
  await ctx.close();
  const two = await phone();
  await W.skipToHome(two.page, BASE);
  const s = await settingsOf(two.page);
  expect(s.hasCompletedOnboarding === true && !s.hasSetTargets && !(s.shops?.length) && !s.preferences?.veganOnly, "settings after skipping everything: " + JSON.stringify(s));
  await two.ctx.close();
});

await step("(d) vegan with milk avoided: the diet tile shows a picture; the two recipes, the week and the restaurant dishes are vegan (or the plain line)", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await W.goal(page, "Maintain");
  await W.onStep(page, "avoid");
  expect((await W.dietTile(page, "Vegan").locator("img").count()) === 1, "the Vegan tile has no picture");
  await W.avoid(page, { diets: ["Vegan"], allergies: ["Milk"] });
  await W.shops(page, ["Sainsbury's"]);
  await page.locator("[role='radiogroup'][aria-label='Your first recipe'] [role='radio'], section[aria-label='Recipes'] p[role='status']").first().waitFor({ timeout: 45000 });
  for (const name of await W.recipeTiles(page).evaluateAll((els) => els.map((e) => e.querySelector("span.line-clamp-3")?.textContent ?? ""))) expect(!MEAT.test(name), "a recipe for a vegan: " + name);
  await W.press(page, "Continue");
  await W.skipBody(page);
  await weekSettled(page);
  const days = await page.getByRole("region", { name: "Your week", exact: true }).locator("ul.sr-only li").allInnerTexts();
  for (const d of days) expect(!MEAT.test(d.replace(/^\w+day: /, "")), "the week for a vegan: " + d);
  await page.getByRole("region", { name: "Restaurants", exact: true }).waitFor({ timeout: 45000 });
  await page.waitForTimeout(3000);
  for (const d of await dishLines(page)) expect(!MEAT.test(d.split(" at ")[0]), "a restaurant dish for a vegan: " + d);
  await ctx.close();
});

await step("(e) GLP-1: the medicine line under the goals (no bubble) and on Your plan; no 'small appetite'", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  const NOTE = "If you take a GLP-1 medication, follow the advice of your doctor or pharmacist. Numbite doesn't give medical advice.";
  await page.getByRole("radio", { name: /^I'm on a GLP-1 medication/ }).click();
  await page.getByText(NOTE).waitFor();
  expect((await bubbles(page)) === 0, "a speech bubble on step 1");
  await W.press(page, "Continue");
  await W.avoid(page);
  await W.shops(page);
  await W.recipes(page);
  await W.skipBody(page);
  await page.getByText(NOTE).waitFor();
  expect(!/small appetite/i.test(await page.locator("main").innerText()), "'Small appetite' is written");
  await ctx.close();
});

await step("(f) leaving and coming back: 'Carry on from step 3' and 'Start again'; the questions about the person resume at About you with nothing kept; the account resumes with 'Welcome back. Your plan is still here.'; a note from the eleven-step screens (eatOut, week) is read in the new steps", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await W.goal(page, "Maintain");
  await W.avoid(page);
  // leave at step 3
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome/);
  await page.getByRole("button", { name: "Carry on from step 3", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Start again", exact: true }).waitFor();
  await W.press(page, "Carry on from step 3");
  await W.onStep(page, "shops");
  await W.backButton(page).click();
  await W.onStep(page, "avoid");
  await W.backButton(page).click();
  await W.onStep(page, "goal");
  expect((await page.getByRole("radio", { name: /^Maintain/ }).getAttribute("aria-checked")) === "true", "the goal chosen before isn't ticked after Carry on");
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await W.shops(page);
  await W.recipes(page);
  await W.aboutYou(page, { sex: "Female", age: 52 });
  // leave at About you, then at How active are you?: both carry on at About you, with nothing about the body kept
  await page.reload();
  await W.press(page, "Carry on from step 5");
  await W.onStep(page, "about");
  expect((await page.getByLabel("Age in years").inputValue()) === "", "the age was kept");
  expect((await page.getByRole("radio", { name: "Female", exact: true }).getAttribute("aria-checked")) !== "true", "the sex was kept");
  await W.skipBody(page);
  await W.planNext(page);
  await W.onStep(page, "save");
  await page.goto(BASE + "/app");
  await W.press(page, "Carry on from step 8");
  await W.onStep(page, "save");
  await page.getByText("Welcome back. Your plan is still here.").waitFor();
  await W.backButton(page).click();
  await W.onStep(page, "plan");
  // Start again: step 1, nothing ticked
  await page.goto(BASE + "/app");
  await W.press(page, "Start again");
  await W.onStep(page, "goal");
  expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, "a goal is ticked after Start again");
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.welcomeProgress") || "null")?.data?.step)) === "goal", "the note after Start again");
  await ctx.close();
  // a note left by the eleven-step screens: eatOut is the shops now (step 3), week is Your plan (step 7)
  for (const [old, n, id] of [["eatOut", 3, "shops"], ["week", 7, "plan"], ["size", 5, "about"]]) {
    const p = await phone({ seed: { "mm.v1.welcomeProgress": env({ step: old, savedOn: "2026-11-19" }) } });
    await p.page.goto(BASE + "/app/welcome");
    await p.page.getByRole("button", { name: `Carry on from step ${n}`, exact: true }).click({ timeout: 60000 });
    await W.onStep(p.page, id);
    await p.ctx.close();
  }
});

await step("(g) a run that starts signed in: 'Step 1 of 7' with 7 segments; Your plan's button 'Continue'; no account step; Home says 'You're signed in. Your goal and daily numbers are saved.'", async () => {
  const { ctx, page } = await phone({ signIn: true });
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click({ timeout: 120000 });
  const sheet = page.getByRole("dialog");
  await emailSignIn(sheet, "new@example.com");
  await sheet.waitFor({ state: "hidden", timeout: 20000 });
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await W.onStep(page, "goal");
  await W.expectCounter(page, 1, 7);
  expect((await W.segments(page)) === 7, `${await W.segments(page)} segments`);
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await W.shops(page);
  await W.recipes(page);
  await W.skipBody(page);
  await W.expectCounter(page, 7, 7);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await home(page);
  await page.getByRole("status").filter({ hasText: "You're signed in. Your goal and daily numbers are saved." }).waitFor({ timeout: 20000 });
  expect((await settingsOf(page)).hasCompletedOnboarding === true, "not set up");
  await ctx.close();
});

await step("(h) an existing account signing in at the account step: its own settings win, and Home says 'Signed in. Your saved settings are back.'", async () => {
  // phone A: set up (goal Build muscle, 2,600 kcal) and signed in from Settings, so its settings reach the server
  const a = await phone({ signIn: true, seed: { "mm.v1.settings": env({ goal: "buildMuscle", dailyCalories: 2600, dailyProtein: 180, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} }), "mm.v1.tour": env(2) } });
  await a.page.goto(BASE + "/app/settings");
  await a.page.getByRole("button", { name: "Sign in", exact: true }).first().click({ timeout: 120000 });
  await emailSignIn(a.page.getByRole("dialog"), "back@example.com");
  const end = Date.now() + 20000;
  while (!rowsOf("user-back@example.com").has("settings") && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
  expect(rowsOf("user-back@example.com").has("settings"), "phone A's settings never reached the server");
  await a.ctx.close();
  // phone B: a new run (Lose weight), then the same account at the account step
  const b = await phone({ signIn: true });
  await W.startSteps(b.page, BASE);
  await W.goal(b.page, "Lose weight");
  await W.avoid(b.page);
  await W.shops(b.page);
  await W.recipes(b.page);
  await W.skipBody(b.page);
  await W.planNext(b.page);
  await W.onStep(b.page, "save");
  await emailSignIn(b.page, "back@example.com");
  await home(b.page);
  await b.page.getByRole("status").filter({ hasText: "Signed in. Your saved settings are back." }).waitFor({ timeout: 20000 });
  const s = await settingsOf(b.page);
  expect(s.goal === "buildMuscle" && s.dailyCalories === 2600 && s.hasCompletedOnboarding === true, "phone B's settings: " + JSON.stringify(s));
  expect((await b.page.evaluate(() => localStorage.getItem("mm.v1.welcomeProgress"))) === null, "the progress note is still there");
  await b.ctx.close();
});

await step("(i) no connection for the menus or the shops' files: step 4 says so in a plain line with no digits; Your plan still shows the example week (no price) and no restaurant dish is drawn; the account step offline says so before any tap", async () => {
  const { ctx, page } = await phone();
  await ctx.route(/\/(menus|menus-sample|groceries)\//, (r) => r.abort("internetdisconnected"));
  await W.startSteps(page, BASE);
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await W.shops(page);
  await page.getByText("Recipes can't load just now. You'll find them under Recipes.").waitFor({ timeout: 25000 });
  expect((await digitsIn(page, "Recipes")) === 0, "digits in the recipes without the shop's file");
  await W.recipes(page);
  await W.skipBody(page);
  // the week is an example from the recipe book (founder 2026-11-20), so it needs no shop file and still shows, with no price
  await page.getByText("An example of what you can make.", { exact: true }).waitFor({ timeout: 30000 });
  expect((await page.getByText(/^About £[\d,]+ for the week$/).count()) === 0 && (await page.getByText(/^(Your first shop|Each week after): /).count()) === 0, "a price on the example week");
  expect((await page.getByRole("region", { name: "Restaurants", exact: true }).locator("li").count()) === 0, "restaurant dishes without the menus");
  await W.planNext(page);
  await W.onStep(page, "save");
  await ctx.setOffline(true);
  await page.getByRole("status").filter({ hasText: "You're offline. Connect to the internet to make your account. Your answers are kept on this phone." }).waitFor({ timeout: 10000 });
  await page.getByText("Continue with email", { exact: true }).waitFor();
  await ctx.setOffline(false);
  await ctx.close();
});

await step("(j) 375x667 and 320x568: no sideways scroll on Your plan; the account's three ways in all on screen without scrolling", async () => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
    const { ctx, page } = await phone({ viewport });
    const where = `${viewport.width}x${viewport.height}`;
    await W.toAbout(page, BASE, { choose: true });
    await W.skipBody(page);
    await weekSettled(page);
    await page.waitForTimeout(1500);
    expect((await overflow(page)) <= 0, `${where}: Your plan scrolls sideways by ${await overflow(page)}`);
    await W.planNext(page);
    await W.onStep(page, "save");
    await page.waitForTimeout(400);
    const offscreen = await page.evaluate(() => ["Continue with Apple", "Continue with Google", "Continue with email"].filter((w) => {
      const el = [...document.querySelectorAll("a, button")].find((b) => b.textContent.trim() === w);
      return !el || el.getBoundingClientRect().bottom > innerHeight;
    }));
    expect(offscreen.length === 0, `${where}: below the fold on the account step: ${offscreen.join(", ")}`);
    await ctx.close();
  }
});

await step("(k) Reduce Motion: nothing runs on steps 1, 4, 7 and 8", async () => {
  const { ctx, page } = await phone({ reducedMotion: "reduce" });
  const still = async (where) => { await page.waitForTimeout(400); const r = await running(page); expect(r.length === 0, `${where} animates: ${r.join(", ")}`); };
  await W.startSteps(page, BASE);
  await still("step 1");
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await W.shops(page);
  await W.recipeTiles(page).first().waitFor({ timeout: 45000 });
  await still("step 4");
  await W.recipes(page);
  await W.skipBody(page);
  await weekSettled(page);
  await still("step 7");
  await W.planNext(page);
  await W.onStep(page, "save");
  await still("step 8");
  await ctx.close();
});

await step("(l) 200% text at 360x780: no sideways scroll and every button and link at least 44 px on all eight screens", async () => {
  const { ctx, page } = await phone({ viewport: { width: 360, height: 780 } });
  const big = () => page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const check = async (id) => {
    await W.onStep(page, id);
    await big();
    await page.waitForTimeout(500);
    expect((await overflow(page)) <= 0, `${id}: scrolls sideways by ${await overflow(page)}`);
    const small = await smallTargets(page);
    expect(small.length === 0, `${id}: under 44 px: ${small.slice(0, 3).join(", ")}`);
  };
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started", exact: true }).click({ timeout: 120000 });
  await check("goal");
  await W.goal(page, "Maintain");
  await check("avoid");
  await W.press(page, "Nothing to avoid");
  await check("shops");
  await W.press(page, "Continue");
  await W.recipeTiles(page).first().waitFor({ timeout: 45000 }).catch(() => undefined);
  await check("recipes");
  await W.press(page, "Continue");
  await check("about");
  await W.aboutYou(page, { sex: "Female", age: 40, height: [5, 5], weight: [10, 4] });
  await W.press(page, "Continue");
  await check("active");
  await page.getByRole("radio", { name: "Lightly active", exact: true }).click();
  await W.press(page, "See my plan");
  await weekSettled(page);
  await check("plan");
  await W.planNext(page);
  await check("save");
  await ctx.close();
});

await step("(m) axe: no violations on any of the eight screens (GLP-1 picked, an allergy ticked, a shop ticked, a recipe chosen, a body typed, the plan made), nor on Home after", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await page.waitForTimeout(1200); // Pip's entrance
  await axe(page, "step 1");
  await page.getByRole("radio", { name: /^I'm on a GLP-1 medication/ }).click();
  await axe(page, "step 1 with GLP-1 picked");
  await W.press(page, "Continue");
  await W.onStep(page, "avoid");
  await W.allergyChip(page, "Milk").click();
  await W.dietTile(page, "Vegetarian").click();
  await axe(page, "step 2");
  await W.press(page, "Continue");
  await W.onStep(page, "shops");
  await W.shopTile(page.getByRole("group", { name: "Your supermarkets" }), "Morrisons").click();
  await axe(page, "step 3");
  await W.press(page, "Continue");
  await W.recipeTiles(page).first().waitFor({ timeout: 45000 });
  await W.recipeTiles(page).first().click();
  await axe(page, "step 4");
  await W.press(page, "Continue");
  await W.onStep(page, "about");
  await W.aboutYou(page, { sex: "Male", units: "metric", age: 47, height: [183], weight: [84] });
  await axe(page, "step 5");
  await W.aboutNext(page);
  await page.getByRole("radio", { name: "Active", exact: true }).click();
  await axe(page, "step 6");
  await W.press(page, "See my plan");
  await W.onStep(page, "plan");
  await weekSettled(page);
  await page.waitForTimeout(1500);
  await axe(page, "step 7");
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await axe(page, "step 7 changing the numbers");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await W.planNext(page);
  await W.onStep(page, "save");
  await axe(page, "step 8");
  await W.press(page, "Not now");
  await home(page);
  await page.getByRole("region", { name: "Start here" }).waitFor();
  await axe(page, "Home with the toast and Start here");
  await ctx.close();
});

await step("(n) the replay (Settings › Help, ?showcase=1): screens 4 and 7 with Close, Next and Done; no Skip, no Change, no account; nothing is written", async () => {
  const settings = env({ goal: "maintain", dailyCalories: 2100, dailyProtein: 120, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, shops: ["sainsburys"] });
  const { ctx, page } = await phone({ seed: { "mm.v1.settings": settings, "mm.v1.tour": env(2) } });
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 120000 });
  await page.goto(BASE + "/app/welcome?showcase=1");
  await W.onStep(page, "recipes", 60000);
  expect((await W.counter(page)) === "1 of 2", "the replay's counter: " + (await W.counter(page)));
  expect((await W.skipButton(page).count()) === 0, "Skip in the replay");
  await page.getByRole("button", { name: "Close", exact: true }).waitFor();
  await W.press(page, "Next");
  await W.onStep(page, "plan");
  expect((await W.counter(page)) === "2 of 2", "the replay's counter: " + (await W.counter(page)));
  expect((await page.getByRole("button", { name: "Change", exact: true }).count()) === 0, "Change in the replay");
  await W.press(page, "Done");
  await page.waitForURL((u) => !u.pathname.startsWith("/app/welcome"), { timeout: 20000 });
  expect((await page.evaluate(() => localStorage.getItem("mm.v1.settings"))) === settings, "the replay changed the settings");
  expect((await page.evaluate(() => localStorage.getItem("mm.v1.welcomeProgress"))) === null, "the replay wrote a progress note");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
