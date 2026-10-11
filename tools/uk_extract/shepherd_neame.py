#!/usr/bin/env python3
"""Build data/source/shepherd-neame/ from Shepherd Neame's own pub menus on Ten Kites (nutrition per portion and allergens for every dish).

    python3 -I tools/uk_extract/shepherd_neame.py --pages DIR --checked-on 2026-10-11 [--fetch] [--fetch-only] [--out DIR] [--report]

Source: Shepherd Neame's own pub locator (https://pubs.shepherdneame.co.uk, 277 pubs). The locator loads its pub list from the chain's own search
service (cdn.eu.yextapis.com, with the public key and experience name the locator page itself embeds) and that list gives each pub's own website
(276 distinct sites for 277 pubs: two pubs share baronspubs.com). Each site was checked on 2026-10-10/11: robots.txt first, then its home page and, where the home page named them, up
to three of its menu / food pages, one request per host at a time (shepherdneame.co.uk-hosted sites publish Crawl-delay 10; the requests to one host
were minutes apart). 258 of the 277 answered their home page (19 timed out or answered 404); 227 of the home pages link PDF menus on
snsites.co.uk, whose robots.txt disallows *.pdf, so those were not fetched; 52 sites link a Ten Kites menu page, https://menus.tenkites.com/shepherdn/
<menu code>, from the home page or the menus page. 51 of those link a regular menu (the 52nd is a staging page, left out; a pub's function menus,
linked as .../<pub>functions, are not used). The menu codes are in PUBS, each beside the pub website that links it. robots.txt of menus.tenkites.com
disallows only /fonts/, /views/ and /*.less$; images.tenkites.com (disallowed in full) is never fetched. --fetch downloads each pub's first menu page
and every other tab it lists (?mguid=<menu id>) except the tabs in SKIP_TABS, one request per page, 1.2 s apart. The Albion Taverna, Faversham menu
page (menus.tenkites.com/shepherdn/albiontaverna) is not used: the pub's website answered 404 at its root on 2026-10-11, so the link could not be
confirmed. shepherdneame.co.uk itself (robots.txt: Crawl-delay 10, Disallow /*.pdf) was visited three times only.

What each dish prints: a pop-up headed "Nutrition (per portion)" with Energy (kCal), Protein, Carb, of which Sugars, Fat, Sat Fat, Calories from Fat
(not used) and Salt, plus "Contains:" and "May contain:" (cereals and tree nuts named in brackets). The diet marks "(v)" (vegetarian) and "(vg)"
(vegan) are printed inside the dish names. Numbers are copied exactly as printed (a thousands comma is dropped); nothing is converted, rounded or
estimated. tenkites_b.py reads the pop-ups (the same template as Banana Tree); the reading is cross-checked against the schema.org menu each page embeds.

MENUS DIFFER BY PUB, and a dish with the same name sometimes has different figures at different pubs. Same rule as Fuller's and Butcombe Inns
(see fullers.py): a dish is published ONLY when its printed name and ALL its printed figures and allergens are identical on every menu, at every
pub, that prints it with nutrition, and it is printed at 2 or more pubs. When pubs print different figures for one name, nothing is chosen,
averaged or corrected: the dish is left out and counted in the run's report. Children's-menu dishes are judged apart from adult ones.

Left out on purpose (counted in the run's report): the Festive / Christmas, Buffet, Afternoon tea, Seafood Tower and Set menus tabs (seasonal, group or
for-two menus); every "Hot Drinks" tab (the page gives an Americano, an espresso and a macchiato the same 139 kcal and every tea 0); rows that print no
nutrition; dishes printed at one pub only; dishes whose figures or allergens differ between pubs.

Allergens (docs/DATA.md "Allergens") are complete for every published dish: the printed Contains / May contain lines and the label ids the page's own
allergen filter reads must agree (tenkites_b.allergens_from_rec). The label "Less than 600kcal" is a calorie claim, not an allergen, and is ignored.
Tags: vegetarian only from the pop-up's own "Suitable for:" line (Vegetarian / Vegan; a "(v)" or "(vg)" mark in the name that the line does not
confirm, or a mark that contradicts the allergens, leaves the dish out); contains_pork /
contains_beef only when the dish name or description says so.

Independent checks 2026-10-11: see data/audit/verified/shepherd-neame.json.
"""
from __future__ import annotations
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fullers as fl  # noqa: E402  (the shared 'identical at 2+ pubs' rules)
import heartwood_inns_pages as hp  # noqa: E402  (tab bar, schema.org menu)
import tenkites_b as tb  # noqa: E402  (modal pop-up reader and allergen reader)
import tenkites_c as tk  # noqa: E402
from common import ROOT  # noqa: E402

CHAIN_ID = "shepherd-neame"
CLIENT = "shepherdn"
HOST = "https://menus.tenkites.com"
BASE = f"{HOST}/{CLIENT}/"
# (menu code, pub, the pub's own website, whose menus page links the code)
PUBS = [
    ("bellhotel", "The Bell Hotel, Sandwich", "www.bellhotelsandwich.co.uk"),
    ("bloomsburytavernlondonlow", "Bloomsbury Tavern, London", "www.bloomsburytavern.co.uk"),
    ("botanybaycat2fish", "Botany Bay Hotel, Broadstairs", "www.botanybayhotel.co.uk"),
    ("britannia", "The Britannia, Guildford", "www.britanniaguildford.co.uk"),
    ("caskandglass", "The Cask & Glass, Victoria", "www.caskandglass.co.uk"),
    ("crownbhcat3", "The Crown, Blackheath", "www.crownblackheath.co.uk"),
    ("crowninncat2british", "The Crown, Chislehurst", "www.crownchislehurst.co.uk"),
    ("crownrochester", "Royal Crown, Rochester", "www.royalcrownrochester.co.uk"),
    ("dogbearcat2british", "The Dog & Bear Hotel, Maidstone", "www.dogandbearlenham.co.uk"),
    ("dukeofcumberland", "Duke of Cumberland, Whitstable", "www.dukeofcumberlandhotel.co.uk"),
    ("dukeofwellingtonlondonlow", "Duke of Wellington, London", "www.dukeofwellingtonbelgravia.co.uk"),
    ("fishonthegreen", "Fish on the Green, Bearsted", "www.fishonthegreen.com"),
    ("georgedragon", "George & Dragon, Thames Ditton", "www.georgeanddragonthamesditton.co.uk"),
    ("georgehotel", "George Hotel, Cranbrook", "www.thegeorgehotelkent.co.uk"),
    ("hoopgrapes", "Hoop & Grapes, London", "www.hoopandgrapes.co.uk"),
    ("horsegroom", "The Horse and Groom, Wilmington", "www.horseandgroomwilmington.co.uk"),
    ("kingsarmscat3", "The King's Arms, Dorking", "www.kingsarmsdorking.co.uk"),
    ("limes", "The Limes, Faversham", "www.limes.pub"),
    ("mabelstavern", "Mabel's Tavern, London", "www.mabelstavern.co.uk"),
    ("manorfarmsteak", "Manor Farm Barn, Southfleet", "www.manorfarmbarnsouthfleet.co.uk"),
    ("marinehotel", "The Marine Hotel, Whitstable", "www.marinewhitstable.co.uk"),
    ("markethouse", "The Market House, Maidstone", "www.markethouse.pub"),
    ("millersarms", "Millers Arms, Canterbury", "www.millerscanterbury.co.uk"),
    ("minnisbaycat2fish", "Minnis Bay Bar & Brasserie, Birchington", "www.theminnis.co.uk"),
    ("oakonthegreen", "Oak on the Green, Maidstone", "www.oakonthegreen.com"),
    ("olddoctorbutlershead", "Old Doctor Butler's Head, London", "www.olddoctorbutlershead.co.uk"),
    ("oldmill", "The Old Mill, Ashford", "www.theoldmill.co"),
    ("parrot", "The Parrot, Canterbury", "www.parrotcanterbury.co.uk"),
    ("rosecrownlondonlow", "Rose & Crown, London", "www.roseandcrownse1.co.uk"),
    ("royalalbionhotel", "The Royal Albion Hotel, Broadstairs", "www.albionbroadstairs.co.uk"),
    ("royalhotel", "The Royal Hotel, Deal", "www.theroyalhotel.com"),
    ("royaltankertoncat2fish", "The Royal Tankerton, Whitstable", "www.royaltankerton.co.uk"),
    ("samuelpepys", "Samuel Pepys, London", "www.samuelpepys.pub"),
    ("shakespeare", "The Shakespeare, Canterbury", "www.shakespearecanterbury.com"),
    ("shiptradessteak", "Ship & Trades, Chatham", "www.shipandtradeschatham.co.uk"),
    ("sinbin", "The Sin Bin, Chatham Maritime", "www.sinbindockside.co.uk"),
    ("singletonbarncat3", "Singleton Barn, Ashford", "www.singletonbarn.co.uk"),
    ("spitfiresteak", "The Spitfire, West Malling", "www.spitfirekingshill.co.uk"),
    ("starlondonhigh", "The Star Inn, Guildford", "www.starinnguildford.co.uk"),
    ("suninn", "The Sun Inn, Faversham", "www.sunfaversham.co.uk"),
    ("thebellhouse", "The Bellhouse, Leigh-on-Sea", "www.bellhousepub.co.uk"),
    ("thegeorgesoho", "The George, London", "www.georgesoho.co.uk"),
    ("thehamletcourt", "The Hamlet Court, Westcliff-on-Sea", "www.hamletcourt.co.uk"),
    ("therestoration", "The Restoration, Sevenoaks", "www.therestoration.pub"),
    ("tomcribb", "Tom Cribb, London", "www.tomcribblondon.co.uk"),
    ("vine", "The Vine Inn, Tenterden", "www.vineinntenterden.co.uk"),
    ("westminstercat4unique", "Westminster Arms, London", "www.westminsterarms.co.uk"),
    ("wharfcat2", "The Wharf, Dartford", "www.wharfcrossways.co.uk"),
    ("whitehorsebowerlondonlow", "White Horse & Bower, London", "www.whitehorseandbower.co.uk"),
    ("windsorcastle", "The Windsor Castle, Carshalton", "www.windsorcastlepub.com"),
    ("woolpack", "The Woolpack, Banstead", "www.woolpackbanstead.co.uk"),
]
SOURCE_URL = "https://pubs.shepherdneame.co.uk/"
ALIASES = ["shepherd neame", "shepherd neame pubs", "shepherd neame pub", "sheps", "shepherd neame inns"]
SKIP_TABS = re.compile(r"festive|christmas|boxing day|new years? eve|murder mystery|buffet|afternoon tea|seafood tower|set menu|function|hot drinks|coffee", re.I)
LABELS_8 = ["Energy (kCal)", "Protein (g)", "Carb (g)", "of which Sugars (g)", "Fat (g)", "Sat Fat (g)", "Calories from Fat (kcal)", "Salt (g)"]
CAPTION = "Nutrition (per portion)"
NOT_ALLERGEN_LABELS = {"Less than 600kcal"}


# ---------------------------------------------------------------------------------------------------------------- fetching
def tabs_of(text: str) -> list:
    """The page's tab bar [(menu name, menu id)]; a pub with a single menu has none, and then the page's own title names the menu ('first')."""
    tabs = [(re.sub(r"\s+", " ", n), g) for n, g in hp.menu_tabs(text)]
    return tabs or [(re.sub(r"\s+", " ", tk.page_title(text)), "first")]


def fetch_pub(pages: Path, code: str, rules: list) -> list:
    """First page plus every tab not in SKIP_TABS. Returns [(tab, menu id)] of the tabs read."""
    tmp = pages / f"{code}_first.html"
    if not tmp.exists():
        fl.bp.get(f"{BASE}{code}", tmp, rules, HOST)
    tabs = tabs_of(tmp.read_text(encoding="utf-8"))
    first = fl.page_path(pages, code, tabs[0][1])
    if not first.exists():
        first.write_bytes(tmp.read_bytes())
    for name, guid in tabs[1:]:
        if SKIP_TABS.search(name):
            continue
        dest = fl.page_path(pages, code, guid)
        if not dest.exists():
            fl.bp.get(f"{BASE}{code}?mguid={guid}", dest, rules, HOST)
    return [(n, g) for n, g in tabs if not SKIP_TABS.search(n) or (n, g) == tabs[0]]


def local_tabs(pages: Path, code: str) -> list:
    first = pages / f"{code}_first.html"
    if not first.exists():
        raise SystemExit(f"{code}: no saved first page in {pages}: run with --fetch")
    tabs = tabs_of(first.read_text(encoding="utf-8"))
    return [(n, g) for i, (n, g) in enumerate(tabs) if i == 0 or not SKIP_TABS.search(n)]


# ---------------------------------------------------------------------------------------------------------------- reading
def marks_of(name: str) -> set:
    return {m.lower() for m in re.findall(r"\(\s*(v|vg)\s*\)", name, re.I)}


def read_page(path: Path, where: str) -> list:
    layout, recs = tb.read_menu(path)
    if layout != "modal":
        raise SystemExit(f"{where}: the page is laid out as {layout!r}, this script reads 'modal'")
    text = path.read_text(encoding="utf-8")
    ld = Counter((re.sub(r"\s+", " ", n).strip(), c.replace(",", "") or "0") for _, n, c in hp.json_ld_items(text))
    out, seen_ld = [], Counter()
    # each pop-up's own "Suitable for:" line (tenkites_b does not keep it), in the same order as the records
    modals = tk.parse_html(text).find_all("k10-recipe-modal", tag="section")
    suitable_lines = []
    for m in modals:
        sec = m.find("k10-recipe-modal__section_suitable")
        vals = sec.find("k10-recipe-modal__section-values") if sec is not None else None
        suitable_lines.append((re.sub(r"\s+", " ", m.find("k10-recipe-modal__recipe-name").text()),
                               [x.strip() for x in vals.text().split(",") if x.strip()] if vals is not None else []))
    if len(suitable_lines) != len(recs) or any(a[0] != r["name"] for a, r in zip(suitable_lines, recs)):
        raise SystemExit(f"{where}: the pop-ups no longer line up with the records")
    for rec, (_, suit_line) in zip(recs, suitable_lines):
        here = f"{where} > {rec['name']}"
        if rec["group"]:
            raise SystemExit(f"{here}: a named 'build your own' block: this script has not been checked against one")
        if rec["check"]["basis"] != CAPTION:
            raise SystemExit(f"{here}: table is headed {rec['check']['basis']!r}, not {CAPTION!r}")
        if list(rec["nutrients"]) != LABELS_8:
            raise SystemExit(f"{here}: nutrient rows are {list(rec['nutrients'])}, expected {LABELS_8}")
        nut = {lab: tk.printed(rec["nutrients"][lab]) for lab in LABELS_8}
        seen_ld[(re.sub(r"\s+", " ", rec["name"]).strip(), nut["Energy (kCal)"] if fl.is_num(nut["Energy (kCal)"]) else "0")] += 1
        # calorie claim labels are not allergens: drop them from the page's label list and from the dish's ids before the allergen check
        bad_ids = {i for i, n in (rec.get("label_map") or {}).items() if n in NOT_ALLERGEN_LABELS}
        clean = dict(rec)
        clean["label_map"] = {i: n for i, n in (rec.get("label_map") or {}).items() if i not in bad_ids}
        src = dict(rec["allergen_src"])
        for k in ("ids_all", "ids_no_may"):
            if src.get(k) is not None:
                src[k] = [x for x in src[k] if x not in bad_ids]
        clean["allergen_src"] = src
        allergens = tb.allergens_from_rec(clean, here)
        if allergens is None:
            raise SystemExit(f"{here}: no allergen information to read")
        marks = marks_of(rec["name"])
        suitable = [w for w in suit_line if w.lower() in ("vegetarian", "vegan")]
        skip = ""
        if marks and not suitable:
            skip = "rows whose name marks them (v) / (vg) but whose own 'Suitable for' line says neither"
        elif "vg" in marks and "Vegan" not in suitable:
            skip = "rows whose name marks them (vg) but whose own 'Suitable for' line does not say Vegan"
        # a row inside a 'build your own' block (a burger topping, a sauce, "- choice" of protein) is a choice offered with another dish: fullers.build
        # counts it under "choices and extras listed under another dish" and does not publish it
        choice = bool(rec["level"])
        row = {"name": rec["name"], "kind": "choice" if choice else "dish", "path": rec["course"], "section": "choice" if choice else "", "desc": rec["desc"],
               "suitable": suitable, "skip_reason": skip,
               "nutrients": {lab: nut[lab] for lab in fl.NUTRIENT_LABELS}, "blk": None, "price": ""}
        out.append({"row": row, "allergens": allergens})
    if seen_ld - ld:
        raise SystemExit(f"{where}: pop-ups and the embedded menu disagree: {dict(seen_ld - ld)}")
    return out


def load(pages: Path, fetch: bool, pubs=PUBS, client: str = CLIENT, host: str = HOST):
    rules = fl.bp.robots(pages / "robots_menus.tenkites.com.txt", host, fetch=fetch)
    instances, hashes, empty = [], [], []
    for code, pub, _site in pubs:
        tabs = fetch_pub(pages, code, rules) if fetch else local_tabs(pages, code)
        for tab, guid in tabs:
            path = fl.page_path(pages, code, guid)
            if not path.exists():
                raise SystemExit(f"{pub} / {tab}: page {path.name} is missing: run with --fetch")
            text = path.read_text(encoding="utf-8")
            where = f"{pub} / {tab}"
            if re.sub(r"\s+", " ", tk.page_title(text)) != tab:
                raise SystemExit(f"{where}: the page is titled {tk.page_title(text)!r}")
            if re.sub(r"\s+", " ", hp.active_tab(text)) != tab:
                raise SystemExit(f"{where}: the page's own tab bar no longer lists this menu")
            recs = read_page(path, where)
            if not recs:
                empty.append(where)
            for rec in recs:
                instances.append({"pub": pub, "code": code, "tab": tab, **rec})
            hashes.append(f"{fl.bp.sha256(path)}  {path.name}  {where}")
    return instances, hashes, empty


# ---------------------------------------------------------------------------------------------------------------- rules
CATEGORY_ORDER = ["Starters and small plates", "Bar snacks and sharing", "Sandwiches", "Burgers", "Pizzas", "Mains", "Steaks", "Sunday roasts",
                  "Breakfast", "Sides", "Puddings", "Drinks", "Children's: Mains", "Children's: Puddings", "Children's: Drinks", "Children's: Breakfast"]
RANKABLE = {"Starters and small plates", "Sandwiches", "Burgers", "Pizzas", "Mains", "Steaks", "Sunday roasts", "Breakfast"}
KIDS = re.compile(r"child|kid", re.I)
LEFT_OUT_COURSE = re.compile(r"coffee|hot chocolate|\btea\b|syrups|sundries", re.I)     # hot drinks: the same figure for different drinks


def is_kids(tab: str, path: list) -> bool:
    return bool(KIDS.search(tab) or (path and KIDS.search(path[0])))


def course_category(top: str, kids: bool, where: str):
    """-> category, or None for a course left out on purpose. Raises on a course it has not seen, so a new one can't slip in."""
    t = fl.norm(top)
    if LEFT_OUT_COURSE.search(top):
        return None
    if kids:
        if t in ("mains", "children", "childrens"):
            return "Children's: Breakfast" if "breakfast" in where.lower() else "Children's: Mains"
        if t in ("desserts", "pudding", "puddings"):
            return "Children's: Puddings"
        if t == "drinks":
            return "Children's: Drinks"
        raise SystemExit(f"{where}: unmapped children's course {top!r}: add a rule to course_category")
    if re.fullmatch(r"starters?|special starters|small plates|to begin|whilst you wait|grazing", t):
        return "Starters and small plates"
    if re.fullmatch(r"bar snacks|sharers|for the table|shares|sharing|great to share|sharing specials pre order only|sharing breakfast|loaded fries|loaded fatbreads|chips", t):
        return "Bar snacks and sharing"
    if re.fullmatch(r"sandwiches|lunch|ciabattas|hot dogs", t):
        return "Sandwiches"
    if re.fullmatch(r"burgers|build your own burger|world tour burger", t):
        return "Burgers"
    if re.fullmatch(r"pizza|pizza menu", t):
        return "Pizzas"
    if t in ("steak", "steaks"):
        return "Steaks"
    if re.fullmatch(r"mains|specials mains|large plates|fajitas?|fajita|loaded flatbreads|flatbread|tacos|chicken|chippy friday|fish and chips|curry|lobsters?|mussels|oysters|"
                    r"seafood broil|hot seafood tower|pie corner|seasonal|specials|mains toppings", t):
        return "Mains"
    if re.fullmatch(r"roasts|sunday roasts?", t):
        return "Sunday roasts"
    if re.fullmatch(r"breakfast|breakfast baps|eggs benny|eggs your way|pancakes|eggs muffins and pancakes|full breakfast|brunch|brunch adventure", t):
        return "Breakfast"
    if t in ("sides", "enhance your breakfast", "extras", "cheese course add on"):
        return "Sides"
    if re.fullmatch(r"desserts?|pudding|puddings|ice creams?|ice creams and sorbets|specials desserts|to finish|cakes and pastries", t):
        return "Puddings"
    if t == "drinks":
        return "Drinks"
    raise SystemExit(f"{where}: unmapped course {top!r}: add a rule to course_category")


# Dishes that stay in items.csv but are held back (holdback.csv; restore by deleting the entry). Key = (children's menu?, published name); never corrected.
HOLD_TEXT = {
    (False, "Tokyo after hours"): ("one figure (4406 kcal, 183.5 g protein, 261.2 g fat) for a feast the page itself describes as a crispy karaage chicken burger, a "
                                   "double beef smash burger, vegetable gyoza, Sriracha-loaded fries and a Katsu curry dip; the page does not say how many people it "
                                   "serves, so the figure cannot describe one person's order. Restore by deleting this entry once the chain says what a portion is."),
    (False, "Vegan Coconut ice cream"): ("allergen row contradicts the dish name: named vegan, but the page marks milk (and gluten and soya) as contained. "
                                         "Restore by deleting this entry once the chain confirms the allergens."),
}
CFG = {"course_category": course_category, "is_kids": is_kids, "category_order": CATEGORY_ORDER, "rankable": RANKABLE, "hold_text": HOLD_TEXT,
       "not_a_meal": fl.NOT_A_MEAL}

NOTE_TEMPLATE = ("Menus differ by pub, so a dish is listed only if its name, figures and allergens are identical at every pub that prints it, "
                 "and at {min_pubs} or more of the {n} pubs read. Figures are per portion. Hot drinks, festive and group menus are not listed.")


def main(argv=None) -> int:
    return fl.main(argv, chain_id=CHAIN_ID, name="Shepherd Neame", aliases=ALIASES, pubs=PUBS, client=CLIENT, host=HOST, source_url=SOURCE_URL,
                   title_fn=lambda n, d: (f"Shepherd Neame pub menus with nutrition and allergens (Ten Kites pages for {n} pubs, each linked from the "
                                          f"pub's own website; accessed {d}, no date shown)"),
                   guide_url=BASE + PUBS[0][0], cfg=CFG, load_fn=load, note_fn=NOTE_TEMPLATE.format)


if __name__ == "__main__":
    sys.exit(main())
