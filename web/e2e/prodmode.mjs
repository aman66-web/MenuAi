// The production default (no sample data) as it ships for the free launch (founder 2026-10-12: "make everything free right now, we dont
// add the ai features"): real chains only, every feature open with no paywall, nothing about Pro, subscriptions, trials or Pip's AI recipe
// maker anywhere, and the legal pages say there is nothing to buy. Build without NEXT_PUBLIC_SHOW_SAMPLE_DATA and NEXT_PUBLIC_PRO, start on
// port 3102: BASE=http://localhost:3102 node e2e/prodmode.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3102";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
await ctx.addInitScript(() => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: false } })); });
const page = await ctx.newPage();
const requests = [], posts = [], problems = [];
page.on("request", (r) => requests.push(new URL(r.url()).pathname));
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => problems.push("pageerror " + e.message));
await page.route("**/api/**", async (route) => { posts.push(route.request().url().replace(BASE, "") + " " + (route.request().postData() ?? "")); await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
let pass = 0, fail = 0;
async function step(n, fn) { try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0]); } }
const vis = (l) => l.waitFor({ state: "visible", timeout: 8000 });
// Words that must not appear anywhere while Pro and the AI recipe maker are off.
const FORBIDDEN = /\bPro\b|(?<!un)subscri|free trial|Try Pro|paywall|Anthropic|Ask Pip|Made by Pip|Claude/i;
async function noForbidden(where) {
  await page.waitForTimeout(400);
  const text = await page.locator("body").innerText();
  const hit = text.match(FORBIDDEN);
  if (hit) throw new Error(`${where}: "${hit[0]}" in "${text.slice(Math.max(0, hit.index - 60), hit.index + 60).replace(/\s+/g, " ")}"`);
}

await step("Eat out: real chains only (no sample data)", async () => {
  await page.goto(BASE + "/app/eat-out");
  await vis(page.getByText(/\d+ UK restaurants/));
  await page.waitForTimeout(500);
  if (requests.some((r) => r.startsWith("/menus-sample"))) throw new Error("sample menus were requested in production");
  if (await page.getByText("fictional sample data").count()) throw new Error("sample banner visible");
  if (await page.getByText(/Cluck House|Bowl & Co/).count()) throw new Error("a fictional chain is listed");
  await noForbidden("Eat out");
});
await step("Home shows today's calories for everyone (logging is open), with no Pro wording", async () => {
  await page.goto(BASE + "/app");
  await vis(page.getByRole("progressbar", { name: "Calories used today" }));
  if (await page.getByText("Log your meals to see what's left today.").count()) throw new Error("the Pro nudge shows on Home");
  if (await page.getByRole("button", { name: /See Pro|Try Pro/ }).count()) throw new Error("a Pro button on Home");
  await noForbidden("Home");
});
await step("a restaurant: Best for you shows the picks (no lock), an item logs and opens the builder without a paywall", async () => {
  await page.goto(BASE + "/app/chain?id=kfc");
  await vis(page.getByRole("heading", { level: 1 }));
  if (await page.getByText(/See your 5 best orders/).count()) throw new Error("Best for you is locked");
  await noForbidden("KFC");
  await page.locator("a[href*='/app/item?chain=kfc']").first().click();
  await vis(page.getByRole("button", { name: "Log" }));
  await page.getByRole("button", { name: "Log" }).click();
  await page.waitForTimeout(500);
  if (await page.getByRole("dialog").count()) {
    const d = await page.getByRole("dialog").innerText();
    if (FORBIDDEN.test(d)) throw new Error(`a paywall opened: ${d.slice(0, 120)}`);
  }
  await noForbidden("item");
  await page.getByRole("button", { name: "Customise" }).click();
  await page.waitForURL(/\/app\/builder/);
  await noForbidden("builder");
});
await step("Today and My meals: no Pro wording, no free-order limit", async () => {
  await page.goto(BASE + "/app/today");
  await vis(page.getByRole("heading", { level: 1 }));
  await noForbidden("Today");
  await page.goto(BASE + "/app/meals?tab=restaurant");
  await vis(page.getByRole("heading", { level: 1 }));
  if (await page.getByText(/free saved orders used/).count()) throw new Error("saved-order limit shown");
  await noForbidden("My meals");
});
await step("Recipes: no Ask Pip card, and the maker's address opens the recipes", async () => {
  await page.goto(BASE + "/app/recipes");
  await vis(page.getByRole("heading", { level: 1 }));
  await page.waitForTimeout(800);
  await noForbidden("Recipes");
  if (requests.some((r) => r.startsWith("/api/v1/recipe"))) throw new Error("the recipe server was asked");
  await page.goto(BASE + "/app/recipes/make?r=sainsburys");
  await page.waitForURL((u) => u.pathname.replace(/\/$/, "") === "/app/recipes");
});
await step("settings: no testing tools, no subscription section", async () => {
  await page.goto(BASE + "/app/settings");
  await vis(page.getByRole("heading", { name: "Settings" }));
  if (await page.getByText("Testing tools").count()) throw new Error("testing tools visible");
  if (await page.getByRole("heading", { name: "Subscription" }).count()) throw new Error("subscription section visible");
  await noForbidden("Settings");
});
await step("Eat out: honest empty state when no chain is published yet; request a chain still works", async () => {
  await page.route("**/menus/menus-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, dataVersion: 1, generatedAt: "2026-10-01T00:00:00Z", chains: [] }) }));
  await page.goto(BASE + "/app/eat-out");
  await vis(page.getByText("Menus are coming soon"));
  await page.getByRole("button", { name: "Request a chain" }).click();
  await page.getByLabel("Which restaurant?").fill("Real Burgers");
  await page.getByRole("button", { name: "Send request" }).click();
  await vis(page.getByText("most-requested chains get added first"));
  await page.unroute("**/menus/menus-manifest.json");
});
await step("an unknown chain says so politely", async () => {
  await page.goto(BASE + "/app/chain?id=bowl-and-co");
  await vis(page.getByText("That restaurant isn't available."));
});
await step("website: landing, privacy, terms and support say it's free, with no purchases, AI or Apple Health", async () => {
  for (const path of ["/", "/privacy", "/terms", "/support"]) {
    await page.goto(BASE + path);
    await vis(page.getByRole("heading", { level: 1 }));
    const text = await page.locator("body").innerText();
    const bad = text.match(/\bPro\b|(?<!un)subscri|Restore a purchase|Anthropic|Pip&apos;s recipe maker|recipe maker|Apple Health|TelemetryDeck/i);
    if (bad) throw new Error(`${path}: "${bad[0]}"`);
  }
  await page.goto(BASE + "/privacy");
  await vis(page.getByText("There is nothing to buy: every feature is free"));
  await page.goto(BASE + "/terms");
  await vis(page.getByText(/The app is free: there is nothing to buy in it/));
});
console.log(`\n${pass} passed, ${fail} failed`);
console.log(problems.length ? "console errors:\n" + [...new Set(problems)].join("\n") : "No console errors.");
await browser.close();
process.exit(fail ? 1 : 0);
