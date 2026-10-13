import { launch, mk, snap, audit, BASE, OUT, settle, onboarded } from "./walk-tmp-lib.mjs";
const SCHEME = process.env.SCHEME ?? "light"; const TEXT = process.env.TEXT ?? "standard"; const TAG = `${SCHEME}${TEXT === "standard" ? "" : "-" + TEXT}`;
const browser = await launch();
const list = JSON.stringify({ v: 1, data: [{ gtin: "", retailer: "own", name: "Milk", brand: "", size: "", custom: true, qty: 1, addedAt: "2026-10-12T09:00:00.000Z" }] });
const { ctx, page, errs } = await mk(browser, { settings: onboarded(TEXT === "standard" ? {} : { textSize: TEXT }), scheme: SCHEME });
const btns = () => page.evaluate(() => [...document.querySelectorAll("button,a")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute("aria-label") || b.innerText).replace(/\s+/g, " ").trim().slice(0, 40)).join(" | "));
async function visit(name, path, prep, { verbose = true } = {}) {
  try {
    if (path) await page.goto(BASE + path);
    await settle(page, 1800);
    if (prep) await prep();
    await settle(page, 600);
    const a = await audit(page, `${TAG}:${name}`);
    await snap(page, `${TAG}-${name}`);
    if (a.docH > 900) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await snap(page, `${TAG}-${name}-bottom`); await page.evaluate(() => window.scrollTo(0, 0)); }
    if (verbose) {
      const { links, text, label, title, lang, ...rest } = a;
      const keep = Object.fromEntries(Object.entries(rest).filter(([k, v]) => !(Array.isArray(v) ? v.length === 0 : v === 0 || v === "no" || v === false)));
      console.log(`\n=== ${name} ${page.url().replace(BASE, "")} :: ${JSON.stringify(keep).slice(0, 1400)}`);
      if (process.env.V) { console.log("BTNS:", (await btns()).slice(0, 600)); console.log("TEXT:", text.replace(/\n+/g, " / ").slice(0, 500)); }
    }
    return a;
  } catch (e) { console.log(`!! ${name}: ${String(e.message).split("\n")[0]}`); }
}
const which = process.env.PART ?? "all";
if (which === "all" || which === "a") {
await visit("search", "/app/search");
await visit("search-typed", null, async () => { const i = page.getByRole("searchbox").or(page.locator("input")).first(); await i.fill("chicken"); await settle(page, 1800); });
await visit("map", "/app/map", async () => { await page.getByRole("button", { name: "Use my location" }).click().catch((e) => console.log("loc btn missing")); await settle(page, 4000); });
await visit("groceries", "/app/groceries");
await visit("groceries-search", "/app/groceries/search");
await visit("shop-sainsburys", "/app/groceries/shop?r=sainsburys", () => page.locator("a[href*='/app/groceries/shop/item']").first().waitFor({ timeout: 20000 }));
await visit("shop-item", null, async () => { await page.locator("a[href*='/app/groceries/shop/item']").first().click(); await settle(page, 2000); });
await visit("shop-lidl", "/app/groceries/shop?r=lidl", () => page.locator("a[href*='/app/groceries/shop/item']").first().waitFor({ timeout: 20000 }));
await visit("scan", "/app/groceries", async () => { await page.getByRole("button", { name: /Scan a barcode/ }).click(); await page.waitForURL(/product/, { timeout: 10000 }); await settle(page, 2500); });
await visit("recipes", "/app/recipes", () => page.locator("a[href*='/app/recipes/view']").first().waitFor({ timeout: 20000 }));
await visit("recipe", "/app/recipes/view?id=chicken-curry&r=sainsburys", () => page.getByText("How to make it").first().waitFor({ timeout: 20000 }));
}
if (which === "all" || which === "b") {
await ctx.addInitScript((l) => { if (!localStorage.getItem("mm.v1.shopping")) localStorage.setItem("mm.v1.shopping", l); }, list);
await visit("list", "/app/groceries/list");
await visit("list-recipes", "/app/groceries/list/recipes");
await visit("meals", "/app/meals");
await visit("meals-restaurant", "/app/meals?tab=restaurant");
await visit("compare", "/app/compare");
await visit("compare-dish", "/app/compare?tab=dish");
await visit("today", "/app/today");
await visit("settings", "/app/settings");
await visit("settings-numbers", "/app/settings/numbers");
await visit("offline-page", "/app/offline");
await visit("notfound", "/app/doesnotexist");
await visit("legal-privacy", "/privacy");
await visit("legal-terms", "/terms");
await visit("legal-support", "/support");
}
console.log("ERRS", JSON.stringify({ ...errs, live: [...new Set(errs.live)] }, null, 1).slice(0, 3500));
await browser.close();
