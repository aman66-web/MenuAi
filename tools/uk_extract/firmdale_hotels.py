#!/usr/bin/env python3
"""Build data/source/firmdale-hotels/ from the menus of Firmdale Hotels' London restaurants (calories only).

    python3 tools/uk_extract/firmdale_hotels.py --cache DIR --checked-on 2026-10-12 [--out DIR] [--report]

Source (official, https://www.firmdalehotels.com/robots.txt has no rules, only a Sitemap line): each London hotel restaurant's own page
links its menus as server-rendered HTML pages under /menus/<hotel>/<type>/<menu>. Every dish line prints its price and, in brackets, the
diet marks and calories, e.g. "Toast, preserves £6 (V 392kcal)" ("V - vegetarian  VG - vegan  GF - gluten free", printed on each menu).
Firmdale runs 8 London hotels; the six with a restaurant are read below. Warren Street, Crosby Street and The Whitby are in New York and
are left out. Menus read: breakfast, brunch, a la carte (lunch, dinner, Sunday), bar food and dessert. Not read: cocktail and wine lists
(no alcoholic drinks are added), afternoon tea (figures for the parts of one set), set, pre-theatre, group and seasonal menus.

Menus differ by restaurant and many dishes print different calories at different restaurants, so a dish is published only where 2 or
more restaurants print the same name (normalised: case, accents, punctuation, '&'/'and') with the same calories and no menu read prints
another figure for that name. Nothing is chosen between, averaged or corrected.

Every calorie figure on every menu read is either used for a candidate dish or left out by a named rule (printed with --report):
- one figure in a line: the dish named before the price; a figure on a continuation line ("with your choice of two fillings (333kcal)")
  belongs to the dish named on the line above; a line beginning "with ..." that carries its own price and figure is that dish plus the
  "with ..." words ("... on rye with a poached egg"); a section that is one dish (the heading names it, the text below describes it, e.g.
  "English Breakfast") takes the heading as the name.
- several figures for named choices: "single £10 / double £20 (443 / 884kcal)" or "single £10 (433kcal) / double £20 (884kcal)" -> the
  dish above, "(single)" and "(double)"; "Croissant / Danish £5 (V 142 / 239kcal)" -> one dish per name, in the printed order;
  "Prepared with your choice of milk, water or cream (354 / 227 / 1133kcal)" -> "<section dish> with milk" etc.; "Grilled or meunière"
  and "with chicken or prawns" -> the dish above with each choice; a list of named sauces each with its own figure -> one item each.
- left out: several figures with no named choices ("£18 / £32 (652 / 1305kcal)", "Danish pastry £5 (V 239 / 144kcal)"), choices that
  are only implied ("Freshly squeezed orange or grapefruit juice ... (124 / 90kcal)"), "from" figures, and figures with no "kcal".
"""
from __future__ import annotations

import argparse
import collections
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "firmdale-hotels"
SITE = "https://www.firmdalehotels.com"
HUB = SITE + "/restaurants-bars"
# The London hotel restaurants (from the chain's own sitemap.xml, 12 October 2026), in the order used for display names.
RESTAURANTS = [
    ("Ham Yard Restaurant & Bar", "ham-yard-hotel", SITE + "/hotels/ham-yard-hotel/ham-yard-restaurant-bar"),
    ("Brumus", "haymarket-hotel", SITE + "/hotels/haymarket-hotel/brumus-restaurant-bar"),
    ("Refuel", "the-soho-hotel", SITE + "/hotels/the-soho-hotel/refuel-restaurant-bar"),
    ("Brasserie Max", "covent-garden-hotel", SITE + "/hotels/covent-garden-hotel/brasserie-max-restaurant-bar"),
    ("Oscar", "charlotte-street-hotel", SITE + "/hotels/charlotte-street-hotel/oscar-restaurant-bar"),
    ("The Potting Shed", "dorset-square-hotel", SITE + "/hotels/dorset-square-hotel/the-potting-shed-restaurant-bar"),
]
NEW_YORK = ("warren-street-hotel", "crosby-street-hotel", "the-whitby-hotel")
READ_TYPES = ("breakfast", "brunch", "a-la-carte", "bar-food", "dessert")
SKIP_TYPES = ("cocktails", "wine", "afternoon-tea", "set-menu", "seasonal", "sunday-roast")
SOURCE_TITLE = ("Firmdale Hotels restaurant menus: Ham Yard, Brumus, Refuel, Brasserie Max, Oscar and The Potting Shed (breakfast, brunch, "
                "a la carte, bar food and dessert pages; no date shown)")
# generic restaurant names ("Refuel", "Oscar", "The Potting Shed") are not aliases: other businesses use them
ALIASES = ["firmdale hotels", "firmdale", "ham yard restaurant", "brumus", "brasserie max"]
NOTE = ("Calories as printed on the menus of Firmdale's six London hotel restaurants (Ham Yard, Brumus, Refuel, Brasserie Max, Oscar, "
        "The Potting Shed). Menus differ by restaurant: a dish is listed only where two or more of them print the same figure.")
# Dishes that agree under one name but which another menu of the chain prints, under a slightly different name, with another figure:
# held back (holdback.csv), never chosen between. Keyed by images_common.norm_name of the published name.
HOLD = {
    "danish pastry": "Brumus and The Potting Shed print 239 kcal, but Oscar's breakfast prints 'Croissant / Danish (V 239 / 144kcal)' and "
                     "Refuel's prints 'Danish pastry (V 239 / 144kcal)': the chain's own menus disagree about a Danish pastry",
    "classic caesar salad": "Oscar and The Potting Shed print 760 kcal for 'Classic Caesar salad', but Brasserie Max prints 758 kcal for "
                            "its 'Caesar salad' (the same dish under a shorter name; Brumus, Refuel and The Potting Shed print 760)",
    "eggs benedict": "Refuel's and Brasserie Max's brunch print 859 kcal for Eggs Benedict at £20 (the double portion), but Ham Yard's and "
                     "Brumus's breakfast menus print 884 kcal for a double Eggs Benedict: the chain's own menus disagree",
}
KCAL = re.compile(r"\(([^()]*?)kcal\)", re.I)
PRICE = re.compile(r"£\s*(?:\d+(?:\.\d+)?|MP)")
ALCOHOL = re.compile(r"\b(wine|beer|lager|ale|cider|prosecco|champagne|vodka|gin|rum|whisky|whiskey|martini|negroni|spritz|mimosa|bellini|"
                     r"bloody mary|margarita|cocktail)\b", re.I)


def clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return " ".join(s.replace(" ", " ").split())


def menu_links(page: str, hotel: str) -> list[str]:
    links = sorted(set(re.findall(r'href="(/menus/' + re.escape(hotel) + r'/[^"#?]+)"', page)))
    keep = []
    for link in links:
        parts = link.strip("/").split("/")
        mtype = parts[2] if len(parts) == 4 else ("bar-food" if parts[-1].endswith("bar-food") else parts[-1])
        if mtype in READ_TYPES:
            keep.append(link)
        elif mtype not in SKIP_TYPES:
            raise SystemExit(f"{link}: menu type {mtype!r} is new: decide whether it is read (READ_TYPES) or not (SKIP_TYPES)")
    return keep


def parse_group(g: str) -> tuple[list[int] | None, bool, str]:
    """'V GF 354 / 227 / 1133' -> ([354, 227, 1133], vegetarian, ''); returns (None, ..., reason) for 'from' figures."""
    tags = set(re.findall(r"\b(VG|V|GF|NGCI)\b", g))
    if re.search(r"\bfrom\b", g, re.I):
        return None, False, "a 'from' figure"
    nums = re.findall(r"\d[\d,]*", g)
    rest = re.sub(r"\b(VG|V|GF|NGCI)\b|\d[\d,]*|[/\s]", "", g)
    if rest:
        return None, False, f"unexpected text in the bracket {g!r}"
    return [int(n.replace(",", "")) for n in nums], bool(tags & {"V", "VG"}), ""


def name_before(text: str) -> str:
    """The dish name of a line: the text before its price (or before its bracket)."""
    t = PRICE.split(text, 1)[0]
    t = KCAL.split(t, 1)[0] if "kcal" in t.lower() else t
    return t.strip(" ,|-").strip()


def choices(text: str) -> list[str]:
    """'Croissant / Danish pastry' -> two; 'Croissant £5 / Danish pastry £5' -> two; 'single £10 / double £20' -> two."""
    t = PRICE.sub("", text)
    return [c.strip(" ,") for c in t.split(" / ") if c.strip(" ,")]


def parse_menu(page: str, label: str) -> tuple[list[dict], list[tuple[str, str]]]:
    """Returns (occurrences, left_out). An occurrence: section, name, kcal, veg, raw line."""
    occ, left = [], []
    for sec in re.split(r'<div class="article-sub-content(?!-inner)', page)[1:]:
        h2 = re.search(r"<h2[^>]*>(.*?)</h2>", sec, re.S)
        heading = clean(h2.group(1)) if h2 else ""
        paras = [(m.start(), m.group(1)) for m in re.finditer(r'<p class="balance">(.*?)</p>', sec, re.S)]
        in_li = [bool(re.search(r"<li>\s*$", sec[:pos])) for pos, _ in paras]
        kcal_paras = [i for i, (_, p) in enumerate(paras) if KCAL.search(clean(p))]
        heading_is_dish = len(kcal_paras) == 1 and not in_li[kcal_paras[0]] and len(paras) == 1
        dish_done = False
        for i, (_, para) in enumerate(paras):
            segs = [clean(s) for s in re.split(r"<br\s*/?>", para)]
            segs = [s for x in segs for s in x.split(" | ")] if any(" | " in s for s in segs) else segs
            base = ""          # the dish named on an earlier line of this paragraph
            base_has_kcal = False
            for seg in segs:
                groups = list(KCAL.finditer(seg))
                own = name_before(seg)
                if not groups:
                    if own and not own[0].islower():
                        base, base_has_kcal = own, False
                    continue
                parsed = [parse_group(g.group(1)) for g in groups]
                for nums, _, why in parsed:
                    if nums is None:
                        left.append((seg, why))
                if any(n is None for n, _, _ in parsed):
                    continue
                if heading_is_dish and not dish_done:
                    # the first figure of a one-dish section is that dish ("English Breakfast": its description and figure); later
                    # lines of the same paragraph ("Toast and preserves (V 392kcal)") are read like any other line
                    dish_done = True
                    if len(groups) == 1 and len(parsed[0][0]) == 1:
                        occ.append(dict(section=label, name=heading, kcal=parsed[0][0][0], veg=parsed[0][1], raw=seg))
                        continue
                if len(groups) == 1 and len(parsed[0][0]) == 1:
                    kcal, veg = parsed[0][0][0], parsed[0][1]
                    if own and not own[0].islower():
                        name = own
                    elif own.lower().startswith("with ") and base and PRICE.search(seg):
                        name = f"{base} {own}"
                    elif base and not base_has_kcal and not PRICE.search(seg):
                        name = base                      # continuation line: the figure belongs to the dish above
                    else:
                        left.append((seg, "no dish name for the figure"))
                        continue
                    occ.append(dict(section=heading, name=name, kcal=kcal, veg=veg, raw=seg))
                    base, base_has_kcal = name, True
                    continue
                # several figures
                if len(groups) == 1:
                    nums, veg = parsed[0][0], parsed[0][1]
                    pre = seg[:groups[0].start()].strip()
                    ch = choices(pre) if " / " in pre else []
                    lead = own if not (own[:1].islower() and base) else f"{base} {own}"
                    m_choice = re.search(r"choice of ([\w ]+?), ([\w ]+?) or ([\w ]+?)\s*$", lead)
                    m_or = re.fullmatch(r"(with )?([\w ]+?) (?:or|/) ([\w ]+?)", own, re.I)
                    if len(ch) == len(nums) and all(c[0].isupper() for c in ch):
                        for c, n in zip(ch, nums):
                            occ.append(dict(section=heading, name=c, kcal=n, veg=veg, raw=seg))
                    elif len(ch) == len(nums) and base and all(c.lower() in ("single", "double") for c in ch):
                        for c, n in zip(ch, nums):
                            occ.append(dict(section=heading, name=f"{base} ({c.lower()})", kcal=n, veg=veg, raw=seg))
                    elif m_choice and len(nums) == 3 and heading:
                        for c, n in zip(m_choice.groups(), nums):
                            occ.append(dict(section=heading, name=f"{heading} with {c.strip()}", kcal=n, veg=veg, raw=seg))
                    elif m_or and len(nums) == 2 and base:
                        w = "with " if m_or.group(1) else ""
                        for c, n in zip(m_or.groups()[1:], nums):
                            occ.append(dict(section=heading, name=f"{base} {w}{c.strip().lower()}" if w else f"{base} ({c.strip().lower()})",
                                            kcal=n, veg=veg, raw=seg))
                    else:
                        left.append((seg, "several figures without named choices"))
                    continue
                # several brackets on one line: each named by the words before it
                start, names = 0, []
                for g in groups:
                    names.append(PRICE.sub("", seg[start:g.start()]).strip(" ,/"))
                    start = g.end()
                if all(len(p[0]) == 1 for p in parsed) and base and all(re.fullmatch(r"(or )?(single|double|half a dozen|a dozen)", n, re.I) for n in names):
                    for n, p in zip(names, parsed):
                        q = re.sub(r"^or ", "", n, flags=re.I).lower()
                        occ.append(dict(section=heading, name=f"{base} ({q})", kcal=p[0][0], veg=p[1], raw=seg))
                elif all(len(p[0]) == 1 for p in parsed) and not seg.lower().startswith("with ") and \
                        all(re.fullmatch(r"(?:or )?([A-Za-zÀ-ÿ' ]{3,30})", n) and len(n.split()) <= 4 for n in names):
                    # a list of named sauces, each with its own figure: "Béarnaise (GF 311kcal), Café de Paris (338kcal), peppercorn (...)"
                    for n, p in zip(names, parsed):
                        n = re.sub(r"^or ", "", n)
                        occ.append(dict(section=heading, name=n[0].upper() + n[1:], kcal=p[0][0], veg=p[1], raw=seg))
                else:
                    left.append((seg, "several figures on one line without clear names"))
    return occ, left


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    occurrences = []  # (restaurant index, menu url, occ)
    left_out = []
    for ri, (rname, hotel, url) in enumerate(RESTAURANTS):
        page = ic.polite_get(url, args.cache, accept="text/html").decode("utf-8", "replace")
        links = menu_links(page, hotel)
        if not links:
            raise SystemExit(f"{url}: no menus found: the page changed")
        for link in links:
            murl = SITE + link
            mpage = ic.polite_get(murl, args.cache, accept="text/html").decode("utf-8", "replace")
            mtype = "bar-food" if link.endswith("bar-food") else link.strip("/").split("/")[2]
            occ, left = parse_menu(mpage, {"a-la-carte": "Mains", "bar-food": "Bar food"}.get(mtype, mtype.title()))
            if not occ and "kcal" in mpage:
                raise SystemExit(f"{murl}: calories printed but nothing parsed: the layout changed")
            occurrences += [(ri, murl, o) for o in occ]
            left_out += [(ri, murl, s, why) for s, why in left]

    by_name: dict[str, list] = collections.defaultdict(list)
    for ri, murl, o in occurrences:
        by_name[ic.norm_name(o["name"])].append((ri, murl, o))
    items, conflicts, single = [], [], []
    for key, occs in by_name.items():
        rs = sorted({ri for ri, _, _ in occs})
        vals = sorted({o["kcal"] for _, _, o in occs})
        if len(vals) > 1:
            conflicts.append((key, occs))
            continue
        if len(rs) < 2:
            single.append((key, occs))
            continue
        first = min(occs, key=lambda t: (t[0], t[1]))
        o = first[2]
        if ALCOHOL.search(o["name"]) and not re.search(r"cocktail\b.*(prawn|avocado)|(prawn|avocado).*cocktail|vinegar|cider,", o["name"], re.I):
            raise SystemExit(f"alcohol word in a published name: {o['name']!r}: decide (alcoholic drinks are never added)")
        veg = all(x["veg"] for _, _, x in occs)
        items.append(dict(name=o["name"], category=o["section"] or "Menu", calories=o["kcal"], rankable=False,
                          tags="vegetarian" if veg else "", allergens=None,
                          notes=f"same {o['kcal']} kcal at {', '.join(RESTAURANTS[i][0] for i in rs)}",
                          _order=(first[0], first[1], occurrences.index(first))))
    items.sort(key=lambda it: it.pop("_order"))
    holdback = [(slug(it["name"]), HOLD[ic.norm_name(it["name"])]) for it in items if ic.norm_name(it["name"]) in HOLD]
    for key in HOLD:
        if key not in {ic.norm_name(it["name"]) for it in items}:
            raise SystemExit(f"HOLD entry {key!r} no longer matches a dish: re-check the menus and remove it")
    if len(items) - len(holdback) < 15:
        raise SystemExit(f"only {len(items)} dishes agree at 2+ restaurants: the menus changed, re-check before publishing")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Firmdale Hotels", cuisine="Hotel restaurant", source_title=SOURCE_TITLE, source_url=HUB,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories",
                             holdback=holdback)
    print(f"wrote {len(items)} items to {out}")
    print(f"figures read: {len(occurrences)} used for candidates, {len(left_out)} left out by rule; "
          f"{len(conflicts)} names with different figures, {len(single)} names at one restaurant only")
    if args.report:
        print("\n## Published")
        for it in items:
            print(f"  {it['category']:25s} {it['name']:60s} {it['calories']:>5}  {it['notes']}")
        print("\n## Different figures for the same name (not published)")
        for key, occs in sorted(conflicts):
            print(f"  {occs[0][2]['name']}: " + "; ".join(f"{RESTAURANTS[ri][0]} {o['kcal']}" for ri, _, o in occs))
        print("\n## Left out by rule")
        for ri, murl, s, why in left_out:
            print(f"  [{RESTAURANTS[ri][0]}] {why}: {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
