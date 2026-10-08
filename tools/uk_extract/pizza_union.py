#!/usr/bin/env python3
"""Build data/source/pizza-union/ from Pizza Union's official "Nutrition and Allergen Information" PDF.

    python3 tools/uk_extract/pizza_union.py path/to/pizza-union-nutrition-allergen-information.pdf --checked-on 2026-10-06

Numbers are copied from the PDF as printed (kcal, kJ, fat, saturates, carbs, sugars, protein, salt; there is no fibre column
and no portion weight). Only the display NAMES, categories and the rankable flag below are typed by hand, in the PDF's reading
order. Every row's printed name must match the name the script reads from the PDF; if Pizza Union adds, removes, renames or
reorders a row the script stops so a human re-checks ROWS against the guide.

Source: https://www.pizzaunion.com/wp-content/pizza-union-nutrition-allergen-information.pdf
The page footers say "Renewed 17.03.26" (PDF created 10 March 2026). Values are "Typical Nutrition Values Per Average Portion".

Allergens come from the same table's "Contains: Allergens, Alcohol" column (read by pizza_union_pdf.py, text as printed) and are
turned into keys by allergens_from_text() below: "Gluten: Wheat & Barley" names the cereals, "Nuts: Hazelnuts" / "Nuts
(Pistachio)" the tree nuts, "May contain(s):" / "Can contain:" starts the may-contain list, "Alcohol" is not an allergen and is
skipped. A blank cell means none of the 14 (the guide says its allergen information covers the 14). Any word not known stops the
run.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pizza_union_pdf  # noqa: E402
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pizza-union"
SOURCE_URL = "https://www.pizzaunion.com/wp-content/pizza-union-nutrition-allergen-information.pdf"
GUIDE_DATE = "17.03.26"
SERVING = "Average portion"   # the table header: "Typical Nutrition Values Per Average Portion" (no weights are printed)

PZ, SA, SV, SW, GE, TP, SD, HD, BE = ("Pizza", "Salad", "Savoury", "Sweet", "Gelato & sorbetto", "Toppings", "Soft drinks",
                                      "Hot drinks", "Beer")
PORK = ["contains_pork"]
# (printed name, shown name, category, rankable, extra tags, note) in the PDF's reading order, one entry per printed row.
# `None` = a row we deliberately leave out; the reason is in the comment (and in the report).
ROWS: list[tuple | None] = [
    ("Marinara", "Marinara", PZ, True, [], ""),
    ("Bianca", "Bianca", PZ, True, [], ""),
    ("Margherita", "Margherita", PZ, True, [], ""),
    ("Funghi", "Funghi", PZ, True, [], ""),
    ("Fiorentina", "Fiorentina", PZ, True, [], ""),
    ("Giardino", "Giardino", PZ, True, [], ""),
    ("Formaggi", "Formaggi", PZ, True, [], "Guide marks it not vegetarian but does not say why (meat type not stated)"),
    ("Regina", "Regina", PZ, True, [], "Meat type not stated"),
    ("Tropicali", "Tropicali", PZ, True, [], "Meat type not stated"),
    ("Vesuvio", "Vesuvio", PZ, True, [], "Meat type not stated"),
    ("Pepperoni", "Pepperoni", PZ, True, PORK, "Pork because the guide's own topping row is 'Pepperoni (PORK)'"),
    ("Calabria", "Calabria", PZ, True, [], "Meat type not stated"),
    ("Carne", "Carne", PZ, True, [], "Meat type not stated"),
    ("Pollo", "Pollo", PZ, True, [], "Meat type not stated"),
    ("Napoli", "Napoli", PZ, True, [], "Salt printed as 8.1 g, well above the other pizzas (the anchovy topping alone is printed at 4.5 g); allergens list fish: anchovies"),
    ("Rucola", "Rucola", SA, True, [], ""),
    ("Verdura", "Verdura", SA, True, [], ""),
    ("Campagna", "Campagna", SA, True, [], "Guide marks it not vegetarian; meat type not stated"),
    ("Hot Chilli dip", "Hot Chilli Dip", SV, False, [], ""),
    ("Hot Honey dip", "Hot Honey Dip", SV, False, [], "Protein is printed as 0.45 (two decimals)"),
    ("Garlic & herb dip", "Garlic & Herb Dip", SV, False, [], ""),
    ("Taralli", "Taralli", SV, True, [], ""),
    ("Mixed olives", "Mixed Olives", SV, True, [], ""),
    ("Cannoli chocolate", "Cannoli Chocolate", SW, False, [], ""),
    ("Cannoli pistachio", "Cannoli Pistachio", SW, False, [], ""),
    ("Dark Chocolate Sorbetto", "Dark Chocolate Sorbetto", GE, False, [], ""),
    ("Bronte Pistachio Gelato", "Bronte Pistachio Gelato", GE, False, [], ""),
    ("Madagascan Vanilla Gelato", "Madagascan Vanilla Gelato", GE, False, [], ""),
    ("Sea Salted Caramel Gelato", "Sea Salted Caramel Gelato", GE, False, [], ""),
    ("Raspberry Sorbetto", "Raspberry Sorbetto", GE, False, [], ""),
    ("Anchovies (Fish)", "Anchovies (fish)", TP, False, [], ""),
    ("Chicken", "Chicken", TP, False, [], ""),
    ("Ham (PORK)", "Ham (pork)", TP, False, PORK, ""),
    ("N’duja (PORK)", "N'duja (pork)", TP, False, PORK, ""),
    ("Pepperoni (PORK)", "Pepperoni (pork)", TP, False, PORK, ""),
    ("Black olives", "Black olives", TP, False, [], ""),
    ("Fresh spinach", "Fresh spinach", TP, False, [], ""),
    ("Jalapeno peppers", "Jalapeno peppers", TP, False, [], "kJ printed as 14 for 3 kcal (rounding)"),
    ("Mushrooms", "Mushrooms", TP, False, [], ""),
    ("Mixed peppers", "Mixed peppers", TP, False, [], "HELD BACK: sugars 1.8 g printed with 0 g carbohydrate"),
    ("Onions", "Onions", TP, False, [], ""),
    ("Pineapple", "Pineapple", TP, False, [], ""),
    ("Rocket", "Rocket", TP, False, [], ""),
    ("Gorngozola", "Gorgonzola", TP, False, [], "Printed 'Gorngozola' (spelling corrected in the name only); guide marks it not vegetarian; meat type not stated"),
    ("Mascarpone", "Mascarpone", TP, False, [], ""),
    ("Mozzarella", "Mozzarella", TP, False, [], ""),
    ("Parmesan (dalter vegeterian cheese", "Parmesan (Dalter vegetarian cheese)", TP, False, [], "Printed 'Parmesan (dalter vegeterian cheese' with no closing bracket (name tidied only)"),
    ("Vegan Mozzarella", "Vegan Mozzarella", TP, False, [], ""),
    ("Egg", "Egg", TP, False, [], ""),
    ("Chilli oil", "Chilli oil", TP, False, [], "Identical numbers to Garlic oil as printed"),
    ("Garlic oil", "Garlic oil", TP, False, [], "Identical numbers to Chilli oil as printed"),
    ("Pizza sauce", "Pizza sauce", TP, False, [], ""),
    ("Salad dressing", "Salad dressing", TP, False, [], ""),
    None,  # Dough (an ingredient of every pizza, not something sold)
    None,  # Gluten free base (a pizza base on its own, not something sold alone; cannot be combined with the pizza rows)
    ("Coke", "Coke", SD, False, [], ""),
    ("Diet Coke", "Diet Coke", SD, False, [], "kJ 5 for 1 kcal (rounding)"),
    ("San P. Aranciata", "San P. Aranciata", SD, False, [], ""),
    ("San P. Limonata", "San P. Limonata", SD, False, [], "Printed kcal (73) is higher than its carbohydrate and protein explain (about 60); the printed kJ agrees with the kcal"),
    ("Water - Still", "Water (still)", SD, False, [], ""),
    ("Water - Sparkling", "Water (sparkling)", SD, False, [], ""),
    ("Americano", "Americano", HD, False, [], ""),
    ("Cappuccino", "Cappuccino", HD, False, [], ""),
    ("Espresso", "Espresso", HD, False, [], ""),
    ("Latte", "Latte", HD, False, [], ""),
    None,  # Tea English (n.d. = no data)
    None,  # Tea Green (n.d.)
    None,  # Tea Mint (n.d.)
    ("Beer Moretti", "Beer Moretti", BE, False, [], "Calories include the energy of the alcohol, so they are well above 4P+4C+9F"),
    ("Beer Moretti Large", "Beer Moretti Large", BE, False, [], "Calories include the energy of the alcohol, so they are well above 4P+4C+9F"),
    ("Beer - Moretti 0%", "Beer Moretti 0%", BE, False, [], ""),
    None,  # Prosecco glass (macros n.d.)
    None,  # Red glass (n.d.)
    None,  # White glass (n.d.)
    None,  # Frozen Margarita (n.d.)
    None,  # Frozen Raspberry mojito (n.d.)
    None,  # Aperoll Spritz (n.d.)
    None,  # Limoncello double shot (n.d.)
]
# The names of the rows above that are left out, to check them against the PDF too.
SKIPPED_PRINTED = ["Dough", "Gluten free base", "Tea English", "Tea Green", "Tea Mint", "Prosecco glass", "Red glass",
                   "White glass", "Frozen Margarita", "Frozen Raspberry mojito", "Aperoll Spritz", "Limoncello double shot"]

# Rows the guide prints impossibly (item id -> reason). Never corrected: they are not published.
HOLDBACK = [
    ("mixed-peppers", "The guide prints 1.8 g of sugars with 0 g of carbohydrate (sugars are part of carbohydrate), and 11 kcal where its own macros add up to about 2 kcal."),
]

# Pizza Union's own printed spellings that common.allergen_words does not know (lower case -> (key, cereal/nut or None)).
ALLERGEN_EXTRA = {
    "seasame": ("sesame", None),                  # Taralli: "Seasame"
    "soybean": ("soya", None),                    # Hot Honey dip: "Soybean"
    "other nuts": ("nuts", None),                 # Cannoli: "May contain other nuts & Mustard"
    "wheat from semolina": ("gluten", "wheat"),   # Gluten free base: "Can contain: Gluten, Wheat from semolina"
}
# "<allergen>: <detail>" where the detail names a source, not a cereal or nut: (allergen, detail) as printed, lower case.
ALLERGEN_SOURCE_DETAIL = {("fish", "anchovies"), ("sulphur dioxide", "white wine")}
ALLERGEN_TITLE = "Pizza Union Nutrition and Allergen Information (renewed 17.03.26)"
MAY = re.compile(r"\b(?:may contains?|can contain)\s*:?", re.I)


def _top_split(text: str) -> list[str]:
    """Split on commas and semicolons that are not inside brackets."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        depth += (ch == "(") - (ch == ")")
        if ch in ",;" and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    return [p.strip() for p in parts + [cur] if p.strip()]


def _keys(part: str, where: str) -> tuple[set[str], set[str], set[str]]:
    keys, cereals, nuts = set(), set(), set()
    for tok in _top_split(part):
        if re.match(r"alcohol\b", tok, re.I):
            continue  # the column is "Allergens, Alcohol": alcohol is not one of the 14
        m = re.match(r"^(?P<head>[^:(]+?)\s*(?::\s*(?P<a>.+)|\((?P<b>[^)]*)\))$", tok)
        if not m:
            words = tok.split("&")                                  # "other nuts & Mustard"
        elif (m["head"].lower(), (m["a"] or m["b"]).strip().lower()) in ALLERGEN_SOURCE_DETAIL:
            words = [m["head"]]                                     # "Fish: Anchovies": the detail names the source
        else:
            head_keys, _, _ = allergen_words([m["head"]], where, ALLERGEN_EXTRA)
            if head_keys not in ({"gluten"}, {"nuts"}):
                raise SystemExit(f"{where}: unexpected detail in {tok!r}: check the guide")
            words = [m["head"]] + (m["a"] or m["b"]).split("&")      # "Gluten: Wheat & Barley", "Nuts (Pistachio)"
        k, c, n = allergen_words(words, where, ALLERGEN_EXTRA)
        keys |= k
        cereals |= c
        nuts |= n
    return keys, cereals, nuts


def allergens_from_text(text: str, where: str) -> dict:
    """The printed allergen cell -> {"contains", "may_contain", "cereals", "nuts"} (see the module docstring)."""
    text = text.replace('"', "").strip()
    parts = MAY.split(text)
    if len(parts) > 2:
        raise SystemExit(f"{where}: two may-contain lists in {text!r}")
    contains, cereals, nuts = _keys(parts[0], where)
    may = _keys(parts[1], where)[0] if len(parts) == 2 else set()
    # `may` is returned whole (not minus `contains`): common.write_allergens needs to see a key in both lists to drop the nut/cereal kinds
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


NOTE = ("Pizza Union's guide gives values per average portion with no weights, and toppings are listed separately (they are "
        "not added to the pizza figures). Wines, cocktails and teas have no data in the guide.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    dates = set(pizza_union_pdf.renewed_dates(args.pdf))
    if dates != {GUIDE_DATE}:
        print(f"The PDF footers say {sorted(dates)} but this script was written for 'Renewed {GUIDE_DATE}'. A new guide: re-check "
              "ROWS against it, then update GUIDE_DATE.", file=sys.stderr)
        return 1
    rows = pizza_union_pdf.read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}. The layout or menu changed: "
              "re-check ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    skipped = iter(SKIPPED_PRINTED)
    items = []
    for n, (printed, spec) in enumerate(zip(rows, ROWS), 1):
        if spec is None:
            want = next(skipped)
            if printed["name"] != want:
                print(f"Row {n}: the PDF has {printed['name']!r} where this script skips {want!r}. Re-check ROWS.", file=sys.stderr)
                return 1
            continue
        pname, name, category, rankable, tags, note = spec
        if printed["name"] != pname:
            print(f"Row {n}: the PDF has {printed['name']!r} where this script expects {pname!r}. Re-check ROWS.", file=sys.stderr)
            return 1
        tags = list(tags)
        if printed["vegetarian"] == "Yes":
            tags.insert(0, "vegetarian")
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": SERVING,
            "calories": printed["kcal"], "energy_kj": printed["kj"], "protein_g": printed["protein"], "carbs_g": printed["carbs"], "fat_g": printed["fat"],
            "sat_fat_g": printed["sat"], "sodium_mg": "", "salt_g": printed["salt"], "sugar_g": printed["sugars"], "fiber_g": "",
            "tags": "|".join(tags), "limited_time": False, "rankable": rankable, "components": "", "added_on": "", "notes": note,
            "allergens": allergens_from_text(printed["allergen_text"], f"row {n} {printed['name']!r}"),
        })
    if next(skipped, None) is not None:
        print("Some skipped rows were not matched against the PDF. Re-check SKIPPED_PRINTED.", file=sys.stderr)
        return 1
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    assert all(h[0] in ids for h in HOLDBACK), "a held-back id is not an item"

    write_chain_folder(
        chain_id=CHAIN_ID, name="Pizza Union", cuisine="Pizza",
        source_title="Pizza Union Nutrition and Allergen Information (renewed 17.03.26)",
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["pizza union"], items=items, out=args.out,
        note=NOTE, holdback=HOLDBACK,
        allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"wrote {len(items)} items to {args.out} ({len(HOLDBACK)} held back; PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
