import { launch, mk, snap, BASE, OUT, settle, onboarded } from "./walk-tmp-lib.mjs";
const browser = await launch();
const { ctx, page } = await mk(browser);
await page.goto(BASE + "/app/settings"); await settle(page, 2000);
await page.setViewportSize({ width: 390, height: 3200 }); await settle(page, 600);
await page.screenshot({ path: OUT + "shots/settings-full.png" });
await browser.close();
