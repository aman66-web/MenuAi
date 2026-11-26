import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
import { mkdirSync } from "node:fs";
import { recipeTileName, recipeTiles, shopTile } from "./welcome-steps.mjs";
mkdirSync(SHOTS, { recursive: true });
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
// The welcome tour has been seen on this phone (e2e/tour.mjs covers the tour a first plain launch opens), so a plain /app here opens Home.
await ctx.addInitScript(() => { if (!localStorage.getItem("mm.v1.tour")) localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); });
const page = await ctx.newPage();

const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
const posts = [];
await page.route("**/api/**", async (route) => {
  const req = route.request();
  posts.push(`${req.method()} ${new URL(req.url()).pathname} ${req.postData() ?? ""}`.slice(0, 400));
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "test-id" }) });
});

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log("PASS", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); await page.screenshot({ path: `${SHOTS}FAIL-${name.replace(/\W+/g, "-")}.png` }); }
}
// visible only: Pip's bubbles keep the room of every line they can say as invisible copies (BubbleWords, the audit of 20 November 2026)
const text = (t) => page.getByText(t, { exact: false }).filter({ visible: true }).first();
const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: false });
const visible = async (loc, timeout = 8000) => { await loc.waitFor({ state: "visible", timeout }); };

await step("a visit after the welcome tour goes straight to Home: no questionnaire first, and a quiet card offers to set a goal", async () => {
  await page.goto(`${BASE}/app`);
  await visible(page.getByRole("heading", { level: 1, name: "Home" }));
  if (page.url().includes("welcome")) throw new Error("redirected to welcome");
  await visible(page.getByRole("heading", { level: 2, name: "Make Numbite fit you" }));
  await visible(page.getByRole("button", { name: "Set up" }));
  await shot("00-first-visit-home");
});
await step("the guided setup at /app/welcome: the cover, then step 1 of 9 (heard with the headline, never written) with Pip small beside it and no speech bubble (no hello screen, no tour, no fork)", async () => {
  await page.goto(`${BASE}/app/welcome`);
  await visible(page.getByRole("button", { name: "Get started" }));
  await shot("00-onboarding-welcome");
  await page.getByRole("button", { name: "Get started" }).click();
  await visible(page.getByRole("heading", { level: 1, name: /^What's your goal\?\s*, Step 1 of 9$/ }));
  if (await page.locator("main .speech").count()) throw new Error("a speech bubble on step 1");
  for (const gone of ["Hi, I'm Pip!", "Let's make it yours"]) if (await page.getByRole("heading", { name: gone }).count()) throw new Error(`'${gone}' is back`);
  await page.waitForTimeout(1000); // Pip's entrance
  await shot("01-onboarding-goal");
});
await step("onboarding: goal → avoid → shops → a first recipe → about you → how active → your plan → the account ('Not now') → Home with the Start here card, whose recipe opens the real recipe page (its Back lands on Home)", async () => {
  await page.getByRole("radio", { name: /^Build muscle/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await visible(page.getByRole("heading", { name: /^Anything you avoid\?/ }));
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  // 3: the shops, as their logos
  await visible(page.getByRole("heading", { name: /^Where do you shop\?/ }));
  await shopTile(page, "Sainsbury's").click();
  await page.getByRole("button", { name: "Continue" }).click();
  // 4: two recipes from Sainsbury's: one chosen as the first recipe
  await visible(page.getByRole("heading", { name: /^Recipes from Sainsbury's/ }));
  const tiles = recipeTiles(page);
  await tiles.first().waitFor({ state: "visible", timeout: 45000 });
  if ((await tiles.count()) !== 2) throw new Error(`expected two recipes to choose from, got ${await tiles.count()}`);
  const recipe = await recipeTileName(tiles.first());
  await tiles.first().click();
  await visible(page.getByText("Your first recipe", { exact: true }).first());
  await shot("03-onboarding-recipes");
  await page.getByRole("button", { name: "Continue" }).click();
  // 5-6: about you on one screen, then how active; Your plan arrives worked out from them
  await visible(page.getByRole("heading", { name: /^About you/ }));
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Age in years").fill("34");
  await page.getByLabel("Stone").fill("12");
  await page.getByLabel("Pounds").fill("4");
  await page.getByLabel("Feet").fill("5");
  await page.getByLabel("Inches").fill("11");
  await page.getByRole("button", { name: "Continue" }).click();
  await visible(page.getByRole("heading", { name: /^How active are you\?/ }));
  // nothing is picked for the person: the button is grey until a tile is tapped
  if (!(await page.getByRole("button", { name: "See my plan" }).isDisabled())) throw new Error("'See my plan' works before a tile is tapped");
  await page.getByRole("radio", { name: "Lightly active", exact: true }).click();
  await page.getByRole("button", { name: "See my plan" }).click();
  // 7: Your plan: the numbers, changed to 2,400, the week sized to them, the restaurants' own photos
  await visible(page.getByRole("heading", { name: /^Your plan/ }));
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.locator("#plan-calories").fill("2400");
  await page.locator("#plan-protein").fill("150");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await visible(page.getByText("2,400", { exact: true }).first());
  // the example week priced at the person's shop: the first shop, then each week after (founder 2026-11-20, 23:05)
  await visible(page.getByText(/^Your first shop: about £[\d,]+$/), 45000);
  await visible(page.getByText(/^Your food: about £[\d.]+ a day$/));
  await shot("04-onboarding-plan");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // 8: the account (optional on this build: "Not now")
  await visible(page.getByRole("heading", { name: /^Save your plan/ }));
  await visible(text(`Waiting for you on Home: ${recipe}.`));
  await shot("06-onboarding-account");
  await page.getByRole("button", { name: "Not now" }).click();
  await page.waitForURL(/\/app\/?$/);
  // Home: the toast and the one-time Start here card with the recipe; Open goes to the real recipe page, whose Back lands on Home
  await visible(text("You're in. Sign in any time in Settings to keep your goal and numbers safe."), 15000);
  const start = page.getByRole("region", { name: "Start here" });
  await visible(start.getByText(`Your first recipe: ${recipe}`));
  await shot("07-home-start-here");
  await start.getByRole("link", { name: /^Open/ }).or(start.getByRole("button", { name: /^Open/ })).first().click();
  await page.waitForURL(/\/app\/recipes\/view\?id=/);
  await visible(text("For 1 serving")); // a recipe opens for one person (founder 2026-11-16)
  await visible(page.getByRole("tab", { name: "Ingredients" }));
  await visible(page.getByRole("button", { name: /^Swap / }).first());
  await shot("08-start-here-recipe-opened");
  await page.goBack(); // the phone's own Back: Home is under the recipe, never the welcome screens
  await page.waitForURL(/\/app\/?$/);
});
await step("home is today: this week, calories against the target, the Shopping list at the top right, the cooking cards, today's meals and the sample banner", async () => {
  await visible(page.getByRole("heading", { level: 1, name: "Home" }));
  await visible(page.getByRole("list", { name: "This week" }));
  await visible(page.getByRole("progressbar", { name: "Calories used today" }));
  // the dial says what's left in its middle, then what was eaten and the target under it (colour meeting, 19 November 2026): no percentage
  await visible(text("of 2,400 kcal"));
  await visible(text("Log your meals to see what's left today."));
  // the cooking tools under the numbers since 2026-11-19 (Scan your food only where Premium is sold); My meals is reached from Recipes
  for (const name of [/^Shopping list/, /^Cook with what you already have/, /^Meal plan/]) await visible(page.getByRole("link", { name }));
  for (const name of [/^Breakfast/, /^Lunch/, /^Dinner/]) await visible(page.getByRole("link", { name }));
  for (const name of [/My groceries/, /My saved meals/, /My recipes/, /My diet/]) if (await page.getByRole("link", { name }).count()) throw new Error(`old tile still on Home: ${name}`);
  await visible(text("fictional sample data"));
  await shot("04-home");
});
await step("onboarding does not repeat on reload", async () => {
  await page.reload();
  await visible(page.getByRole("heading", { level: 1, name: "Home" }));
  if (page.url().includes("welcome")) throw new Error("redirected to welcome again");
});
await step("Eat out tab: search, Near me and every restaurant", async () => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Eat out" }).click();
  await visible(page.getByRole("heading", { level: 1, name: "Eat out" }));
  await visible(page.getByRole("link", { name: /Near me/ }));
  await visible(page.getByRole("link", { name: /Bowl & Co\./ }));
  await visible(page.getByRole("link", { name: /Cluck House/ }));
  await shot("04b-eat-out");
});
await step("search finds nuggets and offers request when nothing matches", async () => {
  await page.getByRole("link", { name: "Search restaurants and items" }).click();
  await page.getByLabel("Search restaurants and items").fill("nugg");
  await visible(page.getByRole("link", { name: /Nuggets \(12 ct\)/ }));
  await shot("05-search");
  await page.getByLabel("Search restaurants and items").fill("zzzzqq");
  await visible(text("We don't cover this yet."));
  await visible(page.getByRole("button", { name: "Request it" }));
});
await step("request a chain goes through the outbox to /api/v1/chain-requests", async () => {
  await page.getByRole("button", { name: "Request it" }).click();
  await page.getByLabel("Which restaurant?").fill("Zed Burgers");
  await page.getByRole("button", { name: "Send request" }).click();
  await visible(text("the most-requested chains get added first"));
  await page.waitForTimeout(300);
  if (!posts.some((p) => p.startsWith("POST /api/v1/chain-requests") && p.includes('"name":"Zed Burgers"') && p.includes('"appVersion":"web 1.0"'))) throw new Error("no chain request posted: " + posts.join(" | "));
  await page.getByRole("button", { name: "Done" }).click();
});
await step("chain page: free user sees blurred Best for you, menu rows with macros, source footer", async () => {
  await page.goto(`${BASE}/app/chain?id=bowl-and-co`);
  await visible(page.getByRole("heading", { name: "Bowl & Co." }));
  await visible(page.getByRole("button", { name: /^See Premium/ })); // the one call to action over the blurred picks (19-20 November 2026: "Premium" is the one name)
  await visible(text("655 kcal"));
  await visible(text("50g protein"));
  await visible(text("67g carbs · 21g fat"));
  await visible(text("Not affiliated with Bowl & Co."));
  await visible(text("checked 1 Oct 2026"));
  // (The "New" badge lasts 30 days from a dish's addedOn, so it is covered by the unit tests, not by a date-dependent browser step.)
  await shot("06-chain-free");
});
await step("sorting flattens categories; filter chips narrow the menu", async () => {
  await page.getByLabel("Sort by").selectOption("protein");
  const firstRow = page.locator("section[aria-label='All items'] li").first();
  await visible(firstRow);
  if (!(await firstRow.textContent()).includes("Chicken")) throw new Error("expected a chicken item first when sorting by protein");
  await page.getByLabel("Sort by").selectOption("menu");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vegetarian" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await visible(text("Your diet: Vegetarian"));
  await visible(text("Agua fresca"));
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vegetarian" }).click();
  await page.getByRole("button", { name: "Done" }).click();
});
await step("item detail: big calories, nutrients and 'not published'", async () => {
  await page.goto(`${BASE}/app/item?chain=cluck-house&item=pumpkin-shake`);
  await visible(page.getByRole("heading", { name: "Pumpkin spice shake" }));
  await page.getByRole("button", { name: /More detail/ }).click();
  await visible(text("not published"));
  await visible(text("Limited time"));
  await shot("07-item");
});
await step("tapping Customise as a free user shows the honest paywall", async () => {
  await page.getByRole("button", { name: "Change the order" }).click();
  await visible(page.getByRole("heading", { name: "Build the perfect order, every time" }));
  await visible(text("Premium isn't on the web yet."));
  await visible(text("Top 5 picks for your goal at every restaurant"));
  await shot("08-paywall");
});
await step("unlock Premium preview (testing)", async () => {
  await page.getByRole("button", { name: "Unlock Premium preview (testing)" }).click();
  await page.waitForTimeout(300);
});
await step("Best for you (Premium): build muscle, lunch → golden #1 with reason line", async () => {
  await page.goto(`${BASE}/app/chain?id=bowl-and-co`);
  await visible(page.getByRole("heading", { name: "Bowl & Co." }));
  await page.getByRole("button", { name: "Lunch" }).click();
  await visible(text("Chicken salad · double chicken · no cheese, no honey lime vinaigrette"));
  await visible(text("65g protein · 410 kcal · 15.9g per 100 kcal"));
  await visible(text("Lunch · up to 840 kcal"));
  await shot("09-best-for-you");
});
await step("tapping a pick opens the builder prefilled with live totals", async () => {
  await page.getByRole("button", { name: /Chicken salad · double chicken · no cheese, no honey lime vinaigrette/ }).click();
  await page.waitForURL("**/app/builder?**");
  await visible(page.getByRole("heading", { name: "Build your order" }));
  await visible(page.getByRole("group", { name: /Order total: 410 kcal/ }));
  await visible(text("After this: 1,990 kcal"));
  await shot("10-builder");
});
await step("builder from an item: double, remove and swap update the total AND the name (pipeline wording)", async () => {
  await page.goto(`${BASE}/app/builder?chain=bowl-and-co&item=chicken-bowl`);
  await visible(page.getByRole("group", { name: /Order total: 655 kcal/ }));
  const name = page.getByLabel("Order name");
  if ((await name.inputValue()) !== "Chicken bowl") throw new Error("name: " + (await name.inputValue()));
  await page.getByRole("button", { name: "Double chicken" }).click();
  await visible(page.getByRole("group", { name: /Order total: 835 kcal, 82 grams protein/ }));
  await page.getByRole("button", { name: "Remove Cheese" }).click();
  await visible(page.getByRole("group", { name: /Order total: 725 kcal/ }));
  await page.getByRole("button", { name: "Swap White rice" }).click();
  await page.getByRole("button", { name: /Romaine lettuce/ }).click();
  await visible(page.getByRole("group", { name: /Order total: 520 kcal, 72 grams protein/ }));
  const final = await name.inputValue();
  if (final !== "Chicken bowl · double chicken · no cheese · romaine lettuce instead of white rice") throw new Error("name: " + final);
  await shot("10-builder");
});
await step("builder: Add ingredient, Add item and quantity", async () => {
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("button", { name: /Tortilla chips/ }).click();
  await visible(page.getByRole("group", { name: /Order total: 1,060 kcal/ }));
  if (!(await page.getByLabel("Order name").inputValue()).endsWith("add tortilla chips")) throw new Error("name should end with add tortilla chips: " + (await page.getByLabel("Order name").inputValue()));
  await page.getByRole("button", { name: "Remove Tortilla chips" }).click();
  await visible(page.getByRole("group", { name: /Order total: 520 kcal/ }));
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: /Agua fresca/ }).click();
  await visible(page.getByRole("group", { name: /Order total: 640 kcal/ }));
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await visible(page.getByRole("group", { name: /Order total: 760 kcal/ }));
  await shot("11-builder-two-lines");
});
await step("Save → My meals › Restaurant meals lists it; Log → today's meals shows it", async () => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL("**/app/meals?tab=restaurant");
  await visible(page.getByRole("tab", { name: /Restaurant meals/, selected: true }));
  await visible(text("2 × Agua fresca"));
  await visible(text("760 kcal"));
  await shot("12-saved");
  await page.getByRole("link", { name: "Open in builder" }).click();
  await page.waitForURL("**/app/builder?**");
  await visible(page.getByRole("group", { name: /Order total: 760 kcal/ }));
  // "Add to today" asks which meal, then stays on the builder with a toast and Undo (the 20 November 2026 audit; it used to jump to Today)
  await page.getByRole("button", { name: "Add to today", exact: true }).click();
  await page.getByRole("dialog", { name: "Add to today" }).getByRole("button", { name: /^Add to (Breakfast|Lunch|Dinner|Snacks)$/ }).click();
  await visible(text(/^Added “.+” to (Breakfast|Lunch|Dinner|Snacks)\.$/));
  if (!page.url().includes("/app/builder")) throw new Error("left the builder after adding: " + page.url());
  await page.goto(`${BASE}/app/today`);
  await visible(text("760"));
  await visible(text("of 2,400 kcal"));
  await shot("13-today");
});
await step("home shows today's calories after logging", async () => {
  await page.goto(`${BASE}/app`);
  await visible(page.getByRole("progressbar", { name: "Calories used today" }));
  await visible(text("760 eaten")); // 2,400 - 760 = 1,640 left, said in the dial's middle
  await visible(text("1,640"));
  if (await page.locator('[data-coach="home-numbers"]').getByText(/\d+%/).count()) throw new Error("a percentage is still shown on Home's numbers");
  await shot("14-home-pro");
});
await step("remove a log entry and undo it", async () => {
  await page.goto(`${BASE}/app/today`);
  await page.getByRole("button", { name: /^Remove / }).first().click();
  await visible(text(/^Removed “.+”\./)); // the toast names what went (the 20 November 2026 audit; it said "Deleted")
  await page.getByRole("button", { name: "Undo" }).click();
  await visible(page.getByRole("button", { name: /^Remove / }).first());
});
await step("report a number queues to /api/v1/reports with the right body", async () => {
  await page.goto(`${BASE}/app/item?chain=bowl-and-co&item=chicken-bowl`);
  await page.getByRole("button", { name: "Report a number" }).click();
  await page.getByLabel("Correct value").fill("640");
  await page.getByLabel("Note (optional)").fill("Board says 640");
  await page.getByRole("button", { name: "Send report" }).click();
  await visible(text("we'll check within 48 hours"));
  await page.waitForTimeout(300);
  const r = posts.find((p) => p.startsWith("POST /api/v1/reports"));
  if (!r || !r.includes('"chainId":"bowl-and-co"') || !r.includes('"itemId":"chicken-bowl"') || !r.includes('"shownValue":655') || !r.includes('"reportedValue":640')) throw new Error("bad report: " + r);
});
await step("settings: goal, targets, GLP-1 meal size, data version, numbers page", async () => {
  await page.goto(`${BASE}/app/settings`);
  await visible(page.getByRole("heading", { name: "Settings" }));
  await page.getByRole("radio", { name: "GLP-1" }).click();
  await visible(page.getByLabel("Comfortable meal size (calories)"));
  await visible(text("Menus updated"));
  await shot("15-settings");
  await page.getByRole("link", { name: "How we get our numbers" }).click();
  await visible(text("We never estimate."));
});
await step("GLP-1 Best for you stays within the comfortable meal size", async () => {
  await page.goto(`${BASE}/app/chain?id=cluck-house`);
  await visible(page.getByRole("heading", { name: "Cluck House" }));
  await visible(text("up to 450 kcal"));
});
await step("no dark mode: a phone in dark mode still gets the light grey app", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/app/chain?id=bowl-and-co`);
  await visible(page.getByRole("heading", { name: "Bowl & Co." }));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bg !== "rgb(244, 245, 246)") throw new Error(`page background in dark mode is ${bg}, not the app's grey`);
  await shot("16-chain-phone-in-dark-mode");
  await page.emulateMedia({ colorScheme: "light" });
});

console.log(`\n${passed} passed, ${failed} failed`);
const filtered = problems.filter((p) => !/Download the React DevTools|favicon|Fast Refresh|\[HMR\]/.test(p));
console.log(filtered.length ? "PAGE PROBLEMS:\n" + [...new Set(filtered)].join("\n") : "No console errors or warnings.");
await browser.close();
process.exit(failed ? 1 : 0);
