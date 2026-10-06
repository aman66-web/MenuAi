"""Shared reader for menu pages hosted on menus.tenkites.com (Big Table Group chains: Bella Italia, Frankie & Benny's,
Cafe Rouge, Las Iguanas, Chiquito). Standard library only.

Every dish on these pages carries its own "Nutrition (per portion)" table (Energy kCal, Protein, Carb, of which Sugars,
Fat, Sat Fat, Salt). Two page templates exist and both are read here:

* "modal"   (Bella Italia, Frankie & Benny's, Las Iguanas, Chiquito): one <section class="k10-recipe-modal"> per dish
             with the name, dietary labels and the table together;
* "popover" (Cafe Rouge, older template): a <div class="k10-popover"> holding the table, followed by the dish name.

A page shows one menu tab (Main Menu, Lunch, Desserts, ...). The other tabs are the same URL with ?mguid=<menu id>
(the ids are listed in the tab bar), so `fetch_menus` downloads the tab bar's pages once each, one request per second,
and caches them on disk; the extraction scripts then read the cached files.

Numbers are returned exactly as printed (strings). Nothing here converts, rounds or fills a gap; if a table is missing
a row or has an unexpected one, parsing stops with an error.
"""
from __future__ import annotations
import html as _html
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")

# printed row name -> items.csv column
NUTRIENT_ROWS = {
    "Energy (kCal)": "calories",
    "Protein (g)": "protein_g",
    "Carb (g)": "carbs_g",
    "of which Sugars (g)": "sugar_g",
    "Fat (g)": "fat_g",
    "Sat Fat (g)": "sat_fat_g",
    "Salt (g)": "salt_g",
}
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


_INVISIBLE = dict.fromkeys(map(ord, "\u3164\u200b\u200c\u200d\ufeff"), None)   # filler characters some names carry


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.translate(_INVISIBLE).replace("\xa0", " ")).strip()


# ----------------------------------------------------------------------------------------------------------- fetching

def fetch_text(url: str, tries: int = 3) -> str:
    """One GET (retried a few times, 5 s apart, only for dropped connections)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8")
        except OSError as exc:   # URLError, ConnectionResetError, timeouts (an HTTP error status is not retried)
            if isinstance(exc, urllib.error.HTTPError) or attempt == tries - 1:
                raise
            time.sleep(5)
    raise AssertionError("unreachable")


def menu_tabs(page: str) -> list[tuple[str, str, bool]]:
    """(menu name, menu id, is_active) for every tab in the page's tab bar."""
    tabs = []
    for m in re.finditer(r'<(?:a|span)\b[^>]*?data-menu-identifier="([^"]+)"[^>]*?class="(k10-menu-selector__option-name[^"]*)"[^>]*>'
                         r'\s*<span[^>]*>\s*([^<]*?)\s*</span>', page, re.S):
        tabs.append((_clean(_html.unescape(m.group(3))), m.group(1), "option-name_active" in m.group(2)))
    return tabs


def fetch_menus(base_url: str, cache_dir: Path, delay: float = 1.0) -> list[tuple[str, Path]]:
    """Download the base page and every other tab (?mguid=<id>) into cache_dir (skipping files already there).
    Returns [(menu name, html path)] in tab order."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    first = cache_dir / "menu-0.html"
    if not first.exists():
        first.write_text(fetch_text(base_url), encoding="utf-8")
        time.sleep(delay)
    tabs = menu_tabs(first.read_text(encoding="utf-8"))
    if not tabs or not tabs[0][2]:
        raise SystemExit(f"{base_url}: could not find the tab bar, or the first tab is not the active one")
    out = []
    for i, (name, mid, active) in enumerate(tabs):
        path = cache_dir / f"menu-{i}.html"
        if i > 0 and not path.exists():
            sep = "&" if "?" in base_url else "?"
            path.write_text(fetch_text(f"{base_url}{sep}mguid={mid}"), encoding="utf-8")
            time.sleep(delay)
        out.append((name, path))
    return out


# ----------------------------------------------------------------------------------------------------------- parsing

class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, set, tuple | None]] = []   # (tag, classes, (all label ids, no-may ids, recipe id) or None)
        self.records: list[dict] = []
        self.filter_labels: dict[str, tuple[str, bool]] = {}   # allergen filter: label id -> (printed name, data-label-isext)
        self.menu_name = ""
        self.menu_desc = ""
        self.file_name = ""
        self.course = ["", ""]
        self.byo = ""
        self.byo_section = ""
        self.cur: dict | None = None
        self.cur_depth = 0
        self.cur_kind = ""
        self.section = ""          # 'suitable' | 'contains' | 'may' while inside a modal section
        self.pending: list[dict] = []   # popover records waiting for their name
        self.last_rec: dict | None = None   # popover template: the dish whose description comes next
        self.unnamed_names = 0
        self.cap: tuple[str, int, list] | None = None
        self.row: list | None = None
        self.row_depth = 0

    # -- helpers
    def _begin_cap(self, key: str) -> None:
        if self.cap is None:
            self.cap = (key, len(self.stack), [])

    def _new_record(self, kind: str) -> None:
        ids = next((lab for _, _, lab in reversed(self.stack) if lab is not None), None)
        self.cur = {"kind": kind, "menu": self.menu_name, "course": self.course[0], "course2": self.course[1],
                    "byo": self.byo, "byo_section": self.byo_section, "name": "", "desc": "", "suitable": [],
                    "contains": [], "may": [], "contains_text": None, "may_text": None, "label_ids": ids,
                    "nutrition": {}, "caption": ""}
        self.cur_depth = len(self.stack)
        self.cur_kind = kind
        self.section = ""

    def _in(self, token: str) -> bool:
        return any(token in cls for _, cls, _ in self.stack)

    # -- events
    def handle_starttag(self, tag, attrs):
        if tag in _VOID:
            if tag == "br" and self.cap is not None:
                self.cap[2].append(" ")
            return
        a = dict(attrs)
        cls = set((a.get("class") or "").split())
        ids = None
        if "data-all-labels" in a and "data-no-may-labels" in a:   # the label ids the page's allergen filter reads
            ids = tuple([x.strip() for x in (a[k] or "").split(",") if x.strip()] for k in ("data-all-labels", "data-no-may-labels"))
            ids += (a.get("data-recipe-id") or "",)
        self.stack.append((tag, cls, ids))
        if a.get("data-label-id") and a.get("data-label-name"):
            self.filter_labels[a["data-label-id"]] = (_clean(a["data-label-name"]), a.get("data-label-isext") == "True")
        cur = self.cur

        if "data-file-name" in a and not self.file_name:
            self.file_name = a["data-file-name"]
        # menu tab name (the active tab)
        if "k10-menu-selector__option-name-wrapper" in cls and self._in("k10-menu-selector__option-name_active"):
            self._begin_cap("menu")
        if "k10-toolbar__menu-desc" in cls:
            self._begin_cap("menu_desc")
        # courses
        if "k10-course__name-text" in cls:
            self._begin_cap("course1" if not any(t.startswith("k10-course__name_level_") and t.endswith("2")
                                                 for _, c, _ in self.stack for t in c) else "course2")
        elif "k10-course__name" in cls and not any(t.startswith("k10-course__name_level_") for t in cls):
            self._begin_cap("course1")
        # a new top-level dish resets the "build your own" context
        if tag == "div" and "k10-recipe" in cls:
            self.byo = ""
            self.byo_section = ""
        if "k10-byo__name" in cls:
            self._begin_cap("byo")
        if "k10-byo__section-name" in cls:
            self._begin_cap("byo_section")

        # ---- modal template
        if tag == "section" and "k10-recipe-modal" in cls:
            self._new_record("modal")
            ids = self.cur["label_ids"]
            if ids is not None and ids[2] and ids[2] != a.get("data-recipe-id"):
                self.cur["label_ids"] = None    # the nearest label ids belong to another dish: not used
            return
        if cur is not None and self.cur_kind == "modal":
            if "k10-recipe-modal__recipe-name" in cls:
                self._begin_cap("name")
            elif "k10-recipe-modal__recipe-desc" in cls:
                self._begin_cap("desc")
            elif "k10-recipe-modal__section_suitable" in cls:
                self.section = "suitable"
            elif "k10-recipe-modal__section_contains" in cls:
                self.section = "contains"
            elif "k10-recipe-modal__section_may" in cls:
                self.section = "may"
            elif "k10-recipe-modal__section-values" in cls and self.section:
                self._begin_cap("sect_" + self.section)
            elif "k10-recipe-modal__caption" in cls and self._in("k10-recipe-modal__component_nutrients"):
                self._begin_cap("caption")
            elif tag == "tr" and "k10-recipe-modal__tr" in cls:
                self.row = [a.get("data-nutr-name", ""), None]
                self.row_depth = len(self.stack)
            elif tag == "td" and "k10-recipe-modal__td_val" in cls and self.row is not None:
                self._begin_cap("cell")
            elif tag == "td" and self.row is not None:
                self._begin_cap("cell_name")
            return

        # ---- popover template
        if tag == "div" and "k10-popover" in cls and ("k10-popover_recipe" in cls or "k10-popover_byo-item" in cls):
            if self.pending:
                raise SystemExit("a nutrition popover was not followed by a dish name: the page layout changed")
            self._new_record("popover")
            return
        if cur is not None and self.cur_kind == "popover":
            if tag == "div" and len(self.stack) > 1 and "k10-popover__label-names-wrapper" in self.stack[-2][1]:
                self._begin_cap("label_line")
            elif "k10-popover__nutrients-title" in cls:
                self._begin_cap("caption")
            elif tag == "tr" and "k10-popover__nutrients-table__tr" in cls:
                self.row = []
                self.row_depth = len(self.stack)
            elif tag == "td" and self.row is not None:
                self._begin_cap("cell_p")
            return
        if tag == "span" and ("k10-recipe__name" in cls or "k10-byo-item__name" in cls):
            self._begin_cap("oldname")
        elif "k10-recipe__desc" in cls or "k10-byo-item__desc" in cls:
            self._begin_cap("olddesc")

    def handle_data(self, data):
        if self.cap is not None:
            self.cap[2].append(data)

    def handle_endtag(self, tag):
        if tag in _VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                break
        else:
            return
        while len(self.stack) > i:
            self._closing(len(self.stack))
            self.stack.pop()

    def _closing(self, depth: int) -> None:
        if self.cap is not None and self.cap[1] == depth:
            key, _, chunks = self.cap
            self.cap = None
            self._captured(key, _clean("".join(chunks)))
        if self.row is not None and self.row_depth == depth:
            row, self.row = self.row, None
            if self.cur is not None and row:
                if len(row) != 2 or row[1] is None:
                    raise SystemExit(f"malformed nutrition row {row!r} in {self.cur.get('name')!r}")
                if row[0] in self.cur["nutrition"]:
                    raise SystemExit(f"nutrient {row[0]!r} listed twice for {self.cur.get('name')!r}")
                self.cur["nutrition"][row[0]] = row[1]
        if self.cur is not None and self.cur_depth == depth:
            if self.cur_kind == "modal":
                self.records.append(self.cur)
            else:
                self.pending.append(self.cur)
            self.cur = None

    def _captured(self, key: str, text: str) -> None:
        cur = self.cur
        if key == "menu":
            self.menu_name = text
        elif key == "menu_desc":
            self.menu_desc = text
        elif key == "course1":
            self.course = [text, ""]
        elif key == "course2":
            self.course[1] = text
        elif key == "byo":
            self.byo = text
        elif key == "byo_section":
            self.byo_section = text
        elif key == "oldname":
            if not self.pending:
                self.unnamed_names += 1     # a dish with no nutrition popover
                self.last_rec = None
                return
            rec = self.pending.pop()
            rec["name"] = text
            rec["menu"], rec["course"], rec["course2"] = self.menu_name, self.course[0], self.course[1]
            rec["byo"], rec["byo_section"] = self.byo, self.byo_section
            self.records.append(rec)
            self.last_rec = rec
        elif key == "olddesc":
            if self.last_rec is not None and not self.last_rec["desc"]:
                self.last_rec["desc"] = text
        elif cur is None:
            return
        elif key == "name":
            cur["name"] = text
        elif key == "desc":
            cur["desc"] = text
        elif key.startswith("sect_"):
            cur[key[5:]] = [p.strip() for p in text.split(",") if p.strip()]
            if key[5:] in ("contains", "may"):
                if cur[key[5:] + "_text"] is not None:
                    raise SystemExit(f"{cur.get('name')!r}: two '{key[5:]}' lines")
                cur[key[5:] + "_text"] = text
        elif key == "caption":
            cur["caption"] = text
        elif key == "cell_name" and self.row is not None:
            self.row[0] = text
        elif key == "cell" and self.row is not None:
            self.row[1] = text
        elif key == "cell_p" and self.row is not None:
            self.row.append(text)
        elif key == "label_line":
            for head, field in (("Suitable for:", "suitable"), ("Contains:", "contains"), ("May contain:", "may")):
                if text.startswith(head):
                    cur[field] = [p.strip() for p in text[len(head):].split(" / ") if p.strip()]
                    if field in ("contains", "may"):
                        if cur[field + "_text"] is not None:
                            raise SystemExit(f"two '{head}' lines in one popover")
                        cur[field + "_text"] = text[len(head):].strip()


def parse_page(page: str, menu_name: str | None = None) -> dict:
    """Read one saved page. Returns {"menu", "menu_desc", "file_name", "records"}; each record has name, course,
    course2, byo, byo_section, desc, suitable, contains, may, nutrition ({printed row name: printed value}), caption."""
    p = _Parser()
    p.feed(page)
    p.close()
    if p.pending:
        raise SystemExit("a nutrition popover was not followed by a dish name: the page layout changed")
    for rec in p.records:
        if not rec["name"]:
            raise SystemExit("a dish has no name: the page layout changed")
        names = list(rec["nutrition"])
        if sorted(names) != sorted(NUTRIENT_ROWS):
            raise SystemExit(f"{rec['name']!r}: nutrient rows are {names}, expected {list(NUTRIENT_ROWS)}")
        if rec["kind"] == "modal" and rec["caption"] != "Nutrition (per portion)":
            raise SystemExit(f"{rec['name']!r}: table is labelled {rec['caption']!r}, not 'Nutrition (per portion)'")
        if rec["kind"] == "popover" and rec["caption"] != "Nutritional Values:":
            raise SystemExit(f"{rec['name']!r}: table is labelled {rec['caption']!r}")
    popovers = any(r["kind"] == "popover" for r in p.records)
    return {"menu": menu_name or p.menu_name, "menu_desc": p.menu_desc, "file_name": p.file_name, "records": p.records,
            "names_without_table": p.unnamed_names if popovers else 0, "filter_labels": p.filter_labels}


REQUIRED = ("calories", "protein_g", "carbs_g", "fat_g")
_THOUSANDS = re.compile(r"^\d{1,3}(,\d{3})+(\.\d+)?$")


def numbers(rec: dict) -> dict:
    """items.csv nutrient columns for a record, exactly as printed. The only change is dropping the thousands comma
    the pages print in four-digit values ("1,161" -> "1161"), which a CSV cell can't hold."""
    out = {}
    for row, col in NUTRIENT_ROWS.items():
        v = rec["nutrition"][row]
        if v == "-" and col not in REQUIRED:   # "-" = not published: the optional cell stays blank
            v = ""
        out[col] = v.replace(",", "") if _THOUSANDS.match(v) else v
    return out


def read_cached(cache: list[tuple[str, Path]]) -> list[dict]:
    """parse every cached tab; every record gets its tab name in rec['menu']."""
    out = []
    for name, path in cache:
        page = parse_page(Path(path).read_text(encoding="utf-8"), name)
        for rec in page["records"]:
            rec["menu"] = name
            rec["menu_desc"] = page["menu_desc"]
            rec["filter_labels"] = page["filter_labels"]
            out.append(rec)
    return out


def drop_exact_duplicates(records: list[dict]) -> tuple[list[dict], list[dict]]:
    """Same name and same seven printed numbers = the same row printed twice (e.g. on two tabs): keep the first."""
    seen, kept, dropped = set(), [], []
    for r in records:
        key = (r["name"], tuple(r["nutrition"][k] for k in NUTRIENT_ROWS))
        if key in seen:
            dropped.append(r)
        else:
            seen.add(key)
            kept.append(r)
    return kept, dropped


# ------------------------------------------------------------------------------------------------ allergens
# docs/DATA.md "Allergens". Each dish's "Dietary Information" prints "Contains: ..." and "May contain: ..." (the modal template
# separates allergens with commas, the popover template with " / "), naming the cereals and tree nuts in brackets:
# "Cereals (Rye, Wheat)", "Tree Nuts (Walnuts)". The element around the dish also carries the label ids the page's own
# allergen filter reads (data-no-may-labels = what the dish contains, data-all-labels = that plus what it may contain); the
# filter names the 14 allergen ids. The named cereals and nuts have ids of their own that the filter does not name: which
# allergen each belongs to is learnt from the dishes that print them (learn_sub_labels). Both printed forms are read and
# must agree for every dish, or the run stops.

ALLERGEN_KEYS = ("celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts",
                 "sesame", "soya", "sulphites")


def _split_top(text: str, sep: str) -> list[str]:
    """'Milk, Cereals (Rye, Wheat)' -> ['Milk', 'Cereals (Rye, Wheat)']: split on `sep` outside brackets."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(text):
        ch = text[i]
        depth += (ch == "(") - (ch == ")")
        if depth == 0 and text.startswith(sep, i):
            parts.append(cur)
            cur, i = "", i + len(sep)
            continue
        cur += ch
        i += 1
    if depth != 0:
        raise SystemExit(f"unbalanced brackets in allergen line {text!r}")
    return [p.strip() for p in parts + [cur] if p.strip()]


def _sep(rec: dict) -> str:
    return ", " if rec["kind"] == "modal" else " / "


def _printed_allergens(text: str | None, sep: str, where: str, extra: dict | None,
                       ignore: set | frozenset = frozenset()) -> tuple[set, set, set, set]:
    """One printed line -> (keys, cereals, tree nuts, keys printed with named cereals/nuts in brackets). `ignore` holds
    printed words the chain uses that are not one of the 14 (each one explained in the chain's script)."""
    from common import allergen_words
    keys, cereals, nuts, bracketed = set(), set(), set(), set()
    for part in _split_top(text or "", sep):
        head, _, inner = part.partition("(")
        if " ".join(head.lower().split()) in ignore and not inner:
            continue
        k, c, n = allergen_words([head], where, extra)
        if inner:
            words = [w for w in inner.rstrip().rstrip(")").split(",") if w.strip()]
            ik, ic, inn = allergen_words(words, where, extra)
            if ik - k:
                raise SystemExit(f"{where}: {part!r} names {sorted(ik - k)} inside the brackets of {head.strip()!r}")
            c, n = c | ic, n | inn
            if words:
                bracketed |= k
        keys |= k
        cereals |= c
        nuts |= n
    return keys, cereals, nuts, bracketed


def _filter_keys(rec: dict, where: str) -> dict:
    """{label id: {allergen key}} for the page's allergen filter (the 'exclude' labels); {} when the page has none."""
    from common import allergen_words
    out = {}
    for i, (name, isext) in rec.get("filter_labels", {}).items():
        if isext:
            out[i] = allergen_words([name], f"{where}: allergen filter")[0]
    if out and set().union(*out.values()) != set(ALLERGEN_KEYS):
        raise SystemExit(f"{where}: the allergen filter covers {sorted(set().union(*out.values()))}, not the 14 allergens")
    return out


def learn_sub_labels(records: list[dict], extra: dict | None = None, ignore: set | frozenset = frozenset()) -> dict:
    """{label id the filter does not name: allergen keys it can belong to}. An id that a dish carries among what it
    contains (or may contain) can only belong to an allergen the same line prints with names in brackets; the
    candidates are narrowed over every dish. Ids that are never beside a bracketed name (other labels) map to set()."""
    cand: dict[str, set] = {}
    for rec in records:
        if rec.get("label_ids") is None:
            continue
        where = f"{rec['menu']} > {rec['name']}"
        filt = _filter_keys(rec, where)
        all_ids, no_may, _ = rec["label_ids"]
        lines = {"contains": _printed_allergens(rec.get("contains_text"), _sep(rec), where, extra, ignore)[3],
                 "may": _printed_allergens(rec.get("may_text"), _sep(rec), where, extra, ignore)[3]}
        for i in all_ids:
            if i in filt:
                continue
            here = lines["contains"] if i in no_may else lines["may"]
            cand[i] = cand[i] & here if i in cand else set(here)
    return cand


def allergens_from_record(rec: dict, where: str, sub_labels: dict, extra: dict | None = None,
                          ignore: set | frozenset = frozenset()) -> dict | None:
    """Allergens for one dish: the printed "Contains:" / "May contain:" lines, cross-checked against the label ids the
    page's allergen filter uses for the same dish (sub_labels from learn_sub_labels over the same pages). None when the
    dish carries no label ids or the page has no allergen filter (nothing to check against). Stops (SystemExit) when the
    two forms disagree."""
    ids = rec.get("label_ids")
    filt = _filter_keys(rec, where)
    if ids is None or not filt:
        return None
    contains, cereals, nuts, _ = _printed_allergens(rec.get("contains_text"), _sep(rec), where, extra, ignore)
    may, _, _, _ = _printed_allergens(rec.get("may_text"), _sep(rec), where, extra, ignore)
    all_ids, no_may, _ = ids

    def keys_of(group):
        out = set()
        for i in group:
            k = filt.get(i)
            if k is None:
                k = sub_labels.get(i, set())
                if len(k) > 1:
                    raise SystemExit(f"{where}: label id {i} could belong to {sorted(k)}: cannot check this dish")
            out |= k
        return out

    from_ids = keys_of(no_may)
    may_ids = keys_of([i for i in all_ids if i not in no_may])
    if from_ids != contains:
        raise SystemExit(f"{where}: 'Contains: {rec.get('contains_text')}' disagrees with the filter's label ids {sorted(from_ids)}")
    # a dish can contain one tree nut and "may contain" another: the key is then in both lines
    if may_ids - contains != may - contains:
        raise SystemExit(f"{where}: 'May contain: {rec.get('may_text')}' disagrees with the filter's label ids {sorted(may_ids)}")
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


# ------------------------------------------------------------------------------------------------ building items

_PRINTED_NUMBER = re.compile(r"^\d[\d,]*(\.\d+)?$")
_SMALL_WORDS = {"and", "of", "with", "the", "a", "in", "on", "for", "to", "at", "or", "de", "la", "con", "al"}
_PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pancetta|salami|chorizo|pork|prosciutto|nduja|gammon|luganica|"
                   r"pigs? in blankets?)\b", re.I)
_BEEF = re.compile(r"\b(beef|steak|sirloin|rump|ribeye|rib-eye|brisket|hamburger)\b", re.I)
# a dish that is certainly meat/fish-based but whose name and description name no animal (reported, never tagged)
_MEATY = re.compile(r"\b(burgers?|meatballs?|mince[d]?|ribs?|bolognese|ragu|lasagne|meat|carne|patty|kebabs?|hot dogs?|grill|"
                    r"cottage pie|sliders?)\b", re.I)
_ANIMAL = re.compile(r"\b(beef|pork|chicken|lamb|turkey|duck|fish|cod|haddock|salmon|tuna|prawns?|shrimp|crab|squid|calamari|"
                     r"seabass|sea bass|bacon|ham|sausages?|pepperoni|salami|chorizo|pancetta|steak|brisket|mussels?|"
                     r"anchov(y|ies)|veg(an|etarian)?|plant|halloumi|vegetable|bean|lentil|mushroom)\b", re.I)


def tidy_name(name: str) -> str:
    """Strip list bullets and tame ALL-CAPS names ("STRAWBERRY DAIQUIRI" -> "Strawberry Daiquiri"); nothing else changes."""
    n = _clean(name)
    n = re.sub(r"^[-\u2013\u2022]\s*", "", n)
    letters = [c for c in n if c.isalpha()]
    if letters and all(c.isupper() for c in letters) and len(letters) > 3:
        words = n.lower().split(" ")
        n = " ".join(w if (i and w in _SMALL_WORDS) else re.sub(r"(^|[(\-/'])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w)
                     for i, w in enumerate(words))
        n = re.sub(r"'S\b", "'s", n)
        n = re.sub(r"\bBbq\b", "BBQ", n)
    else:   # a run of two or more ALL-CAPS words inside a mixed-case name ("NAKED BEEF BURGER (Gluten-Free)")
        def run(m):
            words = m.group(0).split(" ")
            return " ".join(w if (i and w.lower() in _SMALL_WORDS) else (w if w in ("BBQ", "GF", "UK") else w.capitalize())
                            for i, w in enumerate(words))
        n = re.sub(r"\b[A-Z][A-Z'&]+(?: [A-Z][A-Z'&]+)+\b", run, n)
    return n


def is_published(rec: dict) -> bool:
    """All four required numbers (kcal, protein, carbs, fat) printed as numbers, not '-'."""
    return all(_PRINTED_NUMBER.match(rec["nutrition"][row]) for row, col in NUTRIENT_ROWS.items() if col in REQUIRED)


SIZE_LABEL = re.compile(r"^-?\s*(\d+\s?(ml|cl)( glass)?|small|large|regular|single|double|bottle|half|pint)$", re.I)
SHARING = re.compile(r"\b(to share|sharer|sharing|platter|combo|bottomless)\b", re.I)


def tags_for(rec: dict, name: str, name_only: bool = False) -> str:
    """vegetarian = the page's own "Suitable for" says Vegetarian or Vegan; pork/beef only from the dish name or the
    chain's own description. Vegetarian-marked dishes never get a meat tag."""
    suitable = {s.lower() for s in rec["suitable"]}
    if "vegetarian" in suitable or "vegan" in suitable:
        return "vegetarian"
    text = name if name_only else f"{name} {rec['desc']} {rec['byo']}"
    out = []
    if _PORK.search(text):
        out.append("contains_pork")
    if _BEEF.search(text):
        out.append("contains_beef")
    return "|".join(out)


def meat_type_not_stated(rec: dict, name: str, tags: str) -> bool:
    if "vegetarian" in tags:
        return False
    text = f"{name} {rec['desc']} {rec['byo']}"
    return bool(_MEATY.search(text)) and not _ANIMAL.search(text)


def sanity_problems(nums: dict) -> list[str]:
    """Self-contradictions in one printed row (used to decide what to hold back; the row itself is never altered)."""
    def f(k):
        v = nums[k]
        return float(v) if _PRINTED_NUMBER.match(v or "") else None
    out = []
    cal, p, c, fat, sat, sug = (f(k) for k in ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g"))
    if None not in (sat, fat) and sat > fat + 0.05:
        out.append(f"saturates {sat} g exceed total fat {fat} g")
    if None not in (sug, c) and sug > c + 0.05:
        out.append(f"sugars {sug} g exceed carbohydrate {c} g")
    return out


def energy_gap(nums: dict) -> str | None:
    """The pipeline's own energy check (tools/build_menus.py), applied to one row's printed numbers."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    try:
        import build_menus
    finally:
        sys.path.pop(0)
    try:
        n = {"calories": float(nums["calories"]), "protein": float(nums["protein_g"]),
             "carbs": float(nums["carbs_g"]), "fat": float(nums["fat_g"])}
    except ValueError:
        return None
    return build_menus.energy_problem(n)


def build_items(records: list[dict], classify, category_order: list[str]) -> dict:
    """records -> {"items", "skipped", "unpublished", "duplicates", "renamed"}.

    classify(rec) returns either ("skip", reason) or a dict with category, rankable and optionally name, serving,
    limited_time, alcohol (energy includes alcohol), note. Rows with a '-' in kcal/protein/carbs/fat are never items
    (the chain did not publish them). Exact duplicates (same name, same seven numbers) are dropped; the same name with
    different numbers is kept and told apart by the tab/course that differs."""
    items, skipped, unpublished = [], [], []
    for rec in records:
        if not is_published(rec):
            unpublished.append(rec)
            continue
        spec = classify(rec)
        if isinstance(spec, tuple):
            skipped.append((rec, spec[1]))
            continue
        name = spec.get("name") or tidy_name(rec["name"])
        nums = numbers(rec)
        tags = tags_for(rec, name, spec.get("tags_name_only", False))
        note_bits = [f"Source: {rec['menu']} > {rec['course']}" + (f" > {rec['course2']}" if rec["course2"] else "")]
        if spec.get("alcohol") and energy_gap(nums):
            note_bits.append("energy includes alcohol (kcal is higher than protein, carbs and fat explain)")
        if spec.get("note"):
            note_bits.append(spec["note"])
        serving = spec.get("serving") or (m.group(1) if (m := re.search(r"\b(\d+\s?(?:ml|cl))$", name)) else "")
        item = {"name": name, "category": spec["category"], "serving": serving, **nums, "tags": tags,
                "limited_time": spec.get("limited_time", False), "rankable": spec["rankable"], "notes": "; ".join(note_bits)}
        item["_rec"] = rec
        item["_meat_unstated"] = meat_type_not_stated(rec, tidy_name(rec["name"]), tags)
        items.append(item)

    kept, duplicates, seen = [], [], {}
    for it in items:
        key = (it["name"].lower(), tuple(it[c] for c in NUTRIENT_ROWS.values()))
        if key in seen:
            it["_dup_of"] = seen[key]
            duplicates.append(it)
        else:
            seen[key] = it
            kept.append(it)

    groups: dict[str, list[dict]] = {}
    for it in kept:
        groups.setdefault(it["name"].lower(), []).append(it)
    renamed = []
    combos = [("menu",), ("course",), ("course2",), ("byo_section",), ("byo",), ("menu", "course"), ("course", "course2"),
              ("menu", "course", "course2"), ("menu", "course", "course2", "byo", "byo_section")]
    for group in groups.values():
        if len(group) < 2:
            continue
        for combo in combos:
            labels = [", ".join(tidy_name(g["_rec"][f]).rstrip(":") for f in combo if g["_rec"][f]) for g in group]
            if len(set(labels)) == len(group) and all(labels):
                break
        else:
            continue
        for g, label in zip(group, labels):
            old = g["name"]
            g["name"] = f"{old[:-1]}, {label})" if old.endswith(")") else f"{old} ({label})"
            renamed.append((old, g["name"]))
    names = [it["name"].lower() for it in kept]
    clashes = sorted({n for n in names if names.count(n) > 1})
    if clashes:
        raise SystemExit(f"names still clash after adding the tab/course: {clashes[:8]} (add rules to the chain script)")
    kept.sort(key=lambda it: category_order.index(it["category"]))
    return {"items": kept, "skipped": skipped, "unpublished": unpublished, "duplicates": duplicates, "renamed": renamed}


def public_items(items: list[dict]) -> list[dict]:
    return [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]


# ----------------------------------------------------------------------------------------------------- chain driver

def run(*, chain_id: str, name: str, cuisine: str, aliases: list[str], url: str, source_title: str, tabs: dict[str, str],
        classify, category_order: list[str], expected_rows: dict[str, int], note: str = "",
        holdback: dict[str, str] | None = None, argv: list[str] | None = None, allergen_title: str = "",
        allergen_extra: dict | None = None, allergen_ignore: set | frozenset = frozenset()) -> int:
    """Shared command line for the five chain scripts.

    tabs: {tab name: "use" or a reason the whole tab is left out}; every tab the page lists must be named here, so a new
    tab can't slip in unseen. expected_rows: rows each used tab must contain; if the page changes the script stops and
    a human re-checks the rules. holdback: {final item name: reason} for rows the page prints impossibly.
    allergen_title: the name of the allergen information (the same pages); every item then gets its allergens from its
    own dish (allergens_from_record). allergen_extra / allergen_ignore: the chain's own printed allergen spellings
    (common.allergen_words `extra=`) and printed words that are not one of the 14 (each explained in the chain script)."""
    import argparse
    import tempfile
    from common import ROOT, sha256_file, slug, write_chain_folder

    ap = argparse.ArgumentParser(description=f"Build data/source/{chain_id}/ from {url}")
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "tenkites" / chain_id,
                    help="folder for the downloaded pages (downloaded once, 1 request/second, reused on later runs)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / chain_id)
    ap.add_argument("--report", action="store_true", help="print every skipped, unpublished, duplicate and renamed row")
    args = ap.parse_args(argv)

    cache = fetch_menus(url, args.cache)
    unknown = [n for n, _ in cache if n not in tabs]
    missing = [n for n in tabs if n not in [c[0] for c in cache]]
    if unknown or missing:
        print(f"The tab bar changed (new: {unknown}, gone: {missing}). Decide for each tab in TABS whether it is used.", file=sys.stderr)
        return 1
    used = [(n, pth) for n, pth in cache if tabs[n] == "use"]
    records = read_cached(used)
    for tab, want in expected_rows.items():
        got = sum(1 for r in records if r["menu"] == tab)
        if got != want:
            print(f"Tab {tab!r} has {got} nutrition tables but this script expects {want}: the menu changed, re-check the rules.",
                  file=sys.stderr)
            return 1

    built = build_items(records, classify, category_order)
    items = built["items"]
    allergen_report = []
    if allergen_title:
        sub_labels = learn_sub_labels(records, allergen_extra, allergen_ignore)

        def allergens(it: dict) -> dict | None:
            r = it["_rec"]
            where = f"{r['menu']} > {r['course']} > {r['name']}"
            return allergens_from_record(r, where, sub_labels, allergen_extra, allergen_ignore)

        for it in items:
            it["allergens"] = allergens(it)
            if it["allergens"] is None:
                allergen_report.append(f"no allergen information to read for {it['name']!r}")
        for dup in built["duplicates"]:
            a, kept = allergens(dup), dup["_dup_of"]
            if a != kept["allergens"]:
                allergen_report.append(f"{kept['name']!r} is printed twice with the same numbers but different allergens "
                                       f"({dup['_rec']['menu']} > {dup['_rec']['course']}): not used")
                kept["allergens"] = None
        everything = set(ALLERGEN_KEYS)
        allergen_report += [f"the page prints all 14 allergens as 'Contains' for {it['name']!r}" for it in items
                            if it["allergens"] is not None and it["allergens"]["contains"] == everything]
    holds = []
    ids = {it["name"]: slug(it["name"]) for it in items}
    for item_name, reason in (holdback or {}).items():
        if item_name not in ids:
            print(f"holdback names {item_name!r}, which is not an item any more", file=sys.stderr)
            return 1
        holds.append((ids[item_name], reason))
    assert len(set(ids.values())) == len(ids), "two items would get the same id"

    if not holds:   # write_chain_folder writes holdback.csv only when something is held back: drop a stale one
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)
    guide = None
    if allergen_title:
        guide = {"title": allergen_title, "url": url, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=chain_id, name=name, cuisine=cuisine, source_title=source_title, source_url=url,
                             checked_on=args.checked_on, aliases=aliases, items=public_items(items), out=args.out,
                             note=note, holdback=holds, allergen_guide=guide)
    by_tab = {}
    for r in records:
        by_tab[r["menu"]] = by_tab.get(r["menu"], 0) + 1
    print(f"tables read per used tab: {by_tab}")
    print(f"tabs left out: { {n: tabs[n] for n in tabs if tabs[n] != 'use'} }")
    print(f"wrote {len(items)} items to {out} ({len(holds)} held back); unpublished (a '-' in kcal/protein/carbs/fat): "
          f"{len(built['unpublished'])}; skipped by rule: {len(built['skipped'])}; exact duplicates dropped: "
          f"{len(built['duplicates'])}; renamed to tell apart: {len(built['renamed'])}; "
          f"meat type not stated: {sum(1 for i in items if i['_meat_unstated'])}")
    print("page sha256 (first tab):", sha256_file(cache[0][1])[:16])
    problems = [(i["name"], p) for i in items for p in sanity_problems(i)]
    print("self-contradicting rows to review (not changed):", problems)
    if allergen_title:
        complete = all(it["allergens"] is not None for it in items)
        print(f"allergens: {'every item has its allergens (allergens.csv written)' if complete else 'INCOMPLETE: allergen_guide.csv only'}"
              f"; {len(allergen_report)} note(s)")
        for line in allergen_report:
            print("  allergens:", line)
    if args.report:
        print("-- unpublished:")
        for r in built["unpublished"]:
            print("  ", r["menu"], ">", r["course"], ">", r["name"])
        print("-- skipped by rule:")
        for r, why in built["skipped"]:
            print("  ", r["menu"], ">", r["course"], ">", r["name"], "::", why)
        print("-- duplicates dropped:", len(built["duplicates"]))
        for it in built["duplicates"]:
            print("  ", it["name"], "<-", it["_rec"]["menu"], ">", it["_rec"]["course"])
        print("-- renamed:")
        for old, new in built["renamed"]:
            print("  ", old, "->", new)
        print("-- meat type not stated:", [i["name"] for i in items if i["_meat_unstated"]])
    return 0


if __name__ == "__main__":   # inspection: python3 tenkites_a.py page.html [...]
    for f in sys.argv[1:]:
        pg = parse_page(Path(f).read_text(encoding="utf-8"))
        print(f"# {f}: menu={pg['menu']!r} file={pg['file_name']!r} records={len(pg['records'])} "
              f"names_without_table={pg['names_without_table']} desc={pg['menu_desc']!r}")
        for r in pg["records"]:
            n = r["nutrition"]
            print("\t".join([r["course"], r["course2"], r["byo"], r["byo_section"], r["name"]] +
                            [n[k] for k in NUTRIENT_ROWS] + ["/".join(r["suitable"])]))
