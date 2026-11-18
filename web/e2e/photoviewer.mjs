// The whole picture, full screen (founder 2026-11-18: "There should be a thing in the bottom right of the image of the photo where you can zoom in for full
// view of what it looks like"): the round button at the recipe picture's bottom right opens it uncropped on black; Zoom in and a double tap zoom, a drag
// moves round, Close and Escape shut it. Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3007";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
await ctx.addInitScript((s) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("mm.v1.settings", s);
  localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
}, JSON.stringify({ v: 1, data: settings }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await step("the button sits at the picture's bottom right, clear of the sheet, a big target", async () => {
  await page.goto(BASE + "/app/recipes/view?id=overnight-oats&r=sainsburys");
  const button = page.getByRole("button", { name: "See the whole picture" });
  await button.waitFor({ timeout: 90000 });
  const b = await button.boundingBox();
  const pic = await page.locator("img[alt^='An illustration of']").first().boundingBox();
  expect(b.width >= 44 && b.height >= 44, `size ${b.width}x${b.height}`);
  expect(b.x + b.width > pic.x + pic.width - 40 && b.y + b.height > pic.y + pic.height - 110 && b.y + b.height < pic.y + pic.height, `at ${JSON.stringify(b)} in ${JSON.stringify(pic)}`);
});

await step("it opens the whole picture uncropped, with Close focused; axe finds nothing", async () => {
  await page.getByRole("button", { name: "See the whole picture" }).tap();
  const dialog = page.getByRole("dialog", { name: "The whole picture" });
  await dialog.waitFor();
  const img = dialog.locator("img");
  const fit = await img.evaluate((el) => getComputedStyle(el).objectFit);
  expect(fit === "contain", `object-fit ${fit}`);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Close"), "Close has the focus");
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document.querySelector("dialog[open]"), { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 90)}`));
  expect(v.length === 0, v.join(" | "));
});

await step("Zoom in, a drag and Zoom out", async () => {
  const dialog = page.getByRole("dialog", { name: "The whole picture" });
  const img = dialog.locator("img");
  await dialog.getByRole("button", { name: "Zoom in" }).tap();
  await page.waitForTimeout(300);
  expect(/scale\(2\.5\)/.test(await img.evaluate((el) => el.style.transform)), "zoomed to 2.5");
  const box = await dialog.boundingBox();
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.width / 2 + 80, box.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(/translate3d\((?!0px)/.test(await img.evaluate((el) => el.style.transform)), "moved by the drag");
  await dialog.getByRole("button", { name: "Zoom out" }).tap();
  await page.waitForTimeout(300);
  expect(/scale\(1\)/.test(await img.evaluate((el) => el.style.transform)), "back to the whole picture");
});

await step("Close and Escape shut it; the page is as it was", async () => {
  const dialog = page.getByRole("dialog", { name: "The whole picture" });
  await dialog.getByRole("button", { name: "Close" }).tap();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "See the whole picture" }).tap();
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
  expect(errors.length === 0, errors.join(" | "));
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
