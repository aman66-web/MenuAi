// App Store screenshots (6.9-inch iPhone, 1320 x 2868) of the iPhone app's copy of the web app, with NO restaurant or supermarket logos and
// NO food or product photos in them (CLAUDE.md rule 2; App Review 2.3.9): every logo is taken down through the live taken-down list
// (lib/mm/logos.ts) and every photo request is refused, so chains show our cuisine icons. Light mode, English.
//   ./scripts/build_app_web.sh && (cd web && PORT=3103 node e2e/serve-app.mjs ../MenuMacros/Resources/WebApp.bundle &) &&
//   cd web && BASE=http://localhost:3103 node e2e/store-shots.mjs      → e2e/shots/store/*.png
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3103";
const LIVE = process.env.LIVE ?? "https://menumacros.vercel.app";
const OUT = new URL("./shots/store/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(new URL("../public/menus/menus-manifest.json", import.meta.url), "utf8"));
const shops = ["sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons", "waitrose", "iceland", "marks-and-spencer", "coop", "ocado"];
const hidden = [...manifest.chains.map((c) => c.id), ...shops.map((s) => `shop:${s}`)];
const settings = JSON.stringify({ v: 1, data: { goal: "buildMuscle", dailyCalories: 2200, dailyProtein: 150, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], language: "en" } });
const today = new Date().toISOString().slice(0, 10);
const log = JSON.stringify({ v: 1, data: [] });
void today; void log;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, colorScheme: "light", isMobile: true, hasTouch: true });
await ctx.addInitScript(([s, h]) => {
  if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s);
  localStorage.setItem("mm.v1.hiddenLogos", JSON.stringify({ v: 1, data: h }));
}, [settings, hidden]);
const page = await ctx.newPage();
// no logos and no photos in store screenshots: the live list hides every logo; photo files are refused
await page.route(`${LIVE}/logos/hidden.json`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, hidden }) }));
await page.route(`${LIVE}/**`, (r) => r.abort());
await page.route(/\/(menu-images|grocery-images)\//, (r) => r.abort());
await page.route(/^https:\/\/(?!menumacros)/, (r) => r.abort());

async function shot(name, path, ready) {
  await page.goto(BASE + path);
  await ready();
  await page.waitForTimeout(900);
  // any logo or photo that actually drew on screen (requests for them are refused, so none should)
  const logos = await page.evaluate(() => [...document.images].filter((i) => /\/logos\/|menu-images|grocery-images|scene7|tesco|sainsburys|aldi|lidl|iceland|waitrose|morrisons|marksandspencer/.test(i.currentSrc || i.src) && i.complete && i.naturalWidth > 0).length);
  if (logos) throw new Error(`${name}: ${logos} logo or photo images on screen`);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("saved", name);
}

await shot("1-home", "/app", () => page.getByText("Left today:", { exact: true }).waitFor());
await shot("2-eat-out", "/app/eat-out", () => page.getByText(/\d{3} UK restaurants/).waitFor({ timeout: 15000 }));
await shot("3-restaurant", "/app/chain?id=nandos", () => page.getByRole("heading", { level: 1 }).waitFor({ timeout: 15000 }));
await shot("4-recipes", "/app/recipes", () => page.locator("a[href*='/app/recipes/view']").first().waitFor({ timeout: 20000 }));
await shot("5-recipe", "/app/recipes/view?id=chicken-curry&r=sainsburys", () => page.getByText("How to make it").first().waitFor({ timeout: 20000 }));
await shot("6-groceries", "/app/groceries/shop?r=sainsburys", () => page.locator("a[href*='/app/groceries/shop/item']").first().waitFor({ timeout: 20000 }));

await browser.close();
console.log(`screenshots in ${OUT} (1320 x 2868)`);
