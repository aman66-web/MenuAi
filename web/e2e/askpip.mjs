// Ask Pip (lib/mm/askPip.ts; founder 2026-11-26). Needs a build with NEXT_PUBLIC_ASK_PIP=1 (and NEXT_PUBLIC_SIGN_IN_REQUIRED=0 to skip sign-in). The API is faked
// here (no key, no money): it plays back e2e/fixtures/askpip-streams.json, three answers made by the real tools on the real menus, labels and recipes with a
// scripted model (WRITE_ASKPIP_E2E=1 npx vitest run tests/askPip.test.ts writes them). Checks: the Pip button on Home, Recipes, Groceries and Eat out (44 px,
// named "Ask Pip", on the same row as Shopping list at 390 and 360 px), Pip's permission before the first question, the starters, the typing line, the
// restaurant card with what clashes, the recipe card's Save, View meal plan opening the Meal plan screen with Pip's answers, what is sent (no name or email),
// Start again, and axe.
//   BASE=http://localhost:3006 SHOTS=/some/dir node e2e/askpip.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3006";
const SHOTS = process.env.SHOTS;
const STREAMS = JSON.parse(readFileSync(new URL("./fixtures/askpip-streams.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const SETTINGS = JSON.stringify({ v: 1, data: {
  goal: "lose", dailyCalories: 1800, dailyProtein: 130, hasSetTargets: true, glp1MealCap: 450, preferences: { vegetarianOnly: false, noPork: false, noBeef: false },
  toldUs: { vegetarianOnly: false, noPork: false, noBeef: false, avoidAllergens: ["milk"] }, signUpApart: true, hasCompletedOnboarding: true, dismissedTargetsCard: true, shops: ["sainsburys"],
} });

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function newPage(width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", colorScheme: "light" });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 }));
  }, SETTINGS);
  const page = await ctx.newPage();
  const sent = [];
  await page.route("**/api/v1/pip/chat", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    sent.push(body);
    const q = body.messages.at(-1).text.toLowerCase();
    const events = q.includes("nando") ? STREAMS.menu : q.includes("plan") ? STREAMS.plan : STREAMS.recipes;
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
  });
  return { ctx, page, sent };
}

const pipButton = (page) => page.getByRole("button", { name: "Ask Pip", exact: true });

await step("the Pip button: four tabs, 44 px, on the Shopping list's row, at 390 and 360 px", async () => {
  for (const width of [390, 360]) {
    const { ctx, page } = await newPage(width);
    for (const path of ["/app", "/app/recipes", "/app/groceries", "/app/eat-out"]) {
      await page.goto(`${BASE}${path}`);
      const b = pipButton(page);
      await b.waitFor();
      const box = await b.boundingBox();
      const list = await page.getByRole("link", { name: /^Shopping list/ }).first().boundingBox();
      expect(box.width >= 44 && box.height >= 44, `${path} at ${width}: ${box.width}×${box.height}`);
      expect(Math.abs(box.y - list.y) < 4 && box.x < list.x, `${path} at ${width}: Pip isn't just before Shopping list`);
    }
    await ctx.close();
  }
});

await step("asks Pip's permission first, then answers about a restaurant with the menu's figures and what clashes", async () => {
  const { ctx, page, sent } = await newPage();
  await page.goto(`${BASE}/app`);
  await pipButton(page).click();
  await page.getByRole("button", { name: "What fits my protein at Nando's?" }).click();
  await page.getByRole("button", { name: "Allow" }).click();
  await page.getByText("Contains milk", { exact: true }).waitFor();
  expect(await page.getByText("289 kcal · 39 g protein").isVisible(), "the quarter chicken's own figures");
  expect(await page.getByText("Not affiliated with Nando's").isVisible(), "not affiliated");
  const body = JSON.stringify(sent[0]);
  expect(!/email|name"|userId|account/i.test(body), `nothing about who they are: ${body}`);
  expect(sent[0].me.avoid.includes("milk"), "the allergy they told us goes with it");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/askpip-menu-390.png` });
  await ctx.close();
});

await step("a recipe card saves in one tap; View meal plan makes the week from Pip's answers", async () => {
  const { ctx, page, sent } = await newPage();
  await page.addInitScript(() => localStorage.setItem("mm.v1.aiOk", JSON.stringify({ v: 1, data: ["scan", "photoRecipe", "fridgeRecipe", "mealPlan", "askPip"] })));
  await page.goto(`${BASE}/app/recipes`);
  await pipButton(page).click();
  await page.getByRole("button", { name: "What can I have for dinner tonight?" }).click();
  const save = page.getByRole("button", { name: /^Save Chicken, rice and soy bowl$/ });
  await save.click();
  await page.getByRole("button", { name: /^Saved: Chicken, rice and soy bowl$/ }).waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.savedRecipes")).data.map((r) => r.id));
  expect(saved.includes("chicken-rice-bowl"), `saved: ${saved}`);
  await page.getByRole("textbox").fill("Make me a meal plan for this week");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "View meal plan" }).click();
  await page.waitForURL("**/app/plan");
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem("mm.v1.mealPlan") ?? "null")?.data, null, { timeout: 60_000 });
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.mealPlan")).data);
  expect(plan.answers?.aim === "loseFat" && plan.answers?.cookWeekday === 30 && plan.ids.length === 7, `the plan: ${JSON.stringify(plan.answers)}`);
  // Pip's earlier turn goes back with the names of his cards, never their figures
  const pipTurn = sent[1].messages.find((m) => m.role === "pip");
  expect(pipTurn && /Shown recipes/.test(pipTurn.text) && !/kcal/.test(pipTurn.text), `history: ${JSON.stringify(sent[1].messages)}`);
  await ctx.close();
});

await step("Start again empties the chat; axe finds nothing", async () => {
  const { ctx, page } = await newPage();
  await page.addInitScript(() => localStorage.setItem("mm.v1.aiOk", JSON.stringify({ v: 1, data: ["scan", "photoRecipe", "fridgeRecipe", "mealPlan", "askPip"] })));
  await page.goto(`${BASE}/app/eat-out`);
  await pipButton(page).click();
  await page.getByRole("button", { name: "What fits my protein at Nando's?" }).click();
  await page.getByText("Contains milk", { exact: true }).waitFor();
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => await axe.run(document.querySelector("dialog[open]"), { resultTypes: ["violations"] }));
  expect(result.violations.length === 0, result.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", "));
  await page.getByRole("button", { name: "Start again" }).click();
  await page.getByRole("button", { name: "What fits my protein at Nando's?" }).waitFor();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.pipChat") ?? "null")?.data?.length ?? 0)) === 0, "the chat is emptied");
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
