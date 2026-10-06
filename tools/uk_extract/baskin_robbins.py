#!/usr/bin/env python3
"""Build data/source/baskin-robbins/ from Baskin-Robbins UK's official allergen and nutrition index PDF.

    python3 tools/uk_extract/baskin_robbins.py path/to/IND-PIS-NUTRITION-INDEX-11-2025.pdf --checked-on 2026-10-06

Source: the "Click here to view our allergen information" link on https://baskinrobbins.co.uk/allergens/ ->
https://baskinrobbins.co.uk/wp-content/uploads/2025/06/IND-PIS-NUTRITION-INDEX-11-2025.pdf. It is an Excel export (4 pages,
a text layer). The file is dated 2025 (file name "11-2025", uploaded 2025/06, PDF created 20 June 2025, sheet header
"11/06/2025"; every flavour row has its own date, Jul-08 to Apr-25). It is a staff index: about 126 ice cream rows, then cakes, soft
serve mix, toppings, sauces, cones, sponges and bakery items.

What is published, and why:
* Only the ICE CREAM block (from the "ICE CREAM" heading to the "ICE CREAM CAKES & SOFT SERVE" heading), only the per
  113 g / 4 oz SCOOP columns (second group of ten numbers; the first group is per 100 g and is never used). Cakes, soft serve,
  toppings, sauces, cones, sponges and bakery rows print one unlabelled value set and are left out.
* Only flavours that are also on the chain's own UK flavour list (https://baskinrobbins.co.uk/flavours/, three pages, 31
  flavours, read on 2026-10-06): the index lists many flavours (Cherries Jubilee, Football Fever ...) that the UK site does
  not offer, and the playbook says Great Britain menu only. The mapping is typed below (PDF name -> site name). Six site flavours
  have no row in the PDF, so they cannot be published (no macros). A monthly refresh must re-read the site list and update
  SITE_FLAVOURS / ROWS by hand.
* Numbers are copied as printed: kcal, protein, carbohydrate, sugars, fat, saturates, fibre, salt. kJ is not used. The sheet
  prints sodium in GRAMS; sodium is never converted (sodium_mg stays blank). "n/a" cells stay blank.
* Vegetarian tag = the sheet's own "SUITABLE VEGETARIANS" column. Only names, category, serving and the include/exclude
  choices are typed by hand. If the PDF's row names change, the script stops.
"""
from __future__ import annotations
import argparse
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "baskin-robbins"
SOURCE_URL = "https://baskinrobbins.co.uk/wp-content/uploads/2025/06/IND-PIS-NUTRITION-INDEX-11-2025.pdf"
SOURCE_TITLE = ("Baskin-Robbins UK allergen and nutrition index, per 113 g (4 oz) scoop "
                "(PDF dated 2025: file name 11-2025, created 20 June 2025)")
CATEGORY = "Ice cream scoops"
SERVING = "1 scoop (113 g / 4 oz)"
NOTE = ("Ice cream scoops only (113 g / 4 oz, per scoop): no shakes, sundaes, cakes or toppings. The source is a 2025 PDF "
        "that has no entry for some newer flavours, so a flavour in the shop may be missing here.")

# The chain's own UK flavour list (https://baskinrobbins.co.uk/flavours/ pages 1-3), read 2026-10-06, names as the site prints them.
SITE_FLAVOURS = [
    "Rocher Hazelnut", "Chocolate Cookie Crackle", "Caramel Cookies N’ Cream", "Peanut Butter Chocolate",
    "Graham Chocolate Cracker", "Macadamia Nuts N’ Cream", "Strawberry Tres Leches Cake", "World Class Chocolate",
    "Toasted Coconut Crunch", "Sea Salt Caramel Espresso", "Nutty Salted Caramel", "Mississippi Mud",
    "Mango Tango", "Caramel Honeycomb Candy", "Bubblegum Candyland", "Banana Caramel", "Americas Birthday Cake",
    "Rum Raisin", "Chocolate Chip Cookie Dough", "Chocolate", "Rainbow Sherbet", "Pistachio Almond", "Vanilla",
    "Cotton Candy", "Jamoca Almond Fudge", "Gold Medal Ribbon", "Mint Chocolate Chip", "Pralines ‘N Cream",
    "Very Berry Strawberry", "Cookies ‘N Cream", "Strawberry Cheesecake",
]
# On the site list but with no row in the PDF (so no macros to copy): reported, not published.
SITE_NOT_IN_PDF = ["Rocher Hazelnut", "Chocolate Cookie Crackle", "Peanut Butter Chocolate", "Graham Chocolate Cracker",
                   "Macadamia Nuts N’ Cream", "Strawberry Tres Leches Cake"]

# What the chain's own UK flavour pages showed for the 4 oz scoop on 2026-10-06 (printed name -> kcal as the page prints it).
# Only 9 of the 25 pages could be read: the site then started answering every request with a WordPress "Installation"
# page (its database was down), so I stopped asking. These numbers go into the (unexported) notes column and the holdback
# reasons only; nothing published is taken from them. Rainbow Sherbet's page prints no calories at all.
SITE_KCAL = {
    "VANILLA": "236", "MANGO TANGO": "175", "AMERICA'S BRITHDAY CAKE": "253", "BANANA CARAMEL": "244",
    "MINT CHOCOLATE CHIP": "259", "WORLD CLASS CHOCOLATE": "257",
    "STRAWBERRY CHEESECAKE": "250", "CARAMEL COOKIES 'N CREAM": "280",
}

# Items that are not published (item id -> reason). Never corrected. Two kinds: numbers the sheet prints impossibly (none
# found) and, here, a 5% or larger disagreement with the chain's own current flavour page for the same 4 oz scoop (or a
# product that may not be the same one). Delete a line to publish the item as the sheet prints it.
HOLDBACK: dict[str, str] = {
    "strawberry-cheesecake": ("The chain's own flavour page (read 2026-10-06) prints 250 kcal for the 4 oz scoop; the 2025 index "
                              "sheet prints 288. Held back until the chain's two sources agree."),
    "caramel-cookies-n-cream": ("The chain's own flavour page (read 2026-10-06) prints 280 kcal for 'Caramel Cookies N Cream' "
                                "(a salted caramel and cookies flavour); the 2025 index row (dated Feb-24) prints 266.6 and may be "
                                "an older product with the same name. Held back until the chain's two sources agree."),
}

# Printed oddities, entered as printed (printed name -> note, unexported).
ANOMALIES = {
    "CHOCOLATE CHIP COOKIE DOUGH": "Printed kJ (1198) and kcal (297) differ by about 4%; the macros fit the kJ (about 286 kcal). Entered as printed",
    "CARAMEL COOKIES 'N CREAM": "Salt printed as 1.6 g per scoop (sodium 0.6 g), far above the other flavours. Entered as printed",
    "PISTACHIO ALMOND": "The sheet's date for this row is just 'October' (no year)",
}

# Every row of the PDF's ice cream block in reading order: (printed name, display name, site name, note).
# display name None = not published (not on the UK site's flavour list).
ROWS: list[tuple[str, str | None, str | None, str]] = [
    ("AMERICA'S BRITHDAY CAKE", "America's Birthday Cake", 'Americas Birthday Cake', 'The PDF prints the name as BRITHDAY'),
    ('APPLE CINNAMON PIE', None, None, ""),
    ('BAKLAVA CRUNCH', None, None, ""),
    ('BANANA CARAMEL', 'Banana Caramel', 'Banana Caramel', ''),
    ('BANANA CRÈME', None, None, ""),
    ("BANANA 'N STRAWBERRY", None, None, ""),
    ('BEACH DAY', None, None, ""),
    ('BEACH SUNSET', None, None, ""),
    ('BERRY COOKIES N CREAM FROZEN YOGURT', None, None, ""),
    ('BERRY MASCARPONE CHEESECAKE', None, None, ""),
    ('BERRY MIXED UP', None, None, ""),
    ('BLACK FOREST BROWNIE', None, None, ""),
    ('BLACK FOREST GATEAUX', None, None, ""),
    ('BLACKBERRY CHOCOLATE HAZELNUT TORTE', None, None, ""),
    ('BLUEBERRRY MUFFIN', None, None, ""),
    ('BUBBLEGUM CANDYLAND', 'Bubblegum Candyland', 'Bubblegum Candyland', ''),
    ('BURNT CARAMEL CRUNCH', None, None, ""),
    ('BURSTING WITH STRAWBERRY SWIRL', None, None, ""),
    ('BUTTER CAKE', None, None, ""),
    ('BUTTERCREAM CUPCAKE', None, None, ""),
    ('BUTTERMILK STRAWBERRY SHORTCAKE', None, None, ""),
    ('CARAMEL CAPPUCCINO CHEESECAKE', None, None, ""),
    ('CARAMEL CHOCOLATE CRUNCH', None, None, ""),
    ('CARAMEL FIG CHEESECAKE', None, None, ""),
    ('CARAMEL HONEY CHOC CHIP CHEESECAKE', None, None, ""),
    ('CARAMEL HONEYCOMB CANDY', 'Caramel Honeycomb Candy', 'Caramel Honeycomb Candy', ''),
    ('CARAMEL PRALINE CHEESECAKE', None, None, ""),
    ('CHEESECAKE BROWNIE', None, None, ""),
    ('CHERRIES JUBILEE', None, None, ""),
    ('CHOCOLATE CARAMEL SWEETHEARTS', None, None, ""),
    ('CHOCOLATE', 'Chocolate', 'Chocolate', ''),
    ('CHOCOLATE CHIP', None, None, ""),
    ('CHOCOLATE CHIP COOKIE DOUGH', 'Chocolate Chip Cookie Dough', 'Chocolate Chip Cookie Dough', ''),
    ('CHOCOLATE CRÈME COOKIES N CREAM', None, None, ""),
    ('CHOCOLATE HAZELNUT CHUNK', None, None, ""),
    ('CHOCOLATE MOUSSE ROYALE', None, None, ""),
    ('CHOCOLATE ORANGE SCOOPSENSATION', None, None, ""),
    ('CHOCOLATE STRAWBERRY GANACHE', None, None, ""),
    ('CHOCOLATE TOFFEE CRUNCH', None, None, ""),
    ('CINNAMON LATTE CRUNCH', None, None, ""),
    ('COCONUT', None, None, ""),
    ('COCONUT CHOCOLATE BAR', None, None, ""),
    ('COCONUT TAKES THE CAKE', None, None, ""),
    ('COFFEE COFFEE CHIP', None, None, ""),
    ('COFFEE-POLITAN', None, None, ""),
    ("COOKIES 'N SCREAM", None, None, ""),
    ('COOKIE OVERLOAD', None, None, ""),
    ("CARAMEL COOKIES 'N CREAM", "Caramel Cookies 'N Cream", 'Caramel Cookies N’ Cream', ''),
    ("COOKIES 'N CREAM", "Cookies 'N Cream", 'Cookies ‘N Cream', ''),
    ('COOKIES N CREAM CHEESECAKE', None, None, ""),
    ('COTTON CANDY', 'Cotton Candy', 'Cotton Candy', ''),
    ('CRÈME BRULEÈ', None, None, ""),
    ('DOUBLE DARK MOCHA', None, None, ""),
    ('DULCE DE LECHE', None, None, ""),
    ('ENGLISH TOFFEE', None, None, ""),
    ('FOOTBALL FEVER', None, None, ""),
    ('FUTBOL NUT', None, None, ""),
    ('GHOST PEPPER CHOCOLATE', None, None, ""),
    ('GOLD MEDAL RIBBON', 'Gold Medal Ribbon', 'Gold Medal Ribbon', ''),
    ('GOURMET RASPBERRY RIPPLE', None, None, ""),
    ('HONEY HONEYCOMB', None, None, ""),
    ('HOT HONEY CHOCOLATE', None, None, ""),
    ('INSIDE OUT APPLE PIE', None, None, ""),
    ('JAMOCA', None, None, ""),
    ('JAMOCA ALMOND FUDGE', 'Jamoca Almond Fudge', 'Jamoca Almond Fudge', ''),
    ('LEMON BLUEBERRY TARTE', None, None, ""),
    ('LEMON MASCARPONE', None, None, ""),
    ('LEMON POPPY CAKE', None, None, ""),
    ('LOVE FOR CHOCOLATE', None, None, ""),
    ('LOVE POTION #31', None, None, ""),
    ('MAGIC LAYER BAR', None, None, ""),
    ('MANDARIN ORANGE CHEESECAKE', None, None, ""),
    ('MANGO FIESTA', None, None, ""),
    ('MANGO COCONAPPLE', None, None, ""),
    ('MANGO TANGO', 'Mango Tango', 'Mango Tango', ''),
    ('MAPLE TOFFEE EXPLOSION', None, None, ""),
    ('MAUI BROWNIE MADNESS', None, None, ""),
    ('MIDNIGHT CHOCOLATE', None, None, ""),
    ('MINT CHOCOLATE CHIP', 'Mint Chocolate Chip', 'Mint Chocolate Chip', ''),
    ('MISSISSIPPI MUD', 'Mississippi Mud', 'Mississippi Mud', ''),
    ('MONKEY BUSINESS', None, None, ""),
    ('NUTTY COCONUT', None, None, ""),
    ('NUTTY CREAM CHEESE BROWNIE', None, None, ""),
    ('NUTTY SALTED CARAMEL', 'Nutty Salted Caramel', 'Nutty Salted Caramel', ''),
    ('OLD FASHIONED BUTTER PECAN', None, None, ""),
    ('PEACHES N CREAM', None, None, ""),
    ('PISTACHIO CHOCOLATE HAZELNUT', None, None, ""),
    ('PISTACHIO ALMOND', 'Pistachio Almond', 'Pistachio Almond', ''),
    ('PRALINES LOVE COOKIES', None, None, ""),
    ("PRALINES 'N CREAM", "Pralines 'N Cream", 'Pralines ‘N Cream', ''),
    ('RASPBERRY ALMOND BRITLE', None, None, ""),
    ('RASPBERRY CHOCOLATE CHIP', None, None, ""),
    ('RASPBERRY ROYALE', None, None, ""),
    ('ROCKY ROAD (Vegetarian)', None, None, ""),
    ('RUM RAISIN', 'Rum Raisin', 'Rum Raisin', ''),
    ('SALTED COOKIE DOUGH FUDGE', None, None, ""),
    ('SALTED CHOCOLATE TRUFFLE CRUNCH', None, None, ""),
    ('SALTED HONEY', None, None, ""),
    ('SEA SALT CARAMEL ESPRESSO', 'Sea Salt Caramel Espresso', 'Sea Salt Caramel Espresso', ''),
    ('SERIOUSLY HAZELNUT', None, None, ""),
    ('SMARTY PANTS!', None, None, ""),
    ('SOUR CHERRY CHEESECAKE', None, None, ""),
    ('SPICED BISCUIT COOKIE', None, None, ""),
    ('STRAWBERRY & WHITE CHOCOLATE RIPPLE', None, None, ""),
    ('STRAWBERRY CHEESECAKE', 'Strawberry Cheesecake', 'Strawberry Cheesecake', ''),
    ('STRAWBERRY DRAGON FRUIT', None, None, ""),
    ('STRAWBERRY SORBET N CREAM', None, None, ""),
    ('SUMATRA COFFEE TOFFEE', None, None, ""),
    ('TIRAMISU', None, None, ""),
    ('TOASTED COCONUT CRUNCH', 'Toasted Coconut Crunch', 'Toasted Coconut Crunch', ''),
    ('UBE AND COCONUT SWIRL', None, None, ""),
    ('VANILLA', 'Vanilla', 'Vanilla', ''),
    ('WAFFLE CONE CRUNCH', None, None, ""),
    ('VERY BERRY STRAWBERRY', 'Very Berry Strawberry', 'Very Berry Strawberry', ''),
    ('WORLD CLASS CHOCOLATE', 'World Class Chocolate', 'World Class Chocolate', ''),
    ('NSA BELGIAN BROWNIE RIPPLE SUNDAE', None, None, ""),
    ('NSA BUTTER ALMOND CRUNCH', None, None, ""),
    ('CRIMSON PASSION SORBET', None, None, ""),
    ('LEMON SORBET', None, None, ""),
    ('MANGO SORBET', None, None, ""),
    ("POPPIN' CHERRY LIME", None, None, ""),
    ('BLUE RASPBERRY SHERBET', None, None, ""),
    ('RAINBOW SHERBET', 'Rainbow Sherbet', 'Rainbow Sherbet', 'Listed under LIGHTERSIDE in the sheet'),
    ('STRAWBERRY LEMONADE SORBET', None, None, ""),
    ("WILD 'N RECKLESS SHERBET", None, None, ""),
    ('FROZEN LOW FAT YOGHURT', None, None, ""),
]

# --- reading the PDF (pdftotext -bbox word coordinates; the table is rotated text in a wide Excel grid) -------------
NUM = re.compile(r"^(?:\d+(?:\.\d+)?|n/a)$")
X_NUMBERS_FROM = 495          # numeric columns start here (per 100 g: x 501-625, per scoop: x 640-758)
X_NAME = (36, 160)            # flavour name column (the left-most column holds a staff reference number)
X_DATE_CODE = (160, 217)      # product code and date
X_VEG = (406, 414)            # the "SUITABLE VEGETARIANS" column
SCOOP_COLS = ("kj", "kcal", "protein", "carbs", "sugars", "fat", "sat", "fibre", "sodium_g", "salt")
DATE = re.compile(r"^(?:[A-Z][a-z]{2}-\d\d|October)$")


def read_pages(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(e)) for a, b, c, d, e in re.findall(
            r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk)])
    return pages


def check_headers(page1) -> None:
    """The two number groups must be [per 100g][per 113g/4oz scoop], in that order, each with the ten columns above."""
    kj = sorted((w for w in page1 if w[4] == "Kilojoules" and w[1] < 110), key=lambda w: w[0])
    if len(kj) != 2:
        raise SystemExit("Header changed: expected two 'Kilojoules' columns (per 100g, per scoop).")
    groups = []
    for w in kj:
        near = " ".join(x[4] for x in page1 if abs(x[0] - (w[0] - 5)) < 3 and x[1] < 110)  # the '(Per 100g)' / '(per pack)' words
        groups.append(near)
    if "100g)" not in groups[0] or "pack)" not in groups[1]:
        raise SystemExit(f"Header changed: first number group {groups[0]!r}, second {groups[1]!r}.")
    scoop_head = [w[4] for w in page1 if w[1] < 60 and w[0] > 600]
    if "113g/4oz" not in scoop_head:
        raise SystemExit("Header changed: no 'Nutrition per 113g/4oz scoop' title above the second group.")
    order = [w[4] for w in sorted((w for w in page1 if w[4] in ("Protein", "Carbohydrate", "Fat", "Fibre", "Sodium", "Salt") and w[0] > 630 and w[1] < 70),
                                  key=lambda w: w[0])]
    if order != ["Protein", "Carbohydrate", "Fat", "Fibre", "Sodium", "Salt"]:
        raise SystemExit(f"Header changed: scoop columns now read {order}.")


def read_scoop_rows(pdf: Path) -> list[dict]:
    pages = read_pages(pdf)
    if len(pages) != 4:
        raise SystemExit(f"The PDF has {len(pages)} pages, expected 4: the layout changed.")
    check_headers(pages[0])
    stop = None
    for pn, ws in enumerate(pages, 1):
        for i, w in enumerate(ws):
            if w[4] == "SERVE" and i >= 3 and [x[4] for x in ws[i - 3:i]] == ["CAKES", "&", "SOFT"]:
                stop = (pn, w[1])
    if stop is None:
        raise SystemExit("Could not find the 'ICE CREAM CAKES & SOFT SERVE' heading that ends the ice cream block.")
    rows = []
    for pn, ws in enumerate(pages, 1):
        nums = [w for w in ws if w[0] >= X_NUMBERS_FROM and NUM.match(w[4]) and (pn > 1 or w[1] > 135)]
        clusters: dict[float, list] = {}
        for w in sorted(nums, key=lambda w: w[1]):
            for y in clusters:
                if abs(y - w[1]) < 2.0:
                    clusters[y].append(w)
                    break
            else:
                clusters[w[1]] = [w]
        for y in sorted(clusters):
            if (pn, y) >= stop:
                continue
            vals = [w[4] for w in sorted(clusters[y], key=lambda w: w[0])]
            if len(vals) != 20:
                raise SystemExit(f"Row on page {pn} at y={y:.0f} has {len(vals)} numbers, expected 20.")
            band = [w for w in ws if abs(w[1] - y) < 3]
            name = " ".join(w[4] for w in sorted((w for w in band if X_NAME[0] <= w[0] < X_NAME[1]), key=lambda w: w[0]))
            date = " ".join(w[4] for w in band if X_DATE_CODE[0] <= w[0] < X_DATE_CODE[1] and DATE.match(w[4])) or " ".join(
                w[4] for w in band if w[4] in ("October",))
            if not date:  # a date can sit just right of the product code, still inside the column
                date = " ".join(w[4] for w in band if DATE.match(w[4]) and w[0] < 260)
            veg = [w[4] for w in band if X_VEG[0] <= w[0] < X_VEG[1]]
            if veg == ["√"]:
                vegetarian = True
            elif veg in (["O"], ["0"]):
                vegetarian = False
            else:
                raise SystemExit(f"{name}: unreadable 'suitable for vegetarians' mark {veg!r}.")
            rows.append({
                "printed": name, "date": date, "vegetarian": vegetarian,
                "per100": dict(zip(SCOOP_COLS, vals[:10])), "scoop": dict(zip(SCOOP_COLS, vals[10:])),
            })
    return rows


def blank_na(v: str) -> str:
    return "" if v == "n/a" else v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF and the site's flavour list")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = read_scoop_rows(args.pdf)
    printed = [r["printed"] for r in rows]
    expected = [r[0] for r in ROWS]
    if printed != expected:
        only_pdf = [p for p in printed if p not in expected]
        only_script = [p for p in expected if p not in printed]
        print(f"The PDF's ice cream block has {len(printed)} rows but this script names {len(expected)}.\n"
              f"  in the PDF only: {only_pdf}\n  in this script only: {only_script}\n"
              "Re-check the names (and the UK flavour list at https://baskinrobbins.co.uk/flavours/) before running again.",
              file=sys.stderr)
        return 1
    published_site = [site for _, display, site, _ in ROWS if display]
    if sorted(published_site + SITE_NOT_IN_PDF) != sorted(SITE_FLAVOURS) or len(set(published_site)) != len(published_site):
        print("ROWS and SITE_FLAVOURS disagree: every site flavour must be published here or listed in SITE_NOT_IN_PDF.", file=sys.stderr)
        return 1

    items = []
    for row, (_, display, site, note) in zip(rows, ROWS):
        if display is None:
            continue
        s = row["scoop"]
        notes = [f"Sheet row dated {row['date']}" if row["date"] else "Sheet row has no date"]
        if note:
            notes.append(note)
        if row["printed"] in ANOMALIES:
            notes.append(ANOMALIES[row["printed"]])
        if row["printed"] in SITE_KCAL:
            seen = SITE_KCAL[row["printed"]]
            notes.append(f"Own flavour page showed {seen} kcal (4 oz) on 2026-10-06, sheet prints {s['kcal']}"
                         if float(seen) != float(s["kcal"]) else "Own flavour page showed the same kcal on 2026-10-06")
        elif row["printed"] == "RAINBOW SHERBET":
            notes.append("Own flavour page prints no calories for this flavour")
        items.append({
            "name": display, "category": CATEGORY, "serving": SERVING,
            "calories": s["kcal"], "protein_g": s["protein"], "carbs_g": s["carbs"], "fat_g": s["fat"],
            "sat_fat_g": blank_na(s["sat"]), "sodium_mg": "", "salt_g": blank_na(s["salt"]),
            "sugar_g": blank_na(s["sugars"]), "fiber_g": blank_na(s["fibre"]),
            "tags": "vegetarian" if row["vegetarian"] else "", "limited_time": False, "rankable": False,
            "notes": ". ".join(notes),
        })
    ids = [slug(i["name"]) for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    unknown = [h for h in HOLDBACK if h not in ids]
    if unknown:
        print(f"HOLDBACK names items that no longer exist: {unknown}", file=sys.stderr)
        return 1

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Baskin-Robbins", cuisine="Ice cream", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["baskin robbins", "baskin-robbins", "baskin robbins ice cream"],
        items=items, out=args.out, note=NOTE, holdback=list(HOLDBACK.items()))
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out}; PDF has {len(rows)} ice cream rows "
          f"(sha256 {sha256_file(args.pdf)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
