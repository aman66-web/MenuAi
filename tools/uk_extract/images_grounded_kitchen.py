#!/usr/bin/env python3
"""Item photos for Grounded Kitchen (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_grounded_kitchen.py --cache <dir> --dry-run     # read the ordering menu, list matches (no photo downloaded)
    python3 tools/uk_extract/images_grounded_kitchen.py --cache <dir>               # also download, store, write images.csv

Where the chain's own photos are (read 2026-11-17):

  * The chain's own ordering site https://groundedkitchen.vmos.io (the "Eat In / Collection order" button on
    https://www.groundedkitchen.com/orderonline, and "Order Online" in the menu bar of every groundedkitchen.com page, both link
    https://groundedkitchen.vmos.io/store/store-selection?app=online; the platform is Vita Mojo, white-labelled with the chain's name).
    This is the site our items were read from (tools/uk_extract/grounded_kitchen.py, 12 October 2026), so the photos come from the very
    product records ("bundles") the items were built from. Its pages only answer inside a browser session, so they are opened in a
    headless Chromium (Playwright in web/e2e/node_modules), one page at a time, 2 seconds apart, at the same three restaurants the items
    were read at (grounded_kitchen.STORES: Leamington Spa and Metrocentre on the shared menu, High Wycombe on its own). The JSON each category
    page itself loads (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles) is saved, and so is the list of the picture
    addresses the rendered page shows. Every dish has a uuid and a name, and the page's photo of that dish is
    https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid (the page's own <img> wraps exactly
    this address in a Cloudflare resize-and-crop wrapper, multitenant.vmos-static.com/cdn-cgi/image/fit=cover,...; we fetch the ORIGINAL,
    never the cropped wrapper; store_image only downsizes it to <= 640 px WebP). Categories not read: "Bundles" (meal deals) and "Alcohol",
    as in grounded_kitchen.py.
  * www.groundedkitchen.com/menu (a Wix restaurant menu, Queens Road, Leicester) also shows a photo per dish (an older shoot, black bowls),
    but it is a different set of records from the ones our items were read from and does not name the sizes our rice bowls and baos are
    published at; no photo is taken from it. A few of its pictures were opened only to check by eye which drink or wrap an ordering-site
    picture shows (see EXCLUDE); none is stored.

Match rule (exact only, nothing fuzzy):
  * only items whose name is unique among the published items;
  * the dish's name is made exactly the way grounded_kitchen.py made the item's name from the same record (heat-mark emoji and a leading
    "NEW!" tidied away, and, for a product offering sizes, the size the page opens on added in brackets: "Chicken Rice Bowl (Small)", the
    record whose per-serving block was published); its norm_name must equal the item's name;
  * the record is taken from the shared menu ("All day", QSR Menu Own, used by 8 of the 9 restaurants; read at Leamington Spa and
    Metrocentre) when that menu carries the name, otherwise from High Wycombe's own menu; within that menu every dish carrying the name, in
    every restaurant and category read, must be one record (one uuid): otherwise none. (High Wycombe's menu keeps its own records, with
    their own uuids, for the same dishes; every published item is on the shared menu, so its record and photo are the shared menu's,
    except the one item in USE_OWN_MENU.)
  * the dish's photo must be shown on the rendered category page (its media address, with that record's own uuid, is among the page's
    pictures): a dish the page shows without a photo gets none;
  * EXCLUDE (by eye, below) never gets one; USE_OWN_MENU (by eye, below) takes High Wycombe's record instead of the shared menu's.
A rice bowl published at its default size ("(Small)") shows the photo of its product record (one picture for every size; it shows a bowl,
not a size). The baos published as "(Single)" are left out by eye: their record's one picture shows two baos (EXCLUDE).
source_url = the ordering-site category page that shows the dish (store/<store>/menu/category/<category>/bundles?menuUUID=<menu>), at
the first restaurant (STORES order) whose page shows it.

Robots (read 2026-11-17, RFC 9309 via images_common):
  * groundedkitchen.vmos.io/robots.txt: `User-agent: * / Disallow:` (nothing disallowed).
  * vmos2.vmos.io answers /robots.txt with a 301 to the app (no rules file).
  * media-multitenant.vmos-static.com/robots.txt: `User-agent: * / Disallow:` (nothing). multitenant.vmos-static.com (the crop wrapper)
    is not used.
  * www.groundedkitchen.com/robots.txt (Wix): `User-agent: * / Allow: / / Disallow: *?lightbox=`; PetalBot blocked; no group names an AI
    crawler.
  * static.wixstatic.com (the Wix menu's pictures, opened only for the by-eye checks) answers /robots.txt with 403: no rules (RFC 9309).
  * Any 401/403/429 answer or a challenge page stops the run before anything is written (never worked round).

Run of 2026-11-17: 285 dish entries (108 names) on the three restaurants' ordering menus; all 81 published items matched a record whose
picture the page shows; 8 left out after looking (EXCLUDE), 1 taken from High Wycombe's record (USE_OWN_MENU): 73 photos, 73 files
(640 x 360 WebP, 5-27 KB, 1.3 MB in all), every one looked at on contact sheets and full-size crops.

Terms (read 2026-11-17): https://www.groundedkitchen.com/terms-conditions ("Terms & Conditions", linked as "Terms of Use" in the footer of
every groundedkitchen.com page; owner Cooper and Hill Ltd, the brand's franchisor) says: "This website contains material which is owned by
or licensed to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions." (no separate copyright
notice was found; the footer reads "© Grounded Kitchen 2026"). An express restriction on reproducing the site's material; installed on the
founder's decision of 2026-10-06 (his accepted risk, CLAUDE.md rule 2). The ordering site groundedkitchen.vmos.io shows no terms of its own
on the menu pages read.
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
import grounded_kitchen as gk  # noqa: E402  (STORES, SKIP, EMOJI: the same reader the items came from)
import images_common as ic  # noqa: E402
import vita_mojo as vm  # noqa: E402  (default_size)

CHAIN_ID = "grounded-kitchen"
ORIGIN = gk.ORIGIN
API = "https://vmos2.vmos.io"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
STORES = gk.STORES          # (store uuid, name, menu uuid), the three restaurants the items were read at
SKIP_CATEGORIES = gk.SKIP   # Bundles, Alcohol, Meal deals
# Item ids never given an ordering-site photo (looked at by eye on contact sheets and full-size crops, 2026-11-17): {"item-id": "why"}
EXCLUDE: dict[str, str] = {
    "cawston-press-kids-apple-and-pear": "the picture is the Cawston Press carton (a third-party brand's pack), which prints 'NO ADDED SUGAR'",
    "strawberry-ube": "the picture is the Blueberry Ube's photograph (the same cup, the same dark blueberry layer, drips and specks in the same "
                      "places; no strawberry in it); the chain's own website menu also shows one picture for both ube drinks",
    "blueberry-matcha": "the picture shows a pink layer with no blueberry in it (the chain's own website menu shows its Blueberry Matcha with a "
                        "dark purple blueberry layer): a different drink",
    "vegetable-dumpling-5": "the picture is the Chicken Dumpling's photograph, re-coloured and shifted (the same dumplings, spring onion and "
                            "sesame seeds in the same places; the Chicken Dumpling record on both menus uses the original): not a photo of "
                            "the vegetable dumplings",
    # the bao records offer Single (104-113 g) and Double (208-226 g); our items are the Single bao, the picture shows two baos
    "beef-bao-single": "the picture shows two baos (the Double size); the item is one bao and its figures are for one",
    "salmon-bao-single": "the picture shows two baos (the Double size); the item is one bao and its figures are for one",
    "tofu-bao-single": "the picture shows two baos (the Double size); the item is one bao and its figures are for one",
    "lamb-bao-single": "the picture shows two baos (the Double size); the item is one bao and its figures are for one",
}
# Item ids whose photo comes from High Wycombe's own menu instead of the shared one (looked at 2026-11-17): {"item-id": "why"}
USE_OWN_MENU: dict[str, str] = {
    "lamb-wrap": "the shared menu's Lamb Wrap record shows the very file its Beef Wrap record shows (the beef wrap picture, which High "
                 "Wycombe's Beef Wrap uses too); High Wycombe's own Lamb Wrap record has its own picture of the lamb wrap",
}
# Kept after looking (2026-11-17): the drinks are in the chain's own cup printed "GROUNDED KITCHEN", and the two Kataifi Mochi are in the
# chain's own printed pack ("grounded kitchen", the flavour, a "V" mark; no figure, price or offer): the chain's own packaging, not a promotion.
# Tteokbokki Side shows the Tteokbokki Bowl's dish in a smaller serving (the same dish); every bowl was checked for its own protein.

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
    """Read the ordering menu in a headless browser (saved JSON is reused: a rerun opens no page twice)."""
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
    """The item name grounded_kitchen.py makes from this record (see its build(): emoji and 'NEW!' tidied, the default size added)."""
    name = re.sub(r"^new!\s*", "", " ".join(gk.EMOJI.sub("", b["name"]).split()), flags=re.I)
    ds = vm.default_size(b)
    if ds:
        name = f"{name} ({ds[0]})"
    return name


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
    """{norm_name(display name): [{uuid, name, page, category, store, shown}]} over every saved category page of every store."""
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


def match(items: list[dict], dishes: dict[str, list[dict]]) -> tuple[dict[str, dict], list[str]]:
    """{item_id: the shown record (uuid, name, page, ...) whose photo the item gets}, plus notes."""
    notes: list[str] = []
    count: dict[str, int] = {}
    for it in items:
        count[ic.norm_name(it["name"])] = count.get(ic.norm_name(it["name"]), 0) + 1
    order = {s[1]: i for i, s in enumerate(STORES)}
    menu_of = {s[1]: s[2] for s in STORES}
    shared = STORES[0][2]   # the shared menu (Leamington Spa, Metrocentre)
    out: dict[str, dict] = {}
    for it in items:
        key = ic.norm_name(it["name"])
        hits = dishes.get(key) or []
        if not hits:
            notes.append(f"{it['name']}: no dish of that name on the ordering menu read -> none")
            continue
        if count[key] != 1:
            notes.append(f"{it['name']}: {count[key]} published items carry that name -> none")
            continue
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        if it["id"] in USE_OWN_MENU:
            pool = [h for h in hits if menu_of[h["store"]] != shared]
        else:
            pool = [h for h in hits if menu_of[h["store"]] == shared] or hits
        if not pool:
            notes.append(f"{it['name']}: no record of that name on the menu chosen for it -> none")
            continue
        uuids = {h["uuid"] for h in pool}
        if len(uuids) != 1:
            notes.append(f"{it['name']}: {len(uuids)} different records carry that name on one menu -> none")
            continue
        shown = sorted((h for h in pool if h["shown"]), key=lambda h: order[h["store"]])
        if not shown:
            notes.append(f"{it['name']}: the page shows this dish without a photo -> none")
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
        print(f"ordering menu: {sum(len(v) for v in dishes.values())} dish entries, {len(dishes)} names at {len(STORES)} restaurants")
        matches, notes = match(items, dishes)
        for n in notes:
            print("  note:", n)
        matched_names = {ic.norm_name(names[i]) for i in matches}
        published = {ic.norm_name(n) for n in names.values()}
        for key, hits in sorted(dishes.items()):
            if key not in matched_names and key not in published:
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
