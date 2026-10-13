import { launch, mk, snap, audit, show, BASE, OUT, settle, onboarded } from "./walk-tmp-lib.mjs";
const SCHEME = process.env.SCHEME ?? "light"; const TEXT = process.env.TEXT ?? "standard"; const TAG = `${SCHEME}${TEXT === "standard" ? "" : "-" + TEXT}`;
const browser = await launch();
const { ctx, page, errs } = await mk(browser, { settings: onboarded(TEXT === "standard" ? {} : { textSize: TEXT }), scheme: SCHEME });
const btns = () => page.evaluate(() => [...document.querySelectorAll("button,a")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute("aria-label") || b.innerText).replace(/\s+/g, " ").trim().slice(0, 40)).join(" | "));
async function visit(name, path, prep, { verbose = true, bottom = true } = {}) {
  try {
    if (path) await page.goto(BASE + path);
    await settle(page, 1800);
    if (prep) await prep();
    await settle(page, 600);
    const a = await audit(page, `${TAG}:${name}`);
    await snap(page, `${TAG}-${name}`);
    if (bottom && a.docH > 900) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await snap(page, `${TAG}-${name}-bottom`); await page.evaluate(() => window.scrollTo(0, 0)); }
    if (verbose) { console.log(`\n=== ${name} ${page.url().replace(BASE, "")}`); show(a); console.log("BTNS:", (await btns()).slice(0, 700)); console.log("TEXT:", a.text.replace(/\n+/g, " / ").slice(0, 600)); }
    return a;
  } catch (e) { console.log(`!! ${name}: ${String(e.message).split("\n")[0]}`); }
}
const wantMore = process.env.MORE;
await visit("home", "/app");
await visit("eat-out", "/app/eat-out", () => page.getByText(/\d{3} UK restaurants/).waitFor({ timeout: 15000 }));
await visit("eat-out-search", null, async () => { await page.getByRole("searchbox").or(page.getByRole("textbox")).first().fill("chicken"); await settle(page, 1500); });
await visit("eat-out-more", "/app/eat-out", async () => { await page.getByRole("button", { name: /More ways to find/ }).click(); await settle(page, 600); });
await visit("favourites", "/app/eat-out/favourites");
await visit("chain-kfc", "/app/chain?id=kfc", () => page.getByRole("heading", { level: 1, name: /KFC/ }).waitFor({ timeout: 15000 }));
await visit("item", null, async () => { await page.locator("a[href*='/app/item?chain=kfc']").first().click(); await page.getByRole("button", { name: "Log" }).waitFor({ timeout: 10000 }); });
console.log("ITEM URL", page.url());
await visit("builder", null, async () => { const b = page.getByRole("link", { name: /build|customi/i }).or(page.getByRole("button", { name: /build|customi/i })).first(); console.log("builder btn count", await b.count()); if (await b.count()) await b.click(); });
console.log("ERRS", JSON.stringify(errs, null, 1).slice(0, 2500));
await browser.close();
