import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Onboarding's three questions about the person (About you, Your size, How active are you?) and "Your daily targets" arriving filled in from them
// (founder 2026-10-16), and Settings' single-screen version of the same questions. Two people are typed in:
//   A: a vegan woman, 34, 11 st 0 lb, 5 ft 10 in, lightly active, wants to lose weight  -> 1,530 kcal, 110 g protein, 160 g carbs, 50 g fat
//   B: a man, 47, 83.7 kg, 183.4 cm, active, on a GLP-1 medicine                      -> 2,220 kcal, 115 g protein, 270 g carbs, 75 g fat
// (the numbers are checked against planTargets in tests/onboardingPlan.test.ts, so they can't drift from the code). Nothing typed about the body may be
// stored or sent: after finishing, storage, cookies, the address and every request are searched for it.

const BASE = process.env.BASE ?? "http://localhost:3101";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const ar = JSON.parse(readFileSync(new URL("../lib/mm/locales/ar.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let pass = 0, fail = 0;
async function step(n, fn) { if (process.env.ONLY && !n.startsWith(process.env.ONLY)) return; try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0]); } }
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
/** The welcome screens and Pip's walk, to "What's your goal?". */
async function toGoal(page, path = "/app/welcome") {
  await page.goto(BASE + path);
  await head(page, "Choose your language");
  await cont(page);
  await go(page, "Get started");
  await go(page, "Show me around");
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(150); await cont(page); }
  await go(page, "Let's go!");
  await head(page, "What's your goal?");
}
const status = (page, n) => vis(page.getByText(`Step ${n} of 10`));
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
  await head(page, "Your size");
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

/** One person through goal, diet, the three questions and on to the targets screen. */
async function toTargets(page, p) {
  await page.getByRole("radio", { name: p.goal }).click();
  await cont(page);
  await head(page, "Anything you avoid?");
  if (p.diet) await page.getByRole("button", { name: p.diet, exact: true }).click();
  await cont(page);
  await about(page, p);
  await cont(page);
  await size(page, p);
  await cont(page);
  await head(page, "How active are you?");
  await page.getByRole("radio", { name: p.activity, exact: true }).click();
  await cont(page);
  await head(page, "Your daily targets");
}

await step("(a) the screens come in the new order with the right headings and 'Step n of 10'", async () => {
  const { ctx, page, errors } = await fresh();
  await toGoal(page);
  await status(page, 1);
  await cont(page);
  await head(page, "Anything you avoid?"); await status(page, 2);
  await cont(page);
  await head(page, "About you"); await status(page, 3);
  await age(page).fill("34");
  await cont(page);
  await head(page, "Your size"); await status(page, 4);
  await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
  await cont(page);
  await head(page, "How active are you?"); await status(page, 5);
  expect((await page.getByRole("radio").count()) === 4, "four activity tiles");
  for (const a of ["Mostly sitting", "Lightly active", "Active", "Very active"]) await vis(page.getByRole("radio", { name: a, exact: true }));
  expect(await page.getByRole("radio", { name: "Lightly active", exact: true }).getAttribute("aria-checked") === "true", "Lightly active starts chosen");
  await cont(page);
  await head(page, "Your daily targets"); await status(page, 6);
  for (const label of ["Calories", "Protein (g)", "Carbs (g)", "Fat (g)"]) await vis(page.getByLabel(label, { exact: true }));
  await cont(page);
  await head(page, "Where do you shop?"); await status(page, 7);
  await cont(page);
  await head(page, "Easy to read"); await status(page, 8);
  await cont(page);
  await head(page, "You're all set!"); await status(page, 9);
  await cont(page);
  await head(page, "Choose a recipe to start with"); await status(page, 10);
  const segments = await page.evaluate(() => [...document.querySelectorAll("div[aria-hidden='true']")].find((d) => d.className.includes("gap-1.5") && d.children.length > 5)?.children.length);
  expect(segments === 10, "ten progress segments, got " + segments);
  expect(errors.length === 0, errors[0]);
  await ctx.close();
});

await step("(b) person A (a vegan woman in stone and feet): the targets arrive filled in, all four can be changed, and Continue saves them for Home", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  const t = await targets(page);
  expect(JSON.stringify(t) === JSON.stringify(A.plan), "plan for A: " + JSON.stringify(t));
  await vis(page.getByText("I worked these out from your answers. They're only a starting point, so change any of them."));
  await vis(page.getByText("Because of your diet, we set your protein a little higher. Change it any time."));
  expect((await page.getByText("Not sure? Suggest targets for me").count()) === 0, "no second way to get suggestions when the questions were answered");
  expect((await page.getByLabel("Comfortable meal size in calories").count()) === 0, "no meal size box off GLP-1");
  // every number can be changed: type calories, step carbs up, type protein, clear fat
  await page.locator("#target-calories").fill("1600");
  await page.locator("#target-protein").fill("115");
  await page.getByRole("button", { name: "Increase", exact: true }).nth(2).click();
  expect((await num(page, "carbs")) === "165", "carbs stepped up by 5: " + (await num(page, "carbs")));
  await page.locator("#target-fat").fill("");
  await cont(page);
  await head(page, "Where do you shop?");
  const s = await settingsOf(page);
  expect(s.dailyCalories === 1600 && s.dailyProtein === 115 && s.dailyCarbs === 165 && s.hasSetTargets === true, "saved: " + JSON.stringify(s));
  expect(!("dailyFat" in s) || s.dailyFat === undefined, "an emptied fat box stays unset: " + s.dailyFat);
  // on to the end, and Home shows the same numbers (typed ones first, the empty fat worked out from the calories: 30% of 1,600 at 9 kcal/g = 53 -> 55)
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await head(page, "You're all set!");
  const plan = await page.locator("section").innerText();
  expect(/1,600/.test(plan) && /115g/.test(plan) && /165g/.test(plan) && /55g/.test(plan), "the plan card shows the four targets as Home will: " + plan.replace(/\s+/g, " "));
  await cont(page);
  await go(page, "Take me to Home");
  await page.waitForURL(/\/app\/?$/);
  const home = await page.locator("main").innerText();
  expect(/\/\s*1,600/.test(home) && /\/\s*115g/.test(home) && /\/\s*165g/.test(home) && /\/\s*55g/.test(home), "Home agrees: " + home.replace(/\s+/g, " ").slice(0, 300));
  await ctx.close();
});

await step("(b) person B (a man in kg and cm on a GLP-1 medicine): the plan fills in, the comfortable meal size stays 450, and the medicine line shows once", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: B.goal }).click();
  await cont(page);
  await head(page, "Anything you avoid?");
  await cont(page);
  await about(page, B);
  await cont(page);
  await size(page, B);
  await cont(page);
  await head(page, "How active are you?");
  await page.getByRole("radio", { name: B.activity, exact: true }).click();
  await cont(page);
  await head(page, "Your daily targets");
  expect(JSON.stringify(await targets(page)) === JSON.stringify(B.plan), "plan for B: " + JSON.stringify(await targets(page)));
  expect((await page.getByLabel("Comfortable meal size in calories").inputValue()) === "450", "the meal size is not worked out from the plan");
  expect((await page.getByText("If you take a GLP-1 medicine, follow the advice of your doctor or pharmacist.").count()) === 1, "the medicine line shows once");
  await cont(page);
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
  await cont(page);
  await head(page, "Your daily targets");
  expect(JSON.stringify(await targets(page)) === JSON.stringify(A.plan), "the same plan in kg and cm: " + JSON.stringify(await targets(page)));
  // a person B typed in stone and feet gets the plan worked out from their own kilograms, not from the rounded copy
  await ctx.close();
  const two = await fresh();
  await toGoal(two.page);
  await two.page.getByRole("radio", { name: B.goal }).click();
  await cont(two.page); await cont(two.page);
  await about(two.page, B);
  await cont(two.page);
  await size(two.page, B);
  await two.page.getByRole("radio", { name: "Stone and pounds", exact: true }).click();
  await two.page.getByRole("radio", { name: "Feet and inches", exact: true }).click();
  expect((await box(two.page, "Stone").inputValue()) === "13" && (await box(two.page, "Pounds").inputValue()) === "2.5", "83.7 kg is 13 st 2.5 lb: " + (await box(two.page, "Pounds").inputValue()));
  expect((await box(two.page, "Feet").inputValue()) === "6" && (await box(two.page, "Inches").inputValue()) === "0.2", "183.4 cm is 6 ft 0.2 in: " + (await box(two.page, "Inches").inputValue()));
  await cont(two.page); await head(two.page, "How active are you?");
  await two.page.getByRole("radio", { name: B.activity, exact: true }).click();
  await cont(two.page);
  await head(two.page, "Your daily targets");
  expect(JSON.stringify(await targets(two.page)) === JSON.stringify(B.plan), "B in stone and feet gets the same plan: " + JSON.stringify(await targets(two.page)));
  await two.ctx.close();
});

await step("(d) Skip on a body screen skips all three: the targets screen has nothing filled in, 'Not sure? Suggest targets for me' is there, and Back returns to About you (all three are empty, so they are answered in order)", async () => {
  for (const from of ["About you", "Your size", "How active are you?"]) {
    const { ctx, page } = await fresh();
    await toGoal(page);
    await cont(page);
    await cont(page);
    await head(page, "About you");
    if (from !== "About you") {
      await age(page).fill("34");
      await cont(page);
      await head(page, "Your size");
      if (from === "How active are you?") {
        await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
        await cont(page);
        await head(page, "How active are you?");
      }
    }
    await go(page, "Skip");
    await head(page, "Your daily targets");
    await status(page, 6);
    const t = await targets(page);
    expect(t.calories === "2000" && t.protein === "" && t.carbs === "" && t.fat === "", `${from}: nothing is filled in, calories stay at the default: ` + JSON.stringify(t));
    expect((await page.getByText("I worked these out from your answers.").count()) === 0, "no line about worked-out numbers");
    await vis(page.getByRole("button", { name: "Not sure? Suggest targets for me" }));
    await vis(page.getByText("Left empty, protein, carbs and fat are worked out from your calories", { exact: false }));
    await page.getByRole("button", { name: "Back to the previous step" }).click();
    await head(page, "About you");
    expect((await age(page).inputValue()) === "", `${from}: the age that was typed is gone with the skip`);
    if (from !== "About you") {
      // answering all three again, in order, gives the plan (a Continue on Your size or How active used to carry on with no age)
      await age(page).fill("34");
      await cont(page);
      await head(page, "Your size");
      expect((await box(page, "Stone").inputValue()) === "" && (await box(page, "Feet").inputValue()) === "", `${from}: the size that was typed is gone too`);
      await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
      await cont(page);
      await head(page, "How active are you?");
      await cont(page);
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
  await cont(page); await cont(page); await go(page, "Skip");
  await head(page, "Your daily targets");
  await page.getByRole("button", { name: "Not sure? Suggest targets for me" }).click();
  const form = page.locator("form");
  await form.getByRole("radio", { name: A.sex, exact: true }).click();
  await age(page).fill(A.years);
  await box(page, "Stone").fill("11"); await box(page, "Pounds").fill("0"); await box(page, "Feet").fill("5"); await box(page, "Inches").fill("10");
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
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
  await cont(page); await cont(page);
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
  await head(page, "Your size");
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
  await vis(r.page.getByText("Please check your height and weight, because your plan is worked out from them. If they are right, you can carry on."));
  expect(JSON.stringify(await targets(r.page)) === JSON.stringify({ calories: "3770", protein: "190", carbs: "470", fat: "125" }), "the plan is still shown: " + JSON.stringify(await targets(r.page)));
  expect(!(await r.page.getByRole("button", { name: "Continue", exact: true }).isDisabled()), "it doesn't block");
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
  await vis(r.page.getByText("If you take a GLP-1 medicine, follow the advice of your doctor or pharmacist. Numbite doesn't give medical advice."));
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
  await head(page, "Your size");
  expect((await box(page, "Stone").inputValue()) === "11" && (await box(page, "Pounds").inputValue()) === "0" && (await box(page, "Feet").inputValue()) === "5" && (await box(page, "Inches").inputValue()) === "10", "height and weight kept");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "About you");
  expect((await age(page).inputValue()) === "34" && (await page.getByRole("radio", { name: "Female", exact: true }).getAttribute("aria-checked")) === "true", "sex and age kept");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Anything you avoid?");
  expect(await page.getByRole("button", { name: "Vegan", exact: true }).getAttribute("aria-pressed") === "true", "diet kept");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "What's your goal?");
  expect(await page.getByRole("radio", { name: "Lose weight" }).getAttribute("aria-checked") === "true", "goal kept");
  // forward again: the same answers leave the hand-typed 1,600 alone
  for (const h of ["Anything you avoid?", "About you", "Your size", "How active are you?", "Your daily targets"]) { await cont(page); await head(page, h); }
  expect((await num(page, "calories")) === "1600", "the typed calories survive: " + (await num(page, "calories")));
  // different answers fill the plan in again
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await page.getByRole("radio", { name: "Very active", exact: true }).click();
  await cont(page);
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
  await cont(page); await cont(page);
  await about(page, B);
  await cont(page);
  await size(page, B);
  await cont(page);
  await head(page, "How active are you?");
  await page.getByRole("radio", { name: B.activity, exact: true }).click();
  await cont(page);
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
  await cont(page);
  await head(page, "Where do you shop?");
  await check("after the targets were saved");
  await go(page, "Skip"); await go(page, "Skip");
  await head(page, "You're all set!");
  await cont(page);
  await go(page, "Take me to Home");
  await page.waitForURL(/\/app\/?$/);
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
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
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
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
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
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
  await vis(form.getByText("Ask a doctor or dietitian for targets."));
  await age(page).fill("");
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
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


/** Goal, diet and age 34 typed, on to "Your size". */
async function toSize(page) {
  await toGoal(page);
  await cont(page); await cont(page);
  await head(page, "About you");
  await age(page).fill("34");
  await cont(page);
  await head(page, "Your size");
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

await step("(m) Skip on the targets screen saves nothing and changes nothing: Back finds the numbers as they were left, and a saved number is never replaced by the defaults", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  expect(JSON.stringify(await targets(page)) === JSON.stringify(A.plan), "the plan arrived");
  await go(page, "Skip");
  await head(page, "Where do you shop?");
  let s = await settingsOf(page);
  expect(s.hasSetTargets !== true && s.dailyCalories === 2000, "Skip saved nothing: " + JSON.stringify(s));
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Your daily targets");
  expect(JSON.stringify(await targets(page)) === JSON.stringify(A.plan), "Back finds the plan as it was: " + JSON.stringify(await targets(page)));
  await vis(page.getByText("I worked these out from your answers. They're only a starting point, so change any of them."));
  // press Continue once (saved), go on, Back, Skip, Back: the boxes are what was saved
  await page.locator("#target-calories").fill("1600");
  await cont(page);
  await head(page, "Where do you shop?");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Your daily targets");
  await go(page, "Skip");
  await head(page, "Where do you shop?");
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await head(page, "Your daily targets");
  s = await settingsOf(page);
  expect((await num(page, "calories")) === "1600" && s.dailyCalories === 1600, `the boxes are the saved numbers: boxes ${await num(page, "calories")}, saved ${s.dailyCalories}`);
  await cont(page);
  s = await settingsOf(page);
  expect(s.dailyCalories === 1600 && s.dailyProtein === 110, "a second Continue saves the same numbers, not the defaults: " + JSON.stringify(s));
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
    } else {
      await cont(page); await cont(page);
    }
    await about(page, person); await cont(page);
    await size(page, person); await cont(page);
    await head(page, "How active are you?"); await cont(page);
    await head(page, "Your daily targets");
    const out = { t: await targets(page), mealBox: await page.getByLabel("Comfortable meal size in calories").count(), vegan: await page.getByText("Because of your diet, we set your protein a little higher.").count() };
    await cont(page);
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

await step("(o) after the questions were skipped, 'Use these' keeps the suggestion's notes and Pip's line, and puts the focus on the calories box; the notes stay going forward and back", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await page.getByRole("radio", { name: "Lose weight" }).click();
  await cont(page);
  await page.getByRole("button", { name: "Vegan", exact: true }).click();
  await cont(page);
  await head(page, "About you");
  await go(page, "Skip");
  await head(page, "Your daily targets");
  await vis(page.getByText("Not sure of your numbers? Tap “Suggest targets for me” and I'll help."));
  await page.getByRole("button", { name: "Not sure? Suggest targets for me" }).click();
  const form = page.locator("form");
  await form.getByRole("radio", { name: "Female", exact: true }).click();
  await age(page).fill("70");
  await form.getByRole("radio", { name: "Kilograms", exact: true }).click();
  await box(page, "Kilograms").fill("40");
  await form.getByRole("radio", { name: "Centimetres", exact: true }).click();
  await box(page, "Centimetres").fill("150");
  await form.getByRole("radio", { name: "Mostly sitting", exact: true }).click();
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
  await vis(form.getByRole("status"));
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  const notes = [
    "Your suggested calories are never below 1,200 a day. If you plan to eat less than that, please talk to a doctor or dietitian first.",
    "At your height and weight, a lower-calorie plan may not suit you. Please talk to a doctor or dietitian before you start.",
    "Because of your diet, we set your protein a little higher. Change it any time.",
  ];
  for (const n of notes) await vis(page.getByText(n));
  await vis(page.getByText("I worked these out from your answers. They're only a starting point, so change any of them."));
  expect((await page.getByText("Not sure of your numbers?").count()) === 0, "Pip no longer points at the button he was pointing at");
  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(focused === "target-calories", "the focus is on the calories box, not at the top of the page: " + focused);
  expect((await page.getByText("That's lower than most adults need.", { exact: false }).count()) === 0, "one caution about the floor, not two");
  // forward and back: the notes are still under the numbers
  await cont(page);
  await head(page, "Where do you shop?");
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

await step("(q) a − or + steps from the number as it stands (1,530 is 1,480 and 1,580), and the boxes read 2,000 and digits in other numeral systems", async () => {
  const { ctx, page } = await fresh();
  await toGoal(page);
  await toTargets(page, A);
  expect((await num(page, "calories")) === "1530", "person A's plan is 1,530, not a multiple of the 50 a tap steps by: " + (await num(page, "calories")));
  await page.getByRole("button", { name: "Decrease", exact: true }).first().click();
  expect((await num(page, "calories")) === "1480", "down from 1,530: " + (await num(page, "calories")));
  await page.locator("#target-calories").fill("1530");
  await page.getByRole("button", { name: "Increase", exact: true }).first().click();
  expect((await num(page, "calories")) === "1580", "up from 1,530: " + (await num(page, "calories")));
  for (const typed of ["2,000", "٢٠٠٠"]) {
    await page.locator("#target-calories").fill(typed);
    expect(!(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled()), `"${typed}" calories is a number`);
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
  const tapContinue = async () => {
    const b = await page.getByRole("button", { name: "Continue", exact: true }).boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  await tapContinue(); // Your size -> How active are you?
  await tapContinue(); // a second tap straight after: lands on the next screen's button
  await page.waitForTimeout(900);
  await head(page, "How active are you?");
  expect((await page.getByRole("heading", { name: "Your daily targets" }).count()) === 0, "How active are you? was not skipped");
  await tapContinue(); // a considered tap, after the screen settled
  await head(page, "Your daily targets");
  await tapContinue(); // a quick second tap
  await page.waitForTimeout(900);
  await head(page, "Your daily targets");
  expect((await settingsOf(page)).hasSetTargets !== true, "the targets screen was not passed unseen: nothing saved");
  await tapContinue(); // considered
  await head(page, "Where do you shop?");
  const s = await settingsOf(page);
  expect(s.hasSetTargets === true, "a considered tap saved the targets");
  await ctx.close();
  // a mouse click is never held back
  const mouse = await fresh();
  await toSize(mouse.page);
  await box(mouse.page, "Stone").fill("11"); await box(mouse.page, "Feet").fill("5");
  await cont(mouse.page);
  await head(mouse.page, "How active are you?");
  await cont(mouse.page);
  await head(mouse.page, "Your daily targets");
  await mouse.ctx.close();
});

await step("(u) right to left: the arrow keys move along the tiles the way they are laid out (Left goes to the tile on the left)", async () => {
  const { ctx, page } = await fresh({ locale: "ar" }, `localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { language: "ar" } }))`);
  await arabicReach(page, "About you");
  const radios = page.getByRole("radio");
  const sex = [radios.nth(0), radios.nth(1), radios.nth(2)];
  const at = async (l) => (await l.boundingBox()).x;
  expect((await at(sex[1])) < (await at(sex[0])), "in Arabic the second tile is to the left of the first");
  await sex[0].focus();
  await page.keyboard.press("ArrowLeft");
  expect(await sex[1].evaluate((el) => document.activeElement === el), "ArrowLeft goes to the tile on the left");
  await page.keyboard.press("ArrowRight");
  expect(await sex[0].evaluate((el) => document.activeElement === el), "ArrowRight goes back to the right");
  await ctx.close();
  // and in English nothing changed
  const en = await fresh();
  await toGoal(en.page);
  await cont(en.page); await cont(en.page);
  await head(en.page, "About you");
  const first = en.page.getByRole("radio", { name: "Male", exact: true });
  await first.focus();
  await en.page.keyboard.press("ArrowRight");
  expect(await en.page.getByRole("radio", { name: "Female", exact: true }).evaluate((el) => document.activeElement === el), "left to right: ArrowRight goes right");
  await en.ctx.close();
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
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
  await vis(form.getByRole("status"));
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  await page.waitForTimeout(300);
  const where = await page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, inTargets: !!a?.closest("section#targets"), first: a === document.querySelector("section#targets input"), top: a?.getBoundingClientRect().top }; });
  expect(where.first, "the Calories box has the focus: " + JSON.stringify(where));
  expect(where.top > 0 && where.top < 844, "and it is in view: " + where.top);
  await ctx.close();
});

// ---- looks: no horizontal overflow, 44 px targets and axe on every new screen at 360 px, Extra large text and Arabic
const SCREENS = ["About you", "Your size", "How active are you?", "Your daily targets", "Your daily targets (skipped, suggestions open)"];
async function reach(page, which, opts) {
  await toGoal(page, "/app/welcome");
  if (opts.xl) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.getByRole("radio").first().click(); // Lose weight
  await cont(page);
  await cont(page);
  await head(page, "About you");
  if (which === "About you") return;
  await age(page).fill("34");
  await cont(page);
  await head(page, "Your size");
  if (which === "Your size") { await box(page, "Stone").fill("11.5"); await vis(alerts(page).first()); return; }
  await box(page, "Stone").fill("11"); await box(page, "Feet").fill("5");
  await cont(page);
  await head(page, "How active are you?");
  if (which === "How active are you?") return;
  await cont(page);
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
  ["Arabic (right to left)", { viewport: { width: 360, height: 740 }, locale: "ar" }, { ar: true }],
]) {
  await step(`(j, k) ${label}: no sideways scrolling, 44 px tap targets and no axe violations on every new screen`, async () => {
    for (const which of SCREENS.slice(0, 4)) {
      const r = await fresh(ctxOptions, opts.ar ? `localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { language: "ar" } }))` : undefined);
      if (opts.ar) {
        // the buttons are in Arabic; the new sentences fall back to English until they are translated
        await arabicReach(r.page, which, opts);
      } else await reach(r.page, which, opts);
      await looks(r.page, which, label);
      await r.ctx.close();
    }
    // a person who skipped the questions: the suggestions form open (no Arabic run: it is the same form)
    if (!opts.ar) {
      const r = await fresh(ctxOptions);
      await toGoal(r.page);
      if (opts.xl) await r.page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await cont(r.page); await cont(r.page); await go(r.page, "Skip");
      await head(r.page, "Your daily targets");
      await r.page.getByRole("button", { name: "Not sure? Suggest targets for me" }).click();
      await r.page.locator("form").getByRole("button", { name: "Suggest targets", exact: true }).click();
      await vis(alerts(r.page).first());
      await looks(r.page, SCREENS[4], label);
      await r.ctx.close();
    }
  });
}
/** The Arabic run: the buttons are found by their Arabic words (from the dictionary), the fields by position (their labels are new English sentences until translated). */
async function arabicReach(page, which) {
  const b = (english) => page.getByRole("button", { name: ar[english], exact: true });
  await page.goto(BASE + "/app/welcome");
  await b("Continue").click();
  await b("Get started").click();
  await b("Show me around").click();
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(150); await b("Continue").click(); }
  await b("Let's go!").click();
  await vis(page.getByRole("radio").first());
  await page.getByRole("radio").first().click();
  await b("Continue").click();
  await b("Continue").click();
  await vis(page.locator("input").first());
  if (which === "About you") return;
  await page.locator("input").first().fill("34");
  await b("Continue").click();
  await vis(page.locator("input").nth(3));
  if (which === "Your size") { await page.locator("input").nth(0).fill("11.5"); await vis(alerts(page).first()); return; }
  await page.locator("input").nth(0).fill("11"); await page.locator("input").nth(2).fill("5");
  await b("Continue").click();
  await vis(page.getByRole("radio").nth(3));
  if (which === "How active are you?") return;
  await b("Continue").click();
  await vis(page.locator("#target-calories"));
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
