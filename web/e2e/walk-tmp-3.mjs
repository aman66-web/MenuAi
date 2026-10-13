import { launch, mk, snap, audit, show, BASE, OUT, settle } from "./walk-tmp-lib.mjs";
const browser = await launch();
const { ctx, page, errs } = await mk(browser, { settings: null });
await page.goto(BASE + "/app");
await page.waitForURL(/welcome/, { timeout: 15000 });
await settle(page, 1000);
const btns = () => page.evaluate(() => [...document.querySelectorAll("button,a")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute("aria-label") || b.innerText).replace(/\s+/g, " ").trim()).join(" | "));
// language -> welcome -> pip1 -> pip2
await page.getByRole("button", { name: "Continue" }).first().click(); await settle(page, 900);
await page.getByRole("button", { name: /Get started/ }).first().click(); await settle(page, 900);
await page.getByRole("button", { name: "Continue" }).first().click(); await settle(page, 900);
await page.getByRole("button", { name: "Continue" }).first().click(); await settle(page, 1500);
for (let i = 0; i < 9; i++) {
  const a = await audit(page, "OB" + i);
  const nm = "OB" + i;
  await snap(page, nm);
  console.log("\n=== " + nm + " url=" + page.url().replace(BASE, ""));
  show(a);
  console.log("BUTTONS:", await btns());
  console.log("TEXT:", a.text.replace(/\n+/g, " / ").slice(0, 900));
  const next = page.getByRole("button", { name: /^(Continue|Next|Let's go|Finish|Done|Start|Skip)/i }).first();
  if (!(await next.count())) { console.log("no next button"); break; }
  // try first without picking, to see validation
  await next.click(); await settle(page, 1500);
  if (/\/app\/?(\?|$)/.test(page.url().replace(BASE, "")) && !/welcome/.test(page.url())) { console.log("ended at", page.url()); break; }
}
const a = await audit(page, "after-onboarding"); await snap(page, "after-onboarding"); show(a);
console.log("TEXT:", a.text.replace(/\n+/g, " / ").slice(0, 900));
console.log("ERRS", JSON.stringify(errs, null, 1).slice(0, 2000));
await browser.close();
