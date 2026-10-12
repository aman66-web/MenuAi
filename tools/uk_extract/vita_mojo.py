"""Shared reader for chains whose own ordering site runs on Vita Mojo (<chain>.vmos.io or the chain's own order.<domain>), where the
calories (or the full "Nutrition facts per serving") appear only after a shop is picked. Used by deep_blue.py and grounded_kitchen.py.

How a visitor sees it: the shop list (store/store-selection), then a shop's menu (store/<shop>/menu/overview?menuUUID=<menu>), its category
pages (.../menu/category/<category>/bundles?menuUUID=<menu>), each tile printing the name, the price and "NNN kcal", and a product's page
(.../category/<category>/bundle/<product>/bundleCustomization?menuUUID=<menu>) whose "Nutrition" tab prints "Nutrition facts per serving".
The pages load their data from vmos2.vmos.io (the platform's API, no login: the same requests every visitor's browser makes).

What is copied: only what the rendered pages print (the tile's "NNN kcal", the Nutrition tab's per-serving figures), read from the page text by
harvest() below with a headless Chromium (Node + playwright-core), one shop at a time, one page at a time, `delay` seconds between pages.
The API answers the pages load are saved beside them and used only to CHECK the copy (check_listing / check_nutrition): never as a figure.

Politeness and stops: robots.txt of the ordering host and of vmos2.vmos.io is read and matched (RFC 9309, robots_rfc via
images_common._robots_allow) before anything is opened; any 401/403/429 answer, a challenge page, or a page whose data never arrives stops
the run (never worked round: no other user agent, no direct API calls in place of the pages).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import images_common as ic

PLAYWRIGHT = "/home/user/MenuAi/web/e2e/node_modules/playwright-core"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
UA = ic.UA
API = "https://vmos2.vmos.io"

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [chrome, ua, outDir, delay, origin, mode, skip, ...stores] = process.argv.slice(3);
const SKIP = new RegExp(skip, 'i');
const BLOCK = /bugsnag|doubleclick|google-analytics|googletagmanager|facebook|domdog|workers\.dev|hotjar|clarity|tiktok|analytics\.google/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const launch = { executablePath: chrome, args: ['--no-sandbox'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY };
  const browser = await chromium.launch(launch);
  for (const spec of stores) {
    const [store, menu] = spec.split(':');
    if (fs.existsSync(`${outDir}/${store}.done`)) continue;
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1280, height: 1000 }, locale: 'en-GB' });
    await ctx.route(BLOCK, (r) => r.abort());
    const page = await ctx.newPage();
    const got = {};
    const pending = [];
    const bad = [];
    page.on('response', (r) => {
      const u = r.url();
      const s = r.status();
      if ([401, 403, 429].includes(s) && !BLOCK.test(u)) bad.push(`${s} ${u}`);
      let key = null;
      let m;
      if (/vmos2\.vmos\.io\/catalog\/v2\/menu$/.test(u)) key = 'menu';
      else if ((m = u.match(/vmos2\.vmos\.io\/catalog\/categories\/([0-9a-f-]+)\/bundles/))) key = `cat_${m[1]}`;
      else if ((m = u.match(/vmos2\.vmos\.io\/catalog\/bundles\/([0-9a-f-]+)\?categoryUUID=/))) key = `prod_${m[1]}`;
      else if ((m = u.match(/vmos2\.vmos\.io\/tenant\/v1\/stores\/([0-9a-f-]{36})$/))) key = 'store';
      if (key) pending.push(r.text().then((t) => { fs.writeFileSync(`${outDir}/${store}_${key}.json`, `// ${u}\n${t}`); got[key] = true; }).catch(() => {}));
    });
    const waitFor = async (key, what) => {
      for (let i = 0; i < 60 && !got[key]; i++) {
        if (bad.length) throw new Error(`refused: ${bad.join(' | ')}: stop, never work round it`);
        await sleep(500);
      }
      await Promise.all(pending);
      if (!got[key]) throw new Error(`no data for ${what} (${key}): the page changed or did not load: stop and look`);
    };
    const open = async (url) => {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (!resp || resp.status() !== 200) throw new Error(`HTTP ${resp && resp.status()} for ${url}`);
      const head = (await page.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 400);
      if (/just a moment|verify you are human|attention required|access denied/i.test(head)) throw new Error(`challenge page at ${url}: stop, never work round it`);
    };
    await open(`${origin}/store/${store}/menu/overview?menuUUID=${menu}`);
    await waitFor('menu', 'the menu');
    await waitFor('store', 'the shop');
    const menus = JSON.parse(fs.readFileSync(`${outDir}/${store}_menu.json`, 'utf8').split('\n').slice(1).join('\n')).payload;
    const m0 = menus.find((x) => x.uuid === menu);
    if (!m0) throw new Error(`menu ${menu} not offered at shop ${store}`);
    for (const c of m0.categories) {
      if (SKIP.test(c.name)) continue;
      await sleep(Number(delay) * 1000);
      await open(`${origin}/store/${store}/menu/category/${c.uuid}/bundles?menuUUID=${menu}`);
      await waitFor(`cat_${c.uuid}`, `category ${c.name}`);
      await sleep(2500);
      fs.writeFileSync(`${outDir}/${store}_cat_${c.uuid}.txt`, await page.evaluate(() => document.body.innerText));
      if (mode !== 'products') continue;
      const cat = JSON.parse(fs.readFileSync(`${outDir}/${store}_cat_${c.uuid}.json`, 'utf8').split('\n').slice(1).join('\n')).payload;
      for (const b of cat.bundles) {
        if (fs.existsSync(`${outDir}/${store}_prod_${b.uuid}.txt`)) continue;
        await sleep(Number(delay) * 1000);
        await open(`${origin}/store/${store}/menu/category/${c.uuid}/bundle/${b.uuid}/bundleCustomization?menuUUID=${menu}`);
        await waitFor(`prod_${b.uuid}`, `product ${b.name}`);
        await sleep(2000);
        const tab = page.getByText('Nutrition', { exact: true }).locator('visible=true').first();
        let txt = '';
        if (await tab.count()) {
          await tab.click({ timeout: 10000, force: true });
          await sleep(1500);
          txt = await page.evaluate(() => document.body.innerText);
        } else {
          txt = 'NO NUTRITION TAB\n' + await page.evaluate(() => document.body.innerText);
        }
        fs.writeFileSync(`${outDir}/${store}_prod_${b.uuid}.txt`, txt);
      }
    }
    if (bad.length) throw new Error(`refused: ${bad.join(' | ')}: stop, never work round it`);
    fs.writeFileSync(`${outDir}/${store}.done`, new Date().toISOString() + '\n');
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
"""


def check_robots(origin: str) -> None:
    """The ordering host's and the API host's robots.txt must allow every kind of address the pages use (RFC 9309)."""
    samples = [f"{origin}/store/store-selection?app=online", f"{origin}/store/x/menu/overview?menuUUID=y",
               f"{origin}/store/x/menu/category/c/bundles?menuUUID=y", f"{origin}/store/x/menu/category/c/bundle/b/bundleCustomization?menuUUID=y",
               f"{API}/catalog/v2/menu", f"{API}/catalog/categories/c/bundles?forceStockStatus=0", f"{API}/catalog/bundles/b?categoryUUID=c",
               f"{API}/tenant/v1/stores/tenant?offset=0&limit=15", f"{API}/tenant/v1/bootstrap"]
    for u in samples:
        if not ic._robots_allow(u):
            raise SystemExit(f"robots.txt disallows {u}: stop (never work round it)")


def harvest(cache: Path, origin: str, stores: list[tuple[str, str]], *, products: bool, skip: str, delay: float = 2.0) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    check_robots(origin)
    js = cache / "capture.js"
    js.write_text(CAPTURE_JS)
    todo = [f"{s}:{m}" for s, m in stores if not (cache / f"{s}.done").exists()]
    if not todo:
        return
    r = subprocess.run(["node", str(js), PLAYWRIGHT, CHROME, UA, str(cache), str(delay), origin, "products" if products else "listing", skip, *todo],
                       capture_output=True, text=True, timeout=4 * 3600, env=os.environ.copy())
    if r.returncode != 0:
        raise SystemExit("capturing the shop pages failed (a 401/403/429, a challenge page or a changed layout are NOT to be worked round: "
                         "stop and report):\n" + r.stderr[-1500:])


# ---------------------------------------------------------------- reading what was saved
def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8").split("\n", 1)[1])


def categories(cache: Path, store: str, menu: str) -> list[dict]:
    menus = load_json(cache / f"{store}_menu.json")["payload"]
    return next(m for m in menus if m["uuid"] == menu)["categories"]


def bundles(cache: Path, store: str, cat: str) -> list[dict]:
    return load_json(cache / f"{store}_cat_{cat}.json")["payload"]["bundles"]


def store_info(cache: Path, store: str) -> dict:
    return load_json(cache / f"{store}_store.json")["payload"]


KCAL_LINE = re.compile(r"^(\d+) kcal$")
PRICE_LINE = re.compile(r"^£\d+(\.\d\d)?$")


def listing_kcal(text: str, names: list[str]) -> dict[str, list[str | None]]:
    """For each product name, the kcal printed on each of its tiles in the rendered category page (a tile is: name, price, ',', 'NNN kcal';
    no kcal line when the shop prints none). A name not found on the page maps to []."""
    lines = [" ".join(ln.split()) for ln in text.splitlines()]
    key = {" ".join(n.split()): n for n in names}  # the page collapses runs of spaces; the data may not
    want = set(key)
    out: dict[str, list[str | None]] = {n: [] for n in names}
    for i, ln in enumerate(lines):
        if ln not in want:
            continue
        kc = None
        for nxt in lines[i + 1:i + 5]:
            m = KCAL_LINE.match(nxt)
            if m:
                kc = m.group(1)
                break
            if nxt in want and nxt != ln:
                break
        # only a real tile: the next line is its price, or the "," that follows the price slot when a product shows none
        if i + 1 < len(lines) and (PRICE_LINE.match(lines[i + 1]) or lines[i + 1] == ","):
            out[key[ln]].append(kc)
    return out


NUTRITION_ROWS = [("calories", r"Energy \(kcal\)", ""), ("energy_kj", r"Energy \(kJ\)", ""), ("fat_g", r"Fats", " g"),
                  ("carbs_g", r"Carbs", " g"), ("sat_fat_g", r"of which saturates", " g"), ("sugar_g", r"of which sugars", " g"),
                  ("protein_g", r"Proteins", " g"), ("fiber_g", r"Fibres", " g"), ("salt_g", r"Salt", " g")]


def nutrition_from_text(text: str) -> dict[str, str] | None:
    """The 'Nutrition facts per serving' block of a product page as printed ('Fats 5.1 g' -> fat_g '5.1'), or None when the page has none."""
    if "Nutrition facts per serving" not in text:
        return None
    block = text.split("Nutrition facts per serving", 1)[1]
    block = re.split(r"\n(?:Customisations|Browse Customizations|Add to (?:order|basket))", block)[0]
    out = {}
    for key, label, unit in NUTRITION_ROWS:
        m = re.search(r"^" + label + r" (\d+(?:\.\d+)?)" + re.escape(unit) + r"$", block, re.M)
        if m:
            out[key] = m.group(1)
    return out


def base_items(b: dict) -> list[dict]:
    return [it for it in b.get("items", []) if it.get("type") == "BUNDLE_BASE"]


def size_count(b: dict) -> int:
    n = 1
    for it in base_items(b):
        for c in it.get("customizations") or []:
            if c.get("type") == "size":
                n = max(n, len(c.get("variations") or []))
    return n
