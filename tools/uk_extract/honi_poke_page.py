"""Fetch and read the pages of honipoke.com (a Webflow site) that tools/uk_extract/honi_poke.py needs. Python 3.9.

What is read, and why (see honi_poke.py for the decisions):
  /nutritional-calculator   a page whose bowl table and detail panel are DRAWN BY THE PAGE'S OWN SCRIPT. A browser renders it and
                            this module reads exactly what the page displays (table rows; the panel for each selected bowl).
                            Nothing is recomputed from the script's data. Needs Node + playwright-core + Chromium (paths below).
  /poke /poke-salads /warm-bowls /menu-ramen   the chain's menu listing pages: each card is one dish; a card carries the chain's
                            own "Vegetarian" icon (Vegetarian.svg) when the dish is marked vegetarian.
  /menu/<slug>              one page per dish: the dish name, a "Cal" figure (often empty) and an allergen list.
  /allergens                the allergen matrix (a script-drawn table) with "Review date:".
Politeness: robots.txt is read first and every path is checked with the RFC 9309 matcher (robots_rfc.py); one request per page, one
second apart, a normal browser User-Agent. A disallowed path or any non-200 answer stops the run (never worked round).
"""
from __future__ import annotations
import hashlib
import html
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

import robots_rfc

HOST = "https://www.honipoke.com"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CALC_PATH = "/nutritional-calculator"
ALLERGENS_PATH = "/allergens"
LISTING_PATHS = ["/poke", "/poke-salads", "/warm-bowls", "/menu-ramen"]
DEFAULT_PLAYWRIGHT_DIR = "/tmp/claude-0/-home-user-MenuAi/a431c667-67f2-527e-bd7d-6a276d3d71be/scratchpad/pw/node_modules"
DEFAULT_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

# Run by Node (written to a temporary folder, away from the downloaded pages). It loads the calculator in Chromium, saves the HTML
# the server sent, reads the three tables as displayed, then selects each row (as a visitor would) and reads the detail panel.
NODE_JS = r"""
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(process.env.PLAYWRIGHT_DIR.replace(/\/?$/, '/'));
const { chromium } = require('playwright-core');
const [out, url, rawOut] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: process.env.UA, viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await page.route(/googletagmanager|google-analytics/, (r) => r.abort());
const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
if (!resp || resp.status() !== 200) { console.error('HTTP ' + (resp && resp.status())); process.exit(3); }
fs.writeFileSync(rawOut, await resp.text());
const panel = () => page.evaluate(() => {
  const t = (id) => document.getElementById(id).textContent.trim();
  return { title: t('selectedTitle'), tag: t('selectedTag'), kcal: t('calVal'), protein: t('proVal'), carbs: t('carbVal'),
    fat: t('fatVal'), fibre: t('fibVal'), sodium: t('sodVal'),
    lines: [...document.querySelectorAll('#breakdownList .item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()) };
});
const result = { url, fetched: new Date().toISOString(), tables: {}, panels: {} };
result.tables = await page.evaluate(() => {
  const grab = (gridId) => [...document.querySelectorAll('#' + gridId + ' .bowl-row:not(.head)')].map((r) => ({
    id: r.dataset.id,
    name: r.querySelector('h3').textContent.trim(),
    badge: (r.querySelector('.bowl-badge') || { textContent: '' }).textContent.trim(),
    desc: (r.querySelector('._d') || { textContent: '' }).textContent.trim(),
    cells: [...r.querySelectorAll('.num')].map((n) => n.textContent.trim()) }));
  return { bowlGrid: grab('bowlGrid'), ramenGrid: grab('ramenGrid'), sidesGrid: grab('sidesGrid'),
    heads: [...document.querySelectorAll('#bowlGrid .bowl-row.head .col')].map((n) => n.textContent.trim()) };
});
const modes = { bowlGrid: 'menu', ramenGrid: 'ramen', sidesGrid: 'sides' };
for (const [grid, mode] of Object.entries(modes)) {
  await page.click('#modeToggle button[data-mode="' + mode + '"]');
  for (const row of result.tables[grid]) {
    await page.evaluate(() => document.getElementById('clearBtn').click());
    await page.evaluate(([g, id]) => document.querySelector('#' + g + ' .bowl-row[data-id="' + id + '"]').click(), [grid, row.id]);
    result.panels[row.id] = await panel();
  }
}
result.tabs = await page.evaluate(() => [...document.querySelectorAll('#modeToggle button')].map((b) => b.textContent.trim() + ':' + b.dataset.mode));
fs.writeFileSync(out, JSON.stringify(result, null, 1));
await browser.close();
"""


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class Session:
    """robots.txt rules + polite GETs. `self.log` collects 'path sha256' lines for the report."""

    def __init__(self, dest: Path):
        self.dest = Path(dest)
        self.dest.mkdir(parents=True, exist_ok=True)
        self.log: List[str] = []
        raw = self._get(HOST + "/robots.txt", check=False)
        (self.dest / "robots.txt").write_bytes(raw)
        self.rules = robots_rfc.parse(raw.decode("utf-8", "replace"))
        self.log.append(f"/robots.txt {sha256_bytes(raw)}")

    def _get(self, url: str, check: bool = True) -> bytes:
        path = url[len(HOST):] if url.startswith(HOST) else url
        if check and not robots_rfc.allowed(self.rules, path):
            raise SystemExit(f"robots.txt disallows {path}: not fetched. Send the page to the founder to save by hand instead.")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                if r.status != 200:
                    raise SystemExit(f"{url}: HTTP {r.status}")
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{url}: HTTP {e.code} (not worked round: stop and report this URL)")
        time.sleep(1.0)
        return body

    def page(self, path: str, name: str) -> Path:
        body = self._get(HOST + path)
        dest = self.dest / name
        dest.write_bytes(body)
        self.log.append(f"{path} {sha256_bytes(body)}")
        return dest

    def render_calculator(self, playwright_dir: str, chrome: str) -> None:
        if not robots_rfc.allowed(self.rules, CALC_PATH):
            raise SystemExit(f"robots.txt disallows {CALC_PATH}")
        with tempfile.TemporaryDirectory() as tmp:
            js = Path(tmp) / "render_calc.mjs"
            js.write_text(NODE_JS, encoding="utf-8")
            env = dict(os.environ, PLAYWRIGHT_DIR=playwright_dir, CHROME_PATH=chrome, UA=UA)
            subprocess.run(["node", str(js), str(self.dest / "calculator.json"), HOST + CALC_PATH, str(self.dest / "calculator.html")],
                           check=True, env=env)
        self.log.append(f"{CALC_PATH} {sha256_bytes((self.dest / 'calculator.html').read_bytes())} (HTML as served; the table is drawn by its script)")
        time.sleep(1.0)


def fetch_all(dest: Path, dish_slugs: List[str], playwright_dir: str = DEFAULT_PLAYWRIGHT_DIR, chrome: str = DEFAULT_CHROME) -> List[str]:
    s = Session(dest)
    s.render_calculator(playwright_dir, chrome)
    s.page(ALLERGENS_PATH, "allergens.html")
    for p in LISTING_PATHS:
        s.page(p, "listing_" + p.strip("/") + ".html")
    for slug in dish_slugs:
        s.page("/menu/" + slug, "dish_" + slug + ".html")
    return s.log


# ---------------------------------------------------------------- readers

def _clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ").split())


def read_calculator(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_dish_page(text: str, where: str) -> dict:
    """{'name': h1 text, 'cal': the number printed beside 'Cal' ('' when the field is empty), 'allergens': printed list}."""
    h1 = re.search(r'<h1 class="black-menu-item-title">(.*?)</h1>', text, re.S)
    block = re.search(r'<div class="calories-block">(.*?)</div><div class="ingredients_allergens_div">', text, re.S)
    if not h1 or not block:
        raise SystemExit(f"{where}: the dish page layout changed (title or calories block not found)")
    cells = re.findall(r'<div class="calories[^"]*">(.*?)</div>', block.group(1), re.S)
    if len(cells) != 2 or _clean(cells[1]) != "Cal":
        raise SystemExit(f"{where}: the calories block no longer reads '<number> Cal': {block.group(1)[:200]!r}")
    cal = _clean(cells[0])
    if cal and not re.fullmatch(r"\d+", cal):
        raise SystemExit(f"{where}: unexpected calories text {cal!r}")
    allergens = [_clean(x) for x in re.findall(r'<div class="text-block-16">(.*?)</div>', text, re.S)]
    return {"name": _clean(h1.group(1)), "cal": cal, "allergens": allergens}


def read_listing(text: str, where: str) -> Dict[str, dict]:
    """/menu/<slug> -> {'title', 'vegetarian'}: one entry per dish card; vegetarian = the card shows the chain's Vegetarian.svg icon."""
    out: Dict[str, dict] = {}
    for part in re.split(r'<div role="listitem"', text)[1:]:
        title = re.search(r"<h[1-6][^>]*>(.*?)</h[1-6]>", part, re.S)
        links = re.findall(r'href="/menu/([^"]+)"', part)
        if not title or not links:
            continue
        slug = links[0]
        if slug in out:
            raise SystemExit(f"{where}: dish {slug} appears twice")
        out[slug] = {"title": _clean(title.group(1)), "vegetarian": "Vegetarian.svg" in part}
    if not out:
        raise SystemExit(f"{where}: no dish cards found: the listing layout changed")
    return out


def read_review_date(text: str) -> Optional[str]:
    m = re.search(r"Review date:\s*(\d{2}/\d{2}/\d{4})", _clean(text))
    return m.group(1) if m else None
