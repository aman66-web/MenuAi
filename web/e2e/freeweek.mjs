// The free week and gifts of Premium (founder, 20 November 2026) in the iPhone app 1.1's packed web app, with a pretend iPhone (the bridge: StoreKit with NO
// introductory offer, as App Store Connect will have it, and Apple's DeviceCheck token) and a pretend server (the signed-in account's session, sync, and
// POST /api/v1/entitlement/account signing with a THROWAWAY key from e2e/paykey.mjs): a signed-in account gets Premium with nothing to type, Home says so once,
// Settings says how many days are left and keeps See plans, the plans page shows the plans (not "Premium is on"), nothing offers a second free week; once the
// week has ended the paywall says "Your free week has ended"; a gift; a purchase wins (the account isn't asked); signing out forgets it.
// The same build as e2e/iap.mjs:
//   cd web && KEY=$(node e2e/paykey.mjs) && NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_PHOTO_RECIPES=1 NEXT_PUBLIC_REMOTE_BASE=https://numbite.com NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$KEY" \
//     NEXT_PUBLIC_SIGN_IN_REQUIRED=0 NEXT_PUBLIC_SUPPORT_EMAIL=test@numbite.com npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BASE=http://localhost:3103 node e2e/freeweek.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3103";
const LIVE = process.env.LIVE ?? "https://numbite.com";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const { privateJwk } = JSON.parse(readFileSync(new URL("./.paykey.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const DAY = 86_400_000;
const USER = { id: "user-1", email: "anna@example.com", providers: ["email"] };
const DEVICE_TOKEN = "cGhvbmUtb25lLXRva2VuLWZyb20tYXBwbGU=";
const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJhbm51YWwifQ.c2lnbmF0dXJl";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
async function token(plan, src, expMs) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ v: 1, plan, src, iat: Math.floor(Date.now() / 1000), exp: Math.floor(expMs / 1000) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`v1.${payload}`)));
  return `v1.${payload}.${b64url(sig)}`;
}

/** The pretend iPhone: StoreKit's two plans with no free trial, Apple's list of purchases (`owned`), and a DeviceCheck token. */
function fakeBridge(state) {
  window.__iap = state;
  window.__bridgeCalls = [];
  window.webkit = { messageHandlers: { menumath: { postMessage(m) {
    window.__bridgeCalls.push(m.action);
    const s = window.__iap;
    const products = [
      { id: "com.amanmarwaha.numbite.pro.annual", name: "Annual", price: "£49.99", period: "year" },
      { id: "com.amanmarwaha.numbite.pro.monthly", name: "Monthly", price: "£4.99", period: "month" },
    ];
    const reply = m.action === "iap.products" ? { products }
      : m.action === "iap.entitlements" || m.action === "iap.restore" ? { transactions: s.owned }
      : m.action === "deviceCheck.token" ? { deviceToken: s.deviceToken, deviceEnv: "production" }
      : { done: true };
    setTimeout(() => window.__menumathReply(m.id, reply), 50);
  } } } };
}

const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
const YESTERDAY = (() => { const d = new Date(Date.now() - DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

/** `answer(body)`: what POST /api/v1/entitlement/account says. `paid` / `freeWeek`: what the phone already keeps. */
async function newPage({ answer, paid = null, freeWeek = null, owned = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(({ s, u, p, f, y }) => {
    const put = (k, v) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ v: 1, data: v })); };
    if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s);
    put("mm.v1.coach", { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] });
    put("mm.v1.tour", 2);
    put("mm.v1.trialOffer", true);
    put("mm.v1.rating", { firstDay: y, lastDay: y, daysUsed: 1, lastAsked: null, reviewAsked: false });
    put("mm.v1.account", u);
    put("mm.v1.session", { accessToken: "at-1", refreshToken: "rt-1", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    if (p) put("mm.v1.paid", p);
    if (f) put("mm.v1.freeWeek", f);
  }, { s: onboarded, u: USER, p: paid, f: freeWeek, y: YESTERDAY });
  await ctx.addInitScript(fakeBridge, { owned, deviceToken: DEVICE_TOKEN });
  const page = await ctx.newPage();
  const asked = [];
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
  await page.route(`${LIVE}/**`, async (r) => {
    const req = r.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const respond = (status, body) => r.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (path === "auth/session") return respond(200, { user: USER });
    if (path === "auth/signout") return respond(200, { ok: true });
    if (path === "sync") return respond(200, { ok: true, stores: {} });
    if (/^sync\/\w+$/.test(path)) return respond(200, { ok: true, state: body?.state });
    if (path === "entitlement/account") {
      asked.push({ body, auth: req.headers().authorization ?? null });
      return respond(200, await answer(body));
    }
    if (path === "entitlement/apple") return respond(200, { token: await token("annual", "apple", Date.now() + 300 * DAY), plan: "annual", expiresAt: Date.now() + 300 * DAY });
    return r.abort("internetdisconnected");
  });
  return { ctx, page, asked };
}

/** The server's free week: started by the first ask (claimedNow), the same week after that. */
const trial = (endsAt) => {
  let asks = 0;
  return async () => ({ premium: true, plan: "trial", token: await token("trial", "account", endsAt), expiresAt: endsAt, freeWeek: "running", freeWeekEndsAt: endsAt, claimedNow: asks++ === 0, deviceCheck: asks === 1 ? "set" : "not_needed" });
};

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function axe(page, where) {
  await page.waitForTimeout(600);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, `${where}: ${v.join(", ")}`);
}
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.data ?? null, key);

await step("a signed-in account: the app asks once with the session and this iPhone's DeviceCheck token, Premium is on with nothing to type, and Home says so once", async () => {
  const { ctx, page, asked } = await newPage({ answer: trial(Date.now() + 7 * DAY) });
  await page.goto(BASE + "/app");
  await page.getByText("Premium is yours free for 7 days.").waitFor({ timeout: 10_000 });
  expect(asked.length >= 1 && asked[0].auth === "Bearer at-1", `the session was sent: ${JSON.stringify(asked[0])}`);
  expect(asked[0].body?.deviceToken === DEVICE_TOKEN && asked[0].body?.deviceEnv === "production", `the DeviceCheck token was sent: ${JSON.stringify(asked[0].body)}`);
  expect((await stored(page, "mm.v1.paid"))?.plan === "trial", "the free week's token is kept as a purchase's is");
  // a Premium feature opens straight away, no paywall
  await page.getByRole("button", { name: "Photo to recipe" }).click();
  await page.waitForURL(/\/app\/recipes\/photo/);
  expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "no paywall in the free week");
  await page.goto(BASE + "/app");
  await page.waitForTimeout(3500);
  expect((await page.getByText("Premium is yours free for 7 days.").count()) === 0, "said once on this phone");
  await ctx.close();
});

await step("Settings › Subscription: 'Free week: 7 days left' and See plans; the plans page shows the plans, with no trial and nothing about a second free week", async () => {
  const { ctx, page } = await newPage({ answer: trial(Date.now() + 7 * DAY) });
  await page.goto(BASE + "/app/settings");
  await page.getByText("Free week: 7 days left").waitFor({ timeout: 10_000 });
  await page.getByRole("link", { name: "See plans" }).click();
  await page.waitForURL(/\/app\/pro/);
  await page.getByRole("radiogroup", { name: "Choose a plan" }).waitFor();
  await page.getByRole("heading", { name: "Get more with Premium" }).waitFor();
  await page.getByRole("button", { name: "Subscribe for £49.99 a year" }).waitFor();
  const text = await page.locator("main").innerText();
  expect(!/First 7 days free|How your free trial works|Try Premium free|Premium is on\.|still have a/i.test(text), `no second free week, no "Premium is on": ${text.match(/First 7 days free|How your free trial works|Try Premium free|Premium is on\.|still have a/i)?.[0]}`);
  await axe(page, "the plans in the free week");
  await ctx.close();
});

await step("the last day says '1 day left'", async () => {
  const { ctx, page } = await newPage({ answer: trial(Date.now() + 5 * 60 * 60 * 1000) });
  await page.goto(BASE + "/app/settings");
  await page.getByText("Free week: 1 day left").waitFor({ timeout: 10_000 });
  await ctx.close();
});

await step("once the week has ended: the token goes, Settings says Free, and the paywall's headline says 'Your free week has ended' with the plans", async () => {
  const ended = Date.now() - DAY;
  const { ctx, page } = await newPage({
    answer: async () => ({ premium: false, freeWeek: "ended", freeWeekEndsAt: ended, deviceCheck: "not_needed" }),
    paid: { token: await token("trial", "account", ended), plan: "trial", until: ended, unlockUntil: null },
    freeWeek: { user: USER.id, status: "running", endsAt: ended, welcomeDue: false },
  });
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Photo to recipe" }).click();
  const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
  await sheet.getByRole("heading", { name: "Your free week has ended" }).waitFor({ timeout: 10_000 });
  await sheet.getByText("Make it at home is part of Premium.").waitFor();
  await sheet.getByRole("radiogroup", { name: "Choose a plan" }).waitFor();
  const text = await sheet.innerText();
  expect(!/First 7 days free|How your free trial works|Try Premium free/i.test(text), "no other free week offered");
  await axe(page, "the paywall after the free week");
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/settings");
  await page.getByText("Your plan: Free").waitFor();
  expect((await stored(page, "mm.v1.paid"))?.token == null, "the ended week's token is gone");
  await ctx.close();
});

await step("a gift of Premium: Settings says 'Premium, a gift' and keeps See plans", async () => {
  const until = Date.now() + 30 * DAY;
  const { ctx, page } = await newPage({ answer: async () => ({ premium: true, plan: "gift", token: await token("gift", "account", until), expiresAt: until, giftUntil: null, freeWeek: "not_checked", deviceCheck: "not_needed" }) });
  await page.goto(BASE + "/app/settings");
  await page.getByText("Premium, a gift").waitFor({ timeout: 10_000 });
  await page.getByRole("link", { name: "See plans" }).waitFor();
  await ctx.close();
});

await step("a purchase wins: with Apple's subscription the account isn't asked, and Settings shows the plan", async () => {
  const { ctx, page, asked } = await newPage({
    answer: trial(Date.now() + 7 * DAY),
    paid: { token: await token("annual", "apple", Date.now() + 300 * DAY), plan: "annual", until: Date.now() + 300 * DAY, unlockUntil: null },
    owned: [JWS],
  });
  await page.goto(BASE + "/app/settings");
  await page.getByText("Premium · Annual").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(2500);
  expect(asked.length === 0, `the account was asked: ${asked.length}`);
  await ctx.close();
});

await step("signing out forgets the account's free week on this phone", async () => {
  const { ctx, page } = await newPage({ answer: trial(Date.now() + 7 * DAY) });
  await page.goto(BASE + "/app/settings");
  await page.getByText("Free week: 7 days left").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
  await page.waitForTimeout(1500);
  expect((await stored(page, "mm.v1.paid"))?.token == null, "the free week's token is gone");
  expect((await stored(page, "mm.v1.freeWeek"))?.user == null, "and what the phone knew about it");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
