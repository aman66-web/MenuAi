import { chromium } from "playwright-core";
import { execSync, spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function serverDown() { try { execSync('pkill -f "[n]ext-server"; pkill -f "[n]ext start"'); } catch {} }
async function serverUp() {
  spawn("npm", ["start", "--", "-p", "3101"], { cwd: new URL("..", import.meta.url).pathname, detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40; i++) { try { if ((await fetch("http://localhost:3101/app/offline")).ok) return; } catch {} await sleep(500); }
  throw new Error("server did not come back");
}
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
await ctx.addInitScript(() => {
  if (!localStorage.getItem("mm.v1.settings")) {
    localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: true } }));
  }
  // let the offline warm-up run in this headless test
  Object.defineProperty(navigator, "connection", { value: { effectiveType: "4g", saveData: false }, configurable: true });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror " + e.message));
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("PASS", n); };
const bad = (n, e) => { fail++; console.log("FAIL", n, "-", String(e).split("\n")[0]); };
async function step(n, fn) { try { await fn(); ok(n); } catch (e) { bad(n, e); console.log("   url:", page.url(), "| h1:", JSON.stringify(await page.locator("h1").allInnerTexts().catch(() => "?")), "| body:", (await page.locator("body").innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 200)); } }
const vis = (loc) => loc.waitFor({ state: "visible", timeout: 10000 });

await step("service worker registers and activates on /app", async () => {
  await page.goto(BASE + "/app");
  await vis(page.getByRole("heading", { name: "Where are you eating?" }));
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/app"))?.scope);
  if (!scope?.endsWith("/app")) throw new Error("scope " + scope);
});
await step("visit pages online so they are cached (one chain opened, one only warmed)", async () => {
  await page.goto(BASE + "/app/chain?id=bowl-and-co");
  await vis(page.getByRole("heading", { name: "Bowl & Co." }));
  await page.goto(BASE + "/app/item?chain=bowl-and-co&item=chicken-bowl");
  await vis(page.getByRole("heading", { name: "Chicken bowl" }));
  await page.goto(BASE + "/app");
  await vis(page.getByRole("heading", { name: "Where are you eating?" }));
  await page.waitForTimeout(7000); // warm-up fetches each chain page + menu in the background
});
await step("OFFLINE: reload an opened chain page → menu still shows", async () => {
  serverDown(); await sleep(800); await ctx.setOffline(true);
  await page.goto(BASE + "/app/chain?id=bowl-and-co");
  await vis(page.getByRole("heading", { name: "Bowl & Co." }));
  await vis(page.getByText("655 kcal · 50g protein · 67g carbs · 21g fat").first());
  await vis(page.getByText("You're offline.").first());
});
await step("OFFLINE: reload the opened item page", async () => {
  await page.goto(BASE + "/app/item?chain=bowl-and-co&item=chicken-bowl");
  await vis(page.getByRole("heading", { name: "Chicken bowl" }));
});
await step("OFFLINE: a chain that was only warmed in the background also opens", async () => {
  await page.goto(BASE + "/app/chain?id=cluck-house");
  await vis(page.getByRole("heading", { name: "Cluck House" }));
  await vis(page.getByText("Classic chicken sandwich").first());
});
await step("OFFLINE: client navigation Home → chain works", async () => {
  await page.goto(BASE + "/app");
  await vis(page.getByRole("heading", { name: "Where are you eating?" }));
  await vis(page.getByRole("link", { name: /Cluck House/ }));
  await page.getByRole("link", { name: /Cluck House/ }).click();
  await vis(page.getByRole("heading", { name: "Cluck House" }));
});
await step("OFFLINE: Save and Log still work (they are local)", async () => {
  await page.goto(BASE + "/app/item?chain=cluck-house&item=waffle-fries");
  await vis(page.getByRole("heading", { name: "Waffle fries (medium)" }));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await vis(page.getByText("Saved.").first());
});
await step("OFFLINE: an item never opened before still opens (static shell + warmed menu)", async () => {
  await page.goto(BASE + "/app/item?chain=cluck-house&item=side-salad");
  await vis(page.getByRole("heading", { name: "Side salad" }));
  await vis(page.getByText("Saturated fat"));
});
await step("OFFLINE: the order builder opens from a brand-new URL and totals live", async () => {
  await page.goto(BASE + "/app/builder?chain=bowl-and-co&item=chicken-bowl");
  await vis(page.getByRole("group", { name: /Order total: 655 kcal/ }));
  await page.getByRole("button", { name: "Double chicken" }).click();
  await vis(page.getByRole("group", { name: /Order total: 835 kcal/ }));
});
await step("OFFLINE: Saved, Today and Settings tabs open on a hard load", async () => {
  for (const [path, name] of [["/app/saved", "Saved"], ["/app/today", "Today"], ["/app/settings", "Settings"]]) {
    await page.goto(BASE + path);
    await vis(page.getByRole("heading", { name, exact: true }));
  }
});
await step("OFFLINE: an address that was never part of the app shows the friendly offline page", async () => {
  await page.goto(BASE + "/app/never-heard-of-it");
  await vis(page.getByRole("heading", { name: "You're offline" }));
});
await step("OFFLINE: a contact message is queued, then sent when back online", async () => {
  await page.goto(BASE + "/app/settings");
  await vis(page.getByRole("heading", { name: "Settings" }));
  await page.getByRole("button", { name: "Contact us" }).click();
  await page.getByLabel("Message").fill("Hello from offline");
  await page.getByRole("button", { name: "Send message" }).click();
  await vis(page.getByText("if you left an email, we'll reply soon"));
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.outbox") ?? "{}").data?.filter((i) => i.status === "pending").length);
  if (pending !== 1) throw new Error("pending=" + pending);
});
await step("BACK ONLINE: queued message is retried", async () => {
  const posts = [];
  await page.route("**/api/v1/support", async (route) => { posts.push(route.request().postData()); await route.fulfill({ status: 201, contentType: "application/json", body: "{}" }); });
  await serverUp(); await page.waitForTimeout(61000); // reconnect retries are spaced at least 60 s apart (flapping protection)
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  if (posts.length !== 1 || !posts[0].includes("Hello from offline") || !posts[0].includes('"source":"web"')) throw new Error("posts: " + JSON.stringify(posts));
  const statuses = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.outbox")).data.map((i) => i.status));
  if (statuses.join() !== "sent") throw new Error("statuses " + statuses);
});
console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "No page errors.");
await browser.close();
process.exit(fail ? 1 : 0);
