// "Back goes to the page before" across the whole app (founder 2026-10-16, with a screenshot: on Recipes the heart at the top right opens My meals, and Back there went
// to Home, not to Recipes). Every Back button used to be a link to ONE fixed page; now it takes the browser's own Back when the page was reached from another page of the app
// and goes to the fixed page only when there is nothing earlier (a page opened by address, a shared link, a fresh launch). Each history entry carries its depth in history.state
// ("mmDepth": the first entry 0, a push one more, a replace the same), which is what these steps read to show that Today's day arrows and My meals' tabs add no steps.
// The Back control is found by its visible word "Back" (the link whose text is exactly that), and its spoken name is checked too: plain "Back" after an in-app arrival, the
// destination's name ("Back to home", "Back to recipes", ...) after a direct load. The restaurant pages are covered in more depth by back-restaurants.mjs; here they appear as
// part of the whole-app flows. Touch is on, like an iPhone. Needs the test build with sample data on (bowl-and-co is a sample chain).
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 7).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const iso = "2026-10-15T10:00:00.000Z";
const RECIPE = "berry-yogurt-porridge";
const DISH = "chicken-bowl";
const CHAIN = "bowl-and-co";
const typedItem = { gtin: "", retailer: "own", name: "Chicken", brand: "", size: "", qty: 1, addedAt: iso, custom: true };
const FILE = new URL("../public/groceries/all/sainsburys.json", import.meta.url);
const PRODUCT = JSON.parse(readFileSync(FILE, "utf8")).products[0][0];

/** A fresh phone-sized context with the settings (and any other stores) seeded once per tab. `seed` is { storage key: data } for the app's own stores. */
async function open({ extra = {}, settings = {}, seed = {} } = {}) {
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
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const go = async (page, url) => { await page.goto(BASE + url, { timeout: 180000 }); };
async function waitPath(page, p) {
  try { await page.waitForFunction((want) => location.pathname + location.search === want, p, { timeout: 60000 }); }
  catch { throw new Error(`expected the address to become ${p}, it is ${path(page)}`); }
}
/** The depth the browser's current history entry carries (null before the app has written one). */
const depth = (page) => page.evaluate(() => history.state?.mmDepth ?? null);
/** The Back control: the link whose visible text is exactly "Back" (or `word`, for another language). */
const backCtl = (page, word = "Back") => page.locator("a").filter({ has: page.locator("span", { hasText: new RegExp("^" + word + "$") }) }).first();
/** What a screen reader says for it: its aria-label, or its text when it has none. */
const spoken = (l) => l.evaluate((el) => el.getAttribute("aria-label") ?? (el.textContent || "").trim());
/** Wait for the Back control to be on the page and spoken as `want` (the name settles after the first render, once the page knows how it was reached). */
async function nameIs(page, want, { word = "Back", timeout = 30000 } = {}) {
  const l = backCtl(page, word);
  await l.waitFor({ timeout: 120000 });
  const t0 = Date.now();
  let seen = "";
  while (Date.now() - t0 < timeout) {
    seen = await spoken(l);
    if (seen === want) return l;
    await page.waitForTimeout(100);
  }
  throw new Error(`the Back control is spoken as "${seen}", expected "${want}"`);
}
/** Tap the Back control (once it is spoken as `want`) and wait for the address `to`. */
async function back(page, want, to) {
  const l = await nameIs(page, want);
  await l.tap();
  await waitPath(page, to);
}
const tab = (page, href) => page.locator(`nav a[href="${href}"]`);
const homeReady = async (page) => { await page.getByRole("button", { name: "Choose a day", exact: true }).waitFor({ timeout: 120000 }); };
const home = async (page) => { await go(page, "/app"); await homeReady(page); };
const dialog = (page) => page.locator("dialog[open]");
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const longName = (d) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(d);
const noErrors = (errors) => expect(errors.length === 0, "errors: " + errors.join(" | "));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (a) the founder's bug

await step("(a) Recipes, then the heart at the top right, then My meals: Back lands on Recipes, not Home (from Home's tab bar, and from Recipes opened by address)", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await tab(page, "/app/recipes").tap();
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  const recipes = path(page);
  expect(recipes.startsWith("/app/recipes"), "Recipes opened at " + recipes);
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  expect((await depth(page)) === 2, "My meals sits two steps from the start, depth " + (await depth(page)));
  await back(page, "Back", recipes);
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 60000 });
  expect((await depth(page)) === 1, "Recipes is one step from the start again, depth " + (await depth(page)));
  // and the phone's own Forward goes on to My meals: Back was history, not a new link
  await page.goForward();
  await waitPath(page, "/app/meals?tab=recipes");
  // Recipes opened by address: the same
  const fresh = await ctx.newPage();
  await fresh.goto(BASE + "/app/recipes", { timeout: 180000 });
  await fresh.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  const at = path(fresh);
  await fresh.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(fresh, "/app/meals?tab=recipes");
  await back(fresh, "Back", at);
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (b) + (c) Home and its pages

await step("(b) Home, the My meals tile, Back: Home; Home, the Shopping list tile, Back: Home", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await page.locator('a[href="/app/meals"]').tap();
  await waitPath(page, "/app/meals");
  await back(page, "Back", "/app");
  await homeReady(page);
  await page.locator('a[href="/app/groceries/list"]').first().tap();
  await waitPath(page, "/app/groceries/list");
  await back(page, "Back", "/app");
  await homeReady(page);
  noErrors(errors);
  await ctx.close();
});

await step("(c) Home, a meal row (Today's meals), Back: Home", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await page.locator('a[href="/app/today"]').first().tap();
  await waitPath(page, "/app/today");
  await back(page, "Back", "/app");
  await homeReady(page);
  noErrors(errors);
  await ctx.close();
});

await step("(c) Home, a circle of a past day in the week strip, Back: Home (skipped on a Monday: no day gone by)", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  const past = page.locator('ol[aria-label="This week"] a:not([aria-current])');
  const n = await past.count();
  if (n === 0) { console.log("     (no past day in this week yet, so there is nothing to tap)"); await ctx.close(); return; }
  const circle = past.last(); // yesterday
  await circle.tap();
  await page.waitForFunction(() => location.pathname === "/app/today" && /^\?d=\d{4}-\d{2}-\d{2}$/.test(location.search), null, { timeout: 60000 });
  await back(page, "Back", "/app");
  await homeReady(page);
  noErrors(errors);
  await ctx.close();
});

await step("(c) Home, the calendar, a day picked, Back: Home with the sheet closed", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await page.getByRole("button", { name: "Choose a day", exact: true }).tap();
  await dialog(page).waitFor();
  await page.waitForTimeout(700); // the sheet slides in
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (y.getMonth() !== new Date().getMonth()) await dialog(page).getByRole("button", { name: "Previous month", exact: true }).tap();
  await dialog(page).getByRole("button", { name: new RegExp("^" + longName(y)) }).tap();
  await waitPath(page, "/app/today?d=" + keyOf(y));
  await back(page, "Back", "/app");
  await homeReady(page);
  expect((await dialog(page).count()) === 0, "the calendar sheet is still open on Home");
  noErrors(errors);
  await ctx.close();
});

await step("(c) Today's Previous day x3, Next day and the Today shortcut replace the entry: depth never grows, and Back goes to Home in ONE tap", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await page.locator('a[href="/app/today"]').first().tap();
  await waitPath(page, "/app/today");
  const d0 = await depth(page);
  expect(d0 === 1, "Today is one step from Home, depth " + d0);
  const seen = [path(page)];
  const flip = async (name) => {
    await page.getByRole("link", { name, exact: true }).tap();
    await page.waitForFunction((was) => location.pathname + location.search !== was, seen[seen.length - 1], { timeout: 60000 });
    seen.push(path(page));
    expect((await depth(page)) === d0, `"${name}" added a step: depth ${await depth(page)}, was ${d0}`);
  };
  await flip("Previous day");
  await flip("Previous day");
  await flip("Previous day");
  expect(new Set(seen).size === 4, "three different days were shown: " + seen.join(" > "));
  await flip("Next day");
  await flip("Today"); // the shortcut back to today
  expect(path(page) === "/app/today", "the Today shortcut goes to /app/today, not " + path(page));
  await back(page, "Back", "/app"); // one tap
  await homeReady(page);
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (d) Eat out

await step("(d) Eat out, a restaurant, a dish: Back to the restaurant, Back to Eat out; the favourites card and its Back", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await tab(page, "/app/eat-out").tap();
  await waitPath(page, "/app/eat-out");
  const chain = page.locator(`a[href*="chain?id=${CHAIN}"]`).first();
  await chain.waitFor({ timeout: 120000 });
  await chain.tap();
  await waitPath(page, `/app/chain?id=${CHAIN}`);
  const dish = page.locator(`a[href*="item?chain=${CHAIN}&item=${DISH}"]`).first();
  await dish.waitFor({ timeout: 120000 });
  await dish.tap();
  await waitPath(page, `/app/item?chain=${CHAIN}&item=${DISH}`);
  expect((await depth(page)) === 3, "Home > Eat out > restaurant > dish, depth " + (await depth(page)));
  await back(page, "Back", `/app/chain?id=${CHAIN}`);
  await back(page, "Back", "/app/eat-out");
  // My favourite restaurants: its Back returns to Eat out
  await page.locator('a[href="/app/eat-out/favourites"]').tap();
  await waitPath(page, "/app/eat-out/favourites");
  await back(page, "Back", "/app/eat-out");
  noErrors(errors);
  await ctx.close();
});

await step("(d) Search results, a dish, Back: Search (not the restaurant list); Search's own Back: Eat out", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/eat-out");
  await page.locator('a[href="/app/search"]').first().tap();
  await waitPath(page, "/app/search");
  await page.locator('input[type="search"]').fill("chicken bowl"); // "chicken" alone fills the 40 results with other chains' dishes
  const hit = page.locator(`a[href*="item?chain=${CHAIN}"][href*="item=${DISH}"]`).first();
  await hit.waitFor({ timeout: 120000 });
  await hit.tap();
  await waitPath(page, `/app/item?chain=${CHAIN}&item=${DISH}`);
  await back(page, "Back", "/app/search");
  const box = page.locator('input[type="search"]');
  await box.waitFor();
  // the search comes back as it was left: the words are in the history entry, the results are there, and the keyboard is not raised again
  try { await page.waitForFunction(() => document.querySelector('input[type="search"]')?.value === "chicken bowl", null, { timeout: 30000 }); }
  catch { throw new Error(`the search box reads "${await box.inputValue()}" after Back, expected "chicken bowl"`); }
  await hit.waitFor({ timeout: 120000 });
  expect(await box.evaluate((el) => document.activeElement !== el), "the search box has the keyboard again after Back");
  await back(page, "Back", "/app/eat-out");
  noErrors(errors);
  await ctx.close();
});

await step("(d) a restaurant reached from Search goes back to Search, not Eat out", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/search");
  await page.locator('input[type="search"]').fill("bowl");
  const hit = page.locator(`a[href*="chain?id=${CHAIN}"]`).first();
  await hit.waitFor({ timeout: 120000 });
  await hit.tap();
  await waitPath(page, `/app/chain?id=${CHAIN}`);
  await back(page, "Back", "/app/search");
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (e) Groceries, the shopping list, Recipes

await step("(e) Groceries, a shop's list, a product: Back to the shop's list, Back to Groceries", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await tab(page, "/app/groceries").tap();
  await waitPath(page, "/app/groceries");
  await page.locator('a[href="/app/groceries/shop?r=sainsburys"]').first().tap();
  await waitPath(page, "/app/groceries/shop?r=sainsburys");
  const product = page.locator('a[href^="/app/groceries/shop/item?r=sainsburys"]').first();
  await product.waitFor({ timeout: 180000 });
  await product.tap();
  await page.waitForFunction(() => location.pathname === "/app/groceries/shop/item", null, { timeout: 60000 });
  await back(page, "Back", "/app/groceries/shop?r=sainsburys");
  await back(page, "Back", "/app/groceries");
  noErrors(errors);
  await ctx.close();
});

await step("(e) Recipes, a recipe, Back: Recipes (the address it was at)", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await tab(page, "/app/recipes").tap();
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  const recipes = path(page);
  const tile = page.locator('a[href^="/app/recipes/view?id="]').first();
  await tile.waitFor({ timeout: 180000 });
  await tile.tap();
  await page.waitForFunction(() => location.pathname === "/app/recipes/view", null, { timeout: 60000 });
  await back(page, "Back", recipes);
  noErrors(errors);
  await ctx.close();
});

await step("(e) Home, My meals, a saved recipe, Back: My meals", async () => {
  const { ctx, page, errors } = await open({ seed: { "mm.v1.savedRecipes": [{ id: RECIPE, savedAt: iso }] } });
  await home(page);
  await page.locator('a[href="/app/meals"]').tap();
  await waitPath(page, "/app/meals");
  const tile = page.locator('a[href^="/app/recipes/view?id=' + RECIPE + '"]').first();
  await tile.waitFor({ timeout: 180000 });
  await tile.tap();
  await page.waitForFunction(() => location.pathname === "/app/recipes/view", null, { timeout: 60000 });
  await back(page, "Back", "/app/meals");
  noErrors(errors);
  await ctx.close();
});

await step("(e) Shopping list, 'What can I cook with this?', Back: the Shopping list", async () => {
  const { ctx, page, errors } = await open({ seed: { "mm.v1.shopping": [typedItem] } });
  await home(page);
  await page.locator('a[href="/app/groceries/list"]').first().tap();
  await waitPath(page, "/app/groceries/list");
  const cook = page.locator('a[href="/app/groceries/list/recipes"]');
  await cook.waitFor({ timeout: 120000 });
  await cook.tap();
  await waitPath(page, "/app/groceries/list/recipes");
  await back(page, "Back", "/app/groceries/list");
  await back(page, "Back", "/app");
  noErrors(errors);
  await ctx.close();
});

await step("(e) Groceries, Compare products, the tab switch (replace), Back: Groceries in one tap", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/groceries");
  await page.locator('a[href="/app/compare?tab=food"]').first().tap();
  await waitPath(page, "/app/compare?tab=food");
  const d0 = await depth(page);
  await page.getByRole("tab", { name: /^Restaurant dishes/ }).tap();
  await waitPath(page, "/app/compare?tab=dish");
  await page.getByRole("tab", { name: /^Groceries/ }).tap();
  await waitPath(page, "/app/compare?tab=food");
  expect((await depth(page)) === d0, "switching Compare's tabs added a step");
  await back(page, "Back", "/app/groceries");
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (f) + (i) a page opened by address has nothing earlier: Back goes to its fixed page, and says where

const DIRECT = [
  ["/app/meals", "/app", "Back to home"],
  ["/app/today", "/app", "Back to home"],
  ["/app/groceries/list", "/app", "Back to home"],
  [`/app/recipes/view?id=${RECIPE}&r=sainsburys`, "/app/recipes?r=sainsburys", "Back to recipes"],
  [`/app/chain?id=${CHAIN}`, "/app/eat-out", "Back to restaurants"],
  [`/app/item?chain=${CHAIN}&item=${DISH}`, `/app/chain?id=${CHAIN}`, "Back to menu"],
  ["/app/compare", "/app/groceries", "Back to groceries"],
  ["/app/compare?tab=food", "/app/groceries", "Back to groceries"],
  ["/app/compare?tab=dish", "/app/eat-out", "Back to restaurants"],
  ["/app/groceries/shop?r=sainsburys", "/app/groceries", "Back to groceries"],
  [`/app/groceries/shop/item?r=sainsburys&id=${PRODUCT}`, "/app/groceries/shop?r=sainsburys", "Back to the full list"],
  ["/app/groceries/list/recipes", "/app/groceries/list", "Back to shopping list"],
  ["/app/groceries/search", "/app/groceries", "Back to groceries"],
  ["/app/eat-out/favourites", "/app/eat-out", "Back to restaurants"],
  ["/app/search", "/app/eat-out", "Back"], // Search names itself plain "Back" whichever way it was reached
];
for (const [url, fallback, name] of DIRECT) {
  await step(`(f)(i) ${url} opened by address: the link goes to ${fallback} and is spoken as "${name}"; the visible word stays "Back"`, async () => {
    const { ctx, page, errors } = await open({ seed: { "mm.v1.shopping": [typedItem] } });
    await go(page, url);
    const l = await nameIs(page, name);
    // the href can still settle after the name does (a recipe page learns its shop from the manifest a moment after it opens): wait for it
    let href = await l.getAttribute("href");
    for (const t0 = Date.now(); href !== fallback && Date.now() - t0 < 15000; ) { await page.waitForTimeout(100); href = await l.getAttribute("href"); }
    expect(href === fallback, `the link's href is ${href}, expected ${fallback}`);
    expect(((await l.innerText()).trim()) === "Back", `the visible text is "${(await l.innerText()).trim()}", expected "Back"`);
    expect((await depth(page)) === null || (await depth(page)) === 0, "a page opened by address should be depth 0, got " + (await depth(page)));
    await l.tap();
    await waitPath(page, fallback);
    noErrors(errors);
    await ctx.close();
  });
}

await step("(f) Settings > How we get our numbers: opened from Settings its pill goes back through the history; by address it goes to Settings", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/settings");
  await page.getByRole("link", { name: "How we get our numbers" }).tap();
  await waitPath(page, "/app/settings/numbers");
  await page.locator("main").getByRole("link", { name: "Settings", exact: true }).tap();
  await waitPath(page, "/app/settings");
  const fresh = await ctx.newPage();
  await fresh.goto(BASE + "/app/settings/numbers", { timeout: 180000 });
  await fresh.locator("main").getByRole("link", { name: "Settings", exact: true }).tap();
  await waitPath(fresh, "/app/settings");
  noErrors(errors);
  await ctx.close();
});

await step("(i) the spoken name follows the page's own history: a page opened by address says where it goes, then plain 'Back' after a step, then where it goes again after coming back", async () => {
  const { ctx, page, errors } = await open();
  await go(page, `/app/chain?id=${CHAIN}`);
  await nameIs(page, "Back to restaurants");
  const dish = page.locator(`a[href*="item?chain=${CHAIN}&item=${DISH}"]`).first();
  await dish.waitFor({ timeout: 120000 });
  await dish.tap();
  await waitPath(page, `/app/item?chain=${CHAIN}&item=${DISH}`);
  await nameIs(page, "Back");
  await back(page, "Back", `/app/chain?id=${CHAIN}`);
  await nameIs(page, "Back to restaurants"); // the restaurant is at the start of the history again, so Back would go to Eat out
  await back(page, "Back to restaurants", "/app/eat-out");
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (g) a reload in the middle of a flow

await step("(g) Recipes, My meals, reload, Back: Recipes", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await tab(page, "/app/recipes").tap();
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  const recipes = path(page);
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  await page.reload({ timeout: 180000 });
  expect((await depth(page)) === 2, "the reloaded entry lost its depth: " + (await depth(page)));
  await back(page, "Back", recipes);
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 60000 });
  noErrors(errors);
  await ctx.close();
});

await step("(g) Home, Today, reload, Back: Home; Eat out, a restaurant, a dish, reload, Back: the restaurant", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await page.locator('a[href="/app/today"]').first().tap();
  await waitPath(page, "/app/today");
  await page.reload({ timeout: 180000 });
  await back(page, "Back", "/app");
  await homeReady(page);
  await tab(page, "/app/eat-out").tap();
  const chain = page.locator(`a[href*="chain?id=${CHAIN}"]`).first();
  await chain.waitFor({ timeout: 120000 });
  await chain.tap();
  await waitPath(page, `/app/chain?id=${CHAIN}`);
  const dish = page.locator(`a[href*="item?chain=${CHAIN}&item=${DISH}"]`).first();
  await dish.waitFor({ timeout: 120000 });
  await dish.tap();
  await waitPath(page, `/app/item?chain=${CHAIN}&item=${DISH}`);
  await page.reload({ timeout: 180000 });
  await back(page, "Back", `/app/chain?id=${CHAIN}`);
  await back(page, "Back", "/app/eat-out");
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (h) My meals' tabs replace

await step("(h) Recipes, My meals, Restaurant meals tab, Recipes tab: no step added, Back goes to Recipes in one tap", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/recipes");
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  const recipes = path(page);
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  const d0 = await depth(page);
  expect(d0 === 1, "My meals is one step from Recipes, depth " + d0);
  await page.getByRole("tab", { name: /^Restaurant meals/ }).tap();
  await waitPath(page, "/app/meals?tab=restaurant");
  expect((await depth(page)) === d0, "the Restaurant meals tab added a step, depth " + (await depth(page)));
  await page.getByRole("tab", { name: /^Recipes/ }).tap();
  await waitPath(page, "/app/meals?tab=recipes");
  expect((await depth(page)) === d0, "the Recipes tab added a step, depth " + (await depth(page)));
  await back(page, "Back", recipes); // one tap, not three
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (j) modified clicks keep the link a link

await step("(j) a Ctrl or Shift click on Back is left to the browser (a new tab or window): this page does not move and the link still points at the fixed page", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/recipes");
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  const l = await nameIs(page, "Back"); // reached from the app: a plain click would be router.back()
  expect((await l.getAttribute("href")) === "/app", "the href is " + (await l.getAttribute("href")) + ", expected /app");
  for (const modifier of ["Control", "Shift"]) {
    const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null), l.click({ modifiers: [modifier] })]);
    await page.waitForTimeout(400);
    expect(path(page) === "/app/meals?tab=recipes", `a ${modifier} click moved this page to ${path(page)}`);
    expect((await l.getAttribute("href")) === "/app", `after a ${modifier} click the href is ${await l.getAttribute("href")}`);
    if (popup) await popup.close();
  }
  // and an ordinary click still goes back through the history afterwards
  await back(page, "Back", "/app/recipes");
  noErrors(errors);
  await ctx.close();
});

await step("(j) the link's own click handler leaves a Ctrl, Meta, Shift or Alt click alone (not cancelled, so the browser opens the link itself) and takes over only a plain click", async () => {
  // Chromium on Linux treats a Meta click as a plain click (only on a Mac does it open a tab), so the real key press can't show this; a click event with each key
  // held shows whether the app cancelled it. A listener on the document (above React's) records that and then cancels it, so the page does not move during the check.
  const { ctx, page, errors } = await open();
  await go(page, "/app/recipes");
  await page.getByRole("heading", { name: "What's cooking today?" }).waitFor({ timeout: 120000 });
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  const l = await nameIs(page, "Back");
  const cancelled = (init) => l.evaluate((el, i) => {
    let seen = null;
    const rec = (e) => { seen = e.defaultPrevented; e.preventDefault(); };
    document.addEventListener("click", rec, { once: true });
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...i }));
    document.removeEventListener("click", rec);
    return seen;
  }, init);
  for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    const c = await cancelled({ [key]: true });
    expect(c === false, `a click with ${key} was cancelled by the app (it would stop the browser opening the link elsewhere)`);
  }
  expect(path(page) === "/app/meals?tab=recipes", "the page moved during the check: " + path(page));
  expect((await cancelled({})) === true, "a plain click was not taken over by the app (no router.back())");
  await waitPath(page, "/app/recipes"); // ... and it went back through the history
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (k) Arabic and Extra large text

const ar = JSON.parse(readFileSync(new URL("../lib/mm/locales/ar.json", import.meta.url), "utf8"));
for (const [label, st, rtl, words] of [
  ["Arabic", { language: "ar" }, true, { back: ar["Back"], home: ar["Back to home"] }],
  ["Arabic at Extra large text", { language: "ar", textSize: "xlarge" }, true, { back: ar["Back"], home: ar["Back to home"] }],
  ["English at Extra large text", { textSize: "xlarge" }, false, { back: "Back", home: "Back to home" }],
]) {
  await step(`(k) ${label}: My meals reached from Recipes has its Back control at the start edge, big enough, no sideways scroll, and it goes back to Recipes`, async () => {
    expect(words.back && words.home, "the translation of Back is missing from the locale file");
    const { ctx, page, errors } = await open({ settings: st });
    await go(page, "/app/recipes");
    await page.locator('a[href="/app/meals?tab=recipes"]').waitFor({ timeout: 180000 });
    await page.waitForFunction((want) => document.documentElement.dir === want, rtl ? "rtl" : "ltr", { timeout: 30000 });
    const recipes = path(page);
    await page.locator('a[href="/app/meals?tab=recipes"]').tap();
    await waitPath(page, "/app/meals?tab=recipes");
    const l = await nameIs(page, words.back, { word: words.back });
    const box = await l.boundingBox();
    expect(box.height >= 43.5, `the Back control is ${box.height}px high`); // 44px, give or take the rounding of rem sizes
    expect(box.x >= 0 && box.x + box.width <= 390, `the Back control sticks out of the screen: x ${box.x}, width ${box.width}`);
    if (rtl) expect(box.x + box.width >= 390 - 40 && box.x > 195, `in right-to-left the control should sit at the right edge: x ${box.x}, right ${box.x + box.width}`);
    else expect(box.x <= 40, `the control should sit at the left edge: x ${box.x}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over <= 1, `the page scrolls sideways by ${over}px`);
    await l.tap();
    await waitPath(page, recipes);
    // opened by address, the destination's name in the same language; where that phrase lacks the visible word ("العودة إلى الرئيسية" under "رجوع"), the word comes first
    // so that a Voice Control user who says what they see can reach it (WCAG 2.5.3, Label in Name)
    const fresh = await ctx.newPage();
    await fresh.goto(BASE + "/app/meals", { timeout: 180000 });
    const homeName = words.home.toLowerCase().includes(words.back.toLowerCase()) ? words.home : `${words.back}: ${words.home}`;
    await nameIs(fresh, homeName, { word: words.back });
    await fresh.addScriptTag({ path: AXE });
    const mismatch = await fresh.evaluate(async () => (await window.axe.run(document, { runOnly: ["label-content-name-mismatch"] })).violations.map((v) => v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")));
    expect(mismatch.length === 0, "label-content-name-mismatch: " + mismatch.join(" // "));
    noErrors(errors);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (l) axe

await step("(l) axe: My meals reached from Recipes (with a saved recipe, and on the Restaurant meals tab) has 0 violations", async () => {
  const { ctx, page, errors } = await open({ seed: { "mm.v1.savedRecipes": [{ id: RECIPE, savedAt: iso }] } });
  await go(page, "/app/recipes");
  await page.locator('a[href="/app/meals?tab=recipes"]').waitFor({ timeout: 180000 });
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  await nameIs(page, "Back");
  await page.locator('a[href^="/app/recipes/view?id=' + RECIPE + '"]').first().waitFor({ timeout: 180000 });
  const run = async (what) => {
    await page.waitForTimeout(900); // fades and slides end before colours are judged
    await page.addScriptTag({ path: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`));
    expect(v.length === 0, `${what}: ${v.join(" ;; ")}`);
  };
  await run("My meals, Recipes tab");
  await page.getByRole("tab", { name: /^Restaurant meals/ }).tap();
  await waitPath(page, "/app/meals?tab=restaurant");
  await run("My meals, Restaurant meals tab");
  noErrors(errors);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// (m) hardening: a double tap, the oldest history entry, a search kept across Back, the shared list

await step("(m) two quick activations of Back take one step, not two (the second would leave the app)", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/recipes");
  await page.locator('a[href="/app/meals?tab=recipes"]').waitFor({ timeout: 180000 });
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  await nameIs(page, "Back");
  await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => (x.textContent || "").trim() === "Back"); a.click(); a.click(); });
  await waitPath(page, "/app/recipes");
  await page.waitForTimeout(1500);
  expect(path(page) === "/app/recipes", `after a double activation the page is ${page.url()}, expected /app/recipes`);
  // and the guard lets go: a later Back works again
  await page.locator('a[href="/app/meals?tab=recipes"]').tap();
  await waitPath(page, "/app/meals?tab=recipes");
  await back(page, "Back", "/app/recipes");
  noErrors(errors);
  await ctx.close();
});

await step("(m) at the oldest entry the browser still keeps (depth above 0, nothing before it) Back goes to the fixed page instead of doing nothing", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/eat-out/favourites");
  await nameIs(page, "Back to restaurants");
  // a tab keeps only the last 50 or so entries: push 60, then go all the way back to the oldest one that is left
  await page.evaluate(() => { for (let k = 1; k <= 60; k++) history.pushState(null, "", "/app/eat-out/favourites?n=" + k); });
  await page.evaluate(() => history.go(-(history.length - 1)));
  await page.waitForFunction(() => /^\?n=\d+$/.test(location.search) && location.search !== "?n=60", null, { timeout: 30000 });
  expect((await depth(page)) > 0, "the oldest kept entry should still carry a depth above 0, got " + (await depth(page)));
  await nameIs(page, "Back");
  await (await nameIs(page, "Back")).tap();
  await waitPath(page, "/app/eat-out");
  noErrors(errors);
  await ctx.close();
});

await step("(m) Search every shop: Back from a product finds the words as they were left", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/groceries/search");
  const box = page.getByRole("searchbox", { name: "Search products or type a barcode" });
  await box.waitFor({ timeout: 180000 });
  await box.fill("beans");
  const row = page.locator('main ul a[href^="/app/groceries/product?code="]').first();
  await row.waitFor({ timeout: 120000 });
  await row.tap();
  await page.waitForFunction(() => location.pathname === "/app/groceries/product", null, { timeout: 60000 });
  await back(page, "Back", "/app/groceries/search");
  try { await page.waitForFunction(() => document.querySelector('input[type="search"]')?.value === "beans", null, { timeout: 30000 }); }
  catch { throw new Error(`the box reads "${await box.inputValue()}" after Back, expected "beans"`); }
  await page.locator('main ul a[href^="/app/groceries/product?code="]').first().waitFor({ timeout: 120000 });
  noErrors(errors);
  await ctx.close();
});

await step("(m) a shared list: after 'Add all', Back from the shopping list shows it as added (not 'Add all' again); a bad link's 'Back to shopping list' replaces the page", async () => {
  // the sender's phone makes the link (as sharelist.mjs does): the share sheet is stood in for by a function that remembers what it was handed
  const sender = await open({ seed: { "mm.v1.shopping": [typedItem, { ...typedItem, name: "Eggs" }] } });
  await sender.ctx.addInitScript(() => { navigator.share = async (data) => { window.__shared = data; }; });
  await go(sender.page, "/app/groceries/list");
  await sender.page.getByRole("button", { name: "Share list" }).waitFor({ timeout: 120000 });
  await sender.page.getByRole("button", { name: "Share list" }).tap();
  const text = await sender.page.waitForFunction(() => window.__shared?.text ?? null, null, { timeout: 30000 }).then((h) => h.jsonValue());
  const link = /https:\/\/numbite\.com\/l#([A-Za-z0-9_-]+)/.exec(text)?.[0];
  expect(link, "no link in the shared text");
  await sender.ctx.close();

  const { ctx, page, errors } = await open();
  await go(page, "/app/groceries/list");
  await page.getByRole("button", { name: "Got a list from a friend? Open it" }).tap();
  await page.getByRole("textbox", { name: "The link or code" }).fill(link);
  await page.getByRole("button", { name: "Open the list" }).tap();
  await page.waitForFunction(() => location.pathname === "/app/groceries/list/shared", null, { timeout: 60000 });
  await page.getByRole("button", { name: "Add all to my shopping list" }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Add all to my shopping list" }).tap();
  const mine = () => page.evaluate(() => (JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []).map((i) => `${i.name}x${i.qty}`).sort().join(","));
  const once = await mine();
  expect(/Chickenx1/.test(once) && /Eggsx1/.test(once), "the list should hold both items once, got " + once);
  await page.getByRole("link", { name: "Open my shopping list" }).tap();
  await waitPath(page, "/app/groceries/list");
  await (await nameIs(page, "Back")).tap(); // the page before: the shared list
  await page.waitForFunction(() => location.pathname === "/app/groceries/list/shared", null, { timeout: 60000 });
  await page.getByText("Added to your shopping list.").waitFor({ timeout: 60000 });
  expect((await page.getByRole("button", { name: "Add all to my shopping list" }).count()) === 0, "Add all is offered again after the list was added");
  expect((await mine()) === once, "the list changed: " + (await mine()));
  noErrors(errors);

  // a link that cannot be read, opened by address: 'Back to shopping list' puts the list in its place, so the list's own Back does not return to the error
  const bad = await ctx.newPage();
  await bad.goto(BASE + "/app/groceries/list/shared#abc", { timeout: 180000 });
  // two links carry that name once the problem is shown (the Back pill at the top and the button under the message): wait for the button, not just the pill
  await bad.waitForFunction(() => [...document.querySelectorAll("a")].filter((a) => a.getAttribute("aria-label") === "Back to shopping list" || (a.textContent || "").trim() === "Back to shopping list").length >= 2, null, { timeout: 120000 });
  await bad.getByRole("link", { name: "Back to shopping list" }).last().tap();
  await waitPath(bad, "/app/groceries/list");
  await (await nameIs(bad, "Back to home")).tap();
  await waitPath(bad, "/app");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
