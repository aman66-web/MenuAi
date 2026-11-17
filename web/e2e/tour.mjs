// The welcome tour (founder 2026-11-17; lib/mm/tour.ts, app/app/welcome/Tour.tsx): a plain first launch of /app goes to the welcome screens before anything is
// drawn; Pip's arrival, the text size (saved on the tap), five stops with "What you can do" on each tab, then "Let's make it yours" (Set up my plan / Look around
// first). Links open as they are; Settings › Help replays the five stops and writes nothing; Clear everything brings the welcome back.
// Run against a production build, with the same NEXT_PUBLIC_ switches the build had (they decide the Make it at home and friends rows):
//   BASE=http://localhost:3101 node e2e/tour.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const PHOTO = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1" && (process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1");
const FRIENDS = process.env.NEXT_PUBLIC_COMMUNITY_FRIENDS !== "0";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
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

const TABS = ["Home", "Eat out", "Groceries", "Recipes", "Community"];
const IDS = ["home", "eatOut", "groceries", "recipes", "community"];
const ROWS = {
  home: [
    "Tap + next to Breakfast, Lunch or Dinner to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers.",
    "Tap the calendar next to the date to see another day.",
    "The gear at the top opens Settings: your goal, diet, text size, and this tour again.",
    "Further down Home, add the water you drink and set your own reminders.",
  ],
  eatOut: [
    "Search for any restaurant or dish by name.",
    "Near me shows the places to eat around you on a map.",
    "Open a restaurant to see the numbers for each dish. Best for you lists orders that fit your goal.",
  ],
  groceries: [
    "Tap your supermarket to see its products and prices.",
    "Scan a barcode to look up a product you're holding.",
    "My list is your shopping list. Tick things off as you shop.",
  ],
  recipes: [
    "Tap Breakfast, Lunch, Dinner or Snacks to see recipes for that meal.",
    "Tap the heart on a recipe to keep it in My meals.",
    "Open a recipe to add everything it needs to your shopping list in one tap.",
    ...(PHOTO ? ["Make it at home turns a photo of a dish into a recipe. It's part of Premium."] : []),
  ],
  community: [
    "Food blogs are short, easy reads about eating out, shopping and cooking.",
    ...(FRIENDS ? ["Sign in to add friends with a code, then send each other shopping lists."] : []),
  ],
};
const stopId = (page) => page.locator("[data-tour-stop]").getAttribute("data-tour-stop");
const barWords = (page) => page.locator("section[data-tour-stop] ul[aria-hidden='true'] span.line-clamp-2").allInnerTexts();
const litTab = (page) => page.locator("section[data-tour-stop] ul[aria-hidden='true']").evaluate((ul) => [...ul.children].findIndex((li) => li.firstElementChild?.className.includes("text-[#d6efa0]")));
const rows = (page) => page.locator("section[data-tour-stop] div.glass ul > li").allInnerTexts();

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

await step("2. Get started → 'Hi, I'm Pip!' (its headline has the focus) → Show me around → 'Easy to read'; Extra large applies at once and is saved without Continue", async () => {
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("heading", { level: 1, name: "Hi, I'm Pip!" }).waitFor();
  await h1Focused(page, "Hi, I'm Pip!");
  await page.getByRole("button", { name: "Show me around" }).click();
  await page.getByRole("heading", { level: 1, name: "Easy to read" }).waitFor();
  await h1Focused(page, "Easy to read");
  await page.getByRole("radio", { name: "Extra large", exact: true }).click();
  await page.getByText("Perfect, that's easy on the eyes!").waitFor();
  expect((await page.evaluate(() => document.documentElement.style.fontSize)) === "130%", "html font-size: " + (await page.evaluate(() => document.documentElement.style.fontSize)));
  expect((await settingsOf(page))?.textSize === "xlarge", "saved: " + JSON.stringify(await settingsOf(page)));
});

await step("3. the five stops: the tab's name as the focused headline, the stop's id, the real bar's words with the stop's tab lit, and the rows of 'What you can do'", async () => {
  await page.getByRole("button", { name: "Continue" }).click();
  for (let i = 0; i < TABS.length; i++) {
    await page.getByRole("heading", { level: 1, name: TABS[i], exact: true }).waitFor();
    await h1Focused(page, TABS[i]);
    expect((await stopId(page)) === IDS[i], `stop ${i + 1}: data-tour-stop ${await stopId(page)}`);
    const words = (await barWords(page)).map((s) => s.trim());
    expect(JSON.stringify(words) === JSON.stringify(realBar), `stop ${i + 1}: the bar's words ${JSON.stringify(words)} against the real bar's ${JSON.stringify(realBar)}`);
    expect((await litTab(page)) === i, `stop ${i + 1}: lit tab ${await litTab(page)}`);
    await page.getByRole("heading", { level: 2, name: "What you can do" }).waitFor();
    const got = (await rows(page)).map((s) => s.trim());
    expect(JSON.stringify(got) === JSON.stringify(ROWS[IDS[i]]), `stop ${i + 1}: rows ${JSON.stringify(got)}`);
    await page.waitForTimeout(150);
    if (i < TABS.length - 1) await page.getByRole("button", { name: "Continue" }).click();
  }
});

await step("4. the last stop leads to 'Let's make it yours', and the tour is marked seen as soon as it shows", async () => {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("mm.v1.tour") || "null")?.data === 1, null, { timeout: 3000 });
  await page.getByText("You can see this tour again any time in Settings.").waitFor();
  expect((await page.getByRole("button", { name: /Skip/ }).count()) === 0, "no Skip on the choice");
});

await step("5. 'Set up my plan' → 'Step 1 of 9'; Back returns to 'Let's make it yours'; the questions end on Home, set up, with the card gone", async () => {
  await page.getByRole("button", { name: "Set up my plan" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
  await page.getByText("Step 1 of 9").waitFor();
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await page.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  await page.getByRole("button", { name: "Set up my plan" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
  // goal, foods to avoid, the questions about the person, the targets, the shops
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("heading", { name: "You're all set!" }).waitFor();
  await page.getByText("Step 8 of 9").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Choose a recipe to start with" }).waitFor();
  await page.getByRole("button", { name: "Take me to Home" }).click();
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
  await p.getByRole("heading", { level: 1, name: "Easy to read" }).waitFor();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("heading", { level: 1, name: "Home", exact: true }).waitFor();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("heading", { level: 1, name: "Eat out", exact: true }).waitFor();
  await p.getByRole("button", { name: "Skip tour" }).click();
  await p.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
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

await step("9. Settings › Help › 'Show me around again': 'Step 1 of 5', Close and Done return to Settings, nothing is saved; the setup card's 'Show me around' returns to Home", async () => {
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
  await p.getByText("Step 1 of 5").waitFor();
  await p.getByRole("heading", { level: 1, name: "Home", exact: true }).waitFor();
  await p.getByRole("button", { name: "Close", exact: true }).click();
  await p.waitForURL(/\/app\/settings$/);
  await again.click();
  await p.getByText("Step 1 of 5").waitFor();
  for (let i = 1; i < TABS.length; i++) {
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("heading", { level: 1, name: TABS[i], exact: true }).waitFor();
    await p.getByText(`Step ${i + 1} of 5`).waitFor();
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
  await q.getByText("Step 1 of 5").waitFor();
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
  await p.getByRole("button", { name: "Show me around" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  for (let i = 0; i < TABS.length; i++) {
    await p.getByRole("heading", { level: 1, name: TABS[i], exact: true }).waitFor();
    await p.waitForTimeout(200);
    expect((await running()).length === 0, `${TABS[i]} animates: ` + (await running()).join(", "));
    if (i < TABS.length - 1) await p.getByRole("button", { name: "Continue" }).click();
  }
  await ctx.close();
});

await step("12. Extra large text at 360×780 and 375×667: no sideways scroll, every button and link at least 44 px, and a stop's last row clear of the sticky button", async () => {
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
    await p.getByRole("heading", { level: 1, name: "Easy to read" }).waitFor();
    await check("text size");
    await p.getByRole("button", { name: "Continue" }).click();
    for (let i = 0; i < TABS.length; i++) {
      await p.getByRole("heading", { level: 1, name: TABS[i], exact: true }).waitFor();
      await p.waitForTimeout(900);
      await check(TABS[i]);
      const clear = await p.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const last = [...document.querySelectorAll("section[data-tour-stop] div.glass ul > li")].pop();
        const bar = [...document.querySelectorAll("button")].find((b) => /^(Continue|Done)$/.test(b.textContent.trim()))?.closest(".sticky");
        return last && bar ? Math.round(bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom) : null;
      });
      expect(clear !== null && clear >= -1, `${where} ${TABS[i]}: the last row is under the sticky button (${clear})`);
      await p.getByRole("button", { name: "Continue" }).click();
    }
    await p.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
    await check("let's make it yours");
    await ctx.close();
  }
});

await step("13. axe: no violations on the welcome screen, 'Easy to read', a stop, 'Let's make it yours' and the replay", async () => {
  const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(BASE + "/app/welcome");
  await p.getByRole("button", { name: "Get started" }).waitFor();
  await p.waitForTimeout(800);
  await axe(p, "welcome");
  await p.getByRole("button", { name: "Get started" }).click();
  await p.getByRole("button", { name: "Show me around" }).click();
  await p.getByRole("heading", { level: 1, name: "Easy to read" }).waitFor();
  await axe(p, "Easy to read");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("heading", { level: 1, name: "Eat out", exact: true }).waitFor();
  await p.waitForTimeout(900);
  await axe(p, "the Eat out stop");
  await p.getByRole("button", { name: "Skip tour" }).click();
  await p.getByRole("heading", { level: 1, name: "Let's make it yours" }).waitFor();
  await axe(p, "Let's make it yours");
  await p.goto(BASE + "/app/welcome?tour=1");
  await p.getByText("Step 1 of 5").waitFor();
  await p.waitForTimeout(900);
  await axe(p, "the replay");
  await ctx.close();
});

await step("14. no request's address or body carries mm.v1.tour or the tour's state", async () => {
  const hits = requests.filter((r) => /mm\.v1\.tour/.test(r.url) || /mm\.v1\.tour|"tour"\s*:/.test(r.body));
  expect(hits.length === 0, "sent: " + hits.slice(0, 2).map((r) => r.url).join(" | "));
});

await main.close();
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
