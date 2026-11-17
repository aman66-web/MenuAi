#!/usr/bin/env python3
"""Item photos for Deep Blue (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_deep_blue.py --cache <dir> --dry-run     # read the ordering menus, list matches (no photo downloaded)
    python3 tools/uk_extract/images_deep_blue.py --cache <dir>               # also download, store, write images.csv

Where the chain's own photos are (read 2026-11-17):

  * The chain's own ordering site https://order.deepbluerestaurants.com/ ("Order Online" on every www.deepbluerestaurants.com page; its
    "Nutritional Information" page sends visitors there; the platform is Vita Mojo, white-labelled with the chain's name and address).
    This is the site our items were read from (tools/uk_extract/deep_blue.py, 12 October 2026), so the photos come from the very product
    records ("bundles") the items were built from. Its pages only answer inside a browser session, so they are opened in a headless
    Chromium (Playwright in web/e2e/node_modules), one page at a time, 2 seconds apart, at the same six shops the items were read at
    (deep_blue.STORES: Market Weighton, Wetwang and Brandesburton on the "Deep Blue North Takeaway" menu; Newmarket, Horsham and Lymington
    on the "Takeaway Menu"). The JSON each category page itself loads (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles)
    is saved, and so is the list of the picture addresses the rendered page shows. Every product has a uuid and a name, and the page's
    photo of that product is https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the product's uuid>&scope=grid (the
    page's own <img> wraps exactly this address in a Cloudflare resize-and-crop wrapper, multitenant.vmos-static.com/cdn-cgi/image/...;
    we fetch the ORIGINAL, never the cropped wrapper; store_image only downsizes it to <= 640 px WebP). Categories not read: "Bundles",
    "Promotions" and "Meal deals" (deep_blue.SKIP), as in deep_blue.py.
  * www.deepbluerestaurants.com itself (a Drupal site: home, about, locations, offers, gluten-free schedule, FAQ) has no menu page and
    shows no per-dish photos; nothing is taken from it.

Match rule (exact only, nothing fuzzy):
  * only items whose name is unique among the published items;
  * the product's name is made exactly the way deep_blue.py made the item's name from the same record (runs of spaces collapsed, nothing
    else changed); its norm_name must equal the item's name;
  * only the shops the item's own notes in items.csv name ("printed identically at 3 of 6 shops: Brandesburton, Market Weighton,
    Wetwang") are looked at: the records whose printed figures were published;
  * at those shops, every product carrying the name, in every category read, must be one record (one uuid): otherwise none;
  * the product's photo must be shown on the rendered category page (its media address, with that record's own uuid, is among the page's
    pictures): a product the page shows without a photo gets none;
  * EXCLUDE (by eye, below) never gets one.
source_url = the ordering-site category page that shows the product (store/<store>/menu/category/<category>/bundles?menuUUID=<menu>), at
the first of the item's shops (deep_blue.STORES order) whose page shows it.

Run of 2026-11-17: 449 product entries (157 names) on the six shops' ordering menus; all 61 published items matched one record each
whose picture the page shows (no name had two records at an item's shops); 12 left out after looking (EXCLUDE: a placeholder, three
ice-cream tubs, a picture shared with another product, four kids' meals shown with beans they don't include, two fishcakes for one, a
roll shown with butter, frickles shown with a dip): 49 photos, every one looked at on contact sheets and full-size crops. To check
EXCLUDE, three product pages were opened once each (Kids Fish Bites (4), Chips and Drink at Wetwang; Battered Frickles and Kids Chicken
Bites (4) Meal at Newmarket), in the same headless browser, one page at a time.

Robots (read 2026-11-17, RFC 9309 via images_common):
  * order.deepbluerestaurants.com/robots.txt: `User-agent: * / Disallow:` (nothing disallowed).
  * vmos2.vmos.io answers /robots.txt without a rules file (no rules).
  * media-multitenant.vmos-static.com/robots.txt: `User-agent: * / Disallow:` (nothing). multitenant.vmos-static.com (the crop wrapper)
    is not used.
  * www.deepbluerestaurants.com/robots.txt: Drupal's standard file, one group `User-agent: *` (Disallow /core/, /profiles/, /admin/,
    /user/..., /search/ ...); the home page and the terms page read are allowed; no group names an AI crawler.
  * Any 401/403/429 answer or a challenge page stops the run before anything is written (never worked round).

Terms (read 2026-11-17): https://www.deepbluerestaurants.com/privacy-policy-cookies-and-terms-conditions ("Website terms and conditions",
linked in the footer of every page), clause (2): "Unless otherwise stated, we or our licensors own the intellectual property rights in the
website and material on the website. ... You must not: (a) republish material, including images, from this website (including
republication on another website); ... (d) reproduce, duplicate, copy or otherwise exploit material on our website for a commercial
purpose;" and clause (3): "You must not conduct any systematic or automated data collection activities (including without limitation
scraping, data mining, data extraction and data harvesting) on or in relation to our website without our express written consent."
An express restriction on republishing images; installed on the founder's decision of 2026-10-06 (his accepted risk, CLAUDE.md rule 2).
The ordering site order.deepbluerestaurants.com shows no terms of its own on the menu pages read.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import deep_blue as db  # noqa: E402  (ORIGIN, STORES, SKIP: the same reader the items came from)
import images_common as ic  # noqa: E402

CHAIN_ID = "deep-blue"
ORIGIN = db.ORIGIN
API = "https://vmos2.vmos.io"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
STORES = db.STORES          # (store uuid, name, menu uuid), the six shops the items were read at
SKIP_CATEGORIES = db.SKIP   # Bundles, Promotions, Meal deals
SHOPS_NOTE = re.compile(r"printed identically at \d+ of \d+ shops: (.+)$")
# Item ids never given an ordering-site photo (looked at by eye on contact sheets and full-size crops, 2026-11-17): {"item-id": "why"}
_TUB = "the picture is the Northern Bloc tub (a third-party brand's pack and label), not the ice cream"
_BEANS = ("the picture shows a pot of baked beans beside the meal; the meal's own product page (Wetwang, read 2026-11-17: 'Kids fish bites "
          "and chips, served with a drink.', its only choice 'Choose your drink') does not include beans, and its figure doesn't count them")
_CAPRI = ("independent check 2026-11-17: the picture shows a Capri-Sun Orange pouch with its brand name and logo in full view (a third-party "
          "brand's pack) beside the meal; the meal's page offers Kid's Apple Juice, Kid's Orange Juice or Kid's Water, and no brand")
EXCLUDE: dict[str, str] = {
    "northern-bloc-lemon-100ml": "the picture is the site's placeholder lettering 'O-FISH-IAL PICTURE COMING SOON', not a photo",
    "northern-bloc-double-chocolate-100ml": _TUB,
    "northern-bloc-madagascan-vanilla-100ml": _TUB,
    "northern-bloc-vegan-salted-caramel-100ml": _TUB,
    "kids-jumbo-sausage-meal": ("its record's picture is the very file the Kids Jumbo Battered Sausage Meal's record shows: a battered "
                                "sausage, not the plain jumbo sausage"),
    "kids-fish-bites-4-chips-and-drink": _BEANS,
    "kids-chicken-bites-4-chips-and-drink": _BEANS,
    "kids-jumbo-battered-sausage-chips-and-drink": _BEANS,
    "kids-jumbo-sausage-chips-and-drink": _BEANS,
    "homemade-fishcake": ("the picture shows two fishcakes (with a salad garnish); the item is one ('Homemade battered fishcake.') and its "
                          "figure is for one"),
    "bread-roll": ("its record's picture is the very file the Roll & Butter record shows, with a butter portion beside the roll; the "
                   "Bread Roll is the roll alone"),
    "kids-chicken-bites-4-meal": _CAPRI,
    "kids-fish-bites-4-meal": _CAPRI,
    "kids-jumbo-battered-sausage-meal": _CAPRI,
    "battered-frickles": ("the picture shows a pot of red dip beside the frickles; the product page (Newmarket, read 2026-11-17) offers every "
                          "sauce only as a paid extra ('Why Not Add a Sauce ?'), so the dip is not part of the dish"),
}
# Kept after looking (2026-11-17): Cod (Small) and Haddock (Small) are two records that show one and the same picture of a battered fillet
# with lemon (each record points at it; battered cod and haddock look alike); Chips (Small) / GLUTEN FREE Chips (Small), Homemade / GLUTEN
# FREE Homemade Onion Rings and Tartare Sauce, and Homemade Mushy Peas / Mushy Peas likewise share one picture each. The three southern
# kids' "Meal" pictures (meal with a branded Capri-Sun pouch) were removed by the independent check (EXCLUDE above). Lite Bite Meal shows the fish and chips without the mushy peas its
# description names (nothing shown that the dish lacks). Pickled Onion shows two pickled onions in a pot for the 29 kcal portion.

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [ua, outDir, delay, origin, skip, ...specs] = process.argv.slice(3);
const SKIP = new RegExp(skip, 'i');
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
        if (SKIP.test(c.name.trim())) continue;
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


def check_robots() -> None:
    """Every kind of address the pages use, and the photo host, must be allowed (RFC 9309)."""
    samples = [f"{ORIGIN}/store/store-selection?app=online", f"{ORIGIN}/store/x/menu/overview?menuUUID=y",
               f"{ORIGIN}/store/x/menu/category/c/bundles?menuUUID=y", f"{API}/catalog/v2/menu",
               f"{API}/catalog/categories/c/bundles?forceStockStatus=0", MEDIA.format(uuid="x")]
    for u in samples:
        if not ic._robots_allow(u):
            raise ic.Blocked(f"robots.txt disallows {u}")


def capture(dump: Path) -> None:
    """Read the ordering menus in a headless browser (saved JSON is reused: a rerun opens no page twice)."""
    dump.mkdir(parents=True, exist_ok=True)
    todo = [f"{s}:{m}" for s, _, m in STORES if not (dump / f"{s}.done").exists()]
    if not todo:
        return
    check_robots()
    js = dump / "capture.js"
    js.write_text(CAPTURE_JS)
    r = subprocess.run(["node", str(js), str(PLAYWRIGHT), ic.UA, str(dump), "2", ORIGIN, SKIP_CATEGORIES, *todo],
                       capture_output=True, text=True, timeout=3600, env=os.environ.copy())
    if r.returncode != 0:
        raise ic.Blocked("reading the ordering menu failed (a 401/403/429, a challenge page or a changed layout are NOT to be worked "
                         "round: stop and report): " + r.stderr[-1500:])


def display_name(b: dict) -> str:
    """The item name deep_blue.py makes from this record (see its build(): runs of spaces collapsed, nothing else)."""
    return " ".join(b["name"].split())


def walk(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        if re.match(SKIP_CATEGORIES, (sub.get("name") or "").strip(), re.I):
            continue
        yield from walk(sub)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8").split("\n", 1)[1])


def read_menu(dump: Path) -> dict[str, list[dict]]:
    """{norm_name(display name): [{uuid, name, page, category, store, shown}]} over every saved category page of every shop."""
    dishes: dict[str, list[dict]] = {}
    for store, sname, menu in STORES:
        menus = load(dump / f"{store}_menu.json")["payload"]
        cats = {c["uuid"]: " ".join(c["name"].split()) for m in menus if m["uuid"] == menu for c in m["categories"]}
        for cat, cname in cats.items():
            if re.match(SKIP_CATEGORIES, cname, re.I):
                continue
            f = dump / f"{store}_cat_{cat}.json"
            if not f.exists():
                raise SystemExit(f"{sname}: category {cname} was not saved: rerun the capture")
            imgs = " ".join(json.loads((dump / f"{store}_cat_{cat}.imgs.json").read_text(encoding="utf-8")))
            page = f"{ORIGIN}/store/{store}/menu/category/{cat}/bundles?menuUUID={menu}"
            for b in walk(load(f)["payload"]):
                dishes.setdefault(ic.norm_name(display_name(b)), []).append(
                    {"uuid": b["uuid"], "name": display_name(b), "page": page, "category": cname, "store": sname,
                     "shown": f"entityUUID={b['uuid']}" in imgs})
    return dishes


def item_shops(it: dict) -> set[str]:
    """The shops named in the item's own notes (the ones whose printed figure was published)."""
    m = SHOPS_NOTE.search(it.get("notes") or "")
    return {s.strip() for s in m.group(1).split(",")} if m else set()


def match(items: list[dict], dishes: dict[str, list[dict]]) -> tuple[dict[str, dict], list[str]]:
    """{item_id: the shown record (uuid, name, page, ...) whose photo the item gets}, plus notes."""
    notes: list[str] = []
    count: dict[str, int] = {}
    for it in items:
        count[ic.norm_name(it["name"])] = count.get(ic.norm_name(it["name"]), 0) + 1
    order = {s[1]: i for i, s in enumerate(STORES)}
    out: dict[str, dict] = {}
    for it in items:
        key = ic.norm_name(it["name"])
        shops = item_shops(it)
        if not shops:
            notes.append(f"{it['name']}: its notes name no shops -> none")
            continue
        hits = [h for h in dishes.get(key) or [] if h["store"] in shops]
        if not hits:
            notes.append(f"{it['name']}: no product of that name on the menus of its shops ({', '.join(sorted(shops))}) -> none")
            continue
        if count[key] != 1:
            notes.append(f"{it['name']}: {count[key]} published items carry that name -> none")
            continue
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        uuids = {h["uuid"] for h in hits}
        if len(uuids) != 1:
            notes.append(f"{it['name']}: {len(uuids)} different records carry that name at its shops -> none "
                         f"({'; '.join(sorted(h['store'] + ' ' + h['uuid'] for h in hits))})")
            continue
        shown = sorted((h for h in hits if h["shown"]), key=lambda h: order[h["store"]])
        if not shown:
            notes.append(f"{it['name']}: the page shows this product without a photo -> none")
            continue
        out[it["id"]] = shown[0]
    return out, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    names = {i["id"]: i["name"] for i in items}
    rows: dict[str, tuple[str, str]] = {}
    try:
        capture(a.cache / "ordering")
        dishes = read_menu(a.cache / "ordering")
        print(f"ordering menus: {sum(len(v) for v in dishes.values())} product entries, {len(dishes)} names at {len(STORES)} shops")
        matches, notes = match(items, dishes)
        for n in notes:
            print("  note:", n)
        published = {ic.norm_name(n) for n in names.values()}
        for key, hits in sorted(dishes.items()):
            if key not in published:
                print(f"  not on our menu by that name: {hits[0]['name']!r} ({hits[0]['category']})")
        for iid, rec in sorted(matches.items()):
            print(f"  MATCH {iid:48s} {names[iid]!r} = {rec['name']!r} {rec['uuid']} @{rec['store']}")
        print(f"{len(matches)} of {len(items)} published items matched")
        if a.dry_run:
            return 0
        for iid, rec in sorted(matches.items()):
            try:
                raw = ic.polite_get(MEDIA.format(uuid=rec["uuid"]), a.cache, referer=ORIGIN + "/")
                rows[iid] = (ic.store_image(CHAIN_ID, raw), rec["page"])
            except (ValueError, urllib.error.HTTPError) as e:
                print(f"  skipped {iid}: {e}")
    except ic.Blocked as e:
        print(f"STOP (nothing written): {e}", file=sys.stderr)
        return 1
    if not rows:
        print("no photos at all: nothing written", file=sys.stderr)
        return 1
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos for {len(items)} published items; files used by 4+ items: {ic.suspected_placeholders(rows)}")
    for f, ids in ic.suspected_placeholders(rows, threshold=2).items():
        print(f"  CHECK BY EYE: {f} is used by {len(ids)} different items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
