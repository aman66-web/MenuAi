#!/usr/bin/env python3
"""Item photos for Rosa's Thai (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_rosas_thai.py --cache <dir> --dry-run     # read the ordering menu, list matches (no photo downloaded)
    python3 tools/uk_extract/images_rosas_thai.py --cache <dir>               # also download, store, write images.csv

Where the chain's own photos are (read 2026-11-17):

  * rosasthai.com/menus (and /menus/nationwide, /menus/westfield) shows the menu by loading
    https://menus.tenkites.com/rosasthai/rosasthailondon (the chain's menu provider, the same data our items come from:
    viewthe.menu/dy2v). Every dish photo in it is on images.tenkites.com, whose robots.txt says `User-agent: * / Disallow: /`
    (only /tenkitestest/menus.html allowed): NOT fetched, and no other address is made up to get round it.
  * The chain's own ordering site https://rosasthai.vmos.io (the "Collect" link in the menu bar of every rosasthai.com page,
    store/store-selection?app=online; the platform is Vita Mojo, white-labelled with the chain's name) shows a photo for its dishes.
    This script reads it. Its pages only answer inside a browser session, so they are opened in a headless Chromium (Playwright in
    web/e2e/node_modules), one page at a time, 2 seconds apart, and the JSON each category page itself loads
    (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles) is saved: every dish ("bundle") has a uuid and a name, and the
    page's photo of that dish is https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid (the
    page's own <img> wraps exactly this address in a Cloudflare resize-and-crop wrapper, multitenant.vmos-static.com/cdn-cgi/image/
    fit=cover,...; we fetch the ORIGINAL, never the cropped wrapper; store_image only downsizes it to <= 640 px WebP).
    The menu read is the "Click & Collect Menu" (menu uuid 962842b1-...) at two London restaurants (STORES below), because our data is
    the chain's London menu. Categories not read: "Meal Deals" (sets of several dishes) and "Beer" (bottles of other brands).

Match rule (exact only, nothing fuzzy):
  * only items whose name is unique among the published items;
  * a dish on the ordering menu whose norm_name equals the item's name, and every dish carrying that name in every store and category
    read is the same dish (one uuid): its photo (entityUUID = that dish's uuid);
  * a dish the ordering site sells under one name with a choice inside it (e.g. a curry with "choose your protein") has no photo of its
    own per choice, so items named "<dish> - <choice>" get none unless the ordering site lists a dish with exactly that name;
  * renamed dishes get none (we never match by similarity);
  * EXCLUDE (by eye, below) never gets one.
source_url = the ordering-site category page that shows the dish (store/<store>/menu/category/<category>/bundles?menuUUID=<menu>).

Robots (read 2026-11-17, RFC 9309 via images_common):
  * rosasthai.com/robots.txt: `User-agent: * / Disallow:` (nothing disallowed; Yoast block).
  * rosasthai.vmos.io/robots.txt: `User-agent: * / Disallow:` (nothing). vmos2.vmos.io answers /robots.txt with the app's HTML (no
    rules). media-multitenant.vmos-static.com/robots.txt: `User-agent: * / Disallow:` (nothing). multitenant.vmos-static.com (the
    crop wrapper) is not used.
  * menus.tenkites.com/robots.txt disallows only /fonts/, /views/ and /*.less$; images.tenkites.com/robots.txt disallows everything
    (see above: its photos are not used).
  * Any 401/403/429 answer or a challenge page stops the run before anything is written (never worked round).

Terms (read 2026-11-17): rosasthai.com has no terms-of-use page (/terms and /terms-and-conditions answer 404; the footer links only
FAQs, Sustainability, Booking Policy, Gender Pay Report, Contact and the Privacy & Cookie Policy). The privacy and booking pages say
nothing about reusing the site's content; the only words found are the footer's "© Copyright 2026 Rosa's Thai". The ordering site's
sign-up form mentions "Terms and Conditions" but its data carries no address for them (not read). No clause about copying or reusing
images was found. Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "rosas-thai"
ORIGIN = "https://rosasthai.vmos.io"
API = "https://vmos2.vmos.io"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
MENU_UUID = "962842b1-c611-4518-a420-b1c512daea5b"   # "Click & Collect Menu" (name "CC Menu") as the ordering site's own record names it
# (store uuid, name) as the ordering site's own store list names them (read 2026-11-17): two London restaurants
STORES = [("5c31350a-7d9d-451d-9c62-a291a2b0cffb", "Rosa's Angel"),
          ("8f4e1847-70a6-4b0f-8551-3d222e4f4943", "Rosa's Covent Garden")]
SKIP_CATEGORIES = r"meal deal|beer|misc|fees"
# Item ids never given an ordering-site photo (looked at by eye after a download): {"item-id": "why"}
EXCLUDE: dict[str, str] = {
    # looked at on a contact sheet 2026-11-17: the ordering site's picture is the soft-drink brand's can, not something Rosa's makes
    "fanta-330ml": "the picture is a Fanta can (a third-party brand's pack)",
    "sprite-330ml": "the picture is a Sprite can (a third-party brand's pack)",
}
# Kept after looking (2026-11-17): the three bubble teas are in Rosa's Thai's own cup printed "ROSA'S THAI" and the Roti Bread sits on
# the chain's own printed paper: the chain's own packaging around the dish, not a promotion, a figure or another brand.

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
    """Read the ordering menu in a headless browser (saved JSON is reused: a rerun opens no page twice)."""
    dump.mkdir(parents=True, exist_ok=True)
    todo = [f"{s}:{MENU_UUID}" for s, _ in STORES if not (dump / f"{s}.done").exists()]
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


def walk(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        yield from walk(sub)


def read_menu(dump: Path) -> dict[str, list[dict]]:
    """{norm_name(dish): [{uuid, name, page, category}]} over every saved category page of every store."""
    dishes: dict[str, list[dict]] = {}
    for store, _ in STORES:
        menus = json.loads((dump / f"{store}_menu.json").read_text(encoding="utf-8").split("\n", 1)[1])["payload"]
        cat_names = {c["uuid"]: c["name"] for m in menus if m["uuid"] == MENU_UUID for c in m["categories"]}
        for f in sorted(dump.glob(f"{store}_cat_*.json")):
            cat = f.stem.split("_cat_", 1)[1]
            payload = json.loads(f.read_text(encoding="utf-8").split("\n", 1)[1])["payload"]
            page = f"{ORIGIN}/store/{store}/menu/category/{cat}/bundles?menuUUID={MENU_UUID}"
            for b in walk(payload):
                dishes.setdefault(ic.norm_name(b["name"]), []).append(
                    {"uuid": b["uuid"], "name": b["name"], "page": page, "category": cat_names.get(cat, cat)})
    return dishes


def match(items: list[dict], dishes: dict[str, list[dict]]) -> tuple[dict[str, tuple[str, str, str]], list[str]]:
    """{item_id: (dish uuid, dish name as printed, page url)}, plus notes."""
    notes: list[str] = []
    count: dict[str, int] = {}
    for it in items:
        count[ic.norm_name(it["name"])] = count.get(ic.norm_name(it["name"]), 0) + 1
    out: dict[str, tuple[str, str, str]] = {}
    for it in items:
        key = ic.norm_name(it["name"])
        hits = dishes.get(key) or []
        if not hits:
            continue
        if count[key] != 1:
            notes.append(f"{it['name']}: {count[key]} published items carry that name -> none")
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
        print(f"ordering menu: {sum(len(v) for v in dishes.values())} dish entries, {len(dishes)} names in {len(STORES)} restaurants")
        matches, notes = match(items, dishes)
        for n in notes:
            print("  note:", n)
        matched_names = {ic.norm_name(names[i]) for i in matches}
        for key, hits in sorted(dishes.items()):
            if key not in matched_names:
                print(f"  not on our menu by that name: {hits[0]['name']!r} ({hits[0]['category']})")
        for iid, (uuid, dish, _page) in sorted(matches.items()):
            print(f"  MATCH {iid:44s} {names[iid]!r} = {dish!r} ({uuid})")
        print(f"{len(matches)} of {len(items)} published items matched")
        if a.dry_run:
            return 0
        for iid, (uuid, _, page) in sorted(matches.items()):
            try:
                raw = ic.polite_get(MEDIA.format(uuid=uuid), a.cache, referer=ORIGIN + "/")
                rows[iid] = (ic.store_image(CHAIN_ID, raw), page)
            except (ValueError, urllib.error.HTTPError) as e:
                print(f"  skipped {iid}: {e}")
    except ic.Blocked as e:
        print(f"STOP (nothing written): {e}", file=sys.stderr)
        return 1
    if not rows:
        print("no photos at all: nothing written", file=sys.stderr)
        return 1
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos; files used by 4+ items: {ic.suspected_placeholders(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
