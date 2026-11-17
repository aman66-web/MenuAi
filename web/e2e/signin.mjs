// Everyone signs in (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts SIGN_IN_REQUIRED, lib/mm/signInGate.ts).
// The backend is a fake that answers /api/v1/* in memory (like account.mjs). Run on a build with the requirement on:
//   NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_SIGN_IN_REQUIRED=1 npm run build && npm start -- -p 3101 &
//   BASE=http://localhost:3101 node e2e/signin.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

async function newPhone({ settings = null, width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
  if (settings) await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const device = { user: null, calls: [] };
  await ctx.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
    device.calls.push(`${req.method()} ${path}`);
    const respond = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (path === "auth/session") return respond(200, { user: device.user });
    if (path === "auth/email/start") return respond(200, { ok: true });
    if (path === "auth/email/verify") {
      if (body.code !== "123456") return respond(400, { error: "invalid_code" });
      device.user = { id: `user-${body.email}`, email: body.email };
      return respond(200, { ok: true, user: device.user });
    }
    if (path === "auth/signout") { device.user = null; return respond(200, { ok: true }); }
    if (!device.user) return respond(401, { error: "unauthorized" });
    if (path === "account" && req.method() === "DELETE") { device.user = null; return respond(200, { ok: true }); }
    if (path === "sync" && req.method() === "GET") return respond(200, { ok: true, stores: {} });
    if (/^sync\/\w+$/.test(path) && req.method() === "PUT") return respond(200, { ok: true, state: body.state });
    return respond(404, { error: "not_found" });
  });
  const page = await ctx.newPage();
  return { ctx, page, device };
}

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const gate = (page) => page.getByRole("heading", { name: "Create your free account" });
/** Sign in on the sign-in screen with an email code. */
async function emailSignIn(page, email) {
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Your email address").fill(email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

await step("a first visit: the welcome cover promises a free account (not 'No account needed'), and Get started leads to the sign-in screen, which can't be skipped", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Get started" }).waitFor();
  const cover = await page.locator("main").innerText();
  expect(cover.includes("Free account") && !cover.includes("No account needed") && !cover.includes("Stays on your phone"), "the cover's promises: " + cover.slice(0, 400).replace(/\n/g, " | "));
  expect(!(await page.getByRole("button", { name: "Already have an account? Sign in" }).count()), "no separate sign-in link: Get started signs in too");
  await page.getByRole("button", { name: "Get started" }).click();
  await gate(page).waitFor();
  const screen = await page.locator("main").innerText();
  expect(!/skip|not now|continue without|look around/i.test(screen), "nothing on the sign-in screen gets past it: " + screen.replace(/\n/g, " | "));
  expect(await page.getByRole("button", { name: "Continue with email" }).isVisible(), "email sign-in is offered");
  expect(!(await page.getByRole("navigation", { name: "Main" }).count()), "no tab bar");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Get started" }).waitFor();
  await ctx.close();
});

await step("signed out, every app page shows the sign-in screen instead (a restaurant, Settings, the shopping list), with no tab bar; the privacy, terms and support pages stay open", async () => {
  const { ctx, page, device } = await newPhone({ settings: onboarded });
  for (const path of ["/app", "/app/eat-out", "/app/chain?id=cluck-house", "/app/settings", "/app/groceries/list", "/app/recipes"]) {
    await page.goto(BASE + path);
    await gate(page).waitFor();
    expect(!(await page.getByRole("navigation", { name: "Main" }).count()), `no tab bar on ${path}`);
  }
  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms"], ["/support", "Support"]]) {
    await page.goto(BASE + path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const h = await page.getByRole("heading", { level: 1 }).first().innerText();
    expect(h.toLowerCase().includes(heading.toLowerCase().split(" ")[0]), `${path} opens: ${h}`);
  }
  const privacy = await (await page.goto(BASE + "/privacy")).text();
  expect(privacy.includes("You need a free account") && !privacy.includes("You don&#x27;t need an account") && !privacy.includes("You don't need an account"), "the privacy page says an account is needed");
  expect(!device.calls.some((c) => c.startsWith("PUT sync")), "nothing is synced while signed out");
  await ctx.close();
});

await step("signing in on the sign-in screen opens the page that was asked for, with the tab bar; a shared list's '#' is still there afterwards", async () => {
  const { ctx, page } = await newPhone({ settings: onboarded });
  await page.goto(BASE + "/app/eat-out");
  await gate(page).waitFor();
  await emailSignIn(page, "sam@example.com");
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  expect(new URL(page.url()).pathname === "/app/eat-out", "still on Eat out: " + page.url());
  expect(!(await gate(page).count()), "the sign-in screen is gone");
  await ctx.close();

  const second = await newPhone({ settings: onboarded });
  await second.page.goto(BASE + "/app/groceries/list/shared#1abc");
  await gate(second.page).waitFor();
  await emailSignIn(second.page, "kim@example.com");
  await second.page.getByRole("navigation", { name: "Main" }).waitFor();
  expect((await second.page.evaluate(() => location.hash)) === "#1abc", "the list's code is still in the address");
  await second.ctx.close();
});

await step("from the welcome cover: Get started, sign in, then the tour goes on", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started" }).click();
  await gate(page).waitFor();
  await emailSignIn(page, "new@example.com");
  await page.getByRole("heading", { name: "Hi, I'm Pip!" }).waitFor();
  await ctx.close();
});

await step("Settings › Account: Delete my account is a full-size button of its own; signing out or deleting the account brings the sign-in screen or the welcome cover back", async () => {
  const { ctx, page } = await newPhone({ settings: onboarded });
  await page.goto(BASE + "/app/settings");
  await gate(page).waitFor();
  await emailSignIn(page, "del@example.com");
  await page.getByRole("heading", { name: "Account" }).waitFor();
  const del = page.getByRole("button", { name: "Delete my account" });
  await del.scrollIntoViewIfNeeded();
  const box = await del.boundingBox();
  expect(box && box.height >= 44 && box.width >= 280, `the delete button is ${box?.width} x ${box?.height}`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await gate(page).waitFor();
  await emailSignIn(page, "del@example.com");
  await page.getByRole("heading", { name: "Account" }).waitFor();
  await page.getByRole("button", { name: "Delete my account" }).click();
  const sheet = page.getByRole("dialog");
  const text = await sheet.innerText();
  expect(text.includes("you'll need to create a new account") && !text.includes("without an account"), "the sheet says a new account is needed: " + text.replace(/\n/g, " | "));
  // a build that sells Premium through Apple (NEXT_PUBLIC_APP_PREMIUM=1 on the website): deleting the account can't cancel an App Store subscription, and the sheet says so
  if (process.env.NEXT_PUBLIC_APP_PREMIUM === "1") {
    expect(text.includes("Deleting your account doesn't cancel an App Store subscription"), "the sheet warns about App Store subscriptions");
    expect((await sheet.getByRole("link", { name: "Manage subscription" }).getAttribute("href")) === "https://apps.apple.com/account/subscriptions", "Manage subscription opens Apple's subscriptions page");
  }
  await sheet.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("button", { name: "Get started" }).waitFor();
  expect(new URL(page.url()).pathname.startsWith("/app/welcome"), "back on the welcome cover: " + page.url());
  await ctx.close();
});

await step("the sign-in screen: no axe violations, nothing off the side at 360 px with Extra large text", async () => {
  const { ctx, page } = await newPhone({ settings: JSON.stringify({ v: 1, data: { ...JSON.parse(onboarded).data, textSize: "xlarge" } }), width: 360 });
  await page.goto(BASE + "/app/eat-out");
  await gate(page).waitFor();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360), "nothing runs off the side");
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
  expect(v.length === 0, v.join(", "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
