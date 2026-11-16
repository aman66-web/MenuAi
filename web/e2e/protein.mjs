// "Cheapest protein" (founder's brief, D3.5): the pence-for-10-g leaderboard and the "sold on its protein, or everyday?" pairs, from the real Sainsbury's list.
// Run against a production build: BASE=http://localhost:3101 node e2e/protein.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const open = async (extra = {}, viewport = { width: 390, height: 844 }) => {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript((s) => localStorage.setItem("mm.v1.settings", s), JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, ...extra } }));
  return { ctx, page: await ctx.newPage() };
};
const loaded = async (page) => { await page.goto(BASE + "/app/groceries/protein"); await page.getByRole("heading", { level: 2, name: /cheapest protein foods/ }).waitFor({ timeout: 60000 }); };

await step("Groceries has a 'Cheapest protein' row that opens the screen", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("link", { name: "Cheapest protein" }).click();
  await page.getByRole("heading", { level: 1, name: "Cheapest protein" }).waitFor();
  await ctx.close();
});

await step("the leaderboard: 20 foods, cheapest first, each with pence for 10 g of protein, price per kg and protein per 100 g; no flour or noodles", async () => {
  const { ctx, page } = await open();
  await loaded(page);
  const rows = page.locator("ol > li");
  expect((await rows.count()) === 20, "rows: " + (await rows.count()));
  const pence = [];
  for (const t of await rows.allInnerTexts()) {
    const m = t.replace(/\s+/g, " ").match(/(\d+(?:\.\d)?)p per 10 g/);
    expect(m, "no pence figure: " + t.slice(0, 80));
    pence.push(Number(m[1]));
    expect(/£[\d.]+ a (kg|litre) · [\d.]+ g protein per 100 (g|ml)/.test(t.replace(/\s+/g, " ")), "price and protein line: " + t.replace(/\s+/g, " ").slice(0, 120));
    expect(!/(wholemeal|strong|plain|bread) flour|noodles/i.test(t), "flour or noodles at the top: " + t.slice(0, 60));
  }
  for (let i = 1; i < pence.length; i++) expect(pence[i] >= pence[i - 1], "not sorted at " + i + ": " + pence.join(", "));
  await ctx.close();
});

await step("the pairs: each shows both products, pence for 10 g, and 'Save £x on every 100 g of protein' worked out from them", async () => {
  const { ctx, page } = await open();
  await loaded(page);
  const pairs = page.locator("section[aria-labelledby='pairs-heading'] > ul > li");
  expect((await pairs.count()) === 5, "pairs: " + (await pairs.count()));
  for (const text of await pairs.allInnerTexts()) {
    const t = text.replace(/\s+/g, " ");
    const ps = [...t.matchAll(/(\d+(?:\.\d)?)p for 10 g of protein/g)].map((m) => Number(m[1]));
    expect(ps.length === 2, "two figures: " + t.slice(0, 100));
    const save = t.match(/Save £(\d+\.\d\d) on every 100 g of protein/);
    expect(save, "no saving: " + t.slice(0, 120));
    const expected = Math.round(Math.abs(ps[0] - ps[1]) * 10) / 100;
    expect(Math.abs(Number(save[1]) - expected) < 0.02, `saving ${save[1]} vs ${expected} from ${ps.join(" and ")}`);
    expect(!/\b(healthy|unhealthy|good|bad|worst|best choice|better nutrition)\b/i.test(t), "a judging word");
  }
  await ctx.close();
});

await step("the footnote says prices change, that dried foods are measured as sold, that it compares price only, and that it is not affiliated", async () => {
  const { ctx, page } = await open();
  await loaded(page);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(/Prices are what Sainsbury's showed on .+ and they change\./.test(text), "prices note");
  expect(/dried foods such as lentils cook up heavier/.test(text), "dried note");
  expect(/says nothing else about a food/.test(text), "price only");
  expect(/Not affiliated with Sainsbury's\./.test(text), "affiliation");
  await ctx.close();
});

await step("360 px and Extra large text: no sideways scroll; axe 0", async () => {
  const { ctx, page } = await open({ textSize: "xlarge" }, { width: 360, height: 740 });
  await loaded(page);
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o <= 0, "scrolls sideways by " + o);
  await ctx.close();
  const r = await open();
  await loaded(r.page);
  await r.page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await r.page.addScriptTag({ path: AXE });
  const v = (await r.page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
  await r.ctx.close();
});

await step("App Review 1.4.1: 'Where these numbers come from' under the page's first line opens the menu sources, with the protein-food line", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await loaded(page);
  await page.getByRole("button", { name: "Where these numbers come from" }).click();
  await page.getByRole("dialog", { name: "Where these numbers come from" }).getByText("Cheapest protein: a food counts as a protein food when it has at least 12 g of protein in every 100 g and at least 25% of its calories come from protein.").waitFor();
  await page.keyboard.press("Escape");
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
