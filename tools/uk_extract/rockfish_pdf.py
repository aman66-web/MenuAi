"""Read Rockfish's two official "Allergens, Gluten Free and Calories" PDFs (restaurant and takeaway menus).

Used by tools/uk_extract/rockfish.py. Needs `pdftotext` (poppler) for the words; the allergen marks need nothing else.

How the PDFs are built (InDesign, PDF 1.4, no text layer for the marks): every dish line prints its calories as text ("375 Kcal"),
and its allergens as small VECTOR ICONS drawn after each ingredient: BLUE icon = the ingredient contains the allergen, ORANGE icon =
may contain (the guide's own key: "Contains = Blue ~ May Contain = Orange"). The icons are not text, so pdftotext cannot see them.
This module therefore reads the page's drawing instructions itself (zlib + a tiny content-stream reader, standard library only):

  * every filled path in the two guide colours is an icon part, identified by its SHAPE (point count + coordinates scaled to its own
    bounding box, so the guide's different icon sizes still match);
  * the takeaway PDF's legend prints each allergen's name as real text beside its icon, which gives shape -> allergen for all 14
    (the restaurant PDF's legend labels are outlines, not text). Every icon shape used for a dish must be known from that legend:
    an unknown shape stops the run, a shape that would map to two allergens is never used;
  * words come from `pdftotext -bbox`; a dish's marks are the icons that sit between its heading line and the next dish's heading
    line, in the same column. Nothing is matched by name or guessed.
"""
from __future__ import annotations
import html
import re
import subprocess
import zlib
from pathlib import Path

H_BLUE = (0.93, 0.0, 0.36, 0.0)      # "Contains" (teal)
H_ORANGE = (0.0, 0.5, 1.0, 0.19)     # "May contain"
ALLERGEN_ORDER = ["Celery", "Crustacean", "Egg", "Fish", "Gluten", "Milk", "Molluscs", "Mustard", "Nuts", "Peanuts", "Sesame", "Soya",
                  "Sulphites", "Lupin"]
SHAPE_TOL = 0.03          # normalised units: two icon parts are the same shape if every point is this close
MARK_GAP = 0.6           # points: touching icon parts of one colour are one mark
LINE_GAP = 4.0            # words whose vertical centres are closer than this (chained) are on one line
ICON_LINE_MAX = 8.0       # for reading order only: an icon part sits on the nearest line of words if that line is at most this far away


class PdfReadError(RuntimeError):
    pass


# ------------------------------------------------------------------------------------------------ PDF objects and streams
def _objects(data: bytes) -> dict:
    objs = {}
    for m in re.finditer(rb"(?<![0-9])(\d+) 0 obj(.*?)endobj", data, re.S):
        objs[int(m.group(1))] = m.group(2)
    if len(objs) != data.count(b"endobj"):
        raise PdfReadError("PDF objects could not be listed one to one: the file's structure changed")
    return objs


def _refs(blob: bytes) -> list:
    return [int(n) for n in re.findall(rb"(\d+) 0 R", blob)]


def _page_numbers(objs: dict) -> list:
    root = next((n for n, b in objs.items() if re.search(rb"/Type\s*/Catalog", b)), None)
    if root is None:
        raise PdfReadError("no /Catalog object")
    pages_ref = int(re.search(rb"/Pages\s+(\d+) 0 R", objs[root]).group(1))

    def walk(n: int) -> list:
        b = objs[n]
        if re.search(rb"/Type\s*/Pages", b):
            kids = re.search(rb"/Kids\s*\[(.*?)\]", b, re.S).group(1)
            out = []
            for k in _refs(kids):
                out += walk(k)
            return out
        if re.search(rb"/Type\s*/Page(?![a-z])", b):
            return [n]
        raise PdfReadError(f"object {n} is neither a page nor a page tree")
    return walk(pages_ref)


def _stream(objs: dict, n: int) -> bytes:
    b = objs[n]
    i = b.index(b"stream")
    head, body = b[:i], b[i + 6:]
    body = body[2:] if body.startswith(b"\r\n") else body[1:] if body.startswith(b"\n") else body
    body = body[:body.rindex(b"endstream")]
    if b"/Filter" in head:
        if b"/FlateDecode" not in head or head.count(b"/Filter") != 1 or re.search(rb"/Filter\s*\[", head):
            raise PdfReadError(f"stream {n} uses a filter other than FlateDecode")
        body = zlib.decompress(body)
    return body


def _page_content(objs: dict, page: int) -> str:
    b = objs[page]
    if not re.search(rb"/Rotate\s+0", b):
        raise PdfReadError("page is rotated or has no /Rotate 0")
    mb = re.search(rb"/MediaBox\s*\[\s*([\d. -]+)\]", b)
    if not mb or [float(x) for x in mb.group(1).split()][:2] != [0.0, 0.0]:
        raise PdfReadError("page MediaBox does not start at 0 0")
    m = re.search(rb"/Contents\s*(\[[^\]]*\]|\d+ 0 R)", b)
    if not m:
        raise PdfReadError("page has no /Contents")
    parts = [_stream(objs, n) for n in _refs(m.group(1))]
    return b"\n".join(parts).decode("latin1")


# ------------------------------------------------------------------------------------------------ drawing instructions
_TOKEN = re.compile(r"\((?:\\.|[^\\)])*\)|<<.*?>>|\[[^\]]*\]|/[^\s/\[\]<>()]+|[^\s/\[\]<>()]+", re.S)
_OPERATOR = re.compile(r"^[A-Za-z*'\"]+$")


def _mul(a, b):
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def _close(c, ref) -> bool:
    return c is not None and len(c) == 4 and all(abs(a - b) < 0.02 for a, b in zip(c, ref))


def filled_paths(content: str) -> list:
    """Every filled path in the guide's two icon colours: {"pts": [(x, y)...] in page points (y up), "colour": "contains"|"may"}."""
    ctm, colour, stack, operands, path, out = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0), None, [], [], [], []
    for t in _TOKEN.findall(content):
        if not _OPERATOR.match(t):
            operands.append(t)
            continue
        op = t
        try:
            if op == "q":
                stack.append((ctm, colour))
            elif op == "Q":
                ctm, colour = stack.pop()
            elif op == "cm":
                ctm = _mul(tuple(float(x) for x in operands[-6:]), ctm)
            elif op == "k":
                colour = tuple(float(x) for x in operands[-4:])
            elif op in ("g", "rg", "sc", "scn", "cs"):
                colour = None
            elif op in ("m", "l", "c", "v", "y"):
                nums = [float(x) for x in operands]
                path += [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
            elif op == "re":
                x, y, w, h = (float(v) for v in operands[-4:])
                path += [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
            elif op in ("f", "F", "f*"):
                kind = "contains" if _close(colour, H_BLUE) else "may" if _close(colour, H_ORANGE) else None
                if kind and path:
                    out.append({"pts": [(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]) for x, y in path], "colour": kind})
                path = []
            elif op in ("S", "s", "B", "b", "B*", "b*", "n"):
                path = []
            elif op in ("BI", "ID", "EI"):
                raise PdfReadError("inline image in the page: the reader does not handle it")
        except (ValueError, IndexError) as e:
            raise PdfReadError(f"could not read operator {op} with operands {operands[-8:]}: {e}")
        operands = []
    return out


# ------------------------------------------------------------------------------------------------ shapes
def _bbox(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _normalised(pts):
    x0, y0, x1, y1 = _bbox(pts)
    w, h = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
    return [((x - x0) / w, (y - y0) / h) for x, y in pts]


class ShapeBook:
    """Shape classes shared by both PDFs: class id for a path, by point count and normalised coordinates."""

    def __init__(self):
        self.reps = []   # list of normalised point lists

    def classify(self, pts) -> int:
        n = _normalised(pts)
        for i, r in enumerate(self.reps):
            if len(r) == len(n) and all(abs(a[0] - b[0]) < SHAPE_TOL and abs(a[1] - b[1]) < SHAPE_TOL for a, b in zip(r, n)):
                return i
        self.reps.append(n)
        return len(self.reps) - 1


# ------------------------------------------------------------------------------------------------ words and lines
def _words(pdf: Path, page: int):
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    size = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', out)
    words = [{"x0": float(a), "y0": float(b), "x1": float(c), "y1": float(d), "text": html.unescape(w)} for a, b, c, d, w in
             re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out)]
    return float(size.group(2)), words


def read_pdf(pdf: Path, book: ShapeBook) -> list:
    """One dict per page: {"height", "words": [...], "parts": [one dict per filled icon-coloured path]} in top-left page points.
    The parts become marks only once the legend is known (build_marks)."""
    data = Path(pdf).read_bytes()
    objs = _objects(data)
    pages = []
    for number, obj in enumerate(_page_numbers(objs), 1):
        height, words = _words(pdf, number)
        parts = []
        for p in filled_paths(_page_content(objs, obj)):
            x0, y0, x1, y1 = _bbox(p["pts"])
            parts.append({"x0": x0, "y0": height - y1, "x1": x1, "y1": height - y0, "cx": (x0 + x1) / 2, "cy": height - (y0 + y1) / 2,
                          "colour": p["colour"], "cls": book.classify(p["pts"])})
        pages.append({"height": height, "words": words, "parts": parts})
    return pages


def legend_classes(page: dict) -> dict:
    """shape class -> allergen name, from a legend printed as TEXT labels with the icon to the left of each label (takeaway PDF).
    A class seen under two different allergens is None (ambiguous: never used to name anything)."""
    labels = {}
    for w in page["words"]:
        if w["text"] in ALLERGEN_ORDER and w["x0"] > 400:        # the legend column; the same words also occur in running text
            labels[w["text"]] = w
    if sorted(labels) != sorted(ALLERGEN_ORDER):
        raise PdfReadError(f"legend labels found: {sorted(labels)}; expected all 14 allergen names")
    seen = {}
    for name, w in labels.items():
        cy = (w["y0"] + w["y1"]) / 2
        found = [p for p in page["parts"] if abs(p["cy"] - cy) < 8 and 0 < w["x0"] - p["x1"] < 24]
        if not found:
            raise PdfReadError(f"legend: no icon left of the label {name}")
        for p in found:
            seen.setdefault(p["cls"], set()).add(name)
    mapping = {cls: (next(iter(n)) if len(n) == 1 else None) for cls, n in seen.items()}
    if sorted({v for v in mapping.values() if v}) != sorted(ALLERGEN_ORDER):
        raise PdfReadError("legend: some allergen has no unambiguous icon shape")
    return mapping


def build_marks(page: dict, mapping: dict) -> None:
    """Group a page's icon parts into marks (page["marks"]): one allergen icon is one to ten filled paths. Parts join when they are
    the same colour, the legend gives them the same allergen and their boxes touch (MARK_GAP); a part whose shape the legend does not
    show (the sulphites mark's tiny subscript 2 is its own path) joins the known part whose box contains it, and an unknown shape
    that is inside no known part stops the run. Parts of different allergens are never merged, even when they touch.
    Each mark: {"x0","y0","x1","y1","cx","cy","colour","allergen","classes"}."""
    parts = page["parts"]
    name = [mapping.get(p["cls"]) for p in parts]
    parent = list(range(len(parts)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    known = [i for i in range(len(parts)) if name[i]]
    known.sort(key=lambda i: parts[i]["x0"])
    for a, i in enumerate(known):
        pi = parts[i]
        for j in known[a + 1:]:
            pj = parts[j]
            if pj["x0"] > pi["x1"] + MARK_GAP + 30:
                break
            if name[i] == name[j] and pi["colour"] == pj["colour"] and pj["x0"] <= pi["x1"] + MARK_GAP and pi["x0"] <= pj["x1"] + MARK_GAP \
                    and pj["y0"] <= pi["y1"] + MARK_GAP and pi["y0"] <= pj["y1"] + MARK_GAP:
                parent[find(i)] = find(j)
    for i in range(len(parts)):
        if name[i]:
            continue
        p = parts[i]
        host = [j for j in known if parts[j]["colour"] == p["colour"] and parts[j]["x0"] - 0.1 <= p["x0"] and p["x1"] <= parts[j]["x1"] + 0.1
                and parts[j]["y0"] - 0.1 <= p["y0"] and p["y1"] <= parts[j]["y1"] + 0.1]
        if len({name[j] for j in host}) != 1:
            raise PdfReadError(f"icon shape {p['cls']} at x={p['x0']:.0f} y={p['y0']:.0f} is not in the legend and sits in no known icon")
        parent[find(i)] = find(host[0])
    groups = {}
    for i in range(len(parts)):
        groups.setdefault(find(i), []).append(i)
    marks = []
    for g in groups.values():
        gp = [parts[i] for i in g]
        x0, y0, x1, y1 = min(p["x0"] for p in gp), min(p["y0"] for p in gp), max(p["x1"] for p in gp), max(p["y1"] for p in gp)
        names = {name[i] for i in g if name[i]}
        marks.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "colour": gp[0]["colour"],
                      "allergen": next(iter(names)), "classes": sorted({p["cls"] for p in gp})})
    page["marks"] = marks


def read_strip(page: dict, x0: float, x1: float, y0: float, y1: float):
    """Word lines (top to bottom) and icon parts inside a column rectangle (page points, y down).
    Each line: {"cy", "top", "words": [..left to right], "text"}. Marks: the page's dicts, unchanged."""
    words = []
    for w in page["words"]:
        cx, cy = (w["x0"] + w["x1"]) / 2, (w["y0"] + w["y1"]) / 2
        if x0 <= cx < x1 and y0 <= cy < y1:
            words.append(dict(w, cx=cx, cy=cy))
    words.sort(key=lambda t: (t["cy"], t["cx"]))
    groups, cur = [], []
    for t in words:
        if cur and t["cy"] - cur[-1]["cy"] > LINE_GAP:
            groups.append(cur)
            cur = []
        cur.append(t)
    if cur:
        groups.append(cur)
    lines = []
    for g in groups:
        g.sort(key=lambda t: t["cx"])
        lines.append({"cy": sum(t["cy"] for t in g) / len(g), "top": min(t["y0"] for t in g), "words": g, "text": " ".join(t["text"] for t in g)})
    icons = [ic for ic in page["marks"] if x0 <= ic["cx"] < x1 and y0 <= ic["cy"] < y1]
    return lines, icons


def find_anchors(lines: list, starts: list) -> list:
    """Line index of each start text, in order (each must begin a line after the previous anchor's line). Stops when one is missing."""
    out, at = [], 0
    for text in starts:
        for i in range(at, len(lines)):
            if lines[i]["text"].startswith(text):
                out.append(i)
                at = i + 1
                break
        else:
            raise PdfReadError(f"heading line starting {text!r} not found (after line {at - 1}): the menu layout changed")
    return out


def reading_order(lines: list, icons: list, words: list) -> list:
    """Words and icon parts of one dish in reading order. An icon sits on the nearest line of words when that is close; an icon with
    no line of words beside it (a wrapped row of marks) takes the average height of the icons around it."""
    line_cys = [ln["cy"] for ln in lines]
    items = []
    for w in words:
        nearest = min(line_cys, key=lambda c: abs(c - w["cy"]))
        items.append((nearest, w["cx"], "word", w))
    loose = []
    for ic in icons:
        nearest = min(line_cys, key=lambda c: abs(c - ic["cy"])) if line_cys else None
        if nearest is not None and abs(nearest - ic["cy"]) <= ICON_LINE_MAX:
            items.append((nearest, ic["cx"], "icon", ic))
        else:
            loose.append(ic)
    loose.sort(key=lambda t: t["cy"])
    row = []
    for ic in loose + [None]:
        if ic is not None and (not row or ic["cy"] - row[-1]["cy"] <= LINE_GAP):
            row.append(ic)
            continue
        if row:
            y = sum(t["cy"] for t in row) / len(row)
            items += [(y, t["cx"], "icon", t) for t in row]
        row = [ic] if ic is not None else []
    items.sort(key=lambda t: (round(t[0], 1), t[1]))
    return [(kind, obj) for _, _, kind, obj in items]


def paren_groups(sequence: list) -> list:
    """(words inside one pair of brackets, the icon part just before the bracket in reading order) for every bracketed group."""
    out, last_icon, i = [], None, 0
    while i < len(sequence):
        kind, obj = sequence[i]
        if kind == "icon":
            last_icon = obj
        elif obj["text"].startswith("("):
            before, words, j = last_icon, [obj["text"]], i
            while not words[-1].endswith(")") and j + 1 < len(sequence):
                j += 1
                if sequence[j][0] == "word":
                    words.append(sequence[j][1]["text"])
            out.append((" ".join(words), before))
            i = j
        i += 1
    return out
