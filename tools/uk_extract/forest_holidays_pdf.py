"""Reads the calories printed in Forest Holidays' menu PDFs (see forest_holidays.py).

The PDFs have a text layer in two columns. `pdftotext -layout` keeps each column cell on its own run of text, so a line is read as
fragments (cells separated by two or more spaces) and a dish is found by its printed name:
    mode 'same': 'The woodland breakfast 730kcal GFo, DFo' in one cell (also a name after a '| ': 'Nutella 324kcal V | Syrup 397kcal V');
    mode 'next': the name alone (with its price) and '448.5 | 451.5kcal with eggs VE, GFo, DF' as a cell of one of the next four lines.
Nothing is converted: figures are floats read exactly as printed ('1,063' -> 1063, '448.5' stays 448.5).
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

NUMS = r"\d[\d,]*(?:\.\d+)?(?:\s*\|\s*\d[\d,]*(?:\.\d+)?)*"
MARKS_ONLY = re.compile(r"^(?:VEo|VE|V|GFo|GF|DFo|DF)(?:\s*,\s*(?:VEo|VE|V|GFo|GF|DFo|DF))*$", re.I)


def read_pdf(path: Path) -> list:
    """The PDF's layout text as lines of fragments (runs separated by two or more spaces: one fragment is one column cell)."""
    text = subprocess.run(["pdftotext", "-layout", str(path), "-"], check=True, capture_output=True).stdout.decode("utf-8")
    return [[f for f in re.split(r" {2,}", line.replace("\t", "  ").strip()) if f] for line in text.splitlines()]


def kcal_tokens(lines: list) -> int:
    """How many 'NNNkcal' figures the PDF prints: a guard that the menu has not changed under the script."""
    return len(re.findall(r"\d\s*kcal\b", " \n".join("  ".join(f) for f in lines), re.I))


def _name_re(name: str) -> str:
    return r"\s+".join(re.escape(w) for w in name.split())


def _numbers(raw: str) -> list:
    return [float(x.replace(",", "")) for x in re.split(r"\s*\|\s*", raw.strip())]


def pdf_matches(lines: list, name: str, mode: str = "same") -> list:
    """Every printed (values, text after the kcal) for `name`, in reading order (top to bottom)."""
    found = []
    same = re.compile(r"(?:^|\|\s*)" + _name_re(name) + r"\s+(" + NUMS + r")\s*kcal\b([^|]*)", re.I)
    alone = re.compile(r"^" + _name_re(name) + r"(?:\s+\d+(?:\.\d+)?)?$", re.I)
    after = re.compile(r"^(" + NUMS + r")\s*kcal\b(.*)$", re.I)
    for i, frags in enumerate(lines):
        for k, f in enumerate(frags):
            if mode == "same":
                m = same.search(f)
                if m:
                    rest = m.group(2)
                    # the dietary marks sometimes wrap onto the next line ('...fries 312kcal 4.25' / 'VE, GF, DF')
                    if not re.search(r"[A-Za-z]", rest) and i + 1 < len(lines):
                        wrapped = [g for g in lines[i + 1] if MARKS_ONLY.match(g)]
                        if len(wrapped) == 1:
                            rest = rest + " " + wrapped[0]
                    found.append((_numbers(m.group(1)), rest))
            elif alone.match(f):
                done = False
                for j in range(i + 1, min(i + 5, len(lines))):
                    for g in lines[j]:
                        m = after.match(g)
                        if m:
                            found.append((_numbers(m.group(1)), m.group(2)))
                            done = True
                            break
                    if done:
                        break
    return found


def pdf_value(lines: list, name: str, site: str, mode: str = "same", nth: int = 0, count: int = 1, idx: int = 0):
    """(figure, text after it) for the nth of exactly `count` printed matches of `name`; stops if the layout or menu changed."""
    found = pdf_matches(lines, name, mode)
    if len(found) != count:
        raise SystemExit(f"{site} PDF: {name!r} is printed with calories {len(found)} time(s), expected {count}: the layout or menu changed")
    values, rest = found[nth]
    if idx >= len(values):
        raise SystemExit(f"{site} PDF: {name!r} prints {len(values)} figure(s), expected at least {idx + 1}")
    if len(values) > 1 and idx == 0 and mode == "same":
        raise SystemExit(f"{site} PDF: {name!r} prints several figures {values}: give idx")
    return values[idx], rest, found


def marks(rest: str) -> set:
    """The dietary marks printed after a figure ('GFo, DF'), lower-cased: ve, veo, v, gfo, gf, dfo, df."""
    part = re.split(r"[|\d]", rest)[0]
    return {m.lower() for m in re.findall(r"\b(VEo|VE|V|GFo|GF|DFo|DF)\b", part, re.I)}


def fmt(x: float) -> str:
    return f"{x:g}"
