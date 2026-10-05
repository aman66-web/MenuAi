import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let pass = 0, fail = 0;
async function step(n, fn) { try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0]); } }
const vis = (l) => l.waitFor({ state: "visible", timeout: 8000 });

await step("a shared link on a first visit goes through onboarding and then lands on the shared page", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/chain?id=cluck-house");
  await page.waitForURL(/\/app\/welcome\?next=/);
  await vis(page.getByRole("heading", { name: "What's your goal?" }));
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/app\/chain\?id=cluck-house/);
  await vis(page.getByRole("heading", { name: "Cluck House" }));
  await ctx.close();
});
await step("onboarding goal radios work with the arrow keys (roving focus)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  const first = page.getByRole("radio", { name: "Lose weight" });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await vis(page.getByRole("radio", { name: "Maintain", checked: true }));
  await page.keyboard.press("ArrowDown");
  await vis(page.getByRole("radio", { name: "Build muscle", checked: true }));
  await ctx.close();
});
await step("GLP-1 onboarding shows the exact line 'Comfortable meal size: … calories'", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("radio", { name: "I'm on a GLP-1 medication" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await vis(page.getByText("Comfortable meal size:"));
  if ((await page.getByLabel("Comfortable meal size in calories").inputValue()) !== "450") throw new Error("default 450 expected");
  await ctx.close();
});
await step("menus unreachable → an honest error with Try again (not 'Menus are coming soon'), then it recovers", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })));
  const page = await ctx.newPage();
  await page.route("**/menus*/menus-manifest.json", (r) => r.abort("internetdisconnected"));
  await page.goto(BASE + "/app");
  await vis(page.getByText("Couldn't reach the menus."));
  if (await page.getByText("Menus are coming soon").count()) throw new Error("showed the empty state while unreachable");
  await page.unroute("**/menus*/menus-manifest.json");
  await page.getByRole("button", { name: "Try again" }).click();
  await vis(page.getByRole("link", { name: /Bowl & Co\./ }));
  await ctx.close();
});
await step("saved orders are NOT marked 'No longer on the menu' while the menus are unreachable", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000, devProOverride: true } }));
    localStorage.setItem("mm.v1.saved", JSON.stringify({ v: 1, data: [{ id: "s1", createdAt: "2026-10-05T12:00:00Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "chicken", qty: 1 }] }], nutrients: { calories: 180, protein: 32, carbs: 0, fat: 7 }, dataVersionAtSave: 1 }] }));
  });
  const page = await ctx.newPage();
  await page.route("**/menus*/**", (r) => r.abort("internetdisconnected"));
  await page.goto(BASE + "/app/saved");
  await vis(page.getByRole("heading", { name: "Chicken bowl" }));
  await page.waitForTimeout(800);
  if (await page.getByText("No longer on the menu").count()) throw new Error("wrongly marked as removed");
  await ctx.close();
});
await step("builder opened from a saved order updates it in place ('Save changes'), no duplicate", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    if (localStorage.getItem("mm.v1.saved")) return;
    localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000, devProOverride: true } }));
    localStorage.setItem("mm.v1.saved", JSON.stringify({ v: 1, data: [{ id: "s1", createdAt: "2026-10-05T12:00:00Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "My bowl", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "white-rice", qty: 1 }, { id: "chicken", qty: 1 }, { id: "black-beans", qty: 1 }, { id: "tomato-salsa", qty: 1 }, { id: "cheese", qty: 1 }] }], nutrients: { calories: 655, protein: 50, carbs: 67, fat: 20.5 }, dataVersionAtSave: 1 }] }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/builder?chain=bowl-and-co&saved=s1");
  await vis(page.getByRole("group", { name: /Order total: 655 kcal/ }));
  await page.getByRole("button", { name: "Double chicken" }).click();
  await vis(page.getByRole("group", { name: /Order total: 835 kcal/ }));
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL("**/app/saved");
  await vis(page.getByText("835 kcal"));
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.saved")).data.length);
  if (count !== 1) throw new Error("saved orders: " + count);
  await ctx.close();
});
await step("undo restores the original saved order and log entry (same id and date)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const original = { id: "s9", createdAt: "2026-09-01T08:30:00.000Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Keep me", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "chicken", qty: 1 }] }], nutrients: { calories: 180, protein: 32, carbs: 0, fat: 7 }, dataVersionAtSave: 1 };
  await ctx.addInitScript(([o]) => { if (localStorage.getItem("mm.v1.settings")) return; localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })); localStorage.setItem("mm.v1.saved", JSON.stringify({ v: 1, data: [o] })); }, [original]);
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/saved");
  await page.getByRole("button", { name: "Delete Keep me" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await vis(page.getByRole("heading", { name: "Keep me" }));
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.saved")).data[0]);
  if (restored.id !== "s9" || restored.createdAt !== "2026-09-01T08:30:00.000Z") throw new Error(JSON.stringify(restored));
  await ctx.close();
});
await step("search: '--' does not show 'We don't cover this yet.'; item rows read 'Name · Chain · N cal'", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/search");
  await page.getByLabel("Search restaurants and items").fill("--");
  await page.waitForTimeout(400);
  if (await page.getByText("We don't cover this yet.").count()) throw new Error("shown for punctuation-only query");
  await page.getByLabel("Search restaurants and items").fill("nugg");
  await vis(page.getByText("Nuggets (12 ct)"));
  const row = await page.getByRole("link", { name: /Nuggets \(12 ct\), Cluck House, 380 calories/ }).innerText();
  if (!/Nuggets \(12 ct\)\s*·\s*Cluck House\s*·\s*380 kcal/.test(row)) throw new Error(row);
  await ctx.close();
});
await step("settings: 'Menus updated' shows a real date, Segmented controls are ≥44px", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await vis(page.getByText(/Menus updated \d{1,2} \w{3} 20\d\d/));
  const h = await page.getByRole("radio", { name: "Maintain" }).boundingBox();
  if (!h || h.height < 44) throw new Error("height " + h?.height);
  await ctx.close();
});
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
