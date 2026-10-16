// "Back goes to the page before" on the restaurant pages (founder 2026-10-16: on Recipes the heart opened My meals and Back there went to Home, not to Recipes).
// A restaurant's page, a dish, the order builder, Compare and "How we get our numbers" used to link to one fixed page; now Back takes the browser's own Back when the
// page was reached from another page of the app (checked by going Forward again: a new link would have wiped the forward entry) and goes to the fixed page only when there
// is nothing earlier (a page opened by address, a shared link, a fresh launch). The spoken name is plain "Back" in the first case and "Back to ..." in the second.
// Needs the Pro build with sample data on (the builder is Pro). Touch is on, like an iPhone.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 7).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
  }, JSON.stringify({ v: 1, data: settings }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const back = (page, name) => page.locator("main").getByRole("link", { name, exact: true });
/** Wait until the page shows a Back link of that spoken name (the name settles after the first render, once the page knows how it was reached). */
async function backLink(page, name) { const l = back(page, name); await l.first().waitFor({ timeout: 120000 }); return l.first(); }
const go = async (page, url) => { await page.goto(BASE + url, { timeout: 180000 }); };
async function waitPath(page, p) { await page.waitForFunction((want) => location.pathname + location.search === want, p, { timeout: 120000 }); }
async function chainFromEatOut(page) {
  await go(page, "/app/eat-out");
  const link = page.locator('a[href*="chain?id=bowl-and-co"]').first();
  await link.waitFor({ timeout: 120000 });
  await link.click();
  await waitPath(page, "/app/chain?id=bowl-and-co");
}
const DISH = "chicken-bowl";

await step("a restaurant opened from Eat out: Back is plain 'Back', returns to Eat out through the browser's history (Forward still works)", async () => {
  const { ctx, page, errors } = await open();
  await chainFromEatOut(page);
  const b = await backLink(page, "Back");
  await b.click();
  await waitPath(page, "/app/eat-out");
  await page.goForward();
  await waitPath(page, "/app/chain?id=bowl-and-co");
  expect(errors.length === 0, "errors: " + errors.join(" | "));
  await ctx.close();
});

await step("a restaurant opened by address (nothing earlier): Back is named 'Back to restaurants' and goes to Eat out", async () => {
  const { ctx, page } = await open();
  await go(page, "/app/chain?id=bowl-and-co");
  const b = await backLink(page, "Back to restaurants");
  await b.click();
  await waitPath(page, "/app/eat-out");
  await ctx.close();
});

await step("a restaurant reloaded after being reached from Eat out still goes back to Eat out", async () => {
  const { ctx, page } = await open();
  await chainFromEatOut(page);
  await page.reload({ timeout: 180000 });
  const b = await backLink(page, "Back");
  await b.click();
  await waitPath(page, "/app/eat-out");
  await ctx.close();
});

await step("a dish opened from its restaurant: Back returns to the restaurant (history); opened by address it says 'Back to menu' and goes to the restaurant", async () => {
  const { ctx, page } = await open();
  await chainFromEatOut(page);
  await page.locator(`a[href*="item?chain=bowl-and-co&item=${DISH}"]`).first().click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await (await backLink(page, "Back")).click();
  await waitPath(page, "/app/chain?id=bowl-and-co");
  await page.goForward();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  // by address
  const fresh = await ctx.newPage();
  await fresh.goto(BASE + `/app/item?chain=bowl-and-co&item=${DISH}`, { timeout: 180000 });
  await (await backLink(fresh, "Back to menu")).click();
  await waitPath(fresh, "/app/chain?id=bowl-and-co");
  await ctx.close();
});

await step("a restaurant reached from one of its dishes (the chain name): Back returns to the dish, not to Eat out", async () => {
  const { ctx, page } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await page.locator('main a[href*="chain?id=bowl-and-co"]').filter({ hasNotText: /^Back/ }).first().click();
  await waitPath(page, "/app/chain?id=bowl-and-co");
  await (await backLink(page, "Back")).click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await ctx.close();
});

await step("the order builder opened with Customise: Back returns to the dish; opened by address it says 'Back to menu' and goes to the restaurant", async () => {
  const { ctx, page } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("button", { name: "Customise" }).click();
  await waitPath(page, `/app/builder?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  expect((await page.locator("main").getByRole("button", { name: "Back", exact: true }).count()) === 0, "the builder's Back is still a button, not a link");
  await (await backLink(page, "Back")).click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  // by address: the old button called router.back() here, which left the app (or did nothing); now it goes to the restaurant's menu
  const fresh = await ctx.newPage();
  await fresh.goto(BASE + `/app/builder?chain=bowl-and-co&item=${DISH}`, { timeout: 180000 });
  await fresh.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  await (await backLink(fresh, "Back to menu")).click();
  await waitPath(fresh, "/app/chain?id=bowl-and-co");
  await ctx.close();
});

await step("Compare opened from a dish: Back returns to the dish; opened by address it goes to Eat out (dishes) or Groceries (products) by the tab", async () => {
  const { ctx, page } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("link", { name: "See the comparison" }).click();
  await waitPath(page, "/app/compare?tab=dish");
  await (await backLink(page, "Back")).click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  const dishes = await ctx.newPage();
  await dishes.goto(BASE + "/app/compare?tab=dish", { timeout: 180000 });
  await (await backLink(dishes, "Back to restaurants")).click();
  await waitPath(dishes, "/app/eat-out");
  const foods = await ctx.newPage();
  await foods.goto(BASE + "/app/compare?tab=food", { timeout: 180000 });
  await (await backLink(foods, "Back to groceries")).click();
  await waitPath(foods, "/app/groceries");
  await ctx.close();
});

await step("'How we get our numbers' opened from Settings: its pill returns to Settings through the history (Forward still works); opened by address it goes to Settings", async () => {
  const { ctx, page } = await open();
  await go(page, "/app/settings");
  await page.getByRole("link", { name: "How we get our numbers" }).click();
  await waitPath(page, "/app/settings/numbers");
  await page.locator("main").getByRole("link", { name: "Settings", exact: true }).click();
  await waitPath(page, "/app/settings");
  await page.goForward();
  await waitPath(page, "/app/settings/numbers");
  const fresh = await ctx.newPage();
  await fresh.goto(BASE + "/app/settings/numbers", { timeout: 180000 });
  await fresh.locator("main").getByRole("link", { name: "Settings", exact: true }).click();
  await waitPath(fresh, "/app/settings");
  await ctx.close();
});

await step("a modified click (new tab) is left to the link: it opens the fixed page and this page stays where it is", async () => {
  const { ctx, page } = await open();
  await chainFromEatOut(page);
  const b = await backLink(page, "Back");
  const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 20000 }), b.click({ modifiers: ["Control"] })]);
  await popup.waitForLoadState("domcontentloaded");
  expect(new URL(popup.url()).pathname === "/app/eat-out", "the new tab opened " + popup.url());
  expect(path(page) === "/app/chain?id=bowl-and-co", "this page moved to " + path(page));
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Finishing the builder: Save and Log must not leave the finished builder in the history. Back from My meals or Today would return to it with Save and Log live again,
// and one more tap would save a second order or log the meal twice.
const count = (page, key) => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? "null")?.data ?? []).length, key);
const MEALS = "/app/meals?tab=restaurant";

await step("the builder's Save: My meals takes its place in the history, Back returns to the dish (not the builder), and nothing is saved twice", async () => {
  const { ctx, page, errors } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("button", { name: "Customise" }).click();
  await waitPath(page, `/app/builder?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await waitPath(page, MEALS);
  expect((await count(page, "mm.v1.saved")) === 1, "one saved order expected");
  await (await backLink(page, "Back")).click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`); // the dish, not the finished builder
  expect((await count(page, "mm.v1.saved")) === 1, "an order was saved a second time");
  await page.goForward();
  await waitPath(page, MEALS); // Forward still reaches My meals
  expect(errors.length === 0, "errors: " + errors.join(" | "));
  await ctx.close();
});

await step("the builder's Log: Today takes its place in the history and Back returns to the dish, so the meal cannot be logged twice by going back", async () => {
  const { ctx, page, errors } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("button", { name: "Customise" }).click();
  await waitPath(page, `/app/builder?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await waitPath(page, "/app/today");
  expect((await count(page, "mm.v1.log")) === 1, "one log entry expected");
  await (await backLink(page, "Back")).click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  expect((await count(page, "mm.v1.log")) === 1, "the meal was logged a second time");
  expect(errors.length === 0, "errors: " + errors.join(" | "));
  await ctx.close();
});

await step("'Save changes' on a saved order opened from My meals goes back to My meals through the history (Home is not three Backs away)", async () => {
  const { ctx, page, errors } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`); // depth 0
  await page.getByRole("button", { name: "Customise" }).click();
  await page.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await waitPath(page, MEALS); // takes the builder's place: depth 1
  await page.getByRole("link", { name: "Open in builder" }).first().click();
  await page.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  expect(new URL(page.url()).searchParams.has("saved"), "the builder should hold the saved order's id");
  await page.getByRole("button", { name: "Save changes" }).click();
  await waitPath(page, MEALS);
  expect((await count(page, "mm.v1.saved")) === 1, "the saved order should be updated in place");
  await (await backLink(page, "Back")).click();
  await waitPath(page, `/app/item?chain=bowl-and-co&item=${DISH}`); // one Back from My meals: the dish it all began at
  expect(errors.length === 0, "errors: " + errors.join(" | "));
  await ctx.close();
});

await step("'Save changes' with the builder opened by address (nothing below) replaces it with My meals; Back from there goes to Home", async () => {
  const { ctx, page } = await open();
  await go(page, `/app/item?chain=bowl-and-co&item=${DISH}`);
  await page.getByRole("button", { name: "Customise" }).click();
  await page.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await waitPath(page, MEALS);
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.saved")).data[0].id);
  const fresh = await ctx.newPage();
  await fresh.goto(BASE + `/app/builder?chain=bowl-and-co&saved=${id}`, { timeout: 180000 });
  await fresh.getByRole("heading", { name: "Build your order" }).waitFor({ timeout: 120000 });
  await fresh.getByRole("button", { name: "Save changes" }).click();
  await waitPath(fresh, MEALS);
  await (await backLink(fresh, "Back to home")).click(); // My meals now stands where the builder did: nothing earlier, so the fixed page
  await waitPath(fresh, "/app");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
