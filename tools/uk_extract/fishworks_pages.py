"""Reader for Fishworks' own dietary-information page on Ten Kites (https://menus.tenkites.com/brg/fishworks), standard library only.

www.fishworks.co.uk/restaurants/covent-garden and /restaurants/marylebone both link this one page as "View our dietary information"
(and both link the same "A La Carte Menu" PDF). It holds one menu, "A La Carte Menu", in the older Ten Kites "pop-over" template
(the Boparan group's page for Giraffe uses the newer compact one): per dish the name, a description, the calories beside the name
("718 kcal"), and a pop-over with the allergen icons ("Contains Eggs or Egg Derivatives", "Contains Cereals (Gluten) (Barley, Wheat)"),
one line "Dish ingredients may also contain: ..." (the page's "may contain") and an empty nutrient block: there is NO protein,
carbohydrate, fat, salt, sugar, fibre, kJ or weight anywhere, so the chain is calories-only.

A dish's allergens are printed four ways and the reader stops unless all four agree (tenkites_c.allergens_checked does the first two):
  1. the pop-over's "Contains ..." icons (cereals and tree nuts named in brackets) and the "may also contain" line;
  2. the label ids on the dish element (data-all-labels / data-no-may-labels), named by the page's own allergen filter;
  3. the Dietary Needs list (the dietary advice dialog): every dish again with its icons, "May Contain" icons separated.
The Vegetarian / Vegan icons are checked against the label ids 50 / 52, and the dish-level icons against the pop-over's.
A dish with no allergen icon at all is accepted only when the page marks it Vegan (a positive statement), never as "unknown".

Nothing here converts, rounds, fills in or estimates a number. A thousands comma is dropped from the calories ("1,003" -> "1003").
"""
from __future__ import annotations
import hashlib
import html
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import allergen_words  # noqa: E402

MAY_PREFIX = "Dish ingredients may also contain:"
# the page's pop-over / dialog icon titles -> the name the page's own allergen filter gives that allergen
ICON_TO_FILTER = {
    "Celery or Celeriac Products": "Celery", "Crustaceans": "Crustaceans", "Eggs or Egg Derivatives": "Eggs",
    "Fish or Fish Products": "Fish", "Lupin": "Lupin", "Milk or Milk Products": "Milk", "Molluscs": "Molluscs",
    "Mustard": "Mustard", "Sesame Seed": "Sesame Seeds", "Soya": "Soya", "Sulphur Dioxide/ Sulphites": "Sulphur Dioxide/ Sulphites",
    "Peanuts": "Peanuts", "Tree Nuts": "Tree Nuts", "Cereals (Gluten)": "Cereals with Gluten",
}
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}   # this page's own spelling of the sulphites allergen
TITLE = re.compile(r"^Contains (Cereals \(Gluten\)|Tree Nuts|[^()]+?)(?: \(([^()]*)\))?$")
KCAL = re.compile(r"^(\d{1,3}(?:,\d{3})+|\d+) kcal$")
ROBOTS_URL = "https://menus.tenkites.com/robots.txt"


def fetch(url: str, dest: Path, delay: float = 1.0) -> str:
    """Download the page once (robots.txt first: a path it disallows stops the run) and return the SHA-256 of the saved file."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    robots = dest.parent / "robots.txt"
    tk.fetch(ROBOTS_URL, robots, delay)
    path = "/" + url.split("://", 1)[1].split("/", 1)[1]
    if not robots_rfc.allowed(robots_rfc.parse(robots.read_text(encoding="utf-8")), path):
        raise SystemExit(f"robots.txt of menus.tenkites.com disallows {path}: do not work round it, ask the founder")
    for attempt in range(3):   # a dropped connection is retried twice; an HTTP error or a robots block is not
        proc = subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", tk.USER_AGENT, "-o", str(dest), url])
        if proc.returncode == 0:
            break
        if proc.returncode not in (35, 52, 56) or attempt == 2:
            raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}): stop and check by hand, do not work round it")
        time.sleep(5)
    time.sleep(delay)
    return hashlib.sha256(dest.read_bytes()).hexdigest()


def _parts_from_icons(titles: list, where: str) -> list:
    """Icon titles ('Contains Cereals (Gluten) (Barley, Wheat)') -> [(filter name, [named cereals / nuts])]."""
    out = []
    for title in titles:
        m = TITLE.match(title)
        if not m or m.group(1) not in ICON_TO_FILTER:
            raise SystemExit(f"{where}: unknown allergen icon {title!r}: check the page and add it to ICON_TO_FILTER if it is one of the 14")
        out.append((ICON_TO_FILTER[m.group(1)], [w.strip() for w in (m.group(2) or "").split(",") if w.strip()]))
    return out


def _dialog(root: "tk.Node") -> list:
    """The Dietary Needs dialog: [(section, dish name, data-labels, contains generic names, may generic names)] in page order."""
    table = root.find("k10-dietary__table")
    if table is None:
        raise SystemExit("the page has no dietary dialog (k10-dietary__table): the Ten Kites layout changed")
    rows = []
    sections = table.find("k10-dietary__sections")
    if sections is None:
        raise SystemExit("the dietary dialog has no sections: the Ten Kites layout changed")
    kids = [c for c in sections.children if isinstance(c, tk.Node)]
    if len(kids) % 2 or any(not (k.has("k10-dietary__section-name") if i % 2 == 0 else k.has("k10-dietary__section-items"))
                            for i, k in enumerate(kids)):
        raise SystemExit("the dietary dialog is no longer a list of (section name, section items) pairs: the Ten Kites layout changed")
    for head, block in zip(kids[0::2], kids[1::2]):
        for rec in block.find_all("k10-dietary__recipe"):
            name = rec.find("k10-dietary__recipe-name").text()
            icons = [i.attrs.get("title", "") for i in rec.find("k10-dietary__recipe-icons").find_all(tag="img")
                     if "k10-dietary__img" in i.classes]
            may_box = rec.find("k10-dietary__may-contain")
            may_text = ""
            if may_box is not None:
                spans = [s for s in may_box.children if isinstance(s, tk.Node) and s.tag == "span"]
                if len(spans) != 2 or spans[0].text() != "May Contain":
                    raise SystemExit(f"{name}: unknown May Contain box in the dietary dialog")
                may_text = spans[1].text()
            may_titles = [("Contains " + x).strip() for x in may_text.split("Contains ") if x.strip()] if may_text else []
            rows.append({"section": head.text(), "name": name, "labels": rec.attrs.get("data-labels", ""),
                         "icons": icons, "may_titles": may_titles})
    return rows


def read_dishes(text: str) -> list:
    """One dict per dish of the page, in page order:
    {section, name, desc, energy ('718 kcal' or ''), contains [(name, [inner])], may [(name, [inner])], vegan, vegetarian,
     label_ids (all ids, contained ids), filter {id: name}}.  Stops if the page's own forms of a dish disagree."""
    root = tk.parse_html(text)
    filt = tk.filter_labels(root)
    body = root.find("k10-all-courses")
    if body is None:
        raise SystemExit("the page has no k10-all-courses block: the Ten Kites layout changed")
    rows = []
    for course in body.find_all("k10-course"):
        head = next((c for c in course.children if isinstance(c, tk.Node) and c.has("k10-course__name")), None)
        section = head.text() if head is not None else ""
        if not section:
            raise SystemExit("a menu section without a name")
        for rec in course.find_all("k10-recipe_menu-item"):
            names = rec.find_all("k10-recipe__name")
            energy = rec.find_all("k10-recipe__nutrient_energy")
            if len(names) != 1 or len(energy) != 1:
                raise SystemExit(f"{section}: a dish with {len(names)} names / {len(energy)} calorie values")
            name = names[0].text()
            where = f"{section} > {name}"
            desc = rec.find("k10-recipe__desc")
            pop = rec.find("k10-popover")
            if pop is None:
                raise SystemExit(f"{where}: no pop-over")
            nutrients = pop.find("k10-popover__nutrients-wrapper")
            if nutrients is None or nutrients.text():
                raise SystemExit(f"{where}: the nutrient block of the pop-over is not empty any more ({nutrients.text() if nutrients else None!r}): "
                                 "the page now prints more than calories; re-check what is published before running again")
            titles = [i.attrs.get("title", "") for i in pop.find_all("k10-popover__label")]
            suitable = [t for t in titles if t.startswith("Suitable for")]
            if sorted(suitable) not in ([], ["Suitable for Vegans", "Suitable for Vegetarians"], ["Suitable for Vegetarians"]):
                raise SystemExit(f"{where}: unknown 'Suitable for' icons {suitable}")
            contains = _parts_from_icons([t for t in titles if not t.startswith("Suitable for")], where)
            may = None
            boxes = pop.find_all("k10-popover__may-contain-label-wrapper")
            if len(boxes) > 1:
                raise SystemExit(f"{where}: two 'may contain' lines")
            if boxes:
                line = boxes[0].text()
                if not line.startswith(MAY_PREFIX):
                    raise SystemExit(f"{where}: unknown 'may' line {line!r}")
                may = tk._parts(line[len(MAY_PREFIX):].strip())
            ids = tk._label_ids(rec)
            if ids is None:
                raise SystemExit(f"{where}: no label ids on the dish")
            # dish-level veg icons (outside the pop-over) must match the pop-over's and the ids 50 (Vegetarian) / 52 (Vegan)
            outer = sorted(i.attrs.get("title", "") for i in rec.find_all(tag="img")
                           if i.attrs.get("title", "").startswith("Suitable for") and "k10-recipe__lable_" in i.attrs.get("class", ""))
            vegan, vegetarian = "Suitable for Vegans" in suitable, "Suitable for Vegetarians" in suitable
            if outer != sorted(suitable) or ("52" in ids[0]) != vegan or ("50" in ids[0]) != vegetarian:
                raise SystemExit(f"{where}: Vegan / Vegetarian icons ({suitable}, outside the pop-over {outer}) disagree with the label ids "
                                 f"{sorted(set(ids[0]) & {'50', '52'})}")
            if not contains and not vegan:
                raise SystemExit(f"{where}: no allergen icons and no Vegan mark: cannot tell 'contains none' from 'not recorded'")
            m = KCAL.match(energy[0].text())
            if not m:
                raise SystemExit(f"{where}: unexpected calories text {energy[0].text()!r}")
            rows.append({"section": section, "name": name, "desc": desc.text() if desc is not None else "",
                         "energy": energy[0].text(), "kcal": tk.printed(m.group(1)), "contains": contains, "may": may or [],
                         "vegan": vegan, "vegetarian": vegetarian, "label_ids": ids, "filter": filt})
    # the dialog is a second copy of the same dishes in the same order, with the generic allergens
    dialog = _dialog(root)
    if [(d["section"], d["name"]) for d in dialog] != [(r["section"], r["name"]) for r in rows]:
        raise SystemExit("the dietary dialog lists other dishes (or another order) than the menu: the page layout changed")
    for r, d in zip(rows, dialog):
        where = f"{r['section']} > {r['name']}"
        if d["labels"] != ",".join(r["label_ids"][0]):
            raise SystemExit(f"{where}: the dialog's label ids {d['labels']!r} differ from the dish's {','.join(r['label_ids'][0])!r}")
        diet = sorted(t for t in d["icons"] if t.startswith("Suitable for"))
        if diet != sorted(["Suitable for Vegans"] * r["vegan"] + ["Suitable for Vegetarians"] * r["vegetarian"]):
            raise SystemExit(f"{where}: the dialog's diet icons {diet} differ from the menu's")
        generic = lambda titles: allergen_words([ICON_TO_FILTER[t[len('Contains '):]] for t in titles], where, ALLERGEN_EXTRA)[0]  # noqa: E731
        try:
            d_all = generic([t for t in d["icons"] if not t.startswith("Suitable for")])
            d_may = generic(d["may_titles"])
        except KeyError as exc:
            raise SystemExit(f"{where}: unknown icon in the dietary dialog: {exc}")
        d_contains = d_all - d_may
        p_contains = allergen_words([h for h, _ in r["contains"]], where, ALLERGEN_EXTRA)[0]
        p_may = allergen_words([h for h, _ in r["may"]], where, ALLERGEN_EXTRA)[0]
        # a key that is both contained and "may also contain" (wheat contained, oats possible) shows once in the dialog, as contained
        if d_contains != p_contains or d_may != p_may - p_contains:
            raise SystemExit(f"{where}: the dietary dialog (contains {sorted(d_contains)}, may {sorted(d_may)}) disagrees with the pop-over "
                             f"(contains {sorted(p_contains)}, may {sorted(p_may)})")
    return rows


def allergens(row: dict, where: str) -> dict:
    """The dish's allergens: the pop-over's Contains icons and May line, checked against the page's own label ids (stops if they
    disagree). contains / may_contain are sets of the 14 keys, cereals and nuts the named kinds of what the dish contains."""
    out = tk.allergens_checked({"contains": row["contains"], "may": row["may"], "label_ids": row["label_ids"], "filter": row["filter"]},
                               where, ALLERGEN_EXTRA)
    if out is None:
        raise SystemExit(f"{where}: allergens could not be checked against the page's filter")
    return out


def page_title(text: str) -> str:
    m = re.search(r"<title>(.*?)</title>", text, re.S)
    return html.unescape(m.group(1)).strip() if m else ""
