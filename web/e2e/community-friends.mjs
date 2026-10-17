// Community's friends and shared shopping lists (founder 2026-10-16: "add a friend and more, you can add a friend and send them shopping lists"), through the real pages in a
// real browser, with TWO PEOPLE: each phone is its own browser context (its own storage); the "server" behind /api/v1/community is the REAL handler code (lib/community/handlers.ts)
// on in-memory tables (tests/helpers/communityServer.ts, loaded here through Vite), so the username rules, the one neutral answer for a code that can't be added, the limits and who
// may send to whom are the server's own. Sign-in and sync are faked like e2e/account.mjs (the real merge rules for sync).
//   BASE=http://localhost:3104 node community-friends.mjs        (a dev or production build; needs the sample data on: see README.md)
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { mergeStates, validateState } from "../lib/mm/syncMerge.ts";
import { createServer } from "../node_modules/vite/dist/node/index.js";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const ROOT = new URL("..", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const vite = await createServer({ root: ROOT, configFile: false, logLevel: "silent", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
const { communityWorld } = await vite.ssrLoadModule("/tests/helpers/communityServer.ts");
const { encodeEntries: encodeEntriesFn } = await vite.ssrLoadModule("/lib/mm/shareList.ts");

let passed = 0, failed = 0;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // ONLY="offline|decline" runs only the steps whose name matches
async function step(name, fn) { if (ONLY && !ONLY.test(name)) return; try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 8).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const until = async (what, check, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await new Promise((r) => setTimeout(r, 120)); }
  throw new Error(`timed out waiting for: ${what}`);
};

// ------------------------------------------------------------------------------------------------ the fake backend
const hex = (n) => n.toString(16).padStart(12, "0");
const NAMES = ["ana", "ben", "cleo", "dev", "eve", "zed"];
const uid = (name) => `20000000-0000-4000-8000-${hex(NAMES.indexOf(name) + 1)}`;
const emailOf = (name) => `${name}@example.com`;
const LOAF = { shopId: "sainsburys-multiseed-loaf--taste-the-difference-800g", name: "Sainsbury's Multiseed Loaf Bread, Taste the Difference 800g" };

/** The shared state of one scene: the Community world, what sync stored, and every call any phone made. */
function scene() {
  return { world: communityWorld(), rows: new Map(), calls: [], responses: [], syncBodies: [] };
}

async function install(ctx, sc, device) {
  await ctx.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/v1\//, "");
    const method = req.method();
    const raw = req.postData();
    const body = raw ? JSON.parse(raw) : null;
    sc.calls.push({ who: device.name, method, path, body: raw });
    if (device.offline) return route.abort("internetdisconnected");
    const respond = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path === "auth/session") return respond(200, { user: device.user });
    if (path === "auth/email/start") return respond(200, { ok: true });
    if (path === "auth/email/verify") {
      if (body.code !== "123456") return respond(400, { error: "invalid_code" });
      const name = String(body.email).split("@")[0];
      device.user = { id: uid(name), email: body.email };
      return respond(200, { ok: true, user: device.user });
    }
    if (path === "auth/signout") { device.user = null; return respond(200, { ok: true }); }
    if (!device.user) return respond(401, { error: "unauthorized" });
    if (path === "account" && method === "DELETE") {
      sc.world.mem.deleteUser(device.user.id); // ON DELETE CASCADE: every Community row of the account goes with it
      sc.rows.delete(device.user.id);
      device.user = null;
      return respond(200, { ok: true });
    }
    if (path.startsWith("community/")) {
      if (device.hold && method === "POST") await device.hold; // a slow answer, released by the test
      const forced = device.force.find((f) => f.method === method && path.startsWith(f.path) && (f.times === undefined || f.times > 0));
      if (forced) { if (forced.times !== undefined) forced.times--; sc.responses.push({ who: device.name, path, status: forced.status, body: JSON.stringify(forced.body) }); return respond(forced.status, forced.body); }
      const r = await sc.world.handle(device.user.id, method, path, body ?? undefined);
      sc.responses.push({ who: device.name, path, status: r.status, body: JSON.stringify(r.body) });
      return respond(r.status, r.body);
    }
    const rows = sc.rows.get(device.user.id) ?? sc.rows.set(device.user.id, new Map()).get(device.user.id);
    if (path === "sync" && method === "GET") return respond(200, { ok: true, stores: Object.fromEntries(rows) });
    const m = /^sync\/(\w+)$/.exec(path);
    if (m && method === "PUT") {
      sc.syncBodies.push(raw);
      const sent = validateState(m[1], body.state);
      if (!sent) return respond(400, { error: "invalid_request" });
      const stored = rows.get(m[1]);
      const merged = stored ? mergeStates(m[1], stored, sent, Date.now()) : mergeStates(m[1], sent, sent, Date.now());
      rows.set(m[1], merged);
      return respond(200, { ok: true, state: merged });
    }
    return respond(404, { error: "not_found" });
  });
}

/** A share-link code for a short list: what a phone would send. */
const encodeLoaf = () => {
  const entries = [{ retailer: "own", kind: "typed", code: "Milk", qty: 1 }];
  return encodeEntriesFn(entries).payload;
};
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };

/** One person's phone. `signedIn`: already signed in (the account is remembered on the phone and the server knows the session). */
async function phone(sc, name, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", permissions: ["clipboard-read", "clipboard-write"],
  });
  const device = { name, user: null, offline: false, force: [], hold: null };
  const user = opts.signedIn === false ? null : { id: uid(name), email: emailOf(name) };
  if (user) device.user = user;
  const seed = { settings: { v: 1, data: { ...baseSettings, ...(opts.settings ?? {}) } }, account: user ? { v: 1, data: user } : null, shopping: opts.shopping ? { v: 1, data: opts.shopping } : null, extra: opts.extra ?? {} };
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", JSON.stringify(s.settings));
    if (s.account) localStorage.setItem("mm.v1.account", JSON.stringify(s.account));
    if (s.shopping) localStorage.setItem("mm.v1.shopping", JSON.stringify(s.shopping));
    for (const [k, v] of Object.entries(s.extra)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  await install(ctx, sc, device);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  return { ctx, page, device, errors, name };
}

// direct calls to the server as a person (to set a scene up without driving the UI)
const call = (sc, name, method, path, body) => sc.world.handle(uid(name), method, path, body);
async function join(sc, name, username = `${name}${name === "ben" ? "99" : ".cooks"}`) {
  const r = await call(sc, name, "PUT", "community/me", { username });
  if (r.status !== 201) throw new Error(`join ${name}: ${JSON.stringify(r.body)}`);
  return r.body.profile;
}
async function makeFriends(sc, a, b, profileOfB) {
  const asked = await call(sc, a, "POST", "community/friends/request", { code: profileOfB.friendCode });
  if (asked.status !== 201) throw new Error("request " + JSON.stringify(asked.body));
  const incoming = (await call(sc, b, "GET", "community/friends")).body.incoming;
  const ok = await call(sc, b, "POST", "community/friends/respond", { id: incoming[0].id, accept: true });
  if (ok.status !== 200) throw new Error("respond " + JSON.stringify(ok.body));
}
const friendIdOf = async (sc, name) => (await call(sc, name, "GET", "community/friends")).body.friends[0].id;

const SHOPPING = [
  { gtin: "", shopId: LOAF.shopId, retailer: "sainsburys", name: LOAF.name, brand: "", size: "", qty: 2, addedAt: "2026-10-16T08:00:00.000Z", price: 1.6 },
  { gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: "2026-10-16T08:01:00.000Z", custom: true },
  { gtin: "", retailer: "own", name: "Eggs", brand: "", size: "", qty: 1, addedAt: "2026-10-16T08:02:00.000Z", custom: true, done: true },
];

// ------------------------------------------------------------------------------------------------ small helpers
const go = async (page, path, heading) => { await page.goto(BASE + path, { timeout: 120000 }); if (heading) await page.getByRole("heading", { level: 1, name: heading }).first().waitFor({ timeout: 90000 }); };
const tabBar = (page) => page.getByRole("navigation", { name: "Main" });
const over = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const store = (page, key) => page.evaluate((k) => localStorage.getItem(k), key).catch(() => undefined); // undefined while the page is navigating
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
async function scan(page, what) {
  await settle(page);
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
  expect(result.violations.length === 0, `${what}: ${result.violations.map((v) => `${v.id} (${v.nodes.length}: ${v.nodes[0]?.html?.slice(0, 90)})`).join("; ")}`);
}
async function signInWithEmail(page, email) {
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Sign in" });
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await sheet.getByLabel("Your email address").fill(email);
  await sheet.getByRole("button", { name: "Send me a code" }).click();
  await sheet.getByLabel("6-digit code").fill("123456");
  await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet.waitFor({ state: "hidden", timeout: 15000 });
}
/** The "Choose a username" sheet, filled in. */
async function pickUsername(page, name) {
  const sheet = page.getByRole("dialog", { name: "Choose a username" });
  await sheet.getByLabel("Username").fill(name);
  await sheet.getByRole("button", { name: "Choose this username" }).click();
  await sheet.waitFor({ state: "hidden", timeout: 15000 });
}
const friendsHeading = (page) => page.getByRole("heading", { level: 1, name: "Friends", exact: true });
const codeBox = (page) => page.getByRole("textbox", { name: "Friend code" }); // (not getByLabel: the "Your friend code" card is also labelled that)
const addCode = async (page, text) => {
  await codeBox(page).fill(text);
  await page.getByRole("button", { name: "Add friend", exact: true }).click();
};
const status = (page) => page.locator("main [role=status], main [role=alert]");
/** The note at the top of Friends about what just happened (it stays a few seconds and the row it was about may be far down or gone): it must be on screen, and a screen reader must be told. */
async function toastSeen(page, text) {
  const note = page.locator("div.fixed[aria-hidden='true']", { hasText: text });
  await note.waitFor({ timeout: 8000 });
  const box = await note.boundingBox();
  expect(box.y >= 0 && box.y + box.height <= page.viewportSize().height, `the note "${text}" is off screen (y ${box.y}, ${box.height} high)`);
  expect((await page.getByRole("status").filter({ hasText: text }).count()) >= 1, `a screen reader is not told: ${text}`);
}
/** Where the keyboard focus is: the tag and text of the focused element. */
const focused = (page) => page.evaluate(() => { const e = document.activeElement; return e && e !== document.body ? `${e.tagName} ${(e.innerText || e.getAttribute("aria-label") || "").slice(0, 40)}` : "BODY"; });
const mainText = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

// ================================================================================================ steps

await step("signed out: the hub's two cards say they need an account, Friends and Shared with you show a sign-in prompt, and nothing at all is asked of the server", async () => {
  const sc = scene();
  const { ctx, page, errors } = await phone(sc, "ana", { signedIn: false });
  await go(page, "/app/community", "Community");
  const friends = page.locator("main a[href='/app/community/friends']");
  const inbox = page.locator("main a[href='/app/community/inbox']");
  await friends.waitFor();
  expect((await friends.innerText()).includes("Sign in to add friends"), "Friends card: " + (await friends.innerText()));
  expect((await inbox.innerText()).includes("Sign in to see lists from friends"), "Shared card: " + (await inbox.innerText()));
  for (const l of [friends, inbox]) { const b = await l.boundingBox(); expect(b.height >= 44, "card height " + b.height); }
  await expectBlogs(page);
  await friends.click();
  await friendsHeading(page).waitFor();
  await page.getByText("Sign in to add friends", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  expect((await mainText(page)).includes("Everything else in Numbite works without one."), "the prompt does not say the rest needs no account");
  await go(page, "/app/community/inbox", "Shared with you");
  await page.getByText("Sign in to see lists from friends").first().waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  expect((await tabBar(page).getByRole("link", { name: /Community/ }).innerText()).trim() === "Community", "a badge shows while signed out");
  await new Promise((r) => setTimeout(r, 1500));
  expect(sc.calls.length === 0, "the server was called with nobody signed in: " + sc.calls.map((c) => c.method + " " + c.path).join(", "));
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
  async function expectBlogs(p) { await p.getByRole("heading", { level: 2, name: "Food blogs", exact: true }).waitFor(); expect((await p.locator('a[href^="/app/community/blog/view?id="]').count()) >= 3, "the food blogs are gone"); }
});

await step("sign in from the Friends page, choose a username (the rules and every error), and the friend code card appears with the code and the invite link", async () => {
  const sc = scene();
  const { ctx, page, errors } = await phone(sc, "ana", { signedIn: false });
  await go(page, "/app/community/friends", "Friends");
  await signInWithEmail(page, emailOf("ana"));
  // no username yet: the sheet opens by itself
  const sheet = page.getByRole("dialog", { name: "Choose a username" });
  await sheet.waitFor({ timeout: 20000 });
  const tries = [
    ["ab", /at least 3 characters/],
    ["ana cooks", /Use only letters, numbers, dots and underscores/],
    ["ana$", /Use only letters, numbers, dots and underscores/],
    [".ana", /can't start or end with a dot or an underscore/],
    ["ana_", /can't start or end with a dot or an underscore/],
    ["a..na", /two dots or underscores in a row/],
    ["numbite_ana", /isn't available/],
    ["admin", /isn't available/],
    ["f.u.c.k.you", /isn't available/],
  ];
  for (const [name, message] of tries) {
    await sheet.getByLabel("Username").fill(name);
    await sheet.getByRole("button", { name: "Choose this username" }).click();
    await sheet.getByRole("alert").filter({ hasText: message }).waitFor({ timeout: 8000 }).catch(() => { throw new Error(`"${name}" did not say ${message}`); });
  }
  expect((await sheet.getByLabel("Username").getAttribute("maxlength")) === "20", "the box allows more than 20 characters");
  await sheet.getByLabel("Username").fill("Ana.Cooks");
  await sheet.getByText("Your friends will see: ana.cooks").waitFor();
  await sheet.getByRole("button", { name: "Choose this username" }).click();
  await sheet.waitFor({ state: "hidden", timeout: 15000 });
  // the code card
  const profile = (await call(sc, "ana", "GET", "community/me")).body.profile;
  const card = page.locator('section[aria-labelledby="my-code"]');
  await card.waitFor();
  const shown = (await card.locator("p.font-mono span[aria-hidden]").innerText()).trim();
  expect(shown === `${profile.friendCode.slice(0, 4)}-${profile.friendCode.slice(4)}`, "the code shown is " + shown + " not " + profile.friendCode);
  expect((await card.innerText()).includes("Your username is ana.cooks."), "the username is not shown");
  expect(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(shown), "the code has look-alike letters: " + shown);
  // copy the code and the link; share falls back to copying the whole invite message in a browser without a share sheet
  await card.getByRole("button", { name: "Copy code" }).click();
  await card.getByText("Copied.").waitFor();
  expect((await page.evaluate(() => navigator.clipboard.readText())) === profile.friendCode, "Copy code copied something else");
  await card.getByRole("button", { name: "Copy link" }).click();
  expect(new RegExp(`/f#${profile.friendCode}$`).test(await page.evaluate(() => navigator.clipboard.readText())), "Copy link copied something else");
  await page.evaluate(() => { delete navigator.share; Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
  await card.getByRole("button", { name: "Share invite" }).click();
  await until("the invite message is copied", async () => /My friend code is [A-Z2-9]{4}-[A-Z2-9]{4}/.test(await page.evaluate(() => navigator.clipboard.readText())));
  expect(new RegExp(`/f#${profile.friendCode}\\s*$`).test(await page.evaluate(() => navigator.clipboard.readText())), "the invite message does not end with the link");
  for (const b of ["Share invite", "Copy code", "Copy link"]) { const box = await card.getByRole("button", { name: b }).boundingBox(); expect(box.height >= 44, b + " is " + box.height + " px high"); }
  // the choice is kept: the username can't be chosen again
  const again = await call(sc, "ana", "PUT", "community/me", { username: "another1" });
  expect(again.status === 409 && again.body.error === "username_set", "a second username was accepted");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("add a friend: a taken username says so; a pasted invite link works; an unknown code, your own code, a malformed one and an already-added friend all get the same words; the request is seen and accepted on the other phone", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  const ben = await phone(sc, "ben");
  const a = await join(sc, "ana");
  // ben chooses a name through the sheet: the first is taken (the server says so), the second is his
  await go(ben.page, "/app/community/friends", null); // the username sheet opens by itself, so the page behind it can't be reached by role yet
  const sheet = ben.page.getByRole("dialog", { name: "Choose a username" });
  await sheet.waitFor({ timeout: 90000 });
  await sheet.getByLabel("Username").fill("Ana.Cooks");
  await sheet.getByRole("button", { name: "Choose this username" }).click();
  await sheet.getByRole("alert").filter({ hasText: "That username is taken. Try another." }).waitFor();
  await pickUsername(ben.page, "ben99");
  await ben.page.locator('section[aria-labelledby="my-code"]').waitFor();
  const b = (await call(sc, "ben", "GET", "community/me")).body.profile;
  const neutral = "We couldn't add that code. Check it and try again.";
  const seen = [];
  for (const text of ["ZZZZZZZZ", b.friendCode, "not a code!", "https://numbite.com/f#ZZZZ2222", "1234"]) {
    await addCode(ben.page, text);
    await ben.page.getByRole("alert").filter({ hasText: neutral }).waitFor({ timeout: 8000 }).catch(() => { throw new Error(`"${text}" did not give the neutral message`); });
    seen.push(await ben.page.getByRole("alert").filter({ hasText: neutral }).innerText());
  }
  expect(new Set(seen).size === 1, "different messages: " + JSON.stringify(seen));
  // the codes that reached the server (the well-formed ones) all got the same answer, byte for byte
  const answers = sc.responses.filter((r) => r.who === "ben" && r.path === "community/friends/request").map((r) => r.status + r.body);
  expect(answers.length >= 3 && new Set(answers).size === 1, "the server's answers differ: " + JSON.stringify([...new Set(answers)]));
  // a link pasted whole
  await addCode(ben.page, `Add me! https://numbite.com/f#${a.friendCode.slice(0, 4)}-${a.friendCode.slice(4).toLowerCase()} thanks`);
  await ben.page.getByText("Request sent to ana.cooks.").waitFor();
  expect((await codeBox(ben.page).inputValue()) === "", "the box was not cleared");
  const waiting = ben.page.locator('section[aria-labelledby="waiting"]');
  await waiting.getByText("ana.cooks").waitFor();
  // asking again says the same thing, and nothing is added twice
  await addCode(ben.page, a.friendCode);
  await ben.page.getByText("Request sent to ana.cooks.").waitFor();
  expect((await waiting.locator("li").count()) === 1, "the request is listed twice");
  // ana: the badge, the hub card, the request with Accept and Decline
  await go(ana.page, "/app/community", "Community");
  await until("the badge on Ana's Community tab", async () => /1 new/.test(await tabBar(ana.page).getByRole("link", { name: /Community/ }).innerText()));
  expect(((await ana.page.locator("main a[href='/app/community/friends']").innerText()).includes("1 new")), "the hub's Friends card does not say 1 new");
  await ana.page.locator("main a[href='/app/community/friends']").click();
  await friendsHeading(ana.page).waitFor();
  const requests = ana.page.locator('section[aria-labelledby="requests"]');
  await requests.getByText("ben99").waitFor();
  await settle(ana.page); // (a sub-pixel size while the page is still fading in is not the size it ends at)
  for (const n of ["Accept ben99", "Decline ben99", "More options for ben99"]) { const box = await ana.page.getByRole("button", { name: n }).boundingBox(); expect(box.height >= 43.99 && box.width >= 43.99, `${n} is ${box.width} x ${box.height}`); }
  await ana.page.getByRole("button", { name: "Accept ben99" }).click();
  await toastSeen(ana.page, "You and ben99 are now friends.");
  await ana.page.locator('section[aria-labelledby="friends-list"]').getByText("ben99").waitFor();
  // the button that was pressed is gone: focus goes to the heading of the list ben99 is in now, not the page behind
  await until("focus is on the Your friends heading", async () => (await focused(ana.page)).startsWith("H2 Your friends"));
  expect((await requests.count()) === 0, "the request is still listed");
  // ben sees ana as a friend after a reload; adding ana again is now the neutral message
  await ben.page.reload();
  await ben.page.locator('section[aria-labelledby="friends-list"]').getByText("ana.cooks").waitFor();
  await addCode(ben.page, a.friendCode);
  await ben.page.getByRole("alert").filter({ hasText: neutral }).waitFor();
  expect(ana.errors.length + ben.errors.length === 0, [...ana.errors, ...ben.errors].join(" | "));
  await ana.ctx.close(); await ben.ctx.close();
});

await step("decline: the request goes from both phones; take back: your own request goes", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  const cleo = await phone(sc, "cleo");
  const dev = await phone(sc, "dev");
  const a = await join(sc, "ana");
  await join(sc, "cleo", "cleo_c");
  await join(sc, "dev", "dev.d");
  await call(sc, "cleo", "POST", "community/friends/request", { code: a.friendCode });
  await call(sc, "dev", "POST", "community/friends/request", { code: a.friendCode });
  await go(ana.page, "/app/community/friends", "Friends");
  const requests = ana.page.locator('section[aria-labelledby="requests"]');
  await requests.getByText("cleo_c").waitFor();
  await ana.page.getByRole("button", { name: "Decline cleo_c" }).click();
  await toastSeen(ana.page, "Declined.");
  await until("cleo's request is gone", async () => (await requests.getByText("cleo_c").count()) === 0);
  await go(cleo.page, "/app/community/friends", "Friends");
  await cleo.page.locator('section[aria-labelledby="my-code"]').waitFor();
  expect((await cleo.page.locator('section[aria-labelledby="waiting"]').count()) === 0, "the declined request still shows as waiting");
  // dev takes their own request back
  await go(dev.page, "/app/community/friends", "Friends");
  const waiting = dev.page.locator('section[aria-labelledby="waiting"]');
  await waiting.getByText("ana.cooks").waitFor();
  await dev.page.getByRole("button", { name: "Take back your request to ana.cooks" }).click();
  await toastSeen(dev.page, "Request taken back.");
  await until("dev's request is gone", async () => (await waiting.count()) === 0);
  await ana.page.reload();
  await ana.page.locator('section[aria-labelledby="my-code"]').waitFor();
  // (the page shows the copy kept on the phone first and then the server's answer)
  await until("the taken-back request leaves Ana's list", async () => (await ana.page.locator('section[aria-labelledby="requests"]').count()) === 0);
  await ana.ctx.close(); await cleo.ctx.close(); await dev.ctx.close();
});

await step("send a shopping list to a friend from the Shopping list; it lands in the friend's Shared with you with a badge; open it, Add all, mark read, delete", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana", { shopping: SHOPPING });
  const ben = await phone(sc, "ben");
  await join(sc, "ana");
  const b = await join(sc, "ben");
  await makeFriends(sc, "ana", "ben", b);
  await go(ana.page, "/app/groceries/list", "Shopping list");
  const send = ana.page.getByRole("button", { name: "Send to a friend" });
  await send.waitFor();
  const box = await send.boundingBox();
  expect(box.height >= 44, "Send to a friend is " + box.height + " px high");
  await send.click();
  const sheet = ana.page.getByRole("dialog", { name: "Send to a friend" });
  await sheet.getByText("Who do you want to send it to?").waitFor();
  await sheet.getByRole("button", { name: "ben99" }).click();
  await sheet.getByText("Send your shopping list to ben99?").waitFor();
  expect((await sheet.innerText()).includes("2 items"), "the sheet does not count the 2 items still to get (the ticked one is left out): " + (await sheet.innerText()));
  await sheet.getByRole("button", { name: "Back", exact: true }).click();
  await sheet.getByRole("button", { name: "ben99" }).click();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await ana.page.getByText("Sent to ben99.").waitFor();
  await sheet.waitFor({ state: "hidden" });
  // what the server was given: the share-link code, with no names, prices or numbers of the products
  const sent = sc.calls.find((c) => c.path === "community/send-list");
  const payload = JSON.parse(sent.body).payload;
  expect(/^1[A-Za-z0-9_-]{6}[A-Za-z0-9_-]+$/.test(payload), "the payload is not a share-link code: " + payload);
  expect(!/Multiseed|1\.6|Milk/.test(sent.body), "the payload carries names or prices: " + sent.body);
  // ben: the badge, the hub card, the inbox row, the list
  await go(ben.page, "/app/community", "Community");
  await until("the badge on Ben's Community tab", async () => /1 new/.test(await tabBar(ben.page).getByRole("link", { name: /Community/ }).innerText()));
  const sharedCard = ben.page.locator("main a[href='/app/community/inbox']");
  expect((await sharedCard.innerText()).includes("1 new"), "the Shared with you card does not say 1 new");
  await sharedCard.click();
  await ben.page.getByRole("heading", { level: 1, name: "Shared with you", exact: true }).waitFor();
  const row = ben.page.locator('main a[href^="/app/community/inbox/view?id="]').first();
  const rowText = (await row.innerText()).replace(/\s+/g, " ");
  expect(/ana\.cooks/.test(rowText) && /2 items/.test(rowText) && /new/i.test(rowText), "the row says: " + rowText);
  expect((await row.boundingBox()).height >= 44, "the row is too short");
  await row.click();
  await ben.page.getByRole("heading", { level: 1, name: "Shopping list from ana.cooks" }).waitFor();
  await ben.page.getByText("Milk", { exact: true }).waitFor({ timeout: 30000 });
  await ben.page.getByText("Multiseed Loaf", { exact: false }).first().waitFor({ timeout: 30000 });
  expect((await ben.page.getByText("Eggs", { exact: true }).count()) === 0, "a ticked item was sent");
  expect((await mainText(ben.page)).includes("ana.cooks sent you this shopping list."), "no intro line");
  // opening marked it read: the tab's number goes
  await until("the badge goes", async () => !/new/.test(await tabBar(ben.page).getByRole("link", { name: /Community/ }).innerText()));
  await ben.page.getByRole("button", { name: "Add all to my shopping list" }).click();
  await ben.page.getByText("Added to your shopping list.").waitFor();
  const kept = JSON.parse(await store(ben.page, "mm.v1.shopping")).data;
  expect(kept.some((i) => i.name === "Milk" && i.custom) && kept.some((i) => i.shopId === LOAF.shopId && i.qty === 2), "the list was not added: " + JSON.stringify(kept.map((i) => i.name)));
  // Delete: one more question first (it can't be undone); Cancel keeps the list; then back to the inbox, now empty
  await ben.page.getByRole("button", { name: "Delete this list" }).click();
  const confirm = ben.page.getByRole("dialog", { name: "Delete this list" });
  await confirm.getByText("Delete this list from ana.cooks? You can't undo this.").waitFor();
  expect((await call(sc, "ben", "GET", "community/inbox")).body.items.length === 1, "the list was deleted before the question was answered");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await confirm.waitFor({ state: "hidden" });
  expect((await call(sc, "ben", "GET", "community/inbox")).body.items.length === 1, "Cancel deleted the list");
  await ben.page.getByRole("button", { name: "Delete this list" }).click();
  await confirm.getByRole("button", { name: "Delete this list" }).click();
  await ben.page.getByRole("heading", { level: 1, name: "Shared with you", exact: true }).waitFor();
  await ben.page.getByText("Nothing shared with you yet").waitFor();
  expect((await call(sc, "ben", "GET", "community/inbox")).body.items.length === 0, "the list is still on the server");
  expect(ana.errors.length + ben.errors.length === 0, [...ana.errors, ...ben.errors].join(" | "));
  await ana.ctx.close(); await ben.ctx.close();
});

await step("Send to a friend: signed out it asks you to sign in and then goes on; with no username it asks for one; with no friends it points to Add a friend; an empty list says so", async () => {
  const sc = scene();
  // signed out
  const out = await phone(sc, "ana", { signedIn: false, shopping: SHOPPING });
  await go(out.page, "/app/groceries/list", "Shopping list");
  await out.page.getByRole("button", { name: "Send to a friend" }).click();
  const signIn = out.page.getByRole("dialog", { name: "Sign in" });
  await signIn.getByRole("button", { name: "Continue with email" }).click();
  await signIn.getByLabel("Your email address").fill(emailOf("ana"));
  await signIn.getByRole("button", { name: "Send me a code" }).click();
  await signIn.getByLabel("6-digit code").fill("123456");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  // signed in with no username: the picker asks for one
  const sheet = out.page.getByRole("dialog", { name: "Send to a friend" });
  await sheet.getByText("Choose a username first, so your friends know who the list is from.").waitFor({ timeout: 20000 });
  await sheet.getByRole("button", { name: "Choose a username" }).click();
  await pickUsername(out.page, "ana.cooks");
  // no friends yet
  await out.page.getByRole("dialog", { name: "Send to a friend" }).getByText("You have no friends yet. Add one with their friend code, then send your list.").waitFor();
  const add = out.page.getByRole("dialog", { name: "Send to a friend" }).getByRole("link", { name: "Add a friend" });
  expect((await add.getAttribute("href")) === "/app/community/friends", "Add a friend goes to " + (await add.getAttribute("href")));
  await out.ctx.close();
  // an empty list (everything ticked)
  const sc2 = scene();
  const empty = await phone(sc2, "ana", { shopping: SHOPPING.map((i) => ({ ...i, done: true })) });
  await join(sc2, "ana");
  await go(empty.page, "/app/groceries/list", "Shopping list");
  await empty.page.getByRole("button", { name: "Send to a friend" }).click();
  await empty.page.getByRole("dialog", { name: "Send to a friend" }).getByText("Nothing on your list is left to send. Items you've ticked aren't sent.").waitFor();
  expect(sc2.calls.every((c) => c.path !== "community/send-list"), "something was sent");
  await empty.ctx.close();
});

await step("the messages for a full inbox, too many tries and a friend who has gone", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana", { shopping: SHOPPING });
  await join(sc, "ana");
  const b = await join(sc, "ben");
  await makeFriends(sc, "ana", "ben", b);
  await go(ana.page, "/app/groceries/list", "Shopping list");
  const trySend = async () => {
    await ana.page.getByRole("button", { name: "Send to a friend" }).click();
    const sheet = ana.page.getByRole("dialog", { name: "Send to a friend" });
    await sheet.getByRole("button", { name: "ben99" }).click();
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    return sheet;
  };
  ana.device.force.push({ method: "POST", path: "community/send-list", status: 409, body: { error: "inbox_full" }, times: 1 });
  let sheet = await trySend();
  await sheet.getByRole("alert").filter({ hasText: "ben99 has too many lists waiting to be opened. Try again later." }).waitFor();
  expect(!(await mainText(ana.page)).includes("Sent to"), "it says sent");
  await sheet.getByRole("button", { name: "Back", exact: true }).click();
  ana.device.force.push({ method: "POST", path: "community/send-list", status: 429, body: { error: "rate_limited" }, times: 1 });
  await sheet.getByRole("button", { name: "ben99" }).click();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await sheet.getByRole("alert").filter({ hasText: "Too many tries. Please wait a few minutes and try again." }).waitFor();
  await sheet.getByRole("button", { name: "Back", exact: true }).click();
  ana.device.force.push({ method: "POST", path: "community/send-list", status: 404, body: { error: "not_found" }, times: 1 });
  await sheet.getByRole("button", { name: "ben99" }).click();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await sheet.getByRole("alert").filter({ hasText: "We couldn't find that. It may have been removed." }).waitFor();
  await sheet.getByRole("button", { name: "Back", exact: true }).click();
  // offline
  ana.device.offline = true;
  await sheet.getByRole("button", { name: "ben99" }).click();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await sheet.getByRole("alert").filter({ hasText: "You're offline. Connect to the internet and try again." }).waitFor();
  ana.device.offline = false;
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await ana.page.getByText("Sent to ben99.").waitFor();
  await ana.ctx.close();
  // the real limits: 20 tries a day, then the friend page says so
  const sc2 = scene();
  const e = await phone(sc2, "eve");
  await join(sc2, "eve", "eve.e");
  for (let i = 0; i < 20; i++) await call(sc2, "eve", "POST", "community/friends/request", { code: "ZZZZZZZZ" });
  await go(e.page, "/app/community/friends", "Friends");
  await e.page.locator('section[aria-labelledby="my-code"]').waitFor();
  await addCode(e.page, "ZZZZ2222");
  await e.page.getByRole("alert").filter({ hasText: "You've reached today's limit. Try again tomorrow." }).waitFor(); // the real daily limit says tomorrow, not "in a few minutes"
  expect((await mainText(e.page)).includes("a few minutes") === false, "the daily limit still tells the person to wait a few minutes");
  // forced server answers for the other caps
  e.device.force.push({ method: "POST", path: "community/friends/request", status: 409, body: { error: "request_limit" }, times: 1 });
  await addCode(e.page, "ZZZZ2222");
  await e.page.getByRole("alert").filter({ hasText: "You have too many requests waiting for an answer." }).waitFor();
  e.device.force.push({ method: "POST", path: "community/friends/request", status: 409, body: { error: "friend_limit" }, times: 1 });
  await addCode(e.page, "ZZZZ2222");
  await e.page.getByRole("alert").filter({ hasText: "The limit of 200 friends has been reached." }).waitFor();
  await e.ctx.close();
});

await step("a friend's menu: report (with a reason and a note), block, remove; the other phone sees a removed friend; unblock does not make friends again", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  const ben = await phone(sc, "ben");
  const cleo = await phone(sc, "cleo");
  await join(sc, "ana");
  const b = await join(sc, "ben");
  const c = await join(sc, "cleo", "cleo_c");
  await makeFriends(sc, "ana", "ben", b);
  await makeFriends(sc, "ana", "cleo", c);
  await go(ana.page, "/app/community/friends", "Friends");
  const list = ana.page.locator('section[aria-labelledby="friends-list"]');
  await list.getByText("ben99").waitFor();
  await list.getByText("cleo_c").waitFor();
  // report ben: the reason must be chosen; a note; the report is saved with what the founder needs
  await ana.page.getByRole("button", { name: "More options for ben99" }).click();
  const sheet = ana.page.getByRole("dialog", { name: "ben99" });
  await sheet.getByRole("button", { name: "Report ben99" }).click();
  const send = ana.page.getByRole("dialog", { name: "Report ben99" }).getByRole("button", { name: "Send report" });
  expect(await send.isDisabled(), "Send report is enabled before a reason is chosen");
  const report = ana.page.getByRole("dialog", { name: "Report ben99" });
  await report.getByRole("radio", { name: "Offensive username" }).click();
  expect((await report.getByRole("radio", { name: "Offensive username" }).getAttribute("aria-checked")) === "true", "not selected");
  expect((await report.getByRole("radio").count()) === 5, "the reasons for a person are not five");
  await report.getByLabel("Add a note (optional)").fill("  a rude name  ");
  await send.click();
  await report.getByText("Thank you. We'll look at your report.").waitFor();
  const saved = sc.world.mem.reports;
  expect(saved.length === 1 && saved[0].reason === "abusive_username" && saved[0].note === "a rude name" && saved[0].reportedUsername === "ben99" && saved[0].reporterUsername === "ana.cooks", "the saved report: " + JSON.stringify(saved));
  await report.getByRole("button", { name: "Done" }).click();
  await list.getByText("ben99").waitFor(); // reporting alone doesn't remove anyone
  // remove cleo
  await ana.page.getByRole("button", { name: "More options for cleo_c" }).click();
  await ana.page.getByRole("dialog", { name: "cleo_c" }).getByRole("button", { name: "Remove cleo_c" }).click();
  const remove = ana.page.getByRole("dialog", { name: "Remove cleo_c" });
  await remove.getByText("They aren't told.").waitFor();
  await remove.getByRole("button", { name: "Cancel" }).click();
  await ana.page.getByRole("dialog", { name: "cleo_c" }).getByRole("button", { name: "Remove cleo_c" }).waitFor();
  await ana.page.getByRole("dialog", { name: "cleo_c" }).getByRole("button", { name: "Remove cleo_c" }).click();
  await remove.getByRole("button", { name: "Remove cleo_c" }).click();
  await toastSeen(ana.page, "cleo_c was removed from your friends.");
  await until("focus is on the Your friends heading after a removal", async () => (await focused(ana.page)).startsWith("H2 Your friends"));
  await until("cleo is gone from the list", async () => (await list.getByText("cleo_c").count()) === 0);
  await cleo.page.goto(BASE + "/app/community/friends");
  await cleo.page.locator('section[aria-labelledby="my-code"]').waitFor();
  expect((await cleo.page.locator('section[aria-labelledby="friends-list"]').getByText("ana.cooks").count()) === 0, "cleo still lists ana");
  // block ben: removed, hidden both ways, listed under People you've blocked
  await ana.page.getByRole("button", { name: "More options for ben99" }).click();
  await ana.page.getByRole("dialog", { name: "ben99" }).getByRole("button", { name: "Block ben99" }).click();
  const block = ana.page.getByRole("dialog", { name: "Block ben99" });
  await block.getByText("You'll stop seeing each other").waitFor();
  await block.getByRole("button", { name: "Block ben99" }).click();
  await toastSeen(ana.page, "ben99 is blocked.");
  const blocked = ana.page.locator('section[aria-labelledby="blocked"]');
  await blocked.getByText("ben99").waitFor();
  await until("ben left the friends list", async () => (await list.getByText("ben99").count()) === 0);
  await ben.page.goto(BASE + "/app/community/friends");
  await ben.page.locator('section[aria-labelledby="my-code"]').waitFor();
  expect((await ben.page.locator('section[aria-labelledby="friends-list"]').getByText("ana.cooks").count()) === 0, "ben still lists ana");
  expect((await ben.page.locator("main").innerText()).toLowerCase().includes("blocked") === false, "ben is told he is blocked");
  // ben's code for ana is now the neutral message
  const a = (await call(sc, "ana", "GET", "community/me")).body.profile;
  await addCode(ben.page, a.friendCode);
  await ben.page.getByRole("alert").filter({ hasText: "We couldn't add that code. Check it and try again." }).waitFor();
  // unblock: not friends again
  await ana.page.getByRole("button", { name: "Unblock ben99" }).click();
  await toastSeen(ana.page, "ben99 is unblocked. You are not friends again unless you add each other's codes.");
  expect((await ana.page.locator('section[aria-labelledby="blocked"]').count()) === 0, "the blocked list is still there");
  expect((await list.getByText("ben99").count()) === 0, "ben is a friend again by himself");
  expect(ana.errors.length + ben.errors.length + cleo.errors.length === 0, [...ana.errors, ...ben.errors, ...cleo.errors].join(" | "));
  await ana.ctx.close(); await ben.ctx.close(); await cleo.ctx.close();
});

await step("a request can be reported or blocked too; a list in the inbox: Report (the list's reasons, with Also block) and Report or block, and a blocked sender's lists are gone", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana", { shopping: SHOPPING });
  const ben = await phone(sc, "ben");
  const dev = await phone(sc, "dev");
  const a = await join(sc, "ana");
  const b = await join(sc, "ben");
  await join(sc, "dev", "dev.d");
  await makeFriends(sc, "ana", "ben", b);
  await call(sc, "dev", "POST", "community/friends/request", { code: b.friendCode });
  // a request waiting for ben: block it from the row
  await go(ben.page, "/app/community/friends", "Friends");
  const requests = ben.page.locator('section[aria-labelledby="requests"]');
  await requests.getByText("dev.d").waitFor();
  await ben.page.getByRole("button", { name: "More options for dev.d" }).click();
  const menu = ben.page.getByRole("dialog", { name: "dev.d" });
  expect((await menu.getByRole("button", { name: /Remove/ }).count()) === 0, "a request offers Remove");
  await menu.getByRole("button", { name: "Block dev.d" }).click();
  await ben.page.getByRole("dialog", { name: "Block dev.d" }).getByRole("button", { name: "Block dev.d" }).click();
  await toastSeen(ben.page, "dev.d is blocked.");
  await until("the request is gone", async () => (await requests.count()) === 0);
  // ana sends two lists; ben opens one and reports it with "Also block"
  await go(ana.page, "/app/groceries/list", "Shopping list");
  for (let i = 0; i < 2; i++) {
    await ana.page.getByRole("button", { name: "Send to a friend" }).click();
    const sheet = ana.page.getByRole("dialog", { name: "Send to a friend" });
    await sheet.getByRole("button", { name: "ben99" }).click();
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    await ana.page.getByText("Sent to ben99.").waitFor();
    await sheet.waitFor({ state: "hidden" });
  }
  await go(ben.page, "/app/community/inbox", "Shared with you");
  const rows = ben.page.locator('main a[href^="/app/community/inbox/view?id="]');
  await until("two lists", async () => (await rows.count()) === 2);
  await rows.first().click();
  await ben.page.getByRole("heading", { level: 1, name: "Shopping list from ana.cooks" }).waitFor();
  await ben.page.getByRole("button", { name: "Report or block ana.cooks" }).click();
  const m = ben.page.getByRole("dialog", { name: "ana.cooks" });
  await m.getByRole("button", { name: "Report ana.cooks" }).click();
  const rep = ben.page.getByRole("dialog", { name: "Report ana.cooks" });
  expect((await rep.getByRole("radio").count()) === 4 && (await rep.getByRole("radio", { name: "Offensive words in the list" }).count()) === 1, "a list's reasons are not the four expected");
  await rep.getByRole("radio", { name: "Spam" }).click();
  await rep.getByText("Also block ana.cooks").click();
  await rep.getByRole("button", { name: "Send report" }).click();
  await ben.page.getByRole("heading", { level: 1, name: "Shared with you", exact: true }).waitFor({ timeout: 15000 });
  await ben.page.getByText("Nothing shared with you yet").waitFor();
  const saved = sc.world.mem.reports;
  expect(saved.length === 1 && saved[0].reason === "spam" && /Milk/.test(saved[0].listText ?? ""), "the report did not keep the words of the list: " + JSON.stringify(saved.map((r) => [r.reason, r.listText])));
  // blocking removed the friendship and both lists
  expect((await call(sc, "ana", "GET", "community/friends")).body.friends.length === 0, "ana still has ben as a friend");
  expect(sc.world.mem.lists.length === 0, "the lists are still on the server");
  expect(a.username && ana.errors.length + ben.errors.length + dev.errors.length === 0, [...ana.errors, ...ben.errors, ...dev.errors].join(" | "));
  await ana.ctx.close(); await ben.ctx.close(); await dev.ctx.close();
});

await step("offline shows what was here last time, with a note; the tab's number stays; a kept list still opens; back online the note goes", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  await join(sc, "ana");
  const b = await join(sc, "ben");
  await makeFriends(sc, "ben", "ana", (await call(sc, "ana", "GET", "community/me")).body.profile);
  void b;
  const sentToAna = await call(sc, "ben", "POST", "community/send-list", { friendId: await friendIdOf(sc, "ben"), payload: await encodeSample() });
  expect(sentToAna.status === 201, "the list was not sent: " + JSON.stringify(sentToAna.body));
  // ana opens friends and the inbox once (online), so a copy is kept
  await go(ana.page, "/app/community/friends", "Friends");
  await ana.page.locator('section[aria-labelledby="friends-list"]').getByText("ben99").waitFor();
  await go(ana.page, "/app/community/inbox", "Shared with you");
  await ana.page.locator('main a[href^="/app/community/inbox/view?id="]').first().waitFor();
  await until("the copy is kept", async () => /ben99/.test((await store(ana.page, "mm.v1.community")) ?? "") && /payload/.test((await store(ana.page, "mm.v1.community")) ?? ""));
  const copy = await store(ana.page, "mm.v1.community");
  expect(!/@|example\.com/.test(copy), "the copy holds an email address: " + copy.slice(0, 200));
  expect(!copy.includes(uid("ben")), "the copy holds another person's account id");
  ana.device.offline = true;
  await go(ana.page, "/app/community/friends", "Friends");
  await ana.page.locator('section[aria-labelledby="friends-list"]').getByText("ben99").waitFor();
  await ana.page.getByText("You're offline. Showing what was here last time.").waitFor();
  expect((await ana.page.getByRole("button", { name: "Try again" }).first().boundingBox()).height >= 44, "Try again is too short");
  await go(ana.page, "/app/community/inbox", "Shared with you");
  await ana.page.getByText("You're offline. Showing what was here last time.").waitFor();
  const row = ana.page.locator('main a[href^="/app/community/inbox/view?id="]').first();
  await row.waitFor();
  expect(/new/i.test(await row.innerText()), "the unread mark is gone offline");
  expect(/1 new/.test(await tabBar(ana.page).getByRole("link", { name: /Community/ }).innerText()), "the last number is not on the tab bar offline");
  // the list opens from the kept copy (its products come from the shops' lists on our own site, not from the API)
  await row.click();
  await ana.page.getByRole("heading", { level: 1, name: "Shopping list from ben99" }).waitFor();
  await ana.page.getByText("Milk", { exact: true }).waitFor({ timeout: 30000 });
  // back online: the page fetches fresh data and the note goes
  ana.device.offline = false;
  await go(ana.page, "/app/community/inbox", "Shared with you");
  await until("the note goes", async () => (await ana.page.getByText("You're offline. Showing what was here last time.").count()) === 0);
  expect(ana.errors.length === 0, ana.errors.join(" | "));
  await ana.ctx.close();
});

await step("another person signing in on the same phone never sees the previous person's copy; sign out and Clear data remove it", async () => {
  const sc = scene();
  await join(sc, "ana");
  const b = await join(sc, "ben");
  await makeFriends(sc, "ana", "ben", b);
  const stale = { userId: uid("zed"), savedAt: 1, profile: { username: "zed.zed", friendCode: "ZZZZ2222", createdAt: "2026-10-16T12:00:00.000Z" }, counts: { unread: 3, friendRequests: 2 }, friends: { friends: [{ id: "00000000-0000-4000-8000-0000000000aa", username: "zed.friend", createdAt: "2026-10-16T12:00:00.000Z" }], incoming: [], outgoing: [] }, inbox: null };
  const p = await phone(sc, "ana", { extra: { "mm.v1.community": { v: 1, data: stale } } });
  await go(p.page, "/app/community/friends", "Friends");
  await p.page.locator('section[aria-labelledby="friends-list"]').waitFor();
  expect(!(await mainText(p.page)).includes("zed"), "the other person's friends are shown");
  expect(!/3 new|5 new/.test(await tabBar(p.page).getByRole("link", { name: /Community/ }).innerText()), "the other person's badge is shown");
  const now = JSON.parse(await store(p.page, "mm.v1.community"));
  expect(now.data.userId === uid("ana"), "the copy belongs to " + now.data.userId);
  // sign out from Settings: the copy goes
  await go(p.page, "/app/settings", "Settings");
  await p.page.getByRole("button", { name: "Sign out" }).click();
  await until("the copy is cleared by signing out", async () => (await store(p.page, "mm.v1.community")) === null);
  // sign in again: it is fetched again; then Clear data removes it (and signs out)
  await go(p.page, "/app/community/friends", "Friends");
  await signInWithEmail(p.page, emailOf("ana"));
  await p.page.locator('section[aria-labelledby="friends-list"]').getByText("ben99").waitFor({ timeout: 20000 });
  await until("a new copy", async () => (await store(p.page, "mm.v1.community")) !== null);
  await go(p.page, "/app/settings", "Settings");
  await p.page.evaluate(() => sessionStorage.setItem("mm.friendInvite", "ABCDEFGH")); // an invite code nobody used
  await p.page.getByRole("button", { name: "Clear data on this device" }).click();
  await p.page.getByRole("dialog").getByRole("button", { name: "Clear everything" }).click();
  await until("the copy is cleared by Clear data", async () => (await store(p.page, "mm.v1.community")) === null);
  await until("an unused invite code is forgotten by Clear data", async () => (await p.page.evaluate(() => sessionStorage.getItem("mm.friendInvite"))) === null);
  await p.ctx.close();
  // delete my account: the copy is removed too (the server's rows go with the account: tests/community.test.ts)
  const sc2 = scene();
  await join(sc2, "ana");
  const q = await phone(sc2, "ana");
  await go(q.page, "/app/community/friends", "Friends");
  await q.page.locator('section[aria-labelledby="my-code"]').waitFor();
  await until("a copy", async () => (await store(q.page, "mm.v1.community")) !== null);
  await go(q.page, "/app/settings", "Settings");
  await q.page.getByRole("button", { name: "Delete my account" }).click();
  await q.page.getByRole("dialog").getByText("Your username, friends and the shopping lists you sent or received are deleted too.").waitFor();
  await q.page.getByRole("dialog").getByRole("button", { name: "Delete my account" }).click();
  await until("the copy is cleared by deleting the account", async () => (await store(q.page, "mm.v1.community")) === null);
  await q.ctx.close();
});

await step("nothing about friends or lists is ever sent to sync, and no email address or account id of another person is in anything the server said to this phone", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana", { shopping: SHOPPING });
  const ben = await phone(sc, "ben");
  const a = await join(sc, "ana");
  const b = await join(sc, "ben");
  await makeFriends(sc, "ana", "ben", b);
  await go(ana.page, "/app/groceries/list", "Shopping list");
  await ana.page.getByRole("button", { name: "Send to a friend" }).click();
  const sheet = ana.page.getByRole("dialog", { name: "Send to a friend" });
  await sheet.getByRole("button", { name: "ben99" }).click();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await ana.page.getByText("Sent to ben99.").waitFor();
  await go(ana.page, "/app/community/friends", "Friends");
  await go(ben.page, "/app/community/inbox", "Shared with you");
  await ben.page.locator('main a[href^="/app/community/inbox/view?id="]').first().click();
  await ben.page.getByRole("heading", { level: 1, name: "Shopping list from ana.cooks" }).waitFor();
  // make the sync engines run (they send settings and the shopping list)
  await ana.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await new Promise((r) => setTimeout(r, 4500));
  const names = new Set(sc.calls.filter((c) => c.path.startsWith("sync/")).map((c) => c.path.slice(5)));
  expect([...names].every((n) => ["settings", "favorites", "saved", "log", "shopping", "savedRecipes", "myRecipes", "cupboard", "compare"].includes(n)), "a sync store that is not one of the nine: " + [...names]);
  expect(sc.syncBodies.length > 0, "sync never ran, so this proves nothing");
  const synced = sc.syncBodies.join("\n");
  for (const secret of ["ben99", "ana.cooks", a.friendCode, b.friendCode, "community", "inbox", "friendship"]) expect(!synced.includes(secret), `sync carried "${secret}"`);
  // what the server said to a phone never holds an email or an account id (its own or anybody else's)
  for (const r of sc.responses) {
    expect(!/@|example\.com/.test(r.body), `${r.who} ${r.path} says an email: ${r.body.slice(0, 160)}`);
    expect(!/20000000-0000-4000-8000-0000000000(0[1-9a-f])/.test(r.body), `${r.who} ${r.path} says an account id: ${r.body.slice(0, 160)}`);
  }
  // no friend code of another person: the friends and inbox answers never carry one
  for (const r of sc.responses.filter((x) => /community\/(friends|inbox)$/.test(x.path))) expect(!/friendCode/.test(r.body), `${r.path} sends a friend code`);
  // and none of it is on a page of the other person
  expect(!(await mainText(ben.page)).includes("example.com"), "an email address is on Ben's page");
  expect(ana.errors.length + ben.errors.length === 0, [...ana.errors, ...ben.errors].join(" | "));
  await ana.ctx.close(); await ben.ctx.close();
});

await step("an invite link: signed in it fills the box (the code is kept out of the address); signed out the prompt says it is saved, and after signing in and choosing a username it is in the box", async () => {
  const sc = scene();
  const a = await join(sc, "ana");
  const ben = await phone(sc, "ben");
  await join(sc, "ben");
  await ben.page.goto(BASE + `/app/community/friends#${a.friendCode}`, { timeout: 120000 });
  await friendsHeading(ben.page).waitFor({ timeout: 90000 });
  await until("the box is filled", async () => (await codeBox(ben.page).inputValue().catch(() => "")) === a.friendCode);
  await ben.page.getByText("This is the code from your friend's invite. Check it, then tap Add friend.").waitFor();
  expect(new URL(ben.page.url()).hash === "", "the code is still in the address: " + ben.page.url());
  expect(sc.calls.every((c) => c.path !== "community/friends/request"), "the invite was used before the person tapped Add friend");
  await ben.page.getByRole("button", { name: "Add friend", exact: true }).click();
  await ben.page.getByText("Request sent to ana.cooks.").waitFor();
  await ben.ctx.close();
  // signed out
  const out = await phone(sc, "cleo", { signedIn: false });
  await out.page.goto(BASE + `/app/community/friends#${a.friendCode}`, { timeout: 120000 });
  await friendsHeading(out.page).waitFor({ timeout: 90000 });
  await out.page.getByText("Your friend's code is saved. After you sign in, it will be ready to add.").waitFor();
  await signInWithEmail(out.page, emailOf("cleo"));
  await pickUsername(out.page, "cleo_c");
  await until("the saved code is in the box", async () => (await codeBox(out.page).inputValue().catch(() => "")) === a.friendCode);
  await out.ctx.close();
});

await step("first-time visitor with an invite link: the questions come first and the code survives them (it travels after the welcome page's own '#', never in the query)", async () => {
  const sc = scene();
  const a = await join(sc, "ana");
  const p = await phone(sc, "ben", { settings: { hasCompletedOnboarding: false } });
  await join(sc, "ben");
  const queries = [];
  p.page.on("request", (r) => { if (/\/app\/welcome/.test(r.url())) queries.push(new URL(r.url()).search); });
  await p.page.goto(BASE + `/app/community/friends#${a.friendCode}`, { timeout: 120000 });
  await p.page.waitForURL(/\/app\/welcome/, { timeout: 90000 });
  const url = new URL(p.page.url());
  expect(url.hash === `#${a.friendCode}` && !url.search.includes(a.friendCode), "the code is not kept after the welcome page's '#': " + url.toString());
  expect(/next=%2Fapp%2Fcommunity%2Ffriends/.test(url.search), "the way back is lost: " + url.search);
  expect(!queries.some((q) => q.includes(a.friendCode)), "the code reached a request's query: " + queries.join(","));
  await p.ctx.close();
});

await step("the website's invite page /f: the code, the three ways to open it, a bad code and no code; no index; axe", async () => {
  const sc = scene();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/f#K7M2-QXWA", { timeout: 120000 });
  await page.getByRole("heading", { level: 1, name: /A friend invited you to/ }).waitFor({ timeout: 90000 });
  expect((await page.locator("main, body").first().innerText()).includes("K7M2-QXWA"), "the code is not shown");
  const link = page.getByRole("link", { name: /Add them in your browser|Or add them in your browser/ });
  expect((await link.first().getAttribute("href")) === "/app/community/friends#K7M2QXWA", "the browser link is " + (await link.first().getAttribute("href")));
  expect((await page.locator('meta[name="robots"]').getAttribute("content")).includes("noindex"), "the invite page can be indexed");
  expect((await over(page)) <= 0, "overflow");
  await scan(page, "/f with a code");
  await page.goto(BASE + "/f#K7M2QXW0");
  await page.getByRole("heading", { level: 1, name: "This link doesn’t look right" }).waitFor();
  await scan(page, "/f with a bad code");
  await page.goto(BASE + "/f");
  await page.getByRole("heading", { level: 1, name: "Add a friend" }).waitFor();
  await scan(page, "/f with no code");
  expect(sc.calls.length === 0, "the page called the API");
  await ctx.close();
});

await step("the tab's number: hidden at 0, the figure up to 9 and 9+ beyond, said in words for a screen reader, and a dark bar keeps its contrast", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  await join(sc, "ana");
  await go(ana.page, "/app", /Home/);
  const link = tabBar(ana.page).getByRole("link", { name: /Community/ });
  await link.waitFor();
  expect((await link.innerText()).trim() === "Community", "a badge with nothing waiting");
  ana.device.force.push({ method: "GET", path: "community/me", status: 200, body: { ok: true, profile: { username: "ana.cooks", friendCode: "K7M2QXWA", createdAt: "2026-10-16T12:00:00.000Z" }, counts: { unread: 7, friendRequests: 2 } } });
  await ana.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await until("9 new", async () => /9 new|9\s*new/.test((await link.innerText()).replace(/\s+/g, " ")));
  expect((await link.getAttribute("aria-current")) === null, "wrong tab lit");
  const badge = link.locator("span[aria-hidden]:not(:has(svg))").filter({ hasText: /^\d\+?$/ });
  expect((await badge.innerText()).trim() === "9", "the badge shows " + (await badge.innerText()));
  ana.device.force.length = 0;
  ana.device.force.push({ method: "GET", path: "community/me", status: 200, body: { ok: true, profile: { username: "ana.cooks", friendCode: "K7M2QXWA", createdAt: "2026-10-16T12:00:00.000Z" }, counts: { unread: 30, friendRequests: 0 } } });
  await ana.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await until("9+", async () => (await badge.innerText().catch(() => "")).trim() === "9+");
  const b = await badge.boundingBox();
  const tab = await link.boundingBox();
  expect(b && b.x >= tab.x && b.x + b.width <= tab.x + tab.width + 1, "the badge sticks out of its tab: " + JSON.stringify([b, tab]));
  await scan(ana.page, "tab bar with a badge");
  await ana.ctx.close();
});

// ------------------------------------------------------------------------------------------------ looks: 360 px, Extra large text, Arabic, axe

/** A scene with Ana (signed in, a username, a friend, a request waiting, a request she made, someone blocked and a list sent to her) to look at every screen. */
async function lookScene(sc, opts) {
  const a = await join(sc, "ana");
  const b = await join(sc, "ben", "ben_with_a_long_name");
  await join(sc, "cleo", "cleo_c");
  const d = await join(sc, "dev", "dev.d");
  const e = await join(sc, "eve", "eve.e");
  await makeFriends(sc, "ana", "ben", b);
  await call(sc, "cleo", "POST", "community/friends/request", { code: a.friendCode });
  await call(sc, "ana", "POST", "community/friends/request", { code: d.friendCode });
  await makeFriends(sc, "ana", "eve", e);
  const eveRow = (await call(sc, "ana", "GET", "community/friends")).body.friends.find((f) => f.username === "eve.e");
  await call(sc, "ana", "POST", "community/blocks", { friendId: eveRow.id });
  // a list from ben to ana, made with the app's own encoder
  const friendId = (await call(sc, "ben", "GET", "community/friends")).body.friends[0].id;
  const sent = await call(sc, "ben", "POST", "community/send-list", { friendId, payload: await encodeSample() });
  if (sent.status !== 201) throw new Error("send " + JSON.stringify(sent.body));
  return phone(sc, "ana", { ...opts, shopping: SHOPPING });
}

/** What the real client sends for SHOPPING: made by the app's own encoder, loaded through Vite. */
async function encodeSample() {
  const { encodeEntries, toEntries } = await vite.ssrLoadModule("/lib/mm/shareList.ts");
  return encodeEntries(toEntries(SHOPPING)).payload;
}

const variants = [
  { label: "390 px", width: 390, settings: {} },
  { label: "360 px", width: 360, settings: {} },
  { label: "Extra large text, 360 px", width: 360, settings: { textSize: "xlarge" } },
];
if (process.env.SHOTS) mkdirSync(process.env.SHOTS, { recursive: true });

for (const v of variants) {
  await step(`every new screen at ${v.label}: no sideways scroll, 44 px targets, axe 0 (hub, friends, inbox, a list, and each sheet)`, async () => {
    const sc = scene();
    const ana = await lookScene(sc, { width: v.width, settings: v.settings });
    const { page, errors } = ana;
    // in Arabic the words are the dictionary's, where it has them (new strings stay English until they are translated)
    const dict = v.settings.language ? JSON.parse(readFileSync(new URL(`../lib/mm/locales/${v.settings.language}.json`, import.meta.url), "utf8")) : {};
    const T = (english) => dict[english] ?? english;
    const check = async (what) => {
      const o = await over(page);
      expect(o <= 0, `${what}: sideways scroll of ${o}px`);
      const small = await page.evaluate(() => [...document.querySelectorAll("main a, main button, dialog[open] button, dialog[open] a, dialog[open] [role=radio]")]
        .filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.height < 43.5 || r.width < 43.5) && !(el.tagName === "A" && el.closest("p")); })
        .map((el) => `${el.tagName} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
      expect(small.length === 0, `${what}: small targets: ${small.join("; ")}`);
      await scan(page, what);
    };
    const shot = (name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${v.label.replace(/\W+/g, "_")}-${name}.png`, fullPage: true }) : null);
    await go(page, "/app/community", null);
    await page.locator("main a[href='/app/community/friends']").waitFor({ timeout: 90000 });
    await until("the tab's number", async () => /\d/.test(await page.locator('nav a[href="/app/community"]').innerText().catch(() => "")), 20000); // (not by the bar's name: it is translated)
    await shot("hub");
    await check("hub");
    await go(page, "/app/community/friends", null);
    for (const id of ["friends-list", "blocked", "requests", "waiting"]) await page.locator(`section[aria-labelledby="${id}"]`).waitFor({ timeout: 90000 });
    await shot("friends");
    await check("friends");
    await page.locator('section[aria-labelledby="friends-list"] button[aria-label]').first().click();
    const dlg = page.locator("dialog[open]");
    await dlg.waitFor();
    await shot("friend-menu");
    await check("friend menu");
    await dlg.locator(".space-y-2 > button").first().click(); // Report
    await page.locator("dialog[open] [role=radio]").first().waitFor();
    await page.locator("dialog[open] [role=radio]").first().click();
    await shot("report");
    await check("report form");
    await page.keyboard.press("Escape");
    await go(page, "/app/community/inbox", null);
    await page.locator('main a[href^="/app/community/inbox/view?id="]').first().waitFor({ timeout: 90000 });
    await shot("inbox");
    await check("inbox");
    await page.locator('main a[href^="/app/community/inbox/view?id="]').first().click();
    await page.getByText("Milk", { exact: true }).first().waitFor({ timeout: 60000 });
    await shot("list");
    await check("a list from a friend");
    await go(page, "/app/groceries/list", null);
    const send = page.getByRole("button", { name: T("Send to a friend") });
    await send.waitFor({ timeout: 60000 });
    await shot("shopping-list");
    await check("shopping list with Send to a friend");
    await send.click();
    await page.locator("dialog[open] ul button").first().waitFor();
    await shot("send-picker");
    await check("friend picker");
    await page.locator("dialog[open] ul button").first().click();
    await shot("send-confirm");
    await check("send confirm");
    expect(errors.length === 0, errors.join(" | "));
    await ana.ctx.close();
  });
}

await step("the signed-out screens and the username sheet at 360 px and Extra large text: no sideways scroll, axe 0", async () => {
  for (const v of [{ width: 360, settings: { textSize: "xlarge" } }, { width: 360, settings: {} }]) {
    const sc = scene();
    const p = await phone(sc, "ana", { signedIn: false, width: v.width, settings: v.settings });
    await go(p.page, "/app/community/friends", null);
    await p.page.getByRole("button", { name: /Sign in|تسجيل/ }).first().waitFor({ timeout: 90000 });
    expect((await over(p.page)) <= 0, `signed-out friends overflows at ${JSON.stringify(v)}`);
    await scan(p.page, "signed-out friends " + JSON.stringify(v));
    await go(p.page, "/app/community/inbox", null);
    await p.page.getByRole("button", { name: /Sign in|تسجيل/ }).first().waitFor({ timeout: 60000 });
    expect((await over(p.page)) <= 0, `signed-out inbox overflows at ${JSON.stringify(v)}`);
    await scan(p.page, "signed-out inbox " + JSON.stringify(v));
    await p.ctx.close();
    const q = await phone(sc, "ben", { width: v.width, settings: v.settings });
    await go(q.page, "/app/community/friends", null);
    const sheet = q.page.locator("dialog[open]");
    await sheet.waitFor({ timeout: 90000 });
    await sheet.locator("input").fill("ab");
    await sheet.locator("button[type=submit]").click();
    await sheet.locator("[role=alert]").waitFor();
    expect((await over(q.page)) <= 0, `username sheet overflows at ${JSON.stringify(v)}`);
    await scan(q.page, "username sheet " + JSON.stringify(v));
    await q.ctx.close();
  }
});


await step("the username sheet: the keyboard's Return key only puts the keyboard away (the name can't be changed later), the Choose button sets it; the Terms are linked; the problem is tied to the box", async () => {
  const sc = scene();
  const p = await phone(sc, "ana");
  await go(p.page, "/app/community/friends", null);
  const sheet = p.page.getByRole("dialog", { name: "Choose a username" });
  await sheet.waitFor({ timeout: 90000 });
  const box = sheet.getByLabel("Username");
  await box.fill("oops.typo");
  await box.press("Enter");
  await p.page.waitForTimeout(600);
  expect(await sheet.isVisible(), "Return closed the sheet");
  expect((await call(sc, "ana", "GET", "community/me")).body.profile === null, "Return chose the username");
  expect((await focused(p.page)).startsWith("BUTTON") || (await focused(p.page)) === "BODY" || !(await focused(p.page)).startsWith("INPUT"), "the keyboard is still up after Return");
  // the preview is tied to the box for a screen reader
  const described = await box.getAttribute("aria-describedby");
  expect(!!described, "no aria-describedby");
  expect((await sheet.locator(`[id="${described}"]`).innerText()).includes("oops.typo"), "the box is not described by the preview");
  // the agreement, with a real link to the Terms
  await sheet.getByText("By choosing a username you agree to the", { exact: false }).waitFor();
  expect((await sheet.getByRole("link", { name: "Terms" }).getAttribute("href")) === "/terms", "the Terms link goes elsewhere");
  const link = await sheet.getByRole("link", { name: "Terms" }).boundingBox();
  expect(link.height >= 43.99, "the Terms link is " + link.height + " px high");
  // an error is the box's description too
  await box.fill("ab");
  await sheet.getByRole("button", { name: "Choose this username" }).click();
  const alert = sheet.getByRole("alert");
  await alert.waitFor();
  expect((await box.getAttribute("aria-describedby")) === (await alert.getAttribute("id")), "the problem is not tied to the box");
  // only the button chooses
  await box.fill("oops.typo");
  await sheet.getByRole("button", { name: "Choose this username" }).click();
  await sheet.waitFor({ state: "hidden", timeout: 15000 });
  expect((await call(sc, "ana", "GET", "community/me")).body.profile.username === "oops.typo", "the button did not choose it");
  expect(p.errors.length === 0, p.errors.join(" | "));
  await p.ctx.close();
});

await step("Friends: a waiting request is the first thing on the page, above the code; the sign-in sheet for friends says what Community keeps; the code reads letter by letter without a label on a paragraph; the invite note says who sees the username", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  const ben = await phone(sc, "ben", { signedIn: false });
  const a = await join(sc, "ana");
  await join(sc, "ben");
  await call(sc, "ben", "POST", "community/friends/request", { code: a.friendCode });
  await go(ana.page, "/app/community/friends", "Friends");
  const requests = ana.page.locator('section[aria-labelledby="requests"]');
  await requests.waitFor();
  await settle(ana.page);
  const accept = await ana.page.getByRole("button", { name: "Accept ben99" }).boundingBox();
  const tabTop = (await tabBar(ana.page).boundingBox()).y;
  expect(accept.y + accept.height <= tabTop, `Accept is below the first screen (y ${accept.y}, the tab bar starts at ${tabTop})`);
  const code = await ana.page.locator('section[aria-labelledby="my-code"]').boundingBox();
  expect((await requests.boundingBox()).y < code.y, "the request is below the code card");
  // the code card
  const card = ana.page.locator('section[aria-labelledby="my-code"]');
  expect((await card.locator("p.font-mono").getAttribute("aria-label")) === null, "the paragraph still carries a label");
  expect((await card.locator("p.font-mono .sr-only").innerText()) === a.friendCode.split("").join(" "), "no spoken copy of the code");
  expect((await card.innerText()).includes("Anyone who has your code can ask to be your friend, and will see your username. Share it only with people you choose."), "the invite note is missing");
  await scan(ana.page, "friends with a request first");
  // a signed-out visitor who opens the sign-in sheet to use friends sees what Community keeps
  await go(ben.page, "/app/community/friends", "Friends");
  await ben.page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  const sheet = ben.page.getByRole("dialog", { name: "Sign in" });
  await sheet.getByText("To use friends, we also keep the username you choose, your friends and the shopping lists you send and get.").waitFor();
  await ana.ctx.close(); await ben.ctx.close();
});

await step("focus: a sheet that changes view puts focus on its title; Send and Add friend keep it while they work; a failed answer is the same words and keeps focus", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana", { shopping: SHOPPING });
  await join(sc, "ana");
  const b = await join(sc, "ben");
  await makeFriends(sc, "ana", "ben", b);
  await go(ana.page, "/app/community/friends", "Friends");
  await ana.page.locator('section[aria-labelledby="friends-list"]').getByText("ben99").waitFor();
  // report, block, back: focus goes to the sheet's title each time, never the page behind
  await ana.page.getByRole("button", { name: "More options for ben99" }).click();
  const menu = ana.page.getByRole("dialog", { name: "ben99" });
  await menu.getByRole("button", { name: "Report ben99" }).click();
  await until("focus on the report title", async () => (await focused(ana.page)).startsWith("H2 Report ben99"));
  await ana.page.getByRole("dialog", { name: "Report ben99" }).getByRole("button", { name: "Cancel" }).click();
  await until("focus on the person's title", async () => (await focused(ana.page)).startsWith("H2 ben99"));
  await menu.getByRole("button", { name: "Block ben99" }).click();
  await until("focus on the block title", async () => (await focused(ana.page)).startsWith("H2 Block ben99"));
  await ana.page.getByRole("dialog", { name: "Block ben99" }).getByRole("button", { name: "Cancel" }).click();
  await menu.getByRole("button", { name: "Report ben99" }).click();
  const report = ana.page.getByRole("dialog", { name: "Report ben99" });
  await report.getByRole("radio", { name: "Spam" }).click();
  await report.getByRole("button", { name: "Send report" }).click();
  await until("focus on the thanks", async () => (await focused(ana.page)).startsWith("P Thank you"));
  await report.getByRole("button", { name: "Done" }).click();
  // Add friend keeps focus while it works, and after the same neutral answer
  let release;
  ana.device.hold = new Promise((r) => { release = r; });
  await codeBox(ana.page).fill("ZZZZ2222");
  const add = ana.page.locator('section[aria-labelledby="add-friend"] button[type=submit]'); // (its name is "Sending…" while it works)
  await add.focus();
  await ana.page.keyboard.press("Enter");
  await until("it is working", async () => (await add.getAttribute("aria-disabled")) === "true");
  expect((await focused(ana.page)).startsWith("BUTTON Sending") || (await focused(ana.page)).startsWith("BUTTON Add friend") || (await focused(ana.page)).startsWith("BUTTON"), "focus left the button while it was sending: " + (await focused(ana.page)));
  release();
  ana.device.hold = null;
  await ana.page.getByRole("alert").filter({ hasText: "We couldn't add that code. Check it and try again." }).waitFor();
  expect((await focused(ana.page)).startsWith("BUTTON"), "focus dropped to the page after the answer: " + (await focused(ana.page)));
  // Send to a friend: choosing a friend moves focus to the sheet's title; Send keeps focus while sending
  await go(ana.page, "/app/groceries/list", "Shopping list");
  await ana.page.getByRole("button", { name: "Send to a friend" }).click();
  const sheet = ana.page.getByRole("dialog", { name: "Send to a friend" });
  await sheet.getByRole("button", { name: "ben99" }).click();
  await until("focus on the send title", async () => (await focused(ana.page)).startsWith("H2 Send to a friend"));
  expect((await sheet.innerText()).includes("ben99 will see this list, and your username ana.cooks, for 30 days. Any words you typed are shown too. You can't take it back."), "the confirm does not say what the friend gets: " + (await sheet.innerText()));
  ana.device.hold = new Promise((r) => { release = r; });
  const send = sheet.getByRole("button", { name: "Send", exact: true });
  await send.focus();
  await ana.page.keyboard.press("Enter");
  await until("sending", async () => (await sheet.getByRole("button").evaluateAll((els) => els.some((e) => e.getAttribute("aria-disabled") === "true"))));
  expect((await focused(ana.page)).startsWith("BUTTON"), "focus left Send while it was sending: " + (await focused(ana.page)));
  release();
  ana.device.hold = null;
  await ana.page.getByText("Sent to ben99.").waitFor();
  expect(ana.errors.length === 0, ana.errors.join(" | "));
  await ana.ctx.close();
});

await step("a request the other person can't take (their friend list is full) says the same neutral words as any request that can't be accepted; and a day's limit says tomorrow", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana");
  await join(sc, "ana");
  const a = (await call(sc, "ana", "GET", "community/me")).body.profile;
  await join(sc, "ben");
  await call(sc, "ben", "POST", "community/friends/request", { code: a.friendCode });
  await go(ana.page, "/app/community/friends", "Friends");
  const requests = ana.page.locator('section[aria-labelledby="requests"]');
  await requests.getByText("ben99").waitFor();
  ana.device.force.push({ method: "POST", path: "community/friends/respond", status: 409, body: { error: "cannot_accept" }, times: 1 });
  await ana.page.getByRole("button", { name: "Accept ben99" }).click();
  await toastSeen(ana.page, "We couldn't accept that request. Try again later.");
  await requests.getByText("ben99").waitFor(); // still there
  expect((await focused(ana.page)).startsWith("BUTTON"), "focus left the button after a failed answer: " + (await focused(ana.page)));
  ana.device.force.push({ method: "POST", path: "community/friends/respond", status: 429, body: { error: "daily_limit" }, times: 1 });
  await ana.page.getByRole("button", { name: "Decline ben99" }).click();
  await toastSeen(ana.page, "You've reached today's limit. Try again tomorrow.");
  await ana.ctx.close();
});

await step("at Extra large text the hub cards and the inbox rows keep their words whole: the count sits beside the title and wraps under it", async () => {
  const sc = scene();
  const ana = await phone(sc, "ana", { width: 360, settings: { textSize: "xlarge" } });
  const sender = await phone(sc, "ben", { width: 360, settings: { textSize: "xlarge" } });
  const a = await join(sc, "ana");
  await join(sc, "ben", "wwwwwwwwwwwwwwwwwwww");
  const long = (await call(sc, "ben", "GET", "community/me")).body.profile;
  await call(sc, "ana", "POST", "community/friends/request", { code: long.friendCode });
  const incoming = (await call(sc, "ben", "GET", "community/friends")).body.incoming;
  await call(sc, "ben", "POST", "community/friends/respond", { id: incoming[0].id, accept: true });
  await call(sc, "ben", "POST", "community/send-list", { friendId: (await call(sc, "ben", "GET", "community/friends")).body.friends[0].id, payload: encodeLoaf() });
  await join(sc, "cleo", "cleo_c");
  await call(sc, "cleo", "POST", "community/friends/request", { code: a.friendCode });
  await call(sc, "dev", "POST", "community/friends/request", { code: a.friendCode }).catch(() => {});
  await go(ana.page, "/app/community", "Community");
  const hub = ana.page.locator("main a[href='/app/community/inbox']");
  await hub.getByText("1 new").waitFor({ timeout: 30000 });
  for (const href of ["/app/community/inbox", "/app/community/friends"]) {
    const card = ana.page.locator(`main a[href='${href}']`);
    const title = card.locator("span.text-base").first();
    const text = (await title.innerText()).trim();
    const widest = await title.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; });
    const column = (await card.locator("span.min-w-0").first().boundingBox()).width;
    expect(column >= 120, `the ${text} card's text column is ${column} px wide`);
    const lines = await title.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
    expect(lines <= 2, `"${text}" wraps onto ${lines} lines (${widest}px)`);
  }
  await go(ana.page, "/app/community/inbox", "Shared with you");
  const row = ana.page.locator('main a[href^="/app/community/inbox/view?id="]').first();
  await row.waitFor();
  const name = row.locator("span.text-base").first();
  const nameBox = await name.boundingBox();
  expect(nameBox.width >= 120, "the sender's name is squeezed to " + nameBox.width + " px");
  const rowText = (await row.innerText()).replace(/\s+/g, " ");
  expect(/wwwwwwwwwwwwwwwwwwww/.test(rowText.replace(/\s/g, "")), "the long name was cut: " + rowText);
  const meta = row.locator("span.app-numbers");
  const metaLines = await meta.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
  expect(metaLines <= 2, "the time and count wrap onto " + metaLines + " lines");
  expect((await over(ana.page)) <= 0, "overflow");
  await scan(ana.page, "inbox row at Extra large text");
  await ana.ctx.close(); await sender.ctx.close();
});

await step("a first-time visitor with an invite link goes from the last question straight to Friends with the code in the box (no recipe to choose that would lose it)", async () => {
  const sc = scene();
  const a = await join(sc, "ana");
  const p = await phone(sc, "ben", { settings: { hasCompletedOnboarding: false } });
  await join(sc, "ben");
  await p.page.goto(BASE + `/app/community/friends#${a.friendCode}`, { timeout: 120000 });
  await p.page.waitForURL(/\/app\/welcome/, { timeout: 90000 });
  const pg = p.page;
  await pg.getByRole("button", { name: "Get started" }).click();
  await pg.getByRole("button", { name: "Show me around" }).click();
  for (let i = 0; i < 4; i++) { await pg.waitForTimeout(150); await pg.getByRole("button", { name: "Continue" }).click(); }
  await pg.getByRole("button", { name: "Let's go!" }).click();
  await pg.getByRole("heading", { name: "What's your goal?" }).waitFor();
  for (let i = 0; i < 6; i++) await pg.getByRole("button", { name: "Skip" }).click();
  await pg.getByRole("heading", { name: "You're all set!" }).waitFor();
  await pg.getByRole("button", { name: "Continue" }).click();
  // for a friend's invite there is no recipe to choose: onboarding ends and the code is in the box
  await pg.waitForURL(/\/app\/community\/friends/, { timeout: 30000 });
  await pg.locator('section[aria-labelledby="my-code"], [role=dialog]').first().waitFor({ timeout: 60000 });
  if (await pg.locator("dialog[open]").count()) { await pickUsername(pg, "ben.new"); }
  await pg.locator('section[aria-labelledby="my-code"]').waitFor({ timeout: 30000 });
  await until("the invite code is in the box", async () => (await codeBox(pg).inputValue()) === a.friendCode);
  await p.ctx.close();
});


await step("a list that has run out (30 days) is not shown from the copy kept on the phone: not listed, not counted on the tab, not openable", async () => {
  const sc = scene();
  const payload = encodeEntriesFn([{ retailer: "own", kind: "typed", code: "Milk", qty: 1 }]).payload;
  const item = (n, expiresAt, readAt = null) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, from: "ben99", itemCount: 1, payload, createdAt: "2026-09-01T12:00:00.000Z", readAt, expiresAt });
  const live = item(2, new Date(Date.now() + 5 * 86400000).toISOString());
  const gone = item(1, new Date(Date.now() - 2 * 86400000).toISOString());
  const cache = { userId: uid("ana"), savedAt: Date.now() - 40 * 86400000, profile: { username: "ana.cooks", friendCode: "ABCDEFGH", createdAt: "2026-09-01T12:00:00.000Z" }, counts: { unread: 2, friendRequests: 0 }, friends: null, inbox: { items: [gone, live], unread: 2 } };
  const p = await phone(sc, "ana", { extra: { "mm.v1.community": { v: 1, data: cache } } });
  p.device.offline = true; // nothing can refresh it: only the copy on the phone is left
  await go(p.page, "/app/community/inbox", "Shared with you");
  await p.page.locator('main a[href^="/app/community/inbox/view?id="]').first().waitFor({ timeout: 60000 });
  expect((await p.page.locator('main a[href^="/app/community/inbox/view?id="]').count()) === 1, "an expired list is shown");
  expect((await p.page.locator(`main a[href="/app/community/inbox/view?id=${gone.id}"]`).count()) === 0, "the expired list is listed");
  await until("the tab counts only the list that is left", async () => /1/.test(await tabBar(p.page).getByRole("link", { name: /Community/ }).innerText()) && !/2/.test(await tabBar(p.page).getByRole("link", { name: /Community/ }).innerText()));
  await go(p.page, `/app/community/inbox/view?id=${gone.id}`, null);
  await p.page.getByText("That list isn't here any more.", { exact: false }).waitFor({ timeout: 60000 });
  await p.ctx.close();
});

await vite.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
