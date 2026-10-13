import { launch, mk, snap, audit, BASE, OUT, settle, onboarded, show } from "./walk-tmp-lib.mjs";
const SCHEME = process.env.SCHEME ?? "light"; const TEXT = process.env.TEXT ?? "standard"; const TAG = `${SCHEME}${TEXT === "standard" ? "" : "-" + TEXT}`;
const browser = await launch();
const { ctx, page, errs } = await mk(browser, { settings: onboarded(TEXT === "standard" ? {} : { textSize: TEXT }), scheme: SCHEME });
async function sheet(name, open, verbose = true) {
  try {
    await page.goto(BASE + "/app/settings"); await settle(page, 1800);
    await open(); await settle(page, 1200);
    const a = await audit(page, `${TAG}:${name}`);
    await snap(page, `${TAG}-${name}`);
    const { links, text, label, title, lang, ...rest } = a;
    const keep = Object.fromEntries(Object.entries(rest).filter(([k, v]) => !(Array.isArray(v) ? v.length === 0 : v === 0 || v === "no" || v === false)));
    console.log(`\n=== ${name} :: ${JSON.stringify(keep).slice(0, 1200)}`);
    const dlg = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); return d ? d.innerText.replace(/\n+/g, " / ").slice(0, 900) : "(no dialog) " + document.body.innerText.slice(0, 200).replace(/\n+/g, " / "); });
    console.log("DIALOG:", dlg);
    return a;
  } catch (e) { console.log(`!! ${name}: ${String(e.message).split("\n")[0]}`); }
}
await sheet("settings-top", async () => {});
await sheet("account-open", () => page.getByRole("button", { name: "Sign in", exact: true }).click());
await sheet("account-email", async () => { await page.getByRole("button", { name: "Sign in", exact: true }).click(); await settle(page, 700); await page.getByRole("dialog").getByRole("button", { name: /email/i }).click(); });
await sheet("language", () => page.getByRole("button", { name: "Change" }).first().click());
await sheet("clear-data", () => page.getByRole("button", { name: /Clear data on this device/ }).click());
await sheet("contact", () => page.getByRole("button", { name: "Contact us" }).click());
await sheet("numbers", () => page.getByRole("link", { name: "How we get our numbers" }).click());
await sheet("diet", async () => { await page.getByRole("button", { name: "Vegan" }).first().click(); });
console.log("ERRS", JSON.stringify({ ...errs, live: [...new Set(errs.live)].filter((x) => !/sainsburys|openfree/.test(x)) }, null, 1).slice(0, 2500));
await browser.close();
