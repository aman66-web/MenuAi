#!/usr/bin/env python3
"""Build data/source/fireaway/ from the menu Fireaway's own website shows its customers (a CALORIES-ONLY chain).

    python3 tools/uk_extract/fireaway.py CACHE_DIR --fetch                       # robots check, locations page, then the menu pages of STORES
    python3 tools/uk_extract/fireaway.py CACHE_DIR --checked-on 2026-10-10 [--out DIR]

Source: https://www.fireaway.co.uk/menu (a JavaScript ordering page built on Solutions4Delivery). Every product card prints the product, its size or crust
("12" Large Regular Crust", "6PC", "330ml"), its price and "NNN kcal". The page loads the menu of the shop the visitor picked (`/menu/pizza?store=ID`, the link
each shop has on https://www.fireaway.co.uk/locations) from `/menuV2/getMenuByCategory?...&storeId=ID` on the same host. robots.txt
(https://www.fireaway.co.uk/robots.txt, `User-agent: *`) disallows only checkout, login, register, account, error and content-editing paths: /menu/... and /locations
are allowed (checked with robots_rfc.py before every fetch). No login, no challenge page. api.fireaway.co.uk (the store look-up the page itself calls) has no robots.txt (404).
Needs Node with playwright-core and a Chromium (the pattern of wetherspoon_pages.py); one browser context per shop, one page at a time, 3 seconds between pages.

What is copied: the figure the page prints on each card (the text of `data-testid="product-<id>-calories"`), read from the rendered page. On a pizza card that figure is the
whole pizza at the size shown (the site adds the base of that size/crust and the kcal of the default toppings; `check_against_feed` repeats that sum from the feed as an
independent test and the run stops if one card differs). Nothing is added up or converted for the data itself.

Shops: the locations page lists 139 shops: 130 Fireaway-branded shops in Great Britain, 4 in Northern Ireland (BT postcodes, one of them the test shop 'S4D Test'), 5 pub kitchens under
other names. The kcal is not store-specific on its own site (all 8 shops read gave the same figure for every product), but the rule for chains with several sites is applied anyway: a product is published
only when the same name (and size) prints the same kcal at 2 or more of the shops read, and left out if any shop prints another figure (the run lists any such product).
STORES below: Clapham (London), Aberdeen (Scotland), Cardiff (Wales), Preston (North West), Nottingham (East Midlands), Plymouth (South West), Norwich (East), Harborne (West Midlands).

Left out on purpose:
- both Build Your Own pizzas ("Build Your Own - 4 Toppings", "- Unlimited"): the card prints 656 kcal for the base only, before the customer chooses toppings, and the price is "From";
- every product whose card prints no kcal (Cheesy Bites, Baked Parms, Caesar Salad, the dips, Gelato tub, Still Water, Irn Bru);
- other sizes and crusts of a pizza (7", 9", 14", thin, thick, gluten free): the cards show only the default 12" Regular Crust, and the other figures appear only when a size is chosen on
  the product page (not read: that would be a request per product, size and shop).
Allergens: none. The website shows only a few allergen icons per card; the chain's allergen matrix is a PDF on cdn.prd01firuk.solutions4delivery.com, a host whose robots.txt request
answers HTTP 400 (not a robots.txt), so it was not downloaded.
Tags: vegetarian only where the chain's own data marks the product vegetarian (property code VEG in the menu feed: Veggie Supreme) or its name says Vegan; contains_beef / contains_pork
only where the printed description says beef or pork (or bacon/ham/sausage not marked turkey/beef); everything else is "meat type not stated".
"""
from __future__ import annotations

import argparse
import collections
import html
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "fireaway"
HOST = "www.fireaway.co.uk"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
PLAYWRIGHT = "/home/user/MenuAi/web/e2e/node_modules/playwright-core"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
SOURCE_URL = f"{BASE}/menu"
SOURCE_TITLE = "Fireaway online menu with calories (fireaway.co.uk/menu, as shown to customers of 8 shops, October 2026)"
NOTE = ("Calories only, as the Fireaway website prints them for each product. A pizza's figure is for the whole pizza at the size shown. Sauce flavours, "
        "mix-ins and extra toppings you choose are not counted. Other pizza sizes and crusts are not listed.")
CATEGORIES = [("pizza", "Pizzas"), ("specials", "Specials"), ("sides", "Sides & Salads"), ("pasta", "Pasta"),
              ("milkshakes", "Milkshakes"), ("desserts", "Desserts"), ("drinks", "Drinks")]
# (store id on the locations page, name, region)
STORES = [(45, "Clapham", "London"), (5, "Aberdeen", "Scotland"), (41, "Cardiff", "Wales"), (124, "Preston", "North West"),
          (116, "Nottingham", "East Midlands"), (122, "Plymouth", "South West"), (114, "Norwich", "East of England"),
          (80, "Harborne", "West Midlands")]
MIN_STORES = 2
EXPECTED_ITEMS = 62  # as read on 2026-10-10; a different count stops the run so a human looks at the change
EXCLUDE_NAMES = {"build your own - 4 toppings", "build your own - unlimited"}  # base-only figure, customer chooses the toppings

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [chrome, ua, outDir, delay, ...stores] = process.argv.slice(3);
const CATS = ['pizza', 'specials', 'sides', 'pasta', 'milkshakes', 'desserts', 'drinks'];
const BLOCK = /reddit|doubleclick|google|facebook|appsflyer|app-us1|clarity|hotjar|tiktok|snap|prism|analytics/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  for (const store of stores) {
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1280, height: 1600 }, locale: 'en-GB' });
    await ctx.route(BLOCK, (r) => r.abort());
    const page = await ctx.newPage();
    const pending = [];
    const log = [];
    let cat = '';
    let n = 0;
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('fireaway.co.uk/menuV2/getMenuByCategory')) {
        const f = `${outDir}/store${store}_${cat}_feed${n++}.json`;
        log.push(`${cat} ${r.status()} ${u}`);
        pending.push(r.text().then((t) => fs.writeFileSync(f, t)).catch(() => {}));
      }
      if (r.status() === 403 || r.status() === 429) log.push(`!! ${r.status()} ${u}`);
    });
    for (const c of CATS) {
      cat = c; n = 0;
      const url = c === 'pizza' ? `https://www.fireaway.co.uk/menu/pizza?store=${store}` : `https://www.fireaway.co.uk/menu/${c}`;
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      if (!resp || resp.status() !== 200) throw new Error(`HTTP ${resp && resp.status()} for ${url}`);
      await sleep(1500);
      const txt = await page.evaluate(() => document.body.innerText);
      if (/just a moment|verify you are human|attention required/i.test(txt.slice(0, 400))) throw new Error('challenge page at ' + url + ': stop, never work round it');
      await Promise.all(pending);
      fs.writeFileSync(`${outDir}/store${store}_${c}.html`, await page.content());
      await sleep(Number(delay) * 1000);
    }
    fs.writeFileSync(`${outDir}/store${store}_requests.log`, log.join('\n') + '\n');
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
"""


# ---------------------------------------------------------------------------------------------- fetching (polite, robots-checked)
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    robots = cache / "robots.txt"
    if not robots.exists():
        if curl(f"{BASE}/robots.txt", robots) != 200:
            raise SystemExit(f"cannot read {BASE}/robots.txt: stop (never work round it)")
        time.sleep(1.1)
    rules = robots_rfc.parse(robots.read_text(encoding="utf-8-sig"))
    paths = ["/locations", "/menuV2/getMenuByCategory", *[f"/menu/{c}" for c, _ in CATEGORIES], *[f"/menu/pizza?store={sid}" for sid, _, _ in STORES]]
    for p in paths:
        if not robots_rfc.allowed(rules, p):
            raise SystemExit(f"robots.txt disallows {p}: stop (never work round it)")
    loc = cache / "locations.html"
    if not loc.exists():
        if curl(f"{BASE}/locations", loc) != 200:
            raise SystemExit("HTTP error for /locations")
        time.sleep(1.1)
    js = cache / "capture.js"
    js.write_text(CAPTURE_JS)
    todo = [str(sid) for sid, _, _ in STORES if not (cache / f"store{sid}_requests.log").exists()]
    if todo:
        r = subprocess.run(["node", str(js), PLAYWRIGHT, CHROME, UA, str(cache), "3", *todo], capture_output=True, text=True, timeout=3600)
        if r.returncode != 0:
            raise SystemExit("capturing the menu pages failed (a 403, a challenge page or a changed layout are NOT to be worked round: stop and report):\n" + r.stderr[-800:])


# ---------------------------------------------------------------------------------------------- reading the rendered pages
def text_of(h: str, pid: str, tid: str) -> str | None:
    m = re.search(r'data-testid="product-%s-%s"[^>]*>(.*?)</(?:span|p|h3|button)>' % (pid, tid), h, re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else None


def read_cards(path: Path) -> list[dict]:
    h = path.read_text(encoding="utf-8")
    cards = []
    for m in re.finditer(r'data-testid="product-(\d+)-card-headline">(.*?)</h3>', h, re.S):
        pid = m.group(1)
        kcal = text_of(h, pid, "calories")
        if kcal is not None:
            mm = re.fullmatch(r"(\d+) kcal", kcal)
            if not mm:
                raise SystemExit(f"{path.name}: product {pid} prints {kcal!r}, not 'NNN kcal': the page changed shape")
            kcal = mm.group(1)
        cards.append(dict(id=pid, name=html.unescape(m.group(2)).strip(), info=text_of(h, pid, "card-info-title"),
                          desc=text_of(h, pid, "card-description"), kcal=kcal, price=text_of(h, pid, "card-price")))
    if not cards:
        raise SystemExit(f"{path.name}: no product cards found: the page changed shape")
    return cards


def feed_products(cache: Path, store: int, cat: str, check_store: bool = True) -> dict[int, dict]:
    """Products of the feed the page loaded for this store (the last getMenuByCategory answer, which carries storeId=<store>)."""
    log = (cache / f"store{store}_requests.log").read_text()
    lines = [ln for ln in log.splitlines() if ln.startswith(cat + " ")]
    if not lines or "!!" in log:
        raise SystemExit(f"store {store} {cat}: no feed request logged or a 403/429 was seen: stop")
    if check_store and f"storeId={store}" not in lines[-1]:
        raise SystemExit(f"store {store} {cat}: the page did not load the menu of this shop ({lines[-1]})")
    files = sorted(cache.glob(f"store{store}_{cat}_feed*.json"), key=lambda p: int(re.search(r"feed(\d+)", p.name).group(1)))
    feed = json.loads(files[-1].read_text(encoding="utf-8"))
    return {p["id"]: p for blk in feed for p in blk["products"]}


def feed_kcal(p: dict) -> str | None:
    """Independent re-computation of what the page shows: the default option's own kcal plus the kcal of the default toppings for that option."""
    opt = next((o for o in p["options"] if o.get("isDefault")), p["options"][0] if p["options"] else None)
    if not opt:
        return None
    base = [n["value"] for n in opt.get("nutrients", []) if n["name"] == "Kcal"]
    if not base:
        return None
    extra = [n["value"] for n in p.get("nutrients", []) if n["name"] == "Kcal" and n.get("optionId") == opt["id"]]
    return str(int(round(base[0] + sum(extra))))


def check_against_feed(cache: Path) -> int:
    """Every kcal the page prints must equal the feed's own sum; returns the number of cards compared, stops on a difference."""
    n = 0
    for sid, _, _ in STORES:
        for cat, _ in CATEGORIES:
            prods = feed_products(cache, sid, cat)
            for c in read_cards(cache / f"store{sid}_{cat}.html"):
                p = prods.get(int(c["id"]))
                if p is None:
                    raise SystemExit(f"store {sid} {cat}: card {c['id']} {c['name']} is not in the feed")
                fk = feed_kcal(p)
                if c["kcal"] is None and fk in (None, "0"):
                    n += 1  # the page prints nothing when the feed has no figure (or 0, as for still water)
                    continue
                if c["kcal"] != fk:
                    raise SystemExit(f"store {sid} {cat}: {c['name']} prints {c['kcal']} kcal but the feed sums to {feed_kcal(p)}: the page changed, look before publishing")
                n += 1
    return n


# ---------------------------------------------------------------------------------------------- tags and serving
PORK = re.compile(r"\bpork\b", re.I)
PORK_MEATS = re.compile(r"\b(bacon|ham|sausage|salami|chorizo|gammon)\b(?!\*?\s*\((?:turkey|beef|poultry))", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
SERVING_RE = re.compile(r'^(?:\d+"\s.*|\d+PC|\d+(?:\.\d+)?(?:ml|L))$')


def serving_of(info: str | None) -> str:
    if not info or not SERVING_RE.match(info):
        return ""
    m = re.fullmatch(r"(\d+)PC", info)
    return f"{m.group(1)} pieces" if m else info


def tags_of(name: str, desc: str, props: list[str]) -> str:
    tags = []
    if "VEG" in props or "VGN" in props or re.search(r"\bvegan\b", name, re.I):
        tags.append("vegetarian")
    if PORK.search(desc) or PORK_MEATS.search(desc):
        tags.append("contains_pork")
    if BEEF.search(desc) or BEEF.search(name):
        tags.append("contains_beef")
    return "|".join(tags)


def tidy(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().rstrip(".").strip()


# ---------------------------------------------------------------------------------------------- build
def build(cache: Path, checked_on: str, out: Path | None) -> None:
    compared = check_against_feed(cache)
    # (category label, name, serving) -> {store: kcal} ; first card seen supplies the description and the product id
    seen: dict[tuple, dict[int, str | None]] = collections.defaultdict(dict)
    first: dict[tuple, dict] = {}
    order: list[tuple] = []
    for sid, _, _ in STORES:
        for cat, label in CATEGORIES:
            prods = feed_products(cache, sid, cat)
            for c in read_cards(cache / f"store{sid}_{cat}.html"):
                key = (label, tidy(c["name"]), serving_of(c["info"]))
                if key not in first:
                    first[key] = dict(c, props=prods[int(c["id"])]["propertyCodes"])
                    order.append(key)
                seen[key][sid] = c["kcal"]
    items, left_out, disagree, one_store = [], [], [], []
    for key in order:
        label, name, serving = key
        by_store = seen[key]
        printed = {s: k for s, k in by_store.items() if k is not None}
        c = first[key]
        if name.lower() in EXCLUDE_NAMES:
            left_out.append(f"{label}: {name} (base-only figure, toppings chosen by the customer)")
            continue
        if not printed:
            left_out.append(f"{label}: {name} (no kcal printed)")
            continue
        if len(set(printed.values())) > 1:
            disagree.append(f"{label}: {name} {printed}")
            continue
        if len(printed) < MIN_STORES:
            one_store.append(f"{label}: {name} (kcal at {len(printed)} shop only)")
            continue
        items.append(dict(id=slug("".join(ch for ch in unicodedata.normalize("NFD", name) if not unicodedata.combining(ch))), name=name, category=label, serving=serving, calories=next(iter(printed.values())),
                          tags=tags_of(name, c["desc"] or "", c["props"]), rankable=False,
                          notes=f"printed identically at {len(printed)} of {len(STORES)} shops; product id {c['id']}"))
    print(f"cards compared with the feed's own sums: {compared}, all equal")
    print(f"published {len(items)} items from {len(STORES)} shops")
    for title, rows in (("left out", left_out), ("DIFFERENT kcal between shops (left out)", disagree), ("only one shop prints it (left out)", one_store)):
        print(f"{title}: {len(rows)}")
        for r in rows:
            print("   ", r)
    if disagree and not items:
        raise SystemExit("every product disagrees between shops: nothing to publish")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"{len(items)} items, expected {EXPECTED_ITEMS}: the menu changed, look before publishing (update EXPECTED_ITEMS)")
    write_chain_folder(chain_id=CHAIN_ID, name="Fireaway", cuisine="Pizza", source_title=SOURCE_TITLE, source_url=SOURCE_URL, checked_on=checked_on,
                       aliases=["fireaway", "fireaway pizza", "fire away", "fire away pizza"], items=items, out=out, note=NOTE,
                       nutrition_level="calories")
    print("written", out or f"data/source/{CHAIN_ID}")
    for f in sorted(cache.glob("locations.html")):
        print("sha256", f.name, sha256_file(f))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--checked-on", default=time.strftime("%Y-%m-%d"))
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    if a.fetch:
        fetch(a.cache)
    build(a.cache, a.checked_on, a.out)


if __name__ == "__main__":
    main()
