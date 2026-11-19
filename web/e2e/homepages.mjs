// Home's numbers as three pages with three dots (founder 2026-11-19: "3 dots here showing that they can also swipe right to see different things like stats";
// the 20-person meeting's conclusion): Today, Calories and protein this week, Today: sugar, salt and fibre. The dots are 44 pt buttons; a first-visit hint and one
// demonstration slide (never while Pip's tips are due, never with reduced motion); stacked with no dots on a narrow screen; only what was logged is shown.
// Chromium only (the swipe itself is checked in the Simulator and on the iPhone). Run against a server with Premium previewed:
//   BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 node e2e/homepages.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const env = (data) => JSON.stringify({ v: 1, data });

/** A food logged `daysAgo` days before now, at `hour`. */
const food = (id, daysAgo, hour, name, nutrients) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return { id, loggedAt: d.toISOString(), chainId: "", chainName: "", name, nutrients, source: "custom" }; };

async function open({ width = 390, pro = true, homePages = { seen: false, slid: true, hintDays: 0, lastHintDay: "" }, log = [], coach = { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] }, reducedMotion = "no-preference", clock } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", reducedMotion });
  if (clock) await ctx.clock.setFixedTime(clock);
  const items = { "mm.v1.settings": env({ goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, ...(pro ? { devProOverride: true } : {}) }), "mm.v1.coach": env(coach), "mm.v1.tour": env(1), "mm.v1.log": env(log) };
  if (homePages) items["mm.v1.homePages"] = env(homePages);
  await ctx.addInitScript((list) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of list) localStorage.setItem(k, v);
  }, Object.entries(items));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("group", { name: "Today, 1 of 3" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
const dot = (page, name) => page.getByRole("group", { name: "Choose what to show" }).getByRole("button", { name, exact: true });
const inView = async (page, name) => { const b = await page.getByRole("group", { name }).boundingBox(); return b && b.x > -2 && b.x < 40; };
const storeOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.homePages") || "null")?.data ?? null);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const WEEK = [
  food("m1", 3, 8, "Porridge", { calories: 900, protein: 40, carbs: 100, fat: 30, sugar: 12, salt: 0.2, fiber: 6 }),
  food("m2", 3, 19, "Pasta", { calories: 1250, protein: 50, carbs: 140, fat: 50 }),
  food("w1", 1, 12, "Burger", { calories: 2000, protein: 60, carbs: 200, fat: 80 }),
  food("w2", 1, 20, "Typed snack", { calories: 300 }),
  food("t1", 0, 8, "Yoghurt", { calories: 220, protein: 18, carbs: 20, fat: 6, sugar: 14, salt: 0.15, fiber: 1 }),
  food("t2", 0, 12, "Soup", { calories: 340, protein: 12, carbs: 40, fat: 12, sugar: 8, salt: 1.8 }),
];

await step("three 44 pt dots under the cards; each one shows its page and is marked as the one shown; Home opens on Today again after a reload", async () => {
  const { ctx, page } = await open({ log: WEEK });
  const names = ["Today", "Calories and protein this week", "Sugar, salt and fibre"];
  for (const n of names) {
    const b = await dot(page, n).boundingBox();
    expect(b.width >= 44 && b.height >= 44, `${n}: ${JSON.stringify(b)}`);
  }
  const cards = await page.getByRole("group", { name: "Today, 1 of 3" }).boundingBox();
  const dots = await page.getByRole("group", { name: "Choose what to show" }).boundingBox();
  expect(dots.y >= cards.y + cards.height - 2 && dots.y < cards.y + cards.height + 12, `the dots sit right under the cards: ${JSON.stringify([cards, dots])}`);
  expect(await dot(page, "Today").getAttribute("aria-current") === "true", "Today is marked first");
  for (const [n, group] of [[names[1], "Calories and protein this week, 2 of 3"], [names[2], "Sugar, salt and fibre, 3 of 3"], [names[0], "Today, 1 of 3"]]) {
    await dot(page, n).click();
    await page.waitForFunction((g) => { const el = [...document.querySelectorAll('[role="group"]')].find((x) => x.getAttribute("aria-label") === g); const r = el?.getBoundingClientRect(); return r && r.x > -2 && r.x < 40; }, group, { timeout: 5000 });
    expect(await dot(page, n).getAttribute("aria-current") === "true", `${n} marked as shown`);
  }
  await dot(page, names[1]).click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByRole("group", { name: "Today, 1 of 3" }).waitFor();
  await page.waitForTimeout(500);
  expect(await inView(page, "Today, 1 of 3"), "Today again after a reload");
  await ctx.close();
});

await step("a seeded week: each day's calories, a dash for a day with nothing, averages over the days logged before today, the protein note; a screen reader gets each day", async () => {
  const { ctx, page } = await open({ log: WEEK });
  await dot(page, "Calories and protein this week").click();
  const week = page.getByRole("group", { name: "Calories and protein this week, 2 of 3" });
  const text = await week.innerText();
  const days = new Date().getDay() === 1 ? 0 : [3, 1].filter((n) => (new Date().getDay() + 6) % 7 >= n).length;
  if (days === 2) {
    expect(text.includes("2,225") && text.includes("kcal a day") && text.includes("From the 2 days you logged, not counting today."), `averages: ${text}`);
    expect(text.includes("75g") && text.includes("protein a day"), `protein over the days that gave it ((90g + 60g) / 2): ${text}`);
    expect(text.includes("Some meals this week have no protein entered, so protein counts only the rest."), "the protein note");
  }
  expect(text.includes("Your target: 2,000 kcal"), "the target's legend");
  expect(text.includes("560"), `today's bar so far: ${text}`);
  expect(!/\b0 kcal\b/.test(text), "no day drawn as 0");
  const spoken = await week.getByRole("list", { name: "Calories each day" }).innerText();
  expect(/\(today, so far\): 560 kcal/.test(spoken), `today in the spoken list: ${spoken}`);
  await ctx.close();
});

await step("today's sugar, salt and fibre from the foods that printed them, saying how many did", async () => {
  const { ctx, page } = await open({ log: WEEK });
  await dot(page, "Sugar, salt and fibre").click();
  const text = (await page.getByRole("group", { name: "Sugar, salt and fibre, 3 of 3" }).innerText()).replace(/\s+/g, " ");
  expect(/Sugar 22g/i.test(text) && /Salt 1\.95g/i.test(text) && /Fibre 1g from 1 of your 2 foods/i.test(text), text);
  expect(text.includes("Only foods whose label or menu gives these figures are counted."), "the footer");
  await ctx.close();
});

await step("the first-visit hint takes you to the week and goes for good; it is gone on a sixth day even if the week was never looked at", async () => {
  const { ctx, page } = await open({ homePages: null });
  const hint = page.getByRole("button", { name: "Slide the cards sideways, or tap here, to see your week" });
  await hint.waitFor();
  expect((await hint.boundingBox()).height >= 44, "a 44 pt button");
  await hint.click();
  await page.waitForFunction(() => { const el = [...document.querySelectorAll('[role="group"]')].find((x) => x.getAttribute("aria-label") === "Calories and protein this week, 2 of 3"); const r = el?.getBoundingClientRect(); return r && r.x > -2 && r.x < 40; }, null, { timeout: 5000 });
  expect((await storeOf(page))?.seen === true, "seen is kept");
  expect(!(await hint.isVisible().catch(() => false)), "gone at once");
  await page.reload();
  await page.getByRole("group", { name: "Today, 1 of 3" }).waitFor();
  expect(!(await hint.isVisible().catch(() => false)), "gone after a reload");
  await ctx.close();
  const six = await open({ homePages: { seen: false, slid: true, hintDays: 5, lastHintDay: "2026-01-02" } });
  expect(!(await six.page.getByRole("button", { name: /Slide the cards sideways/ }).isVisible().catch(() => false)), "retired after five days");
  await six.ctx.close();
});

await step("the one demonstration slide: plays once on a first visit, never while Pip's tips for Home are due, never with reduced motion", async () => {
  const first = await open({ homePages: null });
  await first.page.waitForTimeout(1500);
  expect((await storeOf(first.page))?.slid === true, "played (and noted) on the first visit");
  await first.ctx.close();
  const due = await open({ homePages: null, coach: { armed: true, seen: [] } });
  await due.page.waitForTimeout(2000);
  expect((await storeOf(due.page))?.slid !== true, "waits while Pip's tips are due");
  await due.ctx.close();
  const still = await open({ homePages: null, reducedMotion: "reduce" });
  await still.page.waitForTimeout(2000);
  expect((await storeOf(still.page))?.slid !== true, "no slide with reduced motion");
  await dot(still.page, "Calories and protein this week").click();
  await still.page.waitForTimeout(80);
  expect(await inView(still.page, "Calories and protein this week, 2 of 3"), "a dot jumps straight there with reduced motion");
  await still.ctx.close();
});

await step("someone who can't log yet sees the empty frames and one plain sentence: no bars, no figures, no target line", async () => {
  const { ctx, page } = await open({ pro: false });
  await dot(page, "Calories and protein this week").click();
  const week = await page.getByRole("group", { name: "Calories and protein this week, 2 of 3" }).innerText();
  expect(week.includes("Each day's calories show here once you log your meals.") && !week.includes("Your target") && !/\d{3}/.test(week), week);
  await dot(page, "Sugar, salt and fibre").click();
  const labels = await page.getByRole("group", { name: "Sugar, salt and fibre, 3 of 3" }).innerText();
  expect(labels.includes("Your sugar, salt and fibre show here once you log your meals."), labels);
  await ctx.close();
});

await step("a narrow phone: the three pages one under another with their titles, no dots or hint; no sideways scroll at 320, 360 and 390", async () => {
  const narrow = await open({ width: 320, log: WEEK, homePages: null });
  expect(await narrow.page.getByRole("group", { name: "Choose what to show" }).count() === 0, "no dots");
  expect(!(await narrow.page.getByRole("button", { name: /Slide the cards sideways/ }).isVisible().catch(() => false)), "no hint");
  const [a, b, c] = await Promise.all(["Today, 1 of 3", "Calories and protein this week, 2 of 3", "Sugar, salt and fibre, 3 of 3"].map((n) => narrow.page.getByRole("group", { name: n }).boundingBox()));
  expect(b.y > a.y + a.height - 2 && c.y > b.y + b.height - 2 && Math.abs(a.x - b.x) < 2, `stacked: ${JSON.stringify([a, b, c])}`);
  expect(await overflow(narrow.page) <= 0, "no sideways scroll at 320");
  await narrow.ctx.close();
  for (const width of [360, 390]) {
    const w = await open({ width, log: WEEK });
    expect(await overflow(w.page) <= 0, `no sideways scroll at ${width}`);
    await w.ctx.close();
  }
});

await step("axe: Home with its pages, the hint showing, and the week page", async () => {
  const { ctx, page } = await open({ log: WEEK, homePages: { seen: false, slid: true, hintDays: 0, lastHintDay: "" } });
  await page.addScriptTag({ path: AXE });
  let v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
  await dot(page, "Calories and protein this week").click();
  await page.waitForTimeout(800);
  v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
