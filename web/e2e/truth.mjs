// The Truth & Swap screens (founder's brief, 13 Nov 2026), on real data: the item page's two buttons, the Truth card (calories, Protein score, the official traffic lights,
// "What that looks like", the Smart Swap), the WhatsApp message, the saved 1080 x 1350 image, the dark card, Creator View (Shift+F), and the Quick answers pills on a restaurant's page.
// Run against a production build: BASE=http://localhost:3101 node e2e/truth.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };
const settings = (extra = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, hasCompletedOnboarding: true, preferences: {}, ...extra } });
const open = async (extra = {}, viewport = { width: 390, height: 844 }) => {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block", acceptDownloads: true });
  await ctx.addInitScript((s) => localStorage.setItem("mm.v1.settings", s), settings(extra));
  const page = await ctx.newPage();
  return { ctx, page };
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const SUBWAY = "/app/item?chain=subway&item=taco-beef-sub"; // 743 kcal, 16 g protein, fat 51, saturates 8, sugar 11, salt 3.3, weight 289 g
const ZINGER = "/app/item?chain=kfc&item=zinger-supercharger-tower-burger"; // no weight published
const sheetOf = (page) => page.getByRole("dialog");
const seeTruth = async (page, path) => { await page.goto(BASE + path); await page.getByRole("button", { name: "See the truth" }).click(); await sheetOf(page).getByRole("heading", { level: 3, name: "Calories" }).waitFor(); await page.waitForTimeout(500); };
const axeCheck = async (page) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.addScriptTag({ path: AXE });
  const v = (await page.evaluate(async () => await axe.run(document, { resultTypes: ["violations"] }))).violations;
  expect(v.length === 0, v.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")).join("; "));
};

await step("a dish shows 'See the truth' (a row with a line under it) and, where there is a lighter dish, 'Show a Smart Swap at {chain}': both at least 48 px tall", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + SUBWAY);
  const truth = page.getByRole("button", { name: "See the truth" });
  const swap = page.getByRole("button", { name: "Show a Smart Swap at Subway" });
  await truth.waitFor();
  await swap.waitFor();
  for (const b of [truth, swap]) { const box = await b.boundingBox(); expect(box.height >= 47.5, `button is ${box.height}px tall`); }
  await ctx.close();
});

await step("the Truth card: calories, Protein score, official traffic lights (red over the portion limit, coloured from the weight), household equivalents", async () => {
  const { ctx, page } = await open();
  await seeTruth(page, SUBWAY);
  const sheet = sheetOf(page);
  await sheet.getByText("743", { exact: false }).first().waitFor();
  expect((await sheet.getByRole("heading", { level: 3, name: "Protein score" }).count()) === 1, "no Protein score");
  const lights = sheet.getByRole("region", { name: "Traffic lights" }).locator("li");
  expect((await lights.count()) === 4, "four lights");
  const text = (await lights.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  expect(/Fat 51 g High/.test(text[0]), "fat: " + text[0]);
  expect(/Saturates 8 g High/.test(text[1]), "saturates: " + text[1]);
  expect(/Sugars 11 g Low/.test(text[2]), "sugars: " + text[2]);
  expect(/Salt 3\.30 g High/.test(text[3]) || /Salt 3\.3 g High/.test(text[3]), "salt: " + text[3]);
  expect(/of reference intake/.test(text[0]), "% of reference intake");
  const inside = (await sheet.getByRole("region", { name: "What that looks like" }).innerText()).replace(/\s+/g, " ");
  expect(inside.includes("= about 3 sugar cubes"), "sugar: " + inside);
  expect(inside.includes("= about 60 g of butter"), "butter: " + inside);
  expect(inside.includes("= about 2½ medium eggs' worth"), "eggs: " + inside);
  expect((await sheet.getByText("Colours follow the official UK scheme.").count()) === 1, "scheme note");
  expect(!/\b(good|bad|healthy|worst|best choice|top pick|alert)\b/i.test(await sheet.innerText()), "a judging word on the card");
  await ctx.close();
});

await step("no published weight means no guess: amber and green are not shown, red still is, and the card says why", async () => {
  const { ctx, page } = await open();
  await seeTruth(page, ZINGER);
  const sheet = sheetOf(page);
  const text = (await sheet.getByRole("region", { name: "Traffic lights" }).locator("li").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  expect(/Sugars 8\.7 g No colour/.test(text[2]), "sugars: " + text[2]);
  expect(/Salt 3 g High/.test(text[3]), "salt: " + text[3]);
  await sheet.getByText("doesn't publish for it", { exact: false }).waitFor();
  await ctx.close();
});

await step("the Smart Swap card: your pick, what the swap saves in numbers, the swap, and no judging words", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + SUBWAY);
  await page.getByRole("button", { name: "Show a Smart Swap at Subway" }).click();
  const sheet = sheetOf(page);
  await sheet.getByRole("heading", { level: 3, name: "Smart Swap" }).waitFor();
  const body = (await sheet.getByRole("region", { name: "Smart Swap" }).innerText()).replace(/\s+/g, " ");
  expect(/your pick/i.test(body) && /smart swap at subway/i.test(body), "headings: " + body); // (the small labels are set in capitals by CSS)
  expect(/Save 441 kcal and get \d+ g more protein in 1 swap/.test(body), "banner: " + body);
  expect(/Chicken Tikka Sub/.test(body), "swap name: " + body);
  await sheet.getByRole("link", { name: "See the swap's full numbers" }).waitFor();
  await ctx.close();
});

await step("WhatsApp: a wa.me link with the message and the dish's link; opens in a new tab", async () => {
  const { ctx, page } = await open();
  await seeTruth(page, SUBWAY);
  const link = sheetOf(page).getByRole("link", { name: /Share to WhatsApp/ });
  const href = await link.getAttribute("href");
  expect(href.startsWith("https://wa.me/?text="), "href: " + href.slice(0, 40));
  const message = decodeURIComponent(href.split("text=")[1]);
  expect(message.startsWith("Look at the actual nutrition in this Subway Taco Beef Sub (743 kcal) vs the Smart Swap (Chicken Tikka Sub, saves 441 kcal!)."), "message: " + message);
  expect(message.endsWith("https://numbite.com/app/item?chain=subway&item=taco-beef-sub"), "link: " + message.slice(-80));
  expect((await link.getAttribute("target")) === "_blank" && /noopener/.test(await link.getAttribute("rel")), "target and rel");
  const box = await link.boundingBox();
  expect(box.height >= 47.5, "WhatsApp button is " + box.height + "px");
  await ctx.close();
});

await step("Save image card: a 1080 x 1350 PNG", async () => {
  const { ctx, page } = await open();
  await seeTruth(page, SUBWAY);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), sheetOf(page).getByRole("button", { name: "Save image card" }).click()]);
  expect(/^numbite-subway-taco-beef-sub\.png$/.test(download.suggestedFilename()), "file name: " + download.suggestedFilename());
  const buf = readFileSync(await download.path());
  expect(buf.subarray(1, 4).toString() === "PNG", "not a PNG");
  expect(buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1350, `size ${buf.readUInt32BE(16)} x ${buf.readUInt32BE(20)}`);
  await sheetOf(page).getByText("Image saved to your downloads.").waitFor();
  await ctx.close();
});

await step("Dark card: the #09090B high-contrast theme, on and off", async () => {
  const { ctx, page } = await open();
  await seeTruth(page, SUBWAY);
  const panel = page.locator(".sheet-panel");
  const bg = () => panel.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect((await bg()) === "rgb(255, 255, 255)", "light by default: " + (await bg()));
  await sheetOf(page).getByRole("button", { name: "Dark card" }).click();
  expect((await bg()) === "rgb(9, 9, 11)", "dark: " + (await bg()));
  const box = await sheetOf(page).getByRole("button", { name: "Dark card" }).boundingBox();
  expect(box.height >= 47.5, "chip is " + box.height + "px");
  await axeCheck(page);
  await sheetOf(page).getByRole("button", { name: "Dark card" }).click();
  expect((await bg()) === "rgb(255, 255, 255)", "light again");
  await ctx.close();
});

await step("Creator View: Shift+F hides the tab bar and makes the card dark with a Replay button; typing a capital F in a box does not toggle it; Shift+F again ends it", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + SUBWAY);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.waitFor();
  await page.keyboard.press("Shift+F");
  await nav.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "See the truth" }).click();
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Replay" }).waitFor();
  expect((await sheet.getByRole("button", { name: "Dark card" }).count()) === 0, "the Dark card chip should give way to Replay");
  expect((await page.locator(".sheet-panel").evaluate((el) => getComputedStyle(el).backgroundColor)) === "rgb(9, 9, 11)", "not dark in Creator View");
  await sheet.getByRole("button", { name: "Replay" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("Shift+F");
  await nav.waitFor({ state: "visible" });
  await page.goto(BASE + "/app/search");
  await page.locator("input").first().click();
  await page.keyboard.press("Shift+F");
  await nav.waitFor({ state: "visible" });
  expect((await page.locator("html").getAttribute("data-creator")) === null, "toggled while typing");
  await ctx.close();
});

await step("Settings has the Filming mode switch, and it works", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/settings");
  await page.getByRole("heading", { name: "Filming mode" }).waitFor();
  const label = page.locator("label", { hasText: "Shows the Truth and Swap cards" });
  await label.click();
  expect((await page.locator("html").getAttribute("data-creator")) !== null, "not on");
  expect(await label.locator("input[role=switch]").isChecked(), "the switch does not show on");
  await label.click();
  expect((await page.locator("html").getAttribute("data-creator")) === null, "not off");
  await ctx.close();
});

await step("Quick answers on a restaurant's page: five pills, a tap shows the top five that meet the rule, a second tap clears", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/chain?id=kfc");
  await page.getByRole("heading", { level: 2, name: "Quick answers" }).waitFor();
  const group = page.getByRole("group", { name: "Quick answers" });
  expect((await group.getByRole("button").count()) === 5, "five pills: " + (await group.getByRole("button").allInnerTexts()).join(" | "));
  for (const b of await group.getByRole("button").all()) { const box = await b.boundingBox(); expect(box.height >= 47.5, "a pill is " + box.height + "px"); }
  await group.getByRole("button", { name: "Under 500 calories" }).click();
  await page.getByText(/Showing the top 5 of \d+\./).waitFor();
  const section = page.locator("section[aria-labelledby='quick-heading']");
  const rows = section.locator("ul > li");
  expect((await rows.count()) === 5, "five rows");
  // textContent, not innerText: menu rows use content-visibility: auto, so a row the browser hasn't drawn yet has no innerText
  for (const t of await rows.allTextContents()) { const m = t.match(/(\d[\d,]*)\s*kcal/); expect(m && Number(m[1].replace(",", "")) <= 500, "a row over 500 kcal: " + t.replace(/\s+/g, " ")); }
  await group.getByRole("button", { name: "35 g+ protein" }).click();
  await page.waitForTimeout(200);
  for (const t of await section.locator("ul > li").allTextContents()) { const m = t.match(/(\d+(?:\.\d)?)\s*g\s*protein/); expect(m && Number(m[1]) >= 35, "protein under 35 g: " + t.replace(/\s+/g, " ")); }
  await group.getByRole("button", { name: "35 g+ protein" }).click();
  expect((await section.locator("ul > li").count()) === 0, "the list should clear");
  await ctx.close();
});

await step("a calories-only restaurant offers only the calories pill (no protein, no sugar question it can't answer)", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/chain?id=cornish-bakehouse");
  const group = page.getByRole("group", { name: "Quick answers" });
  await group.waitFor();
  const names = await group.getByRole("button").allInnerTexts();
  expect(names.length === 1 && /Under 500 calories/.test(names[0]), "pills: " + names.join(" | "));
  await ctx.close();
});

await step("App Review 1.4.1: 'Where these numbers come from' sits at the top of the Truth card and under a Quick answers list; it opens one sheet with the card's own five sources (nothing fetched until tapped) and Numbite's own rules; closing it keeps the card open; dark card; axe 0", async () => {
  const HOSTS = ["www.legislation.gov.uk", "assets.publishing.service.gov.uk", "www.nhs.uk", "patient.info", "www.egginfo.co.uk"];
  const { ctx, page } = await open();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await seeTruth(page, SUBWAY);
  const truthSheet = page.locator("dialog[open]");
  expect((await truthSheet.count()) === 1, "one sheet open");
  const link = truthSheet.getByRole("button", { name: "Where these numbers come from" });
  const box = await link.boundingBox();
  const score = await truthSheet.getByRole("heading", { level: 3, name: "Protein score" }).boundingBox();
  expect(box.height >= 43.5, "the link is " + box.height + "px tall");
  expect(box.y < score.y, "the link should sit above the Protein score");
  const cardLinks = (await truthSheet.locator("a[target=_blank]").evaluateAll((as) => as.map((a) => a.href))).filter((h) => !h.startsWith("https://wa.me/"));
  await link.click();
  const sources = page.getByRole("dialog", { name: "Where these numbers come from" });
  await sources.getByRole("heading", { level: 3, name: "Reference intakes" }).waitFor();
  const hrefs = await sources.locator("a[href^='http']").evaluateAll((as) => as.map((a) => a.href));
  expect(hrefs.length === 5, "five sources: " + hrefs.join(" "));
  for (const h of hrefs) { const u = new URL(h); expect(u.protocol === "https:" && HOSTS.includes(u.host), "source " + h); }
  expect([...new Set(cardLinks)].sort().join() === [...hrefs].sort().join(), "the sheet should list exactly the card's own links: " + cardLinks.join(" "));
  const words = (await sources.innerText()).replace(/\s+/g, " ");
  for (const w of ["2,000 kcal of energy", "Protein score: 5 needs at least 25%", "Quick answers: meals of 500 kcal or less", "Smart Swap:", "Cheapest protein:", "not taken from a published source", "doesn't give medical advice", "Sources checked on 13 Nov 2026"]) expect(words.includes(w), "missing: " + w);
  expect(!/\b(good|bad|healthy)\b/i.test(words), "judging words in the sheet");
  expect(!requests.some((u) => HOSTS.includes(new URL(u).host)), "a source was fetched before it was tapped");
  await page.waitForTimeout(500);
  await axeCheck(page);
  await page.keyboard.press("Escape");
  await sources.waitFor({ state: "hidden" });
  expect((await page.locator("dialog[open]").count()) === 1, "closing the sources should leave the Truth card open");
  await truthSheet.getByRole("heading", { level: 3, name: "Calories" }).waitFor();
  expect((await page.evaluate(() => document.activeElement?.textContent ?? "")) === "Where these numbers come from", "focus should go back to the link");
  // the dark card's colours never reach the sources sheet
  await truthSheet.getByRole("button", { name: "Dark card" }).click();
  await truthSheet.getByRole("button", { name: "Where these numbers come from" }).click();
  await sources.getByRole("heading", { level: 3, name: "Traffic lights" }).waitFor();
  const colours = await sources.locator(".sheet-panel").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el.querySelector("p")).color }));
  expect(colours.bg === "rgb(255, 255, 255)" && colours.ink !== "rgb(255, 255, 255)", "sources sheet over the dark card: " + JSON.stringify(colours));
  await page.keyboard.press("Escape");
  await ctx.close();
  // under a Quick answers list
  const r = await open();
  await r.page.goto(BASE + "/app/chain?id=kfc");
  const group = r.page.getByRole("group", { name: "Quick answers" });
  await group.waitFor();
  const section = r.page.locator("section[aria-labelledby='quick-heading']");
  expect((await section.getByRole("button", { name: "Where these numbers come from" }).count()) === 0, "no link before a list is open");
  await group.getByRole("button", { name: "Small appetite" }).click();
  await section.getByRole("button", { name: "Where these numbers come from" }).click();
  await r.page.getByRole("dialog", { name: "Where these numbers come from" }).getByText("for a small appetite, 400 kcal or less with at least 20 g of protein").waitFor();
  await r.page.keyboard.press("Escape");
  expect((await section.locator("ul > li").count()) > 0, "the list should still be there");
  await r.ctx.close();
});

await step("360 px and Extra large text: the sheet and the pills do not scroll sideways, the buttons stay 48 px", async () => {
  const { ctx, page } = await open({ textSize: "xlarge" }, { width: 360, height: 740 });
  await seeTruth(page, SUBWAY);
  expect((await overflow(page)) <= 0, "sheet overflow " + (await overflow(page)));
  const panelWide = await page.locator(".sheet-panel").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(panelWide <= 0, "the sheet's panel scrolls sideways by " + panelWide);
  await ctx.close();
  const r = await open({ textSize: "xlarge" }, { width: 360, height: 740 });
  await r.page.goto(BASE + "/app/chain?id=kfc");
  await r.page.getByRole("heading", { level: 2, name: "Quick answers" }).waitFor();
  expect((await overflow(r.page)) <= 0, "chain page overflow");
  await r.ctx.close();
});

await step("accessibility: axe finds nothing on the light card, the item page with its buttons, and the Quick answers list", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + SUBWAY);
  await page.getByRole("button", { name: "See the truth" }).waitFor();
  await axeCheck(page);
  await page.getByRole("button", { name: "See the truth" }).click();
  await sheetOf(page).getByRole("heading", { level: 3, name: "Calories" }).waitFor();
  await page.waitForTimeout(600);
  await axeCheck(page);
  await page.getByRole("button", { name: "Close" }).click();
  await page.goto(BASE + "/app/chain?id=kfc");
  await page.getByRole("group", { name: "Quick answers" }).getByRole("button", { name: "Under 500 calories" }).click();
  await page.getByText(/Showing the top 5/).waitFor();
  await axeCheck(page);
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
