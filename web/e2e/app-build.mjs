import { readFileSync } from "node:fs";
// The iPhone app's copy of the web app (npm run build:app, served like the app does by e2e/serve-app.mjs on port 3103), with the live
// website unreachable (as on a phone with no signal): everything works from the files packed inside it, the welcome wall follows the appLogos switch (logos,
// or names when it is off), no service worker, no Pro or AI wording, and the iPhone's own scanner, location and share sheet are used through the bridge
// (lib/mm/native.ts; faked here). Also: a logo taken down on the live website disappears.
//   cd web && npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BASE=http://localhost:3103 node e2e/app-build.mjs
import { chromium } from "playwright-core";
import { recipeTiles } from "./welcome-steps.mjs";
const BASE = process.env.BASE ?? "http://localhost:3103";
const LIVE = process.env.LIVE ?? "https://numbite.com";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// Pip's tips on the real screens (CoachMarks, 2026-11-18) are stopped in this test, as if the person had pressed "Stop the tips": e2e/coach.mjs covers them.
{
  const open = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await open(options);
    await c.addInitScript(() => { try { if (!localStorage.getItem("mm.v1.coach")) localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } })); } catch { /* storage blocked */ } });
    return c;
  };
}
const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
const FORBIDDEN = /\bPro\b|(?<!un)subscri|free trial|paywall|Anthropic|Ask Pip|Claude|Add .* to your Home Screen|iPhone Safari/i;

// A fake of the iPhone app's bridge: answers scan, locate and share like MenuMacros/App/WebApp/NativeBridge.swift does.
function fakeBridge() {
  window.__bridgeCalls = [];
  window.webkit = { messageHandlers: { menumath: { postMessage(m) {
    window.__bridgeCalls.push(m.action);
    const reply = m.action === "scan" ? { code: "5000157024671" } : m.action === "locate" ? (m.payload.onlyIfAllowed ? { error: "denied" } : { lat: 51.5072, lng: -0.1276 })
      : m.action === "appleSignIn" ? { idToken: "aaa.bbb.ccc", nonce: "n0nceN0nceN0nce" }
      : m.action === "webAuth" ? { authCode: "A".repeat(60), verifier: "v".repeat(64) } : { done: true };
    setTimeout(() => window.__menumathReply(m.id, reply), 50);
  } } } };
}

async function newPage({ settings = onboarded, bridge = false, liveHidden = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (settings) await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  if (bridge) await ctx.addInitScript(fakeBridge);
  const page = await ctx.newPage();
  const live = [];
  await page.route(`${LIVE}/**`, (r) => {
    live.push(new URL(r.request().url()).pathname);
    if (liveHidden && r.request().url().endsWith("/logos/hidden.json")) return r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ v: 1, hidden: liveHidden }) });
    return r.abort("internetdisconnected");
  });
  return { ctx, page, live };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function noForbidden(page, where) {
  await page.waitForTimeout(400);
  const text = await page.locator("body").innerText();
  const hit = text.match(FORBIDDEN);
  expect(!hit, `${where}: "${hit?.[0]}"`);
}

// Founder 2026-10-18 ("it has to be the logos too"): the app's welcome wall follows the appLogos switch (web/app-content.json) like the rest of the app.
// With appLogos on, the packed logo files show with no signal; with it off, plain names (the App Review fallback).
await step("first launch with no signal: the welcome wall follows the appLogos switch (logos packed in the app, or names when it is off)", async () => {
  const { ctx, page } = await newPage({ settings: null });
  await page.goto(BASE + "/app/welcome");
  const wall = page.locator(".logo-wall");
  await wall.waitFor();
  await page.waitForTimeout(800);
  const appLogos = JSON.parse(readFileSync(new URL("../app-content.json", import.meta.url), "utf8")).appLogos !== false;
  const imgs = await wall.locator("img").count();
  if (appLogos) {
    expect(imgs > 0, "logo files on the wall");
    const srcs = await wall.locator("img").evaluateAll((els) => els.slice(0, 20).map((e) => e.getAttribute("src") ?? ""));
    expect(srcs.every((s) => !/^https?:/.test(s)), `logos load from inside the app: ${srcs.join(", ")}`);
  } else {
    expect(imgs === 0, "no logo files on the wall");
  }
  // one sentence for a screen reader, the same with logos on or off: the first five names on the wall (the onboarding meeting, 19 November)
  const label = (await wall.getAttribute("aria-label")) ?? "";
  expect(label.startsWith("Restaurants and shops in the app, including ") && label.length > "Restaurants and shops in the app, including ".length, `wall label: ${label}`);
  await ctx.close();
});

// The welcome screens (lib/mm/tour.ts): the layout's inline script sends a cold, plain start of the app's start page to the welcome screens (the scheme handler
// serves welcome/index.html), before anything is drawn; a link the app opens instead of its start page (a shared list) opens as it is.
await step("first launch: a cold plain start of /app opens the welcome screens; a start on a shared list's link opens the list, not the welcome screens", async () => {
  const { ctx, page } = await newPage({ settings: null });
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome/, { timeout: 15000 });
  await page.getByRole("button", { name: "Get started" }).waitFor({ timeout: 15000 });
  expect((await page.getByRole("heading", { level: 1, name: "Home" }).count()) === 0, "Home on the welcome screens");
  await ctx.close();
  const two = await newPage({ settings: null });
  await two.page.goto(BASE + "/app/groceries/list/shared#1AAAAAAA");
  await two.page.getByRole("heading", { level: 1, name: "Shared shopping list" }).waitFor({ timeout: 15000 });
  await two.page.waitForTimeout(800);
  expect(!/welcome/.test(two.page.url()), "a shared list was sent to the tour: " + two.page.url());
  await two.ctx.close();
});

// The onboarding redesign meeting of 20 November 2026 (build list 17, "the website build against the app build"): in the iPhone app the menus and the shops'
// files are inside the app, so the feature screens never wait on a connection: step 3's dishes and step 5's recipes show with no signal (the website says
// "Menus need a connection the first time" instead), and the week is made from the packed shop file.
await step("the welcome steps with no signal: step 3's restaurant dishes, step 5's two recipes and step 10's week come from the files packed in the app", async () => {
  const { ctx, page } = await newPage({ settings: null });
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Nothing to avoid" }).click();
  await page.getByRole("radiogroup", { name: "Restaurants" }).waitFor({ timeout: 15000 });
  expect((await page.getByText("Menus need a connection the first time.", { exact: false }).count()) === 0, "the website's connection line in the app");
  await page.getByRole("button", { name: "Next: where you shop" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await recipeTiles(page).first().waitFor({ timeout: 15000 }); // RecipeTile's choose mode: a radio each (the 20 November 2026 audit)
  await page.getByRole("button", { name: "Next: your daily numbers" }).click();
  await page.getByRole("button", { name: "Skip these questions" }).click();
  await page.getByRole("button", { name: "Next: plan my week" }).click();
  await page.getByRole("region", { name: "A look at Meal plan, on Home" }).locator("h2", { hasText: /^Monday$/ }).waitFor({ timeout: 15000 });
  await ctx.close();
});

await step("no signal: every restaurant comes from the menus packed in the app; no service worker; the live website was tried", async () => {
  const { ctx, page, live } = await newPage();
  await page.goto(BASE + "/app/eat-out");
  await page.getByText(/\d{3} UK restaurants/).waitFor({ timeout: 15000 });
  await noForbidden(page, "Eat out");
  const workers = await page.evaluate(async () => ("serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0));
  expect(workers === 0, `service workers: ${workers}`);
  expect(live.includes("/menus/menus-manifest.json"), `asked the live site for newer menus: ${live.join(", ")}`);
  await page.goto(BASE + "/app/chain?id=kfc");
  await page.getByRole("heading", { level: 1, name: /KFC/ }).waitFor({ timeout: 15000 });
  await page.locator("a[href*='/app/item?chain=kfc']").first().click();
  await page.getByRole("button", { name: "Add to today" }).waitFor();
  await noForbidden(page, "KFC item");
  await ctx.close();
});

await step("no signal: groceries, recipes and settings work; Settings has no browser advice and no testing tools", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries/shop?r=sainsburys");
  await page.locator("a[href*='/app/groceries/shop/item']").first().waitFor({ timeout: 20000 });
  await page.goto(BASE + "/app/recipes");
  await page.locator("a[href*='/app/recipes/view']").first().waitFor({ timeout: 20000 });
  await noForbidden(page, "Recipes");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  expect((await page.getByText(/Browsers can clear site data/).count()) === 0, "browser advice shown in the app");
  expect((await page.getByText("Testing tools").count()) === 0, "testing tools shown");
  await noForbidden(page, "Settings");
  await ctx.close();
});

await step("no signal: Community, the food blogs and every article open from the files packed in the app, with no Pro, AI or subscription wording in any of them", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/community");
  await page.getByRole("heading", { level: 1, name: "Community", exact: true }).waitFor({ timeout: 20000 });
  await noForbidden(page, "Community");
  await page.getByRole("link", { name: /See all/ }).click();
  await page.getByRole("heading", { level: 1, name: "Food blogs", exact: true }).waitFor({ timeout: 20000 });
  const hrefs = await page.locator("a[href*='/app/community/blog/view']").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  expect(hrefs.length >= 3, `only ${hrefs.length} articles listed`);
  for (const href of hrefs) {
    await page.goto(BASE + href);
    await page.locator("article h1").waitFor({ timeout: 20000 });
    await noForbidden(page, href);
  }
  await ctx.close();
});

await step("a logo taken down on the live website disappears from the app (cuisine icon instead)", async () => {
  const { ctx, page } = await newPage({ liveHidden: ["kfc"] });
  await page.goto(BASE + "/app/eat-out/favourites");
  await page.getByRole("searchbox").or(page.getByRole("textbox")).first().fill("K");
  await page.getByText(/^KFC$/).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const kfcImgs = await page.locator("img[src*='/logos/'][src*='kfc']").count();
  expect(kfcImgs === 0, `KFC logo still shown (${kfcImgs})`);
  expect((await page.locator("img[src*='/logos/']").count()) > 0, "other chains keep their logos");
  await ctx.close();
});

await step("the iPhone's own scanner: Groceries › Scan a barcode asks the app and opens the product", async () => {
  const { ctx, page } = await newPage({ bridge: true });
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("button", { name: /Scan a barcode/ }).click();
  await page.waitForURL(/\/app\/groceries\/product\/?\?code=5000157024671/, { timeout: 10000 });
  const calls = await page.evaluate(() => window.__bridgeCalls);
  expect(calls.includes("scan"), `bridge calls: ${calls}`);
  await ctx.close();
});

await step("the iPhone finds the location for Near me (no prompt on opening; one when the button is tapped)", async () => {
  const { ctx, page } = await newPage({ bridge: true });
  await page.goto(BASE + "/app/map");
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.getByText(/your location/i).first().waitFor({ timeout: 10000 });
  const calls = await page.evaluate(() => window.__bridgeCalls);
  expect(calls.filter((c) => c === "locate").length === 2, `locate calls: ${calls}`);
  await ctx.close();
});

await step("the shopping list's Share opens the iPhone's share sheet", async () => {
  const list = JSON.stringify({ v: 1, data: [{ gtin: "", retailer: "own", name: "Milk", brand: "", size: "", custom: true, qty: 1, addedAt: "2026-10-12T09:00:00.000Z" }] });
  const { ctx, page } = await newPage({ bridge: true });
  await page.addInitScript((l) => { if (!localStorage.getItem("mm.v1.shopping")) localStorage.setItem("mm.v1.shopping", l); }, list);
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("button", { name: "Share list" }).click();
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__bridgeCalls);
  expect(calls.includes("share"), `bridge calls: ${calls}`);
  await ctx.close();
});

await step("iPhone sign-in: Sign in with Apple and Google go through the phone, the session is kept as a token (no cookies) and sent with each sync", async () => {
  for (const provider of ["apple", "google"]) {
    const { ctx, page } = await newPage({ bridge: true });
    const seen = { auth: [], sync: [] };
    const session = { accessToken: "AT-" + provider, refreshToken: "refresh-token-" + provider, expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: "u-" + provider, email: provider + "@example.com" } };
    // the app calls the live website's API (cross-origin from app://menumath, here from localhost): answer it, with the CORS headers the real one sends
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
    await page.route(`${LIVE}/api/v1/**`, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
      if (path === "auth/apple") { seen.auth.push({ path, body: JSON.parse(req.postData()) }); return json(200, { ok: true, session }); }
      if (path === "auth/exchange") { seen.auth.push({ path, body: JSON.parse(req.postData()) }); return json(200, { ok: true, session }); }
      if (path === "auth/session") return json(200, { user: session.user });
      if (path === "sync" && req.method() === "GET") { seen.sync.push(req.headers().authorization ?? ""); return json(200, { ok: true, stores: {} }); }
      const m = /^sync\/(\w+)$/.exec(path);
      if (m && req.method() === "PUT") { seen.sync.push(req.headers().authorization ?? ""); return json(200, { ok: true, state: JSON.parse(req.postData()).state }); }
      return json(404, { error: "not_found" });
    });
    await page.goto(BASE + "/app/settings");
    await page.getByRole("heading", { name: "Account" }).waitFor();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: provider === "apple" ? "Continue with Apple" : "Continue with Google" }).click();
    await page.getByText(provider + "@example.com", { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.__bridgeCalls);
    expect(calls.includes(provider === "apple" ? "appleSignIn" : "webAuth"), `bridge calls: ${calls}`);
    if (provider === "apple") expect(seen.auth[0].body.idToken === "aaa.bbb.ccc" && seen.auth[0].body.nonce === "n0nceN0nceN0nce", "Apple's token and nonce were sent to our API");
    else expect(seen.auth[0].path === "auth/exchange" && seen.auth[0].body.code === "A".repeat(60) && seen.auth[0].body.verifier === "v".repeat(64), "the one-time code and verifier were exchanged");
    // the session is kept inside the app and a store change is synced with it as a header
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.session")));
    expect(stored?.data?.accessToken === "AT-" + provider, "the app keeps its session");
    await page.goto(BASE + "/app/groceries/list");
    await page.getByPlaceholder("Add something, e.g. milk").fill("Milk");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForTimeout(4500);
    expect(seen.sync.length > 0 && seen.sync.every((h) => h === "Bearer AT-" + provider), `sync calls carry the session: ${JSON.stringify(seen.sync)}`);
    await ctx.close();
  }
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
