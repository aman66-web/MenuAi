// Home browse by type, the A-Z jump, and long-menu tools on a chain page (in-menu search, section chips, trimmed
// sections, the Best for you shortcut), plus the filter caution line and search's recent searches. Real UK data.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3101";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
await ctx.addInitScript(() => {
  if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } }));
});
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !m.text().includes("blocked by Playwright")) problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log("PASS", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); await page.screenshot({ path: `${SHOTS}FAIL-${name.replace(/\W+/g, "-")}.png` }); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

await step("Home: honest count, type chips, and filtering by type", async () => {
  const requests = [];
  page.on("request", (r) => r.url().includes("/menus/") && requests.push(new URL(r.url()).pathname));
  await page.goto(BASE + "/app");
  await page.getByText(/\d+ UK restaurants/).waitFor();
  expect(!requests.some((u) => /chain-/.test(u)), `Home fetched a chain menu: ${requests.filter((u) => /chain-/.test(u)).join(", ")}`);
  const group = page.getByRole("group", { name: "Browse by type" });
  await group.getByRole("button", { name: /^Pizza/ }).click();
  await page.getByRole("link", { name: /Pizza Hut/ }).waitFor();
  expect(await page.getByRole("heading", { name: "Popular" }).count() === 0, "Popular still shown while a type is chosen");
  expect(await page.getByRole("link", { name: /^KFC/ }).count() === 0, "KFC listed under Pizza");
  // the choice survives going into a restaurant and back
  await page.getByRole("link", { name: /Pizza Hut/ }).click();
  await page.getByRole("heading", { name: "Pizza Hut" }).waitFor();
  await page.goBack();
  await page.getByRole("link", { name: /Pizza Hut/ }).waitFor();
  expect(await group.getByRole("button", { name: /^Pizza/ }).getAttribute("aria-pressed") === "true", "type choice not kept");
  await group.getByRole("button", { name: "All" }).click();
  await page.getByRole("heading", { name: "Popular" }).waitFor();
});

await step("Home: A-Z jump scrolls to the letter", async () => {
  const before = await page.evaluate(() => scrollY);
  await page.getByRole("navigation", { name: "Jump to letter" }).getByRole("link", { name: /starting with M/ }).click();
  await page.waitForTimeout(900);
  const top = await page.locator("#az-M").evaluate((el) => el.getBoundingClientRect().top);
  expect((await page.evaluate(() => scrollY)) > before && top < 200, `M section not at top (top ${top})`);
});

await step("Chain: data note first, long sections trimmed, Show all expands", async () => {
  await page.goto(BASE + "/app/chain?id=puccinos");
  await page.getByRole("heading", { name: "Puccino's" }).waitFor();
  await page.getByText(/\d{3} items/).first().waitFor(); // the count follows the chain's guide (654 when written, 637 after the 8 Oct re-read)
  await page.getByText(/no cup volume is stated/).first().waitFor();
  const section = page.getByRole("region", { name: "Hot coffee" });
  expect((await section.getByRole("listitem").count()) === 6, "Hot coffee not trimmed to 6");
  await section.getByRole("button", { name: /Show all \d+ in Hot coffee/ }).click();
  expect((await section.getByRole("listitem").count()) > 100, "Hot coffee didn't expand");
});

await step("Chain: section chips jump to a section and expand it", async () => {
  await page.getByRole("group", { name: "Menu sections" }).getByRole("button", { name: "Savoury food" }).click();
  let top = Infinity;
  for (let i = 0; i < 30 && !(top > 0 && top < 260); i++) {
    await page.waitForTimeout(150);
    top = await page.getByRole("region", { name: "Savoury food" }).evaluate((el) => el.getBoundingClientRect().top);
  }
  expect(top > 0 && top < 260, `Savoury food not at top (top ${top})`);
  const sticky = await page.getByRole("searchbox", { name: /Search the Puccino's menu/ }).boundingBox();
  expect(sticky && sticky.y >= 0 && sticky.y < 80, "search bar didn't stay at the top");
  await page.getByRole("button", { name: "Best for you" }).waitFor({ timeout: 3000 });
});

await step("Chain: search within the menu", async () => {
  await page.getByRole("searchbox", { name: /Search the Puccino's menu/ }).fill("latte oat");
  await page.getByText(/\d+ items? match/).waitFor();
  const names = await page.locator("main li a").allTextContents();
  expect(names.length > 0 && names.every((t) => /latte/i.test(t) && /oat/i.test(t)), `unexpected results: ${names.slice(0, 3).join(" | ")}`);
  await page.getByRole("searchbox", { name: /Search the Puccino's menu/ }).fill("zzqx");
  await page.getByText(/Nothing on this menu matches/).waitFor();
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await page.getByRole("region", { name: "Hot coffee" }).waitFor();
});

await step("Chain: filter caution appears with a diet filter", async () => {
  await page.getByRole("group", { name: "Filters" }).getByRole("button", { name: "No pork" }).click();
  await page.getByText("We only know what each restaurant publishes, so this can't promise a dish is pork-free.").waitFor();
});

await step("Search: highlight, recent searches", async () => {
  await page.goto(BASE + "/app/search");
  await page.getByRole("searchbox").fill("halloumi");
  await page.locator("mark").first().waitFor();
  await page.locator("main ul li a").first().click();
  await page.waitForURL(/\/app\/(item|chain)/);
  await page.goto(BASE + "/app/search");
  await page.getByRole("button", { name: "halloumi" }).click();
  expect((await page.getByRole("searchbox").inputValue()) === "halloumi", "recent search didn't refill the box");
});

await step("Item: allergen table as the chain's guide prints it, with a link to the guide and 'check with staff'", async () => {
  await page.goto(BASE + "/app/item?chain=farmer-j&item=smashed-avo-preserved-lemon-toast");
  const section = page.getByRole("region", { name: "Allergens" });
  await section.waitFor();
  const table = section.getByRole("table");
  const row = table.getByRole("row", { name: /Cereals containing gluten/ });
  await row.getByText("wheat, rye, barley").waitFor();
  await row.getByText("Contains", { exact: true }).waitFor();
  await table.getByText("May contain", { exact: true }).first().waitFor();
  expect((await table.getByRole("row").count()) === 15, "expected a header row and the 14 allergens");
  await section.getByRole("link", { name: /Open Farmer J's allergen guide/ }).waitFor();
  await section.getByText(/always check with staff/).waitFor();
});

await step("Item: a chain whose allergens we haven't read only links to its own information", async () => {
  // a chain is link-only until its allergens.csv exists; find one from the data rather than hard-coding it
  const m = await (await fetch(BASE + "/menus/menus-manifest.json")).json();
  let target = null;
  for (const c of m.chains) {
    const doc = await (await fetch(BASE + "/menus/" + c.file)).json();
    if (!doc.allergenGuide?.complete && doc.items.length) { target = [c.id, doc.items[0].id, doc.name]; break; }
  }
  if (!target) return; // every chain complete: nothing to check here
  await page.goto(`${BASE}/app/item?chain=${target[0]}&item=${target[1]}`);
  const section = page.getByRole("region", { name: "Allergens" });
  await section.getByText(`We don't show allergens for ${target[2]} yet.`).waitFor();
  expect((await section.getByText("Contains", { exact: true }).count()) === 0, "a link-only chain shows a list");
});

await page.screenshot({ path: `${SHOTS}browse-end.png` });
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
console.log(problems.length ? problems.join("\n") : "No console errors or warnings.");
process.exit(failed ? 1 : 0);
