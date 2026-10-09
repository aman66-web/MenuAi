"""Reader for Brightside's own menu pages on Ten Kites (https://menus.tenkites.com/loungers/brightside), used by brightside.py.
Standard library only; works on Python 3.9.

Brightside's website (brightside.co.uk, footer "Allergen Matrix") links this page. It has a tab bar of seven menus (FOOD, GLUTEN FREE,
VEGAN, KIDS, ADDS & EXTRAS, DRINKS, KIDS PIZZA PARTY); a menu is fetched as <base>?mguid=<menu id> (FOOD is the page without mguid).
The page carries every menu twice, a wide "desktop" table and a "mobile" list. Each dish in the desktop table prints

    * its name with the calories beside it "(618 kCal)" (and the same number in the row's data-calories attribute);
    * 14 allergen columns, each blank, a red dot (contains) or a black "M" (may contain), then a Vegan and a Vegetarian column;
    * a hover pop-up per marked column ("Contains Milk", "May contain Cereals with Gluten (Rye)", "Suitable for Vegan") whose
      guid ends with the page's own label id for that column;
    * (some dishes) a description line in the dish's card.

The mobile list prints the same dish as a name, the calories and two lines "Contains ..." and "May contain ...". Nothing else numeric
is printed anywhere (no protein, carbohydrate, fat, salt, sugar, fibre, kJ or weight), so Brightside is a CALORIES-ONLY chain.

Nothing here converts, rounds, fills in or estimates a number (a thousands comma is dropped). Allergens come from FOUR printed forms
that must agree or the run stops: the 14 columns, the pop-ups (and their label ids), the mobile list's lines, and the label ids the page's
own allergen filter uses (data-all-labels / data-no-may-labels, via tenkites_c.allergens_checked).
"""
from __future__ import annotations
import hashlib
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import allergen_words  # noqa: E402

# header of the table, left to right, with the label id the page's filter gives each column
COLUMNS = [("Celery", "23"), ("Cereals with Gluten", "12"), ("Crustaceans", "77"), ("Eggs", "22"), ("Fish", "8"), ("Lupin", "21"),
           ("Milk", "11"), ("Molluscs", "10"), ("Mustard", "24"), ("Sesame Seeds", "20"), ("Soya", "31"),
           ("Sulphur Dioxide/ Sulphites", "76"), ("Peanuts", "68"), ("Tree Nuts", "81")]
DIET_COLUMNS = [("Vegan", "52"), ("Vegetarian", "50")]
EXTRA_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}   # this page's spelling of the sulphites allergen
KCAL = re.compile(r"^\((\d{1,3}(?:,\d{3})*|\d+) kCal\)$")


def fetch(url: str, dest: Path, delay: float = 1.0) -> str:
    """Download one page (one request; a dropped connection is retried twice, 5 s apart; an HTTP error is not retried)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        proc = subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", tk.USER_AGENT, "-o", str(dest), url])
        if proc.returncode == 0:
            break
        if proc.returncode not in (35, 52, 56) or attempt == 2:   # connection reset / empty reply / receive failure only
            raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}): stop and check by hand, do not work round it")
        time.sleep(5)
    time.sleep(delay)
    return hashlib.sha256(dest.read_bytes()).hexdigest()


def menu_tabs(text: str) -> list[tuple[str, str]]:
    """The page's tab bar: [(menu name, menu id)] in order."""
    import html
    out = []
    for m in re.finditer(r'data-menu-identifier="([^"]+)"[^>]*data-index="\d+">\s*<span[^>]*>\s*([^<]*?)\s*</span>', text, re.S):
        out.append((re.sub(r"\s+", " ", html.unescape(m.group(2))).strip(), m.group(1)))
    return out


def _direct_text(node: "tk.Node") -> str:
    return re.sub(r"\s+", " ", "".join(c for c in node.children if isinstance(c, str))).strip()


def _sections(desktop: "tk.Node", where: str) -> None:
    for n in desktop.iter():
        if n.has("k10-course__name"):
            parent = n.parent.classes if n.parent is not None else set()
            if "k10-course_l1" not in parent:
                raise SystemExit(f"{where}: section {n.text()!r} is not a top-level section: the page nests sections now")


def _printed_lines(lines: list[str], where: str, suitable: "list | None" = None) -> tuple[list, list]:
    """('Contains A, B (x)' ..., 'May contain C') lines -> (contains parts, may parts) as tenkites_c._parts. A mobile-list
    'Suitable for Vegan' line is appended to `suitable` when given."""
    contains, may = None, None
    for text in lines:
        if suitable is not None and text.startswith("Suitable for "):
            suitable.extend(x.strip() for x in text[len("Suitable for "):].split(",") if x.strip())
        elif text.startswith("Contains "):
            if contains is not None:
                raise SystemExit(f"{where}: two 'Contains' lines")
            contains = tk._parts(text[len("Contains "):].strip())
        elif text.startswith("May contain "):
            if may is not None:
                raise SystemExit(f"{where}: two 'May contain' lines")
            may = tk._parts(text[len("May contain "):].strip())
        else:
            raise SystemExit(f"{where}: unknown allergen line {text!r}")
    return contains or [], may or []


def _norm_parts(parts: list) -> list:
    """[('Cereals with Gluten', ['Wheat', 'Barley']), ('Milk', [])] -> a sorted comparable form (names lower-cased)."""
    return sorted((h.lower(), tuple(sorted(w.lower() for w in inner))) for h, inner in parts)


def _kcal(row: "tk.Node", where: str) -> tuple[str | None, str, str]:
    """(calories as printed digits or None, the text beside the name, data-calories). Stops when the two copies differ."""
    name_value = row.find("k10-recipe__name-value")
    shown = name_value.find("k10-recipe__nutrient_primary") if name_value is not None else None
    attr = row.attrs.get("data-calories", "")
    if shown is None:
        if attr not in ("-", ""):
            raise SystemExit(f"{where}: no calories shown but data-calories={attr!r}")
        return None, "", attr
    m = KCAL.match(shown.text())
    if not m:
        raise SystemExit(f"{where}: unexpected calories text {shown.text()!r}")
    value = m.group(1).replace(",", "")
    if attr.replace(",", "") != value:
        raise SystemExit(f"{where}: shown {shown.text()!r} differs from data-calories={attr!r}")
    return value, shown.text(), attr


def _mobile_rows(mobile: "tk.Node") -> dict:
    """guid-in-order -> {name, kcal text, lines} from the mobile list (read with different code from the desktop table)."""
    out = []
    for n in mobile.iter():
        if n.has("k10-recipe") and n.has("k10-recipe_mobile") and not n.has("k10-recipe-card"):
            nm = n.find("k10-recipe__name")
            shown = nm.find("k10-recipe__nutrient_primary") if nm is not None else None
            lines = [c.text() for c in n.find_all("k10-recipe__label-name")]
            out.append({"guid": n.attrs.get("data-guid", ""), "name": _direct_text(nm) if nm is not None else "",
                        "kcal_text": shown.text() if shown is not None else "", "lines": lines,
                        "ids": (n.attrs.get("data-all-labels", ""), n.attrs.get("data-no-may-labels", ""))})
    return out


def read_page(text: str, where: str) -> list[dict]:
    """One row per dish in the page's desktop table, in page order:
    {section, name, kcal (digits or None), kcal_text, guid, desc, contains, may (printed parts), allergens {contains, may_contain,
     cereals, nuts} (sets), vegetarian, vegan, label_ids}. Stops (SystemExit) when any two printed forms of a dish disagree."""
    root = tk.parse_html(text)
    desktop, mobile = root.find("k10-all-courses_desktop"), root.find("k10-all-courses_mobile")
    if desktop is None or mobile is None:
        raise SystemExit(f"{where}: the page no longer has the desktop and mobile course blocks")
    _sections(desktop, where)
    header = [n.text() for n in desktop.find("k10-course__header-labels-names").find_all("k10-course__header")]
    expected_header = [c for c, _ in COLUMNS] + [c for c, _ in DIET_COLUMNS]
    if header != expected_header:
        raise SystemExit(f"{where}: the table's columns changed: {header}")
    filt = tk.filter_labels(root)    # {id: name} of the 14 allergens
    if filt != {i: n for n, i in COLUMNS}:
        raise SystemExit(f"{where}: the page's allergen filter changed: {filt}")
    diet_ids = {}
    for n in root.iter():
        if n.attrs.get("data-label-isext") == "False" and n.attrs.get("data-label-id"):
            diet_ids[n.attrs["data-label-id"]] = re.sub(r"\s+", " ", n.attrs.get("data-label-name", "")).strip()
    if diet_ids != {i: n for n, i in DIET_COLUMNS}:
        raise SystemExit(f"{where}: the page's dietary labels changed: {diet_ids}")
    mob = _mobile_rows(mobile)

    rows, section = [], ""
    for node in desktop.iter():
        if node.has("k10-course__name"):
            section = node.text()
            continue
        if node.has("k10-recipe-card"):
            continue
        if not (node.has("k10-recipe") and node.has("k10-recipe_desktop")):
            continue
        nv = node.find("k10-recipe__name-value")
        if nv is None or not _direct_text(nv):
            raise SystemExit(f"{where}: a dish row without a name in section {section!r}")
        name = _direct_text(nv)
        here = f"{where}: {section} > {name!r}"
        guid = node.attrs.get("data-guid", "")
        kcal, kcal_text, _ = _kcal(node, here)

        # the 16 columns and the pop-ups that follow the marked ones
        kids = [c for c in node.children if isinstance(c, tk.Node)]
        cells, pops, last = [], {}, None
        for c in kids:
            if c.has("k10-recipe__name"):
                continue
            if c.has("k10-recipe__label"):
                cells.append(c)
                last = c
            elif c.has("k10-popover"):
                if last is None or not last.find(tag="img"):
                    raise SystemExit(f"{here}: a pop-up that does not follow a marked column")
                pg = c.attrs.get("data-k10-popover-guid", "")
                if pg in pops:
                    raise SystemExit(f"{here}: pop-up {pg} printed twice")
                pops[pg] = (len(cells) - 1, c)
                last = None
            else:
                raise SystemExit(f"{here}: unknown element {sorted(c.classes)} in the dish row")
        if len(cells) != len(expected_header):
            raise SystemExit(f"{here}: {len(cells)} columns instead of {len(expected_header)}")

        states, popup_contains, popup_may, suitable = {}, [], [], {}
        for idx, cell in enumerate(cells):
            col, lid = (COLUMNS + DIET_COLUMNS)[idx]
            img = cell.find(tag="img")
            if img is None:
                states[col] = ""
                continue
            cls = img.classes
            if idx < len(COLUMNS):
                if "k10-recipe__allergen-icon_red-dot" in cls:
                    states[col] = "yes"
                elif "k10-recipe__allergen-icon_may-icon" in cls:
                    states[col] = "may"
                else:
                    raise SystemExit(f"{here}: column {col!r} has an unknown mark {sorted(cls)}")
            else:
                states[col] = "yes"
                if img.attrs.get("src", "").rsplit("/", 1)[-1] != f"{col.lower()}_32.png":
                    raise SystemExit(f"{here}: column {col!r} has the picture {img.attrs.get('src')!r}")
            pg = img.attrs.get("data-k10-popover-guid", "")
            if pg != f"{guid}-{lid}":
                raise SystemExit(f"{here}: column {col!r} (label id {lid}) has the pop-up id {pg!r}, expected {guid}-{lid}")
            if pg not in pops or pops[pg][0] != idx:
                raise SystemExit(f"{here}: column {col!r} has no pop-up right after it")
            lines = [d.text() for d in pops[pg][1].find("k10-popover__content").children if isinstance(d, tk.Node)]
            if idx >= len(COLUMNS):
                if lines != [f"Suitable for {col}"]:
                    raise SystemExit(f"{here}: the {col} pop-up reads {lines}")
                suitable[col] = True
                continue
            c_parts, m_parts = _printed_lines(lines, here)
            # a pop-up belongs to one allergen: every part it prints names that column's allergen
            for h, _ in c_parts + m_parts:
                if h.lower() != col.lower():
                    raise SystemExit(f"{here}: the {col} pop-up names {h!r}")
            if states[col] == "yes" and not c_parts:
                raise SystemExit(f"{here}: the {col} column has a red dot but its pop-up has no 'Contains' line")
            if states[col] == "may" and (c_parts or not m_parts):
                raise SystemExit(f"{here}: the {col} column is marked M but its pop-up reads {lines}")
            popup_contains += c_parts
            popup_may += m_parts
        if len(pops) != sum(1 for s in states.values() if s):
            raise SystemExit(f"{here}: {len(pops)} pop-ups for {sum(1 for s in states.values() if s)} marked columns")

        # the mobile list: same name, calories, and the same Contains / May contain lines
        m = mob[len(rows)] if len(rows) < len(mob) else None
        if m is None or m["guid"] != guid:
            raise SystemExit(f"{here}: the mobile list is not in the same order as the table")
        if m["name"] != name or m["kcal_text"] != kcal_text:
            raise SystemExit(f"{here}: the mobile list prints {m['name']!r} {m['kcal_text']!r}")
        mob_suitable: list = []
        mob_contains, mob_may = _printed_lines(m["lines"], here, mob_suitable)
        if sorted(mob_suitable) != sorted(suitable):
            raise SystemExit(f"{here}: the mobile list says Suitable for {mob_suitable}, the table's diet columns say {sorted(suitable)}")
        if _norm_parts(mob_contains) != _norm_parts(popup_contains) or _norm_parts(mob_may) != _norm_parts(popup_may):
            raise SystemExit(f"{here}: the mobile list reads Contains {m['lines']} but the pop-ups read "
                             f"{popup_contains} / {popup_may}")
        ids = (node.attrs.get("data-all-labels", ""), node.attrs.get("data-no-may-labels", ""))
        if m["ids"] != ids:
            raise SystemExit(f"{here}: label ids differ between the table and the mobile list")
        all_ids = [i for i in ids[0].split(",") if i]
        no_may = [i for i in ids[1].split(",") if i]
        label_ids = (all_ids, no_may)

        # allergens: the pop-up lines against the page's allergen filter ids (parents; stops on a disagreement) ...
        checked = tk.allergens_checked({"contains": popup_contains, "may": popup_may, "label_ids": label_ids, "filter": filt},
                                       here, EXTRA_WORDS)
        if checked is None:
            raise SystemExit(f"{here}: allergens could not be checked against the page's filter")
        # ... and against the columns
        col_yes = allergen_words([c for c, _ in COLUMNS if states[c] == "yes"], here, EXTRA_WORDS)[0]
        col_may = allergen_words([c for c, _ in COLUMNS if states[c] == "may"], here, EXTRA_WORDS)[0]
        if col_yes != checked["contains"] or col_may != checked["may_contain"] - checked["contains"]:
            raise SystemExit(f"{here}: the columns (contains {sorted(col_yes)}, may {sorted(col_may)}) disagree with the pop-ups")
        # the cereal / tree-nut kinds have ids the page does not name: their number must at least match what is printed
        named_ids = set(filt) | set(diet_ids)
        kinds_all = [i for i in all_ids if i not in named_ids]
        kinds_contained = [i for i in no_may if i not in named_ids]
        printed_all = {w.lower() for h, inner in popup_contains + popup_may for w in inner}
        printed_contained = {w.lower() for h, inner in popup_contains for w in inner}
        if len(kinds_all) != len(printed_all) or len(kinds_contained) != len(printed_contained):
            raise SystemExit(f"{here}: {len(kinds_all)} cereal/nut ids ({len(kinds_contained)} contained) but the pop-ups name "
                             f"{sorted(printed_all)} ({sorted(printed_contained)} contained)")
        # diet columns against the diet ids
        for col, lid in DIET_COLUMNS:
            if (lid in all_ids) != bool(suitable.get(col)):
                raise SystemExit(f"{here}: the {col} column and the label ids disagree")
        if suitable.get("Vegan") and not suitable.get("Vegetarian"):
            raise SystemExit(f"{here}: marked Vegan but not Vegetarian")

        sibs = [c for c in node.parent.children if isinstance(c, tk.Node)]
        nxt = sibs[sibs.index(node) + 1] if sibs.index(node) + 1 < len(sibs) else None
        card = nxt if nxt is not None and nxt.has("k10-recipe-card") and nxt.attrs.get("data-guid") == guid else None
        desc = card.find("k10-recipe__desc") if card is not None else None
        rows.append({"section": section, "name": name, "kcal": kcal, "kcal_text": kcal_text, "guid": guid,
                     "desc": desc.text() if desc is not None else "", "contains": popup_contains, "may": popup_may,
                     "allergens": checked, "vegetarian": bool(suitable.get("Vegetarian")), "vegan": bool(suitable.get("Vegan")),
                     "label_ids": label_ids})
    if len(mob) != len(rows):
        raise SystemExit(f"{where}: the mobile list has {len(mob)} dishes, the table {len(rows)}")
    return rows
