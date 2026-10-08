"""Read one of Sainsbury's Cafe menu PDFs into labelled energy values, by position.

Used by tools/uk_extract/sainsburys_cafe.py. Requires `pdftotext` (poppler). Values are returned exactly as printed (strings such as
"805", "<1"); nothing is converted, rounded or estimated here.

Each menu is ONE 1920 x 1080 pt page (an InDesign layout with a real text layer). Every value is printed as an energy triple:

    805kcal / 3369kJ / 40%RI          <1 kcal / <4 kJ / <1% RI          190kcal / 794kJ          (add 126kcal / 521kJ / 6% RI)

(the %RI part is missing on the kids' lines and the Babyccino; a triple inside "(add ...)" is the extra energy of a swapped option,
never the energy of the dish itself). Reading is by position, never by counting:

  1. every word of the text layer is found with its box (pdftotext -bbox) and the words are grouped into rows (same baseline);
  2. a row is split into segments wherever the gap between two words is wider than SEGMENT_GAP points; a segment whose text (without
     its prices and energy triples) equals a label we expect is that label's position;
  3. every energy triple belongs to the label that sits on its own row immediately to its left, else to the nearest label above it
     in the same column (the page is split into columns by x);
  4. the caller says how many main triples (n) and how many "(add ...)" triples (n_adds) each label must own, and (for the drinks table) in which
     horizontal band each triple must lie. Anything that does not fit (an unknown triple, a missing label, a wrong count, a triple
     in the wrong band) raises, so a new menu layout stops the run instead of attaching a number to the wrong dish.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
TRIPLE = re.compile(
    r"(?P<add>\(add\s+)?(?P<kcal><?\d+) ?kcal ?/ ?(?P<kj><?\d+) ?kJ(?: ?/ ?(?P<ri><?\d+) ?% ?RI)?")
PRICE = re.compile(r"\+?£\d+(?:\.\d\d)?|\bFree\b")
ROW_TOL = 3.5       # points: words whose centres are closer than this are on one row
SEGMENT_GAP = 20.0  # points: a wider gap between two words starts a new segment
SAME_ROW = 3.0      # points: a label this much below a triple still counts as being on the triple's row


def norm(text: str) -> str:
    """Whitespace collapsed, typographic apostrophe made plain, leading bullet dropped (for comparing labels)."""
    t = html.unescape(text).replace("’", "'").replace("‘", "'").replace(" ", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"^[••]\s*", "", t)


def read_page(pdf: Path) -> tuple[list[dict], list[dict]]:
    """Return (segments, triples) of the PDF's one page.

    segment: {text, x, y} (text without energy triples and prices); triple: {kcal, kj, ri, add, x, y}."""
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words = []
    for x0, y0, x1, y1, t in WORD.findall(out):
        text = html.unescape(t)
        if text.strip():
            words.append((float(x0), float(y0), float(x1), float(y1), text))
    words.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    rows: list[list[tuple]] = []
    centres: list[float] = []
    for w in words:
        yc = (w[1] + w[3]) / 2
        if rows and abs(centres[-1] - yc) <= ROW_TOL:
            rows[-1].append(w)
        else:
            rows.append([w])
            centres.append(yc)
    segments, triples = [], []
    for row, yc in zip(rows, centres):
        row.sort(key=lambda w: w[0])
        # energy triples: search the row's text joined with single spaces and map each match back to the word it starts in
        joined, starts = "", []
        for w in row:
            starts.append(len(joined))
            joined += w[4] + " "
        for m in TRIPLE.finditer(joined if "Reference Intake" not in joined else ""):  # the footer's "2000kcal / 8400kJ" is the RI, not a dish
            first = m.start("kcal")
            idx = max(i for i, s in enumerate(starts) if s <= first)
            triples.append(dict(kcal=m.group("kcal"), kj=m.group("kj"), ri=m.group("ri"), add=bool(m.group("add")), x=row[idx][0], y=yc))
        # segments
        cur = [row[0]]
        groups = []
        for w in row[1:]:
            if w[0] - cur[-1][2] > SEGMENT_GAP:
                groups.append(cur)
                cur = [w]
            else:
                cur.append(w)
        groups.append(cur)
        for g in groups:
            text = " ".join(w[4] for w in g)
            text = TRIPLE.sub(" ", text)
            text = PRICE.sub(" ", text)
            text = norm(text)
            if text:
                segments.append(dict(text=text, x=g[0][0], y=yc))
    segments.sort(key=lambda s: (s["y"], s["x"]))
    triples.sort(key=lambda t: (t["y"], t["x"]))
    return segments, triples


def locate(segments: list[dict], specs: list[dict], columns: dict, where: str) -> list[dict]:
    """Find each spec's label (spec: label, col) among the segments, in reading order within its column. Returns the specs with
    `x` and `y` of the label set. A label is the first unused segment with the same text in the column that is not above the
    previous label of that column (by more than SAME_ROW)."""
    used: set[int] = set()
    last_y = {c: -1e9 for c in columns}
    located = []
    for spec in specs:
        lo, hi = columns[spec["col"]]
        want = norm(spec["label"])
        found = None
        for i, s in enumerate(segments):
            if i in used or s["text"] != want or not (lo <= s["x"] < hi) or s["y"] < last_y[spec["col"]] - SAME_ROW:
                continue
            found = i
            break
        if found is None:
            raise SystemExit(f"{where}: label {spec['label']!r} (column {spec['col']}) is not printed where expected: the menu changed")
        used.add(found)
        last_y[spec["col"]] = segments[found]["y"]
        located.append(dict(spec, x=segments[found]["x"], y=segments[found]["y"]))
    return located


def attach(located: list[dict], triples: list[dict], columns: dict, where: str) -> list[dict]:
    """Give every triple to its label; check the counts and bands each spec asks for. Returns the specs with `main` and `adds`."""
    for spec in located:
        spec["main"], spec["adds"] = [], []

    def column_of(x: float) -> str:
        for name, (lo, hi) in columns.items():
            if lo <= x < hi:
                return name
        raise SystemExit(f"{where}: a value at x={x:.0f} lies outside every column")

    for t in triples:
        col = column_of(t["x"])
        above = [s for s in located if s["col"] == col and s["y"] <= t["y"] + SAME_ROW]
        if not above:
            raise SystemExit(f"{where}: the value {t['kcal']}kcal / {t['kj']}kJ at ({t['x']:.0f}, {t['y']:.0f}) has no label above it")
        top = max(s["y"] for s in above)
        row = [s for s in above if s["y"] >= top - SAME_ROW and s["x"] <= t["x"]]
        owner = max(row, key=lambda s: s["x"]) if row else max(above, key=lambda s: s["y"])
        (owner["adds"] if t["add"] else owner["main"]).append(t)
    for s in located:
        s["main"].sort(key=lambda t: t["x"])
        if len(s["main"]) != s.get("n", 1):
            raise SystemExit(f"{where}: {s['label']!r} owns {len(s['main'])} energy values, expected {s.get('n', 1)}: the menu changed")
        if len(s["adds"]) != s.get("n_adds", 0):
            raise SystemExit(f"{where}: {s['label']!r} owns {len(s['adds'])} '(add ...)' values, expected {s.get('n_adds', 0)}: the menu changed")
        for t, band in zip(s["main"], s.get("xs") or []):
            if not (band[0] <= t["x"] < band[1]):
                raise SystemExit(f"{where}: {s['label']!r} has a value at x={t['x']:.0f}, expected between {band[0]} and {band[1]}")
    return located
