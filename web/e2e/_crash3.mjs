import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const base = "http://localhost:3103";
const cases = {
  vegetarian: { vegetarianOnly: true },
  vegan: { veganOnly: true },
  pescatarian: { pescatarianOnly: true },
  halal: { halalOnly: true },
  allergies: { avoidAllergens: ["milk", "gluten", "nuts"] },
  everything: { vegetarianOnly: true, halalOnly: true, noPork: true, noBeef: true, avoidAllergens: ["milk", "eggs", "gluten", "nuts", "soya", "fish"] },
};
for (const [name, prefs] of Object.entries(cases)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((p) => { localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false, ...p }, hasCompletedOnboarding: true } })); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 })); }, prefs);
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
  const t0 = Date.now();
  try {
    await page.goto(base + "/app/chain?id=mcdonalds");
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(1200);
    const link = page.locator("a[href*='/app/item']").first();
    const n = await page.locator("a[href*='/app/item']").count();
    if (n) { await link.click({ timeout: 6000 }); await page.waitForURL(/app\/item/, { timeout: 6000 }); await page.waitForTimeout(1200); }
    const txt = (await page.innerText("body")).slice(0, 80).replace(/\n/g, " ");
    console.log(name.padEnd(12), "dish links:", n, "|", ((Date.now() - t0) / 1000).toFixed(1) + "s", "|", errs.length ? "ERRORS " + errs.join("; ") : "no errors", "|", txt);
  } catch (e) { console.log(name.padEnd(12), "STOP", String(e.message).split("\n")[0].slice(0, 140), errs.join("; ")); }
  await ctx.close();
}
await b.close();
