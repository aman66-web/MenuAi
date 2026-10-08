"""Reader for JW Lees' four "Allergen & Calorie" menu PDFs (see jw_lees.py).

Every PDF is a list of dishes. Each dish is the dish text (name and description run together), its energy ("Energy: 175 kcal", or just
"175 kcal" in a right-hand column) and, below it, optional lines "YES: ..." (contains) and "MAY CONTAIN: ...". The text layer is read with
`pdftotext -layout` (poppler). The dish text and the energy are NOT always on the same line (the energy can sit in the middle of a wrapped
description, or on its own line), so a dish is read as a BLOCK of lines: from the line that starts the dish up to the line before the
next dish starts. jw_lees.py lists every dish and heading it expects, in order, with the text its first line starts with; this reader
walks the lines against that list and stops if anything differs (a dish added, removed, renamed or moved, a heading changed, a block
with no energy or two energies), so a human re-checks the table when JW Lees publishes a new menu.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

ENERGY = re.compile(r"(?:\|\s*)?(?:Energy:\s*)?(\d[\d,]*)\s*kcal\b")
ENERGY_NOT_SUPPLIED = "Energy not supplied"
MARKER = re.compile(r"\b(YES:|MAY CONTAIN:|ALLERGENS:)")
DIET_CODES = {"V", "VG", "VGA", "NGCI"}  # printed in brackets after a dish; the PDFs do not define them


def read_lines(pdf: Path) -> list:
    """Text lines of the PDF (pages in order), whitespace collapsed, empty lines dropped."""
    proc = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
    lines = []
    for page in proc.stdout.decode("utf-8").split("\f"):
        for line in page.splitlines():
            line = " ".join(line.split())
            if line:
                lines.append(line)
    return lines


def split_blocks(lines: list, table: list, label: str) -> list:
    """Walk `lines` against `table` (entries ("T", exact line) | ("H", exact heading) | ("D", starts-with text, ...)).
    Returns [(entry, [lines of its block])] for the "D" entries. Stops on any difference."""
    blocks, current, ei = [], None, 0
    for ln in lines:
        if ei < len(table):
            e = table[ei]
            hit = (ln == e[1]) if e[0] in ("T", "H") else ln.startswith(e[1])
            if hit:
                ei += 1
                if e[0] == "D":
                    current = (e, [ln])
                    blocks.append(current)
                else:
                    current = None
                continue
        if current is None:
            raise SystemExit(f"{label}: unexpected line {ln!r} where {table[ei][1]!r} was expected: the menu changed, update the table in jw_lees.py")
        current[1].append(ln)
    if ei != len(table):
        raise SystemExit(f"{label}: the PDF ends before {table[ei][1]!r}: the menu changed, update the table in jw_lees.py")
    return blocks


def parse_block(lines: list, label: str) -> dict:
    """One dish block -> dict(printed, kcal or None, yes, may, server). `printed` is the dish text with the energy removed."""
    text = " ".join(lines)
    m = MARKER.search(text)
    head, tail = (text[:m.start()], text[m.start():]) if m else (text, "")
    energies = ENERGY.findall(text)
    if len(energies) > 1:
        raise SystemExit(f"{label}: more than one energy value in one dish block ({text!r}): a dish was added to the PDF?")
    if energies and not ENERGY.search(head):
        raise SystemExit(f"{label}: the energy value comes after the allergen lines ({text!r}): check the layout")
    kcal = energies[0].replace(",", "") if energies else None  # "1,041" is a thousands comma, not a decimal
    printed = ENERGY.sub("", head)
    printed = printed.replace(ENERGY_NOT_SUPPLIED, "").replace("Energy:", "")
    printed = " ".join(printed.replace(" | ", " ").replace("|", " ").split())
    yes, may, server = [], [], False
    if tail:
        if "ALLERGENS:" in tail:
            server = "See server" in tail
            if not server:
                raise SystemExit(f"{label}: an ALLERGENS: line that is not 'See server': {tail!r}")
        else:
            ym = re.search(r"YES:\s*(.*?)(?=MAY CONTAIN:|$)", tail)
            mm = re.search(r"MAY CONTAIN:\s*(.*)$", tail)
            if ym:
                yes = [w.strip() for w in ym.group(1).split(",") if w.strip()]
            if mm:
                may = [w.strip() for w in mm.group(1).split(",") if w.strip()]
            leftover = re.sub(r"YES:\s*.*?(?=MAY CONTAIN:|$)", "", tail)
            leftover = re.sub(r"MAY CONTAIN:\s*.*$", "", leftover).strip()
            if leftover:
                raise SystemExit(f"{label}: unread text in the allergen lines: {leftover!r}")
    return dict(printed=printed, kcal=kcal, yes=yes, may=may, server=server, raw=text)


def diet_marks(printed: str) -> tuple:
    """Bracketed diet codes of the dish text -> (codes at the very end of the text, codes in the middle). Codes are V, VG, VGA, NGCI
    (any bracket whose every part is one of them); other brackets such as (small) or (beef) are not diet codes. A code in the middle of
    the text (e.g. '... cheese & chive sauce (V) or gravy') may refer to one part of the dish, so it is never used for a tag."""
    s = printed.rstrip(" *")
    at_end, inside = [], []
    for m in re.finditer(r"\(([A-Za-z/]+)\)", s):
        parts = m.group(1).split("/")
        if all(p in DIET_CODES for p in parts):
            (at_end if s[m.end():].strip(" *") == "" else inside).extend(parts)
    return at_end, inside


def read_menu(pdf: Path, table: list, label: str) -> list:
    """-> [(entry, parsed dish dict)] in printed order."""
    return [(e, parse_block(b, f"{label}: {e[1]!r}")) for e, b in split_blocks(read_lines(pdf), table, label)]
