// Home's "Water" section (founder 2026-10-15: "There should be a water intake section below dinners with its own heading"; 2026-10-16: "a water bottle which you
// can move up and type the amount of water you've had extra when the plus is pressed"). Under Today's meals: a heading, a small bottle filled to today's level,
// today's millilitres against the person's own goal, an Undo for the last drink added today and a round + that opens "Add water": a bottle to drag (or move with the
// arrow keys) and an amount to type, in step, added on top of what is drunk. The goal is typed in Settings; the drinks stay on the device (not a synced store).
// Touch is on, like an iPhone. The paywall step needs the Pro-on test build (NEXT_PUBLIC_PRO=1).
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function open(extra = {}, settings = {}, seed = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript(([s, seeds]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v);
  }, [JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }), Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, JSON.stringify({ v: 1, data: v })]))]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const water = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.water") ?? "null")?.data ?? []);
const section = (page) => page.locator('section[aria-labelledby="home-water"]');
const plus = (page) => section(page).getByRole("button", { name: "Add water", exact: true });
const sheet = (page) => page.locator("dialog[open]");
const amount = (page) => sheet(page).getByLabel("Amount (ml)");
const slider = (page) => sheet(page).getByRole("slider", { name: "Water to add" });
const addButton = (page) => sheet(page).locator('button[type="submit"]');
async function openSheet(page) { await plus(page).tap(); await sheet(page).waitFor(); await amount(page).waitFor(); await page.waitForTimeout(700); /* the sheet slides in */ }
/** Open the sheet, type an amount, add it. */
async function drink(page, text) {
  await openSheet(page);
  await amount(page).fill(text);
  await addButton(page).tap();
  await sheet(page).waitFor({ state: "detached" });
}
/** The water's drawn level in the first bottle inside `where`: the translateY of its water rectangle, in drawing units. */
const lift = (where) => where.locator("svg rect[style]").first().evaluate((el) => parseFloat(/translateY\(([-\d.]+)px\)/.exec(el.style.transform)?.[1] ?? "NaN"));
const undo = (page) => page.getByRole("button", { name: "Undo the last water you added", exact: true });
/** "750 / 2,000 ml" as numbers. */
async function figures(page) {
  const m = (await section(page).innerText()).match(/([\d,]+)\s*\/\s*([\d,]+)\s*ml/);
  expect(m, "no 'x / y ml' in the Water card: " + (await section(page).innerText()));
  return [Number(m[1].replace(/,/g, "")), Number(m[2].replace(/,/g, ""))];
}
async function home(page) { await page.goto(BASE + "/app", { timeout: 120000 }); await page.getByRole("heading", { name: "Water", exact: true }).waitFor({ timeout: 90000 }); }
const todayAt = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const yesterdayAt = (h) => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(h, 0, 0, 0); return d.toISOString(); };

await step("Water has its own heading under Today's meals, below Dinner, with a small bottle, 0 of the 2,000 ml starting goal and a round + (no Glass or Bottle buttons)", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  const heading = page.getByRole("heading", { name: "Water", exact: true });
  expect((await heading.evaluate((h) => h.tagName)) === "H2", "the heading is an h2");
  const dinner = await page.locator("li", { has: page.getByRole("button", { name: "Add to Dinner", exact: true }) }).boundingBox();
  const head = await heading.boundingBox();
  expect(head.y > dinner.y + dinner.height - 1, `Water (y ${head.y}) is not below Dinner (bottom ${dinner.y + dinner.height})`);
  const meals = await page.getByRole("heading", { name: "Today's meals", exact: true }).boundingBox();
  expect(meals.y < head.y, "Today's meals comes first");
  const [ml, goal] = await figures(page);
  expect(ml === 0 && goal === 2000, `figures ${ml} / ${goal}`);
  const box = await plus(page).boundingBox();
  expect(box.width >= 44 && box.height >= 44, `the + is ${box.width} x ${box.height}`);
  expect((await section(page).locator("svg").count()) >= 2, "no bottle drawn next to the figure");
  expect((await lift(section(page))) === 89, "an empty bottle should have its water 89 units down, got " + (await lift(section(page))));
  expect((await section(page).getByRole("button", { name: /Glass|Bottle/ }).count()) === 0, "the inline Glass and Bottle buttons are still there");
  expect((await undo(page).count()) === 0, "Undo shows with nothing to undo");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the + opens Add water: a bottle to drag and an amount to type, 250 ml to start; adding is on top of what is drunk, the card does not jump, and it survives a reload", async () => {
  const { ctx, page } = await open();
  await home(page);
  const before = await section(page).locator("div.glass").boundingBox();
  await openSheet(page);
  expect((await sheet(page).getAttribute("aria-label")) === "Add water", "the sheet's name");
  expect((await amount(page).inputValue()) === "250", "starts at 250");
  expect((await slider(page).getAttribute("aria-valuenow")) === "250", "the bottle starts at 250");
  expect(/Add 250 ml/.test(await addButton(page).innerText()), "button: " + (await addButton(page).innerText()));
  await addButton(page).tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await figures(page))[0] === 250, "after the first drink");
  await drink(page, "400");
  expect((await figures(page))[0] === 650, "the second drink is on top: " + (await figures(page))[0]);
  const stored = await water(page);
  expect(stored.length === 2 && stored[0].ml === 250 && stored[1].ml === 400, "stored: " + JSON.stringify(stored));
  expect(stored.every((e) => typeof e.id === "string" && !Number.isNaN(Date.parse(e.loggedAt))), "entries have an id and a time");
  // the small bottle on Home is filled to 650 / 2000
  const want = (1 - 650 / 2000) * 89;
  expect(Math.abs((await lift(section(page))) - want) < 0.01, `bottle ${await lift(section(page))} vs ${want}`);
  const after = await section(page).locator("div.glass").boundingBox();
  expect(Math.abs(after.height - before.height) < 0.5, `the card jumped from ${before.height} to ${after.height}`);
  expect(/650 of 2,000 ml of water today/.test(await section(page).getByRole("status").innerText()), "spoken figure: " + (await section(page).getByRole("status").innerText()));
  await page.reload();
  await page.getByRole("heading", { name: "Water", exact: true }).waitFor({ timeout: 60000 });
  expect((await figures(page))[0] === 650, "lost after a reload");
  await ctx.close();
});

await step("the bottle in the sheet moves with a finger or the mouse and with the keyboard, and the typed amount follows (50 ml steps, a litre is full)", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openSheet(page);
  const bottle = slider(page);
  expect((await bottle.getAttribute("aria-orientation")) === "vertical", "orientation");
  let box = await bottle.boundingBox();
  expect(Math.abs(box.height / box.width - 2) < 0.02, `the bottle is ${box.width} x ${box.height}, not 1 : 2`);
  // drag from near the bottom up to half way: water level 0.5 is at 113 - 44.5 = 68.5 of the 120 drawing units
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * (68.5 / 120), { steps: 6 });
  await page.mouse.up();
  expect((await amount(page).inputValue()) === "500", "dragging to half gave " + (await amount(page).inputValue()));
  expect((await bottle.getAttribute("aria-valuenow")) === "500" && /500 ml/.test(await bottle.getAttribute("aria-valuetext")), "the slider says " + (await bottle.getAttribute("aria-valuetext")));
  expect(Math.abs((await lift(sheet(page))) - 44.5) < 0.01, "drawn level " + (await lift(sheet(page))));
  // dragging above the top or below the bottom stays inside the bottle
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 4 });
  await page.mouse.up();
  expect((await amount(page).inputValue()) === "1000", "above the top gave " + (await amount(page).inputValue()));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 80, { steps: 4 });
  await page.mouse.up();
  expect((await amount(page).inputValue()) === "0", "below the bottom gave " + (await amount(page).inputValue()));
  expect(await addButton(page).isDisabled(), "Add should be off at 0 ml");
  expect(/Add water/.test(await addButton(page).innerText()), "button at 0: " + (await addButton(page).innerText()));
  // keyboard
  await bottle.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect((await amount(page).inputValue()) === "100", "two arrows up gave " + (await amount(page).inputValue()));
  await page.keyboard.press("PageUp");
  expect((await amount(page).inputValue()) === "350", "page up gave " + (await amount(page).inputValue()));
  await page.keyboard.press("ArrowDown");
  expect((await amount(page).inputValue()) === "300", "arrow down gave " + (await amount(page).inputValue()));
  await page.keyboard.press("End");
  expect((await amount(page).inputValue()) === "1000", "End");
  await page.keyboard.press("Home");
  expect((await amount(page).inputValue()) === "0", "Home");
  // a finger on a touch screen (a tap on the bottle sets the level too)
  box = await bottle.boundingBox();
  await bottle.tap({ position: { x: box.width / 2, y: box.height * (113 - 0.3 * 89) / 120 } });
  expect((await amount(page).inputValue()) === "300", "a tap at 30% gave " + (await amount(page).inputValue()));
  // typing moves the bottle
  await amount(page).fill("750");
  expect((await bottle.getAttribute("aria-valuenow")) === "750", "typed 750, bottle " + (await bottle.getAttribute("aria-valuenow")));
  expect(Math.abs((await lift(sheet(page))) - 22.25) < 0.01, "drawn level for 750: " + (await lift(sheet(page))));
  await amount(page).fill("3000");
  expect((await bottle.getAttribute("aria-valuenow")) === "1000" && (await lift(sheet(page))) === 0, "3,000 ml should show a full bottle");
  expect(/Add 3,000 ml/.test(await addButton(page).innerText()), "button: " + (await addButton(page).innerText()));
  await ctx.close();
});

await step("the amount is checked: nothing, 0, over 5,000 or words can't be added; 1,250 can; the Glass and Bottle shortcuts fill it in", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openSheet(page);
  for (const bad of ["", "0", "5001", "abc", "-20"]) {
    await amount(page).fill(bad);
    expect(await addButton(page).isDisabled(), `"${bad}" can be added`);
    expect(/Type an amount from 1 to 5,000\./.test(await sheet(page).getByRole("status").innerText()), `no message for "${bad}"`);
    expect((await amount(page).getAttribute("aria-invalid")) === "true", `"${bad}" isn't marked invalid`);
  }
  const glass = sheet(page).getByRole("button", { name: /^Glass/ });
  const bottleChip = sheet(page).getByRole("button", { name: /^Bottle/ });
  expect((await glass.boundingBox()).height >= 43.9 && (await bottleChip.boundingBox()).height >= 43.9, "shortcut under 44 px");
  await bottleChip.tap();
  expect((await amount(page).inputValue()) === "500" && (await bottleChip.getAttribute("aria-pressed")) === "true" && (await glass.getAttribute("aria-pressed")) === "false", "Bottle shortcut");
  await glass.tap();
  expect((await amount(page).inputValue()) === "250" && (await glass.getAttribute("aria-pressed")) === "true", "Glass shortcut");
  await amount(page).fill("1,250");
  expect(!(await addButton(page).isDisabled()) && /Add 1,250 ml/.test(await addButton(page).innerText()), "1,250: " + (await addButton(page).innerText()));
  await addButton(page).tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await figures(page))[0] === 1250, "figure after 1,250");
  // Escape and Close put it away without adding anything, and it starts afresh the next time
  await openSheet(page);
  await amount(page).fill("999");
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  expect((await figures(page))[0] === 1250, "Escape added something");
  await openSheet(page);
  expect((await amount(page).inputValue()) === "250", "the sheet kept the old amount: " + (await amount(page).inputValue()));
  await sheet(page).getByRole("button", { name: "Close", exact: true }).tap();
  await sheet(page).waitFor({ state: "detached" });
  expect((await water(page)).length === 1, "Close added something: " + JSON.stringify(await water(page)));
  await ctx.close();
});

await step("Undo takes back the drink added last, one at a time, and goes away when nothing is left to undo", async () => {
  const { ctx, page } = await open();
  await home(page);
  await drink(page, "250");
  await drink(page, "500");
  await undo(page).waitFor();
  expect((await undo(page).boundingBox()).height >= 44, "Undo is under 44 px");
  await undo(page).tap();
  expect((await figures(page))[0] === 250, "first undo takes the bottle");
  expect(((await water(page)).map((e) => e.ml)).join() === "250", "stored after undo");
  await undo(page).tap();
  expect((await figures(page))[0] === 0, "second undo");
  expect((await water(page)).length === 0, "list not empty");
  expect((await undo(page).count()) === 0, "Undo is still there with nothing to undo");
  expect(await plus(page).isVisible(), "the + went away");
  await ctx.close();
});

await step("only today counts: yesterday's drinks don't, and Undo never takes one of yesterday's", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.water": [{ id: "y1", loggedAt: yesterdayAt(20), ml: 1500 }, { id: "t1", loggedAt: todayAt(0, 1), ml: 250 }] });
  await home(page);
  expect((await figures(page))[0] === 250, "figure " + (await figures(page))[0]);
  await undo(page).tap();
  expect((await figures(page))[0] === 0, "after undo");
  expect((await water(page)).map((e) => e.id).join() === "y1", "yesterday's entry was touched: " + JSON.stringify(await water(page)));
  expect((await undo(page).count()) === 0, "Undo offered for yesterday's drink");
  await ctx.close();
  // nothing today, something yesterday
  const b = await open({}, {}, { "mm.v1.water": [{ id: "y1", loggedAt: yesterdayAt(20), ml: 1500 }] });
  await home(b.page);
  expect((await figures(b.page))[0] === 0, "yesterday counted today");
  await b.ctx.close();
});

await step("over the goal the real figure shows and the bottle stops at full; a nonsense stored value is ignored", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.water": [{ id: "a", loggedAt: todayAt(8), ml: 2000 }, { id: "b", loggedAt: todayAt(9), ml: 250 }, { id: "bad", loggedAt: todayAt(10), ml: -500 }, { id: "bad2", loggedAt: "soon", ml: 500 }] });
  await home(page);
  expect((await figures(page))[0] === 2250, "figure " + (await figures(page))[0]);
  expect((await lift(section(page))) === 0, "the bottle should be full, water " + (await lift(section(page))) + " units down");
  await ctx.close();
});

await step("Settings: the water goal is typed in Daily targets, checked, saved, and Home follows; empty goes back to 2,000", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/settings#targets");
  const field = page.getByLabel("Water (ml)");
  await field.waitFor({ timeout: 90000 });
  expect((await field.getAttribute("placeholder")) === "2000", "placeholder " + (await field.getAttribute("placeholder")));
  expect(/Left empty it is 2,000 ml/.test(await page.locator("label", { has: field }).innerText()), "hint");
  const save = page.getByRole("button", { name: "Save targets", exact: true });
  for (const bad of ["100", "6001", "abc"]) {
    await field.fill(bad);
    await save.tap();
    await page.getByText("Water should be between 250 and 6,000 ml.").waitFor();
  }
  expect(((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.dailyWater)) ?? null) === null, "a bad goal was saved");
  await field.fill("1750");
  await save.tap();
  await page.getByText("Saved.").waitFor();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data.dailyWater)) === 1750, "goal not saved");
  await home(page);
  expect((await figures(page))[1] === 1750, "Home goal " + (await figures(page))[1]);
  await page.goto(BASE + "/app/settings#targets");
  const again = page.getByLabel("Water (ml)");
  await again.waitFor();
  expect((await again.inputValue()) === "1750", "goal not shown again");
  await again.fill("");
  await page.getByRole("button", { name: "Save targets", exact: true }).tap();
  await page.getByText("Saved.").waitFor();
  await home(page);
  expect((await figures(page))[1] === 2000, "empty goal did not go back to 2,000");
  await ctx.close();
});

await step("Clear data on this device removes the water drunk, and the goal with the settings", async () => {
  const { ctx, page } = await open({}, { dailyWater: 1500 }, { "mm.v1.water": [{ id: "a", loggedAt: todayAt(8), ml: 500 }] });
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Clear data on this device", exact: true }).tap();
  const sheet = page.locator("dialog[open]");
  await sheet.waitFor();
  expect(/water you added/.test(await sheet.innerText()), "the sheet doesn't say water goes: " + (await sheet.innerText()).slice(0, 200));
  await sheet.getByRole("button", { name: "Clear everything", exact: true }).tap();
  await page.waitForTimeout(800);
  expect((await water(page)).length === 0, "water left: " + JSON.stringify(await water(page)));
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") ?? "null")?.data?.dailyWater)) === undefined, "goal left");
  await ctx.close();
});

await step("water is never sent anywhere: no request mentions it while drinks are added and undone", async () => {
  const { ctx, page } = await open();
  const requests = [];
  page.on("request", (r) => { if (!/^data:|^blob:/.test(r.url())) requests.push(r.method() + " " + r.url() + " " + (r.postData() ?? "")); });
  await home(page);
  await drink(page, "250");
  await drink(page, "500");
  await undo(page).tap();
  await page.waitForTimeout(3500); // past a sync's debounce, in case anything were wired
  const leaked = requests.filter((r) => /water|"ml"/i.test(r.replace(/\/_next\/[^\s]*/g, "")));
  expect(leaked.length === 0, "a request mentions water: " + leaked.slice(0, 3).join(" | "));
  expect(!requests.some((r) => /api\/v1\/sync/.test(r)), "a sync request went out for a person who isn't signed in");
  await ctx.close();
});

await step("a free person's + shows the paywall instead of the sheet (logging is Pro while Pro is on)", async () => {
  const { ctx, page } = await open({}, { devProOverride: false });
  await home(page);
  await plus(page).tap();
  await page.waitForTimeout(500);
  expect((await water(page)).length === 0, "a drink was added for a free person");
  expect((await page.locator("dialog[open]").count()) > 0, "no paywall dialog");
  expect((await page.getByRole("slider").count()) === 0 && (await page.getByLabel("Amount (ml)").count()) === 0, "the Add water sheet opened for a free person");
  await ctx.close();
});

await step("360 px, Extra large text and Arabic: no sideways scroll on Home or in the sheet, the + and Undo and Add stay whole and reachable, Arabic reads right to left", async () => {
  for (const [label, o, st] of [["360 px", { viewport: { width: 360, height: 780 } }, {}], ["Extra large", {}, { textSize: "xlarge" }], ["Arabic", { locale: "ar" }, { language: "ar" }]]) {
    const width = o.viewport?.width ?? 390;
    const { ctx, page } = await open(o, st, { "mm.v1.water": [{ id: "a", loggedAt: todayAt(8), ml: 1250 }] });
    await page.goto(BASE + "/app");
    const card = page.locator('section[aria-labelledby="home-water"]');
    await card.waitFor({ timeout: 90000 });
    const over = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect((await over()) <= 0, `${label}: sideways scroll ${await over()}`);
    const buttons = card.getByRole("button");
    const n = await buttons.count();
    expect(n === 2, `${label}: ${n} buttons (Undo, +)`);
    for (let i = 0; i < n; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box.height >= 44 && box.width >= 44, `${label}: button ${i} is ${box.width} x ${box.height}`);
      expect(box.x >= 0 && box.x + box.width <= width + 0.5, `${label}: button ${i} runs off the screen`);
    }
    if (label === "Arabic") expect((await card.evaluate((el) => getComputedStyle(el).direction)) === "rtl", "direction");
    const name = label === "Arabic" ? null : "Add water";
    const open1 = name ? card.getByRole("button", { name, exact: true }) : buttons.last();
    await open1.tap();
    const dlg = page.locator("dialog[open]");
    await dlg.waitFor();
    await dlg.locator("input").first().waitFor();
    await page.waitForTimeout(500);
    expect((await over()) <= 0, `${label}: sideways scroll with the sheet open ${await over()}`);
    const fits = await dlg.evaluate((d) => { const p = d.querySelector(".sheet-panel"); return p.scrollWidth - p.clientWidth; });
    expect(fits <= 0, `${label}: the sheet scrolls sideways by ${fits}`);
    for (const el of [dlg.getByRole("slider"), dlg.locator("input").first(), dlg.locator('button[type="submit"]')]) {
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      expect(box.x >= -0.5 && box.x + box.width <= width + 0.5, `${label}: ${JSON.stringify(box)} runs off the screen`);
      expect(box.height >= 44 || (await el.getAttribute("role")) === "slider", `${label}: ${box.height} px high`);
    }
    const bottleBox = await dlg.getByRole("slider").boundingBox();
    expect(bottleBox.width >= 70 && bottleBox.height >= 140, `${label}: the bottle is ${bottleBox.width} x ${bottleBox.height}`);
    if (label === "Arabic") {
      expect((await dlg.evaluate((d) => getComputedStyle(d).direction)) === "rtl", "sheet direction");
      const input = await dlg.locator("input").first().boundingBox();
      expect(bottleBox.x > input.x, "in Arabic the bottle should sit on the right of the amount");
    }
    await ctx.close();
  }
});

await step("axe: no violations in the Water section (and Home), the Add water sheet or the Settings goal field", async () => {
  const { ctx, page } = await open({}, {}, { "mm.v1.water": [{ id: "a", loggedAt: todayAt(8), ml: 500 }] });
  const check = async (label) => {
    await page.waitForTimeout(900);
    await page.addScriptTag({ path: AXE }).catch(() => {});
    const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
    expect(res.violations.length === 0, label + ": " + res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 100)).join(" | "));
  };
  await home(page);
  await check("Home");
  await openSheet(page);
  await check("Add water");
  await amount(page).fill("0");
  await check("Add water with a wrong amount");
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/settings#targets");
  await page.getByLabel("Water (ml)").waitFor();
  await check("Settings");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
