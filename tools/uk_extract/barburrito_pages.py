"""Reader for BarBurrito's own allergen and nutrition pages (tkmenus.com/barburrito, hosted by Ten Kites). Standard library only.

The chain's website links "NUTRITIONAL INFO" and "ALLERGENS INFO" to one Ten Kites page with nine menus (Burritos, Bowls, Main Menu
Extras, Nachos, Sides, Dessert Menu, Kids Menu, BREAKFAST, Drinks Menu); a menu is chosen with ?mguid=<menu id>. Two kinds of entry:

  dish        a whole menu item ("Breakfast Bacon Roll", "Can Coca Cola"): a `k10-recipe_menu-item` block;
  ingredient  a part of a build-your-own dish ("CHICKEN", "GARLIC - WHITE", "Regular Burrito" = the wrap): a `k10-byo-item_recipe`
              block, listed under the choice it belongs to ("Choose your Protein:"). BarBurrito prints calories for each part, not for
              the finished burrito, bowl or nachos.

Each entry has a pop-up with "Suitable for:", "Contains:" and "May contain:" lines and a "Nutritional values (per dish)" table (this
chain prints Energy (kcal) only). The same entry also carries the dish's allergen label ids (data-all-labels / data-no-may-labels) and
the page embeds schema.org JSON-LD with the same names and calories. This module reads them all and stops if they disagree.
Nothing here converts, rounds or fills a gap; numbers are returned as printed.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402

# this page names its two diet labels in the plural; they are diets, not allergens (the module's list has the singular)
tk.NOT_ALLERGENS.update({"vegetarians", "vegans"})


def _name_of(node: "tk.Node", kind: str) -> tuple[str, str]:
    """(name, kcal text shown beside it)."""
    prefix = "k10-byo-item" if kind == "ingredient" else "k10-recipe"
    nm = node.find(prefix + "__name-wrapper")
    en = node.find(prefix + "__nutrient_energy")
    if nm is None:
        raise ValueError("an entry without a name")
    return tk._clean(nm.text()), (tk._clean(en.text()) if en is not None else "")


def _section_name(node: "tk.Node") -> tuple[str, bool]:
    """(the choice an ingredient belongs to, is it the dish's root part). The choice's title is the element just before its section."""
    sec = None
    for a in node.ancestors():
        if a.has("k10-byo__section"):
            sec = a
            break
    if sec is None:
        return "", False
    if sec.has("k10-byo__section_root"):
        return "", True
    parent = sec.parent
    prev = None
    for c in parent.children:
        if c is sec:
            break
        if isinstance(c, tk.Node):
            prev = c
    if prev is not None and prev.has("k10-byo__section-name"):
        return tk._clean(prev.text()), False
    return "", False


def _byo_block(node: "tk.Node"):
    """The build-your-own block an ingredient sits in."""
    for a in node.ancestors():
        if a.tag == "div" and a.has("k10-byo"):
            return a
    return None


def _byo_name(node: "tk.Node") -> str:
    a = _byo_block(node)
    if a is None:
        return ""
    n = a.find("k10-byo__name")
    return tk._clean(n.text()) if n else ""


def read_page(path: Path | str) -> list[dict]:
    """Records in page order: {"kind", "name", "desc", "course": [..], "section", "root", "byo", "block", "nutrients", "shown", "allergen_src",
    "suitable", "label_map"}."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    root = tk.parse_html(text)
    labels = tk.page_labels(root)
    recs: list[dict] = []
    blocks: dict[int, int] = {}  # build-your-own block -> its number in page order
    for n in root.find_all(tag="div"):
        if n.has("k10-byo-item") and n.has("k10-byo-item_recipe"):
            kind = "ingredient"
        elif n.has("k10-recipe") and n.has("k10-recipe_menu-item"):
            kind = "dish"
        else:
            continue
        name, shown = _name_of(n, kind)
        pops = n.find_all("k10-popover")
        if len(pops) != 1:
            raise ValueError(f"{name!r}: {len(pops)} pop-ups")
        tables = pops[0].find_all("k10-popover__nutrients-table")
        nutrients: dict[str, str] = {}
        if len(tables) > 1:
            raise ValueError(f"{name!r}: {len(tables)} nutrition tables")
        for tr in (tables[0].find_all(tag="tr") if tables else []):
            tds = tr.find_all(tag="td")
            if len(tds) != 2:
                raise ValueError(f"{name!r}: a nutrition row without two cells")
            lab = tk._clean(tds[0].text())
            if lab in nutrients:
                raise ValueError(f"{name!r}: nutrient {lab!r} printed twice")
            nutrients[lab] = tk._clean(tds[1].text())
        box = pops[0].find("k10-popover__label-names-wrapper")
        lines = tk._dietary_lines(box)
        suitable = ""
        if box is not None:
            for line in [c for c in box.children if isinstance(c, tk.Node)]:
                head, sep, rest = tk._clean(line.text()).partition(":")
                if sep and head.strip().lower() == "suitable for":
                    suitable = rest.strip()
        desc = n.find("k10-byo-item__desc") or n.find("k10-recipe__desc")
        section, is_root = _section_name(n) if kind == "ingredient" else ("", False)
        recs.append({
            "kind": kind, "name": name, "shown": shown, "desc": tk._clean(desc.text()) if desc else "",
            "course": tk.course_path(n), "section": section, "root": is_root, "byo": _byo_name(n) if kind == "ingredient" else "",
            "block": blocks.setdefault(id(_byo_block(n)), len(blocks)) if kind == "ingredient" else -1,
            "nutrients": nutrients, "suitable": suitable, "label_map": labels,
            "allergen_src": {"marks": None, **lines, **tk._label_ids(n)},
            "diet_imgs": [i.attrs.get("title", "") for i in n.find_all(tag="img") if "Suitable for" in i.attrs.get("title", "")],
        })
    return recs


def json_ld_names(path: Path | str) -> list[tuple[str, str]]:
    """(name, calories text) for every MenuItem in the page's schema.org data, in page order: a second reading of the same
    numbers, used by the script as a cross-check. '' when the entry has no calories."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    out: list[tuple[str, str]] = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', text, re.S):
        data = json.loads(m.group(1))

        def walk(x):
            if isinstance(x, dict):
                if x.get("@type") == "MenuItem":
                    out.append((x.get("name", "").strip(), (x.get("nutrition") or {}).get("calories", "")))
                for v in x.values():
                    walk(v)
            elif isinstance(x, list):
                for v in x:
                    walk(v)
        walk(data)
    return out


if __name__ == "__main__":
    for p in sys.argv[1:]:
        recs = read_page(p)
        print(f"{p}: {len(recs)} entries ({sum(r['kind'] == 'dish' for r in recs)} dishes, {sum(r['kind'] == 'ingredient' for r in recs)} ingredients), "
              f"{len(json_ld_names(p))} in the JSON-LD")
