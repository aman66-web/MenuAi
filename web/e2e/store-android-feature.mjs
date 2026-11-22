// The Google Play feature graphic (1024 x 500): the app's own icon and a plain headline on the brand green (founder 2026-11-22: "upload my app to the google play
// store"). No restaurant or shop name, logo or photo. node e2e/store-android-feature.mjs → ../android/store/feature-graphic.png
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const font = readFileSync(new URL("../app/fonts/Urbanist-latin.woff2", import.meta.url)).toString("base64");
const icon = readFileSync(new URL("../../android/store/icon-512.png", import.meta.url)).toString("base64");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: U; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1024px; height: 500px; overflow: hidden; }
body { font-family: U, sans-serif; color: #0b1a12; background: linear-gradient(120deg, #d6efa0 0%, #e9f5cf 55%, #f4f5f6 100%); display: flex; align-items: center; padding: 0 72px; gap: 56px; }
img { width: 260px; height: 260px; border-radius: 58px; box-shadow: 0 24px 50px rgba(11,26,18,.22); flex: none; }
h1 { font-size: 74px; line-height: 1.04; font-weight: 800; letter-spacing: -0.025em; }
.hi { color: #046c4f; }
p { margin-top: 22px; font-size: 32px; line-height: 1.2; font-weight: 600; color: #3b4a41; }
</style></head><body>
<img src="data:image/png;base64,${icon}">
<div><h1>Know the numbers <span class="hi">before you eat</span></h1><p>Calories and protein for UK restaurants, shops and recipes</p></div>
</body></html>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("../../android/store/feature-graphic.png", import.meta.url).pathname, type: "png" });
await browser.close();
console.log("feature-graphic.png");
