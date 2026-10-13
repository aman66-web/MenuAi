import { chromium } from "playwright-core";
import { appendFileSync, writeFileSync } from "node:fs";
export const BASE = "http://localhost:3103";
export const LIVE = "https://numbite.com";
export const OUT = "/private/tmp/claude-501/-Users-amanmarwaha/16547a1c-474c-4edd-a255-a14e3541c438/scratchpad/walk/";
export const onboarded = (extra = {}) => JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 120, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"], language: "en", ...extra } });
export function fakeBridge() {
  window.__bridgeCalls = [];
  window.webkit = { messageHandlers: { menumath: { postMessage(m) {
    window.__bridgeCalls.push(m.action);
    const reply = m.action === "scan" ? { code: "5000157024671" } : m.action === "locate" ? (m.payload.onlyIfAllowed ? { error: "denied" } : { lat: 51.5072, lng: -0.1276 })
      : m.action === "appleSignIn" ? { idToken: "aaa.bbb.ccc", nonce: "n0nceN0nceN0nce" }
      : m.action === "webAuth" ? { authCode: "A".repeat(60), verifier: "v".repeat(64) } : { done: true };
    setTimeout(() => window.__menumathReply(m.id, reply), 50);
  } } } };
}
export async function launch() {
  return chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
}
export async function mk(browser, { settings = onboarded(), scheme = "light", bridge = true, textSize = null, offline = false, logs = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  if (settings) await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  if (bridge) await ctx.addInitScript(fakeBridge);
  const page = await ctx.newPage();
  const errs = { console: [], failed: [], pageerrors: [], live: [] };
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.console.push(`${m.type()}: ${m.text().slice(0, 220)} @${m.location().url?.slice(0, 80)}`); });
  page.on("pageerror", (e) => errs.pageerrors.push(String(e.message).slice(0, 220)));
  page.on("requestfailed", (r) => !/ERR_ABORTED/.test(r.failure()?.errorText ?? "") && errs.failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
  page.on("response", (r) => { if (r.status() >= 400) errs.failed.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
  page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) errs.live.push(r.method() + " " + r.url().slice(0, 140)); });
  return { ctx, page, errs };
}
export async function snap(page, name, { full = false } = {}) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}shots/${name}.png`, fullPage: full });
  return `${OUT}shots/${name}.png`;
}
const FLAG = /TODO|lorem|example\.com|\bsample\b|debug|\bPro\b|subscri|\bbeta\b|placeholder|undefined|\bNaN\b|\[object|null\b|\{[a-z]+\}|FIXME|testing|test mode|localhost|Anthropic|Claude|\bAI\b|trial|paywall|premium|Safari|Home Screen|cookie|install/i;
export async function audit(page, label) {
  const r = await page.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && b.width > 0 && b.height > 0; };
    const nameOf = (el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
    const small = [];
    for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], summary")) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      // inputs that are visually hidden inside a bigger label (checkbox/radio) are ignored when the label is big enough
      let w = b.width, h = b.height;
      const lab = el.closest("label");
      if (lab && (el.type === "checkbox" || el.type === "radio")) { const lb = lab.getBoundingClientRect(); w = Math.max(w, lb.width); h = Math.max(h, lb.height); }
      if (w < 43.5 || h < 43.5) small.push(`${Math.round(w)}x${Math.round(h)} ${el.tagName.toLowerCase()} "${nameOf(el)}"`);
    }
    const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && vis(i)).map((i) => (i.currentSrc || i.src).slice(0, 100));
    const clipped = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!vis(el)) continue;
      const s = getComputedStyle(el);
      if ((s.textOverflow === "ellipsis" || s.overflow === "hidden" || s.webkitLineClamp !== "none") && el.scrollWidth > el.clientWidth + 1 && el.innerText && el.innerText.trim() && el.children.length === 0) clipped.push(`ellipsis/clip "${el.innerText.trim().slice(0, 60)}" (${el.scrollWidth}>${el.clientWidth})`);
      if (s.webkitLineClamp !== "none" && s.webkitLineClamp !== "" && el.scrollHeight > el.clientHeight + 1 && el.innerText) clipped.push(`line-clamp "${el.innerText.trim().slice(0, 60)}"`);
    }
    const hOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const offRight = [];
    for (const el of document.querySelectorAll("body *")) { if (!vis(el)) continue; const b = el.getBoundingClientRect(); if (b.right > window.innerWidth + 2 && b.left < window.innerWidth && getComputedStyle(el).position !== "fixed" && !el.closest("[class*=marquee],[class*=logo-wall],.logo-wall,[aria-hidden=true]")) { offRight.push(`${el.tagName.toLowerCase()} "${(el.innerText || "").trim().slice(0, 40)}" right=${Math.round(b.right)}`); if (offRight.length > 5) break; } }
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    const unlabelled = [...document.querySelectorAll("button, a[href], input, select")].filter((el) => vis(el) && !nameOf(el).replace(/button|a|input|select/i, "").trim() && !el.getAttribute("aria-labelledby") && !el.closest("label")).map((el) => el.outerHTML.slice(0, 100));
    const text = document.body.innerText;
    // tab bar
    let tab = null;
    for (const el of document.querySelectorAll("nav, [role=tablist], footer, div")) { const s = getComputedStyle(el); if (s.position === "fixed" && vis(el)) { const b = el.getBoundingClientRect(); if (b.bottom > window.innerHeight - 40 && b.width > 200) { tab = { top: Math.round(b.top), h: Math.round(b.height), tag: el.tagName, text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 80) }; break; } }
    }
    return { small, brokenImgs, clipped: [...new Set(clipped)].slice(0, 15), hOverflow, offRight, links: [...new Set(links)], unlabelled, text, tab, h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.trim()), docH: document.documentElement.scrollHeight, title: document.title, lang: document.documentElement.lang, backBtn: !![...document.querySelectorAll("a,button")].find((el) => /^\s*back\b/i.test(el.getAttribute("aria-label") || el.innerText || "")) };
  });
  // hidden-behind-tab-bar check: scroll to bottom and compare last visible content to tab bar top
  let behind = null;
  if (r.tab) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    behind = await page.evaluate((tabTop) => {
      let maxBottom = 0, who = "";
      for (const el of document.querySelectorAll("main *, body > * > *")) {
        const s = getComputedStyle(el); if (s.position === "fixed" || s.display === "none" || s.visibility === "hidden") continue;
        const b = el.getBoundingClientRect(); if (b.height === 0 || b.width === 0) continue;
        if (el.children.length === 0 || ["BUTTON", "A", "P", "H1", "H2", "H3", "LI", "INPUT", "SPAN"].includes(el.tagName)) { if (b.bottom > maxBottom && b.top < window.innerHeight) { maxBottom = b.bottom; who = (el.innerText || el.tagName).trim().slice(0, 40); } }
      }
      return { maxBottom: Math.round(maxBottom), tabTop, hidden: maxBottom > tabTop + 1, who };
    }, r.tab.top);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  const hits = [...new Set((r.text.match(new RegExp(FLAG.source, "gi")) || []))];
  const out = { label, title: r.title, h1: r.h1, lang: r.lang, backBtn: r.backBtn, tab: r.tab ? `top=${r.tab.top} h=${r.tab.h}` : "none", behindTab: behind?.hidden ? `YES last="${behind.who}" bottom=${behind.maxBottom} tabTop=${behind.tabTop}` : "no", hOverflow: r.hOverflow, offRight: r.offRight, small: r.small, brokenImgs: r.brokenImgs, clipped: r.clipped, flagWords: hits, unlabelled: r.unlabelled.slice(0, 5) };
  appendFileSync(OUT + "audit.jsonl", JSON.stringify(out) + "\n");
  appendFileSync(OUT + "texts.txt", `\n######## ${label}\n${r.text}\n`);
  return { ...out, docH: r.docH, links: r.links, text: r.text };
}
export function show(a) {
  const { links, text, ...rest } = a;
  console.log(JSON.stringify(rest, null, 1).replace(/\n\s+/g, " ").slice(0, 3000));
}
export async function settle(page, ms = 1200) { await page.waitForTimeout(ms); }
