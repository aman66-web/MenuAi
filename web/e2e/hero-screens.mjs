// The phone in numbite.com's homepage hero (27 Nov 2026, direction "A. Lime"): the screen alone, cut out of the App Store screenshots that
// e2e/site-screens.mjs saves (public/screens/<name>-960.webp, Apple's own, with the food pictures as the app shows them: founder 27 Nov 2026), so the page can
// draw its own phone round it. Only the top of the screen is kept: the hero shows the phone rising from its bottom edge, so the rest would never be seen, and
// the files stay small. Four screens, the first shown at once: Meal plan (our own recipe pictures), Home, Best for you (the dishes' own photos) and the
// supermarket leaderboards; none has a logo in the part kept.
//   node e2e/hero-screens.mjs        → public/screens/hero/<name>-360.webp and <name>-700.webp
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";

const IN = new URL("../public/screens/", import.meta.url).pathname;
const OUT = new URL("../public/screens/hero/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Where the screen sits in every 960 x 2086 store frame (measured 27 Nov 2026: the bezel's inner edge), 2 px in from it so no bezel shows on the sides.
const SCREEN = { left: 130, top: 482, width: 700, height: 1524 };
// The part of the screen the hero shows (app/(site)/page.tsx draws the phone at this shape, so the bottom of the picture is the hero's bottom edge).
export const KEEP = 0.7;
const box = { ...SCREEN, height: Math.round(SCREEN.height * KEEP) };

for (const name of ["plan", "home", "best", "groceries"]) {
  for (const w of [360, 700]) {
    const file = `${OUT}${name}-${w}.webp`;
    const img = sharp(`${IN}${name}-960.webp`).extract(box);
    const info = await (w === box.width ? img : img.resize({ width: w })).webp({ quality: 82, effort: 6 }).toFile(file);
    console.log(`hero/${name}-${w}.webp ${info.width}x${info.height} ${Math.round(statSync(file).size / 1024)} KB`);
  }
}
