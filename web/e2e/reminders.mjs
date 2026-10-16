// Home's "Reminders" section, under Water, and /app/reminders (founder 2026-10-16: "a section here for reminders, some people are GLP-1 and some people need to know
// when to have their medication, the app will send reminders to them when to have"). The reminders are the person's own: a name (up to 40 characters), how often
// (every day, certain days of the week, every few days), a time and an optional note. In the iPhone app the web side works out a plan and hands the whole plan to the
// phone, which rings at those times (faked here with the same bridge the app-build test uses); on the website nothing rings and the screens say so. Nothing about a
// reminder is ever sent to a server. Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 7).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const same = (a, b, m) => expect(JSON.stringify(a) === JSON.stringify(b), `${m}\n   got      ${JSON.stringify(a)}\n   expected ${JSON.stringify(b)}`);

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

// ---- the iPhone app's bridge, faked: answers the four notification messages like MenuMacros/App/WebApp/NativeBridge.swift does, and keeps every call.
// `permission` is what the person has told iPhone Settings ("granted", "denied") or "undecided" (the first request shows the system question, which the
// fake answers with `answer`). window.__setPermission(x) plays the person changing it in the iPhone's Settings.
function fakeBridge({ permission, answer, names }) {
  window.__calls = [];
  window.__permission = permission;
  window.__setPermission = (p) => { window.__permission = p; };
  // what the app answers: { permission: "granted" | "denied" | "notDetermined" } (MenuMacros/Features/WebApp/BridgeMessages.swift)
  const said = (p) => ({ permission: p === "undecided" ? "notDetermined" : p });
  window.webkit = { messageHandlers: { menumath: { postMessage(m) {
    window.__calls.push({ action: m.action, payload: m.payload });
    let reply;
    if (m.action === names.request) {
      if (window.__permission === "undecided") window.__permission = answer ?? "granted";
      reply = said(window.__permission);
    } else if (m.action === names.status) reply = said(window.__permission);
    else reply = { done: true };
    setTimeout(() => window.__menumathReply(m.id, reply), 30);
  } } } };
}
// the message names the page posts (lib/mm/native.ts)
const REQUEST = "notifications.requestPermission", STATUS = "notifications.status", SYNC = "notifications.syncReminders", OPEN_SETTINGS = "notifications.openSettings";

async function open(extra = {}, settings = {}, seed = {}, bridge = { permission: "undecided", answer: "granted" }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript(([s, seeds]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v);
  }, [JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }), Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, JSON.stringify({ v: 1, data: v })]))]);
  if (bridge) await ctx.addInitScript(fakeBridge, { ...bridge, names: { request: REQUEST, status: STATUS } });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("request", (r) => { if (!/^data:|^blob:/.test(r.url())) requests.push(r.method() + " " + r.url() + " " + (r.postData() ?? "")); });
  return { ctx, page, errors, requests };
}

const reminders = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.reminders") ?? "null")?.data ?? []);
const calls = (page) => page.evaluate(() => window.__calls ?? []);
const syncs = async (page) => (await calls(page)).filter((c) => c.action === SYNC);
/** The plan most recently handed to the phone. */
const lastPlan = async (page) => { const s = await syncs(page); return s.length ? s[s.length - 1].payload.items : null; };
const section = (page) => page.locator('section[aria-labelledby="home-reminders"]');
const sheet = (page) => page.locator("dialog[open]");
const addCard = (page) => section(page).getByRole("button", { name: "Add a reminder", exact: true });
async function home(page) { await page.goto(BASE + "/app", { timeout: 120000 }); await page.getByRole("heading", { name: "Reminders", exact: true }).waitFor({ timeout: 90000 }); }
async function manage(page) { await page.goto(BASE + "/app/reminders", { timeout: 120000 }); await page.getByRole("heading", { level: 1, name: "Reminders", exact: true }).waitFor({ timeout: 90000 }); }
async function openAdd(page) { await addCard(page).tap(); await sheet(page).waitFor(); await sheet(page).getByLabel("Name", { exact: true }).waitFor(); await page.waitForTimeout(700); /* the sheet slides in */ }
const saveBtn = (page) => sheet(page).getByRole("button", { name: /^Save/ });
const repeat = (page, name) => sheet(page).getByRole("radio", { name, exact: true });
const day = (page, name) => sheet(page).getByRole("button", { name, exact: true });
async function fill(page, { name, time, note, kind, days, every, start }) {
  if (name !== undefined) await sheet(page).getByLabel("Name", { exact: true }).fill(name);
  if (kind) await repeat(page, kind).tap();
  for (const d of days ?? []) await day(page, d).tap();
  if (every !== undefined) await sheet(page).getByLabel("Every how many days?").fill(String(every));
  if (start !== undefined) await sheet(page).getByLabel("First day").fill(start);
  if (time !== undefined) await sheet(page).getByLabel("Time", { exact: true }).fill(time);
  if (note !== undefined) await sheet(page).getByLabel("Note (optional)").fill(note);
}
async function add(page, fields) {
  await openAdd(page);
  await fill(page, fields);
  await saveBtn(page).tap();
  await sheet(page).waitFor({ state: "detached" });
}
const rem = (id, title, time, repeatRule, extra = {}) => ({ id, title, time, repeat: repeatRule, enabled: true, createdAt: "2026-10-01T09:00:00.000Z", ...extra });
const DAILY = { kind: "daily" };
const row = (page, title) => section(page).locator("li", { hasText: title });
const tick = (page, title) => section(page).getByRole("button", { name: `Mark ${title} done`, exact: true });
const caution = "Numbite rings at the times you choose, but a reminder may not appear if notifications are off or silenced, so don't rely on it alone. Follow the advice of your doctor or pharmacist about any medication.";
const lockLine = "The name and the note you type show on your lock screen.";

await step("with no reminders Home ends with a Reminders heading under Water and one calm 'Add a reminder' card; nothing is asked of the phone, and an empty plan is sent", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  const heading = page.getByRole("heading", { name: "Reminders", exact: true });
  expect((await heading.evaluate((h) => h.tagName)) === "H2", "the heading is an h2");
  const water = await page.getByRole("heading", { name: "Water", exact: true }).boundingBox();
  const head = await heading.boundingBox();
  expect(head.y > water.y, `Reminders (y ${head.y}) is not below Water (y ${water.y})`);
  expect((await section(page).getByRole("listitem").count()) === 0, "a reminder is shown");
  expect((await section(page).getByRole("link", { name: /Manage/ }).count()) === 0, "a Manage link with nothing to manage");
  const card = await addCard(page).boundingBox();
  expect(card.height >= 44 && card.width >= 44, `the card is ${card.width} x ${card.height}`);
  expect(/Add a reminder/.test(await section(page).innerText()), "the card's words");
  await page.waitForTimeout(600);
  const c = await calls(page);
  expect(!c.some((x) => x.action === REQUEST), "the phone was asked for notifications at launch: " + JSON.stringify(c.map((x) => x.action)));
  same(await lastPlan(page), [], "the plan sent at launch with no reminders");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("Add a reminder: the sheet has the person's own fields and the caution; Save with nothing typed says what is missing next to the field, one thing at a time, and nothing is saved", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openAdd(page);
  expect((await sheet(page).getAttribute("aria-label")) === "Add a reminder", "the sheet's name");
  const text = await sheet(page).innerText();
  expect(text.includes(caution), "the caution line is missing: " + text.slice(0, 300));
  expect(text.split(lockLine).length === 3, "the lock-screen line should be under both the name and the note: " + (text.split(lockLine).length - 1));
  const noteDesc = await sheet(page).getByLabel("Note (optional)").getAttribute("aria-describedby");
  expect(noteDesc && (await sheet(page).locator(`[id="${noteDesc}"]`).innerText()) === lockLine, "the note box isn't described by the lock-screen line: " + noteDesc);
  expect((await sheet(page).getByLabel("Name", { exact: true }).getAttribute("placeholder")) === "Morning reminder", "the neutral example name");
  expect((await sheet(page).getByLabel("Name", { exact: true }).getAttribute("maxlength")) === "40", "the name's limit");
  expect((await sheet(page).getByLabel("Note (optional)").getAttribute("maxlength")) === "120", "the note's limit");
  expect((await sheet(page).getByLabel("Time", { exact: true }).inputValue()) === "", "a time was suggested");
  const radios = await sheet(page).getByRole("radio").evaluateAll((els) => els.map((e) => [e.textContent.trim(), e.getAttribute("aria-checked")]));
  same(radios, [["Every day", "true"], ["Certain days of the week", "false"], ["Every few days", "false"]], "the three repeat choices");
  // nothing typed
  await saveBtn(page).tap();
  await sheet(page).getByText("Type a name for the reminder.", { exact: true }).waitFor();
  expect((await page.evaluate(() => document.activeElement?.id)) === (await sheet(page).getByLabel("Name", { exact: true }).getAttribute("id")), "focus did not go to the name");
  expect((await sheet(page).getByLabel("Name", { exact: true }).getAttribute("aria-invalid")) === "true", "the name is not marked invalid");
  // a name but no time
  await sheet(page).getByLabel("Name", { exact: true }).fill("Morning reminder");
  expect((await sheet(page).getByText("Type a name for the reminder.").count()) === 0, "the message stayed after typing");
  await saveBtn(page).tap();
  await sheet(page).getByText("Choose a time.", { exact: true }).waitFor();
  expect((await sheet(page).getByLabel("Time", { exact: true }).getAttribute("aria-invalid")) === "true", "the time is not marked invalid");
  // certain days with no day
  await fill(page, { time: "08:00", kind: "Certain days of the week" });
  await saveBtn(page).tap();
  await sheet(page).getByText("Choose at least one day.", { exact: true }).waitFor();
  // every few days: 1 is not allowed, 31 neither, then no first day
  await fill(page, { kind: "Every few days", every: "1" });
  await saveBtn(page).tap();
  const every = sheet(page).getByLabel("Every how many days?");
  expect((await every.getAttribute("aria-invalid")) === "true", "1 day was accepted");
  expect(/Type a number from 2 to 30\./.test(await sheet(page).innerText()), "the range is not said");
  await fill(page, { every: "31" });
  await saveBtn(page).tap();
  expect((await every.getAttribute("aria-invalid")) === "true", "31 days was accepted");
  await fill(page, { every: "3", start: "" });
  await saveBtn(page).tap();
  await sheet(page).getByText("Choose the first day.", { exact: true }).waitFor();
  expect((await reminders(page)).length === 0, "something was saved");
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  expect((await reminders(page)).length === 0, "something was saved by closing");
  await ctx.close();
});

await step("every day: saves, shows 'Every day', the time and 'Today at', asks the phone for notifications once, and hands it exactly one daily item with the neutral line", async () => {
  const { ctx, page } = await open();
  await home(page);
  await add(page, { name: "Morning tablet", time: "08:30" });
  const r = (await reminders(page))[0];
  expect(r && r.title === "Morning tablet" && r.time === "08:30" && r.enabled === true && r.repeat.kind === "daily", "stored: " + JSON.stringify(r));
  expect(!("note" in r), "an empty note was stored");
  const li = row(page, "Morning tablet");
  await li.waitFor();
  const text = (await li.innerText()).replace(/\s+/g, " ");
  expect(/Morning tablet Every day · 08:30 Today at 08:30/.test(text), "the row reads: " + text);
  const asked = (await calls(page)).filter((c) => c.action === REQUEST);
  expect(asked.length === 1, `the phone was asked ${asked.length} times`);
  await page.waitForTimeout(500);
  same(await lastPlan(page), [{ id: r.id, title: "Morning tablet", body: "Tap to open Numbite", hour: 8, minute: 30 }], "the plan");
  expect(await page.getByRole("heading", { name: "Reminders", exact: true }).evaluate((h) => document.activeElement === document.body || h.isConnected), "page broke");
  const manageLink = section(page).getByRole("link", { name: "Manage reminders" });
  expect((await manageLink.innerText()) === "Manage", "the link's word");
  expect(((await manageLink.boundingBox()).height) >= 44, "the Manage link is shorter than 44 px");
  await ctx.close();
});

await step("certain days of the week: Monday-first buttons with full names for a screen reader, at least one, stored as ISO days, handed to the phone in iPhone numbers (Sunday 1 ... Saturday 7), with a note as the notification's line", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openAdd(page);
  await fill(page, { name: "Weekly one", time: "07:15", kind: "Certain days of the week", note: "Check the pack" });
  const names = await sheet(page).getByRole("button", { pressed: false }).evaluateAll((els) => els.map((e) => e.textContent.trim()));
  const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  same(week.map((w) => names.some((n) => n.startsWith(w))), week.map(() => true), "the seven day buttons: " + JSON.stringify(names));
  const monday = await day(page, "Monday").boundingBox();
  expect(monday.height >= 44 && monday.width >= 36, `a day button is ${monday.width} x ${monday.height}`);
  const xs = [];
  for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) xs.push((await day(page, d).boundingBox()).x);
  expect(xs.every((x, i) => i === 0 || x > xs[i - 1]), "the days are not left to right Monday first: " + xs.join(","));
  await day(page, "Sunday").tap();
  await day(page, "Monday").tap();
  await day(page, "Wednesday").tap();
  await day(page, "Wednesday").tap(); // off again
  expect((await day(page, "Sunday").getAttribute("aria-pressed")) === "true" && (await day(page, "Wednesday").getAttribute("aria-pressed")) === "false", "the day buttons don't say which are on");
  await saveBtn(page).tap();
  await sheet(page).waitFor({ state: "detached" });
  const r = (await reminders(page)).find((x) => x.title === "Weekly one");
  same(r.repeat, { kind: "weekdays", days: [1, 7] }, "stored repeat");
  expect(r.note === "Check the pack", "note: " + r.note);
  await page.waitForTimeout(500);
  const item = (await lastPlan(page)).find((x) => x.id === r.id);
  same(item, { id: r.id, title: "Weekly one", body: "Check the pack", hour: 7, minute: 15, weekdays: [1, 2] }, "the plan item (Sunday = 1, Monday = 2 in iPhone numbers)");
  expect(/On Mon and Sun|On Mon, Sun|On Mon & Sun|Mon.*Sun/.test((await row(page, "Weekly one").innerText())), "the row's words: " + (await row(page, "Weekly one").innerText()));
  await ctx.close();
});

await step("one weekday reads 'Every Monday'; all seven days are 'Every day' and one daily item", async () => {
  const { ctx, page } = await open();
  await home(page);
  await add(page, { name: "Just Monday", time: "09:00", kind: "Certain days of the week", days: ["Monday"] });
  expect(/Every Monday/.test(await row(page, "Just Monday").innerText()), "words: " + (await row(page, "Just Monday").innerText()));
  await add(page, { name: "All week", time: "10:00", kind: "Certain days of the week", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] });
  expect(/Every day/.test(await row(page, "All week").innerText()), "words: " + (await row(page, "All week").innerText()));
  await page.waitForTimeout(500);
  const plan = await lastPlan(page);
  const all = plan.find((x) => x.title === "All week");
  expect(all && !("weekdays" in all), "seven days should be one repeating daily item: " + JSON.stringify(all));
  same(plan.find((x) => x.title === "Just Monday").weekdays, [2], "Monday in iPhone numbers");
  await ctx.close();
});

await step("every few days: a number from 2 to 30 and a first day; the phone gets the next 20 dates (one-off, local, every 3 days from the first day) and the row says 'Every 3 days'", async () => {
  const { ctx, page } = await open();
  await home(page);
  const first = daysFromNow(2);
  await add(page, { name: "Every third day", time: "21:05", kind: "Every few days", every: "3", start: ymd(first) });
  const r = (await reminders(page))[0];
  same(r.repeat, { kind: "everyNDays", every: 3, startDate: ymd(first) }, "stored repeat");
  await page.waitForTimeout(500);
  const item = (await lastPlan(page)).find((x) => x.id === r.id);
  const want = Array.from({ length: 20 }, (_, i) => `${ymd(daysFromNow(2 + 3 * i))}T21:05`);
  same(item, { id: r.id, title: "Every third day", body: "Tap to open Numbite", hour: 21, minute: 5, fireAt: want }, "the plan item");
  const text = (await row(page, "Every third day").innerText()).replace(/\s+/g, " ");
  expect(/Every 3 days · 21:05/.test(text), "words: " + text);
  expect(!/Today at/.test(text), "it is not for today but says so: " + text);
  // a start date in the sheet reads back in words
  await row(page, "Every third day").getByRole("button", { name: "Every third day", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  expect(/Starting on /.test(await sheet(page).innerText()), "no 'Starting on' line");
  expect((await sheet(page).getByLabel("Every how many days?").inputValue()) === "3", "the number was not kept");
  await ctx.close();
});

await step("the phone's question is asked once, when the first reminder is saved; a second and third save don't ask again; the plan grows each time", async () => {
  const { ctx, page } = await open();
  await home(page);
  await add(page, { name: "One", time: "08:00" });
  await add(page, { name: "Two", time: "12:00" });
  await add(page, { name: "Three", time: "18:00" });
  await page.waitForTimeout(500);
  const c = await calls(page);
  expect(c.filter((x) => x.action === REQUEST).length === 1, "asked " + c.filter((x) => x.action === REQUEST).length + " times");
  same((await lastPlan(page)).map((x) => x.title), ["One", "Two", "Three"], "the plan's reminders");
  // every plan sent so far was a whole plan (replace-all), never an addition
  const plans = (await syncs(page)).map((s) => s.payload.items.length);
  expect(plans[plans.length - 1] === 3 && plans.every((n, i) => i === 0 || n >= 0), "plans: " + plans);
  await ctx.close();
});

await step("Done: the round tick marks today's reminder done ('Done today', pressed), survives a reload, can be taken back; a tick from yesterday no longer counts; a reminder not for today has no tick", async () => {
  const dow = (new Date().getDay() + 6) % 7 + 1; // ISO weekday of today
  const other = dow === 3 ? 4 : 3;
  const { ctx, page } = await open({}, {}, {
    "mm.v1.reminders": [
      rem("a1", "Morning reminder", "08:00", DAILY, { doneOn: ymd(daysFromNow(-1)) }),
      rem("a2", "Another day", "09:00", { kind: "weekdays", days: [other] }),
    ],
  });
  await home(page);
  const t = tick(page, "Morning reminder");
  expect((await t.getAttribute("aria-pressed")) === "false", "yesterday's tick still counts");
  const box = await t.boundingBox();
  expect(box.width >= 44 && box.height >= 44, `the tick is ${box.width} x ${box.height}`);
  expect((await section(page).getByRole("button", { name: /Mark Another day done/ }).count()) === 0, "a reminder that is not for today has a tick");
  expect(/Today at 08:00/.test(await row(page, "Morning reminder").innerText()), "it should say when it is for today");
  await t.tap();
  expect((await t.getAttribute("aria-pressed")) === "true", "not pressed after a tap");
  expect(/Done today/.test(await row(page, "Morning reminder").innerText()), "no 'Done today'");
  expect((await reminders(page)).find((r) => r.id === "a1").doneOn === ymd(new Date()), "doneOn is not today");
  const before = (await syncs(page)).length;
  await page.reload();
  await page.getByRole("heading", { name: "Reminders", exact: true }).waitFor({ timeout: 60000 });
  expect((await tick(page, "Morning reminder").getAttribute("aria-pressed")) === "true", "lost after a reload");
  expect(!/\b(missed|late|overdue|streaks?|scores?)\b|%/i.test(await section(page).innerText()), "judging words in the section: " + (await section(page).innerText()));
  await tick(page, "Morning reminder").tap();
  expect((await tick(page, "Morning reminder").getAttribute("aria-pressed")) === "false", "the tick can't be taken back");
  expect(!("doneOn" in (await reminders(page)).find((r) => r.id === "a1")), "doneOn left after taking it back");
  // ticking changes nothing the phone rings, so no new plan was needed for it
  expect((await syncs(page)).length >= before, "sanity");
  await ctx.close();
});

await step("order on Home: reminders for today first by time, then the others, paused last; a paused one has no tick, says 'Paused' and is not in the plan; Pause and Resume work from /app/reminders", async () => {
  const dow = (new Date().getDay() + 6) % 7 + 1;
  const other = dow === 3 ? 4 : 3;
  const { ctx, page } = await open({}, {}, {
    "mm.v1.reminders": [
      rem("b1", "Evening one", "20:00", DAILY),
      rem("b2", "Not today", "07:00", { kind: "weekdays", days: [other] }),
      rem("b3", "Early one", "06:00", DAILY),
      rem("b4", "Resting", "05:00", DAILY, { enabled: false }),
    ],
  });
  await home(page);
  const titles = await section(page).locator("li").evaluateAll((els) => els.map((e) => e.querySelector("button[aria-describedby]")?.textContent.trim()));
  same(titles, ["Early one", "Evening one", "Not today", "Resting"], "the order");
  const resting = row(page, "Resting");
  expect(/Paused/.test(await resting.innerText()), "no 'Paused'");
  expect((await resting.getByRole("button", { name: /Mark/ }).count()) === 0, "a paused reminder has a tick");
  await page.waitForTimeout(500);
  same((await lastPlan(page)).map((x) => x.id).sort(), ["b1", "b2", "b3"], "a paused reminder is in the plan");
  await manage(page);
  const rowOf = (title) => page.locator("li", { hasText: title });
  await rowOf("Early one").getByRole("button", { name: "Pause Early one", exact: true }).tap();
  await page.waitForTimeout(500);
  expect(/Paused/.test(await rowOf("Early one").innerText()), "the page doesn't say it is paused");
  same((await lastPlan(page)).map((x) => x.id).sort(), ["b1", "b2"], "pausing didn't take it out of the plan");
  await rowOf("Resting").getByRole("button", { name: "Resume Resting", exact: true }).tap();
  await page.waitForTimeout(500);
  same((await lastPlan(page)).map((x) => x.id).sort(), ["b1", "b2", "b4"], "resuming didn't put it back");
  expect((await reminders(page)).find((r) => r.id === "b4").enabled === true, "stored enabled");
  await ctx.close();
});

await step("Edit from Home: tapping the name opens the sheet with the values; Pause from the sheet saves and pauses; Save changes updates in place (same id)", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": [rem("c1", "Edit me", "10:00", { kind: "weekdays", days: [2, 4] }, { note: "A note" })] });
  await home(page);
  await row(page, "Edit me").getByRole("button", { name: "Edit me", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  expect((await sheet(page).getAttribute("aria-label")) === "Edit reminder", "sheet title");
  expect((await sheet(page).getByLabel("Name", { exact: true }).inputValue()) === "Edit me", "name");
  expect((await sheet(page).getByLabel("Time", { exact: true }).inputValue()) === "10:00", "time");
  expect((await sheet(page).getByLabel("Note (optional)").inputValue()) === "A note", "note");
  expect((await repeat(page, "Certain days of the week").getAttribute("aria-checked")) === "true", "repeat");
  expect((await day(page, "Tuesday").getAttribute("aria-pressed")) === "true" && (await day(page, "Thursday").getAttribute("aria-pressed")) === "true" && (await day(page, "Monday").getAttribute("aria-pressed")) === "false", "days");
  await sheet(page).getByLabel("Name", { exact: true }).fill("Edited");
  await sheet(page).getByLabel("Time", { exact: true }).fill("11:45");
  await sheet(page).getByRole("button", { name: "Save changes", exact: true }).tap();
  await sheet(page).waitFor({ state: "detached" });
  const list = await reminders(page);
  expect(list.length === 1 && list[0].id === "c1" && list[0].title === "Edited" && list[0].time === "11:45", "saved: " + JSON.stringify(list));
  await row(page, "Edited").getByRole("button", { name: "Edited", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  await sheet(page).getByRole("button", { name: "Pause", exact: true }).tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await reminders(page))[0].enabled === false, "not paused");
  await page.waitForTimeout(500);
  same(await lastPlan(page), [], "a paused reminder is still in the plan");
  await row(page, "Edited").getByRole("button", { name: "Edited", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  expect((await sheet(page).getByRole("button", { name: "Resume", exact: true }).count()) === 1, "no Resume");
  await ctx.close();
});

await step("Delete asks first ('Delete this reminder?'); Cancel keeps it; Delete removes it, takes it out of the plan and offers Undo for 8 seconds, which puts it back exactly", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": [rem("d1", "Keep or go", "08:00", DAILY, { note: "N" }), rem("d2", "Stays", "09:00", DAILY, { createdAt: "2026-10-02T09:00:00.000Z" })] });
  await home(page);
  const askDelete = async () => {
    await row(page, "Keep or go").getByRole("button", { name: "Keep or go", exact: true }).tap();
    await sheet(page).waitFor();
    await page.waitForTimeout(700);
    await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
    await page.waitForTimeout(700);
  };
  await askDelete();
  expect((await sheet(page).getAttribute("aria-label")) === "Delete this reminder?", "no question: " + (await sheet(page).getAttribute("aria-label")));
  expect(/Keep or go/.test(await sheet(page).innerText()), "the question doesn't name the reminder");
  expect((await reminders(page)).length === 2, "deleted before the answer");
  await sheet(page).getByRole("button", { name: "Cancel", exact: true }).tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await reminders(page)).length === 2, "Cancel deleted it");
  await askDelete();
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await reminders(page)).map((r) => r.id).join() === "d2", "not deleted");
  const bar = page.getByRole("status").filter({ hasText: "Reminder deleted." });
  await bar.waitFor();
  await page.waitForTimeout(500);
  same((await lastPlan(page)).map((x) => x.id), ["d2"], "plan after delete");
  await bar.getByRole("button", { name: "Undo", exact: true }).tap();
  const back = await reminders(page);
  expect(back.map((r) => r.id).join() === "d1,d2" && back[0].note === "N" && back[0].createdAt === "2026-10-01T09:00:00.000Z", "Undo didn't restore it exactly: " + JSON.stringify(back));
  await page.waitForTimeout(500);
  same((await lastPlan(page)).map((x) => x.id), ["d1", "d2"], "plan after Undo");
  // the bar goes by itself
  await row(page, "Stays").getByRole("button", { name: "Stays", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  await page.waitForTimeout(700);
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  await bar.waitFor();
  await page.waitForTimeout(8600);
  expect((await bar.count()) === 0, "the Undo bar stayed past 8 seconds");
  await ctx.close();
});

await step("the limit: 12 reminders, then the Add card is replaced by 'You can have up to 12 reminders.' on Home and on /app/reminders; deleting one brings Add back", async () => {
  const twelve = Array.from({ length: 12 }, (_, i) => rem("l" + i, "Reminder " + (i + 1), `${pad(6 + i)}:00`, DAILY));
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": twelve });
  await home(page);
  expect((await addCard(page).count()) === 0, "Add card at the limit");
  expect(/You can have up to 12 reminders\./.test(await section(page).innerText()), "no limit line");
  await manage(page);
  expect((await page.getByRole("button", { name: "Add a reminder" }).count()) === 0, "Add button at the limit on the page");
  expect(/You can have up to 12 reminders\./.test(await page.locator("main").innerText()), "no limit line on the page");
  const eleven = Array.from({ length: 11 }, (_, i) => rem("m" + i, "Reminder " + (i + 1), `${pad(6 + i)}:00`, DAILY));
  const b = await open({}, {}, { "mm.v1.reminders": eleven });
  await home(b.page);
  await add(b.page, { name: "The twelfth", time: "23:00" });
  expect((await reminders(b.page)).length === 12, "not saved");
  expect((await addCard(b.page).count()) === 0, "Add card after the twelfth");
  await b.ctx.close();
  await ctx.close();
});

await step("website (no iPhone bridge): the section works as a list with the Done tick, and says plainly that reminders ring in the iPhone app; nothing is asked of a phone", async () => {
  const { ctx, page, errors } = await open({}, {}, {}, null);
  await home(page);
  const line = "Reminders ring in the Numbite iPhone app. On the website you'll see what's due today here.";
  await section(page).getByText(line, { exact: true }).waitFor();
  await add(page, { name: "Website one", time: "08:00" });
  await row(page, "Website one").waitFor();
  await tick(page, "Website one").tap();
  expect((await tick(page, "Website one").getAttribute("aria-pressed")) === "true", "the tick doesn't work on the website");
  expect((await section(page).getByText(line).count()) === 1, "the line is gone or doubled");
  await manage(page);
  expect((await page.getByText(line).count()) === 1, "the line is missing on /app/reminders");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("notifications refused in iPhone Settings: a calm line with an 'Open Settings' button that opens them; when they are turned on again and the app comes back to the front, the line goes", async () => {
  const { ctx, page } = await open({}, {}, {}, { permission: "undecided", answer: "denied" });
  await home(page);
  await add(page, { name: "Denied one", time: "08:00" });
  const line = "Notifications are off for Numbite, so reminders won't ring. Turn them on in your iPhone's Settings.";
  await section(page).getByText(line, { exact: true }).waitFor();
  const live = await section(page).getByText(line).evaluate((el) => !!el.closest("[role=status]"));
  expect(live, "the line isn't in a live region");
  await section(page).getByRole("button", { name: "Open Settings", exact: true }).tap();
  await page.waitForTimeout(300);
  expect((await calls(page)).some((c) => c.action === OPEN_SETTINGS), "the bridge was not asked to open Settings");
  await page.evaluate(() => { window.__setPermission("granted"); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(700);
  expect((await section(page).getByText(line).count()) === 0, "the line stayed after notifications were turned on");
  // the request is never repeated for this person
  expect((await calls(page)).filter((c) => c.action === REQUEST).length === 1, "asked more than once");
  await ctx.close();
});

await step("the plan is sent again when the app comes back to the front (so 'every few days' dates roll forward) and a paused or deleted reminder never reaches the phone", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": [rem("f1", "Rolling", "09:00", { kind: "everyNDays", every: 2, startDate: ymd(daysFromNow(-10)) })] }, { permission: "granted" });
  await home(page);
  await page.waitForTimeout(600);
  const before = (await syncs(page)).length;
  expect(before >= 1, "no plan at start");
  const first = (await lastPlan(page))[0];
  expect(first.fireAt.length === 20 && first.fireAt.every((d) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d)), "fireAt: " + JSON.stringify(first.fireAt?.slice(0, 2)));
  await page.waitForTimeout(2300);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(500);
  expect((await syncs(page)).length === before + 1, `coming back sent ${(await syncs(page)).length - before} plans`);
  await ctx.close();
});

await step("nothing about a reminder is sent anywhere: no request mentions the name, the note or the times while reminders are added, ticked, paused, deleted and cleared", async () => {
  const { ctx, page, requests } = await open();
  await home(page);
  await add(page, { name: "Quokka tablet", time: "13:37", note: "Zebra note" });
  await tick(page, "Quokka tablet").tap();
  await manage(page);
  await page.locator("li", { hasText: "Quokka tablet" }).getByRole("button", { name: "Pause Quokka tablet", exact: true }).tap();
  await page.locator("li", { hasText: "Quokka tablet" }).getByRole("button", { name: "Delete Quokka tablet", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  await page.waitForTimeout(3500); // past a sync's debounce, in case anything were wired
  const leaked = requests.filter((r) => /quokka|zebra|13:37|reminder/i.test(r.replace(/\/_next\/[^\s]*/g, "").replace(/\/app\/reminders/g, "")));
  expect(leaked.length === 0, "a request mentions a reminder: " + leaked.slice(0, 3).join(" | "));
  expect(!requests.some((r) => /api\/v1\/sync/.test(r)), "a sync request went out for a person who isn't signed in");
  await ctx.close();
});

await step("Settings has a Reminders row to /app/reminders; Clear data removes every reminder and sends the phone an empty plan", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": [rem("s1", "Clear me", "08:00", DAILY), rem("s2", "Me too", "09:00", DAILY)] });
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Reminders", exact: true }).waitFor({ timeout: 90000 });
  await page.getByRole("link", { name: "Manage reminders" }).tap();
  await page.getByRole("heading", { level: 1, name: "Reminders", exact: true }).waitFor();
  expect(page.url().endsWith("/app/reminders"), "url " + page.url());
  expect((await page.locator("li", { hasText: "Clear me" }).count()) === 1, "the list");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Clear data on this device", exact: true }).tap();
  await sheet(page).waitFor();
  expect(/reminders/.test(await sheet(page).innerText()), "the sheet doesn't say reminders go: " + (await sheet(page).innerText()).slice(0, 220));
  await page.waitForTimeout(500);
  expect((await lastPlan(page)).length === 2, "the plan before clearing");
  await sheet(page).getByRole("button", { name: "Clear everything", exact: true }).tap();
  await page.waitForTimeout(900);
  expect((await reminders(page)).length === 0, "reminders left: " + JSON.stringify(await reminders(page)));
  same(await lastPlan(page), [], "the plan after clearing");
  await ctx.close();
});

await step("a damaged store is read safely: bad rows are dropped, long text is cut, and the page still opens", async () => {
  const bad = [
    rem("g1", "x".repeat(300), "08:00", DAILY, { note: "n".repeat(500) }),
    { id: "g2", title: "<b>No time</b>", repeat: DAILY, enabled: true },
    "nonsense",
    rem("g3", "Fine", "25:61", DAILY),
    rem("g4", "Good", "08:05", { kind: "weekdays", days: [9] }),
    rem("g5", "Alright", "08:05", { kind: "weekdays", days: [3, 3, 1] }),
  ];
  const { ctx, page, errors } = await open({}, {}, { "mm.v1.reminders": bad });
  await home(page);
  const shown = await section(page).locator("li").count();
  expect(shown === 2, "shows " + shown + " rows");
  const stored = (await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.reminders")).data));
  expect(stored.length === 6, "the raw store is left alone until something changes it: " + stored.length);
  const shownTitle = await section(page).locator("li").first().locator("button[aria-describedby]").innerText();
  expect(shownTitle.length === 40, "a 300-character name shows as " + shownTitle.length + " characters");
  expect(errors.length === 0, errors.join(" | "));
  expect((await page.getByText("<b>No time</b>").count()) === 0, "markup shown");
  await ctx.close();
});

await step("review fixes, the sheet: the name and the note boxes don't spell-check or autocorrect; the lock-screen line sits under both boxes and stays when the name is wrong; the caution says a reminder may not appear; the messages are alerts and the first day button is described by 'Choose at least one day.'", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openAdd(page);
  for (const label of ["Name", "Note (optional)"]) {
    const el = sheet(page).getByLabel(label, { exact: true });
    expect((await el.getAttribute("spellcheck")) === "false", `${label}: spellcheck is ${await el.getAttribute("spellcheck")}`);
    expect((await el.getAttribute("autocorrect")) === "off", `${label}: autocorrect is ${await el.getAttribute("autocorrect")}`);
    expect((await el.evaluate((e) => e.spellcheck)) === false, `${label}: the browser still spell-checks`);
  }
  expect((await sheet(page).getByLabel("Name", { exact: true }).getAttribute("autocapitalize")) === "sentences", "the name's capital letter");
  expect((await sheet(page).innerText()).includes(caution), "the new caution");
  // a wrong name: the message replaces the hint under the name, but the note's lock-screen line is still there
  await saveBtn(page).tap();
  const alert = sheet(page).getByText("Type a name for the reminder.", { exact: true });
  await alert.waitFor();
  expect((await alert.getAttribute("role")) === "alert", "the name message is not an alert");
  expect((await sheet(page).getByText(lockLine).count()) === 1, "the lock-screen line should still show once (under the note)");
  // every validation message is an alert
  await fill(page, { name: "Alerts", time: "" });
  await saveBtn(page).tap();
  expect((await sheet(page).getByText("Choose a time.", { exact: true }).getAttribute("role")) === "alert", "time message");
  await fill(page, { time: "08:00", kind: "Certain days of the week" });
  await saveBtn(page).tap();
  const days = sheet(page).getByText("Choose at least one day.", { exact: true });
  await days.waitFor();
  expect((await days.getAttribute("role")) === "alert", "days message");
  const first = await page.evaluate(() => { const a = document.activeElement; return { id: a?.id, desc: a?.getAttribute("aria-describedby") }; });
  expect(first.desc && (await sheet(page).locator(`[id="${first.desc}"]`).innerText()) === "Choose at least one day.", "the focused Monday button isn't described by the message: " + JSON.stringify(first));
  await fill(page, { kind: "Every few days", every: "9", start: "" });
  await saveBtn(page).tap();
  const start = sheet(page).getByText("Choose the first day.", { exact: true });
  await start.waitFor();
  expect((await start.getAttribute("role")) === "alert", "first-day message");
  // the 'every few days' honesty line
  const rolls = "Numbite sets these reminders up each time you open it. If you don't open Numbite for a while, this one can stop ringing.";
  expect((await sheet(page).getByText(rolls, { exact: true }).count()) === 1, "no line about every-few-days reminders stopping");
  await repeat(page, "Every day").tap();
  expect((await sheet(page).getByText(rolls, { exact: true }).count()) === 0, "the every-few-days line shows for another kind");
  await ctx.close();
});

await step("review fixes, the website: no lock screen and no ringing, so the sheet doesn't promise either, and says reminders ring in the iPhone app", async () => {
  const { ctx, page } = await open({}, {}, {}, null);
  await home(page);
  await openAdd(page);
  const text = await sheet(page).innerText();
  expect(!text.includes("lock screen"), "the lock-screen line on the website");
  expect(text.includes("Reminders ring in the Numbite iPhone app. On the website you'll see what's due today here."), "the website line is missing in the sheet: " + text.slice(-400));
  expect(text.includes(caution), "the caution");
  await ctx.close();
});

await step("review fixes, Delete: a quick second tap on Delete can't delete (the question's Delete waits and looks switched off, and ignores a click even when forced), Cancel is the big black button on top and works at once, and a later tap deletes with Undo", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": [rem("q1", "Double tap me", "08:00", DAILY)] });
  await home(page);
  const openEdit = async () => {
    await row(page, "Double tap me").getByRole("button", { name: "Double tap me", exact: true }).tap();
    await sheet(page).waitFor();
    await page.waitForTimeout(700);
  };
  // a double tap on the edit sheet's Delete, at the same spot: the second tap lands on whatever the question has there (Cancel, or its Delete): either way nothing is deleted
  for (const gap of [150, 400, 650]) {
    await openEdit();
    const del = sheet(page).getByRole("button", { name: "Delete", exact: true });
    await del.scrollIntoViewIfNeeded();
    const box = await del.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(gap);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(300);
    expect((await reminders(page)).length === 1, `a double tap ${gap} ms apart deleted the reminder`);
    if (await sheet(page).count()) {
      await page.keyboard.press("Escape");
      await sheet(page).waitFor({ state: "detached" });
    }
  }
  // the question's own Delete, tapped at once: switched off, and a click forced through the switch is ignored too
  await openEdit();
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  const cancel = sheet(page).getByRole("button", { name: "Cancel", exact: true });
  const del = sheet(page).getByRole("button", { name: "Delete", exact: true });
  await cancel.waitFor();
  expect((await sheet(page).getAttribute("aria-label")) === "Delete this reminder?", "the question isn't open");
  expect(await del.isDisabled(), "the question's Delete is not switched off in its first moments");
  await del.evaluate((el) => { el.disabled = false; el.click(); });
  await page.waitForTimeout(150);
  expect((await reminders(page)).length === 1, "a click forced through in the first moments deleted it");
  expect((await sheet(page).count()) === 1, "the question closed");
  // layout: Cancel above Delete, Cancel is the big dark one
  const cb = await cancel.boundingBox(), db = await del.boundingBox();
  expect(cb.y < db.y, `Cancel (${cb.y}) is not above Delete (${db.y})`);
  expect(cb.height >= 47 && cb.height >= db.height, `Cancel is ${cb.height} high, Delete ${db.height}`);
  expect((await cancel.evaluate((e) => getComputedStyle(e).backgroundColor)) !== (await del.evaluate((e) => getComputedStyle(e).backgroundColor)), "Cancel looks like Delete");
  // Cancel works at once
  await cancel.tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await reminders(page)).length === 1, "Cancel deleted it");
  // a considered tap, a second later, deletes (with Undo)
  await openEdit();
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  await page.waitForTimeout(1000);
  const later = sheet(page).getByRole("button", { name: "Delete", exact: true });
  expect(!(await later.isDisabled()), "Delete never switches on");
  await later.tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await reminders(page)).length === 0, "a considered tap did not delete");
  await page.getByRole("status").filter({ hasText: "Reminder deleted." }).getByRole("button", { name: "Undo", exact: true }).tap();
  expect((await reminders(page)).length === 1, "Undo");
  await ctx.close();
});

await step("review fixes, the rows: 'Next: …' for a reminder that isn't for today, 'Won't ring' on the ones the phone has no room for, no stray dot starting a line, 'Done' footnote, and a worded Edit button on /app/reminders", async () => {
  const dow = (new Date().getDay() + 6) % 7 + 1;
  const other = dow === 3 ? 4 : 3;
  const twelve = Array.from({ length: 12 }, (_, i) => rem("w" + i, "Six days " + (i + 1), `${pad(6 + i)}:00`, { kind: "weekdays", days: [1, 2, 3, 4, 5, 6] }));
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": twelve }, { permission: "granted" });
  await home(page);
  await page.waitForTimeout(800);
  // 12 x 6 = 72 > 60: the last two (the costliest ties go to the later ones) won't ring
  const plan = await lastPlan(page);
  const dropped = twelve.map((r) => r.id).filter((id) => !plan.some((p) => p.id === id));
  same(dropped, ["w10", "w11"], "which reminders the phone has no room for");
  const wont = await section(page).locator("li", { hasText: "Won't ring" }).evaluateAll((els) => els.map((e) => e.querySelector("button[aria-describedby]").textContent.trim()));
  same(wont.sort(), ["Six days 11", "Six days 12"], "the rows marked Won't ring");
  const notice = "Some reminders won't ring: the phone can keep only so many notifications. Delete or pause the ones you don't need.";
  await section(page).getByText(notice, { exact: true }).waitFor();
  expect(!/Choose fewer days/.test(await section(page).innerText()), "the old advice to change the days");
  // the dot never begins a line: on the same line as the word before it
  for (const w of [390, 360]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(200);
    const lines = await section(page).locator("li p[id$='-details']").evaluateAll((ps) => ps.map((p) => {
      const dot = [...p.querySelectorAll("span[aria-hidden]")].find((x) => x.textContent.includes("·"));
      const r = document.createRange();
      r.selectNodeContents(dot);
      const dotRect = r.getClientRects();
      const before = dot.previousSibling;
      const r2 = document.createRange();
      r2.setStart(before, Math.max(0, before.textContent.length - 1));
      r2.setEnd(before, before.textContent.length);
      const prev = r2.getBoundingClientRect();
      return { dotTop: dotRect[dotRect.length - 1].top, prevTop: prev.top };
    }));
    for (const l of lines) expect(Math.abs(l.dotTop - l.prevTop) < 3, `${w}px: the dot starts a new line (${JSON.stringify(l)})`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // the status wrapper is in the page's structure even when empty
  expect((await section(page).locator("[role=status]").first().evaluate((e) => getComputedStyle(e).display)) !== "none", "the status wrapper is display:none");
  // /app/reminders: the pill, an Edit button with a word, 44 px
  await manage(page);
  expect((await page.locator("li", { hasText: "Six days 12" }).getByText("Won't ring", { exact: true }).count()) === 1, "no Won't ring on the page");
  const edit = page.locator("li", { hasText: "Six days 3" }).getByRole("button", { name: "Edit Six days 3", exact: true });
  expect((await edit.innerText()) === "Edit", "the Edit button's word: " + (await edit.innerText()));
  expect((await edit.boundingBox()).height >= 43.5, "Edit is shorter than 44 px");
  await edit.tap();
  await sheet(page).waitFor();
  expect((await sheet(page).getAttribute("aria-label")) === "Edit reminder", "Edit opened " + (await sheet(page).getAttribute("aria-label")));
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  expect(/Ticking “Done” is only your own mark\. It doesn't stop a reminder from ringing later today\./.test(await page.locator("main").innerText()), "the footnote on /app/reminders");
  await ctx.close();

  // 'Next: …' and the footnote on Home
  const b = await open({}, {}, { "mm.v1.reminders": [rem("n1", "Not today", "07:00", { kind: "weekdays", days: [other] }), rem("n2", "Every third", "21:30", { kind: "everyNDays", every: 3, startDate: ymd(daysFromNow(1)) }), rem("n3", "Paused one", "05:00", DAILY, { enabled: false })] }, { permission: "granted" });
  await home(b.page);
  const nextOf = async (title) => (await row(b.page, title).innerText()).replace(/\s+/g, " ");
  expect(/Next: \w{3},? \d{1,2} \w{3}/.test(await nextOf("Not today")), "Next on a weekly reminder: " + (await nextOf("Not today")));
  const want = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(daysFromNow(1));
  // (the browser's ICU may write "Sat, 17 Oct" where Node's writes "Sat 17 Oct": compare without the comma)
  expect((await nextOf("Every third")).replace(",", "").includes("Next: " + want.replace(",", "")), `every-third should say Next: ${want}: ` + (await nextOf("Every third")));
  expect(!/Next:/.test(await nextOf("Paused one")), "a paused reminder says when it is next");
  expect(!/Ticking/.test(await section(b.page).innerText()), "the footnote shows with nothing for today");
  await b.ctx.close();
  const c = await open({}, {}, { "mm.v1.reminders": [rem("t1", "For today", "08:00", DAILY)] });
  await home(c.page);
  expect(/Ticking “Done” is only your own mark\. It doesn't stop a reminder from ringing later today\./.test(await section(c.page).innerText()), "no footnote on Home next to a tick");
  await c.ctx.close();
});

await step("review fixes, day buttons: seven across at 390 px, and on a 375 or 360 px phone four and three so each is 44 px wide", async () => {
  for (const [w, seven] of [[390, true], [375, false], [360, false]]) {
    const { ctx, page } = await open({ viewport: { width: w, height: 800 } });
    await home(page);
    await openAdd(page);
    await repeat(page, "Certain days of the week").tap();
    await page.waitForTimeout(250);
    const boxes = [];
    for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) boxes.push(await day(page, d).boundingBox());
    expect(boxes.every((b) => b.width >= 43.5 && b.height >= 43.5), `${w}px: a day button is smaller than 44 px: ` + boxes.map((b) => Math.round(b.width * 10) / 10 + "x" + b.height).join(","));
    expect(new Set(boxes.map((b) => Math.round(b.y))).size === (seven ? 1 : 2), `${w}px: rows ${new Set(boxes.map((b) => Math.round(b.y))).size}`);
    expect(boxes.every((b) => b.x >= 0 && b.x + b.width <= w), `${w}px: a day button runs off the screen`);
    await ctx.close();
  }
});

await step("review fixes, safety of the data: a tick dated after today is taken away when the app opens; a name with joiners reaches the phone unchanged; a half emoji leaves no stray space", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.reminders": [rem("f1", "Tick from the future", "08:00", DAILY, { doneOn: ymd(daysFromNow(3)) }), rem("f2", "Tick from yesterday", "09:00", DAILY, { doneOn: ymd(daysFromNow(-1)) })] }, { permission: "granted" });
  await home(page);
  await page.waitForTimeout(500);
  const list = await reminders(page);
  expect(!("doneOn" in list.find((r) => r.id === "f1")), "the future tick is still stored: " + JSON.stringify(list.find((r) => r.id === "f1")));
  expect(list.find((r) => r.id === "f2").doneOn === ymd(daysFromNow(-1)), "yesterday's tick was touched");
  expect((await tick(page, "Tick from the future").getAttribute("aria-pressed")) === "false", "shown as done");
  // a Persian word with a zero-width non-joiner, and a family emoji (joined with zero-width joiners)
  const persian = "می‌خواهم";
  await add(page, { name: persian, time: "10:00" });
  await add(page, { name: "Family \u{1F468}‍\u{1F469}‍\u{1F467}", time: "11:00" });
  await page.waitForTimeout(500);
  const plan = await lastPlan(page);
  expect(plan.some((p) => p.title === persian), "the joiner was lost on the way to the phone: " + JSON.stringify(plan.map((p) => p.title)));
  expect(plan.some((p) => p.title === "Family \u{1F468}‍\u{1F469}‍\u{1F467}"), "the emoji was split");
  await ctx.close();
});

await step("360 px, Extra large text and Arabic: no sideways scroll on Home, /app/reminders or in the sheet; the tick, the name, + and the day buttons are whole, 44 px and on screen; Arabic reads right to left", async () => {
  const seed = {
    "mm.v1.reminders": [
      rem("z1", "A rather long name for a reminder, forty ch", "08:00", { kind: "weekdays", days: [1, 3, 5] }, { note: "A longer note that goes on for some time to see how it wraps in a narrow place" }),
      rem("z2", "Second", "20:30", { kind: "everyNDays", every: 14, startDate: "2026-10-01" }),
      rem("z3", "Third", "12:00", DAILY, { enabled: false }),
    ],
  };
  for (const [label, o, st] of [["360 px", { viewport: { width: 360, height: 780 } }, {}], ["Extra large", {}, { textSize: "xlarge" }], ["Arabic", { locale: "ar" }, { language: "ar" }]]) {
    const width = o.viewport?.width ?? 390;
    const { ctx, page } = await open(o, st, seed);
    await page.goto(BASE + "/app");
    await section(page).waitFor({ timeout: 90000 });
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect((await over()) <= 0, `${label}: sideways scroll ${await over()} on Home`);
    const buttons = section(page).getByRole("button");
    const n = await buttons.count();
    expect(n >= 4, `${label}: ${n} buttons`);
    for (let i = 0; i < n; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box.height >= 43.5 && box.width >= 43.5 || (await buttons.nth(i).getAttribute("aria-describedby")), `${label}: button ${i} is ${box.width} x ${box.height}`);
      expect(box.x >= -0.5 && box.x + box.width <= width + 0.5, `${label}: button ${i} runs off the screen (${JSON.stringify(box)})`);
    }
    if (label === "Arabic") expect((await section(page).evaluate((el) => getComputedStyle(el).direction)) === "rtl", "direction");
    await page.goto(BASE + "/app/reminders");
    await page.locator("li").first().waitFor({ timeout: 90000 });
    expect((await over()) <= 0, `${label}: sideways scroll ${await over()} on /app/reminders`);
    for (const b of await page.locator("main li button").all()) {
      const box = await b.boundingBox();
      expect(box.height >= 43.5 && box.x >= -0.5 && box.x + box.width <= width + 0.5, `${label}: a button on the page is ${JSON.stringify(box)}`);
    }
    await page.locator("main").getByRole("button").last().tap();
    await sheet(page).waitFor();
    await sheet(page).locator("input").first().waitFor();
    await page.waitForTimeout(700);
    const fits = () => sheet(page).evaluate((d) => { const p = d.querySelector(".sheet-panel"); return p.scrollWidth - p.clientWidth; });
    expect((await over()) <= 0 && (await fits()) <= 0, `${label}: sideways scroll with the sheet open (${await over()}, ${await fits()})`);
    for (const kind of [1, 2]) {
      await sheet(page).getByRole("radio").nth(kind).tap();
      await page.waitForTimeout(250);
      expect((await over()) <= 0 && (await fits()) <= 0, `${label}: sideways scroll in the sheet, repeat ${kind} (${await over()}, ${await fits()})`);
      for (const el of await sheet(page).locator("input, [role=radio], [aria-pressed], button:not([aria-label=Close])").all()) {
        if (!(await el.isVisible())) continue;
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        expect(box.x >= -0.5 && box.x + box.width <= width + 0.5, `${label}: ${await el.evaluate((e) => e.outerHTML.slice(0, 80))} ${JSON.stringify(box)} runs off the screen`);
        expect(box.height >= 43.5, `${label}: ${await el.evaluate((e) => e.outerHTML.slice(0, 80))} is ${box.height} high`);
      }
    }
    if (label === "Arabic") expect((await sheet(page).evaluate((d) => getComputedStyle(d).direction)) === "rtl", "sheet direction");
    await ctx.close();
  }
});

await step("axe: no violations on Home with reminders (a done one, a paused one), the Add and Edit sheets (every kind, with a message showing), the delete question and /app/reminders", async () => {
  const { ctx, page } = await open({}, {}, {
    "mm.v1.reminders": [
      rem("x1", "Morning reminder", "08:00", DAILY, { doneOn: ymd(new Date()) }),
      rem("x2", "Weekly", "09:00", { kind: "weekdays", days: [1] }),
      rem("x3", "Paused one", "10:00", DAILY, { enabled: false, note: "A note" }),
    ],
  });
  const check = async (label) => {
    await page.waitForTimeout(900);
    await page.addScriptTag({ path: AXE }).catch(() => {});
    const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
    expect(res.violations.length === 0, label + ": " + res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 110)).join(" | "));
  };
  await home(page);
  await check("Home");
  await openAdd(page);
  await check("Add a reminder");
  await saveBtn(page).tap();
  await check("Add a reminder with a message");
  await repeat(page, "Certain days of the week").tap();
  await check("Certain days");
  await repeat(page, "Every few days").tap();
  await sheet(page).getByLabel("Name", { exact: true }).fill("Axe check");
  await sheet(page).getByLabel("Time", { exact: true }).fill("07:00");
  await saveBtn(page).tap();
  await check("Every few days with a message");
  await page.keyboard.press("Escape");
  await manage(page);
  await check("/app/reminders");
  await page.locator("li", { hasText: "Weekly" }).getByRole("button", { name: "Edit Weekly", exact: true }).tap();
  await sheet(page).waitFor();
  await page.waitForTimeout(700);
  await check("Edit reminder");
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).tap();
  await page.waitForTimeout(700);
  await check("Delete this reminder?");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
