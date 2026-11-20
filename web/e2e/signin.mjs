// Everyone signs in (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts SIGN_IN_REQUIRED, lib/mm/signInGate.ts).
// The backend is a fake that answers /api/v1/* in memory (like account.mjs). Run on a build with the requirement on:
//   NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_SIGN_IN_REQUIRED=1 npm run build && npm start -- -p 3101 &
//   BASE=http://localhost:3101 node e2e/signin.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mergeStates, validateState } from "../lib/mm/syncMerge.ts";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
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
const onboarded = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

// What each account has synced (store name → state), shared by every phone and merged with the real rules (lib/mm/syncMerge.ts, as in account.mjs), so a second
// phone that signs in to an account gets what the first one sent.
const accounts = new Map();
const rowsOf = (uid) => (accounts.has(uid) ? accounts.get(uid) : accounts.set(uid, new Map()).get(uid));

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
    if (path === "account" && req.method() === "DELETE") { accounts.delete(device.user.id); device.user = null; return respond(200, { ok: true }); }
    if (path === "sync" && req.method() === "GET") return respond(200, { ok: true, stores: Object.fromEntries(rowsOf(device.user.id)) });
    const m = /^sync\/(\w+)$/.exec(path);
    if (m && req.method() === "PUT") {
      const sent = validateState(m[1], body.state);
      if (!sent) return respond(400, { error: "invalid_request" });
      const rows = rowsOf(device.user.id);
      const stored = rows.get(m[1]);
      const merged = mergeStates(m[1], stored ?? sent, sent, Date.now());
      rows.set(m[1], merged);
      return respond(200, { ok: true, state: merged });
    }
    return respond(404, { error: "not_found" });
  });
  const page = await ctx.newPage();
  return { ctx, page, device };
}

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
/** Waits for a condition checked here in the test (not in the page), up to `ms`. */
async function until(what, check, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out waiting for: " + what);
}

// founder 2026-11-18: one screen that says it is for signing in and signing up
const gate = (page) => page.getByRole("heading", { name: "Sign in or sign up" });
/** Sign in on the sign-in screen with an email code. */
async function emailSignIn(page, email) {
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Your email address").fill(email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

// Only a build where everyone signs in can run this: on any other (the feature suites' builds and a dev server with sample data turn the requirement off) say so
// at once, instead of every step timing out.
{
  const { ctx, page } = await newPhone({ settings: onboarded });
  await page.goto(BASE + "/app/eat-out");
  const required = await Promise.race([gate(page).waitFor({ timeout: 60000 }).then(() => true), page.getByRole("navigation", { name: "Main" }).waitFor({ timeout: 60000 }).then(() => false)]).catch(() => false);
  await ctx.close();
  if (!required) {
    console.log("This build doesn't ask everyone to sign in, so signin.mjs can't run on it: build with NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_SIGN_IN_REQUIRED=1 (see the top of this file).");
    await browser.close();
    process.exit(1);
  }
}

await step("a first visit: the welcome cover says which numbers and 'No ads, no tracking' (not 'No account needed'), and Get started leads to the sign-in screen, which can't be skipped", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Get started" }).waitFor();
  const cover = await page.locator("main").innerText();
  // the onboarding meeting, 19 November (change 13): "Calories and protein · Every menu free · No ads, no tracking" in the build where everyone signs in
  expect(cover.includes("Calories and protein") && cover.includes("Every menu free") && cover.includes("No ads, no tracking") && !cover.includes("No account needed") && !cover.includes("Stays on your phone"), "the cover's promises: " + cover.slice(0, 400).replace(/\n/g, " | "));
  await page.getByRole("button", { name: "Get started" }).click();
  await gate(page).waitFor();
  const screen = await page.locator("main").innerText();
  expect(!/skip|not now|continue without|look around|optional/i.test(screen), "nothing on the sign-in screen gets past it: " + screen.replace(/\n/g, " | "));
  // onboarding review 2026-11-19 (change 12): one reason from Pip, and the promise in readable ink with what the account keeps (and never keeps)
  expect(screen.includes("First, your free account.") && /never your age, weight or height/i.test(screen) && screen.includes("No ads, no tracking."), "the reason and the promise: " + screen.replace(/\n/g, " | "));
  expect(!screen.includes("New here or coming back"), "no second 'new or returning' line under the heading");
  expect(await page.getByRole("button", { name: "Continue with email" }).isVisible(), "email sign-in is offered");
  expect(!(await page.getByRole("navigation", { name: "Main" }).count()), "no tab bar");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Get started" }).waitFor();
  await ctx.close();
});

// A reversal of 17 November (when the link was taken off because Get started signs in too): the onboarding meeting of 19 November (change 13) put
// "Already have an account? Sign in" back under Get started, because someone coming back on a new phone saw only "Get started". It opens the same one screen.
await step("the cover's 'Already have an account? Sign in' opens the sign-in screen (Back returns to the cover), and an account already set up goes straight to the app on a new phone", async () => {
  // an account that has been set up: its settings reach the server from the first phone
  const email = "back@example.com";
  const first = await newPhone({ settings: onboarded });
  await first.page.goto(BASE + "/app/eat-out");
  await gate(first.page).waitFor();
  await emailSignIn(first.page, email);
  await first.page.getByRole("navigation", { name: "Main" }).waitFor();
  await until("the settings reached the account", async () => rowsOf(`user-${email}`).has("settings"));
  await first.ctx.close();

  // a new phone: nothing stored, on the welcome cover
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started" }).waitFor();
  const link = page.getByRole("button", { name: "Already have an account? Sign in", exact: true });
  const box = await link.boundingBox();
  expect(box && box.height >= 44, `the link's tap area is ${box?.height} px tall`);
  await link.click();
  await gate(page).waitFor();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Get started" }).waitFor();
  await link.click();
  await gate(page).waitFor();
  await emailSignIn(page, email);
  // no questions: once the account's settings arrive the welcome screens hand over to the app
  await page.waitForURL((u) => !new URL(u).pathname.startsWith("/app/welcome"), { timeout: 15000 });
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  expect(!(await page.getByRole("heading", { name: "What's your goal?" }).count()), "the questions were asked again");
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
  expect(privacy.includes("They are never kept, synced or sent."), "the privacy page says the age, height and weight questions are never kept");
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

await step("the code step shows the typed address on its own line, who the email comes from, and to look in Junk", async () => {
  const { ctx, page } = await newPhone({ settings: onboarded });
  await page.goto(BASE + "/app/eat-out");
  await gate(page).waitFor();
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Your email address").fill("joan.smith@example.com");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("6-digit code").waitFor();
  const address = page.locator("main strong", { hasText: "joan.smith@example.com" });
  expect((await address.count()) === 1, "the address is shown");
  const lead = page.getByText("We've sent a 6-digit code to");
  const [a, l] = [await address.boundingBox(), await lead.boundingBox()];
  expect(a && l && a.y >= l.y + 4 && a.x <= l.x + 1, `the address sits on a line of its own under the lead: ${JSON.stringify({ a, l })}`);
  const text = await page.locator("main").innerText();
  expect(text.includes("noreply@numbite.com") && text.includes("Look in Junk or Spam."), "who it comes from and where else to look: " + text.replace(/\n/g, " | "));
  expect(await page.getByRole("button", { name: "Use a different email" }).isVisible() && await page.getByRole("button", { name: "Send a new code" }).isVisible(), "both ways out stay");
  await ctx.close();
});

await step("from the welcome cover: Get started, sign in, then the tour goes on; the targets say what the account keeps, and the last screen never calls signing in optional", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started" }).click();
  await gate(page).waitFor();
  await emailSignIn(page, "new@example.com");
  await page.getByRole("heading", { name: "Hi, I'm Pip!" }).waitFor();
  // on through the questions (the onboarding meeting, 19 November: changes 6 and 9)
  await page.getByRole("button", { name: "Show me around" }).click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page.getByRole("button", { name: "Set up my daily numbers" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Skip", exact: true }).click(); // the goal, the foods to avoid, the questions about the person
  await page.getByRole("heading", { name: "Your daily targets" }).waitFor();
  await page.getByText("Your sex, age, height, weight and activity aren't kept. Your daily numbers, goal, the foods you avoid and your shops are saved with your account.").waitFor();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Skip", exact: true }).click(); // the targets, the shops
  await page.getByRole("heading", { name: "You're all set!" }).waitFor();
  await page.getByRole("button", { name: "Go to Home" }).waitFor();
  expect(!(await page.locator("main").innerText()).includes("It's optional"), "the last screen calls signing in optional to someone who had to sign in");
  await ctx.close();
});

await step("Settings › Account: Delete my account is a full-size button of its own; signing out goes to the welcome screen and signing in again goes straight to Home; deleting the account goes to the welcome screen and a new account starts the tour", async () => {
  const { ctx, page } = await newPhone({ settings: onboarded });
  await page.goto(BASE + "/app/settings");
  await gate(page).waitFor();
  await emailSignIn(page, "del@example.com");
  await page.getByRole("heading", { name: "Account" }).waitFor();
  const del = page.getByRole("button", { name: "Delete my account" });
  await del.scrollIntoViewIfNeeded();
  const box = await del.boundingBox();
  expect(box && box.height >= 44 && box.width >= 280, `the delete button is ${box?.width} x ${box?.height}`);
  // signing out goes back to the welcome screen, keeping the account; signing in again from there goes straight to the app (no tour)
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Get started" }).waitFor();
  expect(new URL(page.url()).pathname.startsWith("/app/welcome"), "signed out onto the welcome screen: " + page.url());
  await page.getByRole("button", { name: "Get started" }).click();
  await gate(page).waitFor();
  await emailSignIn(page, "del@example.com");
  await page.waitForURL((u) => /^\/app\/?$/.test(new URL(u).pathname));
  expect(!(await page.getByRole("heading", { name: "Hi, I'm Pip!" }).count()), "no tour for someone signing back in");
  await page.goto(BASE + "/app/settings");
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
  // a new account after the deletion starts the setup from the beginning
  await page.getByRole("button", { name: "Get started" }).click();
  await gate(page).waitFor();
  await emailSignIn(page, "fresh@example.com");
  await page.getByRole("heading", { name: "Hi, I'm Pip!" }).waitFor();
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
