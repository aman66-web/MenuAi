// Languages: the language screen comes first, a choice switches the screen straight away, the app keeps it (also after a reload,
// with <html lang/dir> set before the page shows), right-to-left for Arabic, Settings › Language switches back, axe in RTL.
// Expected words are read from the dictionaries themselves (lib/mm/locales/*.json).
// Run against a production build: BASE=http://localhost:3101 node e2e/languages.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const dict = (code) => JSON.parse(readFileSync(new URL(`../lib/mm/locales/${code}.json`, import.meta.url), "utf8"));
const pl = dict("pl");
const ar = dict("ar");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const fresh = () => browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", locale: "en-GB" });

await step("first screen is the language screen; Polski switches it to Polish and the app stays Polish after a reload", async () => {
  const ctx = await fresh();
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome/);
  await page.getByRole("heading", { level: 1, name: "Choose your language" }).waitFor();
  expect((await page.getByRole("radio").count()) === 11, "11 languages");
  expect((await page.getByRole("radio", { name: /English/ }).getAttribute("aria-checked")) === "true", "English pre-selected for an en-GB browser");
  await page.getByRole("radio", { name: /Polski/ }).click();
  await page.getByRole("heading", { level: 1, name: pl["Choose your language"] }).waitFor();
  expect((await page.evaluate(() => document.documentElement.lang)) === "pl", "html lang=pl");
  await page.getByRole("button", { name: pl["Continue"] }).click();
  await page.getByRole("button", { name: pl["Let's go"] }).waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.language);
  expect(saved === "pl", `saved language ${saved}`);
  await page.reload();
  await page.getByRole("button", { name: pl["Continue"] }).waitFor(); // back on the language screen (onboarding not finished), still in Polish
  expect((await page.evaluate(() => document.documentElement.lang)) === "pl", "html lang=pl after reload");
  await ctx.close();
});

await step("a finished onboarding in Polish: Home and the tab bar in Polish; Settings › Language back to English", async () => {
  const ctx = await fresh();
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, language: "pl" } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { level: 1, name: pl["Settings"] }).waitFor();
  await page.getByRole("link", { name: pl["Home"] }).first().waitFor();
  await page.getByRole("button", { name: /Polski/ }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /English/ }).click();
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  expect((await page.evaluate(() => document.documentElement.lang)) === "en-GB", "html lang back to en-GB");
  await ctx.close();
});

await step("Arabic reads right to left, from the first paint after a reload", async () => {
  const ctx = await fresh();
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("radio", { name: /العربية/ }).click();
  await page.getByRole("heading", { level: 1, name: ar["Choose your language"] }).waitFor();
  expect((await page.evaluate(() => document.documentElement.dir)) === "rtl", "dir=rtl");
  await page.getByRole("button", { name: ar["Continue"] }).click();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("mm.v1.settings")); s.data.hasCompletedOnboarding = true; localStorage.setItem("mm.v1.settings", JSON.stringify(s)); });
  await page.goto(BASE + "/app");
  expect((await page.evaluate(() => document.documentElement.dir)) === "rtl", "dir=rtl on Home");
  await page.getByRole("link", { name: ar["Home"] }).first().waitFor();
  await ctx.close();
});

for (const scheme of ["light", "dark"]) {
  await step(`axe in Arabic (right to left), ${scheme}: language screen, Home, a recipe`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme: scheme });
    await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, language: "ar", shops: ["sainsburys"] } })));
    const page = await ctx.newPage();
    await page.route("**/assets.sainsburys-groceries.co.uk/**", (r) => r.abort());
    for (const path of ["/app/welcome", "/app", "/app/recipes/view?id=chicken-curry&r=sainsburys"]) {
      await page.goto(BASE + path);
      await page.locator("h1").first().waitFor();
      await page.waitForTimeout(800);
      await page.addScriptTag({ path: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
      expect(v.length === 0, `${path}: ${v.join(", ")}`);
    }
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
