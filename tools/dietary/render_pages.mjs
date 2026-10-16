// Renders pages in headless Chromium (for sites whose text is built by JavaScript) and writes the visible text.
//   node tools/dietary/render_pages.mjs URLS.json OUT.json [concurrency]
// URLS.json: [{ "chain": "...", "url": "..." }]. The caller has ALREADY checked robots.txt (RFC 9309) for every url;
// this script never follows a link, never submits a form and stops a chain's list at a bot-check page.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/opt/node-tools/package.json");
const { chromium } = require("playwright-core");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const [, , urlsFile, outFile, conc = "3"] = process.argv;
const jobs = JSON.parse(fs.readFileSync(urlsFile, "utf8"));
const CHALLENGE = /_Incapsula_Resource|Incapsula incident|Just a moment\.\.\.|Attention Required! \| Cloudflare|Pardon Our Interruption|px-captcha|Access Denied|Checking your browser|Enable JavaScript and cookies to continue|Sorry, you have been blocked|Verify you are human|captcha-delivery/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--proxy-server=http://127.0.0.1:37299"] });
const results = [];
const hostNext = new Map();
const blockedChains = new Set();
async function pace(host) {
  const now = Date.now();
  const at = Math.max(hostNext.get(host) ?? 0, now);
  hostNext.set(host, at + 1500);
  if (at > now) await sleep(at - now);
}
async function one(job) {
  if (blockedChains.has(job.chain)) return { ...job, skipped: "chain stopped after a refusal or challenge" };
  const host = new URL(job.url).host;
  await pace(host);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    // no images/media/fonts: we only read words
    await page.route("**/*", (r) => (["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    const resp = await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 35000 });
    const status = resp ? resp.status() : 0;
    if ([401, 403, 429].includes(status)) { blockedChains.add(job.chain); return { ...job, status, blocked: `HTTP ${status}` }; }
    try { await page.waitForLoadState("networkidle", { timeout: 12000 }); } catch {}
    await sleep(1500);
    // single-page sites build their words late: wait while the text is still short or still growing (20 s at most)
    {
      let last = -1, stable = 0;
      for (let i = 0; i < 13 && stable < 2; i++) {
        const len = await page.evaluate(() => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
        stable = len === last && len > 400 ? stable + 1 : 0;
        last = len;
        if (stable < 2) await sleep(1500);
      }
    }
    // Read the page as it is, then open closed FAQ items that sit INSIDE the page's main content (never the header, menu, cart or a dialog:
    // clicking those hides the page) and read it again. Both texts are kept, so nothing a click hides is lost.
    const grab = () => page.evaluate(() => ({ title: document.title, text: document.body ? document.body.innerText : "", html: document.documentElement.innerHTML.length, finalUrl: location.href,
      links: [...document.querySelectorAll("a[href]")].map((a) => [a.href, (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 120)]).slice(0, 600) }));
    const before = await grab();
    let after = null;
    try {
      const n = await page.evaluate(() => {
        let clicked = 0;
        document.querySelectorAll("details:not([open])").forEach((d) => d.setAttribute("open", ""));
        const bad = "header, nav, footer, dialog, [role=dialog], [role=navigation], [class*=cart], [class*=Cart], [class*=menu], [class*=Menu], [class*=nav], [class*=Nav], [class*=cookie], [class*=Cookie], [id*=cookie], [id*=cart]";
        const good = "main, article, [role=main], [class*=faq], [class*=Faq], [class*=FAQ], [class*=accordion], [class*=Accordion], [class*=collaps], [class*=Collaps]";
        for (const el of document.querySelectorAll('[aria-expanded="false"]')) {
          if (clicked >= 80 || el.tagName === "A" || !el.closest(good) || el.closest(bad)) continue;
          if ((el.innerText || "").length > 300) continue;
          try { el.click(); clicked++; } catch {}
        }
        return clicked;
      });
      // question rows that mention halal (accordion titles built from plain elements): click each once so its answer appears
      const m = await page.evaluate(() => {
        let clicked = 0;
        const bad = "header, nav, footer, dialog, [role=dialog], [class*=cart], [class*=Cart], [class*=cookie], [class*=Cookie]";
        const els = [...document.querySelectorAll("button, summary, [role=button], [role=tab], h2, h3, h4, h5, li, p, span, div")];
        for (const el of els) {
          const t = (el.innerText || "").trim();
          if (t.length < 8 || t.length > 160 || !/halal/i.test(t) || !t.endsWith("?")) continue;
          if (el.closest("a[href]") || el.closest(bad) || el.querySelector("a[href]")) continue;
          if ([...el.children].some((c) => /halal/i.test(c.innerText || "") && (c.innerText || "").trim().length >= 8)) continue; // click the innermost
          try { el.click(); clicked++; } catch {}
          if (clicked >= 6) break;
        }
        return clicked;
      });
      if (n > 0 || m > 0) { await sleep(1500); after = await grab(); }
    } catch {}
    const data = after && after.text.length >= before.text.length * 0.6 ? { ...after, text: before.text + "\n--- AFTER OPENING FAQ ITEMS ---\n" + after.text } : before;
    if (CHALLENGE.test(data.text.slice(0, 3000)) && data.text.length < 3000) { blockedChains.add(job.chain); return { ...job, status, blocked: "bot check / challenge page" }; }
    return { ...job, status, finalUrl: data.finalUrl, title: data.title, text: data.text, links: data.links };
  } catch (e) {
    return { ...job, error: String(e).slice(0, 200) };
  } finally {
    await ctx.close();
  }
}
let idx = 0;
async function worker() {
  while (idx < jobs.length) {
    const j = jobs[idx++];
    const r = await one(j);
    results.push(r);
    process.stderr.write(`${r.chain} ${r.url} -> ${r.blocked ?? r.error ?? r.status} ${r.text ? r.text.length : 0}\n`);
    fs.writeFileSync(outFile, JSON.stringify(results));
  }
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
await browser.close();
fs.writeFileSync(outFile, JSON.stringify(results));
