// Make it at home (founder 2026-11-16): take a photo of a dish or pick a screenshot, say what it is in as much detail as you can (a nudge when it's one or two
// words, "Suggest from my photo"), choose your supermarkets, Generate, a working list, then the recipe from real products. Premium only. The AI is pretended
// here (the two API routes are answered by the test), so no key is needed. Needs the test build with the feature on:
//   NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 npm run build && npm start -- -p 3101
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const PHOTO = fileURLToPath(new URL("../public/recipe-images/", import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

const { readdirSync } = await import("node:fs");
const photoFile = PHOTO + readdirSync(PHOTO).find((f) => f.startsWith("spiced-chicken-rice-bowl"));

const RECIPE = {
  name: "Peri-peri chicken with spicy rice",
  blurb: "Smoky paprika chicken with fluffy rice.",
  servings: 2,
  minutes: 35,
  ingredients: [
    { key: "chicken", amount: 400, role: "protein" }, { key: "rice", amount: 150, role: "carb" }, { key: "paprika", amount: 4, role: "other" },
    { key: "salt", amount: 1, role: "other" }, { key: "olive-oil", amount: 10, role: "other" }, { key: "garlic", amount: 10, role: "other" },
  ],
  method: [
    "Cook the rice: Rinse the rice, then simmer it in a pan of salted water for 12 minutes, until soft.",
    "Coat the chicken: Cut the chicken into strips and toss it with the paprika, garlic purée and oil.",
    "Cook the chicken: Fry the chicken over a medium-high heat for 8 to 10 minutes, until piping hot with no pink left.",
    "Serve: Drain the rice and serve it with the chicken on top.",
  ],
};

async function open(settings = {}, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
  }, JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }));
  const page = await ctx.newPage();
  const errors = [];
  const sent = { recipe: [], describe: [] };
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors, sent };
}

/** The pretend AI: a suggestion and a recipe (or whatever a step asks for). */
async function pretend(page, sent, { recipe = { status: 200, body: { recipe: RECIPE } }, describe = { status: 200, body: { description: "peri-peri chicken with spicy rice and a little salad" } }, delay = 1500 } = {}) {
  await page.route("**/api/v1/recipe/photo/describe", async (route) => {
    sent.describe.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
    await route.fulfill({ status: describe.status, contentType: "application/json", body: JSON.stringify(describe.body) });
  });
  await page.route("**/api/v1/recipe/photo", async (route) => {
    sent.recipe.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
    await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ status: recipe.status, contentType: "application/json", body: JSON.stringify(recipe.body) });
  });
}

const heading = (page, name) => page.getByRole("heading", { name, exact: true });
async function toDescribe(page) {
  await page.goto(BASE + "/app/recipes/photo");
  await heading(page, "Make it at home").waitFor({ timeout: 90000 });
  await page.locator('input[type="file"]:not([capture])').setInputFiles(photoFile);
  await page.getByRole("img", { name: "Your photo" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await heading(page, "What's in the photo?").waitFor();
}
async function axe(page) {
  await page.waitForTimeout(800); // let fades and slides finish before judging colours (e2e/README.md)
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((v) => `${v.id} (${v.nodes.length})`));
}

/** The ids of the photos kept on the phone, read without creating the database (null until the app has made it). */
const keptPhotos = (page) => page.evaluate(async () => {
  if (!(await indexedDB.databases()).some((d) => d.name === "mm-recipe-photos")) return null;
  return new Promise((resolve) => {
    const req = indexedDB.open("mm-recipe-photos");
    req.onsuccess = () => {
      try { const all = req.result.transaction("photos", "readonly").objectStore("photos").getAllKeys(); all.onsuccess = () => resolve(all.result); all.onerror = () => resolve(null); }
      catch { resolve(null); }
    };
    req.onerror = () => resolve(null);
  });
});
async function until(fn, ok, ms = 8000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (ok(v)) return v; if (Date.now() > end) return v; await new Promise((r) => setTimeout(r, 200)); } }

await step("Recipes shows the Make it at home card; a free person gets the paywall, a Premium person the page", async () => {
  const free = await open({ devProOverride: false });
  await free.page.goto(BASE + "/app/recipes");
  const card = free.page.getByRole("button", { name: /Make it at home/ });
  await card.waitFor({ timeout: 90000 });
  expect(/Premium/.test(await card.innerText()), "no Premium badge on the card for a free person");
  await card.tap();
  await free.page.locator("dialog[open]").waitFor({ timeout: 5000 });
  expect(!free.page.url().includes("/recipes/photo"), "a free person reached the page");
  await free.ctx.close();
  const pro = await open();
  await pro.page.goto(BASE + "/app/recipes");
  await pro.page.getByRole("button", { name: /Make it at home/ }).tap();
  await pro.page.waitForURL(/\/app\/recipes\/photo/);
  await heading(pro.page, "Make it at home").waitFor();
  for (const b of ["Take a photo", "Choose from your photos"]) await pro.page.getByRole("button", { name: b }).waitFor();
  expect(pro.errors.length === 0, pro.errors.join(" | "));
  await pro.ctx.close();
});

await step("a free person who opens the address sees the Premium screen, not the flow", async () => {
  const { ctx, page } = await open({ devProOverride: false });
  await page.goto(BASE + "/app/recipes/photo");
  await page.getByText("Make it at home is part of Premium.", { exact: false }).waitFor({ timeout: 90000 });
  expect((await page.getByRole("button", { name: "Take a photo" }).count()) === 0, "the photo buttons show for a free person");
  await page.getByRole("button", { name: "See Premium" }).tap();
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  await ctx.close();
});

await step("a short description gets the nudge; 'Suggest from my photo' fills it in from the photo", async () => {
  const { ctx, page, errors, sent } = await open();
  await pretend(page, sent);
  await toDescribe(page);
  await page.getByText("For example, 'peri-peri chicken wings with spicy rice', not just 'chicken wings'.", { exact: false }).waitFor();
  const box = page.getByRole("textbox", { name: "What's in the photo?" });
  await box.fill("wings");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByText("Add a bit more, like the flavour or sauce, so the recipe matches your photo.").waitFor();
  await page.getByRole("button", { name: "Carry on anyway" }).waitFor();
  await page.getByRole("button", { name: "Suggest from my photo" }).tap();
  await page.waitForFunction(() => document.querySelector("textarea")?.value.startsWith("peri-peri chicken"), null, { timeout: 5000 });
  expect((await page.getByText("Add a bit more", { exact: false }).count()) === 0, "the nudge stayed after a full description");
  expect(sent.describe.length === 1 && /^\/9j\//.test(sent.describe[0].body.image), "the suggestion didn't send a JPEG of the photo");
  expect(Object.keys(sent.describe[0].body).join() === "image", "the suggestion sent more than the photo: " + Object.keys(sent.describe[0].body));
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await heading(page, "Where do you shop?").waitFor();
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("Generate shows the working list, then the recipe from real products, with titled steps; only the dish, diet and products are sent", async () => {
  const { ctx, page, errors, sent } = await open();
  await pretend(page, sent);
  await toDescribe(page);
  await page.getByRole("textbox", { name: "What's in the photo?" }).fill("peri-peri chicken wings with spicy rice");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await heading(page, "Where do you shop?").waitFor();
  await page.getByText("we send your photo (made smaller on your phone first)", { exact: false }).waitFor();
  const generate = page.getByRole("button", { name: "Generate my recipe" });
  await generate.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Generate my recipe"))?.disabled, null, { timeout: 30000 });
  await generate.tap();
  await page.getByText("Looking at your photo…").first().waitFor({ timeout: 3000 });
  await page.getByText("Choosing ingredients from Sainsbury's…").first().waitFor();
  await page.getByRole("heading", { name: RECIPE.name }).waitFor({ timeout: 15000 });
  const body = sent.recipe[0].body;
  expect(Object.keys(body).sort().join() === "description,diet,image,pantry,servings,shop,target", "unexpected fields sent: " + Object.keys(body).sort());
  expect(body.description === "peri-peri chicken wings with spicy rice" && body.shop === "sainsburys" && /^\/9j\//.test(body.image), "wrong description, shop or photo");
  expect(body.image.length < 1_400_000, "the photo wasn't made smaller: " + body.image.length);
  expect(body.pantry.length > 20, "the pantry wasn't sent");
  await page.getByRole("tab", { name: "Method" }).tap();
  for (const title of ["Cook the rice", "Coat the chicken", "Cook the chicken", "Serve"]) await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.getByRole("button", { name: "Save this recipe" }).tap();
  await page.getByText("Saved to Your recipes.").waitFor();
  const mine = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.myRecipes") ?? "null")?.data ?? []);
  expect(mine.length === 1 && mine[0].name === RECIPE.name, "the recipe wasn't saved");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the photo becomes the saved recipe's picture: on its card in My meals and at the top of the recipe, kept on this phone only, gone after Clear data", async () => {
  const { ctx, page, errors, sent } = await open();
  await pretend(page, sent, { delay: 300 });
  await toDescribe(page);
  await page.getByRole("textbox", { name: "What's in the photo?" }).fill("peri-peri chicken wings with spicy rice");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Generate my recipe"))?.disabled, null, { timeout: 30000 });
  await page.getByRole("button", { name: "Generate my recipe" }).tap();
  await page.getByRole("heading", { name: RECIPE.name }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Save this recipe" }).tap();
  await page.getByText("Saved to Your recipes.").waitFor();
  // the photo is kept on the phone (IndexedDB), and NOT inside the saved recipe that syncs to an account
  const kept = (await until(() => keptPhotos(page), (v) => Array.isArray(v) && v.length === 1))?.[0];
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.myRecipes") ?? "null")?.data ?? []);
  expect(saved.length === 1 && kept === saved[0].id, `photo kept under the recipe's id: ${kept} / ${saved[0]?.id}`);
  expect(!JSON.stringify(saved).includes("base64") && JSON.stringify(saved).length < 6000, "the photo got into the synced recipe");
  // its card in My meals shows the photo, labelled as the person's own
  await page.goto(BASE + "/app/meals");
  const card = page.locator(`a[href*="mine=${saved[0].id}"]`);
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction((id) => document.querySelector(`a[href*="mine=${id}"] img`)?.getAttribute("src")?.startsWith("blob:"), saved[0].id, { timeout: 5000 });
  expect(/your photo/i.test(await card.innerText()), "the card's picture isn't labelled as the person's photo");
  // and the recipe page opened from it has the photo at the top
  await card.tap();
  await page.getByRole("img", { name: "Your photo" }).waitFor({ timeout: 15000 });
  await page.getByText("Your photo. The recipe is Pip's home version.").waitFor();
  // Settings > Clear data removes it
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: /Clear data on this device/ }).tap();
  await page.getByRole("button", { name: "Clear everything" }).tap();
  const left = await until(() => keptPhotos(page), (v) => Array.isArray(v) && v.length === 0);
  expect(Array.isArray(left) && left.length === 0, `photos left after Clear data: ${JSON.stringify(left)}`);
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("when Pip can't make one, the reason shows with Try again; a photo with no food says so", async () => {
  const { ctx, page, sent } = await open();
  await pretend(page, sent, { recipe: { status: 502, body: { error: "no_recipe", message: "Pip couldn't make a recipe from this photo. Please try again, maybe with more detail about the dish." } }, describe: { status: 422, body: { error: "not_food", message: "Pip couldn't see a dish in this photo. Try a clearer photo of the food." } }, delay: 200 });
  await toDescribe(page);
  await page.getByRole("button", { name: "Suggest from my photo" }).tap();
  await page.getByText("Pip couldn't see a dish in this photo.", { exact: false }).waitFor({ timeout: 5000 });
  await page.getByRole("textbox", { name: "What's in the photo?" }).fill("peri-peri chicken wings with spicy rice");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  const generate = page.getByRole("button", { name: "Generate my recipe" });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Generate my recipe"))?.disabled, null, { timeout: 30000 });
  await generate.tap();
  await page.getByText("Pip couldn't make a recipe from this photo.", { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /Try again/ }).waitFor();
  await ctx.close();
});

await step("Back steps through the flow without losing the photo or the words", async () => {
  const { ctx, page, sent } = await open();
  await pretend(page, sent);
  await toDescribe(page);
  await page.getByRole("textbox", { name: "What's in the photo?" }).fill("peri-peri chicken wings with spicy rice");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await heading(page, "Where do you shop?").waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await heading(page, "What's in the photo?").waitFor();
  expect((await page.getByRole("textbox", { name: "What's in the photo?" }).inputValue()) === "peri-peri chicken wings with spicy rice", "the words were lost");
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await page.getByRole("img", { name: "Your photo" }).waitFor();
  await ctx.close();
});

await step("every step fits a 360 px phone at the largest text size (no sideways scroll) and has no accessibility problems", async () => {
  const { ctx, page, sent } = await open({ textSize: "xlarge" }, { width: 360, height: 780 });
  await pretend(page, sent);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto(BASE + "/app/recipes/photo");
  await heading(page, "Make it at home").waitFor({ timeout: 90000 });
  expect((await wide()) <= 1, "photo step scrolls sideways");
  let v = await axe(page);
  expect(v.length === 0, "photo step axe: " + v.join(", "));
  await page.locator('input[type="file"]:not([capture])').setInputFiles(photoFile);
  await page.getByRole("img", { name: "Your photo" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await heading(page, "What's in the photo?").waitFor();
  await page.getByRole("textbox", { name: "What's in the photo?" }).fill("wings");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByText("Add a bit more", { exact: false }).waitFor();
  expect((await wide()) <= 1, "describe step scrolls sideways");
  v = await axe(page);
  expect(v.length === 0, "describe step axe: " + v.join(", "));
  await page.getByRole("button", { name: "Carry on anyway" }).tap();
  await heading(page, "Where do you shop?").waitFor();
  expect((await wide()) <= 1, "shops step scrolls sideways");
  v = await axe(page);
  expect(v.length === 0, "shops step axe: " + v.join(", "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
