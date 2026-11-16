// Paid access on the website (founder's brief, 13 Nov 2026), in the browser, with Stripe and our payment routes FAKED (nothing reaches Stripe or a database):
// the free tier's limits, the plans, the checkout request (and a creator code), coming back from Stripe, the signed token (and a forged or expired one being refused),
// the 48-hour WhatsApp unlock, restore for a signed-in person, and the Terms / Privacy / Support / landing text that only appears when payments are on.
// Needs a build with payments on and the throwaway public key:
//   PUB=$(node e2e/paykey.mjs); NEXT_PUBLIC_WEB_PRO=1 NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$PUB" NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 npm run build && npm start -- -p 3104
//   BASE=http://localhost:3104 node e2e/pay.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3104";
const key = JSON.parse(readFileSync(new URL("./.paykey.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

// ---- a token signed the way the server signs it (lib/payments/token.ts): v1.<payload>.<ES256 signature>
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function token(claims, jwk = key.privateJwk) {
  const k = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ v: 1, src: "stripe", ...claims })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, new TextEncoder().encode(`v1.${payload}`));
  return `v1.${payload}.${b64u(new Uint8Array(sig))}`;
}
const nowS = () => Math.floor(Date.now() / 1000);
const DAYS = 86400;

const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } });
async function open(extra = {}, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript(([s, extraStorage]) => { localStorage.setItem("mm.v1.settings", s); for (const [k, v] of Object.entries(extraStorage)) localStorage.setItem(k, v); }, [settings, extra.storage ?? {}]);
  const page = await ctx.newPage();
  const calls = [];
  await page.route("**/api/v1/checkout", async (route) => {
    calls.push({ path: "checkout", body: route.request().postDataJSON() });
    const mode = extra.checkout ?? "ok";
    if (mode === "unavailable") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "payments_unavailable" }) });
    if (mode === "fail") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "checkout_failed" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_abc12345" }) });
  });
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<meta http-equiv="refresh" content="0;url=${BASE}/app/pro/thanks?session_id=cs_test_abc12345"><p>Stripe (faked)</p>` }));
  await page.route("**/api/v1/entitlement", async (route) => {
    calls.push({ path: "entitlement", body: route.request().postDataJSON() });
    if (extra.claim === "not_paid") return route.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: "not_paid" }) });
    if (extra.claim === "fail") return route.fulfill({ status: 502, contentType: "application/json", body: "{}" });
    const exp = nowS() + 90 * DAYS;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: await token({ plan: "pass90", iat: nowS(), exp }), plan: "pass90", expiresAt: exp * 1000 }) });
  });
  await page.route("**/api/v1/entitlement/me", async (route) => {
    calls.push({ path: "me" });
    if (!extra.mine) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "none" }) });
    const exp = nowS() + 30 * DAYS;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: await token({ plan: "annual", iat: nowS(), exp }), plan: "annual", expiresAt: exp * 1000 }) });
  });
  return { ctx, page, calls };
}
const DISHES = ["/app/item?chain=kfc&item=zinger-supercharger-tower-burger", "/app/item?chain=nandos&item=houmous-with-peri-peri-drizzle", "/app/item?chain=subway&item=taco-beef-sub", "/app/item?chain=wagamama&item=miso-k-chicken-lunch-box"];
const seeTruth = async (page, path) => { await page.goto(BASE + path); await page.getByRole("button", { name: "See the truth" }).click(); };
const paywall = (page) => page.getByRole("dialog").getByRole("heading", { level: 3, name: "Unlock everything" });
const axeCheck = async (page) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
};

await step("free tier: three different dishes' Truth cards a day, the same one again is free, the fourth shows the paywall", async () => {
  const { ctx, page } = await open();
  for (const d of DISHES.slice(0, 3)) { await seeTruth(page, d); await page.getByRole("dialog").getByRole("heading", { level: 3, name: "Calories" }).waitFor(); await page.getByRole("button", { name: "Close" }).click(); }
  await seeTruth(page, DISHES[0]); // again
  await page.getByRole("dialog").getByRole("heading", { level: 3, name: "Calories" }).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await seeTruth(page, DISHES[3]);
  await paywall(page).waitFor();
  await ctx.close();
});

await step("the plans: three cards with the prices and badges, Pay buttons 48 px, no account needed", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/pro");
  await page.getByRole("heading", { level: 1, name: /Numbite Pro/ }).waitFor();
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  for (const s of ["Founding Member 90-Day Pass", "£9.99", "Most popular", "Annual", "£14.99", "Best value", "Monthly", "£2.99", "You don't need an account", "No recurring subscription"]) expect(text.includes(s) || text.toLowerCase().includes(s.toLowerCase()), "missing: " + s);
  expect(!/\bNando|McDonald|KFC\b/i.test(text), "a restaurant's name in the plans");
  for (const b of await page.getByRole("button", { name: /^Pay £/ }).all()) { const box = await b.boundingBox(); expect(box.height >= 47.5, "Pay button " + box.height + "px"); }
  expect((await page.getByRole("button", { name: /^Pay £/ }).count()) === 3, "three Pay buttons");
  await ctx.close();
});

await step("Pay sends the plan (and a creator code from ?ref=), goes to Stripe, comes back, and the signed token makes the device paid", async () => {
  const { ctx, page, calls } = await open();
  await page.goto(BASE + "/app?ref=Anna_B");
  // the code is held in memory only: reach the plans by tapping links inside the app (no reload), as a visitor would
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await page.getByRole("link", { name: "See plans" }).click();
  await page.waitForURL(/\/app\/pro$/, { timeout: 30000 });
  await page.getByRole("button", { name: "Pay £9.99" }).click();
  await page.waitForURL(/\/app\/pro\/thanks\?session_id=cs_test_abc12345/, { timeout: 30000 });
  await page.getByText("You have Founding Member 90-Day Pass.", { exact: false }).waitFor({ timeout: 30000 });
  expect(JSON.stringify(calls.find((c) => c.path === "checkout").body) === JSON.stringify({ plan: "pass90", ref: "anna_b" }), "checkout body: " + JSON.stringify(calls.find((c) => c.path === "checkout").body));
  expect(calls.find((c) => c.path === "entitlement").body.sessionId === "cs_test_abc12345", "claimed the right session");
  const paid = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.paid")).data);
  expect(paid.plan === "pass90" && paid.until > Date.now() + 80 * 86400000, "paid state: " + JSON.stringify(paid).slice(0, 120));
  expect(!JSON.stringify(paid).includes("@"), "an email in the stored token");
  await page.getByText(/Access until/).waitFor();
  for (const d of DISHES) { await seeTruth(page, d); await page.getByRole("dialog").getByRole("heading", { level: 3, name: "Calories" }).waitFor(); await page.getByRole("button", { name: "Close" }).click(); } // four dishes, no paywall
  await page.goto(BASE + "/app/settings");
  await page.getByText("Pro", { exact: true }).first().waitFor();
  await ctx.close();
});

await step("the creator code is never stored, and a reload forgets it", async () => {
  const { ctx, page, calls } = await open();
  await page.goto(BASE + "/app?ref=Anna_B");
  await page.waitForFunction(() => !location.search.includes("ref="), null, { timeout: 15000 }); // the code is taken out of the address at once (the tab memory and history would otherwise keep it)
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await page.waitForURL(/\/app\/settings$/, { timeout: 30000 });
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  expect(!/anna_b/i.test(stored), "the creator code was written to storage or a cookie: " + stored.slice(0, 200));
  expect(!page.url().includes("ref="), "the address still carries ?ref=: " + page.url());
  await page.reload();
  await page.getByRole("link", { name: "See plans" }).click();
  await page.getByRole("button", { name: "Pay £9.99" }).click();
  await page.waitForURL(/thanks/, { timeout: 30000 });
  expect(JSON.stringify(calls.find((c) => c.path === "checkout").body) === JSON.stringify({ plan: "pass90" }), "after a reload the request still carried a code: " + JSON.stringify(calls[0].body));
  await ctx.close();
});

await step("no creator code, no 'ref' in the request; a bad one in the address is ignored", async () => {
  const { ctx, page, calls } = await open();
  await page.goto(BASE + "/app/pro?ref=<script>");
  await page.getByRole("button", { name: "Pay £14.99" }).click();
  await page.waitForURL(/thanks/, { timeout: 30000 });
  expect(JSON.stringify(calls.find((c) => c.path === "checkout").body) === JSON.stringify({ plan: "annual" }), "body: " + JSON.stringify(calls[0].body));
  await ctx.close();
});

await step("a failed or unavailable checkout says so plainly and takes nothing", async () => {
  for (const [mode, words] of [["unavailable", "Paying isn't available right now"], ["fail", "Couldn't start the payment"]]) {
    const { ctx, page } = await open({ checkout: mode });
    await page.goto(BASE + "/app/pro");
    await page.getByRole("button", { name: "Pay £2.99" }).click();
    await page.getByRole("alert").filter({ hasText: words }).waitFor();
    expect(/\/app\/pro/.test(page.url()), "left the page");
    await ctx.close();
  }
});

await step("coming back from Stripe unpaid, or when the check fails, says so and offers to try again", async () => {
  let r = await open({ claim: "not_paid" });
  await r.page.goto(BASE + "/app/pro/thanks?session_id=cs_test_abc12345");
  await r.page.getByRole("alert").filter({ hasText: "hasn't gone through" }).waitFor();
  await r.ctx.close();
  r = await open({ claim: "fail" });
  await r.page.goto(BASE + "/app/pro/thanks?session_id=cs_test_abc12345");
  await r.page.getByRole("button", { name: "Try again" }).waitFor();
  await r.ctx.close();
  r = await open();
  await r.page.goto(BASE + "/app/pro/thanks");
  await r.page.getByRole("button", { name: "Try again" }).waitFor();
  expect(!(await r.page.evaluate(() => localStorage.getItem("mm.v1.paid"))), "something was stored");
  await r.ctx.close();
});

await step("a forged, expired or someone else's token is forgotten at start-up; a genuine one keeps working", async () => {
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const otherJwk = await crypto.subtle.exportKey("jwk", other.privateKey);
  const cases = [
    ["signed with another key", await token({ plan: "annual", iat: nowS(), exp: nowS() + 30 * DAYS }, otherJwk), false],
    ["expired", await token({ plan: "annual", iat: nowS() - 40 * DAYS, exp: nowS() - DAYS }), false],
    ["genuine", await token({ plan: "annual", iat: nowS(), exp: nowS() + 30 * DAYS }), true],
  ];
  for (const [name, tok, ok] of cases) {
    const until = Date.now() + 30 * 86400000;
    const { ctx, page } = await open({ storage: { "mm.v1.paid": JSON.stringify({ v: 1, data: { token: tok, plan: "annual", until, unlockUntil: null } }) } });
    await page.goto(BASE + "/app");
    await page.getByRole("heading", { level: 1, name: /Home/ }).waitFor();
    await page.waitForTimeout(1200);
    const kept = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("mm.v1.paid") || "null"); return !!(p && p.data && p.data.token); });
    expect(kept === ok, `${name}: token ${kept ? "kept" : "forgotten"}`);
    await ctx.close();
  }
});

await step("sharing on WhatsApp gives 48 hours of paid features on this device, once while it runs", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/pro");
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: /share on WhatsApp to unlock 48 hours free/i }).click()]);
  expect(/^https:\/\/wa\.me\/\?text=/.test(popup.url()) || popup.url() === "about:blank" || /wa\.me|whatsapp/.test(popup.url()), "popup: " + popup.url());
  await popup.close();
  await page.getByText(/Unlocked until/).waitFor();
  const unlock = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.paid")).data.unlockUntil);
  expect(Math.abs(unlock - (Date.now() + 48 * 3600 * 1000)) < 60000, "48 hours: " + (unlock - Date.now()) / 3600000);
  for (const d of DISHES) { await seeTruth(page, d); await page.getByRole("dialog").getByRole("heading", { level: 3, name: "Calories" }).waitFor(); await page.getByRole("button", { name: "Close" }).click(); }
  await ctx.close();
});

await step("restore: a signed-in person gets their access back; with nothing found it says so; signed out it opens sign-in", async () => {
  const account = JSON.stringify({ v: 1, data: { id: "u1", email: "ann@example.com", providers: ["email"] } });
  let r = await open({ mine: true, storage: { "mm.v1.account": account } });
  await r.page.goto(BASE + "/app/pro");
  await r.page.getByRole("button", { name: "Restore my access" }).click();
  await r.page.getByText("Your access is back.").waitFor();
  expect(r.calls.some((c) => c.path === "me"), "asked the server");
  await r.ctx.close();
  r = await open({ storage: { "mm.v1.account": account } });
  await r.page.goto(BASE + "/app/pro");
  await r.page.getByRole("button", { name: "Restore my access" }).click();
  await r.page.getByText("We couldn't find a payment for this account's email address.").waitFor();
  await r.ctx.close();
  r = await open();
  await r.page.goto(BASE + "/app/pro");
  await r.page.getByRole("button", { name: "I've already paid: sign in" }).click();
  await r.page.getByRole("dialog").waitFor();
  await r.ctx.close();
});

await step("Quick answers: a free person sees the first two results, the rest are locked, 'Small appetite' opens the paywall; Best for you shows its first two", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/chain?id=kfc");
  const group = page.getByRole("group", { name: "Quick answers" });
  await group.getByRole("button", { name: "Under 500 calories" }).click();
  const section = page.locator("section[aria-labelledby='quick-heading']");
  expect((await section.locator("ul > li").count()) === 2, "rows: " + (await section.locator("ul > li").count()));
  await section.getByRole("button", { name: /Unlock the other 3/ }).click();
  await paywall(page).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await group.getByRole("button", { name: "Small appetite" }).click();
  await paywall(page).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Unlock the other \d/ }).first().waitFor(); // Best for you's locked picks
  await ctx.close();
});

await step("Cheapest protein: five rows free, the rest locked behind the paywall", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/groceries/protein");
  await page.getByRole("heading", { level: 2, name: /cheapest protein foods/ }).waitFor({ timeout: 60000 });
  expect((await page.locator("ol > li").count()) === 5, "rows: " + (await page.locator("ol > li").count()));
  await page.getByRole("button", { name: /Unlock the other 15/ }).click();
  await paywall(page).waitFor();
  await ctx.close();
});

await step("logging and the order builder stay free in the paid tier; the fourth saved order shows the paywall", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + DISHES[0]);
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByText("Logged to Today.").waitFor();
  await page.getByRole("button", { name: "Customise" }).click();
  await page.waitForURL(/\/app\/builder/);
  expect((await page.getByRole("dialog").count()) === 0 || !(await paywall(page).isVisible()), "the paywall appeared for the builder");
  await ctx.close();
});

await step("Terms, Privacy, Support and the landing page describe paid access (only because payments are on)", async () => {
  const { ctx, page } = await open();
  const body = async (path) => (await (await page.goto(BASE + path), page.locator("body").innerText())).replace(/\s+/g, " ");
  const terms = await body("/terms");
  expect(/Paid access on the website/.test(terms) && /£9\.99/.test(terms) && /£14\.99/.test(terms) && /£2\.99/.test(terms) && /14 days/.test(terms) && /do not need an account to pay/.test(terms), "terms: missing paid-access text");
  expect(!/The app is free: there is nothing to buy in it/.test(terms), "terms still say nothing is for sale");
  const privacy = await body("/privacy");
  expect(/Stripe takes your payment/.test(privacy) && /never see your card number/.test(privacy) && /creator/.test(privacy) && /six years/.test(privacy), "privacy: missing payment text");
  expect(!/There is nothing to buy/.test(privacy), "privacy still says nothing is for sale");
  expect(/cancel/i.test(await body("/support")), "support: no cancel answer");
  // the FAQ answers sit in closed <details>, which innerText leaves out: read the page's text content instead
  await page.goto(BASE + "/");
  expect(/£2\.99 a month/.test(((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ")), "landing FAQ: no prices");
  await ctx.close();
});

await step("360 px and Extra large text: no sideways scroll on the plans and the paywall; axe 0", async () => {
  const { ctx, page } = await open({ storage: { "mm.v1.settings": JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, textSize: "xlarge" } }) } }, { width: 360, height: 740 });
  await page.goto(BASE + "/app/pro");
  await page.getByRole("button", { name: "Pay £9.99" }).waitFor();
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o <= 0, "plans scroll sideways by " + o);
  await ctx.close();
  const r = await open();
  await r.page.goto(BASE + "/app/pro");
  await r.page.getByRole("button", { name: "Pay £9.99" }).waitFor();
  await axeCheck(r.page);
  await r.page.goto(BASE + "/app/pro/thanks?session_id=cs_test_abc12345");
  await r.page.getByText("You have", { exact: false }).waitFor({ timeout: 30000 });
  await axeCheck(r.page);
  for (const d of DISHES.slice(0, 3)) { await seeTruth(r.page, d); await r.page.getByRole("button", { name: "Close" }).click(); }
  await r.ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
