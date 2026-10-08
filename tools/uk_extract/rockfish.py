#!/usr/bin/env python3
"""Build data/source/rockfish/ from Rockfish's two official "Allergens, Gluten Free and Calories" menus (a CALORIES-ONLY chain).

    python3 tools/uk_extract/rockfish.py eat-in.pdf takeaway.pdf --checked-on 2026-10-08 [--out DIR] [--table]

Source: https://therockfish.co.uk/pages/allergens-menus ("Restaurant Allergens Menu" and "Takeaway Allergens Menu"), two PDFs on Shopify's CDN:
    https://cdn.shopify.com/s/files/1/0421/8263/9770/files/2026-06-30-Allergens-Menu-A4.pdf?v=1782897149        (2 pages, prints "2026.07")
    https://cdn.shopify.com/s/files/1/0421/8263/9770/files/2026-06-30-Takeaway-Allergens-no-pp-A4.pdf?v=1782918337  (1 page, prints "2026.06")
Both were created 30 June 2026 (InDesign). robots.txt of therockfish.co.uk allows /pages/; the CDN's allows /s/files/. Needs `pdftotext`.

CALORIES ONLY: every dish prints "NNN Kcal" and nothing else per dish (no protein, carbs, fat, salt...), so those stay blank
(docs/DATA.md "Calories-only chains"). The only extra column is weight_g for the sauces and butters whose name carries a weight ("35g").
Kcal and weights are read from the PDF's text; names, categories and tags are written by hand below: the script stops if a dish's
heading line is not where the table below says, or a block has not exactly the calorie values expected.

Allergens ARE published (complete), read from the guide's own marks (see rockfish_pdf.py): a blue icon after an ingredient = contains,
an orange icon = may contain (the guide's key "Contains = Blue ~ May Contain = Orange"). A dish's marks are all the icons between its
heading and the next dish's heading, which is how the guide prints them (one mark per ingredient). Named cereals and tree nuts in
brackets, e.g. "(wheat, oat)", are copied when they follow a BLUE gluten / nuts mark. Nothing is matched by name or guessed.

What is not published, and why:
  * Mitch's Seasonal Selection (market fish, whole crab, lobster ...) and Drinks (beers, ciders, wine, soft drinks): no calories printed.
  * The Children's Meals intro prints one calorie value for "vanilla or chocolate gelato" (135 Kcal), included as one item.
  * "6 oysters 90": the PDF prints the number without the unit (the "Kcal" of the line is printed once, after 45); the guide is a
    calories menu and 90 is twice 45, read as kcal and noted on the item.
Eat-in versus takeaway: the takeaway menu has its own portions. Where the two PDFs print the same dish (Chips, mushy peas, curried
mushy peas, curry sauce, tartare sauce) the pair is compared: identical calories and marks = one item (eat-in); any difference = both held
back (holdback.csv), never chosen between. Sauces whose printed weight makes their calories impossible (more than 9 kcal per g, pure fat
is 9) are held back too.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rockfish_pdf as R  # noqa: E402
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "rockfish"
SOURCE_URL = "https://therockfish.co.uk/pages/allergens-menus"
SOURCE_TITLE = ("Rockfish Allergens, Gluten Free and Calories Menu: restaurants (2026.07) and takeaway (2026.06), both PDFs created 30 June 2026")
ALIASES = ["rockfish", "the rockfish", "rockfish seafood and chips", "rockfish seafood & chips"]
ALLERGEN_GUIDE_TITLE = "Rockfish Allergens, Gluten Free and Calories Menus (restaurant 2026.07, takeaway 2026.06)"
ALLERGEN_GUIDE_URL = SOURCE_URL
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only: protein, carbs and fat are not published. Mitch's Seasonal Selection (market fish, crab, lobster) and drinks print no "
        "calories, so they are not listed. Takeaway dishes use takeaway portions; where the two menus disagree a dish is left out. "
        "Allergen marks are for dishes as normally prepared (most can be made gluten free on request).")
KEY = {"Celery": "celery", "Crustacean": "crustaceans", "Egg": "eggs", "Fish": "fish", "Gluten": "gluten", "Milk": "milk", "Molluscs": "molluscs",
       "Mustard": "mustard", "Nuts": "nuts", "Peanuts": "peanuts", "Sesame": "sesame", "Soya": "soya", "Sulphites": "sulphites", "Lupin": "lupin"}
EXTRA_WORDS = {"brazil": ("nuts", "brazil nut")}     # the guide's own list "almonds, hazelnut, walnuts, cashews, pecan, brazil, pistachio, macadamia"
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
KCAL = re.compile(r"(\d+)\s*[Kk]cal")


def S(cat, name, start, **kw):
    return dict(cat=cat, name=name, start=start, **kw)


BREAD, STA, MAIN, KIDS, DES, SIDES = "Bread", "Starters", "Main Courses", "Children’s Meals", "Desserts", "Sides and Sauces"
T_FISH, T_KIDS, T_SIDES = "Takeaway: Fish and Chips", "Takeaway: Children’s Menu", "Takeaway: Sides and Sauces"
RC = "Crystal bread roll (wheat)"
# One strip = a column of the page: (page index, x range, y range in page points, dishes top to bottom). A dish's `start` is the
# beginning of its heading line as printed; `weighed` = its heading prints a weight ("35g"); `variants` = one heading, several kcal values.
EATIN = [
    dict(page=0, x=(30, 310), y=(285, 859), items=[
        S(BREAD, "Crystal bread roll and anchovy mayonnaise", RC), S(BREAD, "Crystal bread roll with salted butter", RC),
        S(BREAD, "Crystal bread roll with hot garlic butter", RC), S(BREAD, "Crystal bread roll with sardine butter", RC),
        S(STA, "Leigh-on-Sea cockles", "Leigh-on-Sea cockles"),
        S(STA, "Roasted South Coast scallops with parmesan and garlic", "Roasted South Coast scallops"),
        S(STA, "Spider crab croquettes", "Spider crab croquettes"), S(STA, "Chargrilled Mount’s Bay sardines", "Chargrilled Mount’s Bay sardines"),
        S(STA, "Half pint of shell-on Norwegian prawns", "Half pint of shell-on"),
        S(STA, "Crip-fried salt and pepper wild prawns and Brixham ‘calamari’", "Crip-fried salt and pepper"),
        S(STA, "Firecracker prawn cocktail", "Firecracker prawn cocktail"), S(STA, "Crisp-fried Plymouth anchovies", "Crisp-fried Plymouth anchovies"),
        S(STA, "Smoked Shetland Isles mackerel fillet", "Smoked Shetland Isles"), S(STA, "Crisp-fried tempura vegetables", "Crisp-fried tempura"),
        S(STA, "Brownsea Island oysters", "Brownsea Island oysters",
          variants=[("3 oysters", "Brownsea Island oysters (3 oysters)", r"3 oysters (\d+) Kcal"),
                    ("6 oysters", "Brownsea Island oysters (6 oysters)", r"6 oysters (\d+)(?!\d)")],
          note6="'6 oysters 90' is printed without the unit; read as kcal (twice the 3-oyster 45 Kcal)")]),
    dict(page=0, x=(310, 600), y=(335, 859), items=[
        S(MAIN, "Crisp-fried prime Brixham hake fillet", "Crisp-fried prime Brixham hake"),
        S(MAIN, "Line-caught Icelandic haddock fillet", "Line-caught Icelandic haddock"),
        S(MAIN, "Chargrilled sea bream with Greek island salad", "Chargrilled sea bream with"), S(MAIN, "Fritto misto", "Fritto misto"),
        S(MAIN, "Rockfish wild prawn burger", "Rockfish wild prawn burger"),
        S(MAIN, "Chargrilled Cumbrian chicken leg with sweetcorn, lime and coriander", "Chargrilled Cumbrian chicken leg"),
        S(MAIN, "Baja style wild prawn tacos", "Baja style wild prawn tacos"), S(MAIN, "Baja style halloumi taco", "Baja style halloumi taco"),
        S(MAIN, "“The Quayside Grill” for two", "“The Quayside Grill”", serving="for two")]),
    dict(page=1, x=(310, 600), y=(40, 622), intro_icons_ok=True, items=[
        S(KIDS, "Children’s meals gelato (vanilla or chocolate)", "cucumber.", start_word="vanilla",
          note="Printed in the Children's Meals intro: 'Children's meals include vanilla or chocolate gelato 135 Kcal'; one value for both flavours"),
        S(KIDS, "Crisp-fried market fish bites", "Crisp-fried market fish bites"), S(KIDS, "Grilled market fish", "Grilled market fish"),
        S(KIDS, "Fried chicken", "Fried chicken"), S(KIDS, "Halloumi fried", "Halloumi fried"), S(KIDS, "Crisp wild prawn fried", "Crisp wild prawn fried"),
        S(DES, "Madagascan vanilla gelato", "Madagascan vanilla"), S(DES, "Salted caramel gelato", "Salted caramel"),
        S(DES, "Double chocolate gelato", "Double chocolate"), S(DES, "Mint choc chip gelato", "Mint choc chip"), S(DES, "Lemon sorbet", "Lemon sorbet"),
        S(DES, "Willie’s Rio Caribe chocolate pot", "Willie’s Rio Caribe"), S(DES, "Sticky toffee pudding and clotted cream", "Sticky toffee pudding"),
        S(DES, "Crème brûlée", "Crème brûlée"), S(DES, "Summer berry sundae with clotted cream", "Summer berry sundae"),
        S(DES, "Affogatto", "Affogatto"), S(DES, "Fisherman’s coffee", "Fisherman’s coffee"), S(DES, "Chocolate bon bons", "Chocolate bon bons")]),
]
SIDE_Y = (645, 859)
SIDE_COLUMNS = [
    (30, 140, [S(SIDES, "Chips", "Chips"), S(SIDES, "Gluten free bread", "Gluten free bread"), S(SIDES, "Cornish new potatoes", "Cornish new potatoes"),
               S(SIDES, "House salad with dressing", "House salad"), S(SIDES, "Coleslaw", "Coleslaw"), S(SIDES, "Sauteed spinach", "Sauteed spinach"),
               S(SIDES, "Yorkshire garden peas", "Yorkshire garden")]),
    (140, 250, [S(SIDES, "Mushy peas", "Mushy peas"), S(SIDES, "Curried mushy peas", "Curried mushy peas"),
                S(SIDES, "Mr Sandhu’s curry sauce", "Mr sandhu’s curry"), S(SIDES, "Garlic aioli", "Garlic aioli", weighed=True),
                S(SIDES, "Jalapeño tartare", "Jalapeño tartare", weighed=True), S(SIDES, "Vegan mayonnaise", "Vegan mayonnaise", weighed=True),
                S(SIDES, "Tomato sauce", "Tomato sauce", weighed=True)]),
    (250, 360, [S(SIDES, "Oyster drizzle", "Oyster drizzle"), S(SIDES, "Garlic butter", "Garlic butter", weighed=True),
                S(SIDES, "Kedgeree butter", "Kedgeree butter", weighed=True), S(SIDES, "Tartare sauce", "Tartare sauce", weighed=True),
                S(SIDES, "Olive oil and lemon", "Olive oil and lemon"), S(SIDES, "Bearnaise butter", "Bearnaise butter", weighed=True),
                S(SIDES, "Romesco sauce", "Romesco sauce", weighed=True)]),
    (360, 472, [S(SIDES, "Dill butter", "Dill butter", weighed=True), S(SIDES, "Caper parsley butter", "Caper parsley butter", weighed=True),
                S(SIDES, "Anchoiade", "Anchoiade", weighed=True), S(SIDES, "Noisette butter", "Noisette butter", weighed=True),
                S(SIDES, "Hollandaise", "Hollandaise", weighed=True)]),
    (472, 600, [S(SIDES, "Greek salad", "Greek salad"), S(SIDES, "Asparagus", "Asparagus"), S(SIDES, "Cafe de Paris butter", "Cafe de paris butter"),
                S(SIDES, "Green olives from Seville", "Green olives from"), S(SIDES, "Sweet chilli peppers", "Sweet chilli peppers")]),
]
for x0, x1, specs in SIDE_COLUMNS:
    EATIN.append(dict(page=1, x=(x0, x1), y=SIDE_Y, items=specs))

TAKEAWAY = [
    dict(page=0, x=(30, 450), y=(170, 525), items=[
        S(T_FISH, "Line-caught haddock and chips", "Line-caught haddock and chips"), S(T_FISH, "Rockfish fillets and chips", "Rockfish fillets and chips"),
        S(T_FISH, "Brixham hake and chips", "Brixham hake and chips"), S(T_FISH, "The Rock dog and chips", "The Rock dog and chips"),
        S(T_FISH, "Local pork sausages and chips", "Local pork sausages and chips"),
        S(T_FISH, "Halloumi, sriracha mayonnaise and chips", "Halloumi, sriracha mayonnaise and chips"),
        S(T_KIDS, "Brixham fish bites and chips", "Brixham fish bites and chips"), S(T_KIDS, "Sausage and chips", "Sausage and chips"),
        S(T_KIDS, "Halloumi and chips", "Halloumi and chips")]),
    dict(page=0, x=(30, 235), y=(550, 625), items=[
        S(T_SIDES, "Chips (takeaway)", "Chips", same_as="Chips"), S(T_SIDES, "Curry sauce (takeaway)", "Curry sauce", same_as="Mr Sandhu’s curry sauce"),
        S(T_SIDES, "Mushy peas (takeaway)", "Mushy peas", same_as="Mushy peas")]),
    dict(page=0, x=(235, 450), y=(550, 625), items=[
        S(T_SIDES, "Curried mushy peas (takeaway)", "Curried mushy peas", same_as="Curried mushy peas"),
        S(T_SIDES, "Fresh tartare sauce (takeaway)", "Fresh tartare sauce", same_as="Tartare sauce")]),
]
# A dish whose own name says an allergen the guide does not mark for it: held back rather than published as printed (never corrected).
HOLD_NAME_CONFLICT = {
    "Halloumi, sriracha mayonnaise and chips": "the name says mayonnaise but the guide marks no egg for the dish (the same guide calls its egg-free "
                                               "one 'Vegan mayonnaise'): not published until Rockfish confirms the egg marks",
    "Oyster drizzle": "allergen row contradicts the dish name: the name says oyster but the guide marks no molluscs for it (the guide does not say whether "
                      "it is made with oyster): not published until Rockfish confirms the molluscs mark",
}
EXPECTED_EATIN, EXPECTED_TAKEAWAY = 74, 14      # dishes read from each PDF (the restaurant count has both oyster sizes)


def key_text_ok(page: dict) -> bool:
    text = " ".join(w["text"] for w in page["words"])
    return "Contains = Blue" in text and "Contain = Orange" in text


def block_marks(seq: list, mapping: dict, where: str) -> dict:
    contains, may = set(), set()
    for kind, obj in seq:
        if kind != "icon":
            continue
        name = obj["allergen"]
        (contains if obj["colour"] == "contains" else may).add(KEY[name])
    cereals, nuts = set(), set()
    for text, icon in R.paren_groups(seq):
        words = [w for w in re.split(r",| and ", text.strip("()")) if w.strip()]
        keys, cer, nu = allergen_words(words, f"{where} {text}", extra=EXTRA_WORDS)
        if icon is None:
            raise SystemExit(f"{where}: bracket {text} has no mark before it")
        name = icon["allergen"]
        want = "gluten" if cer else "nuts" if nu else None
        if want is None or keys != {want} or KEY.get(name) != want:
            raise SystemExit(f"{where}: bracket {text} follows a {name} mark, expected a {want or 'gluten/nuts'} mark")
        if icon["colour"] == "contains":   # only a CONTAINS mark can carry named kinds in the data model
            cereals |= cer
            nuts |= nu
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


def read_source(pages: list, strips: list, mapping: dict, label: str) -> list:
    out = []
    for strip in strips:
        page = pages[strip["page"]]
        lines, icons = R.read_strip(page, strip["x"][0], strip["x"][1], strip["y"][0], strip["y"][1])
        specs = strip["items"]
        at = R.find_anchors(lines, [s["start"] for s in specs])
        tops = [lines[a]["top"] - 1.0 for a in at] + [strip["y"][1]]
        taken = set()
        for k, spec in enumerate(specs):
            where = f"{label} page {strip['page'] + 1} '{spec['name']}'"
            block_lines = lines[at[k]:(at[k + 1] if k + 1 < len(specs) else len(lines))]
            words = [w for ln in block_lines for w in ln["words"]]
            blk = [ic for ic in icons if tops[k] <= ic["cy"] < tops[k + 1]]
            if spec.get("start_word"):
                sw = next(w for w in lines[at[k]]["words"] if w["text"] == spec["start_word"])
                lcy = lines[at[k]]["cy"]
                words = [w for w in words if w["cy"] > lcy + R.LINE_GAP or (abs(w["cy"] - lcy) <= R.LINE_GAP and w["cx"] >= sw["cx"])]
                blk = [ic for ic in blk if ic["cy"] > lcy + R.LINE_GAP or (abs(ic["cy"] - lcy) <= R.LINE_GAP and ic["cx"] >= sw["x1"])]
            taken |= {id(ic) for ic in blk}
            text = " ".join(w["text"] for w in words)
            seq = R.reading_order(lines, blk, words)
            marks = block_marks(seq, mapping, where)
            kcal = KCAL.findall(text)
            entries = []
            if spec.get("variants"):
                for serving, name, rx in spec["variants"]:
                    m = re.findall(rx, text)
                    if len(m) != 1:
                        raise SystemExit(f"{where}: {serving}: expected one calorie value, found {m}")
                    entries.append(dict(name=name, serving=serving, calories=m[0], note=(spec.get("note6") if serving == "6 oysters" else "")))
            else:
                if len(kcal) != 1:
                    raise SystemExit(f"{where}: expected exactly one calorie value in {text!r}, found {kcal}")
                entries.append(dict(name=spec["name"], serving=spec.get("serving", ""), calories=kcal[0], note=spec.get("note", "")))
            weight = ""
            if spec.get("weighed"):
                w = re.findall(r"(?<![\d.])(\d+)\s?g\b", text)
                if len(w) != 1:
                    raise SystemExit(f"{where}: expected one printed weight like '35g', found {w}")
                weight = w[0]
            tags = [t for t, rx in (("contains_pork", PORK), ("contains_beef", BEEF)) if rx.search(text)]
            for e in entries:
                e.update(category=spec["cat"], weight_g=weight, serving=(f"{weight} g" if weight else e["serving"]), tags=tags, allergens=marks,
                         same_as=spec.get("same_as"), printed=" | ".join(ln["text"] for ln in block_lines)[:160], source=label)
                out.append(e)
        loose = [ic for ic in icons if id(ic) not in taken]
        if loose and not (strip.get("intro_icons_ok") and all(ic["cy"] < tops[0] + 40 for ic in loose)):
            raise SystemExit(f"{label} page {strip['page'] + 1}: {len(loose)} icon parts belong to no dish, first at x={loose[0]['x0']:.0f} y={loose[0]['y0']:.0f}")
    return out


def pair_check(eat: list, take: list):
    """Compare takeaway dishes that are the same dish as an eat-in one. Returns (items to publish, holdback rows)."""
    by_name = {e["name"]: e for e in eat}
    keep_take, holdback = [], []
    for t in take:
        if not t["same_as"]:
            keep_take.append(t)
            continue
        e = by_name[t["same_as"]]
        diffs = []
        if e["calories"] != t["calories"]:
            diffs.append(f"calories {e['calories']} (restaurant) vs {t['calories']} (takeaway)")
        for key in ("contains", "may_contain"):
            if e["allergens"][key] != t["allergens"][key]:
                diffs.append(f"{key} marks differ")
        if diffs:
            reason = f"The restaurant and takeaway menus print this dish differently ({'; '.join(diffs)}): neither is published until Rockfish says which applies"
            holdback += [(slug(e["name"]), reason), (slug(t["name"]), reason)]
            keep_take.append(t)
        # identical calories and marks: the takeaway row is the same dish, so only the restaurant row is published
    return keep_take, holdback


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("eatin_pdf", type=Path)
    ap.add_argument("takeaway_pdf", type=Path)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--table", action="store_true", help="print every dish with its calories and marks")
    args = ap.parse_args()
    print(f"eat-in PDF sha256 {sha256_file(args.eatin_pdf)}  {args.eatin_pdf}")
    print(f"takeaway PDF sha256 {sha256_file(args.takeaway_pdf)}  {args.takeaway_pdf}")
    book = R.ShapeBook()
    take_pages = R.read_pdf(args.takeaway_pdf, book)
    eat_pages = R.read_pdf(args.eatin_pdf, book)
    if len(take_pages) != 1 or len(eat_pages) != 2:
        raise SystemExit(f"page counts changed: takeaway {len(take_pages)} (expected 1), restaurant {len(eat_pages)} (expected 2)")
    if not key_text_ok(take_pages[0]) or not key_text_ok(eat_pages[0]):
        raise SystemExit("the 'Contains = Blue / May Contain = Orange' key is not printed as expected: re-read the guides' colour key")
    mapping = R.legend_classes(take_pages[0])
    for pg in take_pages + eat_pages:
        R.build_marks(pg, mapping)
    eat = read_source(eat_pages, EATIN, mapping, "restaurant")
    take = read_source(take_pages, TAKEAWAY, mapping, "takeaway")
    if (len(eat), len(take)) != (EXPECTED_EATIN, EXPECTED_TAKEAWAY):
        raise SystemExit(f"dish counts changed: restaurant {len(eat)} (expected {EXPECTED_EATIN}), takeaway {len(take)} (expected {EXPECTED_TAKEAWAY})")
    take, holdback = pair_check(eat, take)
    # a printed weight that cannot hold the printed calories (fat is 9 kcal per g, so more than 9 is impossible)
    for e in eat + take:
        if e["weight_g"] and int(e["calories"]) / int(e["weight_g"]) > 9.0:
            holdback.append((slug(e["name"]), f"{e['calories']} kcal in a printed {e['weight_g']} g is {int(e['calories']) / int(e['weight_g']):.1f} kcal per g: "
                             "more than pure fat (9), so the guide's own figures cannot both be right"))
    for e in eat + take:
        if e["name"] in HOLD_NAME_CONFLICT:
            holdback.append((slug(e["name"]), HOLD_NAME_CONFLICT[e["name"]]))
    reasons = {}
    for item_id, reason in holdback:
        reasons.setdefault(item_id, []).append(reason)
    holdback = [(i, "; and ".join(r)) for i, r in sorted(reasons.items())]
    items = []
    for e in eat + take:
        if e["name"].startswith("Children’s meals gelato"):
            continue
        items.append(e)
    kids_gelato = [e for e in eat if e["name"].startswith("Children’s meals gelato")]
    last_kid = max(i for i, e in enumerate(items) if e["category"] == KIDS)
    items[last_kid + 1:last_kid + 1] = kids_gelato
    rows = []
    for e in items:
        extra = f"; {e['note']}" if e["note"] else ""
        rows.append(dict(name=e["name"], category=e["category"], serving=e["serving"], calories=e["calories"], weight_g=e["weight_g"],
                         tags="|".join(e["tags"]), rankable=False, allergens=e["allergens"], notes=f"{e['source']} menu, heading as printed: {e['printed']}{extra}"))
    if args.table:
        for r in rows:
            a = r["allergens"]
            print(f"{r['category'][:14]:14} {r['name'][:46]:46} {r['calories']:>5} {r['weight_g']:>3} C={sorted(a['contains'])} M={sorted(a['may_contain'])} "
                  f"cer={sorted(a['cereals'])} nuts={sorted(a['nuts'])} {r['tags']}")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Rockfish", cuisine="Seafood", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=rows, out=args.out, note=NOTE, allergen_guide=guide,
                             holdback=holdback, nutrition_level="calories")
    print(f"wrote {len(rows)} items ({len(holdback)} of them held back, so {len(rows) - len(holdback)} published) to {out}")


if __name__ == "__main__":
    main()
