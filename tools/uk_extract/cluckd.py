#!/usr/bin/env python3
"""Build data/source/cluckd/ from Cluck'd's own menu picture, which prints calories beside each dish (a CALORIES-ONLY chain).

    python3 tools/uk_extract/cluckd.py path/to/Asset-2-1-scaled.png --checked-on 2026-10-09 [--allergen-pdf path/to/allergens.pdf] [--out DIR]

Source: the "DOWNLOAD MENU" file on https://cluckd.co.uk/menu/ ->
    https://cluckd.co.uk/wp-content/uploads/2026/09/Asset-2-1-scaled.png   (PNG 1445 x 2560, no text layer, served
    Last-Modified 9 Sep 2026, SHA-256 in MENU_SHA256 below). There is no text version of the menu anywhere on the site.
robots.txt (cluckd.co.uk) has "Crawl-delay: 10" and "Disallow:" (nothing) for *: every request was made 10 seconds apart.

HOW THE NUMBERS WERE CAPTURED (the picture has no text layer, so this is the one chain where the numbers are typed into ITEMS below
after being READ; this is allowed only because every number was confirmed by a second method):
  1. Read by eye from 2x enlargements of the picture (21 tiles), item by item.
  2. Confirmed with tesseract OCR run over the same picture at several scales and sharpening (a number is accepted only when
     the OCR read of that dish's line gives the same digits) and, where the chain's own menu page carries the same dish in a
     separate, much larger picture (the May 2026 section images on https://cluckd.co.uk/menu/: Top-BUNS, SIDES, Snacks,
     SHAKE-IT-UP, ITS-A-WRAP, DESSERT, CLUCKD-EXCLUSIVE, CLUCKD-JUNIORS, Platters, 1GRILLED-CHICKEN, 2BASTE-FLAVOUR, DIP-IT-2), against
     that picture's OCR too. The Pitta Club and Load It Up sections are only in the September picture (no second picture exists).
  Where the two chain files disagree the dish is held back (holdback.csv): Truffle Fries (568 in the September menu, 565 in the SIDES
  picture of the menu page).
Because the source is a picture, the script cannot re-read it: it STOPS if the picture's SHA-256 is not the one the table was checked
against, so a human re-reads every number (and re-runs the OCR check below) when Cluck'd publishes a new menu. `--ocr-check` re-runs
tesseract over the picture (needs tesseract and Pillow) and lists any dish whose calories it cannot find on that dish's line.

What is and is not listed (docs/DATA.md "Calories-only chains": protein, carbs and fat are never printed, so they stay blank):
- Every dish/side/dip/dessert/shake line that prints "NNNkcal". Calories are copied as printed. No serving is printed, so `serving`
  stays blank (Regular/Premium on the shakes is a price tier, not a size).
- Baste flavours (Straight up ... Screaming) print their own calories, separately from the chicken choices. The menu does not say
  whether a dish's value includes a flavour ("Choose Your Flavour" dishes print one value), so they are listed as their own items
  and the note says so.
- Not listed: Ice Cream (prints three values, "181kcal, 209kcal, 182kcal", under "Vanilla, Chocolate or Strawberry" with no stated
  order and no stated scoop size: matching them would be a guess); all drinks under SIPS (print no calories); the "Make It A Meal" and
  "Go Cheesy / Go Large" upgrades (price only).
- Tags: vegetarian where the picture carries its own V (vegetarian) or VE (vegan) mark; the GF mark is not a tag. Nothing is
  inferred: contains_pork / contains_beef would need the item name or description to say so and none does.

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. Cluck'd's own allergen matrix (PDF "allergens-feb-2026x-1.pdf", created 7 April
2026, 8 months older than the September menu) prints Yes / Maybe / No for 14 allergens, but its rows do not cover the menu: no row for
1/4 Chicken, 1/2 Chicken, the wings, Boneless Strips/Thighs, the two platters, any of the five Pitta Club dishes, Biscoff Cheesecake
(it lists New York Cheesecake), Chocolate Drip Cake, Truffle Fries, Chicken Nuggets, Corn on the Cob, and the Juniors Skin on Fries and
Hash Brown Bites (it lists Plain/Spicy/Cheesy hash browns), so it cannot be read completely for the published items (all or nothing).
Sites: the footer of https://cluckd.co.uk lists three restaurants (Norwich, Milton Keynes, Leicester), all in Great Britain, so the
chain meets the founder's bar of three or more GB sites (10 Oct 2026); a fourth is not listed.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "cluckd"
MENU_URL = "https://cluckd.co.uk/wp-content/uploads/2026/09/Asset-2-1-scaled.png"
MENU_SHA256 = "baa1bde85757b1752468f01cf5611cf56f7c065bb030dc34bb6c8e77ac5e91cc"
SOURCE_TITLE = "Cluck'd menu with calories (picture 'Asset-2-1-scaled.png' on cluckd.co.uk/menu, uploaded September 2026, file dated 9 Sep 2026)"
ALIASES = ["cluckd", "cluck'd", "cluck d", "cluckd uk", "cluck'd grilled chicken"]
ALLERGEN_GUIDE_TITLE = "Cluck'd allergen matrix (PDF created 7 April 2026; 'Maybe' = may contain)"
ALLERGEN_GUIDE_URL = "https://cluckd.co.uk/wp-content/uploads/2026/04/allergens-feb-2026x-1.pdf"
NOTE = ("Calories only, read from the picture of Cluck'd's September 2026 menu (there is no text version). Baste flavours are listed "
        "separately: the menu does not say whether a dish's value includes one. Ice cream (three values, no flavour order) and drinks "
        "print no usable calories. 3 UK restaurants (Norwich, Milton Keynes, Leicester) on cluckd.co.uk, 9 Oct 2026.")

GC, PL, BA, LI, SH, EX, PC, WR, DI, DE, TB, SI, SN, JU = ("Grilled chicken", "Platters", "Baste flavours", "Load it up", "Shake it up",
                                                           "Cluck'd Exclusives", "Pitta Club", "Wraps", "Dip it", "Dessert", "Top Buns",
                                                           "Sides", "Snacks", "Cluck'd Juniors")
V, VE = "V", "VE"  # the picture's own marks (V = vegetarian, VE = vegan); GF (gluten free) is not a tag


def E(cat, name, kcal, marks="", note=""):
    return dict(cat=cat, name=name, kcal=kcal, marks=marks, note=note)


# One entry per dish line that prints "NNNkcal" on the September picture, in the order the picture is read (left column top to bottom,
# middle column, right column). `name` is the dish as printed (curly quotes written straight; Juniors get "(Juniors)" because their
# side dishes share names with the main Sides but print other values).
ITEMS = [
    E(GC, "1/4 Chicken", 327), E(GC, "1/2 Chicken", 654), E(GC, "3 Wings", 251), E(GC, "5 Wings", 418),
    E(GC, "10 Wings", 835, note="Choose your flavour or go Roulette"), E(GC, "Boneless Strips", 255), E(GC, "Boneless Thighs", 411),
    E(PL, "15 Wing Platter", 2129, note="Printed 'With 4 Sides', 27"), E(PL, "Whole Bird Platter", 1306, note="Printed 'With 4 Sides', 29"),
    E(BA, "Straight Up (baste flavour)", 70, note="Printed 'Straight up'"), E(BA, "Lemon Squeeze (baste flavour)", 79, note="Printed 'LEMON sQUEEZE'"),
    E(BA, "Herby Garlic (baste flavour)", 53), E(BA, "Medium Kick (baste flavour)", 64), E(BA, "Tingly (baste flavour)", 77),
    E(BA, "Screaming (baste flavour)", 73),
    E(LI, "Nashville Loaded Fries", 624), E(LI, "Loaded Fries", 727), E(LI, "Crispy Loaded Fries", 824),
    E(SH, "Vanilla Shake", 234, V, "Printed 'Vanilla' under Regular"), E(SH, "Chocolate Shake", 557, V, "Printed 'Chocolate' under Regular"),
    E(SH, "Strawberry Shake", 526, V, "Printed 'Strawberry' under Regular"),
    E(SH, "Kinder Bueno Shake", 870, V, "Printed 'Kinder Bueno' under Premium"), E(SH, "Oreo Shake", 535, V, "Printed 'Oreo' under Premium"),
    E(SH, "Biscoff Shake", 641, V, "Printed 'Biscoff' under Premium"), E(SH, "Cookie Dough Shake", 609, V, "Printed 'Cookie Dough' under Premium"),
    E(EX, "Salt 'N' Pepper Box", 403), E(EX, "Chicken Caesar Salad", 610),
    E(EX, "Rice 'N' Shine Box", 405, note="Marked 'Choose Your Flavour'; one value is printed"),
    E(PC, "Cluck'd Classic", 579), E(PC, "Heatwave", 678), E(PC, "BBQ Boss", 678, note="Marked 'Go Nashville +0.5'"),
    E(PC, "Buttermilk Crunch", 768), E(PC, "Halloumi Heaven", 673, V),
    E(WR, "Classic GC", 328, note="Marked 'Choose Your Flavour'; one value is printed"), E(WR, "BBQ Bliss", 630), E(WR, "Crispy Cluck'd", 500),
    E(WR, "Inferno", 539), E(WR, "Halloumi Wrap", 505, V),
    E(DI, "Korean BBQ", 47, V), E(DI, "Comeback Sauce", 23, V), E(DI, "Garlic Ranch", 152, V), E(DI, "Sweet Chilli", 82, V),
    E(DI, "Cluck'naise", 138, V), E(DI, "Cheese Sauce", 35, V),
    E(DE, "Chocolate Brownie", 401, V), E(DE, "Biscoff Cheesecake", 492, V, "Also marked GF (gluten free) on the picture"),
    E(DE, "Chocolate Drip Cake", 749, V),
    E(TB, "Nashville Burger", 647), E(TB, "Your Favourite", 447, note="Marked 'Choose Your Flavour'; one value is printed"),
    E(TB, "Juicy Stack", 710), E(TB, "Hot Cluck'd", 563), E(TB, "BBQ Hero", 616), E(TB, "Buttermilk Bun", 620), E(TB, "Veggie", 491, V),
    E(SI, "Ciabatta Garlic Bread", 197, V), E(SI, "Skin on Fries", 293, VE, "Marked 'Go Cheesy +0.5' and 'Go Large for +1'; one value is printed"),
    E(SI, "Chilli Rice", 237, V),
    E(SI, "Truffle Fries", 568, V, "September menu prints 568kcal; the menu page's SIDES picture (May 2026) prints 565kcal: held back"),
    E(SI, "Phat Onion Rings", 314, VE), E(SI, "Hash Brown Bites", 276, VE, "Marked 'Go Cheesy +0.5'"), E(SI, "Dreamy Slaw", 320, V),
    E(SI, "Salad", 31, V),
    E(SN, "Nashville Tenders", 517), E(SN, "Halloumi Wedges", 375, V), E(SN, "Cluck'd Tenders", 375), E(SN, "Cluck'd Corn", 267, V),
    E(SN, "Chilli Cheese Bites", 310, V), E(SN, "Mac & Cheese", 240, V),
    E(JU, "Fried Tender Burger (Juniors)", 485, note="Printed under 'Main:'"), E(JU, "Chicken Nuggets (Juniors)", 197, note="Printed under 'Main:'"),
    E(JU, "3 Boneless Strips (Juniors)", 153, note="Printed under 'Main:'"),
    E(JU, "Skin on Fries (Juniors)", 147, note="Printed under 'SIDE:'"),
    E(JU, "Ciabatta Garlic Bread (Juniors)", 197, note="Printed under 'SIDE:'; same value as the Sides item"),
    E(JU, "Corn on the Cob (Juniors)", 134, note="Printed under 'SIDE:'"),
    E(JU, "Hash Brown Bites (Juniors)", 276, note="Printed under 'SIDE:'; same value as the Sides item"),
]
EXPECTED_ITEMS = 75
HOLDBACK = [("truffle-fries", "Cluck'd's own files disagree: the September 2026 menu picture prints 568kcal, the SIDES picture on the menu page "
                              "(uploaded May 2026) prints 565kcal. Not published until the chain's files agree.")]
CATEGORY_ORDER = [GC, PL, BA, LI, SH, EX, PC, WR, DI, DE, TB, SI, SN, JU]


def build_items() -> list[dict]:
    if len(ITEMS) != EXPECTED_ITEMS:
        raise SystemExit(f"ITEMS has {len(ITEMS)} entries, expected {EXPECTED_ITEMS}")
    names = [e["name"] for e in ITEMS]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    items = []
    for e in ITEMS:
        tags = ["vegetarian"] if e["marks"] in (V, VE) else []
        items.append(dict(name=e["name"], category=e["cat"], calories=e["kcal"], tags="|".join(tags), rankable=False,
                          notes="; ".join(x for x in (f"picture mark: {e['marks']}" if e["marks"] else "", e["note"]) if x)))
    return items


def ocr_check(png: Path) -> int:
    """Re-read the picture with tesseract and report each dish whose calories are not found on its own line. Not part of the build."""
    import subprocess
    import tempfile
    from PIL import Image
    im = Image.open(png).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    im = bg.convert("RGB")
    lines: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for k, (a, b) in {"L": (0, 520), "M": (500, 1010), "R": (990, 1445)}.items():
            for sc in (3, 4):
                crop = im.crop((a, 0, b, im.height))
                crop = crop.resize((crop.width * sc, crop.height * sc), Image.LANCZOS)
                path = Path(tmp) / f"{k}{sc}.png"
                crop.save(path)
                for psm in ("6", "11"):
                    out = subprocess.run(["tesseract", str(path), "-", "--psm", psm], capture_output=True, text=True).stdout
                    lines += out.splitlines()
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower().replace("’", "").replace("'", ""))  # noqa: E731
    missing = []
    for e in ITEMS:
        base = e["name"].replace(" (Juniors)", "").replace(" (baste flavour)", "").replace(" Shake", "")
        key = norm(base)
        found = any(key in norm(l) and re.search(r"%d\s?kca" % e["kcal"], l) for l in lines)
        if not found:
            missing.append(f"{e['name']} {e['kcal']}")
    print(f"OCR could not find {len(missing)} of {len(ITEMS)} dishes with their printed calories on their own line (OCR is noisy; check them by eye):")
    print("\n".join("  " + m for m in missing))
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("png", type=Path, help="the menu picture (MENU_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the picture was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--allergen-pdf", type=Path, help="Cluck'd's allergen matrix PDF (only to print its SHA-256)")
    ap.add_argument("--ocr-check", action="store_true", help="re-run tesseract over the picture and list dishes it cannot confirm")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    digest = sha256_file(args.png)
    print(f"menu picture sha256 {digest}  {args.png}")
    if args.allergen_pdf:
        print(f"allergen PDF sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    if digest != MENU_SHA256:
        raise SystemExit("The menu picture is not the one the table was checked against (SHA-256 differs): Cluck'd published a new menu. "
                         "Re-read every number from the new picture, confirm it a second way (OCR, the page's section pictures), update "
                         "ITEMS and MENU_SHA256, then run again.")
    if args.ocr_check:
        ocr_check(args.png)
    items = build_items()
    if len(NOTE) >= 400:
        raise SystemExit("note.txt must stay under 400 characters")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Cluck'd", cuisine="Chicken", source_title=SOURCE_TITLE, source_url=MENU_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=HOLDBACK,
                             allergen_guide=guide, nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))


if __name__ == "__main__":
    main()
