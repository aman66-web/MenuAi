"""Compare an extraction of Tim Hortons UK's product pages with the chain's own "Nutrition" PDF.

Used by tools/uk_extract/tim_hortons.py --pdf. Needs `pdftotext` (poppler). The PDF is the same table the product pages show
(one row per product and size: portion, kJ, kcal, fat, saturates, carbohydrates, sugars, fibre, protein, salt, each with its
%RI columns), stamped with a version such as "C5 5.10.26 - v6". No number is read from it into the menu: `compare` only reports
rows whose printed numbers differ from the page's, and published products the PDF does not list.

The PDF also opens with "Allergen Information (UK & Ireland)": one row per product (no sizes) with Yes / No / Maybe under 19
columns (Wheat, Rye, Barley, Oats, Spelt, Kamut, Soya, Nuts, Peanuts, Sesame, Milk, Eggs, Fish, Crustaceans, Celery, Sulphur
Dioxide and Sulphites, Mustard, Molluscs, Lupin) and "Suitable for Vegetarians?". `read_allergens` returns it for
tim_hortons.py, which cross-checks the product pages' own "Allergens:" lines against it.
"""
from __future__ import annotations
import re
import subprocess
import unicodedata
from pathlib import Path

# The version stamp printed top right: "C5 5.10.26 - v6" (until 6 Oct 2026) or "C5 - 8.10.26 v7" (from 8 Oct 2026).
_VERSION = re.compile(r"C\d+ (?:\d+\.\d+\.\d+ - v\d+|- \d+\.\d+\.\d+ v\d+)")

# Column order of a PDF row after the name (the %RI columns are skipped).
_COLS = ("serving", "kj", "kcal", None, "fat", None, "sat", None, "carbs", None, "sugars", None, "fibre", "protein", None, "salt", None)
_KEYS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")


def _norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).replace("​", "")
    return re.sub(r"\s+", " ", s).strip().lower()


def _strip(cell: str) -> str:
    return re.sub(r"(kJ|Kcal|g)$", "", cell.replace(" ", ""))


def read_pdf_rows(pdf: Path) -> tuple[str, dict[str, list[dict[str, str]]]]:
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    version = _VERSION.search(text)
    start = text.find("Nutritional Information (UK & Ireland)")
    if start < 0:
        raise SystemExit("The PDF has no 'Nutritional Information' table: the layout changed, re-check the comparison.")
    rows: dict[str, list[dict[str, str]]] = {}
    lines = text[start:].splitlines()
    for n, line in enumerate(lines):
        cells = re.split(r"\s{2,}", line.strip())
        name = None
        if len(cells) == 1 + len(_COLS) and cells[2].endswith("kJ"):
            name = cells[0]
        elif len(cells) == len(_COLS) and cells[1].endswith("kJ") and 0 < n < len(lines) - 1:
            # a long name is wrapped: its first half is the line above the numbers, its second half the line below
            name = lines[n - 1].strip() + " " + lines[n + 1].strip()
            cells = [name] + cells
        if name is None:
            continue
        row = {k: _strip(v) for k, v in zip(_COLS, cells[1:]) if k and k != "serving"}
        row["serving"] = cells[1]
        rows.setdefault(_norm_name(name), []).append(row)
    return (version.group(0) if version else "unknown version"), rows


def compare(pdf: Path, rows: list[dict]) -> None:
    version, pdf_rows = read_pdf_rows(pdf)
    missing, differ, ok = [], [], 0
    for r in rows:
        key = _norm_name(r["base_name"] + (f" ({r['label']})" if r["label"] and r["label"] != "Medium" else ""))
        found = pdf_rows.get(key)
        if not found:
            missing.append(r["name"])
            continue
        diffs = []
        for k in _KEYS:
            if all(f.get(k) != r[k] for f in found):
                diffs.append(f"{k}: page {r[k]} / PDF {'/'.join(sorted({f.get(k, '?') for f in found}))}")
        if all(f["serving"].replace(" ", "") != r["serving_printed"].replace(" ", "") for f in found):
            diffs.append(f"serving: page {r['serving_printed']} / PDF {found[0]['serving']}")
        if diffs:
            differ.append(f"{r['name']}: " + "; ".join(diffs))
        else:
            ok += 1
    print(f"PDF {version} ({len(pdf_rows)} named rows): {ok} of {len(rows)} extracted rows agree on every printed number and serving")
    for line in missing:
        print(f"  not in the PDF: {line}")
    for line in differ:
        print(f"  differs: {line}")


# ---------------------------------------------------------------- allergen matrix
ALLERGEN_COLUMNS = ("Wheat", "Rye", "Barley", "Oats", "Spelt", "Kamut", "Soya", "Nuts", "Peanuts", "Sesame", "Milk", "Eggs", "Fish",
                    "Crustaceans", "Celery", "Sulphites", "Mustard", "Molluscs", "Lupin")
_AROW = re.compile(r"^(.*?)\s*((?:(?:Yes|No|Maybe)\s+){19}(?:Yes|No|Maybe))\s*$")
_SECTION = re.compile(r"^(\S[^()]*?) \((\d+) Items\)\s*$")


def norm_name(s: str) -> str:
    """Exact-name matching key: case, punctuation (including ®) and spacing ignored, nothing else."""
    s = unicodedata.normalize("NFKC", s).replace("\u200b", "").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def read_allergens(pdf: Path) -> tuple[str, dict[str, list[dict]]]:
    """The allergen matrix: (version, {norm_name: [{"name", "yes": {column}, "maybe": {column}}]}). Stops if the column
    headings move or a section's row count differs from the "(N Items)" it prints."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    version = _VERSION.search(text)
    start, end = text.find("Allergen Information (UK & Ireland)"), text.find("Nutritional Information (UK & Ireland)")
    if start < 0 or end < start:
        raise SystemExit("The PDF has no 'Allergen Information' table before the nutrition table: re-check the layout.")
    lines = text[start:end].splitlines()
    heads = [n for n, ln in enumerate(lines) if re.match(r"^\s*ALLERGENS\s", ln)]
    for n in heads:   # the 15 one-line headings, then the multi-line ones in this left-to-right order
        if lines[n].split()[1:] != list(ALLERGEN_COLUMNS[:15]):
            raise SystemExit(f"Allergen table headings changed: {lines[n].split()[1:]}")
        block = "\n".join(lines[max(0, n - 4):n + 6])
        cols = [min((ln.find(w) for ln in block.splitlines() if w in ln), default=-1)
                for w in ("Sulphur", "Mustard", "Molluscs", "Lupin", "Suitable")]
        if -1 in cols or cols != sorted(cols) or min(cols) <= lines[n].find("Celery"):
            raise SystemExit("Allergen table headings after Celery changed order: re-check ALLERGEN_COLUMNS.")
    rows: dict[str, list[dict]] = {}
    sections, current = [], None
    for n, ln in enumerate(lines):
        m = _SECTION.match(ln)
        if m:
            current = [m.group(1), int(m.group(2)), 0]
            sections.append(current)
            continue
        if current is not None and re.match(r"^\S.*\(Draft\)(?:\s+(?:Yes|No))?\s*$", ln):
            current[2] += 1   # a draft product with no allergen values, only the vegetarian column ("Timmies Minis Meal Deal (Draft)")
            continue
        m = _AROW.match(ln)
        if m:
            if current is None:
                raise SystemExit(f"Allergen row before any section heading: {ln.strip()!r}")
            current[2] += 1
            vals = m.group(2).split()
            name = m.group(1).strip()
            if not name:   # a long name is wrapped: its first half is the line above the values, its second half the line below
                above, below = lines[n - 1].strip(), lines[n + 1].strip()
                if not above or not below or _AROW.match(lines[n - 1]) or _AROW.match(lines[n + 1]):
                    raise SystemExit(f"Allergen row without a readable name near {ln.strip()[:40]!r}: re-check the layout.")
                name = f"{above} {below}"
            rows.setdefault(norm_name(name), []).append({
                "name": name,
                "yes": {c for c, v in zip(ALLERGEN_COLUMNS, vals) if v == "Yes"},
                "maybe": {c for c, v in zip(ALLERGEN_COLUMNS, vals) if v == "Maybe"}})
    bad = [f"{t}: prints {n} items, {k} rows read" for t, n, k in sections if n != k]
    if bad or not sections:
        raise SystemExit("Allergen table rows do not match the section counts: " + "; ".join(bad))
    return (version.group(0) if version else "unknown version"), rows
