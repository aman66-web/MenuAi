// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"; app/app/_components/CoachMarks.tsx): switched on by the end of
// the welcome screens or Settings, each tab's first visit dims the page, lights up one real control at a time and says what it does; Next walks on, Done ends
// that tab's tips, "Stop the tips" ends them all; each tab's show once; a phone set up before the tips existed never sees them unasked; at the largest text
// the card stays on the screen; axe. Run against a server: BASE=http://localhost:3005 node e2e/coach.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
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
/** The lit hole sits round the control: the control's middle is inside the ring. */
async function litAround(page, selector) {
  await page.waitForTimeout(900); // the page scrolls the control into place and the ring follows
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const ring = [...document.querySelectorAll("dialog[open] div[aria-hidden]")].find((d) => d.style.boxShadow.includes("200vmax"));
    if (!el || !ring) return false;
    const a = el.getBoundingClientRect(), b = ring.getBoundingClientRect();
    const x = a.left + a.width / 2, y = a.top + Math.min(a.height, innerHeight * 0.42) / 2;
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }, selector);
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

await step("switched on: Home's tips light each real control in turn; Next, then Done; not again on Home", async () => {
  const ctx = await context({ armed: true, seen: [] });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  const d = tip(page);
  await d.waitFor({ timeout: 120000 });
  expect(/Tip 1 of \d/.test(await d.textContent()), "starts at the first tip");
  await page.getByRole("heading", { level: 2, name: "Your day" }).waitFor();
  expect(await page.evaluate(() => document.activeElement?.id === "coach-title"), "the focus is on the tip");
  expect(await litAround(page, '[data-coach="home-numbers"]'), "the day's numbers are lit");
  const total = Number((/Tip 1 of (\d+)/.exec(await d.textContent()) ?? [])[1]);
  expect(total >= 4, `four or more tips on Home, got ${total}`);
  await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Add what you ate" }).waitFor();
  expect(await litAround(page, '[data-coach="home-add"]'), "the + is lit");
  // the page behind can't be tapped while a tip shows (a modal dialog)
  expect(await page.evaluate(() => !!document.querySelector("dialog[open]") && document.querySelector('[data-coach="home-add"]').closest("[inert]") === null), "a modal dialog is open");
  for (let i = 2; i < total; i++) await tip(page).getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { level: 2, name: "Moving around" }).waitFor();
  expect(await litAround(page, '[data-coach="tabs"]'), "the tab bar is lit");
  await tip(page).getByRole("button", { name: "Done" }).click();
  await d.waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("button", { name: "Add to breakfast" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  expect((await tip(page).count()) === 0, "Home's tips only once");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.coach")).data);
  expect(stored.armed === true && stored.seen.join() === "home", `remembered: ${JSON.stringify(stored)}`);

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

await step("Settings › Show me the buttons on each screen switches them on again and opens Home with its first tip", async () => {
  const ctx = await context({ armed: false, seen: ["home", "eatOut", "groceries", "recipes"] });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: /^Show me the buttons on each screen/ }).click();
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/");
  await tip(page).waitFor({ timeout: 60000 });
  await ctx.close();
});

await step("Eat out's tips; at the largest text the card stays on the screen; axe on a tip", async () => {
  const ctx = await context({ armed: true, seen: ["home", "groceries", "recipes"] }, { textSize: "xlarge" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/eat-out");
  const d = tip(page);
  await d.waitFor({ timeout: 120000 });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1200); // the page scrolls the control into place; the card shows once it's still
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
