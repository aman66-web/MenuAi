"""Read Coffee #1's official PDFs (food guide, beverage guides) into rows of printed numbers.

Used by tools/uk_extract/coffee_1.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.73", "<0.5", "16") so nothing is converted or estimated here.

Both kinds of PDF are Excel-generated tables with a text layer, so the words are read with `pdftotext -bbox`
(every word with its position) and assigned to columns by position:

* Food guide: one block per product ("per 100g" and "per portion (g)" columns, rows KJ, Kcal, Fat, Sat, Carbs, Sugar,
  Fibre, Protein, Salt, then "Portion weight (g)"). Product names sit in the left-hand column.
* Beverage guides: one table per drink ("Per 100ml" and "Per product" blocks of nine columns: KJ, Kcal, Fat, Sat, Carb,
  Sugar, Fibre, Protein, Salt), one row per size, several milk variants per drink.
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

def food_blocks(pdf: Path) -> list[dict]:
    """One dict per product block, in reading order: printed name text, page, per-100g and per-portion numbers.

    A block starts at a "KJ" label in the nutrition column (x > 560) and ends at its "Portion weight (g)" row.
    """
    blocks = []
    for pno, words in pages(pdf, 9):
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
            blocks.append({"page": pno, "name_text": " ".join(w[4] for w in name_words), "rows": rows, "portion_g": pw_vals,
                           "y": k[1], "ingredients": " ".join(w[4] for w in ing_words)})
    return blocks


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


def drink_products(pdf: Path) -> list[dict]:
    """One dict per drink variant (a name with its sizes), in reading order.

    Keys: page, section (the table's heading), description, basis (the printed column headings), name (printed text),
    allergens, sizes: [{size, per100, per_product}] where each is a dict label -> printed number. `size` is '' when the
    table has no SIZE column. Anything that does not fit the expected shape raises LayoutChanged instead of guessing.
    Tables printed without their column headings (a table continued from the page before) reuse the previous table's
    columns.
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
                elif "PRODUCT" in hdr and "ALLERGENS" in hdr:
                    name_x1 = hdr["ALLERGENS"][0] - 3
                    size_mid = (hdr["SIZE"][0] + hdr["SIZE"][2]) / 2 if "SIZE" in hdr else None
                else:
                    raise LayoutChanged(f"page {pno}: odd PRODUCT/ALLERGENS/SIZE headings for '{section}'")
                allergen_x1 = (size_mid - 25) if size_mid else cols[0][1] - 40
                data_top = max(c[2] for c in cols) + 4
                last = {"cols": cols, "name_x1": name_x1, "size_mid": size_mid, "allergen_x1": allergen_x1,
                        "section": section, "description": description, "basis": basis}
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
                parsed.append({"size": size, "y": y, "per100_ok": left_ok,
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
            allergen_lines: list[list[Word]] = [[] for _ in groups]
            first_y, last_y = parsed[0]["y"], parsed[-1]["y"]
            for w in words:
                if not (first_y - 12 < w[1] < last_y + 12):
                    continue
                if re.match(r"^\d+(?:\.\d+)?ug$", w[4]):
                    continue  # the "Vitamin content" column of the B12 quencher sits between name and allergens
                if w[2] <= name_x1:
                    target = name_lines
                elif name_x1 < w[0] and w[2] < allergen_x1:
                    target = allergen_lines
                else:
                    continue
                gi = min(range(len(groups)), key=lambda i: abs(w[1] - centres[i]))
                target[gi].append(w)
            for g, nl, al in zip(groups, name_lines, allergen_lines):
                nl.sort(key=lambda w: (round(w[1] / 3), w[0]))
                al.sort(key=lambda w: (round(w[1] / 3), w[0]))
                products.append({
                    "page": pno, "section": section, "description": description, "basis": basis,
                    "name": " ".join(w[4] for w in nl), "allergens": " ".join(w[4] for w in al),
                    "sizes": [{k: v for k, v in s.items() if k != "y"} for s in g],
                })
        # every line of 9+ numbers on the page must have been read as a row of some table
        n_lines = len([c for c in _clusters([w for w in words if w[0] > 300 and NUM.match(w[4])]) if len(c) >= 9])
        if n_lines != rows_on_page:
            raise LayoutChanged(f"page {pno}: {n_lines} lines of numbers but {rows_on_page} rows read")
    return products
