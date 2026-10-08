"""Read the Wild Bean Cafe (bp) "Ingredient and nutritional information" PDF, one product page at a time.

Used by tools/uk_extract/wild_bean_cafe.py. Requires `pdftotext` (poppler); runs on Python 3.9. Nothing is converted, rounded or
estimated here: numbers come back as the strings printed in the PDF.

Every product page is a PowerPoint slide with a real text layer and three blocks:

    left panel, top      the product name(s) over an allergen grid: a row "SUITABLE FOR VEGETARIANS / VEGANS" (YES / NO) and
                         14 allergen rows (Peanuts ... Lupin) whose cells hold X (no), a tick (contains, sometimes with the
                         cereals or nuts named) or "May contain"
    left panel, bottom   the nutrition table: a header per column ("Per Portion (133g)"), then kJ, kcal, Fat, saturates,
                         Carbohydrates, sugars, Protein, Salt
    right                the grey INGREDIENTS box (read only for meat words: allergens are never inferred from ingredient text)

A page holds one product, or several side by side (pizza slices, cookies, sauces), or one product with two portions (a whole
ciabatta and its half: ONE allergen column, TWO nutrition columns). Reading is by position (pdftotext -bbox), never by counting
lines: the 14 allergen labels and the 8 nutrition labels are located on the page, each value is the word at the label's height,
and each word belongs to the column whose anchor (the YES/NO cell, or the kJ value) is nearest. Anything that does not fit raises
so a new layout stops the run instead of attaching a number to the wrong product.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE = re.compile(r'<page width="[\d.]+" height="[\d.]+">(.*?)</page>', re.S)
# The 14 allergen rows in page order: (key used by docs/DATA.md, the words that can start the row's label). "Other Nuts" = tree
# nuts; the gluten row is "Cereals containing Gluten" on most pages and just "Gluten" on the sauces page.
ALLERGEN_ROWS = [("peanuts", ("Peanuts",)), ("nuts", ("Other",)), ("sesame", ("Sesame",)), ("gluten", ("Cereals", "Gluten")),
                 ("eggs", ("Egg",)), ("milk", ("Milk",)), ("soya", ("Soya",)), ("mustard", ("Mustard",)),
                 ("crustaceans", ("Crustaceans",)), ("fish", ("Fish",)), ("sulphites", ("Sulphur",)),
                 ("celery", ("Celery",)), ("molluscs", ("Molluscs",)), ("lupin", ("Lupin",))]
LABEL_VOCAB = {"Peanuts", "Other", "Nuts", "Sesame", "Cereals", "containing", "cont.", "Gluten", "Egg", "Milk", "Soya", "Mustard",
               "Crustaceans", "Fish", "Sulphur", "Dioxide", "Celery", "/", "Celeriac", "Molluscs", "Lupin"}
# nutrition rows: (field, the word that starts the label; kJ and kcal are the words in the unit column)
NUTRITION_ROWS = [("energy_kj", "kJ"), ("calories", "kcal"), ("fat_g", "Fat"), ("sat_fat_g", "saturates"),
                  ("carbs_g", "Carbohydrates"), ("sugar_g", "sugars"), ("protein_g", "Protein"), ("salt_g", "Salt")]
NUTRITION_LABEL_WORDS = {"of", "which", "saturates", "sugars", "(g)", "Fat", "Carbohydrates", "Protein", "Salt", "Energy"}
NUMBER = re.compile(r"^(?:<\s*)?\d+(?:\.\d+)?$")
DIET_CELL = {"YES", "NO", "YES*", "NO*"}


def read_pages(pdf: Path) -> dict:
    """{page number: [word dicts]} for the whole file (one pdftotext call)."""
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = {}
    for n, m in enumerate(PAGE.finditer(out), start=1):
        words = []
        for x0, y0, x1, y1, text in WORD.findall(m.group(1)):
            text = html.unescape(text).replace("​", "").strip()
            if text:
                words.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=text,
                                  xc=(float(x0) + float(x1)) / 2, yc=(float(y0) + float(y1)) / 2))
        pages[n] = words
    return pages


def reading_order(words: list) -> list:
    """Words of one cell in reading order: lines top to bottom (words within 3 pt of height are one line), then left to right."""
    lines, current = [], []
    for w in sorted(words, key=lambda w: (w["yc"], w["x0"])):
        if current and abs(w["yc"] - current[0]["yc"]) > 3:
            lines.append(current)
            current = []
        current.append(w)
    if current:
        lines.append(current)
    return [w for line in lines for w in sorted(line, key=lambda w: w["x0"])]


def _nearest(anchors: list, x: float) -> int:
    return min(range(len(anchors)), key=lambda i: abs(anchors[i] - x))


def read_product_page(words: list, page: int) -> dict:
    """One product page -> dict with
        title       the page heading words (e.g. "Breakfast (Pre-packed)")
        names       the product name per column, as printed (sticker words such as "NEW" may be mixed in)
        diet        [(vegetarian cell, vegan cell)] per column, "YES"/"NO" (a "*" is kept)
        grid        per column: [(allergen key, cell text as printed)] in the 14 rows ("" = empty cell)
        nutrition   per nutrition column: header + the 8 values as printed
        ingredients the ingredient box text (right of the panel)
        text        every word on the page
    """
    where = f"page {page}"
    ing = [w for w in words if w["text"].rstrip(":") == "INGREDIENTS" and w["x0"] > 200]
    if not ing:
        raise SystemExit(f"{where}: no INGREDIENTS heading")
    right = min(w["x0"] for w in ing) - 2
    left = [w for w in words if w["x1"] <= right + 2]
    footer = [w["yc"] for w in words if w["text"].startswith("WBC-Product")]
    footer_y = min(footer) if footer else 560.0

    # ---- allergen labels down the left edge of the panel
    peanuts = [w for w in left if w["text"] == "Peanuts"]
    if len(peanuts) != 1:
        raise SystemExit(f"{where}: expected one 'Peanuts' label in the left panel, found {len(peanuts)}")
    lx = peanuts[0]["x0"]
    labels, last_y = [], peanuts[0]["y0"] - 1
    for key, starts in ALLERGEN_ROWS:
        hits = [w for w in left if w["text"] in starts and abs(w["x0"] - lx) <= 3 and w["y0"] > last_y]
        if not hits:
            raise SystemExit(f"{where}: allergen label for {key} not found below the previous one")
        hit = min(hits, key=lambda w: w["y0"])
        labels.append(hit)
        last_y = hit["y0"]
    label_right = max(w["x1"] for w in left if w["text"] in LABEL_VOCAB and abs(w["x0"] - lx) <= 125
                      and labels[0]["y0"] - 2 <= w["yc"] <= labels[-1]["y1"] + 14)

    # ---- vegetarian / vegan rows give the product columns ("SUITABLE FOR VEGETARIANS" may wrap onto two lines)
    suitable = sorted((w for w in left if w["text"] == "SUITABLE" and abs(w["x0"] - lx) <= 3 and w["yc"] < labels[0]["y0"]),
                      key=lambda w: w["y0"])
    contains = [w for w in left if w["text"] == "CONTAINS" and abs(w["x0"] - lx) <= 3 and w["yc"] < labels[0]["y0"]]
    if len(suitable) != 2 or len(contains) != 1:
        raise SystemExit(f"{where}: expected two 'SUITABLE FOR ...' rows and one CONTAINS heading, found {len(suitable)} and {len(contains)}")
    veg_top, vegan_top, grid_top = suitable[0]["y0"] - 3, suitable[1]["y0"] - 3, contains[0]["y0"] - 3
    cells = [w for w in left if w["x0"] > label_right + 8 and w["text"] in DIET_CELL]
    veg_cells = sorted((w for w in cells if veg_top <= w["yc"] < vegan_top), key=lambda w: w["xc"])
    vegan_cells = [w for w in cells if vegan_top <= w["yc"] < grid_top]
    if not veg_cells or len(vegan_cells) != len(veg_cells):
        raise SystemExit(f"{where}: vegetarian row has {len(veg_cells)} cells, vegan row {len(vegan_cells)}")
    anchors = [w["xc"] for w in veg_cells]
    diet = []
    for i, v in enumerate(veg_cells):
        vegan = [w for w in vegan_cells if _nearest(anchors, w["xc"]) == i]
        if len(vegan) != 1:
            raise SystemExit(f"{where}: column {i} has {len(vegan)} vegan cells")
        diet.append((v["text"], vegan[0]["text"]))

    # ---- names: the header words above the diet rows, in their column; the caller checks its typed names against these
    header = [w for w in left if veg_top - 62 <= w["yc"] < veg_top and w["x0"] > label_right + 8]
    names = [" ".join(w["text"] for w in reading_order([w for w in header if _nearest(anchors, w["xc"]) == i]))
             for i in range(len(anchors))]
    title_words = [w for w in words if w["x0"] > 60 and w["x1"] < 520 and 20 < w["y0"] and w["yc"] < veg_top - 62 + 5]
    title = " ".join(w["text"] for w in reading_order(title_words))

    # ---- allergen grid: a row runs from just above its label to just above the next label, so a wrapped cell stays in its row
    grid = [[] for _ in anchors]
    for i, lab in enumerate(labels):
        top = lab["y0"] - 3
        bottom = labels[i + 1]["y0"] - 3 if i + 1 < len(labels) else lab["y1"] + 8
        row_words = [w for w in left if top <= w["yc"] < bottom and w["x0"] > label_right + 8]
        for c in range(len(anchors)):
            mine = [w for w in row_words if _nearest(anchors, w["xc"]) == c]
            grid[c].append((ALLERGEN_ROWS[i][0], " ".join(w["text"] for w in reading_order(mine))))

    # ---- nutrition table
    nut_head = [w for w in left if w["text"] == "NUTRITIONAL" and w["yc"] > labels[-1]["y1"]]
    if not nut_head:
        raise SystemExit(f"{where}: no NUTRITIONAL INFORMATION heading")
    nut_head = [max(nut_head, key=lambda w: w["y1"])]  # the sauces page prints the heading twice, one on top of the other
    below = [w for w in left if w["y0"] > nut_head[0]["y1"] - 1]
    kj = [w for w in below if w["text"] == "kJ"]
    if len(kj) != 1:
        raise SystemExit(f"{where}: expected one kJ label in the nutrition table")
    unit_x1 = kj[0]["x1"]
    rows = {}
    for field, word in NUTRITION_ROWS:
        hits = [w for w in below if w["text"] == word and w["x0"] < unit_x1 + 5]
        if len(hits) != 1:
            raise SystemExit(f"{where}: expected one {word!r} label in the nutrition table, found {len(hits)}")
        rows[field] = hits[0]
    ys = [rows[f]["yc"] for f, _ in NUTRITION_ROWS]
    if ys != sorted(ys) or len({round(y) for y in ys}) != 8:
        raise SystemExit(f"{where}: nutrition labels are not in the expected order")
    value_left = unit_x1 + 20
    values = [w for w in below if w["text"] not in NUTRITION_LABEL_WORDS]  # a long label ("of which saturates (g)") can reach the values
    kj_values = sorted((w for w in values if abs(w["yc"] - rows["energy_kj"]["yc"]) <= 6 and w["x0"] > value_left), key=lambda w: w["xc"])
    if not kj_values:
        raise SystemExit(f"{where}: no kJ values")
    n_anchors = [w["xc"] for w in kj_values]
    nutrition = [dict() for _ in n_anchors]
    for field, _ in NUTRITION_ROWS:
        row_words = [w for w in values if abs(w["yc"] - rows[field]["yc"]) <= 6 and w["x0"] > value_left]
        for c in range(len(n_anchors)):
            nutrition[c][field] = "".join(w["text"] for w in reading_order([w for w in row_words if _nearest(n_anchors, w["xc"]) == c]))
    head_y0, head_y1 = nut_head[0]["y1"], rows["energy_kj"]["y0"] - 1
    for c in range(len(n_anchors)):
        mine = [w for w in values if head_y0 <= w["yc"] < head_y1 and w["x0"] > value_left - 10 and _nearest(n_anchors, w["xc"]) == c]
        nutrition[c]["header"] = " ".join(w["text"] for w in reading_order(mine))
    # nothing else may sit in the table below the Salt row (a ninth row such as fibre would be missed otherwise)
    stray = [w["text"] for w in values if rows["salt_g"]["yc"] + 7 < w["yc"] < footer_y - 8 and w["x0"] > 30]
    if stray:
        raise SystemExit(f"{where}: unexpected text under the Salt row: {stray}")
    for c, n in enumerate(nutrition):
        for field, _ in NUTRITION_ROWS:
            if not NUMBER.match(n[field]) and n[field].lower() != "trace":
                raise SystemExit(f"{where}: nutrition column {c} {field} = {n[field]!r} is not a plain number")

    ing_top = min(w["y0"] for w in ing) - 1
    ing_words = [w for w in words if w["x0"] >= right and w["y0"] >= ing_top and w["yc"] < footer_y - 5]
    return {"title": title, "names": names, "diet": diet, "grid": grid, "nutrition": nutrition,
            "ingredients": " ".join(w["text"] for w in reading_order(ing_words)),
            "text": " ".join(w["text"] for w in words)}
