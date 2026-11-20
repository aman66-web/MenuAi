// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"; app/app/_components/CoachMarks.tsx): switched on by the end of
// the welcome screens or Settings, each tab's first visit dims the page, lights up one real control at a time and says what it does; Next walks on, Done ends
// that tab's tips, "Stop the tips" ends them all; each tab's show once; a phone set up before the tips existed never sees them unasked; at the largest text
// the card stays on the screen; axe. The onboarding redesign meeting (20 November 2026): after the welcome screens the tips follow the showcases, so Eat out
// leaves out "Restaurants"; Home's first visit teaches "Your day" and "Moving around" (and the + only without the Start here card), once the arrival toast
// has gone, with Pip hopping once along the real tab bar (still with Reduce Motion); its second visit the Scan your food card and the top right; the card
// never covers Home's numbers or the Start here card. Settings › "Show me the buttons" shows every tip, Home's on one visit, "Moving around" last.
// Run with the same NEXT_PUBLIC_ switches the build had (they decide Home's tips): on the website build (no Premium, no Scan your food) Home's second visit
// has one tip; with NEXT_PUBLIC_PRO=1 the + tip says "It's part of Premium", and with NEXT_PUBLIC_PHOTO_RECIPES=1 on a gated build Scan your food is one more.
//   BASE=http://localhost:3005 node e2e/coach.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
/** Premium is sold in this build (lib/mm/config.ts GATING_ENABLED); adding a meal is paid only on the NEXT_PUBLIC_PRO=1 build (lib/mm/entitlements.ts LOG_IS_PAID). */
const GATED = process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1";
const LOG_PAID = process.env.NEXT_PUBLIC_PRO === "1";
const SCAN = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1" && GATED; // Scan your food on Home (FOOD_SCAN_ENABLED)
/** Home's tips on its second visit after the welcome screens: (Scan your food,) Shopping list and Settings. */
const LATER_TIPS = SCAN ? 2 : 1;
/** Every Home tip on one visit (Settings): Your day, Add what you ate, (Scan your food,) Shopping list and Settings, Moving around. */
const ALL_HOME_TIPS = SCAN ? 5 : 4;
/** What the end of the welcome screens leaves (lib/mm/coach.ts coachAfterWelcome). */
const AFTER_WELCOME = { armed: true, seen: [], afterShowcase: true };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = (patch = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], ...patch } });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function context(coach, patch, { homePages, reducedMotion = "no-preference", viewport = { width: 390, height: 844 } } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion });
  await ctx.addInitScript(([s, c, h]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("mm.v1.settings", s);
      localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
      if (c) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: c }));
      if (h) localStorage.setItem("mm.v1.homePages", JSON.stringify({ v: 1, data: h }));
      sessionStorage.setItem("seeded", "1");
    }
  }, [settings(patch), coach, homePages ?? null]);
  return ctx;
}
const tip = (page) => page.getByRole("dialog", { name: /./ }).filter({ hasText: /Tip \d+ of \d+/ });
/** Pip's mood in the card ("wave", "point" or "pointUp") and whether the card sits below the lit ring. */
const pipInCard = (page) => page.evaluate(() => {
  const span = document.querySelector("dialog[open] [data-mood]");
  const card = document.querySelector("dialog[open] .max-w-\\[24rem\\]");
  const ring = [...document.querySelectorAll("dialog[open] div[aria-hidden]")].find((d) => d.style.boxShadow.includes("200vmax"));
  return { mood: span?.getAttribute("data-mood"), width: span?.querySelector("svg")?.getAttribute("width"), below: !!card && !!ring && card.getBoundingClientRect().top >= ring.getBoundingClientRect().bottom };
});
/** The lit hole sits round the control: the control's middle is inside the ring. */
async function litAround(page, selector) {
  // the page scrolls the control into place and the ring follows: a control far down Home (the meals' + since the cooking cards, 2026-11-19) takes longer
  const check = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const ring = [...document.querySelectorAll("dialog[open] div[aria-hidden]")].find((d) => d.style.boxShadow.includes("200vmax"));
    if (!el || !ring) return false;
    const a = el.getBoundingClientRect(), b = ring.getBoundingClientRect();
    const x = a.left + a.width / 2, y = Math.max(a.top, 0) + Math.min(a.bottom - Math.max(a.top, 0), innerHeight * 0.42) / 2;
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }, selector);
  await page.waitForTimeout(900);
  for (let i = 0; i < 12; i++) { if (await check()) return true; await page.waitForTimeout(250); }
  return check();
}
/** The tip's card covers none of Home's numbers or the Start here card. */
const coversNothing = (page) => page.evaluate(() => {
  const card = document.querySelector("dialog[open] .max-w-\\[24rem\\]").getBoundingClientRect();
  return ['[data-coach="home-numbers"]', '[data-coach="home-start"]'].every((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    const r = el.getBoundingClientRect();
    return card.bottom <= r.top || card.top >= r.bottom;
  });
});
/**
 * The 30-person audit (20 November 2026, lib/mm/coach.ts placeTip, TIP_CARD_MIN): the card keeps clear of Home's numbers and the Start here card wherever the
 * screen has room for them and the card whole; where it hasn't (the tab bar lit, with both cards taller than the room above it), it may cover them, but is
 * never shorter than TIP_CARD_MIN (168 px), never covers the lit control, and its Next/Done and "Stop the tips" are whole on the screen. "" when that holds.
 */
const keptClear = (page) => page.evaluate(() => {
  const card = document.querySelector("dialog[open] .max-w-\\[24rem\\]").getBoundingClientRect();
  const parts = ['[data-coach="home-numbers"]', '[data-coach="home-start"]'].map((sel) => document.querySelector(sel)?.getBoundingClientRect()).filter((r) => r && r.height > 0);
  const covered = parts.some((r) => !(card.bottom <= r.top || card.top >= r.bottom));
  if (!covered) return "";
  const ring = [...document.querySelectorAll("dialog[open] div[aria-hidden]")].find((d) => d.style.boxShadow.includes("200vmax"))?.getBoundingClientRect();
  const stack = Math.max(...parts.map((r) => r.bottom)) - Math.min(...parts.map((r) => r.top));
  const tabs = document.querySelector('[data-coach="tabs"]').getBoundingClientRect();
  // the most the page above the tab bar can hold: the screen's top edge (16), and above the bar the lit ring's 6 px and Pip standing on it in "Moving around"
  // (CoachMarks.tsx HOP_ROOM: 40 x 150 / 140 + 4), which the card keeps clear of too
  const hop = document.querySelector("[data-coach-hop]") ? (40 * 150) / 140 + 4 : 0;
  const room = tabs.top - 6 - hop - 16;
  const buttons = [...document.querySelectorAll("dialog[open] button")].filter((b) => /^(Next|Done|Stop the tips)$/.test(b.textContent.trim())).map((b) => b.getBoundingClientRect());
  const why = [];
  if (stack + card.height + 24 <= room) why.push(`there was room to keep clear (cards ${Math.round(stack)} + card ${Math.round(card.height)} <= ${Math.round(room)})`);
  if (card.height < 168) why.push(`the card is ${Math.round(card.height)} px, under 168`);
  if (ring && !(card.bottom <= ring.top + 1 || card.top >= ring.bottom - 1)) why.push("the card covers the lit control");
  if (buttons.length < 2 || buttons.some((b) => b.top < 0 || b.bottom > innerHeight || b.top < card.top - 1 || b.bottom > card.bottom + 1)) why.push("its buttons aren't whole on the screen");
  return why.join("; ");
});
/** What the welcome screens leave for Home: the arrival toast and the Start here card (lib/mm/homePages.ts withArrival). */
const ARRIVAL = { seen: false, slid: true, hintDays: 0, lastHintDay: "", arrival: { at: new Date().toISOString(), toast: "signedIn", card: true, firstRecipeId: "scrambled-eggs-on-toast" } };

await step("a phone set up before the tips existed sees none unasked", async () => {
  const ctx = await context(null);
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Add to Breakfast" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
  expect((await tip(page).count()) === 0, "no tips");
  await ctx.close();
});

await step("after the welcome screens: the tips wait for the arrival toast; Home's first visit lights 'Your day' then 'Moving around' (no + while the Start here card shows), never covering the numbers or the card; Pip waves, then hops once along the tab bar; the second visit teaches the top right", async () => {
  const ctx = await context(AFTER_WELCOME, { devProOverride: true }, { homePages: ARRIVAL });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  const toast = page.getByRole("status").filter({ hasText: "You're signed in. Your goal and daily numbers are saved." });
  await toast.waitFor({ timeout: 120000 });
  await page.getByRole("region", { name: "Start here" }).waitFor();
  await page.waitForTimeout(3000);
  expect((await tip(page).count()) === 0, "no tip while the arrival toast shows");
  const d = tip(page);
  await d.waitFor({ timeout: 20000 });
  expect(await toast.count() === 0, "the toast has gone first");
  expect((await d.textContent()).includes("Tip 1 of 2"), `two tips on the first visit: ${(await d.textContent()).slice(0, 80)}`);
  await page.getByRole("heading", { level: 2, name: "Your day" }).waitFor();
  expect(await page.evaluate(() => document.activeElement?.id === "coach-title"), "the focus is on the tip");
  expect(await litAround(page, '[data-coach="home-numbers"]'), "the day's numbers are lit");
  expect(await coversNothing(page), "the card covers neither the numbers nor the Start here card");
  const first = await pipInCard(page);
  expect(first.mood === "wave" && first.width === "56", `Pip waves on the first tip, at 56: ${JSON.stringify(first)}`);
  expect(!/TIP \d/.test(await d.textContent()), "the tip's count in sentence case");
  await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Moving around" }).waitFor();
  expect(await litAround(page, '[data-coach="tabs"]'), "the tab bar is lit");
  { const why = await keptClear(page); expect(why === "", `Moving around: ${why}`); }
  // Pip stands on the real tab bar (above its top edge, not on the ink) and hops once to the far end; the card has no Pip of its own on this tip
  await page.waitForTimeout(1600);
  const hop = await page.evaluate(() => {
    const pip = document.querySelector("[data-coach-hop]").getBoundingClientRect();
    const bar = document.querySelector('[data-coach="tabs"]').getBoundingClientRect();
    return { pipBottom: pip.bottom, barTop: bar.top, pipRight: pip.right, barRight: bar.right, inCard: !!document.querySelector("dialog[open] [data-mood]") };
  });
  expect(hop.pipBottom <= hop.barTop && hop.barRight - hop.pipRight < 60 && !hop.inCard, `Pip hopped along the bar: ${JSON.stringify(hop)}`);
  await tip(page).getByRole("button", { name: "Done" }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForTimeout(2500);
  expect((await tip(page).count()) === 0, "the second round waits for another visit");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.coach")).data);
  expect(stored.armed === true && stored.seen.join() === "home" && stored.afterShowcase === true, `remembered: ${JSON.stringify(stored)}`);

  // Eat out after the welcome screens: Search and Near me (step 3 showed the restaurants)
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Eat out" }).click();
  await tip(page).waitFor({ timeout: 60000 });
  expect((await tip(page).textContent()).includes("Tip 1 of 2"), "two tips on Eat out after the welcome screens");
  await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Near me" }).waitFor();
  await tip(page).getByRole("button", { name: "Done" }).click();
  await tip(page).waitFor({ state: "hidden" });

  // back on Home: the second visit's tips. The Start here card stays, visit after visit, until it is done with (the 30-person audit, 20 November 2026:
  // lib/mm/homePages.ts; it used to vanish the moment she left Home)
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await tip(page).waitFor({ timeout: 60000 });
  expect(await page.getByRole("region", { name: "Start here" }).count() === 1, "the Start here card stays until it is done with");
  expect((await tip(page).textContent()).includes(`Tip 1 of ${LATER_TIPS}`), `the second visit: ${(await tip(page).textContent()).slice(0, 80)}`);
  if (SCAN) {
    await page.getByRole("heading", { level: 2, name: "Scan your food" }).waitFor();
    expect(await litAround(page, '[data-coach="home-photo"]'), "Scan your food is lit");
    { const why = await keptClear(page); expect(why === "", `Scan your food: ${why}`); }
    await tip(page).getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("heading", { level: 2, name: "Shopping list, Settings" }).waitFor();
  expect(await litAround(page, '[data-coach="home-top"]'), "the shopping list and the gear are lit");
  { const why = await keptClear(page); expect(why === "", `Shopping list, Settings: ${why}`); }
  await tip(page).getByRole("button", { name: "Done" }).click();
  await tip(page).waitFor({ state: "hidden" });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.coach")).data);
  expect(after.seen.includes("homeLater"), `Home's second round remembered: ${JSON.stringify(after)}`);

  // Groceries next: its own tips, the shops lit first; Escape counts as Done
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Groceries" }).click();
  await tip(page).waitFor({ timeout: 60000 });
  await page.getByRole("heading", { level: 2, name: "Your supermarkets" }).waitFor();
  expect(await litAround(page, '[data-coach="groceries-shops"]'), "the shops are lit");
  await page.keyboard.press("Escape");
  await tip(page).waitFor({ state: "hidden" });
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.coach")).data.seen)).includes("groceries"), "Escape marks Groceries seen");

  // "Stop the tips" on Recipes ends them everywhere
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" }).click();
  await tip(page).waitFor({ timeout: 60000 });
  await tip(page).getByRole("button", { name: "Stop the tips" }).click();
  await tip(page).waitFor({ state: "hidden" });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await page.getByRole("button", { name: "Add to Breakfast" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  expect((await tip(page).count()) === 0, "no tips after Stop the tips");
  await ctx.close();
});

await step("without the Start here card, Home's first visit also teaches the +; with Reduce Motion Pip stands still on the tab bar", async () => {
  const ctx = await context(AFTER_WELCOME, {}, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  const d = tip(page);
  await d.waitFor({ timeout: 120000 });
  expect((await d.textContent()).includes("Tip 1 of 3"), `Your day, the + and Moving around: ${(await d.textContent()).slice(0, 80)}`);
  await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Add what you ate" }).waitFor();
  expect(await litAround(page, '[data-coach="home-add"]'), "the + is lit");
  // adding a meal is free on the website build, so the + tip doesn't say Premium (it does only where logging is paid: LOG_IS_PAID)
  expect((await d.textContent()).includes("It's part of Premium.") === LOG_PAID, LOG_PAID ? "the + tip doesn't say it's part of Premium where adding a meal is paid" : "the + tip says Premium where adding a meal is free");
  const second = await pipInCard(page);
  expect(second.mood === (second.below ? "pointUp" : "point"), `Pip points at the lit +: ${JSON.stringify(second)}`);
  expect(await page.evaluate(() => !!document.querySelector("dialog[open]") && document.querySelector('[data-coach="home-add"]').closest("[inert]") === null), "a modal dialog is open");
  await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Moving around" }).waitFor();
  await page.waitForTimeout(1500);
  const still = await page.evaluate(() => { const el = document.querySelector("[data-coach-hop]"); return el ? el.getAnimations().length : -1; });
  expect(still === 0, `Pip is on the bar and doesn't move with Reduce Motion: ${still}`);
  await tip(page).getByRole("button", { name: "Done" }).click();
  await d.waitFor({ state: "hidden" });
  await ctx.close();
});

await step("Settings › Show me the buttons on each screen switches them on again and opens Home with every tip on one visit, 'Moving around' last", async () => {
  const ctx = await context({ armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"], afterShowcase: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: /^Show me the buttons on each screen/ }).click();
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/");
  const d = tip(page);
  await d.waitFor({ timeout: 60000 });
  expect((await d.textContent()).includes(`Tip 1 of ${ALL_HOME_TIPS}`), `every tip on Home from Settings: ${(await d.textContent()).slice(0, 80)}`);
  for (let i = 1; i < ALL_HOME_TIPS; i++) await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Moving around" }).waitFor();
  expect(await litAround(page, '[data-coach="tabs"]'), "the tab bar is lit");
  await tip(page).getByRole("button", { name: "Done" }).click();
  await d.waitFor({ state: "hidden" });
  await ctx.close();
});

await step("Eat out's three tips from Settings in page order (Search, Near me, Restaurants); at the largest text the card stays on the screen; axe on a tip", async () => {
  const ctx = await context({ armed: true, seen: ["home", "groceries", "recipes"] }, { textSize: "xlarge" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/eat-out");
  const d = tip(page);
  await d.waitFor({ timeout: 120000 });
  expect((await d.textContent()).includes("Tip 1 of 3"), `Tip 1 of 3 on Eat out: ${(await d.textContent()).slice(0, 80)}`);
  const titles = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1200); // the page scrolls the control into place; the card shows once it's still
    titles.push(await page.locator("#coach-title").textContent());
    const box = await page.evaluate(() => {
      const card = document.querySelector("dialog[open] .max-w-\\[24rem\\]");
      const r = card.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth };
    });
    expect(box.top >= 0 && box.bottom <= box.vh + 1 && box.left >= 0 && box.right <= box.vw + 1, `the card is on the screen: ${JSON.stringify(box)}`);
    if (i === 0) {
      await page.addScriptTag({ path: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector("dialog[open]"), { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 100)}`));
      expect(v.length === 0, v.join(" | "));
    }
    const done = tip(page).getByRole("button", { name: "Done" });
    if (await done.count()) { await done.click(); break; }
    await tip(page).getByRole("button", { name: "Next" }).click();
  }
  await d.waitFor({ state: "hidden" });
  expect(titles.join(" | ") === "Search | Near me | Restaurants", `Eat out's tips in page order: ${titles.join(" | ")}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
  await ctx.close();
});

await step("a small phone (375 x 667): Home's first-visit tips keep clear of the numbers and the Start here card where there is room, and otherwise stay whole with their buttons on the screen", async () => {
  const ctx = await context(AFTER_WELCOME, { devProOverride: true }, { homePages: ARRIVAL, viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  const d = tip(page);
  await d.waitFor({ timeout: 120000 });
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1500);
    const why = await keptClear(page);
    expect(why === "", `tip ${i + 1}: ${await page.locator("#coach-title").textContent()}: ${why}`);
    const done = tip(page).getByRole("button", { name: "Done" });
    if (await done.count()) { await done.click(); break; }
    await tip(page).getByRole("button", { name: "Next" }).click();
  }
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
