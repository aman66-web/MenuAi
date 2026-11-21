// A barcode from a photo, and the measures on "How much?" (founder 2026-11-21: "allow people to upload a photo ... of the barcode if the food they want to note
// the calories for" and "they can [set] the portion they're having easily if the drink or food ... Allow them to choose measurements too"). The photo is
// e2e/fixtures/barcode-photo-5063089019924.png: an EAN-13 drawn from the standard tables, small in a big 2400 x 1800 picture, for ASDA British Milk Semi Skimmed
// 2 L (in Asda's full list with Asda's own label per 100 ml, as e2e/scandiary.mjs uses). Add food › Barcode from a photo › Choose a photo brings up the
// milk's How much?; Measure › glass, 2 glasses, "= 500 ml", Add puts 5 x the label's figures in the diary. A photo with no barcode says so calmly. Groceries ›
// Scan a barcode (no camera in this browser) offers Choose a photo on its sheet, which opens the product page.
// Run against a dev or test server: BASE=http://localhost:3005 node e2e/barcodephoto.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3101";
const CODE = "5063089019924";
const PHOTO = new URL("./fixtures/barcode-photo-5063089019924.png", import.meta.url).pathname;
const BLANK = new URL("./fixtures/photo-no-barcode.png", import.meta.url).pathname;
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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes", "homeLater"] } }));
  }, JSON.stringify({ v: 1, data: settings }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  return { ctx, page, errors };
}
const dlg = (page) => page.locator("dialog[open]").last();
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.log") ?? "null")?.data ?? []);

await step("the barcode is in Asda's full list with a label per 100 ml (the data this test relies on)", async () => {
  expect(row && label && label.length >= 4, "Asda's row for the milk with its label");
});

await step("Add food › Barcode from a photo › Choose a photo: the milk comes up; Measure › glass, 2 glasses = 500 ml; Add logs 5 x the label", async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Add to Breakfast", exact: true }).tap({ timeout: 90000 });
  await page.getByRole("button", { name: /Barcode from a photo/ }).tap();
  await page.getByRole("heading", { name: "Barcode from a photo", exact: true }).waitFor();
  // no camera opens on this choice
  expect((await page.locator("video").count()) === 0, "no camera on Barcode from a photo");
  await dlg(page).locator('input[type="file"]').setInputFiles(PHOTO);
  await dlg(page).getByText("How much?").waitFor({ timeout: 60000 });
  await dlg(page).getByRole("radio", { name: /^Glass \(250 ml\)$/ }).tap();
  await dlg(page).getByRole("button", { name: "2 glasses", exact: true }).tap();
  await dlg(page).getByText("= 500 ml", { exact: true }).waitFor();
  const before = (await log(page)).length;
  await dlg(page).getByRole("button", { name: /^Add to Breakfast$/ }).tap();
  await page.waitForFunction((n) => (JSON.parse(localStorage.getItem("mm.v1.log") ?? "null")?.data ?? []).length > n, before);
  const entry = (await log(page)).at(-1);
  expect(/\(500 ml\)$/.test(entry.name), "the entry says 500 ml: " + entry.name);
  const want = Math.round(label[0] * 5);
  expect(Math.abs(entry.nutrients.calories - want) <= 1, `calories ${entry.nutrients.calories}, want ${want}`);
  expect(errors.length === 0, "page errors: " + errors.join(" | "));
  await ctx.close();
});

await step("a photo with no barcode says so calmly, and another photo can be chosen", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Add to Lunch", exact: true }).tap({ timeout: 90000 });
  await page.getByRole("button", { name: /Barcode from a photo/ }).tap();
  await dlg(page).locator('input[type="file"]').setInputFiles(BLANK);
  await dlg(page).getByText(/No barcode found in that photo/).waitFor({ timeout: 30000 });
  await dlg(page).getByRole("button", { name: /Choose a photo/ }).waitFor();
  await ctx.close();
});

await step("Groceries › Scan a barcode: with no camera, the sheet offers Choose a photo, and the photo opens the product's page", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: /Scan a barcode/ }).first().tap({ timeout: 90000 });
  // this browser has no camera: the camera view hands over to the sheet, or the person taps "Type the number instead"
  const typeInstead = page.getByRole("button", { name: "Type the number instead" });
  if (await typeInstead.isVisible({ timeout: 4000 }).catch(() => false)) await typeInstead.tap();
  await dlg(page).getByRole("button", { name: /Choose a photo/ }).waitFor({ timeout: 20000 });
  await dlg(page).locator('input[type="file"]').setInputFiles(PHOTO);
  await page.waitForURL(/\/app\/groceries\/(product|shop\/item)/, { timeout: 60000 });
  await ctx.close();
});

await step("How much? for a food (grams): ounces and its serving, never glasses or spoons", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Add to Dinner", exact: true }).tap({ timeout: 90000 });
  await page.getByRole("button", { name: /Choose a supermarket product/ }).tap();
  await dlg(page).getByRole("searchbox").pressSequentially("cheddar", { delay: 40 });
  await dlg(page).getByRole("button", { name: /^Choose ASDA .*Cheddar/ }).first().tap({ timeout: 60000 });
  await dlg(page).getByText("How much?").waitFor({ timeout: 30000 });
  const radios = await dlg(page).getByRole("radio").allInnerTexts();
  expect(radios.some((r) => r.trim() === "oz"), "an oz measure: " + JSON.stringify(radios));
  expect(!radios.some((r) => /glass|spoon|pint|can/.test(r)), "no drink or spoon measures for a food: " + JSON.stringify(radios));
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
