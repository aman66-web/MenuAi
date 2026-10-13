import { launch, mk, snap, audit, BASE, OUT, settle, onboarded } from "./walk-tmp-lib.mjs";
const browser = await launch();
// welcome links
{
  const { ctx, page } = await mk(browser, { settings: null });
  await page.goto(BASE + "/app"); await page.waitForURL(/welcome/); await page.getByRole("button", { name: "Continue" }).first().click(); await settle(page, 1500);
  console.log("welcome links:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => [a.innerText, a.getAttribute("href"), a.target]))));
  const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 3000 }).catch(() => null), page.getByRole("link", { name: "Privacy" }).click()]);
  await settle(page, 1500);
  console.log("after click Privacy: url", page.url(), "popup", popup ? popup.url() : null);
  await ctx.close();
}
// settings links
{
  const { ctx, page } = await mk(browser);
  await page.goto(BASE + "/app/settings"); await settle(page, 2000);
  console.log("settings links:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => [(a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40), a.getAttribute("href"), a.target]))));
  console.log("settings headings:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].map((h) => h.innerText))));
  await ctx.close();
}
await browser.close();
