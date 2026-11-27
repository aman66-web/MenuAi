// The App Store screenshots, framed (founder 2026-11-21: "make 10 screenshots ... annotate them"): each raw screen from e2e/store-shots-v2.mjs in a phone
// outline under a short headline (one or two words in the app's green) and a subline, 1320 x 2868 (6.9-inch iPhone), in the app's own font (Urbanist) and
// colours. The words are drafts to talk through with the founder; no health claims, no "every chain", no logos or photos (the raw screens have none).
//   node e2e/store-frames.mjs [names...]   → e2e/shots/store-v2/<name>.png
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

// RAW_DIR and OUT_DIR (relative to this folder) frame another set, e.g. the homepage's: RAW_DIR=./shots/store-v2/no-photos/raw/ OUT_DIR=./shots/store-v2/no-photos/
const RAW = new URL(process.env.RAW_DIR ?? "./shots/store-v2/raw/", import.meta.url).pathname;
const OUT = new URL(process.env.OUT_DIR ?? "./shots/store-v2/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const font = readFileSync(new URL("../app/fonts/Urbanist-latin.woff2", import.meta.url)).toString("base64");

// *word* is drawn in the app's green
export const CAPTIONS = {
  "01-eatout": ["Know what's *in your order*", "Official figures from 241 UK restaurants"],
  "02-truth": ["See the *truth* about a dish", "Protein score and traffic lights"],
  "03-best": ["*Top picks* for your goal", "The most protein for the calories, meal by meal"],
  "04-scan": ["Scan it. *Log it.*", "Pick a glass, a can or grams"],
  "05-home": ["Your day *at a glance*", "Calories, protein, carbs and fat"],
  "06-recipes": ["Recipes *priced* at your shop", "Real products from 7 UK supermarkets"],
  "07-recipe": ["Every ingredient, *ready to buy*", "Real Sainsbury's products, with prices"],
  "08-plan": ["A week of meals, *one list*", "Fits your calories, budget and 5 a day"],
  "09-fridge": ["Cook with *what you have*", "Tap what's in your fridge"],
  "10-groceries": ["*Top 20* supermarket lists", "Most protein, cheapest protein, most fibre"],
};

// screens that show a chain's or shop's official logo carry the welcome wall's line (CLAUDE.md rule 2)
const LOGO_SHOTS = new Set((process.env.LOGO_SHOTS ?? "01-eatout,02-truth,03-best,04-scan,06-recipes,07-recipe,08-plan,10-groceries").split(",").filter(Boolean));
const NOT_AFFILIATED = "Not affiliated with any restaurant or shop shown.";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const words = (s) => esc(s).replace(/\*(.+?)\*/g, '<span class="hi">$1</span>');

// The iPhone's own status bar (22 Nov): a raw screen taken 902 points tall (store-shots-v2.mjs SHOT_H=902) gets the 54-point bar above it, as on a real
// 6.9-inch iPhone: 9:41, the Dynamic Island, signal, Wi-Fi and battery, on the screen's own top colour (a sheet's dimmed backdrop stays dimmed).
const SIGNAL = `<svg width="40" height="26" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>`;
const WIFI = `<svg width="36" height="26" viewBox="0 0 17 12"><path d="M8.5 2.2c2.6 0 5 1 6.8 2.7l1.2-1.3C14.4 1.6 11.6.4 8.5.4S2.6 1.6.5 3.6l1.2 1.3C3.5 3.2 5.9 2.2 8.5 2.2Zm0 3.6c1.6 0 3.1.6 4.2 1.6l1.2-1.3C12.5 4.8 10.6 4 8.5 4s-4 .8-5.4 2.1l1.2 1.3c1.1-1 2.6-1.6 4.2-1.6Zm0 3.5c.7 0 1.3.3 1.8.7L8.5 12 6.7 10c.5-.4 1.1-.7 1.8-.7Z"/></svg>`;
const BATTERY = `<svg width="58" height="27" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill-opacity=".45"/></svg>`;

async function html(name) {
  const [head, sub] = CAPTIONS[name];
  const raw = readFileSync(`${RAW}${name}.png`);
  const img = raw.toString("base64");
  const meta = await sharp(raw).metadata();
  const withBar = meta.width * 2868 === 1320 * (meta.height + 162);
  const { data, info } = await sharp(raw).extract({ left: 0, top: 0, width: 4, height: 2 }).raw().toBuffer({ resolveWithObject: true });
  const top = `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
  void info;
  const bar = withBar ? `<div class="bar" style="background:${top}"><span class="time">9:41</span><span class="island"></span><span class="icons">${SIGNAL}${WIFI}${BATTERY}</span></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: U; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1320px; height: 2868px; overflow: hidden; }
body { font-family: U, sans-serif; color: #0b1a12; background: linear-gradient(180deg, #d6efa0 0%, #e9f5cf 38%, #f4f5f6 78%); position: relative; }
.text { position: absolute; top: 150px; left: 90px; right: 90px; text-align: center; }
h1 { font-size: 120px; line-height: 1.04; font-weight: 800; letter-spacing: -0.025em; text-wrap: balance; }
.hi { color: #046c4f; }
p { margin-top: 30px; font-size: 54px; line-height: 1.2; font-weight: 600; color: #3b4a41; }
.phone { position: absolute; left: 50%; top: 640px; transform: translateX(-50%); width: 1010px; padding: 22px; border-radius: 132px; background: #0b1a12;
  box-shadow: 0 60px 120px rgba(11, 26, 18, 0.22), 0 0 0 4px #2a3530 inset; }
.phone .screen { width: 966px; border-radius: 112px; overflow: hidden; }
.phone img { display: block; width: 966px; height: auto; }
.bar { position: relative; height: 118.5px; color: #000; }
.bar .time { position: absolute; left: 118px; top: 44px; font: 600 38px/1 -apple-system, "SF Pro Text", system-ui, sans-serif; letter-spacing: -0.01em; }
.bar .island { position: absolute; left: 50%; top: 24px; width: 274px; height: 80px; margin-left: -137px; border-radius: 40px; background: #000; }
.bar .icons { position: absolute; right: 84px; top: 46px; display: flex; gap: 12px; align-items: center; }
.bar svg { fill: currentColor; display: block; }
.note { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font-size: 34px; font-weight: 600; color: #4a5750; }
</style></head><body>
<div class="text"><h1>${words(head)}</h1><p>${esc(sub)}</p></div>
<div class="phone"><div class="screen">${bar}<img src="data:image/png;base64,${img}"></div></div>
${LOGO_SHOTS.has(name) ? `<div class="note">${NOT_AFFILIATED}</div>` : ""}
</body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
for (const name of Object.keys(CAPTIONS)) {
  if (only.length && !only.includes(name)) continue;
  await page.setContent(await html(name), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${name}.png`, type: "png", omitBackground: false });
  console.log("framed", name);
}
await browser.close();
