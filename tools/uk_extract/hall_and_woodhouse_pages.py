"""Reader for Hall & Woodhouse's Ten Kites menu pages (viewthe.menu/<pub code>), used by hall_and_woodhouse.py. Standard library only.

Hall & Woodhouse's own page https://www.hall-woodhouse.co.uk/allergens/ ("Allergy Information: please select the pub you are booking
for and we will present the relevant allergy information") is a drop-down of pubs; each pub is a Ten Kites address such as
https://viewthe.menu/xap7. That page opens the pub's first menu, and a tab bar lists the pub's other menus (Ground Floor Main Menu, Kids
menu, Puddings, Sunday, Brunch ...). A menu is fetched as <pub address>?mguid=<menu id>. Like Caravan's pages (caravan_pages.py) the page
carries each menu twice, a wide "desktop" table and a "mobile" list; this module reads the table (name, the calories printed beside the
name, 14 allergen columns marked yes / may / no, two "Gluten Free" cereal columns, "Plant Based" and "Vegetarian" columns and a
"Dietary Information" card with the printed "Suitable for / Contains / May contain" lines), reads the mobile list with different code and
stops if its names, calories or label ids differ from the table's.

Nothing here converts, rounds, fills in or estimates a number. A calorie value printed as "-" is returned as None ("not published").
Allergens come from three printed forms that must agree: the 14 columns, the printed lines and the label ids the page's own allergen
filter uses (tenkites_c.allergens_checked). The filter also lists "Gluten Free Oats" and "Gluten Free Barley": they are not among the
14 and what they mean for a dish is not stated, so a dish that carries either mark is returned with `gf_cereal` set and the builder
leaves it out (it is never turned into an allergen, and never ignored silently).
"""
from __future__ import annotations
import hashlib
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import allergen_words  # noqa: E402

COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
           "Sulphur Dioxide/Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
GF_COLUMNS = ["Gluten Free Oats", "Gluten Free Barley"]          # in the page's allergen filter, but not among the 14
DIET_COLUMNS = ["Plant Based", "Vegetarian"]
SITE = "https://viewthe.menu"
KCAL = re.compile(r"^(\d{1,3}(?:,\d{3})*|\d+) kcal$")


def robots_rules(dest: Path, fetch: bool) -> list:
    """viewthe.menu's robots.txt rules (saved beside the pages; fetched once with --fetch)."""
    if fetch:
        req = urllib.request.Request(SITE + "/robots.txt", headers={"User-Agent": tk.USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            Path(dest).write_text(resp.read().decode("utf-8", errors="replace"), encoding="utf-8")
        time.sleep(1.0)
    return robots_rfc.parse(Path(dest).read_text(encoding="utf-8"))


def fetch(url: str, dest: Path, rules: list, delay: float = 1.5) -> str:
    """Download one page (robots.txt checked first; one request; a dropped connection is retried twice, 5 s apart; an HTTP error is
    not retried). Returns the SHA-256 of the file."""
    path = url[len(SITE):]
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt of viewthe.menu disallows {path}: stop, do not work round it")
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


def menu_tabs(root: "tk.Node") -> list:
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


def _kcal(node: "tk.Node", where: str):
    """(calories shown beside the name or None, calories only held in the page's data attribute or None). A figure that the page
    does not show anywhere is not a printed figure: the caller reports it and does not publish it."""
    shown = node.find("k10-primary-nutrient__item")
    attr = node.attrs.get("data-calories", "")
    if shown is None:
        return None, (attr.replace(",", "") if attr not in ("-", "") else None)
    m = KCAL.match(shown.text())
    if not m:
        raise SystemExit(f"{where}: unexpected calories text {shown.text()!r}")
    value = m.group(1).replace(",", "")
    if attr.replace(",", "") != value:
        raise SystemExit(f"{where}: shown {shown.text()!r} differs from data-calories={attr!r}")
    return value, None


def _check_nutrient_card(node: "tk.Node", kcal, hidden, where: str) -> None:
    """The dish's own 'Nutrition values per serving' card must hold the one row 'Energy (kCal)' with the same value as the calories beside
    the name; any other row (protein, fat ...) would be nutrition this reader does not capture, so the run stops."""
    tables = node.parent.find_all("k10-recipe__nutrients-table")
    for tbl in tables:
        names = [n.text() for n in tbl.find_all("k10-recipe__nutrient-name")]
        vals = [n.text().replace(",", "") for n in tbl.find_all("k10-recipe__nutrient-value")]
        if names != ["Energy (kCal)"] or vals != [kcal if kcal is not None else (hidden or "-")]:
            raise SystemExit(f"{where}: the nutrition card holds {list(zip(names, vals))}, expected only Energy (kCal) = {kcal or hidden or '-'!r}")


class Disagree(Exception):
    """One dish whose own three printed forms of its allergens (columns, lines, filter ids) do not agree. The dish is reported
    and left out; the run goes on. Anything else wrong with a page (a missing column, an unknown word) stops the run."""


def _allergens(contains: list, may: list, ids: tuple, filt: dict, states: dict, here: str) -> dict:
    try:
        checked = tk.allergens_checked({"contains": contains, "may": may, "label_ids": ids, "filter": filt}, here)
    except SystemExit as exc:
        if "disagree" in str(exc):
            raise Disagree(str(exc)) from None
        raise
    if checked is None:
        raise SystemExit(f"{here}: allergens could not be checked against the page's filter")
    col_yes = allergen_words([c for c in COLUMNS if states[c] == "yes"], here)[0]
    col_may = allergen_words([c for c in COLUMNS if states[c] == "may"], here)[0]
    if col_yes != checked["contains"] or col_may - col_yes != checked["may_contain"] - checked["contains"]:
        raise Disagree(f"{here}: the allergen columns (contains {sorted(col_yes)}, may {sorted(col_may)}) disagree with the printed lines "
                       f"(contains {sorted(checked['contains'])}, may {sorted(checked['may_contain'])})")
    return checked


def read_page(text: str, where: str) -> list:
    """One row per dish in the page's desktop table, in page order:
    {section, name, kcal (str or None), recipe_id, allergens {contains, may_contain, cereals, nuts} (sets) or None with
     `problem` saying why (the dish's own allergen forms disagree), lines {contains, may (printed parts)}, vegetarian, plant_based,
     gf_cereal (the 'Gluten Free Oats / Barley' names marked), options (the dish has choose-your-option sub-items, whose own
     calories and allergens are not read), label_ids}."""
    root = tk.parse_html(text)
    desktop, mobile = root.find("k10-all-courses_desktop"), root.find("k10-all-courses_mobile")
    if desktop is None or mobile is None:
        raise SystemExit(f"{where}: the page no longer has the desktop and mobile course blocks")
    full_filter = tk.filter_labels(root)
    gf_ids = {i for i, name in full_filter.items() if name in GF_COLUMNS}
    if {full_filter[i] for i in gf_ids} != set(GF_COLUMNS):
        raise SystemExit(f"{where}: the allergen filter no longer lists exactly the two Gluten Free cereal names")
    filt = {i: name for i, name in full_filter.items() if i not in gf_ids}
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
        missing = [c for c in COLUMNS + GF_COLUMNS + DIET_COLUMNS if states.get(c) not in ("yes", "may", "no")]
        if missing:
            raise SystemExit(f"{here}: allergen columns without a mark: {missing}: the dish is not fully covered")
        if any(states[c] == "may" for c in GF_COLUMNS + DIET_COLUMNS):
            raise SystemExit(f"{here}: a 'may' mark in a column that has only been seen as yes/no")
        card = node.parent
        lines = _lines(card, here)
        gf_in_lines = {h for h, _ in lines["contains"] + lines["may"] if h in GF_COLUMNS}
        gf_marked = {c for c in GF_COLUMNS if states[c] == "yes"}
        if gf_in_lines != gf_marked:
            raise SystemExit(f"{here}: the Gluten Free columns {sorted(gf_marked)} and the printed lines {sorted(gf_in_lines)} disagree")
        if any(h in GF_COLUMNS for h, _ in lines["may"]):
            raise SystemExit(f"{here}: a Gluten Free name under 'May contain'")
        contains = [(h, i) for h, i in lines["contains"] if h not in GF_COLUMNS]
        may = [(h, i) for h, i in lines["may"] if h not in GF_COLUMNS]
        ids = tk._label_ids(node, rid)
        if ids is None:
            raise SystemExit(f"{here}: no label ids on the dish")
        gf_in_ids = {full_filter[i] for i in ids[0] if i in gf_ids}
        if gf_in_ids != gf_marked or {full_filter[i] for i in ids[1] if i in gf_ids} != gf_marked:
            raise SystemExit(f"{here}: the Gluten Free label ids {sorted(gf_in_ids)} and the columns {sorted(gf_marked)} disagree")
        ids = ([i for i in ids[0] if i not in gf_ids], [i for i in ids[1] if i not in gf_ids])
        suitable = {s.lower() for s in lines["suitable"]}
        allergens, problem = None, ""
        try:
            allergens = _allergens(contains, may, ids, filt, states, here)
            if ("plant based" in suitable) != (states["Plant Based"] == "yes") or ("vegetarian" in suitable) != (states["Vegetarian"] == "yes"):
                raise Disagree(f"{here}: the diet columns disagree with the printed 'Suitable for' line {lines['suitable']}")
        except Disagree as exc:
            allergens, problem = None, str(exc)
        kcal, hidden = _kcal(node, here)
        _check_nutrient_card(node, kcal, hidden, here)
        rows.append({"section": section, "name": name, "kcal": kcal, "hidden_kcal": hidden, "recipe_id": rid, "allergens": allergens, "problem": problem,
                     "lines": {"contains": contains, "may": may}, "vegetarian": states["Vegetarian"] == "yes",
                     "plant_based": states["Plant Based"] == "yes", "gf_cereal": sorted(gf_marked),
                     "options": card.find("k10-byo__item") is not None,
                     "label_ids": (tuple(ids[0]), tuple(ids[1]))})
    # the mobile list is a second, differently built copy: same dishes in the same order with the same calories and labels
    mobile_rows = []
    for node in mobile.iter():
        if node.has("k10-recipe") and node.has("k10-recipe_mobile") and not node.has("k10-recipe-card"):
            n = node.find("k10-w-recipe__name")
            if n is not None:
                mobile_rows.append((node.attrs.get("data-recipe-id", ""), n.text(), _kcal(node, f"{where} (mobile)")[0],
                                    node.attrs.get("data-all-labels", ""), node.attrs.get("data-no-may-labels", "")))
    table_rows = [(r["recipe_id"], r["name"], r["kcal"], ",".join(r["label_ids"][0]), ",".join(r["label_ids"][1])) for r in rows]
    # the table rows had the Gluten Free ids removed: compare after removing them from the mobile ids too
    def strip(ids_text: str) -> str:
        return ",".join(i for i in ids_text.split(",") if i and i not in gf_ids)
    mobile_rows = [(a, b, c, strip(d), strip(e)) for a, b, c, d, e in mobile_rows]
    if mobile_rows != table_rows:
        diff = [(a, b) for a, b in zip(table_rows, mobile_rows) if a != b][:3]
        raise SystemExit(f"{where}: the mobile list differs from the table ({len(mobile_rows)} vs {len(table_rows)} dishes), e.g. {diff}")
    return rows
