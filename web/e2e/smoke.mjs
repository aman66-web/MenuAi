import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
import { mkdirSync } from "node:fs";
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
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
const text = (t) => page.getByText(t, { exact: false }).first();
const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: false });
const visible = async (loc, timeout = 8000) => { await loc.waitFor({ state: "visible", timeout }); };

await step("first visit redirects to onboarding", async () => {
  await page.goto(`${BASE}/app`);
  await page.waitForURL(/\/app\/welcome/);
  await visible(page.getByRole("heading", { name: "What's your goal?" }));
  await visible(text("Step 1 of 4"));
  await shot("01-onboarding-goal");
});
await step("onboarding: goal → targets → preferences → how it works → Start", async () => {
  await page.getByRole("radio", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await visible(page.getByRole("heading", { name: "Your daily targets" }));
  await page.getByLabel("Calories").fill("2400");
  await page.getByLabel("Protein (g)").fill("150");
  await shot("02-onboarding-targets");
  await page.getByRole("button", { name: "Continue" }).click();
  await visible(page.getByRole("heading", { name: "Anything you avoid?" }));
  await page.getByRole("button", { name: "Skip" }).click();
  await visible(page.getByRole("heading", { name: "Here's how it works" }));
  await visible(text("Pick a restaurant"));
  await shot("03-onboarding-how");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/app\/?$/);
});
await step("home shows targets, search, popular chains and the sample banner", async () => {
  await visible(page.getByRole("heading", { name: "Where are you eating?" }));
  await visible(text("Your targets:"));
  await visible(text("2,400 cal"));
  await visible(page.getByRole("link", { name: /Bowl & Co\./ }));
  await visible(page.getByRole("link", { name: /Cluck House/ }));
  await visible(text("fictional sample data"));
  await shot("04-home");
});
await step("onboarding does not repeat on reload", async () => {
  await page.reload();
  await visible(page.getByRole("heading", { name: "Where are you eating?" }));
  if (page.url().includes("welcome")) throw new Error("redirected to welcome again");
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
  await visible(page.getByRole("button", { name: /See your 5 best orders/ }));
  await visible(text("655 cal · 50g protein · 67g carbs · 21g fat"));
  await visible(text("Not affiliated with Bowl & Co."));
  await visible(text("checked 1 Oct 2026"));
  await visible(text("New"));
  await shot("06-chain-free");
});
await step("sorting flattens categories; filter chips narrow the menu", async () => {
  await page.getByLabel("Sort by").selectOption("protein");
  const firstRow = page.locator("section[aria-label='All items'] li").first();
  await visible(firstRow);
  if (!(await firstRow.innerText()).includes("Chicken")) throw new Error("expected a chicken item first when sorting by protein");
  await page.getByLabel("Sort by").selectOption("menu");
  await page.getByRole("button", { name: "Vegetarian" }).click();
  await visible(text("Agua fresca"));
  await page.getByRole("button", { name: "Vegetarian" }).click();
});
await step("item detail: big calories, nutrients and 'not published'", async () => {
  await page.goto(`${BASE}/app/item?chain=cluck-house&item=pumpkin-shake`);
  await visible(page.getByRole("heading", { name: "Pumpkin spice shake" }));
  await visible(text("not published"));
  await visible(text("Limited time"));
  await shot("07-item");
});
await step("tapping Customise as a free user shows the honest paywall", async () => {
  await page.getByRole("button", { name: "Customise" }).click();
  await visible(page.getByRole("heading", { name: "Build the perfect order, every time" }));
  await visible(text("Pro isn't on the web yet."));
  await visible(text("Top 5 picks for your goal at every chain"));
  await shot("08-paywall");
});
await step("unlock Pro preview (testing)", async () => {
  await page.getByRole("button", { name: "Unlock Pro preview (testing)" }).click();
  await page.waitForTimeout(300);
});
await step("Best for you (Pro): build muscle, lunch → golden #1 with reason line", async () => {
  await page.goto(`${BASE}/app/chain?id=bowl-and-co`);
  await visible(page.getByRole("heading", { name: "Bowl & Co." }));
  await page.getByRole("button", { name: "Lunch" }).click();
  await visible(text("Chicken salad · double chicken · no cheese, no honey lime vinaigrette"));
  await visible(text("65g protein · 410 cal · 15.9g per 100 cal"));
  await visible(text("Lunch · up to 840 cal"));
  await shot("09-best-for-you");
});
await step("tapping a pick opens the builder prefilled with live totals", async () => {
  await page.getByRole("button", { name: /Chicken salad · double chicken · no cheese, no honey lime vinaigrette/ }).click();
  await page.waitForURL("**/app/builder?**");
  await visible(page.getByRole("heading", { name: "Build your order" }));
  await visible(page.getByRole("group", { name: /Order total: 410 cal/ }));
  await visible(text("After this: 1,990 cal"));
  await shot("10-builder");
});
await step("builder from an item: double, remove and swap update the total AND the name (pipeline wording)", async () => {
  await page.goto(`${BASE}/app/builder?chain=bowl-and-co&item=chicken-bowl`);
  await visible(page.getByRole("group", { name: /Order total: 655 cal/ }));
  const name = page.getByLabel("Order name");
  if ((await name.inputValue()) !== "Chicken bowl") throw new Error("name: " + (await name.inputValue()));
  await page.getByRole("button", { name: "Double chicken" }).click();
  await visible(page.getByRole("group", { name: /Order total: 835 cal, 82 grams protein/ }));
  await page.getByRole("button", { name: "Remove Cheese" }).click();
  await visible(page.getByRole("group", { name: /Order total: 725 cal/ }));
  await page.getByRole("button", { name: "Swap White rice" }).click();
  await page.getByRole("button", { name: /Romaine lettuce/ }).click();
  await visible(page.getByRole("group", { name: /Order total: 520 cal, 72 grams protein/ }));
  const final = await name.inputValue();
  if (final !== "Chicken bowl · double chicken · no cheese · romaine lettuce instead of white rice") throw new Error("name: " + final);
  await shot("10-builder");
});
await step("builder: Add ingredient, Add item and quantity", async () => {
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("button", { name: /Tortilla chips/ }).click();
  await visible(page.getByRole("group", { name: /Order total: 1,060 cal/ }));
  if (!(await page.getByLabel("Order name").inputValue()).endsWith("add tortilla chips")) throw new Error("name should end with add tortilla chips: " + (await page.getByLabel("Order name").inputValue()));
  await page.getByRole("button", { name: "Remove Tortilla chips" }).click();
  await visible(page.getByRole("group", { name: /Order total: 520 cal/ }));
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: /Agua fresca/ }).click();
  await visible(page.getByRole("group", { name: /Order total: 640 cal/ }));
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await visible(page.getByRole("group", { name: /Order total: 760 cal/ }));
  await shot("11-builder-two-lines");
});
await step("Save → Saved tab lists it; Log → Today shows it", async () => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL("**/app/saved");
  await visible(text("2 × Agua fresca"));
  await visible(text("760 cal"));
  await shot("12-saved");
  await page.getByRole("link", { name: "Open in builder" }).click();
  await page.waitForURL("**/app/builder?**");
  await visible(page.getByRole("group", { name: /Order total: 760 cal/ }));
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.waitForURL("**/app/today");
  await visible(text("760"));
  await visible(text("/ 2,400 cal"));
  await shot("13-today");
});
await step("home shows left today after logging", async () => {
  await page.goto(`${BASE}/app`);
  await visible(text("Left today:"));
  await visible(text("1,640 cal"));
  await shot("14-home-pro");
});
await step("delete a log entry and undo it", async () => {
  await page.goto(`${BASE}/app/today`);
  await page.getByRole("button", { name: /^Delete / }).first().click();
  await visible(text("Deleted"));
  await page.getByRole("button", { name: "Undo" }).click();
  await visible(page.getByRole("button", { name: /^Delete / }).first());
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
  await visible(text("up to 450 cal"));
});
await step("dark mode renders", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/app/chain?id=bowl-and-co`);
  await visible(page.getByRole("heading", { name: "Bowl & Co." }));
  await shot("16-chain-dark");
  await page.emulateMedia({ colorScheme: "light" });
});

console.log(`\n${passed} passed, ${failed} failed`);
const filtered = problems.filter((p) => !/Download the React DevTools|favicon|Fast Refresh|\[HMR\]/.test(p));
console.log(filtered.length ? "PAGE PROBLEMS:\n" + [...new Set(filtered)].join("\n") : "No console errors or warnings.");
await browser.close();
process.exit(failed ? 1 : 0);
