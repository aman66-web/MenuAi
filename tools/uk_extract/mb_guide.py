"""Reader for the Mitchells & Butlers (M&B) "Allergen Guide" HTML pages on allergens.mbplc.io.

One page per brand (All Bar One, Browns, Ember Inns, Nicholsons, O'Neill's ...), all in the same machine-generated
layout. The page is a list of menus (`div[data-menu-block]`, titled by an <u> heading), each holding sections
(`p.sectionContainerH`) of dishes (`div.recipe-card`). A dish has a bold name, an optional description, allergen
text, and a `div.nutrition` table:

    (blank) | kJ/kcal | Fat | Saturates | Carbohydrate | Sugars | Protein | Salt
    Per Portion: | 1516KJ/361Kcal | 11g | 1.1g | 59g | 0.8g | 6.6g | 0.89g

Drinks and a few dishes have an EMPTY nutrition div: they have no published numbers and are not extracted.

This module only READS the page and returns the cells exactly as printed (units stripped, nothing rounded,
converted or filled). Naming, categories and exclusions are decided by the per-chain scripts. Standard library only.

Allergens (docs/DATA.md "Allergens"): every dish card also prints its allergens, which this reader copies:

    <span><span style="color: darkred">warning sign</span> Contains</span> <span class="containsClass allergen-pill-style">Milk</span> ...
    <span><span style="color: darkorange">warning sign</span> May Contains</span> <span class="allergen-pill-style">Celery</span> ...
    or, for a dish with none of the 14: <span>... Contains no major allergens</span>

A pill reads "Cereals Containing Gluten (Barley, Wheat)" or "Tree Nuts (Almond, Hazelnuts, Walnuts)" when the guide names the kinds,
plain "Tree Nuts" / "Cereals Containing Gluten" otherwise. Read as printed, nothing inferred: a card whose allergen lines are not one
of the four known shapes, a pill whose colour class disagrees with its label, or a word outside common._A stops the run. The guide
says on some dishes "Click through to view full allergen and dietary information including choices" or "Please refer to your choice of
side for additional allergen information": that dish's printed row is NOT everything you may be served, so the dish is held back
(holdback.csv) rather than shown with an allergen list that looks complete. A dish printed in several menus with different allergens
is not published. Allergen data is written all or nothing: main_for stops unless every published item has its row.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words, slug, write_chain_folder  # noqa: E402

# Table header text -> our key. Anything else in a header row stops the parse (the layout changed).
HEADERS = {"kj/kcal": "energy", "fat": "fat", "saturates": "sat", "carbohydrate": "carbs", "sugars": "sugars",
           "protein": "protein", "salt": "salt"}
ENERGY_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*kj\s*/\s*(-?\d+(?:\.\d+)?)\s*kcal\s*$", re.I)
GRAMS_RE = re.compile(r"^\s*(<?\s*-?\d+(?:\.\d+)?)\s*g\s*$", re.I)


class GuideLayoutError(Exception):
    """The page no longer looks the way this reader expects: a human must re-check it."""


class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stamp = ""
        self.menus: list[dict] = []
        self.cards: list[dict] = []
        self._menu: dict | None = None
        self._section = ""
        self._card: dict | None = None
        self._stack: list[tuple[str, dict]] = []  # (tag, attrs) for open elements we care about
        self._in_u = False
        self._in_section_a = False
        self._in_b = False
        self._in_stamp = False
        self._in_nutrition = False
        self._nut_rows: list[list[str]] = []
        self._cell: list[str] | None = None
        self._row: list[str] | None = None
        self._desc: list[str] = []
        self._desc_state = 0  # 0 before the bold name, 1 after it, 2 inside the description, 3 done
        self._span_depth = 0
        self._b_span_depth = 0
        self._seen_b = False
        self.notes: list[dict] = []  # section footers / claims printed under a section heading
        self._note: dict | None = None
        self._div_depth = 0
        self._card_depth = -1
        self._nut_depth = -1
        self._menu_depth = -1
        self._icon_depth = -1  # span depth of the warning-sign span inside an allergen label, -1 when not inside one
        self._label: dict | None = None  # the allergen label being read: {"color", "text", "outer"}
        self._line: dict | None = None  # the allergen line that pills attach to
        self._pill: dict | None = None

    def _end_allergen_label(self) -> None:
        label, self._label = self._label, None
        text = " ".join(label["text"].replace("\xa0", " ").split()).lower()
        kinds = {("darkred", "contains"): "contains", ("darkred", "contains no major allergens"): "none",
                 ("darkorange", "may contains"): "may"}
        kind = kinds.get((label["color"], text))
        if kind is None:
            raise GuideLayoutError(f"{self._card['name']!r}: unknown allergen label {label['text']!r} ({label['color']})")
        self._line = {"kind": kind, "pills": []}
        self._card["allergen_lines"].append(self._line)

    # -- helpers
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "") or ""
        if tag == "div":
            self._div_depth += 1
            if "data-menu-block" in a:
                self._menu = {"id": a.get("id", ""), "title": "", "sections": []}
                self.menus.append(self._menu)
                self._menu_depth = self._div_depth
                self._section = ""
            elif cls == "recipe-card":
                self._card = {"menu": self._menu["title"] if self._menu else "", "menu_id": self._menu["id"] if self._menu else "",
                              "section": self._section, "name": "", "desc": "", "nutrition_rows": [], "allergen_lines": []}
                self._card_depth = self._div_depth
                self._icon_depth, self._label, self._line, self._pill = -1, None, None, None
                self._seen_b = False
                self._desc, self._desc_state = [], 0
            elif cls == "nutrition" and self._card is not None:
                self._in_nutrition = True
                self._nut_depth = self._div_depth
                self._nut_rows = []
        elif tag == "u" and self._menu is not None and self._card is None:
            self._in_u = True
        elif tag == "a" and "id" in a and re.fullmatch(r"menu\d+section\d+", a["id"] or ""):
            self._in_section_a = True
            self._section = ""
        elif tag == "b" and self._card is not None and not self._seen_b and not self._in_nutrition:
            self._in_b = True
        elif tag == "br" and self._card is not None and self._desc_state == 1 and self._span_depth == self._b_span_depth:
            self._desc_state = 2
        elif tag == "p" and cls in ("footer", "claims") and self._card is None:
            self._note = {"menu": self._menu["title"] if self._menu else "", "section": self._section, "kind": cls, "text": ""}
        elif tag == "span":
            self._span_depth += 1
            if self._card is not None and not self._in_nutrition:
                if "allergen-pill-style" in cls.split():
                    if self._line is None:
                        raise GuideLayoutError(f"{self._card['name']!r}: an allergen pill outside an allergen line")
                    self._pill = {"contains_class": "containsClass" in cls.split(), "text": ""}
                else:
                    m = re.search(r"color:\s*(darkred|darkorange)\b", a.get("style") or "")
                    if m and self._label is None:
                        self._icon_depth = self._span_depth
                        self._label = {"color": m.group(1), "text": "", "outer": self._span_depth - 1}
        elif tag == "tr" and self._in_nutrition:
            self._row = []
        elif tag == "td" and self._in_nutrition and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag == "div":
            if self._in_nutrition and self._div_depth == self._nut_depth:
                self._in_nutrition = False
                if self._card is not None:
                    self._card["nutrition_rows"] = self._nut_rows
            if self._card is not None and self._div_depth == self._card_depth:
                if self._pill is not None or self._label is not None:
                    raise GuideLayoutError(f"{self._card['name']!r}: an allergen label or pill was left open")
                self._card["desc"] = " ".join("".join(self._desc).split())
                self.cards.append(self._card)
                self._card = None
            if self._menu is not None and self._div_depth == self._menu_depth:
                self._menu = None
            self._div_depth -= 1
        elif tag == "p" and self._note is not None:
            self._note["text"] = " ".join(self._note["text"].split())
            if self._note["text"]:
                self.notes.append(self._note)
            self._note = None
        elif tag == "u":
            self._in_u = False
        elif tag == "a" and self._in_section_a:
            self._in_section_a = False
            self._section = " ".join(self._section.split())
            if self._menu is not None:
                self._menu["sections"].append(self._section)
        elif tag == "b" and self._in_b:
            self._in_b = False
            self._seen_b = True
            self._desc_state, self._b_span_depth = 1, self._span_depth
            if self._card is not None:
                self._card["name"] = " ".join(self._card["name"].split())
        elif tag == "span":
            if self._card is not None and self._desc_state in (1, 2) and self._span_depth == self._b_span_depth:
                self._desc_state = 3
            if self._pill is not None:
                pill, self._pill = self._pill, None
                self._line["pills"].append((" ".join(pill["text"].split()), pill["contains_class"]))
            elif self._icon_depth == self._span_depth:
                self._icon_depth = -1
            elif self._label is not None and self._icon_depth == -1 and self._span_depth == self._label["outer"]:
                self._end_allergen_label()
            self._span_depth -= 1
        elif tag == "td" and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).replace("\xa0", " ").split()))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._in_nutrition:
            self._nut_rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._in_u and self._menu is not None and not self._menu["title"]:
            self._menu["title"] += data
            self._menu["title"] = " ".join(self._menu["title"].split())
        elif self._in_u and self._menu is not None:
            self._menu["title"] = " ".join((self._menu["title"] + " " + data).split())
        if self._note is not None:
            self._note["text"] += data
        if self._in_section_a:
            self._section += data
        if self._in_b and self._card is not None:
            self._card["name"] += data
        elif self._card is not None and self._desc_state == 2:
            self._desc.append(data)  # text after the bold name's <br> inside the same <span>
        if self._cell is not None:
            self._cell.append(data)
        if self._pill is not None:
            self._pill["text"] += data
        elif self._label is not None and self._icon_depth == -1:
            self._label["text"] += data
        if not self.stamp and "Mitchells & Butlers" in data:
            self.stamp = " ".join(data.split())


def parse_page(html: str) -> dict:
    """Return {"stamp": str, "menus": [...], "cards": [...]} with raw cells. Raises GuideLayoutError if odd."""
    p = _Parser()
    p.feed(html)
    p.close()
    if not p.cards:
        raise GuideLayoutError("no recipe cards found")
    return {"stamp": p.stamp, "menus": p.menus, "cards": p.cards, "notes": p.notes}


def read_nutrition(card: dict) -> dict | None:
    """Per-portion numbers of one card exactly as printed, or None when the card has no nutrition table.

    Returns {"kcal": "361", "kj": "1516", "fat": "11", "sat": "1.1", "carbs": "59", "sugars": "0.8", "protein": "6.6",
    "salt": "0.89"} as strings: a '<' or '-' prefix is kept ("<0.5", "-28": the guide prints negative swap differences). Anything
    that is not `n kJ/n kcal` or `n g` (or a header/row label this reader doesn't know) stops the run with GuideLayoutError."""
    rows = card["nutrition_rows"]
    if not rows:
        return None
    if len(rows) != 2:
        raise GuideLayoutError(f"{card['name']!r}: nutrition table has {len(rows)} rows, expected a header and one Per Portion row")
    head, data = rows
    if len(head) != len(data):
        raise GuideLayoutError(f"{card['name']!r}: header has {len(head)} cells but the row has {len(data)}")
    if data[0].lower().rstrip(":") != "per portion":
        raise GuideLayoutError(f"{card['name']!r}: row label is {data[0]!r}, expected 'Per Portion:'")
    out: dict = {}
    for h, v in zip(head[1:], data[1:]):
        key = HEADERS.get(h.strip().lower())
        if key is None:
            raise GuideLayoutError(f"{card['name']!r}: unknown column {h!r}")
        if key == "energy":
            m = ENERGY_RE.match(v)
            if not m:
                raise GuideLayoutError(f"{card['name']!r}: energy cell {v!r} is not 'n kJ/n kcal'")
            out["kj"], out["kcal"] = m.group(1), m.group(2)
        else:
            m = GRAMS_RE.match(v)
            if not m:
                raise GuideLayoutError(f"{card['name']!r}: {h} cell {v!r} is not an amount in grams")
            out[key] = m.group(1).replace(" ", "")
    for k in ("kcal", "fat", "sat", "carbs", "sugars", "protein", "salt"):
        if k not in out:
            raise GuideLayoutError(f"{card['name']!r}: column {k} missing")
    return out


ALG_PAREN = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")
ALG_SHAPES = (["contains"], ["contains", "may"], ["none"], ["none", "may"])


def _words(words: list, where: str) -> tuple:
    """common.allergen_words, but an unknown word is a GuideLayoutError (the run stops with the guide's own word in the message)."""
    try:
        return allergen_words(words, where)
    except SystemExit as e:
        raise GuideLayoutError(str(e)) from None


def read_allergens(card: dict) -> dict:
    """The allergens of one card exactly as printed: {"contains", "may_contain", "cereals", "nuts"} (frozensets of keys).

    Every card with a nutrition table must print "Contains <pills>" or "Contains no major allergens", optionally followed by
    "May Contains <pills>"; anything else, an unknown allergen word, a pill whose colour class disagrees with its label, or a
    bracketed list on a may-contain pill (never seen: it would be dropped silently) raises GuideLayoutError."""
    name = card["name"]
    lines = card.get("allergen_lines") or []
    kinds = [ln["kind"] for ln in lines]
    if kinds not in ALG_SHAPES:
        raise GuideLayoutError(f"{name!r}: allergen lines {kinds} are not one of the shapes this reader knows {list(ALG_SHAPES)}")
    where = f"{name!r} (allergens)"
    contains: set = set()
    may: set = set()
    cereals: set = set()
    nuts: set = set()
    for ln in lines:
        kind = ln["kind"]
        if kind == "none":
            if ln["pills"]:
                raise GuideLayoutError(f"{name!r}: 'Contains no major allergens' is followed by allergens {ln['pills']}")
            continue
        if not ln["pills"]:
            raise GuideLayoutError(f"{name!r}: a {kind!r} allergen label with no allergen after it")
        for text, contains_class in ln["pills"]:
            if contains_class != (kind == "contains"):
                raise GuideLayoutError(f"{name!r}: allergen {text!r} is styled as {'contains' if contains_class else 'may contain'} "
                                       f"but sits under the {kind!r} label")
            m = ALG_PAREN.match(text)
            base, inner = (m.group(1), [x.strip() for x in m.group(2).split(",")]) if m else (text, [])
            keys, _, _ = _words([base], where)
            if len(keys) != 1:
                raise GuideLayoutError(f"{name!r}: allergen {text!r} does not name exactly one of the 14")
            if inner:
                if kind != "contains":
                    raise GuideLayoutError(f"{name!r}: a may-contain allergen {text!r} names kinds; this reader would drop them")
                if not all(inner):
                    raise GuideLayoutError(f"{name!r}: allergen {text!r} has an empty kind")
                ikeys, icereals, inuts = _words(inner, where)
                if ikeys != keys or not (icereals or inuts):
                    raise GuideLayoutError(f"{name!r}: the kinds in {text!r} are not kinds of {sorted(keys)}")
                cereals |= icereals
                nuts |= inuts
            (contains if kind == "contains" else may).update(keys)
    return {"contains": frozenset(contains), "may_contain": frozenset(may), "cereals": frozenset(cereals), "nuts": frozenset(nuts)}


def _alg_sig(a: dict) -> tuple:
    return tuple(tuple(sorted(a[k])) for k in ("contains", "may_contain", "cereals", "nuts"))


# ----------------------------------------------------------------------------------------------------------------------
# From parsed cards to a chain folder. The per-chain scripts only say WHICH menus count, how sections map to categories
# and what the chain is called; everything below is shared so all M&B brands are treated the same way.
# ----------------------------------------------------------------------------------------------------------------------
NOTE_CUT = re.compile(r"\s*(Click through to view.*|(?:Please|Also) (?:refer|see) .*)$", re.I)
# Animal-derived allergens that a dish the guide itself marks vegan (VE) or vegetarian (V) cannot print as contained.
VEGAN_ANIMAL = {"milk", "eggs", "fish", "crustaceans", "molluscs"}
VEGETARIAN_ANIMAL = {"fish", "crustaceans", "molluscs"}
FOOTNOTE_CUT = re.compile(r"\s\^\s.*$")
DIET_RE = re.compile(r"\s*\((V|VE|VG)\)", re.I)
MARKS_RE = re.compile(r"[*†‡#^▲​]+")

# Sections -> categories (first match wins). A section no rule matches stops the run so a person picks the category.
CATEGORY_RULES: list[tuple[str, str]] = [
    (r"afternoon tea|warm scones|savouries|mini cakes|gf mini cakes|gf warm scones", "Afternoon tea"),
    (r"tea & hot chocolate|drink|coffee|^teas$|juice|smoothie|beer|cider|cocktail|biscuit & syrups|^ddr$", "Drinks"),
    (r"dessert|pudding|sweet|cakes|pastries|something sweet|afters", "Desserts"),
    (r"breakfast|brunch|eggs|brioche|oats|^lunch$", "Breakfast & brunch"),
    (r"add.?ons?|add a little extra|extras|choices|accompaniment|carb and veg|sides & add|dips|dip it|bread & butter|haggis", "Add-ons"),
    (r"sides?|side dishes|on the side|nibbles|loaded waffle|for the table|bar snacks|snacks", "Sides & snacks"),
    (r"pizza|stone-baked", "Pizza"),
    (r"burger", "Burgers"),
    (r"salad", "Salads"),
    (r"sandwich|sarnies|baps|wraps", "Sandwiches"),
    (r"sunday|roast", "Sunday roasts"),
    (r"starters|small plates|sharing|sharers|to share|canapes|skewers|boards|festive small|large plates", "Starters & sharing"),
    (r"mains|classics|favourites|grill|butcher|from the sea|fish|pie|specials|fantastic|easy eats|create your own|set menu|feel-good|bbq|veggie|vegetarian|vegan|meat|lunch|hungry for more|premium|scotch pies|bang on|fixed price|signature|our ", "Mains"),
]
DISH_CATEGORIES = {"Mains", "Breakfast & brunch", "Starters & sharing", "Burgers", "Salads", "Sandwiches", "Pizza", "Sunday roasts", "Sides & snacks"}
NON_RANKABLE = {"Drinks", "Desserts", "Add-ons", "Afternoon tea"}  # sides and snacks stay rankable (playbook conventions)
PORK_RE = re.compile(r"\b(bacon|ham|gammon|pork|sausages?|chorizo|salami|pepperoni|prosciutto|pancetta|pigs? in blankets?|black pudding|nduja|chipolatas?|hog roast|crackling)\b", re.I)
BEEF_RE = re.compile(r"\b(beef|sirloin|rump|ribeye|rib-eye|brisket|wellington|chateaubriand)\b|"
                     r"(?<!lamb )(?<!gammon )(?<!salmon )(?<!tuna )(?<!cauliflower )(?<!swordfish )(?<!pork )(?<!chicken )(?<!turkey )"
                     r"(?<!duck )(?<!cod )(?<!veal )(?<!venison )(?<!halibut )\bsteak\b", re.I)
OTHER_PROTEIN = re.compile(r"\b(chicken|turkey|duck|lamb|fish|cod|haddock|salmon|prawns?|scampi|calamari|mussels?|crab|lobster|tuna|bass|"
                           r"scallops?|monkfish|goujons?|tenders?|nuggets?|halloumi|egg|eggs|mushroom|falafel|cheese|squid|sardines?|trout|mackerel)\b", re.I)
VEG_WORDS = re.compile(r"\b(vegan|veggie|vegetarian|plant|meat-free|meat free)\b", re.I)


class ChainScriptError(Exception):
    pass


# Dishes whose PRINTED allergen row contradicts the dish's own name or description, so the dish is not shown (a wrong "no gluten" is worse
# than a missing dish). Re-read 2026-10-08 against the rendered guide, with the guide's own words quoted; nothing is corrected or inferred.
# Keyed by chain id, then the published dish name in lower case. Dishes with an innocent reading stay (a vegan lasagne with no milk, "butterflied",
# a shepherd's pie topped with mash, oat lattes, rice-noodle Pad Thai). A name listed here that the guide no longer prints is reported by main_for.
ALLERGEN_HOLDBACKS: dict = {
    "all-bar-one": {
        "fish & chips": "allergen row contradicts the dish: the guide describes \"Battered haddock\" but its allergen row lists no gluten",
        "houmous & flatbread": "allergen row contradicts the dish: the guide's dish is houmous but its allergen row lists no sesame (not even as may contain)",
        "oyster mushroom tempura": "allergen row contradicts the dish: the guide names it tempura (a batter) but its allergen row lists no gluten",
    },
    "ember-inns": {
        "scrambled eggs on toast": "allergen row contradicts the dish: the guide describes \"white or wholemeal bloomer toast\" but its allergen row lists no gluten",
        "veg sticks & houmous": "allergen row contradicts the dish: the guide's dish is houmous but its allergen row says it contains no major allergens (no sesame)",
        "thick cut gammon steak": "allergen row contradicts the dish: the guide offers \"fried eggs\" with it but its allergen row says it contains no major allergens (no egg)",
        "grilled bacon chop": "allergen row contradicts the dish: the guide offers \"fried eggs\" with it but its allergen row says it contains no major allergens (no egg)",
        "cheeseburger sliders": "allergen row contradicts the dish: the guide serves it in \"brioche buns\" but its allergen row lists no egg (every other brioche dish in this guide lists egg)",
        "chicken burger sliders": "allergen row contradicts the dish: the guide serves it in \"brioche buns\" but its allergen row lists no egg or milk (every other brioche dish in this guide lists egg)",
    },
    # Browns' allergens are NOT published (its live guide no longer lists the menus the numbers came from); these apply if the 5 Oct 2026 copy is used.
    "browns": {
        "traditional fish & chips": "allergen row contradicts the dish: it is fish and chips but its allergen row lists no gluten",
        "battered haddock & peas": "allergen row contradicts the dish: the guide names it \"Battered Haddock\" but its allergen row lists no gluten",
        "pan-roasted cod": "allergen row contradicts the dish: the guide serves it with tartare sauce but its allergen row lists no egg",
    },
}


def clean_name(raw: str) -> tuple[str, str]:
    """('Oyster Mushroom Tempura (VE)* Click through ...') -> ('Oyster Mushroom Tempura', 'VE'). The second value is the guide's own
    diet mark: 'V', 'VE' or '' (VG counts as VE)."""
    n = FOOTNOTE_CUT.sub("", NOTE_CUT.sub("", raw))
    marks = [m.upper() for m in DIET_RE.findall(n)] or [m.upper() for m in re.findall(r"\s(VE|V)(?=[*†# ]*$)", n)]
    diet = "VE" if any(m in ("VE", "VG") for m in marks) else ("V" if marks else "")
    n = DIET_RE.sub("", n)
    n = re.sub(r"\s(V|VE)(?=[*†# ]*$)", "", n)
    n = MARKS_RE.sub("", n)
    n = re.sub(r"\s+", " ", n).strip(" -")
    return n, diet


def category_for(section: str, overrides: dict[str, str]) -> str | None:
    s = section.strip().lower()
    if s in overrides:
        return overrides[s]
    for pattern, cat in CATEGORY_RULES:
        if re.search(pattern, s):
            return cat
    return None


def _sig(n: dict) -> tuple:
    return tuple(n.get(k) for k in ("kcal", "fat", "sat", "carbs", "sugars", "protein", "salt"))


def _impossible(n: dict, category: str = "") -> str:
    """Reason a printed row cannot be a real per-portion value (empty string if it can). Never corrects anything."""
    vals = n

    def f(key):
        try:
            return float(str(vals[key]).lstrip("<"))
        except (KeyError, ValueError):
            return None
    fat, sat, carb, sug = f("fat"), f("sat"), f("carbs"), f("sugars")
    if fat is not None and sat is not None and sat > fat * 1.06 + 0.1:
        return f"guide prints saturates {n['sat']} g greater than total fat {n['fat']} g"
    if carb is not None and sug is not None and sug > carb * 1.06 + 0.1:
        return f"guide prints sugars {n['sugars']} g greater than carbohydrate {n['carbs']} g"
    prot, kcal = f("protein"), f("kcal")
    if category != "Drinks" and None not in (fat, carb, prot, kcal):  # drinks can hold alcohol energy that the macros don't show
        macro = 4 * prot + 4 * carb + 9 * fat
        if abs(kcal - macro) > 100 and abs(kcal - macro) / max(kcal, macro) > 0.4:
            return f"guide prints {n['kcal']} kcal; its own protein, carbohydrate and fat add up to about {round(macro)} kcal"
    return ""


def extract_items(html: str, *, menus: dict[str, dict], excluded_menus: dict[str, str], category_overrides: dict[str, str] | None = None,
                  row_exclusions=None, no_desc_sections: dict[str, str] | None = None, name_categories: dict[str, str] | None = None,
                  allergen_holdbacks: dict[str, str] | None = None) -> dict:
    """Turn a parsed guide into item dicts. Returns {"items", "holdback", "log", "stamp", "ambiguous"}: nothing is written here.

    menus: title -> {"category": forced category (optional), "label": suffix for names that clash with the standard menu,
    "limited": bool}. Titles in neither `menus` nor `excluded_menus` stop the run (the guide gained a menu)."""
    page = parse_page(html)
    overrides = {k.lower(): v for k, v in (category_overrides or {}).items()}
    known = set(menus) | set(excluded_menus)
    unknown = sorted({m["title"] for m in page["menus"] if m["title"] not in known})
    if unknown:
        raise ChainScriptError(f"menus in the guide that this script does not know (decide include/exclude): {unknown}")
    log: collections.Counter = collections.Counter()
    records: dict = collections.OrderedDict()
    for card in page["cards"]:
        title = card["menu"]
        if title in excluded_menus:
            log[f"menu excluded: {excluded_menus[title]} [{title}]"] += 1
            continue
        rule = menus[title]
        if not card["nutrition_rows"]:
            log["no nutrition table printed (drinks, cocktails, a few dishes)"] += 1
            continue
        name, diet = clean_name(card["name"])
        if not name:
            raise ChainScriptError(f"empty name for card {card['name']!r}")
        reason = row_exclusions(name, card) if row_exclusions else None
        if reason:
            log[reason] += 1
            continue
        nut = read_nutrition(card)
        if any(str(v).startswith("-") for v in nut.values()):
            log["row with negative numbers (a swap difference between two dishes, not a dish)"] += 1
            continue
        alg = read_allergens(card)  # a dish whose numbers parsed but whose allergens did not stops the run
        category = category_for(card["section"], overrides)
        if category is None:
            raise ChainScriptError(f"no category for section {card['section']!r} (menu {title!r}): add it to category_overrides")
        if rule.get("category") and category.lstrip("~") in DISH_CATEGORIES:
            category = rule["category"]  # e.g. every dish of the Small Appetites menu; its drinks, desserts and add-ons keep theirs
        if not card["desc"].strip() and card["section"].strip().lower() in (no_desc_sections or {}):
            category = no_desc_sections[card["section"].strip().lower()]
        if re.match(r"(add|extra|upgrade|double up)\b", name, re.I):
            category = "Add-ons"
        if name.lower() in (name_categories or {}):
            category = name_categories[name.lower()]
        key = (name.lower(), re.sub(r"\s+", " ", card["desc"]).strip().lower())
        rec = records.setdefault(key, {"name": name, "desc": card["desc"], "entries": []})
        rec["entries"].append({"menu": title, "section": card["section"], "category": category, "veg": bool(diet), "diet": diet, "nut": nut,
                               "label": rule.get("label", ""), "limited": rule.get("limited", False),
                               "choices": bool(NOTE_CUT.search(card["name"])), "alg": alg,
                               "choice_note": (NOTE_CUT.search(card["name"]).group(1).strip() if NOTE_CUT.search(card["name"]) else "")})
    # 1. one product per (name+description, label group, numbers); a dish printed in several menus with the same numbers is one item
    products: list[dict] = []
    ambiguous: list = []
    for rec in records.values():
        groups: dict[str, dict] = collections.OrderedDict()
        for e in rec["entries"]:
            groups.setdefault(e["label"], collections.OrderedDict()).setdefault(_sig(e["nut"]), []).append(e)
        for label, by_sig in groups.items():
            ignored: list = []  # entries whose numbers were set aside for the primary menu's; their allergens must still agree
            if len(by_sig) > 1:
                # other menus print other numbers for the same dish: if the primary menu(s) print exactly one set, use it
                prim = {sg for sg, es in by_sig.items() if any(menus[e["menu"]].get("primary") for e in es)}
                if len(prim) == 1:
                    sg = next(iter(prim))
                    log["same name printed with other numbers in a non-primary menu: the primary menu's numbers are used, the others ignored"] += len(by_sig) - 1
                    ignored += [e for sg2, es in by_sig.items() if sg2 != sg for e in es]
                    by_sig = {sg: by_sig[sg]}
            if len(by_sig) > 1:
                # the same dish in different sections (a starter portion and a side portion): the section tells them apart
                secs = [sec for es in by_sig.values() for sec in {e["section"] for e in es}]
                diets = [{e["diet"] for e in es} for es in by_sig.values()]
                if len(secs) == len(set(secs)) or (all(len(d) == 1 for d in diets) and len({next(iter(d)) for d in diets}) == len(diets)):
                    for sg, es in by_sig.items():
                        products.append({"name": rec["name"], "desc": rec["desc"], "label": label, "sig": sg, "entries": es, "ignored": []})
                    continue
            if len(by_sig) > 1:
                ambiguous.append((rec["name"], label, [(e["menu"], e["section"], _sig(e["nut"])) for g in by_sig.values() for e in g]))
                log["same name and description printed with different numbers in the same kind of menu (cannot tell them apart): not published"] += 1
                continue
            (sig, ents), = by_sig.items()
            products.append({"name": rec["name"], "desc": rec["desc"], "label": label, "sig": sig, "entries": ents, "ignored": ignored})
    merged: dict = collections.OrderedDict()
    for pr in products:  # the same dish with the same numbers in different menus is one item (a label is kept only if every menu has one)
        k = (pr["name"].lower(), pr["sig"])
        if k in merged:
            merged[k]["entries"].extend(pr["entries"])
            merged[k]["ignored"].extend(pr["ignored"])
            if not pr["label"]:
                merged[k]["label"] = ""
        else:
            merged[k] = pr
    products = list(merged.values())
    # 2. two different products with the same printed name: tell them apart with the guide's own words, never by guessing
    def groups_by_name():
        gb: dict[str, list] = collections.defaultdict(list)
        for pr in products:
            gb[pr["name"].lower()].append(pr)
        return [g for g in gb.values() if len(g) > 1]
    for group in groups_by_name():  # round 1: the menu a portion comes from (Children's, Afternoon Tea ...)
        for pr in group:
            if pr["label"]:
                pr["name"] = f"{pr['name']} ({pr['label']})"
    for group in groups_by_name():  # round 1b: the section each portion is printed in, when the sections differ
        secs = [{e["section"].strip().lower() for e in pr["entries"]} for pr in group]
        if all(secs) and sum(len(x) for x in secs) == len(set().union(*secs)):
            for pr in group:
                sec = " ".join(pr["entries"][0]["section"].split())
                pr["name"] = f"{pr['name']} ({sec.title() if sec.isupper() else sec})"
    for group in groups_by_name():  # round 1c: the guide's own vegan mark when the others are not
        if len({pr["entries"][0]["diet"] for pr in group}) > 1:
            for pr in group:
                if pr["entries"][0]["diet"] == "VE":
                    pr["name"] = f"{pr['name']} (vegan)"
    for group in groups_by_name():  # round 2: the accompaniment / choice the guide prints under the dish name
        for pr in group:
            d = pr["desc"].strip(" .")
            m = re.search(r"\bwith\b[^:]*$", d, re.I)
            extra = m.group(0).strip(" .") if m else (d if d and len(d) <= 60 and "," not in d else "")
            if not extra or len(extra) > 45:
                continue
            if m:
                pr["name"] = f"{pr['name']} {extra}"
            elif pr["name"].endswith(")"):
                pr["name"] = f"{pr['name'][:-1]}, {extra})"
            else:
                pr["name"] = f"{pr['name']} ({extra})"
    for group in groups_by_name():  # round 3: still cannot be told apart: none of them is published
        for pr in group:
            ambiguous.append((pr["name"], pr["label"], [(e["menu"], e["section"], pr["sig"]) for e in pr["entries"]]))
            log["different numbers under one name that the guide gives no way to tell apart: not published"] += 1
        drop = {id(pr) for pr in group}
        products = [pr for pr in products if id(pr) not in drop]
    # 3. allergens must agree: one dish printed in several menus (or with other numbers in a menu we set aside) has ONE allergen row
    consistent, conflicts = [], []
    for pr in products:
        sigs = {_alg_sig(e["alg"]) for e in pr["entries"]}
        other = {_alg_sig(e["alg"]) for e in pr["ignored"]} - sigs
        if len(sigs) > 1 or other:
            conflicts.append((pr["name"], sorted({f"{e['menu']} / {e['section']}" for e in pr["entries"] + pr["ignored"]})))
            log["same dish printed with different allergens in different menus (no single row is true for all): not published"] += 1
        else:
            consistent.append(pr)
    products = consistent
    # 4. rows
    items, holdback = [], []
    used_ids: dict[str, int] = {}
    reviewed = {k.lower(): v for k, v in (allergen_holdbacks or {}).items()}
    used_reviewed: set = set()
    for pr in products:
        ents = pr["entries"]
        first = ents[0]
        nut = first["nut"]
        base = slug(pr["name"])
        n_used = used_ids.get(base, 0)
        used_ids[base] = n_used + 1
        item_id = base if n_used == 0 else f"{base}-{n_used + 1}"
        veg = any(e["veg"] for e in ents) or bool(re.search(r"\b(vegetarian|vegan|veggie)\b", pr["name"], re.I))
        text = f"{pr['name']} {pr['desc']}"
        tags = []
        if veg:
            tags.append("vegetarian")
        elif not VEG_WORDS.search(pr["name"]):
            # "vegan sausages" / "veggie burger" in a description are not pork or beef
            plain = re.sub(r"\b(vegan|veggie|vegetarian|plant-based|meat-free)\s+(?:\w+\s+){0,2}?(sausages?|bacon|burgers?|chorizo|ham|mince|chicken|beef|pork|steak|brisket)\b", "", text, flags=re.I)
            if PORK_RE.search(plain):
                tags.append("contains_pork")
            if BEEF_RE.search(plain):
                tags.append("contains_beef")
        note = f"{first['menu']} / {first['section']}"
        if len(ents) > 1:
            note += f" (+{len(ents) - 1} more menu entries, same numbers)"
        if any(e["choices"] for e in ents):
            note += "; the guide flags this dish as having choices (its numbers may not include them)"
        try:
            kj, kc = float(nut["kj"]), float(nut["kcal"])
            if kc >= 20 and not (3.9 <= kj / kc <= 4.5):
                note += f"; printed kJ {nut['kj']} and kcal {nut['kcal']} do not agree"
        except (KeyError, ValueError, ZeroDivisionError):
            pass
        cat = next((e["category"] for e in ents if not e["category"].startswith("~")), first["category"]).lstrip("~")
        alg = first["alg"]
        reasons = []
        choice_notes = sorted({e["choice_note"] for e in ents if e["choices"]})
        if choice_notes:
            reasons.append(f"the guide prints \"{choice_notes[0].rstrip('. ')}\" beside this dish: its allergen row leaves out the choices, "
                           f"so it is not shown as a complete list")
        if pr["name"].lower() in reviewed:
            reasons.append(reviewed[pr["name"].lower()])
            used_reviewed.add(pr["name"].lower())
        diets = {e["diet"] for e in ents}
        if "VE" in diets and alg["contains"] & VEGAN_ANIMAL:
            reasons.append(f"the guide marks this dish vegan (VE) but its own allergen row says it contains {', '.join(sorted(alg['contains'] & VEGAN_ANIMAL))}")
        elif diets & {"V", "VE"} and alg["contains"] & VEGETARIAN_ANIMAL:
            reasons.append(f"the guide marks this dish vegetarian but its own allergen row says it contains {', '.join(sorted(alg['contains'] & VEGETARIAN_ANIMAL))}")
        item = {
            "id": item_id, "name": pr["name"], "category": cat, "serving": "", "calories": nut["kcal"], "protein_g": nut["protein"],
            "carbs_g": nut["carbs"], "fat_g": nut["fat"], "sat_fat_g": nut["sat"], "sodium_mg": "", "salt_g": nut["salt"],
            "sugar_g": nut["sugars"], "fiber_g": "", "tags": "|".join(tags),
            "limited_time": all(e["limited"] for e in ents), "rankable": cat not in NON_RANKABLE,
            "notes": note, "_desc": pr["desc"],
            "allergens": {"contains": set(alg["contains"]), "may_contain": set(alg["may_contain"]),
                          "cereals": set(alg["cereals"]), "nuts": set(alg["nuts"])},
        }
        items.append(item)
        bad = _impossible(nut, cat)
        if bad:
            reasons.insert(0, bad)
        if reasons:
            holdback.append((item_id, "; ".join(reasons)))
    may_printed = any(ln["kind"] == "may" for c in page["cards"] for ln in c["allergen_lines"])
    return {"items": items, "holdback": holdback, "log": log, "stamp": page["stamp"], "ambiguous": ambiguous,
            "allergen_conflicts": conflicts, "may_contain_published": may_printed,
            "unused_allergen_holdbacks": sorted(set(reviewed) - used_reviewed)}


def default_row_exclusions(name: str, card: dict) -> str | None:
    """Rows that are choices of another dish rather than something you order on its own."""
    n = name.lower()
    if n.startswith(("with ", "swap", "or ", "add on/select option", "select ")) or re.search(r"\bchoice\b", n):
        return "choice/swap row ('With ...', 'Swap ...', '... choice', 'Add on/select option ...'): no dish name, only meaningful beside its dish"
    return None


def sha_of(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main_for(*, chain_id: str, chain_name: str, cuisine: str, aliases: list[str], source_url: str, brand_label: str, menus: dict,
             excluded_menus: dict, category_overrides: dict | None = None, row_exclusions=default_row_exclusions, note: str = "",
             expected_brand_stamp: str = "", no_desc_sections: dict | None = None,
             name_categories: dict | None = None, allergen_holdbacks: dict | None = None) -> int:
    ap = argparse.ArgumentParser(description=f"Build data/source/{chain_id}/ from the M&B allergen guide ({source_url})")
    ap.add_argument("html", type=Path, help="the downloaded guide page")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the guide was downloaded")
    ap.add_argument("--out", type=Path, default=None, help="output folder (default data/source/<id>)")
    args = ap.parse_args()
    html = args.html.read_text(encoding="utf-8")
    try:
        res = extract_items(html, menus=menus, excluded_menus=excluded_menus, category_overrides=category_overrides,
                            row_exclusions=row_exclusions, no_desc_sections=no_desc_sections,
                            name_categories={k.lower(): v for k, v in (name_categories or {}).items()},
                            allergen_holdbacks={**ALLERGEN_HOLDBACKS.get(chain_id, {}), **(allergen_holdbacks or {})})
    except (GuideLayoutError, ChainScriptError) as e:
        print(f"{chain_id}: stopped. The guide no longer matches this script: {e}", file=sys.stderr)
        return 1
    stamp = res["stamp"]
    if expected_brand_stamp and not stamp.startswith(expected_brand_stamp):
        print(f"the page is stamped {stamp!r}, expected it to start with {expected_brand_stamp!r}", file=sys.stderr)
        return 1
    m = re.search(r"(\d{4}-\d{2}-\d{2})", stamp)
    page_date = m.group(1) if m else "undated"
    items = res["items"]
    for it in items:
        it.pop("_desc", None)
    # all or nothing (docs/DATA.md "Allergens"): every published item has a row copied from the guide, or the run stops
    missing = [it["name"] for it in items if not isinstance(it.get("allergens"), dict)]
    if missing:
        print(f"{chain_id}: stopped. {len(missing)} published items have no allergen row (e.g. {missing[:3]}): not writing a partial list", file=sys.stderr)
        return 1
    guide_title = f"{brand_label} Allergen & Nutrition Guide, Mitchells & Butlers (page stamped {page_date})"
    out = write_chain_folder(
        chain_id=chain_id, name=chain_name, cuisine=cuisine, source_title=guide_title,
        source_url=source_url, checked_on=args.checked_on, aliases=aliases, items=items, out=args.out, note=note,
        holdback=res["holdback"],
        # every item carries its printed allergens, so allergens.csv is written beside allergen_guide.csv (see the module docstring)
        allergen_guide={"title": guide_title, "url": source_url, "checked_on": args.checked_on,
                        "may_contain_published": bool(res["may_contain_published"])})
    print(f"wrote {len(items)} items ({len(res['holdback'])} held back) to {out}; page stamp {stamp!r}; sha256 {sha_of(args.html)}")
    print(f"  {sum('flags this dish as having choices' in i['notes'] for i in items)} published items are dishes the guide flags as having choices")
    for reason, n in sorted(res["log"].items()):
        print(f"  left out {n:4d} rows: {reason}")
    for name, label, ents in res["ambiguous"]:
        print(f"  ambiguous {name!r} [{label}]: {ents}")
    for name in res["unused_allergen_holdbacks"]:
        print(f"  note: the reviewed allergen holdback for {name!r} matched no dish in this page (the guide changed?): re-check it")
    for name, where in res["allergen_conflicts"]:
        print(f"  allergens differ between menus, not published: {name!r} in {where}")
    n_alg = sum(1 for it in items if it["allergens"]["contains"] or it["allergens"]["may_contain"])
    print(f"  allergens copied for all {len(items)} published items ({n_alg} list at least one; may-contain printed by the guide: {res['may_contain_published']})")
    return 0
