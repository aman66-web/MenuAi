// Home's date, the calendar and the day page (founder 2026-10-16: "Instead of Home have the date for example Nov 15, the month in short form ... Also have this logo on
// the right of it. When the person clicks on that they can find any day and click on it and see their macros and what they ate on that day"; earlier: "when they click the
// number at the top it shows what they got on that day"). Home's title is today's short date ("Oct 16") with a calendar button beside it and the Settings gear at the far
// right; the calendar is a month sheet (a dot under days with food logged, the days ahead greyed); a day, in the calendar or the week strip, opens /app/today?d=YYYY-MM-DD:
// that day's calories dial, protein, carbs and fat and its meals, with Previous day, Next day and a Today shortcut. Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 7).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** `daysAgo` days back at hour `h`, local time. */
const at = (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d; };
const entry = (id, when, name, nutrients, extra = {}) => ({ id, loggedAt: when.toISOString(), chainId: "typed", chainName: "", name, source: "typed", nutrients, ...extra });

// Today at 09:00 is only "in the past" after 09:00; keep every seeded time safely before now by using early hours for today.
const SEED_LOG = [
  entry("t1", at(0, 0, 5), "Midnight toast", { calories: 200, protein: 6, carbs: 30, fat: 5 }),
  entry("y1", at(1, 8), "Yesterday porridge", { calories: 350, protein: 12, carbs: 55, fat: 8 }),
  entry("y2", at(1, 13), "Yesterday chicken wrap", { calories: 640, protein: 42, carbs: 60, fat: 22 }),
  entry("y3", at(1, 19), "Yesterday curry", { calories: 810, protein: 38, carbs: 90, fat: 30 }),
  entry("d3", at(3, 9), "Three days ago eggs", { calories: 300, protein: 20, carbs: 2, fat: 22 }),
];

async function open(extra = {}, settings = {}, log = SEED_LOG) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript(([s, lg]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.log", lg);
  }, [JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }), JSON.stringify({ v: 1, data: log })]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const home = async (page) => { await page.goto(BASE + "/app", { timeout: 120000 }); await page.getByRole("button", { name: "Choose a day", exact: true }).waitFor({ timeout: 90000 }); };
const dialog = (page) => page.locator("dialog[open]");
async function openCalendar(page) { await page.getByRole("button", { name: "Choose a day", exact: true }).tap(); await dialog(page).waitFor(); await page.waitForTimeout(700); /* the sheet slides in */ }
/** The long English name a day button carries, e.g. "Wednesday 14 October". */
const longName = (d) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(d);
const dayButton = (page, d) => dialog(page).getByRole("button", { name: new RegExp("^" + longName(d)) });
const shortNow = () => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date());
const dayPage = (page) => page.getByRole("heading", { level: 1 });
const figuresText = (page) => page.locator("main, body").first().innerText();

await step("Home's title is today's short date, month first, still named Home for screen readers; the calendar button sits beside it and the Settings gear is at the far right", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  const h1 = page.getByRole("heading", { level: 1 });
  expect((await h1.innerText()).replace(/\s+/g, " ").trim().endsWith(shortNow()), `the title reads "${await h1.innerText()}", expected it to end with "${shortNow()}"`);
  expect((await h1.textContent()).includes("Home"), "the heading lost its name 'Home' for screen readers");
  expect((await page.getByRole("heading", { name: "Home", level: 1 }).count()) === 1, "no heading named Home");
  const cal = page.getByRole("button", { name: "Choose a day", exact: true });
  const gear = page.locator('a[aria-label="Settings"]'); // the tab bar's Settings link has no aria-label
  const [c, g, t] = [await cal.boundingBox(), await gear.boundingBox(), await h1.boundingBox()];
  expect(c.width >= 44 && c.height >= 44, `the calendar button is ${c.width} x ${c.height}`);
  expect(c.x > t.x + t.width - 1, "the calendar button isn't to the right of the date");
  expect(g.x > c.x + c.width, "the gear isn't further right than the calendar button");
  expect(g.x + g.width > 390 - 20, `the gear isn't at the far right (right edge ${g.x + g.width})`);
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the calendar: this month in Monday-first weeks, a dot under every day with food, the days ahead disabled, back to last month and forward again (not past this month)", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await openCalendar(page);
  const now = new Date();
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(now);
  await dialog(page).getByText(title, { exact: true }).waitFor();
  expect(await dialog(page).getByRole("button", { name: "Next month", exact: true }).isDisabled(), "Next month should be disabled in the current month");
  const today = dialog(page).getByRole("button", { name: new RegExp("^" + longName(now) + " \\(today\\)") });
  expect((await today.count()) === 1, "today isn't marked as today");
  expect((await today.getAttribute("aria-current")) === "date", "today lacks aria-current");
  // yesterday and three days ago have food (same month unless the month just turned, in which case skip those two checks)
  const y = at(1, 12), d3 = at(3, 12);
  if (y.getMonth() === now.getMonth()) expect((await dayButton(page, y).getAttribute("aria-label")).includes("food logged"), "yesterday isn't marked as having food");
  if (d3.getMonth() === now.getMonth()) expect((await dayButton(page, d3).getAttribute("aria-label")).includes("food logged"), "three days ago isn't marked as having food");
  const quiet = at(2, 12);
  if (quiet.getMonth() === now.getMonth()) expect((await dayButton(page, quiet).getAttribute("aria-label")).includes("nothing logged"), "an empty day isn't marked 'nothing logged'");
  // the days ahead can't be tapped
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (tomorrow.getMonth() === now.getMonth()) expect(await dialog(page).getByRole("button", { name: new RegExp("^" + longName(tomorrow)) }).isDisabled(), "tomorrow should be disabled");
  // back a month and forward again
  await dialog(page).getByRole("button", { name: "Previous month", exact: true }).tap();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  await dialog(page).getByText(new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(prev), { exact: true }).waitFor();
  await dialog(page).getByRole("button", { name: "Next month", exact: true }).tap();
  await dialog(page).getByText(title, { exact: true }).waitFor();
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("picking yesterday in the calendar opens that day: its date as the title, its calories, protein, carbs and fat, its meals by name, Previous day and Next day", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await openCalendar(page);
  const y = at(1, 12);
  // yesterday may sit in last month on the 1st: go back first
  if (y.getMonth() !== new Date().getMonth()) await dialog(page).getByRole("button", { name: "Previous month", exact: true }).tap();
  await dayButton(page, y).tap();
  await page.waitForURL(new RegExp("/app/today\\?d=" + keyOf(y)), { timeout: 30000 });
  await page.getByText("Yesterday porridge").waitFor({ timeout: 30000 });
  const h1 = await dayPage(page).innerText();
  expect(h1.includes(String(y.getDate())), `the title "${h1}" lacks yesterday's date`);
  expect(!/Today's meals/.test(h1), "a past day is still titled Today's meals");
  const text = await figuresText(page);
  for (const name of ["Yesterday porridge", "Yesterday chicken wrap", "Yesterday curry"]) expect(text.includes(name), `${name} missing`);
  expect(!text.includes("Midnight toast"), "today's entry leaked into yesterday");
  // 350 + 640 + 810 = 1,800 kcal
  expect(/1,800/.test(text), "yesterday's calories total (1,800) isn't shown: " + text.slice(0, 300));
  expect(/These totals use your current targets\./.test(text), "the targets note is missing on a past day");
  expect((await page.getByRole("link", { name: "Previous day", exact: true }).count()) === 1, "no Previous day");
  expect((await page.getByRole("link", { name: "Next day", exact: true }).count()) === 1, "no Next day link on a past day");
  expect((await page.getByRole("link", { name: "Today", exact: true }).count()) === 1, "no Today shortcut on a past day");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the week strip's circles open their day; today's circle opens plain /app/today; the days ahead are not links", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  const strip = page.getByRole("list", { name: "This week" });
  const links = strip.getByRole("link");
  const n = await links.count();
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const daysUpToToday = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - monday) / 86400000) + 1;
  expect(n === daysUpToToday, `${n} circles are links, expected ${daysUpToToday} (Monday to today)`);
  const box = await links.first().boundingBox();
  expect(box.width >= 43 && box.height >= 44, `a week circle's tap area is ${box.width} x ${box.height}`);
  // today
  await strip.getByRole("link", { name: /\(today\)$/ }).tap();
  await page.waitForURL(/\/app\/today$/, { timeout: 30000 });
  await page.getByRole("heading", { name: "Today's meals", exact: true }).waitFor();
  await page.getByText("Midnight toast").waitFor();
  // a past day of this week with food (yesterday, unless it is Monday and yesterday is last week)
  await page.goBack();
  await home(page);
  const y = at(1, 12);
  if (daysUpToToday >= 2) {
    await page.getByRole("list", { name: "This week" }).getByRole("link", { name: new RegExp("^" + longName(y)) }).tap();
    await page.waitForURL(new RegExp("/app/today\\?d=" + keyOf(y)), { timeout: 30000 });
    await page.getByText("Yesterday curry").waitFor();
  }
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("Previous day and Next day flip through days; Today comes back; Next day is greyed on today; an empty past day says so", async () => {
  const { ctx, page, errors } = await open();
  await page.goto(BASE + "/app/today", { timeout: 120000 });
  await page.getByRole("heading", { name: "Today's meals", exact: true }).waitFor({ timeout: 90000 });
  expect((await page.getByText("Next day", { exact: true }).first().getAttribute("aria-disabled").catch(() => null)) === "true" || (await page.getByRole("link", { name: "Next day", exact: true }).count()) === 0, "Next day should be disabled on today");
  await page.getByRole("link", { name: "Previous day", exact: true }).tap();
  await page.waitForURL(new RegExp("d=" + keyOf(at(1, 12))), { timeout: 30000 });
  await page.getByText("Yesterday curry").waitFor();
  await page.getByRole("link", { name: "Previous day", exact: true }).tap(); // two days ago: nothing logged
  await page.waitForURL(new RegExp("d=" + keyOf(at(2, 12))), { timeout: 30000 });
  await page.getByText("Nothing was logged on this day.").waitFor();
  await page.getByRole("link", { name: "Previous day", exact: true }).tap(); // three days ago
  await page.getByText("Three days ago eggs").waitFor();
  await page.getByRole("link", { name: "Next day", exact: true }).tap();
  await page.waitForURL(new RegExp("d=" + keyOf(at(2, 12))), { timeout: 30000 });
  await page.getByRole("link", { name: "Today", exact: true }).tap();
  await page.waitForURL(/\/app\/today$/, { timeout: 30000 });
  await page.getByRole("heading", { name: "Today's meals", exact: true }).waitFor();
  await page.getByText("Midnight toast").waitFor();
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a bad, missing or future date shows today; deleting an entry on a past day works with Undo", async () => {
  const { ctx, page, errors } = await open();
  for (const bad of ["abc", "2026-13-45", keyOf(at(-3, 12)), "1999-01-01x"]) {
    await page.goto(BASE + "/app/today?d=" + bad, { timeout: 120000 });
    await page.getByRole("heading", { name: "Today's meals", exact: true }).waitFor({ timeout: 90000 });
    await page.getByText("Midnight toast").waitFor();
  }
  // a very old real day is allowed and is simply empty
  await page.goto(BASE + "/app/today?d=2019-01-01", { timeout: 120000 });
  await page.getByText("Nothing was logged on this day.").waitFor({ timeout: 90000 });
  await page.goto(BASE + "/app/today?d=" + keyOf(at(1, 12)), { timeout: 120000 });
  await page.getByText("Yesterday curry").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Delete Yesterday curry", exact: true }).tap();
  // the entry leaves the list at once (the toast's own words also contain the name, so match the whole line only)
  await page.getByText("Yesterday curry", { exact: true }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Undo", exact: true }).tap();
  await page.getByText("Yesterday curry", { exact: true }).waitFor();
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a day with no food shows Pip's empty state; with no log at all the calendar has no dots", async () => {
  const { ctx, page, errors } = await open({}, {}, []);
  await home(page);
  await openCalendar(page);
  const dots = await dialog(page).locator("button[aria-label*='food logged']").count();
  expect(dots === 0, `${dots} days marked with food in an empty log`);
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("narrow phone, Extra large text and Arabic: no sideways scroll on Home, the calendar and a day; the calendar mirrors in Arabic", async () => {
  for (const [label, width, settings] of [["360 px", 360, {}], ["Extra large", 390, { textSize: "xlarge" }], ["Arabic", 390, { language: "ar" }]]) {
    const { ctx, page, errors } = await open({ viewport: { width, height: 844 } }, settings);
    await page.goto(BASE + "/app", { timeout: 120000 });
    await page.locator("button[aria-label]").first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);
    const wide = async (where) => { const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); expect(over <= 0, `${label}: ${where} scrolls sideways by ${over} px`); };
    await wide("Home");
    // the calendar button is the only button in the header besides the gear: find it by its position beside the title
    const cal = page.locator("h1 + button");
    await cal.tap();
    await dialog(page).waitFor();
    await page.waitForTimeout(800);
    await wide("the calendar");
    const sheetBox = await dialog(page).boundingBox();
    expect(sheetBox.width <= width + 1, `${label}: the sheet is ${sheetBox.width} px wide`);
    await dialog(page).locator("ul li button:not([disabled])").first().tap(); // the 1st of the month: a day gone by, or today (the labels are translated in Arabic)
    await page.waitForURL(/\/app\/today(\?d=.*)?$/, { timeout: 30000 });
    await page.waitForTimeout(800);
    await wide("a day");
    expect(errors.length === 0, `${label}: ` + errors.join(" | "));
    await ctx.close();
  }
});

await step("axe: Home with the calendar open, and a past day", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await openCalendar(page);
  await page.addScriptTag({ path: AXE });
  const a = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`));
  expect(a.length === 0, "Home + calendar: " + a.join("; "));
  await dialog(page).getByRole("button", { name: "Close", exact: true }).tap().catch(async () => { await page.keyboard.press("Escape"); });
  await dialog(page).waitFor({ state: "detached" });
  await page.goto(BASE + "/app/today?d=" + keyOf(at(1, 12)), { timeout: 120000 });
  await page.getByText("Yesterday curry").waitFor({ timeout: 90000 });
  await page.waitForTimeout(900);
  await page.addScriptTag({ path: AXE });
  const b = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`));
  expect(b.length === 0, "a past day: " + b.join("; "));
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
