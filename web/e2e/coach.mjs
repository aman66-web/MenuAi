// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"; app/app/_components/CoachMarks.tsx): switched on by the end of
// the welcome screens or Settings, each tab's first visit dims the page, lights up one real control at a time and says what it does; Next walks on, Done ends
// that tab's tips, "Stop the tips" ends them all; each tab's show once; a phone set up before the tips existed never sees them unasked; at the largest text
// the card stays on the screen; axe. Each button is taught once (onboarding meeting, 19 November): after a walked tour Home leaves out "Moving around" (the tour
// showed the tab bar), Settings › "Show me the buttons" shows every tip, Eat out has three tips; Pip waves on the first tip and then points at the lit control.
// Run with the same NEXT_PUBLIC_ switches the build had (they decide Home's tips): on the website build (no Premium, no Scan your food) Home has three tips after the
// tour; with NEXT_PUBLIC_PRO=1 the + tip says "It's part of Premium", and with NEXT_PUBLIC_PHOTO_RECIPES=1 on a gated build Scan your food is a fourth.
//   BASE=http://localhost:3005 node e2e/coach.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
/** Premium is sold in this build (lib/mm/config.ts GATING_ENABLED); adding a meal is paid only on the NEXT_PUBLIC_PRO=1 build (lib/mm/entitlements.ts LOG_IS_PAID). */
const GATED = process.env.NEXT_PUBLIC_PRO === "1" || process.env.NEXT_PUBLIC_WEB_PRO === "1" || process.env.NEXT_PUBLIC_IAP === "1";
const LOG_PAID = process.env.NEXT_PUBLIC_PRO === "1";
const SCAN = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1" && GATED; // Scan your food on Home (FOOD_SCAN_ENABLED)
/** Home's tips after a walked tour: Your day, Add what you ate, (Scan your food,) Shopping list and Settings; from Settings, "Moving around" as well. */
const HOME_TIPS = SCAN ? 4 : 3;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = (patch = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], ...patch } });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function context(coach, patch) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(([s, c]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("mm.v1.settings", s);
      localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
      if (c) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: c }));
      sessionStorage.setItem("seeded", "1");
    }
  }, [settings(patch), coach]);
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
    const x = a.left + a.width / 2, y = a.top + Math.min(a.height, innerHeight * 0.42) / 2;
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }, selector);
  await page.waitForTimeout(900);
  for (let i = 0; i < 12; i++) { if (await check()) return true; await page.waitForTimeout(250); }
  return check();
}

await step("a phone set up before the tips existed sees none unasked", async () => {
  const ctx = await context(null);
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Add to breakfast" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
  expect((await tip(page).count()) === 0, "no tips");
  await ctx.close();
});

await step("after the full tour: Home's tips (three on the website build) light each real control in turn (no 'Moving around'); Pip waves, then points; Next, then Done; not again on Home", async () => {
  // what the welcome screens leave after the tour was walked to its end (lib/mm/coach.ts coachAfterWelcome with walkedTour)
  const ctx = await context({ armed: true, seen: [], afterTour: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  const d = tip(page);
  await d.waitFor({ timeout: 120000 });
  // the website build: Your day, Add what you ate, Shopping list and Settings (no Scan your food; the tour already showed the tab bar)
  expect((await d.textContent()).includes(`Tip 1 of ${HOME_TIPS}`), `Tip 1 of ${HOME_TIPS} on Home after the tour: ${(await d.textContent()).slice(0, 80)}`);
  await page.getByRole("heading", { level: 2, name: "Your day" }).waitFor();
  expect(await page.evaluate(() => document.activeElement?.id === "coach-title"), "the focus is on the tip");
  expect(await litAround(page, '[data-coach="home-numbers"]'), "the day's numbers are lit");
  const first = await pipInCard(page);
  expect(first.mood === "wave" && first.width === "56", `Pip waves on the first tip, at 56: ${JSON.stringify(first)}`);
  await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Add what you ate" }).waitFor();
  expect(await litAround(page, '[data-coach="home-add"]'), "the + is lit");
  // adding a meal is free on the website build, so the + tip doesn't say Premium (it does only where logging is paid: LOG_IS_PAID)
  expect((await d.textContent()).includes("It's part of Premium.") === LOG_PAID, LOG_PAID ? "the + tip doesn't say it's part of Premium where adding a meal is paid" : "the + tip says Premium where adding a meal is free");
  const second = await pipInCard(page);
  expect(second.mood === (second.below ? "pointUp" : "point"), `Pip points at the lit +: ${JSON.stringify(second)}`);
  // the page behind can't be tapped while a tip shows (a modal dialog)
  expect(await page.evaluate(() => !!document.querySelector("dialog[open]") && document.querySelector('[data-coach="home-add"]').closest("[inert]") === null), "a modal dialog is open");
  await tip(page).getByRole("button", { name: "Next" }).click();
  if (SCAN) {
    await page.getByRole("heading", { level: 2, name: "Scan your food" }).waitFor();
    expect(await litAround(page, '[data-coach="home-photo"]'), "Scan your food is lit");
    await tip(page).getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("heading", { level: 2, name: "Shopping list, Settings" }).waitFor();
  expect(await litAround(page, '[data-coach="home-top"]'), "the shopping list and the gear are lit");
  const third = await pipInCard(page);
  expect(third.mood === (third.below ? "pointUp" : "point"), `Pip points at the top right: ${JSON.stringify(third)}`);
  await tip(page).getByRole("button", { name: "Done" }).click();
  await d.waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("button", { name: "Add to breakfast" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  expect((await tip(page).count()) === 0, "Home's tips only once");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.coach")).data);
  expect(stored.armed === true && stored.seen.join() === "home" && stored.afterTour === true, `remembered: ${JSON.stringify(stored)}`);

  // Groceries next: its own tips, the shops lit first
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Groceries" }).click();
  await tip(page).waitFor({ timeout: 60000 });
  await page.getByRole("heading", { level: 2, name: "Your supermarkets" }).waitFor();
  expect(await litAround(page, '[data-coach="groceries-shops"]'), "the shops are lit");
  // Escape counts as Done
  await page.keyboard.press("Escape");
  await tip(page).waitFor({ state: "hidden" });
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.coach")).data.seen)).includes("groceries"), "Escape marks Groceries seen");

  // "Stop the tips" on Recipes ends them everywhere
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" }).click();
  await tip(page).waitFor({ timeout: 60000 });
  await tip(page).getByRole("button", { name: "Stop the tips" }).click();
  await tip(page).waitFor({ state: "hidden" });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Eat out" }).click();
  await page.getByRole("link", { name: /^Near me/ }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  expect((await tip(page).count()) === 0, "no tips after Stop the tips");
  await ctx.close();
});

await step("Settings › Show me the buttons on each screen switches them on again and opens Home with every tip, 'Moving around' last", async () => {
  const ctx = await context({ armed: false, seen: ["home", "eatOut", "groceries", "recipes"], afterTour: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: /^Show me the buttons on each screen/ }).click();
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/");
  const d = tip(page);
  await d.waitFor({ timeout: 60000 });
  expect((await d.textContent()).includes(`Tip 1 of ${HOME_TIPS + 1}`), `every tip on Home from Settings: ${(await d.textContent()).slice(0, 80)}`);
  for (let i = 1; i < HOME_TIPS + 1; i++) await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Moving around" }).waitFor();
  expect(await litAround(page, '[data-coach="tabs"]'), "the tab bar is lit");
  await tip(page).getByRole("button", { name: "Done" }).click();
  await d.waitFor({ state: "hidden" });
  await ctx.close();
});

await step("Eat out's three tips in page order (Search, Near me, Restaurants); at the largest text the card stays on the screen; axe on a tip", async () => {
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

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
