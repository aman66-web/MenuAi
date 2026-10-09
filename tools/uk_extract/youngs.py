#!/usr/bin/env python3
"""Build data/source/youngs/ from the menu pages of Young's pubs' own websites (a CALORIES-ONLY chain, no allergen list published).

    python3 -I tools/uk_extract/youngs.py --pages DIR --checked-on 2026-10-09 [--fetch] [--report] [--out DIR]

Source: Young's runs about 265 pubs, each with its OWN website (264 different web addresses: Tattenham Corner is listed twice on one site and
counted once). The list of pubs and their addresses is the group's own public pub list (https://www.youngs.co.uk/our-pubs, which loads
https://www.youngs.co.uk/wp-json/wp/v2/venues). For every pub the script reads the pub's home page, follows the link to its food-and-drink page
(youngs_pages.menu_page_urls: "/food-drink", "/food-and-drink", "/menus"...) and reads the menus on it (youngs_pages: the newer sites carry them
as JSON in the page, the older ones as HTML). youngs_fetch.py does the downloading: each host's robots.txt is read once and every path checked
against it (RFC 9309), requests start at least 1.1 s apart (downloads may overlap, six at a time, never two at once on one host), a normal
browser User-Agent; a 403/429, a robots Disallow or an unreadable robots.txt is NEVER worked round (the pub is listed as not read). Pages are
cached in DIR, so a re-run without --fetch reads only the cache. The group's own page https://www.youngs.co.uk/burger-shack (six burgers with
their calories) is read too, for agreement only.

What a dish line prints: its name, what comes with it, and (on some dishes) its calories, either in a separate "calories" field or written in
the text ("(616Kcal)", "/ 910 kcals"). Nothing else: no protein, carbohydrate, fat, salt, kJ, weight, serving size or allergen list. So this is a
calories-only chain (docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank and every item is non-rankable. Allergens: the
pages say "please inform a member of staff if you have a food allergy" and, on a few, that allergen information is available on request; none
links an allergen guide, so allergens.csv and allergen_guide.csv are not written.

The pubs do not share one menu (each runs its own, with its own recipes), and the same dish name carries different calories at different pubs
(pigs in blankets: 230 to 935 kcal across 52 pubs). Same rule as Brunning & Price and Hall & Woodhouse: a dish is published ONLY IF
  (1) the same printed text (name + what comes with it, calories and "Add ... £" option lists taken out; capitalisation, accents, spaces, "&"/"and"
      and punctuation ignored; children's-menu dishes counted apart) is printed WITH calories at MIN_PUBS (2) or more pubs, and
  (2) EVERY print of it (at every pub, on every menu read, and on the Burger Shack page) agrees: the same calories, and the same vegetarian
      mark (a pub that prints the dish with no calories does not contradict the figure, but its mark must still agree).
A print with two different calorie figures, a calories field that is not one figure, a figure outside 10..4000, several prices (the figure's
size is then not stated) or a choice of quantities ("1, 2 or 3 scoops") makes the dish ambiguous: it is left out and counted in the run's output,
never resolved by choosing. A dish printed with calories at fewer than MIN_PUBS pubs, or differently at any pub, is left out. Dishes that
differ only in spelling ("Marrow Fat Peas" / "Marrowfat Peas", "(AF)" / "0.0% AF") are different printed texts and stay separate.

What is not read: menus that are only a PDF; Christmas, festive, party, buffet, function, canape, afternoon-tea and takeaway menus; wine, beer,
cider, spirit, whisky, gin and rum lists and sections (the serving size is only in the heading and varies); every page other than the pub's
food-and-drink page (SKIP_MENU, SKIP_SECTION). Cocktail, spritz and alcohol-free sections ARE read: the calories are for one drink as named.

Tags: vegetarian from the chain's own mark ((v), (vg), /v/ in the text, or the page's own "v"/"ve" filter mark); contains_pork /
contains_beef only from the printed name and description; the rest is reported as "meat type not stated".
"""
from __future__ import annotations
import argparse
import hashlib
import html as htmllib
import json
import re
import sys
import unicodedata
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import youngs_fetch as yf  # noqa: E402
import youngs_pages as yp  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "youngs"
HUB_URL = "https://www.youngs.co.uk/our-pubs"
GROUP_PAGE = "https://www.youngs.co.uk/burger-shack"     # the group's own page for its Burger Shack burgers (calories beside each)
GROUP_PUB = "youngs.co.uk/burger-shack"
MIN_PUBS = 2
KCAL_MIN, KCAL_MAX = 10, 4000
ALIASES = ["young's", "youngs", "young's pub", "youngs pub", "young & co", "young and co", "young's pubs"]
MAX_MENU_PAGES = 3          # at most this many menu pages are read per pub (first linked first)

# menus (by title) that are not read, and sections (by title) that are not read: see the module docstring
SKIP_MENU = re.compile(r"christmas|festive|xmas|new year|\bnye\b|party|parties|buffet|function|canap|wedding|afternoon tea|hamper|takeaway|gift|"
                       r"voucher|\bwines?\b|champagne|prosecco|\bbeers?\b|\bales?\b|\bciders?\b|spirits?\b|whisk(?:e)?y|\bgin\b|\brum\b|vodka|"
                       r"drinks? list|brewery", re.I)
SKIP_SECTION = re.compile(r"christmas|festive|\bwines?\b|champagne|prosecco|sparkling wine|^(?:draught |draft |bottled |craft |keg |cask )?"
                          r"(?:beers?|ales?|lagers?|ciders?|stouts?|beers? (?:&|and) ciders?|lagers? (?:&|and) ciders?)$|spirits?\b|whisk(?:e)?y|"
                          r"\bgin\b|\brum\b|vodka|liqueurs?|brandy|cognac|^port\b|sherry|draught|\bpints?\b|bottled beers?|beer (?:&|and) cider", re.I)
KIDS = re.compile(r"\b(kids?|child(?:ren)?'?s?|young-?sters?|junior|little ones|mini[- ]?me)\b", re.I)

CATEGORY_ORDER = ["Starters, sharers and snacks", "Mains", "Burgers and grill", "Sunday roasts", "Light bites and sandwiches", "Sides", "Breakfast",
                  "Puddings", "Extras", "Cocktails, spritz and soft drinks", "Children's"]

# printed section (or, when the section has no title, the menu's title) -> category, first match wins. A published dish whose section matches
# nothing stops the run so a human places it.
_CATEGORY_RULES = [
    ("Cocktails, spritz and soft drinks", r"spritz|mindful|cooler|alcohol[- ]?free|non-?a|no (?:&|and) low|low\W{1,3}no|no\W{1,3}low|cocktail|mocktail|light (?:&|and) sparkling|"
                                         r"sipping|best serves|soft drink|\baf\b|0\.0|0%"),
    ("Extras", r"be extra|get saucy|extras|add[- ]?ons?|sauces?"),
    ("Sides", r"\bsides?\b"),
    ("Puddings", r"pudding|dessert|sweet|jude|ice cream|freezer"),
    ("Breakfast", r"breakfast|brunch"),
    ("Light bites and sandwiches", r"sandwich|toastie|baguette|wraps?|light bite|jacket|lunch"),
    ("Sunday roasts", r"roast|sunday"),
    ("Burgers and grill", r"burger|shack|from the coal|grill|steak"),
    ("Starters, sharers and snacks", r"starter|small plate|sharer|share|nibble|while you wait|whilst you wait|whet|feast|snack|bites|olives|appetis|smalls"),
    ("Mains", r"main|classic|pie|fish|house|special|signature|plates"),
]


_DRINKS_MENU = re.compile(_CATEGORY_RULES[0][1], re.I)


def section_category(section: str, menu: str, kids: bool) -> str:
    """-> the category for a dish printed in `section` of `menu`. Raises on a section it has not seen, so a new one can't slip in."""
    if kids:
        return "Children's"
    if _DRINKS_MENU.search(menu.lower()):      # a cocktail / low-and-no / spritz menu: every section of it is a drink
        return _CATEGORY_RULES[0][0]
    for text in (section.strip().lower(), menu.strip().lower()):
        if not text:
            continue
        for cat, rx in _CATEGORY_RULES:
            if re.search(rx, text):
                return cat
    raise SystemExit(f"unmapped section {section!r} on menu {menu!r}: add a rule to _CATEGORY_RULES")


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def key_of(text: str) -> str:
    """Names compared as printed except capitalisation, accents, spaces, '&' / 'and', quotes and punctuation."""
    s = fold(text).lower().replace("&", " and ")
    s = s.replace("’", "").replace("'", "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


# ---------------------------------------------------------------- reading the pubs
def read_pub(f: yf.Fetcher, venue: dict) -> dict:
    """-> {slug, name, site, status, pages, menus_read, menus_skipped, prints}. status '' = read; otherwise why the pub is not read."""
    rec = {"slug": venue["slug"], "name": htmllib.unescape(venue["name"]), "site": venue["site"], "status": "", "pages": [],
           "menus_read": 0, "menus_skipped": [], "pdf_only": 0, "prints": [], "allergen_mentions": 0}
    status, home, final = f.get(venue["site"])
    if status != 200:
        rec["status"] = (f"home page answered HTTP {status}" if status else "home page not requested (robots.txt or a failed request)")
        return rec
    urls = yp.menu_page_urls(home, final)
    if not urls:
        rec["status"] = "no food-and-drink page linked from the home page"
        return rec
    seen = set()
    for url in urls[:MAX_MENU_PAGES]:
        st, text, fin = f.get(url)
        if st != 200:
            continue
        rec["pages"].append(url)
        rec["allergen_mentions"] += len(re.findall(r"allergen\s+(?:guide|menu|matrix|information|list|chart)|allergy\s+(?:guide|menu|matrix|information|list|chart)", text, re.I))
        menus = yp.headless_menus(text) or yp.legacy_menus(text)
        for m in menus:
            title = m["menu"].strip()
            if SKIP_MENU.search(title) or SKIP_MENU.search(m["group"] or ""):
                rec["menus_skipped"].append(title)
                continue
            if m["pdf"] and not m["categories"]:
                rec["pdf_only"] += 1
                continue
            rec["menus_read"] += 1
            for c in m["categories"]:
                section = c["title"].strip()
                if SKIP_SECTION.search(section):
                    continue
                for it in c["items"]:
                    ident = (title, section, it["title"], it["description"], it["calories"])
                    if ident in seen:
                        continue
                    seen.add(ident)
                    kcal, problem = yp.print_calories(it["title"], it["description"], it["calories"])
                    if kcal is not None and not (KCAL_MIN <= kcal <= KCAL_MAX):
                        kcal, problem = None, f"calories {kcal} outside {KCAL_MIN}..{KCAL_MAX}"
                    rec["prints"].append({"pub": venue["slug"], "menu": title, "section": section, "title": it["title"],
                                          "desc": it["description"], "kcal": kcal, "problem": problem, "multi": it["multi"],
                                          "dietary": it["dietary"], "group": False})
    if not rec["pages"]:
        rec["status"] = "the food-and-drink page could not be read"
    return rec


def read_group_page(f: yf.Fetcher) -> list:
    """The group's own Burger Shack page: one print per burger (title + description with its calories), counted for agreement only."""
    status, text, _ = f.get(GROUP_PAGE)
    if status != 200:
        return []
    out = []
    for m in re.finditer(r'menuItemTitle[^>]*>(.*?)</p>.*?menuItemDesc[^>]*>(.*?)(?:<!--|</p>)', text, re.S):
        title = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))).strip()
        desc = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        kcal, problem = yp.print_calories(title, desc, "")
        out.append({"pub": GROUP_PUB, "menu": "Burger Shack", "section": "Menus", "title": title, "desc": desc, "kcal": kcal,
                    "problem": problem, "multi": False, "dietary": [], "group": True})
    return out


# ---------------------------------------------------------------- dish text, marks, tags
# "... Add Curry Sauce £1", "Add Bacon 1.5 Add Blue Cheese 2": option lists printed after a dish, with prices. They are not part of the dish: cut
# at the first "Add" that has a price after it (the calories are then the dish's alone; if the print gave a figure for an option too, it has
# two figures and is ambiguous anyway).
_ADD_OPTIONS = re.compile(r"[\s|/,;]*\badd\b\s+[^|]*?(?:\u00a3\s?\d|\b\d+(?:\.\d{1,2})?\b)", re.I)
# "(1, 2 or 3 scoops)": one calorie figure for a choice of quantities
_QTY_CHOICE = re.compile(r"\(\s*\d+(?:\s*,\s*\d+)*\s*(?:,|or|/)\s*\d+\s+[a-z]+\s*\)", re.I)


def _tidy_caps(t: str) -> str:
    """An ALL-CAPS name is written in capitals only for display on the page; 'CHILLI CHEESE' -> 'Chilli Cheese' (letters only, apostrophes kept)."""
    return re.sub(r"[A-Za-z']+", lambda m: m.group(0).capitalize(), t) if t.isupper() else t


def dish_text(p: dict) -> str:
    """The dish as printed: name, then what comes with it (calories and 'Add ... £' options taken out)."""
    t, d = yp.strip_kcal(p["title"]), yp.strip_kcal(p["desc"])
    m = _ADD_OPTIONS.search(d)
    if m:
        d = d[:m.start()].strip(" ,;/|")
    m = _ADD_OPTIONS.search(t)
    if m:
        t, d = t[:m.start()].strip(" ,;/|"), ""
    t = _tidy_caps(t)
    if d.lower() == t.lower():
        d = ""
    if t and d:
        joined = (t[-1] in ",;:-" or d.startswith("(") or re.match(r"with\b", d, re.I) or re.search(r"\b(with|and|on|in|of)$", t, re.I))
        out = f"{t} {d}" if joined else f"{t}, {d}"
    else:
        out = t or d
    out = out.replace("\u2019", "'")
    out = re.sub(r"\s+,", ",", re.sub(r"\s+", " ", out)).strip(" ,;")
    return out[:1].upper() + out[1:]


_VEG_TEXT = re.compile(r"\((?:v|vg|ve|veg|vegan|vegetarian)(?:\s*[/,&+]\s*[a-z]{1,4})*\)|/\s*(?:v|vg|ve)\s*(?:/[a-z]{1,4}\s*)*(?:/|$)|\bsuitable for vegetarians\b", re.I)


def is_veg(p: dict) -> bool:
    """The chain's own vegetarian / vegan mark: the page's filter mark, or a mark written in the text."""
    if {d.lower() for d in p["dietary"]} & {"v", "ve", "vg"}:
        return True
    if yp.title_marks(p["title"]) & yp.VEG_MARKS:
        return True
    return bool(_VEG_TEXT.search(p["title"] + " " + p["desc"]))


_PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pancetta|salami|chorizo|pork|prosciutto|nduja|gammon|lardons?|pigs? in blankets?|pigs? in duvets?)\b", re.I)
_BEEF = re.compile(r"\b(beef|steak|sirloin|rump|ribeye|rib-eye|brisket|hamburger|picanha)\b", re.I)
# meat dishes whose printed text names no animal (reported as "meat type not stated", never tagged)
_MEATY = re.compile(r"\b(burgers?|meatballs?|mince[d]?|ribs?|bolognese|ragu|lasagne|meat|patty|kebabs?|hot dogs?|cottage pie|sliders?|faggots?|"
                    r"charcuterie|scotch egg|bratwurst|black pudding|ox cheek|toad in the hole|liver|coppa|bresaola|chipolatas?|crackling)\b", re.I)
_ANIMAL = re.compile(r"\b(beef|pork|chicken|lamb|turkey|duck|fish|cod|haddock|salmon|tuna|prawns?|shrimp|crab|squid|calamari|seabass|"
                     r"sea bass|bacon|ham|sausages?|pepperoni|salami|chorizo|pancetta|steak|brisket|mussels?|anchov(?:y|ies)|veg(?:an|etarian)?|"
                     r"plant|halloumi|vegetable|bean|lentil|mushroom|venison|pheasant|rabbit|gammon|scallops?|mackerel|trout|plaice|picanha|"
                     r"rump|sirloin)\b", re.I)
_NOT_PORK = re.compile(r"\b(pheasant|turkey|duck|venison|chicken|vegan|plant[- ]based|veggie|vegetarian|quorn) (bacon|ham|sausages?|chorizo)\b", re.I)
_NOT_BEEF = re.compile(r"\bpork (rib-?eye|rump)\b|\b(vegan|plant[- ]based|veggie) (steak|beef|burger)\b", re.I)


def tags_for(text: str, veg: bool) -> tuple:
    """(tags string, meat type not stated). vegetarian only from the chain's own mark; pork/beef only from the printed name and description."""
    if veg:
        return "vegetarian", False
    tags = []
    if _PORK.search(_NOT_PORK.sub(" ", text)):
        tags.append("contains_pork")
    if _BEEF.search(_NOT_BEEF.sub(" ", text)):
        tags.append("contains_beef")
    unstated = bool(_MEATY.search(text)) and not _ANIMAL.search(text) and not tags
    return "|".join(tags), unstated


# ---------------------------------------------------------------- the agreement rule
def group_prints(prints: list) -> dict:
    groups: dict = defaultdict(list)
    for p in prints:
        kids = bool(KIDS.search(p["menu"]) or KIDS.search(p["section"]))
        k = key_of(dish_text(p))
        if k:
            groups[(kids, k)].append(p)
    return groups


def judge(ps: list) -> tuple:
    """-> (verdict, detail). verdict: 'ok', 'nokcal', 'ambiguous', 'multi', 'qty', 'differs', 'veg', 'few'."""
    bad = [p for p in ps if p["problem"]]
    withk = [p for p in ps if p["kcal"] is not None]
    if bad:
        return "ambiguous", bad[0]["problem"]
    if not withk:
        return "nokcal", ""
    if any(p["multi"] for p in withk):
        return "multi", ""
    if any(_QTY_CHOICE.search(p["title"] + " " + p["desc"]) for p in withk):
        return "qty", ""
    if len({p["kcal"] for p in withk}) > 1:
        return "differs", sorted({p["kcal"] for p in withk})
    if len({is_veg(p) for p in ps}) > 1:
        return "veg", ""
    if len({p["pub"] for p in withk if not p["group"]}) < MIN_PUBS:
        return "few", ""
    return "ok", ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="the cache folder (pages, robots.txt files, venues.json)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download what is missing from the cache first (1.1 s apart)")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--survey", action="store_true", help="print menu / section titles of the dishes with calories and stop")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    f = yf.Fetcher(args.pages, network=args.fetch)
    all_venues = yf.load_venues(args.pages, f)
    venues, seen_sites, shared_sites = [], {}, []
    for v in all_venues:       # two listings that share one website (Tattenham Corner) are one pub's menus: counted once
        site = re.sub(r"^https?://(www\.)?", "", v["site"]).rstrip("/").lower()
        if site in seen_sites:
            shared_sites.append((v["slug"], seen_sites[site]))
            continue
        seen_sites[site] = v["slug"]
        venues.append(v)
    if args.fetch:
        f.prefetch([v["site"] for v in venues])
    homes = {}
    for v in venues:
        st, text, fin = f.get(v["site"])
        homes[v["slug"]] = (st, text, fin)
    if args.fetch:
        urls = []
        for v in venues:
            st, text, fin = homes[v["slug"]]
            if st == 200:
                urls += yp.menu_page_urls(text, fin)[:MAX_MENU_PAGES]
        f.prefetch(urls)
        f.get(GROUP_PAGE)
    recs = [read_pub(f, v) for v in venues]
    prints = [p for r in recs for p in r["prints"]] + read_group_page(f)
    unread = [r for r in recs if r["status"]]
    n_pubs = len(recs)
    n_read = n_pubs - len(unread)
    print(f"{len(all_venues)} venues listed on {n_pubs} different websites (listings sharing a website: {shared_sites}); {n_read} websites read; {len(unread)} not read")
    for why, c in Counter(r["status"] for r in unread).most_common():
        print(f"   not read: {c} x {why}")
    print(f"{len(prints)} dish lines; {sum(1 for p in prints if p['kcal'] is not None)} with calories")
    groups = group_prints(prints)
    verdicts = {k: judge(ps) for k, ps in groups.items()}
    print("verdicts:", dict(Counter(v[0] for v in verdicts.values())))
    if args.survey:
        c = Counter()
        for k, ps in groups.items():
            if verdicts[k][0] in ("ok", "few", "differs"):
                for p in ps:
                    if p["kcal"] is not None:
                        c[(p["menu"], p["section"])] += 1
        for (menu, section), n in sorted(c.items(), key=lambda kv: -kv[1]):
            print(f"{n:5d}  {menu!r:40} {section!r}")
        return 0
    items, names = [], Counter()
    for (kids, k), ps in sorted(groups.items(), key=lambda kv: kv[0]):
        verdict, _ = verdicts[(kids, k)]
        if verdict != "ok":
            continue
        printed = Counter(dish_text(p) for p in ps)
        text = sorted(printed.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        if text.isupper():
            text = text.capitalize()
        withk = [p for p in ps if p["kcal"] is not None]
        votes = Counter(section_category(p["section"], p["menu"], kids) for p in ps if not p["group"])
        top = max(votes.values())
        cat = sorted((c for c, n in votes.items() if n == top), key=CATEGORY_ORDER.index)[0]
        name = text + (" (children's)" if kids else "")
        names[name] += 1
        veg = is_veg(ps[0])
        tags, unstated = tags_for(text, veg)
        dish_pubs = len({p["pub"] for p in withk if not p["group"]})
        items.append({"id": slug(fold(name)), "name": name, "category": cat, "serving": "for two" if re.search(r"\bfor two\b", text, re.I) else "",
                      "calories": withk[0]["kcal"], "tags": tags, "rankable": False, "_unstated": unstated, "_pubs": dish_pubs,
                      "notes": (f"printed with calories at {dish_pubs} pubs"
                                + ("; also on the group's Burger Shack page" if any(p["group"] for p in ps) else "")
                                + f"; {len(ps)} copies, all agree")})
    dup = [n for n, c in names.items() if c > 1]
    if dup:
        raise SystemExit(f"two different dishes share the name {dup[:5]}: add a naming rule")
    ids = Counter(i["id"] for i in items)
    if any(c > 1 for c in ids.values()):
        raise SystemExit(f"two names make the same id: {[i for i, c in ids.items() if c > 1][:5]}")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    items.sort(key=lambda it: (order[it["category"]], it["name"].lower()))
    if not items:
        raise SystemExit("no items built")
    note = (f"Young's pubs each run their own website and menu. Listed: dishes that {MIN_PUBS} or more of the {n_read} pub websites read on "
            f"{args.checked_on} print with the same calories everywhere they appear; dishes that differ anywhere are left out. Calories only. Your "
            "pub may not serve a dish. PDF, event and wine, beer and spirits menus are not listed.")
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, over the 400 limit")
    public = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    title = (f"Young's pubs: the food-and-drink menus on each pub's own website, calories printed beside dishes ({n_read} of {n_pubs} pubs read, "
             f"accessed {args.checked_on}, no date shown)")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Young's", cuisine="Pub", source_title=title, source_url=HUB_URL, checked_on=args.checked_on,
                             aliases=ALIASES, items=public, out=args.out, note=note, nutrition_level="calories")
    counts = Counter(i["category"] for i in items)
    print("wrote", len(items), "items to", out, ":", dict(counts))
    c = Counter(v[0] for v in verdicts.values())
    print(f"dish texts read {len(groups)}: published {c['ok']}, differ at some pub {c['differs']}, vegetarian mark differs {c['veg']}, "
          f"ambiguous print {c['ambiguous']}, several prices {c['multi']}, a choice of quantities {c['qty']}, fewer than {MIN_PUBS} pubs {c['few']}, no calories anywhere {c['nokcal']}")
    spread = Counter("2-4" if i["_pubs"] < 5 else "5-9" if i["_pubs"] < 10 else "10+" for i in items)
    print("pubs per published dish:", dict(spread))
    print("meat type not stated:", sum(1 for i in items if i["_unstated"]))
    print("pubs mentioning an allergen guide/menu/list on the pages read:", sum(1 for r in recs if r["allergen_mentions"]))
    print("menus skipped as events/drinks lists:", Counter(t.lower() for r in recs for t in r["menus_skipped"]).most_common(12))
    print("PDF-only menus:", sum(r["pdf_only"] for r in recs), "at", sum(1 for r in recs if r["pdf_only"]), "pubs")
    page_files = sorted(f.cache.joinpath("pages").glob("*.html"))
    digest = hashlib.sha256("\n".join(f"{p.name} {sha256_file(p)}" for p in page_files).encode()).hexdigest()
    print(f"cached pages {len(page_files)}; combined SHA-256 of the sorted '<file name> <sha256>' lines {digest}")
    if args.report:
        print("-- not read:")
        for r in unread:
            print("  ", r["slug"], r["site"], "-", r["status"])
        print("-- differ (first 60):")
        shown = 0
        for (kids, k), ps in groups.items():
            v, d = verdicts[(kids, k)]
            if v in ("differs", "ambiguous", "multi", "qty", "veg") and shown < 60:
                shown += 1
                print(f"   {v} {d}: {dish_text(ps[0])[:90]} ({len({p['pub'] for p in ps})} pubs)")
        print("-- meat type not stated:", [i["name"][:60] for i in items if i["_unstated"]])
    return 0


if __name__ == "__main__":
    sys.exit(main())
