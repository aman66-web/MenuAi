"""Shared reader for 10kites ("Tenkites") menu pages: menus.tenkites.com, viewthe.menu and tkmenus.com.

Used by cote_brasserie.py, giggling_squid.py, banana_tree.py, gourmet_burger_kitchen.py and slug_and_lettuce.py
(see docs/UK_DATA_PLAYBOOK.md). 10kites serves one family of server-rendered pages with four layouts; this module
reads all four with only the standard library and returns one plain record per printed nutrition table:

    {"name", "desc", "course": [section names, outermost first], "nutrients": {printed column name: text as printed},
     "yes_labels": [dietary labels the page ticks, e.g. "Vegan"], "recipe_id", "group", "check": {...}}

Nothing here converts, rounds or estimates: values are the page's own text ("-" means not published). Each record also
carries what the page prints about the dish's allergens (`allergen_src`) and the page's own label list (`label_map`);
`allergens_from_rec()` turns those into the dish's allergens, checked against every other form the page prints them in.
Layouts:

  table    one row per dish with a nutrient column per header, plus a card with a second copy of the numbers
           (Cote, Giggling Squid). The card's copy is compared with the row's copy and a mismatch stops the run.
  modal    a pop-up per dish with a two-column nutrient table (Banana Tree). Dishes that belong to a "build your own"
           block (a main item plus its option rows such as "With Spicy Mayo") carry the block's name in `group`.
  perfect  a pop-up per dish with a row per nutrient; the dish name is printed in the pop-up header (Gourmet Burger
           Kitchen).
  items    an info box per dish with a name/value pair per nutrient (Slug & Lettuce on tkmenus.com).

Run `python3 tools/uk_extract/tenkites_b.py page.html` to print a one-line summary per record.
"""
from __future__ import annotations
import html
import re
import sys
import time
import unicodedata
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "cls")

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent = tag, attrs, parent
        self.children: list = []
        self.cls = frozenset((attrs.get("class") or "").split())

    def has(self, c: str) -> bool:
        return c in self.cls

    def iter(self):
        """Depth-first over this node and every element below it."""
        stack = [self]
        while stack:
            n = stack.pop()
            yield n
            stack.extend(c for c in reversed(n.children) if isinstance(c, Node))

    def find_all(self, cls: str | None = None, tag: str | None = None, attr: str | None = None):
        return [n for n in self.iter()
                if (cls is None or cls in n.cls) and (tag is None or n.tag == tag) and (attr is None or attr in n.attrs)]

    def find(self, cls: str | None = None, tag: str | None = None, attr: str | None = None):
        for n in self.iter():
            if (cls is None or cls in n.cls) and (tag is None or n.tag == tag) and (attr is None or attr in n.attrs):
                return n
        return None

    def text(self, skip: tuple[str, ...] = ()) -> str:
        """All text below, whitespace collapsed; elements carrying any class in `skip` are left out."""
        out: list[str] = []

        def walk(n):
            for c in n.children:
                if isinstance(c, str):
                    out.append(c)
                elif not (skip and any(s in c.cls for s in skip)) and c.tag not in ("script", "style"):
                    walk(c)
        walk(self)
        return " ".join("".join(out).split())

    def ancestors(self):
        n = self.parent
        while n is not None:
            yield n
            n = n.parent


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, None)
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, {k: (v or "") for k, v in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = Node(tag, {k: (v or "") for k, v in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse_html(text: str) -> Node:
    b = _Builder()
    b.feed(text)
    b.close()
    return b.root


def _clean(s: str) -> str:
    return " ".join(s.split())


COURSE_SKIP_CLASSES = ("k10-course", "k10-course__body", "k10-l-body", "k10-recipe", "k10-recipe__wrapper")


def _course_name(course: Node) -> str:
    """The title of a course/section node: its own `k10-course__name`, not one from a nested course."""
    stack = [c for c in reversed(course.children) if isinstance(c, Node)]
    while stack:
        n = stack.pop()
        if n.has("k10-course__name") and not n.has("k10-course"):
            txt = n.find("k10-course__name-text")
            return _clean((txt or n).text())
        if n.has("k10-course") or n.has("k10-l-body") or n.has("k10-recipe") or n.has("k10-byo"):
            continue
        stack.extend(c for c in reversed(n.children) if isinstance(c, Node))
    return ""


def course_path(node: Node) -> list[str]:
    names = []
    for a in node.ancestors():
        if a.has("k10-course"):
            nm = _course_name(a)
            if nm:
                names.append(nm)
    return list(reversed(names))


def _yes_labels(node: Node) -> list[str]:
    out = []
    for lab in node.find_all(attr="data-label-name"):
        if lab.attrs.get("data-label-name") == "LabelValueYes":
            for a in lab.ancestors():
                if "data-label-id" in a.attrs:
                    out.append(a.attrs["data-label-name"].strip())
                    break
    return out


# printed line heading -> slot ("Suitable for: Vegan, Vegetarian" is a diet line, not an allergen line)
LINE_HEADS = {"contains": "contains", "may contain": "may", "dish ingredients may also contain": "may", "suitable for": None}


def _dietary_lines(box: Node | None) -> dict:
    """The 'Contains: ...' and 'May contain: ...' lines printed in a dish's dietary box ('' when a line is absent).
    Stops on a line heading not in LINE_HEADS, so a new kind of line can't be missed."""
    out = {"contains": "", "may": ""}
    if box is None:
        return out
    for line in [c for c in box.children if isinstance(c, Node)]:
        txt = _clean(line.text())
        if not txt:
            continue
        head, sep, rest = txt.partition(":")
        slot = LINE_HEADS.get(head.strip().lower(), "?") if sep else "?"
        if slot == "?":
            raise ValueError(f"dietary line {txt!r} not known: map its heading in LINE_HEADS after checking the page")
        if slot:
            if out[slot]:
                raise ValueError(f"two {slot!r} lines in one dietary box: {txt!r}")
            out[slot] = rest.strip()
    return out


def _label_ids(node: Node | None) -> dict:
    """The dish's label ids as the page stores them for its allergen filter: data-all-labels (contains + may contain) and
    data-no-may-labels (contains only). None when the dish carries no such attributes."""
    if node is None or "data-all-labels" not in node.attrs or "data-no-may-labels" not in node.attrs:
        return {"ids_all": None, "ids_no_may": None}
    split = lambda s: [x.strip() for x in s.split(",") if x.strip()]  # noqa: E731
    return {"ids_all": split(node.attrs["data-all-labels"]), "ids_no_may": split(node.attrs["data-no-may-labels"])}


def page_labels(root: Node) -> dict[str, str]:
    """{label id: name} as the page itself prints them (its allergen filter and, on the table layout, its column heads)."""
    out: dict[str, str] = {}
    for n in root.find_all(attr="data-label-id"):
        nm = _clean(n.attrs.get("data-label-name", ""))
        if not nm or nm.startswith("LabelValue"):
            continue
        if out.setdefault(n.attrs["data-label-id"], nm) != nm:
            raise ValueError(f"label id {n.attrs['data-label-id']} is printed as both {out[n.attrs['data-label-id']]!r} and {nm!r}")
    return out


# ---------------------------------------------------------------- layout: table (Cote, Giggling Squid)
def _read_table(root: Node) -> list[dict]:
    recs = []
    for w in root.find_all("k10-recipe__wrapper"):
        namenode = w.find("k10-w-recipe__name") or w.find("k10-w-byo-sub-item__name") or w.find("k10-byo-item__name")
        if namenode is None:
            raise ValueError("table layout: a dish row without a name")
        nutrients = {}
        for d in w.find_all(attr="data-nutrient-name"):
            nutrients[d.attrs["data-nutrient-name"]] = _clean(d.text())
        # second printed copy (the card): header spans then value spans; must agree with the row
        card = w.find("k10-recipe__nutrients-table")
        check = {}
        if card is not None:
            rows = card.find_all("k10-recipe__nutrients-table-row")
            if len(rows) == 2:
                names = [_clean(s.text()) for s in rows[0].find_all("k10-recipe__nutrient-name")]
                vals = [_clean(s.text()) for s in rows[1].find_all("k10-recipe__nutrient-value")]
                if len(names) != len(vals):
                    raise ValueError(f"table layout: card names/values differ for {_clean(namenode.text())}")
                check = dict(zip(names, vals))
        if check and check != nutrients:
            raise ValueError(f"table layout: row and card disagree for {_clean(namenode.text())}: {nutrients} vs {check}")
        desc = w.find("k10-recipe__desc")
        ingr = w.find("k10-recipe__ingredients-wrapper")
        # allergens: the row's yes/may/no column per label, the card's "Contains:" / "May contain:" lines, the row's label ids
        marks: dict[str, str] = {}
        for col in w.find_all("k10-recipe__label", attr="data-label-id"):
            state = [c for c in col.iter() if c is not col and "data-label-name" in c.attrs]
            if len(state) != 1:
                raise ValueError(f"table layout: label column {col.attrs.get('data-label-name')!r} without one state for {_clean(namenode.text())}")
            lname = _clean(col.attrs.get("data-label-name", ""))
            if lname in marks:
                raise ValueError(f"table layout: label column {lname!r} printed twice for {_clean(namenode.text())}")
            marks[lname] = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}[state[0].attrs["data-label-name"]]
        row = w.find(attr="data-all-labels")
        lines = _dietary_lines(w.find("k10-recipe__label-names-wrapper"))
        group, sub = "", ""
        for a in w.ancestors():  # a dish inside a "build your own" block: the block's title and its section's title
            if not sub and a.has("k10-byo__section"):
                sn = a.find("k10-byo__section-name")
                sub = _clean(sn.text()) if sn else ""
            if a.tag == "div" and a.has("k10-byo"):
                bn = a.find("k10-byo__name")
                group = _clean(bn.text()) if bn else ""
                break
        recs.append({
            "name": _clean(namenode.text()), "desc": _clean(desc.text()) if desc else "",
            "course": course_path(w), "nutrients": nutrients, "yes_labels": _yes_labels(w),
            "recipe_id": (w.find(attr="data-recipe-id") or w).attrs.get("data-recipe-id", ""), "group": group, "sub": sub,
            "ingredients": _clean(ingr.text()) if ingr else "",
            "allergen_src": {"marks": marks, "marks_all": True, **lines, **_label_ids(row)},
        })
    return recs


# ---------------------------------------------------------------- layout: modal (Banana Tree)
def _read_modal(root: Node) -> list[dict]:
    recs = []
    blocks: dict[int, list[dict]] = {}
    for m in root.find_all("k10-recipe-modal", tag="section"):
        namenode = m.find("k10-recipe-modal__recipe-name")
        if namenode is None:
            raise ValueError("modal layout: a pop-up without a name")
        nutrients = {}
        for tr in m.find_all("k10-recipe-modal__tr", tag="tr"):
            val = tr.find("k10-recipe-modal__td_val")
            nutrients[tr.attrs["data-nutr-name"]] = _clean(val.text()) if val else ""
        caption = m.find("k10-recipe-modal__component_nutrients")
        basis = _clean(caption.find("k10-recipe-modal__caption").text()) if caption and caption.find("k10-recipe-modal__caption") else ""
        # a dish inside a "build your own" block (div.k10-byo): the block's title; `level` is "sub" for an option offered
        # on top of the block's main items (sides, extras, add-ons) and "root" for the block's own items
        grp, block, level = "", None, ""
        for a in m.ancestors():
            if level == "" and a.has("k10-byo__section") and any(c.startswith("k10-byo__section_sub") for c in a.cls):
                level = "sub"
            if a.tag == "div" and a.has("k10-byo"):
                nm = a.find("k10-byo__name")
                grp = _clean(nm.text()) if nm else ""
                block = id(a)
                level = level or "root"
                break
        desc = m.find("k10-recipe-modal__recipe-desc")
        # allergens: the pop-up's "Contains:" / "May contain:" sections and the label ids on the dish the pop-up belongs to
        lines: dict = {"contains": None, "may": None}
        none_stated = False
        for sec in m.find_all("k10-recipe-modal__section"):
            kind = [c for c in sec.cls if c.startswith("k10-recipe-modal__section_")]
            head, vals = sec.find("k10-recipe-modal__section-header"), sec.find("k10-recipe-modal__section-values")
            if not kind and head is None and _clean(sec.text()) == "This dish contains none of the listed allergens":
                none_stated = True
                continue
            if len(kind) != 1 or head is None or vals is None:
                raise ValueError(f"modal layout: an unknown dietary section in {_clean(namenode.text())}")
            slot = {"k10-recipe-modal__section_contains": "contains", "k10-recipe-modal__section_may": "may",
                    "k10-recipe-modal__section_suitable": None}.get(kind[0], "?")
            if slot == "?" or (slot and _clean(head.text()).rstrip(":").lower() != {"contains": "contains", "may": "may contain"}[slot]):
                raise ValueError(f"modal layout: dietary section {kind[0]} / {_clean(head.text())!r} not known ({_clean(namenode.text())})")
            if slot:
                if lines[slot] is not None:
                    raise ValueError(f"modal layout: two {slot} sections in {_clean(namenode.text())}")
                lines[slot] = _clean(vals.text())
        if none_stated and (lines["contains"] or lines["may"]):
            raise ValueError(f"modal layout: {_clean(namenode.text())} says it contains none of the allergens but lists some")
        owner = next((a for a in m.ancestors() if "data-all-labels" in a.attrs), None)
        rec = {
            "name": _clean(namenode.text()), "desc": _clean(desc.text()) if desc else "",
            "course": course_path(m), "nutrients": nutrients,
            "yes_labels": [], "recipe_id": m.attrs.get("data-recipe-id", ""), "group": grp, "level": level,
            "check": {"basis": basis, "labels": [_clean(x.text()) for x in m.find_all("k10-recipe-modal__label-info")]},
            "allergen_src": {"marks": None, "contains": lines["contains"] or "", "may": lines["may"] or "",
                             **_label_ids(owner)},
        }
        recs.append(rec)
        if block is not None:
            blocks.setdefault(block, []).append(rec)
    for members in blocks.values():
        has_root = any(r["level"] == "root" for r in members)
        for r in members:
            r["group_has_root"] = has_root
    return recs


# ---------------------------------------------------------------- layout: perfect (Gourmet Burger Kitchen)
def _read_perfect(root: Node) -> list[dict]:
    recs = []
    for r in root.find_all("k10-recipe_menu-item"):
        if "data-recipe-id" not in r.attrs:
            continue
        head = r.find("k10-recipe__byo-recipe_name")
        if head is None:
            raise ValueError("perfect layout: a dish without a pop-up header")
        title = _clean(head.text(skip=("k10-recipe__nutrient",)))
        energy_txt = _clean((head.find("k10-recipe__nutrient_energy") or head).text()) if head.find("k10-recipe__nutrient_energy") else ""
        nutrients = {}
        for v in r.find_all("k10-recipe__nutrient-value", attr="data-nutr-name"):
            nutrients[v.attrs["data-nutr-name"]] = _clean(v.text())
        desc = r.find("k10-recipe__byo-recipe_desc")
        card_name = _clean(r.find("k10-recipe__name").text(skip=("k10-recipe__nutrient",)))
        suit = r.find("k10-recipe__labels_suitableFor")  # "Suitable for Vegan,Vegetarian"
        suitable = [x.strip() for x in _clean(suit.text()).removeprefix("Suitable for").split(",") if x.strip()] if suit else []
        # allergens: the pop-up's table, one row per allergen present with a "Contain" and a "May Contain" column (the column
        # that does not apply is hidden), and the label ids on the dish
        tables = r.find_all("k10-recipe__labels_allergens")
        if len(tables) != 1:
            raise ValueError(f"perfect layout: {title!r} has {len(tables)} allergen tables")
        heads = [_clean(h.text()) for h in tables[0].find_all("k10-modal-perfect__table-header-value")]
        msg = [_clean(x.text()) for x in tables[0].find_all("k10-modal-perfect__table-message")]
        if not (heads == ["Contain", "May Contain"] and not msg) and not (
                not heads and msg == ["This dish contains none of the listed allergens"]
                and not tables[0].find_all("k10-modal-perfect__table-row")):
            raise ValueError(f"perfect layout: allergen table {heads!r} / {msg!r} for {title!r} not known")
        marks: dict[str, str] = {}
        for row in tables[0].find_all("k10-modal-perfect__table-row"):
            lname = _clean(row.find("k10-modal-perfect__table-name").text())
            shown = [c for v in row.find_all("k10-recipe__label-value") if "k10-recipe__label-value_hidden" not in v.cls
                     for c in v.cls if c in ("k10-recipe__label-value_yes", "k10-recipe__label-value_may")]
            if len(shown) != 1 or lname in marks:
                raise ValueError(f"perfect layout: allergen row {lname!r} of {title!r} is not exactly one of Contain / May Contain")
            marks[lname] = "yes" if shown[0].endswith("_yes") else "may"
        recs.append({
            "name": title, "desc": _clean(desc.text()) if desc else "",
            "course": course_path(r), "nutrients": nutrients, "yes_labels": suitable,
            "recipe_id": r.attrs["data-recipe-id"], "group": "",
            "check": {"card_name": card_name, "header_energy": energy_txt},
            "allergen_src": {"marks": marks, "marks_all": False, "contains": None, "may": None, **_label_ids(r)},
        })
    return recs


# ---------------------------------------------------------------- layout: items (Slug & Lettuce)
def _read_items(root: Node) -> list[dict]:
    recs = []
    for r in root.find_all("k10-recipe", tag="div"):
        namenode = r.find("k10-recipe__name-val")
        if namenode is None:
            continue
        if r.has("k10-recipe_menu-item"):
            kind = "item"
        elif r.has("k10-byo_core"):
            kind = "core"
        elif r.has("k10-byo_option"):
            kind = "option"
        else:
            raise ValueError(f"items layout: unknown dish block {sorted(r.cls)}")
        energy = namenode.find("k10-recipe__nutrient_energy")
        name = _clean(namenode.text(skip=("k10-recipe__nutrient_energy",)))
        tables = r.find_all("k10-recipe__nutrients-table_desktop")
        mobile = r.find_all("k10-recipe__nutrients-table_mobile")
        if len(tables) != 1 or len(mobile) != 1:
            raise ValueError(f"items layout: {name!r} has {len(tables)} desktop and {len(mobile)} mobile tables")

        def pairs(t):
            d = {}
            for it in t.find_all("k10-recipe__nutrients-item"):
                d[_clean(it.find("k10-recipe__nutrients-name").text())] = _clean(it.find("k10-recipe__nutrients-value").text())
            return d
        nutrients, other = pairs(tables[0]), pairs(mobile[0])
        if nutrients != other:
            raise ValueError(f"items layout: desktop and mobile tables disagree for {name!r}")
        group, sub = "", ""
        if kind != "item":
            for a in r.ancestors():
                if a.has("k10-sub-byo") and not sub:
                    sn = a.find("k10-sub-byo__name")
                    sub = _clean(sn.text()) if sn else ""
                if a.tag == "div" and a.has("k10-byo"):
                    core = a.find("k10-byo_core")
                    cn = core.find("k10-recipe__name-val") if core else None
                    group = _clean(cn.text(skip=("k10-recipe__nutrient_energy",))) if cn else ""
                    break
        desc = r.find("k10-recipe__desc")
        # allergens: the info box's "Contains:" / "Dish ingredients may also contain:" lines and the label ids on the dish
        boxes = r.find_all("k10-recipe__labels-wrapper-content")
        if len(boxes) > 1:
            raise ValueError(f"items layout: {name!r} has {len(boxes)} dietary info boxes")
        recs.append({
            "name": name, "desc": _clean(desc.text()) if desc else "",
            "course": course_path(r), "nutrients": nutrients, "yes_labels": [],
            "recipe_id": "", "group": group, "kind": kind, "sub": sub,
            "check": {"header_energy": _clean(energy.text()) if energy else "", "search": r.attrs.get("data-search-name", "")},
            "allergen_src": {"marks": None, **_dietary_lines(boxes[0] if boxes else None), **_label_ids(r)},
        })
    return recs


def detect_layout(text: str) -> str:
    if "k10-recipe__wrapper" in text:
        return "table"
    if "k10-recipe-modal__recipe-name" in text:
        return "modal"
    if "k10-modal-perfect__table-row" in text:
        return "perfect"
    if "k10-recipe__nutrients-item" in text:
        return "items"
    raise ValueError("not a layout this module knows: the 10kites page format changed")


READERS = {"table": _read_table, "modal": _read_modal, "perfect": _read_perfect, "items": _read_items}


USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def fetch_pages(base_url: str, guids: dict[str, str], dest: Path) -> dict[str, Path]:
    """Save the menu pages named in `guids` ({label: menu guid}; '' = the page's default menu) into `dest`, one request
    per second, as <label>.html. Returns {label: path}. Pages already saved are reused (delete the file to refresh)."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for label, guid in guids.items():
        path = dest / f"{label}.html"
        if not path.exists() or path.stat().st_size < 10000:
            url = base_url + (f"?mguid={guid}" if guid else "")
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            for attempt in range(3):  # a dropped connection is retried, still one request at a time
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        path.write_bytes(resp.read())
                    break
                except OSError:
                    if attempt == 2:
                        raise
                    time.sleep(5)
            time.sleep(1.1)
        out[label] = path
    return out


def read_menu(path: Path | str) -> tuple[str, list[dict]]:
    """(layout, records in page order) for a saved 10kites page."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    layout = detect_layout(text)
    root = parse_html(text)
    recs = READERS[layout](root)
    labels = page_labels(root)
    for r in recs:
        r["label_map"] = labels
    return layout, recs


def page_title(path: Path | str) -> str:
    m = re.search(r"<title>([^<]*)</title>", Path(path).read_text(encoding="utf-8", errors="replace"))
    return _clean(html.unescape(m.group(1))) if m else ""


def number(s: str) -> str:
    """A printed value as a plain number string for the CSV: '-' or '' -> '' (not published). Thousands commas are
    removed ('3,283' -> '3283'); everything else (including '<0.5') is kept exactly as printed."""
    s = s.strip()
    if s in ("", "-", "–", "—", "N/A", "n/a"):
        return ""
    return s.replace(",", "")


def dedupe(items: list[dict], keys: tuple[str, ...]) -> tuple[list[dict], list[dict]]:
    """Drop exact duplicates (same values for every key); return (kept, dropped)."""
    seen, kept, dropped = set(), [], []
    for it in items:
        k = tuple(it.get(x, "") for x in keys)
        (dropped if k in seen else kept).append(it)
        seen.add(k)
    return kept, dropped

# ---------------------------------------------------------------- allergens (docs/DATA.md "Allergens")
# Label names the pages print beside the 14 allergens that are diets or claims, not allergens.
NOT_ALLERGENS = {"vegan", "vegetarian", "gluten free", "gluten free optional", "under 700 kcal", "msg"}
FOURTEEN = {"celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts",
            "sesame", "soya", "sulphites"}
# Disagreements allergens_from_rec() resolved towards the stronger printed statement; the chain scripts print them.
ALLERGEN_NOTES: list[str] = []


def _word(name: str, where: str, extra: dict | None) -> tuple[str, str | None] | None:
    """(key, kind or None) for one printed label name; None for a diet label. Stops on any other unknown word."""
    from common import allergen_words
    if " ".join(name.split()).lower() in NOT_ALLERGENS:
        return None
    keys, cereals, nuts = allergen_words([name], where, extra)
    if len(keys) != 1:
        raise SystemExit(f"{where}: {name!r} is not one allergen")
    return next(iter(keys)), next(iter(cereals | nuts), None)


def _split_top(text: str) -> list[str]:
    """'Cereals with Gluten (Barley, Rye, Wheat), Sesame Seeds' -> ['Cereals with Gluten (Barley, Rye, Wheat)', 'Sesame Seeds']."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if depth != 0:
        raise ValueError(f"unbalanced brackets in {text!r}")
    return [p.strip() for p in parts + [cur] if p.strip()]


def _printed_list(text: str, where: str, extra: dict | None) -> tuple[set[str], dict[str, set[str]], set[str]]:
    """'Eggs, Cereals with Gluten (Wheat, Barley)' -> (keys, {key: kinds named in brackets}, keys whose brackets say 'Other').
    A word in brackets must be a kind of the allergen before it (Wheat after Cereals, Hazelnuts after Tree Nuts)."""
    keys: set[str] = set()
    kinds: dict[str, set[str]] = {}
    vague: set[str] = set()
    for part in _split_top(text):
        head, _, inner = part.partition("(")
        if head.strip().lower() == "msg" and not inner:  # Giggling Squid lists MSG in its Contains line: not one of the 14
            continue
        w = _word(head, where, extra)
        if w is None:
            raise SystemExit(f"{where}: {head!r} printed in an allergen line")
        key, kind = w
        keys.add(key)
        if kind:
            kinds.setdefault(key, set()).add(kind)
        if inner:
            if not inner.rstrip().endswith(")"):
                raise SystemExit(f"{where}: text after the brackets in {part!r}")
            for x in inner.rstrip()[:-1].split(","):
                x = x.strip()
                if not x:
                    continue
                if x.lower() == "other":
                    vague.add(key)
                    continue
                w2 = _word(x, where, extra)
                if w2 is None or w2[0] != key or w2[1] is None:
                    raise SystemExit(f"{where}: {x!r} in brackets after {head.strip()!r} is not a kind of it")
                kinds.setdefault(key, set()).add(w2[1])
    return keys, kinds, vague


def _from_marks(marks: dict[str, str], where: str, extra: dict | None) -> tuple[set[str], set[str], set[str]]:
    """(contains, may contain, allergens that have a mark) from {printed allergen name: 'yes' | 'may' | 'no'}."""
    c, m, seen = set(), set(), set()
    for nm, state in marks.items():
        w = _word(nm, where, extra)
        if w is None:
            continue
        if w[1] is not None:
            raise SystemExit(f"{where}: allergen mark {nm!r} names a kind, not one of the 14")
        if w[0] in seen:
            raise SystemExit(f"{where}: two marks for {w[0]}")
        seen.add(w[0])
        if state == "yes":
            c.add(w[0])
        elif state == "may":
            m.add(w[0])
    return c, m, seen


def _from_ids(src: dict, labels: dict[str, str], where: str, extra: dict | None):
    """(contains, may contain, {key: kinds} or None) from the dish's label ids, named by the page's own label list.
    Kinds are None when an id in the contains list is not named on the page (so a list of kinds could be incomplete)."""
    if src.get("ids_all") is None:
        return None
    top = {}
    for i, nm in labels.items():
        w = _word(nm, where, extra)
        if w is not None and w[1] is None:
            top[w[0]] = i
    if set(top) != FOURTEEN:
        raise SystemExit(f"{where}: the page names only {sorted(top)} of the 14 allergens in its label list")
    no_may, every = set(src["ids_no_may"]), set(src["ids_all"])
    if not no_may <= every:
        raise SystemExit(f"{where}: label ids {sorted(no_may - every)} are in the contains list but not in the full list")
    c, m, kinds, unnamed = set(), set(), {}, False
    for i in every:
        if i not in labels:
            unnamed = unnamed or i in no_may
            continue
        w = _word(labels[i], where, extra)
        if w is None:
            continue
        key, kind = w
        if kind is None:
            (c if i in no_may else m).add(key)
        elif i in no_may:
            kinds.setdefault(key, set()).add(kind)
    if not set(kinds) <= c:
        raise SystemExit(f"{where}: label ids name kinds of {sorted(set(kinds) - c)} without the allergen itself")
    return c, m, (None if unnamed else kinds)


def allergens_from_rec(rec: dict, where: str, extra: dict | None = None, kinds_from_ids: bool = False) -> dict | None:
    """A dish's allergens as the page prints them: {"contains", "may_contain", "cereals", "nuts"} (sets of keys/kinds).

    Every form the page prints is read and they must agree exactly, or the run stops (SystemExit):
      table   the 14 yes/may/no columns, the card's "Contains:" / "May contain:" lines and the dish's label ids
      modal   the pop-up's "Contains:" / "May contain:" sections and the dish's label ids
      perfect the pop-up's Contain / May Contain table and the dish's label ids
      items   the "Contains:" / "Dish ingredients may also contain:" lines and the dish's label ids
    Cereals and tree nuts are named only as printed in brackets ("Cereals with Gluten (Wheat)"); a bracket that says
    "Other" means a kind the page doesn't name, so no kinds are given for that allergen. With kinds_from_ids (a layout that
    prints no brackets) the kinds come from the dish's label ids, named by the page's own allergen filter, and only when every
    id in its contains list is named. Returns None when a table-layout dish doesn't carry all 14 columns."""
    src, labels = rec["allergen_src"], rec.get("label_map") or {}
    forms = []
    if src["marks"] is not None:
        c, m, seen = _from_marks(src["marks"], where, extra)
        if src.get("marks_all") and seen != FOURTEEN:  # a column per allergen, but not all 14 of them
            return None
        forms.append(("allergen marks", c, m))
    printed_kinds: dict[str, set[str]] = {}
    vague: set[str] = set()
    if src["contains"] is not None:
        c, printed_kinds, vague = _printed_list(src["contains"], where, extra)
        m, _, _ = _printed_list(src["may"], where, extra)
        forms.append(("printed lines", c, m - c))
    ids = _from_ids(src, labels, where, extra)
    if ids is not None:
        forms.append(("label ids", ids[0], ids[1]))
    if len(forms) < 2:
        raise SystemExit(f"{where}: allergens printed in only one form ({forms[0][0] if forms else 'none'}): nothing to check them against")
    name0, contains, may = forms[0]
    for name, c, m in forms[1:]:
        if (c, m) == (contains, may):
            continue
        weaker = contains - c  # allergens the printed form says the dish contains and this form only says it may contain
        if name == "label ids" and weaker and c <= contains and m == may | weaker:
            ALLERGEN_NOTES.append(f"{where}: {name0} say contains {', '.join(sorted(weaker))}; the page's label ids only say "
                                  "may contain: published as contains (the stronger statement, as printed)")
            continue
        raise SystemExit(f"{where}: {name0} say contains {sorted(contains)}, may contain {sorted(may)}; "
                         f"{name} say contains {sorted(c)}, may contain {sorted(m)}")
    kinds: dict[str, set[str]] = {}
    id_kinds = ids[2] if ids is not None else None
    for key in ("gluten", "nuts"):
        if key not in contains:
            continue
        if key in vague:
            kinds[key] = set()
        elif src["contains"] is not None:
            kinds[key] = printed_kinds.get(key, set())
            if kinds[key] and id_kinds is not None and id_kinds.get(key, set()) != kinds[key]:
                raise SystemExit(f"{where}: printed kinds of {key} {sorted(kinds[key])} disagree with the label ids {sorted(id_kinds.get(key, set()))}")
        elif kinds_from_ids and id_kinds is not None:
            kinds[key] = id_kinds.get(key, set())
        else:
            kinds[key] = set()
    return {"contains": contains, "may_contain": may, "cereals": kinds.get("gluten", set()), "nuts": kinds.get("nuts", set())}


# ---------------------------------------------------------------- shared helpers for the chain scripts
# printed column header (lower case) -> items.csv column
COLUMNS = {
    "energy (kcal)": "calories", "protein (g)": "protein_g", "carb (g)": "carbs_g", "carbs (g)": "carbs_g",
    "available carb (g)": "carbs_g", "fat (g)": "fat_g", "sat fat (g)": "sat_fat_g", "saturates (g)": "sat_fat_g",
    "of which sugars (g)": "sugar_g", "sugars (g)": "sugar_g", "fibre (g)": "fiber_g", "salt (g)": "salt_g",
    "energy (kj)": "energy_kj",  # printed per serving beside kcal (never converted from it)
}
REQUIRED = ("calories", "protein_g", "carbs_g", "fat_g")


def printed_values(rec: dict) -> dict[str, str]:
    """{items.csv column: value as printed} for one record. '-' (not published) becomes ''. Stops on a column this
    module has not mapped, so a changed page can't silently shift numbers into the wrong column."""
    out: dict[str, str] = {}
    for header, raw in rec["nutrients"].items():
        key = header.strip().lower()
        if key not in COLUMNS:
            raise ValueError(f"unknown nutrient column {header!r}: the page format changed, map it in COLUMNS first")
        col = COLUMNS[key]
        if col is None:
            continue
        if col in out:
            raise ValueError(f"two columns map to {col}: {sorted(rec['nutrients'])}")
        out[col] = number(raw)
    return out


def has_required(vals: dict[str, str]) -> bool:
    return all(vals.get(k, "") != "" for k in REQUIRED)


PORK = re.compile(r"\b(pork|bacon|ham|gammon|pepperoni|sausages?|salami|chorizo|pancetta|prosciutto|lardons?)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|brisket|sirloin|ribeye|rib-eye)\b", re.I)
NOT_MEAT = re.compile(
    r"\b(tuna|salmon|swordfish|cod|halibut|fish|cauliflower|mushroom|portobello|aubergine)\s+steaks?\b"
    r"|\b(vegetarian|veggie|vegan|plant[- ]based|meat[- ]free|quorn|soya|soy|veg)\s+(sausages?|bacon|ham|pepperoni|salami|chorizo|beef|steaks?)\b"
    r"|\b(sausage|bacon|ham|pepperoni|salami|chorizo|beef)\s+(style|flavou?red|alternative|substitute)\b", re.I)


def diet_tags(text: str, vegetarian: bool) -> tuple[str, str]:
    """(tags, conflict). 'vegetarian' only when the page marks the dish vegetarian/vegan. contains_pork / contains_beef
    only when the dish's own name, description or ingredient list says so. If a dish the page marks vegetarian also
    names pork or beef (a sub-recipe such as "Pork Belly Sauce" in a vegan dish, or a bacon option), we make neither claim:
    no tags at all, and `conflict` says why (for the notes column)."""
    clean = NOT_MEAT.sub("", text)
    tags = []
    if PORK.search(clean):
        tags.append("contains_pork")
    if BEEF.search(clean):
        tags.append("contains_beef")
    if vegetarian and tags:
        return "", "page marks it vegetarian but its own text names " + " and ".join(t[9:] for t in tags) + ": no diet tags given"
    if vegetarian:
        return "vegetarian", ""
    return "|".join(tags), ""


def fold(name: str) -> str:
    """Name without accents ('Comté' -> 'Comte'), used only to make ids; the displayed name keeps its accents."""
    return "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))


def norm_name(name: str) -> str:
    """Name for comparing printed rows: accents, case, punctuation, (R)/TM marks and a leading 'GF' ignored."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[®™]", "", s).replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^gf ", "", s)


def unique_names(rows: list[dict], menu_rank: dict[str, int], short: dict[str, str], long: dict[str, str]) -> None:
    """Give every distinct printed row of the same name its own name. `rows` are distinct (name, numbers) rows, each with
    `menus` (labels of every menu where exactly this row is printed), `name` and optionally `where` (its innermost section).
    The row in the earliest menu keeps the plain name; each other row gets ' (<short menu names>)'. If those still clash, or
    the row sits on the same menu as the plain one so a menu name can't tell them apart, the long menu names and then the
    section are used instead."""
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(norm_name(r["name"]), []).append(r)
    for grp in groups.values():
        if len(grp) == 1:
            continue
        grp.sort(key=lambda r: min(menu_rank[m] for m in r["menus"]))
        base = grp[0]
        plain = base["name"]
        others = grp[1:]
        if all(r.get("prefer_where") for r in grp):  # choices offered with a dish: say which dish, on every row of the clash
            names = []
            for r in grp:
                ws = r.get("wheres") or [r.get("where", "")]
                names.append(f"{plain} ({ws[0]}{f' +{len(ws) - 1} more' if len(ws) > 1 else ''})")
            if len({norm_name(n) for n in names}) == len(grp):
                for r, n in zip(grp, names):
                    r["name"] = n
                continue

        def labels(r, kind):
            same = set(r["menus"]) <= set(base["menus"])  # the plain row is on every one of these menus: a menu name can't tell them apart
            if kind == "short":
                return [] if same else list(dict.fromkeys(short[m] for m in r["menus"]))
            if kind == "long":
                return [] if same else list(dict.fromkeys(long[m] for m in r["menus"]))
            if kind == "where":
                return [r.get("where", "")]
            return ([] if same else list(dict.fromkeys(long[m] for m in r["menus"]))) + [r.get("where", "")]

        def tidy(lab: list[str]) -> str:  # at most two names, then "+N more"
            return " / ".join(lab) if len(lab) <= 2 else f"{lab[0]} / {lab[1]} +{len(lab) - 2} more"

        stages = ["short", "long", "where", "long+where"]
        for i, kind in enumerate(stages):
            names = []
            for r in others:
                lab = [x for x in labels(r, kind) if x]
                j = i
                while not lab and j + 1 < len(stages):  # nothing to say at this stage for this row: use the next one
                    j += 1
                    lab = [x for x in labels(r, stages[j]) if x]
                names.append(f"{plain} ({tidy(lab)})" if lab else plain)
            if len({norm_name(n) for n in names + [plain]}) == len(others) + 1:
                break
        for r, n in zip(others, names):
            r["name"] = n


KEY_COLS = ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g", "energy_kj")


def _allergen_key(a: dict | None) -> tuple:
    """A hashable form of one dish's allergens (so two printings that differ in allergens are never merged)."""
    if a is None:
        return ()
    return tuple(tuple(sorted(a[k])) for k in ("contains", "may_contain", "cereals", "nuts"))


def collect_rows(labels, paths, layout, name_fn, category_fn, skip_fn=None, veg_fn=None, text_fn=None, menu_fn=None, key_fn=None, where_fn=None,
                 allergen_fn=None):
    """Read every menu page in `labels` order and return (rows, excluded, skipped, total).

    rows      distinct printed rows: {name, menus (every label where exactly this row is printed), category, vals, veg,
              text (for pork/beef tags), where (innermost section)}. A row seen again with the same (normalised) name and
              the same numbers is an exact duplicate: its menu is added and nothing else.
    excluded  (label, name, why) for dishes missing calories, protein, carbs or fat
    skipped   (label, name, why) for dishes skip_fn(label, rec) refused
    where_fn  optional (label, rec) -> str: what to call the place a dish sits in when two dishes need telling apart
    key_fn    optional (label, rec, name) -> str: what "the same dish" means for dropping exact duplicates (default: the name)
    menu_fn   optional (label, rec) -> label: lets a section inside a page count as its own "menu" when naming variants
    allergen_fn optional (label, rec) -> allergens dict (see allergens_from_rec) or None: stored as row["allergens"]. Two
              printings with the same name and numbers but different allergens are kept as two rows (never merged).
    total     number of dish records on all pages"""
    rows: dict[tuple, dict] = {}
    excluded: list[tuple[str, str, str]] = []
    skipped: list[tuple[str, str, str]] = []
    total = 0
    for label in labels:
        lay, recs = read_menu(paths[label])
        if lay != layout:
            raise SystemExit(f"{label}: expected the {layout!r} layout, found {lay!r}: the page format changed")
        total += len(recs)
        for rec in recs:
            why = skip_fn(label, rec) if skip_fn else None
            if why:
                skipped.append((label, rec["name"], why))
                continue
            vals = printed_values(rec)
            if not has_required(vals):
                excluded.append((label, rec["name"], "calories, protein, carbs or fat not published"))
                continue
            name = name_fn(label, rec)
            allergens = allergen_fn(label, rec) if allergen_fn else None
            key = (norm_name(key_fn(label, rec, name) if key_fn else name), tuple(vals.get(k, "") for k in KEY_COLS),
                   _allergen_key(allergens))
            shown = menu_fn(label, rec) if menu_fn else label
            if key in rows:
                rows[key]["menus"].append(shown)
                w = where_fn(label, rec) if where_fn else ""
                if w and w not in rows[key]["wheres"]:
                    rows[key]["wheres"].append(w)
                continue
            veg = veg_fn(rec) if veg_fn else bool({"Vegetarian", "Vegan"} & set(rec["yes_labels"]))
            rows[key] = {
                "name": name, "menus": [shown], "category": category_fn(label, rec, name), "vals": vals, "veg": veg,
                "text": text_fn(rec) if text_fn else " ".join([rec["name"], rec.get("ingredients") or rec["desc"]]),
                "where": where_fn(label, rec) if where_fn else (rec["course"][-1] if rec["course"] else ""),
                "wheres": [where_fn(label, rec)] if where_fn else [],
                "allergens": allergens,
            }
    return list(rows.values()), excluded, skipped, total


def make_items(rows: list[dict], long: dict[str, str], unrankable: set[str], limited_menus: set[str] = frozenset()) -> list[dict]:
    """item dicts for common.write_chain_folder from collect_rows() rows (names already unique)."""
    from common import slug
    items = []
    for r in rows:
        tags, conflict = diet_tags(r["text"], r["veg"])
        note = "; ".join(x for x in (conflict, r.get("note", ""), "On: " + ", ".join(dict.fromkeys(long[m] for m in r["menus"]))) if x)
        items.append({
            "id": slug(fold(r["name"])), "name": r["name"], "category": r["category"], "serving": r.get("serving", ""),
            **{k: r["vals"].get(k, "") for k in KEY_COLS}, "tags": tags,
            "limited_time": all(m in limited_menus for m in r["menus"]),
            "rankable": r["category"] not in unrankable, "notes": note, "allergens": r.get("allergens"),
        })
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share a name: extend unique_names")
    return items


if __name__ == "__main__":
    lay, recs = read_menu(sys.argv[1])
    print(f"{lay}: {len(recs)} records")
    for r in recs:
        print(" > ".join(r["course"]), "|", r["name"], "|", r["group"], "|", r["nutrients"], "|", r["yes_labels"])
