import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "glp1", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: true } });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
await ctx.addInitScript((s) => localStorage.setItem("mm.v1.settings", s), settings);
const pages = ["/app", "/app/eat-out", "/app/meals", "/app/groceries/list/recipes", "/app/welcome", "/app/search", "/app/chain?id=bowl-and-co", "/app/item?chain=bowl-and-co&item=chicken-bowl", "/app/builder?chain=bowl-and-co&item=chicken-bowl", "/app/meals?tab=restaurant", "/app/today", "/app/today?d=2019-01-01", "/app/settings", "/app/settings/numbers", "/app/community", "/app/community/friends", "/app/community/inbox", "/app/community/blog", "/app/community/blog/view?id=where-our-numbers-come-from", "/app/offline", "/app/chain?id=puccinos", "/app/item?chain=nandos&item=chicken-chorizo", "/app/recipes", "/app/recipes/view?id=chicken-curry&r=sainsburys", "/app/groceries/list", "/app/groceries", "/app/groceries/shop?r=sainsburys", "/app/groceries/search", "/app/compare?tab=food", "/app/compare?tab=dish", "/app/chain?id=kfc", "/", "/f#K7M2QXWA"];
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
// Pip's onboarding, screen by screen: the language screen, Pip's arrival, the five stops of the walk, the eight questions and the last screen.
for (const scale of [1, 1.5, 2]) {
  const c = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
  const page = await c.newPage();
  await page.goto(BASE + "/app/welcome");
  await page.addStyleTag({ content: `html { font-size: ${scale * 100}% !important; }` });
  const check = async (label) => {
    await page.waitForTimeout(1900); // the arrival animation and its burst
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (m.sw > m.cw + 1) { bad++; console.log(`OVERFLOW x${scale} onboarding "${label}": scrollWidth ${m.sw} > ${m.cw}`); }
  };
  const press = (name) => page.getByRole("button", { name, exact: true }).click();
  await press("Continue"); // language
  await press("Get started");
  await check("Pip arrives");
  await press("Show me around");
  for (const tab of ["Home", "Eat out", "Groceries", "Recipes", "Community"]) { await check(`walk: ${tab}`); await press(tab === "Community" ? "Let's go!" : "Continue"); }
  for (const q of ["goal", "avoid"]) { await check(`question: ${q}`); await press("Continue"); }
  await check("question: about you");
  await page.getByLabel("Age", { exact: true }).fill("34");
  await press("Continue");
  await check("question: your size");
  await page.getByLabel("Stone").fill("11"); await page.getByLabel("Pounds").fill("4"); await page.getByLabel("Feet").fill("5"); await page.getByLabel("Inches").fill("10");
  await press("Continue");
  for (const q of ["how active", "targets", "shops", "text size"]) { await check(`question: ${q}`); await press("Continue"); }
  await check("all set");
  await press("Continue");
  await page.locator('a[href^="/app/recipes/view?id="]').first().waitFor({ timeout: 30000 });
  await check("choose a recipe");
  await c.close();
}
console.log(bad === 0 ? "No horizontal overflow at 100%, 150% or 200% text size (360px wide)." : `${bad} overflow problem(s)`);
await browser.close();
