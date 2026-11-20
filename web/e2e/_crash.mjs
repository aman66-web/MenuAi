import { chromium } from "playwright-core";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
await ctx.addInitScript(() => { localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } })); localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 2 })); });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 160)); });
await page.goto("http://localhost:3103/app/chain?id=mcdonalds");
await page.getByRole("heading", { level: 1 }).first().waitFor();
await page.waitForTimeout(1500);
console.log("title:", await page.title(), "| body has error text:", /something went wrong|application error/i.test(await page.innerText("body")));
const links = await page.locator("a[href*='/app/item']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
console.log("item links on first screen:", links.length, links[0]);
const ids = [...new Set(links)];
let bad = 0;
for (const href of ids.slice(0, 40)) {
  const before = errs.length;
  await page.goto("http://localhost:3103" + href);
  await page.waitForTimeout(500);
  const txt = await page.innerText("body");
  if (errs.length > before || /something went wrong|application error|client-side exception/i.test(txt)) { bad++; console.log("BAD", href, errs.slice(before).join(" | "), txt.slice(0, 120).replace(/\n/g, " ")); }
}
console.log("visited", Math.min(ids.length, 40), "dish pages; bad:", bad);
console.log(errs.slice(0, 5).join("\n"));
await b.close();
