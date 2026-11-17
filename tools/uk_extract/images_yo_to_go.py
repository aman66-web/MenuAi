#!/usr/bin/env python3
"""Item photos for YO! To Go, YO! Sushi's counters inside Tesco stores (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_yo_to_go.py --cache <dir> --dry-run     # read the ordering menus, list matches (no photo downloaded)
    python3 tools/uk_extract/images_yo_to_go.py --cache <dir>               # also download, store, write images.csv

Where the chain shows its kiosk products, and what can be used (all read 2026-11-17):

1. The data's own source, the Ten Kites page https://menus.tenkites.com/yosushi/kiosk02 ("Tesco kiosk menu", linked from
   yosushi.com/allergens), prints no product photos at all: its only pictures are a "default-unit-picture.jpg" placeholder and two
   allergen icons, all on images.tenkites.com, whose robots.txt is "User-agent: * / Allow: /tenkitestest/menus.html / Disallow: /".
   Nothing is taken from it except the product descriptions this script prints next to each match for a human to compare.

2. yosushi.com/kiosks/kiosk-menu ("view the YO! kiosk menu") links seven kiosk dish pages (california roll, chicken katsu roll, crunchy
   california roll, crunchy chicken katsu roll, crunchy rainbow signature set, nigiri selects, salmon & avocado roll). Their photos are
   served only as https://assets.yosushi.com/ip/w-<n>/getContentAsset/<uuid>/<uuid>/<file>.png?language=en-gb. assets.yosushi.com/robots.txt
   redirects to yosushi.com/robots.txt, whose `User-agent: *` group has `Disallow: /*?` (also /admin/, /error, /getContentAsset/,
   /*/menu$): every one of those photo addresses has a query string, so robots.txt disallows them. NOT fetched, and no query-less address
   is made up to get round the rule. (Their page names are also not the kiosk products' names: "california roll" is not "YO! Classic
   California Roll".) The rest of that menu loads from /build/client.bundle.js?v=..., which the same rule covers: not fetched.

3. The chain's own ordering site https://order.yosushi.com (the "order now" / "click & collect" link on every yosushi.com page; the Vita
   Mojo platform under the chain's name). It does not list the Tesco kiosks, but it has four shops with a menu (MENUS below, the same four
   that images_yo_sushi.py reads), one of them the small-format "YO! TO GO" menu at YO! York Outlet (the store's own record: "YO! Small
   Format", displayName "YO! TO GO", "Small format stores (York Outlet)"), read first (PRIMARY). The menus are read in a headless Chromium
   (Playwright in web/e2e/node_modules), one page at a time, 2 seconds apart, and the JSON each category page loads
   (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles) is saved. The page's photo of a dish ("bundle") is
   https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid (the page's own <img> wraps exactly
   this address in a Cloudflare resize-and-crop wrapper; we fetch the ORIGINAL, never the cropped wrapper; store_image only downsizes it
   to <= 640 px WebP). "Misc & Fees" and alcohol categories are not read.

Match rule (exact only, nothing fuzzy):
  * only items whose name is unique among the published YO! To Go items;
  * a dish on the PRIMARY ("YO! TO GO") menu whose norm_name equals the item's name, and exactly one dish (one uuid) there carries that
    name: its photo; otherwise every dish on the other three menus that carries that exact name must be the same dish (one uuid);
  * the photo is the one the page ties to that dish's uuid (entityUUID = dish uuid);
  * the same name is not enough when the chain's own records show the products differ: for every match the script prints the ordering
    record's description next to the kiosk page's own description, and EXCLUDE (below) lists the ones that are a different product.
source_url = the ordering-site category page that shows the dish (store/<store>/menu/category/<category>/bundles?menuUUID=<menu>).

Robots (read 2026-11-17, RFC 9309 via images_common): order.yosushi.com/robots.txt is "User-agent: * / Disallow:" (nothing);
vmos2.vmos.io answers /robots.txt with the app's HTML (no rules); media-multitenant.vmos-static.com/robots.txt is "User-agent: * /
Disallow:" (nothing); menus.tenkites.com/robots.txt disallows only /fonts/, /views/ and /*.less$. order.yosushi.com loads a Cloudflare
passive bot-detection script, but a normal headless browser read every page with no challenge (2026-11-17). Any 401/403/429 answer or a
challenge page stops the run before anything is written (never worked round).

Terms (read 2026-11-17, https://yosushi.com/terms-conditions, "Ownership of Rights"): "All rights, including copyright, in this website
are owned by or licensed to YO! Sushi UK Ltd. Any use of this website or its contents, including copying or storing it or them in whole
or part, other than for your own personal, non-commercial use is prohibited without the permission of YO! Sushi UK Ltd. You may not
modify, distribute or re-post anything on this website for any purpose." (The ordering site's own terms were not read.)
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2): his accepted risk.

Result of 2026-11-17: NO photo. The kiosk products are YO!'s packaged Tesco range ("YO! Classic California Roll", "YO! Crunchy Veggie
Roll"...), which the ordering menus (54 + 133 + 120 + 106 dishes) do not sell under those names. Only three published names occur there
exactly, and all three are in EXCLUDE: YO! Chicken Variety Bento and Custard Dorayaki are different products by the chain's own records,
and Chocolate Mochi's photo is a third-party brand's pack with a printed number. With no row kept the script writes nothing (there is no
images.csv for this chain). The kiosk's own dish photos (source 2) would need yosushi.com to allow its asset addresses in robots.txt.
"""
from __future__ import annotations

import argparse
import hashlib
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

CHAIN_ID = "yo-to-go"
ORIGIN = "https://order.yosushi.com"
API = "https://vmos2.vmos.io"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
KIOSK_PAGE = "https://menus.tenkites.com/yosushi/kiosk02"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
SKIP_CATEGORIES = r"misc|fees|alcohol"
# (store uuid, menu uuid, what it is) as the ordering site's own shop and menu records name them (read 2026-11-17)
PRIMARY = ("c95ea30d-4c4a-4cec-aeda-93818b0dce08", "8661456b-e5fe-4cb6-906b-b36d93e70de3",
           "YO! York Outlet: 'YO! TO GO' (YO! Small Format, 'Small format stores (York Outlet)')")
OTHERS = [("9f9197e3-3ebc-4002-85d6-76bf8a649eab", "5bad2a81-d991-4a9d-b637-952e51f9b67c", "YO! Heathrow T3: 'YO! Click & Collect'"),
          ("9805173c-9f79-4e1f-9e48-8d8430964c86", "722daea2-95b3-4cba-b0e4-518cc179a0a2", "YO! Heathrow T2: 'YO! Heathrow T2 Click & Collect'"),
          ("7f1959c3-eeaa-46b8-bc0a-25876df07f97", "dc0af89f-f701-42ff-900a-f324547fb8be", "YO! Belfast: 'YO! Value Menu'")]
MENUS = [PRIMARY, *OTHERS]

# Same name, different product (the chain's own records say so): {"item-id": "why"}. Never given an ordering-site photo.
EXCLUDE: dict[str, str] = {
    "yo-chicken-variety-bento": "the kiosk page's YO! Chicken Variety Bento is '6 Chicken Avocado roll, 2 Korean chilli Inari sushi, 8 cucumber "
                                "hosomaki'; the York record of that name is 'Avocado + cucumber maki, chicken katsu roll + Korean chicken roll with "
                                "crispy onions, teriyaki and mayo': a different set of rolls",
    "custard-dorayaki": "the York record is 'Japanese pancakes with a light custard centre, served with a tangy raspberry coulis' (a plated "
                        "restaurant dessert); the kiosk product is 'Japanese pancake filled with custard' in a pack, and the two records' "
                        "figures differ (216 vs 162 kcal)",
    # looked at by eye on 2026-11-17 (dish uuid 5df1e101-9c1e-4e7e-b306-0f4dd97d925a, the same record on all four menus):
    "chocolate-mochi": "the ordering site's photo is a third-party brand's pack (a Little Moons 'Chocolate Ganache Mochi' sleeve) with a "
                       "printed '2' badge on a coloured background, not the food",
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


def plain(s: str | None) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s or "")).split())


def read_menus(dump: Path) -> dict[str, dict[str, list[dict]]]:
    """{store uuid: {norm_name(dish): [{uuid, name, description, page}]}} over every saved category page."""
    out: dict[str, dict[str, list[dict]]] = {}
    for store, menu, _ in MENUS:
        dishes: dict[str, list[dict]] = {}
        for f in sorted(dump.glob(f"{store}_cat_*.json")):
            cat = f.stem.split("_cat_", 1)[1]
            payload = json.loads(f.read_text(encoding="utf-8").split("\n", 1)[1])["payload"]
            page = f"{ORIGIN}/store/{store}/menu/category/{cat}/bundles?menuUUID={menu}"
            for b in walk(payload):
                dishes.setdefault(ic.norm_name(b["name"]), []).append(
                    {"uuid": b["uuid"], "name": b["name"], "description": plain(b.get("description")), "page": page})
        out[store] = dishes
    return out


def kiosk_descriptions(cache: Path) -> dict[str, str]:
    """{norm_name(product): its description} from the data's own Ten Kites kiosk page (only shown next to a match, for a human)."""
    try:
        import tenkites_c as tk
        raw = ic.polite_get(KIOSK_PAGE, cache, accept="text/html,*/*").decode("utf-8", "replace")
        return {ic.norm_name(re.sub(r"\s*(?:-\s*heat me (?:first|up)!?|\bA1)\s*$", "", r["name"].strip(), flags=re.I)): plain(r["desc"])
                for r in tk.read_table_layout(raw)}
    except Exception as e:   # only an aid for the eye check: never stops the run
        print(f"  (kiosk page descriptions not read: {e})")
        return {}


def match(items: list[dict], menus: dict[str, dict[str, list[dict]]]) -> tuple[dict[str, dict], list[str]]:
    """{item_id: the ordering-site dish} plus notes."""
    notes: list[str] = []
    count: dict[str, int] = {}
    for it in items:
        count[ic.norm_name(it["name"])] = count.get(ic.norm_name(it["name"]), 0) + 1
    out: dict[str, dict] = {}
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
            notes.append(f"{it['name']}: same name as {hits[0]['name']!r} but excluded ({EXCLUDE[it['id']]})")
            continue
        out[it["id"]] = hits[0]
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
        menus = read_menus(a.cache / "ordering")
        for store, _, label in MENUS:
            print(f"{label}: {sum(len(v) for v in menus[store].values())} dishes, {len(menus[store])} names")
        matches, notes = match(items, menus)
        for n in notes:
            print("  note:", n)
        kiosk = kiosk_descriptions(a.cache)
        for iid, d in sorted(matches.items()):
            print(f"  MATCH {iid:28s} {names[iid]!r} = {d['name']!r} ({d['uuid']})")
            print(f"        ordering record: {d['description'][:200]!r}")
            print(f"        kiosk page:      {kiosk.get(ic.norm_name(names[iid]), '(not found)')[:200]!r}")
        print(f"{len(matches)} matches of {len(items)} published items")
        if a.dry_run:
            return 0
        if not matches:
            # Nothing qualifies (every candidate is in EXCLUDE): the chain has no photos, so a file left by an earlier run goes too.
            old = ic.ROOT / "data" / "source" / CHAIN_ID / "images.csv"
            if old.exists():
                old.unlink()
                print(f"  removed {old.relative_to(ic.ROOT)} (no photo qualifies any more)")
            folder = ic.IMAGES_ROOT / CHAIN_ID
            if folder.is_dir():
                for p in folder.iterdir():
                    p.unlink()
                folder.rmdir()
                print(f"  removed {folder.relative_to(ic.ROOT)}")
            print("no photo qualifies: nothing written")
            return 0
        for iid, d in sorted(matches.items()):
            try:
                raw = ic.polite_get(MEDIA.format(uuid=d["uuid"]), a.cache, referer=ORIGIN + "/")
                rows[iid] = (ic.store_image(CHAIN_ID, raw), d["page"])
                print(f"  stored {iid}: {rows[iid][0]} (source bytes {hashlib.sha256(raw).hexdigest()[:12]})")
            except (ValueError, urllib.error.HTTPError) as e:
                print(f"  skipped {iid}: {e}")
    except ic.Blocked as e:
        print(f"STOP (nothing written): {e}", file=sys.stderr)
        return 1
    if not rows:
        print("no photos at all: nothing written (look before deleting an existing file)", file=sys.stderr)
        return 1
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos; files used by 4+ items: {ic.suspected_placeholders(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
