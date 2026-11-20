// The welcome steps as built from the onboarding redesign meeting of 20 November 2026 (approved by the founder: "Whatever the meeting ... conclude, go with
// that"; docs/meetings/2026-11-20-onboarding-redesign.json, build list 17): after the cover, one counter of 11 steps (10 for a run that starts signed in) that
// only ever jumps forward; three feature screens made from the person's own answers (3 Know before you order, 5 Recipes from {shop}, 10 Your week, planned) with
// no Pip, no top-right pill and an always-enabled Next; the account as step 11 ("Save your plan: make your free account"), then straight to Home with its one
// toast and the one-time Start here card. Checked here:
// - a plain run: the counter, the bar, Skip only on the questions (1, 2, 4), Pip only off the number and feature screens, the windows and their tags, the chips,
//   the dishes and their figures, the recipe chosen, the week, the three sign-in ways, Home after "Not now", and what is (and isn't) stored;
// - an allergen and vegan; GLP-1; under 18; the body questions skipped (6 to 9), the calorie-number line, Back after a jump; step 3's "Skip setup and make my
//   account" (3 to 11) and Back from 11 to 3;
// - leaving and coming back: "Carry on from step {n}" (step 6 for the body questions, step 11 with "Welcome back. Your goal and daily numbers are still here."),
//   "Start again";
// - a run that starts signed in (Step n of 10, "Skip the rest and go to Home", "Save and go to Home"), and an existing account signing in at step 11 (its own
//   settings win; "Signed in. Your saved settings are back.") through a fake backend that uses the real merge rules;
// - the website with no connection for the menus and the shops' files (the plain lines, no digits), and step 11 offline (the status line before any tap);
// - Reduce Motion, 375x667, 390x844, 320 px and 200% text: no sideways scroll, 44 px targets, step 3's first dish above the sticky Next, and all three sign-in
//   ways on screen without scrolling; axe on every step.
// The website build against the iPhone app's (e2e/app-build.mjs) and the sign-in-required mode (e2e/signin.mjs) need their own builds; this suite runs where
// sign-in is optional (step 11 has "Not now"), as the dev server and the test builds with sample data are. Run with the switches the server had:
//   BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 node e2e/showcase.mjs        (ONLY="(c)" runs one step)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mergeStates, validateState } from "../lib/mm/syncMerge.ts";
import * as W from "./welcome-steps.mjs";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
/** Premium is sold in this build (lib/mm/config.ts GATING_ENABLED): the Free tags, the week's Premium badge and its lines. */
const GATED = process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1";
/** Scan your food and Make it at home are switched on (PHOTO_RECIPES_ENABLED). */
const PHOTO = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1";
/** Adding a meal is paid (LOG_IS_PAID: Pro on, not the iPhone app's In-App Purchase build): Start here then has no "Add what you ate" and no dish row. */
const LOG_PAID = process.env.NEXT_PUBLIC_PRO === "1";
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
async function phone({ viewport = { width: 390, height: 844 }, reducedMotion = "no-preference", seed = null, signIn = false } = {}) {
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
const topPill = (page) => page.getByRole("button", { name: "Skip", exact: true });
const pipOnScreen = (page) => page.locator("main svg.pip").count();
const windowOf = (page, name) => page.getByRole("region", { name });
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
  if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none" || el.closest("dialog:not([open]), [inert]")) return [];
  return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
}));
/** The digits drawn in a window (none while it loads or after a failure: CLAUDE.md rule 1). */
const digitsIn = (page, name) => windowOf(page, name).evaluate((el) => (el.innerText.match(/\d/g) ?? []).length);
/** Step 3's chips, once they are there. */
const chips = (page) => page.getByRole("radiogroup", { name: "Restaurants" }).getByRole("radio");
const waitChips = (page) => chips(page).first().waitFor({ timeout: 45000 });
/** Step 3's window heading (the list used, with the chain's name). */
const eatOutHeading = (page) => windowOf(page, "A look at Eat out").getByRole("heading", { level: 2 });
/** Step 5's two choose buttons. */
const recipeTiles = (page) => windowOf(page, "A look at Recipes").locator("button[aria-pressed]");
const home = (page) => page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/", { timeout: 30000 });

// ------------------------------------------------------------------------------------------------ the steps

await step("(a) a plain run: 'Step n of 11' with 11 segments on every step; Skip only on 1, 2 and 4; Pip on 1, 2, 4, 8 and 11 only; the three windows from the person's answers; step 11's three ways in and 'Not now'; Home's toast and Start here card; only the settings, the marks and Home's note are stored", async () => {
  const { ctx, page, requests, errors } = await phone();
  await W.startSteps(page, BASE);
  const seenCounter = [];
  const check = async (id, n, { skip, pip }) => {
    await W.onStep(page, id);
    await W.expectCounter(page, n);
    seenCounter.push(n);
    expect((await W.segments(page)) === 11, `${id}: ${await W.segments(page)} segments`);
    expect((await topPill(page).count()) === (skip ? 1 : 0), `${id}: the top-right Skip ${skip ? "missing" : "shown"}`);
    expect(((await pipOnScreen(page)) > 0) === pip, `${id}: Pip ${pip ? "missing" : "shown"}`);
    // the headline has the focus and carries the counter for a screen reader
    const focused = await page.evaluate(() => (document.activeElement?.tagName === "H1" ? document.activeElement.textContent : ""));
    expect(focused.includes(`Step ${n} of 11`), `${id}: the focused headline reads "${focused}"`);
  };
  // 1: Pip's one entrance, with the run's N
  await check("goal", 1, { skip: true, pip: true });
  await page.getByText("Hi, I'm Pip. 11 short steps, and I'll show you what Numbite can do for you on the way.").waitFor();
  expect((await page.getByRole("img", { name: "Pip, a small round green character with a sprout on top." }).count()) === 1, "Pip is described once on step 1");
  expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, "a goal is ticked on a first run");
  await page.getByText("Pick one to go on, or tap Skip at the top.").waitFor();
  await page.getByRole("radio", { name: /^Build muscle/ }).click();
  await page.getByText("Got it. I'll look for higher-protein meals and orders that fit your calories.").waitFor();
  await W.press(page, "Continue");
  // 2
  await check("avoid", 2, { skip: true, pip: true });
  await page.getByText("Pick anything you don't eat. I'll leave it out of everything I show you next.").waitFor();
  await W.press(page, "Nothing to avoid");
  // 3: Eat out, free, the goal's list (Build muscle: 35 g+ protein)
  await check("eatOut", 3, { skip: false, pip: false });
  await page.getByText("The restaurant's own published figures. Tap a place you go.").waitFor();
  await waitChips(page);
  const n = await chips(page).count();
  expect(n >= 2 && n <= 4, `${n} chips`);
  expect((await chips(page).first().getAttribute("aria-checked")) === "true", "the first chip is not chosen");
  for (let i = 0; i < n; i++) expect((await chips(page).nth(i).boundingBox()).height >= 44, `chip ${i + 1} is under 44 px`);
  const first = (await chips(page).first().innerText()).trim();
  expect(new RegExp(`^35 g\\+ protein at ${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(await eatOutHeading(page).innerText()), `the heading: ${await eatOutHeading(page).innerText()} (chip ${first})`);
  const rows = await windowOf(page, "A look at Eat out").locator("p.app-numbers").allInnerTexts();
  expect(rows.length === 2 && rows.every((r) => /^\d[\d,]* kcal · \d+ g protein( · .+)?$/.test(r)), `two rows of figures: ${JSON.stringify(rows)}`);
  expect((await windowOf(page, "A look at Eat out").locator("a, button").count()) === 0, "the window's rows can be tapped");
  await windowOf(page, "A look at Eat out").getByText(`Not affiliated with ${first}.`).waitFor();
  await windowOf(page, "A look at Eat out").getByText(/^From .+ own published figures, checked /).waitFor();
  expect((await windowOf(page, "A look at Eat out").getByText("Free", { exact: true }).count()) === (GATED ? 1 : 0), `the Free tag ${GATED ? "missing" : "shown"} on Eat out`);
  await page.getByText(/^Somewhere else\? All [\d,]+ restaurants are in Eat out\.$/).waitFor();
  // a chip swap: the focus stays on the chip, the heading names the new chain, the spoken summary changes
  const second = (await chips(page).nth(1).innerText()).trim();
  await chips(page).nth(1).click();
  await windowOf(page, "A look at Eat out").getByRole("heading", { level: 2, name: new RegExp(`at ${second.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).waitFor();
  expect((await chips(page).nth(1).getAttribute("aria-checked")) === "true", "the tapped chip is not chosen");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("role") === "radio"), "the focus left the chip");
  expect((await page.locator("[aria-live='polite']").filter({ hasText: `at ${second}:` }).count()) === 1, "the live region doesn't read the new dishes");
  await page.getByRole("button", { name: "Skip setup and make my account" }).waitFor();
  await W.press(page, "Next: where you shop");
  // 4
  await check("shops", 4, { skip: true, pip: true });
  await page.getByText("Recipes, products and prices").first().waitFor({ timeout: 30000 });
  await page.getByText(/^Not sure yet\? That's fine\. Until you choose, recipes use .+\.$/).waitFor();
  await page.getByRole("group", { name: "Your supermarkets" }).getByRole("button", { name: "Tesco", exact: true }).click();
  await page.getByRole("group", { name: "Your supermarkets" }).getByRole("button", { name: "Sainsbury's", exact: true }).click();
  await page.getByText("Got it. I'll show those shops first.").waitFor();
  await W.press(page, "Continue");
  // 5: two recipes from Sainsbury's (Tesco isn't in recipes yet), one chosen
  await check("recipes", 5, { skip: false, pip: false });
  await page.getByRole("heading", { level: 1, name: /^Recipes from Sainsbury's/ }).waitFor();
  await recipeTiles(page).first().waitFor({ timeout: 45000 });
  expect((await recipeTiles(page).count()) === 2, `${await recipeTiles(page).count()} recipe tiles`);
  expect((await windowOf(page, "A look at Recipes").getByText("Free", { exact: true }).count()) === (GATED ? 1 : 0), `the Free tag ${GATED ? "missing" : "shown"} on Recipes`);
  await page.getByText("Tesco isn't in recipes yet, so these use Sainsbury's: every ingredient is a real product there, with its price.").waitFor();
  await page.getByText("Prices are Sainsbury's shelf prices and vary by store.").waitFor();
  const tileName = await recipeTiles(page).first().getAttribute("aria-label");
  expect(/, [\d,]+ calories, \d+ grams of protein, £\d+\.\d\d (a serving|to buy), \d+ minutes\.$/.test(tileName), `the tile's spoken name: ${tileName}`);
  const recipeName = tileName.split(", ")[0];
  await recipeTiles(page).first().click();
  expect((await recipeTiles(page).first().getAttribute("aria-pressed")) === "true", "the tapped recipe is not chosen");
  await windowOf(page, "A look at Recipes").getByText("Your first recipe", { exact: true }).waitFor();
  await recipeTiles(page).nth(1).click();
  expect((await recipeTiles(page).first().getAttribute("aria-pressed")) === "false" && (await recipeTiles(page).nth(1).getAttribute("aria-pressed")) === "true", "choosing the other doesn't move the choice");
  await recipeTiles(page).nth(1).click();
  expect((await windowOf(page, "A look at Recipes").locator("button[aria-pressed='true']").count()) === 0, "a second tap doesn't un-choose");
  await recipeTiles(page).first().click();
  expect((await stored(page, "mm.v1.savedRecipes")) === null, "choosing a recipe saved it");
  await W.press(page, "Next: your daily numbers");
  // 6 to 8: the questions about the person (Pip only on 8)
  await check("about", 6, { skip: false, pip: false });
  await page.getByText("Already have a daily calorie number? Skip these questions and type it in on the next screen.").waitFor();
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("41");
  await W.press(page, "Continue");
  await check("size", 7, { skip: false, pip: false });
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await page.getByRole("textbox", { name: "Kilograms", exact: true }).fill("82");
  await page.getByRole("radio", { name: "Centimetres", exact: true }).click();
  await page.getByRole("textbox", { name: "Centimetres", exact: true }).fill("180");
  await W.press(page, "Continue");
  await check("active", 8, { skip: false, pip: true });
  await page.getByText("Last question. Think of a normal week, not your busiest one.").waitFor();
  await page.getByRole("radio", { name: "Active", exact: true }).click();
  await W.press(page, "Work out my numbers");
  // 9: the targets, no Pip, no Skip
  await check("targets", 9, { skip: false, pip: false });
  const calories = await page.locator("#target-calories").inputValue();
  expect(/^\d[\d,]*$/.test(calories), `the calories box: ${calories}`);
  await page.getByRole("button", { name: "Next: plan my week", exact: true }).click();
  // 10: the week, Premium where sold
  await check("week", 10, { skip: false, pip: false });
  await page.getByText(/^Breakfast, lunch and dinner for 7 days from Sainsbury's, sized to your numbers\.$/).waitFor();
  const week = windowOf(page, "A look at Meal plan, on Home");
  await week.locator("h2", { hasText: /^Monday$/ }).waitFor({ timeout: 45000 });
  const meals = await week.locator("ul > li").allInnerTexts();
  expect(meals.length === 3 && /^Breakfast · /.test(meals[0]) && /^Lunch · /.test(meals[1]) && /^Dinner · /.test(meals[2]), `Monday's meals: ${JSON.stringify(meals)}`);
  const average = week.getByText(/^About [\d,]+ kcal and \d+ g protein a day \(your target is [\d,]+ kcal\)\.$/);
  await average.waitFor();
  const target = (await average.innerText()).match(/your target is ([\d,]+) kcal/)[1].replace(/,/g, "");
  expect(target === calories.replace(/,/g, ""), `the week's target ${target} against the box's ${calories}`);
  await week.getByText(/^Shopping for the week at Sainsbury's: about £[\d,]+$/).waitFor();
  await week.getByText("Everything goes on one shopping list.").waitFor();
  await week.getByText("This week isn't kept. Open Meal plan on Home to make it yours, for you or everyone you cook for.").waitFor();
  expect((await week.getByText("Premium", { exact: true }).count()) === (GATED ? 1 : 0), `the Premium badge ${GATED ? "missing" : "shown"}`);
  expect((await week.getByText("Nothing is charged during setup.").count()) === (GATED ? 1 : 0), "'Nothing is charged during setup.'");
  const also = GATED ? (PHOTO ? "Also in Premium: Scan your food, Make it at home, and Cook with what you already have." : "Also in Premium: Cook with what you already have.") : null;
  expect((await page.getByText(/^Also in Premium:/).count()) === (also ? 1 : 0), "the Also in Premium line");
  if (also) await page.getByText(also).waitFor();
  await page.getByText("Prices are Sainsbury's shelf prices and vary by store.").waitFor();
  // nothing on step 10 sells: no price, trial words or a way to the paywall
  const words = await page.locator("main").innerText();
  expect(!/free trial|Try Premium|Subscribe|a month|a year|\/month|Get Premium/i.test(words), `a price or a sale on step 10: ${words.match(/free trial|Try Premium|Subscribe|a month|a year|\/month|Get Premium/i)?.[0]}`);
  await page.getByRole("button", { name: "Next: save your plan", exact: true }).click();
  // 11: the account
  await check("save", 11, { skip: false, pip: true });
  await page.getByText("Your goal and daily numbers are ready. Your free account keeps them, and your meals and lists, safe if you change phone.").waitFor();
  await page.getByText(`Waiting for you on Home: ${recipeName}.`).waitFor();
  await page.getByText(/^We keep your email address, .*Never your sex, age, height, weight or activity\./).waitFor();
  for (const way of ["Continue with Apple", "Continue with Google", "Continue with email"]) {
    const b = page.getByText(way, { exact: true });
    expect((await b.count()) === 1, `${way} missing`);
  }
  expect(seenCounter.join() === "1,2,3,4,5,6,7,8,9,10,11", "the counter went " + seenCounter.join());
  // Not now (sign-in optional here): straight to Home
  await W.press(page, "Not now");
  await home(page);
  await page.getByRole("status").filter({ hasText: "You're in. Sign in any time in Settings to keep your goal and numbers safe." }).waitFor({ timeout: 20000 });
  const start = page.getByRole("region", { name: "Start here" });
  await start.waitFor();
  await start.getByText(`Your first recipe: ${recipeName}`).waitFor();
  expect((await start.getByRole("button", { name: "Add what you ate" }).count()) === (LOG_PAID ? 0 : 1), `Add what you ate ${LOG_PAID ? "where adding is paid" : "missing"}`);
  expect((await start.getByText(/^Had the .+ today\? Add it$/).count()) <= (LOG_PAID ? 0 : 1), "the dish row where adding is paid");
  expect((await page.getByRole("heading", { name: "You're all set!" }).count()) === 0, "'You're all set!' is back");
  // stored: the settings, the marks and Home's note; nothing of the person's own, no body answers, no progress note
  const s = await settingsOf(page);
  expect(s.hasCompletedOnboarding === true && s.goal === "buildMuscle" && JSON.stringify(s.shops) === JSON.stringify(["tesco", "sainsburys"]) && s.hasSetTargets === true, "settings: " + JSON.stringify(s));
  expect((await stored(page, "mm.v1.tour")) === 2, "mm.v1.tour " + (await stored(page, "mm.v1.tour")));
  expect((await page.evaluate(() => localStorage.getItem("mm.v1.welcomeProgress"))) === null, "the progress note is still there");
  for (const k of OWN_DATA_KEYS) { const v = await stored(page, k); expect(v === null || (Array.isArray(v) && v.length === 0), `${k} was written: ${JSON.stringify(v)}`); }
  const all = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie + location.href);
  expect(!/"age"\s*:|"weight"\s*:|"height"\s*:|"sex"\s*:|"activity"\s*:/.test(all), "an answer about the body was stored");
  const sent = requests.filter((r) => /"(age|sex|weight|height|activity)"|mm\.v1\.welcomeProgress/.test(r.body) || /age=41|welcomeProgress/.test(r.url));
  expect(sent.length === 0, "sent: " + sent.slice(0, 2).map((r) => r.url).join(" | "));
  expect(errors.length === 0, "page errors: " + errors.join(" | "));
  await ctx.close();
});

await step("(b) the body questions skipped (6 to 9): the starting-numbers line, Calories ringed and not focused, Back to About you; an age under 18 jumps to 9 too ('Next'), and step 10 shows its words-only form", async () => {
  const { ctx, page } = await phone();
  await W.toAbout(page, BASE);
  await W.expectCounter(page, 6);
  await W.press(page, "Skip these questions");
  await W.onStep(page, "targets");
  await W.expectCounter(page, 9);
  await page.getByText("These are starting numbers, not worked out for you. Know your number? Tap Calories and type it in.").waitFor();
  expect(!(await page.evaluate(() => document.activeElement?.id === "target-calories")), "the Calories box took the focus (it would open the keyboard)");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "about");
  await W.expectCounter(page, 6);
  // under 18: straight to the targets, nothing worked out, "Next", then the words-only week
  await page.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("16");
  await W.press(page, "Continue");
  await W.onStep(page, "targets");
  await W.expectCounter(page, 9);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await W.onStep(page, "week");
  await W.expectCounter(page, 10);
  await page.getByText("Meal plan plans a week of meals from your shop, sized to your numbers, with one shopping list. You'll find it on Home.").waitFor({ timeout: 20000 });
  expect((await digitsIn(page, "A look at Meal plan, on Home")) === 0, "digits in the words-only week");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "targets");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "about");
  await ctx.close();
});

await step("(c) step 3's 'Skip setup and make my account' jumps to 'Step 11 of 11'; Back returns to step 3; Not now goes to Home with starting numbers and no shop", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await W.goal(page, "Lose weight");
  await W.avoid(page);
  await waitChips(page);
  await page.getByRole("button", { name: "Skip setup and make my account" }).click();
  await W.onStep(page, "save");
  await W.expectCounter(page, 11);
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "eatOut");
  await W.expectCounter(page, 3);
  await page.getByRole("button", { name: "Skip setup and make my account" }).click();
  await W.onStep(page, "save");
  await W.press(page, "Not now");
  await home(page);
  const s = await settingsOf(page);
  expect(s.hasCompletedOnboarding === true && s.goal === "lose" && !s.hasSetTargets && !(s.shops?.length), "settings: " + JSON.stringify(s));
  await ctx.close();
});

await step("(d) an allergen and vegan: step 3 says what is left out and shows only fitting dishes (or the plain line); the recipes are vegan; the week fits too", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await W.goal(page, null);
  await W.avoid(page, ["Peanuts"]);
  await page.getByText("Dishes that list peanuts, or have no allergy information, are left out. Always check with staff.").waitFor();
  await waitChips(page);
  // Skip on step 1: the plain list
  expect(/^Most protein for the calories at /.test(await eatOutHeading(page).innerText()), "after Skip on step 1: " + (await eatOutHeading(page).innerText()));
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "avoid");
  await page.getByRole("button", { name: "Vegan", exact: true }).click();
  await W.press(page, "Continue");
  await W.onStep(page, "eatOut");
  // settled: chips, or the plain line that nothing fits (the menus are tried one restaurant after another, so this can take a while on the website)
  const settled = page.locator("[role='radiogroup'][aria-label='Restaurants']").or(page.getByText(/^Nothing at these places fits what you avoid\./));
  await settled.first().waitFor({ timeout: 60000 });
  if (await chips(page).count()) {
    const rowNames = await windowOf(page, "A look at Eat out").locator("p.font-semibold").allInnerTexts();
    expect(rowNames.length === 2 && rowNames.every((r) => !/\b(chicken|beef|pork|bacon|fish|salmon|tuna|prawn|ham|cheese|egg|milk|turkey|lamb)\b/i.test(r)), "vegan dishes: " + JSON.stringify(rowNames));
  } else {
    await page.getByText(/^Nothing at these places fits what you avoid\. Once you're in, search all [\d,]+ restaurants in Eat out\.$/).waitFor();
    expect((await digitsIn(page, "A look at Eat out")) === 0, "digits in the plain line");
  }
  await W.eatOut(page, { wait: false });
  await W.shops(page);
  // the recipes: vegan by name, or the plain line
  const tiles = recipeTiles(page);
  await page.locator("section[aria-label='A look at Recipes'] button[aria-pressed], section[aria-label='A look at Recipes'] p[role='status']").first().waitFor({ timeout: 45000 });
  for (const label of await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) {
    expect(!/\b(chicken|beef|pork|bacon|fish|salmon|tuna|prawn|ham|cheese|egg|eggs|turkey|lamb|yoghurt|honey)\b/i.test(label.split(", ")[0]), "a recipe for a vegan: " + label);
  }
  await ctx.close();
});

await step("(e) GLP-1: the medicine line under the goals on step 1 (not in Pip's bubble) and on step 3, whose list is 'Smaller, protein-first orders at {chain}'; the targets start with 'Comfortable meal size'", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  const NOTE = "If you take a GLP-1 medicine, follow the advice of your doctor or pharmacist. Numbite doesn't give medical advice.";
  await page.getByRole("radio", { name: /^I'm on a GLP-1 medication/ }).click();
  await page.getByText("Got it: smaller, protein-first orders.").waitFor();
  await page.getByText(NOTE).waitFor();
  expect((await page.locator(".speech").filter({ hasText: NOTE }).count()) === 0, "the medicine line is in Pip's bubble");
  await W.press(page, "Continue");
  await W.avoid(page);
  await waitChips(page);
  expect(/^Smaller, protein-first orders at /.test(await eatOutHeading(page).innerText()), "GLP-1's list: " + (await eatOutHeading(page).innerText()));
  expect(!/small appetite/i.test(await page.locator("main").innerText()), "'Small appetite' is written");
  await page.getByText(NOTE).waitFor();
  await W.eatOut(page, { wait: false });
  await W.shops(page);
  await W.recipes(page);
  await W.skipBody(page);
  const order = await page.evaluate(() => [...document.querySelectorAll("main input[id^='target-']")].map((i) => i.id));
  expect(order[0] === "target-mealcap" && order[1] === "target-protein" && order[2] === "target-calories", "GLP-1's order: " + JSON.stringify(order));
  await page.getByText(NOTE).waitFor();
  await ctx.close();
});

await step("(f) leaving and coming back: 'Carry on from step 4' and 'Start again'; the body questions resume at step 6; step 11 resumes as 'Carry on from step 11' with 'Welcome back. Your goal and daily numbers are still here.'; Start again forgets the step and ticks nothing", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await W.eatOut(page);
  // leave at step 4
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await page.getByRole("button", { name: "Carry on from step 4", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Start again", exact: true }).waitFor();
  await page.getByRole("button", { name: "Carry on from step 4", exact: true }).click();
  await W.onStep(page, "shops");
  await W.expectCounter(page, 4);
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "eatOut");
  await W.eatOut(page);
  await W.shops(page);
  await W.recipes(page);
  await W.press(page, "Skip these questions");
  await W.onStep(page, "targets");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(page, "about");
  await page.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("52");
  await W.press(page, "Continue");
  await W.onStep(page, "size");
  // leave at step 7: back at 6, with nothing about the body kept
  await page.reload();
  await page.getByRole("button", { name: "Carry on from step 6", exact: true }).click();
  await W.onStep(page, "about");
  expect((await page.getByLabel("Age", { exact: true }).inputValue()) === "", "the age was kept");
  expect((await page.getByRole("radio", { name: "Female", exact: true }).getAttribute("aria-checked")) !== "true", "the sex was kept");
  await W.skipBody(page);
  await W.finishFromTargets(page).catch(() => undefined); // to Home if it gets there; the next lines leave from step 11 instead
  await ctx.close();
  // step 11, left and resumed
  const two = await phone();
  await W.toAbout(two.page, BASE);
  await W.skipBody(two.page);
  await W.targetsNext(two.page);
  await W.weekNext(two.page);
  await W.onStep(two.page, "save");
  await two.page.goto(BASE + "/app");
  await two.page.getByRole("button", { name: "Carry on from step 11", exact: true }).click();
  await W.onStep(two.page, "save");
  await two.page.getByText("Welcome back. Your goal and daily numbers are still here.").waitFor();
  // Back from a resumed step 11 goes to the week
  await two.page.getByRole("button", { name: "Back to the previous step" }).click();
  await W.onStep(two.page, "week");
  // Start again: step 1, nothing ticked, the saved goal forgotten
  await two.page.goto(BASE + "/app");
  await two.page.getByRole("button", { name: "Start again", exact: true }).click();
  await W.onStep(two.page, "goal");
  await W.expectCounter(two.page, 1);
  expect((await two.page.locator("[role='radio'][aria-checked='true']").count()) === 0, "a goal is ticked after Start again");
  expect((await two.page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.welcomeProgress") || "null")?.data?.step)) === "goal", "the note after Start again");
  await two.ctx.close();
});

await step("(g) a run that starts signed in: 'Step 1 of 10', Pip says 10 steps, step 3's link is 'Skip the rest and go to Home', step 10's button 'Save and go to Home'; no account step; Home says 'You're signed in. Your goal and daily numbers are saved.'", async () => {
  const { ctx, page } = await phone({ signIn: true });
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await sheet.getByLabel("Your email address").fill("new@example.com");
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await sheet.getByLabel("6-digit code").fill("123456");
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet.waitFor({ state: "hidden", timeout: 20000 });
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await W.onStep(page, "goal");
  await W.expectCounter(page, 1, 10);
  expect((await W.segments(page)) === 10, `${await W.segments(page)} segments`);
  await page.getByText("Hi, I'm Pip. 10 short steps, and I'll show you what Numbite can do for you on the way.").waitFor();
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await waitChips(page);
  await page.getByRole("button", { name: "Skip the rest and go to Home" }).waitFor();
  expect((await page.getByRole("button", { name: "Skip setup and make my account" }).count()) === 0, "a signed-in run offers to make an account");
  await W.eatOut(page, { wait: false });
  await W.shops(page);
  await W.recipes(page);
  await W.skipBody(page);
  await W.expectCounter(page, 9, 10);
  await W.targetsNext(page);
  await W.expectCounter(page, 10, 10);
  await page.getByRole("button", { name: "Save and go to Home", exact: true }).click();
  await home(page);
  await page.getByRole("status").filter({ hasText: "You're signed in. Your goal and daily numbers are saved." }).waitFor({ timeout: 20000 });
  expect((await settingsOf(page)).hasCompletedOnboarding === true, "not set up");
  await ctx.close();
});

await step("(h) an existing account signing in at step 11: its own settings win, and Home says 'Signed in. Your saved settings are back.'", async () => {
  // phone A: set up (goal Build muscle, 2,600 kcal) and signed in from Settings, so its settings reach the server
  const a = await phone({ signIn: true, seed: { "mm.v1.settings": env({ goal: "buildMuscle", dailyCalories: 2600, dailyProtein: 180, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} }), "mm.v1.tour": env(2) } });
  await a.page.goto(BASE + "/app/settings");
  await a.page.getByRole("button", { name: "Sign in", exact: true }).click();
  const sheet = a.page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await sheet.getByLabel("Your email address").fill("back@example.com");
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await sheet.getByLabel("6-digit code").fill("123456");
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
  const end = Date.now() + 20000;
  while (!rowsOf("user-back@example.com").has("settings") && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
  expect(rowsOf("user-back@example.com").has("settings"), "phone A's settings never reached the server");
  await a.ctx.close();
  // phone B: a new run (Lose weight), then the same account at step 11
  const b = await phone({ signIn: true });
  await W.startSteps(b.page, BASE);
  await W.goal(b.page, "Lose weight");
  await W.avoid(b.page);
  await waitChips(b.page);
  await b.page.getByRole("button", { name: "Skip setup and make my account" }).click();
  await W.onStep(b.page, "save");
  await b.page.getByRole("button", { name: "Continue with email", exact: true }).click();
  await b.page.getByLabel("Your email address").fill("back@example.com");
  await b.page.getByRole("button", { name: "Send me a code" }).click();
  await b.page.getByLabel("6-digit code").fill("123456");
  await b.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await home(b.page);
  await b.page.getByRole("status").filter({ hasText: "Signed in. Your saved settings are back." }).waitFor({ timeout: 20000 });
  const s = await settingsOf(b.page);
  expect(s.goal === "buildMuscle" && s.dailyCalories === 2600 && s.hasCompletedOnboarding === true, "phone B's settings: " + JSON.stringify(s));
  expect((await b.page.evaluate(() => localStorage.getItem("mm.v1.welcomeProgress"))) === null, "the progress note is still there");
  await b.ctx.close();
});

await step("(i) the website with no connection for the menus or the shops' files: step 3 and step 5 say so in a plain line with no digits (after about 3 s and 6 s); step 11 offline says so before any tap", async () => {
  const { ctx, page } = await phone();
  await ctx.route(/\/(menus|menus-sample|groceries)\//, (r) => r.abort("internetdisconnected"));
  await W.startSteps(page, BASE);
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await page.getByText("Menus need a connection the first time. Every restaurant is in Eat out.").waitFor({ timeout: 15000 });
  expect((await digitsIn(page, "A look at Eat out")) === 0, "digits in Eat out's window without menus");
  await W.eatOut(page, { wait: false });
  await W.shops(page);
  await page.getByText("Recipes can't load just now. You'll find them under Recipes.").waitFor({ timeout: 20000 });
  expect((await digitsIn(page, "A look at Recipes")) === 0, "digits in the recipes' window without the shop's file");
  await W.recipes(page);
  await W.skipBody(page);
  await W.targetsNext(page);
  await page.getByText("Meal plan plans a week of meals from your shop, sized to your numbers, with one shopping list. You'll find it on Home.").waitFor({ timeout: 25000 });
  await W.weekNext(page);
  await W.onStep(page, "save");
  await ctx.setOffline(true);
  await page.getByRole("status").filter({ hasText: "You're offline. Connect to the internet to make your account. Your answers are kept on this phone." }).waitFor({ timeout: 10000 });
  await page.getByText("Continue with email", { exact: true }).waitFor();
  await ctx.setOffline(false);
  await ctx.close();
});

await step("(j) 375x667 and 320x568: step 3's first dish row sits above the sticky Next with four chips; step 11's three ways in are all on screen without scrolling", async () => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
    const { ctx, page } = await phone({ viewport });
    const where = `${viewport.width}x${viewport.height}`;
    await W.startSteps(page, BASE);
    await W.goal(page, "Maintain");
    await W.avoid(page);
    await waitChips(page);
    await page.waitForTimeout(600);
    const fold = await page.evaluate(() => {
      const row = document.querySelector("section[aria-label='A look at Eat out'] p.app-numbers");
      const next = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next: where you shop")?.closest(".sticky");
      return row && next ? { row: Math.round(row.getBoundingClientRect().bottom), bar: Math.round(next.getBoundingClientRect().top) } : null;
    });
    if (viewport.width >= 375) expect(fold && fold.row <= fold.bar, `${where}: the first dish row is under the sticky Next: ${JSON.stringify(fold)}`);
    await page.getByRole("button", { name: "Skip setup and make my account" }).click();
    await W.onStep(page, "save");
    await page.waitForTimeout(400);
    const offscreen = await page.evaluate(() => ["Continue with Apple", "Continue with Google", "Continue with email"].filter((w) => {
      const el = [...document.querySelectorAll("a, button")].find((b) => b.textContent.trim() === w);
      return !el || el.getBoundingClientRect().bottom > innerHeight;
    }));
    expect(offscreen.length === 0, `${where}: below the fold on step 11: ${offscreen.join(", ")}`);
    await ctx.close();
  }
});

await step("(k) Reduce Motion: nothing runs on steps 1, 3 (a chip swap too), 5, 10 and 11", async () => {
  const { ctx, page } = await phone({ reducedMotion: "reduce" });
  const still = async (where) => { await page.waitForTimeout(400); const r = await running(page); expect(r.length === 0, `${where} animates: ${r.join(", ")}`); };
  await W.startSteps(page, BASE);
  await still("step 1");
  await W.goal(page, "Maintain");
  await W.avoid(page);
  await waitChips(page);
  await still("step 3");
  await chips(page).nth(1).click();
  await still("step 3 after a chip swap");
  await W.eatOut(page, { wait: false });
  await W.shops(page);
  await recipeTiles(page).first().waitFor({ timeout: 45000 });
  await still("step 5");
  await W.recipes(page);
  await W.skipBody(page);
  await W.targetsNext(page);
  await windowOf(page, "A look at Meal plan, on Home").locator("h2", { hasText: /^Monday$/ }).waitFor({ timeout: 45000 }).catch(() => undefined);
  await still("step 10");
  await W.weekNext(page);
  await W.onStep(page, "save");
  await still("step 11");
  await ctx.close();
});

await step("(l) 200% text at 360x780: no sideways scroll and every button and link at least 44 px on all eleven steps", async () => {
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
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await check("goal");
  await W.goal(page, "Maintain");
  await check("avoid");
  await W.press(page, "Nothing to avoid");
  await waitChips(page);
  await check("eatOut");
  await W.eatOut(page, { wait: false });
  await check("shops");
  await W.press(page, "Continue");
  await recipeTiles(page).first().waitFor({ timeout: 45000 }).catch(() => undefined);
  await check("recipes");
  await W.press(page, "Next: your daily numbers");
  await check("about");
  await page.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("40");
  await W.press(page, "Continue");
  await check("size");
  await page.getByRole("textbox", { name: "Stone", exact: true }).fill("10");
  await page.getByRole("textbox", { name: "Pounds", exact: true }).fill("4");
  await page.getByRole("textbox", { name: "Feet", exact: true }).fill("5");
  await page.getByRole("textbox", { name: "Inches", exact: true }).fill("5");
  await W.press(page, "Continue");
  await check("active");
  await page.getByRole("radio", { name: "Lightly active", exact: true }).click();
  await W.press(page, "Work out my numbers");
  await check("targets");
  await W.targetsNext(page);
  await windowOf(page, "A look at Meal plan, on Home").locator("h2", { hasText: /^Monday$/ }).waitFor({ timeout: 45000 }).catch(() => undefined);
  await check("week");
  await W.weekNext(page);
  await check("save");
  await ctx.close();
});

await step("(m) axe: no violations on any of the eleven steps (with a chip swapped, a recipe chosen and the week made)", async () => {
  const { ctx, page } = await phone();
  await W.startSteps(page, BASE);
  await page.waitForTimeout(1200); // Pip's jump
  await axe(page, "step 1");
  await page.getByRole("radio", { name: /^I'm on a GLP-1 medication/ }).click();
  await axe(page, "step 1 with GLP-1 picked");
  await W.press(page, "Continue");
  await W.onStep(page, "avoid");
  await page.getByRole("button", { name: "Milk", exact: true }).click();
  await axe(page, "step 2");
  await W.press(page, "Continue");
  await waitChips(page);
  await chips(page).nth(1).click();
  await axe(page, "step 3");
  await W.eatOut(page, { wait: false });
  await page.getByText("Recipes, products and prices").first().waitFor({ timeout: 30000 });
  await axe(page, "step 4");
  await W.press(page, "Continue");
  await recipeTiles(page).first().waitFor({ timeout: 45000 });
  await recipeTiles(page).first().click();
  await axe(page, "step 5");
  await W.press(page, "Next: your daily numbers");
  await W.onStep(page, "about");
  await axe(page, "step 6");
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("47");
  await W.press(page, "Continue");
  await W.onStep(page, "size");
  await axe(page, "step 7");
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await page.getByRole("textbox", { name: "Kilograms", exact: true }).fill("84");
  await page.getByRole("radio", { name: "Centimetres", exact: true }).click();
  await page.getByRole("textbox", { name: "Centimetres", exact: true }).fill("183");
  await W.press(page, "Continue");
  await W.onStep(page, "active");
  await axe(page, "step 8");
  await page.getByRole("radio", { name: "Active", exact: true }).click();
  await W.press(page, "Work out my numbers");
  await W.onStep(page, "targets");
  await axe(page, "step 9");
  await W.targetsNext(page);
  await windowOf(page, "A look at Meal plan, on Home").locator("h2", { hasText: /^Monday$/ }).waitFor({ timeout: 45000 }).catch(() => undefined);
  await axe(page, "step 10");
  await W.weekNext(page);
  await W.onStep(page, "save");
  await axe(page, "step 11");
  await W.press(page, "Not now");
  await home(page);
  await page.getByRole("region", { name: "Start here" }).waitFor();
  await axe(page, "Home with the toast and Start here");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
