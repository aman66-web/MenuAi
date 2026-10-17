// Tabs remember where you were (founder 2026-10-16): leave a tab from a page deep inside it and the tab opens that page again; tapping the tab you are
// already on goes to its first page. Run against a production build: BASE=http://localhost:3101 node e2e/tabs.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const done = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } });
const fresh = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, done);
  return { ctx, page: await ctx.newPage() };
};
const tab = (page, name) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });
const here = (page) => new URL(page.url()).pathname + new URL(page.url()).search;

await step("a tab opens the page you were on in it; the open tab goes to its first page", async () => {
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("link", { name: /Cluck House/ }).first().click();
  await page.waitForURL(/\/app\/chain\?id=cluck-house/);
  await tab(page, "Recipes").click();
  await page.waitForURL(/\/app\/recipes/);
  expect(here(page) === "/app/recipes", "Recipes opens its first page: " + here(page));
  await tab(page, "Eat out").click();
  await page.waitForURL(/\/app\/chain\?id=cluck-house/);
  expect(await tab(page, "Eat out").getAttribute("aria-current") === "page", "Eat out stays lit on the restaurant page");
  await tab(page, "Eat out").click();
  await page.waitForURL(/\/app\/eat-out$/);
  await tab(page, "Recipes").click();
  await page.waitForURL(/\/app\/recipes/);
  await tab(page, "Eat out").click();
  await page.waitForURL(/\/app\/eat-out$/);
  expect(here(page) === "/app/eat-out", "after the first page was shown again, nothing is remembered: " + here(page));
  await ctx.close();
});

await step("it survives a reload of the page, keeps the query, and never holds a # fragment", async () => {
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.getByRole("heading", { level: 1, name: "Chicken curry with rice" }).waitFor({ timeout: 60000 });
  await tab(page, "Eat out").click();
  await page.waitForURL(/\/app\/eat-out/);
  await page.reload();
  await tab(page, "Recipes").click();
  await page.waitForURL(/\/app\/recipes\/view\?id=chicken-curry&r=sainsburys/);
  const stored = await page.evaluate(() => sessionStorage.getItem("mm.tabs"));
  expect(stored && !stored.includes("#"), "stored: " + stored);
  await page.goto(BASE + "/app/community/friends#ABCD2345");
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => sessionStorage.getItem("mm.tabs"));
  expect(!after || !after.includes("ABCD2345"), "a code after # must never be remembered: " + after);
  await ctx.close();
});

await step("a hand-edited store cannot send a tab outside its own pages", async () => {
  const { ctx, page } = await fresh();
  await page.addInitScript(() => sessionStorage.setItem("mm.tabs", JSON.stringify({ "/app/eat-out": "https://evil.example/app/chain", "/app/recipes": "/app/chain?id=x" })));
  await page.goto(BASE + "/app");
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  for (const [name, want] of [["Eat out", "/app/eat-out"], ["Recipes", "/app/recipes"]]) {
    const href = await tab(page, name).getAttribute("href");
    expect(href === want, `${name} points at ${href}`);
  }
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
