// The Stats screen behind Home's numbers (founder 2026-11-20, 12:54, from another app's Progress screen; app/app/stats/, lib/mm/stats.ts): Home's calories
// card and its week card open Calories, its protein, carbs and fat card opens Macros (?tab=macros). Three tabs (a real tab list: arrow keys, the address
// follows without a new history entry, a reload keeps the tab, Back goes to Home): Calories (this week and the last 4 weeks, against the target), Macros (the
// week's split by weight as a ring, then protein, carbs and fat), Nutrients (sugar, saturates, salt and fibre: today and a day this week). Every figure is
// added up from the food log on this phone (CLAUDE.md rule 1: a day with nothing logged is never a 0, a food without a figure is left out and said so, today
// is never in an average); nothing is sent. Where logging is paid for this person and nothing is logged, one card says the stats come once they log.
// The clock is fixed at Friday 20 November 2026, 12:00 in London, and this log is seeded (expected figures worked out by hand below):
//   Tue 10 Nov  1,500 kcal (70 g protein, 160 g carbs, 50 g fat)
//   Mon 16 Nov  1,000 kcal (50/100/40; sugar 10 g, saturates 8 g, salt 1 g, fibre 5 g) + 800 kcal (40/90/30, no label figures)
//   Tue 17 Nov  2,200 kcal (100/250/80; sugar 20 g, saturates 20 g, salt 2.5 g, fibre 8 g)
//   Wed 18 Nov    600 kcal (a restaurant that publishes calories only)
//   Fri 20 Nov    500 kcal today (30/60/15; sugar 12 g, salt 0.5 g)
// Run with the server's switches: BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 node e2e/stats.mjs        (ONLY="(c)" runs one step)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
/** Adding a meal is paid in this build (NEXT_PUBLIC_PRO=1, not the In-App Purchase build): a free person with nothing logged gets the one empty card. */
const LOG_PAID = process.env.NEXT_PUBLIC_PRO === "1";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return; try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0], (String(e.stack).match(/stats\.mjs:\d+/g) ?? []).join(" < ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const NOW = new Date("2026-11-20T12:00:00Z"); // 12:00 in London (GMT in November)
const at = (iso) => new Date(iso).toISOString();
const entry = (id, when, calories, extra = {}, chain = { chainId: "bowl-and-co", chainName: "Bowl & Co." }) => ({ id, loggedAt: at(when), ...chain, name: `Seed food ${id}`, nutrients: { calories, ...extra }, source: "item" });
const LOG = [
  entry("e10", "2026-11-10T12:00:00Z", 1500, { protein: 70, carbs: 160, fat: 50 }),
  entry("a16", "2026-11-16T11:00:00Z", 1000, { protein: 50, carbs: 100, fat: 40, sugar: 10, saturatedFat: 8, salt: 1, fiber: 5 }),
  entry("b16", "2026-11-16T18:00:00Z", 800, { protein: 40, carbs: 90, fat: 30 }),
  entry("c17", "2026-11-17T13:00:00Z", 2200, { protein: 100, carbs: 250, fat: 80, sugar: 20, saturatedFat: 20, salt: 2.5, fiber: 8 }),
  entry("f18", "2026-11-18T13:00:00Z", 600, {}, { chainId: "puccinos", chainName: "Puccino's" }),
  entry("d20", "2026-11-20T09:00:00Z", 500, { protein: 30, carbs: 60, fat: 15, sugar: 12, salt: 0.5 }),
];
const SETTINGS = { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, dailyCarbs: 250, dailyFat: 70, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };

async function open({ viewport = { width: 402, height: 874 }, settings = {}, log = LOG } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block", locale: "en-GB", timezoneId: "Europe/London" });
  await ctx.clock.setFixedTime(NOW);
  await ctx.addInitScript(([s, l]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.log", l);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"] } }));
    localStorage.setItem("mm.v1.homePages", JSON.stringify({ v: 1, data: { seen: true, slid: true, hintDays: 3, lastHintDay: "2026-11-20" } }));
  }, [JSON.stringify({ v: 1, data: { ...SETTINGS, ...settings } }), JSON.stringify({ v: 1, data: log })]);
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() ?? "" }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, requests, errors };
}
const heading = (page) => page.getByRole("heading", { level: 1, name: /^Stats/ });
const tab = (page, name) => page.getByRole("tablist", { name: "Stats" }).getByRole("tab", { name, exact: true });
const spoken = (page, label) => page.locator(`ol.sr-only[aria-label="${label}"] li`).allInnerTexts();
/** A card's figure and caption: the section named `title` in the tab panel. */
const card = (page, title) => page.getByRole("tabpanel").getByRole("region", { name: title, exact: true });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
async function axe(page, where) {
  await settle(page);
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, `${where}: ` + v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
}
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll("main button, main a[href]")].flatMap((el) => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none" || el.closest("dialog:not([open]), [inert]")) return [];
  return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
}));

await step("(a) Home's numbers open Stats: 'See calorie stats' on Calories, 'See protein, carbs and fat stats' on Macros; Back goes to Home", async () => {
  const { ctx, page, errors } = await open();
  await page.goto(BASE + "/app");
  await page.getByRole("link", { name: "See calorie stats" }).first().click({ timeout: 120000 });
  await page.waitForURL((u) => u.pathname === "/app/stats");
  await heading(page).waitFor({ timeout: 60000 });
  expect((await tab(page, "Calories").getAttribute("aria-selected")) === "true", "Calories isn't the tab shown");
  // its name is "Back" after coming from Home ("Back to home" when the page was opened by its address)
  await page.getByRole("link", { name: /^Back/ }).first().click();
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/");
  await page.getByRole("link", { name: "See protein, carbs and fat stats" }).first().click({ timeout: 60000 });
  await page.waitForURL((u) => u.pathname === "/app/stats" && u.search === "?tab=macros");
  await heading(page).waitFor();
  expect((await tab(page, "Macros").getAttribute("aria-selected")) === "true", "Macros isn't the tab shown");
  expect(errors.length === 0, "page errors: " + errors.join(" | "));
  await ctx.close();
});

await step("(b) Calories: this week 1,533 kcal a day from the 3 days logged (not today), each day said, the target 2,000; the last 4 weeks 1,525 kcal a day with a bar a week", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/stats");
  await heading(page).waitFor({ timeout: 120000 });
  const week = card(page, "This week");
  await week.getByText("1,533", { exact: true }).waitFor();
  await week.getByText("kcal a day").first().waitFor();
  await week.getByText("From the 3 days you logged, not counting today.").waitFor();
  const days = await spoken(page, "Calories each day");
  expect(days.length === 5, "the days said (Monday to today): " + JSON.stringify(days));
  const want = [/^Monday.*: 1,800 kcal$/, /^Tuesday.*: 2,200 kcal$/, /^Wednesday.*: 600 kcal$/, /^Thursday.*: nothing logged$/, /^Friday.*\(today, so far\): 500 kcal$/];
  want.forEach((re, i) => expect(re.test(days[i] ?? ""), `day ${i + 1}: ${days[i]}`));
  await page.getByText("Your target: 2,000 kcal").first().waitFor();
  const month = card(page, "Last 4 weeks");
  await month.getByText("1,525", { exact: true }).waitFor();
  const weeks = await spoken(page, "Calories a day, each week");
  expect(weeks.length === 4 && /nothing logged$/.test(weeks[0]) && /nothing logged$/.test(weeks[1]) && /: 1,500 kcal a day$/.test(weeks[2]) && /: 1,533 kcal a day$/.test(weeks[3]), "the weeks: " + JSON.stringify(weeks));
  // never a 0 for a day with nothing logged, and no "over"/"good"/"bad"
  const text = (await page.locator("main").innerText()).toLowerCase();
  for (const word of [" over ", "good", "bad", "healthy", "too much"]) expect(!text.includes(word), `the word "${word.trim()}"`);
  await ctx.close();
});

await step("(c) the tabs: arrow keys move between them, the address follows without a new history entry (Back still goes to Home), a reload keeps the tab", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app");
  await page.getByRole("link", { name: "See calorie stats" }).first().click({ timeout: 120000 });
  await heading(page).waitFor({ timeout: 60000 });
  await tab(page, "Calories").focus();
  await page.keyboard.press("ArrowRight");
  expect((await tab(page, "Macros").getAttribute("aria-selected")) === "true", "ArrowRight didn't choose Macros");
  expect(new URL(page.url()).search === "?tab=macros", "the address: " + page.url());
  await tab(page, "Nutrients").click();
  expect(new URL(page.url()).search === "?tab=nutrients", "the address: " + page.url());
  expect((await page.getByRole("tabpanel").getAttribute("aria-labelledby")) === "stats-tab-nutrients", "the panel isn't named by its tab");
  await page.reload();
  await heading(page).waitFor({ timeout: 60000 });
  expect((await tab(page, "Nutrients").getAttribute("aria-selected")) === "true", "a reload lost the tab");
  await page.goBack();
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/", { timeout: 20000 });
  await ctx.close();
});

await step("(d) Macros: the week's split by weight (25% protein, 56% carbs, 19% fat from the foods that give all three), protein 95 g / carbs 220 g / fat 75 g a day against 120, 250 and 70; Wednesday's calories-only food is 'not published', never 0, and the gap is said", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/stats?tab=macros");
  await heading(page).waitFor({ timeout: 120000 });
  const split = page.getByRole("region", { name: "This week", exact: true });
  const text = (await split.innerText()).replace(/\s+/g, " ");
  expect(/25% protein/.test(text) && /Protein 220g ?25%/.test(text) && /Carbs 500g ?56%/.test(text) && /Fat 165g ?19%/.test(text), "the split: " + text);
  await page.getByText("Share by weight.").waitFor();
  for (const [name, avg, target] of [["Protein", "95g", "120g"], ["Carbs", "220g", "250g"], ["Fat", "75g", "70g"]]) {
    const c = card(page, name);
    const words = (await c.innerText()).replace(/\s+/g, " ");
    expect(words.includes(avg) && words.includes(`/ ${target} a day`), `${name}: ${words}`);
  }
  const protein = await spoken(page, "Protein each day");
  expect(/^Monday.*: 90g$/.test(protein[0]) && /^Tuesday.*: 100g$/.test(protein[1]) && /^Wednesday.*: not published$/.test(protein[2]) && /^Thursday.*: nothing logged$/.test(protein[3]) && /\(today, so far\): 30g$/.test(protein[4]), "protein each day: " + JSON.stringify(protein));
  await page.getByText("Some foods don't give protein, carbs or fat, so these count only the foods that do.").waitFor();
  await page.getByText("Averages are over the days you logged, not counting today.").first().waitFor();
  await ctx.close();
});

await step("(e) Nutrients: sugar 12 g today and 15 g a day this week ('2 of 4 foods'), salt 0.5 g and 1.75 g; fibre and saturates today 'not published'; never a reference intake or a colour word", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/stats?tab=nutrients");
  await heading(page).waitFor({ timeout: 120000 });
  const sugar = (await card(page, "Sugar").innerText()).replace(/\s+/g, " ");
  expect(/12g Today/.test(sugar) || /Today 12g/.test(sugar) || (sugar.includes("12g") && sugar.includes("Today")), "sugar today: " + sugar);
  expect(sugar.includes("15g") && sugar.includes("a day this week") && sugar.includes("2 of 4 foods"), "sugar this week: " + sugar);
  const salt = (await card(page, "Salt").innerText()).replace(/\s+/g, " ");
  expect(salt.includes("0.5g") && salt.includes("1.75g"), "salt: " + salt);
  const fibre = (await card(page, "Fibre").innerText()).replace(/\s+/g, " ");
  expect(fibre.includes("not published") && fibre.includes("7g"), "fibre (6.5 g, shown to the whole gram): " + fibre);
  const sat = (await card(page, "Saturates").innerText()).replace(/\s+/g, " ");
  expect(sat.includes("not published") && sat.includes("14g"), "saturates: " + sat);
  await page.getByText("Only foods whose label or menu gives these figures are counted.").waitFor();
  const all = (await page.locator("main").innerText()).toLowerCase();
  for (const word of ["reference intake", "% ri", "high", "low", "red", "amber", "green", "healthy"]) expect(!all.includes(word), `the word "${word}"`);
  await ctx.close();
});

await step(`(f) a free person with nothing logged: ${LOG_PAID ? "one card with the week's empty bars, 'Your stats show here once you log your meals.' and See Premium" : "the tabs with nothing logged (logging is free in this build)"}; someone with nothing logged before today: 'Nothing logged before today.', never 0`, async () => {
  const { ctx, page } = await open({ settings: { devProOverride: false }, log: [] });
  await page.goto(BASE + "/app/stats");
  await heading(page).waitFor({ timeout: 120000 });
  if (LOG_PAID) {
    await page.getByText("Your stats show here once you log your meals.").waitFor();
    await page.getByRole("button", { name: "See Premium" }).waitFor();
    expect((await page.getByRole("tablist").count()) === 0, "the tabs for a free person with nothing logged");
    const days = await spoken(page, "Calories each day");
    expect(days.length === 5 && days.every((d) => /nothing logged$/.test(d)), "the empty week: " + JSON.stringify(days));
  } else {
    await tab(page, "Calories").waitFor();
  }
  await ctx.close();
  const two = await open({ log: [LOG[5]] });
  await two.page.goto(BASE + "/app/stats");
  await heading(two.page).waitFor({ timeout: 120000 });
  await card(two.page, "This week").getByText("Nothing logged before today.").waitFor();
  expect(!/\b0 kcal a day\b/.test(await two.page.locator("main").innerText()), "a 0 average with nothing logged before today");
  await two.ctx.close();
});

await step("(g) nothing is sent: no request carries the log, a figure or a food's name; only the settings and the log were read", async () => {
  const { ctx, page, requests } = await open();
  await page.goto(BASE + "/app/stats");
  await heading(page).waitFor({ timeout: 120000 });
  for (const name of ["Macros", "Nutrients", "Calories"]) await tab(page, name).click();
  await page.waitForTimeout(800);
  const sent = requests.filter((r) => /Seed food|mm\.v1\.log|loggedAt|"calories"/.test(r.body) || /Seed%20food|loggedAt/.test(r.url));
  expect(sent.length === 0, "sent: " + sent.slice(0, 2).map((r) => r.url).join(" | "));
  expect(!requests.some((r) => r.method === "POST"), "a POST from the Stats screen");
  await ctx.close();
});

for (const [label, viewport, big] of [["402x874", { width: 402, height: 874 }, false], ["375x667", { width: 375, height: 667 }, false], ["200% text at 360x780", { width: 360, height: 780 }, true]]) {
  await step(`(h) ${label}: every tab with no sideways scroll, 44 px tabs and links${big ? "" : " and no axe violations"}`, async () => {
    const { ctx, page } = await open({ viewport });
    await page.goto(BASE + "/app/stats");
    await heading(page).waitFor({ timeout: 120000 });
    if (big) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const name of ["Calories", "Macros", "Nutrients"]) {
      await tab(page, name).click();
      await page.waitForTimeout(500);
      expect((await overflow(page)) <= 0, `${name}: scrolls sideways by ${await overflow(page)}`);
      const small = await smallTargets(page);
      expect(small.length === 0, `${name}: under 44 px: ${small.slice(0, 3).join(", ")}`);
      if (!big) await axe(page, `${label} ${name}`);
    }
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
