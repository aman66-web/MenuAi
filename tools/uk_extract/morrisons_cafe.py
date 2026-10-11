#!/usr/bin/env python3
"""Build data/source/morrisons-cafe/ from Morrisons Café's own menu (a CALORIES-ONLY chain).

    python3 -I tools/uk_extract/morrisons_cafe.py --pdf-ew FILE --pdf-scot FILE --checked-on 2026-10-11 [--out DIR]
    python3 -I tools/uk_extract/morrisons_cafe.py --fetch DIR --checked-on 2026-10-11      (downloads both PDFs into DIR first)

Source: the "View Menu" and "View Scottish Menu" links on Morrisons' café page (https://www.morrisons.com/inspiration/shopping-at-morrisons/cafe):
https://www.morrisons.com/terms/cafe-menu and https://www.morrisons.com/terms/scottish-cafe-menu redirect to the menu posters on Morrisons'
own Contentful asset host (assets.ctfassets.net/um1yk6827v6c/...): "Cafe Reset Menu E&W" and "... SCOT", both dated 5-5-26 in the file name
(PDFs created 17 April 2026, artwork MM-2031403). robots.txt of www.morrisons.com allows /terms/ (only /draft/ and one media page are
disallowed); assets.ctfassets.net has no robots.txt (404 = no rules). One download of each file.

The menu prints CALORIES ONLY ("NNNkcal" beside each dish): no protein, carbs or fat, so those stay blank (docs/DATA.md "Calories-only chains").
Prices are not used. The poster has a real text layer; it is read by position (pdftotext -bbox-layout), never by counting:
  * a calorie token is one word "NNNkcal" (a word in brackets, "(101kcal)", is a sauce mentioned inside a description: not a token; the sauces
    are printed again as their own dishes);
  * DISHES below names, for each dish, the printed line that carries it (an anchor) and how its calories sit: "in" = on the anchor's own line,
    "right" = a separate word on the same baseline to the anchor's right, "below" = the nearest calorie line under the anchor;
  * every token must be claimed by exactly one dish and every dish must claim exactly one token, otherwise the run stops.
Only names, categories and the anchors are typed here; every number comes from the PDF.

Two menus: England & Wales (published) and Scotland (read for comparison only, like Great Local Pubs' Scottish breakfast). A dish printed on both
must print the same calories, otherwise it is left out (never chosen between); Scotland-only dishes (regional) are not published.
Allergens: link only. The café's allergen guide ("TS01K Cafe Allergen Information Guide", 28/09/2026, linked as "View Allergen Info") uses its
own dish names, which differ from the menu's ("Full Breakfast" vs "Full English Breakfast"), so it is not matched here; it is the guide link.
Morrisons says its food is prepared in a busy kitchen and may contain other allergens; the vegan dishes are "vegan recipe" only.

Read on 2026-10-11: E&W poster sha256 42bb1db70a5b50046b35a6bcbb56ae91b246d7d2d023eb2fc275553043bd6829 (122 dishes, every calorie word claimed);
Scottish poster sha256 3554b794dfcdb8e5699c192c7888c46d28cc4a65fa6047f2f5ab0e05068ebca8. Independent check: data/audit/verified/morrisons-cafe.json.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402  (meat_tags)
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "morrisons-cafe"
EW_URL = "https://www.morrisons.com/terms/cafe-menu"
SCOT_URL = "https://www.morrisons.com/terms/scottish-cafe-menu"
ALLERGEN_URL = "https://www.morrisons.com/terms/cafe-allergen-information"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', re.S)
TOKEN = re.compile(r"^(\d{1,4})kcal$")

B, BR, BB, BY, MA, CH, BU, SO, SI, KB, KM = ("Breakfast", "Breakfast rolls & wraps", "Build your own breakfast (per item)", "Breakfast extras",
                                             "Mains", "Chicken", "Burgers", "Soup & salads", "Sides & sauces", "Kids: breakfast (per item)",
                                             "Kids: mix & match (per item)")
# (shown name, category, anchor text (the start of the printed line), mode, after: a line above the anchor that picks which copy of it, rankable)
DISHES = [
    ("The Belly Buster", B, "The Belly Buster", "in", None, True),
    ("Big Breakfast", B, "Big Breakfast £8.95", "in", None, True),
    ("Full English Breakfast", B, "Full English Breakfast", "below", None, True),
    ("Full Veggie Breakfast", B, "Full Veggie Breakfast", "below", None, True),
    ("Full Vegan Breakfast", B, "Full Vegan Breakfast", "below", None, True),
    ("Small Breakfast", B, "Small Breakfast", "in", None, True),
    ("Stacked Pancakes (with Nutella)", B, "Stacked Pancakes", "right", None, False),
    ("Heinz Baked Beanz on Toast", B, "Heinz Baked Beanz on Toast", "right", None, True),
    ("Creamy Porridge", B, "Creamy Porridge", "in", None, True),
    ("Toasted Fruit Teacake", B, "Toasted Fruit Teacake", "in", None, False),
    ("White or Brown Toast (with butter or vegan spread)", BY, "White or Brown Toast 75p", "right", None, False),
    ("Strawberry Jam (add)", BY, "Add Strawberry Jam", "in", None, False),
    ("Marmalade (add)", BY, "Add Marmalade", "in", None, False),
    ("Honey (add)", BY, "Add Honey", "in", None, False),
    ("Nutella (add)", BY, "Add Nutella", "in", None, False),
    ("Fried Eggs on Toast", B, "Fried Eggs", "in", "Eggs on Toast", True),
    ("Poached Eggs on Toast", B, "Poached Eggs", "in", "Eggs on Toast", True),
    ("Scrambled Eggs on Toast", B, "Scrambled Eggs", "in", "Eggs on Toast", True),
    ("Smashed Avocado (add to eggs on toast)", BY, "Add smashed avocado", "right", None, False),
    ("Bacon Breakfast Roll", BR, "Bacon", "in", "Breakfast Rolls", True),
    ("Sausage Breakfast Roll", BR, "Sausage", "in", "Breakfast Rolls", True),
    ("Veggie Sausage Breakfast Roll", BR, "Veggie Sausage", "in", "Breakfast Rolls", True),
    ("Fried Eggs Breakfast Roll", BR, "Fried Eggs", "in", "Breakfast Rolls", True),
    ("Cheesy Slice (add to a breakfast roll)", BY, "Add cheesy slice", "in", None, False),
    ("Big Breakfast Roll", BR, "Big Breakfast Roll", "below", None, True),
    ("Big Breakfast Wrap", BR, "Also available as a wrap", "in", "Big Breakfast Roll", True),
    ("Big Breakfast Veggie Roll", BR, "Big Breakfast Veggie Roll", "below", None, True),
    ("Big Breakfast Veggie Wrap", BR, "Also available as a wrap", "in", "Big Breakfast Veggie Roll", True),
    ("Big Breakfast Vegan Roll", BR, "Big Breakfast Vegan Roll", "below", None, True),
    ("Big Breakfast Vegan Wrap", BR, "Also available as a wrap", "in", "Big Breakfast Vegan Roll", True),
    ("Bacon (build your own breakfast)", BB, "Bacon", "in", "£1.25 per item", False),
    ("Sausage (build your own breakfast)", BB, "Sausage", "in", "£1.25 per item", False),
    ("Veggie Sausage (build your own breakfast)", BB, "Veggie Sausage", "in", "£1.25 per item", False),
    ("Fried Egg (build your own breakfast)", BB, "Fried Egg", "in", "£1.25 per item", False),
    ("Poached Egg (build your own breakfast)", BB, "Poached Egg", "in", "£1.25 per item", False),
    ("Scrambled Egg (build your own breakfast)", BB, "Scrambled Egg", "in", "Choose any 8 items", False),
    ("Black Pudding (build your own breakfast)", BB, "Black Pudding", "in", None, False),
    ("Smashed Avocado (build your own breakfast)", BB, "Smashed Avocado", "in", "Choose any 8 items", False),
    ("Dr Schär Gluten Free Roll (build your own breakfast)", BB, "Dr Schär Gluten Free Roll", "in", None, False),
    ("Heinz Baked Beanz (build your own breakfast)", BB, "Heinz Baked Beanz", "in", "75p per item", False),
    ("Hash Brown (build your own breakfast)", BB, "Hash Brown", "in", "75p per item", False),
    ("Sliced Mushrooms (build your own breakfast)", BB, "Sliced Mushrooms", "in", None, False),
    ("Chopped Tomatoes (build your own breakfast)", BB, "Chopped Tomatoes", "in", None, False),
    ("Fried Bread (build your own breakfast)", BB, "Fried Bread", "in", None, False),
    ("White/Brown Toast (build your own breakfast)", BB, "White/Brown Toast", "right", None, False),
    ("White/Brown Bread (build your own breakfast)", BB, "White/Brown Bread", "right", None, False),
    ("Classic Hand Battered Fish, Chips & Mushy Peas", MA, "Chips & Mushy Peas* £8.95", "in", None, True),
    ("Small Hand Battered Fish, Chips & Mushy Peas", MA, "Chips & Mushy Peas* £6.75", "in", None, True),
    ("Wholetail Whitby Scampi, Chips & Mushy Peas", MA, "Chips & Mushy Peas £7.50", "in", None, True),
    ("Fish Butty", MA, "Fish Butty*", "in", None, True),
    ("Sausage, Egg, Chips & Beans", MA, "& Beans £7", "in", None, True),
    ("Sausage, Egg, Chips & Beans (vegetarian option)", MA, "Also available as a vegetarian option", "right", "Sausage, Egg, Chips", True),
    ("Bangers, Mash, Garden Peas & Gravy", MA, "Peas & Gravy £6.50", "in", None, True),
    ("Bangers, Mash, Garden Peas & Gravy (vegetarian option)", MA, "Also available as a vegetarian option", "right", "Bangers, Mash, Garden", True),
    ("Ham, Egg & Chips", MA, "Ham, Egg & Chips", "below", None, True),
    ("Lasagne, Garlic Bread & Side Salad", MA, "Lasagne, Garlic Bread & Side Salad", "below", None, True),
    ("Goodfella's Mac & Cheese, Garlic Bread & Side Salad", MA, "Garlic Bread & Side Salad £7.50", "in", None, True),
    ("Chicken Tikka Masala, Rice & Naan Bread", MA, "Rice & Naan Bread", "in", None, True),
    ("Katsu Chicken Curry & Rice", MA, "& Rice £7.50", "in", None, True),
    ("British Beef Steak Pie, Mash, Garden Peas & Gravy", MA, "Peas & Gravy £7.50", "in", None, True),
    ("Liver & Onions with Mash & Gravy", MA, "Liver & Onions with Mash & Gravy", "below", None, True),
    ("Minced Beef Stew with Mash & Gravy", MA, "Minced Beef Stew with Mash & Gravy", "below", None, True),
    ("Cheese & Onion Quiche, Chips & Beans", MA, "Beans £7.50", "in", None, True),
    ("Cheese & Onion Quiche, Salad & Coleslaw", MA, "Coleslaw £7.50", "in", None, True),
    ("Loaded Baked Potato (with butter or vegan spread and side salad, before toppings)", MA, "Loaded Baked Potato", "in", None, False),
    ("Heinz Baked Beanz (baked potato topping)", MA, "Heinz Baked Beanz", "in", "and a choice of two toppings", False),
    ("Tuna Mayo (baked potato topping)", MA, "Tuna Mayo", "in", None, False),
    ("Grated Cheddar Cheese (baked potato topping)", MA, "Grated Cheddar Cheese", "in", None, False),
    ("Veggie Chilli (baked potato topping)", MA, "Veggie Chilli", "in", None, False),
    ("Coleslaw (baked potato topping)", MA, "Coleslaw", "in", "Veggie Chilli", False),
    ("Boneless Crispy Chicken Bites Wrap & Chips", CH, "Boneless Crispy Chicken Bites Wrap & Chips", "in", None, True),
    ("Boneless Crispy Chicken Bites & Rice", CH, "Boneless Crispy Chicken Bites & Rice", "in", None, True),
    ("Boneless Crispy Chicken Bites & Chips", CH, "Boneless Crispy Chicken Bites & Chips", "in", None, True),
    ("Chicken Breast Skewer & Chips", CH, "Chicken Breast Skewer & Chips", "in", None, True),
    ("Chicken Breast Skewer Wrap & Chips", CH, "Chicken Breast Skewer Wrap & Chips", "in", None, True),
    ("Chicken Breast Skewer & Rice", CH, "Chicken Breast Skewer & Rice", "in", None, True),
    ("Quarter Pounder Cheese Burger", BU, "Quarter Pounder Cheese Burger", "in", None, True),
    ("Birds Eye Chicken Shop Burger", BU, "Birds Eye® Chicken Shop® Burger", "below", None, True),
    ("Vegan Burger", BU, "Vegan Burger", "right", None, True),
    ("Bacon (add to a burger)", BU, "Add bacon", "in", None, False),
    ("Extra Burger (add)", BU, "Add extra burger", "in", None, False),
    ("Extra Chicken Burger (add)", BU, "Add extra Chicken burger", "in", None, False),
    ("Extra Vegan Burger (add)", BU, "Add extra vegan burger", "right", None, False),
    ("Heinz Tomato Soup (with a bread roll and butter)", SO, "Heinz Tomato Soup", "right", None, True),
    ("Ham & Egg Salad", SO, "Ham & Egg Salad", "in", None, True),
    ("Vegan Strip Salad", SO, "Vegan Strip Salad", "in", None, True),
    ("Chicken & Bacon Salad", SO, "Chicken & Bacon Salad", "in", None, True),
    ("Chips (add)", SI, "Add chips £2", "right", None, False),
    ("Side Salad", SI, "Side Salad", "in", None, False),
    ("Mozzarella Sticks", SI, "Mozzarella Sticks", "in", None, False),
    ("Beer Battered Onion Rings", SI, "Beer Battered Onion Rings", "in", None, False),
    ("Mini Cheesy Hash Brown Bites", SI, "Mini Cheesy Hash Brown Bites", "in", None, False),
    ("Chips", SI, "Chips", "in", "Mini Cheesy Hash Brown Bites", False),
    ("White or Brown Slice of Bread & Butter", SI, "Bread & Butter", "in", None, False),
    ("Bread Roll (with butter or vegan spread)", SI, "Bread Roll", "right", None, False),
    ("Two Garlic Bread Slices", SI, "Two Garlic Bread Slices", "in", None, False),
    ("Curry Sauce", SI, "Curry Sauce", "in", None, False),
    ("Gravy", SI, "Gravy", "in", None, False),
    ("Coleslaw", SI, "Coleslaw", "in", "Gravy", False),
    ("BBQ Sauce", SI, "BBQ Sauce", "in", None, False),
    ("Sweet Chilli Sauce", SI, "Sweet Chilli Sauce", "in", None, False),
    ("Garlic & Herb Sauce", SI, "Garlic & Herb Sauce", "in", None, False),
    ("Kids' Breakfast on Waffles (before toppings)", KB, "On waffles", "in", None, False),
    ("Heinz Baked Beanz (kids' breakfast topping)", KB, "Heinz Baked Beanz", "below", "toppings:", False),
    ("Veggie Sausage (kids' breakfast topping)", KB, "Veggie Sausage", "in", "toppings:", False),
    ("Scrambled Egg (kids' breakfast topping)", KB, "Scrambled Egg", "in", "toppings:", False),
    ("Fried Egg (kids' breakfast topping)", KB, "Fried Egg", "in", "toppings:", False),
    ("Sausage (kids' breakfast topping)", KB, "Sausage", "in", "toppings:", False),
    ("Bacon (kids' breakfast topping)", KB, "Bacon", "in", "toppings:", False),
    ("Four Birds Eye Chicken Dippers (kids)", KM, "Four Birds Eye® Chicken Dippers", "in", None, False),
    ("Three Birds Eye Fish Fingers (kids)", KM, "Three Birds Eye® Fish Fingers", "in", None, False),
    ("Goodfella's Mini Margherita Pizza (kids)", KM, "Goodfella’s® Mini Margherita Pizza", "in", None, False),
    ("Two Sausages (kids)", KM, "Two Sausages", "in", None, False),
    ("Two Veggie Sausages (kids)", KM, "Two Veggie Sausages", "in", None, False),
    ("Birds Eye Mini Potato Waffles (kids)", KM, "Birds Eye® Mini Potato Waffles", "right", None, False),
    ("Birds Eye Crispy Chips (kids)", KM, "Birds Eye® Crispy Chips", "right", None, False),
    ("Aunt Bessie's Mash Potato (kids)", KM, "Aunt Bessie’s® Mash Potato", "in", None, False),
    ("Aunt Bessie's Yorkshire Pudding (kids)", KM, "Aunt Bessie’s® Yorkshire Pudding", "in", None, False),
    ("Birds Eye Garden Peas (kids)", KM, "Birds Eye® Garden Peas", "in", None, False),
    ("Birds Eye Steamfresh Veg (kids)", KM, "Birds Eye® Steamfresh® Veg", "in", None, False),
    ("Heinz Baked Beanz (kids)", KM, "Heinz Baked Beanz", "in", "Birds Eye® Steamfresh® Veg", False),
    ("Goodfella's Mac & Cheese & Garlic Bread (kids)", KM, "Goodfella’s ® Mac & Cheese & Garlic Bread", "right", None, False),
]
VEGETARIAN = re.compile(r"\b(veggie|vegan|vegetarian)\b", re.I)
# A dish is tagged vegetarian only when the menu's own name for it says veggie, vegan or vegetarian; nothing else is tagged vegetarian (the poster's V / VG symbols are pictures with
# no text, so they are not read).

NOTE = ("Calories only, as printed on Morrisons Café's own menu (England & Wales, May 2026); protein, carbs and fat are not published. Build-your-own "
        "breakfast items and toppings are per item: add them up. Scottish cafés print their own menu; dishes it prints differently are not listed.")
assert len(NOTE) < 400


class Line:
    def __init__(self, x0, y0, x1, y1, words):
        self.x0, self.y0, self.x1, self.y1, self.words = x0, y0, x1, y1, words
        self.text = " ".join(w[2] for w in words)


def read_lines(pdf: Path) -> list[Line]:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = []
    for m in LINE.finditer(out):
        x0, y0, x1, y1, inner = m.groups()
        words = [(float(a), float(c), " ".join(html.unescape(t).split())) for a, _, c, _, t in WORD.findall(inner)]
        words = [w for w in words if w[2]]
        if words:
            lines.append(Line(float(x0), float(y0), float(x1), float(y1), words))
    return lines


def tokens_of(line: Line) -> list[tuple[str, float]]:
    if line.text.startswith("Adults need around"):  # the footer "Adults need around 2000kcal a day." is not a dish
        return []
    return [(TOKEN.match(w[2]).group(1), w[0]) for w in line.words if TOKEN.match(w[2])]


def find_anchor(lines: list[Line], anchor: str, after: str | None) -> Line | None:
    def starts(l: Line, text: str) -> bool:
        return l.text == text or l.text.startswith(text + " ")
    cands = [l for l in lines if starts(l, anchor)]
    if after:
        heads = [l for l in lines if l.text.startswith(after)]
        if not heads:
            return None
        best = None
        for h in heads:
            for c in cands:
                dy = c.y1 - h.y1
                if 0 < dy <= 240 and abs(c.x0 - h.x0) <= 250:
                    if best is None or dy < best[0]:
                        best = (dy, c)
        return best[1] if best else None
    if len(cands) > 1:
        raise SystemExit(f"anchor {anchor!r} matches {len(cands)} lines: give it an 'after' line")
    return cands[0] if cands else None


def read_menu(pdf: Path, strict: bool) -> tuple[dict, list]:
    """{shown name: kcal string} for every dish found, and the unclaimed tokens. strict: every dish must be found (E&W)."""
    lines = read_lines(pdf)
    claimed: dict[tuple, str] = {}
    found: dict[str, str] = {}
    standalone = [l for l in lines if TOKEN.match(l.text)]
    for mode in ("in", "right", "below"):
        for name, _cat, anchor, m, after, _rank in DISHES:
            if m != mode:
                continue
            a = find_anchor(lines, anchor, after)
            if a is None:
                if strict:
                    raise SystemExit(f"anchor {anchor!r} (after {after!r}) not found: the menu changed")
                continue
            tok = None
            if mode == "in":
                toks = tokens_of(a)
                if len(toks) != 1:
                    raise SystemExit(f"{name}: line {a.text!r} has {len(toks)} calorie tokens")
                tok = (toks[0][0], round(a.y1, 1), round(toks[0][1], 1))
            elif mode == "right":
                c = [l for l in standalone if abs(l.y1 - a.y1) <= 6 and l.x0 > a.x1 - 1]
                c.sort(key=lambda l: l.x0 - a.x1)
                if c:
                    tok = (TOKEN.match(c[0].text).group(1), round(c[0].y1, 1), round(c[0].x0, 1))
            else:
                c = [l for l in lines if tokens_of(l) and 0 < l.y1 - a.y1 <= 40 and a.x0 - 160 <= l.x0 <= a.x1 + 60]
                c.sort(key=lambda l: (l.y1 - a.y1, abs(l.x0 - a.x0)))
                c = [l for l in c if (tokens_of(l)[0][0], round(l.y1, 1), round(tokens_of(l)[0][1], 1)) not in claimed]
                if c:
                    t = tokens_of(c[0])
                    tok = (t[0][0], round(c[0].y1, 1), round(t[0][1], 1))
            if tok is None:
                if strict:
                    raise SystemExit(f"{name}: no calorie token found ({mode} of {a.text!r})")
                continue
            if tok in claimed:
                raise SystemExit(f"{name}: token {tok} already claimed by {claimed[tok]!r}")
            claimed[tok] = name
            found[name] = tok[0]
    all_tokens = [(v, round(l.y1, 1), round(x, 1)) for l in lines for v, x in tokens_of(l)]
    unclaimed = [t for t in all_tokens if t not in claimed]
    return found, unclaimed


def fetch(dest: Path) -> tuple[Path, Path]:
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    for url, fn in ((EW_URL, "cafe-menu-ew.pdf"), (SCOT_URL, "cafe-menu-scot.pdf")):
        p = dest / fn
        if not p.exists():
            proc = subprocess.run(["curl", "-sS", "--fail", "-L", "-A", UA, "-o", str(p), url])
            time.sleep(1.2)
            if proc.returncode != 0:
                raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}): stop, do not work round it")
        out.append(p)
    return out[0], out[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-ew", type=Path)
    ap.add_argument("--pdf-scot", type=Path)
    ap.add_argument("--fetch", type=Path, help="download both posters into this folder (one request each) and read them")
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        args.pdf_ew, args.pdf_scot = fetch(args.fetch)
    if not (args.pdf_ew and args.pdf_scot):
        ap.error("give --pdf-ew and --pdf-scot, or --fetch DIR")
    sha = hashlib.sha256(args.pdf_ew.read_bytes()).hexdigest()
    ew, unclaimed = read_menu(args.pdf_ew, strict=True)
    if unclaimed:
        raise SystemExit(f"E&W tokens not claimed by any dish (the menu changed?): {unclaimed}")
    scot, scot_unclaimed = read_menu(args.pdf_scot, strict=False)
    differ = {n: (ew[n], scot[n]) for n in ew if n in scot and ew[n] != scot[n]}
    items, left_out = [], []
    for name, cat, _a, _m, _after, rank in DISHES:
        if name in differ:
            left_out.append(f"{name}: E&W {differ[name][0]} kcal, Scotland {differ[name][1]} kcal")
            continue
        veg = bool(VEGETARIAN.search(name.replace("butter or vegan spread", "")))  # "with butter or vegan spread" is a choice, not a mark
        tags, _ = tk.meat_tags(name, vegetarian=veg)
        if veg:
            tags = ["vegetarian"]
        items.append({"name": name, "category": cat, "calories": ew[name], "protein_g": "", "carbs_g": "", "fat_g": "",
                      "tags": "|".join(tags), "rankable": rank,
                      "notes": "On the England & Wales menu" + (" and the Scottish menu with the same calories" if name in scot else
                                                                "; not on the Scottish menu")})
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Morrisons Café", cuisine="Cafe",
        source_title="Morrisons Café menu with calories, England & Wales (Cafe Reset Menu E&W, file dated 5-5-26, PDF created 17 April 2026), "
                     "compared with the Scottish menu of the same date",
        source_url=EW_URL, checked_on=args.checked_on,
        aliases=["morrisons cafe", "morrisons café", "morrisons", "morrisons restaurant"],
        items=items, out=args.out, note=NOTE, nutrition_level="calories",
        allergen_guide={"title": "Morrisons TS01K Cafe Allergen Information Guide (V49, 28/09/2026)", "url": ALLERGEN_URL,
                        "checked_on": args.checked_on, "may_contain_published": False},
    )
    print(f"E&W poster sha256 {sha}")
    print(f"E&W dishes {len(ew)}; Scottish menu: {len(scot)} of them found, {len(scot_unclaimed)} Scottish-only tokens (not published)")
    print("left out (E&W and Scotland differ):", left_out)
    print(f"wrote {len(items)} items to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
