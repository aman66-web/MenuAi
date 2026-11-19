// "Are you enjoying Numbite?" (founder 2026-11-17; lib/mm/ratingPrompt.ts) on the packed iPhone app with a pretend iPhone bridge: asked on Home only when due,
// a 5 asks for Apple's review pop-up (review.request) and the question never comes back, 1-4 thanks the person and waits, Not now waits, nothing when not due.
//   cd web && NEXT_PUBLIC_SIGN_IN_REQUIRED=0 NEXT_PUBLIC_SUPPORT_EMAIL=test@numbite.com npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BASE=http://localhost:3103 node e2e/rating.mjs
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3103";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
const day = (offset) => { const d = new Date(Date.now() + offset * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const due = { firstDay: day(-20), lastDay: day(-1), daysUsed: 5, lastAsked: null, reviewAsked: false };

async function phone(rating) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(({ s, r }) => {
    if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 }));
    localStorage.setItem("mm.v1.trialOffer", JSON.stringify({ v: 1, data: true }));
    if (r && !localStorage.getItem("mm.v1.rating")) localStorage.setItem("mm.v1.rating", JSON.stringify({ v: 1, data: r }));
    window.__bridgeCalls = [];
    window.webkit = { messageHandlers: { menumath: { postMessage(m) { window.__bridgeCalls.push(m.action); setTimeout(() => window.__menumathReply?.(m.id, { done: true }), 20); } } } };
  }, { s: onboarded, r: rating });
  const page = await ctx.newPage();
  await page.route("https://numbite.com/**", (r) => r.abort("internetdisconnected"));
  return { ctx, page };
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.rating") || "null")?.data);
const calls = (page) => page.evaluate(() => window.__bridgeCalls);
const question = (page) => page.getByRole("dialog", { name: "Are you enjoying Numbite?" });

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("due: asked on Home; a 5 asks for Apple's review pop-up, and the question never comes back", async () => {
  const { ctx, page } = await phone(due);
  await page.goto(BASE + "/app");
  await question(page).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, v.join(", "));
  await question(page).getByRole("button", { name: "5 out of 5" }).click();
  await question(page).waitFor({ state: "hidden" });
  await page.waitForTimeout(300);
  expect((await calls(page)).includes("review.request"), "Apple's review pop-up asked for: " + JSON.stringify(await calls(page)));
  expect((await stored(page)).reviewAsked === true, "remembered");
  await page.reload();
  await page.waitForTimeout(6000);
  expect(!(await question(page).count()) || !(await question(page).isVisible()), "not asked again");
  await ctx.close();
});

await step("1 to 4: a thank-you, no review pop-up, and not asked again for a while", async () => {
  const { ctx, page } = await phone(due);
  await page.goto(BASE + "/app");
  await question(page).waitFor({ timeout: 15000 });
  await question(page).getByRole("button", { name: "3 out of 5" }).click();
  const thanks = page.getByRole("dialog", { name: "Thank you" });
  await thanks.getByText("tell us in Settings › Contact us").waitFor();
  await thanks.getByRole("button", { name: "Done" }).click();
  await thanks.waitFor({ state: "hidden" });
  const s = await stored(page);
  expect(!(await calls(page)).includes("review.request") && s.reviewAsked === false && s.lastAsked === day(0), "no review pop-up, asked today: " + JSON.stringify(s));
  await page.reload();
  await page.waitForTimeout(6000);
  expect(!(await question(page).isVisible().catch(() => false)), "not asked again today");
  await ctx.close();
});

await step("Not now: no review pop-up, not asked again for a while", async () => {
  const { ctx, page } = await phone(due);
  await page.goto(BASE + "/app");
  await question(page).waitFor({ timeout: 15000 });
  await question(page).getByRole("button", { name: "Not now" }).click();
  await question(page).waitFor({ state: "hidden" });
  const s = await stored(page);
  expect(!(await calls(page)).includes("review.request") && s.lastAsked === day(0) && !s.reviewAsked, JSON.stringify(s));
  await ctx.close();
});

await step("not due (only 3 days of use), and never on other pages even when due", async () => {
  const early = await phone({ ...due, daysUsed: 2 });
  await early.page.goto(BASE + "/app");
  await early.page.waitForTimeout(6500);
  expect(!(await question(early.page).isVisible().catch(() => false)), "not asked after 3 days of use");
  await early.ctx.close();
  const other = await phone(due);
  await other.page.goto(BASE + "/app/eat-out");
  await other.page.waitForTimeout(6500);
  expect(!(await question(other.page).isVisible().catch(() => false)), "not asked on Eat out");
  await other.ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
