// Nearby map, full screen (founder 2026-10-16: "a full screen mode on the bottom right where they can view in full screen ... move how they do in
// Google maps using their finger to move and their fingers to pinch and zoom in and out"). What this checks, on a real WebGL map in Chromium with
// touch on and a phone-sized screen:
//   - the button sits at the map's bottom right, the credits moved to the bottom left and never run under it;
//   - in the page nothing changed (one finger scrolls the page, two fingers move the map, a twist does not turn it);
//   - full screen: the SAME map fills the screen (same canvas, pins, camera), the page behind is locked, one finger drags, two fingers pinch,
//     double-tap, the zoom buttons and the mouse wheel zoom;
//   - a tapped pin shows the restaurant's card inside the full-screen view (Menu, Directions), lifted clear of the map's foot;
//   - the button, Escape and the Back gesture all leave, landing exactly where the person was, with the camera they chose kept;
//   - Menu from the card, a race with MapLibre's two-finger hint, the notch and home bar (portrait and landscape), 200% text, Arabic, axe, privacy.
// The map style is a tiny stub (a flat blue background, no tiles), so the map really loads and a pixel can be read, with no network.
// Run against a production build on ITS OWN port, e.g.  BASE=http://localhost:3104 node e2e/mapfs.mjs
//
// If Next turns out to remount or reload on the same-URL history traversal (the "leaving with the Back gesture" and "Menu from the card" steps lose the
// marker or the canvas), set PUSH_FULLSCREEN_ENTRY = false in lib/mm/mapFullscreen.ts. Leaving then still lands exactly where the person was (the scroll is
// recorded on every way in, unit-tested), but Back leaves the page as before this feature: change the Back-gesture visit to expect goBack() to leave the
// page, drop the "history grew by 1" check in the entering step, and the "two quick taps pushed one entry" check in the Menu step.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const dict = (code) => JSON.parse(readFileSync(new URL(`../lib/mm/locales/${code}.json`, import.meta.url), "utf8"));

const HERE = { latitude: 51.5007, longitude: -0.1246 }; // Westminster: the pretend position is exactly the KFC branch
const GREGGS = { lat: 51.5014, lng: -0.1419 };
const KFC = { lat: 51.5007, lng: -0.1246 };
const settings = (extra = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, ...extra } });
const FIXTURE = { v: 1, generatedOn: "2026-10-16", source: "test", chains: { kfc: [51.5007, -0.1246, 51.52, -0.1], greggs: [51.5014, -0.1419], "burger-king": [55.95, -3.19] } };
const BLUE = [51, 102, 153]; // the stub style's background, #336699
const STYLE = {
  version: 8,
  sources: { omt: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#336699" } }, { id: "l", type: "line", source: "omt" }],
};

// ---- helpers (start): pure page/gesture helpers; no dependence on the app's address, so they can be tried on any MapLibre page
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** The camera as the map publishes it on its container (MapView's test hook). */
const cam = (page) => page.evaluate(() => {
  const d = document.querySelector("[data-nearby-map]").dataset;
  return { zoom: Number(d.zoom), lng: Number(d.lng), lat: Number(d.lat), bearing: Number(d.bearing) };
});
/** Waits until the camera has stopped changing (two reads 250 ms apart are equal; 5 s at most) and returns it. */
async function settle(page, capMs = 5000) {
  const t0 = Date.now();
  let prev = await cam(page);
  for (;;) {
    await sleep(250);
    const now = await cam(page);
    if (now.zoom === prev.zoom && now.lng === prev.lng && now.lat === prev.lat) return now;
    if (Date.now() - t0 > capMs) return now;
    prev = now;
  }
}
const mapRect = (page) => page.evaluate(() => {
  const r = document.querySelector("[data-nearby-map]").getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
/** Degrees of longitude that `px` screen pixels are worth at this zoom (MapLibre draws a 512 px world at zoom 0). */
const lngPerPx = (zoom) => 360 / (512 * 2 ** zoom);
/** Where a coordinate is on screen now: Web Mercator from the published centre and zoom, relative to the map's own box. */
async function pinXY(page, lng, lat) {
  const [r, c] = await Promise.all([mapRect(page), cam(page)]);
  const wx = (g) => (g + 180) / 360;
  const wy = (p) => (1 - Math.log(Math.tan(Math.PI / 4 + (p * Math.PI) / 360)) / Math.PI) / 2;
  const world = 512 * 2 ** c.zoom;
  return { x: r.x + r.width / 2 + (wx(lng) - wx(c.lng)) * world, y: r.y + r.height / 2 + (wy(lat) - wy(c.lat)) * world };
}
/** The colour of one screen pixel (a 1 x 1 screenshot, read from its PNG), so the map's own canvas can be judged, not just the page's boxes. */
async function px(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, type: "png" });
  let o = 8;
  let ihdr = null;
  const idat = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString("ascii", o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  if (!ihdr || ihdr[8] !== 8 || (ihdr[9] !== 2 && ihdr[9] !== 6)) throw new Error("unexpected PNG format from the screenshot");
  const raw = inflateSync(Buffer.concat(idat)); // one row: a filter byte, then the pixel (every filter type leaves a lone first pixel as it is)
  return [raw[1], raw[2], raw[3]];
}

// Real multi-finger input through the DevTools protocol (Playwright's own touchscreen only does single taps).
const pts = (a) => a.map(([x, y], id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 }));
const touch = (cdp, type, a) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts(a) });
async function drag(cdp, [x0, y0], [x1, y1], n = 8) {
  await touch(cdp, "touchStart", [[x0, y0]]);
  for (let i = 1; i <= n; i++) {
    await sleep(16);
    await touch(cdp, "touchMove", [[x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]]);
  }
  await touch(cdp, "touchEnd", []);
}
/** Two fingers on a horizontal line through c, `d0` px apart, moving to `d1` apart. */
async function pinch(cdp, [cx, cy], d0, d1, n = 10) {
  const at = (d) => [[cx - d / 2, cy], [cx + d / 2, cy]];
  await touch(cdp, "touchStart", at(d0));
  for (let i = 1; i <= n; i++) {
    await sleep(16);
    await touch(cdp, "touchMove", at(d0 + ((d1 - d0) * i) / n));
  }
  await touch(cdp, "touchEnd", []);
}
/** Two fingers 60 px apart moving together by (dx, dy). */
async function twoFingerPan(cdp, [cx, cy], dx, dy, n = 10) {
  const at = (k) => [[cx - 30 + dx * k, cy + dy * k], [cx + 30 + dx * k, cy + dy * k]];
  await touch(cdp, "touchStart", at(0));
  for (let i = 1; i <= n; i++) {
    await sleep(16);
    await touch(cdp, "touchMove", at(i / n));
  }
  await touch(cdp, "touchEnd", []);
}
/** Two fingers 120 px apart turning round c by `deg` degrees. */
async function twist(cdp, [cx, cy], deg, n = 12) {
  const r = 60;
  const at = (a) => [[cx + r * Math.cos(a), cy + r * Math.sin(a)], [cx - r * Math.cos(a), cy - r * Math.sin(a)]];
  await touch(cdp, "touchStart", at(0));
  for (let i = 1; i <= n; i++) {
    await sleep(16);
    await touch(cdp, "touchMove", at(((deg * Math.PI) / 180) * (i / n)));
  }
  await touch(cdp, "touchEnd", []);
}
// ---- helpers (end)

let passed = 0, failed = 0;
let currentStep = "";
let errorsAtStart = 0;
const pageErrors = [];
const allRequests = [];
let opened = [];
async function step(name, fn) {
  currentStep = name;
  errorsAtStart = pageErrors.length;
  try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
  for (const c of opened) await c.close().catch(() => undefined);
  opened = [];
}
const expect = (c, m) => { if (!c) throw new Error(m); };

/** A phone-sized page on Near me: a pretend position in Westminster, three branches, the stub map style, no other network. */
async function open({ touch: hasTouch = true, width = 390, height = 700, language = "" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch, isMobile: hasTouch, serviceWorkers: "block" });
  opened.push(ctx);
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation(HERE);
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings(language ? { language } : {}));
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => { const x = { url: r.url(), body: r.postData() ?? "" }; requests.push(x); allRequests.push(x); });
  page.on("pageerror", (e) => pageErrors.push(`[${currentStep}] ${e.message}`));
  // Playwright runs the LAST registered route that matches first: block every tile host, then let the one style address through
  await page.route("**/branches/branches.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(FIXTURE) }));
  await page.route("**/tiles.openfreemap.org/**", (r) => r.abort());
  await page.route("**/tiles.openfreemap.org/styles/positron", (r) => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(STYLE) }));
  await page.route("**/api.postcodes.io/**", (r) => r.abort());
  const cdp = await ctx.newCDPSession(page);
  const labels = language ? { full: dict(language)["Full screen"] ?? "Full screen", exit: dict(language)["Exit full screen"] ?? "Exit full screen" } : { full: "Full screen", exit: "Exit full screen" };
  return {
    ctx, page, cdp, requests, labels,
    // exact: "Exit full screen" also contains the words "full screen"
    fsBtn: page.getByRole("button", { name: labels.full, exact: true }),
    exitBtn: page.getByRole("button", { name: labels.exit, exact: true }),
    frame: page.locator("[data-nearby-fs]"),
  };
}
const waitMap = (page) => page.locator('[data-nearby-map][data-ready="true"]').waitFor({ timeout: 30000 });
/** Eat out first, then Near me, as full page loads, so a later goBack() has a known page to land on. */
async function goMap(s) {
  await s.page.goto(BASE + "/app/eat-out");
  await s.page.goto(BASE + "/app/map");
  await waitMap(s.page);
  await sleep(700); // the toggle ignores taps for 500 ms after the map section appears
}
const snap = (page) => page.evaluate(() => {
  const slot = document.querySelector("[data-nearby-slot]");
  return { y: window.scrollY, hist: history.length, slotTop: slot.getBoundingClientRect().top, slotH: slot.getBoundingClientRect().height, docH: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth };
});
/** Scrolls the page so the map's box starts `top` px below the top of the screen (the page is taller than the screen: there is room both ways). */
async function placeMap(page, top = 70) {
  await page.evaluate((t) => window.scrollBy(0, document.querySelector("[data-nearby-slot]").getBoundingClientRect().top - t), top);
  await sleep(200);
}
/** Brings the toggle into view only if the page position hides it (used after scrolling to the very bottom). */
async function ensureToggleVisible(page) {
  await page.evaluate(() => {
    const r = document.querySelector(".map-fs-button").getBoundingClientRect();
    if (r.top < 8 || r.bottom > innerHeight - 8) window.scrollBy(0, r.top - innerHeight / 2);
  });
  await sleep(200);
}
async function enter(s) {
  await s.fsBtn.tap();
  await s.page.locator('[data-nearby-fs="full"]').waitFor({ timeout: 5000 });
  await sleep(450); // the layout effect has resized the map; focus has moved
}
const touchAction = (page) => page.evaluate(() => getComputedStyle(document.querySelector("canvas.maplibregl-canvas")).touchAction);
const rectOf = (page, sel) => page.evaluate((q) => {
  const e = document.querySelector(q);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);
const centre = (r) => [r.x + r.width / 2, r.y + r.height / 2];
const sameCam = (a, b, msg) => expect(near(a.lng, b.lng, 1e-4) && near(a.lat, b.lat, 1e-4) && near(a.zoom, b.zoom, 0.002), `${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
const movedLng = (a, b) => b.lng - a.lng;
/** Taps a restaurant's pin by working out where it is on screen. */
async function tapPin(page, p) {
  const { x, y } = await pinXY(page, p.lng, p.lat);
  await page.touchscreen.tap(x, y);
  await sleep(300);
  return { x, y };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------

await step("the button is at the map's bottom right, the credits are at the bottom left and never run under it", async () => {
  for (const width of [390, 320]) {
    const s = await open({ width, height: 700 });
    await goMap(s);
    const frame = await rectOf(s.page, "[data-nearby-fs]");
    const btn = await s.fsBtn.boundingBox();
    expect(btn && btn.width >= 43.9 && btn.height >= 43.9, `[${width}] button ${JSON.stringify(btn)} is under 44 px`);
    const fromRight = frame.x + frame.width - (btn.x + btn.width);
    const fromBottom = frame.y + frame.height - (btn.y + btn.height);
    expect(fromRight >= 15 && fromRight <= 30 && fromBottom >= 15 && fromBottom <= 30, `[${width}] button is ${fromRight} px from the right and ${fromBottom} px from the bottom of the map`);
    const zoomIn = await rectOf(s.page, ".maplibregl-ctrl-zoom-in");
    const zoomOut = await rectOf(s.page, ".maplibregl-ctrl-zoom-out");
    expect(zoomIn.width >= 43.9 && zoomIn.height >= 43.9 && zoomOut.height >= 43.9, `[${width}] zoom buttons are under 44 px`);
    expect(zoomIn.y - frame.y < 40, `[${width}] the zoom buttons moved from the top: ${zoomIn.y - frame.y}`);
    expect(near(zoomIn.x + zoomIn.width, btn.x + btn.width, 2), `[${width}] the button is not in line with the zoom buttons (${zoomIn.x + zoomIn.width} vs ${btn.x + btn.width})`);
    expect((await s.page.locator(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib").count()) === 1, `[${width}] credits not at the bottom left`);
    expect((await s.page.locator(".maplibregl-ctrl-bottom-right > *").count()) === 0, `[${width}] something is still at the bottom right`);
    expect((await s.frame.getAttribute("data-nearby-fs")) === "page", `[${width}] not in page mode at first`);
    expect((await s.exitBtn.count()) === 0, `[${width}] an Exit button in the page`);
    // the credits start open (MapLibre shows them until the map is dragged); closed, then open again: the box never touches the button
    const shown = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) await s.page.locator(".maplibregl-ctrl-attrib-button").click();
      await sleep(250);
      const isOpen = await s.page.locator(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib").evaluate((e) => e.classList.contains("maplibregl-compact-show"));
      shown.push(isOpen);
      const a = await rectOf(s.page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib");
      expect(!intersects(a, btn), `[${width}] the credits (${isOpen ? "open" : "closed"}) run under the button: ${JSON.stringify(a)} vs ${JSON.stringify(btn)}`);
      expect(a.x >= frame.x && a.x + a.width <= frame.x + frame.width, `[${width}] the credits (${isOpen ? "open" : "closed"}) leave the map`);
    }
    expect(shown[1] !== shown[0] && shown[2] === shown[0], `[${width}] the credits button does not toggle them: ${shown}`);
  }
});

await step("the credits' little \"i\" has a 44 px tap area, in the page and in full screen (where it is the only credit shown)", async () => {
  const s = await open();
  const { page } = s;
  await goMap(s);
  await placeMap(page, 70);
  const isOpen = () => page.locator(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib").evaluate((e) => e.classList.contains("maplibregl-compact-show"));
  const check = async (mode) => {
    const area = await page.evaluate(() => {
      const q = getComputedStyle(document.querySelector(".maplibregl-ctrl-attrib-button"), "::before");
      return { w: parseFloat(q.width), h: parseFloat(q.height) };
    });
    expect(area.w >= 43.9 && area.h >= 43.9, `[${mode}] the credits button's tap area is ${area.w} x ${area.h}`);
    const b = await rectOf(page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib-button");
    expect(b.width < 30 && b.height < 30, `[${mode}] the credits button itself grew to ${b.width} x ${b.height}: only its tap area should`);
    // a tap beside the button (9 px to its left) and one below it, then one above it, each toggles the credits
    for (const [dx, dy, where] of [[-9, b.height + 9, "below"], [-9, -9, "above"]]) {
      const b2 = await rectOf(page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib-button");
      const was = await isOpen();
      await page.touchscreen.tap(b2.x + dx, b2.y + dy);
      await sleep(250);
      expect((await isOpen()) !== was, `[${mode}] a tap 9 px to the left of and ${where} the credits button did not toggle the credits`);
    }
  };
  await check("page");
  await enter(s);
  await check("full screen");
});

await step("in the page nothing changed: one finger scrolls the page, two fingers move the map, a twist does not turn it", async () => {
  const s = await open();
  const { page, cdp } = s;
  await goMap(s);
  const m0 = await snap(page);
  expect(m0.docH - m0.vh >= 150, `the page is only ${m0.docH - m0.vh} px taller than the screen: the scroll tests need 150`);
  expect((await touchAction(page)) === "pan-x pan-y", `touch-action in the page is ${await touchAction(page)}`);
  expect((await page.locator("[data-nearby-map]").getAttribute("role")) === "region", "the map has lost its region role in the page");
  await placeMap(page, 70);
  let c0 = await settle(page);
  const r = await mapRect(page);
  // one finger, vertical: the page scrolls (towards whichever end has room), the map does not move
  const before = await snap(page);
  const room = before.docH - before.vh - before.y;
  const dy = room >= before.y ? -160 : 160;
  await drag(cdp, [r.x + 120, r.y + r.height / 2], [r.x + 120, r.y + r.height / 2 + dy], 10);
  await sleep(700);
  const after = await snap(page);
  expect(Math.abs(after.y - before.y) > 50, `one finger over the map did not scroll the page (${before.y} -> ${after.y})`);
  sameCam(await cam(page), c0, "one finger moved the map in the page");
  // one finger, horizontal: nothing moves
  await placeMap(page, 70);
  c0 = await settle(page);
  const r2 = await mapRect(page);
  await drag(cdp, [r2.x + 250, r2.y + r2.height / 2 + 60], [r2.x + 120, r2.y + r2.height / 2 + 60], 8);
  await sleep(500);
  sameCam(await cam(page), c0, "a sideways finger moved the map in the page");
  // two fingers pinch out: the map zooms
  await placeMap(page, 70);
  c0 = await settle(page);
  const r3 = await mapRect(page);
  await pinch(cdp, centre(r3), 60, 200);
  const c1 = await settle(page);
  expect(c1.zoom - c0.zoom > 0.8, `a pinch out in the page changed the zoom by ${c1.zoom - c0.zoom}`);
  // two fingers together: the map moves
  await twoFingerPan(cdp, centre(r3), -80, 0);
  const c2 = await settle(page);
  const ideal = 80 * lngPerPx(c1.zoom);
  expect(movedLng(c1, c2) > ideal * 0.5, `two fingers moved the centre by ${movedLng(c1, c2)} degrees, about ${ideal} expected`);
  // a twist: the bearing stays 0 (the map has no compass to undo a turn)
  await twist(cdp, centre(r3), 60);
  const c3 = await settle(page);
  expect(Math.abs(c3.bearing) < 0.05, `a two-finger twist turned the map to ${c3.bearing} degrees`);
});

await step("in the page with a mouse: a plain wheel scrolls the page and leaves the zoom alone", async () => {
  const s = await open({ touch: false });
  const { page } = s;
  await goMap(s);
  await placeMap(page, 70);
  const c0 = await settle(page);
  const before = await snap(page);
  const room = before.docH - before.vh - before.y;
  const r = await mapRect(page);
  await page.mouse.move(...centre(r));
  await page.mouse.wheel(0, room >= before.y ? 200 : -200);
  await sleep(600);
  const after = await snap(page);
  expect(Math.abs(after.y - before.y) > 50, `a plain wheel over the map did not scroll the page (${before.y} -> ${after.y})`);
  sameCam(await settle(page), c0, "a plain wheel zoomed the map in the page");
});

await step("entering: the same map fills the whole screen, the page behind is locked and nothing is rebuilt", async () => {
  const s = await open();
  const { page } = s;
  await goMap(s);
  const m = await snap(page);
  expect(m.docH - m.vh >= 150, `the page is only ${m.docH - m.vh} px taller than the screen`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); // as far down as the page goes
  await ensureToggleVisible(page);
  await page.evaluate(() => {
    document.querySelector("canvas.maplibregl-canvas").dataset.keep = "1";
    document.querySelector(".map-fs-button").dataset.keep = "1";
    window.__marker = "m";
  });
  const c0 = await settle(page);
  const before = await snap(page);
  await enter(s);
  const after = await snap(page);
  const st = await page.evaluate(() => {
    const f = document.querySelector("[data-nearby-fs]");
    const r = f.getBoundingClientRect();
    const canvases = document.querySelectorAll("canvas.maplibregl-canvas");
    const c = canvases[0].getBoundingClientRect();
    const w = innerWidth, h = innerHeight;
    const ours = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest("[data-nearby-fs]") && !e.closest("nav"); };
    const root = document.querySelector("[data-nearby-slot]").parentElement;
    const btn = document.querySelector(".map-fs-button");
    const others = [...root.children].filter((k) => !k.contains(f));
    return {
      frame: [r.x, r.y, r.width, r.height], canvas: [c.x, c.y, c.width, c.height], vp: [w, h],
      topmost: [ours(2, 2), ours(w - 3, 2), ours(2, h - 3), ours(w - 3, h - 3), ours(w / 2, h / 2)],
      canvases: canvases.length, keptCanvas: canvases[0].dataset.keep, ready: document.querySelector("[data-nearby-map]").dataset.ready,
      keptBtn: btn.dataset.keep, btnName: btn.getAttribute("aria-label"),
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      nav: getComputedStyle(document.querySelector(".app-surface > nav")).display,
      role: f.getAttribute("role"), modal: f.getAttribute("aria-modal"), label: f.getAttribute("aria-label"),
      region: document.querySelector("[data-nearby-map]").getAttribute("role"),
      othersInert: others.length > 0 && others.every((k) => k.hasAttribute("inert")),
      slotInert: root.querySelector("[data-nearby-slot]").hasAttribute("inert"),
      focused: document.activeElement === f,
      marker: window.__marker,
    };
  });
  expect(st.frame.join() === [0, 0, st.vp[0], st.vp[1]].join(), `the map's frame is ${st.frame} on a ${st.vp} screen`);
  expect(near(st.canvas[0], 0, 1) && near(st.canvas[1], 0, 1) && near(st.canvas[2], st.vp[0], 1) && near(st.canvas[3], st.vp[1], 1), `the canvas is ${st.canvas} on a ${st.vp} screen`);
  expect(st.topmost.every(Boolean), `something other than the map is on top at a corner or the middle: ${st.topmost}`);
  for (const [x, y] of [[2, 2], [st.vp[0] - 3, st.vp[1] - 3]]) {
    const p = await px(page, x, y);
    expect(p.every((v, i) => near(v, BLUE[i], 3)), `pixel (${x},${y}) is ${p}, not the map's ${BLUE}`);
  }
  expect(st.btnName === s.labels.exit && st.keptBtn === "1", `the button is "${st.btnName}" and ${st.keptBtn ? "the same node" : "a new node"}`);
  expect(st.canvases === 1 && st.keptCanvas === "1" && st.ready === "true", `canvases ${st.canvases}, kept ${st.keptCanvas}, ready ${st.ready}: the map was rebuilt`);
  expect(st.marker === "m", "the page reloaded");
  sameCam(await settle(page), c0, "the camera moved on entering");
  expect(st.htmlOverflow === "hidden" && after.y === before.y, `html overflow ${st.htmlOverflow}, scrollY ${before.y} -> ${after.y}`);
  expect((await touchAction(page)) === "none", `touch-action in full screen is ${await touchAction(page)}`);
  expect(st.nav === "none", `the tab bar is still shown (${st.nav})`);
  expect(st.role === "dialog" && st.modal === "true" && st.label === "Map", `dialog semantics: ${st.role}, ${st.modal}, ${st.label}`);
  expect(st.region === null, "the nested region role is still there");
  expect(st.othersInert && !st.slotInert, `inert: others ${st.othersInert}, the map's own section ${st.slotInert}`);
  expect(st.focused, "focus did not move into the full-screen map");
  expect(after.hist === before.hist + 1, `history grew from ${before.hist} to ${after.hist}`);
});

await step("reached from Eat out inside the app (the page-entrance animation): a tap in the first half second is ignored, a later one fills the screen", async () => {
  const s = await open();
  const { page } = s;
  await page.goto(BASE + "/app/eat-out");
  const nearMe = page.getByRole("link", { name: /Near me/ }).first();
  await nearMe.waitFor({ timeout: 30000 });
  await sleep(500); // hydrated, so the link is a client-side navigation
  await page.evaluate(() => { window.__marker = "m"; });
  // The watcher runs in the page, which survives the client-side navigation: it clicks the toggle ~120 ms after it first appears (after the mount effect has
  // armed the guard, well inside the 500 ms the guard ignores), and reports what the click did. Started before the navigation so no frame is missed.
  const watcher = page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    const look = () => {
      const b = document.querySelector(".map-fs-button");
      if (!b) {
        if (performance.now() - t0 > 25000) resolve({ timeout: true });
        else requestAnimationFrame(look);
        return;
      }
      const seen = performance.now();
      const hist0 = history.length;
      const animated = !!document.querySelector("[data-nearby-fs]")?.closest(".rise"); // the page-entrance wrapper that holds a transform while it plays
      setTimeout(() => {
        const delay = performance.now() - seen;
        b.click();
        setTimeout(() => resolve({ animated, hist0, hist1: history.length, state: document.querySelector("[data-nearby-fs]")?.getAttribute("data-nearby-fs"), delay }), 80);
      }, 120);
    };
    look();
  }));
  watcher.catch(() => undefined); // never an unhandled rejection if the navigation below fails first
  await nearMe.tap();
  await page.waitForURL(/\/app\/map/, { timeout: 15000 });
  const early = await watcher;
  expect(!early.timeout, "the full screen button never appeared after tapping Near me");
  expect(early.animated, "the map page was not inside the page-entrance wrapper: this did not exercise the in-app route");
  expect(early.delay < 400, `the early tap came ${Math.round(early.delay)} ms after the button appeared: too late to test the 500 ms guard`);
  expect(early.state === "page" && early.hist1 === early.hist0, `an early tap was not ignored: the map is "${early.state}", history ${early.hist0} -> ${early.hist1}`);
  await waitMap(page);
  await sleep(700); // the entrance animation (450 ms) is over and the guard is open
  const h0 = await page.evaluate(() => history.length);
  await s.fsBtn.tap();
  await page.locator('[data-nearby-fs="full"]').waitFor({ timeout: 5000 });
  await sleep(450);
  const st = await page.evaluate(() => {
    const f = document.querySelector("[data-nearby-fs]");
    const r = f.getBoundingClientRect();
    const c = document.querySelector("canvas.maplibregl-canvas").getBoundingClientRect();
    const rise = f.closest(".rise");
    return { frame: [r.x, r.y, r.width, r.height], canvas: [c.x, c.y, c.width, c.height], vp: [innerWidth, innerHeight], riseTransform: rise ? getComputedStyle(rise).transform : "no .rise", marker: window.__marker, hist: history.length };
  });
  expect(st.marker === "m", "the page reloaded: the route was not a client-side navigation");
  expect(st.riseTransform === "none", `the entrance wrapper still holds a transform (${st.riseTransform}): it would trap the fixed frame`);
  expect(st.frame.join() === [0, 0, st.vp[0], st.vp[1]].join(), `after in-app navigation the map's frame is ${st.frame} on a ${st.vp} screen`);
  expect(near(st.canvas[0], 0, 1) && near(st.canvas[1], 0, 1) && near(st.canvas[2], st.vp[0], 1) && near(st.canvas[3], st.vp[1], 1), `the canvas is ${st.canvas} on a ${st.vp} screen`);
  expect(st.hist === h0 + 1, `history grew from ${h0} to ${st.hist}`);
  const p = await px(page, 2, 2);
  expect(p.every((v, i) => near(v, BLUE[i], 3)), `pixel (2,2) is ${p}, not the map's ${BLUE}`);
  // leaving puts the person back on Near me, and one Back goes to Eat out (the entry full screen pushed is gone)
  await page.keyboard.press("Escape");
  await page.locator('[data-nearby-fs="page"]').waitFor({ timeout: 5000 });
  await sleep(700);
  await page.goBack();
  await page.waitForURL(/\/app\/eat-out$/, { timeout: 15000 });
});

await step("full screen moves like Google Maps: one finger drags, two pinch, double-tap, the buttons and the wheel zoom", async () => {
  const s = await open();
  const { page, cdp } = s;
  await goMap(s);
  await enter(s);
  const vw = 390, vh = 700;
  const y0 = (await snap(page)).y;
  let c = await settle(page);
  // one finger drags the map (and not the page behind): left by 100 px moves the centre east by about that many pixels' worth
  await drag(cdp, [vw / 2, vh / 2 + 150], [vw / 2 - 100, vh / 2 + 150], 8);
  let n = await settle(page);
  let ideal = 100 * lngPerPx(c.zoom);
  expect(movedLng(c, n) > ideal * 0.5 && movedLng(c, n) < ideal * 1.6, `a 100 px drag left moved the centre ${movedLng(c, n)} degrees, about ${ideal} expected`);
  expect((await snap(page)).y === y0, "the page behind scrolled");
  c = n;
  // and up and down: up by 100 px moves the centre south
  await drag(cdp, [vw / 2, vh / 2 + 150], [vw / 2, vh / 2 + 50], 8);
  n = await settle(page);
  expect(n.lat < c.lat - 1e-4, `a drag up did not move the centre south (${c.lat} -> ${n.lat})`);
  expect((await snap(page)).y === y0, "the page behind scrolled after a vertical drag");
  c = n;
  // two fingers pinch out, then in
  await pinch(cdp, [vw / 2, vh / 2], 60, 200);
  n = await settle(page);
  expect(n.zoom - c.zoom > 0.8, `a pinch out changed the zoom by ${n.zoom - c.zoom}`);
  c = n;
  await pinch(cdp, [vw / 2, vh / 2], 200, 60);
  n = await settle(page);
  expect(n.zoom - c.zoom < -0.8, `a pinch in changed the zoom by ${n.zoom - c.zoom}`);
  c = n;
  // two fingers together move the map; a twist does not turn it
  await twoFingerPan(cdp, [vw / 2, vh / 2], -80, 0);
  n = await settle(page);
  ideal = 80 * lngPerPx(c.zoom);
  expect(movedLng(c, n) > ideal * 0.5, `two fingers moved the centre ${movedLng(c, n)} degrees, about ${ideal} expected`);
  c = n;
  await twist(cdp, [vw / 2, vh / 2], 60);
  n = await settle(page);
  expect(Math.abs(n.bearing) < 0.05, `a twist turned the map to ${n.bearing} degrees`);
  c = n;
  // double-tap zooms in by one level
  await page.touchscreen.tap(80, 130);
  await sleep(60);
  await page.touchscreen.tap(80, 130);
  n = await settle(page);
  expect(near(n.zoom - c.zoom, 1, 0.3), `a double tap changed the zoom by ${n.zoom - c.zoom}`);
  c = n;
  // the buttons
  await page.locator(".maplibregl-ctrl-zoom-in").click();
  n = await settle(page);
  expect(near(n.zoom - c.zoom, 1, 0.3), `the + button changed the zoom by ${n.zoom - c.zoom}`);
  c = n;
  await page.locator(".maplibregl-ctrl-zoom-out").click();
  n = await settle(page);
  expect(near(n.zoom - c.zoom, -1, 0.3), `the - button changed the zoom by ${n.zoom - c.zoom}`);
  // a finger that starts on the button drags nothing and does not toggle it
  c = n;
  const b = await s.exitBtn.boundingBox();
  await drag(cdp, centre(b), [centre(b)[0] - 40, centre(b)[1] - 120], 8);
  await sleep(400);
  expect((await snap(page)).y === y0, "a drag that started on the button scrolled the page");
  sameCam(await settle(page), c, "a drag that started on the button moved the map");
  expect((await s.exitBtn.count()) === 1 && (await s.frame.getAttribute("data-nearby-fs")) === "full", "a drag that started on the button left full screen");
});

await step("full screen with a mouse: the wheel zooms without a modifier and a drag pans", async () => {
  const s = await open({ touch: false });
  const { page } = s;
  await goMap(s);
  await s.fsBtn.click();
  await page.locator('[data-nearby-fs="full"]').waitFor();
  await sleep(450);
  const c = await settle(page);
  await page.mouse.move(195, 350);
  await page.mouse.wheel(0, -400);
  const n = await settle(page);
  expect(n.zoom - c.zoom > 0.3, `a wheel notch changed the zoom by ${n.zoom - c.zoom}`);
  await page.mouse.move(250, 450);
  await page.mouse.down();
  await page.mouse.move(150, 450, { steps: 8 });
  await page.mouse.up();
  const d = await settle(page);
  expect(movedLng(n, d) > 100 * lngPerPx(n.zoom) * 0.5, `a mouse drag moved the centre ${movedLng(n, d)} degrees`);
});

await step("a tapped pin shows the restaurant's card inside the full-screen map, clear of the button and the credits", async () => {
  const s = await open();
  const { page } = s;
  await goMap(s);
  await enter(s);
  const g = await tapPin(page, GREGGS);
  const frame = s.frame;
  await frame.getByText("Greggs", { exact: true }).waitFor({ timeout: 5000 });
  expect((await frame.getByText(/ away$/).count()) === 1, "the distance line is missing");
  const menu = frame.getByRole("link", { name: "Menu", exact: true });
  expect((await menu.getAttribute("href")) === "/app/chain?id=greggs", `Menu points at ${await menu.getAttribute("href")}`);
  const dir = frame.getByRole("link", { name: /^Directions/ });
  expect((await dir.getAttribute("target")) === "_blank", "Directions does not open in a new tab");
  const status = await page.evaluate(() => ({ all: document.querySelectorAll('[role="status"]').length, inFrame: document.querySelectorAll('[data-nearby-fs] [role="status"]').length, pageCard: !!document.querySelector('[data-nearby-slot] ~ [role="status"]') }));
  expect(status.all === 1 && status.inFrame === 1 && !status.pageCard, `status cards: ${JSON.stringify(status)}`);
  await sleep(500); // the card slides up
  const card = await rectOf(page, '[data-nearby-fs] [role="status"]');
  const vh = 700;
  expect(card.y >= 0 && card.y + card.height <= vh && card.y + card.height >= vh - 40, `the card is at ${JSON.stringify(card)} on a ${vh} px screen`);
  const btn = await s.exitBtn.boundingBox();
  expect(btn.y + btn.height <= card.y + 0.5, `the button (${JSON.stringify(btn)}) is not above the card (${card.y})`);
  expect(!intersects(btn, card), "the button and the card overlap");
  const credits = await rectOf(page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib");
  expect(!intersects(credits, card), `the credits and the card overlap: ${JSON.stringify(credits)}`);
  const lift = await frame.evaluate((f) => parseFloat(f.style.getPropertyValue("--fs-lift")));
  expect(near(lift, card.height, 1), `--fs-lift is ${lift}, the card is ${card.height} px high`);
  // the pin was lifted clear of the card: MapView eases the camera with an offset of half the card's height, so the pin lands that far above the middle of the
  // map. Clearance alone would also hold for a pin that stayed in the middle (350 + 17 is well above a card that starts at 532), so the position is checked.
  const after = await settle(page);
  const pin = await pinXY(page, GREGGS.lng, GREGGS.lat);
  const wantY = vh / 2 - Math.round(lift / 2);
  expect(lift >= 60 && near(pin.y, wantY, 6), `the tapped pin is at y ${pin.y}, not lifted to about ${wantY} (the card is ${lift} px high, the middle of the map is ${vh / 2})`);
  expect(pin.y > 17 && pin.y + 17 <= card.y && pin.x > 0 && pin.x < 390, `the tapped pin is at (${pin.x}, ${pin.y}) but the card starts at ${card.y} (camera ${JSON.stringify(after)}, first tap at ${JSON.stringify(g)})`);
  // a finger that starts on the card scrolls and pinches nothing behind it
  const y0 = (await snap(page)).y;
  await drag(s.cdp, [card.x + card.width / 2, card.y + 12], [card.x + card.width / 2, card.y - 120], 8);
  await sleep(300);
  expect((await snap(page)).y === y0, "a drag that started on the card scrolled the page behind");
  // another pin swaps the card: zoom out so KFC is on screen, then tap it
  for (let i = 0; i < 3; i++) { await page.locator(".maplibregl-ctrl-zoom-out").click(); await sleep(500); }
  await settle(page);
  await tapPin(page, KFC);
  await frame.getByText("KFC", { exact: true }).waitFor({ timeout: 5000 });
  expect((await frame.getByText("Greggs", { exact: true }).count()) === 0, "the card still shows Greggs");
  expect((await page.locator('[role="status"]').count()) === 1, "more than one status card after swapping");
});

/** One full visit that leaves in the given way, then checks the person is back exactly where they were. */
async function visit(how) {
  const s = await open();
  const { page, cdp } = s;
  await goMap(s);
  await page.evaluate(() => {
    window.__marker = "m";
    document.querySelector("canvas.maplibregl-canvas").dataset.keep = "1";
    document.querySelector(".map-fs-button").dataset.keep = "1";
  });
  await placeMap(page, 70);
  const before = await snap(page);
  const urlBefore = page.url();
  await enter(s);
  await tapPin(page, GREGGS); // select a restaurant in full screen
  await s.frame.getByText("Greggs", { exact: true }).waitFor({ timeout: 5000 });
  await settle(page);
  await drag(cdp, [195, 250], [150, 250], 8); // and move the camera: pan, then zoom a little
  await settle(page);
  await pinch(cdp, [195, 250], 80, 120);
  const camFull = await settle(page);
  if (how === "button") await s.exitBtn.tap();
  else if (how === "escape") await page.keyboard.press("Escape");
  else await page.goBack();
  await page.locator('[data-nearby-fs="page"]').waitFor({ timeout: 5000 });
  await sleep(700); // the popstate of our own history.back() has arrived
  const after = await snap(page);
  const st = await page.evaluate(() => ({
    keptCanvas: document.querySelectorAll("canvas.maplibregl-canvas").length === 1 && document.querySelector("canvas.maplibregl-canvas").dataset.keep,
    ready: document.querySelector("[data-nearby-map]").dataset.ready,
    keptBtn: document.querySelector(".map-fs-button")?.dataset.keep,
    marker: window.__marker,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    nav: getComputedStyle(document.querySelector(".app-surface > nav")).display,
    inert: [...document.querySelectorAll("[inert]")].filter((e) => !String(e.className).includes("blur-sm")).length, // the blurred, locked Best for you preview of the Pro-on test build is inert by design
    card: document.querySelector('[data-nearby-slot] ~ [role="status"]')?.textContent ?? "",
    cards: document.querySelectorAll('[role="status"]').length,
    lift: document.querySelector("[data-nearby-fs]").style.getPropertyValue("--fs-lift"),
    role: document.querySelector("[data-nearby-fs]").getAttribute("role"),
    region: document.querySelector("[data-nearby-map]").getAttribute("role"),
    focus: document.activeElement?.getAttribute("aria-label") ?? "",
  }));
  expect(st.marker === "m" && page.url() === urlBefore, `[${how}] the page reloaded or moved (${page.url()})`);
  expect(st.keptCanvas === "1" && st.ready === "true" && st.keptBtn === "1", `[${how}] the map or the button was rebuilt (${st.keptCanvas}, ${st.ready}, ${st.keptBtn})`);
  sameCam(await settle(page), camFull, `[${how}] the camera chosen in full screen was not kept`);
  expect(near(after.y, before.y, 1) && near(after.slotTop, before.slotTop, 1), `[${how}] scrollY ${before.y} -> ${after.y}, map top ${before.slotTop} -> ${after.slotTop}`);
  expect(st.htmlOverflow !== "hidden" && st.nav !== "none" && st.inert === 0, `[${how}] still locked: overflow ${st.htmlOverflow}, tab bar ${st.nav}, inert ${st.inert}`);
  expect(st.cards === 1 && st.card.includes("Greggs") && st.lift === "", `[${how}] the selected restaurant: ${st.cards} card(s), "${st.card.slice(0, 40)}", lift "${st.lift}"`);
  expect(st.role === null && st.region === "region", `[${how}] roles after leaving: ${st.role}, ${st.region}`);
  expect((await touchAction(page)) === "pan-x pan-y", `[${how}] touch-action is ${await touchAction(page)}`);
  expect(st.focus === s.labels.full, `[${how}] focus is on "${st.focus}", not the Full screen button`);
  // the page behaves as before: one finger scrolls it, two fingers still zoom the map
  const r = await mapRect(page);
  const y1 = (await snap(page)).y;
  const room = after.docH - after.vh - y1;
  await drag(cdp, [r.x + 120, r.y + r.height / 2], [r.x + 120, r.y + r.height / 2 + (room >= y1 ? -160 : 160)], 10);
  await sleep(700);
  expect(Math.abs((await snap(page)).y - y1) > 50, `[${how}] one finger no longer scrolls the page`);
  await placeMap(page, 70);
  const c0 = await settle(page);
  await pinch(cdp, centre(await mapRect(page)), 60, 200);
  expect((await settle(page)).zoom - c0.zoom > 0.8, `[${how}] two fingers no longer zoom the map`);
  // history: the entry full screen pushed is gone, so one Back leaves Near me for Eat out
  await page.goBack();
  expect(page.url().endsWith("/app/eat-out"), `[${how}] Back from Near me went to ${page.url()}`);
}
await step("leaving with the button lands exactly where the person was, with the camera and the selection kept", () => visit("button"));
await step("leaving with Escape lands exactly where the person was", () => visit("escape"));
await step("leaving with the Back gesture lands exactly where the person was and does not reload", () => visit("back"));

await step("Menu from the card opens the restaurant; Back returns to Near me (not full screen), another Back leaves; a double tap pushes one entry", async () => {
  const s = await open();
  const { page } = s;
  await goMap(s);
  await enter(s);
  await tapPin(page, GREGGS);
  await s.frame.getByText("Greggs", { exact: true }).waitFor({ timeout: 5000 });
  await sleep(500);
  await s.frame.getByRole("link", { name: "Menu", exact: true }).tap();
  await page.waitForURL(/\/app\/chain\?id=greggs/, { timeout: 15000 });
  await sleep(500);
  const st = await page.evaluate(() => ({
    overflow: getComputedStyle(document.documentElement).overflow,
    nav: getComputedStyle(document.querySelector(".app-surface > nav")).display,
    frames: document.querySelectorAll("[data-nearby-fs]").length,
    inert: [...document.querySelectorAll("[inert]")].filter((e) => !String(e.className).includes("blur-sm")).length, // the blurred, locked Best for you preview of the Pro-on test build is inert by design
  }));
  expect(st.overflow !== "hidden" && st.nav !== "none" && st.frames === 0 && st.inert === 0, `the restaurant page is still locked: ${JSON.stringify(st)}`);
  await page.goBack();
  await page.waitForURL(/\/app\/map/, { timeout: 15000 });
  await waitMap(page);
  expect((await page.locator("[data-nearby-fs]").getAttribute("data-nearby-fs")) === "page", "Back from the restaurant landed in full screen");
  await page.goBack();
  expect(page.url().endsWith("/app/eat-out"), `a second Back went to ${page.url()}`);
  // two taps in the same instant: one history entry at most, and a settled state either way
  const t = await open();
  await goMap(t);
  const h0 = (await snap(t.page)).hist;
  await t.page.evaluate(() => { const b = document.querySelector(".map-fs-button"); b.click(); b.click(); });
  await sleep(900);
  expect((await snap(t.page)).hist === h0 + 1, `two quick taps pushed ${(await snap(t.page)).hist - h0} entries`);
  expect((await t.frame.getAttribute("data-nearby-fs")) === "page", "two quick taps left the map half-way");
  await t.page.goBack();
  expect(t.page.url().endsWith("/app/eat-out"), `Back after two quick taps went to ${t.page.url()}`);
});

await step("the map's own two-finger hint can't break the switch to one-finger moving (hint-timer race)", async () => {
  const s = await open();
  const { page, cdp } = s;
  await goMap(s);
  await placeMap(page, 70);
  const r = await mapRect(page);
  const y = r.y + r.height / 2 + 40;
  // a sideways finger over the map is blocked and starts the hint's 100 ms timer; 30 ms after its last move the toggle is clicked
  await touch(cdp, "touchStart", [[r.x + 250, y]]);
  for (let i = 1; i <= 6; i++) { await sleep(16); await touch(cdp, "touchMove", [[r.x + 250 - i * 15, y]]); }
  await Promise.all([
    touch(cdp, "touchMove", [[r.x + 150, y]]),
    page.evaluate(() => new Promise((done) => setTimeout(() => { document.querySelector(".map-fs-button").click(); done(); }, 30))),
  ]);
  await touch(cdp, "touchEnd", []);
  await sleep(600);
  expect(pageErrors.length === errorsAtStart, `a page error: ${pageErrors.slice(errorsAtStart).join(" | ")}`);
  await page.locator('[data-nearby-fs="full"]').waitFor({ timeout: 5000 });
  for (let i = 0; i < 20 && (await touchAction(page)) !== "none"; i++) await sleep(100);
  expect((await touchAction(page)) === "none", `touch-action is ${await touchAction(page)} after switching`);
  const c = await settle(page);
  await drag(cdp, [300, 500], [200, 500], 8);
  const n = await settle(page);
  expect(movedLng(c, n) > 100 * lngPerPx(c.zoom) * 0.5, "one finger does not move the map after the race");
});

await step("the notch and home bar are respected in portrait and landscape; the map still runs under them", async () => {
  const s = await open();
  const { page, cdp } = s;
  await goMap(s);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await sleep(300);
  await enter(s);
  await tapPin(page, GREGGS);
  await s.frame.getByText("Greggs", { exact: true }).waitFor({ timeout: 5000 });
  await sleep(600);
  const vw = 390, vh = 700;
  const zoomIn = await rectOf(page, ".maplibregl-ctrl-zoom-in");
  const btn = await s.exitBtn.boundingBox();
  let credits = await rectOf(page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib");
  let card = await rectOf(page, '[data-nearby-fs] [role="status"]');
  expect(zoomIn.y >= 47, `the zoom buttons start at ${zoomIn.y}, under the notch`);
  expect(btn.y + btn.height <= vh - 34 + 0.5 && credits.y + credits.height <= vh - 34 + 0.5 && card.y + card.height <= vh - 34 + 0.5, `a control reaches the home bar: button ${btn.y + btn.height}, credits ${credits.y + credits.height}, card ${card.y + card.height} (limit ${vh - 34})`);
  expect(btn.y + btn.height <= card.y + 0.5 && !intersects(credits, card), "the button or the credits run into the card");
  for (const [x, y] of [[2, 2], [vw - 3, vh - 3]]) {
    const p = await px(page, x, y);
    expect(p.every((v, i) => near(v, BLUE[i], 3)), `the map does not run under the notch or home bar: pixel (${x},${y}) is ${p}`);
  }
  // turn the phone: 844 x 390 with the notch on the left and right and the home bar below
  const lift0 = await s.frame.evaluate((f) => parseFloat(f.style.getPropertyValue("--fs-lift"))); // the lift the pin was given in portrait: the camera keeps it when the phone turns
  expect(lift0 >= 60, `--fs-lift is ${lift0} before turning the phone`);
  const c0 = await settle(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
  await sleep(700);
  const canvas = await rectOf(page, "canvas.maplibregl-canvas");
  expect(near(canvas.width, 844, 1) && near(canvas.height, 390, 1), `the canvas is ${canvas.width} x ${canvas.height} after turning the phone`);
  sameCam(await settle(page), c0, "turning the phone moved the camera");
  const z = await rectOf(page, ".maplibregl-ctrl-zoom-in");
  const b2 = await s.exitBtn.boundingBox();
  credits = await rectOf(page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib");
  card = await rectOf(page, '[data-nearby-fs] [role="status"]');
  expect(z.x + z.width <= 844 - 47 + 0.5 && b2.x + b2.width <= 844 - 47 + 0.5, `the buttons run under the right-hand notch: zoom ${z.x + z.width}, toggle ${b2.x + b2.width}`);
  expect(credits.x >= 47 - 0.5 && card.x >= 47 - 0.5 && card.x + card.width <= 844 - 47 + 0.5, `the credits or the card run under a side notch: ${credits.x}, ${card.x}..${card.x + card.width}`);
  expect(b2.y + b2.height <= 390 - 21 + 0.5 && credits.y + credits.height <= 390 - 21 + 0.5 && card.y + card.height <= 390 - 21 + 0.5, "something reaches the home bar in landscape");
  expect(card.height <= 195 + 1, `the card is ${card.height} px high on a 390 px screen`);
  const pin = await pinXY(page, GREGGS.lng, GREGGS.lat);
  // the resize keeps the camera's centre, so the pin stays as far above the middle as it was lifted in portrait (not at the middle, 195, where it would also clear the card by 1 px)
  const wantY = 390 / 2 - Math.round(lift0 / 2);
  expect(near(pin.y, wantY, 6), `the selected pin is at y ${pin.y}, not about ${wantY} (lifted by ${Math.round(lift0 / 2)} px from the middle, 195)`);
  expect(pin.y > 17 && pin.y + 17 <= card.y && pin.x > 0 && pin.x < 844, `the selected pin is at (${pin.x}, ${pin.y}), the card starts at ${card.y}`);
  const p = await px(page, 843 - 2, 390 - 3);
  expect(p.every((v, i) => near(v, BLUE[i], 3)), `the map does not fill the landscape screen: ${p}`);
});

await step("200% text and right to left: no sideways scroll, the button stays 44 px and bottom right, the card scrolls inside itself", async () => {
  const s = await open({ width: 360, height: 740 });
  const { page } = s;
  await goMap(s);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await sleep(500);
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect((await over()) <= 1, `sideways scroll in the page at 200% text: ${await over()} px`);
  await placeMap(page, 70);
  await enter(s);
  await tapPin(page, GREGGS);
  await s.frame.getByText("Greggs", { exact: true }).waitFor({ timeout: 5000 });
  await sleep(600);
  expect((await over()) <= 1, `sideways scroll in full screen at 200% text: ${await over()} px`);
  const btn = await s.exitBtn.boundingBox();
  const frame = await rectOf(page, "[data-nearby-fs]");
  const card = await rectOf(page, '[data-nearby-fs] [role="status"]');
  expect(btn.width >= 43.9 && btn.height >= 43.9, `the button is ${btn.width} x ${btn.height} at 200% text`);
  expect(btn.x >= frame.x && btn.x + btn.width <= frame.x + frame.width && btn.y >= frame.y && btn.y + btn.height <= frame.y + frame.height, "the button leaves the map");
  expect(card.height <= 740 * 0.5 + 1, `the card is ${card.height} px high on a 740 px screen`);
  expect(await page.evaluate(() => { const c = document.querySelector('[data-nearby-fs] [role="status"]'); return getComputedStyle(c).overflowY === "auto" && c.scrollHeight >= c.clientHeight; }), "the card does not scroll inside itself");
  expect(!intersects(btn, card), "the button and the card overlap at 200% text");
  // right to left: the toggle stays physically bottom right, under the zoom column
  const ar = await open({ language: "ar" });
  await goMap(ar);
  expect((await ar.page.evaluate(() => document.documentElement.dir)) === "rtl", "Arabic is not right to left");
  const fb = await ar.fsBtn.boundingBox();
  expect(!!fb, `no button named "${ar.labels.full}" in Arabic`);
  const af = await rectOf(ar.page, "[data-nearby-fs]");
  const azoom = await rectOf(ar.page, ".maplibregl-ctrl-zoom-in");
  expect(near(af.x + af.width - (fb.x + fb.width), 22, 8) && near(af.y + af.height - (fb.y + fb.height), 22, 8), `the Arabic button is at ${JSON.stringify(fb)} in a map at ${JSON.stringify(af)}`);
  expect(near(azoom.x + azoom.width, fb.x + fb.width, 2), "the Arabic button is not under the zoom column");
  const ac = await rectOf(ar.page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib");
  expect(!intersects(ac, fb), "the Arabic credits run under the button");
  // MapLibre gives the credits' "i" both right:0 and left:0; right to left drops left, which put the "i" over the end of the open credits. Open, it must sit
  // at the physical left end of its box with the credits text starting after it, exactly as in English.
  const attribOpen = () => ar.page.locator(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib").evaluate((e) => e.classList.contains("maplibregl-compact-show"));
  if (!(await attribOpen())) {
    await ar.page.locator(".maplibregl-ctrl-attrib-button").click();
    await sleep(250);
  }
  expect(await attribOpen(), "the Arabic credits would not open");
  const iBtn = await rectOf(ar.page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib-button");
  const iBox = await rectOf(ar.page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib");
  const iText = await rectOf(ar.page, ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib-inner");
  expect(near(iBtn.x, iBox.x, 1), `in Arabic the credits button is at x ${iBtn.x}, not at the left end of its box (${iBox.x}..${iBox.x + iBox.width})`);
  expect(iBtn.x + iBtn.width <= iText.x + 0.5, `in Arabic the credits button (to ${iBtn.x + iBtn.width}) covers the credits text (from ${iText.x})`);
  expect((await ar.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, "sideways scroll in Arabic");
  await enter(ar);
  expect((await ar.exitBtn.count()) === 1, `no button named "${ar.labels.exit}" in Arabic full screen`);
  const eb = await ar.exitBtn.boundingBox();
  expect(near(eb.x + eb.width, 390 - 22, 3), "the Arabic exit button moved from the right");
});

await step("axe finds no violation in the page or in full screen with a restaurant's card open", async () => {
  const s = await open();
  const { page } = s;
  await goMap(s);
  const audit = async (label) => {
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    await page.addScriptTag({ path: AXE });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
    expect(result.violations.length === 0, `${label}: ${result.violations.map((v) => `[${v.impact}] ${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`).join("; ")}`);
  };
  await audit("page");
  await placeMap(page, 70);
  await enter(s);
  await tapPin(page, GREGGS);
  await s.frame.getByText("Greggs", { exact: true }).waitFor({ timeout: 5000 });
  await sleep(600);
  await audit("full screen with a card");
});

await step("privacy and network: the position never leaves the phone; going full screen and back asks for nothing", async () => {
  const s = await open();
  const { page } = s;
  await goMap(s);
  const styles = s.requests.filter((r) => /tiles\.openfreemap\.org\/styles\/positron/.test(r.url));
  expect(styles.length === 1, `${styles.length} requests for the map style, not 1`);
  await sleep(1500); // the logos and the list's pictures have all been asked for by now
  const n0 = s.requests.length;
  await enter(s);
  await page.keyboard.press("Escape");
  await page.locator('[data-nearby-fs="page"]').waitFor({ timeout: 5000 });
  await sleep(900);
  // The dev server (not a production build) refetches the page's own RSC payload when the browser traverses back onto the full-screen history entry, and
  // serves its font and icon on demand: none of that carries a position, and none leaves this origin. Anything else is a failure.
  const extra = s.requests.slice(n0).map((r) => r.url).filter((u) => !(new URL(u).origin === BASE && (/^\/app\/map\?_rsc=[\w-]+$/.test(new URL(u).pathname + new URL(u).search) || /^\/__nextjs_font\//.test(new URL(u).pathname) || /^\/favicon\.ico/.test(new URL(u).pathname))));
  expect(extra.length === 0, `going full screen and back made ${extra.length} request(s): ${extra.slice(0, 3).join(", ")}`);
  const leaks = allRequests.filter((r) => /51\.50\d*|-0\.12\d*/.test(decodeURIComponent(r.url) + r.body) && !r.url.includes("/_next/") && !r.url.includes("/branches/"));
  expect(leaks.length === 0, `coordinates in a request: ${leaks.map((l) => l.url).join(", ")}`);
  expect(!allRequests.some((r) => /api\.postcodes\.io/.test(r.url)), "a position visit must not call postcodes.io");
});

await step("no page error anywhere in the run", async () => {
  expect(pageErrors.length === 0, `${pageErrors.length} page error(s): ${pageErrors.slice(0, 3).join(" | ")}`);
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
