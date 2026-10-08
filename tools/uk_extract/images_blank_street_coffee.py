#!/usr/bin/env python3
"""Item photos for Blank Street (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_blank_street_coffee.py --cache <dir> --dry-run   # render the menu page, list matches, download nothing
    python3 tools/uk_extract/images_blank_street_coffee.py --cache <dir>             # download, store, write images.csv

Source: the chain's own UK menu page https://www.blankstreet.com/en-GB/menu (the same site as the allergen-guide PDF that
data/source/blank-street-coffee is built from). The page lists 14 drink cards ("Cinnamon bun latte", "Blondie matcha", ...), each with
ONE photo and, on 11 of them, an Iced / Hot switch that swaps the card's photo for the hot or the iced drink. The page is rendered in a
browser (headless Chromium via Playwright, only to read the page): for each card the script reads the card name, then clicks Iced and
Hot in turn and records the card's own <img src> each time. Photos are hosted on res.cloudinary.com/blank-street (the chain's own
Cloudinary account, the same images the page shows); the <img src> rendition (w_750) is used, never the larger w_1440 one, because
Cloudinary's `w_` alone scales UP when the original is smaller.

Matching (a card's photo goes only to items that are the same product and the same variant):
- the item's name, with a trailing size "(small)" / "(large)" and the temperature ("Iced X", "Hot X" or "X (hot, small)") taken off, must
  equal the card's name (norm_name equality);
- for a card with an Iced/Hot switch the item's temperature must be the photo's variant; for a card without a switch the item must
  carry no temperature in its name;
- small and large of one drink share the card's photo (the page shows one photo per drink; it names no size).
Not matched, on purpose: "Shaken Vanilla Bean Cold Brew Latte" (the card is called "Shaken vanilla bean cold brew": not the same name),
"(signature ice cream)" and other items whose names have more than a size/temperature in brackets, and every pastry and tea.

robots.txt: www.blankstreet.com answers 404 (no rules), res.cloudinary.com/robots.txt has no Disallow (all lines commented).
Terms (https://www.blankstreet.com/en-GB/tos, "Last Updated: June 23, 2022"): see the report; founder's decision 2026-10-06 installs
photos anyway (accepted risk).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "blank-street-coffee"
MENU_URL = "https://www.blankstreet.com/en-GB/menu"
PLAYWRIGHT = os.environ.get(
    "PLAYWRIGHT_CORE",
    "/tmp/claude-0/-home-user-MenuAi/a431c667-67f2-527e-bd7d-6a276d3d71be/scratchpad/pw/node_modules/playwright-core")
CHROME = os.environ.get("CHROME_BIN", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
# Item ids never given a photo (checked by eye after a download), e.g. {"item-id": "why"}
_SAME_PHOTO = ("the page serves byte-identical photo files for the hot Blondie latte and the hot Cinnamon bun latte (cinnamon dust on "
               "the foam): one of the two is not that drink and the page does not say which, so neither gets it")
EXCLUDE: dict[str, str] = {
    "hot-blondie-latte-small": _SAME_PHOTO, "hot-blondie-latte-large": _SAME_PHOTO,
    "hot-cinnamon-bun-latte-small": _SAME_PHOTO, "hot-cinnamon-bun-latte-large": _SAME_PHOTO,
}

RENDER_JS = r"""
const { chromium } = require(process.argv[2]);
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ userAgent: process.argv[5], viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();
  await page.goto(process.argv[4], { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const n = await page.$$eval('ol > li', lis => lis.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const li = page.locator('ol > li').nth(i);
    const name = (await li.locator('p').first().textContent()).trim();
    const src = async () => li.locator('img').first().getAttribute('src');
    const hasIced = await li.locator('button:has-text("Iced")').count();
    const hasHot = await li.locator('button:has-text("Hot")').count();
    if (hasIced && hasHot) {
      for (const v of ['Iced', 'Hot']) {
        await li.locator(`button:has-text("${v}")`).first().click();
        await page.waitForTimeout(700);
        out.push({ name, variant: v.toLowerCase(), photo: await src() });
      }
    } else {
      out.push({ name, variant: null, photo: await src() });
    }
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
"""


def render_cards(cache: Path) -> list[dict]:
    snap = cache / "menu-cards.json"
    if snap.exists():
        return json.loads(snap.read_text())
    if not ic._robots_allow(MENU_URL):
        raise ic.Blocked(f"robots.txt disallows {MENU_URL}")
    js = cache / "render_cards.js"
    js.write_text(RENDER_JS)
    r = subprocess.run(["node", str(js), PLAYWRIGHT, CHROME, MENU_URL, ic.UA], capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise SystemExit(f"render failed: {r.stderr[-800:]}")
    cards = json.loads(r.stdout.strip().splitlines()[-1])
    snap.write_text(json.dumps(cards, indent=1))
    return cards


_SIZE = re.compile(r"\s*\((?:(hot|iced),\s*)?(small|large)\)\s*$", re.I)
_TEMP_PREFIX = re.compile(r"^(hot|iced)\s+", re.I)


def split_name(name: str) -> tuple[str, str | None, str | None] | None:
    """(base name, temperature or None, size) for items named like 'Iced X (small)', 'X (hot, large)', 'X (small)'; else None."""
    m = _SIZE.search(name)
    if not m:
        return None
    temp = m.group(1).lower() if m.group(1) else None
    size = m.group(2).lower()
    base = name[:m.start()]
    p = _TEMP_PREFIX.match(base)
    if p:
        if temp and temp != p.group(1).lower():
            return None
        temp = p.group(1).lower()
        base = base[p.end():]
    if "(" in base or ")" in base:
        return None
    return base, temp, size


def match(cards: list[dict], items: list[dict]) -> tuple[dict[str, tuple[str, str]], list[str]]:
    """{item_id: (photo_url, card label)}, notes."""
    notes: list[str] = []
    out: dict[str, tuple[str, str]] = {}
    parsed = {}
    for it in items:
        sp = split_name(it["name"])
        if sp:
            parsed[it["id"]] = (ic.norm_name(sp[0]), sp[1])
    for c in cards:
        key = (ic.norm_name(c["name"]), c["variant"])
        hits = [it for it in items if parsed.get(it["id"]) == key]
        label = f'{c["name"]} [{c["variant"] or "no switch"}]'
        if not hits:
            notes.append(f"{label}: no published item with this name and variant")
            continue
        for it in hits:
            if it["id"] in EXCLUDE:
                notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
                continue
            if it["id"] in out:
                notes.append(f"{it['name']}: two cards claim it -> none")
                out.pop(it["id"])
                EXCLUDE[it["id"]] = "ambiguous"
                continue
            out[it["id"]] = (c["photo"], label)
    return out, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    items = ic.load_items(CHAIN_ID)
    cards = render_cards(args.cache)
    matches, notes = match(cards, items)
    names = {i["id"]: i["name"] for i in items}
    print(f"{len(items)} published items; {len(cards)} card photos on the menu page; {len(matches)} items matched")
    for iid, (url, label) in sorted(matches.items()):
        print(f"  MATCH {names[iid]}  <-  {label}")
    for n in notes:
        print("  skip:", n)
    if args.dry_run:
        return 0
    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, (url, _label) in sorted(matches.items()):
            raw = ic.polite_get(url, args.cache, referer=MENU_URL)
            rows[iid] = (ic.store_image(CHAIN_ID, raw), MENU_URL)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopping: not worked round. Nothing was written to images.csv.")
        return 3
    ic.write_images_csv(CHAIN_ID, rows)
    shared = ic.suspected_placeholders(rows)
    files = {f for f, _ in rows.values()}
    size = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN_ID).iterdir()) if (ic.IMAGES_ROOT / CHAIN_ID).is_dir() else 0
    print(f"stored {len(rows)} item photos in {len(files)} files, {size} bytes")
    for f, ids in shared.items():
        print(f"  shared by {len(ids)} items: {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
