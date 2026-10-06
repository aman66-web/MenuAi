"""Compare an extraction of Tim Hortons UK's product pages with the chain's own "Nutrition" PDF.

Used by tools/uk_extract/tim_hortons.py --pdf. Needs `pdftotext` (poppler). The PDF is the same table the product pages show
(one row per product and size: portion, kJ, kcal, fat, saturates, carbohydrates, sugars, fibre, protein, salt, each with its
%RI columns), stamped with a version such as "C5 5.10.26 - v6". Nothing is read from it into the menu: this only reports rows
whose printed numbers differ from the page's, and published products the PDF does not list.
"""
import re
import subprocess
import unicodedata
from pathlib import Path

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
    version = re.search(r"C\d+ \d+\.\d+\.\d+ - v\d+", text)
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
