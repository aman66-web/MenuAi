// Home's numbers as pages with a dot each (founder 2026-11-19: "3 dots here showing that they can also swipe right to see different things like stats";
// the 20-person meeting's conclusion): two pages since 20 November, Today and Calories and protein this week (the sugar, salt and fibre page is no longer
// shown). The dots are 44 pt buttons; a first-visit hint and one demonstration slide (never while Pip's tips are due, never with reduced motion); stacked with
// no dots on a narrow screen; only what was logged is shown. The top right (founder 2026-11-20, "Take that in the top right"): the Shopping list pill and the
// cog stay on the date's line at 320, 360, 375, 390 and 430 px with the widest date and a two- or three-digit count. Home's first visit after the welcome
// screens (the onboarding redesign meeting, 20 November 2026): the arrival toast and the one-time Start here card.
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

async function open({ width = 390, pro = true, homePages = { seen: false, slid: true, hintDays: 0, lastHintDay: "" }, log = [], coach = { armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"] }, reducedMotion = "no-preference", clock, shopping = [], settings = {}, path = "/app" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", reducedMotion });
  if (clock) await ctx.clock.setFixedTime(clock);
  const items = { "mm.v1.settings": env({ goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, ...(pro ? { devProOverride: true } : {}), ...settings }), "mm.v1.coach": env(coach), "mm.v1.tour": env(2), "mm.v1.log": env(log), "mm.v1.shopping": env(shopping) };
  if (homePages) items["mm.v1.homePages"] = env(homePages);
  await ctx.addInitScript((list) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of list) localStorage.setItem(k, v);
  }, Object.entries(items));
  const page = await ctx.newPage();
  await page.goto(BASE + path);
  if (path === "/app") await page.getByRole("group", { name: "Today, 1 of 2" }).waitFor({ timeout: 120000 });
  else await page.locator('main a[href="/app/settings"]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
/** `n` things on the shopping list, still to pick up. */
const things = (n) => Array.from({ length: n }, (_, i) => ({ gtin: "", custom: true, retailer: "own", name: `Thing ${i + 1}`, brand: "", size: "", qty: 1, addedAt: new Date().toISOString() }));
/** What the welcome screens leave for Home (lib/mm/homePages.ts withArrival), written `daysAgo` days ago. */
const arrival = (note, daysAgo = 0) => ({ seen: false, slid: true, hintDays: 0, lastHintDay: "", arrival: { at: new Date(Date.now() - daysAgo * 864e5).toISOString(), card: true, ...note } });
/** A real dish and a recipe from the bundled data (Greggs' own published figures; a recipe book breakfast). */
const DISH = { chainId: "greggs", itemId: "bacon-sausage-breakfast-baguette" };
const RECIPE = "scrambled-eggs-on-toast";
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

await step("two 44 pt dots under the cards; each one shows its page and is marked as the one shown; Home opens on Today again after a reload; no sugar, salt and fibre page", async () => {
  const { ctx, page } = await open({ log: WEEK });
  const names = ["Today", "Calories and protein this week"];
  expect(await page.getByRole("group", { name: "Choose what to show" }).getByRole("button").count() === 2, "two dots");
  expect(await page.getByRole("group", { name: /^Sugar, salt and fibre/ }).count() === 0 && (await page.getByText("Today: sugar, salt and fibre").count()) === 0, "the sugar, salt and fibre page is not shown");
  // the dots sit close, 14 pt apart; each button is its own share of the row (no overlap): 44 pt tall and wide enough, and a tap on the middle of either dot
  // lands on that dot's button
  const marks = [];
  for (const n of names) {
    const b = await dot(page, n).boundingBox();
    expect(b.height >= 44 && b.width >= 24, `${n}'s target: ${JSON.stringify(b)}`);
    const m = await dot(page, n).locator("span").boundingBox();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null, [m.x + m.width / 2, m.y + m.height / 2]);
    expect(hit === n, `a tap on ${n}'s dot opens ${n}: ${hit}`);
    marks.push(m);
  }
  const gap = marks[1].x - (marks[0].x + marks[0].width);
  expect(Math.abs(gap - 14) <= 1, `a 14 pt gap between the dots: ${gap}`);
  const cards = await page.getByRole("group", { name: "Today, 1 of 2" }).boundingBox();
  const dots = await page.getByRole("group", { name: "Choose what to show" }).boundingBox();
  expect(dots.y >= cards.y + cards.height - 2 && dots.y < cards.y + cards.height + 12, `the dots sit right under the cards: ${JSON.stringify([cards, dots])}`);
  expect(await dot(page, "Today").getAttribute("aria-current") === "true", "Today is marked first");
  for (const [n, group] of [[names[1], "Calories and protein this week, 2 of 2"], [names[0], "Today, 1 of 2"]]) {
    await dot(page, n).click();
    await page.waitForFunction((g) => { const el = [...document.querySelectorAll('[role="group"]')].find((x) => x.getAttribute("aria-label") === g); const r = el?.getBoundingClientRect(); return r && r.x > -2 && r.x < 40; }, group, { timeout: 5000 });
    expect(await dot(page, n).getAttribute("aria-current") === "true", `${n} marked as shown`);
  }
  await dot(page, names[1]).click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByRole("group", { name: "Today, 1 of 2" }).waitFor();
  await page.waitForTimeout(500);
  expect(await inView(page, "Today, 1 of 2"), "Today again after a reload");
  await ctx.close();
});

await step("the top right: the Shopping list pill and the cog stay on the date's line at 320, 360, 375, 390 and 430 px, with the widest date and a two- or three-digit count; below 375 px the pill shows the basket and the count, still named 'Shopping list'", async () => {
  // "May 20" is the widest English date on Home's title (measured 20 November 2026); 188 things is a three-digit count (the list holds at most 200)
  for (const width of [320, 360, 375, 390, 430]) {
    for (const n of [12, 188]) {
      for (const path of ["/app", "/app/groceries"]) {
        const w = await open({ width, shopping: things(n), clock: new Date(2026, 4, 20, 10, 0), path });
        const r = await w.page.evaluate(() => {
          const b = (el) => { const x = el.getBoundingClientRect(); return { x: x.x, y: x.y, w: x.width, h: x.height }; };
          const list = document.querySelector('main a[href="/app/groceries/list"]');
          const word = [...list.querySelectorAll("span")].find((x) => x.textContent === "Shopping list");
          return { h1: b(document.querySelector("main h1")), list: b(list), cog: b(document.querySelector('main a[href="/app/settings"]')), word: getComputedStyle(word).position !== "absolute", overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        const where = `${width} px, ${n} things, ${path}: ${JSON.stringify(r)}`;
        expect(Math.abs(r.list.y - r.cog.y) < 4 && r.list.y < r.h1.y + r.h1.h - 10, `one row with the title: ${where}`);
        expect(r.list.x >= r.h1.x + r.h1.w && r.cog.x + r.cog.w <= width, `nothing overlaps or runs off the screen: ${where}`);
        expect(r.word === width >= 375, `the word "Shopping list" shows from 375 px: ${where}`);
        expect(r.overflow <= 0, `no sideways scroll: ${where}`);
        const name = await w.page.locator('main a[href="/app/groceries/list"]').evaluate((el) => el.textContent.replace(/\s+/g, " ").trim());
        expect(name.startsWith("Shopping list") && name.includes(`${n} things to pick up`), `its spoken name: ${name}`);
        await w.ctx.close();
      }
    }
  }
});

await step("Today's dial: what's left in its middle, what was eaten and the target under it, no percentage, sentence-case labels; over the target it says so in words, and a macro past its target says how many grams over", async () => {
  // the colour meeting (19 November 2026): "1,440 left" in the middle, "560 eaten" and "of 2,000 kcal" under it; no percentage (it stopped at 100% and hid going over)
  const { ctx, page } = await open({ log: WEEK });
  const text = (await page.getByRole("group", { name: "Today, 1 of 2" }).innerText()).replace(/\s+/g, " ");
  expect(text.includes("1,440 left") && text.includes("560 eaten") && text.includes("of 2,000 kcal"), `the dial: ${text}`);
  expect(!/\d+%/.test(text), `a percentage: ${text}`);
  expect(text.includes("Calories") && text.includes("Protein") && !/CALORIES|PROTEIN/.test(text), `labels in sentence case: ${text}`);
  const spoken = await page.getByRole("progressbar", { name: "Calories used today" }).getAttribute("aria-valuetext");
  expect(spoken === "560 of 2,000 kcal, 1,440 left", `the dial's spoken value: ${spoken}`);
  await ctx.close();
  const over = await open({ log: [...WEEK, food("t3", 0, 9, "Feast", { calories: 1600, protein: 120, carbs: 10, fat: 10 })] });
  const t2 = (await over.page.getByRole("group", { name: "Today, 1 of 2" }).innerText()).replace(/\s+/g, " ");
  expect(t2.includes("160 over") && t2.includes("2,160 eaten") && !/\d+%/.test(t2), `over the target: ${t2}`);
  expect(/\b\d+ g over\b/.test(t2), `protein past its target, said in grams: ${t2}`);
  await over.ctx.close();
});

await step("a seeded week: each day's calories, a dash for a day with nothing, averages over the days logged before today, the protein note; a screen reader gets each day", async () => {
  const { ctx, page } = await open({ log: WEEK });
  await dot(page, "Calories and protein this week").click();
  const week = page.getByRole("group", { name: "Calories and protein this week, 2 of 2" });
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

await step("the first-visit hint takes you to the week and goes for good; it is gone on a sixth day even if the week was never looked at", async () => {
  const { ctx, page } = await open({ homePages: null });
  const hint = page.getByRole("button", { name: "Slide the cards sideways, or tap here, to see your week" });
  await hint.waitFor();
  expect((await hint.boundingBox()).height >= 44, "a 44 pt button");
  await hint.click();
  await page.waitForFunction(() => { const el = [...document.querySelectorAll('[role="group"]')].find((x) => x.getAttribute("aria-label") === "Calories and protein this week, 2 of 2"); const r = el?.getBoundingClientRect(); return r && r.x > -2 && r.x < 40; }, null, { timeout: 5000 });
  expect((await storeOf(page))?.seen === true, "seen is kept");
  expect(!(await hint.isVisible().catch(() => false)), "gone at once");
  await page.reload();
  await page.getByRole("group", { name: "Today, 1 of 2" }).waitFor();
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
  expect(await inView(still.page, "Calories and protein this week, 2 of 2"), "a dot jumps straight there with reduced motion");
  await still.ctx.close();
});

// Home and the week follow the real gate (needsPaywall("log")): on this NEXT_PUBLIC_PRO=1 build logging is paid, so someone without Pro sees the log card and
// the "once you log" sentence. On a build where logging is free (the 1.1 In-App Purchase one) neither shows; e2e/iap.mjs checks that side.
await step("someone who can't log yet (logging paid on this build) sees the log card, the empty frame and one plain sentence: no bars, no figures, no target line", async () => {
  const { ctx, page } = await open({ pro: false });
  expect(await page.getByText("Log your meals to see what's left today.").count() === 1, "the log card on Home (run this script on a NEXT_PUBLIC_PRO=1 build, where logging is paid)");
  await dot(page, "Calories and protein this week").click();
  const week = await page.getByRole("group", { name: "Calories and protein this week, 2 of 2" }).innerText();
  expect(week.includes("Each day's calories show here once you log your meals.") && !week.includes("Your target") && !/\d{3}/.test(week), week);
  await ctx.close();
});

await step("a narrow phone: the two pages one under another with their titles, no dots or hint; no sideways scroll at 320, 360 and 390", async () => {
  const narrow = await open({ width: 320, log: WEEK, homePages: null });
  expect(await narrow.page.getByRole("group", { name: "Choose what to show" }).count() === 0, "no dots");
  expect(!(await narrow.page.getByRole("button", { name: /Slide the cards sideways/ }).isVisible().catch(() => false)), "no hint");
  const [a, b] = await Promise.all(["Today, 1 of 2", "Calories and protein this week, 2 of 2"].map((n) => narrow.page.getByRole("group", { name: n }).boundingBox()));
  expect(b.y > a.y + a.height - 2 && Math.abs(a.x - b.x) < 2, `stacked: ${JSON.stringify([a, b])}`);
  expect(await overflow(narrow.page) <= 0, "no sideways scroll at 320");
  await narrow.ctx.close();
  for (const width of [360, 390]) {
    const w = await open({ width, log: WEEK });
    expect(await overflow(w.page) <= 0, `no sideways scroll at ${width}`);
    await w.ctx.close();
  }
});

await step("first visit after the welcome screens: the ink toast says what is now true; the Start here card sits right under the numbers and their dots, above the cooking tools, and the targets card waits; the toast is said once, and the card is still there after a reload", async () => {
  const { ctx, page } = await open({ homePages: arrival({ toast: "signedIn", firstRecipeId: RECIPE, firstDish: DISH }), settings: { hasSetTargets: false } });
  const toast = page.getByRole("status").filter({ hasText: "You're signed in. Your goal and daily numbers are saved." });
  await toast.waitFor({ timeout: 10000 });
  const card = page.getByRole("region", { name: "Start here" });
  await card.waitFor();
  const numbers = await page.locator('[data-coach="home-numbers"]').boundingBox();
  const start = await card.boundingBox();
  const tools = await page.getByRole("heading", { name: "Cooking" }).evaluate((h) => h.nextElementSibling.getBoundingClientRect().top);
  expect(start.y >= numbers.y + numbers.height && start.y < numbers.y + numbers.height + 24 && start.y + start.height <= tools + 1, `under the numbers, above the cooking tools: ${JSON.stringify([numbers, start, tools])}`);
  await card.getByRole("button", { name: /^Had the .* today\? Add it$/ }).waitFor({ timeout: 30000 });
  const text = (await card.innerText()).replace(/\s+/g, " ");
  expect(text.includes("Had something today? Add it and see what's left.") && text.includes("Add what you ate") && text.includes("Your first recipe: Scrambled eggs on toast") && text.includes("Open") && text.includes("Done with this"), text);
  for (const b of await card.getByRole("button").all()) expect((await b.boundingBox()).height >= 44, `44 pt: ${await b.textContent()}`);
  expect((await card.getByRole("link", { name: /^Open/ }).boundingBox()).height >= 44, "Open is 44 pt");
  expect(await page.getByRole("link", { name: "Set your targets to see what's left today" }).count() === 0, "the targets card waits while Start here shows");
  // the toast is said once and forgotten; the card stays, visit after visit, until it is done with (the 30-person audit, 20 November 2026: lib/mm/homePages.ts)
  const note = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.homePages")).data.arrival);
  expect(note && note.toast === undefined && note.card === true, "the toast is forgotten as soon as Home has said it, and the card is kept: " + JSON.stringify(note));
  await page.reload();
  await page.getByRole("group", { name: "Today, 1 of 2" }).waitFor();
  await page.waitForTimeout(1200);
  expect(await toast.count() === 0, "the toast is said one time only");
  expect(await page.getByRole("region", { name: "Start here" }).count() === 1, "the Start here card is still there after a reload");
  expect(await page.getByRole("link", { name: "Set your targets to see what's left today" }).count() === 0, "the targets card still waits while Start here shows");
  await ctx.close();
});

await step("Start here: the step 3 dish is added only on a tap, its row turns into 'Added to {meal} · Undo' (Undo takes it out again); Add what you ate opens the + sheet; the recipe opens; Done with this closes the card", async () => {
  const { ctx, page } = await open({ homePages: arrival({ toast: "signedIn", firstRecipeId: RECIPE, firstDish: DISH }) });
  const card = page.getByRole("region", { name: "Start here" });
  const add = card.getByRole("button", { name: /^Had the Bacon & Sausage Breakfast Baguette today\? Add it$/ });
  await add.waitFor({ timeout: 30000 });
  const logged = () => page.evaluate(() => (JSON.parse(localStorage.getItem("mm.v1.log") || "null")?.data ?? []).map((e) => e.name).join());
  expect(await logged() === "", "nothing added before a tap");
  await add.click();
  await card.getByText(/^Added to (Breakfast|Lunch|Dinner)$/).waitFor();
  expect(await logged() === "Bacon & Sausage Breakfast Baguette", "the dish is in today's log");
  expect(await page.getByRole("status").filter({ hasText: "Added “Bacon & Sausage Breakfast Baguette”" }).count() === 1, "the one toast says so");
  await card.getByRole("button", { name: /^Undo/ }).click();
  await add.waitFor();
  expect(await logged() === "", "Undo takes it out again");
  await card.getByRole("button", { name: "Add what you ate" }).click();
  await page.getByRole("dialog", { name: /^Add to (Breakfast|Lunch|Dinner)$/ }).waitFor({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "Done with this" }).click();
  await card.waitFor({ state: "detached" });
  await ctx.close();
  const r = await open({ homePages: arrival({ toast: "signedIn", firstRecipeId: RECIPE }) });
  await r.page.getByRole("region", { name: "Start here" }).getByRole("link", { name: /^Open/ }).click();
  await r.page.waitForURL((u) => u.pathname.startsWith("/app/recipes/view") && u.searchParams.get("id") === RECIPE, { timeout: 30000 });
  await r.ctx.close();
});

await step("Start here leaves out what no longer suits (the dish for a vegetarian, the recipe for an egg allergy); a Settings rerun gets 'Your changes are saved.' and no card; a note left a week ago is dropped", async () => {
  const veg = await open({ homePages: arrival({ toast: "signedInBack", firstRecipeId: RECIPE, firstDish: DISH }), settings: { preferences: { vegetarianOnly: true, noPork: false, noBeef: false, avoidAllergens: ["eggs"] } } });
  await veg.page.getByRole("status").filter({ hasText: "Signed in. Your saved settings are back." }).waitFor({ timeout: 10000 });
  const card = veg.page.getByRole("region", { name: "Start here" });
  await card.waitFor();
  await veg.page.waitForTimeout(3000); // the menu has loaded by now
  const text = await card.innerText();
  expect(!/Had the /.test(text) && !text.includes("Your first recipe"), `nothing that doesn't suit: ${text}`);
  await veg.ctx.close();
  const rerun = await open({ homePages: arrival({ toast: "saved", card: false }) });
  await rerun.page.getByRole("status").filter({ hasText: "Your changes are saved." }).waitFor({ timeout: 10000 });
  expect(await rerun.page.getByRole("region", { name: "Start here" }).count() === 0, "no card after a Settings rerun");
  await rerun.ctx.close();
  const old = await open({ homePages: arrival({ toast: "signedIn", firstRecipeId: RECIPE }, 8) });
  await old.page.waitForTimeout(1500);
  expect(await old.page.getByRole("region", { name: "Start here" }).count() === 0 && await old.page.getByRole("status").filter({ hasText: "You're signed in." }).count() === 0, "dropped after 7 days");
  await old.ctx.close();
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
