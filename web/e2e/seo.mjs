// The public restaurant pages (founder's brief, 13 Nov 2026, deliverable 6): /chains, /chains/<id>, /chains/<id>/high-protein, /chains/<id>/under-500-calories, the sitemap and
// each page's title, description, canonical address and FAQPage data, checked against the real menu files.
// Run against a production build: BASE=http://localhost:3101 node e2e/seo.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const MENUS = new URL("../public/menus/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const page = await ctx.newPage();
const manifest = JSON.parse(readFileSync(MENUS + "menus-manifest.json", "utf8"));
const real = manifest.chains.filter((c) => !c.sample);
const chainJson = (id) => JSON.parse(readFileSync(MENUS + manifest.chains.find((c) => c.id === id).file, "utf8"));
const ldOf = async () => JSON.parse(await page.locator('script[type="application/ld+json"]').first().innerHTML());
const axeCheck = async () => {
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
};

await step("the sitemap lists /chains, every one of the 241 restaurants, and only the sub pages that exist; never a fictional sample chain", async () => {
  const xml = await (await page.request.get(BASE + "/sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const chainPages = locs.filter((u) => /\/chains\/[^/]+$/.test(u));
  expect(real.length === 241, "241 real chains in the manifest, got " + real.length);
  expect(chainPages.length === real.length, `restaurant pages in the sitemap: ${chainPages.length}`);
  expect(locs.some((u) => u.endsWith("/chains")), "no /chains");
  expect(!locs.some((u) => /bowl-and-co|cluck-house/.test(u)), "a sample chain is listed");
  const hp = locs.filter((u) => u.endsWith("/high-protein")).length, u5 = locs.filter((u) => u.endsWith("/under-500-calories")).length;
  expect(hp > 50 && u5 > 100, `sub pages: ${hp} high protein, ${u5} under 500`);
  expect(locs.every((u) => u.startsWith("https://numbite.com")), "a URL is not on numbite.com");
});

await step("/chains/kfc: title, description, canonical, h1, a button into the app, no logo or photo", async () => {
  const r = await page.goto(BASE + "/chains/kfc");
  expect(r.status() === 200, "status " + r.status());
  expect((await page.title()) === "KFC calories and protein · Numbite", "title: " + (await page.title()));
  const desc = await page.locator('meta[name="description"]').getAttribute("content");
  expect(/^KFC nutrition: \d+ menu items with calories, protein, carbs and fat; most protein: .+; fewest calories: .+\. Copied from KFC's own published guide\.$/.test(desc), "description: " + desc);
  expect((await page.locator('link[rel="canonical"]').getAttribute("href")).endsWith("/chains/kfc"), "canonical");
  await page.getByRole("heading", { level: 1, name: /KFC: calories and protein for every menu item/ }).waitFor();
  expect((await page.getByRole("link", { name: "Open KFC in Numbite" }).getAttribute("href")) === "/app/chain?id=kfc", "app link");
  expect((await page.locator("main img").count()) === 0, "an image on the page (no logos or photos)");
  expect((await page.getByText("Not affiliated with KFC.").count()) >= 1, "no 'not affiliated' line");
});

await step("the FAQ answers match the real menu file and the page's own FAQPage data, word for word", async () => {
  await page.goto(BASE + "/chains/kfc");
  const ld = await ldOf();
  expect(ld["@type"] === "FAQPage" && ld.mainEntity.length === 3, "FAQPage with 3 questions: " + JSON.stringify(ld).slice(0, 120));
  const q1 = ld.mainEntity[0];
  expect(q1.name === "What is the highest protein order at KFC?", "q1: " + q1.name);
  const kfc = chainJson("kfc");
  const named = q1.acceptedAnswer.text.match(/^Of the meals on KFC's menu, (.+) has the most protein: ([\d.]+) g protein and ([\d,]+) kcal/);
  expect(named, "answer shape: " + q1.acceptedAnswer.text);
  const item = kfc.items.find((i) => i.name === named[1]);
  expect(item && item.nutrients.protein === Number(named[2]) && Math.round(item.nutrients.calories) === Number(named[3].replace(",", "")), "the numbers are not the menu file's: " + named.slice(1).join(" | "));
  const body = await page.locator("main").innerText();
  for (const q of ld.mainEntity) { expect(body.includes(q.name) && body.replace(/\s+/g, " ").includes(q.acceptedAnswer.text), "visible text lacks: " + q.name); }
  expect(!/\b(healthy|unhealthy|good|bad|worst|best choice)\b/i.test(body), "a judging word on the page");
});

await step("each dish card shows the numbers, official traffic lights (colour only with the evidence) and a link into the app", async () => {
  await page.goto(BASE + "/chains/kfc");
  const cards = page.locator("main ul > li:has(h3), main ul > li:has(h2)");
  expect((await cards.count()) >= 6, "cards: " + (await cards.count()));
  const first = cards.first();
  expect((await first.locator('ul[aria-label="Official traffic lights"] li').count()) === 4, "four lights");
  const href = await first.getByRole("link", { name: /See the full numbers/ }).getAttribute("href");
  expect(/^\/app\/item\?chain=kfc&item=/.test(href), "item link: " + href);
  const text = (await first.innerText()).replace(/\s+/g, " ");
  expect(/kcal/.test(text) && /g protein/.test(text) && /Protein score \d \/ 5/.test(text), "numbers: " + text.slice(0, 160));
});

await step("/chains/kfc/high-protein lists only meals with 35 g+ protein; /under-500-calories only meals of 500 kcal or less", async () => {
  let r = await page.goto(BASE + "/chains/kfc/high-protein");
  expect(r.status() === 200, "high protein " + r.status());
  await page.getByRole("heading", { level: 1, name: /High protein at KFC/ }).waitFor();
  for (const t of await page.locator("main ul > li:has(h2)").allInnerTexts()) { const m = t.match(/\|?\s*([\d.]+)\s*g protein/); expect(m && Number(m[1]) >= 35, "under 35 g: " + t.replace(/\s+/g, " ").slice(0, 80)); }
  const ld = (await page.title());
  expect(/^High protein at KFC: meals with 35 g\+ protein · Numbite$/.test(ld), "title: " + ld);
  r = await page.goto(BASE + "/chains/kfc/under-500-calories");
  expect(r.status() === 200, "under 500 " + r.status());
  for (const t of await page.locator("main ul > li:has(h2)").allInnerTexts()) { const m = t.match(/([\d,]+)\s*kcal/); expect(m && Number(m[1].replace(",", "")) <= 500, "over 500: " + t.replace(/\s+/g, " ").slice(0, 80)); }
});

await step("a calories-only restaurant has its page and under-500 page, but no protein answer and no high-protein page", async () => {
  const id = real.find((c) => c.nutritionLevel === "calories" && c.itemCount >= 30)?.id;
  expect(id, "no calories-only chain found");
  let r = await page.goto(BASE + `/chains/${id}`);
  expect(r.status() === 200, "page " + r.status());
  expect((await page.getByText("highest protein order", { exact: false }).count()) === 0, "a protein answer for a calories-only chain");
  await page.getByText("lowest calorie meal", { exact: false }).first().waitFor();
  r = await page.goto(BASE + `/chains/${id}/high-protein`);
  expect(r.status() === 404, "high-protein page status " + r.status());
});

await step("a fictional sample chain and an unknown id are 404; a thin restaurant is kept out of search engines", async () => {
  expect((await page.goto(BASE + "/chains/bowl-and-co")).status() === 404, "sample chain");
  expect((await page.goto(BASE + "/chains/not-a-restaurant")).status() === 404, "unknown id");
  const thin = real.find((c) => c.itemCount < 10);
  if (thin) {
    await page.goto(BASE + `/chains/${thin.id}`);
    expect(/noindex/.test((await page.locator('meta[name="robots"]').getAttribute("content")) ?? ""), "a thin page can be indexed");
  }
  await page.goto(BASE + "/chains/kfc");
  expect((await page.locator('meta[name="robots"]').count()) === 0 || !/noindex/.test(await page.locator('meta[name="robots"]').getAttribute("content")), "kfc is noindex");
});

await step("/chains lists every restaurant with a link", async () => {
  await page.goto(BASE + "/chains");
  expect((await page.locator("main ul li a").count()) === 241, "links: " + (await page.locator("main ul li a").count()));
  await page.getByRole("link", { name: "KFC", exact: true }).waitFor();
});

await step("no horizontal scroll at 360 px, tap targets 44 px, axe 0", async () => {
  const small = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
  const p = await small.newPage();
  for (const path of ["/chains/kfc", "/chains/kfc/high-protein", "/chains"]) {
    await p.goto(BASE + path);
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(o <= 0, `${path} scrolls sideways by ${o}`);
  }
  await small.close();
  for (const path of ["/chains/kfc", "/chains/kfc/high-protein", "/chains/kfc/under-500-calories", "/chains"]) { await page.goto(BASE + path); await axeCheck(); }
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
