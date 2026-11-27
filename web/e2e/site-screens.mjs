// The app screenshots on numbite.com's homepage (27 Nov 2026, founder: "update it with all the new screenshots from the app"): the ten App Store screens of
// 1.1 build 20, framed as in the store, made WITHOUT the chains' and shops' own photos (CLAUDE.md rule 2 keeps those to store screenshots, never marketing).
// The logos stay, so the homepage prints "Not affiliated with any restaurant or shop shown." under them. Steps (a test copy of build 20, iap 32b135af, built as
// e2e/store-shots-v2.mjs's header says, served on :3103):
//   NO_PHOTOS=1 SHOT_H=902 BASE=http://localhost:3103 node e2e/store-shots-v2.mjs
//   RAW_DIR=./shots/store-v2/no-photos/raw/ OUT_DIR=./shots/store-v2/no-photos/ node e2e/store-frames.mjs
//   node e2e/site-screens.mjs        → public/screens/<name>-480.webp and <name>-960.webp (1320 x 2868 scaled, WebP)
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";

const IN = new URL(process.env.IN_DIR ?? "./shots/store-v2/no-photos/", import.meta.url).pathname;
const OUT = new URL("../public/screens/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// shot name → the file name on the website (the order on the page is set in app/(site)/page.tsx)
const NAMES = {
  "06-recipes": "recipes", "07-recipe": "recipe", "08-plan": "plan", "09-fridge": "fridge", "04-scan": "scan",
  "10-groceries": "groceries", "05-home": "home", "01-eatout": "eat-out", "02-truth": "truth", "03-best": "best",
};

for (const [shot, name] of Object.entries(NAMES)) {
  for (const w of [480, 960]) {
    const file = `${OUT}${name}-${w}.webp`;
    const info = await sharp(`${IN}${shot}.png`).resize({ width: w }).webp({ quality: 80, effort: 6 }).toFile(file);
    console.log(`${name}-${w}.webp ${info.width}x${info.height} ${Math.round(statSync(file).size / 1024)} KB`);
  }
}
