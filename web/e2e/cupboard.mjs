// "Cook from my cupboard" (founder 2026-11-16): the entry card on Recipes, picking what you have (common things, store cupboard, search, typed words), a rough amount
// (a little / some / plenty) or an exact number, the recipes ranked by how much the cupboard covers and the people it feeds, opening one (people and swaps already
// set), adding what is missing to the shopping list, diet and allergies, persistence, Clear data, NOTHING about the cupboard in any request, 360 px / 200% text, 44 px
// targets, axe.
// Uses the real published Sainsbury's list (public/groceries/all/sainsburys.json); the shop's pictures are answered locally.
// Run against a production build (README): BASE=http://localhost:3101 node e2e/cupboard.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2400, dailyProtein: 150, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const MARKER = "xyzzyplugh"; // words typed into the cupboard that must never appear in any request

async function newPage({ width = 390, prefs = {}, store } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
  const data = JSON.stringify({ v: 1, data: { ...baseSettings, preferences: { ...baseSettings.preferences, ...prefs } } });
  await ctx.addInitScript(([s, c]) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); if (c && !localStorage.getItem("mm.v1.cupboardItems")) localStorage.setItem("mm.v1.cupboardItems", c); }, [data, store ? JSON.stringify({ v: 1, data: store }) : null]);
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() ?? "" }));
  await page.route("**/assets.sainsburys-groceries.co.uk/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  return { ctx, page, requests };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("mm.v1.cupboardItems") ?? "null"); } catch { return "bad"; } });
const items = async (page) => (await stored(page))?.data ?? [];
const results = (page) => page.getByRole("region", { name: "Recipes you can make" });
const cards = (page) => results(page).locator("> ul > li");
const youHave = async (card) => { const m = /You have (\d+) of (\d+) ingredients · Serves (\d+)/.exec((await card.innerText()).replace(/\s+/g, " ")); return m ? { have: +m[1], total: +m[2], serves: +m[3] } : null; };
const noSideways = async (page, where) => { const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); expect(m.sw <= m.cw + 1, `${where}: sideways scroll ${m.sw} > ${m.cw}`); };
const choice = (page, name) => page.getByRole("button", { name, exact: true });
const goCupboard = async (page) => { await page.goto(BASE + "/app/recipes/cupboard"); await page.getByRole("heading", { level: 1, name: "Cook from my cupboard" }).waitFor(); };

await step("Recipes has a 'Cook from my cupboard' card beside the shopping-list one; it opens the screen, with Back, and Recipes stays the lit tab", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/app/recipes");
  const card = page.getByRole("link", { name: /Cook from my cupboard/ });
  await card.waitFor();
  expect((await card.boundingBox()).height >= 44, "the card is at least 44 px high");
  expect((await card.innerText()).includes("Say what you have and see what you can cook"), "its words");
  await card.click();
  await page.waitForURL("**/app/recipes/cupboard");
  await page.getByRole("heading", { level: 1, name: "Cook from my cupboard" }).waitFor();
  expect((await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" }).getAttribute("aria-current")) === "page", "Recipes is the open tab");
  await page.getByRole("link", { name: /Back/ }).first().click();
  await page.getByRole("heading", { level: 1, name: "What's cooking today?" }).waitFor();
  await ctx.close();
});

await step("an empty cupboard: the common things and the store cupboard are offered, nothing is ranked yet", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await page.getByText("Nothing here yet.").waitFor();
  await page.getByText("Tap the things you have above.").waitFor();
  expect((await results(page).count()) === 0, "no recipes section while the cupboard is empty");
  const common = await page.getByRole("heading", { name: "What do you have?" }).locator("xpath=..").locator("button[aria-pressed]").count();
  expect(common >= 30, `common things and store-cupboard choices offered, got ${common}`);
  for (const name of ["Chicken breast fillets", "Free-range eggs", "Rice", "Onion", "Salt", "Ground cumin"]) await choice(page, name).waitFor();
  await ctx.close();
});

await step("tapping things adds them with a rough amount ('Some', a staple has none); tapping again takes it out; the list is kept on the device", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await choice(page, "Chicken breast fillets").click();
  await choice(page, "Rice").click();
  await choice(page, "Salt").click();
  await page.getByRole("heading", { name: /^Your cupboard · 3$/ }).waitFor();
  let saved = await items(page);
  expect(saved.map((i) => i.id).join() === "k:chicken,k:rice,k:salt", `three kept, got ${saved.map((i) => i.id)}`);
  expect(saved[0].level === "some" && saved[2].level === "plenty", "some for chicken, plenty for salt");
  expect((await choice(page, "Chicken breast fillets").getAttribute("aria-pressed")) === "true", "the tile shows it is in");
  const list = page.getByRole("heading", { name: /Your cupboard/ }).locator("xpath=..").locator("ul > li");
  expect((await list.count()) === 3, "three cards");
  expect((await list.nth(2).getByRole("group").count()) === 0, "salt has no amount to choose");
  await choice(page, "Rice").click();
  await page.getByRole("heading", { name: /^Your cupboard · 2$/ }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: /^Your cupboard · 2$/ }).waitFor();
  await ctx.close();
});

await step("a rough amount: 'A little' feeds one person, 'Some' two, 'Plenty' as many as the recipe is written for; every recipe says how many it feeds", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await choice(page, "Chicken breast fillets").click();
  await results(page).waitFor();
  await page.getByText(/recipes use something in your cupboard/).waitFor();
  const group = page.getByRole("group", { name: "How much Chicken breast fillets?" });
  await group.getByRole("button", { name: "A little" }).click();
  await cards(page).first().waitFor();
  const all = async () => { const out = []; for (const c of await cards(page).all()) out.push(await youHave(c)); return out; };
  let rows = await all();
  expect(rows.length >= 3 && rows.every((r) => r && r.serves === 1), `a little chicken feeds 1 everywhere: ${JSON.stringify(rows.slice(0, 4))}`);
  await group.getByRole("button", { name: "Some" }).click();
  await page.waitForTimeout(150);
  rows = await all();
  expect(rows.every((r) => r && r.serves >= 1 && r.serves <= 2) && rows.some((r) => r.serves === 2), `some chicken feeds up to 2: ${JSON.stringify(rows.slice(0, 4))}`);
  await group.getByRole("button", { name: "Plenty" }).click();
  await page.waitForTimeout(150);
  rows = await all();
  expect(rows.some((r) => r.serves >= 3), `plenty feeds as many as the recipe is written for: ${JSON.stringify(rows.slice(0, 6))}`);
  expect((await group.getByRole("button", { name: "Plenty" }).getAttribute("aria-pressed")) === "true", "Plenty is the pressed one");
  await ctx.close();
});

await step("an exact amount: type an amount, − and + step it, the number box takes typing, and the people it feeds follow", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await choice(page, "Chicken breast fillets").click();
  await page.getByRole("button", { name: "Type an amount" }).click();
  const box = page.getByLabel("Amount of Chicken breast fillets in g");
  expect((await box.inputValue()) === "250", "starts at 250 g");
  await page.getByRole("button", { name: "More Chicken breast fillets" }).click();
  expect((await box.inputValue()) === "300", "+ adds 50 g");
  await page.getByRole("button", { name: "Less Chicken breast fillets" }).click();
  await page.getByRole("button", { name: "Less Chicken breast fillets" }).click();
  expect((await box.inputValue()) === "200", "− takes 50 g");
  await box.fill("");
  expect((await box.inputValue()) === "", "the box can be emptied to type a new number");
  await box.fill("2000");
  await page.waitForTimeout(100);
  expect(JSON.stringify((await items(page))[0]) === JSON.stringify({ id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", qty: 2000 }), "2000 g kept");
  await box.fill("30");
  await page.waitForTimeout(100);
  await cards(page).first().waitFor();
  const small = await youHave(cards(page).first());
  expect(small.serves === 1, `30 g feeds one at most (not enough for even that), got ${small.serves}`);
  expect((await cards(page).first().textContent()).includes("(you have some)"), "and the recipe says you have some, not enough");
  await box.fill("1500");
  await page.waitForTimeout(100);
  const big = [];
  for (const c of await cards(page).all()) big.push((await youHave(c)).serves);
  expect(big.some((n) => n >= 3), `1.5 kg feeds a table: ${big}`);
  await page.getByRole("group", { name: "How much Chicken breast fillets?" }).getByRole("button", { name: "Some" }).click();
  expect((await page.getByLabel("Amount of Chicken breast fillets in g").count()) === 0, "a rough amount takes the number away");
  // whole pieces for a kind that comes in pieces
  await choice(page, "Free-range eggs").click();
  await page.getByRole("group", { name: "How much Free-range eggs?" }).getByRole("button", { name: "Type an amount" }).click();
  const eggs = page.getByLabel("Amount of Free-range eggs in eggs");
  expect((await eggs.inputValue()) === "4", "eggs start at 4");
  await page.getByRole("button", { name: "More Free-range eggs" }).click();
  expect((await eggs.inputValue()) === "5", "+ adds one egg");
  const saved = (await items(page)).find((i) => i.id === "k:eggs");
  expect(saved.qty === 5 && saved.pieces === true, "kept as 5 whole eggs: " + JSON.stringify(saved));
  await ctx.close();
});

await step("the ranking: what you have, what is still to buy, the best match first; swaps; store-cupboard things to check", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  for (const n of ["Chicken breast fillets", "Rice", "Onion", "Chickpeas in water"]) await choice(page, n).click();
  for (const n of ["Chicken breast fillets", "Rice", "Onion", "Chickpeas in water"]) await page.getByRole("group", { name: `How much ${n}?` }).getByRole("button", { name: "Plenty" }).click();
  await cards(page).first().waitFor();
  const first = cards(page).first();
  await first.getByText("Best match").waitFor();
  expect((await cards(page).count()) === 6, "six at a time");
  const rows = [];
  for (const c of await cards(page).all()) rows.push(await youHave(c));
  expect(rows.every((r) => r && r.have >= 1 && r.have <= r.total), "every card says how many it has: " + JSON.stringify(rows));
  const firstText = (await first.textContent()).toLowerCase();
  expect(/still to buy|your cupboard has everything this recipe uses\./.test(firstText), "says what is left to buy, or that nothing is");
  const count = Number(/^(\d+) recipes use something in your cupboard$/.exec((await page.getByText(/recipes use something in your cupboard/).innerText()).trim())?.[1]);
  expect(count > 6, `more than a page of recipes, got ${count}`);
  await page.getByRole("button", { name: new RegExp(`^Show more recipes \\(${count - 6} more\\)$`) }).click();
  expect((await cards(page).count()) === Math.min(12, count), "six more shown");
  // a swap says what the cupboard's own thing stands in for, and it is only ever one of the four things put in
  const swaps = await results(page).getByText(/^Instead of .+ you have .+\.$/).allInnerTexts();
  expect(swaps.every((t) => /you have (Chicken breast fillets|Rice|Onion|Chickpeas in water)\.$/.test(t)), "a swap names something from the cupboard: " + swaps.slice(0, 3).join(" | "));
  await ctx.close();
});

await step("opening a recipe starts it at the people the cupboard feeds, with the swaps in, as the recipe has it", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await choice(page, "Chicken breast fillets").click();
  await page.getByRole("group", { name: "How much Chicken breast fillets?" }).getByRole("button", { name: "A little" }).click();
  await cards(page).first().waitFor();
  const first = cards(page).first();
  const name = (await first.locator("a").first().innerText()).split("\n")[0].trim();
  await first.getByRole("link", { name: "See the recipe" }).click();
  await page.waitForURL(/\/app\/recipes\/view\?id=.*&n=1&w=1/);
  await page.getByRole("heading", { level: 1, name }).waitFor();
  await page.getByText("Serves 1", { exact: true }).waitFor();
  expect((await page.getByRole("button", { name: "Fewer servings" }).isDisabled()), "one person: the − is off");
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByText("Serves 2", { exact: true }).waitFor();
  // the card's own title link goes to the same place
  await page.goBack();
  await cards(page).first().waitFor();
  await cards(page).first().locator("a").first().click();
  await page.waitForURL(/&n=1&w=1/);
  // an address with rubbish in it is ignored, not trusted
  await page.goto(BASE + "/app/recipes/view?id=chicken-curry&r=sainsburys&n=99&w=yes&s=%3Cb%3E:x");
  await page.getByRole("heading", { level: 1, name: /Chicken curry/ }).waitFor();
  expect((await page.getByText(/^Serves \d+$/).first().innerText()) !== "Serves 99", "99 people refused");
  await ctx.close();
});

await step("'Add the other N to my list' puts what is missing on the shopping list (the recipe's own pick, enough packs), not what the cupboard covers", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await choice(page, "Chicken breast fillets").click();
  await page.getByRole("group", { name: "How much Chicken breast fillets?" }).getByRole("button", { name: "Plenty" }).click();
  await cards(page).first().waitFor();
  let card = null, n = 0;
  for (const c of await cards(page).all()) { const b = c.getByRole("button", { name: /^Add the other \d+ to my list$/ }); if (await b.count()) { card = c; n = Number(/\d+/.exec(await b.innerText())[0]); break; } }
  expect(card && n >= 2, "a recipe with several things still to buy");
  expect((await card.textContent()).toLowerCase().includes("still to buy"), "the card names what is still to buy");
  await card.getByRole("button", { name: /^Add the other \d+ to my list$/ }).click();
  await card.getByText(new RegExp(`^Added ${n} products to your Sainsbury's list\\.$`)).waitFor();
  const list = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []);
  expect(list.length === n, `${n} products on the list, got ${list.length}`);
  expect(list.every((i) => i.retailer === "sainsburys" && i.shopId && i.qty >= 1 && typeof i.price === "number"), "each is a Sainsbury's product with its price");
  expect(!list.some((i) => /chicken breast/i.test(i.name) && !/sauce|stock/i.test(i.name)), "the chicken the cupboard covers isn't added: " + list.map((i) => i.name).join(" | "));
  await ctx.close();
});

await step("diet and allergies as on Recipes: a vegetarian isn't offered meat or fish, a chicken kept earlier finds nothing, and the recipes left out are counted", async () => {
  const { ctx, page } = await newPage({ prefs: { vegetarianOnly: true }, store: [{ id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", level: "plenty" }] });
  await goCupboard(page);
  await page.getByText("No recipe uses these yet.").waitFor();
  expect((await choice(page, "Chicken breast fillets").count()) === 0 && (await choice(page, "5% fat beef mince").count()) === 0 && (await choice(page, "Salmon fillets").count()) === 0, "no meat or fish to pick");
  await choice(page, "Free-range eggs").waitFor();
  await choice(page, "Rice").click();
  await page.getByRole("group", { name: "How much Rice?" }).getByRole("button", { name: "Plenty" }).click();
  await cards(page).first().waitFor();
  const texts = [];
  for (const c of await cards(page).all()) texts.push((await c.innerText()).toLowerCase());
  expect(texts.length >= 3 && !texts.some((t) => /chicken|beef|salmon|tuna|bacon|\bham\b|prawn|mince/.test(t)), "no meat or fish on any card: " + texts.find((t) => /chicken|beef|salmon|tuna|bacon|ham|prawn|mince/.test(t)));
  await page.getByText(/recipes are left out for your diet\.$/).waitFor();
  await ctx.close();
  // an allergy: no milk or cheese to pick, none of them in a recipe
  const b = await newPage({ prefs: { avoidAllergens: ["milk"] } });
  await goCupboard(b.page);
  expect((await choice(b.page, "Semi-skimmed milk").count()) === 0 && (await choice(b.page, "Mature cheddar").count()) === 0, "no milk or cheese to pick");
  await choice(b.page, "Rice").click();
  await b.page.getByRole("group", { name: "How much Rice?" }).getByRole("button", { name: "Plenty" }).click();
  await cards(b.page).first().waitFor();
  const t2 = [];
  for (const c of await cards(b.page).all()) t2.push((await c.innerText()).toLowerCase());
  expect(!t2.some((t) => /milk|cheddar|mozzarella|yogurt|cheese|butter/.test(t)), "no milk-based ingredient on any card");
  await b.ctx.close();
});

await step("search finds kinds by their words; words that match nothing can still be added, matched by name only, with no amount to type", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  const search = page.getByLabel("Search, e.g. chicken or rice");
  await search.fill("mince");
  await choice(page, "5% fat beef mince").waitFor();
  await choice(page, "5% fat beef mince").click();
  await search.fill("tomato");
  await choice(page, "Chopped tomatoes").waitFor();
  await choice(page, "Cherry tomatoes").waitFor();
  await search.fill("zz qq");
  await page.getByText("Nothing in our list matches.").first().waitFor();
  await page.getByRole("button", { name: "Add “zz qq” anyway" }).click();
  expect((await search.inputValue()) === "", "the box is cleared");
  const card = page.getByRole("heading", { name: /Your cupboard/ }).locator("xpath=..").locator("ul > li").filter({ hasText: "zz qq" });
  await card.getByText("Matched by its name only.").waitFor();
  expect((await card.getByRole("button", { name: "Type an amount" }).count()) === 0, "typed words have a rough amount only");
  await search.fill("zz qq");
  expect((await page.getByRole("button", { name: "Add “zz qq” anyway" }).count()) === 0, "not offered twice");
  await search.fill("x");
  expect((await page.getByRole("button", { name: /anyway/ }).count()) === 0, "one letter isn't words");
  // the 'Done' that puts the keyboard away is in the box while it is in use (like every search box)
  await search.focus();
  await page.getByRole("button", { name: "Done" }).first().waitFor();
  await card.getByRole("button", { name: "Remove zz qq" }).click();
  expect((await items(page)).every((i) => i.name !== "zz qq"), "removed");
  await ctx.close();
});

await step("nothing about the cupboard is sent anywhere: no request but plain page and data fetches, none carries what was typed, none is a POST; it is not synced", async () => {
  const { ctx, page, requests } = await newPage();
  await goCupboard(page);
  const search = page.getByLabel("Search, e.g. chicken or rice");
  await search.fill(MARKER + " bean");
  await page.getByRole("button", { name: `Add “${MARKER} bean” anyway` }).click();
  await choice(page, "Chicken breast fillets").click();
  await choice(page, "Salt").click();
  await page.getByRole("button", { name: "Type an amount" }).first().click();
  await cards(page).first().waitFor();
  await cards(page).first().getByRole("link", { name: "See the recipe" }).click();
  await page.waitForURL(/\/app\/recipes\/view\?id=/);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.goBack();
  await page.waitForURL("**/app/recipes/cupboard");
  await cards(page).first().waitFor();
  await page.waitForTimeout(500);
  const origin = new URL(BASE).origin;
  const odd = requests.filter((r) => r.method !== "GET" || r.url.includes("/api/") || r.url.toLowerCase().includes(MARKER) || r.body.toLowerCase().includes(MARKER) || /cupboard/i.test(r.url.replace(/^https?:\/\/[^/]+\/app\/recipes\/cupboard\/?(\?.*)?$/, "")));
  expect(odd.length === 0, "unexpected requests: " + odd.map((r) => r.method + " " + r.url).join(" ; "));
  const hosts = new Set(requests.map((r) => new URL(r.url).origin));
  const foreign = [...hosts].filter((h) => h !== origin && !h.includes("assets.sainsburys-groceries.co.uk"));
  expect(foreign.length === 0, "only our own site (and the shop's pictures) were asked: " + foreign.join(", "));
  // not one of the synced stores: nothing in the sync data, and the account code keeps it with the water and reminders
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.includes("mm.v1.cupboardItems"), "kept in its own device-only key");
  expect(!(await page.evaluate(() => (localStorage.getItem("mm.v1.syncMeta") ?? "").includes("cupboardItems"))), "not in the sync record");
  await ctx.close();
});

await step("Settings > Clear data on this device empties the cupboard", async () => {
  const { ctx, page } = await newPage();
  await goCupboard(page);
  await choice(page, "Chicken breast fillets").click();
  await choice(page, "Rice").click();
  expect((await items(page)).length === 2, "two kept");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Clear data on this device" }).click();
  await page.getByRole("button", { name: "Clear everything" }).click();
  await page.waitForTimeout(300);
  expect(((await items(page)).length ?? 0) === 0, "emptied");
  await goCupboard(page);
  await page.getByText("Nothing here yet.").waitFor();
  await ctx.close();
});

await step("a damaged or hand-edited list is read as far as it is good: unknown kinds, scripts and numbers out of range are dropped", async () => {
  const { ctx, page } = await newPage({ store: [{ kind: "chicken", qty: 1e9 }, { kind: "nope", level: "some" }, { kind: "", name: "<img src=x onerror=alert(1)>" }, { kind: "", name: "Baked beans", level: "plenty" }, 7, null] });
  await goCupboard(page);
  await page.getByRole("heading", { name: /^Your cupboard · 2$/ }).waitFor();
  const list = page.getByRole("heading", { name: /Your cupboard/ }).locator("xpath=..").locator("ul > li");
  expect((await list.nth(0).innerText()).includes("Chicken breast fillets"), "the chicken stays, with a rough amount");
  expect((await page.getByRole("group", { name: "How much Chicken breast fillets?" }).getByRole("button", { name: "Some" }).getAttribute("aria-pressed")) === "true", "'Some' for a number out of range");
  expect((await list.nth(1).innerText()).includes("Baked beans"), "the typed words stay");
  await ctx.close();
});

for (const v of [{ label: "390 px", width: 390, scale: 1 }, { label: "360 px", width: 360, scale: 1 }, { label: "360 px, Extra large text", width: 360, scale: 2 }]) {
  await step(`at ${v.label}: no sideways scroll, every control at least 44 px, axe reports 0`, async () => {
    const { ctx, page } = await newPage({ width: v.width, store: [
      { id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", qty: 300 },
      { id: "k:eggs", kind: "eggs", name: "Free-range eggs", qty: 4, pieces: true },
      { id: "k:rice", kind: "rice", name: "Rice", level: "plenty" },
      { id: "k:salt", kind: "salt", name: "Salt", level: "plenty" },
      { id: "w:a very long thing someone typed in at the shop", kind: "", name: "a very long thing someone typed in at the shop", level: "some" },
    ] });
    await goCupboard(page);
    if (v.scale !== 1) await page.addStyleTag({ content: `html { font-size: ${v.scale * 100}% !important; }` });
    await cards(page).first().waitFor();
    await page.waitForTimeout(300);
    await noSideways(page, "cupboard screen");
    const small = await page.evaluate(() => [...document.querySelectorAll("main button, main a, main input, main label")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 43.5 && !e.closest("nav") && !(e.tagName === "LABEL" && e.querySelector("input")); }).map((e) => `${e.tagName} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().height)}px`));
    expect(small.length === 0, "controls under 44 px: " + small.slice(0, 4).join("; "));
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
    expect(violations.length === 0, "axe: " + violations.join(", "));
    if (v.scale === 1) {
      await page.goto(BASE + "/app/recipes");
      await page.getByRole("link", { name: /Cook from my cupboard/ }).waitFor();
      await noSideways(page, "Recipes with the new card");
    }
    await ctx.close();
  });
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
