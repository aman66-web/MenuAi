"""Read the official nutrition tables of the Azzurri Group's UK guides (Zizzi, ASK Italian) from their PDFs.

Both guides come from one template: every nutrition row prints 16 numbers, "Per 100g" (kJ, kcal, fat, saturates,
carbohydrate, sugar, protein, salt) followed by "Per Portion" (same eight). Zizzi's table has a "Menu Item Name"
column; ASK Italian's has "Menu Section" and "Dish Description" columns. Requires `pdftotext` (poppler).

Numbers are returned exactly as printed (strings such as "<0.5", "0.36", "11.4"); nothing is converted, rounded or
estimated here. A row that does not have exactly 16 numbers is never guessed at: it is returned in `skipped` so the
caller can stop and show a person.
"""
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugar", "protein", "salt")
# the last 16 numbers on a line; the text before them is the name (lazy, so a name ending in a number, "Pollo Fritti x 8", keeps it)
_TAIL = re.compile(rf"^(?P<text>\S.*?)\s+(?P<nums>(?:{NUM}\s+){{15}}{NUM})\s*$")
_BOILERPLATE = ("These figures are approximate", "The data provided", "V3 10.09.26", "15.09.26")


def pdf_text_pages(pdf: Path) -> list[list[str]]:
    """Lines of each page, in pdftotext -layout order (page 1 is index 0)."""
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return [p.split("\n") for p in out.split("\f")]


def split_row(line: str):
    """(text before the numbers, per100 dict, portion dict) if the line ends in exactly 16 numbers, else None."""
    m = _TAIL.match(line.strip())
    if not m:
        return None
    vals = m.group("nums").split()
    return m.group("text"), dict(zip(FIELDS, vals[:8])), dict(zip(FIELDS, vals[8:]))


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _is_boilerplate(line: str) -> bool:
    s = line.strip()
    return (not s) or s.startswith(_BOILERPLATE) or s.isdigit()


def _join(parts: list[str]) -> str:
    """Join wrapped name lines; 'Non-' + 'Gluten' (a hyphen at the line end) joins without a space."""
    out = ""
    for p in parts:
        p = p.strip()
        out = (out + p) if out.endswith("-") and not out.endswith(" -") else (out + " " + p if out else p)
    return re.sub(r"\s+", " ", out).strip()


def read_zizzi(pdf: Path) -> dict:
    """Zizzi UK Nutrition Guide: {'rows': [{page, table, name, per100, portion}], 'skipped': [(page, line)]}.

    `table` is the table's printed heading ("STARTERS", "SIGNATURE DISHES", ...); the first table is headed APERITIVO
    (every table carries a hidden APERITIVO brand tag, which is dropped from the heading)."""
    rows, skipped = [], []
    for pno, lines in enumerate(pdf_text_pages(pdf), 1):
        title_lines: list[str] = []
        table = None
        prev_row = None  # (row dict, indent, parts) while the next line may still continue the name
        for line in lines:
            s = line.strip()
            if s.startswith("Menu Item Name"):
                title = " ".join(title_lines)
                title = re.sub(r"Per 100g Nutrition|Per Portion Nutrition", " ", title)
                title = re.sub(r"\bAPERITIVO\b", " ", title)
                title = re.sub(r"\s+", " ", title).strip() or "APERITIVO"
                table, title_lines, prev_row = title, [], None
                continue
            if _is_boilerplate(line) or re.fullmatch(r"kJ\s+kcal(\s+kJ\s+kcal)?", s):
                if not s:
                    prev_row = None
                continue
            parsed = split_row(line) if table else None
            if parsed:
                text, per100, portion = parsed
                row = {"page": pno, "table": table, "per100": per100, "portion": portion}
                prev_row = (row, _indent(line), [text])
                row["_parts"] = prev_row[2]
                rows.append(row)
                continue
            if prev_row and abs(_indent(line) - prev_row[1]) <= 2 and not re.search(rf"\s{NUM}(\s+{NUM}){{4,}}\s*$", line):
                prev_row[2].append(s)  # wrapped part of the previous row's name
                continue
            if table and re.search(rf"{NUM}(\s+{NUM}){{4,}}\s*$", s):
                skipped.append((pno, s))  # numbers but not exactly 16: never guess
            else:
                title_lines.append(re.sub(r"\s{2,}", " ", s))
            prev_row = None
    for r in rows:
        r["name"] = _join(r.pop("_parts"))
    return {"rows": rows, "skipped": skipped}


def read_ask(pdf: Path, first_page: int = 1) -> dict:
    """ASK Italian Allergen Guide: {'rows': [{page, section, name, per100, portion}], 'skipped': [(page, line)]}.

    Reads every table headed "Menu Section | Dish Description" (the nutritional guide at the back and the dated
    Summer Specials page); the caller decides which sections to publish."""
    rows, skipped = [], []
    for pno, lines in enumerate(pdf_text_pages(pdf), 1):
        if pno < first_page:
            continue
        in_table = False
        prev = None
        for line in lines:
            s = line.strip()
            if s.startswith("Menu Section") and "Dish Description" in s:
                in_table, prev = True, None
                continue
            if not in_table or _is_boilerplate(line) or s.startswith(("Per 100g", "kJ")):
                if not s:
                    prev = None
                continue
            m = _TAIL.match(s)
            if m:
                # section and description are separated by a gap of 2+ spaces in the layout text
                head = re.split(r"\s{2,}", line.strip(), maxsplit=1)
                if len(head) < 2:
                    skipped.append((pno, s))
                    prev = None
                    continue
                section = head[0]
                text = m.group("text")[len(section):].strip()
                vals = m.group("nums").split()
                row = {"page": pno, "per100": dict(zip(FIELDS, vals[:8])), "portion": dict(zip(FIELDS, vals[8:])),
                       "_section": [section], "_desc": [text], "_sec_indent": _indent(line)}
                rows.append(row)
                prev = row
                continue
            if prev is not None:
                # wrapped text: at the section column (left) or the description column
                if _indent(line) <= prev["_sec_indent"] + 2:
                    prev["_section"].append(s)
                else:
                    prev["_desc"].append(s)
                continue
            if re.search(rf"{NUM}(\s+{NUM}){{4,}}\s*$", s):
                skipped.append((pno, s))
    for r in rows:
        r["section"] = _join(r.pop("_section"))
        r["name"] = _join(r.pop("_desc"))
        r.pop("_sec_indent")
    return {"rows": rows, "skipped": skipped}


def norm(name: str) -> str:
    """Name key used to match a nutrition row to its allergen-table row: lower case, letters and digits only."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _words(pdf: Path) -> list[dict]:
    """Every word with its position (pdftotext -bbox), page numbers from 1."""
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words, page = [], 0
    for line in out.split("\n"):
        if line.lstrip().startswith("<page "):
            page += 1
            continue
        m = re.match(r'\s*<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)</word>', line)
        if m:
            text = m.group(5).replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">")
            words.append({"page": page, "x0": float(m.group(1)), "y0": float(m.group(2)), "x1": float(m.group(3)), "y1": float(m.group(4)), "t": text})
    return words


def read_veg_marks(pdf: Path, wanted: set[str]) -> dict:
    """The allergen tables of an Azzurri guide have "Vegetarian" and "Vegan" columns holding "Yes". Read them for the
    rows whose normalised name (see norm) is in `wanted`.

    Returns {'marks': {norm: (vegetarian, vegan)}, 'conflicts': [norm...]}: a name printed in several tables with
    different marks is a conflict and gets no mark at all. A name that is not found gets no mark either (no guessing)."""
    by_page: dict[int, list[dict]] = {}
    for w in _words(pdf):
        by_page.setdefault(w["page"], []).append(w)
    found: dict[str, set[tuple[bool, bool]]] = {}
    for pno, ws in by_page.items():
        celery = [w for w in ws if w["t"] == "Celery"]
        veg_h = [w for w in ws if w["t"] == "Vegetarian"]
        vegan_h = [w for w in ws if w["t"] == "Vegan"]
        names_h = [w for w in ws if w["t"] == "Menu"]
        if not (celery and veg_h and vegan_h and names_h):
            continue
        for ce in celery:
            vh = min(veg_h, key=lambda w: abs(w["y0"] - ce["y0"]))
            gh = min(vegan_h, key=lambda w: abs(w["y0"] - ce["y0"]))
            if abs(vh["y0"] - ce["y0"]) > 4 or abs(gh["y0"] - ce["y0"]) > 4:
                continue
            below = [h["y0"] for h in celery if h["y0"] > ce["y0"] + 20]
            y_top, y_bottom = ce["y1"] + 10, (min(below) - 30 if below else 1e9)
            name_right = ce["x0"] - 3
            # name lines: words in the name column, grouped by y
            lines: list[dict] = []
            for w in sorted((w for w in ws if y_top <= w["y0"] < y_bottom and w["x1"] <= name_right), key=lambda w: (w["y0"], w["x0"])):
                if lines and abs(lines[-1]["y"] - w["y0"]) <= 2:
                    lines[-1]["words"].append(w["t"])
                else:
                    lines.append({"y": w["y0"], "words": [w["t"]], "veg": False, "vegan": False})
            lines = [ln for ln in lines if not " ".join(ln["words"]).startswith(("These figures", "The data provided", "V3 10.09", "15.09.26"))]
            for w in ws:
                if w["t"] != "Yes" or not (y_top <= w["y0"] < y_bottom):
                    continue
                cx = (w["x0"] + w["x1"]) / 2
                col = "veg" if abs(cx - (vh["x0"] + vh["x1"]) / 2) < abs(cx - (gh["x0"] + gh["x1"]) / 2) else "vegan"
                if abs(cx - ((vh if col == "veg" else gh)["x0"] + (vh if col == "veg" else gh)["x1"]) / 2) > 25:
                    continue  # a "Yes" in some other column
                above = [ln for ln in lines if ln["y"] <= w["y0"] + 3]
                if above:
                    above[-1][col] = True
            i = 0
            while i < len(lines):
                for k in (5, 4, 3, 2, 1):
                    span = lines[i:i + k]
                    if len(span) < k:
                        continue
                    key = norm(" ".join(" ".join(ln["words"]) for ln in span))
                    if key in wanted:
                        found.setdefault(key, set()).add((any(ln["veg"] for ln in span), any(ln["vegan"] for ln in span)))
                        i += k
                        break
                else:
                    i += 1
    marks, conflicts = {}, []
    for key, vals in found.items():
        if len(vals) == 1:
            marks[key] = next(iter(vals))
        else:
            conflicts.append(key)
    return {"marks": marks, "conflicts": sorted(conflicts)}
