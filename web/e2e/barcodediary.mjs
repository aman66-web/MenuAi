// "Scan a barcode", the first choice in Home's Add food sheet (founder 2026-11-20, 12:45: scan a pack, see it, say how much, add it; app/app/_components/addfood/
// ScanFood.tsx, findByBarcode.ts, ProductPick.tsx HowMuch, MacroRing.tsx; GET /api/v1/barcode/{code}). The camera opens at once (this browser has none, so the
// typed number takes its place); the barcode is looked up in our own shop lists first (a shop's own label wins), then the older catalogue, and only then Open
// Food Facts through our own API (faked here: nothing reaches Open Food Facts), whose figures are said to be community data. The product comes up with a ring of
// its protein, carbs and fat, the amount chips and "How much?"; Add puts label x amount in the meal whose + was tapped, with the usual toast and Undo. A barcode
// nobody has figures for is a calm line with "Type the numbers from the pack"; no connection says so with Try again. Leading zeros stay.
// Run with the server's switches: BASE=http://localhost:3005 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 node e2e/barcodediary.mjs   (ONLY="(c)" runs one)
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return; try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0], (String(e.stack).match(/barcodediary\.mjs:\d+/g) ?? []).join(" < ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

// Asda's own label for its semi-skimmed milk (in Asda's full list), as e2e/scandiary.mjs uses it
const CODE = "5063089019924";
const barcodes = JSON.parse(readFileSync(new URL("../public/groceries/all/barcodes.json", import.meta.url), "utf8"));
const asdaAt = barcodes.shops.indexOf("asda");
const asdaRow = (barcodes.codes[CODE] ?? []).find(([i]) => i === asdaAt);
const asdaFile = JSON.parse(readFileSync(new URL("../public/groceries/all/asda.json", import.meta.url), "utf8"));
const row = asdaRow && asdaFile.products.find((p) => p[0] === asdaRow[1]);
const label = row?.[10];
// barcodes nobody of ours holds: Open Food Facts (faked) knows the first with figures, the second not at all; the third can't be asked
const OFF_CODE = "5000000000123";
const NONE_CODE = "09876543"; // an EAN-8 with a leading zero (not 01318180, the design review's example: the older catalogue holds it)
const FAIL_CODE = "5000000000154";
const OFF_PRODUCT = { code: OFF_CODE, name: "Test Oat Bar", brand: "Test Brand", quantity: "40 g", serving: "40 g", per: "g", label: { kcal: 400, protein: 10, carbs: 60, fat: 12, saturates: 2, sugars: 20, fibre: 5, salt: 0.3 }, image: null };
const SETTINGS = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, shops: ["asda"], devProOverride: true };

async function open({ viewport = { width: 402, height: 874 } } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"] } }));
  }, JSON.stringify({ v: 1, data: SETTINGS }));
  const asked = [];
  await ctx.route("**/api/v1/barcode/**", async (route) => {
    const code = new URL(route.request().url()).pathname.split("/").pop();
    asked.push(code);
    if (code === OFF_CODE) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ found: true, product: OFF_PRODUCT }) });
    if (code === FAIL_CODE) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ found: false }) });
  });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, asked, requests, errors };
}
const plus = (page, meal) => page.getByRole("button", { name: `Add to ${meal}`, exact: true });
const dlg = (page) => page.locator("dialog[open]").last();
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.log") ?? "null")?.data ?? []);
/** Home, the + on a meal, then "Scan a barcode": the camera can't open here, so the typed number takes its place; the digits are typed and found. */
async function scan(page, meal, code) {
  await page.goto(BASE + "/app");
  await plus(page, meal).tap({ timeout: 120000 });
  await page.getByRole("heading", { name: `Add to ${meal}`, exact: true }).waitFor();
  const first = dlg(page).getByRole("button", { name: /^Scan a barcode/ }).first();
  // "Scan a barcode" is the first of the choices
  const firstChoice = await dlg(page).locator("button").evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? "").find((t) => /Scan a barcode|Type in your numbers|Choose a/.test(t)) ?? "");
  expect(/^Scan a barcode/.test(firstChoice), "the first choice is " + firstChoice);
  await first.tap();
  const typed = page.getByPlaceholder("Barcode number");
  await typed.waitFor({ timeout: 30000 });
  await typed.fill(code);
  await page.getByRole("button", { name: "Find", exact: true }).tap();
}

await step("(a) the data the flow relies on: Asda's full list has the milk's barcode with Asda's own per-100 ml label", async () => {
  expect(asdaRow, "barcodes.json has no Asda row for " + CODE);
  expect(Array.isArray(label) && typeof label[0] === "number" && label[9] === "ml", "Asda's row has no per-100 ml label: " + JSON.stringify(label));
});

await step("(b) our own list first: the milk comes up with Asda's name, the ring and its figures and 'How much?' from 100 ml; 250 ml added to Breakfast is Asda's label x 2.5, with the toast and Undo; Open Food Facts is never asked", async () => {
  const { ctx, page, asked, errors } = await open();
  await scan(page, "Breakfast", CODE);
  const box = dlg(page).getByLabel("How much?");
  await box.waitFor({ timeout: 90000 });
  const text = await dlg(page).innerText();
  expect(text.includes(row[1]) && text.includes("Asda"), "the product shown: " + text.slice(0, 200));
  expect((await dlg(page).locator("svg circle").count()) >= 2, "no ring");
  // no one-tap amounts here: a 2 litre pack is more than a whole pack's chip offers, and the label prints no portion (100 ml is where it starts)
  expect((await dlg(page).getByLabel("How much?").inputValue()) === "100" && /\bml\b/.test(text), "not 100 ml to start");
  await box.fill("250");
  // the ring's figures follow the amount, said in one line to a screen reader
  const said = await dlg(page).locator("p[role='status'].sr-only").first().innerText();
  expect(said.includes(String(Math.round(label[0] * 2.5))), "the figures said: " + said);
  await dlg(page).getByRole("button", { name: "Add to Breakfast", exact: true }).tap();
  await page.getByText(new RegExp(`^Added “${row[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(250 ml\\)” to Breakfast\\.`)).waitFor({ timeout: 15000 });
  const [e] = await log(page);
  const want = (v, dp = 1) => Math.round(v * 2.5 * 10 ** dp) / 10 ** dp;
  expect(e && e.source === "product" && e.meal === "breakfast" && e.chainName === "Asda" && e.name === `${row[1]} (250 ml)`, "entry: " + JSON.stringify(e));
  expect(e.nutrients.calories === Math.round(label[0] * 2.5) && e.nutrients.protein === want(label[1]) && e.nutrients.carbs === want(label[2]) && e.nutrients.fat === want(label[3]), "figures: " + JSON.stringify(e.nutrients));
  expect(asked.length === 0, "Open Food Facts was asked for a barcode we hold: " + asked.join(", "));
  await page.getByRole("button", { name: /Undo/ }).first().tap();
  await page.waitForTimeout(400);
  expect((await log(page)).length === 0, "Undo didn't take it off");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("(c) a barcode only Open Food Facts knows (asked through our API, never directly): its name and figures, said to be community data; 40 g added to Lunch is the label x 0.4", async () => {
  const { ctx, page, asked, requests } = await open();
  await scan(page, "Lunch", OFF_CODE);
  await dlg(page).getByLabel("How much?").waitFor({ timeout: 90000 });
  const text = await dlg(page).innerText();
  expect(text.includes("Test Oat Bar"), "the product shown: " + text.slice(0, 200));
  await dlg(page).getByText("Figures from Open Food Facts (community data)").waitFor();
  expect(asked.includes(OFF_CODE), "our API wasn't asked");
  expect(!requests.some((u) => /openfoodfacts\.org/.test(u)), "the phone asked Open Food Facts directly");
  await dlg(page).getByLabel("How much?").fill("40");
  await dlg(page).getByRole("button", { name: "Add to Lunch", exact: true }).tap();
  await page.getByText(/^Added “Test Oat Bar \(40 g\)” to Lunch\./).waitFor({ timeout: 15000 });
  const [e] = await log(page);
  expect(e && e.meal === "lunch" && e.nutrients.calories === 160 && e.nutrients.protein === 4 && e.nutrients.carbs === 24 && e.nutrients.fat === 4.8, "entry: " + JSON.stringify(e));
  await ctx.close();
});

await step("(d) a barcode nobody has figures for: the calm line with the digits as printed (leading zero kept), 'Type the numbers from the pack' and 'Scan again'; never a red error", async () => {
  const { ctx, page } = await open();
  await scan(page, "Dinner", NONE_CODE);
  await dlg(page).getByText("We don't have this one yet.").waitFor({ timeout: 90000 });
  expect((await dlg(page).innerText()).replace(/\s/g, "").includes(NONE_CODE), "the barcode lost its leading zero: " + (await dlg(page).innerText()).slice(0, 200));
  expect((await dlg(page).getByRole("alert").count()) === 0, "a red error showed");
  await dlg(page).getByRole("button", { name: "Scan again" }).waitFor();
  await dlg(page).getByRole("button", { name: "Type the numbers from the pack" }).tap();
  await page.getByLabel("Calories (kcal)").waitFor({ timeout: 10000 });
  await ctx.close();
});

await step("(e) no connection for the lookup: 'Couldn't look it up. Check your connection.' with Try again, and typing the numbers is still offered", async () => {
  const { ctx, page } = await open();
  await scan(page, "Dinner", FAIL_CODE);
  await dlg(page).getByText("Couldn't look it up. Check your connection.").waitFor({ timeout: 90000 });
  await dlg(page).getByRole("button", { name: /Try again/ }).waitFor();
  await dlg(page).getByRole("button", { name: "Type the numbers from the pack" }).waitFor();
  await ctx.close();
});

for (const [label, viewport, big] of [["402x874", { width: 402, height: 874 }, false], ["375x667", { width: 375, height: 667 }, false], ["200% text at 360x780", { width: 360, height: 780 }, true]]) {
  await step(`(f) ${label}: the How much? step has no sideways scroll and 44 px buttons${big ? "" : ", and no axe violations"}`, async () => {
    const { ctx, page } = await open({ viewport });
    await scan(page, "Breakfast", CODE);
    await dlg(page).getByLabel("How much?").waitFor({ timeout: 90000 });
    if (big) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, ...[...document.querySelectorAll("dialog[open] .sheet-panel, dialog[open]")].map((d) => d.scrollWidth - d.clientWidth)));
    expect(over <= 0, `scrolls sideways by ${over}`);
    const small = await page.evaluate(() => [...document.querySelectorAll("dialog[open] button, dialog[open] a[href]")].flatMap((el) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none") return [];
      return r.width < 43.5 || r.height < 43.5 ? [`"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
    }));
    expect(small.length === 0, `under 44 px: ${small.slice(0, 3).join(", ")}`);
    if (!big) {
      await page.addScriptTag({ path: AXE });
      const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
      expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
    }
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
