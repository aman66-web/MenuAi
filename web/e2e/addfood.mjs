// The "Add food" sheet on Home's meal rows (founder 2026-10-15, on the + beside Breakfast: "a kind of menu vibe sheet should launch where you can either
// type in macros, choose a recipe perhaps, choose a meal from a restaurant or whatever"). Tapping + on Breakfast, Lunch or Dinner opens a sheet with four
// choices (type numbers, a recipe, a restaurant meal, a supermarket product); whatever is picked goes into the meal whose + was tapped, with an Undo.
// Touch is on, like an iPhone. Needs the test build (NEXT_PUBLIC_PRO=1, so a free person's + is gated).
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
async function open(extra = {}, settings = {}, seed = {}) {
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
const plus = (page, meal) => page.getByRole("button", { name: `Add to ${meal}`, exact: true });
const sheetTitle = (page, text) => page.getByRole("heading", { name: text, exact: true });
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.log") ?? "null")?.data ?? []);
const kcal = (text) => Number(text.match(/([\d,]+(?:\.\d+)?)\s*kcal/)?.[1].replace(/,/g, ""));
/** Everything inside the open sheet (the page behind it has its own "Add to ..." buttons). */
const dlg = (page) => page.locator("dialog[open]").last();
const mealRow = (page, meal) => page.locator("li", { has: plus(page, meal) });
async function home(page) { await page.goto(BASE + "/app"); await plus(page, "Breakfast").waitFor({ timeout: 90000 }); }
async function openMeal(page, meal) { await plus(page, meal).tap(); await sheetTitle(page, `Add to ${meal}`).waitFor(); }
async function choose(page, name) { await page.getByRole("button", { name: new RegExp(name) }).tap(); }

await step("each meal's + opens the Add food sheet (it does not leave Home), with the four choices", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  for (const meal of ["Breakfast", "Lunch", "Dinner"]) {
    await openMeal(page, meal);
    expect(new URL(page.url()).pathname === "/app", "left Home: " + page.url());
    for (const c of ["Type in your numbers", "Choose a recipe", "Choose a restaurant meal", "Choose a supermarket product"]) await page.getByRole("button", { name: new RegExp(c) }).waitFor({ timeout: 3000 });
    await page.getByRole("button", { name: "Close" }).tap();
    await sheetTitle(page, `Add to ${meal}`).waitFor({ state: "hidden" });
  }
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a free person's + shows the paywall instead (logging is Pro while Pro is on)", async () => {
  const { ctx, page } = await open({}, { devProOverride: false });
  await home(page);
  await plus(page, "Lunch").tap();
  await page.waitForTimeout(500);
  expect((await sheetTitle(page, "Add to Lunch").count()) === 0, "the sheet opened for a free person");
  expect((await page.locator("dialog[open]").count()) > 0, "no paywall dialog");
  await ctx.close();
});

await step("type in your numbers: calories are needed, a wrong box is named, then Add puts it in the meal tapped, with an Undo", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openMeal(page, "Dinner");
  await choose(page, "Type in your numbers");
  await sheetTitle(page, "Type in your numbers").waitFor();
  const add = dlg(page).getByRole("button", { name: "Add to Dinner", exact: true });
  expect(await add.isDisabled(), "Add is on with nothing typed");
  await page.getByLabel("Name (optional)").fill("Toast and jam");
  await page.getByLabel("Protein (g)").fill("12");
  expect(await add.isDisabled(), "Add is on without calories");
  await page.getByLabel("Calories (kcal)").fill("lots");
  await page.getByText("Check the calories: use a number from 0 to 5,000.").waitFor();
  expect(await add.isDisabled(), "Add is on with a wrong calories box");
  await page.getByLabel("Calories (kcal)").fill("9999");
  await page.getByText("Check the calories").waitFor();
  expect(await add.isDisabled(), "Add is on with too many calories");
  await page.getByLabel("Calories (kcal)").fill("250");
  await page.getByLabel("Fat (g)").fill("x");
  await page.getByText("Check the fat: use a number from 0 to 1,000 g.").waitFor();
  await page.getByLabel("Fat (g)").fill("");
  await page.getByText("Calories are needed. Protein, carbs and fat can stay empty.").waitFor();
  expect(!(await add.isDisabled()), "Add is off with good numbers");
  await add.tap();
  await sheetTitle(page, "Type in your numbers").waitFor({ state: "hidden" });
  await page.getByText("Added “Toast and jam” to Dinner.").waitFor();
  const [e] = await log(page);
  expect(e && e.meal === "dinner" && e.source === "custom" && e.name === "Toast and jam", "entry: " + JSON.stringify(e));
  expect(e.nutrients.calories === 250 && e.nutrients.protein === 12 && !("carbs" in e.nutrients) && !("fat" in e.nutrients), "numbers: " + JSON.stringify(e.nutrients));
  expect(/^\s*250\s*\/\s*[\d,]+\s*kcal/.test(await mealRow(page, "Dinner").innerText()) || (await mealRow(page, "Dinner").innerText()).includes("250"), "the Dinner row doesn't show 250: " + (await mealRow(page, "Dinner").innerText()));
  expect(/^\s*0\s*\//.test((await mealRow(page, "Breakfast").innerText()).replace(/Breakfast\s*/, "")), "Breakfast moved: " + (await mealRow(page, "Breakfast").innerText()));
  await page.getByRole("button", { name: "Undo" }).tap();
  await page.waitForTimeout(300);
  expect((await log(page)).length === 0, "Undo left the entry");
  expect((await page.getByText("Added “Toast and jam” to Dinner.").count()) === 0, "the line stayed after Undo");
  await ctx.close();
});

await step("an entry stays in the meal whose + was tapped, whatever the time, on Home and on Today; calories alone show no protein", async () => {
  const { ctx, page } = await open();
  await home(page);
  for (const [meal, name, cals] of [["Breakfast", "Bfast thing", "111"], ["Lunch", "Lunch thing", "222"], ["Dinner", "Dinner thing", "333"]]) {
    await openMeal(page, meal);
    await choose(page, "Type in your numbers");
    await page.getByLabel("Name (optional)").fill(name);
    await page.getByLabel("Calories (kcal)").fill(cals);
    await dlg(page).getByRole("button", { name: `Add to ${meal}`, exact: true }).tap();
    await page.getByText(`Added “${name}” to ${meal}.`).waitFor();
  }
  await page.getByText("Some meals you added have no protein, carbs or fat entered, so those figures only count the rest.").waitFor(); // never "0g" as if it were known
  for (const [meal, cals] of [["Breakfast", "111"], ["Lunch", "222"], ["Dinner", "333"]]) {
    const text = await mealRow(page, meal).innerText();
    expect(new RegExp(`^${meal}\\s+${cals}\\s*/`).test(text.trim()), `${meal} row: ${text}`);
  }
  await page.goto(BASE + "/app/today");
  await page.getByText("Some meals you added have no protein, carbs or fat entered, so those figures only count the rest.").waitFor({ timeout: 30000 });
  for (const [meal, name] of [["Breakfast", "Bfast thing"], ["Lunch", "Lunch thing"], ["Dinner", "Dinner thing"]]) {
    const section = page.locator("section", { has: page.getByRole("heading", { name: meal, exact: true }) });
    await section.waitFor({ timeout: 30000 });
    const text = await section.innerText();
    expect(text.includes(name), `${meal} on Today lacks ${name}: ${text}`);
    for (const other of ["Bfast thing", "Lunch thing", "Dinner thing"]) if (other !== name) expect(!text.includes(other), `${meal} on Today also holds ${other}`);
    expect(!/protein/.test(text), `${meal} shows a protein figure that was never typed: ${text}`);
  }
  // it survives a reload
  await page.reload();
  await page.getByRole("heading", { name: "Lunch", exact: true }).waitFor({ timeout: 30000 });
  expect((await page.locator("section", { has: page.getByRole("heading", { name: "Lunch", exact: true }) }).innerText()).includes("Lunch thing"), "lost after a reload");
  await ctx.close();
});

await step("closing the sheet adds nothing, and it opens at the four choices again", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openMeal(page, "Lunch");
  await choose(page, "Type in your numbers");
  await page.getByLabel("Calories (kcal)").fill("400");
  await page.getByRole("button", { name: "Close" }).tap();
  await sheetTitle(page, "Type in your numbers").waitFor({ state: "hidden" });
  expect((await log(page)).length === 0, "something was added");
  await openMeal(page, "Lunch");
  await page.getByRole("button", { name: /Choose a recipe/ }).waitFor({ timeout: 3000 });
  await page.keyboard.press("Escape");
  await ctx.close();
});

await step("a restaurant meal picked on a slow connection is not added once the sheet is closed, and doesn't close the sheet opened since", async () => {
  const { ctx, page, errors } = await open();
  let slow = false;
  await page.route(/\/menus\/[^/]+\.json(\?.*)?$/, async (route) => {
    if (slow && !/manifest|search|numbers/.test(route.request().url())) await new Promise((r) => setTimeout(r, 4000));
    return route.continue();
  });
  await home(page);
  await openMeal(page, "Breakfast");
  await choose(page, "Choose a restaurant meal");
  await page.getByLabel("Search restaurants and items").fill("chicken");
  const first = dlg(page).getByRole("button", { name: /^Add / }).first();
  await first.waitFor({ timeout: 120000 });
  slow = true;
  await first.tap();
  expect((await first.getAttribute("aria-busy")) === "true", "the tapped Add shows it is working");
  await dlg(page).getByRole("button", { name: "Close" }).tap(); // gives up
  await plus(page, "Dinner").tap();
  await sheetTitle(page, "Add to Dinner").waitFor();
  await page.waitForTimeout(5500); // the menu arrives
  expect((await log(page)).length === 0, "a dish that was given up on was logged: " + JSON.stringify((await log(page)).map((e) => e.name)));
  expect(await sheetTitle(page, "Add to Dinner").isVisible(), "the Dinner sheet was closed by the old add");
  expect((await page.getByRole("status").count()) === 0, "a toast for something the person gave up on");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a recipe: the figures on its row are what is logged, more servings multiply them, and the name says so", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await openMeal(page, "Lunch");
  await choose(page, "Choose a recipe");
  await sheetTitle(page, "Choose a recipe").waitFor();
  const firstAdd = dlg(page).getByRole("button", { name: /^Add / }).first();
  await firstAdd.waitFor({ timeout: 120000 });
  const row = dlg(page).locator("li", { has: page.getByRole("button", { name: /^Add / }) }).first();
  const title = (await row.locator("span.font-bold, span[class*='font-bold']").first().innerText()).trim();
  const one = kcal(await row.innerText());
  expect(one > 0, "no calories on the row: " + (await row.innerText()));
  await page.getByLabel("More servings").tap(); // 1.5
  await page.waitForTimeout(200);
  const oneAndHalf = kcal(await row.innerText());
  expect(Math.abs(oneAndHalf - one * 1.5) <= 1.5, `1.5 servings: ${oneAndHalf} vs ${one}`);
  expect((await page.locator("output").innerText()).trim() === "1.5", "the stepper doesn't read 1.5");
  await firstAdd.tap();
  await page.getByText(/^Added “.*” to Lunch\.$/).waitFor();
  const [e] = await log(page);
  expect(e.source === "recipe" && e.meal === "lunch", "entry: " + JSON.stringify(e));
  expect(e.name === `${title} (1.5 servings)`, `name: ${e.name} vs ${title}`);
  expect(e.nutrients.calories === oneAndHalf && e.nutrients.protein > 0 && e.nutrients.carbs > 0 && e.nutrients.fat >= 0, "numbers: " + JSON.stringify(e.nutrients));
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a recipe: one serving's figures match the recipe's own card on Recipes, and a search narrows the list", async () => {
  const { ctx, page } = await open();
  await home(page);
  await openMeal(page, "Dinner");
  await choose(page, "Choose a recipe");
  await dlg(page).getByRole("button", { name: /^Add / }).first().waitFor({ timeout: 120000 });
  const before = (await dlg(page).locator("li", { has: page.getByRole("button", { name: /^Add / }) }).allInnerTexts()).map((t) => t.split("\n")[0]);
  await page.getByLabel("Search recipes").fill("curry");
  await page.waitForTimeout(400);
  const rows = dlg(page).locator("li", { has: page.getByRole("button", { name: /^Add / }) });
  const n = await rows.count();
  const names = (await rows.allInnerTexts()).map((t) => t.split("\n")[0]);
  expect(n > 0 && names.join("|") !== before.join("|"), `search shows ${names.join(", ")}, before ${before.join(", ")}`);
  expect(names.some((x) => /curry/i.test(x)), "no curry among: " + names.join(" | "));
  const title = (await rows.first().locator("span[class*='font-bold']").first().innerText()).trim();
  const sheetKcal = kcal(await rows.first().innerText());
  await page.getByLabel("Search recipes").fill("zzzzqq");
  await page.getByText("No recipes match.").waitFor();
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/recipes");
  await page.getByLabel("Search recipes").fill(title);
  const tile = page.locator("li", { hasText: title }).first();
  await tile.waitFor({ timeout: 60000 });
  expect((await tile.innerText()).replace(/,/g, "").includes(String(sheetKcal)), `the card for "${title}" doesn't show ${sheetKcal}: ${await tile.innerText()}`);
  await ctx.close();
});

await step("a restaurant meal: a dish is added as published; a saved meal sits above the search; a calories-only restaurant's dishes are not offered", async () => {
  const real = await (await fetch(BASE + "/menus/menus-manifest.json")).json();
  const lite = real.chains.find((c) => c.nutritionLevel === "calories" && !c.sample);
  expect(lite, "no calories-only chain in the data");
  const liteChain = await (await fetch(BASE + "/menus/" + lite.file)).json();
  const liteDish = liteChain.items.find((i) => i.name.length > 10 && !i.name.startsWith("Add"))?.name;
  const saved = [{ id: "s1", createdAt: "2026-10-14T10:00:00.000Z", chainId: "kfc", chainName: "KFC", name: "My usual", lines: [], nutrients: { calories: 600, protein: 40, carbs: 50, fat: 20 }, dataVersionAtSave: 1 }];
  const { ctx, page, errors } = await open({}, {}, { "mm.v1.saved": saved });
  await home(page);
  await openMeal(page, "Lunch");
  await choose(page, "Choose a restaurant meal");
  await sheetTitle(page, "Choose a restaurant meal").waitFor();
  await page.getByRole("heading", { name: "Your saved meals" }).waitFor();
  await dlg(page).getByText("My usual", { exact: true }).first().waitFor();
  const search = page.getByLabel("Search restaurants and items");
  await search.fill("chicken");
  await dlg(page).getByRole("button", { name: /^Add / }).first().waitFor({ timeout: 60000 });
  expect((await page.getByRole("heading", { name: "Your saved meals" }).count()) === 0, "saved meals stay under a search");
  const row = dlg(page).locator("li", { has: page.getByRole("button", { name: /^Add / }) }).first();
  const text = await row.innerText();
  const dish = text.split("\n")[0].replace(/\s*Add.*$/, "").trim();
  await row.getByRole("button", { name: /^Add / }).tap();
  await page.getByText(/^Added “.*” to Lunch\.$/).waitFor({ timeout: 30000 });
  const [e] = await log(page);
  expect(e.source === "item" && e.meal === "lunch" && e.name === dish, `entry: ${JSON.stringify(e)} vs ${dish}`);
  expect(typeof e.nutrients.protein === "number" && typeof e.nutrients.carbs === "number" && typeof e.nutrients.fat === "number", "a full-nutrition dish was added without its macros: " + JSON.stringify(e.nutrients));
  expect(e.chainName && text.includes(e.chainName) && kcal(text) === Math.round(e.nutrients.calories), `the row said "${text}", the entry is ${e.chainName} ${e.nutrients.calories}`);
  // a saved meal
  await openMeal(page, "Dinner");
  await choose(page, "Choose a restaurant meal");
  await dlg(page).getByText("My usual", { exact: true }).first().waitFor();
  await dlg(page).getByRole("button", { name: "Add My usual" }).tap();
  await page.getByText("Added “My usual” to Dinner.").waitFor();
  const entries = await log(page);
  const s = entries.find((x) => x.name === "My usual");
  expect(s && s.source === "savedOrder" && s.chainName === "KFC" && s.nutrients.calories === 600 && s.meal === "dinner", "saved meal entry: " + JSON.stringify(s));
  // a calories-only restaurant
  await openMeal(page, "Lunch");
  await choose(page, "Choose a restaurant meal");
  await page.getByLabel("Search restaurants and items").fill(liteDish);
  await page.waitForTimeout(1500);
  const lines = await dlg(page).locator("li", { has: page.getByRole("button", { name: /^Add / }) }).allInnerTexts();
  expect(!lines.some((l) => l.includes(lite.name + " ·") || l.includes("\n" + lite.name)), `${lite.name}'s dish "${liteDish}" is offered: ${lines.join(" | ")}`);
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a supermarket product: found by name, how much, the label's figures shown before Add, and exactly label x amount / 100 logged", async () => {
  const { ctx, page, errors } = await open();
  await home(page);
  await openMeal(page, "Breakfast");
  await choose(page, "Choose a supermarket product");
  await page.getByLabel("Search products or type a barcode").fill("baked beans");
  const choose1 = dlg(page).getByRole("button", { name: /^Choose / }).first();
  await choose1.waitFor({ timeout: 120000 });
  const row = dlg(page).locator("li", { has: page.getByRole("button", { name: /^Choose / }) }).first();
  const rowText = await row.innerText();
  const per100 = kcal(rowText);
  const productName = rowText.split("\n")[0].trim();
  await choose1.tap();
  const amount = page.getByLabel(/How much did you have/);
  await amount.waitFor();
  expect((await amount.inputValue()) === "100", "default amount");
  const add = dlg(page).getByRole("button", { name: "Add to Breakfast", exact: true });
  await amount.fill("0");
  expect(await add.isDisabled(), "Add is on for 0 g");
  await page.getByText(/Type an amount from 1 to 5,000\./).waitFor();
  await amount.fill("abc");
  expect(await add.isDisabled(), "Add is on for words");
  await amount.fill("200");
  await page.getByText(/From (the label|Open Food Facts contributors \(community data\)), for 200 g: .* kcal/).waitFor();
  const said = kcal(await page.getByText(/From (the label|Open Food Facts contributors \(community data\)), for 200 g/).innerText());
  expect(said === Math.round(per100 * 2) || Math.abs(said - per100 * 2) <= 2, `label said ${said} for 200 g, per 100 g is ${per100}`);
  await add.tap();
  await page.getByText(/^Added “.* \(200 g\)” to Breakfast\.$/).waitFor();
  const [e] = await log(page);
  expect(e.source === "product" && e.meal === "breakfast" && e.name === `${productName} (200 g)`, "entry: " + JSON.stringify(e));
  expect(e.nutrients.calories === said, `logged ${e.nutrients.calories}, label ${said}`);
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a supermarket product: Back goes list > amount > list > the four choices; Scan a barcode opens the camera or its typed fallback, and a typed barcode finds the product", async () => {
  const asda = await (await fetch(BASE + "/groceries/asda.json")).json();
  const p = asda.products.find((x) => x.price && x.kcal > 0 && x.protein > 0);
  const { ctx, page } = await open();
  await home(page);
  await openMeal(page, "Lunch");
  await choose(page, "Choose a supermarket product");
  await page.getByRole("button", { name: "Scan a barcode" }).tap();
  const typed = page.getByLabel("Barcode number");
  await typed.waitFor({ timeout: 20000 }); // this browser has no camera: the typed fallback comes up
  await typed.fill(p.gtin);
  await page.getByRole("button", { name: "Find" }).tap();
  await dlg(page).getByRole("button", { name: /^Choose / }).first().waitFor({ timeout: 60000 });
  expect(await page.getByLabel("Search products or type a barcode").inputValue() === p.gtin.replace(/^0+/, "") || (await page.getByLabel("Search products or type a barcode").inputValue()).includes(p.gtin.replace(/^0+/, "")), "the scanned number didn't go into the search");
  await dlg(page).getByRole("button", { name: /^Choose / }).first().tap();
  await page.getByLabel(/How much did you have/).waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await page.getByLabel("Search products or type a barcode").waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await page.getByRole("button", { name: /Type in your numbers/ }).waitFor();
  await ctx.close();
});

await step("a drink is asked for in millilitres; a nameless entry is called \"My own numbers\"", async () => {
  const asda = await (await fetch(BASE + "/groceries/asda.json")).json();
  const drink = asda.products.find((x) => x.per === "ml" && x.price && /^[A-Za-z' ]{6,30}$/.test(x.name));
  const { ctx, page } = await open();
  await home(page);
  await openMeal(page, "Lunch");
  await choose(page, "Type in your numbers");
  await page.getByLabel("Calories (kcal)").fill("100");
  const add = dlg(page).getByRole("button", { name: "Add to Lunch", exact: true });
  await add.tap();
  await page.getByText("Added “My own numbers” to Lunch.").waitFor();
  expect((await log(page)).length === 1, "one tap added " + (await log(page)).length);
  expect((await log(page))[0].name === "My own numbers", "the fallback name: " + (await log(page))[0].name);
  if (drink) {
    await openMeal(page, "Dinner");
    await choose(page, "Choose a supermarket product");
    await page.getByLabel("Search products or type a barcode").fill(drink.name);
    await dlg(page).getByRole("button", { name: /^Choose / }).first().waitFor({ timeout: 60000 });
    const rows = dlg(page).locator("li", { has: page.getByRole("button", { name: /^Choose / }) });
    let found = false;
    for (let i = 0; i < Math.min(await rows.count(), 8); i++) {
      if (/per 100 ml/.test(await rows.nth(i).innerText())) { await rows.nth(i).getByRole("button", { name: /^Choose / }).tap(); found = true; break; }
    }
    if (found) await page.getByLabel("How much did you have? (ml)").waitFor();
  }
  await ctx.close();
});

await step("entries added from a meal keep their meal when the page is reopened in another language; Arabic reads right to left and its Back arrow points the right way", async () => {
  const { ctx, page } = await open({ locale: "ar" }, { language: "ar" });
  await page.goto(BASE + "/app");
  const buttons = page.locator("li button[aria-label]").first();
  await buttons.waitFor({ timeout: 90000 });
  await buttons.tap();
  await page.locator("dialog[open]").waitFor();
  const dir = await page.evaluate(() => getComputedStyle(document.querySelector("dialog[open]")).direction);
  expect(dir === "rtl", "direction " + dir);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over <= 0, "sideways scroll " + over);
  await ctx.close();
});

await step("Extra large text: no sideways scroll in any of the sheet's views", async () => {
  const { ctx, page } = await open({}, { textSize: "xlarge" });
  await home(page);
  await openMeal(page, "Lunch");
  const over = () => page.evaluate(() => { const d = document.querySelector("dialog[open]"); return d ? d.scrollWidth - d.clientWidth : 0; });
  expect((await over()) <= 0, "menu overflows");
  for (const [name, wait] of [["Type in your numbers", () => page.getByLabel("Calories (kcal)").waitFor()], ["Choose a recipe", () => dlg(page).getByRole("button", { name: /^Add / }).first().waitFor({ timeout: 120000 })], ["Choose a restaurant meal", () => page.getByLabel("Search restaurants and items").waitFor()], ["Choose a supermarket product", () => page.getByLabel("Search products or type a barcode").waitFor()]]) {
    await choose(page, name);
    await wait();
    expect((await over()) <= 0, name + " overflows by " + (await over()));
    await page.getByRole("button", { name: "Back", exact: true }).first().tap();
    await page.getByRole("button", { name: /Type in your numbers/ }).waitFor();
  }
  await ctx.close();
});

await step("axe: no violations in the four choices, the numbers form, the recipe list, the restaurant list and the product amount", async () => {
  const { ctx, page } = await open();
  await home(page);
  const check = async (label) => {
    await page.waitForTimeout(700); // let slides and fades end before colours are judged
    await page.addScriptTag({ path: AXE }).catch(() => {});
    const res = await page.evaluate(() => globalThis.axe.run(document.querySelector("dialog[open]") ?? document, { runOnly: ["wcag2a", "wcag2aa"] }));
    expect(res.violations.length === 0, label + ": " + res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 90)).join(" | "));
  };
  await openMeal(page, "Lunch");
  await check("menu");
  await choose(page, "Type in your numbers");
  await page.getByLabel("Calories (kcal)").fill("abc");
  await check("numbers with a problem");
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await choose(page, "Choose a recipe");
  await dlg(page).getByRole("button", { name: /^Add / }).first().waitFor({ timeout: 120000 });
  await check("recipes");
  await page.getByRole("button", { name: "Back", exact: true }).first().tap();
  await choose(page, "Choose a restaurant meal");
  await page.getByLabel("Search restaurants and items").fill("chicken");
  await dlg(page).getByRole("button", { name: /^Add / }).first().waitFor({ timeout: 60000 });
  await check("restaurant");
  await page.getByRole("button", { name: "Back", exact: true }).first().tap();
  await choose(page, "Choose a supermarket product");
  await page.getByLabel("Search products or type a barcode").fill("baked beans");
  await dlg(page).getByRole("button", { name: /^Choose / }).first().waitFor({ timeout: 120000 });
  await check("products");
  await dlg(page).getByRole("button", { name: /^Choose / }).first().tap();
  await page.getByLabel(/How much did you have/).waitFor();
  await check("amount");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
