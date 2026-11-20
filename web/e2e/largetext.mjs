import { chromium } from "playwright-core";
import { recipeTiles } from "./welcome-steps.mjs";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// Pip's tips on the real screens (CoachMarks, 2026-11-18) are stopped in this test, as if the person had pressed "Stop the tips": e2e/coach.mjs covers them.
{
  const open = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await open(options);
    await c.addInitScript(() => { try { if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } })); } catch { /* storage blocked */ } });
    return c;
  };
}
const settings = JSON.stringify({ v: 1, data: { goal: "glp1", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: true } });
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
await ctx.addInitScript((s) => { localStorage.setItem("mm.v1.settings", s); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); }, settings);
const pages = ["/app", "/app/welcome?showcase=1", "/app/eat-out", "/app/meals", "/app/groceries/list/recipes", "/app/welcome", "/app/search", "/app/chain?id=bowl-and-co", "/app/item?chain=bowl-and-co&item=chicken-bowl", "/app/builder?chain=bowl-and-co&item=chicken-bowl", "/app/meals?tab=restaurant", "/app/today", "/app/today?d=2019-01-01", "/app/settings", "/app/settings/numbers", "/app/settings/sources", "/app/community", "/app/community/friends", "/app/community/inbox", "/app/community/blog", "/app/community/blog/view?id=where-our-numbers-come-from", "/app/offline", "/app/chain?id=puccinos", "/app/item?chain=nandos&item=chicken-chorizo", "/app/recipes", "/app/recipes/view?id=chicken-curry&r=sainsburys", "/app/groceries/list", "/app/groceries", "/app/groceries/shop?r=sainsburys", "/app/groceries/search", "/app/compare?tab=food", "/app/compare?tab=dish", "/app/chain?id=kfc", "/", "/f#K7M2QXWA"];
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
// The welcome steps, screen by screen (the onboarding redesign meeting of 20 November 2026): the cover and all eleven steps, with nothing picked for the person
// (the goal and the activity are tapped, and the foods-to-avoid button says "Nothing to avoid"), a first recipe chosen, the week made, and the account step.
for (const scale of [1, 1.5, 2]) {
  const c = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
  const page = await c.newPage();
  await page.goto(BASE + "/app/welcome");
  await page.addStyleTag({ content: `html { font-size: ${scale * 100}% !important; }` });
  const check = async (label) => {
    await page.waitForTimeout(1200); // Pip's jump on step 1, the windows' fade
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (m.sw > m.cw + 1) { bad++; console.log(`OVERFLOW x${scale} onboarding "${label}": scrollWidth ${m.sw} > ${m.cw}`); }
  };
  const press = (name) => page.getByRole("button", { name, exact: true }).click();
  await check("welcome cover");
  await press("Get started");
  await check("1 goal");
  await page.getByRole("radio", { name: /^Maintain/ }).click();
  await press("Continue");
  await check("2 avoid");
  await press("Nothing to avoid");
  await page.getByRole("radiogroup", { name: "Restaurants" }).waitFor({ timeout: 45000 }).catch(() => undefined);
  await check("3 know before you order");
  await press("Next: where you shop");
  await check("4 shops");
  await press("Continue");
  const tile = recipeTiles(page).first();
  await tile.waitFor({ timeout: 45000 }).then(() => tile.click()).catch(() => undefined);
  await check("5 recipes, one chosen");
  await press("Next: your daily numbers");
  await check("6 about you");
  await page.getByLabel("Age", { exact: true }).fill("34");
  await press("Continue");
  await check("7 your height and weight");
  await page.getByLabel("Stone").fill("11"); await page.getByLabel("Pounds").fill("4"); await page.getByLabel("Feet").fill("5"); await page.getByLabel("Inches").fill("10");
  await press("Continue");
  await check("8 how active");
  await page.getByRole("radio", { name: "Lightly active", exact: true }).click();
  await press("Work out my numbers");
  await check("9 targets");
  await press("Next: plan my week");
  await page.getByRole("region", { name: "A look at Meal plan, on Home" }).locator("h2, p[role='status']").first().waitFor({ timeout: 45000 }).catch(() => undefined);
  await check("10 your week, planned");
  await press("Next: save your numbers");
  await check("11 save your goal and numbers");
  await c.close();
}
console.log(bad === 0 ? "No horizontal overflow at 100%, 150% or 200% text size (360px wide)." : `${bad} overflow problem(s)`);
await browser.close();
