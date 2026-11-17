#!/usr/bin/env python3
"""Item photos for Tortilla from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_tortilla.py --cache DIR [--dry-run] [--with-pending]

Source: https://www.tortilla.co.uk/menu/ingredients and https://www.tortilla.co.uk/menu/nutrition-calculator (the chain's own menu pages; the
nutrition guide our items come from is linked from https://www.tortilla.co.uk/menu/nutrition-and-allergens). Both pages embed the chain's CMS
(Storyblok) stories as JSON: an "ingredient" story per ingredient (`heading`, per-100 g `kcal`/`protein`/`carbs`/`fat`, a `cover` photo
https://a.storyblok.com/f/158888/<w>x<h>/<hash>/<file>; the grid's square `thumbnail` is not used) and, on the calculator, a "product" story per
product (Burrito, Bowl, Tortilla Chips, Snacks...) whose `product_sizes` ("Medium", "Large", "One Size") list the ingredients it is built from with
their weight in grams. The cover is fetched as the CMS serves it, so store_image (resize to <= 640 px, WebP) makes the only change.
Nothing else is requested besides the two pages and the photo files.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  A. an ingredient story's heading has the same norm_name as the item's name ("Dessert Quesadilla"); or
  B. the item is "Medium <heading>" / "Large <heading>" (norm_name equality of the rest with an ingredient heading), AND a calculator product
     size of that name ("Medium" / "Large") lists that very ingredient story (by its uuid) at a weight whose per-100 g numbers reproduce the
     item's printed kcal (to 1 kcal) and protein, carbohydrate and fat (to 1 g). So the chain's own record names that size of that ingredient
     and points at the story that carries the photo: the Tortilla Chips product lists Guacamole at 120 g (Medium) and 240 g (Large), which
     gives exactly the guide's Medium Guacamole 191 kcal and Large Guacamole 382 kcal.
"Medium/Large X" rows whose portion no size record lists get no photo: one ingredient photo is never spread over a family of sizes the site does
not name (Sour Cream: the guide's 60 g / 120 g pots, the calculator's 85 g / 180 g; Pico de Gallo: 120 / 240 g vs 90 / 150 g; Sweetcorn Salsa:
not in any size record; Chipotle Cheese Sauce: the guide's carbohydrate and fat no longer fit the story's numbers at any portion).

PENDING (not installed; only with --with-pending, for the main session / founder to decide). These are the same dishes as a story on the
site, but the site does not name them exactly, so CLAUDE.md rule 2 ("attached only when that page names the item exactly") keeps them out:
  P1. "Medium/Large X" where X is an ingredient heading and the story's per-100 g numbers, scaled by one portion weight derived from the kcal,
      reproduce the item's protein, carbohydrate and fat to 1 g, but no size record lists that portion: Medium/Large Pico de Gallo (2 rows; the
      photo shows the salsa alone). Sour Cream and Sweetcorn Salsa fit the numbers too but are in DROP_ITEMS after looking at their photos.
  P2. ALIASES below (reviewed by hand, one line each; the numbers are re-checked on every run): the guide's "3/5 Churros & Chocolate Sauce" are
      the calculator's "3/5 Churros & Chocolate" (the Snacks product lists them at 121 g and 179 g, which reproduce our 310 / 523 kcal and the
      protein, carbs and fat exactly), and the guide adds a heat label to three salsas the site names without it ("Salsa Roja (hot)", "Salsa
      Verde (medium)", "Salsa Ranchera (mild)"; the stories' own descriptions say "fiery ... real heat", "our medium salsa verde", "Mild"),
      whose numbers fit as in P1 (8 rows). Every P1/P2 photo was looked at on a contact sheet on 2026-11-17: each shows the dish named (the 3- and
      5-churro photos show 3 and 5 churros with a chocolate pot; the salsas are shown in the counter trays or a pot).
Not matched at all: the breakfast rows (the site's Breakfast Burrito / Bowl / Roll are chorizo builds or a "Breakfast Roll" ingredient whose
numbers fit none of our Bacon / Veggie / Pork & Pico de Gallo buns), Tortilla Chips (bag) / (side portion) (the "Tortilla Chips" story has no
cover; the product photo shows chips with salsa), Queso Fundido (held back, and no cover), Ghost Chilli Ranch, Chipotle Mayo (Ve), Salsa de
Pina, Hibiscus Lemonade and the two hot sauces (no story on these pages). The "Order Ahead" button links https://app.pepperhq.com/<id>, a
JavaScript-only app on a third-party ordering platform (the link answered 404 to a plain request on 2026-11-17); it is not used.

robots.txt (read 2026-11-17): https://www.tortilla.co.uk/robots.txt is "User-Agent: * / Allow: /" (no group names an AI crawler).
https://a.storyblok.com/robots.txt answers HTTP 403 (a CloudFront/S3 "AccessDenied" XML body). Founder's decision of 2026-10-12 (RFC 9309):
a 403 for robots.txt means no rules, so the photo files may be fetched; polite_get still stops on any 401/403/429 for a page or file.

Terms (https://www.tortilla.co.uk/terms-and-conditions, tab "Trademarks & Copyright", read 2026-11-17, unchanged since 2026-10-08): "All content
included on this service is the property of Tortilla Mexican Grill PLC and is protected by UK and European copyright laws. The reproduction,
modification, distribution, transmission, republication, or display of the content on this service is strictly prohibited. If you wish to use
any of our intellectual property, please complete our feedback form." An express prohibition; installed on the founder's decision of 2026-10-06
(his accepted risk).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: both pages and every photo file answered; 3 of 40 published items have a photo (rules A and B: Dessert Quesadilla,
Medium/Large Guacamole), each looked at on a contact sheet. The Dessert Quesadilla photo shows the dish held in the chain's own paper sleeves
(printed "TORTILLA BURRITOS & TACOS": the chain's own wrapper, no offer, price or figure). --with-pending would add 10 more (13).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "tortilla"
INGREDIENTS_PAGE = "https://www.tortilla.co.uk/menu/ingredients"
CALCULATOR_PAGE = "https://www.tortilla.co.uk/menu/nutrition-calculator"
PAGES = [INGREDIENTS_PAGE, CALCULATOR_PAGE]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-tortilla")
SIZES = ("medium", "large")
# items whose photo was looked at (contact sheet, 2026-11-17) and left out, in every tier (a rerun must not bring them back)
DROP_ITEMS: dict[str, str] = {
    "medium-sour-cream": "the Sour Cream story's cover is a close-up of white cream texture (a generic, stock-like picture), not the chain's sour cream",
    "large-sour-cream": "the Sour Cream story's cover is a close-up of white cream texture (a generic, stock-like picture), not the chain's sour cream",
    "medium-sweetcorn-salsa": "the Sweetcorn Salsa story's cover shows three tacos topped with the salsa, not the salsa",
    "large-sweetcorn-salsa": "the Sweetcorn Salsa story's cover shows three tacos topped with the salsa, not the salsa",
}

# PENDING tier P2 (only with --with-pending): item id -> (the site's heading for the same dish, the size word or None). Reviewed by hand.
ALIASES: dict[str, tuple[str, str | None]] = {
    "3-churros-and-chocolate-sauce": ("3 Churros & Chocolate", None),
    "5-churros-and-chocolate-sauce": ("5 Churros & Chocolate", None),
    "medium-salsa-roja-hot": ("Salsa Roja", "medium"),
    "large-salsa-roja-hot": ("Salsa Roja", "large"),
    "medium-salsa-verde-medium": ("Salsa Verde", "medium"),
    "large-salsa-verde-medium": ("Salsa Verde", "large"),
    "medium-salsa-ranchera-mild": ("Salsa Ranchera", "medium"),
    "large-salsa-ranchera-mild": ("Salsa Ranchera", "large"),
}

STORY = re.compile(r'\{"name":"[^"]+","created_at":"[^"]+","published_at":"[^"]*","updated_at":"[^"]+","id":\d+,"uuid":"[^"]+","content":\{')


def stories(html: str) -> list[dict]:
    """Every CMS story object embedded in one page (Next.js flight data, JSON-escaped once)."""
    text = html.replace('\\"', '"').replace("\\\\", "\\").replace("\\u0026", "&")
    dec, out = json.JSONDecoder(), []
    for m in STORY.finditer(text):
        try:
            out.append(dec.raw_decode(text, m.start())[0])
        except ValueError:
            continue
    return out


def fnum(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def ingredients(objs: list[dict]) -> dict[str, dict]:
    """uuid -> {heading, cover, kcal, protein, carbs, fat} for the ingredient stories that carry a cover photo."""
    out = {}
    for o in objs:
        c = o.get("content") or {}
        cover = (c.get("cover") or {}).get("filename") or ""
        if c.get("component") != "ingredient" or not cover or not (c.get("heading") or "").strip():
            continue
        out[o["uuid"]] = {"heading": c["heading"].strip(), "cover": cover, **{k: fnum(c.get(k)) for k in ("kcal", "protein", "carbs", "fat")}}
    return out


def portions(objs: list[dict]) -> list[tuple[str, str, str, float]]:
    """(product title, size name, ingredient uuid, weight g) for every ingredient line of every calculator product size."""
    out = []
    for o in objs:
        c = o.get("content") or {}
        if c.get("component") != "product":
            continue
        for size in c.get("product_sizes") or []:
            for cat in size.get("ingredient_categories") or []:
                for line in cat.get("ingredients") or []:
                    w = fnum(line.get("weight"))
                    if w and line.get("ingredient"):
                        out.append(((c.get("title") or "").strip(), (size.get("size_name") or "").strip(), line["ingredient"], w))
    return out


def reproduces(item: dict, rec: dict, weight: float | None) -> bool:
    """The story's per-100 g numbers at `weight` g (or at the one weight the kcal implies) give the item's printed kcal, protein, carbs, fat."""
    if not rec["kcal"] or any(rec[k] is None for k in ("protein", "carbs", "fat")):
        return False
    try:
        kcal = float(item["calories"])
    except (KeyError, ValueError):
        return False
    scale = kcal / rec["kcal"] if weight is None else weight / 100
    if abs(rec["kcal"] * scale - kcal) > 1.0:
        return False
    for ours, theirs in (("protein_g", "protein"), ("carbs_g", "carbs"), ("fat_g", "fat")):
        if (item.get(ours) or "") == "" or abs(float(item[ours]) - rec[theirs] * scale) > 1.0:
            return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the pages and print the matches; download and write nothing")
    ap.add_argument("--with-pending", action="store_true", help="also attach the PENDING tiers P1 and P2 (see the docstring; not for the installed set)")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    recs: dict[str, dict] = {}                   # uuid -> ingredient story (first page that carries it wins)
    rec_page: dict[str, str] = {}
    sizes: list[tuple[str, str, str, float]] = []
    try:
        for page in PAGES:
            objs = stories(polite_get(page, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            for uid, r in ingredients(objs).items():
                if uid not in recs:
                    recs[uid], rec_page[uid] = r, page
            if page == CALCULATOR_PAGE:
                sizes = portions(objs)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    if not recs or not sizes:
        print("The pages no longer carry the ingredient / product stories this script reads: look at them before running again.")
        return 1
    by_name: dict[str, list[str]] = {}
    for uid, r in recs.items():
        by_name.setdefault(norm_name(r["heading"]), []).append(uid)

    def one(name: str) -> str | None:
        uids = by_name.get(norm_name(name), [])
        return uids[0] if len(uids) == 1 else None   # two stories with one name: ambiguous, no photo

    def attested(item: dict, uid: str, size: str | None) -> bool:
        return any(u == uid and (size is None or norm_name(s) == size) and reproduces(item, recs[uid], w) for _, s, u, w in sizes)

    chosen: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, source page, rule)
    for item in items:
        if item["id"] in DROP_ITEMS:
            continue
        key = norm_name(item["name"])
        uid = one(key)
        if uid:
            chosen[item["id"]] = (recs[uid]["cover"], rec_page[uid], "A")
            continue
        m = re.match(r"(medium|large) (.+)", key)
        uid = one(m.group(2)) if m else None
        if uid and attested(item, uid, m.group(1)):
            chosen[item["id"]] = (recs[uid]["cover"], CALCULATOR_PAGE, "B")
            continue
        if not args.with_pending:
            continue
        if uid and reproduces(item, recs[uid], None):
            chosen[item["id"]] = (recs[uid]["cover"], rec_page[uid], "P1")
            continue
        if item["id"] in ALIASES:
            heading, size = ALIASES[item["id"]]
            uid = one(heading)
            if uid and (attested(item, uid, size) or (size and reproduces(item, recs[uid], None))):
                chosen[item["id"]] = (recs[uid]["cover"], CALCULATOR_PAGE if attested(item, uid, size) else rec_page[uid], "P2")
            else:
                print(f"  {item['id']}: ALIASES entry no longer fits the site's numbers, no photo")
    for item_id, (url, page, rule) in sorted(chosen.items()):
        print(f"  [{rule}] {item_id}: {url}")
    print(f"{len(chosen)} of {len(items)} published items match a story with a photo")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (url, page, _) in sorted(chosen.items()):
            try:
                rows[item_id] = (store_image(CHAIN_ID, polite_get(url, args.cache)), page)
            except ValueError as e:
                print(f"  {item_id}: {e}, no photo")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    write_images_csv(CHAIN_ID, rows)
    shared = suspected_placeholders(rows)
    print(f"wrote {len(rows)} photos; shared by 4+ items: {shared or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
