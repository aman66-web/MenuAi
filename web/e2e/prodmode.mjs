import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3102";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: true } })));
const page = await ctx.newPage();
const requests = [], posts = [], problems = [];
page.on("request", (r) => requests.push(new URL(r.url()).pathname));
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => problems.push("pageerror " + e.message));
await page.route("**/api/**", async (route) => { posts.push(route.request().url().replace(BASE, "") + " " + (route.request().postData() ?? "")); await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
let pass = 0, fail = 0;
async function step(n, fn) { try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0]); } }
const vis = (l) => l.waitFor({ state: "visible", timeout: 8000 });

await step("home: real chains only (no sample data), even with a stale Pro override in storage", async () => {
  await page.goto(BASE + "/app");
  await vis(page.getByText(/\d+ UK restaurants/));
  await page.waitForTimeout(500);
  if (requests.some((r) => r.startsWith("/menus-sample"))) throw new Error("sample menus were requested in production");
  if (await page.getByText("fictional sample data").count()) throw new Error("sample banner visible");
  if (await page.getByText(/Cluck House|Bowl & Co/).count()) throw new Error("a fictional chain is listed");
  if (await page.getByText("Left today").count()) throw new Error("Pro UI visible although Pro cannot be unlocked here");
});
await step("home: honest empty state when no chain is published yet", async () => {
  // the published data now has real chains, so serve an empty (valid) manifest to check the state a new deploy starts in
  await page.route("**/menus/menus-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, dataVersion: 1, generatedAt: "2026-10-01T00:00:00Z", chains: [] }) }));
  await page.goto(BASE + "/app");
  await vis(page.getByText("Menus are coming soon"));
  await vis(page.getByRole("button", { name: "Request a chain" }));
  await page.waitForTimeout(500);
  if (requests.some((r) => r.startsWith("/menus-sample"))) throw new Error("sample menus were requested in production");
  if (await page.getByText("fictional sample data").count()) throw new Error("sample banner visible");
  if (await page.getByText("Left today").count()) throw new Error("Pro UI visible although Pro cannot be unlocked here");
  await vis(page.getByText("Your targets:"));
});
await step("a stale devProOverride does nothing in production: Today shows the free explainer and the honest paywall", async () => {
  await page.goto(BASE + "/app/today");
  await vis(page.getByRole("button", { name: "See Pro" }));
  await page.getByRole("button", { name: "See Pro" }).click();
  await vis(page.getByText("Pro isn't on the web yet."));
  if (await page.getByRole("button", { name: /Unlock Pro preview/ }).count()) throw new Error("testing unlock is visible in production");
});
await step("paywall email goes to the waitlist API with source web-app-pro", async () => {
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Tell me when Pro is ready" }).click();
  await vis(page.getByText("you're on the list"));
  if (!posts.some((p) => p.startsWith("/api/waitlist") && p.includes('"source":"web-app-pro"') && p.includes("someone@example.com"))) throw new Error(posts.join(" | "));
});
await step("settings: no testing tools, subscription says Free", async () => {
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/settings");
  await vis(page.getByRole("heading", { name: "Settings" }));
  if (await page.getByText("Testing tools").count()) throw new Error("testing tools visible");
  await vis(page.getByText("Pro isn't available on the web yet."));
});
await step("an unknown chain says so politely", async () => {
  await page.goto(BASE + "/app/chain?id=bowl-and-co");
  await vis(page.getByText("That restaurant isn't available."));
});
await step("request a chain still works from the empty state", async () => {
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Request a chain" }).click();
  await page.getByLabel("Which restaurant?").fill("Real Burgers");
  await page.getByRole("button", { name: "Send request" }).click();
  await vis(page.getByText("most-requested chains get added first"));
});
await step("marketing site unchanged: landing page, privacy page mention the web app", async () => {
  await page.goto(BASE + "/");
  await vis(page.getByRole("heading", { level: 1 }));
  await page.goto(BASE + "/privacy");
  await vis(page.getByText("web app (at /app on this website)"));
});
console.log(`\n${pass} passed, ${fail} failed`);
console.log(problems.length ? "console errors:\n" + [...new Set(problems)].join("\n") : "No console errors.");
await browser.close();
process.exit(fail ? 1 : 0);
