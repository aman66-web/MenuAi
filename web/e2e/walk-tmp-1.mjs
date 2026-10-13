import { launch, mk, snap, audit, show, BASE, OUT, settle } from "./walk-tmp-lib.mjs";
const browser = await launch();
const { ctx, page, errs } = await mk(browser, { settings: null });
await page.goto(BASE + "/app");
await page.waitForURL(/welcome/, { timeout: 15000 }).catch(() => {});
await settle(page, 1500);
console.log("URL", page.url());
let a = await audit(page, "launch-1 language"); show(a); console.log(a.text.slice(0, 900));
await snap(page, "01-language");
// full list of buttons
console.log(await page.evaluate(() => [...document.querySelectorAll("button,a")].map((b) => (b.getAttribute("aria-label") || b.innerText).replace(/\s+/g, " ").trim()).join(" | ")));
await browser.close();
