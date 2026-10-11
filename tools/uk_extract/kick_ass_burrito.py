#!/usr/bin/env python3
"""Build data/source/kick-ass-burrito/ from Kick Ass Burrito's own nutrition menu (hosted by Ten Kites).

    python3 tools/uk_extract/kick_ass_burrito.py --checked-on 2026-10-11 [--cache DIR] [--report]

Kick Ass Burrito is a delivery-only brand cooked in Big Table Group restaurant kitchens (the group that runs Chiquito, Las
Iguanas and Frankie & Benny's) and ordered through delivery apps; it has no website of its own. The menu is the Big Table Group's
Ten Kites page https://menus.tenkites.com/thebigtg/kickassburrito (robots.txt of menus.tenkites.com disallows only /fonts/,
/views/ and /*.less, checked 2026-10-11). Two tabs: "Kick Ass Burrito" (food) and "Drinks" (?mguid=<tab id>). Every dish has a
"Nutrition (per portion)" table and a "Dietary Information" allergen block. Parser: tenkites_a.py (the same template as Chiquito,
Las Iguanas and Frankie & Benny's). Numbers are copied as printed; only names, categories and the rules below are written by hand.

Scope and rules (the run stops if a tab's row count changes):
  burritos, big boy burritos, bowls, side kicks, desserts and limited-time burritos are items; "Choose your Heat" sauces, "Double Up
  Your Filling?" and churro sauces are listed as add-ons (their own numbers, not summed into a dish); the same row printed in several
  sections is one item (exact duplicate dropped).
  skipped      "Filling - Mighty Beef" (1,356 kcal: a batch of filling, more than the 756 kcal burrito it goes into, not sold on its
               own), two drinks rows named only "Small" with every figure 0 (no product name), and Coke Zero Can (its allergen block
               prints "Contains: Nuts", which contradicts the product and the page's own filter ids).
  unpublished  rows with a "-" for kcal/protein/carbs/fat (Irn-Bru, two beers): never items.
  names        internal menu codes ("KA25 APR LI - ...") and the pepper emoji are removed from names; ALL-CAPS names are tidied.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

# tenkites_a leaves its "current section" at "suitable" after the "Suitable for:" line, so the next `section-values` element
# (the line "This dish contains none of the listed allergens", which has no section class of its own) replaced the dish's
# Suitable-for list and the vegetarian tag was lost for every dish without allergens (found for Chiquito, 2026-10-08). Ignoring
# that line as a value fixes it here; tenkites_a is shared by other chains, so it is not edited.
_NONE_LINE = "This dish contains none of the listed allergens"
_captured = t._Parser._captured


def _captured_ignoring_none_line(self, key, text):
    if key == "sect_suitable" and text == _NONE_LINE:
        return
    _captured(self, key, text)


t._Parser._captured = _captured_ignoring_none_line

URL = "https://menus.tenkites.com/thebigtg/kickassburrito"
TABS = {"Kick Ass Burrito": "use", "Drinks": "use"}
EXPECTED = {"Kick Ass Burrito": 61, "Drinks": 14}

ADDONS = "Add-ons & extras"
SAUCES = "Sauces & dips"
CATEGORY_ORDER = ["Burritos", "Big Boy Burritos", "Limited-time burritos", "Bowls", "Side kicks", "Desserts", SAUCES, ADDONS,
                  "Drinks: Soft drinks", "Drinks: Alcohol"]

_EMOJI = re.compile(r"[\U0001F300-\U0001FAFF☀-➿️]")
_CODE = re.compile(r"^KA\d{2} [A-Z]{3} [A-Z]{2} - ")          # "KA25 APR LI - " (an internal menu code)


def clean(raw: str) -> str:
    n = _EMOJI.sub("", raw)
    n = _CODE.sub("", t._clean(n))
    m = re.match(r"^(?:LTO - )?BURRITO - (.+)$", n)       # "BURRITO - Five Bean Chilli" (a section label left in the name)
    if m:
        n = f"{m.group(1)} Burrito"
    n = re.sub(r"^Double Up - ", "Double ", n)               # "Double Up - Beef Brisket" -> "Double Beef Brisket"
    return t.tidy_name(n.strip())


def classify(rec: dict):
    menu, c1, c2, byo, sec = rec["menu"], rec["course"], rec["course2"], rec["byo"], rec["byo_section"]
    raw = rec["name"]
    nm = clean(raw)

    if menu == "Drinks":
        if nm == "Small":
            return ("skip", "two drinks rows are named only 'Small' with every figure 0: no product name")
        if raw == "COKE ZERO CAN":
            return ("skip", "its allergen block prints 'Contains: Nuts' for a can of Coke Zero (a label that is neither peanuts nor "
                    "tree nuts, and that none of the page's allergen filters carry, unlike every other drink): the chain's own "
                    "allergen row contradicts the product, so the row is left out rather than chosen between")
        cat = "Drinks: Alcohol" if c1 == "Alcohol" else "Drinks: Soft drinks"
        return {"category": cat, "rankable": False, "alcohol": c1 == "Alcohol", "name": nm}

    if raw.startswith("Filling - "):
        return ("skip", "a batch of burrito filling (1,356 kcal, more than the 756 kcal burrito it goes into), not sold on its own")

    # modifiers printed under a dish: "Choose your Heat", "Double Up Your Filling?", "Add Guac?", churro sauces
    if sec.lower().startswith("choose your heat"):
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (burrito heat choice)"}
    if sec == "Double Up Your Filling?":
        base = nm if nm.lower().startswith("double") else f"Double {nm}"
        return {"category": ADDONS, "rankable": False, "name": f"{base} (extra filling)"}
    if sec == "Add Guac?":
        return {"category": SAUCES, "rankable": False, "name": nm}
    if sec == "Choose your sauce":
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (dessert sauce choice)"}

    if c1.startswith("BURRITOS"):
        return {"category": "Burritos", "rankable": True, "name": nm}
    if c1.startswith("Big Boy Burritos"):
        return {"category": "Big Boy Burritos", "rankable": True, "name": nm}
    if c1 == "BADASS BOWLS":
        return {"category": "Bowls", "rankable": True, "name": nm}
    if c1.startswith("SIDE KICKS"):
        if c2 == "Sauces":
            return {"category": SAUCES, "rankable": False, "name": nm}
        return {"category": "Side kicks", "rankable": True, "name": nm}
    if c1.startswith("DESSERTS"):
        if byo == "Small Churros" and not sec:
            return {"category": "Desserts", "rankable": False, "name": "Small Churros (three cinnamon-sugar dusted)"}
        return {"category": "Desserts", "rankable": False, "name": nm}
    if c1 == "LTO'S":
        name = nm if nm.lower().endswith("burrito") else f"{nm} Burrito"
        return {"category": "Limited-time burritos", "rankable": True, "limited_time": True, "name": name}
    raise SystemExit(f"unclassified row: {menu} > {c1} > {c2} > {byo} > {sec} > {raw!r}: the menu changed, add a rule")


_IMPOSSIBLE = ("The table prints 218.4 g of fat (and 2,443 kcal) but only 29.1 g of saturates and a burrito's usual 700-800 kcal: "
               "the figure cannot be a serving as printed.")
HOLDBACK: dict = {
    "Philly Beef Burrito": _IMPOSSIBLE,
}
NOTE = ("A delivery-only brand cooked in Big Table Group restaurant kitchens and ordered through delivery apps. Per portion as "
        "printed on the menu page; sauces, extra fillings and sides are listed on their own, so add the parts you order.")

ALLERGEN_TITLE = ("Kick Ass Burrito Dietary Information (allergens) on its online Kick Ass Burrito and Drinks menus "
                  "(Ten Kites page generated 2026-10-11)")

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="kick-ass-burrito", name="Kick Ass Burrito", cuisine="Mexican", aliases=["kick ass burrito", "kickass burrito"],
        url=URL,
        source_title="Kick Ass Burrito Nutrition (per portion) menus: Kick Ass Burrito and Drinks (page generated 2026-10-11)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK,
        allergen_title=ALLERGEN_TITLE))
