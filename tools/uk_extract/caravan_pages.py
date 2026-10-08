"""Reader for Caravan's Ten Kites menu pages (menus.tenkites.com/caravan/...), used by caravan.py. Standard library only.

Caravan's own page https://caravanandco.com/pages/nutrition links one page per restaurant group (London, Manchester, Vardo);
each embeds a Ten Kites menu with a tab bar of menus (ALL DAY, BREAKFAST + BRUNCH, DRINKS, set menus ...). A menu is fetched as
<base>?mguid=<menu id>. The page carries the whole menu twice, a wide "desktop" table and a "mobile" list; this module reads the
desktop table (name, the calories the page prints beside the name, 14 allergen columns marked yes / may / no, a "Deep Fat Fryer"
column, "Plant-Based" and "Vegetarian" columns, and a "Dietary Information" card with the printed "Suitable for / Contains / May
contain" lines) and returns one row per printed dish. It reads the mobile list with different code and stops if its names,
calories and label ids differ from the table's.

Nothing here converts, rounds, fills in or estimates a number. A calorie value printed as "-" is returned as None ("not
published"). Allergens come from three printed forms that must agree: the 14 columns, the printed lines, and the label ids the
page's own allergen filter uses (tenkites_c.allergens_checked). "Deep Fat Fryer" is printed among the allergens but is a cooking
marker, not one of the 14: it is kept apart (row["fryer"]) and is never turned into an allergen.
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

COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
           "Sulphur Dioxide/ Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
DIET_COLUMNS = ["Plant-Based", "Vegetarian"]
FRYER = "Deep Fat Fryer"
EXTRA_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}   # this page's spelling of the sulphites allergen
KCAL = re.compile(r"^(\d{1,3}(?:,\d{3})*|\d+) kcal$")


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


def menu_tabs(root: "tk.Node") -> list[tuple[str, str]]:
    """The page's tab bar: [(menu name, menu id)] in order."""
    out = []
    for n in root.iter():
        guid = n.attrs.get("data-menu-identifier")
        if guid and n.has("k10-menu-selector__option-name"):
            out.append((n.text(), guid))
    return out


def _lines(card: "tk.Node | None", where: str) -> dict:
    """The card's printed lines: {'suitable': [..], 'contains': parts, 'may': parts} (parts as tenkites_c._parts)."""
    out = {"suitable": [], "contains": [], "may": []}
    if card is None:
        return out
    wrapper = card.find("k10-recipe__label-names-wrapper")
    if wrapper is None:
        return out
    for div in (c for c in wrapper.children if isinstance(c, tk.Node)):
        text = div.text()
        for head, field in (("Suitable for:", "suitable"), ("Contains:", "contains"), ("May contain:", "may")):
            if text.startswith(head):
                body = text[len(head):].strip()
                out[field] = [w.strip() for w in body.split(",") if w.strip()] if field == "suitable" else tk._parts(body)
                break
        else:
            raise SystemExit(f"{where}: unknown dietary line {text!r}")
    return out


def _kcal(node: "tk.Node", where: str) -> str | None:
    shown = node.find("k10-primary-nutrient__item")
    attr = node.attrs.get("data-calories", "")
    if shown is None:
        if attr != "-":
            raise SystemExit(f"{where}: no calories shown but data-calories={attr!r}")
        return None
    m = KCAL.match(shown.text())
    if not m:
        raise SystemExit(f"{where}: unexpected calories text {shown.text()!r}")
    value = m.group(1).replace(",", "")
    if attr.replace(",", "") != value:
        raise SystemExit(f"{where}: shown {shown.text()!r} differs from data-calories={attr!r}")
    return value


class Disagree(Exception):
    """One dish whose own three printed forms of its allergens (columns, lines, filter ids) do not agree. The dish is reported
    and left out; the run goes on. Anything else wrong with a page (a missing column, an unknown word) stops the run."""


def _allergens(contains: list, may: list, ids: tuple, filt: dict, states: dict, here: str) -> dict:
    try:
        checked = tk.allergens_checked({"contains": contains, "may": may, "label_ids": ids, "filter": filt}, here, EXTRA_WORDS)
    except SystemExit as exc:
        if "disagree" in str(exc):
            raise Disagree(str(exc)) from None
        raise
    if checked is None:
        raise SystemExit(f"{here}: allergens could not be checked against the page's filter")
    col_yes = allergen_words([c for c in COLUMNS if states[c] == "yes"], here, EXTRA_WORDS)[0]
    col_may = allergen_words([c for c in COLUMNS if states[c] == "may"], here, EXTRA_WORDS)[0]
    if col_yes != checked["contains"] or col_may - col_yes != checked["may_contain"] - checked["contains"]:
        raise Disagree(f"{here}: the allergen columns (contains {sorted(col_yes)}, may {sorted(col_may)}) disagree with the printed lines "
                       f"(contains {sorted(checked['contains'])}, may {sorted(checked['may_contain'])})")
    return checked


def read_page(text: str, where: str) -> list[dict]:
    """One row per dish in the page's desktop table, in page order:
    {section, name, kcal (str or None), recipe_id, allergens {contains, may_contain, cereals, nuts} (sets) or None with
     `problem` saying why (the dish's own allergen forms disagree),
     lines {contains, may (printed parts)}, vegetarian, plant_based, fryer (bool), label_ids}."""
    root = tk.parse_html(text)
    desktop, mobile = root.find("k10-all-courses_desktop"), root.find("k10-all-courses_mobile")
    if desktop is None or mobile is None:
        raise SystemExit(f"{where}: the page no longer has the desktop and mobile course blocks")
    filt = tk.filter_labels(root)
    rows, section = [], ""
    for node in desktop.iter():
        if node.has("k10-course__name") and node.has("k10-w-course__name"):
            section = node.text()
            parent_classes = node.parent.classes if node.parent is not None else set()
            if "k10-course_l1" not in parent_classes:
                raise SystemExit(f"{where}: section {section!r} is not a top-level section: the page nests sections now")
        if not (node.has("k10-w-recipe__info") and node.has("k10-recipe")):
            continue
        name = node.find("k10-w-recipe__name").text()
        here = f"{where}: {name!r}"
        rid = node.attrs.get("data-recipe-id", "")
        states = {c.attrs["data-label-name"]: tk._state(c) for c in node.find_all("k10-recipe__label") if c.attrs.get("data-label-name")}
        missing = [c for c in COLUMNS + DIET_COLUMNS + [FRYER] if states.get(c) not in ("yes", "may", "no")]
        if missing:
            raise SystemExit(f"{here}: allergen columns without a mark: {missing}: the dish is not fully covered")
        if states[FRYER] == "may" or states["Plant-Based"] == "may" or states["Vegetarian"] == "may":
            raise SystemExit(f"{here}: a 'may' mark in a column that has only been seen as yes/no")
        card = node.parent
        lines = _lines(card, here)
        fryer_printed = any(h.lower() == FRYER.lower() for h, _ in lines["contains"]) or any(h.lower() == FRYER.lower() for h, _ in lines["may"])
        if (states[FRYER] != "no") != fryer_printed:
            raise SystemExit(f"{here}: the '{FRYER}' column and the printed lines disagree")
        contains = [(h, i) for h, i in lines["contains"] if h.lower() != FRYER.lower()]
        may = [(h, i) for h, i in lines["may"] if h.lower() != FRYER.lower()]
        ids = tk._label_ids(node, rid)
        if ids is None:
            raise SystemExit(f"{here}: no label ids on the dish")
        suitable = {s.lower() for s in lines["suitable"]}
        allergens, problem = None, ""
        try:
            allergens = _allergens(contains, may, ids, filt, states, here)
            if ("plant-based" in suitable) != (states["Plant-Based"] == "yes") or ("vegetarian" in suitable) != (states["Vegetarian"] == "yes"):
                raise Disagree(f"{here}: the diet columns disagree with the printed 'Suitable for' line {lines['suitable']}")
        except Disagree as exc:
            allergens, problem = None, str(exc)
        rows.append({"section": section, "name": name, "kcal": _kcal(node, here), "recipe_id": rid, "allergens": allergens, "problem": problem,
                     "lines": {"contains": contains, "may": may}, "vegetarian": states["Vegetarian"] == "yes",
                     "plant_based": states["Plant-Based"] == "yes", "fryer": states[FRYER] != "no",
                     "label_ids": (tuple(ids[0]), tuple(ids[1]))})
    # the mobile list is a second, differently built copy: same dishes in the same order with the same calories and labels
    mobile_rows = []
    for node in mobile.iter():
        if node.has("k10-recipe") and node.has("k10-recipe_mobile") and not node.has("k10-recipe-card"):
            n = node.find("k10-w-recipe__name")
            if n is not None:
                mobile_rows.append((node.attrs.get("data-recipe-id", ""), n.text(), _kcal(node, f"{where} (mobile)"),
                                    node.attrs.get("data-all-labels", ""), node.attrs.get("data-no-may-labels", "")))
    table_rows = [(r["recipe_id"], r["name"], r["kcal"], ",".join(r["label_ids"][0]), ",".join(r["label_ids"][1])) for r in rows]
    if mobile_rows != table_rows:
        diff = [(a, b) for a, b in zip(table_rows, mobile_rows) if a != b][:3]
        raise SystemExit(f"{where}: the mobile list differs from the table ({len(mobile_rows)} vs {len(table_rows)} dishes), e.g. {diff}")
    return rows
