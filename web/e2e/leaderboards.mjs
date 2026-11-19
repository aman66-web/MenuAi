// Nutrition leaderboards (founder 2026-11-18): Groceries' shortcut opens them; six boards as big tiles; 20 rows each from every shop, every row with the logo of
// each supermarket that sells it (a product at several shops names them all); the board is kept in the address; Cheapest protein links its own page; axe.
// Run against a server: BASE=http://localhost:3005 node e2e/leaderboards.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
const page = await ctx.newPage();

await step("Groceries' shortcut opens the leaderboards: six boards, the first showing, 20 rows, each with a shop's logo", async () => {
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("link", { name: /^Nutrition leaderboards/ }).click();
  await page.getByRole("heading", { level: 1, name: "Nutrition leaderboards" }).waitFor({ timeout: 120000 });
  const tiles = page.getByRole("radiogroup", { name: "Leaderboards" }).getByRole("radio");
  expect((await tiles.count()) === 7, `seven boards, got ${await tiles.count()}`);
  for (const name of ["Most protein for the calories", "Most protein", "Most protein, meat-free", "Cheapest protein", "Most fibre", "Most carbs", "Fewest calories"]) await page.getByRole("radio", { name: new RegExp(`^${name}`) }).first().waitFor();
  expect((await tiles.first().getAttribute("aria-checked")) === "true", "the first board shows");
  const rows = page.locator("ol > li");
  await rows.first().waitFor({ timeout: 30000 });
  expect((await rows.count()) === 20, `20 rows, got ${await rows.count()}`);
  for (let i = 0; i < 20; i++) expect(/Sold at /.test(await rows.nth(i).innerText()), `row ${i + 1} names where it's sold`);
  expect((await page.locator("ol > li").first().locator("img, [aria-hidden] svg").count()) > 0, "logos drawn");
  const b = await tiles.first().boundingBox();
  expect(b.height >= 44, "board tiles are big targets");
});

await step("a board's own figures, best first; a product at several shops shows every shop; the board is kept in the address", async () => {
  await page.getByRole("radio", { name: /^Fewest calories/ }).click();
  await page.waitForURL((u) => u.searchParams.get("board") === "fewestKcal");
  await page.getByRole("heading", { level: 2, name: "Fewest calories" }).waitFor();
  // the figure box at the row's end (the shops' prices sit beside the logos)
  const values = await page.locator("ol > li").evaluateAll((lis) => lis.map((li) => Number((/(\d+)\s*kcal/.exec(li.querySelector("a > span:last-child")?.textContent ?? "") ?? [])[1])));
  expect(values.length === 20 && values.every((v, i) => i === 0 || values[i - 1] <= v), `lowest first: ${values.join(",")}`);
  await page.getByRole("radio", { name: /^Cheapest protein/ }).click();
  await page.waitForURL((u) => u.searchParams.get("board") === "cheapestProtein");
  const several = page.locator("ol > li").filter({ hasText: /Sold at [^\n]+ and / });
  expect((await several.count()) >= 1, "at least one row is sold at several shops");
  const logos = await several.first().locator("span[aria-hidden] > *").count();
  expect(logos >= 2, `every shop's logo on it, got ${logos}`);
  // each shop's own price under its logo (founder 2026-11-18: "You should also reference the price too"), and in what VoiceOver reads
  const columns = several.first().locator("span[aria-hidden].inline-flex > span");
  const prices = await columns.locator("> span:last-child").allInnerTexts();
  expect(prices.length === (await columns.count()) && prices.length >= 2 && prices.every((p) => /^£\d+\.\d\d$|^\d+p$|^In store$/.test(p)), `prices: ${prices.join(", ")}`);
  expect(/Sold at [^:]+: (£|\d|price in store)/.test(await several.first().innerText()), "the prices are read out with the shops");
  await page.getByRole("link", { name: "Compare protein products with everyday ones" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { level: 2, name: "Cheapest protein" }).waitFor({ timeout: 60000 });
  expect(await page.getByRole("radio", { name: /^Cheapest protein/ }).getAttribute("aria-checked") === "true", "kept after a reload");
});

await step("a row opens its product; no sideways scroll; axe", async () => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll");
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 100)}`));
  expect(v.length === 0, v.join(" | "));
  await page.locator("ol > li a").first().click();
  await page.waitForURL((u) => u.pathname.startsWith("/app/groceries/shop/item") || u.pathname.startsWith("/app/groceries/product"), { timeout: 60000 });
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
