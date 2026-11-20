import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import * as W from "./welcome-steps.mjs";

// Onboarding's three questions about the person (About you, Your height and weight, How active are you?) and "Your daily targets" arriving filled in from them
// (founder 2026-10-16), and Settings' single-screen version of the same questions. Two people are typed in:
//   A: a vegan woman, 34, 11 st 0 lb, 5 ft 10 in, lightly active, wants to lose weight  -> 1,530 kcal, 110 g protein, 160 g carbs, 50 g fat
//   B: a man, 47, 83.7 kg, 183.4 cm, active, on a GLP-1 medicine                      -> 2,220 kcal, 115 g protein, 270 g carbs, 75 g fat
// (the numbers are checked against planTargets in tests/onboardingPlan.test.ts, so they can't drift from the code). Nothing typed about the body may be
// stored or sent: after finishing, storage, cookies, the address and every request are searched for it.
// Since the onboarding redesign meeting of 20 November 2026 (approved by the founder) these are steps 6 to 9 of 11 (lib/mm/welcomeSteps.ts): after the goal,
// the foods avoided, Eat out, the shops and the recipes; then "Your week, planned" and the account (e2e/showcase.mjs walks the whole run). "Skip these
// questions" (no top-right pill on steps 6 to 8) jumps 6 to 9, How active's button is "Work out my numbers", the targets' is "Next: plan my week" and they
// have no Skip; there is no "You're all set!": Home follows step 11.
// Steps (w) to (aa) check the onboarding meetings on the screen: skipped targets stay starting numbers, nothing is ticked for the person, the reason a
// Continue is grey, the targets screen's layout at 390x844, the foods-to-avoid and shop lines, and step 10's fold. Run with the switches the server was started
// with: on a gated build (NEXT_PUBLIC_PRO=1) the fold check (aa) also expects the free and Premium line.

const BASE = process.env.BASE ?? "http://localhost:3101";
/** Premium is sold in this build (lib/mm/config.ts GATING_ENABLED): the last screen then has the free and Premium line. */
const GATED = process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// Pip's tips on the real screens (CoachMarks, 2026-11-18) are stopped in this test, as if the person had pressed "Stop the tips": e2e/coach.mjs covers them.
{
  const open = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await open(options);
    await c.addInitScript(() => { try { if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } })); } catch { /* storage blocked */ } });
    return c;
  };
}
let pass = 0, fail = 0;
async function step(n, fn) { if (process.env.ONLY && !n.startsWith(process.env.ONLY)) return; try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0], (String(e.stack).match(/(onboarding-body|welcome-steps)\.mjs:\d+/) ?? [""])[0], (String(e.message).match(/waiting for (.*)/) ?? [])[1] ?? ""); } }
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const vis = (l) => l.waitFor({ state: "visible", timeout: 10000 });

async function fresh(extra = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", locale: "en-GB", ...extra });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => { requests.push({ url: r.url(), body: r.postData() ?? "" }); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, requests, errors };
}
const go = (page, name) => page.getByRole("button", { name, exact: true }).click();
const cont = (page) => go(page, "Continue");
const head = (page, name) => vis(page.getByRole("heading", { name }));
/** The welcome cover, then Get started, to "What's your goal?" (step 1 of 11: no Pip's hello screen, no tour, no fork since 20 November). */
const toGoal = (page, path = "/app/welcome") => W.startSteps(page, BASE, path);
/** The counter ("Step n of 11"). */
const status = (page, n) => W.expectCounter(page, n);
/** Steps 3 to 5 (Eat out, the shops with nothing ticked, the recipes), from step 3 to "About you". */
async function features(page) {
  await W.eatOut(page);
  await W.shops(page);
  await W.recipes(page);
}
/** How active's button. */
const work = (page) => go(page, "Work out my numbers");
/** The targets' Next, to "Your week, planned". */
async function planWeek(page) {
  await go(page, "Next: plan my week");
  await head(page, "Your week, planned");
}
/** Step 6 to 8's quiet link: the three questions skipped, to the targets. */
const skipQuestions = (page) => go(page, "Skip these questions");
/** From the targets to Home (sign-in optional): the week, then "Not now" on the account step. */
async function toHome(page) {
  await planWeek(page);
  await W.weekNext(page);
  await W.notNow(page);
}
/** Nothing is picked for the person on a first run (the onboarding meeting, 19 November): the goal and the activity are tapped, and the foods-to-avoid button says
 * "Nothing to avoid" while nothing is ticked. */
const nothingToAvoid = (page) => go(page, "Nothing to avoid");
/** Past the goal (Maintain, the saved goal everyone starts with), the foods to avoid (none) and steps 3 to 5, to "About you". */
async function firstTwo(page) {
  await page.getByRole("radio", { name: "Maintain" }).click();
  await cont(page);
  await head(page, "Anything you avoid?");
  await nothingToAvoid(page);
  await features(page);
}
const pickActivity = (page, name = "Lightly active") => page.getByRole("radio", { name, exact: true }).click();
const num = (page, id) => page.locator(`#target-${id}`).inputValue();
const targets = async (page) => ({ calories: await num(page, "calories"), protein: await num(page, "protein"), carbs: await num(page, "carbs"), fat: await num(page, "fat") });
const settingsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") ?? "null")?.data ?? {});
const box = (page, name) => page.getByRole("textbox", { name, exact: true });
const age = (page) => page.getByLabel("Age", { exact: true });
/** Leave whatever box has the focus (a tap on the headline): the keyboard goes away, as when a person taps elsewhere. */
const leave = (page) => page.getByRole("heading", { level: 1 }).first().click();
/** The lines that tell the person something is wrong (not Next's empty route announcer, which is also an alert). */
const alerts = (page) => page.locator("[role='alert']").filter({ hasText: /\S/ });

async function about(page, { sex, years }) {
  await head(page, "About you");
  await page.getByRole("radio", { name: sex, exact: true }).click();
  await age(page).fill(years);
}
async function size(page, { weight, height }) {
  await head(page, "Your height and weight");
  if (weight.kg !== undefined) {
    await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
    await box(page, "Kilograms").fill(weight.kg);
  } else {
    await box(page, "Stone").fill(weight.st);
    await box(page, "Pounds").fill(weight.lb);
  }
  if (height.cm !== undefined) {
    await page.getByRole("radio", { name: "Centimetres", exact: true }).click();
    await box(page, "Centimetres").fill(height.cm);
  } else {
    await box(page, "Feet").fill(height.ft);
    await box(page, "Inches").fill(height.inch);
  }
}
const A = { goal: "Lose weight", diet: "Vegan", sex: "Female", years: "34", weight: { st: "11", lb: "0" }, height: { ft: "5", inch: "10" }, activity: "Lightly active", plan: { calories: "1530", protein: "110", carbs: "160", fat: "50" } };
const B = { goal: "I'm on a GLP-1 medication", sex: "Male", years: "47", weight: { kg: "83.7" }, height: { cm: "183.4" }, activity: "Active", plan: { calories: "2220", protein: "115", carbs: "270", fat: "75" } };

/** One person through goal, diet, steps 3 to 5, the three questions and on to the targets screen. */
async function toTargets(page, p) {
  await page.getByRole("radio", { name: p.goal }).click();
  await cont(page);
  await head(page, "Anything you avoid?");
  if (p.diet) {
    await page.getByRole("button", { name: p.diet, exact: true }).click();
    await cont(page);
  } else await nothingToAvoid(page);
  await features(page);
  await about(page, p);
  await cont(page);
  await size(page, p);
  await cont(page);
  await head(page, "How active are you?");
  await page.getByRole("radio", { name: p.activity, exact: true }).click();
  await work(page);
  await head(page, "Your daily targets");
}

/** The progress bar's segments on this screen (0 when there is no bar). */
const segmentsOf = W.segments;

await step("(a) the screens come in the new order with the right headings and 'Step n of 11'; nothing is picked for the person (the goal and the activity start unticked with Continue grey and saying why; Tab reaches the first goal); after the targets, the week and the account (no 'You're all set!')", async () => {
  const { ctx, page, errors } = await fresh();
  await toGoal(page);
  await status(page, 1);
  expect((await segmentsOf(page)) === 11, "eleven progress segments, got " + (await segmentsOf(page)));
  // a first run: no goal ticked, Continue grey with its reason linked to it, and the Tab key reaches the first goal
  expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, "a goal is ticked on a first run");
  const goOn = page.getByRole("button", { name: "Continue", exact: true });
  expect(await goOn.isDisabled(), "Continue works before a goal is picked");
  const why = await goOn.getAttribute("aria-describedby");
  expect(!!why && (await page.locator("#" + why).innerText()) === "Pick one to go on, or tap Skip at the top.", "Continue's reason: " + why);
  await page.getByRole("heading", { level: 1 }).first().focus();
  let reached = false;
  for (let i = 0; i < 8 && !reached; i++) { await page.keyboard.press("Tab"); reached = await page.evaluate(() => document.activeElement?.getAttribute("role") === "radio" && document.activeElement.textContent.includes("Lose weight")); }
  expect(reached, "Tab doesn't reach the first goal");
  await page.getByRole("radio", { name: "Maintain" }).click();
  await cont(page);
  await head(page, "Anything you avoid?"); await status(page, 2);
  // nothing ticked: the button says so (and does the same as Continue)
  expect((await page.getByRole("button", { name: "Continue", exact: true }).count()) === 0, "Continue on an untouched foods-to-avoid screen");
  await nothingToAvoid(page);
  await head(page, "Know before you order"); await status(page, 3);
  await W.eatOut(page);
  await status(page, 4);
  await W.shops(page);
  await status(page, 5);
  await W.recipes(page);
  await head(page, "About you"); await status(page, 6);
  // no top-right pill on the questions about the person: "Skip these questions" under Continue is the skip
  expect((await page.getByRole("button", { name: "Skip", exact: true }).count()) === 0, "a top-right Skip on About you");
  await vis(page.getByRole("button", { name: "Skip these questions", exact: true }));
  await age(page).fill("34");
  await cont(page);
  await head(page, "Your height and weight"); await status(page, 7);
  await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
  await cont(page);
  await head(page, "How active are you?"); await status(page, 8);
  expect((await page.getByRole("radio").count()) === 4, "four activity tiles");
  for (const a of ["Mostly sitting", "Lightly active", "Active", "Very active"]) await vis(page.getByRole("radio", { name: a, exact: true }));
  expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, "an activity is ticked before one is tapped");
  expect(await page.getByRole("button", { name: "Work out my numbers", exact: true }).isDisabled(), "Work out my numbers works before an activity is picked");
  await vis(page.getByText("Pick the one closest to your week to go on, or skip these questions below."));
  await pickActivity(page);
  await work(page);
  await head(page, "Your daily targets"); await status(page, 9);
  for (const label of ["Calories", "Protein (g)", "Carbs (g)", "Fat (g)"]) await vis(page.getByLabel(label, { exact: true }));
  // no Skip on the targets: Next is the only way on
  expect((await page.getByRole("button", { name: /^Skip/ }).count()) === 0, "a Skip on the targets");
  await planWeek(page);
  await status(page, 10);
  await W.weekNext(page);
  await head(page, "Save your goal and numbers: make your free account"); await status(page, 11);
  expect((await page.getByRole("heading", { name: "You're all set!" }).count()) === 0, "'You're all set!' is back");
  expect((await page.getByRole("heading", { name: "Easy to read" }).count()) === 0, "the text size is no longer a question");
  expect(errors.length === 0, errors[0]);
  await ctx.close();
});

await step("(b) person A (a vegan woman in stone and feet): the targets arrive filled in, all four can be changed, and Continue saves them for Home", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  const t = await targets(page);
  expect(JSON.stringify(t) === JSON.stringify(A.plan), "plan for A: " + JSON.stringify(t));
  await vis(page.getByText("Worked out on your phone from your answers. They're only a starting point: tap a number to type your own, or use − and +."));
  await vis(page.getByText("Because of your diet, we set your protein a little higher. Change it any time."));
  expect((await page.getByText("Not sure? Suggest targets for me").count()) === 0, "no second way to get suggestions when the questions were answered");
  expect((await page.locator("#target-mealcap").count()) === 0, "no meal size box off GLP-1");
  // every number can be changed: type calories, step carbs up, type protein, clear fat
  await page.locator("#target-calories").fill("1600");
  await page.locator("#target-protein").fill("115");
  // the worked-out carbs followed the new calories (usability test 2026-11-19), and + goes to the next multiple of 5
  const carbsBefore = Number(await num(page, "carbs"));
  await page.getByRole("button", { name: "Increase", exact: true }).nth(2).click();
  const carbsNow = Math.floor(carbsBefore / 5) * 5 + 5;
  expect(Number(await num(page, "carbs")) === carbsNow, `carbs stepped up from ${carbsBefore}: ` + (await num(page, "carbs")));
  await page.locator("#target-fat").fill("");
  await planWeek(page);
  const s = await settingsOf(page);
  expect(s.dailyCalories === 1600 && s.dailyProtein === 115 && s.dailyCarbs === carbsNow && s.hasSetTargets === true, "saved: " + JSON.stringify(s));
  expect(!("dailyFat" in s) || s.dailyFat === undefined, "an emptied fat box stays unset: " + s.dailyFat);
  // the week is sized to the typed number, and on to Home, which shows the same numbers (typed ones first, the empty fat worked out from the calories: 30% of
  // 1,600 at 9 kcal/g = 53 -> 55)
  await vis(page.getByText(/\(your target is 1,600 kcal\)\.$/), 45000).catch(() => undefined);
  await W.weekNext(page);
  await W.notNow(page);
  await page.getByRole("heading", { level: 1, name: /^Home/ }).waitFor();
  await page.waitForTimeout(800);
  const home = await page.locator("main").innerText();
  expect(/of 1,600 kcal/.test(home) && /\/\s*115g/.test(home) && new RegExp(`/\\s*${carbsNow}g`).test(home) && /\/\s*55g/.test(home), "Home agrees: " + home.replace(/\s+/g, " ").slice(300, 1500));
  await ctx.close();
});

await step("(b) person B (a man in kg and cm on a GLP-1 medicine): the plan fills in, the comfortable meal size stays 450, and the medicine line shows once", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: B.goal }).click();
  await cont(page);
  await head(page, "Anything you avoid?");
  await nothingToAvoid(page);
  await features(page);
  await about(page, B);
  await cont(page);
  await size(page, B);
  await cont(page);
  await head(page, "How active are you?");
  await page.getByRole("radio", { name: B.activity, exact: true }).click();
  await work(page);
  await head(page, "Your daily targets");
  expect(JSON.stringify(await targets(page)) === JSON.stringify(B.plan), "plan for B: " + JSON.stringify(await targets(page)));
  expect((await page.locator("#target-mealcap").inputValue()) === "450", "the meal size is not worked out from the plan");
  expect((await page.getByText("If you take a GLP-1 medication, follow the advice of your doctor or pharmacist.").count()) === 1, "the medicine line shows once");
  await planWeek(page);
  const s = await settingsOf(page);
  expect(s.dailyCalories === 2220 && s.dailyProtein === 115 && s.dailyCarbs === 270 && s.dailyFat === 75 && s.glp1MealCap === 450, "saved: " + JSON.stringify(s));
  await ctx.close();
});

await step("(c) switching a unit keeps the person (converted, and exactly their own words when switched back) and gives the same plan", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: A.goal }).click();
  await cont(page);
  await page.getByRole("button", { name: A.diet, exact: true }).click();
  await cont(page);
  await features(page);
  await about(page, A);
  await cont(page);
  await size(page, A);
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await page.getByRole("radio", { name: "Centimetres", exact: true }).click();
  expect((await box(page, "Kilograms").inputValue()) === "69.9", "11 st 0 lb is 69.9 kg: " + (await box(page, "Kilograms").inputValue()));
  expect((await box(page, "Centimetres").inputValue()) === "177.8", "5 ft 10 in is 177.8 cm: " + (await box(page, "Centimetres").inputValue()));
  // back and forth gives the original words
  await page.getByRole("radio", { name: "Stone and pounds", exact: true }).click();
  await page.getByRole("radio", { name: "Feet and inches", exact: true }).click();
  expect((await box(page, "Stone").inputValue()) === "11" && (await box(page, "Pounds").inputValue()) === "0" && (await box(page, "Feet").inputValue()) === "5" && (await box(page, "Inches").inputValue()) === "10", "the original boxes are back");
  // and leave them in kilograms and centimetres: the same plan
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await page.getByRole("radio", { name: "Centimetres", exact: true }).click();
  await cont(page);
  await head(page, "How active are you?");
  await pickActivity(page, A.activity);
  await work(page);
  await head(page, "Your daily targets");
  expect(JSON.stringify(await targets(page)) === JSON.stringify(A.plan), "the same plan in kg and cm: " + JSON.stringify(await targets(page)));
  // a person B typed in stone and feet gets the plan worked out from their own kilograms, not from the rounded copy
  await ctx.close();
  const two = await fresh();
  await toGoal(two.page);
  await two.page.getByRole("radio", { name: B.goal }).click();
  await cont(two.page); await nothingToAvoid(two.page);
  await features(two.page);
  await about(two.page, B);
  await cont(two.page);
  await size(two.page, B);
  await two.page.getByRole("radio", { name: "Stone and pounds", exact: true }).click();
  await two.page.getByRole("radio", { name: "Feet and inches", exact: true }).click();
  expect((await box(two.page, "Stone").inputValue()) === "13" && (await box(two.page, "Pounds").inputValue()) === "2.5", "83.7 kg is 13 st 2.5 lb: " + (await box(two.page, "Pounds").inputValue()));
  expect((await box(two.page, "Feet").inputValue()) === "6" && (await box(two.page, "Inches").inputValue()) === "0.2", "183.4 cm is 6 ft 0.2 in: " + (await box(two.page, "Inches").inputValue()));
  await cont(two.page); await head(two.page, "How active are you?");
  await two.page.getByRole("radio", { name: B.activity, exact: true }).click();
  await work(two.page);
  await head(two.page, "Your daily targets");
  expect(JSON.stringify(await targets(two.page)) === JSON.stringify(B.plan), "B in stone and feet gets the same plan: " + JSON.stringify(await targets(two.page)));
  await two.ctx.close();
});

await step("(d) 'Skip these questions' on a body screen skips all three: the targets screen has nothing filled in, 'Not sure? Suggest targets for me' is there, and Back returns to About you (all three are empty, so they are answered in order)", async () => {
  for (const from of ["About you", "Your height and weight", "How active are you?"]) {
    const { ctx, page } = await fresh();
    await toGoal(page);
    await firstTwo(page);
    await head(page, "About you");
    if (from !== "About you") {
      await age(page).fill("34");
      await cont(page);
      await head(page, "Your height and weight");
      if (from === "How active are you?") {
        await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
        await cont(page);
        await head(page, "How active are you?");
      }
    }
    await skipQuestions(page);
    await head(page, "Your daily targets");
    await status(page, 9);
    const t = await targets(page);
    expect(t.calories === "2000" && t.protein === "" && t.carbs === "" && t.fat === "", `${from}: nothing is filled in, calories stay at the default: ` + JSON.stringify(t));
    expect((await page.getByText("Worked out on your phone from your answers.", { exact: false }).count()) === 0, "no line about worked-out numbers");
    await vis(page.getByText("These are starting numbers, not worked out for you. Know your number? Tap Calories and type it in."));
    await vis(page.getByRole("button", { name: "Not sure? Suggest targets for me" }));
    await vis(page.getByText("Left empty, protein, carbs and fat are worked out from your calories", { exact: false }));
    await page.getByRole("button", { name: "Back to the previous step" }).click();
    await head(page, "About you");
    expect((await age(page).inputValue()) === "", `${from}: the age that was typed is gone with the skip`);
    if (from !== "About you") {
      // answering all three again, in order, gives the plan (a Continue on Your height and weight or How active used to carry on with no age)
      await age(page).fill("34");
      await cont(page);
      await head(page, "Your height and weight");
      expect((await box(page, "Stone").inputValue()) === "" && (await box(page, "Feet").inputValue()) === "", `${from}: the height and weight that were typed are gone too`);
      await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
      await cont(page);
      await head(page, "How active are you?");
      // the skip cleared the activity too: nothing is ticked again
      expect((await page.locator("[role='radio'][aria-checked='true']").count()) === 0, `${from}: an activity is still ticked after the skip`);
      await pickActivity(page);
      await work(page);
      await head(page, "Your daily targets");
      const again = await targets(page);
      expect(again.calories !== "2000" && again.protein !== "" && again.carbs !== "" && again.fat !== "", `${from}: answering again fills the plan in: ` + JSON.stringify(again));
      expect((await page.getByText("Not sure? Suggest targets for me").count()) === 0, `${from}: no second way to get suggestions once the questions are answered`);
    }
    await ctx.close();
  }
  // the single-screen form opens from there, works out the same numbers as the screens and 'Use these' fills the four boxes
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: A.goal }).click();
  await cont(page); await nothingToAvoid(page); await features(page); await skipQuestions(page);
  await head(page, "Your daily targets");
  await page.getByRole("button", { name: "Not sure? Suggest targets for me" }).click();
  const form = page.locator("form");
  await form.getByRole("radio", { name: A.sex, exact: true }).click();
  await age(page).fill(A.years);
  await box(page, "Stone").fill("11"); await box(page, "Pounds").fill("0"); await box(page, "Feet").fill("5"); await box(page, "Inches").fill("10");
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  const card = form.getByRole("status");
  await vis(card);
  const text = (await card.innerText()).replace(/\s+/g, " ");
  expect(/1,530 kcal/.test(text) && /100g protein/.test(text) && /170g carbs/.test(text) && /50g fat/.test(text), "the suggestion (no diet chosen): " + text);
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  expect(JSON.stringify(await targets(page)) === JSON.stringify({ calories: "1530", protein: "100", carbs: "170", fat: "50" }), "Use these fills the four boxes: " + JSON.stringify(await targets(page)));
  await ctx.close();
});

await step("(e) under 18 goes straight to the targets with the doctor line, and invalid answers are named and block Continue", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await firstTwo(page);
  await head(page, "About you");
  await age(page).fill("17");
  expect((await alerts(page).count()) === 0, "under 18 is not a typing mistake");
  await cont(page);
  await head(page, "Your daily targets");
  await vis(page.getByText("Ask a doctor or dietitian for targets."));
  expect((await page.getByText("Suggested starting points", { exact: false }).count()) === 0, "nothing was suggested, so nothing is called a suggestion");
  const t = await targets(page);
  expect(t.calories === "2000" && t.protein === "" && t.carbs === "" && t.fat === "", "nothing is worked out: " + JSON.stringify(t));
  expect((await page.getByText("Not sure? Suggest targets for me").count()) === 0, "no suggest form for an under-18");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "About you");
  expect((await age(page).inputValue()) === "17", "the age is kept");
  // invalid ages
  for (const bad of ["150", "0", "34.5", "abc"]) {
    await age(page).fill(bad);
    await vis(alerts(page).filter({ hasText: "Enter your age as a whole number from 18 to 100." }));
    expect(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), `Continue is off for age ${bad}`);
  }
  await age(page).fill("34");
  expect((await alerts(page).count()) === 0, "the message goes");
  await cont(page);
  await head(page, "Your height and weight");
  expect(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), "Continue is off with nothing typed");
  // a weight or height the plan can't use is said once the person has left the block (see (l)), not on every key
  await box(page, "Stone").fill("1");
  await leave(page);
  await vis(alerts(page).filter({ hasText: "That weight doesn't look right. Please check it." }));
  await box(page, "Stone").fill("11");
  await box(page, "Feet").fill("2");
  await leave(page);
  await vis(alerts(page).filter({ hasText: "That height doesn't look right. Please check it." }));
  expect(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), "Continue is off for a height of 2 ft");
  // a part of a stone or a foot in the stone or feet box is refused, never read the wrong way
  await box(page, "Stone").fill("11.5");
  await vis(alerts(page).filter({ hasText: "Use the pounds box for part of a stone." }));
  await box(page, "Stone").fill("11");
  await box(page, "Feet").fill("5.10");
  await vis(alerts(page).filter({ hasText: "Use the inches box for part of a foot." }));
  expect(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), "Continue is off for 5.10 feet");
  await box(page, "Feet").fill("5");
  await box(page, "Inches").fill("10.5");
  expect((await alerts(page).count()) === 0, "a part of an inch is fine");
  expect(!(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled()), "Continue is on");
  // kg and cm may have a fraction, and a comma is a decimal point
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await box(page, "Kilograms").fill("83,7");
  expect((await alerts(page).count()) === 0, "83,7 kg is fine");
  await ctx.close();
});

await step("(f) the notes: check your measurements, the 1,200 floor and doctor first, the medicine line and the diet's protein", async () => {
  // C: a 160 typed in the kilograms box at 170 cm
  let r = await fresh();
  await toGoal(r.page);
  await toTargets(r.page, { goal: "Maintain", sex: "Male", years: "47", weight: { kg: "160" }, height: { cm: "170" }, activity: "Active" });
  await vis(r.page.getByText("Please check your height and weight, because your numbers are worked out from them. If they are right, you can carry on."));
  expect(JSON.stringify(await targets(r.page)) === JSON.stringify({ calories: "3770", protein: "190", carbs: "470", fat: "125" }), "the plan is still shown: " + JSON.stringify(await targets(r.page)));
  expect(!(await r.page.getByRole("button", { name: "Next: plan my week", exact: true }).isDisabled()), "it doesn't block");
  await r.ctx.close();
  // D: a small body on a lose-weight plan
  r = await fresh();
  await toGoal(r.page);
  await toTargets(r.page, { goal: "Lose weight", sex: "Female", years: "47", weight: { kg: "47" }, height: { cm: "165" }, activity: "Mostly sitting" });
  await vis(r.page.getByText("Your suggested calories are never below 1,200 a day. If you plan to eat less than that, please talk to a doctor or dietitian first."));
  await vis(r.page.getByText("At your height and weight, a lower-calorie plan may not suit you. Please talk to a doctor or dietitian before you start."));
  expect((await num(r.page, "calories")) === "1200", "the floor");
  await r.ctx.close();
  // B: the medicine line; A: the diet line
  r = await fresh();
  await toGoal(r.page);
  await toTargets(r.page, { ...B, goal: B.goal });
  await vis(r.page.getByText("If you take a GLP-1 medication, follow the advice of your doctor or pharmacist. Numbite doesn't give medical advice."));
  await r.ctx.close();
  r = await fresh();
  await toGoal(r.page);
  await toTargets(r.page, A);
  await vis(r.page.getByText("Because of your diet, we set your protein a little higher. Change it any time."));
  await vis(r.page.getByText("Suggested starting points, not medical advice. Adjust any time."));
  // no word that judges a body or food anywhere on the new screens
  const all = (await r.page.locator("main, body").first().innerText()).toLowerCase();
  for (const word of ["overweight", "underweight", "obese", "healthy", "ideal"]) expect(!all.includes(word), "the word " + word);
  await r.ctx.close();
});

await step("(g) Back keeps every answer all the way, and a number changed by hand survives going back and forward when the answers are the same", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  await page.locator("#target-calories").fill("1600");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "How active are you?");
  expect(await page.getByRole("radio", { name: A.activity, exact: true }).getAttribute("aria-checked") === "true", "activity kept");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Your height and weight");
  expect((await box(page, "Stone").inputValue()) === "11" && (await box(page, "Pounds").inputValue()) === "0" && (await box(page, "Feet").inputValue()) === "5" && (await box(page, "Inches").inputValue()) === "10", "height and weight kept");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "About you");
  expect((await age(page).inputValue()) === "34" && (await page.getByRole("radio", { name: "Female", exact: true }).getAttribute("aria-checked")) === "true", "sex and age kept");
  // Back through the recipes, the shops and Eat out (steps 5, 4 and 3)
  for (const h of [/^Recipes/, "Where do you shop?", "Know before you order"]) { await page.getByRole("button", { name: "Back to the previous step" }).click(); await head(page, h); }
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Anything you avoid?");
  expect(await page.getByRole("button", { name: "Vegan", exact: true }).getAttribute("aria-pressed") === "true", "diet kept");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "What's your goal?");
  expect(await page.getByRole("radio", { name: "Lose weight" }).getAttribute("aria-checked") === "true", "goal kept");
  // forward again: the same answers leave the hand-typed 1,600 alone
  await cont(page); await head(page, "Anything you avoid?");
  await cont(page);
  await features(page);
  for (const h of ["Your height and weight", "How active are you?"]) { await cont(page); await head(page, h); }
  await work(page); await head(page, "Your daily targets");
  expect((await num(page, "calories")) === "1600", "the typed calories survive: " + (await num(page, "calories")));
  // different answers fill the plan in again
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await page.getByRole("radio", { name: "Very active", exact: true }).click();
  await work(page);
  await head(page, "Your daily targets");
  const t = await targets(page);
  expect(t.calories !== "1600" && Number(t.calories) > 1530, "new answers, new plan: " + JSON.stringify(t));
  await ctx.close();
});

const DISTINCT = { years: "47", kg: "83.7", cm: "183.4" };
/** Everything the page could have kept: storage, cookies, the address, history state, IndexedDB. */
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
// (the app's own build files, /_next/static/<hash>.js, are left out of the address check: their names are hashes of the code, so a production build can contain "47" by chance)
const seen = (haystack, what) => haystack.filter((s) => (typeof s === "string" ? s : "").includes(what) || new RegExp(`(?<![\\d.])${what.replace(/\./g, "\\.")}(?![\\d.])`).test(String(s)));

await step("(h) PRIVACY: age, sex, height, weight and activity never reach storage, cookies, the address or any request (checked on the targets screen and after finishing)", async () => {
  const { ctx, page, requests } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: B.goal }).click();
  await cont(page); await nothingToAvoid(page);
  await features(page);
  await about(page, B);
  await cont(page);
  await size(page, B);
  await cont(page);
  await head(page, "How active are you?");
  await page.getByRole("radio", { name: B.activity, exact: true }).click();
  await work(page);
  await head(page, "Your daily targets");
  const check = async (when) => {
    const e = await everything(page);
    const places = { local: e.local, session: e.session, idb: e.idb, cookies: e.cookies, url: [e.url, e.historyState, e.cookie, e.name], requestUrls: requests.map((r) => r.url).filter((u) => !new URL(u).pathname.startsWith("/_next/static/")), requestBodies: requests.map((r) => r.body).filter(Boolean) };
    for (const [place, list] of Object.entries(places)) {
      for (const what of [DISTINCT.kg, DISTINCT.cm, DISTINCT.years, "83,7"]) {
        const hit = seen(list, what);
        expect(hit.length === 0, `${when}: "${what}" found in ${place}: ${String(hit[0]).slice(0, 160)}`);
      }
    }
    const settings = JSON.parse((e.local.find((l) => l.startsWith("mm.v1.settings=")) ?? "mm.v1.settings=null").slice("mm.v1.settings=".length));
    const keys = Object.keys(settings?.data ?? {});
    for (const k of ["age", "sex", "height", "weight", "activity", "weightKg", "heightCm", "body", "answers"]) expect(!keys.includes(k), `${when}: settings has a "${k}" key`);
  };
  await check("on the targets screen");
  await planWeek(page);
  // the week is worked out on the phone from the saved numbers (lib/mm/planPreview.ts): still nothing about the body anywhere
  await page.getByRole("region", { name: "A look at Meal plan, on Home" }).locator("h2", { hasText: /^Monday$/ }).waitFor({ timeout: 45000 }).catch(() => undefined);
  await check("after the targets were saved, with the week made");
  await W.weekNext(page);
  await check("on the account step");
  await W.notNow(page);
  await page.waitForTimeout(1500);
  await check("after finishing onboarding");
  // reload: a new page of the app, still nothing
  await page.reload();
  await page.waitForTimeout(1500);
  await check("after a reload");
  // the plan's own numbers are what was saved
  const s = await settingsOf(page);
  expect(s.dailyCalories === 2220 && s.dailyProtein === 115 && s.dailyCarbs === 270 && s.dailyFat === 75, "the targets are saved: " + JSON.stringify(s));
  await ctx.close();
});

await step("(i) Settings' single-screen form works out the same numbers as the onboarding screens, from the saved goal and diet, and its answers are not kept either", async () => {
  const settings = JSON.stringify({ v: 1, data: { goal: "lose", dailyCalories: 2000, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, veganOnly: true, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });
  const { ctx, page, requests } = await fresh({}, `localStorage.setItem("mm.v1.settings", ${JSON.stringify(settings)})`);
  await page.goto(BASE + "/app/settings");
  await head(page, "Settings");
  const before = await everything(page);
  await page.getByRole("button", { name: "Suggest targets", exact: true }).click();
  const form = page.locator("form");
  await vis(form);
  // the same fields as onboarding, with the same unit choices
  for (const radio of ["Male", "Female", "Prefer not to say", "Mostly sitting", "Lightly active", "Active", "Very active", "Stone and pounds", "Kilograms", "Feet and inches", "Centimetres"]) await vis(form.getByRole("radio", { name: radio, exact: true }));
  await form.getByRole("radio", { name: "Female", exact: true }).click();
  await age(page).fill("34");
  await box(page, "Stone").fill("11"); await box(page, "Pounds").fill("0"); await box(page, "Feet").fill("5"); await box(page, "Inches").fill("10");
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  const card = form.getByRole("status");
  await vis(card);
  const text = (await card.innerText()).replace(/\s+/g, " ");
  expect(/1,530 kcal/.test(text) && /110g protein/.test(text) && /160g carbs/.test(text) && /50g fat/.test(text), "the same plan as onboarding's person A: " + text);
  await vis(card.getByText("Because of your diet, we set your protein a little higher. Change it any time."));
  // any change takes the old result away
  await box(page, "Pounds").fill("7");
  expect((await form.getByRole("status").count()) === 0, "a changed answer clears the result");
  // switching a unit keeps the person here too
  await box(page, "Pounds").fill("0");
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  expect((await box(page, "Kilograms").inputValue()) === "69.9", "converted: " + (await box(page, "Kilograms").inputValue()));
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  await vis(form.getByRole("status"));
  expect(/1,530 kcal/.test((await form.getByRole("status").innerText()).replace(/\s+/g, " ")), "kg gives the same plan");
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  const boxes = await page.evaluate(() => [...document.querySelectorAll("section#targets input")].slice(0, 4).map((i) => i.value));
  expect(JSON.stringify(boxes) === JSON.stringify(["1530", "110", "160", "50"]), "Use these fills Settings' four boxes: " + JSON.stringify(boxes));
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await vis(page.getByText("Saved."));
  const saved = await settingsOf(page);
  expect(saved.dailyCalories === 1530 && saved.dailyProtein === 110 && saved.dailyCarbs === 160 && saved.dailyFat === 50, "saved: " + JSON.stringify(saved));
  // an under-18 and a bad answer
  await page.getByRole("button", { name: "Suggest targets", exact: true }).first().click().catch(() => {});
  if (!(await form.isVisible().catch(() => false))) await page.getByRole("button", { name: "Suggest targets", exact: true }).first().click();
  await age(page).fill("16");
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  await vis(form.getByText("Ask a doctor or dietitian for targets."));
  await age(page).fill("");
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  await vis(form.getByText("Enter an age from 18 to 100, your weight and your height."));
  // nothing typed was kept or sent: the only thing that changed in storage is the settings' four targets, and no typed value is anywhere
  const e = await everything(page);
  const changed = e.local.filter((l) => !before.local.includes(l)).map((l) => l.split("=")[0]);
  expect(JSON.stringify(changed) === JSON.stringify(["mm.v1.settings"]), "only the settings changed in storage: " + JSON.stringify(changed));
  const keysNow = Object.keys(JSON.parse(e.local.find((l) => l.startsWith("mm.v1.settings=")).slice("mm.v1.settings=".length)).data);
  for (const k of ["age", "sex", "height", "weight", "activity", "weightKg", "heightCm", "body", "answers"]) expect(!keysNow.includes(k), `settings has a "${k}" key`);
  for (const k of ["dailyCalories", "dailyProtein", "dailyCarbs", "dailyFat"]) expect(keysNow.includes(k), `settings has ${k}`);
  for (const what of ["69.9", "177.8", "69,9"]) expect(seen([...e.local, ...e.session, ...e.idb, ...e.cookies, e.url, e.historyState], what).length === 0, "a typed value in storage: " + what);
  expect(!requests.some((r) => /(69\.9|177\.8)/.test(r.url) || /(69\.9|177\.8)/.test(r.body)), "a typed value in a request");
  expect(!requests.some((r) => /[?&](age|sex|height|weight|activity)=/i.test(r.url)), "a body answer in a query string");
  await vis(page.getByText("Your answers are only used to work out your numbers. They aren't saved or sent anywhere.").first());
  await ctx.close();
});


/** Goal, diet and age 34 typed, on to "Your height and weight". */
async function toSize(page) {
  await toGoal(page);
  await firstTwo(page);
  await head(page, "About you");
  await age(page).fill("34");
  await cont(page);
  await head(page, "Your height and weight");
}

await step("(l) 'doesn't look right' is not said on the first digit of an ordinary weight or height: only once the block is left with the value still wrong", async () => {
  const { page, ctx } = await fresh();
  await toSize(page);
  await page.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await box(page, "Kilograms").pressSequentially("83.7", { delay: 40 });
  for (const part of ["8", "83", "83.7"]) {
    await box(page, "Kilograms").fill(part);
    expect((await alerts(page).count()) === 0, `no message while typing "${part}" kilograms`);
  }
  await page.getByRole("radio", { name: "Centimetres", exact: true }).click();
  for (const part of ["1", "18", "183"]) {
    await box(page, "Centimetres").fill(part);
    expect((await alerts(page).count()) === 0, `no message while typing "${part}" centimetres`);
  }
  // typed one key at a time with the box in use all the while, a plausible number never shows the message
  await box(page, "Centimetres").fill("");
  await box(page, "Centimetres").pressSequentially("183", { delay: 40 });
  expect((await alerts(page).count()) === 0, "no message after typing 183 key by key");
  // left with a wrong value, the message comes; going back in takes it away while typing; leaving with a right value keeps it away
  await box(page, "Kilograms").fill("8");
  await leave(page);
  await vis(alerts(page).filter({ hasText: "That weight doesn't look right. Please check it." }));
  expect((await box(page, "Kilograms").getAttribute("aria-invalid")) === "true" && !!(await box(page, "Kilograms").getAttribute("aria-describedby")), "the box is marked wrong and names the message");
  await box(page, "Kilograms").click();
  expect((await alerts(page).count()) === 0, "back in the box, the message steps aside");
  await box(page, "Kilograms").fill("83");
  await leave(page);
  expect((await alerts(page).count()) === 0, "a right value leaves no message");
  // a dot in the stone or feet box is always wrong, so that one is immediate
  await page.getByRole("radio", { name: "Stone and pounds", exact: true }).click();
  await page.getByRole("radio", { name: "Feet and inches", exact: true }).click();
  await box(page, "Stone").fill("11.5");
  await vis(alerts(page).filter({ hasText: "Use the pounds box for part of a stone." }));
  await ctx.close();
});

await step("(m) the targets screen has no Skip (Next is the only way on); Back from the week finds the numbers as they were saved, and a second Next saves the same numbers, never the defaults", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  expect(JSON.stringify(await targets(page)) === JSON.stringify(A.plan), "the plan arrived");
  expect((await page.getByRole("button", { name: /^Skip/ }).count()) === 0, "a Skip on the targets screen");
  let s = await settingsOf(page);
  expect(s.hasSetTargets !== true && s.dailyCalories === 2000, "something was saved before Next: " + JSON.stringify(s));
  await vis(page.getByText("Worked out on your phone from your answers. They're only a starting point: tap a number to type your own, or use − and +."));
  await page.locator("#target-calories").fill("1600");
  await planWeek(page);
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Your daily targets");
  s = await settingsOf(page);
  expect((await num(page, "calories")) === "1600" && s.dailyCalories === 1600, `the boxes are the saved numbers: boxes ${await num(page, "calories")}, saved ${s.dailyCalories}`);
  await planWeek(page);
  s = await settingsOf(page);
  expect(s.dailyCalories === 1600 && s.dailyProtein === 110, "a second Next saves the same numbers, not the defaults: " + JSON.stringify(s));
  await ctx.close();
});

await step("(n) a goal or a diet tapped and then Skipped is not used: the plan, the notes and the meal-size box follow what is saved", async () => {
  const person = { sex: "Male", years: "40", weight: { st: "12", lb: "0" }, height: { ft: "5", inch: "10" } };
  const run = async (tap) => {
    const { ctx, page } = await fresh();
    await toGoal(page);
    if (tap) {
      await page.getByRole("radio", { name: "I'm on a GLP-1 medication" }).click();
      await go(page, "Skip");
      await head(page, "Anything you avoid?");
      await page.getByRole("button", { name: "Vegan", exact: true }).click();
      await go(page, "Skip");
      await features(page);
    } else {
      await firstTwo(page);
    }
    await about(page, person); await cont(page);
    await size(page, person); await cont(page);
    await head(page, "How active are you?"); await pickActivity(page); await work(page);
    await head(page, "Your daily targets");
    const out = { t: await targets(page), mealBox: await page.locator("#target-mealcap").count(), vegan: await page.getByText("Because of your diet, we set your protein a little higher.").count() };
    await planWeek(page);
    out.saved = await settingsOf(page);
    await ctx.close();
    return out;
  };
  const skipped = await run(true);
  const plain = await run(false);
  expect(JSON.stringify(skipped.t) === JSON.stringify(plain.t), `the same numbers as a person who tapped nothing: ${JSON.stringify(skipped.t)} against ${JSON.stringify(plain.t)}`);
  expect(skipped.mealBox === 0, "no GLP-1 meal-size box for a goal that was skipped");
  expect(skipped.vegan === 0, "no vegan protein note for a diet that was skipped");
  expect(skipped.saved.goal === "maintain" && !skipped.saved.preferences?.veganOnly, "saved: " + JSON.stringify({ goal: skipped.saved.goal, prefs: skipped.saved.preferences }));
  expect(skipped.saved.dailyCalories === plain.saved.dailyCalories && skipped.saved.dailyProtein === plain.saved.dailyProtein, "the numbers saved agree with the goal saved");
});

await step("(o) after the questions were skipped, 'Use these' keeps the suggestion's notes and the worked-out line, and puts the focus on the calories box; the notes stay going forward and back", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: "Lose weight" }).click();
  await cont(page);
  await page.getByRole("button", { name: "Vegan", exact: true }).click();
  await cont(page);
  await features(page);
  await head(page, "About you");
  await skipQuestions(page);
  await head(page, "Your daily targets");
  await vis(page.getByText("These are starting numbers, not worked out for you. Know your number? Tap Calories and type it in."));
  await page.getByRole("button", { name: "Not sure? Suggest targets for me" }).click();
  const form = page.locator("form");
  await form.getByRole("radio", { name: "Female", exact: true }).click();
  await age(page).fill("70");
  await form.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await box(page, "Kilograms").fill("40");
  await form.getByRole("radio", { name: "Centimetres", exact: true }).click();
  await box(page, "Centimetres").fill("150");
  await form.getByRole("radio", { name: "Mostly sitting", exact: true }).click();
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  await vis(form.getByRole("status"));
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  const notes = [
    "Your suggested calories are never below 1,200 a day. If you plan to eat less than that, please talk to a doctor or dietitian first.",
    "At your height and weight, a lower-calorie plan may not suit you. Please talk to a doctor or dietitian before you start.",
    "Because of your diet, we set your protein a little higher. Change it any time.",
  ];
  for (const n of notes) await vis(page.getByText(n));
  await vis(page.getByText("Worked out on your phone from your answers. They're only a starting point: tap a number to type your own, or use − and +."));
  expect((await page.getByText("Know your number?", { exact: false }).count()) === 0, "the line still points at the button it was pointing at");
  await page.waitForFunction(() => document.activeElement?.id === "target-calories", undefined, { timeout: 2000 }).catch(() => {});
  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(focused === "target-calories", "the focus is on the calories box, not at the top of the page: " + focused);
  expect((await page.getByText("That's lower than most adults need.", { exact: false }).count()) === 0, "one caution about the floor, not two");
  // forward and back: the notes are still under the numbers
  await planWeek(page);
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Your daily targets");
  for (const n of notes) await vis(page.getByText(n));
  await ctx.close();
});

await step("(p) a floor plan lowered by hand shows one caution, not three; a plan with no floor note shows the 'lower than most adults need' line", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, { goal: "Lose weight", sex: "Female", years: "47", weight: { kg: "47" }, height: { cm: "165" }, activity: "Mostly sitting" });
  await vis(page.getByText("Your suggested calories are never below 1,200 a day.", { exact: false }));
  await page.locator("#target-calories").fill("1000");
  const doctor = () => page.locator("main p, main li").filter({ hasText: "doctor or dietitian" }).count();
  expect((await page.getByText("That's lower than most adults need.", { exact: false }).count()) === 0, "the floor line already says it");
  expect((await doctor()) === 2, "two lines about a doctor or dietitian (the floor and the measurements), not three: " + (await doctor()));
  await ctx.close();
  const two = await fresh();
  await toGoal(two.page);
  await toTargets(two.page, A);
  await two.page.locator("#target-calories").fill("1000");
  await vis(two.page.getByText("That's lower than most adults need.", { exact: false }));
  await two.ctx.close();
});

await step("(q) a − or + goes to the next round number (1,530 is 1,500 and 1,550; usability test 2026-11-19), and the boxes read 2,000 and digits in other numeral systems", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  expect((await num(page, "calories")) === "1530", "person A's plan is 1,530, not a multiple of the 50 a tap steps by: " + (await num(page, "calories")));
  await page.getByRole("button", { name: "Decrease", exact: true }).first().click();
  expect((await num(page, "calories")) === "1500", "down from 1,530: " + (await num(page, "calories")));
  await page.locator("#target-calories").fill("1530");
  await page.getByRole("button", { name: "Increase", exact: true }).first().click();
  expect((await num(page, "calories")) === "1550", "up from 1,530: " + (await num(page, "calories")));
  for (const typed of ["2,000", "٢٠٠٠"]) {
    await page.locator("#target-calories").fill(typed);
    expect(!(await page.getByRole("button", { name: "Next: plan my week", exact: true }).isDisabled()), `"${typed}" calories is a number`);
    expect((await alerts(page).count()) === 0, `"${typed}" calories is not an error`);
  }
  await ctx.close();
});

await step("(r) a wrong target is said right under the cards, in plain ink, and named on the box", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  await page.locator("#target-carbs").fill("0");
  const message = alerts(page).filter({ hasText: "Carbs and fat should be above 0 and at most 2,000 g." });
  await vis(message);
  expect((await page.locator("#target-carbs").getAttribute("aria-invalid")) === "true", "the carbs box is marked wrong");
  const describedBy = await page.locator("#target-carbs").getAttribute("aria-describedby");
  expect(!!describedBy && (await page.locator("#" + describedBy).innerText()).includes("Carbs and fat should be"), "and names the message: " + describedBy);
  const where = await page.evaluate(() => {
    const cards = document.querySelector("#target-fat").closest(".grid").getBoundingClientRect();
    const msg = document.querySelector("#target-problem-macros");
    const notes = [...document.querySelectorAll("li")].find((li) => li.textContent.includes("Because of your diet"));
    return { gap: msg.getBoundingClientRect().top - cards.bottom, beforeNotes: msg.getBoundingClientRect().top < notes.getBoundingClientRect().top, colour: getComputedStyle(msg).color, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent") };
  });
  expect(where.gap >= 0 && where.gap < 30 && where.beforeNotes, "directly under the cards and above the notes: " + JSON.stringify(where));
  expect(where.colour !== "rgb(4, 108, 79)", "not in the accent green used for ordinary links: " + where.colour);
  expect((await page.locator("#target-calories").getAttribute("aria-invalid")) === null, "the other boxes are not marked");
  await ctx.close();
});

await step("(s) the Done pill: shown when a number box is in use, not for a unit choice; reachable with Tab; and clear of the control and its focus ring", async () => {
  const { ctx, page } = await fresh();
  await toSize(page);
  const done = page.locator("[role='group'][aria-label='Weight'] button", { hasText: "Done" });
  const visibility = () => done.evaluate((el) => getComputedStyle(el).visibility);
  await page.getByRole("radio", { name: "Stone and pounds", exact: true }).focus();
  expect((await visibility()) === "hidden", "no Done while a unit choice has the focus (there is no keyboard to put away)");
  await box(page, "Stone").focus();
  expect((await visibility()) === "visible", "Done while a number box is in use");
  const gap = await page.evaluate(() => {
    const group = document.querySelector("[role='group'][aria-label='Weight']");
    const d = [...group.querySelectorAll("button")].find((b) => b.textContent.trim() === "Done").getBoundingClientRect();
    const track = group.querySelector("[role='radiogroup']").getBoundingClientRect();
    return Math.round(track.top - d.bottom);
  });
  expect(gap >= 8, "the pill's tap area (8 px) ends where the unit control begins: gap " + gap);
  await box(page, "Pounds").focus();
  await page.keyboard.press("Tab");
  expect((await done.evaluate((el) => document.activeElement === el)) && (await visibility()) === "visible", "Tab from the last box reaches Done, which stays shown while it has the focus");
  await page.keyboard.press("Enter");
  expect((await page.evaluate(() => document.activeElement?.tagName)) === "BODY", "Enter on Done puts the keyboard away");
  await ctx.close();
});

await step("(t) a finger's quick second tap does not carry on past the next screen (activity, targets); a mouse click and a considered tap work as always", async () => {
  const { ctx, page } = await fresh({ hasTouch: true });
  await toSize(page);
  await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
  await leave(page);
  await page.waitForTimeout(800);
  // the screen's bottom button, wherever it is (Continue, Work out my numbers, Next: plan my week: every screen's sits in the same place)
  const tapContinue = async () => {
    const b = await page.locator("main .sticky button.min-h-14").last().boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  await tapContinue(); // Your height and weight -> How active are you?
  await tapContinue(); // a second tap straight after: lands on the next screen's button
  await page.waitForTimeout(900);
  await head(page, "How active are you?");
  expect((await page.getByRole("heading", { name: "Your daily targets" }).count()) === 0, "How active are you? was not skipped");
  // (Continue there is grey until a tile is tapped, the onboarding meeting of 19 November)
  const tile = await page.getByRole("radio", { name: "Lightly active", exact: true }).boundingBox();
  await page.touchscreen.tap(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.waitForTimeout(300);
  await tapContinue(); // a considered tap, after the screen settled
  await head(page, "Your daily targets");
  await tapContinue(); // a quick second tap
  await page.waitForTimeout(900);
  await head(page, "Your daily targets");
  expect((await settingsOf(page)).hasSetTargets !== true, "the targets screen was not passed unseen: nothing saved");
  await tapContinue(); // considered
  await head(page, "Your week, planned");
  const s = await settingsOf(page);
  expect(s.hasSetTargets === true, "a considered tap saved the targets");
  await ctx.close();
  // a mouse click is never held back
  const mouse = await fresh();
  await toSize(mouse.page);
  await box(mouse.page, "Stone").fill("11"); await box(mouse.page, "Feet").fill("5");
  await cont(mouse.page);
  await head(mouse.page, "How active are you?");
  await pickActivity(mouse.page);
  await work(mouse.page);
  await head(mouse.page, "Your daily targets");
  await mouse.ctx.close();
});

await step("(v) Settings: 'Use these' puts the focus on the Calories box", async () => {
  const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, glp1MealCap: 450, hasCompletedOnboarding: true } });
  const { ctx, page } = await fresh({}, `localStorage.setItem("mm.v1.settings", ${JSON.stringify(settings)})`);
  await page.goto(BASE + "/app/settings");
  await head(page, "Settings");
  await page.getByRole("button", { name: "Suggest targets", exact: true }).click();
  const form = page.locator("form");
  await form.getByRole("radio", { name: "Female", exact: true }).click();
  await age(page).fill("34");
  await box(page, "Stone").fill("11"); await box(page, "Pounds").fill("0"); await box(page, "Feet").fill("5"); await box(page, "Inches").fill("10");
  await form.getByRole("button", { name: "Work out my numbers", exact: true }).click();
  await vis(form.getByRole("status"));
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  await page.waitForTimeout(300);
  const where = await page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, inTargets: !!a?.closest("section#targets"), first: a === document.querySelector("section#targets input"), top: a?.getBoundingClientRect().top }; });
  expect(where.first, "the Calories box has the focus: " + JSON.stringify(where));
  expect(where.top > 0 && where.top < 844, "and it is in view: " + where.top);
  await ctx.close();
});

// ---- the onboarding meeting of 19 November: what the welcome screens now promise, checked on the screen

/** Is the middle of this element (or of the box given) the element itself, or something inside it (not the bottom bar or anything else drawn over it)? */
const onTop = (locator, at = "centre") => locator.evaluate((el, where) => {
  const r = el.getBoundingClientRect();
  const y = where === "bottom" ? r.bottom - 2 : r.top + r.height / 2;
  const hit = document.elementFromPoint(r.left + r.width / 2, y);
  return !!hit && (el === hit || el.contains(hit));
}, at);
/** The top of the sticky bar that holds the screen's bottom button. */
const barTop = (page) => page.evaluate(() => [...document.querySelectorAll("main .sticky")].pop()?.getBoundingClientRect().top ?? Infinity);
const settleAll = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
const STARTING = "These are starting numbers, not worked out for you.";
const SET_YOURS = "Set your targets to see what's left today";

/** On Home after the welcome steps: the one-time Start here card closed with "Done with this" (while it shows, the "Set your targets" card waits). */
async function pastStartHere(page) {
  await page.getByRole("heading", { level: 1, name: /^Home/ }).waitFor();
  await page.waitForTimeout(800);
  const done = page.getByRole("region", { name: "Start here" }).getByRole("button", { name: "Done with this" });
  if (await done.count()) { await done.click(); await page.waitForTimeout(300); }
}

await step("(w) skipped questions and untouched targets stay starting numbers (Home says so); answered questions, a typed Calories number or targets set before are the person's own", async () => {
  // 1. "Skip these questions" lands on the targets with empty boxes; Next on them as they are
  let r = await fresh();
  await toGoal(r.page);
  await firstTwo(r.page);
  await skipQuestions(r.page);
  await head(r.page, "Your daily targets");
  const t = await targets(r.page);
  expect(t.calories === "2000" && t.protein === "" && t.carbs === "" && t.fat === "", "'Skip these questions' leaves the boxes empty: " + JSON.stringify(t));
  await vis(r.page.getByText(STARTING, { exact: false }));
  await planWeek(r.page);
  expect((await settingsOf(r.page)).hasSetTargets !== true, "untouched starting numbers were saved as set");
  await W.weekNext(r.page);
  await W.notNow(r.page);
  await pastStartHere(r.page);
  await vis(r.page.getByText(SET_YOURS));
  await r.ctx.close();
  // 2. the questions answered: worked out, so Home asks for nothing
  r = await fresh();
  await toGoal(r.page);
  await toTargets(r.page, A);
  await planWeek(r.page);
  expect((await settingsOf(r.page)).hasSetTargets === true, "answered: the targets are not set");
  await W.weekNext(r.page);
  await W.notNow(r.page);
  await pastStartHere(r.page);
  expect((await r.page.getByText(SET_YOURS).count()) === 0, "answered: Home asks for targets");
  await r.ctx.close();
  // 3. skipped, then a new Calories number typed: the person's own
  r = await fresh();
  await toGoal(r.page);
  await firstTwo(r.page);
  await skipQuestions(r.page);
  await head(r.page, "Your daily targets");
  await r.page.locator("#target-calories").fill("1,800");
  await planWeek(r.page);
  const typed = await settingsOf(r.page);
  expect(typed.hasSetTargets === true && typed.dailyCalories === 1800, "a typed number is set: " + JSON.stringify({ set: typed.hasSetTargets, kcal: typed.dailyCalories }));
  await r.ctx.close();
  // 4. targets set before, Settings › Set up your plan again, everything skipped and Next on the targets: they stay set (never written as false)
  const before = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 1900, dailyProtein: 120, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } });
  r = await fresh({}, `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", ${JSON.stringify(before)}); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); }`);
  await toGoal(r.page);
  // a re-run: the saved goal shows ticked
  expect((await r.page.getByRole("radio", { name: "Maintain" }).getAttribute("aria-checked")) === "true", "the saved goal isn't ticked on a re-run");
  await go(r.page, "Skip");
  await head(r.page, "Anything you avoid?");
  await go(r.page, "Skip");
  await W.eatOut(r.page);
  await go(r.page, "Skip");
  await W.recipes(r.page);
  await skipQuestions(r.page);
  await head(r.page, "Your daily targets");
  expect((await num(r.page, "calories")) === "1900", "the saved calories: " + (await num(r.page, "calories")));
  await planWeek(r.page);
  const kept = await settingsOf(r.page);
  expect(kept.hasSetTargets === true && kept.dailyCalories === 1900, "the targets set before stay set: " + JSON.stringify({ set: kept.hasSetTargets, kcal: kept.dailyCalories }));
  await r.ctx.close();
});

await step("(x) the questions about the person at 390x844 and 375x667: the reason a Continue is grey is its own line, uncovered, clear of the privacy note and linked to Continue; nothing is ticked for the person on a re-run either; Age stays clear of the bar with the keyboard up", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const where = `${viewport.width}x${viewport.height}`;
    const r = await fresh({ viewport });
    await toSize(r.page);
    await settleAll(r.page);
    const why = r.page.locator("#welcome-why-grey");
    expect((await why.innerText()) === "Fill in your height and weight above to go on, or skip these questions below.", `${where}: the reason line: ` + (await why.innerText()));
    expect((await r.page.getByRole("button", { name: "Continue", exact: true }).getAttribute("aria-describedby")) === "welcome-why-grey", `${where}: Continue isn't linked to its reason`);
    expect(await onTop(why), `${where}: something is drawn over the reason line`);
    const a = await why.boundingBox();
    const b = await r.page.getByText("Your answers are only used to work out your numbers.", { exact: false }).first().boundingBox();
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(!overlap, `${where}: the reason line and the privacy note overlap: ${JSON.stringify({ a, b })}`);
    // the privacy note sits under the headline's line (no Pip on the body questions), before the boxes
    const firstBox = await box(r.page, "Feet").boundingBox();
    expect(b.y < firstBox.y, `${where}: the privacy note is not above the boxes`);
    await r.ctx.close();
  }
  // a re-run (set up already): still no activity ticked
  const seeded = JSON.stringify({ v: 1, data: { goal: "lose", dailyCalories: 1800, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } });
  const r = await fresh({}, `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", ${JSON.stringify(seeded)}); }`);
  await toGoal(r.page);
  await cont(r.page);
  await nothingToAvoid(r.page);
  await features(r.page);
  await about(r.page, A);
  await cont(r.page);
  await size(r.page, A);
  await cont(r.page);
  await head(r.page, "How active are you?");
  expect((await r.page.locator("[role='radio'][aria-checked='true']").count()) === 0, "an activity is ticked on a re-run");
  expect(await r.page.getByRole("button", { name: "Work out my numbers", exact: true }).isDisabled(), "Work out my numbers works on a re-run before an activity is picked");
  await r.ctx.close();
  // Age with the keyboard up at 375x667: the keyboard's 260 px taken off the screen and the box brought into view, as the phone does (an approximation: a desktop
  // browser has no on-screen keyboard)
  const k = await fresh({ viewport: { width: 375, height: 667 } });
  await toGoal(k.page);
  await firstTwo(k.page);
  await head(k.page, "About you");
  await age(k.page).focus();
  await k.page.setViewportSize({ width: 375, height: 667 - 260 });
  await age(k.page).evaluate((el) => el.scrollIntoView({ block: "nearest" }));
  await k.page.waitForTimeout(200);
  const ageBox = await age(k.page).boundingBox();
  const bar = await barTop(k.page);
  expect(ageBox.y >= 0 && ageBox.y + ageBox.height <= bar + 0.5, `Age is under the bar with the keyboard up: box ${Math.round(ageBox.y)}-${Math.round(ageBox.y + ageBox.height)}, bar from ${Math.round(bar)}`);
  await k.ctx.close();
});

await step("(y) 'Your daily targets' at 390x844: each number once (in its box), where the numbers come from above the first card, the true kept line, and the carbs and fat − and + clear of the bottom bar (answered and skipped)", async () => {
  for (const path of ["answered", "skipped"]) {
    const r = await fresh();
    await toGoal(r.page);
    if (path === "answered") await toTargets(r.page, A);
    else { await firstTwo(r.page); await skipQuestions(r.page); await head(r.page, "Your daily targets"); }
    await settleAll(r.page);
    await r.page.evaluate(() => window.scrollTo(0, 0));
    const sources = r.page.getByRole("button", { name: "Where these numbers come from" }).first();
    const sourcesBox = await sources.boundingBox();
    const firstCard = await r.page.locator("#target-calories").evaluate((el) => el.closest(".grid > *").getBoundingClientRect().top);
    expect(sourcesBox.y + sourcesBox.height <= firstCard + 0.5, `${path}: 'Where these numbers come from' is not above the first card`);
    expect(sourcesBox.height >= 43.5, `${path}: 'Where these numbers come from' is ${sourcesBox.height} px tall`);
    // the calories show once: in the box (no summary or plate picture repeating them)
    const calories = Number(await num(r.page, "calories")).toLocaleString("en-GB");
    expect((await r.page.getByText(calories, { exact: false }).count()) === 0, `${path}: ${calories} shows outside its box`);
    await vis(r.page.getByText("Your sex, age, height, weight and activity aren't kept.", { exact: false }));
    const buttons = r.page.locator("#target-carbs, #target-fat").locator("xpath=ancestor::div[contains(@class,'group/step')]").getByRole("button", { name: /^(Decrease|Increase)$/ });
    expect((await buttons.count()) === 4, `${path}: carbs and fat have ${await buttons.count()} − and + buttons`);
    for (let i = 0; i < 4; i++) {
      const b = buttons.nth(i);
      expect((await onTop(b)) && (await onTop(b, "bottom")), `${path}: a carbs or fat − or + is under the bottom bar (${JSON.stringify(await b.boundingBox())}, bar from ${await barTop(r.page)})`);
    }
    await r.ctx.close();
  }
});

await step("(z) foods to avoid and shops: the hard names have a second line (the tile's name is its whole visible text: label in name), the allergy caution sits under 'Allergies to avoid', two allergens change Pip's words once; each shop's line only once the shop list has loaded", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: "Maintain" }).click();
  await cont(page);
  await head(page, "Anything you avoid?");
  for (const [name, hint] of [["Lupin", "a flour in some breads and pastries"], ["Celery", "and celeriac"], ["Pescatarian", "fish, no meat"]]) {
    // WCAG 2.5.3: the button's name is what it shows, the name and then its second line
    const tile = page.getByRole("button", { name: new RegExp(`^${name}\\b`) });
    const said = (await tile.evaluate((el) => el.textContent ?? "")).replace(/\s+/g, " ").trim();
    expect(said.startsWith(name) && said.endsWith(hint), `${name}'s second line: ${JSON.stringify(said)}`);
  }
  const caution = page.getByText("Allergy filters use each restaurant's own allergen guide", { exact: false }).first();
  await vis(caution);
  const [label, cautionTop, firstTile] = [await page.getByText("Allergies to avoid", { exact: true }).first().boundingBox(), (await caution.boundingBox()).y, await page.getByRole("button", { name: "Gluten", exact: true }).boundingBox()];
  expect(cautionTop > label.y && cautionTop < firstTile.y, `the allergy caution is not between 'Allergies to avoid' and the tiles: label ${label.y}, caution ${cautionTop}, first tile ${firstTile.y}`);
  // Pip's words change once for two allergens (a screen reader hears him once, not on every tap)
  // (what is shown and read: the bubble also holds every line it can say, invisible and aria-hidden, to keep its room: BubbleWords, the 20 November 2026 audit)
  await page.evaluate(() => {
    const live = document.querySelector("main div[aria-live='polite']");
    const shown = () => { const c = live.cloneNode(true); c.querySelectorAll("[aria-hidden]").forEach((n) => n.remove()); return c.textContent; };
    window.__said = [shown()];
    new MutationObserver(() => { if (window.__said.at(-1) !== shown()) window.__said.push(shown()); }).observe(live, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole("button", { name: "Peanuts", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Milk", exact: true }).click();
  await page.waitForTimeout(400);
  const said = await page.evaluate(() => window.__said);
  expect(said.length === 2 && said[1].includes("Where a restaurant publishes allergens, dishes that list them are hidden; where it publishes none we say so on its page. Always check with the restaurant."), "Pip's words for two allergens: " + JSON.stringify(said));
  await vis(page.getByRole("button", { name: "Continue", exact: true }));
  await go(page, "Skip");
  await W.eatOut(page);
  // the shop list loaded: each shop's line, worked out from the data, is on its tile and part of the tile's name (step 4; label in name since the 20 November
  // 2026 audit)
  await page.waitForFunction(() => document.body.innerText.includes("Not in recipes yet"), undefined, { timeout: 15000 });
  const line = (name) => W.shopTile(page.getByRole("group", { name: "Your supermarkets" }), name).evaluate((b) => [...b.querySelectorAll("span.block")].at(-1)?.textContent?.trim() ?? "");
  expect((await line("Tesco")) === "Products and prices. Not in recipes yet", "Tesco's line: " + (await line("Tesco")));
  expect((await line("Sainsbury's")) === "Recipes, products and prices", "Sainsbury's line: " + (await line("Sainsbury's")));
  await vis(page.getByText("Not sure yet? That's fine. Until you choose, recipes use Sainsbury's."));
  await ctx.close();
  // the shop list blocked (offline): no shop is said to be in or out of recipes
  const off = await fresh();
  await off.page.route("**/groceries/all/all-manifest.json", (route) => route.abort("internetdisconnected"));
  await toGoal(off.page);
  await go(off.page, "Skip"); await head(off.page, "Anything you avoid?");
  await go(off.page, "Skip");
  await W.eatOut(off.page);
  await off.page.waitForTimeout(1500);
  expect((await off.page.getByText("Not in recipes yet", { exact: false }).count()) === 0, "'Not in recipes yet' without the shop list");
  expect((await off.page.getByText("Recipes, products and prices").count()) === 0, "'Recipes, products and prices' without the shop list");
  await vis(off.page.getByText("Not sure yet? That's fine: until you choose, recipes use the supermarket we have the most labels for."));
  await off.ctx.close();
});

await step("(aa) 'Your week, planned' at 390x844 (answered and skipped) with the free and Premium line: Monday's meals start above the sticky Next, and Next goes to the account step", async () => {
  for (const path of ["answered", "skipped"]) {
    const r = await fresh();
    await toGoal(r.page);
    if (path === "answered") await toTargets(r.page, A);
    else { await firstTwo(r.page); await skipQuestions(r.page); await head(r.page, "Your daily targets"); }
    await planWeek(r.page);
    // the free and Premium line (a gated build, someone without Premium): the tallest the screen gets
    if (GATED) await vis(r.page.getByText("Premium adds extras, such as", { exact: false }));
    const first = r.page.getByRole("region", { name: "A look at Meal plan, on Home" }).locator("ul > li").first();
    await first.waitFor({ timeout: 45000 });
    await settleAll(r.page);
    await r.page.evaluate(() => window.scrollTo(0, 0));
    const t = await first.boundingBox();
    const bar = await barTop(r.page);
    expect(t.y + t.height <= bar + 0.5, `${path}: Monday's first meal (${Math.round(t.y)}-${Math.round(t.y + t.height)}) is not above the sticky Next (from ${Math.round(bar)})`);
    await W.weekNext(r.page);
    await head(r.page, "Save your goal and numbers: make your free account");
    await r.ctx.close();
  }
});

// ---- looks: no horizontal overflow, 44 px targets and axe on every new screen at 360 px and Extra large text
const SCREENS = ["About you", "Your height and weight", "How active are you?", "Your daily targets", "Your daily targets (skipped, suggestions open)"];
async function reach(page, which, opts) {
  await toGoal(page, "/app/welcome");
  if (opts.xl) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.getByRole("radio").first().click(); // Lose weight
  await cont(page);
  await nothingToAvoid(page);
  await features(page);
  await head(page, "About you");
  if (which === "About you") return;
  await age(page).fill("34");
  await cont(page);
  await head(page, "Your height and weight");
  if (which === "Your height and weight") { await box(page, "Stone").fill("11.5"); await vis(alerts(page).first()); return; }
  await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
  await cont(page);
  await head(page, "How active are you?");
  await pickActivity(page);
  if (which === "How active are you?") return;
  await work(page);
  await head(page, "Your daily targets");
}
async function looks(page, which, label) {
  await page.waitForTimeout(1900); // Pip's hop and the speech bubble
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(m.sw <= m.cw + 1, `${label}: ${which} scrolls sideways (${m.sw} > ${m.cw})`);
  // every control is at least 44 px each way (a Done pill is 32 px with a tap area stretched round it by ::before, as everywhere)
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role='radio'], [role='switch']")) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none") continue;
      const stretched = typeof el.className === "string" && el.className.includes("before:-inset-y-2") ? 16 : 0;
      if (r.height + stretched < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small.length === 0, `${label}: ${which}: tap targets under 44 px: ${small.slice(0, 4).join(", ")}`);
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
  expect(result.violations.length === 0, `${label}: ${which}: axe: ${result.violations.map((v) => v.id + " " + v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join("|")).join("; ")}`);
}
for (const [label, ctxOptions, opts] of [
  ["360 px", { viewport: { width: 360, height: 740 } }, {}],
  ["Extra large text", { viewport: { width: 360, height: 740 } }, { xl: true }],
]) {
  await step(`(j, k) ${label}: no sideways scrolling, 44 px tap targets and no axe violations on every new screen`, async () => {
    for (const which of SCREENS.slice(0, 4)) {
      const r = await fresh(ctxOptions);
      await reach(r.page, which, opts);
      await looks(r.page, which, label);
      await r.ctx.close();
    }
    // a person who skipped the questions: the suggestions form open
    {
      const r = await fresh(ctxOptions);
      await toGoal(r.page);
      if (opts.xl) await r.page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await firstTwo(r.page); await skipQuestions(r.page);
      await head(r.page, "Your daily targets");
      await r.page.getByRole("button", { name: "Not sure? Suggest targets for me" }).click();
      await r.page.locator("form").getByRole("button", { name: "Work out my numbers", exact: true }).click();
      await vis(alerts(r.page).first());
      await looks(r.page, SCREENS[4], label);
      await r.ctx.close();
    }
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
