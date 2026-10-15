// Sign-in and sync across devices (docs/ACCOUNTS_SYNC.md), through the real pages in a real browser. The backend is a fake that answers /api/v1/*
// in memory, but it uses the REAL merge rules (lib/mm/syncMerge.ts), so what two phones do to each other here is what they would do for real.
// Two phones are two separate browser contexts (their own storage); the "server" is shared.
//   BASE=http://localhost:3101 node account.mjs        (a production build; see README.md)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mergeStates, validateState } from "../lib/mm/syncMerge.ts";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

// ------------------------------------------------------------------------------------------------ the fake backend
const server = { rows: new Map(), emails: [], deleted: [], signedOut: 0, apiCalls: [] };
const rowsOf = (uid) => (server.rows.has(uid) ? server.rows.get(uid) : server.rows.set(uid, new Map()).get(uid));
const shopping = (uid) => Object.values(rowsOf(uid).get("shopping")?.items ?? {}).map((i) => i.v.name).sort();
const goneShopping = (uid) => Object.keys(rowsOf(uid).get("shopping")?.gone ?? {});

/** One phone's view of the server: whether it is signed in (stands in for the session cookies), and whether its network is down. */
function phone() {
  return { user: null, offline: false };
}

async function install(ctx, device) {
  await ctx.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
    server.apiCalls.push(`${req.method()} ${path}`);
    if (device.offline) return route.abort("internetdisconnected");
    const respond = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (path === "auth/session") return respond(200, { user: device.user });
    if (path === "auth/email/start") {
      server.emails.push(body.email);
      return respond(200, { ok: true });
    }
    if (path === "auth/email/verify") {
      if (body.code !== "123456") return respond(400, { error: "invalid_code", message: "That code isn't right, or it has run out. Ask for a new one." });
      device.user = { id: `user-${body.email}`, email: body.email };
      return respond(200, { ok: true, user: device.user });
    }
    if (path === "auth/signout") {
      device.user = null;
      server.signedOut++;
      return respond(200, { ok: true });
    }
    if (!device.user) return respond(401, { error: "unauthorized" });
    if (path === "account" && req.method() === "DELETE") {
      server.deleted.push(device.user.id);
      server.rows.delete(device.user.id);
      device.user = null;
      return respond(200, { ok: true });
    }
    if (path === "sync" && req.method() === "GET") return respond(200, { ok: true, stores: Object.fromEntries(rowsOf(device.user.id)) });
    const m = /^sync\/(\w+)$/.exec(path);
    if (m && req.method() === "PUT") {
      const sent = validateState(m[1], body.state);
      if (!sent) return respond(400, { error: "invalid_request" });
      const rows = rowsOf(device.user.id);
      const stored = rows.get(m[1]);
      const merged = stored ? mergeStates(m[1], stored, sent, Date.now()) : mergeStates(m[1], sent, sent, Date.now());
      rows.set(m[1], merged);
      return respond(200, { ok: true, state: merged });
    }
    return respond(404, { error: "not_found" });
  });
}

async function newPhone(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme: options.scheme ?? "light" });
  if (options.onboarded !== false) await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const device = phone();
  await install(ctx, device);
  const page = await ctx.newPage();
  return { ctx, page, device };
}

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const until = async (what, check, ms = 12000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`timed out waiting for: ${what}`);
};

/** Sign in through the sheet with an email code. */
async function signInWithEmail(page, email, code = "123456") {
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Account" }).waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await sheet.getByLabel("Your email address").fill(email);
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await sheet.getByLabel("6-digit code").fill(code);
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
}

const SIGNED_IN = (email) => (page) => page.getByText(email, { exact: true }).waitFor();

await step("no account: nothing about sign-in or sync is ever sent, and Settings offers Sign in", async () => {
  const { ctx, page } = await newPhone();
  await page.goto(BASE + "/app");
  await page.goto(BASE + "/app/groceries/list");
  await page.getByPlaceholder("Add something, e.g. milk").fill("Milk");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Account" }).waitFor();
  await page.getByText("Sign in to keep your saved meals, shopping list and settings on all your devices.").waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await new Promise((r) => setTimeout(r, 3500)); // longer than the sync delay
  expect(server.apiCalls.length === 0, `the server was called without an account: ${server.apiCalls.join(", ")}`);
  await ctx.close();
});

await step("email code: a wrong code says so, the right one signs in, the account shows who", async () => {
  const { ctx, page } = await newPhone();
  const seen = async (what, loc) => { try { await loc.waitFor({ timeout: 6000 }); } catch { throw new Error(`never saw: ${what}`); } };
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await seen("the intro", sheet.getByText("You don't need an account to use Numbite."));
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await sheet.getByLabel("Your email address").fill("not an address");
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await seen("the bad-address message", sheet.getByText("That doesn't look like an email address."));
  await sheet.getByLabel("Your email address").fill("Person@Example.com");
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await seen("the code step", sheet.getByText("We've sent a 6-digit code to Person@Example.com."));
  expect(server.emails.at(-1) === "Person@Example.com", "the address was sent to the server");
  await sheet.getByLabel("6-digit code").fill("000000");
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
  await seen("the wrong-code message", sheet.getByText("That code isn't right, or it has run out. Ask for a new one."));
  await sheet.getByLabel("6-digit code").fill("123456");
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
  await seen("who is signed in", page.getByText("Person@Example.com", { exact: true }));
  await seen("Sign out", page.getByRole("button", { name: "Sign out" }));
  await seen("Delete my account", page.getByRole("button", { name: "Delete my account" }));
  await ctx.close();
});

await step("two phones: what one saves reaches the other, a removal reaches back, and offline changes wait for the network", async () => {
  const a = await newPhone();
  const b = await newPhone();
  const email = "sync@example.com";
  const uid = `user-${email}`;

  await signInWithEmail(a.page, email);
  await a.page.getByText(email, { exact: true }).waitFor();
  await a.page.goto(BASE + "/app/groceries/list");
  await a.page.getByPlaceholder("Add something, e.g. milk").fill("Milk");
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await until("A's Milk reaches the server", async () => shopping(uid).includes("Milk"));

  await signInWithEmail(b.page, email);
  await b.page.getByText(email, { exact: true }).waitFor();
  await b.page.goto(BASE + "/app/groceries/list");
  await b.page.getByText("Milk", { exact: true }).first().waitFor({ timeout: 12000 }); // B had nothing: it arrives by itself

  await b.page.getByRole("button", { name: "One fewer Milk" }).click(); // B removes it
  await until("B's removal reaches the server", async () => goneShopping(uid).length === 1 && shopping(uid).length === 0);
  await a.page.goto(BASE + "/app/groceries/list");
  await a.page.getByText("Nothing on your list yet", { exact: false }).first().waitFor({ timeout: 12000 }).catch(async () => {
    // wording of the empty list may differ: what matters is that Milk is gone from A
  });
  await until("A no longer has Milk", async () => (await a.page.getByText("Milk", { exact: true }).count()) === 0);

  // offline: A adds Eggs with no network; the phone keeps it; it goes up when the network is back
  a.device.offline = true;
  await a.page.getByPlaceholder("Add something, e.g. milk").fill("Eggs");
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await new Promise((r) => setTimeout(r, 4000));
  expect(!shopping(uid).includes("Eggs"), "nothing reached the server while offline");
  expect((await a.page.getByText("Eggs", { exact: true }).count()) >= 1, "the phone still shows Eggs");
  a.device.offline = false;
  await a.page.goto(BASE + "/app/settings"); // coming back to the app syncs
  await a.page.getByRole("button", { name: "Sync now" }).click();
  await until("Eggs reaches the server after the network is back", async () => shopping(uid).includes("Eggs"));
  await a.ctx.close();
  await b.ctx.close();
});

await step("sign out keeps the data on the phone; deleting the account deletes the synced data and nothing else", async () => {
  const { ctx, page, device } = await newPhone();
  const email = "leaving@example.com";
  const uid = `user-${email}`;
  await signInWithEmail(page, email);
  await page.getByText(email, { exact: true }).waitFor();
  await page.goto(BASE + "/app/groceries/list");
  await page.getByPlaceholder("Add something, e.g. milk").fill("Bread");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await until("Bread synced", async () => shopping(uid).includes("Bread"));

  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByText("Signed out. Your data stays on this device.").waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  expect(device.user === null && server.signedOut >= 1, "the server was told");
  await page.goto(BASE + "/app/groceries/list");
  await page.getByText("Bread", { exact: true }).first().waitFor();

  await signInWithEmail(page, email);
  await page.getByText(email, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Delete my account" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("This can't be undone.").waitFor();
  await sheet.getByRole("button", { name: "Delete my account" }).click();
  await page.getByText("Your account has been deleted. Your data stays on this device.").waitFor();
  expect(server.deleted.includes(uid) && !server.rows.has(uid), "the account and its synced rows are gone from the server");
  await page.goto(BASE + "/app/groceries/list");
  await page.getByText("Bread", { exact: true }).first().waitFor(); // still on this phone, as plain device data
  await ctx.close();
});

await step("Clear data on this device while signed in signs out of the account and leaves the account's data alone", async () => {
  const { ctx, page, device } = await newPhone();
  const email = "clearing@example.com";
  const uid = `user-${email}`;
  await signInWithEmail(page, email);
  await page.getByText(email, { exact: true }).waitFor();
  await page.goto(BASE + "/app/groceries/list");
  await page.getByPlaceholder("Add something, e.g. milk").fill("Rice");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await until("Rice synced", async () => shopping(uid).includes("Rice"));
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Clear data on this device" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("This also signs you out of your account on this device.").waitFor();
  await sheet.getByRole("button", { name: "Clear everything" }).click();
  await until("signed out here", async () => device.user === null);
  await new Promise((r) => setTimeout(r, 3500));
  expect(shopping(uid).includes("Rice") && goneShopping(uid).length === 0, "clearing this phone did not delete anything in the account");
  await ctx.close();
});

await step("a new phone's welcome screen offers 'Already have an account? Sign in', and settings from the account skip the questions", async () => {
  const seed = await newPhone();
  const email = "welcome@example.com";
  await signInWithEmail(seed.page, email); // an account that has been set up (its settings are synced)
  await seed.page.getByText(email, { exact: true }).waitFor();
  await until("settings reached the server", async () => rowsOf(`user-${email}`).has("settings"));
  await seed.ctx.close();

  const fresh = await newPhone({ onboarded: false });
  await fresh.page.goto(BASE + "/app");
  await fresh.page.waitForURL(/\/app\/welcome/);
  await fresh.page.getByRole("button", { name: "Continue" }).click();
  await fresh.page.getByRole("button", { name: "Get started" }).waitFor();
  await fresh.page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  const sheet = fresh.page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await sheet.getByLabel("Your email address").fill(email);
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await sheet.getByLabel("6-digit code").fill("123456");
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
  await fresh.page.waitForURL((u) => !u.pathname.startsWith("/app/welcome"), { timeout: 15000 }); // no questions: the account already has its settings
  await fresh.ctx.close();
});

for (const scheme of ["light", "dark"]) {
  await step(`accessibility (${scheme}): the account section and every step of the sign-in sheet have no axe violations`, async () => {
    const { ctx, page } = await newPhone({ scheme });
    const scan = async (what) => {
      // wait for the sheet's slide and any fade to end (never the endless ones), so axe judges the colours people see
      await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
      await page.addScriptTag({ path: AXE });
      const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
      expect(result.violations.length === 0, `${what}: ${result.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`);
    };
    await page.goto(BASE + "/app/settings");
    await page.getByRole("heading", { name: "Account" }).waitFor();
    await scan("signed out");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Continue with email" }).waitFor();
    await scan("sheet: choose");
    await sheet.getByRole("button", { name: "Continue with email" }).click();
    await sheet.getByLabel("Your email address").fill("a11y@example.com");
    await scan("sheet: email");
    await sheet.getByRole("button", { name: "Send me a code" }).click();
    await sheet.getByLabel("6-digit code").waitFor();
    await scan("sheet: code");
    await sheet.getByLabel("6-digit code").fill("123456");
    await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByText("a11y@example.com", { exact: true }).waitFor();
    await scan("signed in");
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
