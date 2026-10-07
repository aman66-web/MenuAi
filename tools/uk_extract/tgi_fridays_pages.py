"""Reader for TGI Fridays UK's own allergen and calorie guide, a 10kites page (viewthe.menu/2alz).

10kites serves several page layouts (see tenkites_a/b/c.py). This chain's pages are a fifth, calories-only one: each dish is a
`<div class="k10-recipe">` that holds
    * a hidden pop-up `k10-popover` with the lines "Suitable for: ...", "Contains: ..." and "May contain: ..."
    * the dish name (`k10-recipe__name-wrapper`), an optional description (`k10-recipe__desc`)
    * the energy as one text, e.g. "82 kcal" or "2,533 kcal" (`k10-recipe__nutrient_energy`); a dish with no such text has no
      calories printed
    * on the dish's own element, the label ids the page's allergen filter reads (`data-all-labels`, `data-no-may-labels`)
Dishes sit under `k10-course` sections (named by `k10-course__name`); on the kids tab, the "choose your ..." groups are
`k10-byo` blocks whose options are `k10-recipe k10-recipe_byo` dishes.

Nothing here converts, rounds or estimates: the energy is the printed number (a thousands comma is dropped, "2,533" -> "2533").
Allergens are read by tenkites_b.allergens_from_rec, which checks the printed lines against the label ids and stops if they
disagree. Standard library only; runs on Python 3.9.
"""
from __future__ import annotations
import re
import time
import urllib.request
from pathlib import Path

import tenkites_b as tk

BASE_URL = "https://viewthe.menu/2alz"
USER_AGENT = tk.USER_AGENT
ENERGY = re.compile(r"^(\d{1,3}(?:,\d{3})*|\d+) kcal$")


def fetch_pages(pages: dict, dest: Path) -> dict:
    """Save each page {label: url} once into `dest` as <label>.html (one request per second, reused when already saved)."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    out = {}
    for label, url in pages.items():
        path = dest / (label + ".html")
        if not path.exists() or path.stat().st_size < 10000:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            for attempt in range(3):   # a dropped connection is retried, still one request at a time
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


def _is_dish(node) -> bool:
    return node.tag == "div" and "k10-recipe" in node.cls


def read_page(path: Path) -> dict:
    """{"title", "labels", "records"}; one record per dish in page order:
    {name, desc, course (section names, outermost first), byo (name of the 'choose your...' block or ''), kcal ('' = none printed),
     suitable (list), contains_text, may_text (printed text or None when the line is absent), ids_all, ids_no_may, allergens}"""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    if "k10-recipe__nutrient_energy" not in text:
        raise SystemExit(f"{path}: no 'k10-recipe__nutrient_energy' on the page: the page format changed")
    root = tk.parse_html(text)
    labels = tk.page_labels(root)
    records = []
    for node in root.iter():
        if not _is_dish(node):
            continue
        name_node = node.find("k10-recipe__name-wrapper")
        if name_node is None or not name_node.text():
            raise SystemExit(f"{path}: a dish has no name: the page layout changed")
        desc_node = node.find("k10-recipe__desc")
        energy_nodes = [n for n in node.iter() if "k10-recipe__nutrient_energy" in n.cls]
        if len(energy_nodes) > 1:
            raise SystemExit(f"{path}: {name_node.text()!r} has two energy values")
        kcal = ""
        if energy_nodes:
            m = ENERGY.match(energy_nodes[0].text())
            if not m:
                raise SystemExit(f"{path}: {name_node.text()!r}: energy {energy_nodes[0].text()!r} is not 'N kcal'")
            kcal = m.group(1).replace(",", "")
        box = node.find("k10-popover__label-names-wrapper")
        lines = {"contains": None, "may": None}
        suitable = []
        if box is not None:
            for line in [c for c in box.children if isinstance(c, tk.Node)]:
                txt = tk._clean(line.text())
                if not txt:
                    continue
                head, sep, rest = txt.partition(":")
                head_l = head.strip().lower()
                if not sep or head_l not in ("suitable for", "contains", "may contain"):
                    raise SystemExit(f"{path}: {name_node.text()!r}: unknown line {txt!r} in the allergen pop-up")
                rest = rest.strip()
                if head_l == "suitable for":
                    suitable = [p.strip() for p in rest.split(",") if p.strip()]
                else:
                    slot = "contains" if head_l == "contains" else "may"
                    if lines[slot] is not None:
                        raise SystemExit(f"{path}: {name_node.text()!r}: two {head_l!r} lines")
                    lines[slot] = rest
        ids = tk._label_ids(node)
        byo_names = [tk._clean(a.find("k10-byo__name").text()) for a in node.ancestors()
                     if "k10-byo" in a.cls and a.find("k10-byo__name") is not None]
        records.append({
            "name": tk._clean(name_node.text()), "desc": tk._clean(desc_node.text()) if desc_node is not None else "",
            "course": tk.course_path(node), "byo": byo_names[0] if byo_names else "", "kcal": kcal, "suitable": suitable,
            "contains_text": lines["contains"], "may_text": lines["may"], "ids_all": ids["ids_all"], "ids_no_may": ids["ids_no_may"],
            "popover": box is not None,
        })
    title = re.search(r"<title>([^<]*)</title>", text)
    return {"title": tk._clean(title.group(1)) if title else "", "labels": labels, "records": records}


def allergens_of(rec: dict, labels: dict, where: str) -> dict:
    """The dish's allergens (tenkites_b.allergens_from_rec): the printed Contains / May contain lines, which must agree with the
    label ids the page's own allergen filter reads. A dish with no pop-up or no label ids stops the run."""
    if not rec["popover"] or rec["ids_all"] is None:
        raise SystemExit(f"{where}: no allergen pop-up or label ids: allergens would be unchecked")
    src = {"marks": None, "contains": rec["contains_text"] or "", "may": rec["may_text"] or "",
           "ids_all": rec["ids_all"], "ids_no_may": rec["ids_no_may"]}
    return tk.allergens_from_rec({"allergen_src": src, "label_map": labels}, where)


if __name__ == "__main__":
    import sys
    page = read_page(Path(sys.argv[1]))
    print(page["title"], len(page["records"]), "dishes")
    for r in page["records"]:
        print(" > ".join(r["course"]), "|", r["byo"], "|", r["name"], "|", r["kcal"] or "-", "|", r["suitable"])
