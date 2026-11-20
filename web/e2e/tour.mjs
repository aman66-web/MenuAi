// The first launch and the replay (lib/mm/tour.ts; the onboarding redesign meeting of 20 November 2026, approved by the founder: the tab tour, Pip's separate
// hello screen, "Let's make it yours" and "You're all set!" are gone). A plain first launch of /app goes to the welcome cover before anything is drawn; links
// open as they are; someone set up, someone who said Not now, or anyone with something of their own stored never meets it again by itself; TOUR_VERSION 2
// shows the new screens once to a phone that only saw the old tour and has still neither set up nor stored anything. Settings › Help › "Show me what Numbite
// can do" (and the old ?tour=1 address, and Home's setup card) replays the three feature screens (Eat out, recipes, your week) with "{n} of 3", Close, Next
// and Done, and writes nothing. Clear everything brings the cover back with its status line. The cover's wall moves (no Pause button; still with Reduce Motion); Pip settles; nothing
// moves for reduced motion. The eleven steps themselves are e2e/showcase.mjs.
// Run with the same NEXT_PUBLIC_ switches the server had:
//   BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 node e2e/tour.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
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
let passed = 0, failed = 0;
async function step(name, fn) { if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return; try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const fresh = (extra = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...extra });
const env = (data) => JSON.stringify({ v: 1, data });
/** Seeds localStorage once for this browser (not again after the page changes it, e.g. Clear everything). */
async function seed(ctx, items) {
  await ctx.addInitScript((list) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of list) localStorage.setItem(k, v);
  }, Object.entries(items));
}
const ONBOARDED = env({ goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, shops: ["sainsburys"] });
const tourOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.tour") || "null")?.data ?? null);
const stored = (page) => page.evaluate(() => Object.fromEntries(["mm.v1.settings", "mm.v1.tour", "mm.v1.welcomeProgress", "mm.v1.homePages", "mm.v1.coach", "mm.v1.log", "mm.v1.saved", "mm.v1.savedRecipes", "mm.v1.mealPlan"].map((k) => [k, localStorage.getItem(k)])));
const card = (page) => page.getByRole("heading", { level: 2, name: "Make Numbite fit you" });
const homeHeading = (page) => page.getByRole("heading", { level: 1, name: /^Home,/ });
const getStarted = (page) => page.getByRole("button", { name: "Get started", exact: true });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
async function axe(page, where) {
  await settle(page);
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, `${where}: ` + v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
}
/** The replay's three screens: their headlines and the window each shows. */
const REPLAY = [
  { h1: /^Know before you order/, window: "A look at Eat out" },
  { h1: /^Recipes( from | ?,|$)/, window: "A look at Recipes" },
  { h1: /^Your week, planned/, window: "A look at Meal plan, on Home" },
];
const replayAt = async (p, i) => {
  await p.getByRole("heading", { level: 1, name: REPLAY[i].h1 }).waitFor({ timeout: 30000 });
  await p.locator("p.app-numbers").filter({ hasText: new RegExp(`^${i + 1} of 3$`) }).waitFor();
  await p.getByRole("region", { name: REPLAY[i].window }).waitFor();
};

// One visitor's requests, kept for the last step.
const main = await fresh();
await main.addInitScript(() => {
  // was Home's heading ever on screen before the welcome screens? (kept across the redirect)
  requestAnimationFrame(function check() {
    if (/\/app\/welcome/.test(location.pathname)) return;
    if ([...document.querySelectorAll("h1")].some((h) => /\bHome\b/.test(h.textContent || "") && h.getBoundingClientRect().height > 0)) sessionStorage.setItem("homeSeen", "1");
    requestAnimationFrame(check);
  });
});
const page = await main.newPage();
const requests = [];
page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));

await step("1. a plain first visit to /app ends on the welcome cover without Home ever showing: no Skip, no bar and no counter; Get started opens 'Step 1 of 11' (no 'Hi, I'm Pip!' screen, no tour, no text size screen)", async () => {
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await getStarted(page).waitFor({ timeout: 120000 });
  expect(!(await page.evaluate(() => sessionStorage.getItem("homeSeen"))), "Home's heading showed before the welcome screens");
  expect((await page.getByRole("button", { name: "Skip", exact: true }).count()) === 0, "the cover has a Skip");
  expect((await page.getByText(/^Step \d+ of \d+$/).count()) === 0, "the cover has a counter");
  expect((await page.locator("main span.h-1.flex-1").count()) === 0, "the cover has a progress bar");
  await page.getByRole("heading", { level: 1, name: "Eat out, shop and cook. Know the numbers first." }).waitFor();
  await getStarted(page).click();
  await page.getByRole("heading", { level: 1, name: /^What's your goal\?/ }).waitFor();
  await page.locator("p.app-numbers").filter({ hasText: /^Step 1 of 11$/ }).waitFor();
  for (const gone of ["Hi, I'm Pip!", "Let's make it yours", "Easy to read", "You're all set!"]) expect((await page.getByRole("heading", { name: gone }).count()) === 0, `'${gone}' is back`);
  expect((await page.getByRole("button", { name: /^(Show me around|Skip tour|Look around first)$/ }).count()) === 0, "an old tour button is back");
  expect((await page.evaluate(() => document.documentElement.style.fontSize)) === "", "html font-size: " + (await page.evaluate(() => document.documentElement.style.fontSize)));
  // leaving at step 1 leaves nothing to carry on from: a plain launch comes back to the cover with Get started
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await getStarted(page).waitFor();
});

await step("2. links open with no redirect and no welcome screens, and no request carries a list or friend code; a later plain /app opens the welcome", async () => {
  const ctx = await fresh(); const p = await ctx.newPage();
  const seen = [];
  p.on("request", (r) => seen.push(r.url() + " " + (r.postData() ?? "")));
  const LIST = "1AbCdEfGhIjK", FRIEND = "ABCDEFGH";
  const opens = [
    ["/app/chain?id=kfc", async () => p.getByRole("heading", { level: 1, name: /KFC/ }).waitFor({ timeout: 60000 })],
    ["/app/item?chain=bowl-and-co&item=chicken-bowl", async () => p.getByRole("heading", { name: "Chicken bowl" }).waitFor({ timeout: 60000 })],
    ["/l#" + LIST, async () => p.locator("h1").first().waitFor()],
    ["/app/groceries/list/shared#" + LIST, async () => p.getByRole("heading", { level: 1, name: "Shared shopping list" }).waitFor({ timeout: 60000 })],
    ["/f#" + FRIEND, async () => p.locator("h1").first().waitFor()],
    ["/app?ref=anna", async () => homeHeading(p).waitFor({ timeout: 60000 })],
  ];
  for (const [path, ready] of opens) {
    await p.goto(BASE + path);
    await ready();
    await p.waitForTimeout(500);
    expect(!/\/app\/welcome/.test(p.url()), `${path} was sent to the welcome screens: ${p.url()}`);
  }
  expect(!seen.some((u) => u.includes(LIST) || u.includes(FRIEND)), "a code reached a request: " + seen.filter((u) => u.includes(LIST) || u.includes(FRIEND)).slice(0, 2).join(" | "));
  expect((await tourOf(p)) === null, "the links marked the welcome screens seen");
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await ctx.close();
});

await step("3. no redirect for someone set up, someone who said Not now, or someone with a log, a shopping list or water stored", async () => {
  const cases = {
    "set up": { "mm.v1.settings": ONBOARDED },
    "Not now": { "mm.v1.settings": env({ goal: "maintain", dailyCalories: 2000, dismissedTargetsCard: true, preferences: {} }) },
    "a log": { "mm.v1.log": env([{ id: "l1", loggedAt: new Date().toISOString(), chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl", nutrients: { calories: 655, protein: 50, carbs: 67, fat: 20.5 }, source: "item" }]) },
    "a shopping list": { "mm.v1.shopping": env([{ gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: "2026-11-01T10:00:00.000Z", custom: true }]) },
    "water": { "mm.v1.water": env([{ id: "w1", ml: 250, at: new Date().toISOString() }]) },
  };
  for (const [label, items] of Object.entries(cases)) {
    const ctx = await fresh();
    await seed(ctx, items);
    const p = await ctx.newPage();
    await p.goto(BASE + "/app");
    await homeHeading(p).waitFor({ timeout: 60000 });
    await p.waitForTimeout(500);
    expect(!/welcome/.test(p.url()), `${label}: sent to the welcome screens`);
    await ctx.close();
  }
});

await step("4. TOUR_VERSION 2: a phone that only saw the old tour (mm.v1.tour 1), never set up and has nothing stored meets the new screens once; one marked 2 opens Home with the setup card", async () => {
  const old = await fresh();
  await seed(old, { "mm.v1.tour": env(1) });
  const p = await old.newPage();
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await getStarted(p).waitFor({ timeout: 60000 });
  await old.close();
  const now = await fresh();
  await seed(now, { "mm.v1.tour": env(2) });
  const q = await now.newPage();
  await q.goto(BASE + "/app");
  await homeHeading(q).waitFor({ timeout: 60000 });
  await card(q).waitFor();
  expect(!/welcome/.test(q.url()), "sent to the welcome screens with mm.v1.tour 2");
  await now.close();
});

await step("5. Settings › Help › 'Show me what Numbite can do' (it replaced 'Show me around again'): '1 of 3' to '3 of 3' with Close, Next and Done back to Settings; the three windows; nothing is saved", async () => {
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED, "mm.v1.tour": env(2) });
  const p = await ctx.newPage();
  await p.goto(BASE + "/app/settings");
  await p.getByRole("heading", { level: 1, name: "Settings", exact: true }).waitFor({ timeout: 60000 });
  const before = await stored(p);
  expect((await p.getByRole("link", { name: "Show me around again" }).count()) === 0, "'Show me around again' is still in Settings");
  const again = p.getByRole("link", { name: "Show me what Numbite can do" });
  expect((await again.getAttribute("href")) === "/app/welcome?showcase=1", "the Help row goes to " + (await again.getAttribute("href")));
  expect((await again.boundingBox()).height >= 44, "the Help row is under 44 px");
  await again.click();
  await replayAt(p, 0);
  // no counter of the steps, no Skip, no Back: Close at the top left
  expect((await p.getByText(/^Step \d+ of \d+$/).count()) === 0, "the replay shows 'Step n of N'");
  expect((await p.getByRole("button", { name: "Skip", exact: true }).count()) === 0, "the replay has a Skip");
  expect((await p.getByRole("button", { name: "Skip setup and make my account" }).count()) === 0, "the replay has step 3's link");
  await p.getByRole("button", { name: "Close", exact: true }).click();
  await p.waitForURL(/\/app\/settings$/);
  await again.click();
  await replayAt(p, 0);
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await replayAt(p, 1);
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await replayAt(p, 2);
  expect((await p.getByRole("button", { name: "Next", exact: true }).count()) === 0, "the last screen says Done, not Next");
  // nobody with a plan this week: no line about one
  expect((await p.getByText("You already have a plan for this week. Open Meal plan on Home.").count()) === 0, "the plan line with no plan");
  await p.getByRole("button", { name: "Done", exact: true }).click();
  await p.waitForURL(/\/app\/settings$/);
  const after = await stored(p);
  expect(JSON.stringify(before) === JSON.stringify(after), "the replay changed what is stored: " + JSON.stringify(Object.keys(after).filter((k) => before[k] !== after[k])));
  await ctx.close();
});

await step("6. the old ?tour=1 address opens the same replay; with a Meal plan saved this week its third screen says so; Home's setup card's 'See what Numbite can do' opens it and Close returns to Home", async () => {
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED, "mm.v1.tour": env(2), "mm.v1.mealPlan": env({ shops: ["sainsburys"], ids: Array.from({ length: 7 }, () => ["scrambled-eggs-on-toast", "chicken-curry", "chicken-curry"]), leaveOut: [], budget: null, start: monday }) });
  const p = await ctx.newPage();
  await p.goto(BASE + "/app/welcome?tour=1");
  await replayAt(p, 0);
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await replayAt(p, 1);
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await replayAt(p, 2);
  await p.getByText("You already have a plan for this week. Open Meal plan on Home.").waitFor();
  await ctx.close();
  // from Home's setup card (someone who arrived by a link and has seen the welcome screens)
  const two = await fresh();
  await seed(two, { "mm.v1.tour": env(2) });
  const q = await two.newPage();
  await q.goto(BASE + "/app");
  await card(q).waitFor({ timeout: 60000 });
  expect((await q.getByRole("link", { name: "Show me around" }).count()) === 0, "the setup card still says 'Show me around'");
  await q.getByRole("link", { name: "See what Numbite can do" }).click();
  await replayAt(q, 0);
  await q.getByRole("button", { name: "Close", exact: true }).click();
  await q.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/");
  await card(q).waitFor();
  await two.close();
});

await step("7. Settings › Clear everything: the cover with 'Done: everything on this device was cleared.' and Get started (nothing to carry on from); the next plain /app opens the welcome", async () => {
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED, "mm.v1.tour": env(2) });
  const p = await ctx.newPage();
  // a note of a step reached, left by a part-way run in this same visit (so the open app also holds it in memory): Settings › Set up your plan again, steps 1
  // and 2, then Back to the cover and Back to Settings, all without a reload
  await p.goto(BASE + "/app/settings");
  await p.getByRole("link", { name: /^Set up your plan again/ }).click();
  await getStarted(p).waitFor({ timeout: 60000 });
  await getStarted(p).click();
  await p.getByRole("heading", { level: 1, name: /^What's your goal\?/ }).waitFor();
  await p.getByRole("button", { name: "Continue", exact: true }).click();
  await p.getByRole("heading", { level: 1, name: /^Anything you avoid\?/ }).waitFor();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("mm.v1.welcomeProgress") || "null")?.data?.step === "avoid", null, { timeout: 5000 });
  await p.getByRole("button", { name: "Back to the previous step" }).click();
  await p.getByRole("button", { name: "Back to the previous step" }).click();
  await getStarted(p).waitFor();
  await p.getByRole("button", { name: "Back to the previous step" }).click();
  await p.waitForURL(/\/app\/settings$/);
  await p.getByRole("button", { name: "Clear data on this device" }).click();
  await p.getByRole("button", { name: "Clear everything" }).click();
  await p.waitForURL(/\/app\/welcome\?cleared=1$/);
  await p.getByRole("status").filter({ hasText: "Done: everything on this device was cleared." }).waitFor();
  await getStarted(p).waitFor();
  expect((await p.getByRole("button", { name: /^Carry on from step/ }).count()) === 0, "Carry on after Clear everything");
  expect(!(await p.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") || "null")?.data?.hasCompletedOnboarding)), "still set up");
  expect(((await tourOf(p)) ?? 0) === 0, "the welcome screens are still marked seen");
  expect((await p.evaluate(() => localStorage.getItem("mm.v1.welcomeProgress"))) === null, "the progress note is still there");
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await ctx.close();
});

await step("8. reduced motion: nothing is animating on the cover, step 1 or the replay", async () => {
  const ctx = await fresh({ reducedMotion: "reduce" }); const p = await ctx.newPage();
  const running = () => p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName ?? a.transitionProperty ?? "animation"));
  await p.goto(BASE + "/app/welcome");
  await getStarted(p).waitFor({ timeout: 60000 });
  await p.waitForTimeout(500);
  expect((await running()).length === 0, "the cover animates: " + (await running()).join(", "));
  await getStarted(p).click();
  await p.getByRole("heading", { level: 1, name: /^What's your goal\?/ }).waitFor();
  await p.waitForTimeout(300);
  expect((await running()).length === 0, "step 1 animates: " + (await running()).join(", "));
  await p.goto(BASE + "/app/welcome?showcase=1");
  await replayAt(p, 0);
  await p.waitForTimeout(500);
  expect((await running()).length === 0, "the replay animates: " + (await running()).join(", "));
  await ctx.close();
});

await step("9. 200% text at 360x780 and 375x667: no sideways scroll and every button and link at least 44 px on the cover and the replay's three screens", async () => {
  for (const viewport of [{ width: 360, height: 780 }, { width: 375, height: 667 }]) {
    const ctx = await fresh({ viewport });
    await seed(ctx, { "mm.v1.settings": ONBOARDED, "mm.v1.tour": env(2) });
    const p = await ctx.newPage();
    const where = `${viewport.width}x${viewport.height}`;
    const check = async (screen) => {
      await p.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await p.waitForTimeout(600);
      await settle(p);
      expect((await overflow(p)) <= 0, `${where} ${screen}: scrolls sideways`);
      const small = await p.evaluate(() => [...document.querySelectorAll("button, a[href]")].flatMap((el) => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none" || el.closest("dialog:not([open]), [inert]")) return [];
        return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
      }));
      expect(small.length === 0, `${where} ${screen}: under 44 px: ${small.slice(0, 3).join(", ")}`);
    };
    await p.goto(BASE + "/app/welcome");
    await getStarted(p).waitFor({ timeout: 60000 });
    await check("the cover");
    await p.goto(BASE + "/app/welcome?showcase=1");
    for (let i = 0; i < 3; i++) {
      await replayAt(p, i);
      await check(`replay ${i + 1}`);
      await p.getByRole("button", { name: i < 2 ? "Next" : "Done", exact: true }).click();
    }
    await ctx.close();
  }
});

await step("10. axe: no violations on the cover (and its cleared and deleted lines) and the replay's three screens", async () => {
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED, "mm.v1.tour": env(2) });
  const p = await ctx.newPage();
  for (const path of ["/app/welcome", "/app/welcome?cleared=1", "/app/welcome?deleted=1"]) {
    await p.goto(BASE + path);
    await getStarted(p).waitFor({ timeout: 60000 });
    await p.waitForTimeout(800);
    await axe(p, path);
  }
  await p.getByRole("status").filter({ hasText: "Your account has been deleted. What was on this phone is still here." }).waitFor();
  await p.goto(BASE + "/app/welcome?showcase=1");
  for (let i = 0; i < 3; i++) {
    await replayAt(p, i);
    await p.waitForTimeout(1200);
    await axe(p, `replay ${i + 1}`);
    if (i < 2) await p.getByRole("button", { name: "Next", exact: true }).click();
  }
  await ctx.close();
});

await step("11. no request's address or body carries mm.v1.tour, the welcome progress or their state", async () => {
  const hits = requests.filter((r) => /mm\.v1\.(tour|welcomeProgress)/.test(r.url) || /mm\.v1\.(tour|welcomeProgress)|"tour"\s*:|"welcomeProgress"/.test(r.body));
  expect(hits.length === 0, "sent: " + hits.slice(0, 2).map((r) => r.url).join(" | "));
});

await step("12. Pip and the cover settle: 6 s in, only the logo wall's marquee and Pip's blink run on the cover and only the blink on step 1 (his jump plays once); with reduced motion nothing runs on either", async () => {
  // what is still moving: running animations by name (a CSS transition by the property it moves)
  const running = (p) => p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName ?? a.transitionProperty ?? "animation"));
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const ctx = await fresh({ reducedMotion }); const p = await ctx.newPage();
    await p.goto(BASE + "/app/welcome");
    await getStarted(p).waitFor({ timeout: 60000 });
    await p.waitForTimeout(6000);
    const cover = await running(p);
    if (reducedMotion === "reduce") expect(cover.length === 0, "reduced motion: the cover still moves: " + cover.join(", "));
    else {
      expect(cover.every((n) => n === "marquee" || n === "pip-blink"), "the cover at 6 s: " + [...new Set(cover)].join(", "));
      expect(cover.includes("marquee"), "the logo wall stopped moving on the cover: " + cover.join(", "));
    }
    await getStarted(p).click();
    await p.getByRole("heading", { level: 1, name: /^What's your goal\?/ }).waitFor();
    await p.waitForTimeout(6000);
    const goal = await running(p);
    if (reducedMotion === "reduce") expect(goal.length === 0, "reduced motion: step 1 still moves: " + goal.join(", "));
    else expect(goal.every((n) => n === "pip-blink"), "step 1 at 6 s: " + [...new Set(goal)].join(", "));
    await ctx.close();
  }
});

// No Pause button on the cover's logo wall (founder 2026-11-20: "There's literally no point of a pause button"): the wall moves, and stands still with Reduce Motion.
await step("13. the cover's logo wall moves with no Pause button; with reduced motion it stands still", async () => {
  const wallState = (p) => p.evaluate(() => [...document.querySelectorAll(".marquee")].map((m) => getComputedStyle(m).animationName));
  const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(BASE + "/app/welcome");
  await getStarted(p).waitFor({ timeout: 60000 });
  expect((await p.getByRole("button", { name: /moving logos/ }).count()) === 0, "a Pause button is still on the wall");
  expect((await wallState(p)).every((s) => s !== "none"), "the wall doesn't move");
  await ctx.close();
  const still = await fresh({ reducedMotion: "reduce" }); const q = await still.newPage();
  await q.goto(BASE + "/app/welcome");
  await getStarted(q).waitFor({ timeout: 60000 });
  expect((await wallState(q)).every((s) => s === "none"), "the wall moves with Reduce Motion on");
  await still.close();
});

await main.close();
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
