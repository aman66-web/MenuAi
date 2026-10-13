import { launch, mk, snap, audit, show, BASE, OUT, settle } from "./walk-tmp-lib.mjs";
const browser = await launch();
const { ctx, page, errs } = await mk(browser, { settings: null });
await page.goto(BASE + "/app");
await page.waitForURL(/welcome/, { timeout: 15000 });
await settle(page, 1200);
const btns = () => page.evaluate(() => [...document.querySelectorAll("button,a")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute("aria-label") || b.innerText).replace(/\s+/g, " ").trim()).join(" | "));
async function step(name, click) {
  if (click) await click();
  await settle(page, 1300);
  const a = await audit(page, name);
  await snap(page, name.replace(/\W+/g, "-"));
  console.log("\n=== " + name + " url=" + page.url().replace(BASE, ""));
  show(a);
  console.log("BUTTONS:", await btns());
  console.log("TEXT:", a.text.replace(/\n+/g, " / ").slice(0, 700));
  return a;
}
await step("L1-language", null);
await step("L2-welcome", () => page.getByRole("button", { name: "Continue" }).first().click());
await step("L3-pip1", () => page.getByRole("button", { name: /Get started/ }).first().click());
await step("L4-pip2", () => page.getByRole("button", { name: /^(Next|Continue|Let's go|OK|Go)/i }).first().click().catch(() => {}));
console.log("ERRS", JSON.stringify(errs, null, 1).slice(0, 2000));
await browser.close();
