"""Shared reader for Ten Kites allergen and nutrition pages (menus.tenkites.com) used by Farmer J, Yo! Sushi,
Hickory's, Be At One and Carluccio's. Standard library only.

Ten Kites hosts the chains' own "Allergen & Nutritional" menu pages (each chain links to its page from its own website).
The pages are server-rendered HTML with one nutrition table per dish; there are four page layouts in use, so this module
has one reader per layout and every reader returns the same thing: a list of rows, one per printed dish.

    {"section": "Curry", "name": "Chicken Katsu Curry (large)", "nutrients": {"Energy (kCal)": "922", ...},
     "vegetarian": True/False/None, "vegan": True/False/None, "per": "serving"}

`nutrients` holds each value as printed on the page, keyed by the label printed beside it. Nothing here converts, rounds,
fills in or estimates a number; the only change is that a thousands separator is dropped ("3,488" -> "3488") so the
pipeline can read it. Layouts:

    read_table_layout   Farmer J, Yo! Sushi: a wide table, hidden per-serving cells beside each dish name
    read_modal_layout   Hickory's: one pop-up card per dish with a "Nutrition (per portion)" table
    read_box_layout     Be At One: an "info" box per dish with a "Nutritional info" grid
    read_popover_layout Carluccio's: a pop-up per dish with "Nutritional values (per menu item)"

`fetch()` saves a page politely (browser user-agent, one request at a time). Run python with -I when reading saved pages.
"""
from __future__ import annotations
import html
import re
import subprocess
import time
from html.parser import HTMLParser
from pathlib import Path

USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
              "Version/17.5 Safari/605.1.15")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
NUMBER = re.compile(r"^(?:<\s*)?\d+(?:\.\d+)?$")
THOUSANDS = re.compile(r"^\d{1,3}(?:,\d{3})+(?:\.\d+)?$")


# ---------------------------------------------------------------- fetching

def fetch(url: str, dest: Path, delay: float = 1.0) -> str:
    """Download one page to `dest` (one request; sleeps `delay` seconds afterwards) and return its SHA-256."""
    import hashlib
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", USER_AGENT, "-o", str(dest), url], check=True)
    time.sleep(delay)
    return hashlib.sha256(dest.read_bytes()).hexdigest()


# ---------------------------------------------------------------- a tiny DOM

class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag: str, attrs: dict | None = None, parent: "Node | None" = None):
        self.tag, self.attrs, self.children, self.parent = tag, attrs or {}, [], parent

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def has(self, cls: str) -> bool:
        return cls in self.classes

    def iter(self):
        """Every descendant element, document order."""
        for c in self.children:
            if isinstance(c, Node):
                yield c
                yield from c.iter()

    def find_all(self, cls: str | None = None, tag: str | None = None) -> list["Node"]:
        return [n for n in self.iter() if (cls is None or n.has(cls)) and (tag is None or n.tag == tag)]

    def find(self, cls: str | None = None, tag: str | None = None) -> "Node | None":
        for n in self.iter():
            if (cls is None or n.has(cls)) and (tag is None or n.tag == tag):
                return n
        return None

    def text(self) -> str:
        parts: list[str] = []

        def walk(n: "Node"):
            for c in n.children:
                if isinstance(c, str):
                    parts.append(c)
                elif c.tag not in ("script", "style", "svg"):
                    walk(c)

        walk(self)
        return re.sub(r"\s+", " ", "".join(parts)).strip()


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, {k: (v or "") for k, v in attrs}, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, {k: (v or "") for k, v in attrs}, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse_html(text: str) -> Node:
    b = _Builder()
    b.feed(text)
    b.close()
    return b.root


def page_title(text: str) -> str:
    m = re.search(r"<title>(.*?)</title>", text, re.S)
    return html.unescape(m.group(1)).strip() if m else ""


# ---------------------------------------------------------------- numbers

def printed(value: str) -> str:
    """The value as the page prints it, whitespace trimmed and a thousands comma removed. Anything that is not a
    number (a dash, a blank, text) is returned unchanged so the caller can see it and decide."""
    v = re.sub(r"\s+", " ", value).strip()
    if THOUSANDS.match(v):
        v = v.replace(",", "")
    return v


def is_number(v: str) -> bool:
    return bool(NUMBER.match(v))


def pick(nutrients: dict, *labels: str) -> str:
    """First of `labels` that the page printed; '' when none is (never a guess)."""
    for lab in labels:
        if lab in nutrients:
            return nutrients[lab]
    return ""


def dedupe(rows: list[dict], key=lambda r: (r["section"], r["name"], tuple(sorted(r["nutrients"].items())))):
    """Drop exact duplicates (same section, name and numbers); different printed rows are all kept."""
    seen, out = set(), []
    for r in rows:
        k = key(r)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


# ---------------------------------------------------------------- layout 1: wide table (Farmer J, Yo! Sushi)

def _desktop_part(text: str) -> str:
    """The page carries the whole menu twice (desktop table, then a mobile list). Keep the desktop one."""
    start = text.find("k10-all-courses k10-all-courses_desktop")
    end = text.find("k10-all-courses k10-all-courses_mobile")
    if start < 0 or end < 0 or end < start:
        raise ValueError("table layout not found: the page no longer has the desktop/mobile course blocks")
    return text[start - 12:end - 12]  # from one opening '<div class="' to just before the next


def read_table_layout(text: str) -> list[dict]:
    """One row per dish, from the 'Nutrition values per serving' cells beside each dish name."""
    root = parse_html("<div>" + _desktop_part(text) + "</div></div>")
    filt = filter_labels(parse_html(text))
    rows = []
    section = ""
    for node in root.iter():
        if node.has("k10-course__name") and node.has("k10-w-course__name"):
            section = node.text()
        if node.has("k10-w-recipe__info") and node.has("k10-recipe"):
            name = node.find("k10-w-recipe__name").text()
            vals = {}
            for cell in node.find_all("k10-recipe__label_nutrient"):
                label = html.unescape(cell.attrs.get("data-nutrient-name", "")).strip()
                vals[label] = printed(cell.text())
            labels = {c.attrs["data-label-name"]: _yes(c) for c in node.find_all("k10-recipe__label")
                      if c.attrs.get("data-label-name")}
            states = {c.attrs["data-label-name"]: _state(c) for c in node.find_all("k10-recipe__label")
                      if c.attrs.get("data-label-name")}
            card = node.parent if node.parent is not None else node
            ing, desc = card.find("k10-recipe__ingredients-wrapper"), card.find("k10-recipe__desc")
            names = card.find("k10-recipe__label-names-wrapper")
            rows.append({"section": section, "name": name, "nutrients": vals, "per": "serving", "labels": labels,
                         "vegetarian": _diet(labels), "recipe_id": node.attrs.get("data-recipe-id", ""),
                         "page_kcal": node.attrs.get("data-calories", ""),
                         "ingredients": ing.text() if ing is not None else "", "desc": desc.text() if desc is not None else "",
                         "label_names": names.text() if names is not None else "", "label_states": states,
                         "label_ids": _label_ids(node, node.attrs.get("data-recipe-id", "")), "filter": filt})
    return rows


# ---------------------------------------------------------------- allergens (docs/DATA.md "Allergens")

# The 14 allergen columns as Ten Kites prints them.
ALLERGEN_LABELS = ["Cereals with Gluten", "Tree Nuts", "Peanuts", "Eggs", "Milk", "Fish", "Crustaceans", "Molluscs", "Celery",
                   "Mustard", "Sesame Seeds", "Soya", "Sulphites", "Lupin"]


def _split_top(text: str) -> list[str]:
    """'Cereals with Gluten (Barley, Rye, Wheat), Sesame Seeds' -> ['Cereals with Gluten (Barley, Rye, Wheat)', 'Sesame Seeds']."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    return [p.strip() for p in parts + [cur] if p.strip()]


def allergens_from_row(row: dict, where: str) -> dict | None:
    """Allergens for one dish from the table layout: the 14 yes/no columns, cross-checked against the printed
    "Contains: ..." line (which also names the cereals and nuts), and the "May contain traces of ..." sentence.
    Returns None if the dish doesn't carry all 14 columns. Stops (SystemExit) if the two printed forms disagree."""
    import re
    from common import allergen_words
    labels = row.get("labels", {})
    if any(lbl not in labels or labels[lbl] is None for lbl in ALLERGEN_LABELS):
        return None
    from_cols, _, _ = allergen_words([lbl for lbl in ALLERGEN_LABELS if labels[lbl]], where)
    m = re.search(r"Contains:\s*(.*)$", row.get("label_names", ""), re.S)
    words, cereals, nuts = [], set(), set()
    for part in _split_top(m.group(1)) if m else []:
        head, _, inner = part.partition("(")
        words.append(head)
        if inner:
            k, c, n = allergen_words([x for x in inner.rstrip(")").split(",")], where)
            cereals |= c
            nuts |= n
    from_text, c2, n2 = allergen_words(words, where)
    if from_text != from_cols:
        raise SystemExit(f"{where}: allergen columns {sorted(from_cols)} disagree with the printed 'Contains:' line {sorted(from_text)}")
    may = set()
    mm = re.search(r"May contain(?: traces of)?\s*(.*?)(?:ALLERGY ADVICE|$)", row.get("ingredients", ""), re.S | re.I)
    if mm:
        may, _, _ = allergen_words(re.split(r",|\band\b", mm.group(1)), where)
    return {"contains": from_cols, "may_contain": may, "cereals": cereals | c2, "nuts": nuts | n2}  # raw may-contain: write_allergens drops kinds when a key is in both (accuracy audit 2026-10-08)


# The other layouts print each dish's "Contains: ..." and "May contain: ..." lines (cereals and tree nuts named in brackets,
# "Cereals with Gluten (Barley, Wheat)"), and the element around the dish carries the label ids the page's own allergen
# filter reads (data-no-may-labels = what the dish contains, data-all-labels = that plus what it may contain); the filter
# names the ids. allergens_checked reads the printed lines and stops if they disagree with the ids.

def filter_labels(root: Node) -> dict:
    """The page's allergen filter: {label id: printed name} for its 'exclude' labels (data-label-isext="True")."""
    out: dict = {}
    for n in root.iter():
        i, name = n.attrs.get("data-label-id"), n.attrs.get("data-label-name")
        if i and name and n.attrs.get("data-label-isext") == "True":
            name = re.sub(r"\s+", " ", html.unescape(name)).strip()
            if out.setdefault(i, name) != name:
                raise ValueError(f"the allergen filter names label {i} both {out[i]!r} and {name!r}")
    return out


def _label_ids(node: Node, recipe_id: str = "") -> tuple | None:
    """(all label ids, contained label ids) from the nearest element (the node or around it) that carries them; None if
    there is none, or if it belongs to another dish (a different data-recipe-id)."""
    for a in [node, *_ancestors(node)]:
        if "data-all-labels" in a.attrs and "data-no-may-labels" in a.attrs:
            rid = a.attrs.get("data-recipe-id", "")
            if recipe_id and rid and rid != recipe_id:
                return None
            ids = [[x.strip() for x in a.attrs[k].split(",") if x.strip()] for k in ("data-all-labels", "data-no-may-labels")]
            return ids[0], ids[1]
    return None


def _parts(text: str | None) -> list:
    """'Milk, Cereals with Gluten (Barley, Wheat)' -> [('Milk', []), ('Cereals with Gluten', ['Barley', 'Wheat'])]."""
    out = []
    for part in _split_top(text or ""):
        head, _, inner = part.partition("(")
        out.append((head.strip(), [w.strip() for w in inner.rstrip().rstrip(")").split(",") if w.strip()]))
    return out


def _line(text: str, lines: dict, heads: dict, where: str) -> None:
    """One printed 'Contains: ...' style line into lines[field] (as parts). An unknown heading stops the run."""
    if text == "This dish contains none of the listed allergens":    # printed instead of a 'Contains' line
        heads = {text: "contains"}
    for head, field in heads.items():
        if text.startswith(head):
            if field is None:
                return
            if lines[field] is not None:
                raise ValueError(f"{where}: two {head!r} lines")
            lines[field] = _parts(text[len(head):].strip())
            return
    raise ValueError(f"{where}: unknown dietary line {text!r}")


def _modal_line(modal: Node, kind: str) -> list | None:
    sec = modal.find(f"k10-recipe-modal__section_{kind}")
    vals = sec.find("k10-recipe-modal__section-values") if sec is not None else None
    return _parts(vals.text()) if vals is not None else None


def _json_parts(j: dict, value: str) -> list:
    """The dish data's own allergen labels with this value ('yes' = contains, 'maybe' = may contain), children named."""
    out = []
    for lbl in j.get("lbls", []):
        if lbl.get("IsExtended") != "True":
            continue
        kids = [c["Description"].strip() for c in lbl.get("Childs", []) if c.get("Value") == value]
        if lbl.get("Value") == value or kids:
            out.append((lbl["Description"].strip(), kids))
    return out


def _keys(parts: list | None, where: str, extra: dict | None) -> tuple[set, set, set]:
    from common import allergen_words
    keys, cereals, nuts = set(), set(), set()
    for head, inner in parts or []:
        k, c, n = allergen_words([head], where, extra)
        if inner:
            ik, ic, inn = allergen_words(inner, where, extra)
            if ik - k:
                raise SystemExit(f"{where}: {head!r} names {sorted(ik - k)} in its brackets")
            c, n = c | ic, n | inn
        keys, cereals, nuts = keys | k, cereals | c, nuts | n
    return keys, cereals, nuts


FOURTEEN = {"celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts",
            "sesame", "soya", "sulphites"}


def allergens_checked(row: dict, where: str, extra: dict | None = None) -> dict | None:
    """Allergens for one dish from its printed 'Contains' / 'May contain' lines (row['contains'], row['may']), checked
    against the label ids around the dish (row['label_ids']) named by the page's allergen filter (row['filter']): the
    allergens must be the same, and so must the named cereals and nuts the filter has labels for. None when the dish has
    no label ids or the page no filter (nothing to check against). Stops (SystemExit) when the two disagree."""
    from common import allergen_words
    ids, filt = row.get("label_ids"), row.get("filter") or {}
    if ids is None or not filt:
        return None
    named = {i: allergen_words([name], f"{where}: allergen filter", extra) for i, name in filt.items()}
    if set().union(*(k for k, _, _ in named.values())) != FOURTEEN:
        raise SystemExit(f"{where}: the page's allergen filter does not cover the 14 allergens")
    all_ids, no_may = ids
    contains, cereals, nuts = _keys(row.get("contains"), where, extra)
    may, _, _ = _keys(row.get("may"), where, extra)

    def from_ids(group):
        k, c, n = set(), set(), set()
        for i in group:
            if i in named:
                k, c, n = k | named[i][0], c | named[i][1], n | named[i][2]
        return k, c, n

    ck, cc, cn = from_ids(no_may)
    mk, _, _ = from_ids([i for i in all_ids if i not in no_may])
    known_c = set().union(*(c for _, c, _ in named.values()))
    known_n = set().union(*(n for _, _, n in named.values()))
    if ck != contains or cc != cereals & known_c or cn != nuts & known_n:
        raise SystemExit(f"{where}: printed 'Contains' {sorted(contains | cereals | nuts)} disagrees with the label ids "
                         f"{sorted(ck | cc | cn)}")
    # a dish can contain one tree nut and "may contain" another: the key is then in both lines
    if mk - contains != may - contains:
        raise SystemExit(f"{where}: printed 'May contain' {sorted(may)} disagrees with the label ids {sorted(mk)}")
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}  # raw may-contain: write_allergens drops kinds when a key is in both (accuracy audit 2026-10-08)


def allergens_from_columns(row: dict, where: str, columns: list[str], extra: dict | None = None) -> dict | None:
    """Table layout with three-state columns (Yo! Sushi: yes / may / no for each of the 14, named `columns`): the columns,
    the printed "Contains: ... May contain: ..." line, and the label ids around the dish must all agree. None if a
    column is missing or unmarked."""
    from common import allergen_words
    states = row.get("label_states", {})
    if any(states.get(c) not in ("yes", "may", "no") for c in columns):
        return None
    col_yes = allergen_words([c for c in columns if states[c] == "yes"], where, extra)[0]
    col_may = allergen_words([c for c in columns if states[c] == "may"], where, extra)[0]
    text = row.get("label_names", "")
    m = re.search(r"Contains:\s*(.*?)\s*(?=May contain:|$)", text, re.S)
    mm = re.search(r"May contain:\s*(.*)$", text, re.S)
    lines = {**row, "contains": _parts(m.group(1)) if m else [], "may": _parts(mm.group(1)) if mm else []}
    out = allergens_checked(lines, where, extra)
    if out is None:
        return None
    if col_yes != out["contains"] or col_may - col_yes != out["may_contain"]:
        raise SystemExit(f"{where}: allergen columns (contains {sorted(col_yes)}, may {sorted(col_may)}) disagree with "
                         f"the printed line {text!r}")
    return out


def _diet(labels: dict) -> bool | None:
    """True when the page's own 'suitable for' columns mark the dish Vegetarian / Vegan / Plant Based."""
    marks = [v for k, v in labels.items() if k.lower().rstrip("s") in ("vegetarian", "vegan", "plant based")]
    if not marks:
        return None
    return any(m is True for m in marks)


def _state(cell: Node) -> str | None:
    """An allergen column's printed state: 'yes' (contains), 'may' (may contain), 'no', or None (no mark)."""
    for n in cell.iter():
        v = n.attrs.get("data-label-name", "")
        if v in ("LabelValueYes", "LabelValueMay", "LabelValueNo"):
            return {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}[v]
    return None


def _yes(cell: Node) -> bool | None:
    for n in cell.iter():
        v = n.attrs.get("data-label-name", "")
        if v == "LabelValueYes":
            return True
        if v == "LabelValueNo":
            return False
    return None


# ---------------------------------------------------------------- layout 2: pop-up cards (Hickory's)

GENERIC_CHOICE = {"enjoy:", "choose from:", "choose your:", "choose one:"}


def _course_names(node: Node) -> list[str]:
    """Names of the menu sections that enclose `node`, outermost first (a section's own name sits in its header)."""
    names = []
    n = node.parent
    while n is not None:
        if n.has("k10-course"):
            head = n.find("k10-course__name-text")
            if head is not None:
                names.append(head.text())
        n = n.parent
    return names[::-1]


def _modal_nutrients(modal: Node) -> tuple[dict, str]:
    comp = modal.find("k10-recipe-modal__component_nutrients")
    if comp is None:
        return {}, ""
    caption = comp.find("k10-recipe-modal__caption").text() if comp.find("k10-recipe-modal__caption") else ""
    vals = {}
    for tr in comp.find_all(tag="tr"):
        tds = tr.find_all(tag="td")
        if len(tds) >= 2:
            vals[tds[0].text()] = printed(tds[1].text())
    return vals, caption


def read_modal_layout(text: str) -> list[dict]:
    """One row per pop-up card. A plain dish gives one row; a dish with choices (`byo`: 'with Fries' / 'with Salad',
    sauces, sizes) gives one row per choice, each with its own printed numbers:
    {"section": "Burgers", "dish": "Our Oklahoma Smash Burger", "group": "", "choice": "with Fries", "nutrients": {...}}."""
    root = parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise ValueError("pop-up layout not found: the page has no k10-all-courses block")
    rows: list[dict] = []
    filt = filter_labels(root)

    def emit(top: Node, dish: str, group: str, choice: str, modal: Node):
        vals, caption = _modal_nutrients(modal)
        shown = modal.find("k10-primary-nutrient__item")
        desc, suit = modal.find("k10-recipe-modal__recipe-desc"), modal.find("k10-recipe-modal__section_suitable")
        dish_desc = top.find("k10-byo__desc")
        rows.append({"section": " > ".join(_course_names(top)), "dish": dish, "group": group, "choice": choice,
                     "nutrients": vals, "per": caption, "recipe_id": modal.attrs.get("data-recipe-id", ""),
                     "energy_shown": shown.text() if shown is not None else "",
                     "desc": " ".join(x.text() for x in (dish_desc, desc) if x is not None),
                     "suitable": suit.text() if suit is not None else "",
                     "contains": _modal_line(modal, "contains"), "may": _modal_line(modal, "may"),
                     "label_ids": _label_ids(modal, modal.attrs.get("data-recipe-id", "")), "filter": filt})

    for top in body.iter():
        if not top.has("k10-recipe"):
            continue
        if top.has("k10-byo"):
            if top.parent is not None and any(p.has("k10-byo") and p.has("k10-recipe") for p in _ancestors(top)):
                continue  # a choice inside a dish: handled with its dish
            dish = top.find("k10-byo__name").text()
            for item in top.find_all("k10-byo-item"):
                modal = item.find("k10-recipe-modal")
                if modal is None:
                    continue
                sec = item.parent
                while sec is not None and not (sec.has("k10-byo__section") and any(k.startswith("k10-byo__section_sub_") for k in sec.classes)):
                    sec = sec.parent
                group = ""
                if sec is not None and sec.parent is not None:
                    head = sec.parent.find("k10-byo__section-name")
                    group = head.text() if head else ""
                emit(top, dish, group, modal.find("k10-recipe-modal__recipe-name").text(), modal)
        elif top.has("k10-recipe_menu-item"):
            modal = top.find("k10-recipe-modal")
            if modal is not None:
                emit(top, modal.find("k10-recipe-modal__recipe-name").text(), "", "", modal)
    return rows


def _ancestors(node: Node):
    n = node.parent
    while n is not None:
        yield n
        n = n.parent


# ---------------------------------------------------------------- layout 3: info boxes (Be At One)

def _own(rec: Node, cls: str) -> list[Node]:
    """Descendants of `rec` with class `cls` that belong to `rec` itself, not to a dish nested inside it."""
    out = []
    for n in rec.find_all(cls):
        a = n.parent
        while a is not None and not a.has("k10-recipe"):
            a = a.parent
        if a is rec:
            out.append(n)
    return out


def read_box_layout(text: str) -> list[dict]:
    """One row per dish from its 'Nutritional info' grid (plain dishes, and the dips / options nested in a dish).
    `section` is the chain of sections around the dish. The page appends the dish's calories in brackets to its
    name: that part is dropped from the name (the grid carries the same number)."""
    root = parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise ValueError("info-box layout not found: the page has no k10-all-courses block")
    rows = []
    filt = filter_labels(root)
    for rec in body.iter():
        if not rec.has("k10-recipe"):
            continue
        names = _own(rec, "k10-recipe__name-val")
        if not names:
            continue
        shown = _own(rec, "k10-recipe__nutrient_energy")
        name = names[0].text()
        if shown and name.endswith(shown[0].text()):
            name = name[: -len(shown[0].text())].strip()
        vals = {}
        for item in _own(rec, "k10-recipe__nutrients-item"):
            nm, v = item.find("k10-recipe__nutrients-name"), item.find("k10-recipe__nutrients-value")
            if nm is not None and v is not None:
                vals[nm.text()] = printed(v.text())
        sections = []
        for a in _ancestors(rec):
            if a.has("k10-course"):
                h = next((c for c in a.children if isinstance(c, Node) and c.has("k10-course__name")), None)
                if h is not None:
                    sections.append(h.text())
            elif a.has("k10-sub-byo") or a.has("k10-byo"):
                h = a.find("k10-sub-byo__name")
                if h is not None and h.text() and rec is not a:
                    sections.append(h.text())
        desc = _own(rec, "k10-recipe__desc")
        lines = {"contains": None, "may": None}
        for box in _own(rec, "k10-recipe__labels-wrapper-content"):
            for div in (c for c in box.children if isinstance(c, Node)):
                _line(div.text(), lines, {"Contains:": "contains", "Dish ingredients may also contain:": "may"}, name)
        rows.append({"section": " > ".join(sections[::-1]), "name": name, "nutrients": vals,
                     "energy_shown": shown[0].text() if shown else "", "desc": desc[0].text() if desc else "",
                     "kind": "option" if rec.has("k10-recipe_sub-byo") else ("core" if rec.has("k10-recipe_byo") else "item"),
                     **lines, "label_ids": _label_ids(rec), "filter": filt})
    return rows


# ---------------------------------------------------------------- layout 4: pop-ups per dish + dish data (Carluccio's)

def read_popover_layout(text: str) -> list[dict]:
    """One row per dish: plain dishes from the 'Nutritional values (per menu item)' pop-up beside the dish, and dishes
    with choices (a steak with chosen side / sauce) from the dish data the page embeds (`data-recipe`, the same figures
    the page's own nutrition pop-up shows). Labels are normalised to 'Energy (kCal)', 'Protein (g)', ... in both cases."""
    import json
    root = parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise ValueError("pop-up layout not found: the page has no k10-all-courses block")
    rows = []
    filt = filter_labels(root)
    for rec in body.iter():
        if not (rec.has("k10-recipe") and rec.has("k10-recipe_menu-item")):
            continue
        name = rec.find("k10-recipe__name")
        pop = rec.find("k10-popover__nutrients-table")
        if name is None or pop is None:
            continue
        vals = {}
        for tr in pop.find_all(tag="tr"):
            tds = tr.find_all(tag="td")
            if len(tds) >= 2:
                vals[tds[0].text()] = printed(tds[1].text())
        shown = rec.find("k10-recipe__nutrient_energy")
        desc = rec.find("k10-recipe__desc")
        suit = rec.find("k10-popover__label-names-wrapper")
        lines = {"contains": None, "may": None}
        for div in (c for c in (suit.children if suit is not None else []) if isinstance(c, Node)):
            _line(div.text(), lines, {"Contains:": "contains", "May contain:": "may", "Suitable for:": None}, name.text())
        rows.append({"section": _course_section(rec), "name": name.text(), "nutrients": vals,
                     "energy_shown": shown.text() if shown is not None else "", "desc": desc.text() if desc is not None else "",
                     "suitable": suit.text() if suit is not None else "", "kind": "item",
                     **lines, "label_ids": _label_ids(rec), "filter": filt})
    for n in body.iter():
        raw = n.attrs.get("data-recipe")
        if not raw:
            continue
        j = json.loads(html.unescape(raw))
        vals = {}
        for x in j.get("ntrs", []):
            uom = {"kcal": "kCal"}.get(x["Uom"], x["Uom"])
            vals[f'{x["Name"].strip()} ({uom})'] = printed(x["Val"])
        group = ""
        for a in _ancestors(n):
            if a.has("k10-byo_sub_l1"):
                h = a.find("k10-byo__section-name")
                group = h.text() if h is not None else ""
                break
        rows.append({"section": group or _course_section(n), "name": j["name"].strip(), "nutrients": vals,
                     "energy_shown": "", "desc": j.get("desc", ""), "suitable": "", "kind": "choice" if group else "dish-with-choices",
                     "contains": _json_parts(j, "yes"), "may": _json_parts(j, "maybe"), "label_ids": _label_ids(n),
                     "filter": filt})
    return rows


def _course_section(node: Node) -> str:
    for a in _ancestors(node):
        if a.has("k10-course"):
            h = a.find("k10-course__name")
            if h is not None:
                return h.text()
    return ""


# ---------------------------------------------------------------- turning printed rows into items

LABELS = {
    "calories": ("Energy (kCal)", "Energy (kcal)"),
    "protein_g": ("Protein (g)",),
    "carbs_g": ("Carbohydrate (g)", "Carb (g)", "Carbs (g)"),
    "fat_g": ("Fat (g)",),
    "sat_fat_g": ("of which saturates (g)", "Saturates (g)", "Sat Fat (g)"),
    "sugar_g": ("of which sugars (g)", "Sugars (g)", "of which Sugars (g)"),
    "fiber_g": ("Fibre (g)",),
    "salt_g": ("Salt (g)",),
}
IGNORED_LABELS = {"Energy (kJ)", "Starch (g)"}  # printed, but not used (kJ duplicates kcal; starch is not a field)
REQUIRED = ("calories", "protein_g", "carbs_g", "fat_g")
KNOWN_LABELS = {lab for labs in LABELS.values() for lab in labs} | IGNORED_LABELS


EXTRA_LABELS = {"energy_kj": ("Energy (kJ)",)}   # common.EXTRA_KEYS this reader can copy (per serving, as printed)


def numbers(nutrients: dict, where: str = "", extras: bool = False) -> tuple[dict, list[str]]:
    """Map a row's printed labels to item fields, values exactly as printed. A value the page prints as '-' or leaves
    empty becomes '' (not published). Returns (fields, missing required fields). An unknown label stops the run:
    the page has a column this script has not been checked against. extras=True also copies the printed kJ
    (energy_kj); it is off by default so a chain's output only changes when its script asks for it."""
    unknown = set(nutrients) - KNOWN_LABELS
    if unknown:
        raise ValueError(f"{where}: unknown nutrition label(s) {sorted(unknown)}: check tenkites_c.LABELS before running again")
    out = {}
    for field, labs in LABELS.items():
        v = ""
        for lab in labs:
            if lab in nutrients:
                v = nutrients[lab]
                break
        out[field] = v if is_number(v) else ""
    if extras:
        for field, labs in EXTRA_LABELS.items():
            v = next((nutrients[lab] for lab in labs if lab in nutrients), "")
            out[field] = v if is_number(v) else ""
    return out, [k for k in REQUIRED if out[k] == ""]


PORK = re.compile(r"\b(pork|bacon|ham|gammon|pepperoni|sausages?|salami|salame|chorizo|pancetta|prosciutto|guanciale|speck|"
                  r"mortadella|spianata|lardons?|lard|nduja|'nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|brisket|sirloin|rump|ribeye|flank)\b", re.I)
OTHER_SPECIES = re.compile(r"\b(chicken|turkey|duck|lamb|salmon|fish|cod|tuna|prawns?|shrimp|squid|crab|tofu|vegan|veggie|"
                           r"vegetable|plant|mushroom|shiitake|pumpkin|cheese|egg)\b", re.I)
MEAT_UNSPECIFIED = re.compile(r"\b(meat|mince|minced|meatballs?|burgers?|patty|hot ?dogs?|ribs?|ragu|bolognese|lasagne|"
                              r"kebabs?|skewers?|bap|sub)\b", re.I)


def meat_tags(*texts: str, vegetarian: bool = False) -> tuple[list[str], bool]:
    """Tags from the chain's own words (name, description, ingredients): pork products and beef cuts are named as such.
    Second value is True when the text names a meat dish without saying which meat (listed in the report).
    A dish the chain itself marks vegetarian gets neither."""
    if vegetarian:
        return [], False
    text = " ".join(texts)
    tags = []
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    unspecified = bool(MEAT_UNSPECIFIED.search(texts[0])) and not tags and not OTHER_SPECIES.search(texts[0])
    return tags, unspecified


SMALL_WORDS = {"a", "an", "and", "of", "the", "with", "in", "on", "to", "for", "or", "n", "e"}


def tidy_case(name: str) -> str:
    """'chicken katsu curry large' -> 'Chicken Katsu Curry Large'. Words the chain already capitalises are left alone."""
    out = []
    for i, w in enumerate(name.split()):
        if w != w.lower():
            out.append(w)
        elif i and w in SMALL_WORDS:
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def sha256_text_file(path: Path) -> str:
    import hashlib
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dedupe_items(items: list[dict]) -> tuple[list[dict], list[str]]:
    """Drop exact duplicates (same name and the same printed numbers, whichever menu or section they came from);
    items with the same name but different numbers are all kept. Returns (kept, names of the dropped)."""
    seen, kept, dropped = set(), [], []
    for it in items:
        key = (it["name"], tuple(it[k] for k in LABELS))
        if key in seen:
            dropped.append(it["name"])
            continue
        seen.add(key)
        kept.append(it)
    return kept, dropped


def allergen_conflicts(items: list[dict]) -> list[str]:
    """Items printed more than once with the same name and numbers (dedupe_items keeps the first) but different
    allergens: the kept item's allergens are set to None (so the chain is not published as complete) and the names
    are returned for the report."""
    first: dict = {}
    out = []
    for it in items:
        key = (it["name"], tuple(it[k] for k in LABELS))
        if key not in first:
            first[key] = it
        elif it.get("allergens") != first[key].get("allergens") and first[key].get("allergens") is not None:
            first[key]["allergens"] = None
            out.append(it["name"])
    return out


def annotate(item: dict) -> list[str]:
    """Notes (for the notes column) about printed numbers that look odd but are entered exactly as printed."""
    def num(k):
        try:
            return float(item[k])
        except (TypeError, ValueError):
            return None

    notes = []
    carbs, fibre, sugar, sat, fat = num("carbs_g"), num("fiber_g"), num("sugar_g"), num("sat_fat_g"), num("fat_g")
    if fibre is not None and carbs is not None and fibre > carbs:
        notes.append("Fibre is printed higher than carbohydrate (UK carbohydrate excludes fibre)")
    if sugar is not None and carbs is not None and sugar > carbs:
        notes.append("Sugars are printed higher than carbohydrate")
    if sat is not None and fat is not None and sat > fat:
        notes.append("Saturates are printed higher than fat")
    kcal, protein = num("calories"), num("protein_g")
    if None not in (kcal, protein, carbs, fat) and kcal >= 50:
        est = 4 * protein + 4 * carbs + 9 * fat
        if abs(kcal - est) / kcal > 0.10:
            notes.append(f"Printed calories ({kcal:g}) differ from the energy of the printed protein, carbs and fat "
                         f"(about {est:.0f} kcal) by {abs(kcal - est) / kcal:.0%}")
    return notes
