"""Reader for PGL Travel's menu page on menus.tenkites.com (https://menus.tenkites.com/pgltravel/pgl02, "UK Families Menu Week 1 2026").

The page is one Ten Kites "pop-over" menu: a day (Monday ... Sunday, plus "Packed Lunch") holds sections (BREAKFAST, Hot Options, ...), a
section holds dishes, and every dish lists its sizes ("1 Child's Serving", "1 Adult Serving", "100g"). Each size has a pop-up
(`k10-popover`) carrying the allergen lines and TWO nutrition tables, "Nutrition (per 100g)" and "Nutrition (per portion)". Only the
per-portion table is read; the per-100g table is read only to prove that a "100g" size is the reference weight, not a serving.
A dish without sizes (desserts, yoghurt, packed-lunch snacks) has one pop-up with the id -1 and no size name.

Standard library only (plus tenkites_b's small DOM and tenkites_c's allergen helpers). Values are the page's own text.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tb  # noqa: E402
import tenkites_c as tc  # noqa: E402

PORTION = "Nutrition (per portion)"
PER100 = "Nutrition (per 100g)"
NO_SIZE = "-1"          # the pop-up id the page gives a dish that has no size rows
HEADS = {"Contains:": "contains", "May contain:": "may", "Suitable for/Recipe Information:": None}


def _tables(pop: "tb.Node", where: str) -> dict:
    """{'Nutrition (per portion)': {printed label: printed value}, 'Nutrition (per 100g)': {...}} for one pop-up."""
    out: dict = {}
    title = ""
    for n in pop.iter():
        if n.has("k10-w-popover__labels"):
            t = n.text()
            if t.startswith("Nutrition ("):
                title = t
        elif n.has("k10-popover__nutrients-table"):
            if title in out:
                raise ValueError(f"{where}: two tables under {title!r}")
            vals = {}
            for tr in n.find_all(tag="tr"):
                tds = tr.find_all(tag="td")
                if len(tds) != 2:
                    raise ValueError(f"{where}: a nutrition row without two cells")
                label = tds[0].text()
                if label in vals:
                    raise ValueError(f"{where}: {label!r} printed twice in {title!r}")
                vals[label] = tc.printed(tds[1].text())
            out[title] = vals
    if set(out) != {PORTION, PER100}:
        raise ValueError(f"{where}: expected the per-portion and per-100g tables, found {sorted(out)}")
    return out


def _popover(pop: "tb.Node", where: str) -> dict:
    wrap = pop.find("k10-popover__label-names-wrapper")
    if wrap is None:
        raise ValueError(f"{where}: no allergen/diet lines in the pop-up")
    lines = {"contains": None, "may": None}
    suitable = ""
    for d in wrap.children:
        if not isinstance(d, tb.Node):
            continue
        text = d.text()
        if text.startswith("Suitable for/Recipe Information:"):
            suitable = text[len("Suitable for/Recipe Information:"):].strip()
        tc._line(text, lines, HEADS, where)
    if lines["contains"] is None:
        raise ValueError(f"{where}: the pop-up prints neither a 'Contains:' line nor 'This dish contains none of the listed allergens'")
    tables = _tables(pop, where)
    return {"contains": lines["contains"], "may": lines["may"] or [], "suitable": suitable,
            "portion": tables[PORTION], "per100": tables[PER100]}


def read_page(text: str) -> dict:
    """{'title', 'filter', 'copies': [one dict per dish as printed, in page order]}. A copy is
    {day, section, name, desc, recipe_id, all_labels, contained_labels, diet_labels, sizes: [{size, sid, <popover fields>}]}."""
    title = tc.page_title(text)
    root = tb.parse_html(text)
    filt = tc.filter_labels(root)
    copies, orphans = [], []
    for rec in root.iter():
        if not (rec.has("k10-recipe") and rec.has("k10-recipe_menu-item")):
            continue
        name_node = rec.find("k10-recipe__name")
        if name_node is None:
            raise ValueError("a dish without a name")
        name = name_node.text()
        where = name
        courses = [a for a in rec.ancestors() if a.has("k10-course")]
        if not courses:
            raise ValueError(f"{where}: dish outside any day/section")
        section, day = tb._course_name(courses[0]), tb._course_name(courses[-1])
        desc = rec.find("k10-recipe__desc")
        ids = rec.attrs
        if "data-all-labels" not in ids or "data-no-may-labels" not in ids or not ids.get("data-recipe-id"):
            raise ValueError(f"{where}: the dish carries no allergen label ids")
        split = lambda s: [x.strip() for x in s.split(",") if x.strip()]  # noqa: E731
        pops = {}
        for p in rec.find_all("k10-popover"):
            sid = p.attrs.get("data-k10-nutrients-recipe-size-id")
            if sid is None:
                continue
            if sid in pops:
                raise ValueError(f"{where}: pop-up {sid} twice")
            pops[sid] = _popover(p, f"{where} [{sid}]")
        sizes = []
        rows = rec.find_all("k10-recipe__size-filter")
        if rows:
            for row in rows:
                sn = row.find("k10-recipe__size-name")
                tip = row.find("k10-recipe__popover-tooltip")
                sid = tip.attrs.get("data-k10-nutrients-recipe-size-id") if tip is not None else None
                if sn is None or sid not in pops:
                    raise ValueError(f"{where}: a size row without a name or without its pop-up")
                sizes.append({"size": sn.text(), "sid": sid, **pops.pop(sid)})
            # A pop-up with no size row is not shown to visitors. It is ignored only when it prints no per-portion numbers
            # (Chicken Nuggets*: a hidden size with "-" everywhere); one that does carry numbers stops the run.
            for sid, pop in pops.items():
                if any(v != "-" for v in pop["portion"].values()):
                    raise ValueError(f"{where}: pop-up {sid} carries per-portion numbers but no size row shows it")
                orphans.append(f"{name}: pop-up {sid} has no size row and prints '-' for every per-portion value (ignored)")
        else:
            if list(pops) != [NO_SIZE]:
                raise ValueError(f"{where}: a dish with no size rows must have exactly the pop-up {NO_SIZE}, has {sorted(pops)}")
            sizes.append({"size": "", "sid": NO_SIZE, **pops[NO_SIZE]})
        copies.append({"day": day, "section": section, "name": name, "desc": desc.text() if desc is not None else "",
                       "recipe_id": ids["data-recipe-id"], "all_labels": split(ids["data-all-labels"]),
                       "contained_labels": split(ids["data-no-may-labels"]),
                       "diet_labels": [x.text() for x in rec.find_all("k10-recipe__label-info")], "sizes": sizes})
    return {"title": title, "filter": filt, "copies": copies, "orphans": orphans}


def footnotes(text: str) -> list:
    """The page's own footnote lines (they start with '*'), e.g. '*Chopped and shaped chicken. ** Where used, our ham is ...'."""
    plain = re.sub(r"<script.*?</script>|<style.*?</style>", "", text, flags=re.S)
    plain = re.sub(r"<[^>]+>", "\n", plain)
    import html
    lines = [re.sub(r"\s+", " ", html.unescape(x)).strip() for x in plain.split("\n")]
    return [x for x in lines if x.startswith("*")]
