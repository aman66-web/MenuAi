import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import * as W from "./welcome-steps.mjs";

// The welcome steps' questions about the person and the numbers worked out from them, as rebuilt on 20 November 2026 (founder: one question a screen, a big
// input, far fewer words): screen 5 "About you" asks everything on one screen (Male / Female / Prefer not to say as big tiles, height in ft and in or cm and
// weight in st and lb or kg, each with its own switch (founder 2026-11-20), then age, height and weight as big number boxes; the age only, never a date of birth), screen 6 "How active are you?" is the activity tiles (its
// button "See my plan"), and screen 7 "Your plan" shows Calories a day and Protein a day big, with "Change" opening the − and + boxes and "Save". Skip (top
// right) on 5 or 6 skips both, to the starting numbers. Settings' single-screen form gives the same numbers. Two people are typed in:
//   A: a vegan woman, 34, 11 st 0 lb, 5 ft 10 in, lightly active, wants to lose weight  -> 1,530 kcal, 110 g protein (160 g carbs, 50 g fat saved)
//   B: a man, 47, 83.7 kg, 183.4 cm, active, on a GLP-1 medicine                      -> 2,220 kcal, 115 g protein (270 g carbs, 75 g fat saved)
// (the numbers are checked against planTargets in tests/onboardingPlan.test.ts, so they can't drift from the code). Nothing typed about the body may be
// stored or sent: after finishing, storage, cookies, the address and every request are searched for it. e2e/showcase.mjs walks the whole run.
// Run with the switches the server was started with:
//   BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 node e2e/onboarding-body.mjs        (ONLY="(c)" runs one step)

const BASE = process.env.BASE ?? "http://localhost:3101";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// Pip's tips on the real screens (CoachMarks, 2026-11-18) are stopped in this test, as if the person had pressed "Stop the tips": e2e/coach.mjs covers them.
{
  const open = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await open(options);
    await c.addInitScript(() => { try { if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"] } })); } catch { /* storage blocked */ } });
    return c;
  };
}
let pass = 0, fail = 0;
async function step(n, fn) { if (process.env.ONLY && !n.startsWith(process.env.ONLY)) return; try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0], (String(e.stack).match(/(onboarding-body|welcome-steps)\.mjs:\d+/g) ?? []).join(" < ")); } }
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const vis = (l, timeout = 10000) => l.waitFor({ state: "visible", timeout });

async function fresh(extra = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, serviceWorkers: "block", locale: "en-GB", ...extra });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => { requests.push({ url: r.url(), body: r.postData() ?? "" }); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, requests, errors };
}
const go = (page, name) => page.getByRole("button", { name, exact: true }).click();
const head = (page, name) => vis(page.getByRole("heading", { name }));
const settingsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") ?? "null")?.data ?? {});
const box = (page, name) => page.getByRole("textbox", { name, exact: true });
const age = (page) => page.getByLabel("Age in years", { exact: true });
/** About you's Continue: grey (aria-disabled) while something is missing, but still tappable (it then says what and focuses that box). */
const aboutContinue = (page) => page.getByRole("button", { name: "Continue", exact: true });
const isGrey = async (page) => (await aboutContinue(page).getAttribute("aria-disabled")) === "true";
/** The lines that tell the person something is wrong (not Next's empty route announcer, which is also an alert). */
const alerts = (page) => page.locator("main [role='alert']").filter({ hasText: /\S/ });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settleAll = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
async function axe(page, where) {
  await settleAll(page);
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, `${where}: ` + v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
}
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll("button, a[href], input")].flatMap((el) => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none" || el.closest("dialog:not([open]), [inert], nextjs-portal") || el.type === "hidden" || el.classList.contains("sr-only")) return [];
  return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
}));

const A = { goal: "Lose weight", diets: ["Vegan"], sex: "Female", age: 34, units: "uk", height: [5, 10], weight: [11, 0], activity: "Lightly active", plan: { calories: 1530, protein: 110, carbs: 160, fat: 50 } };
const B = { goal: "I'm on a GLP-1 medication", diets: [], sex: "Male", age: 47, units: "metric", height: [183.4], weight: [83.7], activity: "Active", plan: { calories: 2220, protein: 115, carbs: 270, fat: 75 } };

/** One person from the cover through the goal, the diet, the shops and the recipes, About you and How active are you?, to Your plan. */
async function toPlan(page, p) {
  await W.toAbout(page, BASE, { goalName: p.goal, diets: p.diets });
  await W.aboutYou(page, p);
  await W.aboutNext(page);
  await W.active(page, p.activity);
}

// ------------------------------------------------------------------------------------------------ About you

await step("(a) About you is one screen: the privacy line, Male / Female / Prefer not to say with none ticked, one unit switch, Age, Height and Weight as big boxes (never a date of birth or a name); Continue grey with its reason linked to it; the Done pill with a box in use; Skip at the top right", async () => {
  const { ctx, page } = await fresh();
  await W.toAbout(page, BASE);
  await W.expectCounter(page, 5, 9);
  await vis(page.getByText("Only used to work out your numbers. Never saved or sent."));
  await vis(page.getByText("All optional.", { exact: true }));
  const sex = page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio");
  expect(JSON.stringify(await sex.allInnerTexts()) === JSON.stringify(["Male", "Female", "Prefer not to say"]), "the sex tiles: " + JSON.stringify(await sex.allInnerTexts()));
  expect((await page.locator("main [role='radio'][aria-checked='true']").count()) === 2, "something other than the two unit switches is ticked for the person"); // each unit switch's one choice
  expect((await page.getByRole("radiogroup", { name: "Height unit" }).count()) === 1 && (await page.getByRole("radiogroup", { name: "Weight unit" }).count()) === 1, "a unit switch each for height and weight");
  for (const name of ["Age in years", "Feet", "Inches", "Stone", "Pounds"]) await vis(box(page, name));
  const text = (await page.locator("main").innerText()).toLowerCase();
  for (const word of ["birth", "name", "postcode", "email"]) expect(!text.includes(word), `About you asks for "${word}"`);
  // nothing typed: the button says it can be skipped (founder 2026-11-20), with no grey button and no line asking for numbers
  await vis(page.getByRole("button", { name: "Skip these", exact: true }));
  expect((await aboutContinue(page).count()) === 0 && (await page.locator("#welcome-why-grey").count()) === 0, "Continue or the reason line with nothing typed");
  // something typed: Continue, grey until the rest is there, with the reason linked to it
  await box(page, "Feet").fill("5");
  expect(await isGrey(page), "Continue isn't grey with only the feet typed");
  expect((await aboutContinue(page).getAttribute("aria-describedby")) === "welcome-why-grey", "the reason isn't linked to Continue");
  await vis(page.locator("#welcome-why-grey").filter({ hasText: "Add your age, height and weight, or tap Skip." }));
  await box(page, "Feet").fill("");
  await age(page).focus();
  await vis(page.getByRole("button", { name: "Done", exact: true }));
  await W.skipButton(page).waitFor();
  // filled in: Continue goes on
  await W.aboutYou(page, { sex: "Prefer not to say", age: 40, height: [5, 6], weight: [10, 7] });
  expect(!(await isGrey(page)), "Continue is still grey with everything typed");
  await W.aboutNext(page);
  await ctx.close();
});

await step("(b) person A (a vegan woman in stone and feet, losing weight): Your plan shows 1,530 kcal and 110 g protein, saved with 160 g carbs and 50 g fat; the diet's protein line", async () => {
  const { ctx, page } = await fresh();
  await toPlan(page, A);
  const n = await W.planNumbers(page);
  expect(n.calories === A.plan.calories && n.protein === A.plan.protein, "person A's plan: " + JSON.stringify(n));
  await vis(page.getByText("Because of your diet, we set your protein a little higher. Change it any time."));
  await vis(page.getByText("Suggested starting points, not medical advice. Adjust any time."));
  expect((await page.getByText("Starting numbers.", { exact: true }).count()) === 0, "'Starting numbers.' for worked-out numbers");
  const s = await settingsOf(page);
  expect(s.dailyCalories === 1530 && s.dailyProtein === 110 && s.dailyCarbs === 160 && s.dailyFat === 50 && s.hasSetTargets === true, "saved: " + JSON.stringify(s));
  // no word that judges a body or food
  const all = (await page.locator("main").innerText()).toLowerCase();
  for (const word of ["overweight", "underweight", "obese", "healthy", "ideal"]) expect(!all.includes(word), "the word " + word);
  await ctx.close();
});

await step("(b) person B (a man in cm and kg on a GLP-1 medicine): 2,220 kcal and 115 g protein; the meal size stays 450; the medicine line shows once", async () => {
  const { ctx, page } = await fresh();
  await toPlan(page, B);
  const n = await W.planNumbers(page);
  expect(n.calories === B.plan.calories && n.protein === B.plan.protein, "person B's plan: " + JSON.stringify(n));
  const s = await settingsOf(page);
  expect(s.dailyCalories === 2220 && s.dailyProtein === 115 && s.dailyCarbs === 270 && s.dailyFat === 75 && s.glp1MealCap === 450, "saved: " + JSON.stringify(s));
  const line = "If you take a GLP-1 medication, follow the advice of your doctor or pharmacist. Numbite doesn't give medical advice.";
  expect((await page.getByText(line).count()) === 1, "the medicine line shows " + (await page.getByText(line).count()) + " times");
  await ctx.close();
});

await step("(c) height and weight each switch their own unit, converting what is typed (11 st 0 lb = 69.9 kg, 5 ft 10 in = 177.8 cm) and back; feet with kg gives the same plan", async () => {
  const { ctx, page } = await fresh();
  await W.toAbout(page, BASE, { goalName: A.goal, diets: A.diets });
  await W.aboutYou(page, A);
  const unit = (which, name) => page.getByRole("radiogroup", { name: which }).getByRole("radio", { name, exact: true }).click();
  await unit("Weight unit", "kg");
  expect((await box(page, "Kilograms").inputValue()) === "69.9" && (await box(page, "Feet").inputValue()) === "5", `weight alone converted: ${await box(page, "Kilograms").inputValue()} kg, height still ${await box(page, "Feet").inputValue()} ft`);
  await unit("Height unit", "cm");
  expect((await box(page, "Centimetres").inputValue()) === "177.8", `height converted: ${await box(page, "Centimetres").inputValue()} cm`);
  expect((await box(page, "Stone").count()) === 0 && (await box(page, "Feet").count()) === 0, "the stone and feet boxes are still there");
  await unit("Weight unit", "st and lb");
  await unit("Height unit", "ft and in");
  const back = [await box(page, "Stone").inputValue(), await box(page, "Pounds").inputValue(), await box(page, "Feet").inputValue(), await box(page, "Inches").inputValue()];
  expect(Number(back[0]) === 11 && Number(back[1] || 0) === 0 && Number(back[2]) === 5 && Number(back[3]) === 10, "switched back: " + JSON.stringify(back));
  await unit("Weight unit", "kg"); // feet and inches with kilograms
  await W.aboutNext(page);
  await W.active(page, A.activity);
  const n = await W.planNumbers(page);
  expect(n.calories === 1530 && n.protein === 110, "feet with kg gives the same plan: " + JSON.stringify(n));
  await ctx.close();
});

await step("(d) under 18 goes straight to Your plan with the doctor line and no numbers; a wrong age, weight or height is named only after the grey Continue is tapped (a part of a stone at once), with the box marked and focused", async () => {
  const { ctx, page } = await fresh();
  await W.toAbout(page, BASE);
  await age(page).fill("16");
  expect(!(await isGrey(page)), "an under-18 needs nothing else, but Continue is grey");
  await W.aboutNext(page, "plan");
  await vis(page.getByText("Ask a doctor or dietitian for targets."));
  expect((await W.planNumbers(page)).calories === null, "numbers for an under-18");
  await W.backButton(page).click();
  await W.onStep(page, "about");
  // 150 years: grey, and named only after the tap
  await W.aboutYou(page, { sex: "Male", age: 150, height: [5, 10], weight: [11, 0] });
  expect(await isGrey(page), "Continue isn't grey at 150");
  expect((await page.getByText("Enter your age as a whole number from 18 to 100.").count()) === 0, "named before the tap");
  await aboutContinue(page).click({ force: true });
  await vis(page.getByText("Enter your age as a whole number from 18 to 100."));
  expect((await age(page).getAttribute("aria-invalid")) === "true" && (await page.evaluate(() => document.activeElement?.id)) === "welcome-age", "the age box isn't marked and focused");
  await age(page).fill("34");
  // a weight that can't be right
  await box(page, "Stone").fill("1");
  await box(page, "Pounds").fill("0");
  await aboutContinue(page).click({ force: true });
  await vis(page.getByText("That weight doesn't look right. Please check it."));
  // a part of a stone in the stone box: said at once
  await box(page, "Stone").fill("11.5");
  await vis(page.getByText("Use the pounds box for part of a stone."));
  await box(page, "Stone").fill("11");
  // the first digit of an ordinary height is never "doesn't look right"
  await box(page, "Feet").fill("");
  await box(page, "Inches").fill("");
  await box(page, "Feet").pressSequentially("5");
  expect((await page.getByText("That height doesn't look right. Please check it.").count()) === 0, "'doesn't look right' on the first digit");
  await box(page, "Inches").fill("10");
  expect(!(await isGrey(page)), "Continue is still grey");
  await ctx.close();
});

await step("(e) the plan's notes: check your measurements (still shown, never blocking), the 1,200 floor with the doctor line, and a number changed by hand below what suggestions start from", async () => {
  let r = await fresh();
  await toPlan(r.page, { goal: "Maintain", diets: [], sex: "Male", age: 47, units: "metric", height: [170], weight: [160], activity: "Active" });
  await vis(r.page.getByText("Please check your height and weight, because your numbers are worked out from them. If they are right, you can carry on."));
  expect((await W.planNumbers(r.page)).calories === 3770, "the plan is still shown: " + JSON.stringify(await W.planNumbers(r.page)));
  await r.ctx.close();
  r = await fresh();
  await toPlan(r.page, { goal: "Lose weight", diets: [], sex: "Female", age: 47, units: "metric", height: [165], weight: [47], activity: "Mostly sitting" });
  await vis(r.page.getByText("Your suggested calories are never below 1,200 a day. If you plan to eat less than that, please talk to a doctor or dietitian first."));
  await vis(r.page.getByText("At your height and weight, a lower-calorie plan may not suit you. Please talk to a doctor or dietitian before you start."));
  expect((await W.planNumbers(r.page)).calories === 1200, "the floor");
  await r.ctx.close();
  r = await fresh();
  await toPlan(r.page, A);
  await go(r.page, "Change");
  await r.page.locator("#plan-calories").fill("1000");
  await vis(r.page.getByText("That's lower than most adults need.", { exact: false }));
  await r.ctx.close();
});

await step("(f) Back keeps the answers about the person in the page (How active → About you), and the plan is the same going forward again", async () => {
  const { ctx, page } = await fresh();
  await W.toAbout(page, BASE, { goalName: A.goal, diets: A.diets });
  await W.aboutYou(page, A);
  await W.aboutNext(page);
  await W.backButton(page).click();
  await W.onStep(page, "about");
  expect((await age(page).inputValue()) === "34" && (await box(page, "Stone").inputValue()) === "11" && (await page.getByRole("radio", { name: "Female", exact: true }).getAttribute("aria-checked")) === "true", "the answers were not kept going back");
  await W.aboutNext(page);
  await W.active(page, A.activity);
  await W.backButton(page).click();
  await W.onStep(page, "active");
  await W.backButton(page).click();
  await W.onStep(page, "about");
  await W.aboutNext(page);
  await W.active(page, A.activity);
  expect((await W.planNumbers(page)).calories === 1530, "the plan changed after going back");
  await ctx.close();
});

await step("(g) Change on Your plan: the − and + go to the next round number (1,530 is 1,500 and 1,550); a wrong number is said and keeps the boxes open; Save keeps a typed number as the person's own; 'Continue' saves it too", async () => {
  const { ctx, page } = await fresh();
  await toPlan(page, A);
  await go(page, "Change");
  const cal = page.locator("#plan-calories");
  expect((await cal.inputValue()) === "1530", "the box: " + (await cal.inputValue()));
  await page.getByRole("button", { name: "Decrease", exact: true }).first().click();
  expect((await cal.inputValue()) === "1500", "down from 1,530: " + (await cal.inputValue()));
  await cal.fill("1530");
  await page.getByRole("button", { name: "Increase", exact: true }).first().click();
  expect((await cal.inputValue()) === "1550", "up from 1,530: " + (await cal.inputValue()));
  await cal.fill("50");
  await vis(alerts(page).filter({ hasText: "Calories should be 500–10,000" }));
  expect((await cal.getAttribute("aria-invalid")) === "true", "the box isn't marked");
  await go(page, "Save");
  await vis(cal); // still open
  await cal.fill("1,800");
  await go(page, "Save");
  await vis(page.getByRole("button", { name: "Change", exact: true }));
  expect((await W.planNumbers(page)).calories === 1800, "Save didn't show 1,800");
  let s = await settingsOf(page);
  expect(s.dailyCalories === 1800 && s.hasSetTargets === true, "saved: " + JSON.stringify(s));
  await W.planNext(page);
  await W.onStep(page, "save");
  s = await settingsOf(page);
  expect(s.dailyCalories === 1800, "Continue changed the number: " + s.dailyCalories);
  await ctx.close();
});

// ------------------------------------------------------------------------------------------------ privacy

/** Everything this page keeps or shows: local and session storage, IndexedDB, cookies, the address, history and the window's name. */
async function everything(page) {
  const idb = await page.evaluate(async () => {
    const out = [];
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    for (const d of dbs) {
      if (String(d.name).startsWith("__next")) continue; // the dev server's own channel, not the app's
      await new Promise((res) => {
        const rq = indexedDB.open(d.name);
        rq.onerror = () => res();
        rq.onsuccess = () => {
          const db = rq.result;
          const names = [...db.objectStoreNames];
          if (!names.length) { db.close(); return res(); }
          const tx = db.transaction(names, "readonly");
          let pending = names.length;
          const done = () => { if (--pending === 0) { db.close(); res(); } };
          for (const n of names) { const g = tx.objectStore(n).getAll(); g.onsuccess = () => { out.push(JSON.stringify(g.result)); done(); }; g.onerror = done; }
        };
      });
    }
    return out;
  });
  const web = await page.evaluate(() => ({
    local: Object.entries(localStorage).map(([k, v]) => k + "=" + v),
    session: Object.entries(sessionStorage).map(([k, v]) => k + "=" + v),
    url: location.href,
    historyState: JSON.stringify(history.state),
    cookie: document.cookie,
    name: window.name,
  }));
  const cookies = (await page.context().cookies()).map((c) => c.name + "=" + c.value);
  return { ...web, cookies, idb };
}
const DISTINCT = { years: "47", kg: "83.7", cm: "183.4" };
// (the app's own build files, /_next/..., and pictures named by their hash, such as /recipe-images/<name>-<hash>.webp or /menu-images/<chain>/<hash>.webp, are left out of the address check: a hash
// can contain "47" by chance)
const seen = (haystack, what) => haystack.filter((s) => (typeof s === "string" ? s : "").includes(what) || new RegExp(`(?<![\\d.])${what.replace(/\./g, "\\.")}(?![\\d.])`).test(String(s)));

await step("(h) PRIVACY: age, sex, height, weight and activity never reach storage, cookies, the address or any request (on Your plan, the account step, Home and after a reload)", async () => {
  const { ctx, page, requests } = await fresh();
  await toPlan(page, B);
  const check = async (when) => {
    const e = await everything(page);
    const places = { local: e.local, session: e.session, idb: e.idb, cookies: e.cookies, url: [e.url, e.historyState, e.cookie, e.name], requestUrls: requests.map((r) => r.url).filter((u) => !new URL(u).pathname.startsWith("/_next/") && !/[/-][0-9a-f]{8,}\.\w+$/.test(new URL(u).pathname)), requestBodies: requests.map((r) => r.body).filter(Boolean) };
    for (const [place, list] of Object.entries(places)) {
      for (const what of [DISTINCT.kg, DISTINCT.cm, DISTINCT.years, "83,7"]) {
        const hit = seen(list, what);
        expect(hit.length === 0, `${when}: "${what}" found in ${place}: ${String(hit[0]).slice(0, 160)}`);
      }
    }
    const settings = JSON.parse((e.local.find((l) => l.startsWith("mm.v1.settings=")) ?? "mm.v1.settings=null").slice("mm.v1.settings=".length));
    const keys = Object.keys(settings?.data ?? {});
    for (const k of ["age", "sex", "height", "weight", "activity", "weightKg", "heightCm", "body", "answers", "birth", "dateOfBirth", "name"]) expect(!keys.includes(k), `${when}: settings has a "${k}" key`);
  };
  await page.getByText("An example of what you can make.", { exact: true }).or(page.getByText("Meal plan makes your week from your shop, with one shopping list.")).first().waitFor({ timeout: 60000 });
  await check("on Your plan, with the week made");
  await W.planNext(page);
  await W.onStep(page, "save");
  await check("on the account step");
  await W.notNow(page);
  await page.waitForTimeout(1500);
  await check("after finishing onboarding");
  await page.reload();
  await page.waitForTimeout(1500);
  await check("after a reload");
  const s = await settingsOf(page);
  expect(s.dailyCalories === 2220 && s.dailyProtein === 115 && s.dailyCarbs === 270 && s.dailyFat === 75, "the targets are saved: " + JSON.stringify(s));
  await ctx.close();
});

// ------------------------------------------------------------------------------------------------ Settings' form (unchanged by the seven screens)

await step("(i) Settings' single-screen form works out the same numbers as the onboarding screens, from the saved goal and diet, and its answers are not kept either", async () => {
  const settings = JSON.stringify({ v: 1, data: { goal: "lose", dailyCalories: 2000, hasSetTargets: true, glp1MealCap: 450, signUpApart: true, preferences: { vegetarianOnly: false, veganOnly: true, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });
  const { ctx, page, requests } = await fresh({}, `localStorage.setItem("mm.v1.settings", ${JSON.stringify(settings)})`);
  await page.goto(BASE + "/app/settings");
  await head(page, "Settings");
  const before = await everything(page);
  await page.getByRole("button", { name: "Suggest targets", exact: true }).click();
  const form = page.locator("form");
  await vis(form);
  for (const radio of ["Male", "Female", "Prefer not to say", "Mostly sitting", "Lightly active", "Active", "Very active", "Stone and pounds", "Kilograms", "Feet and inches", "Centimetres"]) await vis(form.getByRole("radio", { name: radio, exact: true }));
  await form.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("34");
  await box(page, "Stone").fill("11"); await box(page, "Pounds").fill("0"); await box(page, "Feet").fill("5"); await box(page, "Inches").fill("10");
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  const card = form.getByRole("status");
  await vis(card);
  const text = (await card.innerText()).replace(/\s+/g, " ");
  expect(/1,530 kcal/.test(text) && /110g protein/.test(text) && /160g carbs/.test(text) && /50g fat/.test(text), "the same plan as onboarding's person A: " + text);
  await vis(card.getByText("Because of your diet, we set your protein a little higher. Change it any time."));
  await box(page, "Pounds").fill("7");
  expect((await form.getByRole("status").count()) === 0, "a changed answer clears the result");
  await box(page, "Pounds").fill("0");
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  expect((await box(page, "Kilograms").inputValue()) === "69.9", "converted: " + (await box(page, "Kilograms").inputValue()));
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  await vis(form.getByRole("status"));
  expect(/1,530 kcal/.test((await form.getByRole("status").innerText()).replace(/\s+/g, " ")), "kg gives the same plan");
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  await page.waitForTimeout(300);
  const where = await page.evaluate(() => { const a = document.activeElement; return { first: a === document.querySelector("section#targets input"), top: a?.getBoundingClientRect().top }; });
  expect(where.first && where.top > 0 && where.top < 874, "'Use these' puts the focus on the Calories box, in view: " + JSON.stringify(where));
  const boxes = await page.evaluate(() => [...document.querySelectorAll("section#targets input")].slice(0, 4).map((i) => i.value));
  expect(JSON.stringify(boxes) === JSON.stringify(["1530", "110", "160", "50"]), "Use these fills Settings' four boxes: " + JSON.stringify(boxes));
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await vis(page.getByText("Saved."));
  const saved = await settingsOf(page);
  expect(saved.dailyCalories === 1530 && saved.dailyProtein === 110 && saved.dailyCarbs === 160 && saved.dailyFat === 50, "saved: " + JSON.stringify(saved));
  const e = await everything(page);
  const changed = e.local.filter((l) => !before.local.includes(l)).map((l) => l.split("=")[0]);
  expect(JSON.stringify(changed) === JSON.stringify(["mm.v1.settings"]), "only the settings changed in storage: " + JSON.stringify(changed));
  for (const what of ["69.9", "177.8", "69,9"]) expect(seen([...e.local, ...e.session, ...e.idb, ...e.cookies, e.url, e.historyState], what).length === 0, "a typed value in storage: " + what);
  expect(!requests.some((r) => /(69\.9|177\.8)/.test(r.url) || /(69\.9|177\.8)/.test(r.body)), "a typed value in a request");
  await ctx.close();
});

// ------------------------------------------------------------------------------------------------ taps, starting numbers, layout

await step("(j) a finger's quick second tap does not carry on past the next screen (About you → How active are you?; How active → Your plan); a mouse click is never held back", async () => {
  const { ctx, page } = await fresh({ hasTouch: true });
  await W.toAbout(page, BASE);
  await W.aboutYou(page, { sex: "Male", age: 34, height: [5, 11], weight: [12, 4] });
  await page.getByRole("heading", { level: 1 }).first().click();
  await page.waitForTimeout(800);
  const tapBottom = async () => {
    const b = await page.locator("main .sticky button.min-h-14").last().boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  await tapBottom(); // About you -> How active are you?
  await tapBottom(); // a quick second tap lands on the next screen's button
  await page.waitForTimeout(900);
  await head(page, "How active are you?");
  const tile = await page.getByRole("radio", { name: "Lightly active", exact: true }).boundingBox();
  await page.touchscreen.tap(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.waitForTimeout(700);
  await tapBottom(); // considered
  await W.onStep(page, "plan");
  await ctx.close();
});

await step("(k) skipped questions stay starting numbers (Home asks for targets); answered questions are the person's own; targets set before stay set on a Settings re-run with everything skipped", async () => {
  let r = await fresh();
  await W.toAbout(r.page, BASE);
  await W.skipBody(r.page);
  expect((await W.planNumbers(r.page)).calories === 2000, "the starting calories: " + JSON.stringify(await W.planNumbers(r.page)));
  await vis(r.page.getByText("Starting numbers.", { exact: true }));
  await W.finishFromPlan(r.page);
  expect((await settingsOf(r.page)).hasSetTargets !== true, "untouched starting numbers were saved as set");
  const done = r.page.getByRole("region", { name: "Start here" }).getByRole("button", { name: "Done with this" });
  await done.click({ timeout: 15000 }).catch(() => undefined);
  await vis(r.page.getByText("Set your targets to see what's left today"), 15000);
  await r.ctx.close();
  r = await fresh();
  await toPlan(r.page, A);
  await W.finishFromPlan(r.page);
  expect((await settingsOf(r.page)).hasSetTargets === true, "answered: the targets are not set");
  await r.ctx.close();
  const before = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 1900, dailyProtein: 120, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } });
  r = await fresh({}, `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", ${JSON.stringify(before)}); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); }`);
  await W.startSteps(r.page, BASE);
  // nothing ticked when the screen opens, not even the saved goal (founder 2026-11-21: "Options shouldn't be selected ... when someone goes on the screen")
  expect((await r.page.getByRole("radio", { name: /^Maintain/ }).getAttribute("aria-checked")) === "false", "the saved goal is ticked on a re-run");
  await W.goal(r.page, null);
  await W.avoid(r.page, { diets: null });
  await W.shops(r.page, null);
  await W.recipes(r.page);
  await W.skipBody(r.page);
  expect((await W.planNumbers(r.page)).calories === 1900, "the saved calories: " + JSON.stringify(await W.planNumbers(r.page)));
  await r.page.getByRole("button", { name: "Continue", exact: true }).click();
  await r.page.waitForTimeout(800);
  const kept = await settingsOf(r.page);
  expect(kept.hasSetTargets === true && kept.dailyCalories === 1900, "the targets set before stay set: " + JSON.stringify({ set: kept.hasSetTargets, kcal: kept.dailyCalories }));
  await r.ctx.close();
});

for (const [label, viewport, big] of [["402x874", { width: 402, height: 874 }, false], ["375x667", { width: 375, height: 667 }, false], ["200% text at 360x780", { width: 360, height: 780 }, true]]) {
  await step(`(l) ${label}: About you, How active are you? and Your plan (and its Change) have no sideways scroll, 44 px tap targets and no axe violations; About you's reason line is uncovered`, async () => {
    const { ctx, page } = await fresh({ viewport });
    const check = async (where) => {
      if (big) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.waitForTimeout(500);
      expect((await overflow(page)) <= 0, `${where}: scrolls sideways by ${await overflow(page)}`);
      const small = await smallTargets(page);
      expect(small.length === 0, `${where}: under 44 px: ${small.slice(0, 3).join(", ")}`);
      if (!big) await axe(page, where);
    };
    await W.toAbout(page, BASE, { goalName: A.goal, diets: A.diets });
    await check("About you");
    // the reason line shows once something is typed (with nothing typed the button says "Skip these")
    await box(page, "Feet").fill("5");
    const why = page.locator("#welcome-why-grey");
    const hit = await why.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (el === h || el.contains(h)); });
    expect(hit, `${label}: the reason line is covered`);
    await W.aboutYou(page, A);
    await W.aboutNext(page);
    await check("How active are you?");
    await W.active(page, A.activity);
    await page.getByText("An example of what you can make.", { exact: true }).or(page.getByText("Meal plan makes your week from your shop, with one shopping list.")).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    await check("Your plan");
    await go(page, "Change");
    await check("Your plan, changing the numbers");
    await ctx.close();
  });
}

// Step 2 "Anything you avoid?" (the review of 20 November evening, a safety finding): the allergies come first, so someone with a peanut or milk allergy sees
// them before "Nothing to avoid": the common seven as big chips in the first view, "More" for the other seven, then the diets' pictures.
for (const [label, viewport] of [["402x874", { width: 402, height: 874 }], ["375x667", { width: 375, height: 667 }]]) {
  await step(`(m) ${label}: step 2's allergy chips are in the first view, above the bottom bar, before the diet pictures; More brings out the rest and is kept open by a choice among them`, async () => {
    const { ctx, page } = await fresh({ viewport });
    await W.startSteps(page, BASE);
    await W.goal(page, null);
    await page.waitForTimeout(500);
    const seen = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[role="group"][aria-label="Allergies to avoid"] button')];
      const bar = [...document.querySelectorAll("main div")].find((d) => d.className.includes("sticky bottom-0"));
      const diet = document.querySelector('[role="group"][aria-label="Your diet"]');
      return { y: scrollY, barTop: bar ? bar.getBoundingClientRect().top : innerHeight, dietTop: diet ? diet.getBoundingClientRect().top : 0, chips: chips.map((c) => ({ name: c.textContent.trim(), bottom: c.getBoundingClientRect().bottom })) };
    });
    expect(seen.y === 0, "the screen opened scrolled");
    expect(seen.chips.map((c) => c.name).join(",") === "Gluten,Milk,Eggs,Peanuts,Tree nuts,Soya,Fish,More", "the first chips: " + seen.chips.map((c) => c.name).join(","));
    const low = seen.chips.filter((c) => c.bottom > seen.barTop);
    expect(low.length === 0, `under the bottom bar (${Math.round(seen.barTop)} px): ${low.map((c) => `${c.name} ${Math.round(c.bottom)}`).join(", ")}`);
    expect(seen.dietTop > Math.max(...seen.chips.map((c) => c.bottom)), "the diet pictures come after the allergies");
    expect(await page.getByText("Filters use each restaurant's own allergen guide. Always check with staff.").isVisible(), "the allergy caution");
    await axe(page, "Anything you avoid?");
    await W.moreAllergies(page).click();
    expect(!(await W.moreAllergies(page).count()), "More is still there once tapped");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    expect(focused.startsWith("Crustaceans"), "the focus after More: " + focused);
    expect((await page.getByRole("group", { name: "Allergies to avoid" }).getByRole("button").count()) === 14, "all 14 after More");
    await W.allergyChip(page, "Sesame").click();
    await go(page, "Continue");
    await W.onStep(page, "shops");
    await W.backButton(page).click();
    await W.onStep(page, "avoid");
    expect((await W.allergyChip(page, "Sesame").getAttribute("aria-pressed")) === "true" && !(await W.moreAllergies(page).count()), "a chosen allergy behind More is hidden on the way back");
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
