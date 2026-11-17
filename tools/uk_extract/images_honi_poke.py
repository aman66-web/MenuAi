#!/usr/bin/env python3
"""Item photos for Honi Poke from its own website's dish pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_honi_poke.py --cache DIR --dry-run   # read the pages, list matches, download no photo
    python3 tools/uk_extract/images_honi_poke.py --cache DIR             # download, store, write images.csv

Source: honipoke.com (a Webflow site), the same site our items come from (tools/uk_extract/honi_poke.py reads its Nutritional Calculator).
The calculator itself shows no dish photos. The chain's menu listing pages (/poke, /warm-bowls, /menu-ramen; /poke-salads answers 404 on
2026-11-17 though the menu still links it) link one page per dish, /menu/<slug>, and each dish page is server-rendered:
`<section class="section-4"> ... <img src="https://cdn.prod.website-files.com/<site>/<id>_<file>.jpg" ... class="image-15"/> ...
<h1 class="black-menu-item-title">NAME</h1> ... <div class="ingredients">...`. The photo file is on the site's own Webflow asset host
(cdn.prod.website-files.com, the host every picture on honipoke.com is served from, under the site's own asset folder). The page's <img>
names the original file and offers smaller copies (-p-500/-p-800/-p-1080) in srcset; the original is fetched and store_image only
downsizes it to <= 640 px WebP.
Dish pages read: the slugs tools/uk_extract/honi_poke.py lists for the published bowls (honi_poke.ITEMS), plus every /menu/<slug> the
listing pages link. The sides (Crab Salad, Guacamole, Salmon Tartare, Japanese Salad, Seaweed Salad, Tortilla Chips) have no dish page or
listing card on honipoke.com. California (/menu/california-bowl) and Tokyo Yuzu (/menu/tokyo-yuzu-salmon) answer 404 on 2026-11-17 and
appear on no listing page.

Second source, only for items the dish pages leave without a photo: the chain's own ordering site https://honipoke.vmos.io (the
"click+collect" button in the header of every honipoke.com page links https://honipoke.vmos.io/; the platform is Vita Mojo, white-labelled
with the chain's name and logo). Its pages answer only inside a browser session, so they are opened in a headless Chromium (Playwright in
web/e2e/node_modules), one page at a time, 2 seconds apart, at ONE restaurant: Bankside (the first in the site's own shop list), on its
"Online menu" (STORE, MENU below). The JSON each category page itself loads (https://vmos2.vmos.io/catalog/categories/<uuid>/bundles) is
saved with the list of picture addresses the rendered page shows. Each dish record has a uuid and a name; the page's photo of it is
https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<uuid>&scope=grid (the page wraps exactly this address in a Cloudflare
resize-and-crop wrapper, multitenant.vmos-static.com/cdn-cgi/image/fit=cover,...; the ORIGINAL is fetched, never the cropped wrapper).

Match rule (exact, nothing fuzzy):
  1. dish pages: a dish page's photo is attached to a published item only when the page's <h1> has the same norm_name as the item's name,
     exactly one page read carries that name, and the photo is on cdn.prod.website-files.com. Our ramen names already carry " Ramen" as the
     dish pages print them ("Paitan Chicken Ramen").
  2. ordering site (only for an item rule 1 leaves without a photo): the dish record's name has the same norm_name as the item's name, every
     record carrying that name in the categories read is ONE record (one uuid; Tortilla Chips is listed under both "Sides" and "Snacks &
     Desserts" as the same record), and the rendered category page shows that record's picture (its media address is among the page's
     pictures). A record the page shows without a photo gets none.
Not matched, by these rules: our "Swicy Prawns" (the calculator's name) against the dish page /menu/swicy-prawn and the ordering record
"Swicy Prawn" (singular; the dish page prints the same ingredient list as the calculator). The names differ, so it gets no photo; it would
need the founder's say-so to treat them as one dish. Also none: Guacamole ("Smashed Avocado" on the ordering site), Japanese Salad
("Japanese Pickled Salad"), Seaweed Salad ("Wakame Seaweed Salad"), Salmon Tartare, California and Tokyo Yuzu (no record of those names).

robots.txt (read 2026-11-17): https://www.honipoke.com/robots.txt holds only a Sitemap line (no rules); cdn.prod.website-files.com answers
/robots.txt with 403 (Amazon S3 "AccessDenied"), which RFC 9309 reads as "no rules" (the founder's decision of 2026-10-12 to follow the
standard; this is why the photo work was not run before). honipoke.vmos.io/robots.txt and media-multitenant.vmos-static.com/robots.txt:
`User-agent: * / Disallow:` (nothing disallowed); vmos2.vmos.io has no rules file. None names an AI crawler. polite_get checks robots.txt on
every URL; check_robots() checks every kind of ordering-site address before the browser opens anything.

Terms: honipoke.com has no terms-of-use page; its /legal page (linked in the footer) is a privacy notice only ("This policy was last updated on
[25/07/2025]") and has no clause about copying or reusing the site's content or images (read 2026-11-17). The footer reads "(c) 2026 HONI
POKE" (a generic notice, not an express prohibition). The ordering site's menu pages show no terms of their own. Photos installed on the
founder's decision of 2026-10-06 (CLAUDE.md rule 2).

Run of 2026-11-17: 18 dish pages (11 published items matched) and the Bankside ordering menu (2 more: Crab Salad, Tortilla Chips); 13 of 20
published items have a photo, every one looked at on a contact sheet. Kept after looking: Tortilla Chips shows the chips in the chain's own
paper bag printed "HONI POKE" (the chain's own packaging, no figure, price or offer, the chips visible through its window).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
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
import honi_poke as hpk  # noqa: E402  (ITEMS: the dish page slug the extraction ties to each calculator row)
import images_common as ic  # noqa: E402
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "honi-poke"
HOST = "https://www.honipoke.com"
LISTINGS = ["/poke", "/warm-bowls", "/menu-ramen", "/poke-salads"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-honi-poke")
PHOTO_URL = re.compile(r"^https://cdn\.prod\.website-files\.com/[0-9a-f]+/[0-9a-f]+_[A-Za-z0-9%._-]+\.(?:jpe?g|png|webp)$")
DISH_LINK = re.compile(r'href="(/menu/[a-z0-9-]+)"')
TITLE = re.compile(r'<h1 class="black-menu-item-title">(.*?)</h1>', re.S)
HERO = re.compile(r'<section class="section-4">.*?<img src="([^"]+)"[^>]*class="image-15"', re.S)
# Looked at on the contact sheet (2026-11-17) and left without a photo; a rerun must not bring them back: {item id: why}
EXCLUDE: dict[str, str] = {}

# The ordering site (second source): one restaurant, its "Online menu" (uuids from the site's own shop list, 2026-11-17)
ORIGIN = "https://honipoke.vmos.io"
API = "https://vmos2.vmos.io"
STORE = ("e5f2c350-93c1-46cb-82c3-f1a00486880e", "Bankside")
MENU = "f5ca3def-94a0-4063-811f-fecae93b90ed"
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
SKIP_CATEGORIES = r"^(meal deals?|alcohol)$"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"

# Opens the menu, then each category page as a visitor would (scrolled once so every tile is drawn), saving the JSON the page itself loads
# and the picture addresses it shows. Any 401/403/429 or a challenge page stops it (never worked round).
CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [ua, outDir, delay, origin, skip, store, menu] = process.argv.slice(3);
const SKIP = new RegExp(skip, 'i');
const BLOCK = /bugsnag|doubleclick|google-analytics|googletagmanager|facebook|hotjar|clarity|tiktok|analytics\.google|onetrust|domdog|workers\.dev/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({});
  try {
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1200, height: 1400 }, locale: 'en-GB' });
    await ctx.route(BLOCK, (r) => r.abort());
    const page = await ctx.newPage();
    const got = {}; const pending = []; const bad = [];
    page.on('response', (r) => {
      const u = r.url(); const s = r.status();
      if ([401, 403, 429].includes(s) && !BLOCK.test(u)) bad.push(`${s} ${u}`);
      let key = null; let m;
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
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
"""


def check_robots() -> None:
    """Every kind of address the ordering pages use, and the photo host, must be allowed (RFC 9309)."""
    for u in (f"{ORIGIN}/store/store-selection?app=online", f"{ORIGIN}/store/x/menu/overview?menuUUID=y",
              f"{ORIGIN}/store/x/menu/category/c/bundles?menuUUID=y", f"{API}/catalog/v2/menu",
              f"{API}/catalog/categories/c/bundles", MEDIA.format(uuid="x")):
        if not ic._robots_allow(u):
            raise Blocked(f"robots.txt disallows {u}")


def capture(dump: Path) -> None:
    """Read the ordering menu in a headless browser, once (a saved run is reused: a rerun opens no page twice)."""
    dump.mkdir(parents=True, exist_ok=True)
    if (dump / f"{STORE[0]}.done").exists():
        return
    check_robots()
    js = dump / "capture.js"
    js.write_text(CAPTURE_JS)
    r = subprocess.run(["node", str(js), str(PLAYWRIGHT), ic.UA, str(dump), "2", ORIGIN, SKIP_CATEGORIES, STORE[0], MENU],
                       capture_output=True, text=True, timeout=1800, env=os.environ.copy())
    if r.returncode != 0:
        raise Blocked("reading the ordering menu failed (a 401/403/429, a challenge page or a changed layout are NOT to be worked "
                      "round: stop and report): " + r.stderr[-1500:])


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8").split("\n", 1)[1])


def _walk(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        if not re.match(SKIP_CATEGORIES, (sub.get("name") or "").strip(), re.I):
            yield from _walk(sub)


def read_ordering(dump: Path) -> dict[str, list[dict]]:
    """{norm_name(record name): [{uuid, name, page, category, shown}]} over every saved category page."""
    store = STORE[0]
    menus = _load(dump / f"{store}_menu.json")["payload"]
    cats = {c["uuid"]: " ".join(c["name"].split()) for m in menus if m["uuid"] == MENU for c in m["categories"]}
    if not cats:
        raise SystemExit(f"the saved ordering menu has no menu {MENU}: look before changing anything")
    out: dict[str, list[dict]] = {}
    for cat, cname in cats.items():
        if re.match(SKIP_CATEGORIES, cname, re.I):
            continue
        f = dump / f"{store}_cat_{cat}.json"
        if not f.exists():
            raise SystemExit(f"category {cname} was not saved: delete {dump} and rerun the capture")
        imgs = " ".join(json.loads((dump / f"{store}_cat_{cat}.imgs.json").read_text(encoding="utf-8")))
        page = f"{ORIGIN}/store/{store}/menu/category/{cat}/bundles?menuUUID={MENU}"
        for b in _walk(_load(f)["payload"]):
            name = " ".join(b["name"].split())
            out.setdefault(norm_name(name), []).append(
                {"uuid": b["uuid"], "name": name, "page": page, "category": cname, "shown": f"entityUUID={b['uuid']}" in imgs})
    return out


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def get_page(path: str, cache: Path) -> str | None:
    """The page's HTML, or None when it answers 404 (a dish taken off the site). Blocked propagates."""
    try:
        return polite_get(HOST + path, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the pages and list matches; download no photo, write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    try:
        slugs = [f"/menu/{t[4]}" for t in hpk.ITEMS if t[4]]
        for path in LISTINGS:
            page = get_page(path, args.cache)
            if page is None:
                print(f"  listing {path}: 404 (not on the site now)")
                continue
            slugs += DISH_LINK.findall(page)
        dishes: dict[str, list[dict]] = {}
        for path in dict.fromkeys(slugs):
            page = get_page(path, args.cache)
            if page is None:
                print(f"  dish page {path}: 404 (not on the site now)")
                continue
            t, img = TITLE.search(page), HERO.search(page)
            if not t:
                raise SystemExit(f"{path}: no dish title found: the page has changed shape, look before changing the parser")
            title = clean(t.group(1))
            dishes.setdefault(norm_name(title), []).append(
                {"title": title, "page": HOST + path, "photo": html.unescape(img.group(1)) if img else None})
        print(f"{sum(len(v) for v in dishes.values())} dish pages read; {len(items)} published items")

        matched: dict[str, dict] = {}
        for it in items:
            if it["id"] in EXCLUDE:
                skipped.append(f"{it['id']}: left out after looking: {EXCLUDE[it['id']]}")
                continue
            hits = dishes.get(norm_name(it["name"])) or []
            if not hits:
                skipped.append(f"{it['id']}: no dish page is titled {it['name']!r}")
                continue
            if len(hits) != 1:
                skipped.append(f"{it['id']}: {len(hits)} dish pages carry that title -> none")
                continue
            d = hits[0]
            if not d["photo"] or not PHOTO_URL.match(d["photo"]):
                skipped.append(f"{it['id']}: the dish page shows no photo on the site's own asset host ({d['photo']!r})")
                continue
            matched[it["id"]] = d
        used = {norm_name(d["title"]) for d in matched.values()}
        for key, hits in sorted(dishes.items()):
            if key not in used:
                print(f"  dish page not used: {hits[0]['title']!r} ({hits[0]['page']})")

        # second source: the ordering site, only for the items still without a photo
        left = [it for it in items if it["id"] not in matched and it["id"] not in EXCLUDE]
        if left:
            capture(args.cache / "ordering")
            records = read_ordering(args.cache / "ordering")
            print(f"ordering site ({STORE[1]}): {sum(len(v) for v in records.values())} dish entries, {len(records)} names")
            still: list[str] = []
            for it in left:
                hits = records.get(norm_name(it["name"])) or []
                uuids = {h["uuid"] for h in hits}
                if not hits:
                    still.append(f"{it['id']}: no dish page and no ordering-site record is named {it['name']!r}")
                elif len(uuids) != 1:
                    still.append(f"{it['id']}: {len(uuids)} different ordering-site records carry that name -> none")
                elif not any(h["shown"] for h in hits):
                    still.append(f"{it['id']}: the ordering page shows this record without a photo")
                else:
                    h = next(h for h in hits if h["shown"])
                    matched[it["id"]] = {"title": h["name"], "page": h["page"], "photo": MEDIA.format(uuid=h["uuid"])}
            left_ids = {it["id"] for it in left}
            skipped[:] = [s for s in skipped if s.split(":", 1)[0] not in left_ids] + still

        for item_id, d in sorted(matched.items()):
            if args.dry_run:
                print(f"  MATCH {item_id:28} <- {d['title']!r} {d['photo'].rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(d["photo"], args.cache, referer=d["page"])
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {d['photo']}: {e}")
                continue
            rows[item_id] = (fname, d["page"])
            print(f"  {item_id:28} {fname}  <- {d['title']!r} {d['photo'].rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
