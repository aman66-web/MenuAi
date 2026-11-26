// Steps (founder 2026-11-26: "the app should also track peoples steps too"; lib/mm/steps.ts): Home's Steps section under Water and /app/steps, inside the phone
// apps only. The phone's bridge is FAKED here like MenuMacros/Features/WebApp/NativeBridge.swift answers "steps.*": the offer, "Turn on step counting" asking the
// phone's own question only then, today's steps against the goal, the week, the goal's − and +, "Not now", the phone's permission off (a calm line and Open
// Settings), a phone with no step counter, Stop counting steps; the website shows nothing; the step numbers are never stored or sent; 360 px / 200% text; axe.
// Run against a server with the sample data on (sign-in then is optional):
//   BASE=http://localhost:3007 node e2e/steps.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const env = (data) => JSON.stringify({ v: 1, data });
const SHOTS = process.env.SHOTS;

/** The last seven days as the phone would say them (today 4,210; yesterday 9,034; two days back nothing; three days back partial). */
function weekDays() {
  const key = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  return [{ date: key(3), steps: 2500, partial: true }, { date: key(1), steps: 9034 }, { date: key(0), steps: 4210 }];
}

// the phone: `permission` is "notDetermined" (the first ask shows the phone's question, answered with `answer`), "granted", "denied", or "none" (no step counter)
function fakeBridge({ permission, answer, days }) {
  window.__calls = [];
  window.__permission = permission;
  window.webkit = { messageHandlers: { menumath: { postMessage(m) {
    window.__calls.push({ action: m.action, payload: m.payload });
    let reply = { error: "unavailable" };
    const p = window.__permission;
    if (m.action === "steps.status") reply = p === "none" ? { error: "unavailable" } : { permission: p };
    else if (m.action === "steps.get") {
      if (p === "none") reply = { error: "unavailable" };
      else if (p === "notDetermined" && !m.payload.ask) reply = { permission: "notDetermined" };
      else {
        if (p === "notDetermined") window.__permission = answer;
        reply = window.__permission === "granted" ? { steps: days } : { error: "denied" };
      }
    } else if (m.action === "steps.openSettings" || m.action === "steps.stop") reply = { done: true };
    setTimeout(() => window.__menumathReply(m.id, reply), 30);
  } } } };
}

const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: {}, hasCompletedOnboarding: true, devProOverride: true };

async function open({ bridge = { permission: "notDetermined", answer: "granted" }, steps, path = "/app", width = 390, textScale } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
  const seed = { "mm.v1.settings": env(baseSettings), "mm.v1.tour": env(2), "mm.v1.coach": env({ armed: false, seen: ["home", "homeLater", "eatOut", "groceries", "recipes"] }), "mm.v1.homePages": env({ seen: true, slid: true, hintDays: 9, lastHintDay: "" }) };
  if (steps) seed["mm.v1.steps"] = env(steps);
  await ctx.addInitScript((list) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of list) localStorage.setItem(k, v);
  }, Object.entries(seed));
  if (bridge) await ctx.addInitScript(fakeBridge, { ...bridge, days: weekDays() });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => { if (!/^data:|^blob:/.test(r.url())) requests.push(r.url() + " " + (r.postData() ?? "")); });
  await page.goto(BASE + path);
  await page.locator("main").waitFor({ timeout: 180000 });
  if (textScale) await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% !important; }` });
  await page.waitForTimeout(1200);
  return { ctx, page, requests };
}
const calls = (page) => page.evaluate(() => window.__calls ?? []);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.steps") || "null")?.data ?? null);
const stepsHeading = (page) => page.getByRole("heading", { name: "Steps", exact: true });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function axe(page) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
  return res.violations.map((v) => `${v.id}: ${v.nodes.length}`);
}

await step("the website: no Steps on Home, none in Settings, and /app/steps says where they are", async () => {
  const { ctx, page } = await open({ bridge: null });
  await page.getByRole("heading", { name: "Water" }).waitFor();
  expect(await stepsHeading(page).count() === 0, "Steps shown on the website");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Reminders" }).waitFor();
  expect(await page.getByRole("link", { name: "Step counting" }).count() === 0, "Settings offers steps on the website");
  await page.goto(BASE + "/app/steps");
  await page.getByText("Step counting is in the Numbite app on your phone.").waitFor();
  expect(await page.getByRole("button", { name: "Turn on step counting" }).count() === 0, "an offer on the website");
  await ctx.close();
});

await step("in the app: the offer; the phone's question only on Turn on; then today's steps against 8,000", async () => {
  const { ctx, page, requests } = await open();
  await stepsHeading(page).waitFor();
  const before = await calls(page);
  expect(before.every((c) => !(c.action === "steps.get" && c.payload.ask)), "asked before the tap");
  if (SHOTS) await page.locator("#home-steps").locator("..").screenshot({ path: `${SHOTS}/steps-offer.png` });
  await page.getByRole("button", { name: "Turn on step counting" }).click();
  await page.getByText("4,210 of 8,000 steps today").waitFor();
  const asked = (await calls(page)).filter((c) => c.action === "steps.get" && c.payload.ask);
  expect(asked.length === 1 && asked[0].payload.days === 7, `asked ${JSON.stringify(asked)}`);
  expect(JSON.stringify(await stored(page)) === JSON.stringify({ on: true, dismissed: false }), `stored ${JSON.stringify(await stored(page))}`);
  // the numbers are in no store and in no request
  const all = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => k + v).join("|"));
  expect(!/4210|9034/.test(all), "a step count was stored");
  expect(!requests.some((r) => /4210|9034|steps/i.test(r.split(" ").slice(1).join(" ")) || /4210|9034/.test(r)), "a step count was sent");
  if (SHOTS) await page.locator("#home-steps").locator("..").screenshot({ path: `${SHOTS}/steps-home.png` });
  await ctx.close();
});

await step("Not now: the offer goes and stays gone; Settings › Step counting still turns it on", async () => {
  const { ctx, page } = await open();
  await page.getByRole("button", { name: "Not now" }).click();
  await page.waitForTimeout(200);
  expect(await stepsHeading(page).count() === 0, "still shown after Not now");
  await page.reload();
  await page.getByRole("heading", { name: "Water" }).waitFor();
  await page.waitForTimeout(800);
  expect(await stepsHeading(page).count() === 0, "back after a reload");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("link", { name: "Step counting" }).click();
  await page.getByRole("button", { name: "Turn on step counting" }).click();
  await page.getByText("4,210", { exact: false }).first().waitFor();
  await ctx.close();
});

await step("the week: Today, Yesterday, a day not counted, a partial day; the total and the average of whole days", async () => {
  const { ctx, page } = await open({ bridge: { permission: "granted" }, steps: { on: true, dismissed: false }, path: "/app/steps" });
  await page.getByRole("heading", { name: "Last 7 days" }).waitFor();
  const rows = page.getByRole("heading", { name: "Last 7 days" }).locator("..").getByRole("listitem");
  expect(await rows.count() === 7, `rows ${await rows.count()}`);
  const first = await rows.nth(0).innerText();
  const second = await rows.nth(1).innerText();
  expect(/Today/.test(first) && /4,210/.test(first), first);
  expect(/Yesterday/.test(second) && /9,034/.test(second), second);
  expect(/Not counted/.test(await rows.nth(2).innerText()), await rows.nth(2).innerText());
  expect(/Counted since you turned it on/.test(await rows.nth(3).innerText()), await rows.nth(3).innerText());
  await page.getByText("15,744 steps in these 7 days").waitFor();
  await page.getByText("9,034 a day on average").waitFor();
  expect(await page.getByRole("progressbar", { name: "Steps today against your goal" }).getAttribute("aria-valuenow") === "53", "today's bar");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/steps-week.png`, fullPage: true });
  await ctx.close();
});

await step("the goal: − and + move it by 500 and it is kept on this phone; Home follows it", async () => {
  const { ctx, page } = await open({ bridge: { permission: "granted" }, steps: { on: true, dismissed: false }, path: "/app/steps" });
  await page.getByRole("button", { name: "Raise the goal by 500 steps" }).click();
  await page.getByRole("button", { name: "Raise the goal by 500 steps" }).click();
  await page.getByRole("status").filter({ hasText: "9,000" }).waitFor();
  expect((await stored(page)).goal === 9000, JSON.stringify(await stored(page)));
  await page.getByRole("button", { name: "Lower the goal by 500 steps" }).click();
  expect((await stored(page)).goal === 8500, JSON.stringify(await stored(page)));
  await page.goto(BASE + "/app");
  await page.getByText("4,210 of 8,500 steps today").waitFor();
  await ctx.close();
});

await step("the phone's permission off: a calm line naming Motion & Fitness, and Open Settings asks the phone", async () => {
  const { ctx, page } = await open({ bridge: { permission: "denied" }, steps: { on: true, dismissed: false } });
  await page.getByText("Numbite can't see your steps. To allow it, turn on Motion & Fitness in Settings.").waitFor();
  await page.getByRole("button", { name: "Open Settings" }).click();
  await page.waitForTimeout(200);
  expect((await calls(page)).some((c) => c.action === "steps.openSettings"), "Settings not opened");
  await ctx.close();
});

await step("a phone with no step counter: nothing on Home or in Settings", async () => {
  const { ctx, page } = await open({ bridge: { permission: "none" } });
  await page.getByRole("heading", { name: "Water" }).waitFor();
  await page.waitForTimeout(500);
  expect(await stepsHeading(page).count() === 0, "Steps shown");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Reminders" }).waitFor();
  await page.waitForTimeout(500);
  expect(await page.getByRole("link", { name: "Step counting" }).count() === 0, "Settings offers steps");
  await ctx.close();
});

await step("Stop counting steps: off on this phone, the phone told, and Home offers it again", async () => {
  const { ctx, page } = await open({ bridge: { permission: "granted" }, steps: { on: true, dismissed: false, goal: 10000 }, path: "/app/steps" });
  await page.getByRole("button", { name: "Stop counting steps" }).click();
  await page.getByRole("button", { name: "Turn on step counting" }).waitFor();
  expect((await stored(page)).on === false, JSON.stringify(await stored(page)));
  expect((await calls(page)).some((c) => c.action === "steps.stop"), "the phone wasn't told");
  await ctx.close();
});

await step("360 px and 200% text: no sideways scroll; buttons at least 44 px; axe finds nothing on Home's card and the Steps page", async () => {
  for (const [path, steps] of [["/app", undefined], ["/app", { on: true, dismissed: false }], ["/app/steps", { on: true, dismissed: false }]]) {
    const { ctx, page } = await open({ bridge: { permission: steps ? "granted" : "notDetermined" }, steps, path, width: 360, textScale: 2 });
    await page.waitForTimeout(800);
    if (SHOTS && path === "/app/steps") await page.screenshot({ path: `${SHOTS}/steps-week-200.png`, fullPage: true });
    expect(await overflow(page) <= 0, `${path}: overflow ${await overflow(page)}`);
    const small = await page.evaluate(() => [...document.querySelectorAll("main button, main a")].filter((b) => { const r = b.getBoundingClientRect(); const s = b.closest("#home-steps, [aria-labelledby^='steps'], section"); return s && /steps/i.test(s.getAttribute("aria-labelledby") ?? "") && r.width > 0 && (r.height < 44 || r.width < 44); }).map((b) => b.textContent.trim().slice(0, 30)));
    expect(small.length === 0, `${path}: small targets ${small.join(", ")}`);
    await ctx.close();
  }
  for (const [path, steps, permission] of [["/app", undefined, "notDetermined"], ["/app", { on: true, dismissed: false }, "granted"], ["/app", { on: true, dismissed: false }, "denied"], ["/app/steps", { on: true, dismissed: false }, "granted"]]) {
    const { ctx, page } = await open({ bridge: { permission }, steps, path });
    await page.waitForTimeout(500);
    const v = await axe(page);
    expect(v.length === 0, `${path} (${permission}): ${v.join("; ")}`);
    await ctx.close();
  }
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
