// Screenshots for review: node shoot.mjs <name>=<path> ... (env: BASE, THEME=dark|light, WIDTH=390, FULL=1, PRO=1, SCALE=100)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3101";
const theme = process.env.THEME ?? "dark";
const width = Number(process.env.WIDTH ?? 390);
const scale = Number(process.env.SCALE ?? 100);
mkdirSync(new URL("./shots/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: theme, serviceWorkers: "block", deviceScaleFactor: 2 });
const pro = process.env.PRO === "1";
if (process.env.GEO) { // GEO="lat,lng": a pretend location, with permission already granted
  const [latitude, longitude] = process.env.GEO.split(",").map(Number);
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude, longitude });
}
await ctx.addInitScript(([pro, scale]) => {
  if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 160, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, devProOverride: pro } }));
  if (scale !== 100) document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = `${scale}%`; });
}, [pro, scale]);
const page = await ctx.newPage();
if (process.env.WAIT) page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 200)));
for (const arg of process.argv.slice(2)) {
  const name = arg.slice(0, arg.indexOf("=")), path = arg.slice(arg.indexOf("=") + 1);
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(Number(process.env.WAIT ?? 600));
  const file = new URL(`./shots/${name}-${theme}-${width}${scale !== 100 ? `-${scale}` : ""}.png`, import.meta.url).pathname;
  await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(file, overflow ? "OVERFLOW" : "");
}
await browser.close();
