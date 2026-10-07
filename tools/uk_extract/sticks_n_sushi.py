#!/usr/bin/env python3
"""Build data/source/sticks-n-sushi/ from Sticks'n'Sushi's official UK menu with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/sticks_n_sushi.py path/to/kcal.pdf --checked-on 2026-10-07 [--allergen-pdf path/to/allergen.pdf] [--out DIR]

Source (the file the chain's own allergens page and footer link as "Menu with kcal"):
    https://www.sticksnsushi.com/gb/en/allergies/  ->  footer "Menu with kcal"
    https://a.storyblok.com/f/286316/x/07c5b00b47/sns-menu-uk-kcal-2026-05-210x210-web.pdf
    Printed "KCAL UK 05.2026"; PDF created 2 June 2026 (Adobe InDesign), served Last-Modified 8 June 2026. 19 pages, text layer.
    The link is visible on the page (checked in a browser: not display:none, not hidden). robots.txt of sticksnsushi.com does not
    disallow /gb/en/.
Needs `pdftotext` / `pdfinfo` (poppler). The PDF is read by sticks_n_sushi_pdf.py.

The menu prints CALORIES ONLY beside each dish ("402 kcal"): protein, carbs, fat, salt and the rest are never printed, so they stay
blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). Calories are copied
from the PDF as printed. Only item NAMES, categories, servings and tags are written by hand, in ITEMS below: the script stops if the
dishes printed in the PDF differ from this table (a new, renamed or removed dish, a changed label, another number of calorie values).

How the menu's own wording is read:
- Nigiri and sticks print "74 / 140 kcal" with the price "3 / 2 pcs 5.8": the same one / two split, so the first value is 1 piece and
  the second is 2 pieces. One row per size: "(1 pc)" and "(2 pcs)". Check: Tokyo Non-Stop (286 kcal) is exactly the 1-piece values
  of Shake Yaki 59 + Abokado 87 + Maguro 49 + Hiramasa Yaki 65 + the 10 g of Exmoor Caviar 26, which confirms the reading (the
  script re-checks this sum on every run).
- Rolls: "URAMAKI | 8 pcs of each roll" and "KABURIMAKI | 8 pcs of each roll" head two columns (read by position). The "House Rolls" are
  "4 pcs of each roll". Serving is copied from those headings.
- Edamame Beans print three variants with their own price and calories; Rice prints "RICE | 162 kcal" and, at a higher price,
  three toppings with their own calories ("With crunchy chilli | 348 kcal, teriyaki | 221 kcal or chilli dip | 337 kcal").
- Exmoor Caviar is printed three times (the page with Hiramasa Kama, "Spoil Yourself" on the Temaki page and on the set-menu
  page) with the same 26 kcal and "[10 g]": one row, serving "10 g", weight_g 10 (printed).
- Set menus: only the three that print "kcal per person" (As Good As It Gets, Set For Success, Perfect Day; "[Minimum two people]")
  are listed, serving "per person". Greenkeeper, Mixed Emotions, Salmon & Friends, Robust and Four Meal Drive print a calorie value
  and a price but no basis (per person? per table?), so they are left out (rows without a stated serving or basis). The photo
  captions on the set-menu pages name restaurants (Hellerup | Copenhagen, Kings Road, White City, Potsdamer Strasse): they caption
  the photograph, the menu itself is the UK menu.
- Not listed: the sake, wine, beer and soft drinks (printed without calories), desserts and the kids' and Wakaba menus (not in this PDF).
- "[Limited availability]" under Hiramasa Kama is not a limited-time label, so limited_time stays false.
- Tags: the menu marks nothing vegetarian or vegan, so no vegetarian tags. contains_pork / contains_beef only when the dish's name
  or the menu's own description says so (pork, bacon, ham; beef, wagyu: Wagyu is the beef breed the menu describes as "Japanese
  Wagyu beef"). Nothing else is inferred. Meat type is stated for every meat dish (chicken, duck, lamb, beef, pork).

Held back (holdback.csv; never corrected). The script re-computes both and stops if they stop disagreeing, so a human re-reads:
- Maki Maki (1570 kcal): the menu says it is the four Kaburimaki "Ceviche, Hell's Kitchen, Ebi Panko and Shake Aioli", "8 pcs of
  each roll", and prints those four rolls at 8 pcs as 309 + 503 + 390 + 409 = 1611.
- Kyoto Non-Stop (326 kcal): it is five nigiri (tofu, grilled red pepper, seared aubergine, avocado, portobello); the same five
  printed nigiri add up to 77 + 50 + 72 + 87 + 74 = 360, while Tokyo Non-Stop adds up exactly.
  Mini Maki Maki (792 kcal, "4 pcs of each roll") has no printed per-4-pcs values to check against, so it stays.

Allergens (docs/DATA.md "Allergens") are link-only. The chain's own guide (allergen-uk-02-10-26-2.pdf, an Excel matrix of 14
pages dated 2 October 2026, ticks and "M" for may contain) names its rows the kitchen's way: 30 of the menu's 93 distinct dishes
have no row of the same name (Kinoko Korokke, Hotate Kataifi, Karaage, Hiramasa Ceviche, Rice Paper Shake, Lobster & Ikura Temaki,
Wagyu Bites, Hell's Kitchen, Shishito Yaki, Hotate Bacon, Buta Yaki, Ramu Niku, Aigamo Tsukune, Kinoko and Nasu Aburi nigiri,
the Edamame variants, ...), others are named differently ("Momo Karaage" for Momo Nanban, "Yagi Yaki" for Yaki Yagi, "Soft Shell
Crab", "Lobster Abocado", "Wagyu Caviar Bites"), and the guide is five months newer than the menu. Allergens are safety
information: no name matching, no guessing, so only the guide's link is published (all or nothing).
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
SOURCE_URL = "https://a.storyblok.com/f/286316/x/07c5b00b47/sns-menu-uk-kcal-2026-05-210x210-web.pdf"
SOURCE_TITLE = "Sticks'n'Sushi UK menu with kcal (KCAL UK 05.2026; PDF created 2 June 2026)"
ALIASES = ["sticks'n'sushi", "sticks n sushi", "sticks and sushi", "sticksnsushi", "sticks 'n' sushi"]
ALLERGEN_GUIDE_TITLE = ("Sticks'n'Sushi allergen guide for dine-in and takeaway (allergen-uk-02-10-26-2.pdf, 14 pages; "
                        "PDF created 2 October 2026)")
ALLERGEN_GUIDE_URL = "https://a.storyblok.com/f/286316/x/4b635a8bd5/allergen-uk-02-10-26-2.pdf"
# The guide prints "M = May contain allergens": not intentionally added, but manufacturing, handling, storage, fryer oil or robata
# grill create a cross contamination risk. Traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Sticks'n'Sushi prints calories only, beside each dish, so protein, carbs and fat are not published. Nigiri and sticks "
        "show 1 and 2 pieces. Drinks, desserts, the kids' menu and set menus without a per-person figure are not listed. "
        "Menu dated May 2026.")

ALC, SAS, NIG, HRL, URA, KAB, STK, SET = ("À la carte", "Sashimi", "Nigiri", "House rolls", "Uramaki", "Kaburimaki", "Sticks",
                                          "Set menus")
CATEGORY_ORDER = [ALC, SAS, NIG, HRL, URA, KAB, STK, SET]
PORK = re.compile(r"\b(pork|bacon|ham)\b", re.I)
BEEF = re.compile(r"\b(beef|wagyu)\b", re.I)
ONE_TWO = ("1 pc", "2 pcs")


def E(page, label, name, cat, serving="", sizes=None, note="", id=None, weight="", dup_of=None):
    return dict(page=page, label=label, name=name, cat=cat, serving=serving, sizes=sizes, note=note, id=id, weight=weight,
                dup_of=dup_of)


def nigiri(label, name, note=""):
    return E(8, label, f"{name} Nigiri", NIG, sizes=ONE_TWO, note=note)


def stick(label, name, note=""):
    return E(11, label, name, STK, sizes=ONE_TWO, note=note)


# One entry per printed calorie group, keyed by the page and the label as printed (pdftotext text). `sizes` expands a "1 / 2" pair
# into one row per size. `dup_of` marks the repeats of Exmoor Caviar.
ITEMS = [
    E(3, "Grilled, supreme soy & soya sesame", "Edamame Beans (Grilled, supreme soy & soya sesame)", ALC),
    E(3, "Spicy miso & sesame", "Edamame Beans (Spicy miso & sesame)", ALC),
    E(3, "Sea salt & lemon", "Edamame Beans (Sea salt & lemon)", ALC),
    E(3, "SHAKE TATAKI", "Shake Tataki", ALC),
    E(3, "KINOKO KOROKKE", "Kinoko Korokke", ALC),
    E(3, "TUNA TARTARE BITES", "Tuna Tartare Bites", ALC),
    E(3, "LOBSTER & IKURA TEMAKI", "Lobster & Ikura Temaki", ALC),
    E(3, "BROCCOLI", "Broccoli", ALC),
    E(3, "KARAAGE", "Karaage", ALC),
    E(3, "HOTATE KATAIFI", "Hotate Kataifi", ALC),
    E(4, "HIRAMASA CEVICHE", "Hiramasa Ceviche", ALC),
    E(4, "COME FOR A SWIM", "Come for a Swim", ALC, note="Six small dishes listed under it; price 45; no serving stated"),
    E(5, "GYOZA", "Gyoza", ALC),
    E(5, "KANI KOROKKE", "Kani Korokke", ALC),
    E(5, "HIRAMASA KATAIFI", "Hiramasa Kataifi", ALC),
    E(5, "CAULIFLOWER", "Cauliflower", ALC),
    E(6, "HIRAMASA KAMA", "Hiramasa Kama", ALC, note="Printed '[Limited availability]': not a limited-time label"),
    E(6, "MISO SOUP", "Miso Soup", ALC),
    E(6, "RICE PAPER SHAKE", "Rice Paper Shake", ALC),
    E(6, "EBI BITES", "Ebi Bites", ALC),
    E(6, "SEAWEED SALAD", "Seaweed Salad", ALC),
    E(6, "WAGYU BITES", "Wagyu Bites", ALC),
    E(6, "BEEF TATAKI", "Beef Tataki", ALC),
    E(6, "EXMOOR CAVIAR", "Exmoor Caviar", ALC, serving="10 g", weight="10",
      note="Royal Beluski [10 g]; printed three times (here, 'Spoil Yourself' on the Temaki page and the set-menu page), 26 kcal each time"),
    E(9, "Exmoor Caviar", None, None, dup_of=(6, "EXMOOR CAVIAR")),
    E(13, "SPOIL YOURSELF", None, None, dup_of=(6, "EXMOOR CAVIAR")),
    E(9, "TEMAKI SETTO", "Temaki Setto", ALC, note="Printed on the Maki spread; 'Temaki means handroll. Create your own small bites'; price 38"),
    E(7, "MAGURO", "Maguro Sashimi", SAS),
    E(7, "SHAKE", "Shake Sashimi", SAS),
    E(7, "HIRAMASA", "Hiramasa Sashimi", SAS),
    E(7, "SASHIMI DELUXE", "Sashimi Deluxe", SAS),
    nigiri("INARI IKURA", "Inari Ikura"),
    nigiri("TAMAGO", "Tamago"),
    nigiri("EBI", "Ebi"),
    nigiri("ABOKADO", "Abokado"),
    nigiri("MAGURO", "Maguro"),
    nigiri("SHAKE", "Shake"),
    nigiri("SHAKE YAKI", "Shake Yaki"),
    nigiri("KINOKO", "Kinoko"),
    nigiri("HIRAMASA", "Hiramasa"),
    nigiri("NASU ABURI", "Nasu Aburi"),
    nigiri("AKA PIMAN", "Aka Piman"),
    nigiri("HIRAMASA YAKI", "Hiramasa Yaki"),
    nigiri("SHAKE NEW YORK", "Shake New York"),
    nigiri("INARI", "Inari"),
    E(8, "KYOTO NON-STOP", "Kyoto Non-Stop", NIG, note="Nigiri set (tofu, grilled red pepper, seared aubergine, avocado, portobello); price 12.6"),
    E(8, "TOKYO NON-STOP", "Tokyo Non-Stop", NIG, note="Nigiri set topped with Exmoor Caviar [10 gr]; price 32"),
    E(9, "Wagyu. Wagyu tartare with kizami wasabi & crispy kataifi", "Wagyu House Roll", HRL, serving="4 pcs"),
    E(9, "Aka Ebi. Shrimp, spicy gochujang, avocado, snow peas, miso aïoli & trout roe", "Aka Ebi House Roll", HRL, serving="4 pcs"),
    E(9, "Black Cod. Miso-marinated black cod with artichoke chips & pickled red onion", "Black Cod House Roll", HRL, serving="4 pcs"),
    E(9, "Red’n’Green. Roasted pepper, avocado, cucumber, yuzu-kosho, shiso & tsume", "Red’n’Green House Roll", HRL, serving="4 pcs"),
    E(9, "Soft Shell. Softshell crab with masago & spicy sauce", "Soft Shell House Roll", HRL, serving="4 pcs"),
    E(9, "Lobster Abokado. Lobster, avocado, cucumber, soya sesame, chives & coriander", "Lobster Abokado House Roll", HRL, serving="4 pcs"),
    E(9, "All 6 House Rolls", "Full House", HRL, serving="All 6 House Rolls (4 pcs of each roll)", note="Printed 'FULL HOUSE | Menu'; price 80"),
    E(10, "NANBAN", "Nanban", URA, serving="8 pcs"),
    E(10, "CRISPY EBI", "Crispy Ebi", URA, serving="8 pcs"),
    E(10, "CALIFORNIA", "California", URA, serving="8 pcs"),
    E(10, "MAMMA MIA", "Mamma Mia", URA, serving="8 pcs"),
    E(10, "PINK ALASKA", "Pink Alaska", URA, serving="8 pcs"),
    E(10, "SPICY TUNA", "Spicy Tuna", URA, serving="8 pcs"),
    E(10, "NEW YORK SUBWAY", "New York Subway", KAB, serving="8 pcs"),
    E(10, "EBI PANKO", "Ebi Panko", KAB, serving="8 pcs"),
    E(10, "HELL’S KITCHEN", "Hell’s Kitchen", KAB, serving="8 pcs"),
    E(10, "SHAKE AÏOLI", "Shake Aïoli", KAB, serving="8 pcs", id="shake-aioli"),
    E(10, "CEVICHE", "Ceviche", KAB, serving="8 pcs"),
    E(10, "CHIRASHI MAKI", "Chirashi Maki", KAB, serving="8 pcs"),
    E(10, "MAKI MAKI", "Maki Maki", KAB, serving="8 pcs of each roll",
      note="Printed 'MAKI MAKI | 1570 kcal', 'Kaburimaki. Ceviche, Hell’s Kitchen, Ebi Panko and Shake Aïoli, 8 pcs of each roll 58'"),
    E(10, "MINI MAKI MAKI", "Mini Maki Maki", KAB, serving="4 pcs of each roll", note="Printed '4 pcs of each roll 29'"),
    stick("IMO YAKI", "Imo Yaki"),
    stick("SHISHITO YAKI", "Shishito Yaki"),
    stick("WAGYU YAKI", "Wagyu Yaki"),
    stick("SHAKE TERIYAKI", "Shake Teriyaki"),
    stick("GINDARA NO MISO", "Gindara No Miso", "Printed on two lines, 'GINDARA / NO MISO'"),
    stick("AKA EBI", "Aka Ebi"),
    stick("HOTATE BACON", "Hotate Bacon"),
    stick("YAKI YAGI", "Yaki Yagi"),
    stick("CHIIZU MAKI", "Chiizu Maki"),
    stick("BUTA YAKI", "Buta Yaki"),
    stick("IBERICO SECRETO", "Iberico Secreto"),
    stick("GYU HABU", "Gyu Habu"),
    stick("ERINGI YAKI", "Eringi Yaki"),
    stick("MOMO NANBAN", "Momo Nanban"),
    stick("SHŌYU TEBASAKI", "Shōyu Tebasaki"),
    stick("TSUKUNE", "Tsukune"),
    stick("TSUKUNE CHILI", "Tsukune Chili"),
    stick("RAMU NIKU", "Ramu Niku"),
    stick("AIGAMO TSUKUNE", "Aigamo Tsukune"),
    stick("GYU KATZU", "Gyu Katzu"),
    E(11, "RICE", "Rice", STK, note="Printed 'RICE 2.6 | 162 kcal'"),
    E(11, "With crunchy chilli", "Rice with crunchy chilli", STK, note="Printed under RICE at 3.9"),
    E(11, "teriyaki", "Rice with teriyaki", STK, note="Printed under RICE at 3.9"),
    E(11, "chilli dip", "Rice with chilli dip", STK, note="Printed under RICE at 3.9"),
    E(13, "AS GOOD AS IT GETS", "As Good As It Gets", SET, serving="per person", note="Printed 'Price per person 60 | 1878 kcal per person [Minimum two people]'"),
    E(14, "SET FOR SUCCESS", "Set For Success", SET, serving="per person", note="Printed 'Price per person 50 | 1476 kcal per person [Minimum two people]'"),
    E(15, "PERFECT DAY", "Perfect Day", SET, serving="per person", note="Printed 'Price per person 45 | 1194 kcal per person [Minimum two people]'"),
]
# Printed with calories and a price but no basis (per person? per table?): not listed.
EXCLUDED = {
    (16, "SALMON & FRIENDS"): "974 kcal, price 26, no basis stated",
    (16, "GREENKEEPER"): "1188 kcal, price 30, no basis stated",
    (16, "MIXED EMOTIONS"): "971 kcal, price 30, no basis stated",
    (17, "ROBUST"): "1366 kcal, price 36.8, no basis stated",
    (18, "FOUR MEAL DRIVE"): "3425 kcal, price 130, no basis stated",
}
EXPECTED_COLUMNS = {"NANBAN": "URAMAKI", "CRISPY EBI": "URAMAKI", "CALIFORNIA": "URAMAKI", "MAMMA MIA": "URAMAKI",
                    "PINK ALASKA": "URAMAKI", "SPICY TUNA": "URAMAKI", "NEW YORK SUBWAY": "KABURIMAKI", "EBI PANKO": "KABURIMAKI",
                    "HELL’S KITCHEN": "KABURIMAKI", "SHAKE AÏOLI": "KABURIMAKI", "CEVICHE": "KABURIMAKI", "CHIRASHI MAKI": "KABURIMAKI"}
HOLDBACK = {
    "maki-maki": ("The menu says Maki Maki (1570 kcal) is the four Kaburimaki Ceviche, Hell’s Kitchen, Ebi Panko and Shake Aïoli, 8 pcs "
                  "of each roll; the same page prints those four rolls at 8 pcs as 309 + 503 + 390 + 409 = 1611 kcal"),
    "kyoto-non-stop": ("Kyoto Non-Stop (326 kcal) is five nigiri; the same page prints the five at 1 piece as Inari 77 + Aka Piman 50 + "
                       "Nasu Aburi 72 + Abokado 87 + Kinoko 74 = 360 kcal, while Tokyo Non-Stop adds up exactly (286)"),
}


def asc_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode())


def build_items(records: list[dict], columns: dict[str, str]) -> list[dict]:
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
    for label, col in EXPECTED_COLUMNS.items():
        if columns.get(label) != col:
            raise SystemExit(f"Roll {label!r} is now in column {columns.get(label)!r}, expected {col!r}: update ITEMS' categories")
    items = []
    for e in ITEMS:
        r = found[(e["page"], e["label"])]
        if e["dup_of"]:
            if r["values"] != found[e["dup_of"]]["values"]:
                raise SystemExit(f"{e['label']!r} on page {e['page']} differs from its first printing {e['dup_of']}")
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
    one = lambda n: cal[asc_slug(f"{n} Nigiri (1 pc)")]  # noqa: E731
    house = [cal[asc_slug(n) + "-house-roll"] if asc_slug(n) + "-house-roll" in cal else None for n in
             ("Wagyu", "Aka Ebi", "Black Cod", "Red’n’Green", "Soft Shell", "Lobster Abokado")]
    if None in house or sum(house) != cal["full-house"]:
        raise SystemExit(f"Full House {cal['full-house']} no longer equals the six House Rolls {house}: re-read the menu")
    tokyo = one("Shake Yaki") + one("Abokado") + one("Maguro") + one("Hiramasa Yaki") + cal["exmoor-caviar"]
    if tokyo != cal["tokyo-non-stop"]:
        raise SystemExit(f"Tokyo Non-Stop {cal['tokyo-non-stop']} no longer equals its nigiri + caviar {tokyo}: re-read the menu")
    kyoto = one("Inari") + one("Aka Piman") + one("Nasu Aburi") + one("Abokado") + one("Kinoko")
    if kyoto == cal["kyoto-non-stop"]:
        raise SystemExit("Kyoto Non-Stop now equals its five nigiri: remove it from HOLDBACK after re-reading the menu")
    kab = cal["ceviche"] + cal["hells-kitchen"] + cal["ebi-panko"] + cal["shake-aioli"]
    if kab == cal["maki-maki"]:
        raise SystemExit("Maki Maki now equals its four Kaburimaki: remove it from HOLDBACK after re-reading the menu")
    print(f"cross-checks: Full House {cal['full-house']} = six house rolls {sum(house)}; Tokyo Non-Stop {tokyo} = {cal['tokyo-non-stop']}; "
          f"Kyoto Non-Stop printed {cal['kyoto-non-stop']} vs nigiri {kyoto}; Maki Maki printed {cal['maki-maki']} vs rolls {kab}")


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
    items = build_items(records, pdf_reader.roll_columns(args.pdf))
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
