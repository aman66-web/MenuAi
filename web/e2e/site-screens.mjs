// The app screenshots on numbite.com's homepage: the App Store listing's own ten screenshots, exactly as the store shows them (founder 27 Nov 2026, on the
// copies retaken without photos: "the screenshots should be the images of the screens from the App Store ... there's some screens here where there's no images
// of the food products"). So they carry the chains' and shops' own photos and logos as the app shows them: the founder's decision for the website, beyond
// CLAUDE.md rule 2's store screenshots (logged in docs/PROGRESS_LOG.md); the homepage prints "Not affiliated with any restaurant or shop shown." under them.
//   node e2e/site-screens.mjs   → public/screens/<name>-480.webp and <name>-960.webp, from the live listing (Apple's 1320 x 2868 originals, scaled, WebP)
// (in the cloud container, run it with NODE_USE_ENV_PROXY=1 so Node's fetch goes through the proxy). Then `node e2e/hero-screens.mjs` for the hero's phone.
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";

const APP_ID = "6822767746";
const OUT = new URL("../public/screens/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// The store's order (the number Apple keeps in each file name) → the file name on the website (the order on the page is set in app/(site)/page.tsx).
const NAMES = ["recipes", "recipe", "plan", "fridge", "scan", "groceries", "home", "eat-out", "truth", "best"];

const lookup = await (await fetch(`https://itunes.apple.com/lookup?id=${APP_ID}&country=gb`)).json();
const urls = lookup.results?.[0]?.screenshotUrls ?? [];
if (urls.length !== NAMES.length) throw new Error(`the listing has ${urls.length} iPhone screenshots, not ${NAMES.length}`);
console.log(`App Store ${lookup.results[0].version}: ${urls.length} screenshots`);

for (const url of urls) {
  const n = Number(/\/(\d{2})_[^/]+\.png\//.exec(url)?.[1]);
  const name = NAMES[n - 1];
  if (!name) throw new Error(`no website name for ${url}`);
  // Apple serves a listing picture at any size up to the uploaded one: ask for the original 1320 x 2868
  const res = await fetch(url.replace(/\/[^/]+$/, "/1320x2868bb.png"));
  if (!res.ok) throw new Error(`${res.status} for ${name}`);
  const png = Buffer.from(await res.arrayBuffer());
  const { width, height } = await sharp(png).metadata();
  if (width !== 1320 || height !== 2868) throw new Error(`${name} is ${width} x ${height}, not 1320 x 2868`);
  for (const w of [480, 960]) {
    const file = `${OUT}${name}-${w}.webp`;
    const info = await sharp(png).resize({ width: w }).webp({ quality: 80, effort: 6 }).toFile(file);
    console.log(`${name}-${w}.webp ${info.width}x${info.height} ${Math.round(statSync(file).size / 1024)} KB`);
  }
}
