// Pip's pick on Compare (founder 2026-11-17: "use the AI to say what you think personally is better out of the two ... if someone compares the same two products, you
// should have saved what the AI thinks"). Needs a build with NEXT_PUBLIC_COMPARE_PICK=1. The API is faked here (no key, no money): the fake answers like the real route
// does, in the CANONICAL order of the two items, and counts how often it is asked. Checks: the card under the table, "Pip is thinking…", the lines worked out from the
// figures, a pair already answered never asks again (other order, reload, a third item and back), a failure with Try again, offline and back online, two different kinds
// of label, a tie, two dishes, what is sent, Clear data, no good/bad/healthy anywhere, 390 / 360 px and Extra large text, axe.
//   BASE=http://localhost:3105 SHOTS=/some/dir node comparepick.mjs
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settingsFor = (extra = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, ...extra } });

const beans = (gtin, name, kcal, protein, sugars, price, perKg) => ({ gtin, name, brand: name.split(" ")[0], size: "415 g", per: "g", kcal, protein, carbs: 12.5, sugars, fat: 0.3, salt: 0.6, allergens: null, category: "cupboard", price: { amount: price, url: "https://www.aldi.co.uk/product/1", checkedOn: "2026-10-09", perUnit: { amount: perKg, unit: "per kg" } } });
const aldi = { v: 1, retailer: "aldi", name: "Aldi", generatedOn: "2026-10-09", source: "t", products: [
  beans("5000157024671", "Heinz Baked Beanz", 78, 4.7, 4.7, 1.4, 3.37),
  beans("4088600120005", "Corale Baked Beans", 79, 4.9, 4.1, 0.38, 0.92),
  beans("5000157070708", "Heinz Baked Beanz Reduced Sugar", 65, 4.8, 2.6, 1.4, 3.37),
] };
const manifest = { v: 1, generatedOn: "2026-10-09", source: "Open Food Facts contributors", retailers: [{ id: "aldi", name: "Aldi", file: "aldi.json", count: 3, sha256: "" }], categories: [{ id: "cupboard", label: "Cupboard" }] };

const SAY = "Pip would reach for the one with more protein for its calories.";
const TIE = "These are very close for your goal.";
/** The same ordering the app uses for a pair (lib/mm/comparePick.ts signature), so the fake can answer in canonical order like the real route. */
const sig = (i) => { const n = i.numbers; return JSON.stringify([i.key, i.name, i.from, i.basis, i.note ?? null, n.kcal, n.protein, n.carbs, n.sugars, n.fat, n.saturates, n.fibre, n.salt, i.perKg]); };

function fakeApi(page, state) {
  const calls = [];
  page.route("**/api/v1/compare/pick", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ status: 204, body: "" });
    const body = JSON.parse(req.postData() ?? "{}");
    calls.push(body);
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    if (state.mode === "fail") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "no_pick" }) });
    const [x, y] = body.items;
    const canon = sig(x) > sig(y) ? [y, x] : [x, y];
    if (state.mode === "tie") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pick: { pick: "tie", sentence: TIE, reasons: [] } }) });
    const ppk = (i) => i.numbers.protein / i.numbers.kcal;
    const ahead = ppk(canon[0]) >= ppk(canon[1]) ? 0 : 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pick: { pick: ahead, sentence: SAY, reasons: ["moreProteinPerKcal", "fewerKcal", "lessSugar", "cheaperProtein"] } }) });
  });
  return calls;
}

async function newPage({ seed, extra, scale = 1, width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", colorScheme: "light" });
  await ctx.addInitScript(([s, c]) => {
    if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s);
    if (c && !localStorage.getItem("mm.v1.compare")) localStorage.setItem("mm.v1.compare", c);
  }, [settingsFor(extra), seed ? JSON.stringify({ v: 1, data: seed }) : null]);
  const page = await ctx.newPage();
  const state = { mode: "ok", delay: 0 };
  const calls = fakeApi(page, state);
  await page.route("**/groceries/groceries-manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/groceries/aldi.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(aldi) }));
  await page.route("**/images.openfoodfacts.org/**", (r) => r.abort());
  void scale;
  return { ctx, page, state, calls };
}
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const card = (page) => page.locator("section[aria-labelledby=pick-heading]");
const add = async (page, query, name) => {
  await page.getByLabel("Add a product").fill(query);
  await page.getByRole("button", { name: new RegExp(`^Add ${name}$`) }).click();
};
const flush = (page, ms = 900) => page.waitForTimeout(ms);

const food = (id, name, kcal, protein, o = {}) => ({
  key: `food:aldi:${id}`, kind: "food", name, from: "Aldi", fromId: "aldi", href: `/app/groceries/shop/item?r=aldi&id=${id}`, basis: "g", source: "label", addedAt: "2026-11-17T10:00:00.000Z",
  numbers: { kcal, protein, carbs: 12, sugars: 4, fat: 0.4, saturates: 0.1, fibre: 3.8, salt: 0.6 }, ...o,
});
const dish = (id, name, kcal, protein) => ({
  key: `dish:kfc:${id}`, kind: "dish", name, from: "KFC", fromId: "kfc", href: `/app/item?chain=kfc&item=${id}`, basis: "serving", note: "1 burger", source: "restaurant", addedAt: "2026-11-17T10:00:00.000Z",
  numbers: { kcal, protein, carbs: 43, sugars: null, fat: 19, saturates: null, fibre: null, salt: 2.1 },
});

await step("two products: Pip is thinking, then the card names one, says why in lines worked out from the figures; one request holds only items, goal and diet", async () => {
  const { ctx, page, state, calls } = await newPage();
  state.delay = 1200;
  await page.goto(BASE + "/app/compare?tab=food");
  await page.getByText("Nothing to compare yet").waitFor();
  await add(page, "baked", "Heinz Baked Beanz");
  await page.getByText("Add at least one more to see them side by side.").waitFor();
  expect((await card(page).count()) === 0, "no card with one item");
  await add(page, "baked", "Corale Baked Beans");
  await page.getByRole("heading", { name: "Side by side" }).waitFor();
  await page.getByText("Pip is thinking…").waitFor({ timeout: 5000 });
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  const text = (await card(page).innerText()).replace(/\s+/g, " ");
  expect(text.includes("Corale Baked Beans"), "names the pick: " + text);
  expect(text.includes("0.2 g more protein per 100 kcal"), "ppk line: " + text); // 4.9/79 vs 4.7/78 per 100 kcal = 6.20 vs 6.03
  expect(text.includes("0.6 g less sugar per 100 g"), "sugar line: " + text);
  expect(text.includes("£5.29 less per 100 g of protein"), "price line: " + text); // 0.92x10/4.9 = 1.88 vs 3.37x10/4.7 = 7.17
  expect(!text.includes("fewer kcal"), "an unsupported reason (Corale has more kcal) is not shown: " + text);
  expect(text.includes("Pip's pick is for your goal (Maintain) and only looks at the numbers on the labels."), "goal line: " + text);
  expect(!/\d/.test(SAY) && !text.includes(SAY + " " + SAY), "the sentence has no digits");
  expect(calls.length === 1, "one request: " + calls.length);
  const sent = calls[0];
  expect(Object.keys(sent).sort().join() === "diet,goal,items" && sent.goal === "maintain" && sent.diet.length === 0, "sent only items, goal and diet: " + Object.keys(sent));
  expect(!JSON.stringify(sent).match(/allerg|email|user|photo|href/i), "nothing about the person or the page: " + JSON.stringify(sent).slice(0, 200));
  expect(sent.items.every((i) => Object.keys(i).sort().join() === "basis,from,key,kind,name,numbers,perKg"), "each item holds only name, shop, basis, figures and price per kg");
  // the card sits under the table and before the footnote
  const order = await page.evaluate(() => {
    const t = document.querySelector("table")?.getBoundingClientRect().bottom ?? 0;
    const c = document.querySelector("section[aria-labelledby=pick-heading]")?.getBoundingClientRect().top ?? 0;
    return c >= t;
  });
  expect(order, "under the table");
  await ctx.close();
});

await step("a pair already answered never asks again: the other order, a reload, a third item and back", async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(BASE + "/app/compare?tab=food");
  await add(page, "baked", "Heinz Baked Beanz");
  await add(page, "baked", "Corale Baked Beans");
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  expect(calls.length === 1, "first time asks: " + calls.length);
  // the other order: take Heinz off and add it again, so Corale is first
  await page.getByRole("button", { name: "Remove Heinz Baked Beanz" }).click();
  await add(page, "baked", "Heinz Baked Beanz");
  await card(page).getByText(SAY).waitFor({ timeout: 5000 });
  expect((await card(page).innerText()).includes("Corale Baked Beans"), "still names Corale in the other order");
  expect((await card(page).innerText()).includes("0.2 g more protein per 100 kcal"), "same figures in the other order");
  await flush(page);
  expect(calls.length === 1, "no new request for the other order: " + calls.length);
  // a reload: the phone remembers
  await page.reload();
  await card(page).getByText(SAY).waitFor({ timeout: 5000 });
  await flush(page);
  expect(calls.length === 1, "no new request after a reload: " + calls.length);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.comparePicks") ?? "null"));
  expect(kept?.data?.length === 1 && /^[0-9a-f]{64}$/.test(kept.data[0].key) && kept.data[0].sentence === SAY, "kept on the phone: " + JSON.stringify(kept)?.slice(0, 160));
  // three items: Pip picks between two; back to two: the card returns from what is kept
  await add(page, "baked", "Heinz Baked Beanz Reduced Sugar");
  await card(page).getByText("Pip picks between two items. Remove some to see Pip's pick.").waitFor();
  expect((await card(page).getByText(SAY).count()) === 0, "no pick with three");
  await page.getByRole("button", { name: "Remove Heinz Baked Beanz Reduced Sugar" }).click();
  await card(page).getByText(SAY).waitFor({ timeout: 5000 });
  await flush(page);
  expect(calls.length === 1, "no new request going back to two: " + calls.length);
  await ctx.close();
});

await step("a failure says so quietly and Try again asks once more", async () => {
  const { ctx, page, state, calls } = await newPage();
  state.mode = "fail";
  await page.goto(BASE + "/app/compare?tab=food");
  await add(page, "baked", "Heinz Baked Beanz");
  await add(page, "baked", "Heinz Baked Beanz Reduced Sugar");
  await card(page).getByText("Pip couldn't pick just now.").waitFor({ timeout: 10000 });
  const again = card(page).getByRole("button", { name: "Try again" });
  const box = await again.boundingBox();
  expect(box && box.height >= 44, "Try again is at least 44 px tall: " + box?.height);
  expect((await card(page).getByText(SAY).count()) === 0, "no pick shown");
  state.mode = "ok";
  await again.click();
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  expect(calls.length === 2, "asked twice: " + calls.length);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.comparePicks") ?? "null")?.data?.length)) === 1, "a failure is not kept, the success is");
  await ctx.close();
});

await step("offline: a quiet line, nothing breaks, and the pick arrives when the network is back", async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(BASE + "/app/compare?tab=food");
  await add(page, "baked", "Heinz Baked Beanz");
  await page.getByLabel("Add a product").fill("baked");
  await page.getByRole("button", { name: /^Add Corale Baked Beans$/ }).waitFor();
  await ctx.setOffline(true);
  await page.getByRole("button", { name: /^Add Corale Baked Beans$/ }).click();
  await card(page).getByText("You're offline, so Pip can't pick right now.").waitFor({ timeout: 10000 });
  expect(calls.length === 0, "nothing was sent while offline: " + calls.length);
  await page.getByRole("heading", { name: "Side by side" }).waitFor(); // the table still works
  await ctx.setOffline(false);
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  expect(calls.length === 1, "asked once the network came back: " + calls.length);
  await ctx.close();
});

await step("labels that count different things are not picked between, and nothing is sent", async () => {
  const { ctx, page, calls } = await newPage({ seed: [food("a", "Oat drink", 45, 1), food("b", "Tinned beans", 80, 5, { basis: "g" })].map((i, n) => (n === 0 ? { ...i, basis: "ml" } : i)) });
  await page.goto(BASE + "/app/compare?tab=food");
  await card(page).getByText("These labels count different things, so Pip can't pick between them.").waitFor({ timeout: 5000 });
  await flush(page);
  expect(calls.length === 0, "nothing sent: " + calls.length);
  await ctx.close();
});

await step("a tie is said as a tie, with no item named and no lines", async () => {
  const { ctx, page, state } = await newPage({ seed: [food("a", "Tinned beans", 80, 5), food("b", "Tinned peas", 81, 5)] });
  state.mode = "tie";
  await page.goto(BASE + "/app/compare?tab=food");
  await card(page).getByText(TIE).waitFor({ timeout: 10000 });
  const text = (await card(page).innerText()).replace(/\s+/g, " ");
  expect(/a tie for your goal/i.test(text), "says tie: " + text);
  expect((await card(page).locator("li").count()) === 0, "no reason lines for a tie");
  await ctx.close();
});

await step("two dishes: per serving, the restaurant's own numbers, a different sentence under it", async () => {
  const { ctx, page, calls } = await newPage({ seed: [dish("x", "Zinger Burger", 463, 29), dish("y", "Tower Burger", 640, 31)] });
  await page.goto(BASE + "/app/compare?tab=dish");
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  const text = (await card(page).innerText()).replace(/\s+/g, " ");
  expect(text.includes("Zinger Burger"), "names the dish with the better protein for its calories: " + text); // 6.26 vs 4.84 per 100 kcal
  expect(text.includes("1.4 g more protein per 100 kcal") && text.includes("177 fewer kcal per serving"), "dish lines: " + text);
  expect(text.includes("only looks at the numbers each restaurant publishes"), "dish footnote: " + text);
  expect(calls.length === 1 && calls[0].items.every((i) => i.kind === "dish" && i.basis === "serving"), "dishes sent as dishes");
  await ctx.close();
});

await step("a diet and a goal are sent as words, and a different goal is a new question", async () => {
  const { ctx, page, calls } = await newPage({ extra: { goal: "buildMuscle", preferences: { vegetarianOnly: true, noPork: false, noBeef: false, avoidAllergens: ["peanuts"] } }, seed: [food("a", "Tinned beans", 80, 5), food("b", "Tinned peas", 60, 3)] });
  await page.goto(BASE + "/app/compare?tab=food");
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  expect(calls[0].goal === "buildMuscle" && calls[0].diet.join() === "vegetarian", "goal and diet words: " + JSON.stringify([calls[0].goal, calls[0].diet]));
  expect(!JSON.stringify(calls[0]).includes("peanut"), "allergies are not sent");
  expect((await card(page).innerText()).includes("(Build muscle)"), "the card names the goal");
  await ctx.close();
});

await step("Clear data on this device forgets what Pip answered", async () => {
  const { ctx, page } = await newPage({ seed: [food("a", "Tinned beans", 80, 5), food("b", "Tinned peas", 60, 3)] });
  await page.goto(BASE + "/app/compare?tab=food");
  await card(page).getByText(SAY).waitFor({ timeout: 10000 });
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.comparePicks") ?? "null")?.data?.length)) === 1, "an answer is kept");
  await page.goto(BASE + "/app/settings");
  await page.getByRole("button", { name: "Clear data on this device", exact: true }).click();
  await page.getByRole("button", { name: "Clear everything", exact: true }).click();
  await page.waitForTimeout(500);
  const left = await page.evaluate(() => { const v = localStorage.getItem("mm.v1.comparePicks"); return v === null ? 0 : JSON.parse(v).data?.length ?? 0; });
  expect(left === 0, "nothing left: " + left);
  await ctx.close();
});

await step("never good, bad or healthy; the card fits at 390 px, 360 px and Extra large text; axe finds nothing", async () => {
  for (const [label, opts] of [["390", {}], ["360", { width: 360 }], ["xlarge", { extra: { textSize: "xlarge" } }]]) {
    const { ctx, page } = await newPage({ ...opts, seed: [food("a", "Heinz Baked Beanz", 78, 4.7, { numbers: { kcal: 78, protein: 4.7, carbs: 12, sugars: 4.7, fat: 0.4, saturates: null, fibre: 3.8, salt: 0.6 }, price: 1.4, unitPrice: 3.37, unit: "per kg" }), food("b", "Corale Baked Beans", 79, 4.9, { numbers: { kcal: 79, protein: 4.9, carbs: 12, sugars: 4.1, fat: 0.4, saturates: null, fibre: 3.8, salt: 0.6 }, price: 0.38, unitPrice: 0.92, unit: "per kg" })] });
    await page.goto(BASE + "/app/compare?tab=food");
    await card(page).getByText(SAY).waitFor({ timeout: 10000 });
    expect((await page.getByText(/\b(good|bad|healthy|unhealthy)\b/i).count()) === 0, `${label}: never good, bad or healthy`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over <= 1, `${label}: no sideways scroll (${over})`);
    await card(page).scrollIntoViewIfNeeded();
    if (SHOTS) await card(page).screenshot({ path: `${SHOTS}/pips-pick-${label}.png` });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/pips-pick-${label}-page.png`, fullPage: true });
    if (label === "390") {
      await page.addScriptTag({ path: AXE });
      const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }));
      expect(result.violations.length === 0, result.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", "));
    }
    await ctx.close();
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
