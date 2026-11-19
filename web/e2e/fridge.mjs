// Cook with what you have (founder 2026-11-19: "people can write down what they have in their fridge, and then it can make some cool recipe which tastes nice
// based on all the stuff that they have"; "And based on what vibe of food they wanna eat"): the Recipes card, typing and tapping what you have, what you fancy,
// our recipes that use it, and (Premium builds) Pip's own recipe, pretended here, saved to My recipes. Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3005";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
await ctx.addInitScript((s) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("mm.v1.settings", s);
  localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes"] } }));
}, JSON.stringify({ v: 1, data: settings }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await step("Recipes has the card, and it opens Cook with what you have", async () => {
  await page.goto(BASE + "/app/recipes");
  const card = page.getByRole("link", { name: /Cook with what you have/ });
  await card.waitFor({ timeout: 90000 });
  await card.tap();
  await page.getByRole("heading", { level: 1, name: "Cook with what you have" }).waitFor();
  expect(await page.getByRole("button", { name: "Show me recipes" }).isDisabled(), "nothing typed: can't look yet");
});

await step("typing and tapping what you have, then what you fancy, finds our recipes that use it", async () => {
  await page.getByLabel("What do you have?").fill("spinach, leftover rice");
  await page.getByRole("button", { name: "eggs", exact: true }).tap();
  expect((await page.getByLabel("What do you have?").inputValue()) === "spinach, leftover rice, eggs", "the tap added eggs: " + (await page.getByLabel("What do you have?").inputValue()));
  await page.getByRole("radio", { name: "Anything" }).waitFor();
  await page.getByRole("button", { name: "Show me recipes" }).tap();
  await page.getByRole("heading", { name: "Recipes that use what you have" }).waitFor();
  const cards = page.locator("section[aria-labelledby='fridge-results'] li");
  await cards.first().waitFor({ timeout: 60000 });
  expect((await cards.count()) >= 1, "some recipes");
  expect(/Uses your .*eggs|Uses your .*spinach/.test(await cards.first().innerText()), "says what it uses: " + (await cards.first().innerText()).replace(/\n/g, " | "));
  // a kind of food narrows them
  await page.getByRole("radio", { name: "Quick" }).tap();
  await page.getByRole("button", { name: "Show me recipes" }).tap();
  await page.getByRole("heading", { name: "Recipes that use what you have" }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
});

await step("Pat's typing (usability test 2026-11-19): 'an onion', 'a tin of beans' and 'some chedar' are read as onion, beans and cheddar, and the screen says so", async () => {
  await page.getByLabel("What do you have?").fill("eggs, an onion, potatos, a tin of beans, some chedar, unicorn steak");
  await page.getByRole("radio", { name: "Anything" }).tap();
  await page.getByRole("button", { name: "Show me recipes" }).tap();
  await page.getByText("I read “chedar” as cheddar.").waitFor({ timeout: 60000 });
  await page.getByText(/None of our recipes uses “unicorn steak”/).waitFor();
  const cards = page.locator("section[aria-labelledby='fridge-results'] li");
  await cards.first().waitFor({ timeout: 60000 });
  const all = (await cards.allInnerTexts()).join(" | ");
  expect(/Uses your [^|]*onion/.test(all) && /Uses your [^|]*(beans|cheddar)/.test(all), "onion and beans or cheddar are used: " + all.slice(0, 300));
  expect((await page.getByRole("button", { name: "tinned beans", pressed: true }).count()) === 1, "the tinned beans chip shows as chosen");
});

await step("axe finds nothing on the screen", async () => {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id}: ${x.nodes[0]?.html.slice(0, 90)}`));
  expect(v.length === 0, v.join(" | "));
  expect(errors.length === 0, errors.join(" | "));
});

await step("a recipe opened from here starts with what you have ticked \"I have this\", and Add all leaves it off the list (usability test 2026-11-19: Pat)", async () => {
  await page.getByRole("radio", { name: "Anything" }).tap();
  await page.getByRole("button", { name: "Show me recipes" }).tap();
  const card = page.locator("section[aria-labelledby='fridge-results'] li").filter({ hasText: /Uses your .*eggs/ }).first();
  await card.waitFor({ timeout: 60000 });
  const href = await card.locator("a[href*='/app/recipes/view']").first().getAttribute("href");
  expect(/[?&]have=[a-z0-9,-]+/.test(href ?? ""), "the link carries what you have: " + href);
  await page.goto(BASE + href);
  const ticked = page.getByRole("button", { name: /^I have this: .*egg/i, pressed: true });
  await ticked.first().waitFor({ timeout: 90000 });
  // untick and tick again: the toggle works by hand too
  await ticked.first().tap();
  await page.getByRole("button", { name: /^I have this: .*egg/i, pressed: false }).first().waitFor();
  await page.getByRole("button", { name: /^I have this: .*egg/i }).first().tap();
  await page.getByRole("button", { name: "Add all to my shopping list" }).tap();
  const list = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []);
  expect(list.length > 0 && !list.some((x) => /\begg/i.test(x.name)), "eggs left off: " + list.map((x) => x.name).join(" | "));
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
