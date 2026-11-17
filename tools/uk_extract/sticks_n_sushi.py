#!/usr/bin/env python3
"""Build data/source/sticks-n-sushi/ from Sticks'n'Sushi's official UK menu with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/sticks_n_sushi.py path/to/kcal.pdf --checked-on 2026-11-17 [--allergen-pdf path/to/allergen.pdf] [--out DIR]

Source (the file the chain's own allergens page links in its footer as "Menu with kcal"):
    https://www.sticksnsushi.com/gb/en/allergies/  ->  footer "Menu with kcal"
    https://a.storyblok.com/f/286316/x/58df629b32/sns-menu-uk-kcal-2026-08-210x210-web.pdf
    Printed "UK KCAL 08.2026"; PDF created 7 October 2026 (Adobe InDesign), served Last-Modified 13 October 2026; 21 pages (pages 2-21
    are spreads of two printed pages), text layer; sha256 09fb86611b1b05f513ac16a1368d4bb99687cf2c12296121b292a4ea44943998 when read on
    2026-11-17. robots.txt of sticksnsushi.com does not disallow /gb/en/; a.storyblok.com answers 403 for robots.txt (no rules, RFC 9309).
    (The May 2026 menu, sns-menu-uk-kcal-2026-05-210x210-web.pdf, was read until 2026-11-17.)
Needs `pdftotext` / `pdfinfo` (poppler). The PDF is read by sticks_n_sushi_pdf.py.

The menu prints CALORIES ONLY beside each dish ("402 kcal"): protein, carbs, fat, salt and the rest are never printed, so they stay
blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). Calories are copied
from the PDF as printed. Only item NAMES, categories, servings and tags are written by hand, in ITEMS below: the script stops if the
dishes printed in the PDF differ from this table (a new, renamed or removed dish, a changed label, another number of calorie values).

How the menu's own wording is read:
- Nigiri and sticks print "83 / 166 kcal" with the price "3.9 / 2 pcs 7.6": the same one / two split, so the first value is 1 piece and
  the second is 2 pieces. One row per size: "(1 pc)" and "(2 pcs)".
- Aburi: the five seared nigiri sit under "ABURI | 2 pcs of each nigiri" and print one figure each with one price, so the serving is
  "2 pcs" (the heading's own words).
- Rolls: "KABURIMAKI | 8 pcs of each" and "URAMAKI | 8 pcs of each" head pages 10 and 11 (read by position: Maki Maki and Mini Maki
  sit on the other half of page 10). The "House Rolls" are "4 pcs of each roll". Serving is copied from those headings.
- Edamame Beans print three variants with their own price and calories; Gohan (rice) prints "GOHAN 2.6 | 276 kcal" and, at a higher
  price, three toppings with their own calories ("With crunchy chilli | 523 kcal, teriyaki | 354 kcal or chilli dip | 493 kcal").
- Temaki Setto prints two sets (Wagyu & Lobster, Shake & Maguro), each with its own price and calories.
- Page 14 ("Chef's recommendations") prints ten dishes a second time; each repeat must equal its first printing or the run stops.
- Set menus: none is listed. As Good As It Gets, Set For Success and Perfect Day print "Price per person" and "[Minimum two people]"
  but no longer say what their calorie figure covers (the May menu printed "kcal per person"); Greenkeeper, Robust, Shake Overdrive,
  Mixed Emotions and Four Meal Drive print a figure and a price with no basis at all. Rows without a stated serving are left out.
- Not listed: the sake and other drinks (printed without calories), desserts and the kids' menu (not in this PDF).
- "[Limited availability]" under Hiramasa Kama is not a limited-time label, so limited_time stays false.
- Tags: the menu marks nothing vegetarian or vegan, so no vegetarian tags. contains_pork / contains_beef only when the dish's name
  or the menu's own description says so (pork, bacon, ham, pancetta; beef, wagyu: Wagyu is the beef breed the menu describes as
  "Japanese Wagyu beef"). Nothing else is inferred.

Held back (holdback.csv; never corrected). The script re-checks each and stops if it stops disagreeing, so a human re-reads:
- Maki Maki (1691 kcal): the menu says it is the four Kaburimaki "Ceviche, Hell's Kitchen, Ebi Panko and Shake Aïoli", "8 pcs of
  each roll", and prints those four rolls at 8 pcs as 358 + 433 + 449 + 439 = 1679.
- Aburi Setto (561 kcal): "10 pcs of seared and topped nigiri", i.e. the five aburi at 2 pcs each, printed as 66 + 115 + 91 + 125 + 105
  = 502.
- Exmoor Caviar: the same "Exmoor Royal Beluski Caviar [10 g]" at the same price (22) is printed with 26 kcal on the sashimi page and
  the set-menu page, and with 243 kcal as "Spoil Yourself" on the temaki page.
  Mini Maki (851 kcal, "4 pcs of each roll") names no rolls and has no printed per-4-pcs values to check against, so it stays.
Cross-checks that hold: Full House (1250) is exactly the six House Rolls; Sticks Setto (909, "2 pcs of each stick" of Wagyu Yaki, Iberico
Secreto, Aka Ebi and Gindara no Miso) is their 2-piece figures 340 + 204 + 164 + 200 = 908 within rounding (the script allows 2 kcal).

Allergens (docs/DATA.md "Allergens") are link-only. The chain's own allergen guide linked from the allergens page is now the "Allergen
Matrix, England" (england_food_allergen_matrix_16_nov.pdf: "Last update 13 November 2026 | Version V.3 | Created 16/11/26", 5 pages);
its "contains" marks are drawn as pictures, not text, and the October guide's rows were named the kitchen's way, not the menu's (30 of
93 menu dishes had no row of the same name). Allergens are safety information: no name matching, no guessing, so only the guide's
link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sticks_n_sushi_pdf as pdf_reader  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "sticks-n-sushi"
SOURCE_URL = "https://a.storyblok.com/f/286316/x/58df629b32/sns-menu-uk-kcal-2026-08-210x210-web.pdf"
SOURCE_TITLE = "Sticks'n'Sushi UK menu with kcal (UK KCAL 08.2026; PDF created 7 October 2026)"
ALIASES = ["sticks'n'sushi", "sticks n sushi", "sticks and sushi", "sticksnsushi", "sticks 'n' sushi"]
ALLERGEN_GUIDE_TITLE = ("Sticks'n'Sushi allergen matrix, England (england_food_allergen_matrix_16_nov.pdf, 5 pages; last update "
                        "13 November 2026, version V.3)")
ALLERGEN_GUIDE_URL = "https://a.storyblok.com/f/286316/x/c402b05f28/england_food_allergen_matrix_16_nov.pdf"
# The guide prints "M = May Contain Allergen": not intentionally added, but manufacturing, handling, storage, fryer oil or robata
# grill create a cross contamination risk. Traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Sticks'n'Sushi prints calories only, beside each dish, so protein, carbs and fat are not published. Nigiri and sticks "
        "show 1 and 2 pieces. Drinks, desserts, the kids' menu and the set menus (the menu doesn't say what their figures cover) are "
        "not listed. Menu dated August 2026.")

ALC, SAS, NIG, HRL, URA, KAB, STK = ("À la carte", "Sashimi", "Nigiri", "House rolls", "Uramaki", "Kaburimaki", "Sticks")
CATEGORY_ORDER = [ALC, SAS, NIG, HRL, URA, KAB, STK]
PORK = re.compile(r"\b(pork|bacon|ham|pancetta)\b", re.I)
BEEF = re.compile(r"\b(beef|wagyu)\b", re.I)
ONE_TWO = ("1 pc", "2 pcs")


def E(page, label, name, cat, serving="", sizes=None, note="", id=None, weight="", dup_of=None, contradicts=None, tags=None):
    """`tags` (a list) replaces the tags read from the name and description, where the text layer runs a dish's description on
    into another dish's words; the reason goes in `note`."""
    return dict(page=page, label=label, name=name, cat=cat, serving=serving, sizes=sizes, note=note, id=id, weight=weight,
                dup_of=dup_of, contradicts=contradicts, tags=tags)


def nigiri(label, name, note=""):
    return E(8, label, f"{name} Nigiri", NIG, sizes=ONE_TWO, note=note)


def aburi(label, name):
    return E(8, label, f"{name} Nigiri", NIG, serving="2 pcs", note="Printed under 'ABURI | 2 pcs of each nigiri'")


def stick(label, name, note=""):
    return E(12, label, name, STK, sizes=ONE_TWO, note=note)


def house(label, name):
    return E(9, label, f"{name} House Roll", HRL, serving="4 pcs")


def roll(page, label, name, cat):
    return E(page, label, name, cat, serving="8 pcs")


# One entry per printed calorie group, keyed by the page and the label as printed (pdftotext text). `sizes` expands a "1 / 2" pair
# into one row per size. `dup_of` marks a repeat that must print the same figures; `contradicts` a printing that must differ.
ITEMS = [
    E(3, "Grilled, supreme soy & soya sesame", "Edamame Beans (Grilled, supreme soy & soya sesame)", ALC),
    E(3, "Spicy miso & sesame", "Edamame Beans (Spicy miso & sesame)", ALC),
    E(3, "Sea salt & lemon", "Edamame Beans (Sea salt & lemon)", ALC),
    E(3, "HIRAMASA KATAIFI", "Hiramasa Kataifi", ALC),
    E(3, "TUNA TARTARE BITES", "Tuna Tartare Bites", ALC),
    E(3, "BROCCOLI", "Broccoli", ALC),
    E(3, "KANI KOROKKE", "Kani Korokke", ALC),
    E(3, "SPICY TORI", "Spicy Tori", ALC),
    E(3, "SHAKE TATAKI", "Shake Tataki", ALC),
    E(4, "COME FOR A SWIM", "Come for a Swim", ALC, tags=[],
      note=("Six small dishes listed under it (Ebi Sando, Kani Korokke, Ebi Bites, Hiramasa Kataifi, Shake Tataki, Tuna Tartare); price 45; "
            "no serving stated. No meat tag: the text layer runs its list on into the Wagyu paragraph that belongs to Wagyu Caviar Bites")),
    E(4, "WAGYU CAVIAR BITES", "Wagyu Caviar Bites", ALC),
    E(5, "CAULIFLOWER", "Cauliflower", ALC),
    E(5, "SHAKE CEVICHE", "Shake Ceviche", ALC),
    E(5, "GYOZA", "Gyoza", ALC),
    E(5, "EBI SANDO", "Ebi Sando", ALC),
    E(6, "WASABI CAESAR SALAD", "Wasabi Caesar Salad", ALC),
    E(6, "BEEF TATAKI", "Beef Tataki", ALC),
    E(6, "MISO SOUP", "Miso Soup", ALC, note="Printed on the same text line as the end of Beef Tataki's description"),
    E(6, "MAGURO CARPACCIO", "Maguro Carpaccio", ALC),
    E(6, "EBI BITES", "Ebi Bites", ALC),
    E(6, "SEAWEED SALAD", "Seaweed Salad", ALC),
    E(9, "sake-tamari marinated trout roe with sushi rice and crispy nori", "Temaki Setto (Wagyu & Lobster)", ALC,
      note="Printed 'TEMAKI SETTO' / 'Wagyu & Lobster. ...' 38 | 681 kcal; 'Temaki means handroll. Create your own small bites'"),
    E(9, "cress, kataifi, soya sesame and sake-tamari marinated trout roe with sushi rice & crispy nori", "Temaki Setto (Shake & Maguro)",
      ALC, note="Printed 'TEMAKI SETTO' / 'Shake & Maguro. ...' 28 | 807 kcal"),
    E(19, "BEAUTIFUL MESS", "Beautiful Mess", ALC, note="Printed on the set-menu pages; one dish (salmon, avocado, sushi rice & poké sauce), price 16"),
    E(7, "MAGURO", "Maguro Sashimi", SAS),
    E(7, "SHAKE", "Shake Sashimi", SAS),
    E(7, "HIRAMASA", "Hiramasa Sashimi", SAS),
    E(7, "SASHIMI DELUXE", "Sashimi Deluxe", SAS),
    E(7, "CAVIAR", "Exmoor Caviar", SAS, serving="10 g", weight="10",
      note="Printed 'CAVIAR | 26 kcal' 'Exmoor Royal Beluski [10 g] 22'; printed again as 'Spoil Yourself' with 26 kcal (set-menu page) and 243 kcal (temaki page)"),
    E(16, "SPOIL YOURSELF", None, None, dup_of=(7, "CAVIAR")),
    E(9, "SPOIL YOURSELF", None, None, contradicts=(7, "CAVIAR")),
    nigiri("INARI IKURA", "Inari Ikura"),
    nigiri("TAMAGO", "Tamago"),
    nigiri("EBI", "Ebi"),
    nigiri("ABOKADO", "Abokado"),
    nigiri("MAGURO", "Maguro"),
    nigiri("SHAKE", "Shake"),
    nigiri("SHAKE YAKI", "Shake Yaki"),
    nigiri("HIRAMASA", "Hiramasa"),
    nigiri("AKA PIMAN", "Aka Piman"),
    nigiri("HIRAMASA YAKI", "Hiramasa Yaki"),
    nigiri("SHAKE NEW YORK", "Shake New York"),
    nigiri("INARI", "Inari", "Printed '76 / 152kcal'"),
    aburi("Wagyu Aburi. Seared Japanese wagyu with miso aïoli, tsume & kizami wasabi", "Wagyu Aburi"),
    aburi("Hiramasa Aburi. Seared yellowtail kingfish with yuzu koshō, shiso, tsume & tosazu gel", "Hiramasa Aburi"),
    aburi("Caviar Abokado Aburi. Seared avocado with Exmoor Royal Beluski caviar", "Caviar Abokado Aburi"),
    aburi("Shake Aburi. Seared salmon with miso aïoli, sake-tamari marinated trout roe & daikon cress", "Shake Aburi"),
    aburi("Maguro Aburi. Seared yellowfin tuna with garlic butter, tsume, Parmesan & truffle dust", "Maguro Aburi"),
    E(8, "ABURI SETTO", "Aburi Setto", NIG, serving="10 pcs", note="Printed 'ABURI SETTO | Menu' '10 pcs of seared and topped nigiri' '40 | 561 kcal'"),
    house("Black Cod. Miso-marinated black cod with Jerusalem artichoke chips & pickled red onion", "Black Cod"),
    house("Aka Ebi. Spicy gochujang shrimp, avocado, snow peas, miso aïoli & sake-tamari marinated trout roe", "Aka Ebi"),
    house("Soft Shell Crab. Soft shell crab, masago, chives, spicy sauce & tsume", "Soft Shell Crab"),
    house("Spicy Beef. Seared beef fillet, cucumber, snow peas, pickled red onion, green chilli, spicy sauce, crunchy chilli & spring onion",
          "Spicy Beef"),
    house("Wagyu. Wagyu tartare with kizami wasabi, tsume & crispy kataifi", "Wagyu"),
    house("Lobster Abokado. Yuzu mayonnaise lobster, avocado, cucumber, soya sesame, chives & coriander", "Lobster Abokado"),
    E(9, "All 6 House Rolls", "Full House", HRL, serving="All 6 House Rolls (4 pcs of each roll)", note="Printed 'FULL HOUSE | Menu'; price 80"),
    roll(11, "NANBAN", "Nanban", URA),
    roll(11, "CRISPY EBI", "Crispy Ebi", URA),
    roll(11, "CALIFORNIA", "California", URA),
    roll(11, "MAMMA MIA", "Mamma Mia", URA),
    roll(11, "PINK ALASKA", "Pink Alaska", URA),
    roll(11, "SPICY TUNA", "Spicy Tuna", URA),
    roll(11, "CHIRASHI MAKI", "Chirashi Maki", URA),
    roll(10, "RED'N'GREEN", "Red'n'Green", KAB),
    roll(10, "NEW YORK SUBWAY", "New York Subway", KAB),
    roll(10, "EBI PANKO", "Ebi Panko", KAB),
    roll(10, "HELL’S KITCHEN", "Hell’s Kitchen", KAB),
    E(10, "SHAKE AÏOLI", "Shake Aïoli", KAB, serving="8 pcs", id="shake-aioli"),
    roll(10, "CEVICHE", "Ceviche", KAB),
    E(10, "MAKI MAKI", "Maki Maki", KAB, serving="8 pcs of each roll",
      note="Printed 'MAKI MAKI | 1691 kcal', 'Ceviche, Hell’s Kitchen, Ebi Panko and Shake Aïoli', '8 pcs of each roll 58'"),
    E(10, "MINI MAKI", "Mini Maki", KAB, serving="4 pcs of each roll", note="Printed '4 pcs of each roll 30'; names no rolls"),
    stick("SHAKE TERIYAKI", "Shake Teriyaki"),
    stick("GINDARA NO MISO", "Gindara No Miso"),
    stick("AKA EBI", "Aka Ebi"),
    stick("SHŌYU TEBASAKI", "Shōyu Tebasaki"),
    stick("TSUKUNE", "Tsukune"),
    stick("MOMO KARAAGE", "Momo Karaage"),
    stick("TSUKUNE CHILLI", "Tsukune Chilli"),
    stick("IMO YAKI", "Imo Yaki"),
    stick("WAGYU YAKI", "Wagyu Yaki"),
    stick("GYU HABU", "Gyu Habu"),
    stick("ERINGI YAKI", "Eringi Yaki"),
    stick("GYU KATZU", "Gyu Katzu"),
    stick("YAGI YAKI", "Yagi Yaki"),
    stick("CHIIZU MAKI", "Chiizu Maki"),
    stick("IBERICO SECRETO", "Iberico Secreto"),
    E(12, "HIRAMASA KAMA", "Hiramasa Kama", STK, note="Printed on the sticks page; '[Limited availability]': not a limited-time label"),
    E(13, "STICKS SETTO", "Sticks Setto", STK, serving="2 pcs of each stick",
      note="Printed 'STICKS SETTO | 2 pcs of each stick': Wagyu Yaki, Iberico Secreto, Aka Ebi, Gindara no Miso; '75 | 909 kcal'"),
    E(12, "GOHAN", "Gohan", STK, note="Printed 'GOHAN 2.6 | 276 kcal'"),
    E(12, "With crunchy chilli", "Gohan with crunchy chilli", STK, note="Printed under GOHAN at 4"),
    E(12, "teriyaki", "Gohan with teriyaki", STK, note="Printed under GOHAN at 4"),
    E(12, "chilli dip", "Gohan with chilli dip", STK, note="Printed under GOHAN at 4"),
    # page 14, "Chef's recommendations": repeats
    E(14, "Tempura shrimp, miso aïoli, chilli, lime & coriander", None, None, dup_of=(6, "EBI BITES")),
    E(14, "Seared beef fillet with miso aïoli, spring onion, Jerusalem artichoke chips, shiitake & truffle ponzu", None, None,
      dup_of=(6, "BEEF TATAKI")),
    E(14, "Salmon, yellowfin tuna, yellowtail kingfish, lobster daikon roll, tamago ikura and shake ceviche", None, None,
      dup_of=(7, "SASHIMI DELUXE")),
    E(14, "marinated trout roe with sushi rice and crispy nori", None, None,
      dup_of=(9, "sake-tamari marinated trout roe with sushi rice and crispy nori")),
    E(14, "soya sesame and sake-tamari marinated trout roe with sushi rice & crispy nori", None, None,
      dup_of=(9, "cress, kataifi, soya sesame and sake-tamari marinated trout roe with sushi rice & crispy nori")),
    E(14, "Black Cod. Miso-marinated black cod with Jerusalem artichoke chips & pickled red onion", None, None,
      dup_of=(9, "Black Cod. Miso-marinated black cod with Jerusalem artichoke chips & pickled red onion")),
    E(14, "Aka Ebi. Spicy gochujang shrimp, avocado, snow peas, miso aïoli & sake-tamari marinated trout roe", None, None,
      dup_of=(9, "Aka Ebi. Spicy gochujang shrimp, avocado, snow peas, miso aïoli & sake-tamari marinated trout roe")),
    E(14, "Soft Shell Crab. Soft shell crab, masago, chives, spicy sauce & tsume", None, None,
      dup_of=(9, "Soft Shell Crab. Soft shell crab, masago, chives, spicy sauce & tsume")),
    E(14, "spring onion", None, None,
      dup_of=(9, "Spicy Beef. Seared beef fillet, cucumber, snow peas, pickled red onion, green chilli, spicy sauce, crunchy chilli & spring onion")),
    E(14, "Wagyu. Wagyu tartare with kizami wasabi, tsume & crispy kataifi", None, None,
      dup_of=(9, "Wagyu. Wagyu tartare with kizami wasabi, tsume & crispy kataifi")),
    E(14, "Lobster Abokado. Yuzu mayonnaise lobster, avocado, cucumber, soya sesame, chives & coriander", None, None,
      dup_of=(9, "Lobster Abokado. Yuzu mayonnaise lobster, avocado, cucumber, soya sesame, chives & coriander")),
    E(14, "FULL HOUSE. All 6 House Rolls", None, None, dup_of=(9, "All 6 House Rolls")),
    E(14, "Miso-marinated black cod 11.5 / 2 pcs 22.6", None, None, dup_of=(12, "GINDARA NO MISO")),
    E(14, "Chicken wings marinated in garlic, ginger & tamari with soya sesame 3.5 / 2 pcs 6.8", None, None,
      dup_of=(12, "SHŌYU TEBASAKI")),
]
# Printed with calories but without a stated basis: not listed.
EXCLUDED = {
    (16, "AS GOOD AS IT GETS"): "1502 kcal; 'Price per person 65 [Minimum two people]' but the figure's basis is not stated",
    (17, "SET FOR SUCCESS"): "1301 kcal; 'Price per person 50 [Minimum two people]' but the figure's basis is not stated",
    (18, "PERFECT DAY"): "1315 kcal; 'Price per person 45 [Minimum two people]' but the figure's basis is not stated",
    (19, "GREENKEEPER"): "952 kcal, price 30, no basis stated",
    (19, "ROBUST"): "1032 kcal, price 37, no basis stated",
    (20, "SHAKE OVERDRIVE"): "917 kcal, price 26, no basis stated",
    (20, "MIXED EMOTIONS"): "1118 kcal, price 32, no basis stated",
    (20, "FOUR MEAL DRIVE"): "3527 kcal, price 130, no basis stated",
}
EXPECTED_SECTIONS = {"NANBAN": "URAMAKI", "CRISPY EBI": "URAMAKI", "CALIFORNIA": "URAMAKI", "MAMMA MIA": "URAMAKI",
                     "PINK ALASKA": "URAMAKI", "SPICY TUNA": "URAMAKI", "CHIRASHI MAKI": "URAMAKI",
                     "RED'N'GREEN": "KABURIMAKI", "NEW YORK SUBWAY": "KABURIMAKI", "EBI PANKO": "KABURIMAKI",
                     "HELL’S KITCHEN": "KABURIMAKI", "SHAKE AÏOLI": "KABURIMAKI", "CEVICHE": "KABURIMAKI"}
HOLDBACK = {
    "maki-maki": ("The menu says Maki Maki (1691 kcal) is the four Kaburimaki Ceviche, Hell’s Kitchen, Ebi Panko and Shake Aïoli, 8 pcs "
                  "of each roll; the same menu prints those four rolls at 8 pcs as 358 + 433 + 449 + 439 = 1679 kcal"),
    "aburi-setto": ("Aburi Setto (561 kcal) is '10 pcs of seared and topped nigiri'; the five aburi, printed under 'ABURI | 2 pcs of each "
                    "nigiri', add up to 66 + 115 + 91 + 125 + 105 = 502 kcal"),
    "exmoor-caviar": ("The menu prints the same 'Exmoor Royal Beluski Caviar [10 g]' at the same price (22) with 26 kcal on the sashimi "
                      "and set-menu pages and with 243 kcal as 'Spoil Yourself' on the temaki page; neither is chosen"),
}


def asc_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode())


def build_items(records: list[dict], sections: dict[str, str]) -> list[dict]:
    found: dict[tuple, dict] = {}
    for r in records:
        k = (r["page"], r["label"])
        if k in found:
            raise SystemExit(f"{k} is printed twice on the same page: check the layout")
        found[k] = r
    table = {(e["page"], e["label"]): e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (page, label)")
    new = sorted(set(found) - set(table) - set(EXCLUDED))
    gone = sorted((set(table) | set(EXCLUDED)) - set(found))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menu.")
    if sections != EXPECTED_SECTIONS:
        raise SystemExit(f"The rolls' headings changed: read {sections}, expected {EXPECTED_SECTIONS}: update ITEMS' categories")
    items = []
    for e in ITEMS:
        r = found[(e["page"], e["label"])]
        if e["dup_of"]:
            if r["values"] != found[e["dup_of"]]["values"]:
                raise SystemExit(f"{e['label']!r} on page {e['page']} differs from its first printing {e['dup_of']}")
            continue
        if e["contradicts"]:
            if r["values"] == found[e["contradicts"]]["values"]:
                raise SystemExit(f"{e['label']!r} on page {e['page']} now equals {e['contradicts']}: re-read the menu and update HOLDBACK")
            continue
        sizes = e["sizes"]
        if sizes:
            if len(r["values"]) != 2:
                raise SystemExit(f"{e['name']}: expected two calorie values (1 pc / 2 pcs), found {r['values']}")
            a, b = int(r["values"][0]), int(r["values"][1])
            if not (a < b < 2.2 * a):
                raise SystemExit(f"{e['name']}: 1 pc {a} / 2 pcs {b} do not look like one and two pieces: re-read the menu")
        elif len(r["values"]) != 1:
            raise SystemExit(f"{e['name']}: {len(r['values'])} calorie values found, expected 1")
        text = e["name"] + " " + r["text"] + " " + r["label"]
        tags = []
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        if e["tags"] is not None:
            tags = list(e["tags"])
        printed = f"Printed '{r['label']} | {' / '.join(r['values'])} kcal' on page {r['page']}"
        for i, value in enumerate(r["values"]):
            name = f"{e['name']} ({sizes[i]})" if sizes else e["name"]
            it = dict(name=name, category=e["cat"], calories=value, serving=sizes[i] if sizes else e["serving"], tags="|".join(tags),
                      rankable=False, weight_g=e["weight"], notes="; ".join(x for x in (printed, e["note"]) if x))
            it["id"] = (e["id"] + (f"-{sizes[i].replace(' ', '-')}" if sizes else "")) if e["id"] else asc_slug(name)
            items.append(it)
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique")
    return items


def cross_checks(items: list[dict]) -> None:
    """The figures the menu prints that are sums of other printed figures. Stops when a published row would be contradicted or a
    held-back row no longer is."""
    cal = {i["id"]: int(i["calories"]) for i in items}
    two = lambda n: cal[asc_slug(f"{n} (2 pcs)")]  # noqa: E731
    house = [cal.get(asc_slug(n) + "-house-roll") for n in ("Black Cod", "Aka Ebi", "Soft Shell Crab", "Spicy Beef", "Wagyu", "Lobster Abokado")]
    if None in house or sum(house) != cal["full-house"]:
        raise SystemExit(f"Full House {cal['full-house']} no longer equals the six House Rolls {house}: re-read the menu")
    sticks = two("Wagyu Yaki") + two("Iberico Secreto") + two("Aka Ebi") + two("Gindara No Miso")
    if abs(sticks - cal["sticks-setto"]) > 2:
        raise SystemExit(f"Sticks Setto {cal['sticks-setto']} is no longer its four sticks at 2 pcs {sticks}: re-read the menu")
    aburi = sum(cal[asc_slug(f"{n} Aburi Nigiri")] for n in ("Wagyu", "Hiramasa", "Caviar Abokado", "Shake", "Maguro"))
    if aburi == cal["aburi-setto"]:
        raise SystemExit("Aburi Setto now equals its five aburi: remove it from HOLDBACK after re-reading the menu")
    kab = cal["ceviche"] + cal["hells-kitchen"] + cal["ebi-panko"] + cal["shake-aioli"]
    if kab == cal["maki-maki"]:
        raise SystemExit("Maki Maki now equals its four Kaburimaki: remove it from HOLDBACK after re-reading the menu")
    print(f"cross-checks: Full House {cal['full-house']} = six house rolls {sum(house)}; Sticks Setto printed {cal['sticks-setto']} vs "
          f"sticks {sticks}; Aburi Setto printed {cal['aburi-setto']} vs aburi {aburi}; Maki Maki printed {cal['maki-maki']} vs rolls {kab}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--allergen-pdf", type=Path, help="the allergen guide PDF (only to print its SHA-256)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    if args.allergen_pdf:
        print(f"allergen PDF sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    records = pdf_reader.read_records(args.pdf)
    items = build_items(records, pdf_reader.roll_sections(args.pdf))
    cross_checks(items)
    ids = {i["id"] for i in items}
    if set(HOLDBACK) - ids:
        raise SystemExit(f"HOLDBACK names ids that are not items: {sorted(set(HOLDBACK) - ids)}")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Sticks'n'Sushi", cuisine="Japanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories", holdback=list(HOLDBACK.items()))
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("printed with calories but not listed (no basis stated): " + ", ".join(sorted(f"{p}:{n}" for p, n in EXCLUDED)))


if __name__ == "__main__":
    main()
