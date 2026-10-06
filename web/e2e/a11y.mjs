import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = (pro) => JSON.stringify({ v: 1, data: { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, dismissedTargetsCard: false, paywallDismissCount: 0, proActionCount: 0, devProOverride: pro } });
const saved = JSON.stringify({ v: 1, data: [{ id: "s1", createdAt: "2026-10-05T12:00:00Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl · double chicken", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "white-rice", qty: 1 }, { id: "chicken", qty: 2 }, { id: "black-beans", qty: 1 }, { id: "tomato-salsa", qty: 1 }, { id: "cheese", qty: 1 }] }], nutrients: { calories: 835, protein: 82, carbs: 67, fat: 27.5 }, dataVersionAtSave: 1 }] });
const log = JSON.stringify({ v: 1, data: [{ id: "l1", loggedAt: new Date().toISOString(), chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl", nutrients: { calories: 655, protein: 50, carbs: 67, fat: 20.5 }, source: "item" }] });

const pages = [
  ["welcome", "/app/welcome", false, async () => {}],
  ["home", "/app", true, async () => {}],
  ["search", "/app/search", true, async (p) => { await p.getByLabel("Search restaurants and items").fill("chicken"); await p.waitForTimeout(800); }],
  ["chain (free)", "/app/chain?id=bowl-and-co", false, async (p) => { await p.waitForTimeout(500); }],
  ["chain (pro)", "/app/chain?id=bowl-and-co", true, async (p) => { await p.waitForTimeout(500); }],
  ["item", "/app/item?chain=cluck-house&item=pumpkin-shake", true, async () => {}],
  ["builder", "/app/builder?chain=bowl-and-co&item=chicken-bowl", true, async () => {}],
  ["paywall", "/app/today", false, async (p) => { await p.getByRole("button", { name: /See Pro/ }).click(); await p.waitForTimeout(400); }],
  ["report sheet", "/app/item?chain=cluck-house&item=waffle-fries", true, async (p) => { await p.getByRole("button", { name: "Report a number" }).click(); await p.waitForTimeout(400); }],
  ["saved", "/app/saved", true, async () => {}],
  ["today", "/app/today", true, async () => {}],
  ["settings", "/app/settings", true, async () => {}],
  ["numbers", "/app/settings/numbers", true, async () => {}],
  ["offline", "/app/offline", true, async () => {}],
  ["home by type", "/app", false, async (p) => { await p.getByRole("group", { name: "Browse by type" }).getByRole("button", { name: /^Coffee/ }).click(); await p.waitForTimeout(300); }],
  ["search recent", "/app/search", false, async (p) => { await p.evaluate(() => localStorage.setItem("mm.v1.recentSearches", '["latte"]')); await p.reload(); await p.waitForTimeout(600); }],
  ["long menu", "/app/chain?id=puccinos", false, async (p) => { await p.getByRole("button", { name: "No pork" }).click(); await p.getByRole("button", { name: "Tea", exact: true }).click(); await p.waitForTimeout(1500); }],
  ["menu search", "/app/chain?id=puccinos", false, async (p) => { await p.getByRole("searchbox").fill("latte oat"); await p.waitForTimeout(400); }],
  ["real item", "/app/item?chain=nandos&item=chicken-chorizo", false, async () => {}],
  ["site", "/", false, async () => {}],
];

let total = 0;
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: "block" });
  for (const [name, path, pro, prep] of pages) {
    const page = await ctx.newPage();
    await page.addInitScript(([s, sv, lg]) => { localStorage.setItem("mm.v1.settings", s); localStorage.setItem("mm.v1.saved", sv); localStorage.setItem("mm.v1.log", lg); }, [settings(pro), saved, log]);
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await prep(page);
    await page.addScriptTag({ path: AXE });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
    const v = result.violations;
    total += v.length;
    console.log(`${scheme.padEnd(5)} ${name.padEnd(14)} ${v.length === 0 ? "ok" : v.length + " violation(s)"}`);
    for (const x of v) console.log(`      [${x.impact}] ${x.id}: ${x.help} — ${x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    await page.close();
  }
  await ctx.close();
}
console.log("\nTotal violations:", total);
await browser.close();
