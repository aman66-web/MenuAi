import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let pass = 0, fail = 0;
async function step(n, fn) { try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", String(e.message).split("\n")[0]); } }
const vis = (l) => l.waitFor({ state: "visible", timeout: 8000 });
// The welcome screen, Pip's arrival, the text size, Pip's walk along the tab bar (Home, Eat out, Groceries, Recipes; Community is off since 2026-11-18) and "Let's make it yours",
// then "Set up my plan" to the first question.
async function pastIntro(page) {
  await page.getByRole("button", { name: "Get started" }).click();
  await vis(page.getByRole("heading", { name: "Hi, I'm Pip!" }));
  await page.getByRole("button", { name: "Show me around" }).click();
  await vis(page.getByRole("heading", { name: "Easy to read" }));
  await page.getByRole("button", { name: "Continue" }).click();
  for (const tab of ["Home", "Eat out", "Groceries", "Recipes"]) {
    await vis(page.getByRole("heading", { level: 1, name: tab, exact: true }));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await vis(page.getByRole("heading", { name: "Let's make it yours" }));
  await page.getByRole("button", { name: "Set up my plan" }).click();
  await vis(page.getByRole("heading", { name: "What's your goal?" }));
}

// "You're all set!" → "Choose a recipe to start with" → Home (or the shared page): the way out of onboarding without picking a recipe.
async function finishWithoutRecipe(page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await vis(page.getByRole("heading", { name: "Choose a recipe to start with" }));
  await page.getByRole("button", { name: "Take me to Home" }).click();
}

await step("a link to a restaurant on a first visit opens it straight away: no questions first, and nothing is redirected", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/chain?id=cluck-house");
  await vis(page.getByRole("heading", { name: "Cluck House" }));
  if (/welcome/.test(page.url())) throw new Error("sent to the questions first: " + page.url());
  await page.waitForTimeout(600);
  if (/welcome/.test(page.url())) throw new Error("sent to the questions later: " + page.url());
  await ctx.close();
});
await step("onboarding goal radios work with the arrow keys (roving focus)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await pastIntro(page);
  const first = page.getByRole("radio", { name: "Lose weight" });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await vis(page.getByRole("radio", { name: "Maintain", checked: true }));
  await page.keyboard.press("ArrowDown");
  await vis(page.getByRole("radio", { name: "Build muscle", checked: true }));
  await ctx.close();
});
await step("GLP-1 onboarding shows the exact line 'Comfortable meal size: … calories'", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await pastIntro(page);
  await page.getByRole("radio", { name: "I'm on a GLP-1 medication" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip" }).click(); // foods to avoid
  await page.getByRole("button", { name: "Skip" }).click(); // the questions about the person
  await vis(page.getByText("Comfortable meal size:"));
  if ((await page.getByLabel("Comfortable meal size in calories").inputValue()) !== "450") throw new Error("default 450 expected");
  await ctx.close();
});
await step("onboarding offers Other as a goal, Pip answers, and it's kept in Settings", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await pastIntro(page);
  await page.getByRole("radio", { name: /^Other/ }).click();
  await vis(page.getByText("No problem. I'll show you the numbers and keep your orders around your target."));
  await vis(page.getByRole("button", { name: "Continue" }));
  await page.getByRole("button", { name: "Continue" }).click();
  // foods to avoid, the questions about the person, the targets and the shops (text size is chosen at the start of the tour now)
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Skip" }).click();
  await finishWithoutRecipe(page);
  await page.waitForURL(/\/app$/);
  await page.goto(BASE + "/app/settings");
  await vis(page.getByRole("radiogroup", { name: "Goal" }).getByRole("radio", { name: "Other", checked: true }));
  await ctx.close();
});
await step("onboarding back button returns to the previous step, keeping the choice; step 1 goes back to 'Let's make it yours', then Pip's walk and the welcome screen", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/welcome");
  await pastIntro(page);
  await page.getByRole("radio", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await vis(page.getByRole("heading", { name: "Anything you avoid?" }));
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await vis(page.getByRole("heading", { name: "What's your goal?" }));
  await vis(page.getByRole("radio", { name: "Build muscle", checked: true }));
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await vis(page.getByRole("heading", { name: "Let's make it yours" }));
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await vis(page.getByRole("heading", { level: 1, name: "Community", exact: true }));
  await page.getByRole("button", { name: "Back to the previous step" }).click();
  await vis(page.getByRole("heading", { level: 1, name: "Recipes", exact: true }));
  // Groceries, Eat out, Home, the text size, Pip's arrival, the welcome screen
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Back to the previous step" }).click();
  await vis(page.getByRole("button", { name: "Get started" }));
  await ctx.close();
});
await step("menus unreachable → an honest error with Try again (not 'Menus are coming soon'), then it recovers", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })));
  const page = await ctx.newPage();
  await page.route("**/menus*/menus-manifest.json", (r) => r.abort("internetdisconnected"));
  await page.goto(BASE + "/app/eat-out");
  await vis(page.getByText("Couldn't reach the menus."));
  if (await page.getByText("Menus are coming soon").count()) throw new Error("showed the empty state while unreachable");
  await page.unroute("**/menus*/menus-manifest.json");
  await page.getByRole("button", { name: "Try again" }).click();
  await vis(page.getByRole("link", { name: /Bowl & Co\./ }));
  await ctx.close();
});
await step("saved orders are NOT marked 'No longer on the menu' while the menus are unreachable", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000, devProOverride: true } }));
    localStorage.setItem("mm.v1.saved", JSON.stringify({ v: 1, data: [{ id: "s1", createdAt: "2026-10-05T12:00:00Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Chicken bowl", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "chicken", qty: 1 }] }], nutrients: { calories: 180, protein: 32, carbs: 0, fat: 7 }, dataVersionAtSave: 1 }] }));
  });
  const page = await ctx.newPage();
  await page.route("**/menus*/**", (r) => r.abort("internetdisconnected"));
  await page.goto(BASE + "/app/meals?tab=restaurant");
  await vis(page.getByRole("heading", { name: "Chicken bowl" }));
  await page.waitForTimeout(800);
  if (await page.getByText("No longer on the menu").count()) throw new Error("wrongly marked as removed");
  await ctx.close();
});
await step("builder opened from a saved order updates it in place ('Save changes'), no duplicate", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    if (localStorage.getItem("mm.v1.saved")) return;
    localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000, devProOverride: true } }));
    localStorage.setItem("mm.v1.saved", JSON.stringify({ v: 1, data: [{ id: "s1", createdAt: "2026-10-05T12:00:00Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "My bowl", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "white-rice", qty: 1 }, { id: "chicken", qty: 1 }, { id: "black-beans", qty: 1 }, { id: "tomato-salsa", qty: 1 }, { id: "cheese", qty: 1 }] }], nutrients: { calories: 655, protein: 50, carbs: 67, fat: 20.5 }, dataVersionAtSave: 1 }] }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/builder?chain=bowl-and-co&saved=s1");
  await vis(page.getByRole("group", { name: /Order total: 655 kcal/ }));
  await page.getByRole("button", { name: "Double chicken" }).click();
  await vis(page.getByRole("group", { name: /Order total: 835 kcal/ }));
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL("**/app/meals?tab=restaurant");
  await vis(page.getByText("835 kcal"));
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.saved")).data.length);
  if (count !== 1) throw new Error("saved orders: " + count);
  await ctx.close();
});
await step("undo restores the original saved order and log entry (same id and date)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const original = { id: "s9", createdAt: "2026-09-01T08:30:00.000Z", chainId: "bowl-and-co", chainName: "Bowl & Co.", name: "Keep me", lines: [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "chicken", qty: 1 }] }], nutrients: { calories: 180, protein: 32, carbs: 0, fat: 7 }, dataVersionAtSave: 1 };
  await ctx.addInitScript(([o]) => { if (localStorage.getItem("mm.v1.settings")) return; localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })); localStorage.setItem("mm.v1.saved", JSON.stringify({ v: 1, data: [o] })); }, [original]);
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/meals?tab=restaurant");
  await page.getByRole("button", { name: "Delete Keep me" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await vis(page.getByRole("heading", { name: "Keep me" }));
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.saved")).data[0]);
  if (restored.id !== "s9" || restored.createdAt !== "2026-09-01T08:30:00.000Z") throw new Error(JSON.stringify(restored));
  await ctx.close();
});
await step("search: '--' does not show 'We don't cover this yet.'; item rows read 'Name · Chain · N cal'", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/search");
  await page.getByLabel("Search restaurants and items").fill("--");
  await page.waitForTimeout(400);
  if (await page.getByText("We don't cover this yet.").count()) throw new Error("shown for punctuation-only query");
  await page.getByLabel("Search restaurants and items").fill("nugg");
  await vis(page.getByText("Nuggets (12 ct)"));
  // spoken name = the visible text, with "calories" for "kcal"
  const row = await page.getByRole("link", { name: /Nuggets \(12 ct\) · Cluck House · 380 calories/ }).innerText();
  if (!/Nuggets \(12 ct\)\s*·\s*Cluck House\s*·\s*380 kcal/.test(row)) throw new Error(row);
  await ctx.close();
});
await step("settings: 'Menus updated' shows a real date, Segmented controls are ≥44px", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })));
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  await vis(page.getByText(/Menus updated \d{1,2} \w{3} 20\d\d/));
  const h = await page.getByRole("radio", { name: "Maintain" }).boundingBox();
  if (!h || h.height < 44) throw new Error("height " + h?.height);
  await ctx.close();
});
await step("Eat out › My favourite restaurants: star one from the list and it's kept; a dish opened shows under Recently viewed for a day only", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, goal: "maintain", dailyCalories: 2000 } })); });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/eat-out");
  await page.getByRole("link", { name: /My favourite restaurants/ }).click();
  await vis(page.getByRole("heading", { level: 1, name: "My favourite restaurants" }));
  await vis(page.getByText("No favourite restaurants yet"));
  await page.getByLabel("Search restaurants").fill("bowl");
  await page.getByRole("button", { name: /Save Bowl & Co\./ }).click();
  await vis(page.getByRole("button", { name: /Saved Bowl & Co\./, pressed: true }));
  await vis(page.getByRole("link", { name: /Bowl & Co\./ }));
  await page.goto(BASE + "/app/eat-out");
  await vis(page.getByRole("link", { name: /My favourite restaurants.*1 restaurant/ }));
  // recently viewed
  await page.goto(BASE + "/app/item?chain=bowl-and-co&item=chicken-bowl");
  await vis(page.getByRole("heading", { name: "Chicken bowl" }));
  await page.goto(BASE + "/app/chain?id=bowl-and-co");
  const recent = page.getByRole("region", { name: "Recently viewed" });
  await vis(recent.getByRole("link", { name: /Chicken bowl/ }));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("mm.v1.recentItems")); d.data = d.data.map((v) => ({ ...v, viewedAt: new Date(Date.now() - 25 * 3600_000).toISOString() })); localStorage.setItem("mm.v1.recentItems", JSON.stringify(d)); });
  await page.reload();
  await vis(page.getByRole("heading", { name: "Best for you" }));
  if (await page.getByRole("heading", { name: "Recently viewed" }).count()) throw new Error("still shown after a day");
  await ctx.close();
});
await step("Home's round button at the top right is Settings (a gear), not the calendar: a 44 px link to /app/settings that opens Settings; Today's meals opens from a meal row", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, hasSetTargets: true, goal: "maintain", dailyCalories: 2000 } })); });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app");
  // Home's header is the date and the calendar button on the left and the gear on the right: the h1's grandparent holds all three. The tab bar has no Settings
  // tab any more (it is the Community tab now), so the gear is the only Settings link in the page.
  const header = page.locator("h1", { hasText: "Home" }).locator("xpath=../..");
  const gear = header.getByRole("link", { name: "Settings", exact: true });
  await vis(gear);
  if ((await gear.getAttribute("href")) !== "/app/settings") throw new Error("the button goes to " + (await gear.getAttribute("href")));
  const box = await gear.boundingBox();
  if (box.width < 44 || box.height < 44) throw new Error(`tap area ${box.width} x ${box.height}`);
  if ((await gear.locator("svg").count()) !== 1) throw new Error("no icon");
  if ((await page.getByRole("link", { name: "Settings", exact: true }).count()) !== 1) throw new Error("Settings should be reachable only through the gear, not a tab");
  if (await header.getByRole("link", { name: "Today's meals" }).count()) throw new Error("the calendar link is still in the header");
  const row = page.getByRole("link", { name: /Breakfast/ }).first();
  if ((await row.getAttribute("href")) !== "/app/today") throw new Error("a meal row no longer opens Today's meals: " + (await row.getAttribute("href")));
  await gear.tap();
  await vis(page.getByRole("heading", { level: 1, name: "Settings", exact: true }));
  await ctx.close();
});
await step("App Review 1.4.1: the sources of the suggested targets are one tap away (Settings > About, beside Daily targets, and in onboarding) with working https links", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, hasSetTargets: true, goal: "glp1", dailyCalories: 2000 } })); });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(BASE + "/app/settings");
  await vis(page.getByRole("heading", { level: 1, name: "Settings", exact: true }));
  // beside the Daily targets (the screen Apple's reviewer photographed): a 44 px button that opens the sources in a sheet
  const targets = page.locator("#targets");
  const link = targets.getByRole("button", { name: "Where these numbers come from" });
  await vis(link);
  const box = await link.boundingBox();
  if (box.height < 44) throw new Error("tap area " + box.height);
  await link.click();
  const sheet = page.getByRole("dialog", { name: "Where these numbers come from" });
  await vis(sheet);
  const hrefs = await sheet.locator("a[target=_blank]").evaluateAll((as) => as.map((a) => a.href));
  if (hrefs.length !== 3) throw new Error("expected 3 source links, got " + hrefs.join(", "));
  for (const h of hrefs) if (!/^https:\/\/(pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov|www\.nhs\.uk)\//.test(h)) throw new Error("unexpected link " + h);
  await vis(sheet.getByText("Mifflin-St Jeor equation", { exact: false }));
  await vis(sheet.getByText("Numbite's own starting points"));
  await vis(sheet.getByText("comfortable meal size that starts at 450 kcal", { exact: false }));
  if (requests.some((u) => /nhs\.uk|ncbi\.nlm\.nih\.gov/.test(u))) throw new Error("a source page was fetched without a tap");
  await sheet.getByRole("button", { name: "Close" }).click();
  // the GLP-1 goal note has its own link, and Settings > About has the page
  await vis(page.locator("section, div").filter({ hasText: "follow the advice of your doctor or pharmacist" }).getByRole("button", { name: "Where these numbers come from" }).first());
  await page.getByRole("link", { name: "Where these numbers come from" }).click();
  await page.waitForURL(/\/app\/settings\/sources/);
  await vis(page.getByRole("heading", { level: 1, name: "Where these numbers come from" }));
  await vis(page.getByRole("link", { name: "How we get our numbers" }));
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await vis(page.getByRole("heading", { level: 1, name: "Settings", exact: true }));
  await ctx.close();
});
await step("Settings › Daily targets: an empty protein box says 'Worked out'; a typed change is 'Not saved yet' until 'Save targets'; 'Use these' says so too", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, hasSetTargets: true, goal: "maintain", dailyCalories: 2000 } })); });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  const targets = page.locator("#targets");
  const notSaved = page.getByText("Not saved yet. Tap \u201cSave targets\u201d to keep them.", { exact: true });
  // the worked-out boxes (protein, carbs, fat) say so under the grey number; calories (a saved figure) and water (a default) don't
  await vis(targets.locator("label", { hasText: "Protein (g)" }).getByText("Worked out", { exact: true }));
  for (const name of ["Carbs (g)", "Fat (g)"]) await vis(targets.locator("label", { hasText: name }).getByText("Worked out", { exact: true }));
  for (const name of ["Calories", "Water (ml)"]) if (await targets.locator("label", { hasText: name }).getByText("Worked out", { exact: true }).count()) throw new Error(`${name} is tagged`);
  if (await notSaved.count()) throw new Error("'Not saved yet' before anything was typed");
  // a typed change: not saved yet, said as a status line; Save targets keeps it and the line goes
  await targets.locator("input").first().fill("2100"); // Calories, the first box
  await vis(notSaved);
  if ((await notSaved.getAttribute("role")) !== "status") throw new Error("the line is not a status");
  await page.getByRole("button", { name: "Save targets" }).click();
  await vis(page.getByText("Saved.", { exact: true }));
  if (await notSaved.count()) throw new Error("'Not saved yet' still shown after saving");
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.settings")).data);
  if (s.dailyCalories !== 2100) throw new Error("saved: " + s.dailyCalories);
  // the suggestion's "Use these" fills the boxes, which are not saved yet either
  await page.getByRole("button", { name: "Suggest targets", exact: true }).click();
  const form = page.locator("form");
  await form.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("34");
  for (const [name, value] of [["Stone", "11"], ["Pounds", "0"], ["Feet", "5"], ["Inches", "10"]]) await page.getByRole("textbox", { name, exact: true }).fill(value);
  await form.getByRole("button", { name: "Suggest targets", exact: true }).click();
  await vis(form.getByRole("status"));
  await form.getByRole("button", { name: "Use these", exact: true }).click();
  await vis(notSaved);
  await ctx.close();
});
await step("Settings › Set up with Pip opens the welcome screen with a way back to Settings; a first visit to the welcome screen has no such button and no Skip", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { hasCompletedOnboarding: true, hasSetTargets: true, goal: "maintain", dailyCalories: 2000 } })); });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app/settings");
  const pip = page.getByRole("link", { name: /Set up with Pip/ });
  await vis(pip);
  if ((await pip.getAttribute("href")) !== "/app/welcome") throw new Error("the card goes to " + (await pip.getAttribute("href")));
  const box = await pip.boundingBox();
  if (box.height < 44) throw new Error("tap area " + box.height);
  await pip.click();
  await page.waitForURL(/\/app\/welcome$/);
  await vis(page.getByRole("button", { name: "Get started" }));
  const back = page.getByRole("button", { name: "Back to the previous step" });
  await vis(back);
  await back.click();
  await page.waitForURL(/\/app\/settings$/);
  await vis(page.getByRole("heading", { level: 1, name: "Settings", exact: true }));
  await ctx.close();
  // someone who has never been set up opening the welcome screen: no Back on its first screen (Skip is the way out)
  const first = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p2 = await first.newPage();
  await p2.goto(BASE + "/app/welcome");
  await vis(p2.getByRole("button", { name: "Get started" }));
  await p2.waitForTimeout(600);
  if (await p2.getByRole("button", { name: "Back to the previous step" }).count()) throw new Error("a first visit has a Back button on the welcome screen");
  if (await p2.getByRole("button", { name: "Skip", exact: true }).count()) throw new Error("the welcome screen has a Skip button (founder 2026-11-17: none)");
  await first.close();
});
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
