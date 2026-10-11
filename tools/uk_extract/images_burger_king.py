#!/usr/bin/env python3
"""Item photos for Burger King UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_burger_king.py --cache DIR [--dry-run]

Source: ONE page, https://www.burgerking.co.uk/menu, a JavaScript app (its HTML has no products), so the page is rendered once in headless Chromium
(Playwright, the pattern of tools/uk_extract/fireaway.py: `node` + playwright-core at web/e2e/node_modules and Chromium at /opt/pw-browsers; one page load, no click,
no login, no store chosen) and the rendered HTML is kept as DIR/menu.html (a rerun with that file present loads nothing). Every menu tile in it is
`<a data-testid="menu-tile-menu-tile-Link"> <picture><source srcset="https://cdn.sanity.io/images/czqk28jt/prod_bk_gb/<hash>-<w>x<h>.png?w=..."> ...
<h2 data-testid="tile-header-<slug>">NAME</h2></a>`: the product's name and its photo in one tile. The photo is a file in the chain's own media store (the CMS
the page loads its menu from, cdn.sanity.io project czqk28jt / dataset prod_bk_gb); we fetch the ORIGINAL asset (the srcset URL without its `?w=...&q=40` resize
parameters, so nothing is re-encoded at low quality) and store_image only downsizes it to <= 640 px and converts to WebP.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (data/source/burger-king/items.csv, built from the chain's nutrition PDF) only when
  1. a tile's heading has the same norm_name as the item's whole name ("WHOPPER(R)" = "Whopper"), and
  2. every tile with that name (a product is listed under several menu sections) carries the same single photo, and
  3. the photo is on cdn.sanity.io/images/czqk28jt/.
Items the page words differently or does not list as a tile ("Large Fries", "9pc Kansas BBQ Chicken Fries" vs a tile named otherwise...) get no photo.

Terms (https://www.burgerking.co.uk/terms-of-use, linked from the footer, read 2026-10-11): the page rendered no text for a visitor in headless Chromium (65 characters: the header and
"Cart total"), so no clause about images or content could be read; nothing on the menu page restricts reuse. robots.txt (https://www.burgerking.co.uk/robots.txt, read 2026-10-11):
"User-agent: * / Disallow: /bcc, Disallow: /rewards/details" (the menu is allowed). The media host's robots.txt (https://cdn.sanity.io/robots.txt): "User-agent: * / Allow: /files/cgnmnbqj/ /
Disallow: /*.pdf / Disallow: /*.PDF" (the /images/ path is not disallowed; this script never fetches a PDF). polite_get checks it for every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    UA, Blocked, _robots_allow, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "burger-king"
MENU_URL = "https://www.burgerking.co.uk/menu"
PHOTO_PREFIX = "https://cdn.sanity.io/images/czqk28jt/"
PLAYWRIGHT = "/home/user/MenuAi/web/e2e/node_modules/playwright-core"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
DEFAULT_CACHE = Path("/tmp/menumacros-images-burger-king")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {}

RENDER_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ userAgent: process.argv[4], locale: 'en-GB', viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  const resp = await page.goto(process.argv[5], { waitUntil: 'networkidle', timeout: 60000 });
  if (!resp || resp.status() !== 200) throw new Error('HTTP ' + (resp && resp.status()));
  await new Promise((r) => setTimeout(r, 4000));
  // the tiles below the fold load their pictures lazily: scroll down the page in steps, as a visitor would
  let stable = 0;
  for (let i = 0; i < 200 && stable < 3; i++) {
    const [y, h] = await page.evaluate(() => { window.scrollBy(0, 500); return [window.scrollY + window.innerHeight, document.documentElement.scrollHeight]; });
    await new Promise((r) => setTimeout(r, 600));
    stable = y >= h - 2 ? stable + 1 : 0;
  }
  await new Promise((r) => setTimeout(r, 2000));
  const txt = await page.evaluate(() => document.body.innerText);
  if (/just a moment|verify you are human|attention required|access denied/i.test(txt.slice(0, 400))) throw new Error('challenge page: stop, never work round it');
  fs.writeFileSync(process.argv[6], await page.content());
  await browser.close();
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
"""

TILE_SPLIT = '<a data-testid="menu-tile-menu-tile-Link"'
TILE_NAME = re.compile(r'<h2 data-testid="tile-header-[^"]*"[^>]*>(.*?)</h2>', re.S)
SANITY_IMG = re.compile(r"https://cdn\.sanity\.io/images/[^\s\"',]+")


def render(cache: Path) -> str:
    out = cache / "menu.html"
    if not out.exists():
        if not _robots_allow(MENU_URL):
            raise Blocked(f"robots.txt disallows {MENU_URL}")
        cache.mkdir(parents=True, exist_ok=True)
        js = cache / "render.js"
        js.write_text(RENDER_JS)
        r = subprocess.run(["node", str(js), PLAYWRIGHT, CHROME, UA, MENU_URL, str(out)], capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise Blocked("rendering the menu page failed (a block, a challenge page or a changed layout are NOT to be worked round: stop and report): " + r.stderr[-400:])
    return out.read_text(encoding="utf-8")


def tiles(page: str) -> dict[str, set[str]]:
    """norm_name of the tile heading -> the set of original photo URLs (no resize parameters) its tiles carry."""
    out: dict[str, set[str]] = {}
    for seg in page.split(TILE_SPLIT)[1:]:
        m = TILE_NAME.search(seg)
        if not m:
            continue
        name = htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(1)))
        urls = {re.sub(r"\?.*$", "", u) for u in SANITY_IMG.findall(htmllib.unescape(seg))}
        out.setdefault(norm_name(name), set()).update(urls)   # a tile whose picture has not loaded adds nothing
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        by_name = tiles(render(args.cache))
        print(f"{len(by_name)} distinct tile names on {MENU_URL}")
        matched: dict[str, str] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            urls = by_name.get(norm_name(it["name"]))
            if urls is None:
                skipped.append(f"{it['id']}: no tile on the menu page is named {it['name']!r}")
                continue
            if not urls:
                skipped.append(f"{it['id']}: the tile named {it['name']!r} shows no photo")
                continue
            if len(urls) != 1:
                skipped.append(f"{it['id']}: tiles named {it['name']!r} carry {len(urls)} different photos")
                continue
            (url,) = urls
            if not url.startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: photo {url} is not in the chain's media store")
                continue
            matched[it["id"]] = url
        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url[len(PHOTO_PREFIX):]}")
                continue
            raw = polite_get(url, args.cache, referer=MENU_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
            print(f"  {item_id:50} {fname}  <- {url[len(PHOTO_PREFIX):]}")
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
