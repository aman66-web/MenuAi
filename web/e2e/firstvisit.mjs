// Instant utility first (founder's brief, 13 Nov 2026): nobody is stopped at the door by a questionnaire. Links to a restaurant, a dish or a shared list open
// straight away with defaults; Home and Eat out show a quiet "Make Numbite fit you" card that opens one sheet (goal + what you avoid). Since 17 Nov 2026 a plain
// first launch of /app opens the welcome screens (lib/mm/tour.ts; e2e/tour.mjs and e2e/showcase.mjs have the rest), so the steps about the card on Home start
// after they were seen (mm.v1.tour at TOUR_VERSION 2).
// Run against a production build: BASE=http://localhost:3101 node e2e/firstvisit.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
// a build with no sample chains (production default): CHAIN="kfc:KFC"
const [CHAIN_ID, CHAIN_NAME] = (process.env.CHAIN ?? "cluck-house:Cluck House").split(":");
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
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const fresh = (extra = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...extra });
const settingsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") || "null")?.data ?? null);
const card = (page) => page.getByRole("heading", { level: 2, name: "Make Numbite fit you" });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** A browser where the welcome screens have been seen (they mark mm.v1.tour at TOUR_VERSION, 2), so a plain /app opens Home. */
const toured = async (extra = {}) => {
  const ctx = await fresh(extra);
  await ctx.addInitScript(() => { if (!localStorage.getItem("mm.v1.tour")) localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); });
  return ctx;
};

await step("a plain first visit to /app opens the welcome screens instead of Home", async () => {
  const ctx = await fresh(); const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.waitForURL(/\/app\/welcome$/);
  await page.getByRole("button", { name: "Get started" }).waitFor();
  expect((await page.getByRole("heading", { level: 1, name: "Home" }).count()) === 0, "Home shows on the welcome screens");
  await ctx.close();
});

await step("after the welcome screens, Home shows the card and never leaves /app", async () => {
  const ctx = await toured(); const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("heading", { level: 1, name: "Home" }).waitFor();
  await card(page).waitFor();
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname === "/app", "moved to " + page.url());
  expect((await page.getByText("Set your targets to see what's left today").count()) === 0, "the old targets card shows beside the new one");
  await ctx.close();
});

await step("a first visit to Eat out lists the restaurants with the same card above the search", async () => {
  const ctx = await fresh(); const page = await ctx.newPage();
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("heading", { level: 1, name: /Eat/ }).waitFor();
  await card(page).waitFor();
  await page.getByText("Search restaurants and items").waitFor();
  expect(!/welcome/.test(page.url()), "sent to the questions: " + page.url());
  await ctx.close();
});

await step("links straight to a restaurant, a dish and the search open at once", async () => {
  const ctx = await fresh(); const page = await ctx.newPage();
  for (const [path, heading] of [["/app/chain?id=" + CHAIN_ID, CHAIN_NAME], ["/app/search", null]]) {
    await page.goto(BASE + path);
    if (heading) await page.getByRole("heading", { name: heading }).waitFor();
    else await page.locator("input").first().waitFor();
    await page.waitForTimeout(500);
    expect(!/welcome/.test(page.url()), path + " was sent to " + page.url());
  }
  await ctx.close();
});

await step("Set up opens one sheet: the goal, GLP-1's doctor line, what you avoid; Save keeps both and the card goes", async () => {
  const ctx = await toured(); const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Set up" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /Maintain/ }).waitFor();
  expect((await sheet.getByRole("radio").count()) === 5, "five goals");
  await sheet.getByRole("radio", { name: /GLP-1/ }).click();
  await sheet.getByText("follow the advice of your doctor or pharmacist").waitFor();
  await sheet.getByRole("radio", { name: /Build muscle/ }).click();
  expect((await sheet.getByText("follow the advice of your doctor or pharmacist").count()) === 0, "the GLP-1 line stays for another goal");
  await sheet.getByRole("button", { name: /^Vegetarian/ }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await card(page).waitFor({ state: "detached" });
  const s = await settingsOf(page);
  // what was told at sign-up is kept apart and filters nothing (founder 2026-11-21: "you should not filter people based on what they've put in")
  expect(s.goal === "buildMuscle" && s.toldUs?.vegetarianOnly === true && s.preferences.vegetarianOnly !== true && s.hasCompletedOnboarding === true, "saved: " + JSON.stringify(s));
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "Home" }).waitFor();
  expect((await card(page).count()) === 0, "the card is back after a reload");
  await ctx.close();
});

await step("Not now hides the card on Home and on Eat out, and keeps the app on its defaults", async () => {
  const ctx = await toured(); const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("button", { name: "Not now" }).click();
  await card(page).waitFor({ state: "detached" });
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("heading", { level: 1, name: /Eat/ }).waitFor();
  expect((await card(page).count()) === 0, "shows on Eat out after Not now");
  const s = await settingsOf(page);
  expect(s.goal === "maintain" && s.dailyCalories === 2000 && !s.hasCompletedOnboarding, "defaults changed: " + JSON.stringify(s));
  await ctx.close();
});

await step("a returning person (set up already) never sees the card", async () => {
  const ctx = await fresh();
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {} } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await page.getByRole("heading", { level: 1, name: "Home" }).waitFor();
  await page.waitForTimeout(500);
  expect((await card(page).count()) === 0, "shown to a returning person");
  await ctx.close();
});

await step("the guided setup at /app/welcome starts with Get started on its cover, straight to step 1 of 8 (heard with the headline, never written; no tour, no 'Let's make it yours' since 20 November)", async () => {
  const ctx = await fresh(); const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("heading", { level: 1, name: /^What's your goal\?\s*, Step 1 of 8$/ }).waitFor();
  expect((await page.getByText(/^Step \d+ of \d+$/).count()) === 0, "'Step n of N' is written on screen");
  await ctx.close();
});

await step("App Review 1.4.1: the first-visit card under Home's targets links their sources, and so does the GLP-1 note in its sheet", async () => {
  const ctx = await toured(); const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await card(page).waitFor();
  const sources = page.getByRole("dialog", { name: "Where these numbers come from" });
  await page.getByRole("button", { name: "Where these numbers come from" }).click();
  await sources.getByText("Until you set your own, a target of 2,000 kcal a day.").waitFor();
  const hosts = (await sources.locator("a[href^='http']").evaluateAll((as) => as.map((a) => new URL(a.href).host))).sort();
  expect(hosts.join() === "pmc.ncbi.nlm.nih.gov,pubmed.ncbi.nlm.nih.gov,www.nhs.uk", "sources: " + hosts.join());
  await page.keyboard.press("Escape");
  await sources.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Set up" }).click();
  const setup = page.getByRole("dialog", { name: "Make Numbite fit you" });
  await setup.getByRole("radio", { name: /GLP-1/ }).click();
  await setup.getByRole("button", { name: "Where these numbers come from" }).click();
  await sources.getByRole("heading", { name: "Calories your body uses at rest" }).waitFor();
  await page.keyboard.press("Escape");
  await sources.waitFor({ state: "hidden" });
  await setup.getByRole("radio", { name: /GLP-1/ }).waitFor();
  expect((await setup.getByRole("radio", { name: /GLP-1/ }).getAttribute("aria-checked")) === "true", "the set-up sheet kept its answer");
  await ctx.close();
});

await step("the card and sheet: 48 px buttons, no sideways scroll at 360 px and Extra large text, axe 0", async () => {
  const ctx = await toured({ viewport: { width: 360, height: 740 } });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { textSize: "xlarge" } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  await card(page).waitFor();
  for (const name of ["Set up", "Not now"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box.height >= 47.5, `${name} is ${box.height}px tall`);
  }
  expect((await overflow(page)) <= 0, "sideways scroll with the card");
  await page.getByRole("button", { name: "Set up" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /Maintain/ }).waitFor();
  await page.waitForTimeout(500);
  expect((await overflow(page)) <= 0, "sideways scroll with the sheet");
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
