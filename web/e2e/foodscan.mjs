// Scan your food (founder 2026-11-18, Premium): Home's card (no My meals on Home), the first page that says what it does, a photo in, the estimate out (the AI's
// answer is faked here, so nothing is sent to Anthropic), adding it to a meal, a photo that isn't food, the paywall for a free person, axe.
// Run against a server built with the feature on and Pro previewed: NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1, then BASE=http://localhost:3005 node e2e/foodscan.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const base = { goal: "buildMuscle", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
const proSettings = JSON.stringify({ v: 1, data: { ...base, devProOverride: true } });
const freeSettings = JSON.stringify({ v: 1, data: base });
const SCAN = { name: "Double cheeseburger and chips", confidence: "medium", total: { kcal: 790, protein: 30, carbs: 77, fat: 40 }, items: [
  { name: "Double cheeseburger", portion: "one burger, about 180 g", kcal: 450, protein: 26, carbs: 34, fat: 23 },
  { name: "Chips", portion: "a medium portion, about 150 g", kcal: 340, protein: 4, carbs: 43, fat: 16.5 },
] };

async function newPage(data = proSettings) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, data);
  const page = await ctx.newPage();
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
/** A real JPEG made in the page (a plate-coloured square), as a file the hidden photo picker can take. */
async function jpeg(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#c98b4a"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#f2d16b"; x.fillRect(120, 300, 400, 120); return c.toDataURL("image/jpeg", 0.9).split(",")[1]; });
  return { name: "plate.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}
async function axe(page, where) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
  expect(r.length === 0, `${where}: ${r.join(", ")}`);
}

await step("Home: one Scan your food card with its two choices, Photo to calories or Photo to recipe (founder 2026-11-19, renamed 2026-11-20), and no My meals on Home", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app");
  const card = page.getByRole("region", { name: "Scan your food" });
  await card.waitFor({ timeout: 120000 });
  expect((await card.innerText()).includes("Photo to calories") && (await card.innerText()).includes("Photo to recipe"), "the card's two buttons say what each does");
  expect(!(await card.innerText()).includes("Premium"), "no Premium tag for a Premium person");
  await card.getByRole("button", { name: /Photo to recipe/ }).waitFor();
  expect((await page.locator("main").getByRole("link", { name: /^My meals/ }).count()) === 0, "no My meals on Home");
  // both are buttons since 20 November 2026: each opens the paywall for someone without Premium (the audit), else its screen
  const scan = card.getByRole("button", { name: /Photo to calories/ });
  for (const b of [await scan.boundingBox(), await card.getByRole("button", { name: /Photo to recipe/ }).boundingBox()]) expect(b && b.height >= 44, "a big button");
  await scan.click();
  await page.getByRole("heading", { level: 1, name: "Scan your food" }).waitFor({ timeout: 60000 });
  await ctx.close();
});

await step("a photo in, the estimate out: the plate, Estimate from your photo, calories and macros, what Pip counted, added to Lunch, on Home after", async () => {
  const { ctx, page } = await newPage();
  let sent = null;
  await page.route("**/api/v1/scan", async (r) => { sent = JSON.parse(r.request().postData() ?? "{}"); await r.fulfill({ contentType: "application/json", body: JSON.stringify({ scan: SCAN }) }); });
  await page.goto(BASE + "/app/scan");
  await page.getByRole("heading", { level: 1, name: "Scan your food" }).waitFor({ timeout: 120000 });
  await page.getByText("Pip estimates a plate's calories, protein, carbs and fat from a photo.").waitFor();
  await page.getByText(/We don't keep it\./).waitFor();
  for (const name of ["Take a photo", "Choose a photo"]) { const b = await page.getByRole("button", { name }).boundingBox(); expect(b && b.height >= 44, `${name} is a big button`); }
  await axe(page, "first page");
  await page.locator('input[type=file]:not([capture])').setInputFiles(await jpeg(page));
  await page.getByRole("heading", { level: 1, name: SCAN.name }).waitFor({ timeout: 30000 });
  // the photo as a JPEG, and what the person typed about it (nothing here) since a1241cd5 (Pip reads the words with the photo): nothing else
  expect(sent && typeof sent.image === "string" && sent.image.startsWith("/9j/") && Object.keys(sent).sort().join() === "description,image" && sent.description === "", "only the photo and the typed words are sent: " + Object.keys(sent ?? {}).join());
  await page.getByText("Estimate from your photo", { exact: true }).waitFor();
  const text = await page.locator("main").innerText();
  for (const s of ["790", "kcal", "30", "77", "40", "Calories", "Protein", "Carbs", "Fat", "What Pip counted", "Double cheeseburger", "one burger, about 180 g", "Chips", "A good guess from what Pip can see."]) expect(text.includes(s), `shows ${s}`);
  await axe(page, "estimate");
  await page.getByRole("radio", { name: "Lunch" }).click();
  await page.getByRole("button", { name: "Add to Lunch" }).click();
  // said on the card (with a tick) and in the toast with its Undo
  await page.getByText("Added “Double cheeseburger and chips (estimate)” to Lunch.").first().waitFor();
  await page.getByRole("status").filter({ hasText: "Added “Double cheeseburger and chips (estimate)” to Lunch." }).getByRole("button", { name: /Undo/ }).waitFor();
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.log") ?? "{}"));
  const entries = (log.data ?? log) || [];
  const e = (Array.isArray(entries) ? entries : []).find((x) => x.name === "Double cheeseburger and chips (estimate)");
  expect(e && e.meal === "lunch" && e.nutrients.calories === 790 && e.nutrients.protein === 30 && e.source === "custom", "logged with the four numbers: " + JSON.stringify(e));
  await page.getByRole("button", { name: "Back to Home" }).click();
  await page.getByText("Double cheeseburger and chips (estimate)").first().waitFor({ timeout: 30000 });
  await ctx.close();
});

await step("a photo that isn't food goes back to the camera with a note; an error says so with Try again", async () => {
  const { ctx, page } = await newPage();
  let answer = { status: 422, body: { error: "not_food", message: "Pip couldn't see any food in this photo. Try a clearer photo of the plate." } };
  await page.route("**/api/v1/scan", (r) => r.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) }));
  await page.goto(BASE + "/app/scan");
  await page.getByRole("heading", { level: 1, name: "Scan your food" }).waitFor({ timeout: 120000 });
  await page.locator('input[type=file]:not([capture])').setInputFiles(await jpeg(page));
  await page.getByText("That doesn't look like food. Please try again with a photo of your plate.").waitFor({ timeout: 30000 });
  await page.goto(BASE + "/app/scan");
  answer = { status: 502, body: { error: "no_estimate", message: "Pip couldn't work out this food. Please try again with a clearer photo." } };
  await page.getByRole("heading", { level: 1, name: "Scan your food" }).waitFor();
  await page.locator('input[type=file]:not([capture])').setInputFiles(await jpeg(page));
  await page.getByText("Pip couldn't work out this food. Please try again with a clearer photo.").waitFor({ timeout: 30000 });
  await ctx.close();
});

await step("a free person: Home's card says Premium; its Photo to calories and the scan page's See Premium (in place of Take a photo) open the paywall without sending anything", async () => {
  const { ctx, page } = await newPage(freeSettings);
  let asked = 0;
  await page.route("**/api/v1/scan", (r) => { asked++; return r.fulfill({ contentType: "application/json", body: "{}" }); });
  await page.goto(BASE + "/app");
  const card = page.getByRole("region", { name: "Scan your food" });
  await card.waitFor({ timeout: 120000 });
  expect((await card.innerText()).includes("Premium"), "a Premium tag on the card");
  // the card's button opens the paywall on Home (the 20 November 2026 audit), without leaving it
  await card.getByRole("button", { name: /Photo to calories/ }).click();
  await page.locator("dialog[open]").first().waitFor({ timeout: 15000 });
  expect(new URL(page.url()).pathname.replace(/\/$/, "") === "/app", "left Home: " + page.url());
  // the scan page itself, reached by its address: See Premium in place of Take a photo
  await page.goto(BASE + "/app/scan");
  expect((await page.getByRole("button", { name: "Take a photo" }).count()) === 0, "Take a photo for a free person");
  await page.getByRole("button", { name: "See Premium" }).click({ timeout: 60000 });
  await page.locator("dialog[open]").first().waitFor({ timeout: 15000 });
  expect(asked === 0, "nothing sent");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
