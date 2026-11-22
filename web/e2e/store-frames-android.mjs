// The Google Play phone screenshots (22 Nov 2026): each raw screen from e2e/store-shots-v2.mjs (SHOT_W=390 SHOT_H=739 RAW_DIR=./shots/store-android/raw/) under the same headline
// and subline as the App Store set, 1080 x 1920 (9:16, inside Play's 2:1 limit). No device frame of another platform: a plain rounded screen. Logos carry the
// not-affiliated line like the App Store set (CLAUDE.md rule 2).   node e2e/store-frames-android.mjs [names...]  → ../android/store/screenshots/<NN name>.png
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const RAW = new URL("./shots/store-android/raw/", import.meta.url).pathname;
const OUT = new URL("../../android/store/screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const font = readFileSync(new URL("../app/fonts/Urbanist-latin.woff2", import.meta.url)).toString("base64");

// in the order people see them (the same order as the App Store set)
const SHOTS = [
  ["06-recipes", "01 Recipes priced at your shop", "Recipes *priced* at your shop", "Real products from 7 UK supermarkets"],
  ["07-recipe", "02 Every ingredient ready to buy", "Every ingredient, *ready to buy*", "Real Sainsbury's products, with prices"],
  ["08-plan", "03 A week of meals one list", "A week of meals, *one list*", "Fits your calories, budget and 5 a day"],
  ["09-fridge", "04 Cook with what you have", "Cook with *what you have*", "Tap what's in your fridge"],
  ["04-scan", "05 Scan it Log it", "Scan it. *Log it.*", "Pick a glass, a can or grams"],
  ["10-groceries", "06 Top 20 supermarket lists", "*Top 20* supermarket lists", "Most protein, cheapest protein, most fibre"],
  ["05-home", "07 Your day at a glance", "Your day *at a glance*", "Calories, protein, carbs and fat"],
  ["01-eatout", "08 Know whats in your order", "Know what's *in your order*", "Official figures from 241 UK restaurants"],
  ["02-truth", "09 See the truth about a dish", "See the *truth* about a dish", "Protein score and traffic lights"],
  ["03-best", "10 Top picks for your goal", "*Top picks* for your goal", "The most protein for the calories, meal by meal"],
];
const NO_LOGOS = new Set(["05-home", "09-fridge"]);
const NOTE = "Not affiliated with any restaurant or shop shown.";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const words = (s) => esc(s).replace(/\*(.+?)\*/g, '<span class="hi">$1</span>');

function html(raw, head, sub) {
  const img = readFileSync(`${RAW}${raw}.png`).toString("base64");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: U; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1080px; height: 1920px; overflow: hidden; }
body { font-family: U, sans-serif; color: #0b1a12; background: linear-gradient(180deg, #d6efa0 0%, #e9f5cf 38%, #f4f5f6 78%); position: relative; }
.text { position: absolute; top: 70px; left: 60px; right: 60px; text-align: center; }
h1 { font-size: 92px; line-height: 1.04; font-weight: 800; letter-spacing: -0.025em; text-wrap: balance; }
.hi { color: #046c4f; }
p { margin-top: 18px; font-size: 40px; line-height: 1.2; font-weight: 600; color: #3b4a41; }
.screen { position: absolute; left: 50%; top: 380px; transform: translateX(-50%); width: 780px; border-radius: 56px; overflow: hidden; box-shadow: 0 40px 90px rgba(11, 26, 18, 0.22), 0 0 0 3px rgba(11, 26, 18, 0.12); }
.screen img { display: block; width: 780px; height: auto; }
.note { position: absolute; left: 0; right: 0; bottom: 18px; text-align: center; font-size: 28px; font-weight: 600; color: #4a5750; }
</style></head><body>
<div class="text"><h1>${words(head)}</h1><p>${esc(sub)}</p></div>
<div class="screen"><img src="data:image/png;base64,${img}"></div>
${NO_LOGOS.has(raw) ? "" : `<div class="note">${NOTE}</div>`}
</body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const [raw, file, head, sub] of SHOTS) {
  if (only.length && !only.includes(raw)) continue;
  await page.setContent(html(raw, head, sub), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${file}.png`, type: "png" });
  console.log("framed", file);
}
await browser.close();
