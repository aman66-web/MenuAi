// Groceries photos: only ever the supermarket's own (founder 2026-10-10). Our stored copy first, then the supermarket's own picture, then "no photo";
// a picture that fails to load moves to the next place, the credit under the big picture names the shop it came from, and Open Food Facts' image
// server is never asked for anything (the fixtures still carry an old `image` field to prove it is ignored).
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const item = { name: "Greek Style Yogurt", brand: "Sainsbury's", size: "500 g", per: "g", kcal: 97, protein: 9, carbs: 4.2, fat: 5, allergens: null, category: "dairy-eggs", image: "501/234/567/8900/front_en.12" };
const stored = { ...item, gtin: "5012345678900", photo: "0123456789ab.webp", retailerImage: "https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg" };
const hotlinkOnly = { ...item, gtin: "5012345678917", name: "Plain Skyr", retailerImage: "https://assets.sainsburys-groceries.co.uk/gol/2/image.jpg" };
const offOnly = { ...item, gtin: "5012345678924", name: "Natural Quark" }; // an old file's Open Food Facts picture only: must show "no photo"
const none = { ...item, gtin: "5012345678931", name: "Cottage Cheese", image: undefined };
const file = { v: 1, retailer: "sainsburys", name: "Sainsbury's", generatedOn: "2026-10-09", source: "t", products: [stored, hotlinkOnly, offOnly, none] };
const manifest = { v: 1, generatedOn: "2026-10-09", source: "Open Food Facts contributors", retailers: [{ id: "sainsburys", name: "Sainsbury's", file: "sainsburys.json", count: 4, sha256: "" }], categories: [{ id: "dairy-eggs", label: "Dairy and eggs" }] };

// which hosts the page asked, and which of them we let succeed
async function newPage(allow) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  const asked = [];
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/sainsburys.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(file) }));
  for (const [name, glob] of [["stored", "**/grocery-images/**"], ["shop", "**/assets.sainsburys-groceries.co.uk/**"], ["off", "**/images.openfoodfacts.org/**"]]) {
    await page.route(glob, (r) => { asked.push(name); return allow.includes(name) ? r.fulfill({ contentType: "image/png", body: PNG }) : r.abort(); });
  }
  return { ctx, page, asked };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const bigSrc = (page) => page.locator("figure img").getAttribute("src");

await step("product page: the stored copy is shown and credited to the shop; nothing is asked of the shop's server or Open Food Facts", async () => {
  const { ctx, page, asked } = await newPage(["stored", "shop", "off"]);
  await page.goto(BASE + "/app/groceries/product?code=5012345678900&r=sainsburys");
  await page.getByText("Photo from the Sainsbury's website").waitFor();
  expect((await bigSrc(page)) === "/grocery-images/sainsburys/0123456789ab.webp", "should be our own copy");
  expect((await page.locator("figure img").getAttribute("referrerpolicy")) === "no-referrer", "no referrer");
  expect(asked.every((a) => a === "stored"), `only our own copy should be requested, got ${asked}`);
  await ctx.close();
});

await step("stored copy missing -> the shop's own picture, same credit", async () => {
  const { ctx, page } = await newPage(["shop", "off"]);
  await page.goto(BASE + "/app/groceries/product?code=5012345678900&r=sainsburys");
  await page.getByText("Photo from the Sainsbury's website").waitFor();
  await page.waitForFunction(() => document.querySelector("figure img")?.getAttribute("src")?.startsWith("https://assets.sainsburys-groceries.co.uk/"));
  await ctx.close();
});

await step("stored copy and the shop's picture both fail -> no picture box at all (never Open Food Facts'); the list row says no photo", async () => {
  const { ctx, page, asked } = await newPage(["off"]);
  await page.goto(BASE + "/app/groceries/product?code=5012345678900&r=sainsburys");
  await page.getByRole("heading", { name: "Greek Style Yogurt" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("figure"));
  await page.goto(BASE + "/app/groceries");
  const row = page.getByRole("link", { name: /Greek Style Yogurt/ });
  await row.waitFor();
  await row.getByText("no photo").waitFor();
  expect(!asked.includes("off"), `Open Food Facts must never be asked, got ${asked}`);
  expect(!(await page.getByText(/Open Food Facts contributors \(CC BY-SA\)/).count()), "no Open Food Facts photo credit anywhere");
  await ctx.close();
});

await step("list rows: stored, hotlink-only, old Open Food Facts-only and no-picture products each take their own route", async () => {
  const { ctx, page, asked } = await newPage(["stored", "shop", "off"]);
  await page.goto(BASE + "/app/groceries");
  await page.getByText("4 products", { exact: true }).waitFor();
  const srcOf = async (re) => page.getByRole("link", { name: re }).locator("img").getAttribute("src");
  expect((await srcOf(/Greek Style Yogurt/)) === "/grocery-images/sainsburys/0123456789ab.webp", "stored first");
  expect((await srcOf(/Plain Skyr/)).startsWith("https://assets.sainsburys-groceries.co.uk/"), "shop's own picture when no stored copy");
  await page.getByRole("link", { name: /Natural Quark/ }).getByText("no photo").waitFor(); // no shop picture: "no photo", not Open Food Facts'
  await page.getByRole("link", { name: /Cottage Cheese/ }).getByText("no photo").waitFor();
  expect(!asked.includes("off"), `Open Food Facts must never be asked, got ${asked}`);
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
