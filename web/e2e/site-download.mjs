// numbite.com's homepage with the store badges and the app screenshots (27 Nov 2026): at 360, 390 and 1280 px it checks both badges in the hero (the right
// addresses, a new tab with rel="noopener noreferrer", the accessible names, the same height, at least 44 px to tap), that every screenshot loads, that the
// page never scrolls sideways and that axe finds nothing; then saves the pictures in docs/site-shots/.
//   cd web && npm run build && (npx next start -p 3200 &) ; BASE=http://localhost:3200 node e2e/site-download.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const OUT = new URL("../../docs/site-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const APP_STORE = process.env.APP_STORE ?? "https://apps.apple.com/gb/app/numbite-calories-protein/id6822767746";
const PLAY = process.env.PLAY ?? "https://play.google.com/store/apps/details?id=com.amanmarwaha.numbite";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

for (const width of [360, 390, 1280]) {
  const height = width < 1024 ? 844 : 800;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: "light", serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  console.log(`\n${width} px`);

  // the badges, in the hero's own section and on the first screen
  const hero = p.locator("main > section").first();
  const links = hero.getByRole("list", { name: "Get the app" }).getByRole("link");
  check((await links.count()) === 2, "two badge links in the hero");
  const want = [["Download Numbite on the App Store", APP_STORE], ["Get Numbite on Google Play", PLAY]];
  const boxes = [];
  for (const [name, href] of want) {
    const a = hero.getByRole("link", { name, exact: true });
    check(await a.isVisible(), `"${name}" visible`);
    check((await a.getAttribute("href")) === href, `"${name}" goes to ${href}`);
    check((await a.getAttribute("target")) === "_blank", `"${name}" opens a new tab`);
    const rel = ((await a.getAttribute("rel")) ?? "").split(/\s+/);
    check(rel.includes("noopener") && rel.includes("noreferrer"), `"${name}" rel="noopener noreferrer"`);
    const box = await a.boundingBox();
    boxes.push(box);
    check(box.height >= 44 && box.width >= 44, `"${name}" tap target ${Math.round(box.width)} x ${Math.round(box.height)} px`);
    check(box.y + box.height <= height, `"${name}" on the first screen (bottom at ${Math.round(box.y + box.height)} px)`);
    const img = a.locator("img");
    check(await img.evaluate((i) => i.complete && i.naturalWidth > 0), `"${name}" badge drawn`);
  }
  check(Math.abs(boxes[0].height - boxes[1].height) < 0.5, `badges the same height (${boxes[0].height} and ${boxes[1].height} px)`);
  const sideBySide = Math.abs(boxes[0].y - boxes[1].y) < 1;
  console.log(`     badges ${sideBySide ? "side by side" : "stacked"}`);
  if (width >= 390) check(sideBySide, "side by side");
  await p.screenshot({ path: `${OUT}home-${width}-first-screen.png` });

  // the screenshots: scroll down to them (they are lazy), then along the row on a phone, until every one is drawn
  const region = p.getByRole("region", { name: "App screenshots" });
  await region.scrollIntoViewIfNeeded();
  for (let i = 0; i < 12; i++) {
    await region.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.8 }));
    await p.waitForTimeout(250);
  }
  await region.evaluate((el) => el.scrollTo({ left: 0 }));
  await p.waitForLoadState("networkidle");
  const shots = await region.locator("img").evaluateAll((imgs) => imgs.map((i) => ({ src: i.currentSrc, ok: i.complete && i.naturalWidth > 0, lazy: i.loading, w: i.getAttribute("width"), h: i.getAttribute("height") })));
  check(shots.length === 10 && shots.every((s) => s.ok), `${shots.filter((s) => s.ok).length} of ${shots.length} screenshots drawn (${shots[0]?.src.split("/").pop()} ...)`);
  check(shots.every((s) => s.lazy === "lazy" && s.w && s.h), "every screenshot lazy, with width and height");
  check(await p.getByText("Not affiliated with any restaurant or shop shown.").isVisible(), "the not-affiliated line under the screenshots");

  // no sideways scroll
  const over = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  check(over <= 0, `no sideways scroll (${over} px over)`);

  // axe, on the whole page
  await p.addScriptTag({ path: AXE });
  const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  check(v.length === 0, `axe: ${v.length ? v.join(", ") : "no violations"}`);

  if (width !== 360) {
    // the whole page at 1x, for the record (a 2x copy of the full page would be needlessly large)
    const flat = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "light", serviceWorkers: "block" });
    const q = await flat.newPage();
    await q.goto(BASE + "/", { waitUntil: "networkidle" });
    await q.evaluate(() => { for (const img of document.images) img.loading = "eager"; });
    await q.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
    // decoded before the capture, or a full-page screenshot can catch them loaded but not yet painted
    await q.evaluate(async () => { for (const i of document.images) i.decoding = "sync"; await Promise.all([...document.images].map((i) => i.decode().catch(() => null))); });
    await q.waitForTimeout(500);
    await q.screenshot({ path: `${OUT}home-${width}-full.png`, fullPage: true });
    await flat.close();
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
