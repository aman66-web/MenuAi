// The iPhone app 1.1's Premium with Apple In-App Purchase, on the packed app (npm run build:app with NEXT_PUBLIC_IAP=1), with a pretend iPhone (the bridge, faked
// like StoreKitPurchaseService would answer) and a pretend server for POST /api/v1/entitlement/apple (signing with a THROWAWAY key from e2e/paykey.mjs):
// the free-trial offer once on a later day than the first (never straight after the welcome steps), on Home only and never over another sheet, the paywall's
// picture-led top with the free trial and the price after it (founder, 20 November 2026: "This has got to look more interesting"), buying, restoring, a refund
// noticed at start-up, Settings, no Stripe or WhatsApp wording.
//   cd web && KEY=$(node e2e/paykey.mjs) && NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_PHOTO_RECIPES=1 NEXT_PUBLIC_REMOTE_BASE=https://numbite.com NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$KEY" \
//     NEXT_PUBLIC_SIGN_IN_REQUIRED=0 NEXT_PUBLIC_SUPPORT_EMAIL=test@numbite.com npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BASE=http://localhost:3103 node e2e/iap.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { planNext, recipes, shops, skipBody } from "./welcome-steps.mjs";

const BASE = process.env.BASE ?? "http://localhost:3103";
const LIVE = process.env.LIVE ?? "https://numbite.com";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const { privateJwk } = JSON.parse(readFileSync(new URL("./.paykey.json", import.meta.url), "utf8"));
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

/** The day before today ("YYYY-MM-DD", local): the app first used then, so today is "a later day" (lib/mm/tour.ts trialOfferDue). */
const YESTERDAY = (() => { const d = new Date(Date.now() - DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

/** `firstDay`: the first day the app was used on this phone (the trial offer waits for a later day); null = today, as on a brand-new phone. */
async function newPage({ settings = onboarded, iap = {}, paid = null, offerShown = false, toured = false, firstDay = YESTERDAY } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(({ s, p, o, w, f }) => {
    if (!localStorage.getItem("mm.v1.settings") && s) localStorage.setItem("mm.v1.settings", s);
    if (p && !localStorage.getItem("mm.v1.paid")) localStorage.setItem("mm.v1.paid", p);
    if (o) localStorage.setItem("mm.v1.trialOffer", JSON.stringify({ v: 1, data: true }));
    if (w && !localStorage.getItem("mm.v1.tour")) localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 }));
    if (f && !localStorage.getItem("mm.v1.rating")) localStorage.setItem("mm.v1.rating", JSON.stringify({ v: 1, data: { firstDay: f, lastDay: f, daysUsed: 1, lastAsked: null, reviewAsked: false } }));
  }, { s: settings, p: paid, o: offerShown, w: toured, f: firstDay });
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

await step("after setup: the free-trial offer once, with the picture-led top, the plans, the price after the trial, how it works, Apple's words and a way to skip; not again after Not now", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
  await sheet.waitFor({ timeout: 8000 });
  await sheet.getByRole("heading", { name: "Try Premium free for 7 days" }).waitFor();
  await sheet.getByText("Then £14.99 a year.", { exact: true }).waitFor();
  // one choice of plan, Annual (with the free week) chosen first, and the price lines follow the choice
  const plans = sheet.getByRole("radiogroup", { name: "Choose a plan" });
  expect((await plans.getByRole("radio").count()) === 2, "two plans");
  await plans.getByRole("radio", { name: /Annual/, checked: true }).waitFor();
  expect((await plans.getByText("First 7 days free").count()) === 2, "the free week on Annual and Monthly");
  await sheet.getByRole("button", { name: "Continue", exact: true }).waitFor();
  await sheet.getByText("First 7 days free, then £14.99 a year. Renews until you cancel.").waitFor();
  // the headline is never bigger than the billed amount (App Review 3.1.2(c))
  const sizes = await sheet.evaluate((d) => {
    const px = (el) => parseFloat(getComputedStyle(el).fontSize);
    const h = [...d.querySelectorAll("h3")].find((x) => x.textContent === "Try Premium free for 7 days");
    const billed = [...d.querySelectorAll("span")].find((x) => x.textContent === "£14.99" && x.parentElement?.tagName === "P");
    return { h: h ? px(h) : 0, billed: billed ? px(billed) : 0 };
  });
  expect(sizes.h > 0 && sizes.billed > sizes.h, `headline ${sizes.h}px, billed amount ${sizes.billed}px`);
  await plans.getByRole("radio", { name: /Monthly/ }).click();
  await sheet.getByText("Then £2.99 a month.", { exact: true }).waitFor();
  await sheet.getByText("First 7 days free, then £2.99 a month. Renews until you cancel.").waitFor();
  await sheet.getByText("Your plan starts. You pay £2.99 a month.").waitFor();
  await plans.getByRole("radio", { name: /Monthly/ }).press("ArrowUp");
  await plans.getByRole("radio", { name: /Annual/, checked: true }).waitFor();
  await sheet.getByRole("heading", { name: "How your free trial works" }).waitFor();
  await sheet.getByText("Premium unlocks. You pay nothing now.").waitFor();
  await sheet.getByText("Cancel in your App Store settings at least 24 hours before, and you pay nothing.").waitFor();
  await sheet.getByText("Day 7", { exact: true }).waitFor();
  await sheet.getByText("Your plan starts. You pay £14.99 a year.").waitFor();
  await sheet.getByRole("heading", { name: "What Premium adds" }).waitFor();
  await sheet.getByText("Cook any dish from a photo").waitFor();
  await sheet.getByText(/There is one free trial per Apple ID\./).waitFor();
  await sheet.getByText(/renews at the same price and length unless you cancel at least 24 hours/).waitFor();
  await sheet.getByRole("link", { name: "Terms of Use (EULA)" }).waitFor();
  await sheet.getByRole("link", { name: "Privacy Policy" }).waitFor();
  await sheet.getByRole("button", { name: "Restore purchases" }).waitFor();
  const text = await sheet.innerText();
  expect(!/stripe|whatsapp|website|card,|google pay|remind/i.test(text), `no other way to pay, no reminder promised: ${text.match(/stripe|whatsapp|website|card,|google pay|remind/i)?.[0]}`);
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

await step("never straight after setup: no offer on the welcome steps or on Home in the visit they finish in, nor on a phone first used today; on a later day it rises once on Home about 1.2 s after landing", async () => {
  // a brand-new phone (first used today): the welcome steps, then Home with no offer
  {
    const { ctx, page } = await newPage({ settings: null, firstDay: null });
    await page.goto(BASE + "/app");
    await page.waitForURL(/\/app\/welcome/);
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.getByRole("button", { name: "Nothing to avoid" }).click();
    // the seven-screen welcome has no "Skip setup and make my account" (20 November 2026): through the shops, recipes, the questions about you and Your plan
    await shops(page);
    await recipes(page);
    await skipBody(page);
    await planNext(page);
    expect((await page.getByRole("dialog").count()) === 0, "an offer on the welcome steps");
    // this build makes signing in optional (NEXT_PUBLIC_SIGN_IN_REQUIRED=0): "Not now" ends the steps
    await page.getByRole("button", { name: "Not now" }).click();
    await page.waitForURL(/\/app\/?$/);
    await page.waitForTimeout(3000);
    expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "an offer straight after setup");
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.tour") ?? "null")?.data)) === 2, "the welcome screens are marked seen (TOUR_VERSION 2)");
    await page.reload();
    await page.waitForTimeout(3000);
    expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "an offer on the first day the app was used");
    await ctx.close();
  }
  // a later day: once, about 1.2 s after Home appears
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/?$/);
  const landed = Date.now();
  const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
  await sheet.waitFor({ timeout: 6000 });
  expect(Date.now() - landed >= 900, `the offer waited a moment after Home appeared (${Date.now() - landed} ms)`);
  await sheet.getByRole("button", { name: "Not now" }).click();
  await sheet.waitFor({ state: "hidden" });
  await page.reload();
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog", { name: "Numbite Premium" }).count()) === 0, "shown once on this phone");
  await ctx.close();
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
  // the setup card's sheet (the welcome screens were seen but setup not finished, so Home shows the card)
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

await step("the replay of the feature screens (Settings › Help › Show me what Numbite can do) never shows the offer", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: "Show me what Numbite can do" }).click();
  // the replay's screens count themselves ("1 of 2" since the onboarding of 20 November)
  await page.getByText(/\b1 of \d+/).first().waitFor();
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog").count()) === 0, "an offer during the replay");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForURL(/\/app\/settings$/);
  await page.waitForTimeout(2500);
  expect((await page.getByRole("dialog").count()) === 0, "an offer on Settings after the replay");
  await ctx.close();
});

// The onboarding meeting of 19 November (change 3): Home, the week, the labels page and Today follow the real gate (needsPaywall("log")). In this build the paid
// tier keeps adding a meal free (PAID_TIER_ONLY), so nothing sells Premium for what + already does free.
await step("adding a meal is free here: Home has no log card and no 'once you log your meals' lines, and Today shows the day's meals, not the paywall", async () => {
  const { ctx, page } = await newPage({ offerShown: true });
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Add to Breakfast" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  for (const line of ["Log your meals to see what's left today.", "Each day's calories show here once you log your meals.", "Your sugar, salt and fibre show here once you log your meals."]) {
    expect((await page.getByText(line).count()) === 0, `Home says "${line}" where adding a meal is free`);
  }
  await page.goto(BASE + "/app/today");
  await page.getByRole("heading", { level: 1, name: "Today's meals" }).waitFor();
  expect((await page.getByText("See what's left of your calories and protein.", { exact: false }).count()) === 0, "Today shows the paywall card");
  await page.getByRole("button", { name: /^Add to / }).first().waitFor();
  await ctx.close();
});

await step("a Premium feature for a free person: the paywall pops up with the free trial, the price after it and why it opened", async () => {
  const { ctx, page } = await newPage({ offerShown: true });
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Photo to recipe" }).click();
  const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
  await sheet.getByRole("heading", { name: "Try Premium free for 7 days" }).waitFor();
  await sheet.getByText("Then £14.99 a year.", { exact: true }).waitFor();
  await sheet.getByText("Make it at home is part of Premium.").waitFor();
  await sheet.getByText("Cook any dish from a photo").waitFor();
  await axe(page, "the paywall");
  await ctx.close();
});

await step("starting the free trial: Apple's signed transaction goes to our server, the token comes back, Premium is on and Make it at home opens", async () => {
  const { ctx, page, claims } = await newPage({ offerShown: true });
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Photo to recipe" }).click();
  const sheet = page.getByRole("dialog", { name: "Numbite Premium" });
  await sheet.getByRole("button", { name: "Continue", exact: true }).click();
  // the sheet closes, says so once and carries on to what was tapped
  await page.getByText("Premium is on. Thank you.").waitFor();
  await page.waitForURL(/\/app\/recipes\/photo/);
  expect(claims.length === 1 && claims[0].transactions?.[0] === JWS, `the transaction was sent: ${JSON.stringify(claims)}`);
  expect((await page.evaluate(() => window.__bridgeCalls)).includes("iap.purchase"), "the purchase went through the iPhone");
  await ctx.close();
});

await step("a cancelled purchase says nothing and charges nothing; Ask to Buy says it's waiting; Restore with nothing says so", async () => {
  const { ctx, page, claims } = await newPage({ offerShown: true, iap: { purchase: { error: "cancelled" } } });
  await page.goto(BASE + "/app/pro");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(800);
  expect((await page.getByRole("status").filter({ hasText: /Premium|purchase/ }).count()) === 0 && claims.length === 0, "nothing after a cancel");
  await page.evaluate(() => { window.__iap.purchase = { pending: true }; });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Waiting for approval. Premium switches on once the purchase is approved.").waitFor();
  await page.getByRole("button", { name: "Restore purchases" }).click();
  await page.getByText("There's nothing to restore for this Apple ID.").waitFor();
  await ctx.close();
});

await step("Settings › Subscription offers the plans and says the free trial is still there, and Restore purchases brings Premium back from Apple", async () => {
  const { ctx, page, claims } = await newPage({ offerShown: true, iap: { owned: [] } });
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: "See plans" }).waitFor();
  await page.getByText("You can still have a 7-day free trial.").waitFor();
  await page.evaluate(() => { window.__iap.owned = ["eyJhbGciOiJFUzI1NiJ9.eyJwIjoxfQ.c2ln"]; });
  await page.getByRole("button", { name: "Restore purchases" }).click();
  // the section turns into the plan at once (Restore and its note are only for someone not subscribed)
  await page.getByText("Premium · Annual").waitFor();
  expect(claims.length === 1, "restore sent Apple's transactions to our server");
  await page.getByRole("button", { name: "Manage subscription" }).waitFor();
  await ctx.close();
});

await step("a refund noticed at start-up: Apple lists nothing, so the Apple token goes and the paywall is back", async () => {
  const paid = JSON.stringify({ v: 1, data: { token: await token("annual", Date.now() + 30 * DAY), plan: "annual", until: Date.now() + 30 * DAY, unlockUntil: null } });
  const { ctx, page } = await newPage({ offerShown: true, paid, iap: { owned: [] } });
  await page.goto(BASE + "/app");
  await page.waitForFunction(() => window.__bridgeCalls.includes("iap.entitlements"));
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem("mm.v1.paid") ?? "{}").data?.token, null, { timeout: 5000 });
  await page.getByRole("button", { name: "Photo to recipe" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore purchases" }).waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
