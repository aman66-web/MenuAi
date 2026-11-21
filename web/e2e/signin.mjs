// Everyone signs in (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts SIGN_IN_REQUIRED, lib/mm/signInGate.ts).
// Since the seven-screen onboarding of 20 November 2026 (founder) the account is the welcome steps' last one, step 8 of 8 ("Save your plan"), after Your plan,
// and then straight to Home; the cover's
// link opens it at once ("Welcome back. Sign in"); a page of the app reached signed out keeps "Sign in or sign up". "Look around first" is gone. A new account
// keeps what was typed; an account's own settings win.
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

// founder 2026-11-18: one screen that says it is for signing in and signing up; its heading follows how it was reached (the onboarding meeting, 19 November)
const gate = (page) => page.getByRole("heading", { name: "Sign in or sign up" });
const setupGate = (page) => page.getByRole("heading", { name: "Save your plan" });
const backGate = (page) => page.getByRole("heading", { name: "Welcome back. Sign in" });
/** Get started on the cover: the first question (step 1 of 8, heard with the headline; no hello screen, no tour, no fork since 20 November). */
async function toQuestions(page) {
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("heading", { name: "What's your goal?" }).waitFor();
}
/** From the foods to avoid on: the shops (none), the recipes, Skip on About you, to Your plan with the starting numbers. */
async function toPlanFromAvoid(page) {
  await page.getByRole("button", { name: "Nothing to avoid" }).click();
  await page.getByRole("heading", { name: /^Where do you shop\?/ }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { level: 1, name: /^Recipes/ }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: /^About you/ }).waitFor();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("heading", { name: /^Your plan/ }).waitFor();
}
/** Your plan's Change: the calories typed and saved. */
async function changeCalories(page, kcal) {
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.locator("#plan-calories").fill(String(kcal));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).waitFor();
}
/** From Your plan: "Save my numbers", to the account step. */
async function toAccount(page) {
  await page.getByRole("button", { name: "Save my numbers" }).click();
  await setupGate(page).waitFor();
}
/** "Step n of N", heard with the step's headline (never written on screen). */
const heardStep = (page, n, total) => page.getByRole("heading", { level: 1, name: new RegExp(`\\s*, Step ${n} of ${total}$`) }).waitFor();
const settingsOn = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") || "null")?.data ?? null);
/** Sign in on the sign-in screen with an email code: "What's your email?", Continue, then "Enter the code", which goes on by itself with the sixth digit. */
async function emailSignIn(page, email) {
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("What's your email?").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Enter the code").fill("123456");
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

await step("a first visit: the cover says which numbers and 'No ads, no tracking'; Get started goes on to the steps without an account; the account is step 8 of 8, 'Save your plan', and can't be skipped; Back returns to Your plan", async () => {
  const { ctx, page, device } = await newPhone();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Get started" }).waitFor();
  const cover = await page.locator("main").innerText();
  // the onboarding meeting, 19 November (change 13): "Calories and protein · Every menu free · No ads, no tracking" in the build where everyone signs in
  expect(cover.includes("Calories and protein") && cover.includes("Every menu free") && cover.includes("No ads, no tracking") && !cover.includes("No account needed") && !cover.includes("Stays on your phone"), "the cover's promises: " + cover.slice(0, 400).replace(/\n/g, " | "));
  await toQuestions(page);
  expect(!(await gate(page).count()) && !(await setupGate(page).count()), "no sign-in before the steps");
  await heardStep(page, 1, 8);
  await page.getByRole("button", { name: "Skip", exact: true }).click(); // the goal
  await page.getByRole("heading", { name: /^Anything you avoid\?/ }).waitFor();
  await toPlanFromAvoid(page);
  await toAccount(page);
  await heardStep(page, 8, 8);
  const screen = await page.locator("main").innerText();
  expect(!/skip|not now|continue without|look around|optional/i.test(screen), "nothing on the sign-in screen gets past it: " + screen.replace(/\n/g, " | "));
  // founder 2026-11-20: one short grey line and one small line with the Privacy link; no "New here?", no Face ID line, no long list; white space, no Pip
  // (he stands, small, on step 1 only: the review of 20 November evening)
  expect(!(await page.locator("main svg.pip").count()), "Pip is on the account step");
  expect(screen.includes("Free, and it keeps your plan safe on any phone.") && screen.includes("We keep your email and what you save. No ads, no tracking.") && !/New here|Face ID|Never your sex/.test(screen), "the reason and the promise: " + screen.replace(/\n/g, " | "));
  expect(await page.getByRole("link", { name: "Privacy" }).isVisible(), "the Privacy link beside the promise");
  for (const way of ["Continue with Apple", "Continue with Google", "Continue with email"]) expect(await page.getByText(way, { exact: true }).isVisible(), `${way} is offered`);
  expect(!(await page.getByRole("navigation", { name: "Main" }).count()), "no tab bar");
  expect(!device.calls.some((c) => c.startsWith("PUT sync")), "nothing is sent before signing in");
  // Back returns to Your plan
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await page.getByRole("heading", { name: /^Your plan/ }).waitFor();
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
  await backGate(page).waitFor();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Get started" }).waitFor();
  await link.click();
  await backGate(page).waitFor();
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

await step("'Continue with email' is two screens of one question each: 'What's your email?' (the address typed big in the middle, the keyboard up, Continue), then 'Enter the code' (the address, six places that go on by themselves, the countdown to 'Send it again'); Back and Help at the top; nothing else", async () => {
  const { ctx, page, device } = await newPhone({ settings: onboarded });
  await page.goto(BASE + "/app/eat-out");
  await gate(page).waitFor();
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByRole("heading", { name: "What's your email?" }).waitFor();
  const box = page.getByLabel("What's your email?");
  const typing = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.getAttribute("type")} ${a.getAttribute("autocomplete")}` : ""; });
  expect(typing === "email email", "the email box has the focus, so the keyboard is up: " + typing);
  let text = await page.locator("main").innerText();
  expect(text.includes("We'll send you a code.") && !/Apple|Google|Terms|Pip|password/i.test(text), "only the question, its line, the box and Continue: " + text.replace(/\n/g, " | "));
  expect(await page.getByRole("link", { name: "Help", exact: true }).isVisible(), "Help at the top right");
  await box.fill("joan");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("That doesn't look like an email address.").waitFor();
  await box.fill("joan.smith@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Enter the code" }).waitFor();
  const code = page.getByLabel("Enter the code");
  expect(await code.evaluate((el) => el === document.activeElement && el.getAttribute("inputmode") === "numeric" && el.getAttribute("autocomplete") === "one-time-code"), "the code box has the focus, numbers only, with the phone's code from Mail");
  expect((await page.locator("main strong", { hasText: "joan.smith@example.com" }).count()) === 1, "the address is shown, in bold");
  text = await page.locator("main").innerText();
  expect(text.includes("Sent to joan.smith@example.com") && /You can ask for a new code in \d+ seconds/.test(text) && !/Junk|Use a different email|Send a new code|Sign in/.test(text), "the code screen: " + text.replace(/\n/g, " | "));
  // a wrong code goes by itself with the sixth digit, says so and empties the six places
  await code.fill("000000");
  // short: the countdown and "Send it again" say the rest (the 20 November review)
  await page.getByText("That code isn't right.", { exact: true }).waitFor();
  expect((await code.inputValue()) === "", "the six places are empty again");
  // Back: the address is still there, and going on with it while its code is new sends no second email
  const sends = device.calls.filter((c) => c === "POST auth/email/start").length;
  await page.getByRole("button", { name: "Back", exact: true }).click();
  expect((await box.inputValue()) === "joan.smith@example.com", "the address is kept");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Enter the code" }).waitFor();
  expect(device.calls.filter((c) => c === "POST auth/email/start").length === sends, "no second email inside the minute");
  // a paste of the email's sentence fills all six and goes on
  await code.fill("Your code is 123456.");
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  await ctx.close();
});

await step("a new account made at the account step keeps the goal, targets and diet typed on this phone, goes straight to Home ('You're signed in. Your goal and daily numbers are saved.'), and never hears that signing in is optional", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app/welcome");
  await toQuestions(page);
  await page.getByRole("radio", { name: /^Build muscle/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await toPlanFromAvoid(page);
  await changeCalories(page, 2300);
  await toAccount(page);
  await emailSignIn(page, "new@example.com");
  await page.waitForURL((u) => /^\/app\/?$/.test(new URL(u).pathname), { timeout: 15000 });
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  await page.getByText("You're signed in. Your goal and daily numbers are saved.").waitFor();
  expect(!(await page.getByRole("heading", { name: "You're all set!" }).count()), "'You're all set!' is back");
  expect(!(await page.locator("main").innerText()).includes("It's optional"), "Home calls signing in optional to someone who had to sign in");
  const kept = await settingsOn(page);
  expect(kept?.goal === "buildMuscle" && kept?.dailyCalories === 2300 && kept?.hasSetTargets === true && kept?.hasCompletedOnboarding === true, "what was typed is kept: " + JSON.stringify(kept));
  await until("the typed settings reached the new account", async () => {
    const v = rowsOf("user-new@example.com").get("settings")?.v;
    return v?.goal === "buildMuscle" && v?.dailyCalories === 2300 && v?.hasCompletedOnboarding === true;
  });
  await ctx.close();
});

await step("an account already set up, signed in at the account step on a new phone, goes straight to the app with its own settings: what was typed never overwrites them", async () => {
  const email = "keep@example.com";
  const first = await newPhone({ settings: onboarded }); // maintain, 2,000 kcal
  await first.page.goto(BASE + "/app/eat-out");
  await gate(first.page).waitFor();
  await emailSignIn(first.page, email);
  await first.page.getByRole("navigation", { name: "Main" }).waitFor();
  await until("the settings reached the account", async () => rowsOf(`user-${email}`).has("settings"));
  await first.ctx.close();

  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app/welcome");
  await toQuestions(page);
  await page.getByRole("radio", { name: /^Lose weight/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await toPlanFromAvoid(page);
  await changeCalories(page, 1600);
  await toAccount(page);
  await emailSignIn(page, email);
  await page.waitForURL((u) => !new URL(u).pathname.startsWith("/app/welcome"), { timeout: 15000 });
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  await page.getByText("Signed in. Your saved settings are back.").waitFor();
  const mine = await settingsOn(page);
  expect(mine?.goal === "maintain" && mine?.dailyCalories === 2000 && mine?.hasCompletedOnboarding === true, "the account's own settings on the new phone: " + JSON.stringify(mine));
  await page.waitForTimeout(3000); // a sync's worth
  const theirs = rowsOf(`user-${email}`).get("settings")?.v;
  expect(theirs?.goal === "maintain" && theirs?.dailyCalories === 2000, "the account's settings were overwritten: " + JSON.stringify(theirs));
  await ctx.close();
});

await step("someone who leaves part-way comes back to the welcome cover on the next start (not a bare sign-in screen), with 'Carry on from step 2' and 'Start again'", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await toQuestions(page);
  await page.getByRole("radio", { name: /^Maintain/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Anything you avoid?" }).waitFor();
  // the app is closed and opened again
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await page.getByRole("button", { name: "Carry on from step 2" }).waitFor();
  await page.getByRole("button", { name: "Start again" }).waitFor();
  expect(!(await gate(page).count()), "a bare sign-in screen instead of the welcome screens");
  await page.getByRole("button", { name: "Carry on from step 2" }).click();
  await page.getByRole("heading", { name: "Anything you avoid?" }).waitFor();
  await ctx.close();
});

await step("signed in at a page's gate (a link) with nothing set up: the next plain start runs the signed-in steps, step 1 of 7, and ends with 'Save and go to Home'", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app/eat-out");
  await gate(page).waitFor();
  await emailSignIn(page, "link@example.com");
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await toQuestions(page);
  await heardStep(page, 1, 7);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await toPlanFromAvoid(page);
  await page.getByRole("button", { name: "Save and go to Home" }).click();
  await page.waitForURL((u) => /^\/app\/?$/.test(new URL(u).pathname), { timeout: 15000 });
  expect((await settingsOn(page))?.hasCompletedOnboarding === true, "set up after the signed-in run");
  await ctx.close();
});

await step("Settings › Account: Delete my account is a full-size button of its own; signing out goes to the welcome screen and signing in again goes straight to Home ('Signed in. Your saved settings are back.'); deleting the account goes to the cover with its line, and Get started to 'Welcome back. Sign in'", async () => {
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
  // set up on this phone and signed out: Get started is the way back in, headed "Welcome back. Sign in"
  await page.getByRole("button", { name: "Get started" }).click();
  await backGate(page).waitFor();
  await emailSignIn(page, "del@example.com");
  await page.waitForURL((u) => /^\/app\/?$/.test(new URL(u).pathname));
  expect(!(await page.getByRole("heading", { name: "What's your goal?" }).count()), "no steps for someone signing back in");
  await page.getByText("Signed in. Your saved settings are back.").waitFor();
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
  expect(new URL(page.url()).pathname.startsWith("/app/welcome") && new URL(page.url()).searchParams.get("deleted") === "1", "back on the welcome cover: " + page.url());
  await page.getByRole("status").filter({ hasText: "Your account has been deleted. What was on this phone is still here." }).waitFor();
  // what was on the phone is still there (set up): Get started is the way in again, "Welcome back. Sign in", where a new account keeps it
  await page.getByRole("button", { name: "Get started" }).click();
  await backGate(page).waitFor();
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
