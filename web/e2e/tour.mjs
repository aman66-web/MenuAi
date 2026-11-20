// The welcome tour (founder 2026-11-17; lib/mm/tour.ts, app/app/welcome/Tour.tsx): a plain first launch of /app goes to the welcome screens before anything is
// drawn; Pip's arrival, one stop per tab (Pip's one line over a copy of the tab bar, and a line naming the bar's buttons), then "Let's make it yours" (Set up my
// daily numbers / Look around first). Links open as they are; Settings › Help replays the stops with "What you can do" on each tab and writes nothing; Clear
// everything brings the welcome back. The first run has no "What you can do" (the onboarding meeting, 19 November).
// Pip and the cover settle after a few seconds (step 15): only the logo wall's marquee and Pip's blink keep going; nothing moves for reduced motion.
// Run against a production build, with the same NEXT_PUBLIC_ switches the build had (they decide the Make it at home and friends rows):
//   BASE=http://localhost:3101 node e2e/tour.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const PHOTO = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1" && (process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1");
const FRIENDS = process.env.NEXT_PUBLIC_COMMUNITY_FRIENDS !== "0";
/** Premium is sold in this build (lib/mm/config.ts GATING_ENABLED), so the tour calls the meal plan part of it. */
const GATED = process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1";
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
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
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
const ONBOARDED = env({ goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} });
const TOURED = env(1);
const settingsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") || "null")?.data ?? null);
const tourOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.tour") || "null")?.data ?? null);
const card = (page) => page.getByRole("heading", { level: 2, name: "Make Numbite fit you" });
const homeHeading = (page) => page.getByRole("heading", { level: 1, name: /^Home,/ });
const h1Focused = (page, text) => page.waitForFunction((t) => document.activeElement?.tagName === "H1" && document.activeElement.textContent.trim() === t, text, { timeout: 5000 });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
async function axe(page, where) {
  await settle(page);
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, `${where}: ` + v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
}

const TABS = ["Home", "Recipes", "Groceries", "Eat out"]; // Community is off (2026-11-18); the order since 2026-11-19
const IDS = ["home", "recipes", "groceries", "eatOut"];
/** A first-run stop's headline as a screen reader hears it: the tab's name, then "stop n of 4" (sr-only; the replay's headline is the tab's name alone). */
const stopName = (i) => `${TABS[i]}, stop ${i + 1} of ${TABS.length}`;
/** The same headline's accessible name: Chrome puts a space before the comma, because the screen-reader-only part is a block of its own ("Home , stop 1 of 4"). */
const stopRe = (i) => new RegExp(`^${TABS[i]} ?, stop ${i + 1} of ${TABS.length}$`);
// Pip's line on each stop (no "!", at most two sentences: the onboarding meeting, 19 November)
const SAYS = {
  home: "This is Home: what you've eaten today, and what's left of your calories and protein.",
  recipes: "Cooking at home? Recipes made from real supermarket products, with the cost of each serving.",
  groceries: "Going shopping? Pick your supermarket and look up its products, with prices and labels where the shop publishes them.",
  eatOut: "Going out to eat? Look the place up first and see each dish's calories before you order.",
};
const BAR_LINE = `This is a picture of the buttons at the bottom of every screen: ${TABS.slice(0, -1).join(", ")} and ${TABS[TABS.length - 1]}.`;
const ARRIVAL = "I'll show you the calories and protein from restaurants' own menus and from food labels, before you order or buy. Let me show you around.";
const ROWS = {
  home: [
    "Tap + next to Breakfast, Lunch, Dinner or Snacks to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers.",
    ...(PHOTO ? ["Scan your food: take a photo of a meal for its calories and macros, or for a recipe to make it at home. It's part of Premium."] : []),
    // "part of Premium" only where Premium is sold (the test build turns Pro on)
    GATED ? "Under your numbers: let Meal plan make your week, or cook with what you already have. Meal plan is part of Premium." : "Under your numbers: let Meal plan make your week, or cook with what you already have.",
    "Top right: your shopping list, and the gear for Settings: your goal, diet, and this tour again.",
    ...(PHOTO ? [] : ["Further down Home, add the water you drink and set your own reminders."]),
  ],
  eatOut: [
    "Search for any restaurant or dish by name.",
    "Near me shows the places to eat around you on a map.",
    "Open a restaurant to see the numbers for each dish. Best for you lists orders that fit your goal.",
    "Settings, at the top right, has your goal, diet, and this tour again.",
  ],
  groceries: [
    "Tap a supermarket to see its products and prices.",
    "Scan a barcode to look up a product you're holding.",
    "Nutrition leaderboards rank the supermarket products by protein, fibre and more.",
    "Your shopping list: tick things off as you shop.",
  ],
  recipes: [
    "Tap Breakfast, Lunch, Dinner or Snacks to see recipes for that meal, or More for every filter.",
    "Search for a recipe by name, or choose your supermarket to see its prices.",
    "Tap the heart on a recipe to keep it in My recipes.",
    "Open a recipe to add everything it needs to your shopping list in one tap.",
  ],
  community: [
    "Food blogs are short, easy reads about eating out, shopping and cooking.",
    ...(FRIENDS ? ["Sign in to add friends with a code, then send each other shopping lists."] : []),
  ],
};
/** The welcome cover, Pip's arrival and the first-run stops have no progress bar and no "Step n of n" (the questions' "Step n of 7" is the only counter). */
async function noCounter(page, where) {
  const segments = await page.locator("main div[aria-hidden='true'] > span.h-1.flex-1").count();
  expect(segments === 0, `${where}: a progress bar of ${segments} segments`);
  expect((await page.getByText(/^Step \d+ of \d+$/).count()) === 0, `${where}: a 'Step n of n' counter`);
}
const stopId = (page) => page.locator("[data-tour-stop]").getAttribute("data-tour-stop");
const barWords = (page) => page.locator("section[data-tour-stop] ul[aria-hidden='true'] span.line-clamp-2").allInnerTexts();
// the lit tab is in the lime token (colour meeting, 19 November 2026: text-sun, was text-[#d6efa0])
const litTab = (page) => page.locator("section[data-tour-stop] ul[aria-hidden='true']").evaluate((ul) => [...ul.children].findIndex((li) => /(^|\s)text-sun(\s|$)/.test(li.firstElementChild?.className ?? "")));
const rows = (page) => page.locator("section[data-tour-stop] div.glass ul > li").allInnerTexts();
const says = (page) => page.locator("section[data-tour-stop] p.speech-tour").innerText();

// The real bar's words, read from Home for someone already set up.
let realBar = [];
{
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await homeHeading(page).waitFor();
  realBar = (await page.getByRole("navigation", { name: "Main" }).locator("span.line-clamp-2").allInnerTexts()).map((s) => s.trim());
  await ctx.close();
}

// One visitor goes through it all (steps 1-5), with every request kept for step 14.
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

await step("1. a plain first visit to /app ends on the welcome screens without Home ever showing; no Skip on the cover; Look around first goes to Home with the setup card, marks the tour seen, and a reload stays on Home", async () => {
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await page.getByRole("button", { name: "Get started" }).waitFor();
  expect(!(await page.evaluate(() => sessionStorage.getItem("homeSeen"))), "Home's heading showed before the welcome screens");
  // founder 2026-11-17: no Skip on the welcome screen itself; a separate visitor goes Get started > Show me around > Skip tour > Look around first
  const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await p.getByRole("button", { name: "Get started" }).waitFor();
  expect((await p.getByRole("button", { name: "Skip", exact: true }).count()) === 0, "the welcome screen has no Skip");
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("button", { name: "Show me around" }).click();
  await p.getByRole("button", { name: "Skip tour" }).click();
  await p.getByRole("button", { name: "Look around first" }).click();
  await p.waitForURL(/\/app\/?$/);
  await card(p).waitFor();
  expect((await tourOf(p)) === 1, "mm.v1.tour after Look around first: " + (await tourOf(p)));
  await p.reload();
  await homeHeading(p).waitFor();
  expect(!/welcome/.test(p.url()), "sent to the welcome screens again: " + p.url());
  await ctx.close();
});

await step("2. Get started → 'Hi, I'm Pip!' (its headline has the focus, Pip's line says where the numbers come from, and Pip is a named picture) → Show me around → the first stop: no text size screen (founder 2026-11-19, \"Just keep standard pls\")", async () => {
  await noCounter(page, "the welcome cover");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("heading", { level: 1, name: "Hi, I'm Pip!" }).waitFor();
  await h1Focused(page, "Hi, I'm Pip!");
  await noCounter(page, "Pip's arrival");
  await page.getByText(ARRIVAL).waitFor();
  const pip = page.getByRole("img", { name: "Pip, a small round green character with a sprout on top.", exact: true });
  expect((await pip.count()) === 1, "the arrival's Pip is not a named picture");
  expect((await pip.evaluate((el) => el.tagName.toLowerCase())) === "svg", "the named picture is not Pip's drawing");
  await page.getByRole("button", { name: "Show me around" }).click();
  await page.getByRole("heading", { level: 1, name: stopRe(0) }).waitFor();
  expect((await page.getByRole("heading", { name: "Easy to read" }).count()) === 0, "the text size screen is back");
  expect((await page.evaluate(() => document.documentElement.style.fontSize)) === "", "html font-size: " + (await page.evaluate(() => document.documentElement.style.fontSize)));
});

await step("3. the stops: the tab's name with 'stop n of 4' as the focused headline, the stop's id, Pip's line, the real bar's words with the stop's tab lit, the line naming the bar's buttons, and no 'What you can do' (the replay keeps it, step 9)", async () => {
  for (let i = 0; i < TABS.length; i++) {
    await page.getByRole("heading", { level: 1, name: stopRe(i) }).waitFor();
    await h1Focused(page, stopName(i));
    await noCounter(page, `stop ${i + 1}`);
    expect((await stopId(page)) === IDS[i], `stop ${i + 1}: data-tour-stop ${await stopId(page)}`);
    expect((await says(page)).trim() === SAYS[IDS[i]], `stop ${i + 1}: Pip says ${JSON.stringify(await says(page))}`);
    const words = (await barWords(page)).map((s) => s.trim());
    expect(JSON.stringify(words) === JSON.stringify(realBar), `stop ${i + 1}: the bar's words ${JSON.stringify(words)} against the real bar's ${JSON.stringify(realBar)}`);
    expect((await litTab(page)) === i, `stop ${i + 1}: lit tab ${await litTab(page)}`);
    await page.getByText(BAR_LINE, { exact: true }).waitFor();
    expect((await page.getByRole("heading", { level: 2, name: "What you can do" }).count()) === 0, `stop ${i + 1}: 'What you can do' on the first run`);
    expect((await rows(page)).length === 0, `stop ${i + 1}: rows on the first run`);
    await page.waitForTimeout(150);
    if (i < TABS.length - 1) await page.getByRole("button", { name: "Continue" }).click();
  }
});

await step("4. the last stop leads to 'Let's make it yours', and the tour is marked seen as soon as it shows", async () => {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("mm.v1.tour") || "null")?.data === 1, null, { timeout: 3000 });
  await page.getByText("Rather look around first? You can set this up later from Home, and see the tour again in Settings.").waitFor();
  // Pip names the number of questions the counter will count ("Step n of 7")
  await page.getByText("That's the tour. Next, 7 short steps. I'll work out your daily calories and protein, and put the dishes that fit you first.").waitFor();
  expect((await page.getByRole("button", { name: /Skip/ }).count()) === 0, "no Skip on the choice");
});

await step("5. 'Set up my daily numbers' → 'Step 1 of 7'; Back returns to 'Let's make it yours'; the questions end on 'You're all set!' (no counter) and Go to Home, set up, with the card gone", async () => {
  await page.getByRole("button", { name: "Set up my daily numbers" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
  await page.getByText("Step 1 of 7").waitFor();
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await page.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  await page.getByRole("button", { name: "Set up my daily numbers" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
  // goal, foods to avoid, the questions about the person, the targets, the shops
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("heading", { name: "You're all set!" }).waitFor();
  expect((await page.getByText(/^Step \d+ of \d+$/).count()) === 0, "a counter on the last screen");
  await page.getByRole("button", { name: "Go to Home" }).click();
  await page.waitForURL(/\/app\/?$/);
  await homeHeading(page).waitFor();
  expect((await settingsOf(page))?.hasCompletedOnboarding === true, "set up");
  await page.waitForTimeout(500);
  expect((await card(page).count()) === 0, "the setup card is still there");
});

await step("6. 'Skip tour' on stop 2 jumps to 'Let's make it yours'; 'Look around first' goes to Home with the setup card still there", async () => {
  const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("button", { name: "Show me around" }).click();
  await p.getByRole("heading", { level: 1, name: stopRe(0) }).waitFor();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("heading", { level: 1, name: stopRe(1) }).waitFor(); // Recipes: stop 2 since the tabs were reordered (2026-11-19)
  await p.getByRole("button", { name: "Skip tour" }).click();
  await p.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  // the same line whether or not the tour was walked (only Pip's first sentence, "That's the tour.", is left out)
  await p.getByText("Rather look around first? You can set this up later from Home, and see the tour again in Settings.").waitFor();
  await p.getByRole("button", { name: "Look around first" }).click();
  await p.waitForURL(/\/app\/?$/);
  await card(p).waitFor();
  expect((await tourOf(p)) === 1, "tour seen");
  expect((await settingsOf(p))?.hasCompletedOnboarding !== true, "Look around first doesn't count as set up");
  await ctx.close();
});

await step("7. links open with no redirect and no tour, and no request carries a list or friend code; a later plain /app opens the welcome", async () => {
  const ctx = await fresh(); const p = await ctx.newPage();
  const seen = [];
  p.on("request", (r) => seen.push(r.url() + " " + (r.postData() ?? "")));
  const LIST = "1AbCdEfGhIjK", FRIEND = "ABCDEFGH";
  const opens = [
    ["/app/chain?id=kfc", async () => p.getByRole("heading", { level: 1, name: /KFC/ }).waitFor({ timeout: 15000 })],
    ["/app/item?chain=bowl-and-co&item=chicken-bowl", async () => p.getByRole("heading", { name: "Chicken bowl" }).waitFor({ timeout: 15000 })],
    ["/l#" + LIST, async () => p.locator("h1").first().waitFor()],
    ["/app/groceries/list/shared#" + LIST, async () => p.getByRole("heading", { level: 1, name: "Shared shopping list" }).waitFor()],
    ["/f#" + FRIEND, async () => p.locator("h1").first().waitFor()],
    ["/app?ref=anna", async () => homeHeading(p).waitFor()],
  ];
  for (const [path, ready] of opens) {
    await p.goto(BASE + path);
    await ready();
    await p.waitForTimeout(500);
    expect(!/\/app\/welcome/.test(p.url()), `${path} was sent to the welcome screens: ${p.url()}`);
  }
  expect(!seen.some((u) => u.includes(LIST) || u.includes(FRIEND)), "a code reached a request: " + seen.filter((u) => u.includes(LIST) || u.includes(FRIEND)).slice(0, 2).join(" | "));
  expect((await tourOf(p)) === null, "the links marked the tour seen");
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await ctx.close();
});

await step("8. no redirect for someone set up, someone who said Not now, or someone with a log, a shopping list or water stored", async () => {
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
    await homeHeading(p).waitFor();
    await p.waitForTimeout(500);
    expect(!/welcome/.test(p.url()), `${label}: sent to the welcome screens`);
    await ctx.close();
  }
});

await step("9. Settings › Help › 'Show me around again': 'Step 1 of 4', Close and Done return to Settings, nothing is saved; the setup card's 'Show me around' returns to Home", async () => {
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED });
  const p = await ctx.newPage();
  await p.goto(BASE + "/app/settings");
  await p.getByRole("heading", { level: 1, name: "Settings", exact: true }).waitFor();
  const before = await p.evaluate(() => [localStorage.getItem("mm.v1.settings"), localStorage.getItem("mm.v1.tour")]);
  const again = p.getByRole("link", { name: "Show me around again" });
  expect((await again.getAttribute("href")) === "/app/welcome?tour=1", "the Help row goes to " + (await again.getAttribute("href")));
  expect((await again.boundingBox()).height >= 44, "the Help row is under 44 px");
  await again.click();
  await p.getByText(`Step 1 of ${TABS.length}`).waitFor();
  await p.getByRole("heading", { level: 1, name: "Home", exact: true }).waitFor();
  await p.getByRole("button", { name: "Close", exact: true }).click();
  await p.waitForURL(/\/app\/settings$/);
  await again.click();
  await p.getByText(`Step 1 of ${TABS.length}`).waitFor();
  // the replay keeps "What you can do" on each tab, with the rows this build shows
  for (let i = 0; i < TABS.length; i++) {
    if (i > 0) {
      await p.getByRole("button", { name: "Continue" }).click();
      await p.getByRole("heading", { level: 1, name: TABS[i], exact: true }).waitFor();
      await p.getByText(`Step ${i + 1} of ${TABS.length}`).waitFor();
    }
    await p.getByRole("heading", { level: 2, name: "What you can do" }).waitFor();
    const got = (await rows(p)).map((s) => s.trim());
    expect(JSON.stringify(got) === JSON.stringify(ROWS[IDS[i]]), `replay stop ${i + 1}: rows ${JSON.stringify(got)}`);
  }
  expect((await p.getByRole("button", { name: "Continue" }).count()) === 0, "the last stop says Done, not Continue");
  await p.getByRole("button", { name: "Done", exact: true }).click();
  await p.waitForURL(/\/app\/settings$/);
  const after = await p.evaluate(() => [localStorage.getItem("mm.v1.settings"), localStorage.getItem("mm.v1.tour")]);
  expect(JSON.stringify(before) === JSON.stringify(after), "the replay changed what is stored: " + JSON.stringify(after));
  await ctx.close();
  // from the setup card on Home (someone who arrived by a link and has seen no tour)
  const two = await fresh();
  await seed(two, { "mm.v1.tour": TOURED });
  const q = await two.newPage();
  await q.goto(BASE + "/app");
  await card(q).waitFor();
  await q.getByRole("link", { name: "Show me around" }).click();
  await q.getByText(`Step 1 of ${TABS.length}`).waitFor();
  await q.getByRole("button", { name: "Close", exact: true }).click();
  await q.waitForURL(/\/app\/?$/);
  await card(q).waitFor();
  await two.close();
});

await step("10. Settings › Clear everything brings the welcome back on the next plain /app", async () => {
  const ctx = await fresh();
  await seed(ctx, { "mm.v1.settings": ONBOARDED, "mm.v1.tour": TOURED });
  const p = await ctx.newPage();
  await p.goto(BASE + "/app");
  await homeHeading(p).waitFor();
  await p.goto(BASE + "/app/settings");
  await p.getByRole("button", { name: "Clear data on this device" }).click();
  await p.getByRole("button", { name: "Clear everything" }).click();
  await p.waitForFunction(() => !JSON.parse(localStorage.getItem("mm.v1.settings") || "null")?.data?.hasCompletedOnboarding, null, { timeout: 5000 });
  expect(((await tourOf(p)) ?? 0) === 0, "the tour is still marked seen");
  await p.goto(BASE + "/app");
  await p.waitForURL(/\/app\/welcome$/);
  await ctx.close();
});

await step("11. reduced motion: nothing is animating on Pip's arrival or the stops", async () => {
  const ctx = await fresh({ reducedMotion: "reduce" }); const p = await ctx.newPage();
  await p.goto(BASE + "/app/welcome");
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("heading", { level: 1, name: "Hi, I'm Pip!" }).waitFor();
  await p.waitForTimeout(300);
  const running = () => p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName ?? a.transitionProperty ?? "animation"));
  expect((await running()).length === 0, "the arrival animates: " + (await running()).join(", "));
  await p.getByRole("button", { name: "Show me around" }).click(); // straight to the first stop: no text size screen since 2026-11-19
  for (let i = 0; i < TABS.length; i++) {
    await p.getByRole("heading", { level: 1, name: stopRe(i) }).waitFor();
    await p.waitForTimeout(200);
    expect((await running()).length === 0, `${TABS[i]} animates: ` + (await running()).join(", "));
    if (i < TABS.length - 1) await p.getByRole("button", { name: "Continue" }).click();
  }
  await ctx.close();
});

await step("12. Extra large text at 360×780 and 375×667: no sideways scroll, every button and link at least 44 px, and a stop's last line clear of the sticky button", async () => {
  for (const viewport of [{ width: 360, height: 780 }, { width: 375, height: 667 }]) {
    const ctx = await fresh({ viewport });
    await seed(ctx, { "mm.v1.settings": env({ textSize: "xlarge" }) });
    const p = await ctx.newPage();
    const where = `${viewport.width}×${viewport.height}`;
    const check = async (screen) => {
      await settle(p);
      expect((await overflow(p)) <= 0, `${where} ${screen}: scrolls sideways`);
      const small = await p.evaluate(() => [...document.querySelectorAll("button, a[href]")].flatMap((el) => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none" || el.closest("dialog:not([open])")) return [];
        return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
      }));
      expect(small.length === 0, `${where} ${screen}: under 44 px: ${small.slice(0, 3).join(", ")}`);
    };
    await p.goto(BASE + "/app/welcome");
    await p.getByRole("button", { name: "Get started" }).waitFor();
    await check("welcome");
    await p.getByRole("button", { name: "Get started" }).click();
    await p.getByRole("heading", { level: 1, name: "Hi, I'm Pip!" }).waitFor();
    await p.waitForTimeout(1900);
    await check("Pip's arrival");
    await p.getByRole("button", { name: "Show me around" }).click();
    for (let i = 0; i < TABS.length; i++) {
      await p.getByRole("heading", { level: 1, name: stopRe(i) }).waitFor();
      await p.waitForTimeout(900);
      await check(TABS[i]);
      const clear = await p.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        // the line under the copy of the bar ends the stop on the first run
        const last = [...document.querySelectorAll("section[data-tour-stop] p")].pop();
        const bar = [...document.querySelectorAll("button")].find((b) => /^(Continue|Done)$/.test(b.textContent.trim()))?.closest(".sticky");
        return last && bar ? Math.round(bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom) : null;
      });
      expect(clear !== null && clear >= -1, `${where} ${TABS[i]}: the last line is under the sticky button (${clear})`);
      await p.getByRole("button", { name: "Continue" }).click();
    }
    await p.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
    await check("let's make it yours");
    await ctx.close();
  }
});

await step("13. axe: no violations on the welcome screen, Pip's arrival (Pip is a named picture there), a stop, 'Let's make it yours' and the replay", async () => {
  const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(BASE + "/app/welcome");
  await p.getByRole("button", { name: "Get started" }).waitFor();
  await p.waitForTimeout(800);
  await axe(p, "welcome");
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("heading", { level: 1, name: "Hi, I'm Pip!" }).waitFor();
  await p.waitForTimeout(1900); // the jump and the burst
  await axe(p, "Pip's arrival");
  await p.getByRole("button", { name: "Show me around" }).click();
  await p.getByRole("heading", { level: 1, name: stopRe(0) }).waitFor();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("heading", { level: 1, name: stopRe(1) }).waitFor();
  await p.waitForTimeout(900);
  await axe(p, "the Recipes stop");
  await p.getByRole("button", { name: "Skip tour" }).click();
  await p.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  await axe(p, "Let's make it yours");
  await p.goto(BASE + "/app/welcome?tour=1");
  await p.getByText(`Step 1 of ${TABS.length}`).waitFor();
  await p.waitForTimeout(900);
  await axe(p, "the replay");
  await ctx.close();
});

await step("14. no request's address or body carries mm.v1.tour or the tour's state", async () => {
  const hits = requests.filter((r) => /mm\.v1\.tour/.test(r.url) || /mm\.v1\.tour|"tour"\s*:/.test(r.body));
  expect(hits.length === 0, "sent: " + hits.slice(0, 2).map((r) => r.url).join(" | "));
});

await step("15. Pip and the cover settle (the onboarding meeting, change 14): 6 s in, only the marquee and Pip's blink run on the cover and only the blink on 'Hi, I'm Pip!'; with reduced motion nothing runs on either", async () => {
  // what is still moving: running animations by name (a CSS transition by the property it moves)
  const running = (p) => p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName ?? a.transitionProperty ?? "animation"));
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const ctx = await fresh({ reducedMotion }); const p = await ctx.newPage();
    await p.goto(BASE + "/app/welcome");
    await p.getByRole("button", { name: "Get started" }).waitFor();
    await p.waitForTimeout(6000);
    const cover = await running(p);
    if (reducedMotion === "reduce") expect(cover.length === 0, "reduced motion: the cover still moves: " + cover.join(", "));
    else {
      expect(cover.every((n) => n === "marquee" || n === "pip-blink"), "the cover at 6 s: " + [...new Set(cover)].join(", "));
      expect(cover.includes("marquee"), "the logo wall stopped moving on the cover: " + cover.join(", "));
    }
    await p.getByRole("button", { name: "Get started" }).click();
    await p.getByRole("heading", { level: 1, name: "Hi, I'm Pip!" }).waitFor();
    await p.waitForTimeout(6000);
    const arrival = await running(p);
    if (reducedMotion === "reduce") expect(arrival.length === 0, "reduced motion: the arrival still moves: " + arrival.join(", "));
    else expect(arrival.every((n) => n === "pip-blink"), "'Hi, I'm Pip!' at 6 s: " + [...new Set(arrival)].join(", "));
    await ctx.close();
  }
});

// The onboarding meeting of 19 November (question 13, approved that day; WCAG 2.2.2): the wall keeps moving until someone taps its 44 pt "Pause"; "Play" starts it
// again; with reduced motion nothing moves and there is no button.
await step("16. the cover's logo wall has a 44 pt Pause at its corner: it stops the wall, and Play starts it again; with reduced motion there is no button", async () => {
  const wallState = (p) => p.evaluate(() => [...document.querySelectorAll(".marquee")].map((m) => getComputedStyle(m).animationPlayState));
  const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(BASE + "/app/welcome");
  await p.getByRole("button", { name: "Get started" }).waitFor();
  const pause = p.getByRole("button", { name: "Pause the moving logos" });
  const box = await pause.boundingBox();
  expect(box && box.height >= 44 && box.width >= 44, `Pause is ${box?.width} x ${box?.height}`);
  expect((await pause.innerText()).trim() === "Pause", "its word is Pause: " + (await pause.innerText()));
  expect((await wallState(p)).every((s) => s === "running"), "the wall moves until someone taps Pause");
  await pause.click();
  const play = p.getByRole("button", { name: "Play the moving logos" });
  await play.waitFor();
  expect((await wallState(p)).every((s) => s === "paused"), "Pause stops every row: " + (await wallState(p)).join(", "));
  await play.click();
  await pause.waitFor();
  expect((await wallState(p)).every((s) => s === "running"), "Play starts it again");
  await ctx.close();
  const still = await fresh({ reducedMotion: "reduce" }); const q = await still.newPage();
  await q.goto(BASE + "/app/welcome");
  await q.getByRole("button", { name: "Get started" }).waitFor();
  expect(!(await q.getByRole("button", { name: "Pause the moving logos" }).isVisible()), "a Pause button with nothing moving");
  await still.close();
});

await main.close();
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
