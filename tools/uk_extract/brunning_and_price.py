#!/usr/bin/env python3
"""Build data/source/brunning-and-price/ from Brunning & Price's own per-pub menu pages (a CALORIES-ONLY chain with complete allergens).

    python3 tools/uk_extract/brunning_and_price.py --pages DIR --checked-on 2026-10-08 [--fetch] [--report]

DIR holds the saved pages (--fetch downloads whatever is missing, one request per page, 1.1 s apart; robots.txt disallows only
/downloads/newsletter/, checked with robots_rfc.py). Source pages: https://www.brunningandprice.co.uk/<pub>/menus/<menu>/ for every pub in
the "Other Pubs" drop-down plus Rake Hall (77 pubs on 2026-10-08), for each everyday menu the pub lists: daily menu, children's, Sunday,
puddings and cheese, breakfast/brunch (brunning_and_price_pages.READ_SLUGS). Event menus, group menus and the drinks list are not read.

Why the rule below: the group's pubs do not share one menu. Each pub's page prints its own dishes, and the same dish name can carry
different calories or allergens at different pubs (the triage found a triple chocolate brownie at 572 kcal and at 884 kcal; fish and chips
is 1,278 kcal at 74 pubs and 1,266 at one). There is no group-wide guide. So a dish is published ONLY IF
  (1) the same printed text (name + what comes with it, case and spacing ignored; children's-menu dishes counted apart) is printed
      with calories at THREE OR MORE of the pubs read, and
  (2) at every pub where it is printed, the calories, the "Contains" list, the "May contain" list and the vegetarian mark (v / vg)
      are IDENTICAL (a pub that prints the dish without calories does not contradict the figure, but its allergens must still agree).
Everything else is left out and counted in the run's report (dishes that differ at some pub; dishes printed at fewer than three).
Because every pub was read, "identical" means identical at every pub that prints the dish in the menus read, not at a sample.

What each line prints: calories only (no protein, carbs, fat, kJ, salt or weight anywhere), so nutrition_level = calories and every item is
not rankable. Serving is not stated, so it is blank. Names are the printed text; a dish whose printed text is only a flavour or a cheese
("Vanilla", "Tunworth", "One scoop") gets its section's kind in front ("Ice cream and sorbet: Vanilla", "Cheese: Tunworth"); children's-menu
dishes end with "(children's)".

Allergens (docs/DATA.md "Allergens"): complete. Every published dish has a "Contains:" and/or "May contain:" line over the 14 allergens
(Milk / Lactose, Celery, Cereals Containing Gluten, Sulphur Dioxide / Sulphites, Eggs, Fish, Mustard, Soybeans, Sesame, Peanuts, Tree nuts,
Crustaceans, Molluscs, Lupin), checked against the page's own allergen-filter classes for every dish (brunning_and_price_pages.parse_page).
A dish with neither line has none of the 14 marked: the filter treats it that way and so do we ("contains" empty). The page names no
particular cereal or tree nut, so none is stored. The pages say menu descriptions "do not include all ingredients or allergens", that
allergens are declared "if intentionally added" and that "may contain" is declared where suppliers indicate a risk.

What is left out on purpose (counted in the run's report):
- "Small pudding and a hot drink" offers (and any section pairing puddings with a hot drink or a flapjack): the figure does not say whether
  the drink is counted.
- Alcohol sections (ports, brandy, whisky, liqueurs, nightcaps, digestifs, dessert wines/drinks): the serving size is only in the heading and
  varies by pub. The drinks list prints no calories.
- Price lines "One scoop / Two scoops / Three scoops" (no flavour is named, so the figure cannot be tied to a dish).
- Lines with no calories printed (used only to compare allergens), one-off event menus (curry week, pie week, buffets, murder-mystery nights,
  Christmas Day, afternoon tea...: not read), and everything printed at fewer than three pubs or differently at any pub.
- HOLD_TEXT: one dish whose own allergen row contradicts its name is held back (holdback.csv), never corrected.
Tags: vegetarian from the chain's own (v) / (vg) mark; contains_pork / contains_beef only from the printed name (tenkites_a regexes, with
the exceptions in NOT_PORK / NOT_BEEF).
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import brunning_and_price_pages as bp  # noqa: E402
import tenkites_a as ta  # noqa: E402  (_PORK, _BEEF, _MEATY, _ANIMAL)
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "brunning-and-price"
SOURCE_URL = bp.SITE + "/" + bp.START_PUB + "/menus/daily-menu/"
MIN_PUBS = 3
ALIASES = ["brunning & price", "brunning and price", "brunning and price pub"]
EXTRA_WORDS = {"milk / lactose": ("milk", None), "sulphur dioxide / sulphites": ("sulphites", None)}   # the page's own spellings

# Sections left out (see the module docstring). Alcohol first: the serving is in the heading only.
ALCOHOL_SECTION = re.compile(r"\b(ports?|sherry|brandy|cognac|armagnac|liqueurs?|whisk(e)?y|scotch|malt of the month|night ?caps?|digestif'?s?|"
                             r"after dinner drinks|wines?|rum|dessert drinks?|liquid dessert|cocktails?)\b", re.I)
BUNDLE_SECTION = re.compile(r"(small|mini)\s*pud|pud\w*.*(hot drink|coffee)|(hot drink|coffee).*(pud|mini)|mini dessert|"
                            r"served with a gluten free flapjack|hot drink and small", re.I)

# Rows whose own allergen marks contradict the dish's name: held back (holdback.csv), never corrected. Key = the dish text in lower case.
HOLD_TEXT = {
    "chicken wings, sriracha honey glaze, kewpie-style mayo":
        "allergen row contradicts the dish name: the page marks no egg (neither 'Contains' nor 'May contain') for a dish served with kewpie-style "
        "mayonnaise, which is an egg-yolk mayonnaise; printed the same at all 3 pubs that list it (Highwayman, Oakley Arms, Tally Ho). "
        "Independent re-read 2026-10-08; not corrected.",
}
# meat dishes whose printed name names no animal (reported as "meat type not stated", never tagged)
EXTRA_MEATY = re.compile(r"\b(bratwurst|black pudding|faggots?|charcuterie|italian meats|ox cheek)\b", re.I)

CATEGORY_ORDER = ["Starters and nibbles", "Light bites", "Mains", "Sunday roasts", "Sides", "Breakfast", "Puddings and cheese", "Cheese",
                  "Ice cream and sorbet", "Hot drinks", "Drinks", "Add-ons and extras",
                  "Children's: Starters, nibbles and sides", "Children's: Mains", "Children's: Puddings",
                  "Children's: Ice cream and sorbet", "Children's: Breakfast", "Children's: Drinks", "Children's: Other"]


def section_category(sec: str, slug_: str, kids: bool, breakfast: bool):
    """-> category, or None for a section that is left out on purpose. Raises on a section it has not seen, so a new one can't slip in."""
    s = sec.lower()
    plain = re.sub(r"\(.*?\)", " ", s)      # "Breakfast (... please see sides for extras)" is not a sides section
    if ALCOHOL_SECTION.search(s) or BUNDLE_SECTION.search(s):
        return None
    if kids:
        if re.search(r"ice cream|sorbet|ice creams", s):
            return "Children's: Ice cream and sorbet"
        if re.fullmatch(r"drinks?", plain.strip()):
            return "Children's: Drinks"
        if re.search(r"pud|dessert|hot chocolate", s):
            return "Children's: Puddings"
        if re.search(r"main|roast|sunday", s):
            return "Children's: Mains"
        if re.search(r"starter|nibble|side", s):
            return "Children's: Starters, nibbles and sides"
        if "breakfast" in s or re.fullmatch(r"child(ren)?'?s?", s):
            return "Children's: Breakfast" if breakfast else "Children's: Other"
        raise SystemExit(f"unmapped children's section {sec!r} on menu {slug_!r}: add a rule to section_category")
    if re.search(r"^(sunday |roast )?sides?\b|side orders|sides for", plain.strip()):
        return "Sides"
    if re.search(r"ice cream|sorbet", s):
        return "Ice cream and sorbet"
    if re.search(r"syrup", s):
        return "Add-ons and extras"
    if re.search(r"soft drink|juice", s):
        return "Drinks"
    if breakfast:
        if re.search(r"hot drink|coffee|\btea\b", s):
            return "Hot drinks"
        if re.search(r"extras|add on", s):
            return "Add-ons and extras"
        return "Breakfast"
    if re.search(r"hot drink|coffee|\btea\b", s):
        return "Hot drinks"
    if re.search(r"chee+se", s) and not re.search(r"pud|dessert", s):
        return "Cheese"
    if re.search(r"pud|dessert|flapjack", s):
        return "Puddings and cheese"      # the chain's own heading is mostly "Puddings and Cheese"; single cheeses are listed under it
    if re.search(r"roast", s):
        return "Sunday roasts"
    if re.search(r"\bmain|grill", s):
        return "Mains"
    if re.search(r"light bite|lite bite|lighter bite|sandwich|sarnie", s):
        return "Light bites"
    if re.search(r"starter|nibble|sharer|sharing|while you wait|whilst you wait|small plate", s):
        return "Starters and nibbles"
    if re.search(r"extras|add on", s):
        return "Add-ons and extras"
    raise SystemExit(f"unmapped section {sec!r} on menu {slug_!r}: add a rule to section_category (or to ALCOHOL_SECTION if it is a drinks list)")


# ---------------------------------------------------------------- names and tags
def display_text(d: dict) -> str:
    """The dish as the page prints it: the bold name, then what comes with it. The page shows them side by side (name bold), so in plain text a
    comma is added only where the name has no punctuation of its own and the description is a list of accompaniments."""
    name, desc = d["name"].strip(), d["desc"].strip()
    if re.fullmatch(r"[\W_]*", desc) or desc.lower() == name.lower():     # "." or the name repeated
        desc = ""
    if name and desc:
        joined_by_space = (name[-1] in ",;:-" or desc.startswith("(") or re.match(r"with\b", desc, re.I)
                           or re.search(r"\b(with|and|on|in|of|pulled)$", name, re.I))
        t = f"{name} {desc}" if joined_by_space else f"{name}, {desc}"
    else:
        t = name or desc
    t = t.strip().replace("’", "'")
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\s+,", ",", t).rstrip(",; ")
    return t[:1].upper() + t[1:]


NOT_PORK = re.compile(r"\b(pheasant|turkey|duck|venison|chicken) (bacon|ham|sausages?)\b|\bvegan (bacon|ham|sausages?|chorizo)\b", re.I)
NOT_BEEF = re.compile(r"\bpork (rib-?eye|rump)\b|\bvegan (steak|beef)\b", re.I)


def tags_for(text: str, veg: bool) -> tuple:
    """(tags string, meat type not stated). vegetarian only from the chain's own mark; pork/beef only from the printed name."""
    if veg:
        return "vegetarian", False
    tags = []
    if ta._PORK.search(NOT_PORK.sub(" ", text)):
        tags.append("contains_pork")
    if ta._BEEF.search(NOT_BEEF.sub(" ", text)):
        tags.append("contains_beef")
    unstated = bool(ta._MEATY.search(text) or EXTRA_MEATY.search(text)) and not ta._ANIMAL.search(text) and not tags
    return "|".join(tags), unstated


def ascii_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii"))


# ---------------------------------------------------------------- reading
def read_pages(pages: Path, fetch: bool) -> tuple:
    """-> (occurrences, stats, pubs, hashes). One occurrence per dish line that is in scope."""
    fetcher = bp.Fetcher(pages) if fetch else None

    def page(pub: str, menu: str) -> str:
        if fetcher:
            return fetcher.page(pub, menu)
        f = pages / bp.page_name(pub, menu)
        return f.read_text(encoding="utf-8") if f.exists() else ""

    first = page(bp.START_PUB, "daily-menu")
    if not first:
        raise SystemExit(f"{bp.page_name(bp.START_PUB, 'daily-menu')} is missing from {pages}: run with --fetch")
    pubs = [bp.START_PUB] + [p for p, _ in bp.pub_list(first)]
    if len(set(pubs)) != len(pubs):
        raise SystemExit("the pub list has a repeat")
    occ, stats, hashes = [], Counter(), []
    for pub in pubs:
        daily = page(pub, "daily-menu")
        if not daily:
            raise SystemExit(f"{pub}: no daily-menu page")
        links = bp.menu_links(daily, pub)
        wanted = [m for m in bp.READ_SLUGS if m in links]
        stats["menu pages read"] += len(wanted)
        for menu in wanted:
            text = page(pub, menu)
            if not text:
                raise SystemExit(f"{pub}/{menu}: the pub's navigation lists this menu but the page is missing")
            hashes.append((bp.page_name(pub, menu), sha256_file(pages / bp.page_name(pub, menu))))
            breakfast = menu in bp.BREAKFAST_SLUGS
            for d in bp.parse_page(text, f"{pub}/{menu}"):
                stats["dish lines"] += 1
                kids = bool(re.search(r"child|kids", menu + " " + d["section"], re.I))
                cat = section_category(d["section"], menu, kids, breakfast)
                if cat is None:
                    stats["lines in left-out sections (small pudding offers, alcohol)"] += 1
                    continue
                if d["kcal"] is None:
                    stats["lines without calories (kept only for the allergen comparison)"] += 1
                text_ = display_text(d)
                if re.fullmatch(r"(one|two|three) scoops?", text_, re.I):
                    stats["lines 'One/Two/Three scoops' (no flavour named, left out)"] += 1
                    continue
                if re.match(r"(add|change to)\b", text_, re.I):
                    cat = "Add-ons and extras"
                keys, cereals, nuts = allergen_words(d["contains"], f"{pub}/{menu} {text_}", EXTRA_WORDS)
                mkeys, _, _ = allergen_words(d["may"], f"{pub}/{menu} {text_}", EXTRA_WORDS)
                occ.append({"pub": pub, "menu": menu, "section": d["section"], "cat": cat, "kids": kids, "text": text_, "kcal": d["kcal"],
                            "veg": bool({"v", "vg"} & set(d["suit"])), "marks": tuple(sorted(d["suit"])), "contains": frozenset(keys), "may": frozenset(mkeys)})
    return occ, stats, pubs, hashes


def _verdict(rs: list) -> str:
    """'ok' when the dish is printed with calories at MIN_PUBS or more pubs and every printed copy agrees; else 'differs' or 'few'."""
    with_kcal = [r for r in rs if r["kcal"] is not None]
    if len({r["pub"] for r in with_kcal}) < MIN_PUBS:
        return "few"
    if len({r["kcal"] for r in with_kcal}) > 1 or len({(r["veg"], r["contains"], r["may"]) for r in rs}) > 1:
        return "differs"
    return "ok"


def choose(occ: list) -> tuple:
    """Apply the agreement rule. -> (published, differs, few), each a list of (is_children_only, occurrences).
    A dish printed on the adult and the children's menus under the same text is one dish when every copy agrees; when the copies disagree
    the adult copies and the children's copies are judged on their own (the children's one is then named '... (children's)')."""
    by_text = defaultdict(list)
    for o in occ:
        by_text[o["text"].lower()].append(o)
    published, differs, few = [], [], []
    bucket = {"ok": published, "differs": differs, "few": few}
    for rs in by_text.values():
        adult, kids = [r for r in rs if not r["kids"]], [r for r in rs if r["kids"]]
        v = _verdict(rs)
        if v == "ok":
            published.append((not adult, rs))
        elif v == "differs" and adult and kids:
            for part, is_kids in ((adult, False), (kids, True)):
                bucket[_verdict(part)].append((is_kids, part))
        else:
            bucket[v].append((not adult, rs))
    return published, differs, few


def build(pages: Path, fetch: bool) -> tuple:
    occ, stats, pubs, hashes = read_pages(pages, fetch)
    published, differs, few = choose(occ)
    stats["distinct dishes read"] = len(published) + len(differs) + len(few)
    stats["pubs read"] = len(pubs)
    items, names = [], Counter()
    for kids, rs in published:
        printed = Counter(r["text"] for r in rs)
        text = sorted(printed.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        cat_votes = Counter(r["cat"] for r in (rs if kids else [r for r in rs if not r["kids"]]))
        top = max(cat_votes.values())
        cat = sorted((c for c, n in cat_votes.items() if n == top), key=CATEGORY_ORDER.index)[0]
        base = text
        if cat in ("Ice cream and sorbet", "Children's: Ice cream and sorbet") and not re.search(r"ice cream|scoop", text, re.I):
            base = "Ice cream and sorbet: " + text
        elif cat == "Cheese" and not re.match(r"chee", text, re.I):
            base = "Cheese: " + text
        name = base + (" (children's)" if kids else "")
        names[name] += 1
        veg = rs[0]["veg"]
        tags, unstated = tags_for(text, veg)
        kcal = next(r["kcal"] for r in rs if r["kcal"] is not None)
        allergens = {"contains": set(rs[0]["contains"]), "may_contain": set(rs[0]["may"]), "cereals": set(), "nuts": set()}
        n_pubs = len({r["pub"] for r in rs if r["kcal"] is not None})
        sections = Counter(r["section"] for r in rs)
        marks = Counter(m for r in rs for m in r["marks"])
        items.append({"id": ascii_slug(name), "name": name, "category": cat, "serving": "for two" if re.search(r"\bfor two\b", text, re.I) else "",
                      "calories": kcal, "tags": tags, "_key": text.lower(),
                      "rankable": False, "allergens": allergens, "_unstated": unstated, "_pubs": n_pubs,
                      "notes": (f"printed identically at {n_pubs} pubs; section: {sections.most_common(1)[0][0]}; "
                                + "marks printed: " + (", ".join(f"{m} x{c}" for m, c in sorted(marks.items())) or "none")
                                + f" (of {len(rs)} copies)")})
    dup = [n for n, c in names.items() if c > 1]
    if dup:
        raise SystemExit(f"two different dishes share the name {dup[:5]}: add a naming rule")
    ids = Counter(i["id"] for i in items)
    if any(c > 1 for c in ids.values()):
        raise SystemExit(f"two names make the same id: {[i for i, c in ids.items() if c > 1][:5]}")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    items.sort(key=lambda it: (order[it["category"]], it["name"].lower()))
    stale = [k for k in HOLD_TEXT if k not in {it["_key"] for it in items}]
    if stale:
        raise SystemExit(f"HOLD_TEXT names a dish that is no longer published: {stale}: re-check the table")
    stats["rows held back (allergen row contradicts the dish name)"] = sum(1 for it in items if it["_key"] in HOLD_TEXT)
    return items, stats, pubs, hashes, differs, few


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the pages that are missing from --pages first")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    items, stats, pubs, hashes, differs, few = build(args.pages, args.fetch)
    digest = hashlib.sha256("\n".join(f"{n} {h}" for n, h in sorted(hashes)).encode()).hexdigest()
    n_pubs = len(pubs)
    note = (f"Brunning & Price pubs have no shared menu. Listed: dishes that {MIN_PUBS} or more of the {n_pubs} pubs read on {args.checked_on} print "
            "with the same calories and allergens everywhere they appear. Dishes that differ at any pub are left out. Menus change daily, so "
            "your pub may not have a dish. Small-pudding-with-hot-drink offers and alcohol are not listed.")
    assert len(note) < 400, len(note)
    public = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    holds = [(it["id"], HOLD_TEXT[it["_key"]]) for it in items if it["_key"] in HOLD_TEXT]
    if not holds:
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)
    guide = {"title": f"Brunning & Price pub menus: 'Contains' and 'May contain' under each dish, {n_pubs} pubs read (accessed {args.checked_on}, no date shown)",
             "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Brunning & Price", cuisine="Pub",
        source_title=(f"Brunning & Price: each pub's own online menus with calories and allergens ({n_pubs} pubs read, accessed "
                      f"{args.checked_on}, no date shown)"),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=public, out=args.out, note=note, allergen_guide=guide,
        holdback=holds, nutrition_level="calories")
    print(f"wrote {len(items)} items to {out}")
    print("by category:", dict(Counter(i["category"] for i in items)))
    print("stats:", dict(stats))
    print(f"dishes read {stats['distinct dishes read']}: published {len(items)}, left out because they differ at some pub {len(differs)}, "
          f"left out because printed at fewer than {MIN_PUBS} pubs {len(few)}")
    spread = Counter("3-9" if i["_pubs"] < 10 else "10-29" if i["_pubs"] < 30 else "30+" for i in items)
    print("pubs per published dish:", dict(spread))
    print(f"pages read {len(hashes)}; combined SHA-256 of per-page hashes {digest}")
    unstated = [i["name"] for i in items if i["_unstated"]]
    print("meat type not stated:", len(unstated))
    if args.report:
        print("-- left out because they differ (first 80):")
        for kids, rs in sorted(differs, key=lambda kv: -len({r['pub'] for r in kv[1]}))[:80]:
            vs = Counter((r["kcal"], r["veg"], tuple(sorted(r["contains"])), tuple(sorted(r["may"]))) for r in rs)
            print(f"   {'(kids) ' if kids else ''}{rs[0]['text'][:70]}: {len(vs)} versions, kcal {sorted({v[0] for v in vs if v[0] is not None})}")
        print("-- meat type not stated:", unstated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
