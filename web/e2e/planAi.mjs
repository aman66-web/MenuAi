// Meal plan with Pip (founder 2026-11-21: "Use Opus to make the meal timetable ... ask as many questions as you want ... It's just got to be the perfect plan"):
// Pip's extra questions on the check screen, each opened by its Change with nothing chosen and Skip on its button; the cuisines to skip; then Make my plan
// asks Pip (the AI route is stubbed here with page.route: never a real AI call), with Pip's permission first; the week opens with Pip's note and each day's
// fruit and veg. Then the same with Pip unreachable: the phone's own week, said in one plain line. Checked at 402 x 874 and with the text at 1.3 times, with
// no sideways scroll on any screen.
// Run against a server with Premium previewed: BASE=http://localhost:3112 SHOTS=<folder> node e2e/planAi.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3112";
const SHOTS = process.env.SHOTS ?? "/tmp/ai-plan";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 3).join(" | ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, devProOverride: true, preferences: {}, hasCompletedOnboarding: true, shops: ["sainsburys"] } });

async function context() {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
    sessionStorage.setItem("seeded", "1");
  }, settings);
  return ctx;
}

const ctx = await context();
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
// the AI route, stubbed: Pip keeps the phone's week but swaps two lunches round, and says why
const sent = [];
await page.route("**/api/v1/plan/ai", async (route) => {
  const body = route.request().postDataJSON();
  sent.push(body);
  const ids = body.draft.map((d) => [...d]);
  [ids[0][1], ids[1][1]] = [ids[1][1], ids[0][1]];
  await new Promise((r) => setTimeout(r, 1500));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { ids, why: "Quick lunches on your busy weekdays, and something slower to cook at the weekend." } }) });
});
const h1 = (name) => page.getByRole("heading", { level: 1, name, exact: true });
const sideways = async (where) => { const w = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(w <= 0, `${where}: sideways scroll ${w}px`); };
const big = (on) => page.evaluate((on) => { document.documentElement.style.fontSize = on ? "130%" : ""; }, on);
const done = async () => { await page.getByRole("button", { name: "Done", exact: true }).last().click(); await h1("Ready to make your plan?").waitFor({ timeout: 60000 }); };
// after the finite animations and transitions (a chosen answer turning lime, the sheet rising), so the picture shows the screen as it settles
const shot = async (name) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

await step("the check screen lists Pip's questions, each Not set, with Change", async () => {
  await page.goto(BASE + "/app/plan");
  await h1("Ready to make your plan?").waitFor({ timeout: 120000 });
  for (const row of ["Your aim", "Fruit and veg", "Training", "Cooking time", "Leftovers", "Breakfast", "Bread", "Spice", "Notes for Pip"]) {
    const li = page.locator("main ul li", { hasText: row }).last();
    await li.getByRole("button", { name: `Change: ${row}` }).waitFor();
  }
  expect((await page.locator("main ul li", { hasText: "Your aim" }).innerText()).includes("Not set"), "the aim is not set");
  await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180000 });
  await shot("01-check-before");
});

/** Opens a question from the check screen: nothing chosen, the button says Skip until something is. */
async function open(row, title) {
  await page.getByRole("button", { name: `Change: ${row}` }).click();
  await h1(title).waitFor();
  expect((await page.locator('[aria-checked="true"], [aria-pressed="true"]').count()) === 0, `${title}: nothing chosen when it opens`);
}

await step("each question opens with nothing chosen; the answers come back to the check screen; large text has no sideways scroll", async () => {
  await open("Your aim", "What's your aim?");
  await page.getByRole("radio", { name: /^Build muscle/ }).click();
  await big(true); await sideways("aim at 1.3x"); await shot("02-aim-large-text"); await big(false);
  await done();
  await open("Fruit and veg", "Fruit and veg a day");
  await page.getByText("Counted the NHS way: 80 g of fruit or veg is a portion.").waitFor();
  await page.getByRole("radio", { name: "7 a day" }).click();
  await shot("03-fruit-veg");
  await done();
  await open("Training", "How often do you train?");
  await page.getByRole("radio", { name: "3 to 4 days" }).click();
  for (const d of ["Mon", "Wed", "Fri"]) await page.getByRole("button", { name: d, exact: true }).click();
  await big(true); await sideways("training at 1.3x"); await shot("04-training-large-text"); await big(false);
  await done();
  await open("Cooking time", "How long can you cook for?");
  await page.getByRole("radiogroup", { name: "On weekdays" }).getByRole("radio", { name: "30 min" }).click();
  await page.getByRole("radiogroup", { name: "At weekends" }).getByRole("radio", { name: "1 hour+" }).click();
  await big(true); await sideways("cooking time at 1.3x"); await shot("05-cooking-large-text"); await big(false);
  await done();
  await open("Leftovers", "Cook once, eat twice?");
  // the button says Skip while nothing is chosen (opened from the check screen it says Done)
  await page.getByRole("radio", { name: /^Yes, I like leftovers/ }).click();
  await done();
  await open("Breakfast", "What do you like for breakfast?");
  await page.getByRole("button", { name: "Savoury", exact: true }).click();
  await page.getByRole("button", { name: "Quick", exact: true }).click();
  await done();
  await open("Bread", "How often do you like bread?");
  await page.getByRole("radio", { name: "Rarely" }).click();
  await done();
  await open("Spice", "How hot do you like it?");
  await page.getByRole("radio", { name: /^Mild/ }).click();
  await done();
  await open("Notes for Pip", "Anything else Pip should know?");
  await page.getByRole("textbox", { name: "Anything else Pip should know?" }).fill("I'm not keen on courgette, and I eat late on Fridays.");
  await page.getByText("53 of 300").waitFor();
  await big(true); await sideways("notes at 1.3x"); await shot("06-notes-large-text"); await big(false);
  await done();
  // the kinds of food to skip, on the food step
  await page.getByRole("button", { name: "Change: The food you like" }).click();
  await h1("The food you like").waitFor();
  await page.getByRole("group", { name: "Any you'd rather skip?" }).getByRole("button", { name: "Skip Mexican", exact: true }).click();
  await shot("07-cuisine-skip");
  await done();
  const rows = (await page.locator("main ul").innerText()).replace(/\s+/g, " ");
  for (const want of ["Build muscle", "7 a day", "3 to 4 days a week: Mon, Wed and Fri", "30 min on weekdays, 1 hour+ at weekends", "Yes, I like leftovers", "Savoury and Quick", "Rarely", "Mild", "“I'm not keen on courgette, and I eat late on Fridays.”", "Skipping Mexican."]) {
    expect(rows.includes(want), `the check screen says "${want}": ${rows.slice(0, 600)}`);
  }
  await big(true); await sideways("check screen at 1.3x"); await big(false);
  await shot("08-check-after");
});

await step("Make my plan: Pip's permission first, then 'Pip is reading your answers'; the request holds the answers and no names", async () => {
  await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "Make my plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Pip uses AI for this" });
  await sheet.waitFor();
  await sheet.getByText(/your answers to Pip's meal plan questions/).waitFor();
  await shot("09-permission");
  await sheet.getByRole("button", { name: "Allow" }).click();
  await h1("Making your plan").waitFor({ timeout: 30000 });
  await page.getByText("This can take up to a minute.").waitFor();
  await page.locator("li").filter({ hasText: /^Pip is reading your answers/ }).waitFor();
  await page.locator("li").filter({ hasText: /^Pip is choosing your week from [\d,]+ recipes/ }).waitFor({ timeout: 15000 });
  await shot("10-making");
  await page.locator("li").filter({ hasText: /^Writing your shopping list: \d+ products/ }).waitFor({ timeout: 60000 });
  expect(sent.length === 1, `one request: ${sent.length}`);
  const r = sent[0];
  expect(r.answers.aim === "muscle" && r.answers.fruitVeg === 7 && r.answers.bread === "rarely" && r.answers.spice === "mild" && r.answers.leftovers === true, JSON.stringify(r.answers));
  expect(JSON.stringify(r.answers.trainingDays) === "[1,3,5]" && JSON.stringify(r.answers.skipCuisines) === '["mexican"]', JSON.stringify(r.answers));
  expect(r.answers.notes === "I'm not keen on courgette, and I eat late on Fridays.", "the note: " + r.answers.notes);
  expect(r.household === null && r.days.length === 7 && r.draft.length === 7, "days and draft");
  expect(Object.values(r.candidates).every((l) => l.length >= 8 && l.length <= 40), "8 to 40 recipes a meal");
  expect(!JSON.stringify(r).match(/sainsbury|@|devProOverride/i), "nothing about the person beyond the answers");
  console.log(`     request body: ${JSON.stringify(r).length} bytes`);
});

await step("the week is Pip's: his note at the top, the lunches he swapped, each day's fruit and veg against the aim", async () => {
  await h1("Your meal plan").waitFor({ timeout: 60000 });
  await page.getByText("Quick lunches on your busy weekdays, and something slower to cook at the weekend.").waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  const d = sent[0].draft;
  // Pip's swap is kept, or both days put back when it broke one of the plan's rules (lib/mm/planAiWeek.ts): either way his week, never half of a swap
  const swapped = stored.ids[0][1] === d[1][1] && stored.ids[1][1] === d[0][1];
  const back = stored.ids[0][1] === d[0][1] && stored.ids[1][1] === d[1][1];
  expect(swapped || back, "Pip's lunches: " + JSON.stringify(stored.ids.slice(0, 2)));
  console.log(`     Pip's swapped lunches ${swapped ? "kept" : "put back (a rule)"}`);
  expect(stored.why && stored.answers.aim === "muscle" && !stored.pipMissed, JSON.stringify(stored).slice(0, 300));
  await page.getByText(/^Fruit and veg: ((\d+)?½? of 7 portions|(\d+)?½? portions \(your aim is 7\))$/).waitFor();
  await page.getByText("Counted the NHS way: 80 g of fruit or veg is a portion.").waitFor();
  await sideways("week");
  await shot("11-week");
  await page.locator("#day-h").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await shot("11b-week-day");
  await big(true); await sideways("week at 1.3x"); await shot("12-week-large-text"); await big(false);
  expect(errors.length === 0, errors.join(" | "));
});

await step("Pip unreachable: the phone's own week, with one plain line saying so", async () => {
  await page.unroute("**/api/v1/plan/ai");
  await page.route("**/api/v1/plan/ai", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "busy" }) }));
  await page.getByRole("button", { name: "Make a new plan" }).first().click();
  // straight to the check screen through each step's button (the answers are kept)
  for (let i = 0; i < 30; i++) {
    if (await h1("Ready to make your plan?").isVisible()) break;
    const next = page.locator(".sticky").getByRole("button").last();
    await next.and(page.locator(":enabled")).waitFor({ timeout: 180000 });
    await next.click();
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "Make my plan" }).click();
  await h1("Making your plan").waitFor({ timeout: 30000 });
  await page.locator("li").filter({ hasText: /^Pip couldn't plan with your answers this time/ }).waitFor({ timeout: 30000 });
  await h1("Your meal plan").waitFor({ timeout: 60000 });
  await page.getByText("Pip couldn't plan with your answers this time. Make a new plan to try again.").waitFor();
  expect((await page.getByText("Quick lunches on your busy weekdays").count()) === 0, "no note from Pip");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  expect(stored.pipMissed === true && !stored.why, JSON.stringify(stored).slice(0, 200));
  await shot("13-week-pip-missed");
});

await step("leaving while Pip works (founder 2026-11-21: \"If the person clicks off their plan will still be made\"): a notice at the top of other screens, then 'Your meal plan is ready' and Open", async () => {
  await page.unroute("**/api/v1/plan/ai");
  let answered = false;
  await page.route("**/api/v1/plan/ai", async (route) => {
    const body = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, 8000));
    answered = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { ids: body.draft, why: "A steady week that keeps your cooking short on weekdays." } }) });
  });
  await page.getByRole("button", { name: "Make a new plan" }).first().click();
  for (let i = 0; i < 30; i++) {
    if (await h1("Ready to make your plan?").isVisible()) break;
    const next = page.locator(".sticky").getByRole("button").last();
    await next.and(page.locator(":enabled")).waitFor({ timeout: 180000 });
    await next.click();
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: "Make my plan" }).click();
  await h1("Making your plan").waitFor({ timeout: 30000 });
  // no notice over Making your plan itself
  expect((await page.getByText("Pip is making your plan…").count()) === 0, "no notice on the Making screen");
  // off to Recipes by the tab bar while Pip works
  await page.getByRole("link", { name: "Recipes" }).last().click();
  await page.waitForURL(/\/app\/recipes/);
  await page.getByRole("status").filter({ hasText: "Pip is making your plan…" }).waitFor({ timeout: 10000 });
  expect(!answered, "the notice shows while Pip is still working");
  await shot("14-notice-working");
  await page.getByRole("status").filter({ hasText: "Your meal plan is ready" }).waitFor({ timeout: 30000 });
  await shot("15-notice-ready");
  await page.getByRole("status").getByRole("link", { name: "Open" }).click();
  await h1("Your meal plan").waitFor({ timeout: 60000 });
  await page.getByText("A steady week that keeps your cooking short on weekdays.").waitFor();
  expect((await page.getByText("Your meal plan is ready").count()) === 0, "the notice goes once the week is open");
  expect(errors.length === 0, errors.join(" | "));
});

await ctx.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
