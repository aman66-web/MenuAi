// Scan a barcode (founder 2026-10-15: "for the scan barcode can it launch like a camera where you can scan it"): tapping Scan opens a full-screen camera with
// a box to hold the barcode in, reads it from the live picture (the page's own reader: iPhone Safari has no BarcodeDetector) and opens the product; the number
// can be typed instead; a refused or missing camera lands on the typing sheet with a note. The camera is Chromium's fake one, playing a video of a real-sized
// EAN-13 drawn here (never a still of the app's own data), so the whole path runs: permission, video, frames, reading, navigation.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });

// ---- a video of a barcode: EAN-13 drawn from the printed tables, as a Y4M file for Chromium's fake camera
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((b) => [...b].map((x) => (x === "0" ? "1" : "0")).join(""));
const G = R.map((b) => [...b].reverse().join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGLLGL"];
PARITY[9] = "LGGLGL";
function modules(code) {
  const d = [...code].map(Number);
  const left = PARITY[d[0]];
  return "101" + d.slice(1, 7).map((x, i) => (left[i] === "L" ? L[x] : G[x])).join("") + "01010" + d.slice(7).map((x) => R[x]).join("") + "101";
}
function y4m(code, { w = 640, h = 480, px = 4, frames = 4 } = {}) {
  const y = new Uint8Array(w * h).fill(228);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 40; i++) { // print around it, like a pack
    const x = Math.floor(rnd() * (w - 60)), yy = Math.floor(rnd() * (h - 10)), ww = 8 + Math.floor(rnd() * 50);
    for (let r = 0; r < 4; r++) for (let c = 0; c < ww; c++) y[(yy + r) * w + x + c] = 60;
  }
  if (code) {
    const bits = modules(code);
    const x0 = Math.floor((w - bits.length * px) / 2), y0 = Math.floor((h - 190) / 2);
    for (let r = 0; r < 190; r++) for (let i = 0; i < bits.length; i++) for (let c = 0; c < px; c++) y[(y0 + r) * w + x0 + i * px + c] = bits[i] === "1" ? 25 : 232;
  }
  for (let i = 0; i < y.length; i++) y[i] = Math.max(0, Math.min(255, y[i] + Math.floor(rnd() * 9) - 4));
  const header = Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`);
  const chroma = Buffer.alloc((w / 2) * (h / 2), 128);
  const parts = [header];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from("FRAME\n"), Buffer.from(y), chroma, chroma);
  return Buffer.concat(parts);
}
const dir = mkdtempSync(join(tmpdir(), "scan-"));
const withCode = join(dir, "code.y4m");
const noCode = join(dir, "none.y4m");
const CODE = "5000157024671";
writeFileSync(withCode, y4m(CODE));
writeFileSync(noCode, y4m(null));

const launch = (file) => chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`],
});
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function open(browser, { camera = true, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", permissions: camera ? ["camera"] : [] });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  return { ctx, page };
}
const camera = (page) => page.getByRole("dialog", { name: "Scan a barcode" });

const withBrowser = await launch(withCode);

await step("Scan a barcode opens a full-screen camera with a box and a hint, reads the barcode from the live picture and opens the product", async () => {
  const { ctx, page } = await open(withBrowser);
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  const view = camera(page);
  await view.waitFor({ timeout: 15000 });
  await view.getByText("Point the camera at the barcode").waitFor();
  const box = await view.boundingBox();
  expect(box.width >= 389 && box.height >= 843, `the camera fills the screen: ${box.width} x ${box.height}`);
  await view.getByRole("button", { name: "Type the number instead" }).waitFor();
  await page.waitForURL(`**/app/groceries/product?code=${CODE}`, { timeout: 30000 });
  await ctx.close();
});

await step("the camera is switched off again once the product opens (no light left on)", async () => {
  const { ctx, page } = await open(withBrowser);
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  await page.waitForURL(`**/app/groceries/product?code=${CODE}`, { timeout: 30000 });
  await page.waitForTimeout(500);
  const live = await page.evaluate(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.length >= 0 && [...document.querySelectorAll("video")].length;
  });
  expect(live === 0, "no video element left on the product page");
  await ctx.close();
});

await step("Close shuts the camera and gives the page back", async () => {
  const { ctx, page } = await open(withBrowser);
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  await camera(page).waitFor({ timeout: 15000 });
  await camera(page).getByRole("button", { name: "Close" }).tap();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 5000 });
  await page.getByRole("link", { name: /Search every shop at once/ }).waitFor();
  expect(page.url().includes("/app/groceries"), "still on Groceries");
  await ctx.close();
});

await step("a refused camera lands on the typing sheet with the note, and a browser with no camera API says so", async () => {
  const refused = await open(withBrowser, { init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError")); } });
  await refused.page.goto(BASE + "/app/groceries");
  await refused.page.getByRole("button", { name: "Scan a barcode" }).tap();
  await refused.page.getByText(/The camera isn't available \(or was refused\)/).waitFor({ timeout: 15000 });
  await refused.page.getByLabel("Barcode number").waitFor();
  await refused.ctx.close();
  const none = await open(withBrowser, { init: () => { Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }); } });
  await none.page.goto(BASE + "/app/groceries");
  await none.page.getByRole("button", { name: "Scan a barcode" }).tap();
  await none.page.getByText(/This browser can't read barcodes with the camera/).waitFor({ timeout: 15000 });
  await none.ctx.close();
});

await step("the scan button on Search every shop opens the same camera", async () => {
  const { ctx, page } = await open(withBrowser);
  await page.goto(BASE + "/app/groceries/search");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  await camera(page).waitFor({ timeout: 15000 });
  await page.waitForURL(`**/app/groceries/product?code=${CODE}`, { timeout: 30000 });
  await ctx.close();
});

await step("accessibility: the camera view has no axe violations", async () => {
  const { ctx, page } = await open(withBrowser);
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  await camera(page).waitFor({ timeout: 15000 });
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => await globalThis.axe.run(document, { resultTypes: ["violations"] }));
  expect(res.violations.length === 0, res.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", "));
  await ctx.close();
});
await withBrowser.close();

const blankBrowser = await launch(noCode);
await step("a picture with no barcode in it is never read as one: the camera stays up and the page doesn't move", async () => {
  const { ctx, page } = await open(blankBrowser);
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  await camera(page).waitFor({ timeout: 15000 });
  await page.waitForTimeout(5000);
  expect(page.url().endsWith("/app/groceries"), "still on Groceries: " + page.url());
  expect(await camera(page).isVisible(), "the camera is still showing");
  await ctx.close();
});
await step("Type the number instead opens the typing sheet; a number finds the product; Scan again goes back to the camera", async () => {
  const { ctx, page } = await open(blankBrowser);
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  await camera(page).waitFor({ timeout: 15000 });
  await camera(page).getByRole("button", { name: "Type the number instead" }).tap();
  await page.getByLabel("Barcode number").waitFor();
  expect((await page.locator("video").count()) === 0, "the camera is gone");
  await page.getByRole("button", { name: "Scan again" }).tap();
  await page.locator("video").first().waitFor({ timeout: 15000 });
  await ctx.close();
  const { ctx: c2, page: p2 } = await open(blankBrowser);
  await p2.goto(BASE + "/app/groceries");
  await p2.getByRole("button", { name: "Scan a barcode" }).tap();
  await camera(p2).getByRole("button", { name: "Type the number instead" }).tap();
  await p2.getByLabel("Barcode number").waitFor({ timeout: 15000 });
  await p2.getByLabel("Barcode number").fill("5010477348630");
  await p2.getByRole("button", { name: "Find" }).tap();
  await p2.waitForURL("**/app/groceries/product?code=5010477348630");
  await c2.close();
});

await blankBrowser.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
