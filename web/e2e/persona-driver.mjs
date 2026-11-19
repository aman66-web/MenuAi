// A phone for one usability tester (founder 2026-11-19: "Get a few AI agents to act like 80-year-old granddads and grandmas and see how well ... they are able
// to use my app"). One private headless phone (390 x 844, touch, en-GB) per tester, kept open between steps, so a tester taps by the words on screen and gets
// back what the screen now says and a screenshot. Nothing real is reached: the app under test runs on this Mac.
//   node e2e/persona-driver.mjs <port> <base url> <screenshot dir>
//   curl -s localhost:<port> -d '{"do":"goto","path":"/app/welcome"}'
//   {"do":"tap","name":"Get started"}   a button, link, tab, radio or checkbox by its words (or any text on screen)
//   {"do":"type","name":"Search groceries","value":"milk"}   a field by its label or placeholder; {"do":"press","key":"Enter"}
//   {"do":"scroll","dir":"down"|"up"}   {"do":"back"}   {"do":"look"}   (look: just the screen as it is)
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";

const [port, base, shots] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: "en-GB", serviceWorkers: "block" });
const page = await ctx.newPage();
let n = 0;

const ROLES = ["button", "link", "tab", "radio", "checkbox", "menuitem", "option", "switch", "combobox"];
async function find(name) {
  for (const role of ROLES) {
    const exact = page.getByRole(role, { name, exact: true });
    if (await exact.count()) return exact.first();
  }
  for (const role of ROLES) {
    const loose = page.getByRole(role, { name });
    if (await loose.count()) return loose.first();
  }
  const text = page.getByText(name, { exact: false });
  return (await text.count()) ? text.first() : null;
}

async function screen() {
  await page.waitForTimeout(700);
  const file = `${shots}/step-${String(++n).padStart(3, "0")}.png`;
  await page.screenshot({ path: file });
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{3,}/g, "\n\n").slice(0, 3500);
  const taps = await page.evaluate(() => [...document.querySelectorAll("button, a, [role=tab], [role=radio], [role=checkbox], [role=switch], input, select, textarea")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; })
    .map((e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40));
  return { url: page.url().replace(base, ""), screenshot: file, onScreenNow: taps, pageText: text };
}

createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  let out;
  try {
    const cmd = JSON.parse(body || "{}");
    if (cmd.do === "goto") await page.goto(base + (cmd.path ?? "/app"), { waitUntil: "domcontentloaded", timeout: 60000 });
    else if (cmd.do === "tap") {
      const el = await find(cmd.name);
      if (!el) throw new Error(`Nothing on screen called "${cmd.name}"`);
      await el.scrollIntoViewIfNeeded();
      await el.tap({ timeout: 8000 });
    } else if (cmd.do === "type") {
      const field = [page.getByLabel(cmd.name), page.getByPlaceholder(cmd.name), page.getByRole("textbox", { name: cmd.name }), page.getByRole("searchbox", { name: cmd.name })];
      let done = false;
      for (const f of field) if (!done && (await f.count())) { await f.first().fill(cmd.value ?? ""); done = true; }
      if (!done) throw new Error(`No field called "${cmd.name}"`);
    } else if (cmd.do === "press") await page.keyboard.press(cmd.key ?? "Enter");
    else if (cmd.do === "scroll") await page.mouse.wheel(0, cmd.dir === "up" ? -600 : 600);
    else if (cmd.do === "back") await page.goBack();
    out = { ok: true, ...(await screen()) };
  } catch (e) {
    out = { ok: false, error: String(e.message).split("\n")[0], ...(await screen().catch(() => ({}))) };
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(out, null, 1));
}).listen(port, "127.0.0.1", () => console.log(`persona phone on ${port}`));
