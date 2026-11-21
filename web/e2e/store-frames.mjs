// The App Store screenshots, framed (founder 2026-11-21: "make 10 screenshots ... annotate them"): each raw screen from e2e/store-shots-v2.mjs in a phone
// outline under a short headline (one or two words in the app's green) and a subline, 1320 x 2868 (6.9-inch iPhone), in the app's own font (Urbanist) and
// colours. The words are drafts to talk through with the founder; no health claims, no "every chain", no logos or photos (the raw screens have none).
//   node e2e/store-frames.mjs [names...]   → e2e/shots/store-v2/<name>.png
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const RAW = new URL("./shots/store-v2/raw/", import.meta.url).pathname;
const OUT = new URL("./shots/store-v2/", import.meta.url).pathname;
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
  "07-recipe": ["Every ingredient *counted*", "Sized to your calories, from each label"],
  "08-plan": ["A week of meals, *one list*", "Planned around your calories and budget"],
  "09-fridge": ["Cook with *what you have*", "Tap what's in your fridge"],
  "10-groceries": ["*Top 20* supermarket lists", "Most protein, cheapest protein, most fibre"],
};

// screens that show a chain's or shop's official logo carry the welcome wall's line (CLAUDE.md rule 2)
const LOGO_SHOTS = new Set((process.env.LOGO_SHOTS ?? "01-eatout,02-truth,03-best,04-scan,06-recipes,07-recipe,08-plan,10-groceries").split(",").filter(Boolean));
const NOT_AFFILIATED = "Not affiliated with any restaurant or shop shown.";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const words = (s) => esc(s).replace(/\*(.+?)\*/g, '<span class="hi">$1</span>');

function html(name) {
  const [head, sub] = CAPTIONS[name];
  const img = readFileSync(`${RAW}${name}.png`).toString("base64");
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
.phone img { display: block; width: 966px; height: auto; border-radius: 112px; }
.note { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font-size: 34px; font-weight: 600; color: #4a5750; }
</style></head><body>
<div class="text"><h1>${words(head)}</h1><p>${esc(sub)}</p></div>
<div class="phone"><img src="data:image/png;base64,${img}"></div>
${LOGO_SHOTS.has(name) ? `<div class="note">${NOT_AFFILIATED}</div>` : ""}
</body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
for (const name of Object.keys(CAPTIONS)) {
  if (only.length && !only.includes(name)) continue;
  await page.setContent(html(name), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${name}.png`, type: "png", omitBackground: false });
  console.log("framed", name);
}
await browser.close();
