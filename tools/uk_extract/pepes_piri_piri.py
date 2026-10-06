#!/usr/bin/env python3
"""Build data/source/pepes-piri-piri/ from Pepe's Piri Piri's official UK "Nutrition & Allergens" web page.

    python3 tools/uk_extract/pepes_piri_piri.py path/to/nutrition-allergens-uk.html --checked-on 2026-10-06

Source: https://pepes.co.uk/nutrition-allergens-uk/ (the UK page; the Ireland page /nutrition-allergens-ireland is NOT
used). The nutrition is in the page's own HTML: one card per item with Kcal, Fat, Saturated Fat, Carbohydrates, Sugars,
Protein, Salt (g) and an "Add Flavour (ml)" amount. The page prints no date, so source_title carries the access date.

Numbers are copied from the cards exactly as printed. Only the NAMES, categories, serving words and tags below are
typed by hand, one entry per card in the page's own order (it lists items alphabetically). If Pepe's adds, removes,
renames or re-categorises a card, or changes the columns, this script stops so a human re-checks ROWS.
"""
from __future__ import annotations
import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pepes-piri-piri"
SOURCE_URL = "https://pepes.co.uk/nutrition-allergens-uk/"
LABELS = ["Kcal", "Fat (g)", "Saturated Fat (g)", "Carbohydrates (g)", "Sugars (g)", "Protein (g)", "Salt (g)", "Add Flavour (ml)"]
NUMBER = re.compile(r"^\d+(\.\d+)?$")

# The page's own category slugs (data-category) and the display name we give each.
GC, FC, VT, KM, PL, ES, DP, DS, BJ, DR, SF = (
    "pepes-grilled-collection", "pepes-fried-collection", "pepes-veggie-table", "pepes-kids-meals", "grilled-platters",
    "extras-sides", "pepes-dips", "pepes-desserts", "ben-jerrys-ice-cream", "drinks", "pepes-sauce-flavours")
CATEGORY_NAME = {
    GC: "Grilled collection", FC: "Fried collection", VT: "Veggie table", KM: "Kids meals", PL: "Grilled platters",
    ES: "Extras & sides", DP: "Dips", DS: "Desserts", BJ: "Ben & Jerry's ice cream", DR: "Drinks", SF: "Sauce flavours (per 10 ml)"}
CATEGORY_ORDER = [GC, FC, VT, KM, PL, ES, DP, DS, BJ, DR, SF]

# Why a card is left out (rule 4 of the playbook and rule 3: never fill a gap).
NOT_ALL = "marked * on the page: item not available in all stores"
KCAL_ONLY = "only calories are printed (no fat, carbs or protein), so it can't be published"
NO_BASIS = "packaged third-party drink: the page states no size or serving for it"
RETAIL = "retail product: the page doesn't say whether the values are per bottle or per 100 ml/g"

VEG = "Tagged vegetarian because Pepe's files it under 'Pepe's Veggie Table'; its notice says vegetarian items are cooked alongside chicken and meat"
MEAT = "meat type not stated"


def I(title, cat, name=None, *, serving="", rankable=True, tags="", note="", id=""):
    """An item we publish. `title` is the page's heading (normalised, see norm())."""
    return title, cat, {"name": name or title, "serving": serving, "rankable": rankable, "tags": tags, "note": note, "id": id}


def X(title, cat, why):
    """A card we deliberately leave out."""
    return title, cat, why


# One entry per real card, in the page's order. Titles are written in the normalised form (straight quotes, " - ", single spaces).
ROWS = [
    I("1/2 Chicken", GC),
    I("1/4 Chicken", GC),
    I("7 Up Free 1.5L", DR, "7 Up Free (1.5L)", serving="1.5L", rankable=False),
    I("7UP - Fountain LRG", DR, "7UP fountain (large)", serving="Large", rankable=False),
    I("7UP - Fountain Reg", DR, "7UP fountain (regular)", serving="Regular", rankable=False),
    X("Barr Cola", DR, NO_BASIS),
    I("BBQ Quesadilla", GC, note=MEAT),
    I("BBQ Wrap", GC, note=MEAT),
    X("Bottled Water", DR, NO_BASIS),
    I("Cheese Slice", ES, rankable=False),
    I("Chick n Rice", GC),
    I("Chicken Box", GC),
    I("Chicken Burger", FC),
    I("Chicken Burger - Double", FC, "Chicken Burger – Double"),
    I("Chicken Burrito", GC),
    I("Chicken Fajita Wrap", GC),
    I("Chicken Nachos", GC),
    I("Chicken Nuggets - 5", FC, "Chicken Nuggets – 5"),
    I("Chicken Nuggets - 8", FC, "Chicken Nuggets – 8"),
    I("Chicken Quesadilla", GC),
    I("Chicken Salad", GC),
    I("Chicken Tasca", GC),
    I("Chicken XL", GC),
    I("Chilli Cheese Nuggets", ES),
    I("Chimichurri Fries - Large", ES, "Chimichurri Fries – Large", serving="Large"),
    I("Chimichurri Fries - Regular", ES, "Chimichurri Fries – Regular", serving="Regular"),
    I("Chimmichurri Wedges", ES, "Chimichurri Wedges", note="The page spells the name 'Chimmichurri Wedges'"),
    I("Chocolate Fudge Brownie (100ml)", BJ, "Chocolate Fudge Brownie (100 ml)", serving="100 ml", rankable=False,
      note="Ben & Jerry's; size is printed in the name"),
    I("Chocolate Fudge Brownie (465ml)", BJ, "Chocolate Fudge Brownie (465 ml)", serving="465 ml", rankable=False,
      note="Ben & Jerry's; size is printed in the name"),
    I("Combo (Serves 2-3)", PL, "Combo Platter (serves 2-3)", id="platter-combo-serves-2-3", rankable=False, note=MEAT + "; serves more than one, so never suggested as one person's order"),
    I("Cookie Dough (100ml)", BJ, "Cookie Dough (100 ml)", serving="100 ml", rankable=False, note="Ben & Jerry's; size is printed in the name"),
    I("Cookie Dough (465ml)", BJ, "Cookie Dough (465 ml)", serving="465 ml", rankable=False, note="Ben & Jerry's; size is printed in the name"),
    I("Corn on the Cob", ES, note="Protein 15.4 g is printed; high for corn but the energy adds up; entered as printed"),
    X("Extra Chicken (BBQ Quesadilla)", GC, KCAL_ONLY),
    X("Extra Chicken (BBQ Wrap)", GC, KCAL_ONLY),
    X("Extra Chicken (Chicken & Cheese Quesadilla)", GC, KCAL_ONLY),
    X("Extra Chicken (Fajita)", GC, KCAL_ONLY),
    X("Extra Chicken (Wrap)", GC, KCAL_ONLY),
    X("Extra Chicken (Burrito)", GC, KCAL_ONLY),
    X("Extra Chicken (Chick n rice)", GC, KCAL_ONLY),
    X("Extra Chicken (Chicken Salad)", GC, KCAL_ONLY),
    X("Extra Chicken (Hot & Spicy Quesadilla)", GC, KCAL_ONLY),
    X("Extra Chicken (Loaded Fries - chicken)", GC, KCAL_ONLY),
    X("Extra Chicken (Nachos)", GC, KCAL_ONLY),
    X("Extra Chicken (Tasca)", GC, KCAL_ONLY),
    X("Extra Feta", VT, KCAL_ONLY),
    X("Extra Fillet (Chicken XL)", GC, KCAL_ONLY),
    X("Extra Fillet (Prime Pitta)", GC, KCAL_ONLY),
    I("Extra Hot (10ml)", SF, "Extra Hot flavour (10 ml)", serving="10 ml", rankable=False,
      note="Per 10 ml of flavour sauce; items list how much flavour is added in their 'Add Flavour' column"),
    X("Extra Paneer (Burrito)", VT, KCAL_ONLY),
    X("Extra Paneer (Loaded Fries)", VT, KCAL_ONLY),
    X("Extra Paneer (Nachos)", VT, KCAL_ONLY),
    X("Extra Paneer (Rice)", VT, KCAL_ONLY),
    X("Extra Paneer (Salad)", VT, KCAL_ONLY),
    X("Extra Paneer (Wrap)", VT, KCAL_ONLY),
    I("Extreme (10ml)", SF, "Extreme flavour (10 ml)", serving="10 ml", rankable=False,
      note="Per 10 ml of flavour sauce; items list how much flavour is added in their 'Add Flavour' column"),
    I("Family (Serves 3-4)", PL, "Family Platter (serves 3-4)", rankable=False, note=MEAT + "; serves more than one, so never suggested as one person's order"),
    I("Feta Salad", VT, tags="vegetarian", note=VEG),
    I("Fries - Large", ES, "Fries – Large", serving="Large"),
    I("Fries - Regular", ES, "Fries – Regular", serving="Regular"),
    X("Fruit Shoot - Apple & Blackcurrant", DR, NO_BASIS),
    X("Fruit Shoot - Orange", DR, NO_BASIS),
    I("Gourmet Beef Burger - Double", GC, "Gourmet Beef Burger – Double", tags="contains_beef"),
    I("Gourmet Beef Burger - Single", GC, "Gourmet Beef Burger – Single", tags="contains_beef"),
    I("Gourmet Lamb Burger - Double", GC, "Gourmet Lamb Burger – Double"),
    I("Gourmet Lamb Burger - Single", GC, "Gourmet Lamb Burger – Single"),
    I("Hot (10ml)", SF, "Hot flavour (10 ml)", serving="10 ml", rankable=False,
      note="Per 10 ml of flavour sauce; items list how much flavour is added in their 'Add Flavour' column"),
    I("Hot & Spicy Quesadilla", GC, note=MEAT),
    X("IRN BRU - Fountain LRG*", DR, NOT_ALL),
    X("IRN BRU - Fountain Reg*", DR, NOT_ALL),
    X("J2O - Apple & Mango", DR, NO_BASIS),
    X("J2O - Orange & Passionfruit", DR, NO_BASIS),
    I("Kids Meal - Chicken Burger", KM, "Kids Meal – Chicken Burger"),
    I("Kids Meal - Nuggets", KM, "Kids Meal – Nuggets"),
    I("Kids Meal - Strips", KM, "Kids Meal – Strips", note=MEAT),
    I("Korean Beef Burger - Double", GC, "Korean Beef Burger – Double", tags="contains_beef"),
    I("Korean Beef Burger - Single", GC, "Korean Beef Burger – Single", tags="contains_beef"),
    I("Korean Lamb Burger - Double", GC, "Korean Lamb Burger – Double"),
    I("Korean Lamb Burger - Single", GC, "Korean Lamb Burger – Single"),
    I("Lemon & Herb (10ml)", SF, "Lemon & Herb flavour (10 ml)", serving="10 ml", rankable=False,
      note="Per 10 ml of flavour sauce; items list how much flavour is added in their 'Add Flavour' column"),
    I("Loaded Fries Chicken", GC),
    I("Loaded Fries Plain", ES),
    I("Mango & Lime (10ml)", SF, "Mango & Lime flavour (10 ml)", serving="10 ml", rankable=False,
      note="Per 10 ml of flavour sauce; items list how much flavour is added in their 'Add Flavour' column"),
    I("Mega (Serves 5-6)", PL, "Mega Platter (serves 5-6)", rankable=False, note=MEAT + "; serves more than one, so never suggested as one person's order"),
    I("Mild (10ml)", SF, "Mild flavour (10 ml)", serving="10 ml", rankable=False,
      note="Per 10 ml of flavour sauce; items list how much flavour is added in their 'Add Flavour' column"),
    I("Mozarella Sticks", ES, "Mozzarella Sticks", note="The page spells the name 'Mozarella Sticks'"),
    I("Onion Rings", ES, note="HELD BACK: carbs 393.0 g with 305 kcal is impossible (Piri Piri Onion Rings prints 43.0 g); nothing corrected"),
    I("Paneer Burrito", VT, tags="vegetarian", note=VEG),
    I("Paneer Loaded Fries", VT, tags="vegetarian", note=VEG),
    I("Paneer Nachos", VT, tags="vegetarian", note=VEG),
    I("Paneer Rice", VT, tags="vegetarian", note=VEG),
    I("Paneer Salad", VT, tags="vegetarian", note=VEG),
    I("Paneer Wrap", VT, tags="vegetarian", note=VEG),
    I("Pepe's Carrot Cake", DS, rankable=False),
    I("Pepe's Chimichurri Mayo", DP, rankable=False),
    I("Pepe's Chocolate Fudge Cake", DS, rankable=False),
    I("Pepe's Churros", DS, rankable=False, note="Salt is printed as '1' without a decimal; entered as printed"),
    I("Pepe's Dark Chocolate Sauce", DP, rankable=False),
    I("Pepe's Extra Hot Sauce", DP, rankable=False),
    I("Pepe's Garlic Mayo", DP, rankable=False),
    I("Pepe's Original", GC, note=MEAT + "; same numbers as Whole Chicken (the page lists both names)"),
    I("Pepe's Piri Piri Mayo", DP, rankable=False),
    I("Pepe's Strawberry Cheesecake", DS, rankable=False, note="Sugars printed as '9' without a decimal; entered as printed"),
    I("Pepe's Sweet Chilli Sauce", DP, rankable=False),
    I("Pepe's Wings - 3", ES, "Pepe's Wings – 3", note=MEAT),
    I("Pepe's Wings - 5", GC, "Pepe's Wings – 5", note=MEAT),
    I("Pepsi - Fountain LRG", DR, "Pepsi fountain (large)", serving="Large", rankable=False),
    I("Pepsi - Fountain Reg", DR, "Pepsi fountain (regular)", serving="Regular", rankable=False),
    I("Pepsi 1.5L", DR, "Pepsi (1.5L)", serving="1.5L", rankable=False),
    I("Pepsi Max - Fountain LRG", DR, "Pepsi Max fountain (large)", serving="Large", rankable=False),
    I("Pepsi Max - Fountain Reg", DR, "Pepsi Max fountain (regular)", serving="Regular", rankable=False),
    I("Pepsi Max 1.5L", DR, "Pepsi Max (1.5L)", serving="1.5L", rankable=False),
    I("Piri Piri Corn on the Cob", ES, note="Protein 15.8 g is printed; high for corn but the energy adds up; entered as printed"),
    I("Piri Piri Fries - Large", ES, "Piri Piri Fries – Large", serving="Large"),
    I("Piri Piri Fries - Regular", ES, "Piri Piri Fries – Regular", serving="Regular"),
    I("Piri Piri Onion Rings", ES),
    I("Piri Piri Pitta Bread", ES),
    X("Piri Piri Salt Bottle 135g", ES, RETAIL),
    X("Piri Piri Sauce - Extra Hot 250 ml", ES, RETAIL),
    X("Piri Piri Sauce - Extreme 250 ml", ES, RETAIL),
    X("Piri Piri Sauce - Hot 250 ml", ES, RETAIL),
    X("Piri Piri Sauce - Lemon & Herb 250 ml", ES, RETAIL),
    X("Piri Piri Sauce - Mango & Lime 250 ml", ES, RETAIL),
    X("Piri Piri Sauce - Mild 250 ml", ES, RETAIL),
    I("Piri Piri Wedges", ES),
    I("Pitta Bread", ES),
    I("Prime Pitta", GC, note=MEAT),
    X("Red Bull Sugar Free", DR, NO_BASIS),
    X("Redbull", DR, NO_BASIS),
    X("Rubicon Mango Sparkling", DR, NO_BASIS),
    I("Side Salad", ES),
    I("Solo (Serves 1)", PL, "Solo Platter (serves 1)", note=MEAT),
    I("Spicy Rice", ES),
    I("Steamed Mixed Veg", ES),
    I("Tango - Fountain LRG", DR, "Tango fountain (large)", serving="Large", rankable=False, note="The page prints just 'Tango'"),
    I("Tango - Fountain Reg", DR, "Tango fountain (regular)", serving="Regular", rankable=False, note="The page prints just 'Tango'"),
    I("Tender Strips - 3", ES, "Tender Strips – 3", note=MEAT),
    I("Tender Strips - 5", GC, "Tender Strips – 5", note=MEAT),
    I("Texan Beef Burger - Double", GC, "Texan Beef Burger – Double", tags="contains_beef"),
    I("Texan Beef Burger - Single", GC, "Texan Beef Burger – Single", tags="contains_beef"),
    I("Texan Lamb Burger - Double", GC, "Texan Lamb Burger – Double"),
    I("Texan Lamb Burger - Single", GC, "Texan Lamb Burger – Single"),
    I("The Wrap", GC, note=MEAT),
    I("Veggie Burger - Double", VT, "Veggie Burger – Double", tags="vegetarian", note=VEG),
    I("Veggie Burger - Single", VT, "Veggie Burger – Single", tags="vegetarian", note=VEG),
    I("Wedges", ES),
    I("Whole Chicken", GC, note="Same numbers as Pepe's Original (the page lists both names)"),
    I("Wings X 18 (Serves 2)", PL, "Wings x 18 (serves 2)", rankable=False,
      note=MEAT + "; serves more than one; salt is printed as 8.0 g here but 1.3 g for 28 wings; entered as printed"),
    I("Wings X 28 (Serves 3)", PL, "Wings x 28 (serves 3)", rankable=False,
      note=MEAT + "; serves more than one; salt is printed as 1.3 g here but 8.0 g for 18 wings; entered as printed"),
]

# The one platter that serves one person is a normal order.
PLATTER_FOR_ONE = {"Solo (Serves 1)"}

# Hold back (never correct): the card's own numbers are impossible.
HOLDBACK = {"Onion Rings": "Carbohydrates printed as 393.0 g with only 305 kcal (and 13.8 g fat, 5.9 g protein): impossible; "
                           "Piri Piri Onion Rings prints 43.0 g. Not corrected."}


def norm(text: str) -> str:
    """Page headings use curly quotes, en dashes, doubled and non-breaking spaces; compare in a plain form."""
    return re.sub(r"\s+", " ", text.replace("’", "'").replace("–", "-").replace("‍", "")).strip()


class CardParser(HTMLParser):
    """Collects every <div class="nutrition-table-item"> card: attributes, heading, (label, value) pairs."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.cards: list[dict] = []
        self.stack: list[str] = []
        self.card: dict | None = None
        self.mode: str | None = None
        self.item: list | None = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "div":
            if "nutrition-table-item" in cls and "data-adam" in a:
                self.card = {"attrs": a, "head": "", "items": [], "footer": ""}
                self.stack.append("card")
            elif self.card is not None and "nutrition-table-heading" in cls:
                self.stack.append("head"); self.mode = "head"
            elif self.card is not None and "ntc-item" in cls:
                self.item = ["", ""]; self.stack.append("item"); self.mode = "value"
            elif self.card is not None and "nutrition-table-footer" in cls:
                self.stack.append("footer"); self.mode = "footer"
            else:
                self.stack.append("other")
        elif tag == "strong" and self.item is not None and "ntc-name" in cls:
            self.mode = "label"

    def handle_endtag(self, tag):
        if tag == "strong" and self.item is not None and self.mode == "label":
            self.mode = "value"
        elif tag == "div" and self.stack:
            kind = self.stack.pop()
            if kind == "item" and self.card is not None and self.item is not None:
                self.card["items"].append((self.item[0].replace("‍", "").strip(), self.item[1].replace("‍", "").strip()))
                self.item = None; self.mode = None
            elif kind in ("head", "footer"):
                self.mode = None
            elif kind == "card" and self.card is not None:
                self.cards.append(self.card); self.card = None; self.mode = None

    def handle_data(self, data):
        if self.card is None:
            return
        if self.mode == "head":
            self.card["head"] += data
        elif self.mode == "footer":
            self.card["footer"] += data
        elif self.item is not None and self.mode == "label":
            self.item[0] += data
        elif self.item is not None and self.mode == "value":
            self.item[1] += data


def fail(msg: str) -> int:
    print(msg, file=sys.stderr)
    return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("html", type=Path, help="the saved page https://pepes.co.uk/nutrition-allergens-uk/")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was downloaded and read")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    raw = args.html.read_text(encoding="utf-8")
    if "<h1>Nutrition &amp; Allergens UK</h1>" not in raw or 'class="button alt btn-tab active">UK<' not in raw:
        return fail("This is not the UK nutrition page (Ireland's page must not be used). Check the file.")
    parser = CardParser()
    parser.feed(raw)

    # Hidden helper cards for the page's allergen search have no numbers and data-type="dummy": not menu rows.
    real = [c for c in parser.cards
            if not (c["attrs"].get("data-type") == "dummy" and all(v == "" for _, v in c["items"]))]
    if len(real) != len(ROWS):
        return fail(f"The page has {len(real)} nutrition cards but this script names {len(ROWS)}. The menu changed: "
                    "re-check the names in ROWS against the page before running again.")

    items, held, left_out = [], [], []
    for n, (card, (title, cat, spec)) in enumerate(zip(real, ROWS), start=1):
        printed_title = norm(card["attrs"].get("data-title", ""))
        if printed_title != title or norm(card["head"]) != title:
            return fail(f"Card {n} is {printed_title!r} (heading {norm(card['head'])!r}) but ROWS expects {title!r}. "
                        "The page's order or names changed: re-check ROWS.")
        if card["attrs"].get("data-category") != cat:
            return fail(f"Card {n} {title!r} is in category {card['attrs'].get('data-category')!r}, ROWS expects {cat!r}.")
        if [label for label, _ in card["items"]] != LABELS:
            return fail(f"Card {n} {title!r} has columns {[l for l, _ in card['items']]}, expected {LABELS}.")
        values = dict(card["items"])
        for label, value in values.items():
            if value != "" and not NUMBER.match(value):
                return fail(f"Card {n} {title!r}: {label} is {value!r}, not a plain number.")
        if isinstance(spec, str):
            left_out.append((title, spec))
            continue
        required = ["Kcal", "Fat (g)", "Carbohydrates (g)", "Protein (g)"]
        if any(values[k] == "" for k in required):
            return fail(f"Card {n} {title!r} is listed as published but a required number is missing. Re-check ROWS.")
        for k in ("Saturated Fat (g)", "Sugars (g)", "Salt (g)"):
            if values[k] == "":
                return fail(f"Card {n} {title!r}: {k} is blank; leave the cell blank on purpose by editing this script.")
        kcal, fat, carbs, protein = (float(values[k]) for k in required)
        notes = [spec["note"]] if spec["note"] else []
        if values["Add Flavour (ml)"]:
            notes.append(f"Page lists Add Flavour {values['Add Flavour (ml)']} ml")
        energy = 4 * protein + 4 * carbs + 9 * fat
        if kcal - energy > 5 and (kcal - energy) / kcal > 0.15:
            notes.append("Printed calories are higher than 4 x protein + 4 x carbs + 9 x fat account for (fibre or sweeteners may explain; "
                         "the page doesn't say); entered as printed")
        rankable = spec["rankable"] and (cat != PL or title in PLATTER_FOR_ONE)
        item = {
            "id": spec["id"], "name": spec["name"], "category": CATEGORY_NAME[cat], "serving": spec["serving"],
            "calories": values["Kcal"], "protein_g": values["Protein (g)"], "carbs_g": values["Carbohydrates (g)"],
            "fat_g": values["Fat (g)"], "sat_fat_g": values["Saturated Fat (g)"], "salt_g": values["Salt (g)"],
            "sugar_g": values["Sugars (g)"], "tags": spec["tags"], "limited_time": False, "rankable": rankable,
            "notes": "; ".join(notes), "_cat": cat, "_title": title,
        }
        items.append(item)
        if title in HOLDBACK:
            held.append(item)

    items.sort(key=lambda i: CATEGORY_ORDER.index(i.pop("_cat")))
    holdback = [(i["id"] or slug(i["name"]), HOLDBACK[i["_title"]]) for i in held]
    for i in items:
        i.pop("_title")
    note = ("Pepe's lists a flavour amount (ml) for many chicken items and the sauce flavours separately per 10 ml; the page doesn't say whether item "
            "values include the flavour, so none is added. Pepe's says its nutrition information doesn't apply to its Belfast stores.")
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Pepe's Piri Piri", cuisine="Chicken",
        source_title=f"Pepe's Piri Piri Nutrition & Allergens UK page (accessed {args.checked_on}, no date shown)",
        source_url=SOURCE_URL, checked_on=args.checked_on,
        aliases=["pepes piri piri", "pepe's piri piri", "pepes", "pepe's"],
        items=items, out=args.out, note=note, holdback=holdback)
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}; {len(left_out)} cards left out; "
          f"page sha256 {sha256_file(args.html)}")
    for title, why in left_out:
        print(f"  left out: {title} -- {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
