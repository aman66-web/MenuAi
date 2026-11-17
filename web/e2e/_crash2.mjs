import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const base = "http://localhost:3103";
async function run(name, fn) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } })); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 })); });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.split("\n")[0]));
  page.on("crash", () => errs.push("PAGE CRASHED"));
  try { await fn(page); console.log("ok   ", name, errs.length ? "| ERRORS: " + errs.join(" | ") : ""); }
  catch (e) { console.log("STOP ", name, "|", String(e.message).split("\n")[0].slice(0, 160), errs.length ? "| ERRORS: " + errs.join(" | ") : ""); }
  await ctx.close();
}
await run("Eat out > search McDonald's > restaurant > a dish", async (p) => {
  await p.goto(base + "/app/eat-out");
  await p.getByRole("searchbox").first().fill("mcdonald").catch(() => {});
  await p.getByRole("link", { name: /McDonald/ }).first().click();
  await p.waitForURL(/chain\?id=mcdonalds/);
  await p.locator("a[href*='/app/item']").first().click();
  await p.waitForURL(/app\/item/); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: /See the truth/ }).click({ timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(800);
});
await run("Favourites: save McDonald's, open it, open a dish", async (p) => {
  await p.goto(base + "/app/eat-out/favourites");
  await p.getByRole("searchbox").first().fill("mcdonald");
  await p.getByRole("button", { name: /Save/ }).first().click();
  await p.goto(base + "/app/chain?id=mcdonalds"); await p.locator("a[href*='/app/item']").first().click();
  await p.waitForURL(/app\/item/); await p.waitForTimeout(1000);
});
await run("Home + > Add food > restaurant meal > McDonald's dish", async (p) => {
  await p.goto(base + "/app");
  await p.getByRole("button", { name: /Add food|Add to Breakfast|Add to Lunch/ }).first().click({ timeout: 5000 });
  await p.getByRole("button", { name: /Choose a restaurant meal/ }).click();
  await p.getByRole("searchbox").first().fill("mcdonald big mac");
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /Big Mac|McDonald/ }).first().click();
  await p.waitForTimeout(1000);
});
await run("Search > a McDonald's dish > open > builder", async (p) => {
  await p.goto(base + "/app/search");
  await p.getByRole("searchbox").first().fill("big mac");
  await p.waitForTimeout(1500);
  await p.locator("a[href*='/app/item']").first().click();
  await p.waitForURL(/app\/item/); await p.waitForTimeout(1000);
});
await run("Compare: add a McDonald's dish", async (p) => {
  await p.goto(base + "/app/compare?tab=dishes");
  await p.getByRole("searchbox").first().fill("big mac");
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /Big Mac/ }).first().click({ timeout: 4000 });
  await p.waitForTimeout(800);
});
await b.close();
