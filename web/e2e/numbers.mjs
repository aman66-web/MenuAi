// Find a restaurant by your numbers and allergies (founder 2026-10-15): Eat out › "Find by numbers or allergies". Type calories, protein, carbs or fat
// and pick allergies; only the restaurants with a dish that fits are listed, with how many; a restaurant opens with the same numbers applied.
// Uses the build's real published menus (menus-search.json + menus-numbers.json) and, with samples on, the two fictional chains.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function open(setup) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  if (setup) await setup(page);
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("button", { name: "Find by numbers or allergies" }).click();
  return { ctx, page };
}
const heading = (page) => page.getByRole("heading", { name: /restaurants? ha(s|ve) dishes that fit/ });
const count = async (page) => Number(/^(\d+)/.exec(await heading(page).textContent())?.[1] ?? "0");

await step("typing calories and protein lists the restaurants with fitting dishes, most first, and says how many dishes fit", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("500");
  await page.getByLabel("Protein, at least (g)").fill("35");
  await heading(page).waitFor({ timeout: 60000 });
  const n = await count(page);
  expect(n > 5, `expected several restaurants, got ${n}`);
  const rows = page.locator('a[href^="/app/chain?id="]').filter({ hasText: /dish(es)? fits?/ });
  expect((await rows.count()) > 0, "rows");
  const first = await rows.first().textContent();
  expect(/\d+ dishes? fits?/.test(first ?? "") && /kcal/.test(first ?? "") && /g protein/.test(first ?? ""), "row says how many dishes fit and shows one: " + first);
  // every restaurant is listed once, with the most dishes first
  const counts = (await rows.allTextContents()).map((t) => Number(/(\d+) dish/.exec(t)?.[1] ?? 1)).slice(0, 12);
  expect(counts.every((c, i) => i === 0 || counts[i - 1] >= c), "most dishes first: " + counts.join(","));
  await ctx.close();
});

await step("every number must hold: adding a fat limit never adds restaurants, and a clear button empties it", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("600");
  await page.getByLabel("Protein, at least (g)").fill("30");
  await heading(page).waitFor({ timeout: 60000 });
  const wide = await count(page);
  await page.getByLabel("Fat, up to (g)").fill("15");
  await page.waitForTimeout(600);
  const narrow = await count(page);
  expect(narrow > 0 && narrow < wide, `fat limit: ${wide} -> ${narrow}`);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("heading", { name: "All restaurants" }).waitFor();
  expect((await heading(page).count()) === 0, "back to every restaurant");
  await ctx.close();
});

await step("a restaurant opens with the same numbers applied, and 'Show all dishes' lifts them", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("500");
  await page.getByLabel("Protein, at least (g)").fill("35");
  await heading(page).waitFor({ timeout: 60000 });
  const row = page.locator('a[href^="/app/chain?id="]').filter({ hasText: /dish(es)? fits?/ }).first();
  const href = await row.getAttribute("href");
  expect(/kcal=500/.test(href ?? "") && /protein=35/.test(href ?? ""), "the link carries the numbers: " + href);
  await row.click();
  await page.getByText("Your numbers:").waitFor({ timeout: 30000 });
  expect(await page.getByText("up to 500 kcal").isVisible(), "kcal limit said");
  expect(await page.getByText("35 g+ protein").isVisible(), "protein limit said");
  await page.getByText(/\d+ of \d+ items/).waitFor();
  await page.getByRole("button", { name: "Show all dishes" }).click();
  expect((await page.getByText("Your numbers:").count()) === 0, "numbers lifted");
  await ctx.close();
});

await step("allergies: picking Milk narrows the list, the link carries it, and the restaurant's page applies it", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("700");
  await heading(page).waitFor({ timeout: 60000 });
  const before = await count(page);
  await page.getByRole("button", { name: "Milk", exact: true }).click();
  await page.waitForTimeout(800);
  const after = await count(page);
  expect(after < before, `milk: ${before} -> ${after}`);
  await page.getByText(/don't publish an allergen guide/).waitFor();
  await page.getByText(/each restaurant's own allergen guide/).first().waitFor();
  const row = page.locator('a[href^="/app/chain?id="]').filter({ hasText: /dish(es)? fits?/ }).first();
  expect(/avoid=milk/.test((await row.getAttribute("href")) ?? ""), "link carries milk");
  await row.click();
  await page.getByText("Your diet:").first().waitFor({ timeout: 30000 });
  expect(await page.getByText("No milk").first().isVisible(), "page applies the allergy");
  await ctx.close();
});

await step("nothing fits: an honest empty state, no zero heading", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("5");
  await page.getByLabel("Protein, at least (g)").fill("60");
  await page.getByText("No restaurant has a dish that fits all of that").first().waitFor({ timeout: 60000 });
  expect((await heading(page).count()) === 0, "no '0 restaurants' heading");
  await ctx.close();
});

await step("if the numbers file can't be loaded, protein asks say so, and calories alone still work", async () => {
  const { ctx, page } = await open((p) => p.route("**/menus/menus-numbers.json", (r) => r.fulfill({ status: 404, body: "" })));
  await page.getByLabel("Protein, at least (g)").fill("30");
  await page.getByText("Couldn't load the numbers just now.").first().waitFor({ timeout: 60000 });
  await page.getByLabel("Protein, at least (g)").fill("");
  await page.getByLabel("Calories, up to").fill("400");
  await heading(page).waitFor({ timeout: 60000 });
  expect((await count(page)) > 5, "calories alone work without the numbers file");
  await ctx.close();
});

await step("no horizontal overflow at 200% text, and axe finds nothing, with the panel and results open", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("500");
  await page.getByLabel("Protein, at least (g)").fill("35");
  await page.getByRole("button", { name: "Milk", exact: true }).click();
  await heading(page).waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => x.id));
  expect(v.length === 0, "axe: " + v.join(", "));
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(m.sw <= m.cw + 1, `overflow ${m.sw} > ${m.cw}`);
  await ctx.close();
});

await step("one line under the boxes says what was found and links to the list; Done and the link take you to it; a count that fits nothing says so there too", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("700");
  const line = page.getByRole("status").filter({ hasText: /restaurants? ha(s|ve) dishes that fit/ });
  await line.waitFor({ timeout: 60000 });
  const box = await page.getByLabel("Calories, up to").boundingBox();
  const lineBox = await line.boundingBox();
  expect(lineBox.y > box.y && lineBox.y - box.y < 400, "the line sits right under the boxes: " + (lineBox.y - box.y));
  const inView = async () => { const b = await heading(page).boundingBox(); return b && b.y >= 0 && b.y < 600; };
  expect(!(await inView()), "the list itself is further down");
  await line.getByRole("link").click();
  await page.waitForFunction(() => { const h = [...document.querySelectorAll("h2")].find((x) => /dishes that fit/.test(x.textContent ?? "")); const r = h?.getBoundingClientRect(); return !!r && r.top >= 0 && r.top < 500; }, null, { timeout: 5000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel("Protein, at least (g)").focus();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForFunction(() => { const h = [...document.querySelectorAll("h2")].find((x) => /dishes that fit/.test(x.textContent ?? "")); const r = h?.getBoundingClientRect(); return !!r && r.top >= 0 && r.top < 500; }, null, { timeout: 5000 });
  // nothing fits
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel("Calories, up to").fill("5");
  await page.getByLabel("Protein, at least (g)").fill("60");
  await page.getByRole("status").filter({ hasText: "No restaurant has a dish that fits all of that" }).waitFor({ timeout: 30000 });
  await ctx.close();
});

await step("the allergy caution sits with the count, not at the bottom of the list", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("700");
  await page.getByRole("button", { name: "Peanuts", exact: true }).click();
  await heading(page).waitFor({ timeout: 60000 });
  const h = await heading(page).boundingBox();
  const caution = page.getByText(/always check with the restaurant/).first();
  await caution.waitFor();
  const c = await caution.boundingBox();
  expect(c.y > h.y && c.y - h.y < 120, `the caution is right under the count: ${c.y - h.y}`);
  await ctx.close();
});

await step("coming back from a restaurant finds the panel, the numbers and the allergies as they were; closing the row clears them", async () => {
  const { ctx, page } = await open();
  await page.getByLabel("Calories, up to").fill("600");
  await page.getByLabel("Protein, at least (g)").fill("30");
  await page.getByRole("button", { name: "Milk", exact: true }).click();
  await heading(page).waitFor({ timeout: 60000 });
  const n = await count(page);
  await page.locator('a[href^="/app/chain?id="]').filter({ hasText: /dish(es)? fits?/ }).first().click();
  await page.getByText("Your numbers:").first().waitFor({ timeout: 30000 });
  await page.goBack();
  await page.getByLabel("Calories, up to").waitFor({ timeout: 30000 });
  expect((await page.getByLabel("Calories, up to").inputValue()) === "600" && (await page.getByLabel("Protein, at least (g)").inputValue()) === "30", "the numbers are back");
  expect((await page.getByRole("button", { name: "Milk", exact: true }).getAttribute("aria-pressed")) === "true", "Milk is still chosen");
  await heading(page).waitFor({ timeout: 60000 });
  expect((await count(page)) === n, "the same restaurants are listed");
  // closing the row empties it, and a fresh visit starts clean
  await page.getByRole("button", { name: "Find by numbers or allergies" }).click();
  await page.getByRole("button", { name: "Find by numbers or allergies" }).click();
  expect((await page.getByLabel("Calories, up to").inputValue()) === "", "emptied by closing");
  await ctx.close();
});

await step("numbers typed on an Arabic, Urdu, Bengali, Punjabi or Gujarati keypad are read as numbers", async () => {
  const { ctx, page } = await open();
  const box = page.getByLabel("Calories, up to");
  for (const typed of ["٦٠٠", "۶۰۰", "৬০০", "੬੦੦", "૬૦૦"]) {
    await box.fill(typed);
    expect((await box.inputValue()) === "600", `${typed} -> ${await box.inputValue()}`);
  }
  await ctx.close();
});

await step("a restaurant opened from a result suggests only dishes that fit the numbers, under the line that says so", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/chain?id=kfc&kcal=500&protein=25");
  const card = page.locator("section").filter({ has: page.getByText("Your numbers:") }).first();
  await card.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const text = await card.innerText();
  const picks = [...text.matchAll(/(\d+)g protein · (\d[\d,]*) kcal/g)].map((m) => ({ protein: Number(m[1]), kcal: Number(m[2].replace(",", "")) }));
  expect(picks.length > 0, "Best for you shows some picks: " + text.slice(0, 300));
  expect(picks.every((p) => p.kcal <= 500 && p.protein >= 25), "every pick fits up to 500 kcal and 25 g+ protein: " + JSON.stringify(picks));
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
