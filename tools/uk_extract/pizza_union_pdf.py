"""Read Pizza Union's official "Nutrition and Allergen Information" PDF into rows of printed numbers.

Used by tools/uk_extract/pizza_union.py. Requires `pdftotext` (poppler). Numbers come back exactly as printed (strings such
as "0.04", "n.d.*") and nothing is converted or estimated here.

Layout (pages 2-6, A4 landscape): one table per page with the columns Energy (kcal), Energy (kJ), Fat, Saturated Fat,
Carbohydrates, Sugars, Protein, Salt, then allergens, Vegans, Vegetarians. Section titles (PIZZA, SALAD, ...) sit on their own
line. Some item names wrap onto a second line (gelato, one cheese), and allergen text wraps onto up to three lines, so a row is
found by its numbers: each number is given to the column whose header it sits under (the header words are read from the page
and must be where we expect them), the name is every word in the name column nearest to that row, and Yes/No is read from the
Vegans / Vegetarians columns on the row's own line.
"""
import html
import re
import subprocess
from pathlib import Path

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
ND = re.compile(r"^n\.d\.\*?$", re.I)
KEYS = ("kcal", "kj", "fat", "sat", "carbs", "sugars", "protein", "salt")
LINE_TOL = 1.5          # words whose yMin differs by less than this are on one line
NAME_MAX_X = 118.0      # the name column ends here (the kcal column starts at about 120)
NAME_REACH = 20.0       # a name word sits at most this far (in points) above or below the row it belongs to
# header text that must sit over each numeric column, in order
HEADER_TEXT = [("Energy", "(kcal)"), ("Energy", "(kJ)"), ("Fat", "(g)"), ("Saturated", "Fat"), ("Carbohydrates", "(g)"),
               ("Sugars", "(g)"), ("Protein", "(g)"), ("Salt", "(g)")]


RENEWED = re.compile(r"^Renewed \d\d\.\d\d\.\d\d$")


class PdfLayoutError(RuntimeError):
    pass


def _pages(pdf: Path):
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
                      re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk)])
    return pages


def _lines(words):
    lines: list[list] = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) < LINE_TOL:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w[0]) for l in lines]


def _columns(lines) -> tuple[list[tuple[float, float]], float, float, float]:
    """Find the table header line on a page. Returns the 8 numeric column spans and the x centres of Vegans / Vegetarians."""
    for ln in lines:
        texts = [w[4] for w in ln]
        if "Menu" in texts and "item" in texts and "(kcal)" in texts:
            spans = []
            for first, second in HEADER_TEXT:
                # the header phrase is two or three words on this line: find `first` then the next `second`
                for i, w in enumerate(ln):
                    if w[4] == first:
                        j = next((k for k in range(i + 1, min(i + 3, len(ln))) if ln[k][4] == second), None)
                        if j is not None:
                            spans.append((w[0], ln[j][2]))
                            break
                else:
                    raise PdfLayoutError(f"header '{first} {second}' not found on a page")
            veg = {w[4]: (w[0] + w[2]) / 2 for w in ln}
            if "Vegans" not in veg or "Vegeterians" not in veg:
                raise PdfLayoutError("Vegans / Vegeterians header not found")
            return spans, veg["Vegans"], veg["Vegeterians"], ln[0][1]
    raise PdfLayoutError("no table header on this page")


def renewed_dates(pdf: Path) -> list[str]:
    """The footer of every nutrition page ("Renewed 17.03.26"), so the script can check the guide's date."""
    out = []
    for words in _pages(pdf):
        for ln in _lines(words):
            texts = " ".join(w[4] for w in ln)
            if RENEWED.match(texts):
                out.append(texts.split()[1])
    return out


def read_rows(pdf: Path) -> list[dict]:
    """Every table row of the guide in reading order: {section, name, kcal, kj, fat, sat, carbs, sugars, protein, salt,
    vegan, vegetarian, page}. Cells are strings exactly as printed ('n.d.*' where the chain has no data)."""
    rows: list[dict] = []
    for pno, words in enumerate(_pages(pdf), 1):
        lines = _lines(words)
        if not any(w[4] == "Menu" for ln in lines for w in ln):
            continue  # page 1 (recipes), not a nutrition table
        spans, vegan_x, vegetarian_x, header_y = _columns(lines)
        centres = [(a + b) / 2 for a, b in spans]
        section = None
        page_rows: list[dict] = []
        name_words: list[tuple[float, float, str]] = []   # (y centre, x, text) of everything in the name column
        for ln in lines:
            if ln[0][1] <= header_y + 1:
                continue  # title block and header line
            texts = " ".join(w[4] for w in ln)
            if RENEWED.match(texts):
                continue  # the page footer, "Renewed 17.03.26"
            nums = [w for w in ln if NAME_MAX_X < w[0] and w[2] < 575 and (NUM.match(w[4]) or ND.match(w[4]))]
            if len(nums) >= 8:
                if len(nums) != 8:
                    raise PdfLayoutError(f"page {pno}: {len(nums)} numbers on one line: {texts!r}")
                cells = {}
                for w in nums:
                    cx = (w[0] + w[2]) / 2
                    k = min(range(8), key=lambda i: abs(centres[i] - cx))
                    if not spans[k][0] - 12 <= cx <= spans[k][1] + 12:
                        raise PdfLayoutError(f"page {pno}: number {w[4]!r} is not under a column: {texts!r}")
                    if KEYS[k] in cells:
                        raise PdfLayoutError(f"page {pno}: two numbers in column {KEYS[k]}: {texts!r}")
                    cells[KEYS[k]] = w[4]
                yes = {}
                for w in ln:
                    if w[4] in ("Yes", "No"):
                        cx = (w[0] + w[2]) / 2
                        yes["vegan" if abs(cx - vegan_x) < abs(cx - vegetarian_x) else "vegetarian"] = w[4]
                if set(yes) != {"vegan", "vegetarian"}:
                    raise PdfLayoutError(f"page {pno}: Vegans/Vegetarians not both read on the line of {texts!r}")
                page_rows.append({"section": section, "y": sum((w[1] + w[3]) / 2 for w in nums) / len(nums), **cells, **yes,
                                  "page": pno, "name_parts": []})
                name_words.extend(((w[1] + w[3]) / 2, w[0], w[4]) for w in ln if w[2] < NAME_MAX_X)
                continue
            left = [w for w in ln if w[2] < NAME_MAX_X]
            right = [w for w in ln if w[2] >= NAME_MAX_X]
            if left and not right:
                name_words.extend(((w[1] + w[3]) / 2, w[0], w[4]) for w in ln)
            elif right and not left and ln[0][0] > NAME_MAX_X and ln[0][0] < 560 and texts.replace(" ", "").replace("-", "").replace("*", "").replace(".", "").replace("'", "").isupper() and not texts.startswith("*N.D"):
                section = texts
            elif left and right:
                raise PdfLayoutError(f"page {pno}: an unexpected line mixes names and other text: {texts!r}")
        # names: the row's own words plus name-only words (wrapped names), each given to the nearest row
        for y, x, t in name_words:
            r = min(page_rows, key=lambda r: abs(r["y"] - y))
            if abs(r["y"] - y) > NAME_REACH:
                raise PdfLayoutError(f"page {pno}: name text {t!r} is not near any row")
            r["name_parts"].append((y, x, t))
        for r in page_rows:
            parts = sorted(r["name_parts"], key=lambda p: (round(p[0] / LINE_TOL), p[1]))
            r["name"] = " ".join(t for _, _, t in parts)
            del r["name_parts"], r["y"]
        rows.extend(page_rows)
    if not rows:
        raise PdfLayoutError("no rows read")
    return rows
