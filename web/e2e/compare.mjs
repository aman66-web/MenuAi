// Compare (founder 2026-10-11: "compare various versions of products like beans to see the nutrient difference"): add products from the search and a dish
// from its own page, see them side by side with Highest and Lowest marked, take one off, and the list stays after a reload. Grocery files are stubbed; dishes
// come from the build's own sample menus (NEXT_PUBLIC_SHOW_SAMPLE_DATA=1).
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });

const beans = (gtin, name, kcal, protein, sugars, price, perKg) => ({ gtin, name, brand: name.split(" ")[0], size: "415 g", per: "g", kcal, protein, carbs: 12.5, sugars, fat: 0.3, salt: 0.6, allergens: null, category: "cupboard", price: { amount: price, url: "https://www.aldi.co.uk/product/1", checkedOn: "2026-10-09", perUnit: { amount: perKg, unit: "per kg" } } });
const aldi = { v: 1, retailer: "aldi", name: "Aldi", generatedOn: "2026-10-09", source: "t", products: [
  beans("5000157024671", "Heinz Baked Beanz", 78, 4.7, 4.7, 1.4, 3.37),
  beans("4088600120005", "Corale Baked Beans", 79, 4.9, 4.1, 0.38, 0.92),
  beans("5000157070708", "Heinz Baked Beanz Reduced Sugar", 65, 4.8, 2.6, 1.4, 3.37),
] };
const manifest = { v: 1, generatedOn: "2026-10-09", source: "Open Food Facts contributors", retailers: [{ id: "aldi", name: "Aldi", file: "aldi.json", count: 3, sha256: "" }], categories: [{ id: "cupboard", label: "Cupboard" }] };

async function newPage(scheme = "light") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme: scheme });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(aldi) }));
  await page.route("**/images.openfoodfacts.org/**", (r) => r.abort());
  return { ctx, page };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("groceries: search, add three beans, see them side by side with Highest and Lowest; remove one; the list stays after a reload", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/groceries");
  await page.getByRole("link", { name: "Compare products" }).click();
  await page.getByRole("heading", { level: 1, name: "Compare" }).waitFor();
  await page.getByText("Nothing to compare yet").waitFor();
  await page.getByLabel("Add a product").fill("baked");
  for (const name of ["Heinz Baked Beanz", "Corale Baked Beans", "Heinz Baked Beanz Reduced Sugar"]) await page.getByRole("button", { name: new RegExp(`^Add ${name}$`) }).click();
  expect(await page.getByRole("button", { name: /^Added Corale/ }).isDisabled(), "an added product can't be added twice");
  await page.getByRole("heading", { name: "Side by side" }).waitFor();
  await page.getByText("Per 100 g, as each label prints it.").waitFor();
  const kcal = page.locator("div.glass", { has: page.getByRole("heading", { level: 3, name: "Calories" }) });
  expect((await kcal.innerText()).includes("65 kcal") && (await kcal.getByText("Lowest").count()) === 1 && (await kcal.getByText("Highest").count()) === 1, "calories marked once each");
  const pound = page.locator("div.glass", { has: page.getByRole("heading", { level: 3, name: "Protein for £1" }) });
  expect((await pound.innerText()).includes("53g"), `Corale: 4.9 g x 10 / £0.92 per kg = 53 g for £1, got ${await pound.innerText()}`);
  expect((await page.getByText(/\b(good|bad|healthy)\b/i).count()) === 0, "never good, bad or healthy");
  await page.getByRole("button", { name: "Remove Heinz Baked Beanz Reduced Sugar" }).click();
  await page.reload();
  await page.getByRole("heading", { name: "Side by side" }).waitFor();
  expect((await page.getByRole("button", { name: /^Remove / }).count()) === 2, "two left after a reload");
  await page.getByRole("button", { name: "Remove Corale Baked Beans" }).click();
  await page.getByText("Add at least one more to see them side by side.").waitFor();
  await ctx.close();
});

await step("dishes: Compare on a dish's page, then another from the search; per serving; Groceries and dishes are never mixed", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/item?chain=cluck-house&item=classic-sandwich");
  await page.getByRole("button", { name: "Compare" }).click();
  await page.getByText("Add another to compare it with.").waitFor();
  expect((await page.getByRole("button", { name: "In your comparison" }).getAttribute("aria-pressed")) === "true", "pressed");
  await page.getByRole("link", { name: "See the comparison" }).click();
  await page.getByRole("tab", { name: /Restaurant dishes/, selected: true }).waitFor();
  await page.getByLabel("Add a dish").fill("grilled chicken sandwich");
  await page.getByRole("button", { name: /^Add Grilled chicken sandwich$/ }).click();
  await page.getByRole("heading", { name: "Side by side" }).waitFor();
  await page.getByText("Per serving, as each restaurant publishes it.").waitFor();
  const kcal = page.locator("div.glass", { has: page.getByRole("heading", { level: 3, name: "Calories" }) });
  expect((await kcal.innerText()).includes("440 kcal") && (await kcal.innerText()).includes("380 kcal"), "both dishes' calories");
  await page.getByRole("tab", { name: /Groceries/ }).click();
  await page.getByText("Nothing to compare yet").waitFor();
  await ctx.close();
});

await step("accessibility: the comparison has no axe violations in light and dark", async () => {
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await newPage(scheme);
    await page.goto(BASE + "/app/compare?tab=food");
    await page.getByLabel("Add a product").fill("heinz");
    await page.getByRole("button", { name: /^Add Heinz Baked Beanz$/ }).click();
    await page.getByRole("button", { name: /^Add Heinz Baked Beanz Reduced Sugar$/ }).click();
    await page.getByRole("heading", { name: "Side by side" }).waitFor();
    await page.addScriptTag({ path: AXE });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
    expect(result.violations.length === 0, `${scheme}: ${result.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", ")}`);
    await ctx.close();
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
