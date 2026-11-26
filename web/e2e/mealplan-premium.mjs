// Meal plan after the free week (founder, 26 November 2026: "once a person's 7-day free trial has went, also the meal plan thing ... If they click on it ... It
// won't even go into the meal plan. If they click a meal plan, it will show up saying they'll have to get a membership. You know that thing when it comes with the
// banner saying buy a year or buy a month"): without Premium, Home's Meal plan card opens the Premium sheet where the person is, and Meal plan doesn't open; the
// page opened by its address (a link, Back) opens the same sheet at once, with no preview page, and closing it goes back (or Home); with Premium, or during the
// free week, Meal plan opens as before; buying in the sheet carries on into Meal plan; a plan already made stays on the phone, untouched. All at 390 x 844.
//
// Two builds (lib/mm/mealPlanGate.ts decides on each):
//  1. The browser tests' build, Premium previewed off and on with devProOverride (as e2e/mealplan.mjs sets it):
//       cd web && NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1 npm run build && (npm start -- -p 3101 &) && BUILD=test BASE=http://localhost:3101 node e2e/mealplan-premium.mjs
//  2. The iPhone and Android apps' packed copy (In-App Purchase on), with the free week as e2e/freeweek.mjs sets it (a pretend phone and a pretend server signing
//     with a THROWAWAY key from e2e/paykey.mjs); the same build is the Android app's once the page is told so (window.__numbitePlatform = "android"):
//       cd web && KEY=$(node e2e/paykey.mjs) && NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_PHOTO_RECIPES=1 NEXT_PUBLIC_REMOTE_BASE=https://numbite.com NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$KEY" \
//         NEXT_PUBLIC_SIGN_IN_REQUIRED=0 NEXT_PUBLIC_SUPPORT_EMAIL=test@numbite.com npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BUILD=app BASE=http://localhost:3103 node e2e/mealplan-premium.mjs
//     Delete .next-app afterwards: it carries the throwaway key.
// SHOTS=<folder> saves a screenshot of each sheet (390 px wide, 2x).
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BUILD = process.env.BUILD ?? "test";
const BASE = process.env.BASE ?? (BUILD === "app" ? "http://localhost:3103" : "http://localhost:3101");
const LIVE = process.env.LIVE ?? "https://numbite.com";
const SHOTS = process.env.SHOTS ?? null;
const VIEW = { width: 390, height: 844 };
const DAY = 86_400_000;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 3).join(" | ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.data ?? null, key);
const path = (page) => new URL(page.url()).pathname.replace(/\/$/, "") || "/";

const sheetOf = (page) => page.getByRole("dialog", { name: "Numbite Premium" });
/** Nothing of Meal plan is on screen: none of its headings, nor the old preview page's week and See Premium. */
async function noMealPlan(page, where) {
  for (const name of ["Ready to make your plan?", "Your meal plan", "Meal plan", "Your week, planned", "Making your plan"]) {
    expect((await page.getByRole("heading", { name, exact: true }).count()) === 0, `${where}: Meal plan's "${name}" is on screen`);
  }
  // the old preview page's See Premium (Home has See Premium buttons of its own for other features, so only on Meal plan's address)
  if (path(page).startsWith("/app/plan")) expect((await page.getByRole("button", { name: "See Premium", exact: true }).count()) === 0, `${where}: the old preview page's See Premium is on screen`);
}
/** The page fits 390 px: no sideways scroll, and the sheet no wider than the screen. */
async function fits(page, where) {
  const w = await page.evaluate(() => ({ doc: document.scrollingElement.scrollWidth, view: window.innerWidth }));
  expect(w.doc <= w.view, `${where}: the page scrolls sideways (${w.doc} > ${w.view})`);
  const box = await sheetOf(page).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= VIEW.width + 0.5, `${where}: the sheet is wider than the screen: ${JSON.stringify(box)}`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
const closeSheet = async (page) => {
  await sheetOf(page).getByRole("button", { name: "Close" }).first().click();
  await sheetOf(page).waitFor({ state: "hidden" });
};
const planOpens = (page) => page.getByRole("heading", { level: 1, name: "Ready to make your plan?" }).waitFor({ timeout: 90_000 });

if (BUILD === "test") {
  // ---- 1. the browser tests' build: Premium previewed off (devProOverride false) and on ----
  const settings = (pro) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, devProOverride: pro, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
  async function context(pro) {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SHOTS ? 2 : 1, serviceWorkers: "block" });
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem("seeded")) return;
      localStorage.setItem("mm.v1.settings", s);
      localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
      localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
      sessionStorage.setItem("seeded", "1");
    }, settings(pro));
    return ctx;
  }
  /** Premium preview switched on or off while the app is open (the settings store hears a storage event, as from another tab). */
  const setPro = (page, pro) => page.evaluate((on) => {
    const s = JSON.parse(localStorage.getItem("mm.v1.settings"));
    s.data.devProOverride = on;
    const v = JSON.stringify(s);
    localStorage.setItem("mm.v1.settings", v);
    window.dispatchEvent(new StorageEvent("storage", { key: "mm.v1.settings", newValue: v }));
  }, pro);

  const off = await context(false);
  const page = await off.newPage();

  await step("Premium off: Home's Meal plan card opens the Premium sheet on Home, and Meal plan doesn't open; Close leaves the person on Home", async () => {
    await page.goto(BASE + "/app");
    const card = page.getByRole("link", { name: /^Meal plan/ });
    await card.waitFor({ timeout: 120_000 });
    await card.click();
    await sheetOf(page).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(800);
    expect(path(page) === "/app", `the address moved: ${page.url()}`);
    await noMealPlan(page, "Home after the card");
    await fits(page, "the sheet from Home");
    await shot(page, "test-home-card-sheet");
    await closeSheet(page);
    await page.waitForTimeout(500);
    expect(path(page) === "/app", `Close left Home: ${page.url()}`);
    expect((await sheetOf(page).count()) === 0 || !(await sheetOf(page).isVisible()), "the sheet is closed");
  });

  await step("Premium off: /app/plan opened by its address shows the Premium sheet at once, no preview page; Close goes Home (nothing before it)", async () => {
    await page.goto(BASE + "/app/plan");
    await sheetOf(page).waitFor({ timeout: 30_000 });
    await noMealPlan(page, "/app/plan without Premium");
    await fits(page, "the sheet on /app/plan");
    await shot(page, "test-direct-sheet");
    await closeSheet(page);
    await page.waitForURL((u) => u.pathname.replace(/\/$/, "") === "/app", { timeout: 10_000 });
    await page.getByRole("link", { name: /^Meal plan/ }).waitFor();
  });

  await step("Premium on: the card opens Meal plan as before (no sheet)", async () => {
    await setPro(page, true);
    await page.getByRole("link", { name: /^Meal plan/ }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/app/plan"));
    await planOpens(page);
    expect((await sheetOf(page).count()) === 0 || !(await sheetOf(page).isVisible()), "no Premium sheet with Premium");
  });

  await step("Back onto Meal plan after Premium has gone (the free week over): the sheet at once, and Close goes back to the page before it", async () => {
    // Home → Meal plan (with Premium) → Groceries, then Premium goes, then Back
    await page.getByRole("link", { name: "Groceries" }).first().click();
    await page.waitForURL((u) => u.pathname.startsWith("/app/groceries"));
    await setPro(page, false);
    await page.goBack();
    await page.waitForURL((u) => u.pathname.startsWith("/app/plan"));
    await sheetOf(page).waitFor({ timeout: 10_000 });
    await noMealPlan(page, "Back onto /app/plan");
    await closeSheet(page);
    await page.waitForURL((u) => u.pathname.replace(/\/$/, "") === "/app", { timeout: 10_000 });
  });

  await step("the testers' Unlock Premium preview in the sheet carries on into Meal plan", async () => {
    await page.goto(BASE + "/app");
    await page.getByRole("link", { name: /^Meal plan/ }).click();
    await sheetOf(page).getByRole("button", { name: "Unlock Premium preview (testing)" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/app/plan"), { timeout: 10_000 });
    await planOpens(page);
  });

  await step("a plan already made stays on the phone, untouched, while Premium is off, and comes back with Premium", async () => {
    // Premium is on here (the step before): make the first open's week
    await page.getByRole("button", { name: "Make my plan" }).and(page.locator(":enabled")).waitFor({ timeout: 180_000 });
    await page.getByRole("button", { name: "Make my plan" }).click();
    await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 60_000 });
    const before = await page.evaluate(() => localStorage.getItem("mm.v1.mealPlan"));
    expect(before && before.length > 100, "a plan was saved");
    await page.goto(BASE + "/app");
    await setPro(page, false);
    await page.goto(BASE + "/app/plan");
    await sheetOf(page).waitFor({ timeout: 30_000 });
    await noMealPlan(page, "/app/plan with a saved plan, without Premium");
    await closeSheet(page);
    await page.waitForURL((u) => u.pathname.replace(/\/$/, "") === "/app", { timeout: 10_000 });
    expect((await page.evaluate(() => localStorage.getItem("mm.v1.mealPlan"))) === before, "the saved plan changed");
    await setPro(page, true);
    await page.getByRole("link", { name: /^Meal plan/ }).click();
    await page.getByRole("heading", { level: 1, name: "Your meal plan" }).waitFor({ timeout: 60_000 });
  });
  await off.close();

  const on = await context(true);
  const p2 = await on.newPage();
  await step("Premium on from the start: /app/plan by its address opens Meal plan", async () => {
    await p2.goto(BASE + "/app/plan");
    await planOpens(p2);
    expect((await sheetOf(p2).count()) === 0 || !(await sheetOf(p2).isVisible()), "no sheet");
  });
  await on.close();
} else {
  // ---- 2. the apps' packed copy: the free week (a signed-in account) as e2e/freeweek.mjs sets it; the iPhone and Android plans ----
  expect(existsSync(new URL("./.paykey.json", import.meta.url)), "run node e2e/paykey.mjs and build with its key first");
  const { privateJwk } = JSON.parse(readFileSync(new URL("./.paykey.json", import.meta.url), "utf8"));
  const USER = { id: "user-1", email: "anna@example.com", providers: ["email"] };
  const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
  async function token(plan, src, expMs) {
    const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const payload = b64url(new TextEncoder().encode(JSON.stringify({ v: 1, plan, src, iat: Math.floor(Date.now() / 1000), exp: Math.floor(expMs / 1000) })));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`v1.${payload}`)));
    return `v1.${payload}.${b64url(sig)}`;
  }
  /** The pretend phone: the store's two plans with no free trial (Apple's ids on the iPhone, Google Play's on Android), a purchase, nothing owned. */
  function fakeBridge({ android }) {
    if (android) window.__numbitePlatform = "android";
    window.webkit = { messageHandlers: { menumath: { postMessage(m) {
      const products = android
        ? [
          { id: "com.amanmarwaha.numbite.premium:annual", name: "Annual", price: "£49.99", period: "year" },
          { id: "com.amanmarwaha.numbite.premium:monthly", name: "Monthly", price: "£4.99", period: "month" },
        ]
        : [
          { id: "com.amanmarwaha.numbite.pro.annual", name: "Annual", price: "£49.99", period: "year" },
          { id: "com.amanmarwaha.numbite.pro.monthly", name: "Monthly", price: "£4.99", period: "month" },
        ];
      const reply = m.action === "iap.products" ? { products }
        : m.action === "iap.purchase" ? (android ? { purchases: [{ productId: "com.amanmarwaha.numbite.premium:annual", token: "play-token-1" }] } : { transactions: ["eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJhbm51YWwifQ.c2lnbmF0dXJl"] })
        : m.action === "iap.entitlements" || m.action === "iap.restore" ? (android ? { purchases: [] } : { transactions: [] })
        : m.action === "deviceCheck.token" ? { deviceToken: "cGhvbmUtb25lLXRva2VuLWZyb20tYXBwbGU=", deviceEnv: "production" }
        : m.action === "device.id" ? { error: "unavailable" }
        : { done: true };
      setTimeout(() => window.__menumathReply(m.id, reply), 50);
    } } } };
  }
  const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
  const YESTERDAY = (() => { const d = new Date(Date.now() - DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

  /** `week`: "running" (3 days left) or "ended" (yesterday). */
  async function newPage({ week, android = false }) {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SHOTS ? 2 : 1 });
    const endsAt = week === "running" ? Date.now() + 3 * DAY : Date.now() - DAY;
    const paid = { token: await token("trial", "account", endsAt), plan: "trial", until: endsAt, unlockUntil: null };
    await ctx.addInitScript(({ s, u, p, f, y }) => {
      const put = (k, v) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ v: 1, data: v })); };
      if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s);
      put("mm.v1.coach", { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] });
      put("mm.v1.tour", 2);
      put("mm.v1.trialOffer", true);
      put("mm.v1.rating", { firstDay: y, lastDay: y, daysUsed: 1, lastAsked: null, reviewAsked: false });
      put("mm.v1.account", u);
      put("mm.v1.session", { accessToken: "at-1", refreshToken: "rt-1", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
      put("mm.v1.paid", p);
      put("mm.v1.freeWeek", f);
    }, { s: onboarded, u: USER, p: paid, f: { user: USER.id, status: "running", endsAt, welcomeDue: false }, y: YESTERDAY });
    await ctx.addInitScript(fakeBridge, { android });
    const page = await ctx.newPage();
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
    await page.route(`${LIVE}/**`, async (r) => {
      const req = r.request();
      const p = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
      if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      const respond = (status, body) => r.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (p === "auth/session") return respond(200, { user: USER });
      if (p === "sync") return respond(200, { ok: true, stores: {} });
      if (/^sync\/\w+$/.test(p)) return respond(200, { ok: true, state: body?.state });
      if (p === "entitlement/account") {
        return respond(200, week === "running"
          ? { premium: true, plan: "trial", token: paid.token, expiresAt: endsAt, freeWeek: "running", freeWeekEndsAt: endsAt, claimedNow: false, deviceCheck: "not_needed" }
          : { premium: false, freeWeek: "ended", freeWeekEndsAt: endsAt, deviceCheck: "not_needed" });
      }
      // a purchase in the sheet: our server's answer for Apple's (or Google Play's) purchase
      if (p === "entitlement/apple" || p === "entitlement/google") {
        const exp = Date.now() + 300 * DAY;
        return respond(200, { token: await token("annual", android ? "google" : "apple", exp), plan: "annual", expiresAt: exp });
      }
      return r.abort("internetdisconnected");
    });
    return { ctx, page };
  }

  /** The sheet says why it opened, that the free week has ended, and shows the year and the month to choose from with their prices. */
  async function plansShown(page, where) {
    const sheet = sheetOf(page);
    await sheet.getByRole("heading", { name: "Your free week has ended" }).waitFor({ timeout: 15_000 });
    await sheet.getByText("Meal plan is part of Premium.").waitFor();
    const group = sheet.getByRole("radiogroup", { name: "Choose a plan" });
    await group.waitFor({ timeout: 15_000 });
    const radios = await group.getByRole("radio").allInnerTexts();
    expect(radios.length === 2, `${where}: ${radios.length} plans: ${radios.join(" | ")}`);
    expect(/Annual/.test(radios[0]) && /£49\.99/.test(radios[0]), `${where}: the year: ${radios[0]}`);
    expect(/Monthly/.test(radios[1]) && /£4\.99/.test(radios[1]), `${where}: the month: ${radios[1]}`);
    await sheet.getByRole("button", { name: "Subscribe for £49.99 a year" }).waitFor();
  }

  for (const android of [false, true]) {
    const phone = android ? "Android" : "iPhone";

    await step(`${phone}, free week ended, nothing bought: Home's Meal plan card opens the Premium sheet on Home with the year and month plans; Meal plan doesn't open`, async () => {
      const { ctx, page } = await newPage({ week: "ended", android });
      await page.goto(BASE + "/app");
      const card = page.getByRole("link", { name: /^Meal plan/ });
      await card.waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1500); // the account's answer has come back (the week has ended)
      await card.click();
      await sheetOf(page).waitFor({ timeout: 10_000 });
      await plansShown(page, `${phone} from Home`);
      expect(path(page) === "/app", `the address moved: ${page.url()}`);
      await noMealPlan(page, `${phone} Home after the card`);
      await fits(page, `${phone} sheet from Home`);
      await shot(page, `${android ? "android" : "iphone"}-home-card-sheet`);
      await closeSheet(page);
      expect(path(page) === "/app", `Close left Home: ${page.url()}`);
      await ctx.close();
    });

    await step(`${phone}, free week ended: /app/plan by its address shows the sheet at once with the plans, no preview page; Close goes Home`, async () => {
      const { ctx, page } = await newPage({ week: "ended", android });
      await page.goto(BASE + "/app/plan");
      await sheetOf(page).waitFor({ timeout: 30_000 });
      await plansShown(page, `${phone} on /app/plan`);
      await noMealPlan(page, `${phone} /app/plan`);
      await fits(page, `${phone} sheet on /app/plan`);
      await shot(page, `${android ? "android" : "iphone"}-direct-sheet`);
      await closeSheet(page);
      await page.waitForURL((u) => u.pathname.replace(/\/$/, "") === "/app", { timeout: 10_000 });
      await ctx.close();
    });

    await step(`${phone}, during the free week: the card opens Meal plan (no sheet), and so does /app/plan`, async () => {
      const { ctx, page } = await newPage({ week: "running", android });
      await page.goto(BASE + "/app");
      const card = page.getByRole("link", { name: /^Meal plan/ });
      await card.waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      await card.click();
      await page.waitForURL((u) => u.pathname.startsWith("/app/plan"));
      await planOpens(page);
      expect((await sheetOf(page).count()) === 0 || !(await sheetOf(page).isVisible()), "no Premium sheet in the free week");
      await page.goto(BASE + "/app/plan");
      await planOpens(page);
      await ctx.close();
    });

    await step(`${phone}, free week ended: buying the year in the sheet from Home's card carries on into Meal plan`, async () => {
      const { ctx, page } = await newPage({ week: "ended", android });
      await page.goto(BASE + "/app");
      await page.getByRole("link", { name: /^Meal plan/ }).waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      await page.getByRole("link", { name: /^Meal plan/ }).click();
      await plansShown(page, `${phone} before buying`);
      await sheetOf(page).getByRole("button", { name: "Subscribe for £49.99 a year" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app/plan"), { timeout: 20_000 });
      await planOpens(page);
      expect((await stored(page, "mm.v1.paid"))?.plan === "annual", "the year is kept");
      await ctx.close();
    });
  }
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
