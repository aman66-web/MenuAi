// Chains that publish calories only (nutrition_level "calories"): listed with a badge, filterable out, protein/carbs/fat
// shown as "not published" (never 0), and none of the tools that need them (Best for you, builder, log, save, share).
// A made-up chain is served through stubs, so the test doesn't depend on real data.
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, devProOverride: true } });

const chain = {
  schemaVersion: 1, id: "calorie-corner", name: "Calorie Corner", cuisine: "Cafe", builderType: "standard", aliases: [], sample: false,
  source: { title: "Calorie Corner menu (October 2026)", url: "https://example.com/menu", checkedOn: "2026-10-06" },
  nutritionLevel: "calories", categories: ["Mains"], components: [], combinations: [],
  items: [{ id: "fish-and-chips", name: "Fish and chips", category: "Mains", serving: "1 portion", nutrients: { calories: 910 }, tags: [], limitedTime: false, rankable: false, components: [], modifiers: [] }],
};
const chainText = JSON.stringify(chain);
const real = await (await fetch(BASE + "/menus/menus-manifest.json")).json();
const manifest = { ...real, chains: [...real.chains, { id: chain.id, name: chain.name, cuisine: chain.cuisine, file: "chain-calorie-corner.json", sha256: createHash("sha256").update(chainText).digest("hex"), contentHash: "0".repeat(64), sample: false, itemCount: 1, checkedOn: "2026-10-06", nutritionLevel: "calories" }] };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  await page.route("**/menus/menus-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/menus/chain-calorie-corner.json", (r) => r.fulfill({ contentType: "application/json", body: chainText }));
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("Eat out lists it as calories only, and 'Full nutrition only' hides it", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("link", { name: /Calorie Corner/ }).waitFor();
  await page.getByText("calories only").first().waitFor();
  await page.getByRole("button", { name: "Full nutrition only" }).click();
  await page.waitForTimeout(300);
  expect((await page.getByRole("link", { name: /Calorie Corner/ }).count()) === 0, "still listed with the filter on");
  await ctx.close();
});

await step("chain page: explains, no Best for you / meal chips / protein sorts", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/chain?id=calorie-corner");
  await page.getByText("publishes calories only").first().waitFor();
  await page.getByText("910 kcal").first().waitFor();
  expect((await page.getByRole("heading", { name: "Best for you" }).count()) === 0, "Best for you shown");
  expect((await page.getByRole("group", { name: "Meal" }).count()) === 0, "meal chips shown");
  const options = await page.getByLabel("Sort by").locator("option").allTextContents();
  expect(!options.some((o) => /protein/i.test(o)), `protein sorts offered: ${options.join(",")}`);
  expect(!(await page.locator("main").innerText()).includes("0g protein"), "a fake 0g protein appears");
  await ctx.close();
});

await step("item page: macros read 'not published', no ordering tools", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/item?chain=calorie-corner&item=fish-and-chips");
  await page.getByRole("heading", { name: "Fish and chips" }).waitFor();
  expect((await page.getByText("not published", { exact: true }).count()) >= 3, "protein, carbs and fat should each say not published");
  for (const name of ["Customise", "Log", "Save", "Share"]) expect((await page.getByRole("button", { name, exact: true }).count()) === 0, `${name} button shown`);
  await page.getByText("publishes calories only, so ordering").waitFor();
  await ctx.close();
});

await step("builder link says it isn't available", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/builder?chain=calorie-corner&item=fish-and-chips");
  await page.getByText("publishes calories only, so there are no protein").waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
