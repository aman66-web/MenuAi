// Scan a barcode, see the product, add it to the food diary (founder 2026-11-20: "when they scan a barcode of a product, it needs to come up with the product
// and they can input in and it's their food thing, food tracker"). Groceries › Scan a barcode › "Type the number instead" 5063089019924 (ASDA British Milk
// Semi Skimmed 2 L, in Asda's full list with Asda's own label) opens Asda's product page; "Add to my food diary" opens "How much?"; Add puts the
// label's figures x the amount on the food diary with the usual toast and Undo; Today shows it. A barcode we don't have says so calmly, with Scan again.
// Run against a dev or test server: BASE=http://localhost:3005 node e2e/scandiary.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3101";
const CODE = "5063089019924";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, shops: ["asda"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

// the label the app should log: Asda's row for the barcode in its published full list (per 100 ml)
const barcodes = JSON.parse(readFileSync(new URL("../public/groceries/all/barcodes.json", import.meta.url), "utf8"));
const asdaAt = barcodes.shops.indexOf("asda");
const asdaRow = (barcodes.codes[CODE] ?? []).find(([i]) => i === asdaAt);
const asdaFile = JSON.parse(readFileSync(new URL("../public/groceries/all/asda.json", import.meta.url), "utf8"));
const row = asdaRow && asdaFile.products.find((p) => p[0] === asdaRow[1]);
const label = row?.[10];

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 }));
  }, JSON.stringify({ v: 1, data: settings }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.log") ?? "null")?.data ?? []);

await step("the barcode is in Asda's full list with Asda's own label (the data the flow relies on)", async () => {
  expect(asdaRow, "barcodes.json has no Asda row for " + CODE);
  expect(Array.isArray(label) && typeof label[0] === "number" && label[9] === "ml", "Asda's row has no per-100 ml label: " + JSON.stringify(label));
});

const { ctx, page, errors } = await open();
try {
  await step("Groceries › Scan a barcode › Type the number instead opens Asda's own page for the product", async () => {
    await page.goto(`${BASE}/app/groceries`);
    await page.getByRole("button", { name: "Scan a barcode" }).first().tap({ timeout: 120000 });
    await page.getByRole("button", { name: "Type the number instead" }).tap({ timeout: 20000 });
    await page.getByPlaceholder("Barcode number").fill(CODE);
    await page.getByRole("button", { name: "Find", exact: true }).tap();
    await page.waitForURL(/\/app\/groceries\/shop\/item\?r=asda&id=/, { timeout: 120000 });
    const h1 = await page.getByRole("heading", { level: 1 }).textContent({ timeout: 120000 });
    expect(h1 === row[1], `title ${h1} is not ${row[1]}`);
  });

  await step("Add to my food diary (the page's one ink button when reached by a scan) opens How much?, with the meal the clock says and a choice of meal", async () => {
    await page.getByRole("button", { name: /Add to my food diary/ }).tap();
    const dlg = page.getByRole("dialog", { name: "Add to my food diary" });
    await dlg.waitFor();
    // "How much?" (founder 2026-11-20: fewest words), in ml for a drink, with the ring of its figures said in one line to a screen reader
    await dlg.getByLabel("How much?").waitFor();
    expect((await dlg.getByRole("radiogroup", { name: "Which meal?" }).getByRole("radio").count()) === 4, "four meals to choose from");
    await dlg.getByLabel("How much?").fill("250");
    await dlg.getByText("ml", { exact: true }).first().waitFor();
    const said = await dlg.locator("p[role='status'].sr-only").first().innerText();
    expect(said.includes(String(Math.round(label[0] * 2.5))), "the figures for 250 ml: " + said);
    await dlg.getByRole("radio", { name: "Breakfast" }).tap();
    await dlg.getByRole("button", { name: "Add to Breakfast" }).tap();
  });

  await step("the toast says what was added, with Undo", async () => {
    await page.getByText(new RegExp(`^Added “${row[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(250 ml\\)” to Breakfast\\.`)).waitFor({ timeout: 10000 });
    expect((await page.getByRole("button", { name: /Undo/ }).count()) > 0, "no Undo");
  });

  await step("the entry is Asda's label x 250 / 100, source 'product', with its picture, under Breakfast", async () => {
    const [e] = await log(page);
    expect(e, "nothing logged");
    const want = (v, dp = 1) => Math.round(v * 2.5 * 10 ** dp) / 10 ** dp;
    expect(e.source === "product" && e.meal === "breakfast" && e.chainName === "Asda" && e.name === `${row[1]} (250 ml)`, "entry: " + JSON.stringify(e));
    expect(e.nutrients.calories === Math.round(label[0] * 2.5) && e.nutrients.protein === want(label[1]) && e.nutrients.carbs === want(label[2]) && e.nutrients.fat === want(label[3]), "figures: " + JSON.stringify(e.nutrients));
    expect(e.photo && /asdagroceries/.test(e.photo.src), "no picture: " + JSON.stringify(e.photo));
  });

  await step("Today shows it", async () => {
    await page.goto(`${BASE}/app/today`);
    await page.getByText(`${row[1]} (250 ml)`).first().waitFor({ timeout: 60000 });
  });

  await step("Undo takes it off again", async () => {
    await page.goto(`${BASE}/app/groceries/product?code=${CODE}&scan=1`);
    await page.waitForURL(/shop\/item/, { timeout: 120000 });
    await page.getByRole("button", { name: /Add to my food diary/ }).tap({ timeout: 120000 });
    await page.getByRole("dialog", { name: "Add to my food diary" }).getByRole("button", { name: /^Add to / }).tap();
    expect((await log(page)).length === 2, "second entry not added");
    await page.getByRole("button", { name: /Undo/ }).first().tap();
    await page.waitForTimeout(300);
    expect((await log(page)).length === 1, "Undo didn't take it off");
  });

  await step("a barcode we don't have: the calm line and Scan again, never a red error", async () => {
    await page.goto(`${BASE}/app/groceries/product?code=5000000000123&scan=1`);
    await page.getByText("We don't have 5000000000123 yet.").waitFor({ timeout: 60000 });
    // (in <main>: Next.js's own route announcer is an empty role=alert in its shadow root on every page)
    expect((await page.locator("main").getByRole("alert").count()) === 0, "a red error showed");
    await page.getByRole("button", { name: "Scan again" }).waitFor();
    await page.getByRole("link", { name: "Search the supermarkets" }).waitFor();
  });

  await step("no errors in the console", async () => {
    expect(errors.length === 0, errors.join(" | "));
  });
} finally {
  await ctx.close();
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
