#!/usr/bin/env python3
"""Item photos for The Breakfast Club (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_the_breakfast_club.py --cache DIR --render --dry-run   # render the 4 store menus once, list matches
    python3 tools/uk_extract/images_the_breakfast_club.py --cache DIR --dry-run            # list matches from the saved menus, no photo fetched
    python3 tools/uk_extract/images_the_breakfast_club.py --cache DIR                      # download, store, write images.csv

Source: the chain's own online-ordering storefront, the one thebreakfastclubcafes.com itself links as "Order Delivery" / "Order for the
office" (https://thebreakfastclub.slerp.com/order, a white-label store run for the chain by Slerp). The chain's main site
(thebreakfastclubcafes.com, Squarespace) has NO per-dish photos: its /menu page embeds the menu PDFs, and the home page's few pictures are
banners named like "Screenshot 2026-06-02 at 18.43.20 2.jpg" (checked 2026-11-17). The storefront has four stores (its own "PartnerDeferred"
answer lists them): the-breakfast-club-spitalfields, the-breakfast-club-berwick-street (the delivery menu) and the two "-catering" stores
(the office-breakfast menu, with sides such as Mushrooms and Homestyle Potatoes). Their sitemaps (/sitemaps/<store>-sitemap.xml) list
91, 95, 46 and 46 product pages; the four menus below hold every one of those products.

How it is read: a store page builds its menu in the browser from ONE POST request the page itself makes to the storefront's own API,
https://thebreakfastclub.slerp.com/api/consumer/v2 (GraphQL operation "Categories"). polite_get only makes GET requests, so with --render
this script renders each store page once in the Playwright Chromium of web/e2e/node_modules (one page at a time, images, fonts and media not
loaded, 2 s between stores, the browser closed at the end) and saves that one answer, exactly as the page received it, as
<cache>/slerp-<store>-categories.json. Nothing else of the site is requested. robots.txt is checked for the store page and the API path
before rendering. A store page that does not make the Categories request (an error or challenge page) stops the script (exit 3).
Each product record in that answer has "id", "name", "slug", "description" and "images": [{"original": <photo url>}]. The photo files are
on assets.slerp.com (the storefront's own image host, /uploads/images/variant/...); they are downloaded with polite_get.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when a product record's "name" has the same norm_name as the
item's name. Records of the delivery stores (Spitalfields, Berwick Street) are used first; a name found only in the catering stores uses those.
Among the records used, all must point to ONE photo, otherwise the item gets none. source_url is that product's own page,
https://thebreakfastclub.slerp.com/order/store/<store>/<slug>. Names that differ by a word are not matched (e.g. "Fried Chicken & Waffles" is
not our "Fried Chicken, Bacon & Waffles"; "Three Hash Browns & 1 Dip" is not "Hash Browns & Dip (3 hash browns)"; "Crispy Bacon x 2" is not
"Bacon"; "BC Beans" is not "Harissa Beans"). The All American is in both the delivery and the catering stores with two uploads of the same
photographer's file (L1010502): the delivery store's is used.

Left out after reading the records and looking at the photos (EXCLUDE below; a rerun can't bring them back):
- tbc-breakfast-burger: the storefront's "TBC Breakfast Burger" is a different build from the restaurant dish we publish: the store record
  says "Sausage patty, crispy streaky bacon, egg, cheese & ketchup, in a toasted English muffin" (871 kcal on the store), the restaurant
  menu PDF says "Sausage patty, double bacon, double cheese, smashed brown and a golden yolk fried egg. Served in a brioche bun with hash
  browns or homestyle potatoes or fries" (1003 kcal). A photo of the muffin would show a different product.

robots.txt (read 2026-11-17): thebreakfastclub.slerp.com has no Disallow line (only a Sitemap line), so the store pages, product pages and
/api/consumer/v2 are allowed. assets.slerp.com answers HTTP 403 (CloudFront "AccessDenied" XML) for /robots.txt: RFC 9309 reads a 4xx as "no
rules" and the founder decided on 2026-10-12 to follow that (images_common._robots_allow), so the photo files may be fetched; the photo files
themselves answer 200. www.thebreakfastclubcafes.com (Squarespace standard): `User-agent: *` disallows /config, /search, /account, /api/,
/static/ and some ?format= / ?tag= queries; the AI crawler names listed (ClaudeBot, anthropic-ai, GPTBot...) are in the same group as `*`,
so they get the same rules. Nothing is fetched from it by this script.

Terms (https://www.thebreakfastclubcafes.com/terms-and-conditions, read 2026-11-17), section 2.2: "Save as may be incidental to you obtaining
authorised access to the content on the Website, you must not reproduce, download, transmit or retransmit, manipulate or store in any format
whether in whole or in part the design and layout of the Website or the information or material published on the pages of it, nor hypertext
or otherwise link to it, without the prior written consent of: www.ferris@lovetbc.com" and 3.1: "The material and information contained on the
Website is for private use only. All other use is forbidden." An express restriction; installed on the founder's decision of 2026-10-06 (his
accepted risk). The Slerp storefront itself shows no terms link (none found in the rendered store pages).

A 401/403/429 on a page or photo, or a robots refusal, stops the run (exit 3) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "the-breakfast-club"
BASE = "https://thebreakfastclub.slerp.com"
API_URL = f"{BASE}/api/consumer/v2"
# delivery stores first (their records win), then the office-breakfast stores
STORES = ["the-breakfast-club-spitalfields", "the-breakfast-club-berwick-street",
          "the-breakfast-club-spitalfields-catering", "the-breakfast-club-berwick-street-catering"]
DELIVERY = {"the-breakfast-club-spitalfields", "the-breakfast-club-berwick-street"}
PHOTO_HOST = "https://assets.slerp.com/uploads/images/"
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core" / "index.mjs"
# Item ids never given a photo (checked against the store records and by eye), {"item-id": "why"}
EXCLUDE: dict[str, str] = {
    "tbc-breakfast-burger": "the store's TBC Breakfast Burger is a different build (English muffin, single bacon and cheese) from the "
                            "restaurant dish we publish (brioche bun, double bacon and cheese, smashed brown, with a side)",
}

RENDER_JS = r"""
import { chromium } from %(pw)s;
import { writeFileSync } from "node:fs";
const [base, cacheDir, ...stores] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
let failed = 0;
try {
  for (const store of stores) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.route("**/*", (r) => ["image", "font", "media"].includes(r.request().resourceType()) ? r.abort() : r.continue());
    let body = null;
    page.on("response", async (res) => {
      const req = res.request();
      if (req.method() === "POST" && res.url().startsWith(base + "/api/consumer/v2") && (req.postData() || "").includes('"operationName":"Categories"')) {
        try { body = await res.text(); } catch {}
      }
    });
    try {
      await page.goto(`${base}/order/store/${store}`, { waitUntil: "networkidle", timeout: 60000 });
      for (let i = 0; i < 20 && body === null; i++) await page.waitForTimeout(500);
    } catch (e) { console.log(`${store}: ${e}`); }
    await ctx.close();
    if (body === null) { console.log(`${store}: the page made no Categories request`); failed++; }
    else { writeFileSync(`${cacheDir}/slerp-${store}-categories.json`, body); console.log(`${store}: saved ${body.length} bytes`); }
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally { await browser.close(); }
process.exit(failed ? 3 : 0);
"""


def render(cache: Path) -> int:
    for url in [f"{BASE}/order/store/{s}" for s in STORES] + [API_URL]:
        if not ic._robots_allow(url):
            print(f"BLOCKED: robots.txt does not allow {url}; not rendered")
            return 3
    js = cache / "render_slerp.mjs"
    js.write_text(RENDER_JS % {"pw": json.dumps(PLAYWRIGHT.as_uri())}, encoding="utf-8")
    return subprocess.run(["node", str(js), BASE, str(cache), *STORES], check=False).returncode


def read_products(cache: Path) -> list[dict]:
    """Every product record of the four saved store menus: store, id, name, slug, description, photo urls."""
    out = []
    for store in STORES:
        path = cache / f"slerp-{store}-categories.json"
        if not path.exists():
            raise SystemExit(f"Missing {path}: run once with --render (see the docstring)")
        data = json.loads(path.read_text(encoding="utf-8"))
        for cat in data["data"]["store"]["categories"]:
            for p in cat["products"]:
                out.append({"store": store, "category": cat["name"], "id": p["id"], "name": p["name"], "slug": p["slug"],
                            "description": p.get("description") or "",
                            "photos": [i["original"] for i in (p.get("images") or []) if i.get("original")]})
    return out


def match(products: list[dict], items: list[dict]) -> tuple[dict[str, tuple[str, str]], list[str]]:
    """{item_id: (photo url, product page url)} and notes on what was not matched."""
    notes: list[str] = []
    by_name: dict[str, list[dict]] = {}
    for p in products:
        by_name.setdefault(ic.norm_name(p["name"]), []).append(p)
    out: dict[str, tuple[str, str]] = {}
    for it in items:
        recs = by_name.get(ic.norm_name(it["name"]), [])
        if not recs:
            continue
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        used = [r for r in recs if r["store"] in DELIVERY] or recs
        photos = {u for r in used for u in r["photos"]}
        if len(photos) != 1:
            notes.append(f"{it['name']}: {len(photos)} different photos on the store records -> none")
            continue
        url = next(iter(photos))
        if not url.startswith(PHOTO_HOST):
            notes.append(f"{it['name']}: photo not on the storefront's image host ({url}) -> none")
            continue
        r = next(r for r in used if url in r["photos"])
        out[it["id"]] = (url, f"{BASE}/order/store/{r['store']}/{r['slug']}")
    item_keys = {ic.norm_name(i["name"]) for i in items}
    for key, recs in sorted(by_name.items()):
        if key not in item_keys:
            notes.append(f"{recs[0]['name']}: on the store menu, no published item with exactly this name")
    return out, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--render", action="store_true", help="render the four store pages once and save their menu answers")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    if args.render:
        rc = render(args.cache)
        if rc:
            print("Rendering failed: not worked round. Nothing was stored and no images.csv was written.")
            return 3
    items = ic.load_items(CHAIN_ID)
    products = read_products(args.cache)
    matches, notes = match(products, items)
    names = {i["id"]: i["name"] for i in items}
    print(f"{len(items)} published items; {len(products)} product records in {len(STORES)} store menus; {len(matches)} exact-name matches")
    for iid, (url, page) in sorted(matches.items()):
        print(f"  MATCH {names[iid]}  <-  {page}  {url}")
    for n in notes:
        print("  skip:", n)
    if args.dry_run:
        return 0
    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, (url, page) in sorted(matches.items()):
            raw = ic.polite_get(url, args.cache, referer=page)
            try:
                rows[iid] = (ic.store_image(CHAIN_ID, raw), page)
            except ValueError as e:
                print(f"  not stored, {names[iid]}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopping: not worked round. Nothing was stored and no images.csv was written.")
        return 3
    ph = ic.suspected_placeholders(rows)
    if ph:
        print("look at these shared files:", ph)
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
