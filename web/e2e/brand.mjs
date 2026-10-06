// Renders our own app icon and social card from web/design/ (icon.svg, og.html) into the files the site and PWA use.
// Run after changing either source or the app name:  node brand.mjs   (then check web/e2e/shots/brand-*.png)
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const web = new URL("../", import.meta.url).pathname;
const site = readFileSync(web + "site.config.ts", "utf8");
const name = /name: "([^"]+)"/.exec(site)[1];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage();

async function icon(size, out, { radius = 0, pad = 0 } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const svg = readFileSync(web + "design/icon.svg", "utf8");
  // maskable: shrink the mark a little further into the safe zone over the same background colour
  await page.setContent(`<html><body style="margin:0;background:${radius ? "transparent" : "#22c55e"}"><div style="width:${size}px;height:${size}px;border-radius:${radius * size}px;overflow:hidden;background:#22c55e;display:flex;align-items:center;justify-content:center">
    <div style="width:${size * (1 - pad * 2)}px;height:${size * (1 - pad * 2)}px">${svg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ')}</div></div></body></html>`);
  await page.screenshot({ path: web + out, omitBackground: radius > 0 });
  console.log("wrote", out);
}

await icon(512, "public/icons/icon-512.png");
await icon(192, "public/icons/icon-192.png");
await icon(512, "public/icons/icon-maskable-512.png"); // the mark already sits inside the maskable safe zone
await icon(180, "app/apple-icon.png");
await icon(512, "app/icon.png", { radius: 0.22 });
await icon(32, "e2e/shots/favicon-32.png", { radius: 0.22 });
await icon(16, "e2e/shots/favicon-16.png", { radius: 0.22 });
// favicon.ico holds the 16 and 32 px renders (Pillow is only a local tool here, not a project dependency)
execFileSync("python3", ["-c", `from PIL import Image; a=Image.open('${web}e2e/shots/favicon-32.png'); a.save('${web}app/favicon.ico', sizes=[(16,16),(32,32)], append_images=[Image.open('${web}e2e/shots/favicon-16.png')])`]);
console.log("wrote app/favicon.ico");

await page.setViewportSize({ width: 1200, height: 630 });
const og = readFileSync(web + "design/og.html", "utf8").replaceAll("{{NAME}}", name);
writeFileSync(web + "design/.og-rendered.html", og);
await page.goto("file://" + web + "design/.og-rendered.html");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: web + "app/opengraph-image.png" });
console.log("wrote app/opengraph-image.png");

// a review sheet: the icon at real sizes on light and dark, plus the card
await page.setViewportSize({ width: 900, height: 420 });
const b64 = (f) => readFileSync(web + f).toString("base64");
await page.setContent(`<body style="margin:0;font-family:sans-serif;display:grid;grid-template-columns:1fr 1fr">${["#ffffff", "#111"].map((bg) => `<div style="background:${bg};padding:24px;display:flex;gap:20px;align-items:end">
  <img src="data:image/png;base64,${b64("app/icon.png")}" width="180"><img src="data:image/png;base64,${b64("app/apple-icon.png")}" width="60" style="border-radius:13px"><img src="data:image/png;base64,${b64("e2e/shots/favicon-32.png")}" width="32"><img src="data:image/png;base64,${b64("e2e/shots/favicon-16.png")}" width="16"></div>`).join("")}
  <div style="grid-column:1/3;background:#222;padding:16px"><img src="data:image/png;base64,${b64("app/opengraph-image.png")}" width="560"></div></body>`);
await page.screenshot({ path: web + "e2e/shots/brand-sheet.png" });
await browser.close();
