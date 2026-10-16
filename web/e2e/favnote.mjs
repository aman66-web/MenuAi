// The restaurant page's star (founder 2026-10-16: "When the user presses the star in the top right it should say small text in the top right saying that the
// restaurant is added to their favourites"): a few words beside the star say what the tap did ("Added to your favourites" / "Removed from your favourites"),
// stay for a moment, then fade; a screen reader hears them through a status line. Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 5).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function open(extra = {}, settings = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript(([s]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", s); }, [JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } })]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const star = (page) => page.locator("button[aria-pressed]").first(); // the first toggle on the page (its name is translated in other languages)
const note = (page, text) => page.locator("p[aria-hidden]", { hasText: text });
async function chain(page) { await page.goto(BASE + "/app/chain?id=bowl-and-co", { timeout: 120000 }); await star(page).waitFor({ timeout: 90000 }); await page.waitForTimeout(500); }
const opacity = (loc) => loc.evaluate((el) => parseFloat(getComputedStyle(el).opacity));

await step("tapping the star writes 'Added to your favourites' beside it at the top right, keeps it a moment, then fades it; tapping again says 'Removed from your favourites'", async () => {
  const { ctx, page, errors } = await open();
  await chain(page);
  const s = star(page);
  expect((await s.getAttribute("aria-pressed")) === "false", "starts as not a favourite");
  await s.tap();
  const added = note(page, "Added to your favourites");
  await added.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400); // the fade-in
  expect((await opacity(added)) > 0.9, "the note is not visible after the tap");
  const [nb, sb] = [await added.boundingBox(), await s.boundingBox()];
  expect(nb.x + nb.width <= sb.x + 1, "the note is not beside the star on its left");
  expect(nb.y < 140 && sb.y < 140, `the note is not in the top row (y ${nb.y})`);
  expect(nb.x + nb.width > 390 / 2, "the note is not in the right half");
  expect((await s.getAttribute("aria-pressed")) === "true", "the star did not turn on");
  expect((await page.getByRole("status").filter({ hasText: "Added to your favourites" }).count()) === 1, "a screen reader's status line does not say it");
  await page.waitForTimeout(3500); // 2.6 s on screen, then 0.3 s fade
  expect((await opacity(added)) < 0.05, "the note did not fade away");
  expect((await page.getByRole("status").filter({ hasText: "Added to your favourites" }).count()) === 0, "the status line still says it after the note faded");
  await s.tap();
  const removed = note(page, "Removed from your favourites");
  await removed.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  expect((await opacity(removed)) > 0.9, "the 'Removed' note is not visible");
  expect((await s.getAttribute("aria-pressed")) === "false", "the star did not turn off");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("two quick taps show the latest words (no stale note), and the note never moves the page", async () => {
  const { ctx, page } = await open();
  await chain(page);
  const h1 = page.getByRole("heading", { level: 1 });
  const before = await h1.boundingBox();
  await star(page).tap();
  await star(page).tap();
  await page.waitForTimeout(500);
  expect((await opacity(note(page, "Removed from your favourites"))) > 0.9, "the second tap's words are not showing");
  const after = await h1.boundingBox();
  expect(Math.abs(after.y - before.y) < 1, `the title moved by ${after.y - before.y} px`);
  await ctx.close();
});

await step("360 px, Extra large text and Arabic: the note never overflows the page or runs into Back, and it reads right to left in Arabic", async () => {
  for (const [label, width, settings] of [["360 px", 360, {}], ["Extra large", 390, { textSize: "xlarge" }], ["Arabic", 390, { language: "ar" }]]) {
    const { ctx, page, errors } = await open({ viewport: { width, height: 844 } }, settings);
    await chain(page);
    await star(page).tap();
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over <= 0, `${label}: scrolls sideways by ${over} px`);
    const textBox = await page.locator("p[aria-hidden]").first().boundingBox();
    const backBox = await page.locator("main a").first().boundingBox(); // the Back pill is the first link (its name is translated in Arabic)
    expect(textBox && backBox, `${label}: cannot find the note or Back`);
    const clear = textBox.x >= backBox.x + backBox.width - 1 || textBox.x + textBox.width <= backBox.x + 1;
    expect(clear, `${label}: the note overlaps Back`);
    expect(errors.length === 0, `${label}: ` + errors.join(" | "));
    await ctx.close();
  }
});

await step("axe: the restaurant page with the note showing", async () => {
  const { ctx, page } = await open();
  await chain(page);
  await star(page).tap();
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`));
  expect(v.length === 0, v.join("; "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
