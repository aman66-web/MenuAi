// Recipes from any supermarket (founder's idea, 16 Nov 2026; docs/RECIPES_ANY_SUPERMARKET_REPORT.md), behind NEXT_PUBLIC_RECIPES_ANY_SHOP.
//   ANYSHOP=0 (the default build): the Swap sheet opens straight on the same-shop list as before, nothing is asked, nothing is sent, and POST /api/v1/not-found is 404.
//   ANYSHOP=1 (a build with NEXT_PUBLIC_RECIPES_ANY_SHOP=1): the person's own supermarkets on Recipes, a shop with no complete recipe says what is missing; a Swap asks
//   "Could you find this at {shop}?", No sends exactly which product of which shop (nothing about the person), Yes sends nothing; then another product from the
//   same shop, or one from another supermarket (filter by shop) whose figures can't be shown when it has no numbers; axe, 360 px, 200% text.
// Run against a production build: BASE=http://localhost:3101 ANYSHOP=1 node e2e/recipes-anyshop.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const ON = process.env.ANYSHOP === "1";
/** COMMUNITY=1: a build that also has NEXT_PUBLIC_RECIPE_COMMUNITY_NUMBERS=1 (the founder's decision): Asda's recipes appear, from community numbers, and say so. */
const COMMUNITY = process.env.COMMUNITY === "1";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const base = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, recipeMeal: { size: "written", moreProtein: false } };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 4).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function open({ shops = ["sainsburys", "tesco"], width = 390, textSize } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
  const settings = JSON.stringify({ v: 1, data: { ...base, shops, ...(textSize ? { textSize } : {}) } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  // the shops' pictures are answered locally; the API is faked and every call recorded (nothing reaches a database)
  await page.route(/https:\/\/(?!localhost)[^/]+\/.*\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i, (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  const sent = [];
  await page.route("**/api/v1/**", (r) => { sent.push({ url: r.request().url(), body: r.request().postData() }); return r.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true}' }); });
  return { ctx, page, sent };
}
const axe = async (page) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const RECIPE = "/app/recipes/view?id=chicken-curry&r=sainsburys";
const openRecipe = async (page) => { await page.goto(BASE + RECIPE); await page.getByRole("heading", { level: 1, name: "Chicken curry with rice" }).waitFor({ timeout: 60000 }); };

if (!ON) {
  await step("switch off: the Recipes list is Sainsbury's only (no Tesco choice) and a Swap opens straight on the same-shop list; nothing asked, nothing sent", async () => {
    const { ctx, page, sent } = await open();
    await page.goto(BASE + "/app/recipes");
    await page.getByRole("heading", { name: /^All recipes/ }).waitFor({ timeout: 60000 });
    expect((await page.getByRole("radio", { name: "Tesco" }).count()) === 0, "a Tesco choice is shown with the switch off");
    await openRecipe(page);
    await page.getByRole("button", { name: /^Swap Chicken/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("heading", { name: /Pick a different product|Or pick a different product/ }).waitFor();
    expect((await sheet.getByText(/Could you find this at/).count()) === 0, "the question is shown with the switch off");
    expect((await sheet.getByText(/another supermarket/).count()) === 0, "another supermarket is offered with the switch off");
    expect(!sent.some((s) => s.url.includes("not-found")), "a not-found report was sent");
    await ctx.close();
  });
  await step("switch off: POST /api/v1/not-found answers 404", async () => {
    const r = await fetch(BASE + "/api/v1/not-found", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop: "tesco", kind: "rice", productId: "1" }) });
    expect(r.status === 404, `status ${r.status}`);
  });
} else {
  if (COMMUNITY) await step("community numbers on: Asda has recipes made from products with community numbers, and the list and the recipe say where the numbers come from", async () => {
    const { ctx, page } = await open({ shops: ["asda"] });
    await page.goto(BASE + "/app/recipes");
    const heading = page.getByRole("heading", { name: /^All recipes · \d+/ });
    await heading.waitFor({ timeout: 90000 });
    const n = Number(/· (\d+)/.exec(await heading.innerText())[1]);
    expect(n > 0 && n < 117, `${n} recipes at Asda`);
    await page.getByText("Where we haven't read a product's own page, its numbers come from Open Food Facts contributors (community data) for the same barcode.").waitFor();
    await page.locator("ul li a[href*='/app/recipes/view']").first().click();
    await page.getByText(/^The numbers for .+ come from Open Food Facts contributors \(community data\) for the same barcode, not from the shop's own page\.$/).waitFor({ timeout: 60000 });
    await axe(page);
    await ctx.close();
  });

  if (!COMMUNITY) await step("Recipes shows the person's own supermarkets; at Tesco (no labels read yet) it says no recipe is complete and which ingredients are missing most", async () => {
    const { ctx, page } = await open();
    await page.goto(BASE + "/app/recipes");
    await page.getByRole("heading", { name: /^All recipes/ }).waitFor({ timeout: 60000 });
    await page.getByRole("radio", { name: "Sainsbury's" }).waitFor();
    await page.getByRole("radio", { name: "Tesco" }).click();
    await page.getByText("No recipes here yet.").waitFor({ timeout: 60000 });
    await page.getByText("A recipe appears here once every ingredient has a product at Tesco with numbers we can use.").waitFor();
    await page.getByText(/^Most often missing at Tesco: .+\.$/).waitFor();
    await axe(page);
    await ctx.close();
  });

  await step("Swap asks 'Could you find this at Sainsbury's?' and says what No sends; No queues exactly the shop, the ingredient kind, the product, the recipe and the app version", async () => {
    const { ctx, page, sent } = await open();
    await openRecipe(page);
    const row = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
    const product = (await row.locator("a").first().innerText()).trim();
    await page.getByRole("button", { name: /^Swap Chicken/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("heading", { name: "Could you find this at Sainsbury's?" }).waitFor();
    await sheet.getByText("If you tap No, we're sent which product you couldn't find and at which shop, so we can improve the recipes. Nothing about you is sent.").waitFor();
    await sheet.getByText(product).waitFor();
    for (const name of ["Yes", "No"]) { const b = await sheet.getByRole("button", { name, exact: true }).boundingBox(); expect(b.height >= 47.5, `${name} is ${b.height}px`); }
    await axe(page);
    await sheet.getByRole("button", { name: "No", exact: true }).click();
    await sheet.getByText("Thanks, we've noted it.").waitFor();
    await page.waitForTimeout(500);
    const reports = sent.filter((s) => s.url.endsWith("/api/v1/not-found"));
    expect(reports.length === 1, `${reports.length} reports sent`);
    const body = JSON.parse(reports[0].body);
    expect(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["appVersion", "kind", "productId", "recipeId", "shop"]), "fields: " + Object.keys(body).join(","));
    expect(body.shop === "sainsburys" && body.recipeId === "chicken-curry" && /chicken/.test(body.kind), JSON.stringify(body));
    await sheet.getByRole("button", { name: "Choose another product from Sainsbury's" }).waitFor();
    await sheet.getByRole("button", { name: "Choose a product from another supermarket" }).waitFor();
    await ctx.close();
  });

  await step("Yes sends nothing; another product from another supermarket: filter by shop, choose one with no numbers; the row says 'From Tesco', the figures are not shown, the price is", async () => {
    const { ctx, page, sent } = await open();
    await openRecipe(page);
    await page.getByRole("group", { name: /per serving/ }).waitFor();
    await page.getByRole("button", { name: /^Swap Chicken/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Yes", exact: true }).click();
    await sheet.getByRole("button", { name: "Choose a product from another supermarket" }).click();
    const chips = sheet.getByRole("group", { name: "Supermarket" });
    await chips.getByRole("button", { name: "Tesco" }).waitFor();
    expect((await chips.getByRole("button").first().innerText()).trim() === "Tesco", "the person's own other shop comes first");
    await sheet.getByText("Products that fit this recipe, best fit first. It uses", { exact: false }).waitFor();
    const first = sheet.locator("ul > li button").first();
    await first.waitFor({ timeout: 60000 });
    expect(/Tesco/.test(await first.innerText()), "the row names its shop");
    expect(/No numbers yet: with this one, the recipe's nutrition won't be shown\./.test(await first.innerText()), "a Tesco product with no numbers says so");
    await axe(page);
    expect((await overflow(page)) <= 0, "sideways scroll in the sheet");
    const chosenName = (await first.innerText()).split("\n")[0];
    await first.click();
    await sheet.waitFor({ state: "hidden" });
    const row = page.getByRole("heading", { name: "What to buy" }).locator("xpath=..").locator("li").first();
    await row.getByText("From Tesco").waitFor();
    expect((await row.innerText()).includes(chosenName), "the row shows the Tesco product");
    await page.getByText(/^We don't have numbers we can use for .+ from the shop you chose, so this recipe's calories and nutrition aren't shown\. Its price still is\.$/).waitFor();
    expect((await page.getByRole("group", { name: /per serving/ }).count()) === 0, "the figures are still shown");
    await page.getByText("a serving", { exact: true }).waitFor();
    await page.getByText(/at each shop's own shelf prices/).waitFor();
    await page.getByText(/Prices from Tesco were checked \d/).waitFor();
    expect(!sent.some((s) => s.url.includes("not-found")), "Yes sent a report");
    // back to a Sainsbury's product: the figures come back
    await page.getByRole("button", { name: /^Swap Chicken/ }).click();
    await sheet.getByRole("button", { name: "Yes", exact: true }).click();
    await sheet.getByRole("button", { name: "Choose another product from Sainsbury's" }).click();
    await sheet.locator("button[aria-pressed]").first().click();
    await sheet.waitFor({ state: "hidden" });
    await page.getByRole("group", { name: /per serving/ }).waitFor();
    expect((await row.getByText("From Tesco").count()) === 0, "still marked as from Tesco");
    await ctx.close();
  });

  await step("Back in the sheet goes to the two choices; 360 px and Extra large text: no sideways scroll on the question and the lists", async () => {
    const { ctx, page } = await open({ width: 360, textSize: "xlarge" });
    await openRecipe(page);
    await page.getByRole("button", { name: /^Swap Chicken/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("heading", { name: "Could you find this at Sainsbury's?" }).waitFor();
    expect((await overflow(page)) <= 0, "question overflow");
    await sheet.getByRole("button", { name: "Yes", exact: true }).click();
    await sheet.getByRole("button", { name: "Choose another product from Sainsbury's" }).click();
    await sheet.getByRole("button", { name: "Back" }).click();
    await sheet.getByRole("button", { name: "Choose a product from another supermarket" }).click();
    await sheet.locator("ul > li button").first().waitFor({ timeout: 60000 });
    expect((await overflow(page)) <= 0, "other-shop list overflow");
    const panel = await page.locator(".sheet-panel").last().evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(panel <= 0, "the sheet scrolls sideways by " + panel);
    await ctx.close();
  });

  await step("POST /api/v1/not-found is live with the switch on: a bad body is refused with 400 (a good one needs the database: not tried here)", async () => {
    const r = await fetch(BASE + "/api/v1/not-found", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop: "Not A Shop", kind: "rice", productId: "1" }) });
    expect(r.status === 400, `status ${r.status}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
