"""Reader and downloader for Butcombe Inns' own allergy pages (Ten Kites pages on viewthe.menu), used by butcombe_inns.py.
Standard library only; run python with -I when reading saved pages.

Butcombe's "Allergy Aware" page (https://butcombe.com/allergyaware/) holds a drop-down of the group's pubs (a JavaScript list of
{label: "<pub>, <town>", value: "https://viewthe.menu/<code>"}); each address is that pub's Ten Kites menu page. The page opens the pub's
first menu and a tab bar lists the pub's other menus (Sunday, Daily Menu, Puddings, Brunch, Kids ...); a menu is fetched as
<pub address>?mguid=<menu id>. Like Hall & Woodhouse's pages (hall_and_woodhouse_pages.py) the page carries each menu twice, a wide
"desktop" table and a "mobile" list. This module reads the table (name, the calories printed in brackets beside the name, 14 allergen
columns marked yes / may / no and a "Dietary Information" card with the printed "Contains / May contain" lines), reads the mobile list
with different code and stops if its names, calories or label ids differ from the table's.

What differs from Hall & Woodhouse's pages: there is no "Nutrition values per serving" card, no Plant Based / Vegetarian column and no
Gluten Free cereal columns. The only number is the calories in brackets beside each dish name; the diet marks are printed inside the
dish name ("(v)", "(ve)").

Nothing here converts, rounds, fills in or estimates a number. A dish whose bracket is absent has no printed calories (None). Allergens
come from three printed forms that must agree (the 14 columns, the printed lines and the label ids the page's own filter uses); a dish
for which they disagree is returned with `problem` set and left out by the builder, never corrected.
"""
from __future__ import annotations
import hashlib
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import allergen_words  # noqa: E402

HUB_URL = "https://butcombe.com/allergyaware/"
SITE = "https://viewthe.menu"
COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
           "Sulphur Dioxide/Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
KCAL = re.compile(r"^(\d{1,3}(?:,\d{3})*|\d+) kcal$")
DELAY = 1.2        # seconds after every request (the brief allows one a second)


def hub_pubs(text: str) -> list:
    """[(code, label)] from the hub page's JavaScript list, in page order."""
    import html
    out = []
    for m in re.finditer(r"""\{\s*label:\s*"([^"]*)"\s*,\s*value:\s*'https://viewthe\.menu/([a-z0-9]+)'\s*\}""", text):
        out.append((m.group(2), html.unescape(m.group(1)).strip()))
    return out


def get(url: str, dest: Path, rules: list, host: str) -> None:
    """Download one page (robots.txt of its host checked first; one request; a dropped connection is retried twice, 5 s apart; an HTTP
    error is not retried and stops the run). Sleeps DELAY seconds afterwards."""
    path = url[len(host):]
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt of {host} disallows {path}: stop, do not work round it")
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        proc = subprocess.run(["curl", "-sS", "--fail", "--compressed", "-L", "-A", tk.USER_AGENT, "-o", str(dest), url])
        if proc.returncode == 0:
            break
        if proc.returncode not in (35, 52, 56) or attempt == 2:
            raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}): stop and check by hand, do not work round it")
        time.sleep(5)
    time.sleep(DELAY)


def robots(dest: Path, host: str, fetch: bool) -> list:
    """The `*` rules of a host's robots.txt (saved beside the pages; fetched once with --fetch)."""
    dest = Path(dest)
    if fetch or not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(["curl", "-sS", "--fail", "--compressed", "-L", "-A", tk.USER_AGENT, "-o", str(dest), host + "/robots.txt"])
        if proc.returncode != 0:
            raise SystemExit(f"could not read {host}/robots.txt (curl exit {proc.returncode}): stop")
        time.sleep(DELAY)
    return robots_rfc.parse(dest.read_text(encoding="utf-8"))


def menu_tabs(root: "tk.Node") -> list:
    """The page's tab bar: [(menu name, menu id)] in order."""
    out = []
    for n in root.iter():
        guid = n.attrs.get("data-menu-identifier")
        if guid and n.has("k10-menu-selector__option-name"):
            out.append((n.text(), guid))
    return out


def lines_of(card: "tk.Node | None", where: str) -> dict:
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


def kcal_of(node: "tk.Node", where: str):
    """(calories shown beside the name or None, calories only held in the page's data attribute or None). A figure that the page does
    not show anywhere is not a printed figure: the builder reports it and does not publish it."""
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


class Disagree(Exception):
    """One dish whose own three printed forms of its allergens (columns, lines, filter ids) do not agree. The dish is reported and
    left out; the run goes on. Anything else wrong with a page (a missing column, an unknown word) stops the run."""


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
    {section, name, kcal (str or None), hidden_kcal, recipe_id, allergens {contains, may_contain, cereals, nuts} (sets) or None with
     `problem` saying why (the dish's own allergen forms disagree), lines {contains, may (printed parts)}, suitable (printed
     'Suitable for' words), options (the dish has choose-your-option sub-items, whose own calories and allergens are not read)}."""
    root = tk.parse_html(text)
    desktop, mobile = root.find("k10-all-courses_desktop"), root.find("k10-all-courses_mobile")
    if desktop is None or mobile is None:
        raise SystemExit(f"{where}: the page no longer has the desktop and mobile course blocks")
    filt = tk.filter_labels(root)
    if sorted(filt.values()) != sorted(COLUMNS):
        raise SystemExit(f"{where}: the allergen filter lists {sorted(filt.values())}, expected exactly the 14 allergens")
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
        label_cells = [c for c in node.find_all("k10-recipe__label") if c.attrs.get("data-label-name")]
        states = {c.attrs["data-label-name"]: tk._state(c) for c in label_cells}
        extra_cols = sorted(set(states) - set(COLUMNS))
        if extra_cols:
            raise SystemExit(f"{here}: columns this reader has not seen: {extra_cols}")
        missing = [c for c in COLUMNS if states.get(c) not in ("yes", "may", "no")]
        if missing:
            raise SystemExit(f"{here}: allergen columns without a mark: {missing}: the dish is not fully covered")
        card = node.parent
        lines = lines_of(card, here)
        ids = tk._label_ids(node, rid)
        if ids is None:
            raise SystemExit(f"{here}: no label ids on the dish")
        allergens, problem = None, ""
        try:
            allergens = _allergens(lines["contains"], lines["may"], ids, filt, states, here)
        except Disagree as exc:
            allergens, problem = None, str(exc)
        kcal, hidden = kcal_of(node, here)
        rows.append({"section": section, "name": name, "kcal": kcal, "hidden_kcal": hidden, "recipe_id": rid, "allergens": allergens,
                     "problem": problem, "lines": {"contains": lines["contains"], "may": lines["may"]}, "suitable": lines["suitable"],
                     "options": card.find("k10-byo__item") is not None, "label_ids": (tuple(ids[0]), tuple(ids[1]))})
    # the mobile list is a second, differently built copy: same dishes in the same order with the same calories and labels
    mobile_rows = []
    for node in mobile.iter():
        if node.has("k10-recipe") and node.has("k10-recipe_mobile") and not node.has("k10-recipe-card"):
            n = node.find("k10-w-recipe__name")
            if n is not None:
                mobile_rows.append((node.attrs.get("data-recipe-id", ""), n.text(), kcal_of(node, f"{where} (mobile)")[0],
                                    node.attrs.get("data-all-labels", ""), node.attrs.get("data-no-may-labels", "")))
    table_rows = [(r["recipe_id"], r["name"], r["kcal"], ",".join(r["label_ids"][0]), ",".join(r["label_ids"][1])) for r in rows]
    if mobile_rows != table_rows:
        diff = [(a, b) for a, b in zip(table_rows, mobile_rows) if a != b][:3]
        raise SystemExit(f"{where}: the mobile list differs from the table ({len(mobile_rows)} vs {len(table_rows)} dishes), e.g. {diff}")
    return rows


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
