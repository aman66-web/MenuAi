// Makes the Android launcher icon, splash icon and notification icon from the app's real artwork, web/design/icon.svg (the same file the iPhone's icon and
// the website's icons are drawn from). Nothing is redrawn: the background, the plate-and-fork mark and its bite are that file's own shapes, cut into layers.
//   adaptive icon: background layer (the green gradient), foreground layer (the mark, scaled to sit inside Android's safe zone) and a monochrome layer for
//   Android 13's themed icons (the plate with the fork cut out, one colour); legacy square and round PNGs; the Android 12 splash icon; the notification icon.
// Run from anywhere:  node scripts/android_make_icons.mjs   (needs web/node_modules: sharp). Writes into android/app/src/main/res/.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "web", "package.json"));
const sharp = require("sharp");
const res = path.join(root, "android/app/src/main/res");
const svg = readFileSync(path.join(root, "web/design/icon.svg"), "utf8");

// --- the artwork's own pieces
const open = svg.slice(0, svg.indexOf("<defs>"));                  // <svg ...> (comment included)
const defs = svg.slice(svg.indexOf("<defs>"), svg.indexOf("</defs>") + 7);
const bgRects = svg.slice(svg.indexOf("</defs>") + 7, svg.indexOf('<g filter="url(#shadow)">')); // the gradient and its shine
const glyph = svg.slice(svg.indexOf('<g filter="url(#shadow)">'), svg.lastIndexOf("</svg>")); // the plate, its bite, the fork and the soft shadow
const fork = glyph.slice(glyph.indexOf('<g fill="#15803d">'), glyph.indexOf("</g>", glyph.indexOf('<g fill="#15803d">')) + 4);
if (!bgRects.includes("url(#bg)") || !glyph.includes("url(#bite)") || !fork.includes("<path")) throw new Error("web/design/icon.svg changed shape: update this script");

const wrap = (body) => Buffer.from(`${open}${defs}${body}</svg>`);
const full = wrap(bgRects + glyph);
// The mark, scaled about the middle so the whole plate sits inside the 66 dp circle Android promises never to cut off (it is 67% of the square in the artwork).
const FOREGROUND_SCALE = 0.84;
const scaled = (body) => `<g transform="translate(256 256) scale(${FOREGROUND_SCALE}) translate(-256 -256)">${body}</g>`;
const foreground = wrap(scaled(glyph));
const background = wrap(bgRects);
// Monochrome: the plate (with its bite) in one colour, the fork cut out of it; the system tints it.
const cutMask = `<mask id="forkcut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/>${fork.replace('fill="#15803d"', 'fill="#000"')}</mask>`;
const monoBody = `<g mask="url(#bite)"><g mask="url(#forkcut)"><circle cx="256" cy="262" r="172" fill="#fff"/></g></g>`;
const mono = Buffer.from(`${open}${defs.replace("</defs>", `${cutMask}</defs>`)}${scaled(monoBody)}</svg>`);
const monoFlat = Buffer.from(`${open}${defs.replace("</defs>", `${cutMask}</defs>`)}<g transform="translate(256 256) scale(1.12) translate(-256 -256)">${monoBody}</g></svg>`);

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const out = (dir, name, buf) => { const d = path.join(res, dir); mkdirSync(d, { recursive: true }); writeFileSync(path.join(d, name), buf); };
const render = (src, px) => sharp(src, { density: 72 * (px / 512) * 4 }).resize(px, px).png();
const circle = (px) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);

for (const [d, k] of Object.entries(DENSITY)) {
  const layer = Math.round(108 * k);   // adaptive layers are 108 dp
  const legacy = Math.round(48 * k);   // legacy launcher icons are 48 dp
  out(`mipmap-${d}`, "ic_launcher_background.png", await render(background, layer).toBuffer());
  out(`mipmap-${d}`, "ic_launcher_foreground.png", await render(foreground, layer).toBuffer());
  out(`mipmap-${d}`, "ic_launcher_monochrome.png", await render(mono, layer).toBuffer());
  const square = await render(full, legacy).toBuffer();
  out(`mipmap-${d}`, "ic_launcher.png", square);
  out(`mipmap-${d}`, "ic_launcher_round.png", await sharp(square).composite([{ input: circle(legacy), blend: "dest-in" }]).png().toBuffer());
  const stat = Math.round(24 * k);     // notification small icon: 24 dp, white on transparent
  out(`drawable-${d}`, "ic_stat_numbite.png", await render(monoFlat, stat).toBuffer());
}

// Android 12 splash: the round icon, 192 dp across in a 288 dp canvas (the system shows the middle 2/3 of it).
{
  const canvas = 1152, icon = 768;
  const round = await sharp(await render(full, icon).toBuffer()).composite([{ input: circle(icon), blend: "dest-in" }]).png().toBuffer();
  out("drawable-xxxhdpi", "splash_icon.png", await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: round, left: (canvas - icon) / 2, top: (canvas - icon) / 2 }]).png().toBuffer());
}
// The 512 px Google Play listing icon (uploaded in Play Console by hand; not part of the app).
mkdirSync(path.join(root, "android/store"), { recursive: true });
writeFileSync(path.join(root, "android/store/play-icon-512.png"), await render(full, 512).toBuffer());
console.log("Android icons written to", res);
