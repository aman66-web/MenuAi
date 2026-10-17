// English only (founder 2026-10-16): no language screen in onboarding, no Language row in Settings, and a language stored on the phone (or synced
// from an account) still shows English, left to right. The dictionaries stay in lib/mm/locales, so bringing languages back is LANGUAGES_ENABLED.
// Run against a production build: BASE=http://localhost:3101 node e2e/languages.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const fresh = (locale = "en-GB") => browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", locale });
const done = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } });

await step("the first screen is the welcome screen: no language choice, no 'Change language' button, even for a Polish browser", async () => {
  const ctx = await fresh("pl-PL");
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome/);
  await page.getByRole("button", { name: "Get started" }).waitFor();
  expect((await page.getByRole("radio").count()) === 0, "no language radios");
  expect((await page.getByText("Choose your language").count()) === 0, "no language heading");
  expect((await page.getByRole("button", { name: "Change language" }).count()) === 0, "no Change language button");
  expect((await page.evaluate(() => document.documentElement.dir)) !== "rtl", "left to right");
  await ctx.close();
});

await step("Settings has no Language row", async () => {
  const ctx = await fresh();
  await ctx.addInitScript((s) => localStorage.setItem("mm.v1.settings", s), done);
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  expect((await page.getByRole("heading", { name: "Language" }).count()) === 0, "no Language heading");
  expect((await page.getByRole("button", { name: /Polski|English|العربية/ }).count()) === 0, "no language button");
  await ctx.close();
});

await step("a language left on the phone (or synced from an account) still shows English, left to right", async () => {
  const ctx = await fresh();
  await ctx.addInitScript((s) => localStorage.setItem("mm.v1.settings", s), JSON.stringify({ v: 1, data: { ...JSON.parse(done).data, language: "ar" } }));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  await page.getByRole("link", { name: "Eat out" }).first().waitFor();
  const [lang, dir] = await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
  expect(lang.startsWith("en") && dir !== "rtl", `html lang=${lang} dir=${dir}`);
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
