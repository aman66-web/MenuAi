#!/usr/bin/env python3
"""Item photos for Sticks'n'Sushi UK (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_sticks_n_sushi.py --cache <dir> [--dry-run]

Source: the chain's own UK dine-in menu page, https://www.sticksnsushi.com/gb/en/dine-in-menu/ . The page is rendered by the browser
from the chain's own menu feed, https://www.sticksnsushi.com/api/umbraco/get-menucard/?country=GB&locale=en&dateTime=null&restaurantId=null
(JSON: category tree -> products with Id, Name, SubTitle, Description, Calories, Price, AvailableEatIn, DineInImage ...). The page shows each
dish with its `DineInImage`, a photo served from the chain's own media host https://tataki.sticksnsushi.com/media/... (the page asks for a
cropped 384x480 rendition; we fetch the original file without any crop parameter, and store_image only downsizes it to 640 px and converts
to WebP).

What the page shows (read 2026-11-17 in the page's own script, /_next/static/chunks/app/[country]/[locale]/dine-in-menu/...page-*.js): a
top-level category that has sub-categories is replaced by them, only categories with AvailableEatIn are listed, and inside them only products
with AvailableEatIn ("dinein"===i&&n.AvailableEatIn). The takeaway-only records (category "Menu", "Hosomaki", drinks, dips, and single
records such as the takeaway copy of Tuna Tartare Bites) are not on the dine-in page, so they are not used here.

robots.txt (https://www.sticksnsushi.com/robots.txt, read 2026-11-17): one group `User-agent: *`; Disallow only /dk/de/*, /de/da/*, /gb/da/*,
/gb/de/* (plus their /restaurants/ roots); /gb/en/, /api/ and /_next/ are allowed. tataki.sticksnsushi.com/robots.txt answers 404 (no
rules). polite_get checks robots.txt for every URL (RFC 9309 matcher).

Terms (https://www.sticksnsushi.com/gb/en/terms-and-conditions/, read 2026-11-17): the page holds the webshop terms of service, the
pay-at-table terms and the SNS Loyalty terms; none of them has a clause about copying or reusing the site's content or images (none found).
The only rights notice is the footer line "2022 © Sticks'n'Sushi UK Limited, 11 Hills Place, West End House, W1F 7SE London".

Match rule (exact, nothing fuzzy). The published items (data/source/sticks-n-sushi/items.csv minus holdback.csv) come from the chain's May 2026
"Menu with kcal" PDF; a photo is attached only when a record SHOWN on the dine-in page names the item exactly (norm_name equality):
  * the record's Name alone                         "Gyoza"                       -> item "Gyoza"
  * the record's Name + SubTitle                    "Tsukune" + "2 pcs"           -> item "Tsukune (2 pcs)"
  * Nigiri category: Name + SubTitle                "Maguro" + "2 pcs"            -> item "Maguro Nigiri (2 pcs)"
  * House Rolls category: Name                      "Wagyu"                       -> item "Wagyu House Roll"
  * Sticks / Nigiri record with no SubTitle: the serving is read from the record's own Price, which must equal the PDF's printed "2 pcs"
    price (TWO_PCS_PRICE below, copied from the PDF), and, where the record carries Calories, those must equal the published 2-pcs calories:
    "Gyu Habu", Price 15.6 (PDF "GYU HABU 96 / 192 kcal ... 8 / 2 pcs 15.6")  -> item "Gyu Habu (2 pcs)"
  * explicit aliases (ALIASES_BY_NAME, ALIASES_BY_RECORD): the chain's own record for the same dish under its other printed name, each
    confirmed by the record's own price, calories or description against what the PDF prints (the evidence is written next to each line).
A name on several shown records with different photos, or an item reached by two different photos, gets no photo; NOT_THIS_DISH removes a
record that carries the item's name but is a different dish. Nothing is matched when the record states a different quantity than the item:
the "1 pc" items have no shown record of their own (the only one, Shoyu Tebasaki at 3.5 / 140 kcal, is hidden from the page), so they get no
photo. Dishes of the May 2026 PDF that are no longer in the feed (Kinoko Korokke, Hotate Kataifi, Karaage, Hiramasa Ceviche, Rice Paper Shake,
Lobster & Ikura Temaki, Wagyu Bites, Kinoko and Nasu Aburi nigiri, Tokyo Non-Stop, several sticks, the rice toppings) get no photo; the feed's
Red'n'Green is a Kaburimaki of 308 kcal (8 pcs) while the item is the 4-pcs House Roll of 153 kcal, so it is not used.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "sticks-n-sushi"
PAGE = "https://www.sticksnsushi.com/gb/en/dine-in-menu/"
FEED = "https://www.sticksnsushi.com/api/umbraco/get-menucard/?country=GB&locale=en&dateTime=null&restaurantId=null"
MEDIA = "https://tataki.sticksnsushi.com"

# same product record carries the photo and the item's printed size (record name -> item id)
ALIASES_BY_NAME = {"exmoor caviar 10g tin": "exmoor-caviar"}
# (record Id, record name) -> item id. The record names the same dish in other words; evidence from the record's own fields vs the PDF.
ALIASES_BY_RECORD: dict[tuple[int, str], tuple[str, str]] = {
    (1288, "shake ny"): ("shake-new-york-nigiri-2-pcs",
                         "Nigiri 'Shake NY' 2 pcs, 'Salmon & garlic', 100 kcal, 5.4; PDF 'SHAKE NEW YORK | 54 / 100 kcal Salmon & garlic 2.8 / 2 pcs 5.4'"),
    (7882, "japanese rice"): ("rice", "'Japanese Rice', 'A bowl of Japanese rice', 162 kcal, 2.6; PDF 'RICE 2.6 | 162 kcal'"),
    (1224, "edamame beans"): ("edamame-beans-sea-salt-and-lemon",
                              "'Edamame Beans', description 'Sea salt & lemon', 5; PDF 'EDAMAME BEANS ... Sea salt & lemon 5'"),
    (1250, "spicy edamame beans"): ("edamame-beans-spicy-miso-and-sesame",
                                    "'Spicy Edamame Beans', description 'Spicy miso & sesame', 5; PDF 'EDAMAME BEANS ... Spicy miso & sesame 5'"),
    (1226, "grilled edamame beans"): ("edamame-beans-grilled-supreme-soy-and-soya-sesame",
                                      "'Grilled Edamame Beans', description 'Grilled, supreme soy & soya sesam[e]', 5; PDF 'EDAMAME BEANS ... "
                                      "Grilled, supreme soy & soya sesame 5'"),
    (46050, "chirashi"): ("chirashi-maki",
                          "Kaburimaki 'Chirashi', 'Seared fish, spicy sauce, snow peas, ginger, chilli, tsume & pickled red onion', 10.2; PDF "
                          "'CHIRASHI MAKI ... Seared fish, spicy sauce, snow peas, ginger, chilli & pickled red onion 10.2', and the PDF's own "
                          "Mixed Emotions set lists it as 'Chirashi'"),
}
# A shown record that carries an item's name but is another dish: (record Id, record name) -> reason.
NOT_THIS_DISH: dict[tuple[int, str], str] = {
    (308690, "temaki setto"): "the Shake & Maguro set at 28 (807 kcal); the menu's Temaki Setto is the Wagyu & Lobster set at 38 (record 202219, "
                              "same words as the PDF: 'Wagyu tartare, lobster & yuzu, kataifi, cress, soya sesame, avocado and sake-tamari ...')",
}
# The PDF's printed price for 2 pieces (page 8 nigiri, page 11 sticks), used to read the serving of a record with no SubTitle.
TWO_PCS_PRICE: dict[str, tuple[str, float]] = {
    "aka piman": ("Nigiri", 5.4),          # "AKA PIMAN | 50 / 92 kcal ... 2.8 / 2 pcs 5.4"
    "aka ebi": ("Sticks", 15.6),           # "AKA EBI 70 / 140 kcal ... 8 / 2 pcs 15.6"
    "chiizu maki": ("Sticks", 7.8),        # "CHIIZU MAKI 188 / 376 kcal ... 4 / 2 pcs 7.8"
    "iberico secreto": ("Sticks", 14.6),   # "IBERICO SECRETO 136 / 272 kcal ... 7.5 / 2 pcs 14.6"
    "gyu habu": ("Sticks", 15.6),          # "GYU HABU 96 / 192 kcal ... 8 / 2 pcs 15.6"
    "gyu katzu": ("Sticks", 15.4),         # "GYU KATZU 163 / 326 kcal ... 7.8 / 2 pcs 15.4"
    "shoyu tebasaki": ("Sticks", 6.8),     # "SHŌYU TEBASAKI 140 / 280 kcal ... 3.5 / 2 pcs 6.8"
}
# Looked at on the contact sheet and left out so a rerun can't bring them back (item id -> reason).
EXCLUDE: dict[str, str] = {
    "as-good-as-it-gets": "the chain's photo shows the whole set for two; our item is per person",
    "perfect-day": "the chain's photo shows the whole set for two; our item is per person",
    "set-for-success": "the chain's photo shows the whole set for two; our item is per person",
    # kept 2026-10-08, dropped 2026-11-17: the record ("Exmoor Caviar 10g tin") is now takeaway-only, so it is not on the dine-in page,
    # and the photo shows the supplier's own branded tin lid ("EXMOOR CAVIAR ROYAL BELUSKI" with its crest) beside the caviar
    "exmoor-caviar": "a third-party brand's labelled tin lid is prominent; the record is no longer on the dine-in page",
    # checker 2026-11-17: the set's contents on the page today differ from the May 2026 PDF our item comes from, and the photo shows today's set
    "come-for-a-swim": "photo shows today's set with Ebi Sando (1135 kcal); our item's set has Hotate Kataifi (scallops) instead (804 kcal)",
    "full-house": "photo shows today's six rolls incl. Spicy Beef (beef-wrapped rolls); our item's six include Red'n'Green instead",
    "sashimi-deluxe": "photo shows today's bowl with shake (salmon) ceviche (694 kcal); our item has hiramasa ceviche (500 kcal)",
}


def walk(cats: list[dict]):
    """(category path, product, shown on the dine-in page) for every product, following the page's own filter."""
    for top in cats:
        subs = top.get("SubCategories") or []
        tname = top["Name"].strip()
        if subs:  # the page lists the sub-categories instead of the top-level one
            for p in top.get("Products") or []:
                yield (tname,), p, False
            for c in subs:
                for p in c.get("Products") or []:
                    yield (tname, c["Name"].strip()), p, bool(c.get("AvailableEatIn")) and bool(p.get("AvailableEatIn"))
                for cc in c.get("SubCategories") or []:  # not used by the feed today; never shown by the page's filter
                    for p in cc.get("Products") or []:
                        yield (tname, c["Name"].strip(), cc["Name"].strip()), p, False
        else:
            for p in top.get("Products") or []:
                yield (tname,), p, bool(top.get("AvailableEatIn")) and bool(p.get("AvailableEatIn"))


def keys_for(path: tuple[str, ...], p: dict, items_by_norm: dict[str, dict]) -> set[str]:
    name = (p.get("Name") or "").strip()
    sub = (p.get("SubTitle") or "").strip()
    keys = {ic.norm_name(name)}
    if sub:
        keys.add(ic.norm_name(f"{name} ({sub})"))
    top = path[-1] if path else ""
    if top == "Nigiri" and sub:
        keys.add(ic.norm_name(f"{name} Nigiri ({sub})"))
    if top == "House Rolls":
        keys.add(ic.norm_name(f"{name} House Roll"))
    if not sub and top in ("Sticks", "Nigiri"):
        rule = TWO_PCS_PRICE.get(ic.norm_name(name))
        if rule and rule[0] == top and abs(float(p.get("Price") or 0) - rule[1]) < 0.005:
            key = ic.norm_name(f"{name} Nigiri (2 pcs)" if top == "Nigiri" else f"{name} (2 pcs)")
            it = items_by_norm.get(key)
            kcal = p.get("Calories") or 0
            if it and (not kcal or str(kcal) == (it.get("calories") or "").strip()):
                keys.add(key)
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; store nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_norm = {ic.norm_name(it["name"]): it for it in items}
    by_id = {it["id"]: it for it in items}

    try:
        raw = ic.polite_get(FEED, args.cache, accept="application/json,*/*;q=0.8", referer=PAGE)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}")
        return 2
    tree = json.loads(raw.decode("utf-8"))
    records = list(walk(tree))
    shown = [(path, p) for path, p, s in records if s]
    print(f"{len(records)} product records in the UK menu feed, {len(shown)} shown on the dine-in page")

    photos: dict[str, set[str]] = {}  # item id -> set of photo paths offered by shown records that name it
    printed: dict[str, str] = {}
    for path, p in shown:
        photo = p.get("DineInImage")
        if not photo:
            continue
        name = (p.get("Name") or "").strip()
        rid = (int(p.get("Id") or 0), ic.norm_name(name))
        where = f"{' > '.join(path)} | {name} | {p.get('SubTitle') or ''} | id {rid[0]}"
        targets = set()
        for k in keys_for(path, p, by_norm):
            it = by_norm.get(k)
            if it:
                targets.add(it["id"])
        alias = ALIASES_BY_NAME.get(ic.norm_name(name))
        if alias in by_id:
            targets.add(alias)
        if rid in ALIASES_BY_RECORD and ALIASES_BY_RECORD[rid][0] in by_id:
            targets.add(ALIASES_BY_RECORD[rid][0])
        if rid in NOT_THIS_DISH:
            print(f"  not this dish: {where}: {NOT_THIS_DISH[rid]}")
            continue
        for iid in targets:
            photos.setdefault(iid, set()).add(photo)
            printed.setdefault(iid, where)
    missing_alias = [r for r, (iid, _) in ALIASES_BY_RECORD.items() if iid not in photos]
    if missing_alias:
        print("aliased records not found on the page (no photo for them):", missing_alias)

    matches: dict[str, str] = {}
    ambiguous = []
    for iid, ps in photos.items():
        if len(ps) != 1:
            ambiguous.append(iid)
        elif iid not in EXCLUDE:
            matches[iid] = next(iter(ps))
    print(f"{len(matches)} of {len(items)} published items match")
    if ambiguous:
        print("ambiguous (no photo):", sorted(ambiguous))
    for iid, ph in sorted(matches.items()):
        print(f"  {iid:36s} <- {printed[iid]}  {ph.rsplit('/', 1)[-1]}")
    print("published items with no photo:", sorted(it["id"] for it in items if it["id"] not in matches))
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for iid, ph in sorted(matches.items()):
        if ph not in stored:
            try:
                data = ic.polite_get(MEDIA + urllib.parse.quote(ph, safe="/%"), args.cache, referer=PAGE)
                stored[ph] = ic.store_image(CHAIN, data)
            except ic.Blocked as e:
                print(f"BLOCKED: {e}")
                return 2
            except Exception as e:
                print(f"  skipped {iid}: {e}")
                stored[ph] = ""
        if stored[ph]:
            rows[iid] = (stored[ph], PAGE)
    ic.write_images_csv(CHAIN, rows)
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN).glob("*.webp")) if (ic.IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"stored {len(rows)} item photos ({len(set(f for f, _ in rows.values()))} files, {total/1024:.0f} KB) under web/public/menu-images/{CHAIN}/")
    shared = ic.suspected_placeholders(rows)
    for f, ids in shared.items():
        print(f"  shared by {len(ids)} items: {f}: {sorted(ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
