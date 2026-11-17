// Make it at home (founder 2026-11-16, new order 2026-11-17): the dish's name and a short description (a nudge when it's thin), the camera with its scanning look
// and a few seconds of "Scanning", the supermarket, Next, a loading screen, then the recipe from real products with the person's photo on top. Premium only.
// The AI is pretended here (the API route is answered by the test), so no key is needed; Chromium's fake camera stands in for the lens. Needs the test build:
//   NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1 npm run build && npm start -- -p 3101
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const PHOTO = fileURLToPath(new URL("../public/recipe-images/", import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
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
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", permissions: ["camera"] });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
  }, JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }));
  const page = await ctx.newPage();
  const errors = [];
  const sent = { recipe: [] };
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors, sent };
}

/** The pretend AI: a recipe (or whatever a step asks for). */
async function pretend(page, sent, { recipe = { status: 200, body: { recipe: RECIPE } }, delay = 1500 } = {}) {
  await page.route("**/api/v1/recipe/photo", async (route) => {
    sent.recipe.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
    await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ status: recipe.status, contentType: "application/json", body: JSON.stringify(recipe.body) });
  });
}

const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const DISH = { name: "Peri-peri chicken wings", about: "Smoky paprika wings with spicy rice and a little salad" };
const DISH_TEXT = "Peri-peri chicken wings. Smoky paprika wings with spicy rice and a little salad";
async function toDescribe(page) {
  await page.goto(BASE + "/app/recipes/photo");
  await heading(page, "Make it at home").waitFor({ timeout: 90000 });
  await page.getByLabel("Name of the dish").waitFor();
}
async function fillDish(page, dish = DISH) {
  await page.getByLabel("Name of the dish").fill(dish.name);
  await page.getByLabel("A short description").fill(dish.about);
}
/** Fills the dish, taps Next (the camera opens), picks the test photo from the phone's photos, and waits for the "Scanning" screen to hand over to the shops. */
async function toShops(page, dish = DISH) {
  await toDescribe(page);
  await fillDish(page, dish);
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  await page.locator('input[type="file"]:not([capture])').setInputFiles(photoFile);
  await page.getByText("Scanning", { exact: true }).first().waitFor({ timeout: 8000 });
  await heading(page, "Where do you shop?").waitFor({ timeout: 8000 });
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

await step("Recipes shows the Make it at home card; a free person gets the paywall, a Premium person the page with the name and description first", async () => {
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
  await pro.page.getByLabel("Name of the dish").waitFor();
  await pro.page.getByLabel("A short description").waitFor();
  expect((await pro.page.getByRole("button", { name: "Next", exact: true }).isDisabled()), "Next is on before the dish has a name");
  expect((await pro.page.getByRole("button", { name: "Take a photo" }).count()) === 0, "the photo buttons show before the dish is named");
  expect(pro.errors.length === 0, pro.errors.join(" | "));
  await pro.ctx.close();
});

await step("a free person who opens the address sees the Premium screen, not the flow", async () => {
  const { ctx, page } = await open({ devProOverride: false });
  await page.goto(BASE + "/app/recipes/photo");
  await page.getByText("Make it at home is part of Premium.", { exact: false }).waitFor({ timeout: 90000 });
  expect((await page.getByLabel("Name of the dish").count()) === 0, "the form shows for a free person");
  await page.getByRole("button", { name: "See Premium" }).tap();
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  await ctx.close();
});

await step("a thin name gets the nudge; a description clears it; Next opens the camera", async () => {
  const { ctx, page, errors } = await open();
  await toDescribe(page);
  await page.getByLabel("Name of the dish").fill("wings");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByText("Add a bit more, like the flavour or sauce, so the recipe matches your photo.").waitFor();
  await page.getByRole("button", { name: "Carry on anyway" }).waitFor();
  await page.getByLabel("A short description").fill("Smoky paprika wings with spicy rice");
  await page.waitForFunction(() => !document.body.innerText.includes("Add a bit more"), null, { timeout: 3000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  const camera = page.locator("dialog[open]");
  await camera.waitFor({ timeout: 5000 });
  await camera.getByRole("heading", { name: "Scan your food" }).waitFor();
  await camera.getByText("Point the camera at your food").waitFor();
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the live camera: the picture shows, the shutter takes a photo, then Scanning for a few seconds, then the supermarket", async () => {
  const { ctx, page, errors, sent } = await open();
  await pretend(page, sent);
  await toDescribe(page);
  await fillDish(page);
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  const camera = page.locator("dialog[open]");
  await camera.waitFor({ timeout: 5000 });
  // Chromium's fake camera gives a picture; the shutter turns on once it is playing
  await page.waitForFunction(() => { const v = document.querySelector("dialog video"); return !!v && v.videoWidth > 0 && !v.paused; }, null, { timeout: 10000 });
  const shutter = camera.getByRole("button", { name: "Take the photo" });
  await page.waitForFunction(() => !document.querySelector('dialog button[aria-label="Take the photo"]')?.disabled, null, { timeout: 5000 });
  expect((await page.locator("dialog .scan-line").count()) === 1 && (await page.locator("dialog .scan-corner").count()) === 4, "the scanning frame isn't drawn on the camera");
  await shutter.tap();
  const label = page.getByText("Scanning", { exact: true }).first();
  await label.waitFor({ timeout: 5000 });
  const startedAt = Date.now();
  expect((await page.locator("section .scan-line-fast").count()) === 1, "no scanning light over the taken photo");
  await heading(page, "Where do you shop?").waitFor({ timeout: 8000 });
  const took = Date.now() - startedAt;
  expect(took > 1500 && took < 5000, `Scanning lasted ${took} ms (should be about 2.6 s)`);
  expect((await page.locator("dialog[open]").count()) === 0, "the camera is still open");
  // the camera was switched off: no track left running
  expect(await page.evaluate(() => !document.querySelector("video")), "a video element is still on the page");
  // Next sends the photo that was taken
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Next")?.disabled, null, { timeout: 30000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByRole("heading", { name: RECIPE.name }).waitFor({ timeout: 15000 });
  expect(/^\/9j\//.test(sent.recipe[0].body.image), "what was sent isn't a JPEG");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("3. What to exclude: starts from Settings, the choices are sent with the recipe and cut the pantry, and Settings stays as it was", async () => {
  const { ctx, page, errors, sent } = await open({ preferences: { vegetarianOnly: false, noPork: true, noBeef: false } });
  await pretend(page, sent, { recipe: { status: 502, body: { error: "no_recipe", message: "Pip couldn't make a recipe from this photo. Please try again, maybe with more detail about the dish." } }, delay: 100 });
  await toDescribe(page);
  for (const n of ["1", "2", "3"]) expect((await page.locator("span[aria-hidden]").filter({ hasText: new RegExp(`^${n}$`) }).count()) >= 1, `no number ${n}`);
  const group = page.getByRole("group", { name: "What to exclude" });
  await group.waitFor();
  expect((await group.getByRole("button", { name: "No pork" }).getAttribute("aria-pressed")) === "true", "No pork from Settings isn't ticked");
  await group.getByRole("button", { name: "Vegan" }).tap();
  expect((await group.getByRole("button", { name: "Vegan" }).getAttribute("aria-pressed")) === "true", "Vegan didn't tick");
  const allergies = group.getByRole("button", { name: /Allergies to avoid/ });
  expect((await allergies.getAttribute("aria-expanded")) === "false", "the allergies are open with none chosen");
  await allergies.tap();
  await group.getByRole("button", { name: "Peanuts" }).tap();
  await group.getByText("1 chosen").waitFor();
  await group.getByText("check each pack before you buy", { exact: false }).waitFor();
  await page.getByLabel("Name of the dish").fill("Peanut noodle stir-fry");
  await page.getByLabel("A short description").fill("Noodles with vegetables in a peanut and soy sauce");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  await page.locator('input[type="file"]:not([capture])').setInputFiles(photoFile);
  await heading(page, "Where do you shop?").waitFor({ timeout: 10000 });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Next")?.disabled, null, { timeout: 30000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByText("Pip couldn't make a recipe from this photo.", { exact: false }).waitFor({ timeout: 10000 });
  const body = sent.recipe[0].body;
  expect(body.diet.veganOnly === true && body.diet.noPork === true && JSON.stringify(body.diet.avoidAllergens) === '["peanuts"]', "diet sent: " + JSON.stringify(body.diet));
  expect(!body.pantry.some((p) => ["chicken", "eggs", "cheddar", "milk"].includes(p.key)), "the pantry still has animal foods for a vegan");
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings") ?? "null")?.data?.preferences);
  expect(!kept.veganOnly && !(kept.avoidAllergens ?? []).length, "the choices changed Settings: " + JSON.stringify(kept));
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the camera has two options: Scan food (the shutter) and Camera roll at the bottom right, which opens the photo chooser and scans the chosen photo", async () => {
  const { ctx, page, errors } = await open();
  await toDescribe(page);
  await fillDish(page);
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  const camera = page.locator("dialog[open]");
  await camera.waitFor({ timeout: 5000 });
  await camera.getByText("Scan food", { exact: true }).waitFor();
  await camera.getByText("Camera roll", { exact: true }).waitFor();
  const upload = camera.getByRole("button", { name: "Upload a photo from your camera roll" });
  const box = await upload.boundingBox();
  const vp = page.viewportSize();
  expect(box && box.x > vp.width / 2 && box.y > vp.height * 0.7, `the upload button isn't at the bottom right: ${JSON.stringify(box)}`);
  expect(box.width >= 44 && box.height >= 44, "the upload button is smaller than 44 px");
  const shutter = await camera.getByRole("button", { name: "Take the photo" }).boundingBox();
  expect(Math.abs(shutter.x + shutter.width / 2 - vp.width / 2) < 6, "the shutter isn't in the middle");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), upload.tap()]);
  await chooser.setFiles(photoFile);
  await page.getByText("Scanning", { exact: true }).first().waitFor({ timeout: 8000 });
  await heading(page, "Where do you shop?").waitFor({ timeout: 8000 });
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a photo picked from the phone is scanned the same way; Next shows the loading screen, then the recipe with titled steps; only the dish, diet and products are sent", async () => {
  const { ctx, page, errors, sent } = await open();
  await pretend(page, sent);
  await toShops(page);
  await page.getByText("we send your photo (made smaller on your phone first)", { exact: false }).waitFor();
  const next = page.getByRole("button", { name: "Next", exact: true });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Next")?.disabled, null, { timeout: 30000 });
  await next.tap();
  // the loading screen: the photo with a light over it, a bar that fills, the ticking lines
  await page.getByText("Looking at your photo…").first().waitFor({ timeout: 3000 });
  expect((await page.locator(".work-shimmer").count()) === 1 && (await page.locator(".work-bar").count()) === 1, "the loading animation isn't there");
  await page.getByText("Choosing ingredients from Sainsbury's…").first().waitFor();
  await page.getByRole("heading", { name: RECIPE.name }).waitFor({ timeout: 15000 });
  const body = sent.recipe[0].body;
  expect(Object.keys(body).sort().join() === "description,diet,image,pantry,servings,shop,target", "unexpected fields sent: " + Object.keys(body).sort());
  expect(body.description === DISH_TEXT && body.shop === "sainsburys" && /^\/9j\//.test(body.image), "wrong description, shop or photo: " + body.description);
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
  await toShops(page);
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Next")?.disabled, null, { timeout: 30000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
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

await step("when Pip can't make one, the reason shows with Try again", async () => {
  const { ctx, page, sent } = await open();
  await pretend(page, sent, { recipe: { status: 502, body: { error: "no_recipe", message: "Pip couldn't make a recipe from this photo. Please try again, maybe with more detail about the dish." } }, delay: 200 });
  await toShops(page);
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Next")?.disabled, null, { timeout: 30000 });
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByText("Pip couldn't make a recipe from this photo.", { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /Try again/ }).waitFor();
  await ctx.close();
});

await step("Back goes to the camera and the form without losing the words; closing the camera keeps them", async () => {
  const { ctx, page, sent } = await open();
  await pretend(page, sent);
  await toShops(page);
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  await page.locator("dialog[open]").getByRole("button", { name: "Close" }).tap();
  await page.getByLabel("Name of the dish").waitFor();
  expect((await page.getByLabel("Name of the dish").inputValue()) === DISH.name, "the name was lost");
  expect((await page.getByLabel("A short description").inputValue()) === DISH.about, "the description was lost");
  // the photo was kept: Next goes straight on to the supermarket
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await heading(page, "Where do you shop?").waitFor({ timeout: 5000 });
  await ctx.close();
});

await step("without a camera the same screen offers the phone's camera and photo picker, and a picked photo is scanned", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB" });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  }, JSON.stringify({ v: 1, data: baseSettings }));
  const page = await ctx.newPage();
  await toDescribe(page);
  await fillDish(page);
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  const camera = page.locator("dialog[open]");
  await camera.waitFor({ timeout: 5000 });
  await camera.getByText("The camera can't be shown here.", { exact: false }).waitFor();
  for (const b of ["Take a photo", "Choose from your photos"]) await camera.getByRole("button", { name: b }).waitFor();
  expect((await camera.locator("video").count()) === 0, "a video is shown with no camera");
  await page.locator('input[type="file"]:not([capture])').setInputFiles(photoFile);
  await page.getByText("Scanning", { exact: true }).first().waitFor({ timeout: 8000 });
  await heading(page, "Where do you shop?").waitFor({ timeout: 8000 });
  await ctx.close();
});

await step("every step fits a 360 px phone at the largest text size (no sideways scroll) and has no accessibility problems", async () => {
  const { ctx, page, sent } = await open({ textSize: "xlarge" }, { width: 360, height: 780 });
  await pretend(page, sent);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await toDescribe(page);
  expect((await wide()) <= 1, "describe step scrolls sideways");
  let v = await axe(page);
  expect(v.length === 0, "describe step axe: " + v.join(", "));
  await page.getByLabel("Name of the dish").fill("wings");
  await page.getByRole("button", { name: "Next", exact: true }).tap();
  await page.getByText("Add a bit more", { exact: false }).waitFor();
  expect((await wide()) <= 1, "nudge scrolls sideways");
  v = await axe(page);
  expect(v.length === 0, "nudge axe: " + v.join(", "));
  await page.getByRole("button", { name: "Carry on anyway" }).tap();
  const camera = page.locator("dialog[open]");
  await camera.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => { const v = document.querySelector("dialog video"); return !!v && v.videoWidth > 0; }, null, { timeout: 10000 });
  v = await axe(page);
  expect(v.length === 0, "camera axe: " + v.join(", "));
  await page.locator('input[type="file"]:not([capture])').setInputFiles(photoFile);
  await page.getByText("Scanning", { exact: true }).first().waitFor({ timeout: 8000 });
  expect((await wide()) <= 1, "scanning step scrolls sideways");
  v = await axe(page);
  expect(v.length === 0, "scanning step axe: " + v.join(", "));
  await heading(page, "Where do you shop?").waitFor({ timeout: 8000 });
  expect((await wide()) <= 1, "shops step scrolls sideways");
  v = await axe(page);
  expect(v.length === 0, "shops step axe: " + v.join(", "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
