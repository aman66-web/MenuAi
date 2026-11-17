// The iPhone app 1.1's Premium with Apple In-App Purchase, on the packed app (npm run build:app with NEXT_PUBLIC_IAP=1), with a pretend iPhone (the bridge, faked
// like StoreKitPurchaseService would answer) and a pretend server for POST /api/v1/entitlement/apple (signing with a THROWAWAY key from e2e/paykey.mjs):
// the free-trial offer once after setup (or after the welcome tour's "Look around first" and Skip), on Home only and never over another sheet, the paywall's
// free-trial banner, buying, restoring, a refund noticed at start-up, Settings, no Stripe or WhatsApp wording.
//   cd web && KEY=$(node e2e/paykey.mjs) && NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_PHOTO_RECIPES=1 NEXT_PUBLIC_REMOTE_BASE=https://numbite.com NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$KEY" \
//     NEXT_PUBLIC_SUPPORT_EMAIL=test@numbite.com npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BASE=http://localhost:3103 node e2e/iap.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3103";
const LIVE = process.env.LIVE ?? "https://numbite.com";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const { privateJwk } = JSON.parse(readFileSync(new URL("./.paykey.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });
const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJhbm51YWwifQ.c2lnbmF0dXJl";
const DAY = 86_400_000;

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
async function token(plan, expMs) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ v: 1, plan, src: "apple", iat: Math.floor(Date.now() / 1000), exp: Math.floor(expMs / 1000) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`v1.${payload}`)));
  return `v1.${payload}.${b64url(sig)}`;
}

/** The pretend iPhone: StoreKit's products (with a free week when `trial`), a purchase, entitlements and restore as set in window.__iap. */
function fakeBridge(state) {
  window.__iap = state;
  window.__bridgeCalls = [];
  window.webkit = { messageHandlers: { menumath: { postMessage(m) {
    window.__bridgeCalls.push(m.action);
    const s = window.__iap;
    const products = [
      { id: "com.amanmarwaha.numbite.pro.pass90", name: "Founding Member 90-Day Pass", price: "£9.99", period: "none" },
      { id: "com.amanmarwaha.numbite.pro.annual", name: "Annual", price: "£14.99", period: "year", ...(s.trial ? { trialDays: 7 } : {}) },
      { id: "com.amanmarwaha.numbite.pro.monthly", name: "Monthly", price: "£2.99", period: "month", ...(s.trial ? { trialDays: 7 } : {}) },
    ];
    const reply = m.action === "iap.products" ? { products }
      : m.action === "iap.purchase" ? s.purchase
      : m.action === "iap.entitlements" ? { transactions: s.owned }
      : m.action === "iap.restore" ? { transactions: s.owned }
      : { done: true };
    // StoreKit's products can be made to arrive late (productsDelay), so a sheet can be opened before the offer's timer starts
    setTimeout(() => window.__menumathReply(m.id, reply), m.action === "iap.products" ? (s.productsDelay ?? 50) : 50);
  } } } };
}

async function newPage({ settings = onboarded, iap = {}, paid = null, offerShown = false, toured = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(({ s, p, o, w }) => {
    if (!localStorage.getItem("mm.v1.settings") && s) localStorage.setItem("mm.v1.settings", s);
    if (p && !localStorage.getItem("mm.v1.paid")) localStorage.setItem("mm.v1.paid", p);
    if (o) localStorage.setItem("mm.v1.trialOffer", JSON.stringify({ v: 1, data: true }));
    if (w && !localStorage.getItem("mm.v1.tour")) localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 1 }));
  }, { s: settings, p: paid, o: offerShown, w: toured });
  await ctx.addInitScript(fakeBridge, { trial: true, purchase: { transactions: [JWS] }, owned: [], ...iap });
  const page = await ctx.newPage();
  const claims = [];
  await page.route(`${LIVE}/**`, async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === "/api/v1/entitlement/apple") {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
      claims.push(JSON.parse(r.request().postData() ?? "{}"));
      const exp = Date.now() + 7 * DAY;
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ token: await token("annual", exp), plan: "annual", expiresAt: exp }) });
    }
    return r.abort("internetdisconnected");
  });
  return { ctx, page, claims };
}

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function axe(page, where) {
  await page.waitForTimeout(600);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, `${where}: ${v.join(", ")}`);
}

await step("after setup: the free-trial offer once, with the plans, the price after the trial, Apple's words and a way to skip; not again after Not now", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
  await sheet.waitFor();
  await sheet.getByRole("heading", { name: "Try Premium free for 7 days" }).waitFor();
  await sheet.getByText("7-day free trial", { exact: true }).waitFor();
  await sheet.getByText("Premium unlocks. You pay nothing now.").waitFor();
  await sheet.getByText("Day 7", { exact: true }).waitFor();
  // one choice of plan, Annual (with the free week) chosen first, and one button whose words and price line follow the choice
  const plans = sheet.getByRole("radiogroup", { name: "Choose a plan" });
  expect((await plans.getByRole("radio").count()) === 3, "three plans");
  await plans.getByRole("radio", { name: /Annual/, checked: true }).waitFor();
  expect((await plans.getByText("First 7 days free").count()) === 2, "the free week on Annual and Monthly");
  await sheet.getByRole("button", { name: "Start my 7-day free trial" }).waitFor();
  await sheet.getByText("First 7 days free, then £14.99 a year.").waitFor();
  await plans.getByRole("radio", { name: /Monthly/ }).click();
  await sheet.getByText("First 7 days free, then £2.99 a month.").waitFor();
  await plans.getByRole("radio", { name: /Founding Member/ }).click();
  await sheet.getByRole("button", { name: "Buy for £9.99" }).waitFor();
  await sheet.getByText("£9.99, one payment. It doesn't renew.").waitFor();
  await plans.getByRole("radio", { name: /Founding Member/ }).press("ArrowUp");
  await plans.getByRole("radio", { name: /Monthly/, checked: true }).waitFor();
  await sheet.getByText(/There is one free trial per Apple ID\./).waitFor();
  await sheet.getByText(/renews at the same price for the same length unless you cancel it at least 24 hours/).waitFor();
  await sheet.getByRole("link", { name: "Terms of Use (EULA)" }).waitFor();
  await sheet.getByRole("link", { name: "Privacy Policy" }).waitFor();
  await sheet.getByRole("button", { name: "Restore purchases" }).waitFor();
  const text = await sheet.innerText();
  expect(!/stripe|whatsapp|website|card,|google pay/i.test(text), `no other way to pay is mentioned: ${text.match(/stripe|whatsapp|website|card,|google pay/i)?.[0]}`);
  await axe(page, "the trial offer");
  await sheet.getByRole("button", { name: "Not now" }).click();
  await sheet.waitFor({ state: "hidden" });
  await page.reload();
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "shown once on this phone");
  await ctx.close();
});

await step("no offer when this Apple ID has had its trial, before setup is finished (a plain start goes to the welcome tour), or when Premium is already on", async () => {
  for (const [label, opts] of [
    ["trial used", { iap: { trial: false } }],
    ["setup not finished", { settings: JSON.stringify({ v: 1, data: { hasCompletedOnboarding: false } }) }],
    ["Premium on", { paid: "PAID", iap: { owned: [JWS] } }],
  ]) {
    const o = { ...opts };
    if (o.paid === "PAID") o.paid = JSON.stringify({ v: 1, data: { token: await token("annual", Date.now() + 30 * DAY), plan: "annual", until: Date.now() + 30 * DAY, unlockUntil: null } });
    const { ctx, page } = await newPage(o);
    await page.goto(BASE + "/app");
    if (label === "setup not finished") {
      await page.waitForURL(/\/app\/welcome/);
      await page.getByRole("button", { name: "Get started" }).waitFor();
    }
    await page.waitForTimeout(2500);
    expect((await page.getByRole("dialog").count()) === 0, `${label}: no offer`);
    await ctx.close();
  }
});

await step("after the welcome tour's 'Look around first' (the welcome screen has no Skip), the offer rises once on Home about 1.2 s later", async () => {
  for (const way of ["Look around first"]) {
    const { ctx, page } = await newPage({ settings: null });
    await page.goto(BASE + "/app");
    await page.waitForURL(/\/app\/welcome/);
    {
      await page.getByRole("button", { name: "Get started" }).click();
      await page.getByRole("button", { name: "Show me around" }).click();
      await page.getByRole("button", { name: "Skip tour" }).click();
      await page.getByRole("heading", { name: "Let's make it yours" }).waitFor();
      expect((await page.getByRole("dialog").count()) === 0, `${way}: no offer on the welcome screens`);
      await page.getByRole("button", { name: "Look around first" }).click();
    }
    await page.waitForURL(/\/app\/?$/);
    const landed = Date.now();
    const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
    await sheet.waitFor({ timeout: 6000 });
    expect(Date.now() - landed >= 900, `${way}: the offer waited a moment after Home appeared (${Date.now() - landed} ms)`);
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.tour") ?? "null")?.data)) === 1, `${way}: the tour is marked seen`);
    await sheet.getByRole("button", { name: "Not now" }).click();
    await sheet.waitFor({ state: "hidden" });
    await page.reload();
    await page.waitForTimeout(2500);
    expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, `${way}: shown once on this phone`);
    await ctx.close();
  }
});

await step("after setup the offer appears on Home only: not on a recipe page", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  await page.locator("a[href*='/app/recipes/view']").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog").count()) === 0, "no offer on Recipes");
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys");
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog").count()) === 0, "no offer on a recipe page");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await page.getByRole("dialog", { name: "Numbite Premium" }).waitFor({ timeout: 6000 });
  await ctx.close();
});

await step("the offer never rises over the setup card's sheet or Add food: it waits, then shows once that sheet is closed", async () => {
  // the setup card's sheet (the tour was seen with "Look around first", so Home shows the card)
  {
    const { ctx, page } = await newPage({ settings: null, toured: true, iap: { productsDelay: 1500 } });
    await page.goto(BASE + "/app");
    await page.getByRole("button", { name: "Set up" }).click();
    const setup = page.getByRole("dialog", { name: "Make Numbite fit you" });
    await setup.waitFor();
    await page.waitForTimeout(4000);
    expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "the offer rose over the setup sheet");
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.trialOffer") ?? "null")?.data)) !== true, "marked shown while it waited");
    await page.keyboard.press("Escape");
    await setup.waitFor({ state: "hidden" });
    await page.getByRole("dialog", { name: "Numbite Premium" }).waitFor({ timeout: 4000 });
    await ctx.close();
  }
  // Add food, from the + next to Breakfast
  {
    const { ctx, page } = await newPage({ iap: { productsDelay: 1500 } });
    await page.goto(BASE + "/app");
    await page.getByRole("button", { name: "Add to Breakfast" }).click();
    const add = page.getByRole("dialog").first();
    await add.waitFor();
    await page.waitForTimeout(4000);
    expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "the offer rose over Add food");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Numbite Premium" }).waitFor({ timeout: 4000 });
    await ctx.close();
  }
});

await step("the replay of the tour (Settings › Help › Show me around again) never shows the offer", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: "Show me around again" }).click();
  await page.getByText("Step 1 of 5").waitFor();
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog").count()) === 0, "an offer during the replay");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForURL(/\/app\/settings$/);
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog").count()) === 0, "an offer on Settings after the replay");
  await ctx.close();
});

await step("a Premium feature for a free person: the paywall pops up with the 7-day free trial banner", async () => {
  const { ctx, page } = await newPage({ offerShown: true });
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("button", { name: /Make it at home/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("7-day free trial", { exact: true }).waitFor();
  await sheet.getByRole("heading", { name: "Try Premium free for 7 days" }).waitFor();
  await sheet.getByText("Cook any dish from a photo").waitFor();
  await axe(page, "the paywall with the trial banner");
  await ctx.close();
});

await step("starting the free trial: Apple's signed transaction goes to our server, the token comes back, Premium is on and Make it at home opens", async () => {
  const { ctx, page, claims } = await newPage({ offerShown: true });
  await page.goto(BASE + "/app/recipes");
  await page.getByRole("button", { name: /Make it at home/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Start my 7-day free trial" }).click();
  await sheet.getByText("Premium is on. Thank you!").waitFor();
  expect(claims.length === 1 && claims[0].transactions?.[0] === JWS, `the transaction was sent: ${JSON.stringify(claims)}`);
  expect((await page.evaluate(() => window.__bridgeCalls)).includes("iap.purchase"), "the purchase went through the iPhone");
  await sheet.getByText("Premium is on.", { exact: true }).waitFor();
  await sheet.getByRole("button", { name: "Manage subscription" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Make it at home/ }).click();
  await page.waitForURL(/\/app\/recipes\/photo/);
  await ctx.close();
});

await step("a cancelled purchase says nothing and charges nothing; Ask to Buy says it's waiting; Restore with nothing says so", async () => {
  const { ctx, page, claims } = await newPage({ offerShown: true, iap: { purchase: { error: "cancelled" } } });
  await page.goto(BASE + "/app/pro");
  await page.getByRole("button", { name: "Start my 7-day free trial" }).click();
  await page.waitForTimeout(800);
  expect((await page.getByRole("status").filter({ hasText: /Premium|purchase/ }).count()) === 0 && claims.length === 0, "nothing after a cancel");
  await page.evaluate(() => { window.__iap.purchase = { pending: true }; });
  await page.getByRole("button", { name: "Start my 7-day free trial" }).click();
  await page.getByText("Waiting for approval. Premium switches on once the purchase is approved.").waitFor();
  await page.getByRole("button", { name: "Restore purchases" }).click();
  await page.getByText("There's nothing to restore for this Apple ID.").waitFor();
  await ctx.close();
});

await step("Settings › Subscription offers the free trial, and Restore purchases brings Premium back from Apple", async () => {
  const { ctx, page, claims } = await newPage({ offerShown: true, iap: { owned: [] } });
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: "Start your 7-day free trial" }).waitFor();
  await page.evaluate(() => { window.__iap.owned = ["eyJhbGciOiJFUzI1NiJ9.eyJwIjoxfQ.c2ln"]; });
  await page.getByRole("button", { name: "Restore purchases" }).click();
  await page.getByText("Your purchases are restored.").waitFor();
  expect(claims.length === 1, "restore sent Apple's transactions to our server");
  await page.getByRole("button", { name: "Manage subscription" }).waitFor();
  await ctx.close();
});

await step("a refund noticed at start-up: Apple lists nothing, so the Apple token goes and the paywall is back", async () => {
  const paid = JSON.stringify({ v: 1, data: { token: await token("annual", Date.now() + 30 * DAY), plan: "annual", until: Date.now() + 30 * DAY, unlockUntil: null } });
  const { ctx, page } = await newPage({ offerShown: true, paid, iap: { owned: [] } });
  await page.goto(BASE + "/app/recipes");
  await page.waitForFunction(() => window.__bridgeCalls.includes("iap.entitlements"));
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem("mm.v1.paid") ?? "{}").data?.token, null, { timeout: 5000 });
  await page.getByRole("button", { name: /Make it at home/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore purchases" }).waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
