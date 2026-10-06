"""Read Coffee #1's official PDFs (food guide, beverage guides) into rows of printed numbers.

Used by tools/uk_extract/coffee_1.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.73", "<0.5", "16") so nothing is converted or estimated here.

Both kinds of PDF are Excel-generated tables with a text layer, so the words are read with `pdftotext -bbox`
(every word with its position) and assigned to columns by position:

* Food guide: one block per product ("per 100g" and "per portion (g)" columns, rows KJ, Kcal, Fat, Sat, Carbs, Sugar,
  Fibre, Protein, Salt, then "Portion weight (g)"). Product names sit in the left-hand column.
* Beverage guides: one table per drink ("Per 100ml" and "Per product" blocks of nine columns: KJ, Kcal, Fat, Sat, Carb,
  Sugar, Fibre, Protein, Salt), one row per size, several milk variants per drink.

Allergens (docs/DATA.md "Allergens"), read by position too, never from names:

* Food guide, ingredient declarations (the middle column of each product block): the guide says "Allergens can be found in
  BOLD CAPITALS within the Ingredient Declaration". `pdftohtml -xml` (poppler, same install as pdftotext) gives each text
  run with its font weight, so every line is returned with a per-character bold mask. The lines are grouped into
  paragraphs and each paragraph is tied to the one product block it vertically overlaps (two blocks, or a product with
  no paragraph, stops the run).
* Food guide, allergen matrix (pages 4-8: one row per product, a "*" under each allergen column): read as a second
  printed form, only to cross-check the ingredient declarations of products whose names are printed identically.
* Beverage guides: the ALLERGENS column (one merged cell per drink and milk, spanning that block's size rows). A word
  belongs to a block only if it sits under the ALLERGENS heading and inside that block's rows.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
MEASURE = re.compile(r"^\d+(?:\.\d+)?(?:ml|g)$", re.I)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
Word = tuple  # (x0, y0, x1, y1, text)

FOOD_LABELS = ["KJ", "Kcal", "Fat", "Sat", "Carbs", "Sugar", "Fibre", "Protein", "Salt"]
DRINK_LABELS = ["KJ", "Kcal", "Fat", "Sat", "Carb", "Sugar", "Fibre", "Protein", "Salt"]
SIZE_RANK = {"Single": 0, "Double": 1, "Small": 0, "Regular": 1, "Large": 2}
OZ = re.compile(r"^(\d+)oz$")


def size_rank(size: str) -> int | None:
    """Order of a printed size within a drink (a size that does not rise starts a new product); None = unknown."""
    if size in SIZE_RANK:
        return SIZE_RANK[size]
    m = OZ.match(size)
    return int(m.group(1)) if m else None


class LayoutChanged(Exception):
    """The PDF no longer has the layout this reader expects: a human must re-check it."""


def pages(pdf: Path, first: int | None = None, last: int | None = None) -> list[tuple[int, list[Word]]]:
    """[(page number, words)] for the given page range (1-based, inclusive)."""
    cmd = ["pdftotext", "-bbox"]
    if first:
        cmd += ["-f", str(first)]
    if last:
        cmd += ["-l", str(last)]
    with tempfile.NamedTemporaryFile(suffix=".xml") as out:
        subprocess.run(cmd + [str(pdf), out.name], check=True)
        xml = Path(out.name).read_text(encoding="utf-8")
    result = []
    for n, pg in enumerate(xml.split("<page ")[1:], first or 1):
        words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(pg)]
        result.append((n, words))
    return result


def _line_words(words: list[Word], y: float, tol: float = 4.0) -> list[Word]:
    return sorted([w for w in words if abs(w[1] - y) <= tol])


# ------------------------------------------------------------------ food guide

def food_blocks(pdf: Path, unassigned: list | None = None) -> list[dict]:
    """One dict per product block, in reading order: printed name text, page, per-100g and per-portion numbers, and
    "ingredient_lines": the block's ingredient declaration as [(text, bold mask)] (mask: 'B' per bold character, '.'
    otherwise). Ingredient paragraphs that belong to no block (column and section headings) are appended to
    `unassigned` as (page, text, mask) so the caller can check them.

    A block starts at a "KJ" label in the nutrition column (x > 560) and ends at its "Portion weight (g)" row.
    """
    blocks = []
    html_pages = _html_pages(pdf, 9)
    for pno, words in pages(pdf, 9):
        page_blocks: list[tuple[dict, float, float]] = []
        kjs = sorted([w for w in words if w[0] > 560 and w[4] == "KJ"], key=lambda w: w[1])
        if not kjs:
            continue
        right = kjs[0][2]  # the labels are right-aligned: ingredient text that happens to say "Fat" or "Salt" ends elsewhere
        if any(abs(k[2] - right) > 3 for k in kjs):
            raise LayoutChanged(f"page {pno}: the KJ labels are not in one column")
        labels = sorted([w for w in words if abs(w[2] - right) < 3 and w[4] in FOOD_LABELS], key=lambda w: (w[1], w[0]))
        portions = sorted([w for w in words if w[0] > 560 and w[4] == "Portion"
                           and any(x[4] == "weight" and abs(x[1] - w[1]) < 2 for x in words)], key=lambda w: w[1])
        for k in kjs:
            end = min([p for p in portions if p[1] > k[1]], key=lambda p: p[1], default=None)
            if end is None:
                raise LayoutChanged(f"page {pno}: block starting at y={k[1]:.0f} has no 'Portion weight' row")
            rows: dict[str, list[str]] = {}
            for lab in FOOD_LABELS:
                cand = [w for w in labels if w[4] == lab and k[1] - 2 <= w[1] <= end[1]]
                if len(cand) > 1:
                    raise LayoutChanged(f"page {pno}: block at y={k[1]:.0f} has {len(cand)} '{lab}' labels")
                if not cand:  # a row the guide does not print for this product (e.g. no Fibre row): left empty
                    rows[lab] = []
                    continue
                line = _line_words(words, cand[0][1], 3.0)
                vals = [w for w in line if w[0] > cand[0][2] + 3]
                rows[lab] = [w[4] for w in vals]
            pw_line = _line_words(words, end[1], 3.0)
            pw_vals = [w[4] for w in pw_line if w[0] > end[2] + 40]
            # product name: words in the left-hand column (x < 200) vertically within the block
            name_words = [w for w in words if w[2] < 200 and k[1] - 40 < w[1] < end[1] + 12 and w[1] > 100]
            name_words.sort(key=lambda w: (round(w[1] / 5), w[0]))
            # ingredient text (middle column): used only to decide the pork / beef tags and to check (V) marks
            ing_words = [w for w in words if 200 <= w[0] and w[2] < 645 and k[1] - 8 < w[1] < end[1] + 10]
            ing_words.sort(key=lambda w: (round(w[1] / 4), w[0]))
            block = {"page": pno, "name_text": " ".join(w[4] for w in name_words), "rows": rows, "portion_g": pw_vals,
                     "y": k[1], "ingredients": " ".join(w[4] for w in ing_words), "ingredient_lines": []}
            blocks.append(block)
            # the block's vertical extent: from its "per 100g" heading (just above KJ) to the bottom of "Portion weight"
            heads = [w for w in words if w[4] == "per" and w[0] > 560 and 0 < k[1] - w[1] < 30]
            if not heads:
                raise LayoutChanged(f"page {pno}: block at y={k[1]:.0f} has no 'per 100g' heading")
            page_blocks.append((block, min(w[1] for w in heads), end[3]))
        for (_, _, b1), (nxt, a2, _) in zip(page_blocks, page_blocks[1:]):
            if a2 <= b1:
                raise LayoutChanged(f"page {pno}: product blocks overlap at y={a2:.0f}")
        for para in _ingredient_paragraphs(html_pages.get(pno, []), pno):
            top, bottom = para[0][0], para[-1][1]
            letters = "".join(ch for _, _, t, _ in para for ch in t if ch.isalpha())
            if letters.isupper():  # a column or section heading (INGREDIENTS, BUNS, FLATBREAD...), not a declaration
                if unassigned is not None:
                    unassigned += [(pno, t, m) for _, _, t, m in para]
                continue
            hits = [b for b, a0, a1 in page_blocks if min(bottom, a1) - max(top, a0) > 0]
            if len(hits) > 1:
                raise LayoutChanged(f"page {pno}: an ingredient paragraph at y={top:.0f}-{bottom:.0f} overlaps two products")
            if hits:
                hits[0]["ingredient_lines"] += [(t, m) for _, _, t, m in para]
            elif unassigned is not None:
                unassigned += [(pno, t, m) for _, _, t, m in para]
        for b, _, _ in page_blocks:
            if not b["ingredient_lines"]:
                raise LayoutChanged(f"page {pno}: no ingredient declaration found for {b['name_text']!r}")
    return blocks


# The ingredient column of the food guide: the product-name column ends at x <= 198, ingredient text ends at x <= 642 and
# the right-aligned nutrition labels (KJ ... Salt) start at x >= 647. Only the block headings "per 100g" / "per portion
# (g)" and the "Portion weight (g)" label reach further left, so they are skipped by name; any other run that crosses an
# edge stops the reader. The page body runs from y 100 to 1160 (page header and footer outside).
INGREDIENT_X0, INGREDIENT_X1, BODY_Y0, BODY_Y1 = 199.0, 645.0, 100.0, 1160.0
NUTRITION_HEADINGS = {"per 100g", "per portion (g)", "Portion weight (g)"}


def _html_pages(pdf: Path, first: int | None = None, last: int | None = None) -> dict[int, list[tuple]]:
    """{page: [(x0, y0, x1, y1, text, bold mask)]} from `pdftohtml -xml -zoom 1` (the same points as pdftotext -bbox).
    A run's characters are bold where pdftohtml wraps them in <b>."""
    cmd = ["pdftohtml", "-xml", "-i", "-q", "-zoom", "1", "-stdout"]
    if first:
        cmd += ["-f", str(first)]
    if last:
        cmd += ["-l", str(last)]
    xml = subprocess.run(cmd + [str(pdf)], capture_output=True, text=True, check=True).stdout
    out: dict[int, list[tuple]] = {}
    for m in re.finditer(r'<page number="(\d+)"(.*?)</page>', xml, re.S):
        runs = []
        for top, left, width, height, inner in re.findall(
                r'<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="\d+">(.*?)</text>', m.group(2)):
            text, mask, bold = "", "", 0
            for part in re.split(r"(</?[a-z]+>)", inner):
                if part in ("<b>", "</b>"):
                    bold += 1 if part == "<b>" else -1
                elif part.startswith("<") and part.endswith(">") and re.fullmatch(r"</?[a-z]+>", part):
                    continue  # <i>, <a> and similar carry no weight
                else:
                    s = html.unescape(part)
                    text += s
                    mask += ("B" if bold > 0 else ".") * len(s)
            x0, y0 = float(left), float(top)
            runs.append((x0, y0, x0 + float(width), y0 + float(height), text, mask))
        out[int(m.group(1))] = runs
    return out


def _ingredient_paragraphs(runs: list[tuple], pno: int) -> list[list[tuple[float, float, str, str]]]:
    """The page's ingredient column as paragraphs of lines [(top, bottom, text, mask)]. Runs on one line are joined
    left to right; a space is added where two runs are separated by a visible gap (2 pt or more) and neither brings its
    own. A new paragraph starts after a vertical gap of more than 6 pt (lines are about 11 pt apart)."""
    col = []
    for r in runs:
        if not (BODY_Y0 < r[1] < BODY_Y1) or r[2] <= INGREDIENT_X0 or r[0] >= INGREDIENT_X1:
            continue
        if r[4].strip() in NUTRITION_HEADINGS and r[0] > 540:
            continue
        if r[0] < INGREDIENT_X0 or r[2] > INGREDIENT_X1 + 1:
            raise LayoutChanged(f"page {pno}: text {r[4]!r} crosses the edge of the ingredient column")
        col.append(r)
    lines: list[list[tuple]] = []
    for r in sorted(col, key=lambda r: (r[1], r[0])):
        if lines and abs(r[1] - lines[-1][0][1]) <= 2:
            lines[-1].append(r)
        else:
            lines.append([r])
    joined = []
    for L in lines:
        L.sort(key=lambda r: r[0])
        text, mask = L[0][4], L[0][5]
        for prev, r in zip(L, L[1:]):
            if r[0] - prev[2] >= 2 and not text.endswith(" ") and not r[4].startswith(" "):
                text, mask = text + " ", mask + "."
            text, mask = text + r[4], mask + r[5]
        joined.append((min(r[1] for r in L), max(r[3] for r in L), text, mask))
    paras: list[list[tuple[float, float, str, str]]] = []
    for ln in joined:
        if paras and ln[0] - paras[-1][-1][1] <= 6:
            paras[-1].append(ln)
        else:
            paras.append([ln])
    return paras


# Allergen matrix (food guide pages 4-8): the column labels as printed (rotated), left to right.
MATRIX_COLUMNS = ["Wheat", "Barley", "Oat", "Rye", "Spelt", "Milk (Lactose)", "Egg", "Soya", "Fish", "Sulphites", "Sesame",
                  "Almond", "Brazil Nuts", "Cashews", "Hazelnut", "Macadamia", "Pecan", "Pistachio", "Walnut", "Peanuts",
                  "Mustard", "Celery", "Crustaceans", "Lupin", "Molluscs"]


def food_allergen_matrix(pdf: Path, first: int = 4, last: int = 8) -> tuple[list[dict], list[str]]:
    """([{page, name, marks}], problems) from the allergen matrix pages. Each row's "*" marks are the column labels
    they sit under. A row's name is its name line(s): a cell's marks sit on the same line as the last line of its name.
    Used only to cross-check the ingredient declarations, so rows that cannot be read cleanly are reported, not guessed."""
    rows: list[dict] = []
    problems: list[str] = []
    for pno, words in pages(pdf, first, last):
        labs: dict[str, float] = {}
        rotated = [w for w in words if (w[3] - w[1]) > (w[2] - w[0]) and 100 < w[1] < 260]
        for col in MATRIX_COLUMNS:
            parts = col.split()
            hits = [w for w in rotated if w[4] == parts[-1] and
                    (len(parts) == 1 or any(x[4] == parts[0] and abs(x[0] - w[0]) < 2 for x in rotated))]
            if col == "Brazil Nuts":
                hits = [w for w in rotated if w[4] == "Brazil"]
            if len(hits) != 1:
                raise LayoutChanged(f"matrix page {pno}: column label {col!r} found {len(hits)} times")
            labs[col] = (hits[0][0] + hits[0][2]) / 2
        xs = [labs[c] for c in MATRIX_COLUMNS]
        if xs != sorted(xs):
            raise LayoutChanged(f"matrix page {pno}: column labels out of order")
        head_bottom = max(w[3] for w in rotated if w[4] in ("Wheat", "Molluscs"))
        # the grid ends at the footer ("WE TAKE CARE..." on most pages, "Version 57 IN ADDITON..." on the last one)
        foot = min([w[1] for w in words if w[4] in ("WE", "Version", "ADDITON,") and w[1] > head_bottom] + [1e9])
        body = [w for w in words if head_bottom < w[1] < foot - 2]
        name_col_x1 = min(xs) - 120  # the two "Product suitable for..." columns sit between the names and "Wheat"
        lines: list[list[Word]] = []
        for w in sorted([w for w in body if w[0] < name_col_x1], key=lambda w: (w[1], w[0])):
            if lines and abs(w[1] - lines[-1][0][1]) < 3:
                lines[-1].append(w)
            else:
                lines.append([w])
        stars = [w for w in body if w[4] == "*" and w[0] > min(xs) - 20]
        other = [w for w in body if w[0] >= name_col_x1 and w[4] not in ("*", "Y")]
        if other:
            problems.append(f"matrix page {pno}: unexpected words in the grid {[w[4] for w in other][:6]}")
        def column(s: Word) -> str:
            col = min(MATRIX_COLUMNS, key=lambda c: abs(labs[c] - (s[0] + s[2]) / 2))
            if abs(labs[col] - (s[0] + s[2]) / 2) > 8:
                problems.append(f"matrix page {pno}: a '*' at x={s[0]:.0f} is under no column")
            return col

        used: set[int] = set()
        pending: list[tuple[float, str]] = []
        page_rows: list[dict] = []
        for L in lines:
            text = " ".join(w[4] for w in sorted(L))
            y = L[0][1]
            if text.isupper() and not any(ch.isdigit() for ch in text):  # section heading (PASTRIES, TOASTIES...)
                if pending:
                    problems.append(f"matrix page {pno}: no marks on the line of {' '.join(t for _, t in pending)!r} (row not read)")
                pending = []
                continue
            pending.append((y, text))
            line_marks = [w for w in body if w[4] in ("*", "Y") and w[0] >= name_col_x1 and abs(w[1] - y) < 4]
            if not line_marks:
                continue
            marks = set()
            for s in [w for w in stars if abs(w[1] - y) < 4]:
                marks.add(column(s))
                used.add(id(s))
            page_rows.append({"page": pno, "name": " ".join(t for _, t in pending), "marks": marks,
                              "y0": pending[0][0], "y1": pending[-1][0]})
            pending = []
        if pending:
            problems.append(f"matrix page {pno}: no marks on the line of {' '.join(t for _, t in pending)!r} (row not read)")
        # a mark printed between the lines of a two-line name (one cell spanning both lines) belongs to that row
        for s in stars:
            if id(s) in used:
                continue
            inside = [r for r in page_rows if r["y0"] - 2 <= s[1] <= r["y1"] + 2]
            if len(inside) == 1:
                inside[0]["marks"].add(column(s))
                problems.append(f"matrix page {pno}: a '*' between the name lines of {inside[0]['name']!r} read as "
                                f"{column(s)} for that row")
            else:
                problems.append(f"matrix page {pno}: a '*' at y={s[1]:.0f} is on no product's line")
        rows += [{k: v for k, v in r.items() if k not in ("y0", "y1")} for r in page_rows]
    return rows, problems


# ------------------------------------------------------------------ beverage guides

def _columns(words: list[Word], y_head: float, y_limit: float) -> list[tuple[str, float, float]]:
    """The column labels (rotated text) around a "Per 100ml" heading: [(label, right edge, top)], left to right.

    18 labels = a per-100 block and a per-serving block; 9 = a per-100 block only."""
    labs = sorted([w for w in words if w[4] in DRINK_LABELS and y_head - 12 < w[1] < min(y_head + 50, y_limit)], key=lambda w: w[0])
    if len(labs) not in (9, 18):
        raise LayoutChanged(f"expected 9 or 18 column labels under the heading at y={y_head:.0f}, found {len(labs)}")
    if [w[4] for w in labs] != DRINK_LABELS * (len(labs) // 9):
        raise LayoutChanged(f"column labels out of order at y={y_head:.0f}: {[w[4] for w in labs]}")
    return [(w[4], w[2], w[1]) for w in labs]


def _clusters(tokens: list[Word], gap: float = 6.0) -> list[list[Word]]:
    """Group number tokens into lines (tokens whose y is within `gap` of the previous one)."""
    out: list[list[Word]] = []
    for t in sorted(tokens, key=lambda w: w[1]):
        if out and t[1] - out[-1][-1][1] < gap:
            out[-1].append(t)
        else:
            out.append([t])
    return out


VITAMIN = re.compile(r"^\d+(?:\.\d+)?ug$")


def _allergen_cells(words: list[Word], groups: list[list[dict]], acol: tuple[float, float], name_x1: float, zone_x1: float,
                    pno: int, section: str) -> list[str]:
    """The printed ALLERGENS cell of each group (one drink and milk), '' where the cell is empty.

    The cell is merged over the group's size rows, so a word belongs to a group only if its centre sits under the
    ALLERGENS heading (acol: the heading's x0, x1) and vertically inside that group's rows. Any other word between the
    product names and the size column, or a word that fits no group or two, stops the reader."""
    x0, x1 = acol
    top, bottom = groups[0][0]["top"], groups[-1][-1]["bottom"]
    cells: list[list[Word]] = [[] for _ in groups]
    for w in words:
        cy = (w[1] + w[3]) / 2
        if not (top - 6 < cy < bottom + 6) or NUM.match(w[4]) or VITAMIN.match(w[4]) or w[4] in SIZE_RANK or OZ.match(w[4]):
            continue
        if w[2] <= name_x1 or w[0] >= zone_x1:
            continue  # the product name, or the number columns
        cx = (w[0] + w[2]) / 2
        if not (x0 - 2 <= cx <= x1 + 2):
            raise LayoutChanged(f"page {pno}: {w[4]!r} at x={w[0]:.0f}-{w[2]:.0f} under '{section}' is outside the "
                                f"ALLERGENS column ({x0:.0f}-{x1:.0f})")
        hits = [i for i, g in enumerate(groups) if g[0]["top"] - 2 <= cy <= g[-1]["bottom"] + 2]
        if len(hits) != 1:
            raise LayoutChanged(f"page {pno}: allergen word {w[4]!r} at y={cy:.0f} under '{section}' fits {len(hits)} drinks")
        cells[hits[0]].append(w)
    return [" ".join(w[4] for w in sorted(c, key=lambda w: (round(w[1] / 3), w[0]))) for c in cells]


def drink_products(pdf: Path) -> list[dict]:
    """One dict per drink variant (a name with its sizes), in reading order.

    Keys: page, section (the table's heading), description, basis (the printed column headings), name (printed text),
    allergens (the printed words of its ALLERGENS cell, '' when the cell is empty), allergen_heading ('printed' when the
    table prints its ALLERGENS heading, 'inherited' when the table prints no heading row and uses the column of the table
    before it, which has its number columns in the same place), sizes: [{size, per100, per_product}] where each is a dict
    label -> printed number. `size` is '' when the table has no SIZE column. Anything that does not fit the expected
    shape raises LayoutChanged instead of guessing. Tables printed without their column headings (a table continued
    from the page before) reuse the previous table's columns.
    """
    products: list[dict] = []
    last: dict | None = None  # the previous table's columns and headings
    for pno, words in pages(pdf):
        rows_on_page = 0
        # one heading per table: the line of "Per 100ml ... Per product" words (a single-block table has only one "Per")
        per = sorted([w for w in words if w[4] == "Per"
                      and any((MEASURE.match(x[4]) or x[4] in ("product", "Product", "serving")) and abs(x[1] - w[1]) < 2
                              and 0 < x[0] - w[0] < 25 for x in words)], key=lambda w: w[1])
        heads: list[Word] = []
        for w in per:
            if not heads or w[1] - heads[-1][1] > 3:
                heads.append(w)
        # a table's column labels start about 12 above its "Per 100ml" heading and only numbers are read from the span,
        # so a span can safely run up to there; rows before the first heading belong to a table whose headings were
        # not printed on this page
        spans: list[tuple[float | None, float, float]] = [(None, 0.0, heads[0][1] - 14 if heads else 1e9)]
        for ti, h in enumerate(heads):
            spans.append((h[1], h[1] - 3, heads[ti + 1][1] - 14 if ti + 1 < len(heads) else 1e9))
        prev_last_y = 35.0  # y of the last data row read so far on this page (the page heading sits above 35)
        for y_head, y0, y_next in spans:
            if y_head is None:
                if last is None:
                    continue
                cols, name_x1, size_mid, allergen_x1 = last["cols"], last["name_x1"], last["size_mid"], last["allergen_x1"]
                section, description, basis = last["section"], last["description"], last["basis"]
                acol, acol_kind = last["acol"], "inherited"
                data_top = 35.0
                above_lines: list[str] = []
            else:
                cols = _columns(words, y_head, y_next)
                # the table's title (ALL CAPS) and description sit just above the heading, below the previous table's rows;
                # a table without a title belongs to the same drink as the table before it
                above: dict[int, list[Word]] = {}
                for w in words:
                    if max(prev_last_y + 14, y_head - 45) < w[1] < y_head - 3:
                        above.setdefault(round(w[1] / 3), []).append(w)
                above_lines = [" ".join(x[4] for x in sorted(v)) for _, v in sorted(above.items())]
                if above_lines and above_lines[0] == above_lines[0].upper() and any(ch.isalpha() for ch in above_lines[0]):
                    section, description = above_lines[0], " ".join(above_lines[1:])
                elif last is not None:
                    section, description = last["section"], last["description"]
                else:
                    raise LayoutChanged(f"page {pno}: a table without a title and nothing before it")
                basis = " ".join(w[4] for w in sorted(words) if abs(w[1] - y_head) < 3 and w[0] > cols[0][1] - 80
                                 and (w[4] in ("Per", "product", "Product", "serving") or MEASURE.match(w[4])))
                hdr = {w[4]: w for w in words if y_head - 6 < w[1] < y_head + 50 and w[4] in ("PRODUCT", "ALLERGENS", "SIZE")}
                if not hdr:
                    # some tables print no PRODUCT/ALLERGENS/SIZE heading row: the columns sit where they do in the other
                    # tables, measured from the first number column
                    name_x1 = cols[0][1] - 121
                    size_mid = cols[0][1] - 39
                    # the ALLERGENS column is then the one of the table before, but only if its number columns are in the
                    # same place (the same layout)
                    if last is None or abs(last["cols"][0][1] - cols[0][1]) > 2:
                        raise LayoutChanged(f"page {pno}: '{section}' prints no ALLERGENS heading and the table before it "
                                            "has a different layout")
                    acol, acol_kind = last["acol"], "inherited"
                elif "PRODUCT" in hdr and "ALLERGENS" in hdr:
                    name_x1 = hdr["ALLERGENS"][0] - 3
                    size_mid = (hdr["SIZE"][0] + hdr["SIZE"][2]) / 2 if "SIZE" in hdr else None
                    acol, acol_kind = (hdr["ALLERGENS"][0], hdr["ALLERGENS"][2]), "printed"
                else:
                    raise LayoutChanged(f"page {pno}: odd PRODUCT/ALLERGENS/SIZE headings for '{section}'")
                allergen_x1 = (size_mid - 25) if size_mid else cols[0][1] - 40
                data_top = max(c[2] for c in cols) + 4
                last = {"cols": cols, "name_x1": name_x1, "size_mid": size_mid, "allergen_x1": allergen_x1,
                        "section": section, "description": description, "basis": basis, "acol": acol}
            # rows = lines of numbers right of the allergen column; each must carry all 18
            toks = [w for w in words if w[2] > cols[0][1] - 30 and NUM.match(w[4]) and max(data_top, y0) < w[1] < y_next]
            clusters = [c for c in _clusters(toks) if len(c) >= 3]  # shorter ones are page footers
            if not clusters:
                if y_head is None:
                    continue
                raise LayoutChanged(f"page {pno}: no rows under '{section}'")
            if y_head is None:
                # headless: a title line above the first row names a new table; otherwise it continues the last one
                first_y = min(w[1] for w in clusters[0])
                top: dict[int, list[Word]] = {}
                for w in words:
                    if 35 < w[1] < first_y - 3 and w[4] not in DRINK_LABELS and not NUM.match(w[4]):
                        top.setdefault(round(w[1] / 3), []).append(w)
                top_lines = [" ".join(x[4] for x in sorted(v)) for _, v in sorted(top.items())]
                if top_lines:
                    section, description = top_lines[0], " ".join(top_lines[1:])
            parsed = []
            ncols = len(cols)
            split_x = (cols[8][1] + cols[9][1]) / 2 + 5 if ncols == 18 else -1e9  # numbers ending left of this are the "per 100" block
            for c in clusters:
                y = sum(t[1] for t in c) / len(c)
                y_top, y_bot = min(t[1] for t in c), max(t[3] for t in c)
                vals: dict[int, str] = {}
                for t in c:
                    if t[2] <= split_x:
                        continue
                    idx = min(range(ncols - 9, ncols), key=lambda i: abs(t[2] - (cols[i][1] + 5.0)))
                    if idx in vals:
                        raise LayoutChanged(f"page {pno}: two numbers in column {cols[idx][0]} at y={y:.0f} under '{section}'")
                    vals[idx] = t[4]
                if len(vals) != 9:
                    raise LayoutChanged(f"page {pno}: '{section}' row at y={y:.0f} has {len(vals)} of 9 numbers "
                                        f"(missing: {[cols[i][0] for i in range(ncols - 9, ncols) if i not in vals]})")
                # the per-100 block is only used to cross-check, so a row whose left block is misprinted is kept, flagged
                left: dict[int, str] = {}
                if ncols == 18:
                    for t in c:
                        if t[2] > split_x:
                            continue
                        idx = min(range(9), key=lambda i: abs(t[2] - (cols[i][1] + 5.0)))
                        left.setdefault(idx, t[4])
                        if left[idx] != t[4]:
                            left[-1] = "clash"
                    left_ok = len(left) == 9 and -1 not in left and len([t for t in c if t[2] <= split_x]) == 9
                else:
                    left, vals, left_ok = dict(vals), {}, True
                # the size (Regular, Large, 12oz...) sits between the allergens and the numbers; some tables print no SIZE heading
                sz = [w for w in words if abs(w[1] - y) < 5 and w[0] > name_x1 and w[2] < cols[0][1] - 15
                      and (w[4] in SIZE_RANK or OZ.match(w[4]))]
                if len(sz) > 1:
                    raise LayoutChanged(f"page {pno}: '{section}' row at y={y:.0f} has several sizes: {[w[4] for w in sz]}")
                size = sz[0][4] if sz else ""
                parsed.append({"size": size, "y": y, "top": y_top, "bottom": y_bot, "per100_ok": left_ok,
                               "per100": {cols[i][0]: left[i] for i in range(9)} if left_ok else {},
                               "per_product": {cols[i][0]: vals[i] for i in range(9, 18)} if ncols == 18 else {}})
            rows_on_page += len(parsed)
            prev_last_y = parsed[-1]["y"]
            # group rows into products: sizes ascend within a product, so a size that does not rise starts a new one
            groups: list[list[dict]] = []
            for p in parsed:
                prev = groups[-1][-1]["size"] if groups else ""
                if groups and p["size"] and prev and size_rank(p["size"]) > size_rank(prev):
                    groups[-1].append(p)
                else:
                    groups.append([p])
            centres = [(g[0]["y"] + g[-1]["y"]) / 2 for g in groups]
            name_lines: list[list[Word]] = [[] for _ in groups]
            first_y, last_y = parsed[0]["y"], parsed[-1]["y"]
            for w in words:
                if not (first_y - 12 < w[1] < last_y + 12):
                    continue
                if VITAMIN.match(w[4]):
                    continue  # the "Vitamin content" column of the B12 quencher sits between name and allergens
                if w[2] <= name_x1:
                    gi = min(range(len(groups)), key=lambda i: abs(w[1] - centres[i]))
                    name_lines[gi].append(w)
            cells = _allergen_cells(words, groups, acol, name_x1, cols[0][1] - 15, pno, section)
            for g, nl, cell in zip(groups, name_lines, cells):
                nl.sort(key=lambda w: (round(w[1] / 3), w[0]))
                products.append({
                    "page": pno, "section": section, "description": description, "basis": basis,
                    "name": " ".join(w[4] for w in nl), "allergens": cell, "allergen_heading": acol_kind,
                    "sizes": [{k: v for k, v in s.items() if k not in ("y", "top", "bottom")} for s in g],
                })
        # every line of 9+ numbers on the page must have been read as a row of some table
        n_lines = len([c for c in _clusters([w for w in words if w[0] > 300 and NUM.match(w[4])]) if len(c) >= 9])
        if n_lines != rows_on_page:
            raise LayoutChanged(f"page {pno}: {n_lines} lines of numbers but {rows_on_page} rows read")
    return products
