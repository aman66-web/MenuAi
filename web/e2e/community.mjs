// Community, the fifth tab (founder 2026-10-16: "The settings at the bottom right is now a community. Where you can find food blogs, and more and also add a friend and more").
// The tab bar ends with Community (Settings is the gear at the top of Home, and Home's tab stays lit on the Settings pages); the hub lists the latest three food blogs
// with See all; the list has a search box (with the app's Done button), topic chips and a count; an article is a static shell read from ?id= with its title, read time, date
// and "Numbite" as the author, and Back; an unknown id says so. Articles are our own, bundled in the app and English only, so nothing here needs an account or a network.
// Touch is on, like an iPhone.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const baseSettings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], devProOverride: true };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n").slice(0, 7).join(" / ")); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function open(extra = {}, settings = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
  }, JSON.stringify({ v: 1, data: { ...baseSettings, ...settings } }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/agent-proxy|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const tabBar = (page) => page.getByRole("navigation", { name: "Main" });
const go = async (page, path, heading) => { await page.goto(BASE + path, { timeout: 120000 }); await page.getByRole("heading", { level: 1, name: heading }).first().waitFor({ timeout: 90000 }); };
/** The list page's article rows, as { title, href } in the order shown. */
const rows = (page) => page.locator('main a[href^="/app/community/blog/view?id="]');
const titles = (page) => rows(page).evaluateAll((els) => els.map((a) => a.querySelector("span.text-lg")?.textContent?.trim() ?? ""));
const countLine = (page) => page.getByRole("status").filter({ hasText: /\barticles?\b/ });
const over = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

await step("the tab bar ends with Community (Home, Eat out, Groceries, Recipes, Community), has no Settings tab, and Community opens the hub with no Back button", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app", /Home/);
  const names = await tabBar(page).getByRole("link").allInnerTexts();
  expect(names.map((n) => n.trim()).join("|") === "Home|Eat out|Groceries|Recipes|Community", "tabs: " + names.join("|"));
  expect((await tabBar(page).getByRole("link", { name: "Settings" }).count()) === 0, "there is still a Settings tab");
  expect((await tabBar(page).getByRole("link", { name: "Community" }).locator("svg").count()) === 1, "the Community tab has no icon");
  await tabBar(page).getByRole("link", { name: "Community" }).click();
  await page.getByRole("heading", { level: 1, name: "Community", exact: true }).waitFor({ timeout: 90000 });
  expect(new URL(page.url()).pathname === "/app/community", "url " + page.url());
  expect((await tabBar(page).getByRole("link", { name: "Community" }).getAttribute("aria-current")) === "page", "the Community tab is not the open one");
  expect((await page.locator("main").getByRole("link", { name: "Back", exact: true }).count()) === 0, "the hub (a tab root) has a Back button");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("Settings is still reachable: Home's gear opens it, and Home's tab is the lit one on Settings and on its sub-pages", async () => {
  const { ctx, page } = await open();
  await go(page, "/app", /Home/);
  const gear = page.locator('a[aria-label="Settings"]');
  expect((await gear.getAttribute("href")) === "/app/settings", "the gear goes to " + (await gear.getAttribute("href")));
  const box = await gear.boundingBox();
  expect(box.width >= 44 && box.height >= 44, `gear tap area ${box.width} x ${box.height}`);
  await gear.click();
  await page.getByRole("heading", { level: 1, name: "Settings", exact: true }).waitFor({ timeout: 90000 });
  expect((await tabBar(page).getByRole("link", { name: "Home" }).getAttribute("aria-current")) === "page", "Home's tab is not lit on Settings");
  expect((await tabBar(page).locator('a[aria-current="page"]').count()) === 1, "more than one tab is lit");
  // Settings is a second-level page now, so it has a Back button, as the other pages inside a tab do; it returns to the page before (Home)
  const back = page.locator("main").getByRole("link", { name: /^Back/ }).first();
  expect((await back.count()) === 1, "Settings has no Back button");
  const bb = await back.boundingBox();
  expect(bb.height >= 43.5, "Settings' Back is " + bb.height + " px high");
  await back.click();
  await page.getByRole("heading", { level: 1, name: /Home/ }).first().waitFor({ timeout: 90000 });
  expect(new URL(page.url()).pathname === "/app", "Back from Settings went to " + page.url());
  await go(page, "/app/settings/numbers", /.+/);
  expect((await tabBar(page).getByRole("link", { name: "Home" }).getAttribute("aria-current")) === "page", "Home's tab is not lit on Settings > numbers");
  await ctx.close();
});

await step("the hub: a heading, a short line, and the Food blogs card with the latest three articles (title, summary, read time) in the same order as the list, and See all", async () => {
  const { ctx, page, errors } = await open();
  // the list's order first (newest first), to compare with the hub
  await go(page, "/app/community/blog", "Food blogs");
  const all = await titles(page);
  expect(all.length >= 3, "fewer than 3 articles: " + all.length);
  await go(page, "/app/community", "Community");
  expect(await page.getByRole("heading", { level: 2, name: "Food blogs", exact: true }).count() === 1, "no Food blogs heading");
  const card = page.locator('section[aria-labelledby="community-blogs"]');
  const links = card.locator('a[href^="/app/community/blog/view?id="]');
  expect((await links.count()) === 3, "the card lists " + (await links.count()) + " articles, expected 3");
  for (let i = 0; i < 3; i++) {
    const text = (await links.nth(i).innerText()).replace(/\s+/g, " ");
    expect(text.includes(all[i]), `row ${i + 1} should be "${all[i]}", got "${text}"`);
    expect(/\d+ min read/.test(text), `row ${i + 1} has no read time: ${text}`);
    const box = await links.nth(i).boundingBox();
    expect(box.height >= 44, `row ${i + 1} is ${box.height} px high`);
  }
  expect(!(await page.locator("main").innerText()).match(/friend/i), "the hub mentions friends before they exist");
  // the heading and See all sit on the grey page above the card (like Eat out's "All restaurants" row), not inside it
  expect((await card.getByRole("heading", { level: 2 }).count()) === 0 && (await card.getByRole("link", { name: /See all/ }).count()) === 0, "the section heading or See all is still inside the card");
  const hb = await page.getByRole("heading", { level: 2, name: "Food blogs", exact: true }).boundingBox();
  const cb = await card.boundingBox();
  expect(hb.y + hb.height <= cb.y + 1, "the Food blogs heading is not above its card");
  await page.getByText("The articles are in English.", { exact: true }).waitFor();
  // each summary is held to two lines (line-clamp), so the card stays short
  const clamp = await card.locator("span.line-clamp-2").evaluateAll((els) => els.map((el) => ({ display: getComputedStyle(el).display, lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) })));
  expect(clamp.length === 3 && clamp.every((c) => c.lines <= 2), "summaries are not clamped to two lines: " + JSON.stringify(clamp));
  // the articles are English only: marked as English and read left to right
  const marks = await card.locator("a span[lang]").evaluateAll((els) => els.map((el) => [el.lang, getComputedStyle(el).direction]));
  expect(marks.length === 3 && marks.every((m) => m[0] === "en" && m[1] === "ltr"), "English marks on the hub rows: " + JSON.stringify(marks));
  const seeAll = page.locator("main").getByRole("link", { name: /See all/ });
  const sb = await seeAll.boundingBox();
  expect(sb.width >= 44 && sb.height >= 44, `See all is ${sb.width} x ${sb.height}`);
  await seeAll.click();
  await page.getByRole("heading", { level: 1, name: "Food blogs", exact: true }).waitFor({ timeout: 90000 });
  expect(new URL(page.url()).pathname === "/app/community/blog", "url " + page.url());
  expect((await tabBar(page).getByRole("link", { name: "Community" }).getAttribute("aria-current")) === "page", "Community's tab is not lit on the list");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the list: every article newest first with a count; the search box filters as you type, has a Done button, and an empty result says so", async () => {
  const { ctx, page } = await open();
  await go(page, "/app/community/blog", "Food blogs");
  const all = await titles(page);
  const count = all.length;
  await page.getByText("The articles are in English.", { exact: true }).waitFor();
  expect(/^\d+ articles?$/.test((await countLine(page).innerText()).trim()), "count line: " + (await countLine(page).innerText()));
  expect(Number((await countLine(page).innerText()).match(/\d+/)[0]) === count, `count line says ${await countLine(page).innerText()} but ${count} rows are shown`);
  const dates = await rows(page).evaluateAll((els) => els.map((a) => a.querySelector("time")?.getAttribute("datetime") ?? ""));
  expect(dates.every(Boolean) && [...dates].sort().reverse().join() === dates.join(), "dates are not newest first: " + dates.join(" "));
  // search by a distinctive word of the last article's title
  const target = all[all.length - 1];
  const word = target.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).sort((a, b) => b.length - a.length)[0];
  const box = page.getByRole("searchbox", { name: "Search articles" });
  await box.fill(word.toLowerCase().slice(0, Math.max(3, word.length - 1)));
  await page.waitForTimeout(300);
  const found = await titles(page);
  expect(found.includes(target) && found.length <= count, `searching "${word}" gave: ${found.join(" | ")}`);
  expect(Number((await countLine(page).innerText()).match(/\d+/)[0]) === found.length, "the count did not follow the search");
  // Done puts the keyboard away and keeps the words
  const done = page.getByRole("button", { name: "Done", exact: true });
  await done.click();
  expect((await box.inputValue()).length > 0, "Done cleared the words");
  expect(await box.evaluate((el) => el !== document.activeElement), "the box still has the focus after Done");
  // nothing matches
  await box.fill("zzzzqqq");
  await page.getByText("No articles match.", { exact: true }).waitFor();
  expect((await countLine(page).innerText()).trim() === "0 articles", "count for no match: " + (await countLine(page).innerText()));
  await box.fill("");
  await page.waitForTimeout(300);
  expect((await titles(page)).length === count, "clearing the box did not bring every article back");
  await ctx.close();
});

await step("topics: a chip per tag after All; choosing one filters (the count follows, every row carries it), choosing it again goes back to all, and it works with the search box", async () => {
  const { ctx, page } = await open();
  await go(page, "/app/community/blog", "Food blogs");
  const group = page.getByRole("group", { name: "Topics" });
  const chips = group.getByRole("button");
  const n = await chips.count();
  expect(n >= 3, "only " + n + " topic chips");
  expect((await chips.first().innerText()).trim() === "All" && (await chips.first().getAttribute("aria-pressed")) === "true", "All is not first and pressed");
  const all = await titles(page);
  const tag = (await chips.nth(1).innerText()).trim();
  await chips.nth(1).click();
  expect((await chips.nth(1).getAttribute("aria-pressed")) === "true" && (await chips.first().getAttribute("aria-pressed")) === "false", "pressed states");
  const some = await titles(page);
  expect(some.length >= 1 && some.length <= all.length, `topic ${tag} shows ${some.length} of ${all.length}`);
  expect(Number((await countLine(page).innerText()).match(/\d+/)[0]) === some.length, "count did not follow the topic");
  const kickers = await rows(page).evaluateAll((els) => els.map((a) => a.querySelector("span[lang] > span")?.textContent ?? ""));
  expect(kickers.every((k) => k.includes(tag)), `a row without the topic "${tag}": ${kickers.join(" / ")}`);
  await chips.nth(1).click();
  expect((await titles(page)).length === all.length && (await chips.first().getAttribute("aria-pressed")) === "true", "choosing the topic again did not go back to All");
  // topic + words that no article with that topic has
  await chips.nth(1).click();
  await page.getByRole("searchbox", { name: "Search articles" }).fill("zzzzqqq");
  await page.getByText("No articles match.", { exact: true }).waitFor();
  await ctx.close();
});

await step("an article: opening it from the list shows its title (h1), read time, date and Numbite as the author, headed sections, and Back returns to the list", async () => {
  const { ctx, page, errors } = await open();
  await go(page, "/app/community/blog", "Food blogs");
  const first = rows(page).first();
  const title = (await titles(page))[0];
  await first.click();
  await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor({ timeout: 90000 });
  const article = page.locator("article");
  const meta = (await article.locator("p", { hasText: "min read" }).first().innerText()).replace(/\s+/g, " ");
  expect(/\d+ min read/.test(meta) && /\b20\d\d\b/.test(meta) && /Numbite/.test(meta), "meta line: " + meta);
  expect((await article.locator("time").getAttribute("datetime")).match(/^\d{4}-\d{2}-\d{2}$/), "no machine-readable date");
  expect((await article.locator("h2").count()) >= 2 && (await article.locator("p").count()) >= 3, "the article has no headed sections");
  const fs = await article.locator("div p").first().evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
  const lh = await article.locator("div p").first().evaluate((p) => parseFloat(getComputedStyle(p).lineHeight) / parseFloat(getComputedStyle(p).fontSize));
  expect(fs >= 16 && lh >= 1.55, `reading size ${fs}px, line height ${lh}`);
  const back = page.locator("main").getByRole("link", { name: "Back", exact: true });
  const bb = await back.boundingBox();
  expect(bb.height >= 43.5, "Back is " + bb.height + " px high");
  await back.click();
  await page.getByRole("heading", { level: 1, name: "Food blogs", exact: true }).waitFor();
  expect(new URL(page.url()).pathname === "/app/community/blog", "Back went to " + page.url());
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("an article opened from the hub: Back returns to the hub (the list is not in between)", async () => {
  const { ctx, page } = await open();
  await go(page, "/app/community", "Community");
  const link = page.locator('section[aria-labelledby="community-blogs"] a[href^="/app/community/blog/view?id="]').nth(1);
  await link.click();
  await page.locator("article h1").waitFor({ timeout: 90000 });
  await page.locator("main").getByRole("link", { name: "Back", exact: true }).click();
  await page.getByRole("heading", { level: 1, name: "Community", exact: true }).waitFor();
  expect(new URL(page.url()).pathname === "/app/community", "Back went to " + page.url());
  await ctx.close();
});

await step("an unknown or missing article id shows a clear message with a Back link, not a blank page", async () => {
  const { ctx, page } = await open();
  for (const path of ["/app/community/blog/view?id=no-such-article", "/app/community/blog/view"]) {
    await page.goto(BASE + path, { timeout: 120000 });
    const alert = page.locator('main [role="alert"]');
    await alert.waitFor({ timeout: 90000 });
    expect(/couldn.t find that article/i.test(await alert.innerText()), "message: " + (await alert.innerText()));
    expect((await page.getByRole("heading", { level: 1 }).count()) === 1, "the error page should have exactly one heading, for screen readers");
    await page.locator("main").getByRole("link", { name: "Back", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Food blogs", exact: true }).waitFor();
  }
  await ctx.close();
});

await step("360 px, Extra large text and Arabic: no sideways scroll on the hub, the list or an article, the tab names fit, and every tap target is 44 px", async () => {
  const variants = [
    ["360 px", { viewport: { width: 360, height: 740 } }, {}],
    ["Extra large text", { viewport: { width: 390, height: 844 } }, { textSize: "xlarge" }],
    ["360 px and Extra large text", { viewport: { width: 360, height: 740 } }, { textSize: "xlarge" }],
    ["Arabic", { viewport: { width: 390, height: 844 } }, { language: "ar" }],
  ];
  for (const [label, extra, settings] of variants) {
    const { ctx, page } = await open(extra, settings);
    const width = extra.viewport.width;
    await go(page, "/app/community", /.+/);
    if (settings.textSize) expect(Math.round(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))) >= 20, label + ": text is not large");
    if (settings.language === "ar") await page.waitForFunction(() => document.documentElement.dir === "rtl");
    const check = async (where) => {
      await page.waitForTimeout(600);
      expect((await over(page)) <= 1, `${label}: ${where} scrolls sideways by ${await over(page)}`);
      // every tab's name is whole: not wider than its tab and at most two lines
      const tabs = await tabBar(page).locator("li").evaluateAll((lis) => lis.map((li) => { const s = li.querySelector("span.line-clamp-2"); const r = li.getBoundingClientRect(); return { w: s.scrollWidth - s.clientWidth, h: s.scrollHeight - s.clientHeight, text: s.textContent, right: r.right, left: r.left }; }));
      for (const tb of tabs) expect(tb.w <= 1 && tb.h <= 1 && tb.left >= -0.5 && tb.right <= width + 0.5, `${label}: the tab "${tb.text}" is clipped on ${where} (${JSON.stringify(tb)})`);
      // links and buttons that are not inside prose: 44 px high
      const small = await page.evaluate(() => [...document.querySelectorAll("main a, main button, nav a")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 && !el.closest("article p, article li") && !el.closest('[class~="group/search"]'); }).map((el) => (el.textContent ?? "").trim().slice(0, 30) + " " + Math.round(el.getBoundingClientRect().height)));
      expect(small.length === 0, `${label}: ${where} has small tap targets: ${small.join(" | ")}`);
    };
    await check("the hub");
    await go(page, "/app/community/blog", /.+/);
    await check("the list");
    await page.getByRole("searchbox").first().focus();
    await check("the list with the keyboard's Done showing");
    await go(page, "/app/community/blog", /.+/);
    const id = new URL("http://x" + (await rows(page).first().getAttribute("href"))).searchParams.get("id");
    await page.goto(BASE + "/app/community/blog/view?id=" + id, { timeout: 120000 });
    await page.locator("article h1").waitFor({ timeout: 90000 });
    await check("an article");
    if (settings.language === "ar") {
      expect((await page.locator("article").evaluate((el) => getComputedStyle(el).direction)) === "rtl", "article direction");
      // the article's own text is English: tags, title and body are marked English and read left to right (a full stop must not jump to the start of the
      // line, and a screen reader must not read English in the Arabic voice); the screen's own meta line ("min read", date, Numbite) stays right to left
      const eng = await page.locator("article").evaluate((el) => [el.querySelector("h1"), el.querySelector("div.glass"), el.querySelector("div.glass p"), el.querySelector("div.glass li") ?? el.querySelector("div.glass h2")].map((x) => x && [x.closest("[lang]")?.lang, getComputedStyle(x).direction]));
      expect(eng.every((e) => e && e[0] === "en" && e[1] === "ltr"), "English marks on an article in Arabic: " + JSON.stringify(eng));
      const meta = await page.locator("article p:has(time)").evaluate((p) => [p.closest("[lang]")?.lang, getComputedStyle(p).direction]);
      expect(meta[1] === "rtl" && meta[0] !== "en", "the meta line should stay in the page's language and direction: " + JSON.stringify(meta));
      await go(page, "/app/community/blog", /.+/);
      const listMarks = await rows(page).evaluateAll((els) => els.map((a) => { const e = a.querySelector("span[lang]"); return [e?.lang, e && getComputedStyle(e).direction]; }));
      expect(listMarks.length > 0 && listMarks.every((m) => m[0] === "en" && m[1] === "ltr"), "English marks on the list rows in Arabic: " + JSON.stringify(listMarks));
      const chips = await page.getByRole("group").first().locator("button span[lang]").evaluateAll((els) => els.map((e) => [e.lang, getComputedStyle(e).direction]));
      expect(chips.length > 0 && chips.every((m) => m[0] === "en" && m[1] === "ltr"), "topic chips in Arabic: " + JSON.stringify(chips));
    }
    await ctx.close();
  }
});

await step("axe: no violations on the hub, the list (with a search and with a topic chosen) or an article", async () => {
  const { ctx, page } = await open();
  const check = async (label) => {
    await page.waitForTimeout(700);
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    await page.addScriptTag({ path: AXE }).catch(() => {});
    const res = await page.evaluate(() => globalThis.axe.run(document, { resultTypes: ["violations"] }));
    expect(res.violations.length === 0, label + ": " + res.violations.map((v) => `[${v.impact}] ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`).join(" ; "));
  };
  await go(page, "/app/community", "Community");
  await check("hub");
  await go(page, "/app/community/blog", "Food blogs");
  await check("list");
  await page.getByRole("group", { name: "Topics" }).getByRole("button").nth(1).click();
  await check("list with a topic");
  await page.getByRole("searchbox", { name: "Search articles" }).fill("zzzzqqq");
  await check("list with nothing found");
  await page.getByRole("searchbox", { name: "Search articles" }).fill("");
  await page.getByRole("group", { name: "Topics" }).getByRole("button").first().click();
  await rows(page).first().click();
  await page.locator("article h1").waitFor({ timeout: 90000 });
  await check("article");
  await page.goto(BASE + "/app/community/blog/view?id=nope", { timeout: 120000 });
  await page.locator('main [role="alert"]').waitFor({ timeout: 90000 });
  await check("article not found");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
