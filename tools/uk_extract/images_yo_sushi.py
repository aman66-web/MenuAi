#!/usr/bin/env python3
"""Item photos for Yo! Sushi (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_yo_sushi.py --cache <dir> --dry-run     # read the ordering menus, list matches (no photo downloaded)
    python3 tools/uk_extract/images_yo_sushi.py --cache <dir>               # also download, store, write images.csv

Two sources, both the chain's own:

1. Carried from the run of 2026-10-09 (CARRIED below, 53 items). Then the chain's own menu pages https://yosushi.com/menu (?page=2,
   ?page=3) printed each dish as a card (`<a href="/menu/<slug>" class="product-item"> <img> <h3>dish name</h3> ... N kcal`), photos on
   cdn.yosushi.com/r/w-1000/... (robots.txt then allowed /menu and /r/). A card's photo went to the item whose norm_name equals the card's
   name; "chicken katsu curry" went to "Chicken Katsu Curry (large)" because the card's own kcal figure (922) equalled that item's. Every
   one was looked at on a contact sheet then, and again on 2026-11-17 (still the dish named). Their source_url is the card's page as it
   was then. Since then yosushi.com has been redesigned (2026-11-17: /menu redirects to /restaurants/our-menu, the old pages are gone), so
   these rows cannot be re-fetched; they are kept as verified. write_images_csv stamps the run's date on every row; their true retrieval
   date is 2026-10-09 (the run prints them). Set CARRY_OVER = False to drop them instead.

2. The chain's own ordering site https://order.yosushi.com (the "order" link on every yosushi.com page, store-selection?app=online; the
   platform is Vita Mojo, white-labelled with the chain's name). Its menus are read in a headless Chromium (Playwright in
   web/e2e/node_modules), one page at a time, 2 seconds apart, and the JSON each category page itself loads
   (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles) is saved: every dish ("bundle") has a uuid and a name, and the
   page's photo of that dish is https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid (the
   page's own <img> wraps exactly this address in a Cloudflare resize-and-crop wrapper, multitenant.vmos-static.com/cdn-cgi/image/
   fit=cover,...; we fetch the ORIGINAL, never the cropped wrapper; store_image only downsizes it to <= 640 px WebP). The ordering site
   lists only nine shops; four have a menu (read 2026-11-17, MENUS below): "YO! Click & Collect" at YO! Heathrow T3, which the chain's own
   data describes as the "Click & collect menu Main Estate sites" (the restaurant menu our data comes from: PRIMARY), "YO! Heathrow T2
   Click & Collect", "YO! TO GO" (York Outlet) and "YO! Value Menu" (Belfast). "Misc & Fees" and alcohol categories are not read.

Match rule (exact only, nothing fuzzy):
  * only items whose name is unique among the published items;
  * a dish on the PRIMARY menu whose norm_name equals the item's name, and exactly one dish (one uuid) there carries that name: its photo;
  * otherwise, every dish on the other three menus that carries that exact name must be the same dish (one uuid): its photo;
  * the photo is the one the page ties to that dish's uuid (entityUUID = dish uuid);
  * no photo for size variants the ordering site does not name: "Chicken/Pumpkin Katsu Curry (regular)/(large)" are one dish with
    "Standard"/"Go Large" options there (one record, one photo, no size of its own), so none of them gets an ordering-site photo;
  * renamed dishes get none ("seared beef nigiri" is not "Beef Nigiri", "yuzu little moons" is not "Yuzu Cheesecake Mochi", "soy" is
    not "Soy Sauce", "ginger" is not "Pickled Ginger");
  * a CARRIED item keeps its earlier photo; EXCLUDE (by eye) never gets one.
source_url = the ordering-site category page that shows the dish (store/<store>/menu/category/<category>/bundles?menuUUID=<menu>).

Robots (read 2026-11-17, RFC 9309 via images_common):
  * yosushi.com/robots.txt (same file on assets.yosushi.com and cdn.yosushi.com): `User-agent: *` Disallow /admin/, /error,
    /getContentAsset/, /*/menu$, /*?. The redesigned menu (/restaurants/our-menu and /restaurants/our-menu/<dish>) is allowed, but every
    photo on it is served as assets.yosushi.com/ip/w-<n>/getContentAsset/...png?language=en-gb, an address with a query string, which
    `Disallow: /*?` covers: NOT fetched (and no query-less address is made up to get round it). Its other menu tabs load from a script
    (/build/client.bundle.js?v=...) that the same rule covers: not fetched.
  * order.yosushi.com/robots.txt: "User-agent: * / Disallow:" (nothing). vmos2.vmos.io answers /robots.txt with the app's HTML (no
    rules). media-multitenant.vmos-static.com/robots.txt: "User-agent: * / Disallow:" (nothing). multitenant.vmos-static.com (the
    crop wrapper) answers 403 for robots.txt and is not used.
  * order.yosushi.com loads a Cloudflare passive bot-detection script, but a normal headless browser read every page without any
    challenge (2026-11-17). Any 401/403/429 answer or a challenge page stops the run before anything is written (never worked round).

Terms (read 2026-11-17, https://yosushi.com/terms-conditions, "Ownership of Rights"): "All rights, including copyright, in this website
are owned by or licensed to YO! Sushi UK Ltd. Any use of this website or its contents, including copying or storing it or them in whole
or part, other than for your own personal, non-commercial use is prohibited without the permission of YO! Sushi UK Ltd. You may not
modify, distribute or re-post anything on this website for any purpose." (The ordering site's own terms were not read.)
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2): his accepted risk.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "yo-sushi"
ORIGIN = "https://order.yosushi.com"
API = "https://vmos2.vmos.io"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
SKIP_CATEGORIES = r"misc|fees|alcohol"
# (store uuid, menu uuid, what it is) as the ordering site's own shop and menu records name them (read 2026-11-17)
PRIMARY = ("9f9197e3-3ebc-4002-85d6-76bf8a649eab", "5bad2a81-d991-4a9d-b637-952e51f9b67c",
           "YO! Heathrow T3: 'YO! Click & Collect' (Click & collect menu Main Estate sites)")
OTHERS = [("9805173c-9f79-4e1f-9e48-8d8430964c86", "722daea2-95b3-4cba-b0e4-518cc179a0a2", "YO! Heathrow T2: 'YO! Heathrow T2 Click & Collect'"),
          ("c95ea30d-4c4a-4cec-aeda-93818b0dce08", "8661456b-e5fe-4cb6-906b-b36d93e70de3", "YO! York Outlet: 'YO! TO GO'"),
          ("7f1959c3-eeaa-46b8-bc0a-25876df07f97", "dc0af89f-f701-42ff-900a-f324547fb8be", "YO! Belfast: 'YO! Value Menu'")]
MENUS = [PRIMARY, *OTHERS]

CARRY_OVER = True
CARRIED = {   # photos from yosushi.com/menu, retrieved and looked at 2026-10-09, looked at again 2026-11-17 (see the docstring)
    "apple-pie-gyoza", "beef-tataki", "beef-teriyaki", "beef-teriyaki-donburi", "blueberry-matcha-cream-puff", "chashu-chicken-ramen",
    "chicken-dashi-ramen", "chicken-katsu", "chicken-katsu-sushi-sando", "chicken-teriyaki-donburi",
    "chicken-yakitori", "chocolate-little-moons-mochi", "classic-edamame", "crunchy-california-roll", "dorayaki-pancakes", "dynamite-roll",
    "furi-furi-salt-and-pepper-chicken", "hoisin-duck-roll", "japanese-fried-chicken", "konbini-tuna-onigiri", "korean-bbq-chicken-roll",
    "korean-chicken-bao", "korean-fried-chicken", "korean-fried-chicken-donburi", "mighty-duck-fries", "miso-soup", "mississippi-mud-cake",
    "nigiri-n-maki-mix", "pak-choi-with-chilli-ginger", "pickled-kimchi-cucumber", "popcorn-prawn-roll", "popcorn-shrimp", "prawn-katsu",
    "pulled-shiitake-bao", "pulled-shiitake-teriyaki-donburi", "pumpkin-katsu", "salmon-dragon-roll", "salmon-nigiri", "salmon-sashimi",
    "salmon-top-hits", "sesame-tender-stem-broccoli", "spicy-chicken-katsu-roll", "spicy-pepper-squid", "spicy-seafood-tan-tan",
    "sushi-for-two", "teriyaki-beef-curry", "tuna-nigiri", "tuna-sashimi", "vegetable-gyoza-and-shiitake-ramen", "vegetable-kakiage",
    "veggie-inari-taco", "veggie-volcano-roll",
}
# Item ids never given an ordering-site photo (checked by eye after a download): {"item-id": "why"}
EXCLUDE: dict[str, str] = {
    # checker 2026-11-17: the 2026-10-09 card was named "Chicken Katsu Curry" (no size) and was tied to "(large)" only by its kcal
    # figure, not by name or product record; the ordering site has no "(large)" dish either. Dropped from CARRIED too.
    "chicken-katsu-curry-large": "size variant matched by kcal, not by exact name or record",
}

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [ua, outDir, delay, origin, skip, ...specs] = process.argv.slice(3);
const SKIP = new RegExp(skip, 'i');
const BLOCK = /bugsnag|doubleclick|google-analytics|googletagmanager|facebook|hotjar|clarity|tiktok|analytics\.google|onetrust/i;
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
        if (SKIP.test(c.name)) continue;
        await sleep(Number(delay) * 1000);
        await open(`${origin}/store/${store}/menu/category/${c.uuid}/bundles?menuUUID=${menu}`);
        await waitFor(`cat_${c.uuid}`, `category ${c.name}`);
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
    todo = [f"{s}:{m}" for s, m, _ in MENUS if not (dump / f"{s}.done").exists()]
    if not todo:
        return
    check_robots()
    js = dump / "capture.js"
    js.write_text(CAPTURE_JS)
    r = subprocess.run(["node", str(js), str(PLAYWRIGHT), ic.UA, str(dump), "2", ORIGIN, SKIP_CATEGORIES, *todo],
                       capture_output=True, text=True, timeout=3600, env=os.environ.copy())
    if r.returncode != 0:
        raise ic.Blocked("reading the ordering menus failed (a 401/403/429, a challenge page or a changed layout are NOT to be worked "
                         "round: stop and report): " + r.stderr[-1500:])


def walk(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        yield from walk(sub)


def read_menus(dump: Path) -> dict[str, dict[str, list[dict]]]:
    """{store uuid: {norm_name(dish): [{uuid, name, page}]}} over every saved category page."""
    out: dict[str, dict[str, list[dict]]] = {}
    for store, menu, _ in MENUS:
        dishes: dict[str, list[dict]] = {}
        for f in sorted(dump.glob(f"{store}_cat_*.json")):
            cat = f.stem.split("_cat_", 1)[1]
            payload = json.loads(f.read_text(encoding="utf-8").split("\n", 1)[1])["payload"]
            page = f"{ORIGIN}/store/{store}/menu/category/{cat}/bundles?menuUUID={menu}"
            for b in walk(payload):
                dishes.setdefault(ic.norm_name(b["name"]), []).append({"uuid": b["uuid"], "name": b["name"], "page": page})
        out[store] = dishes
    return out


def match(items: list[dict], menus: dict[str, dict[str, list[dict]]]) -> tuple[dict[str, tuple[str, str, str]], list[str]]:
    """{item_id: (dish uuid, dish name as printed, page url)} for items not CARRIED, plus notes."""
    notes: list[str] = []
    count: dict[str, int] = {}
    for it in items:
        count[ic.norm_name(it["name"])] = count.get(ic.norm_name(it["name"]), 0) + 1
    out: dict[str, tuple[str, str, str]] = {}
    for it in items:
        key = ic.norm_name(it["name"])
        if count[key] != 1:
            continue
        hits = menus[PRIMARY[0]].get(key) or []
        if not hits:
            hits = [h for store, _, _ in OTHERS for h in menus[store].get(key) or []]
        if not hits:
            continue
        uuids = {h["uuid"] for h in hits}
        if len(uuids) != 1:
            notes.append(f"{it['name']}: {len(uuids)} different dishes carry that name -> none")
            continue
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        out[it["id"]] = (hits[0]["uuid"], hits[0]["name"], hits[0]["page"])
    return out, notes


def carried_rows(items: list[dict]) -> dict[str, dict]:
    """The CARRIED rows images.csv holds now, whose photo file is still there."""
    path = ic.ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    published = {it["id"] for it in items}
    if not (CARRY_OVER and path.exists()):
        return {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        return {r["item_id"]: r for r in csv.DictReader(f)
                if r["item_id"] in CARRIED and r["item_id"] in published and (ic.IMAGES_ROOT / CHAIN_ID / r["file"]).is_file()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    names = {i["id"]: i["name"] for i in items}
    carried = carried_rows(items)
    try:
        capture(a.cache / "ordering")
        menus = read_menus(a.cache / "ordering")
        for store, _, label in MENUS:
            print(f"{label}: {sum(len(v) for v in menus[store].values())} dishes, {len(menus[store])} names")
        matches, notes = match(items, menus)
        for n in notes:
            print("  note:", n)
        for iid in sorted(matches):
            if iid in carried:
                print(f"  {iid}: keeps its photo of 2026-10-09 ({carried[iid]['file']})")
        new = {iid: m for iid, m in matches.items() if iid not in carried}
        for iid, (uuid, dish, page) in sorted(new.items()):
            print(f"  NEW {iid:36s} {names[iid]!r} = {dish!r} ({uuid})")
        print(f"{len(carried)} carried from 2026-10-09, {len(new)} new from the ordering site, of {len(items)} published items")
        if a.dry_run:
            return 0
        rows: dict[str, tuple[str, str]] = {iid: (r["file"], r["source_url"]) for iid, r in carried.items()}
        for iid, (uuid, _, page) in sorted(new.items()):
            try:
                raw = ic.polite_get(MEDIA.format(uuid=uuid), a.cache, referer=ORIGIN + "/")
                rows[iid] = (ic.store_image(CHAIN_ID, raw), page)
            except (ValueError, urllib.error.HTTPError) as e:
                print(f"  skipped {iid}: {e}")
    except ic.Blocked as e:
        print(f"STOP (nothing written): {e}", file=sys.stderr)
        return 1
    if not rows:
        print("no photos at all: nothing written (look before deleting the existing file)", file=sys.stderr)
        return 1
    ic.write_images_csv(CHAIN_ID, rows)
    for iid in sorted(carried):
        print(f"  carried: {iid} {carried[iid]['file']} from {carried[iid]['source_url']} (first retrieved 2026-10-09)")
    print(f"stored {len(rows)} photos ({len(carried)} carried); files used by 4+ items: {ic.suspected_placeholders(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
