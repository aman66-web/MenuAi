import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "glp1", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: true } });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
await ctx.addInitScript((s) => localStorage.setItem("mm.v1.settings", s), settings);
const pages = ["/app", "/app/eat-out", "/app/recipes/saved", "/app/groceries/list/recipes", "/app/welcome", "/app/search", "/app/chain?id=bowl-and-co", "/app/item?chain=bowl-and-co&item=chicken-bowl", "/app/builder?chain=bowl-and-co&item=chicken-bowl", "/app/saved", "/app/today", "/app/settings", "/app/settings/numbers", "/app/offline", "/app/chain?id=puccinos", "/app/item?chain=nandos&item=chicken-chorizo", "/app/recipes", "/app/recipes/view?id=chicken-curry&r=sainsburys", "/app/recipes/make?r=sainsburys", "/app/groceries/list", "/"];
let bad = 0;
for (const scale of [1, 1.5, 2]) {
  for (const path of pages) {
    const page = await ctx.newPage();
    await page.goto(BASE + path);
    await page.addStyleTag({ content: `html { font-size: ${scale * 100}% !important; }` });
    await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    const over = m.sw > m.cw + 1;
    if (over) { bad++; console.log(`OVERFLOW x${scale} ${path}: scrollWidth ${m.sw} > ${m.cw}`); await page.screenshot({ path: new URL(`./shots/overflow-${scale}-${path.replace(/\W+/g, "_")}.png`, import.meta.url).pathname }); }
    if (scale === 2 && path.startsWith("/app/builder")) await page.screenshot({ path: new URL("./shots/builder-200.png", import.meta.url).pathname });
    if (scale === 2 && path === "/app") await page.screenshot({ path: new URL("./shots/home-200.png", import.meta.url).pathname });
    await page.close();
  }
}
console.log(bad === 0 ? "No horizontal overflow at 100%, 150% or 200% text size (360px wide)." : `${bad} overflow problem(s)`);
await browser.close();
