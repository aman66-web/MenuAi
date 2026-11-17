#!/usr/bin/env python3
"""Item photos for Wenzel's the Bakers from its own website and its own ordering site (docs/UK_DATA_PLAYBOOK.md, Phase 4;
helpers: images_common.py).

    python3 tools/uk_extract/images_wenzels.py --cache DIR --dry-run    # read both menus, list the matches (no photo downloaded)
    python3 tools/uk_extract/images_wenzels.py --cache DIR              # also download, store, write data/source/wenzels/images.csv

Our items come from Wenzel's own allergen sheet (June 2026 PDF, see chain.csv), not from either menu below, so a photo is attached only by an
exact dish name (images_common.norm_name equality), never by a near name.

Where the chain's own photos are (read 2026-11-17):

  A. https://www.wenzels.co.uk/menu/ (the chain's own in-store menu page). Its "All Products" list is one card per product:
     <div class="product-item"> with the product photo (<img src=... alt=NAME>) and the product name (<h4>NAME</h4>); 204 cards on
     2026-11-17 (the winter menu). The 14 category pages linked from it (/menu/bread/, /menu/hot-food/, ...) were read too: every card on
     them is also on /menu/, so only /menu/ is used. One request for the page, then one per photo.
  B. https://wenzels.vmos.io, the chain's own ordering site (Vita Mojo, white-labelled with the chain's name): /menu/ links every shop's
     menu on it and its "Order online" button is https://wenzels.vmos.io/store/store-selection?app=online. Every shop offers the same two
     menus: "C&C" (click and collect, the one with single products, menu 1358eae5-...) and "Catering New" (platters, never one of our
     dishes); checked at Bygrave Park, Hemel Hempstead, Kingsbrook, Chesham, Archway and Windsor. Read at one shop (Bygrave Park, St Albans):
     its 12 C&C category pages, opened in a headless Chromium (Playwright in web/e2e/node_modules), one page at a time, 2 seconds apart.
     The JSON each category page itself loads (vmos2.vmos.io/catalog/categories/<uuid>/bundles) is saved, with the list of the pictures the
     rendered page shows. Every dish is a record (uuid, name); its photo is
     https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid (the page's own <img> wraps exactly this
     address in a Cloudflare resize-and-crop wrapper; we fetch the ORIGINAL; store_image only downsizes it to <= 640 px WebP).
     Used only for an item that A gives no photo.
  C. KEEP_EARLIER: 8 photos matched on 2026-10-09 by this script from a card on /menu/ that named the item exactly (seasonal products: the
     autumn menu). On 2026-11-17 neither A nor B lists them any more; the items are still published (allergen sheet), the photo still shows
     the dish named, so the row is kept as it was (file and page unchanged, not downloaded again). Note: write_images_csv writes one date for
     every row, so these rows carry the run's date although their photo was read on 2026-10-09.

Match rule (exact, nothing fuzzy):
  A. a photo is attached to a published item only when
     1. exactly one published item has the card's name (norm_name equality) and the page has no other card with that name and a different
        photo (two cards, two photos = ambiguous = no photo);
     2. the card's <img alt> and <h4> carry the same name;
     3. the photo downloads as a real photo (store_image: >= 200 px, a still JPEG/PNG/WebP);
     4. the item is not in EXCLUDE (looked at by eye).
  B. for an item A gives no photo: exactly one published item has the dish's name (norm_name equality); every record with that name on the
     C&C menu is one record (one uuid); the rendered category page shows that record's photo; the item is not in EXCLUDE_ORDERING.
So "Sausage Roll" gets the card "Sausage Roll", and "Hashbrowns" does NOT get "2 Hash Browns" (another product); near names on the two menus
("Jam Donut", "Cinnamon Yummy", "Tottenham Cake slice", "Demi Baguette White", "Multi Seed Baguette", "Seeded Bloomer", "Chicken Goujons
Portion", "Piri Piri Panini", "Cheese Salad Baguette", "Tuna Sweetcorn Baguette", "Chicken Sweetcorn Baguette", "Ham, Cheese and Gherkin
Brioche", "Cheese Salad Bloomer"...) are NOT our items' names and get nothing.
Photos used by 2 or more items are reported.

Terms and robots (read 2026-11-17):
  * https://www.wenzels.co.uk/terms-conditions/ , clause 5 "Intellectual property rights": "All copyright and other
    intellectual property rights in the Website and its content belong exclusively to Wenzel's The Bakers Ltd. By accessing
    the Website, you agree that you will access the content for your personal non-commercial use only. None of the content
    may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without the consent of Wenzels The
    Bakers Ltd." That is an express restriction (unchanged since 2026-10-08). Installed on the founder's standing decision of 2026-10-06
    (CLAUDE.md rule 2: photos are installed even where a chain's terms restrict reuse; the founder's accepted risk); the chain's photos come
    down the day it asks (delete web/public/menu-images/wenzels/ and data/source/wenzels/images.csv). The ordering site shows no terms of
    its own on the menu pages read.
  * robots.txt of www.wenzels.co.uk: "Crawl-delay: 10" and, for all agents, "Disallow: /wp-json/" and "Disallow: /?rest_route=".
    /menu/ and /wp-content/uploads/ are allowed. This script waits 10 seconds between requests to that host (the crawl delay).
  * wenzels.vmos.io/robots.txt: `User-agent: * / Disallow:` (nothing disallowed). vmos2.vmos.io answers /robots.txt with a 301 to the app
    (no rules file). media-multitenant.vmos-static.com/robots.txt: `User-agent: * / Disallow:` (nothing).
  * Every URL is checked with the RFC 9309 matcher in images_common (polite_get, _robots_allow). A 401/403/429, a robots refusal or a
    challenge page stops the script (exit 1) before anything is written; never worked round.

Run of 2026-11-17: A matched 48 items (46 of the 2026-10-09 set again, byte for byte the same files; Signature Sourdough, new on the page;
Chicken Slice, see the note under EXCLUDE); B added Multiseed Sourdough; C kept 8: 57 of 108 published items have a photo. Every photo was
looked at on contact sheets, the three new ones also at full size (Signature Sourdough's card photo is the same loaf the ordering site's own
Signature Sourdough record shows).
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wenzels"
MENU_URL = "https://www.wenzels.co.uk/menu/"
DELAY = 10.0   # robots.txt of www.wenzels.co.uk: Crawl-delay: 10
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
CARD = re.compile(r'<div class="product-item"[^>]*>(.*?)<p class="price">', re.S)
CARD_IMG = re.compile(r'<img[^>]*\ssrc="([^"]+)"[^>]*\salt="([^"]*)"')
CARD_NAME = re.compile(r"<h4>(.*?)</h4>", re.S)

ORIGIN = "https://wenzels.vmos.io"
API = "https://vmos2.vmos.io"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
CC_MENU = "1358eae5-fbd5-416c-a1a8-06258748ca7f"   # "C&C" (click and collect), offered at every shop checked
STORE = ("0dcfb9ad-ae26-4538-b8f7-1e6aecd64bd7", "Bygrave Park (St Albans)")   # the first shop /menu/ links

# Website card photos (A) never used for these items, looked at on contact sheets: {"item-id": "why"} (keeps a rerun from bringing them back)
EXCLUDE: dict[str, str] = {
    "multiseed-sourdough": "the chain's website photo carried a 'Buy 1 Get 1 Half Price' promotional sticker (2026-10-09; the card is gone "
                           "from /menu/ on 2026-11-17, the ordering site's own photo of it is used instead)",
    "premium-ham-filled-baguette": "the chain's photo carries a small meat-icon badge overlay (the ordering site's photo carries the same badge)",
    "egg-and-cress-baguette": "the chain's photo carries a small vegetable-icon (dietary) badge overlay",
    "steak-slice": "the website's Steak Slice card shows the very file of its Chicken Slice card (byte for byte): the chicken slice "
                   "(diagonal-scored pastry, creamy chicken and mushroom filling); the ordering site's own Steak Slice record shows a "
                   "different pastry (chevron-scored, minced steak), so this photo is not the steak slice",
    "chicken-slice": "independent check 2026-11-17: /menu/ shows this file byte for byte on both its Chicken Slice and Steak Slice cards, so the "
                     "cited page does not establish which product the picture is (a shared image for two dishes is left out)",
    "hot-chocolate": "independent check 2026-11-17: the Hot Chocolate card's file (media-93-1-1.png) is byte for byte the Latte card's file "
                     "(media-93-1.png): a latte picture reused, not a photo of the hot chocolate",
}

# Ordering-site photos (B) never used for these items, looked at 2026-11-17: {"item-id": "why"}
EXCLUDE_ORDERING: dict[str, str] = {
    "premium-ham-filled-baguette": "the picture carries a small meat-icon (steak) badge overlay",
    "steak-slice": "the picture carries a small meat-icon (steak) badge overlay",
    "chicken-slice": "the picture carries a small meat-icon (steak) badge overlay (the website's card gives the same shot without it)",
    "hot-chocolate": "website photo removed by the independent check (it is the Latte's file); the ordering site's picture was not looked at "
                     "by eye, so it is not attached until someone has",
}

# Rows matched on 2026-10-09 from a /menu/ card naming the item exactly, whose card is gone from /menu/ (and from the ordering site) on
# 2026-11-17; kept unchanged while the item is published and the file is present: {"item-id": "file"}
KEEP_EARLIER: dict[str, str] = {
    "almond-madeira": "5b3e2b122b9c.webp",
    "almond-muffin": "865fca341bc0.webp",
    "double-chocolate-muffin": "f6ac83badaa4.webp",
    "dragon-fruit-and-mango-chiller": "e51f44f5a91e.webp",
    "pink-lemonade": "a9afccdbe9cb.webp",
    "pulled-pork-and-apple-slaw-wrap": "447a5934319c.webp",
    "strawberry-matcha-latte": "b04978bdb55d.webp",
    "vanilla-matcha-latte": "2b7e8175fb6f.webp",
}

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [ua, outDir, delay, origin, ...specs] = process.argv.slice(3);
const BLOCK = /bugsnag|doubleclick|google-analytics|googletagmanager|facebook|hotjar|clarity|tiktok|analytics\.google|onetrust|domdog|workers\.dev/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const launch = {};
  if (process.env.PLAYWRIGHT_CHROMIUM) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
  const browser = await chromium.launch(launch);
  try {
    for (const spec of specs) {
      const [store, menu] = spec.split(':');
      if (fs.existsSync(`${outDir}/${store}.done`)) continue;
      const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1200, height: 1400 }, locale: 'en-GB' });
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
        if (key && s === 200) pending.push(r.text().then((t) => { fs.writeFileSync(`${outDir}/${store}_${key}.json`, `// ${u}\n${t}`); got[key] = true; }).catch(() => {}));
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
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        if (!resp || resp.status() !== 200) throw new Error(`HTTP ${resp && resp.status()} for ${url}`);
        const head = (await page.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 400);
        if (/just a moment|verify you are human|attention required|access denied|captcha/i.test(head)) throw new Error(`challenge page at ${url}: stop, never work round it`);
      };
      await open(`${origin}/store/${store}/menu/overview?menuUUID=${menu}`);
      await waitFor('menu', 'the menu');
      const menus = JSON.parse(fs.readFileSync(`${outDir}/${store}_menu.json`, 'utf8').split('\n').slice(1).join('\n')).payload;
      const m0 = menus.find((x) => x.uuid === menu);
      if (!m0) throw new Error(`menu ${menu} not offered at shop ${store}`);
      for (const c of m0.categories) {
        await sleep(Number(delay) * 1000);
        await open(`${origin}/store/${store}/menu/category/${c.uuid}/bundles?menuUUID=${menu}`);
        await waitFor(`cat_${c.uuid}`, `category ${c.name}`);
        // scroll the whole page once, as a visitor would, so every tile is drawn; then note the picture addresses the page shows
        await page.evaluate(async () => {
          for (let y = 0, i = 0; y < document.body.scrollHeight && i < 60; y += 700, i++) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); }
          window.scrollTo(0, document.body.scrollHeight);
        });
        await sleep(1500);
        const imgs = await page.evaluate(() => {
          const out = new Set();
          for (const i of document.images) { if (i.currentSrc) out.add(i.currentSrc); if (i.getAttribute('src')) out.add(i.getAttribute('src')); if (i.getAttribute('srcset')) out.add(i.getAttribute('srcset')); }
          for (const el of document.querySelectorAll('[style*="background-image"]')) out.add(el.style.backgroundImage);
          return [...out];
        });
        fs.writeFileSync(`${outDir}/${store}_cat_${c.uuid}.imgs.json`, JSON.stringify(imgs, null, 1));
      }
      if (bad.length) throw new Error(`refused: ${bad.join(' | ')}: stop, never work round it`);
      fs.writeFileSync(`${outDir}/${store}.done`, new Date().toISOString() + '\n');
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
"""


# ---------------------------------------------------------------- A. the website's /menu/ cards

def cards(page: str) -> list[dict]:
    out = []
    for body in CARD.findall(page):
        img = CARD_IMG.search(body)
        name = CARD_NAME.search(body)
        if not img or not name:
            continue
        title = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", name.group(1))).split())
        alt = " ".join(html.unescape(img.group(2)).split())
        out.append({"name": title, "alt": alt, "photo": html.unescape(img.group(1))})
    return out


def match_site(items: list[dict], cs: list[dict]) -> dict[str, dict]:
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    by_card: dict[str, list[dict]] = {}
    for c in cs:
        by_card.setdefault(norm_name(c["name"]), []).append(c)
    matches: dict[str, dict] = {}
    for key, its in sorted(by_name.items()):
        cands = by_card.get(key)
        if not cands:
            continue
        if len(its) != 1 or len({c["photo"] for c in cands}) != 1:
            print(f"  site: no photo (ambiguous name {key!r}): items {[i['id'] for i in its]}, photos {sorted({c['photo'] for c in cands})}")
            continue
        c = cands[0]
        if norm_name(c["alt"]) != key:
            print(f"  site: no photo (card alt {c['alt']!r} differs from its name {c['name']!r}): {its[0]['id']}")
            continue
        if its[0]["id"] in EXCLUDE:
            print(f"  site: no photo (excluded: {EXCLUDE[its[0]['id']]}): {its[0]['id']}")
            continue
        matches[its[0]["id"]] = c
    return matches


# ---------------------------------------------------------------- B. the ordering site's C&C menu

def check_robots() -> None:
    """Every kind of address the pages use, and the photo host, must be allowed (RFC 9309)."""
    samples = [f"{ORIGIN}/store/store-selection?app=online", f"{ORIGIN}/store/x/menu/overview?menuUUID=y",
               f"{ORIGIN}/store/x/menu/category/c/bundles?menuUUID=y", f"{API}/catalog/v2/menu",
               f"{API}/catalog/categories/c/bundles?forceStockStatus=0", MEDIA.format(uuid="x")]
    for u in samples:
        if not ic._robots_allow(u):
            raise Blocked(f"robots.txt disallows {u}")


def capture(dump: Path) -> None:
    """Read the C&C menu at STORE in a headless browser (saved JSON is reused: a rerun opens no page twice)."""
    dump.mkdir(parents=True, exist_ok=True)
    if (dump / f"{STORE[0]}.done").exists():
        return
    check_robots()
    js = dump / "capture.js"
    js.write_text(CAPTURE_JS)
    r = subprocess.run(["node", str(js), str(PLAYWRIGHT), ic.UA, str(dump), "2", ORIGIN, f"{STORE[0]}:{CC_MENU}"],
                       capture_output=True, text=True, timeout=3600, env=os.environ.copy())
    if r.returncode != 0:
        raise Blocked("reading the ordering menu failed (a 401/403/429, a challenge page or a changed layout are NOT to be worked "
                      "round: stop and report): " + r.stderr[-1500:])


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8").split("\n", 1)[1])


def _walk(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        yield from _walk(sub)


def read_ordering(dump: Path) -> dict[str, list[dict]]:
    """{norm_name(dish name): [{uuid, name, page, category, shown}]} over every saved C&C category page."""
    store = STORE[0]
    menus = _load(dump / f"{store}_menu.json")["payload"]
    cats = {c["uuid"]: " ".join(c["name"].split()) for m in menus if m["uuid"] == CC_MENU for c in m["categories"]}
    if not cats:
        raise SystemExit(f"menu {CC_MENU} not on the saved menu list: the ordering site changed, look again")
    dishes: dict[str, list[dict]] = {}
    for cat, cname in cats.items():
        f = dump / f"{store}_cat_{cat}.json"
        if not f.exists():
            raise SystemExit(f"category {cname} was not saved: rerun the capture")
        imgs = " ".join(json.loads((dump / f"{store}_cat_{cat}.imgs.json").read_text(encoding="utf-8")))
        page = f"{ORIGIN}/store/{store}/menu/category/{cat}/bundles?menuUUID={CC_MENU}"
        for b in _walk(_load(f)["payload"]):
            name = " ".join(b["name"].split())
            dishes.setdefault(norm_name(name), []).append(
                {"uuid": b["uuid"], "name": name, "page": page, "category": cname, "shown": f"entityUUID={b['uuid']}" in imgs})
    return dishes


def match_ordering(items: list[dict], dishes: dict[str, list[dict]], skip: set[str]) -> dict[str, dict]:
    count: dict[str, int] = {}
    for it in items:
        count[norm_name(it["name"])] = count.get(norm_name(it["name"]), 0) + 1
    out: dict[str, dict] = {}
    for it in items:
        if it["id"] in skip:
            continue
        key = norm_name(it["name"])
        hits = dishes.get(key) or []
        if not hits:
            continue
        if count[key] != 1:
            print(f"  ordering: no photo ({count[key]} published items carry the name {it['name']!r})")
            continue
        if len({h["uuid"] for h in hits}) != 1:
            print(f"  ordering: no photo ({len({h['uuid'] for h in hits})} different records carry the name {it['name']!r})")
            continue
        if it["id"] in EXCLUDE_ORDERING:
            print(f"  ordering: no photo (excluded: {EXCLUDE_ORDERING[it['id']]}): {it['id']}")
            continue
        shown = [h for h in hits if h["shown"]]
        if not shown:
            print(f"  ordering: no photo (the page shows {it['name']!r} without one)")
            continue
        out[it["id"]] = shown[0]
    return out


# ---------------------------------------------------------------- run

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="list the matches; download no photo")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    published = {i["id"] for i in items}
    try:
        page = polite_get(MENU_URL, args.cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
        cs = cards(page)
        print(f"A. {len(cs)} product cards on {MENU_URL}")
        site = match_site(items, cs)
        print(f"A. {len(site)} of {len(items)} published items match a product card exactly")
        for item_id, c in site.items():
            print(f"  site match: {item_id} <- {c['name']!r} {c['photo']}")

        capture(args.cache / "ordering")
        dishes = read_ordering(args.cache / "ordering")
        print(f"B. {sum(len(v) for v in dishes.values())} dish entries ({len(dishes)} names) on the ordering site's C&C menu at {STORE[1]}")
        ordering = match_ordering(items, dishes, skip=set(site))
        for item_id, d in ordering.items():
            print(f"  ordering match: {item_id} <- {d['name']!r} {d['uuid']} ({d['category']})")
    except Blocked as e:
        print(f"STOP (nothing written): {e}", file=sys.stderr)
        return 1

    kept = {i: f for i, f in KEEP_EARLIER.items()
            if i in published and i not in site and i not in ordering and (ic.IMAGES_ROOT / CHAIN_ID / f).exists()}
    for i in sorted(set(KEEP_EARLIER) - set(kept)):
        print(f"  C. not kept: {i} (unpublished, matched again, or its file is gone)")
    print(f"C. {len(kept)} photos of 2026-10-09 kept unchanged")
    print(f"{len(site) + len(ordering) + len(kept)} of {len(items)} published items would have a photo")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, c in site.items():
            try:
                fname = store_image(CHAIN_ID, polite_get(c["photo"], args.cache, delay=DELAY, referer=MENU_URL))
            except ValueError as e:
                print(f"no photo: {item_id}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
        for item_id, d in ordering.items():
            try:
                fname = store_image(CHAIN_ID, polite_get(MEDIA.format(uuid=d["uuid"]), args.cache, referer=ORIGIN + "/"))
            except (ValueError, urllib.error.HTTPError) as e:
                print(f"no photo: {item_id}: {e}")
                continue
            rows[item_id] = (fname, d["page"])
    except Blocked as e:
        print(f"STOP: {e} (nothing written)", file=sys.stderr)
        return 1
    for item_id, fname in kept.items():
        rows[item_id] = (fname, MENU_URL)

    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"CHECK BY EYE: shared photo {f}: {ids}")
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
