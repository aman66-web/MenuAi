// Meal plan's goal flow (founder 2026-11-26: "consider the questions you ask like a flowchart to the end"): from the check screen, Change "Your aim" walks
// the questions that aim leads to (page.tsx pipFlow, GoalSteps.tsx), "Your numbers" shows the day's food and protein worked out by lib/mm/bodyGoal.ts, "Use
// these numbers" keeps them, Skip runs on to the check screen, and Make my plan (Pip's AI route stubbed with page.route: never a real AI call) opens the week
// with the time to the goal and each day's exercise. Three people: lose fat (female, the body fat drawings), build muscle (male), train for a sport
// (endurance). Every screen is checked at 390 px and 320 px wide with no sideways scroll, and the request to Pip carries no body details (CLAUDE.md rule 4).
// Run against a server with Premium previewed:
//   NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PRO_PREVIEW=1 NEXT_PUBLIC_SIGN_IN_REQUIRED=0 npx next dev -p 3112
//   BASE=http://localhost:3112 SHOTS=<folder> node e2e/goalPlan.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3112";
const SHOTS = process.env.SHOTS ?? "/tmp/goal-plan";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 3).join(" | ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, devProOverride: true, preferences: {}, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
const WIDE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 640 };

async function context() {
  const ctx = await browser.newContext({ viewport: WIDE, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
    sessionStorage.setItem("seeded", "1");
  }, settings);
  return ctx;
}

/** Today's weekday (0 Sunday), the first day the week shows. */
const TODAY = new Date().getDay();
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Each person: the answers, the figures "Your numbers" must show (worked out by hand from bodyGoal.ts, see the comments) and the week's exercise by weekday.
 *   Lose fat: lean 80 × 0.65 = 52 kg; body (370 + 21.6 × 52) × 1.375 = 2,053; Pip's week with no training: strength 45 min Mon and Thu (2.5 × 80 × 0.75 =
 *     150), brisk walks 45 min Tue, Wed, Fri, Sat (3.3 × 80 × 0.75 = 198, to 200), an easy walk 30 min Sun (80): 1,180 a week, 169 a day; Steady: 0.4 kg a week,
 *     440 kcal a day under: 1,782 → 1,780 kcal; protein 2 × 52 = 104 → 105 g.
 *   Build muscle: lean 80 × 0.8 = 64 kg; body (370 + 21.6 × 64) × 1.375 = 2,410; 3 to 4 days with no days chosen: four strength sessions of 60 min on Mon,
 *     Tue, Thu, Fri (upper, lower, upper, lower; 200 each), brisk walks of 30 min Wed and Sun (130 each), Sat rest: 1,060 a week, 151 a day; Steady: 250
 *     over: 2,811 → 2,810 kcal; protein 2 × 64 = 128 → 130 g.
 *   Train for a sport: Mifflin 10 × 60 + 6.25 × 168 − 5 × 28 − 161 = 1,349 × 1.375 = 1,855; running 1 hour on 5 days (Mon, Tue, Wed, Fri, Sat; 6 × 60 = 360
 *     each): 1,800 a week, 257 a day: 2,112 → 2,110 kcal; protein 1.6 × 60 = 96 → 95 g.
 */
const PEOPLE = [
  {
    key: "lose", aim: /^Lose fat/, set: "Female", age: "30", kg: "80", fat: "About 35%", goal: "70", pregnant: "No", dayToDay: /^On my feet some of the day/,
    training: "None", exercise: /^Yes, plan it for me/, pace: /^Steady/, kcal: "1,780", protein: "105 g", goalLine: /^70 kg in about \d+ to \d+ weeks: between /,
    week: {
      1: ["Strength training, whole body", "45 min · about 150 kcal"], 2: ["Brisk walk", "45 min · about 200 kcal"], 3: ["Brisk walk", "45 min · about 200 kcal"],
      4: ["Strength training, whole body", "45 min · about 150 kcal"], 5: ["Brisk walk", "45 min · about 200 kcal"], 6: ["Brisk walk", "45 min · about 200 kcal"],
      0: ["Easy walk", "30 min · about 80 kcal"],
    },
  },
  {
    key: "muscle", aim: /^Build muscle/, set: "Male", age: "30", kg: "80", fat: "About 20%", goal: "85", dayToDay: /^On my feet some of the day/,
    training: "3 to 4 days", trainingKind: "Weights", lifting: "Under a year", exercise: /^Yes, plan it for me/, pace: /^Steady/, kcal: "2,810", protein: "130 g",
    goalLine: /^85 kg in about \d+ (to \d+ )?weeks/,
    week: {
      1: ["Strength training, upper body", "1 hour · about 200 kcal"], 2: ["Strength training, lower body", "1 hour · about 200 kcal"], 3: ["Brisk walk", "30 min · about 130 kcal"],
      4: ["Strength training, upper body", "1 hour · about 200 kcal"], 5: ["Strength training, lower body", "1 hour · about 200 kcal"], 6: ["Rest day", null],
      0: ["Brisk walk", "30 min · about 130 kcal"],
    },
  },
  {
    key: "sport", aim: /^Train for a sport/, set: "Female", age: "28", kg: "60", cm: "168", dayToDay: /^On my feet some of the day/, sportKind: /^Running, cycling or swimming/,
    training: "5 or more", session: "1 hour", kcal: "2,110", protein: "95 g", goalLine: null,
    week: {
      1: ["Running or cardio", "1 hour · about 360 kcal"], 2: ["Running or cardio", "1 hour · about 360 kcal"], 3: ["Running or cardio", "1 hour · about 360 kcal"],
      4: ["Rest day", null], 5: ["Running or cardio", "1 hour · about 360 kcal"], 6: ["Running or cardio", "1 hour · about 360 kcal"], 0: ["Rest day", null],
    },
  },
];

const errors = [];

for (const p of PEOPLE) {
  const ctx = await context();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${p.key}: ${String(e).slice(0, 200)}`));
  // the AI route, stubbed: Pip keeps the phone's week, and says so
  const sent = [];
  await page.route("**/api/v1/plan/ai", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { ids: body.draft, why: "A week that fits your numbers." } }) });
  });
  const h1 = (name) => page.getByRole("heading", { level: 1, name, exact: true });
  const button = (name) => page.locator(".sticky").getByRole("button", { name, exact: true });
  // after the finite animations (a chosen answer turning lime, the sheet rising), so the measure and the picture show the screen as it settles
  const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  /** No sideways scroll at 390 px and at 320 px; a picture at each. */
  const widths = async (name) => {
    for (const [size, label] of [[NARROW, "320"], [WIDE, "390"]]) {
      await page.setViewportSize(size);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await settle();
      const w = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(w <= 0, `${p.key} ${name} at ${label} px: sideways scroll ${w}px`);
      await page.screenshot({ path: `${SHOTS}/${p.key}-${name}-${label}.png` });
    }
  };
  /** Answers a question: checks its title, makes the choices, checks both widths, then the button (Continue once answered). */
  const answer = async (title, name, choose, next = "Continue") => {
    await h1(title).waitFor({ timeout: 30000 });
    await choose();
    await widths(name);
    await button(next).click();
  };
  const radio = (name, group) => (group ? page.getByRole("radiogroup", { name: group, exact: true }) : page).getByRole("radio", { name, exact: typeof name === "string" });

  await step(`${p.key}: the check screen → Change "Your aim" → the goal's questions → Your numbers (${p.kcal} kcal, ${p.protein})`, async () => {
    await page.goto(BASE + "/app/plan");
    await h1("Ready to make your plan?").waitFor({ timeout: 120000 });
    await page.getByRole("button", { name: "Change: Your aim" }).click();
    await answer("What's your aim?", "01-aim", () => radio(p.aim).click());
    await answer("About you", "02-about-you", async () => {
      await radio(p.set, "Your body").click();
      await page.getByRole("textbox", { name: "Age" }).fill(p.age);
    });
    await answer("Your weight now", "03-weight", async () => {
      await radio("Kilograms", "Weight unit").click();
      await page.getByRole("textbox", { name: "Kilograms" }).fill(p.kg);
    });
    if (p.fat) {
      await answer("Your body fat", "04-body-fat", async () => {
        // the drawings only when asked (founder: "only when they ask")
        expect((await page.getByRole("radiogroup", { name: "Choose the one closest to you" }).count()) === 0, "the drawings are hidden until asked");
        await page.getByRole("button", { name: "What's my body fat?" }).click();
        await radio(new RegExp(`^${p.fat}`), "Choose the one closest to you").click();
        expect((await page.getByRole("textbox", { name: "Body fat %" }).inputValue()) === p.fat.replace(/\D/g, ""), "the drawing fills the box");
      });
      await answer("Your goal weight", "05-goal", async () => {
        // said back the way the weight was typed: kilograms
        expect((await radio("Kilograms", "Weight unit").getAttribute("aria-checked")) === "true", "the goal starts in kilograms");
        await page.getByRole("textbox", { name: "Kilograms" }).fill(p.goal);
      });
    }
    if (p.pregnant) await answer("Are you pregnant or breastfeeding?", "06-pregnant", () => radio(p.pregnant).click());
    if (p.cm) {
      await answer("Your height", "06-height", async () => {
        await radio("Centimetres", "Height unit").click();
        await page.getByRole("textbox", { name: "Centimetres" }).fill(p.cm);
      });
    }
    await answer("Day to day, not counting workouts", "07-day-to-day", () => radio(p.dayToDay).click());
    if (p.sportKind) await answer("What's your sport?", "08-sport", () => radio(p.sportKind).click());
    await answer("How often do you train?", "09-training", () => radio(p.training, "How often do you train?").click());
    if (p.trainingKind) await answer("What do you train?", "10-train-kind", () => radio(p.trainingKind).click());
    if (p.lifting) await answer("How long have you lifted weights?", "11-lifting", () => radio(p.lifting).click());
    if (p.exercise) await answer("Shall I plan your exercise too?", "12-exercise", () => radio(p.exercise).click());
    if (p.session) await answer("How long is a usual session?", "12-session", () => radio(p.session).click());
    if (p.pace) await answer("How fast?", "13-pace", () => radio(p.pace).click());
    await h1("Your numbers").waitFor({ timeout: 30000 });
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(text.includes(`${p.kcal} kcal a day`), `${p.kcal} kcal a day: ${text.slice(0, 500)}`);
    expect(text.includes(`${p.protein} protein a day`), `${p.protein} protein a day: ${text.slice(0, 500)}`);
    if (p.goalLine) await page.getByText(p.goalLine).waitFor();
    else expect(!/ in about \d+/.test(text), "no time to a goal when training for a sport");
    expect(text.includes("Your exercise each week"), "the week's exercise on Your numbers");
    await widths("14-numbers");
    await button("Use these numbers").click();
  });

  await step(`${p.key}: Skip to the check screen; its row says the numbers; Make my plan sends Pip no body details`, async () => {
    for (let i = 0; i < 15; i++) {
      if (await h1("Ready to make your plan?").isVisible()) break;
      await button("Skip").click();
      await page.waitForTimeout(150);
    }
    await h1("Ready to make your plan?").waitFor();
    const row = (await page.locator("main ul li", { hasText: "Your numbers" }).last().innerText()).replace(/\s+/g, " ");
    expect(row.includes(`${p.kcal} kcal and ${p.protein.replace(" g", "")} g protein a day`), `the check screen's numbers row: ${row}`);
    await widths("15-check");
    await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180000 });
    await page.getByRole("button", { name: "Make my plan" }).click();
    const sheet = page.getByRole("dialog", { name: "Pip uses AI" });
    await sheet.waitFor();
    await sheet.getByRole("button", { name: "Allow" }).click();
    await h1("Your meal plan").waitFor({ timeout: 120000 });
    expect(sent.length === 1, `one request to Pip: ${sent.length}`);
    const body = JSON.stringify(sent[0]);
    expect(!/weightKg|bodyFat|goalKg|heightCm|"age"|pregnant|dayToDay|"set"/.test(body), `no body details sent to Pip: ${body.slice(0, 400)}`);
  });

  await step(`${p.key}: the week shows ${p.goalLine ? "the time to the goal and " : ""}the day's exercise`, async () => {
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    if (p.goalLine) {
      await page.getByText(p.goalLine).first().waitFor();
      await page.getByText("Make a new plan every 4 weeks with your new weight, so your numbers keep up.").waitFor();
    } else expect(!/ in about \d+ (to \d+ )?weeks/.test(text), "no time to a goal when training for a sport");
    const card = page.locator("#day-h").locator("..").locator("div", { has: page.locator("p", { hasText: /^Exercise$/ }) }).first();
    await card.waitFor();
    const [what, figures] = p.week[TODAY];
    const cardText = (await card.innerText()).replace(/\s+/g, " ");
    expect(cardText.includes(what), `${DAY[TODAY]}'s exercise is ${what}: ${cardText}`);
    if (figures) expect(cardText.includes(figures), `${DAY[TODAY]}'s figures ${figures}: ${cardText}`);
    await card.scrollIntoViewIfNeeded();
    await widths("16-week");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
    expect(stored.goal && stored.goal.kcal === Number(p.kcal.replace(",", "")) && stored.goal.protein === Number(p.protein.replace(" g", "")), `the saved goal: ${JSON.stringify(stored.goal).slice(0, 300)}`);
    expect(stored.goal.exercise.length === 7, "seven days of exercise kept");
  });
  await ctx.close();
}

await step("no page errors", async () => { expect(errors.length === 0, errors.join(" | ")); });

console.log(`\n${passed} passed, ${failed} failed. Pictures in ${SHOTS}`);
await browser.close();
process.exit(failed ? 1 : 0);
