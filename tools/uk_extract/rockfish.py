#!/usr/bin/env python3
"""Build data/source/rockfish/ from Rockfish's official "Allergens, Gluten Free and Calories" restaurant menu (a CALORIES-ONLY chain).

    python3 tools/uk_extract/rockfish.py restaurant.pdf --legend-pdf takeaway-june-2026.pdf --checked-on 2026-11-17 [--out DIR] [--table]

Source: https://therockfish.co.uk/pages/allergens-menus, button "Restaurant Allergens Menu", a PDF on Shopify's CDN:
    https://cdn.shopify.com/s/files/1/0421/8263/9770/files/2026-11-03-Allergens-Menu-A4.pdf   (2 pages, prints "2026.11", created 3 November 2026,
    SHA-256 e7d697395fae2402bb4a8b17ba360e31c52c8558a952a3fc88c97d51cbaea227 when this script was written; a different file only prints a notice,
    the dish anchors and counts below stop the run if the menu itself changed)
robots.txt of therockfish.co.uk allows /pages/; the CDN's allows /s/files/. Needs `pdftotext`.

TAKEAWAY (read 2026-11-17): the page's "Takeaway Allergens Menu" button now opens 2026-11-02-Allergens-Menu-A4.pdf, which is NOT a takeaway menu: it is
an earlier copy of the same 2026.11 restaurant menu (2 pages, the same 78 calorie figures after the same words, checked). The June 2026 takeaway
menu (2026-06-30-Takeaway-Allergens-no-pp-A4.pdf, still on the CDN) is no longer linked, so takeaway portions are not published (as for any menu
a chain no longer links; the site's per-town /pages/takeaway-menu/ pages print prices, not calories, per images_rockfish.py). That June file is still
read, with --legend-pdf, ONLY for its icon legend (see below): no number, name or mark comes from it.

CALORIES ONLY: every dish prints "NNN Kcal" and nothing else per dish (no protein, carbs, fat, salt...), so those stay blank
(docs/DATA.md "Calories-only chains"). The only extra column is weight_g for the sauces and butters whose name carries a weight ("35g").
Kcal and weights are read from the PDF's text; names, categories and tags are written by hand below: the script stops if a dish's
heading line is not where the table below says, or a block has not exactly the calorie values expected.

Allergens ARE published (complete), read from the guide's own marks (see rockfish_pdf.py): a blue icon after an ingredient = contains,
an orange icon = may contain (the guide's key "Contains = Blue ~ May Contain = Orange"). A dish's marks are all the icons between its
heading and the next dish's heading, which is how the guide prints them (one mark per ingredient). Named cereals and tree nuts in
brackets, e.g. "(wheat, oat)", are copied when they follow a BLUE gluten / nuts mark. Nothing is matched by name or guessed.
The icon legend: the restaurant PDF's legend labels are outlines, not text, so each icon shape is named from the June 2026 takeaway PDF, whose
legend prints the 14 allergen names as text (--legend-pdf; its SHA-256 is checked). As a check, the restaurant PDF's own legend icons, named that
way, must read Celery, Crustacean, Egg, Fish, Gluten | Milk, Molluscs, Mustard, Nuts, Peanuts | Sesame, Soya, Sulphites, Lupin, column by column,
which is the order the guides print; any other order stops the run.

What is not published, and why:
  * Mitch's Seasonal Selection (market fish, crab, lobster ...) and Drinks (beers, ciders, wine, soft drinks): no calories printed.
  * The Children's Meals intro prints one calorie value for "vanilla or chocolate gelato" (135 Kcal), included as one item.
Sauces whose printed weight makes their calories impossible (more than 9 kcal per g, pure fat is 9) are held back (holdback.csv), never corrected.
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
SOURCE_TITLE = "Rockfish Allergens, Gluten Free and Calories Menu: restaurants (2026.11, PDF created 3 November 2026)"
ALIASES = ["rockfish", "the rockfish", "rockfish seafood and chips", "rockfish seafood & chips"]
ALLERGEN_GUIDE_TITLE = "Rockfish Allergens, Gluten Free and Calories Menu (restaurants, 2026.11)"
ALLERGEN_GUIDE_URL = SOURCE_URL
MAY_CONTAIN_PUBLISHED = True
RESTAURANT_SHA = "e7d697395fae2402bb4a8b17ba360e31c52c8558a952a3fc88c97d51cbaea227"
LEGEND_SHA = "ce2af55e1df4c6f83451200a4a87270bf78712ee5bf23bd862a62339515c4de3"   # 2026-06-30-Takeaway-Allergens-no-pp-A4.pdf (legend only)
NOTE = ("Calories only: protein, carbs and fat are not published. Restaurant dishes only: Rockfish's takeaway allergen link currently opens "
        "the restaurant menu, so takeaway portions are not listed. Mitch's Seasonal Selection (market fish, crab, lobster) and drinks print no calories, so they are not listed. "
        "Allergen marks are for dishes as normally prepared (most can be made gluten free on request).")
KEY = {"Celery": "celery", "Crustacean": "crustaceans", "Egg": "eggs", "Fish": "fish", "Gluten": "gluten", "Milk": "milk", "Molluscs": "molluscs",
       "Mustard": "mustard", "Nuts": "nuts", "Peanuts": "peanuts", "Sesame": "sesame", "Soya": "soya", "Sulphites": "sulphites", "Lupin": "lupin"}
EXTRA_WORDS = {"brazil": ("nuts", "brazil nut")}     # the guide's own list "almonds, hazelnut, walnuts, cashews, pecan, brazil, pistachio, macadamia"
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
KCAL = re.compile(r"(\d+)\s*[Kk]cal")
# The restaurant PDF's own legend (page 1, top right): three columns of icons, top to bottom.
LEGEND_BOX = (300, 600, 20, 115)   # x0, x1, y0, y1 in page points (y down)
LEGEND_COLUMNS = [["Celery", "Crustacean", "Egg", "Fish", "Gluten"], ["Milk", "Molluscs", "Mustard", "Nuts", "Peanuts"],
                  ["Sesame", "Soya", "Sulphites", "Lupin"]]


def S(cat, name, start, **kw):
    return dict(cat=cat, name=name, start=start, **kw)


BREAD, STA, MAIN, KIDS, DES, SIDES = "Bread", "Starters", "Main Courses", "Children’s Meals", "Desserts", "Sides and Sauces"
RC = "Crystal bread roll (wheat)"
# One strip = a column of the page: (page index, x range, y range in page points, dishes top to bottom). A dish's `start` is the
# beginning of its heading line as printed; `weighed` = its heading prints a weight ("35g"); `variants` = one heading, several kcal values.
EATIN = [
    dict(page=0, x=(30, 310), y=(300, 859), items=[
        S(BREAD, "Crystal bread roll and anchovy mayonnaise", RC), S(BREAD, "Crystal bread roll with salted butter", RC),
        S(BREAD, "Crystal bread roll with hot garlic butter", RC), S(BREAD, "Crystal bread roll with sardine butter", RC),
        S(STA, "Leigh-on-Sea cockles", "Leigh-on-Sea cockles"),
        S(STA, "Roasted South Coast scallops with parmesan and garlic", "Roasted South Coast scallops"),
        S(STA, "Wild red prawn pil pil", "Wild red prawn pil pil"),
        S(STA, "Half pint of shell-on Norwegian prawns", "Half pint of shell on"),
        S(STA, "Crisp-fried salt and pepper Brixham ‘calamari’", "Crip fried salt and pepper"),
        S(STA, "Basque style baked crab", "Basque style baked crab"),
        S(STA, "Scandinavian pickled herring and potato salad", "Scandinavian pickled herring"),
        S(STA, "Firecracker prawn cocktail", "Firecracker prawn cocktail"),
        S(STA, "Crisp-fried Korean style squash", "Crisp fried Korean style squash"),
        S(STA, "New England smoked haddock and bacon chowder", "New England smoked haddock"),
        S(STA, "Brownsea Island oysters", "Brownsea Island oysters",
          variants=[("3 oysters", "Brownsea Island oysters (3 oysters)", r"3 oysters (\d+) Kcal"),
                    ("6 oysters", "Brownsea Island oysters (6 oysters)", r"6 oysters (\d+) Kcal")]),
        S(STA, "Oak smoked chalk stream trout", "Oak smoked chalk stream trout")]),
    dict(page=0, x=(310, 600), y=(305, 859), items=[
        S(MAIN, "Crisp-fried prime Brixham hake fillet", "Crisp fried prime Brixham hake"),
        S(MAIN, "Line-caught Icelandic haddock fillet", "Line caught Icelandic haddock"),
        S(MAIN, "Chargrilled sea bream with Greek island salad", "Chargrilled sea bream with"), S(MAIN, "Fritto misto", "Fritto misto"),
        S(MAIN, "Rockfish wild prawn burger", "Rockfish wild prawn burger"),
        S(MAIN, "Portuguese Prego steak roll", "Portuguese Prego steak roll"),
        S(MAIN, "Baja style wild prawn tacos", "Baja style wild prawn tacos"), S(MAIN, "Baja style halloumi taco", "Baja style halloumi taco"),
        S(MAIN, "“The Quayside Grill” for two", "“The Quayside Grill”", serving="for two"),
        S(MAIN, "Greek style baked aubergine with oregano and feta", "Greek style baked aubergine"),
        S(MAIN, "Ling cooked à la plancha with peperonata", "Ling cooked à la plancha"),
        S(MAIN, "Traditional fried whiting", "Traditional fried whiting"),
        S(MAIN, "Mixed chargrilled seafood with garlic butter", "Mixed chargrilled seafood")]),
    dict(page=1, x=(310, 600), y=(40, 585), intro_icons_ok=True, items=[
        S(KIDS, "Children’s meals gelato (vanilla or chocolate)", "Children’s meals include", start_word="vanilla",
          note="Printed in the Children's Meals intro: 'Children's meals include vanilla or chocolate gelato 135 Kcal'; one value for both flavours"),
        S(KIDS, "Crisp-fried market fish bites", "Crisp fried market fish bites"), S(KIDS, "Grilled market fish", "Grilled market fish"),
        S(KIDS, "Fried chicken", "Fried chicken"), S(KIDS, "Halloumi fried", "Halloumi fried"), S(KIDS, "Crisp wild prawn fried", "Crisp wild prawn fried"),
        S(DES, "Madagascan vanilla gelato", "Madagascan vanilla"), S(DES, "Salted caramel gelato", "Salted caramel"),
        S(DES, "Double chocolate gelato", "Double chocolate"), S(DES, "Mint choc chip gelato", "Mint choc chip"), S(DES, "Lemon sorbet", "Lemon sorbet"),
        S(DES, "Willie’s Rio Caribe chocolate pot", "Willie’s Rio Caribe"), S(DES, "Sticky toffee pudding and clotted cream", "Sticky toffee pudding"),
        S(DES, "Crème brûlée", "Crème brûlée"), S(DES, "Apple and caramel tart", "Apple and caramel tart"),
        S(DES, "Affogato", "Affogato"), S(DES, "Fisherman’s coffee", "Fisherman’s coffee"), S(DES, "Chocolate bon bons", "Chocolate bon bons")]),
]
SIDE_Y = (600, 859)
SIDE_COLUMNS = [
    (30, 210, [S(SIDES, "Chips", "Chips"), S(SIDES, "Gluten free bread", "Gluten free bread"),
               S(SIDES, "Creamed potatoes with garlic", "Creamed potatoes with garlic"),
               S(SIDES, "Little gem and cucumber salad with dressing", "Little gem and cucumber salad"), S(SIDES, "Caesar salad", "Caesar"),
               S(SIDES, "Sauteed spinach", "Sauteed spinach"), S(SIDES, "Yorkshire garden peas", "Yorkshire garden"),
               S(SIDES, "Mushy peas", "Mushy peas"), S(SIDES, "Curried mushy peas", "Curried mushy peas"),
               S(SIDES, "Mr Sandhu’s curry sauce", "Mr sandhu’s curry"), S(SIDES, "Garlic aioli", "Garlic aioli", weighed=True)]),
    (210, 400, [S(SIDES, "Jalapeño tartare", "Jalapeño tartare", weighed=True), S(SIDES, "Vegan mayonnaise", "Vegan mayonnaise", weighed=True),
                S(SIDES, "Tomato sauce", "Tomato sauce", weighed=True), S(SIDES, "Oyster drizzle", "Oyster drizzle"),
                S(SIDES, "Garlic butter", "Garlic butter", weighed=True), S(SIDES, "Curry butter", "Curry butter", weighed=True),
                S(SIDES, "Tartare sauce", "Tartare sauce", weighed=True), S(SIDES, "Olive oil and lemon", "Olive oil and lemon"),
                S(SIDES, "Bearnaise butter", "Bearnaise butter", weighed=True), S(SIDES, "Romesco sauce", "Romesco sauce", weighed=True),
                S(SIDES, "Dill butter", "Dill butter", weighed=True), S(SIDES, "Caper parsley butter", "Caper parsley butter", weighed=True),
                S(SIDES, "Anchoiade", "Anchoiade", weighed=True)]),
    (400, 600, [S(SIDES, "Noisette butter", "Noisette butter", weighed=True), S(SIDES, "Greek salad", "Greek salad"), S(SIDES, "Asparagus", "Asparagus"),
                S(SIDES, "Cafe de Paris butter", "Cafe de paris butter"), S(SIDES, "Green olives from Seville", "Green olives from"),
                S(SIDES, "Sweet chilli peppers", "Sweet chilli peppers")]),
]
for x0, x1, specs in SIDE_COLUMNS:
    EATIN.append(dict(page=1, x=(x0, x1), y=SIDE_Y, items=specs))

# A dish whose own name says an allergen the guide does not mark for it: held back rather than published as printed (never corrected).
HOLD_NAME_CONFLICT = {
    "Oyster drizzle": "allergen row contradicts the dish name: the name says oyster but the guide marks no molluscs for it (the guide does not say whether "
                      "it is made with oyster): not published until Rockfish confirms the molluscs mark",
}
# A bracket naming a cereal or tree nut with no allergen mark before it: the guide's ingredient text names an allergen its marks leave out,
# so the dish is held back (the bracket is not used). Any other unmarked bracket stops the run.
HOLD_UNMARKED_BRACKET = {
    "Green olives from Seville": "allergen row contradicts the dish's own ingredient text: the guide prints '(almond)' but marks no nuts for it "
                                 "(neither contains nor may contain): not published until Rockfish confirms the nuts mark",
}
EXPECTED_EATIN = 78      # dishes read from the PDF (both oyster sizes count): the PDF prints exactly 78 calorie figures


def key_text_ok(page: dict) -> bool:
    text = " ".join(w["text"] for w in page["words"])
    return "Contains = Blue" in text and "Contain = Orange" in text


def check_restaurant_legend(page: dict) -> None:
    """The restaurant PDF's own legend icons, named with the legend PDF's shapes, must be the 14 allergens in the guides' printed order."""
    x0, x1, y0, y1 = LEGEND_BOX
    marks = sorted((m for m in page["marks"] if x0 <= m["cx"] < x1 and y0 <= m["cy"] < y1), key=lambda m: m["cx"])
    if any(m["colour"] != "contains" for m in marks):
        raise SystemExit("restaurant legend: an icon that is not in the 'contains' colour")
    columns, cur = [], []
    for m in marks:
        if cur and m["cx"] - cur[-1]["cx"] > 30:
            columns.append(cur)
            cur = []
        cur.append(m)
    if cur:
        columns.append(cur)
    read = [[m["allergen"] for m in sorted(col, key=lambda m: m["cy"])] for col in columns]
    if read != LEGEND_COLUMNS:
        raise SystemExit(f"restaurant legend reads {read}, expected {LEGEND_COLUMNS}: the icon shapes no longer match the legend PDF")


def block_marks(seq: list, mapping: dict, where: str, unmarked_ok: bool = False) -> dict:
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
            if unmarked_ok:
                continue
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
            marks = block_marks(seq, mapping, where, unmarked_ok=spec["name"] in HOLD_UNMARKED_BRACKET)
            kcal = KCAL.findall(text)
            entries = []
            if spec.get("variants"):
                for serving, name, rx in spec["variants"]:
                    m = re.findall(rx, text)
                    if len(m) != 1:
                        raise SystemExit(f"{where}: {serving}: expected one calorie value, found {m}")
                    entries.append(dict(name=name, serving=serving, calories=m[0], note=""))
                if len(kcal) != len(spec["variants"]):
                    raise SystemExit(f"{where}: {len(kcal)} calorie values printed, expected {len(spec['variants'])}")
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
                         printed=" | ".join(ln["text"] for ln in block_lines)[:160], source=label)
                out.append(e)
        loose = [ic for ic in icons if id(ic) not in taken]
        if loose and not (strip.get("intro_icons_ok") and all(ic["cy"] < tops[0] + 40 for ic in loose)):
            raise SystemExit(f"{label} page {strip['page'] + 1}: {len(loose)} icon parts belong to no dish, first at x={loose[0]['x0']:.0f} y={loose[0]['y0']:.0f}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("eatin_pdf", type=Path, help="the restaurant allergens menu PDF")
    ap.add_argument("--legend-pdf", type=Path, required=True,
                    help="2026-06-30-Takeaway-Allergens-no-pp-A4.pdf, read only for its text legend (icon shape -> allergen name)")
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--table", action="store_true", help="print every dish with its calories and marks")
    args = ap.parse_args()
    digest = sha256_file(args.eatin_pdf)
    print(f"restaurant PDF sha256 {digest}  {args.eatin_pdf}" + ("" if digest == RESTAURANT_SHA else "  NOTICE: not the file this script was written against"))
    legend_digest = sha256_file(args.legend_pdf)
    print(f"legend PDF sha256 {legend_digest}  {args.legend_pdf}")
    if legend_digest != LEGEND_SHA:
        raise SystemExit("--legend-pdf is not the June 2026 takeaway PDF whose text legend this script relies on")
    book = R.ShapeBook()
    legend_pages = R.read_pdf(args.legend_pdf, book)
    eat_pages = R.read_pdf(args.eatin_pdf, book)
    if len(legend_pages) != 1 or len(eat_pages) != 2:
        raise SystemExit(f"page counts changed: legend PDF {len(legend_pages)} (expected 1), restaurant {len(eat_pages)} (expected 2)")
    if not key_text_ok(legend_pages[0]) or not key_text_ok(eat_pages[0]):
        raise SystemExit("the 'Contains = Blue / May Contain = Orange' key is not printed as expected: re-read the guides' colour key")
    mapping = R.legend_classes(legend_pages[0])
    templates = R.legend_templates(legend_pages[0])
    R.check_icon_colours(eat_pages, book, mapping)
    for pg in eat_pages:
        R.build_marks(pg, mapping, templates)
    check_restaurant_legend(eat_pages[0])
    eat = read_source(eat_pages, EATIN, mapping, "restaurant")
    printed = sum(len(KCAL.findall(" ".join(w["text"] for w in pg["words"]))) for pg in eat_pages)
    if len(eat) != EXPECTED_EATIN or printed != EXPECTED_EATIN:
        raise SystemExit(f"dish counts changed: {len(eat)} read, {printed} calorie figures printed, expected {EXPECTED_EATIN}")
    holdback = []
    # a printed weight that cannot hold the printed calories (fat is 9 kcal per g, so more than 9 is impossible)
    for e in eat:
        if e["weight_g"] and int(e["calories"]) / int(e["weight_g"]) > 9.0:
            holdback.append((slug(e["name"]), f"{e['calories']} kcal in a printed {e['weight_g']} g is {int(e['calories']) / int(e['weight_g']):.1f} kcal per g: "
                             "more than pure fat (9), so the guide's own figures cannot both be right"))
    for e in eat:
        if e["name"] in HOLD_UNMARKED_BRACKET:
            if "nuts" in e["allergens"]["contains"] | e["allergens"]["may_contain"]:
                raise SystemExit(f"{e['name']}: the guide now marks nuts: remove it from HOLD_UNMARKED_BRACKET")
            holdback.append((slug(e["name"]), HOLD_UNMARKED_BRACKET[e["name"]]))
        if e["name"] in HOLD_NAME_CONFLICT:
            if "molluscs" in e["allergens"]["contains"] | e["allergens"]["may_contain"]:
                raise SystemExit(f"{e['name']}: the guide now marks molluscs: remove it from HOLD_NAME_CONFLICT")
            holdback.append((slug(e["name"]), HOLD_NAME_CONFLICT[e["name"]]))
    reasons = {}
    for item_id, reason in holdback:
        reasons.setdefault(item_id, []).append(reason)
    holdback = [(i, "; and ".join(r)) for i, r in sorted(reasons.items())]
    items = [e for e in eat if not e["name"].startswith("Children’s meals gelato")]
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
