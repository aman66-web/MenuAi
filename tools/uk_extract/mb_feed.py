"""Shared reader for the Mitchells & Butlers (M&B) menu feed. Used by harvester.py, toby_carvery.py, miller_and_carter.py,
vintage_inns.py, sizzling_pubs.py and stonehouse.py (see docs/UK_DATA_PLAYBOOK.md).

Each M&B brand site shows its menu with a <mab-menu> component that loads ONE JSON document:
    https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=<brand or venue id>&websitePageUrlPath=main-menu1
        &idType=Brand|TradingEntity&salesChannel=DynamicWebMenus
(no key or login). vintageinn.co.uk also embeds the same document in its HTML as window.__REACT_QUERY_STATE__, so
`load_menu` accepts the JSON file or that HTML page.

Shape: sections[] -> menuItems[] and subSections[] -> menuItems[]. Every menu item has portions[] (exactly one here); a
portion has `nutrition` (strings: energyKcalPerPortion, fatGPerPortion, saturatedFatGPerPortion, carbohydrateGPerPortion,
sugarGPerPortion, proteinGPerPortion, saltGPerPortion; kJ and per-100g values are not used) and `choices` (the options the
menu offers for that dish: a side, sauce, topping or swap). ONLY the dish's own top-level `nutrition` is read; the options
nested under `choices` are never added in, and their numbers are never used (swap options carry differences, even negative
ones, not their own values).

Numbers are copied as the feed prints them ("744.9625"); the pipeline does the rounding for display. Nothing here converts,
rounds, adds up or estimates. Fibre and sodium are not in the feed and are left blank.

Allergens (docs/DATA.md "Allergens"): every menu item also carries `allergens`, a map of the feed's allergen keys to
"contains" or "mayContain" (e.g. {"gluten": "contains", "wheat": "contains", "treeNut": "mayContain"}); the brand's menu page
shows these when a dish is opened. As with the numbers, ONLY the dish's own top-level map is read: a side, sauce or topping
chosen under `choices` is not added in. An empty map means the feed marks none of the 14 for that dish. Keys are mapped by
common.allergen_words (plus FEED_ALLERGEN_WORDS below); an unknown key or value stops the run. Cereals (wheat, barley, rye,
oats) are recorded only where the feed marks them "contains"; the feed names no individual tree nuts. If any published item
has no `allergens` map at all, the chain gets only allergen_guide.csv (the app then links to the menu instead of listing them).

What a chain script decides by hand (all in its own file): which section/sub-section becomes which category, which lines are
not menu items (swap/upgrade differences, placeholders with no values), which items are held back as impossible, and notes.
Anything the script has not been told about stops it (see `build`), so a human re-checks after a menu change.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
API = "https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic"
NUMBER_RE = re.compile(r"^\d+(\.\d+)?$")

# feed key -> items.csv column
NUTRITION_KEYS = {
    "energyKcalPerPortion": "calories",
    "proteinGPerPortion": "protein_g",
    "carbohydrateGPerPortion": "carbs_g",
    "fatGPerPortion": "fat_g",
    "saturatedFatGPerPortion": "sat_fat_g",
    "sugarGPerPortion": "sugar_g",
    "saltGPerPortion": "salt_g",
}


# ---------------------------------------------------------------- reading the feed

def fetch(url: str, dest: Path) -> Path:
    """One polite GET (a normal browser user agent, no tricks) saved to `dest`."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/html"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
    except urllib.error.HTTPError as err:
        raise SystemExit(f"{url} answered HTTP {err.code}. Not trying to get round it: download the file yourself "
                         "(a normal browser, or one plain curl request) and pass it as the first argument instead.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def load_menu(path: Path) -> dict:
    text = Path(path).read_text(encoding="utf-8")
    if text.lstrip().startswith("{"):
        return json.loads(text)
    marker = "window.__REACT_QUERY_STATE__ = "
    start = text.find(marker)
    if start < 0:
        raise SystemExit(f"{path}: neither a menu JSON document nor a page with window.__REACT_QUERY_STATE__.")
    state, _ = json.JSONDecoder().raw_decode(text[start + len(marker):])
    for q in state.get("queries", []):
        data = q.get("state", {}).get("data")
        if isinstance(data, dict) and "sections" in data:
            return data
    raise SystemExit(f"{path}: the embedded page state holds no menu.")


def squash(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


@dataclass
class Entry:
    section: str            # normalised section name
    sub: str | None         # normalised sub-section name (None = directly under the section)
    raw: str                # the item's name exactly as the feed gives it (whitespace squashed)
    item: dict
    description: str = ""


def entries(menu: dict) -> list[Entry]:
    """Every top-level menu item in menu order (sections first, then their sub-sections). Choices are not entered."""
    out: list[Entry] = []

    def add(section: str, sub: str | None, items: list[dict]) -> None:
        for it in items:
            out.append(Entry(section, sub, squash(it["name"]), it, squash(it.get("guestFacingDescriptionDigital"))))

    def walk_sub(section: str, sub: dict) -> None:
        add(section, squash(sub["name"]), sub.get("menuItems", []))
        for deeper in sub.get("subSections", []) or []:
            walk_sub(section, deeper)

    for s in menu["sections"]:
        name = squash(s["name"])
        add(name, None, s.get("menuItems", []))
        for sub in s.get("subSections", []) or []:
            walk_sub(name, sub)
    return out


def printed_nutrition(entry: Entry) -> tuple[dict, str] | None:
    """The dish's own per-portion values as printed (plus its printed kJ, kept only to flag disagreements), or None when the
    feed has none. Stops on anything unexpected."""
    portions = entry.item.get("portions") or []
    if len(portions) != 1:
        raise SystemExit(f"{entry.raw!r} has {len(portions)} portions; this reader expects exactly one. Re-check the feed.")
    nut = portions[0].get("nutrition")
    if not nut:
        return None
    out = {}
    for key, col in NUTRITION_KEYS.items():
        val = str(nut.get(key, "")).strip()
        if not NUMBER_RE.match(val):
            raise SystemExit(f"{entry.raw!r}: {key} is {val!r}, not a plain non-negative number (a swap line or a feed change?).")
        out[col] = val
    return out, str(nut.get("energyKjPerPortion", "")).strip()


# The feed's own allergen keys that common.allergen_words does not already know (lower-cased): "treeNut".
FEED_ALLERGEN_WORDS = {"treenut": ("nuts", None)}
ALLERGEN_VALUES = ("contains", "mayContain")


def printed_allergens(entry: Entry) -> dict | None:
    """The dish's own allergens as the feed marks them: {"contains", "may_contain", "cereals", "nuts"}; None when the item
    carries no allergen map at all (then the chain cannot be complete). Stops on an unknown key or value."""
    marks = entry.item.get("allergens")
    if marks is None:
        return None
    if not isinstance(marks, dict):
        raise SystemExit(f"{entry.raw!r}: allergens is {marks!r}, not a map of allergen -> 'contains'/'mayContain'.")
    words: dict[str, list[str]] = {v: [] for v in ALLERGEN_VALUES}
    for key, value in marks.items():
        if value not in words:
            raise SystemExit(f"{entry.raw!r}: allergen {key!r} is marked {value!r}; this reader knows only {ALLERGEN_VALUES}.")
        words[value].append(key)
    where = f"{entry.raw!r} (feed allergens)"
    contains, cereals, nuts = allergen_words(words["contains"], where, extra=FEED_ALLERGEN_WORDS)
    may, _, _ = allergen_words(words["mayContain"], where, extra=FEED_ALLERGEN_WORDS)
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


# ---------------------------------------------------------------- names and tags

_SUPPLEMENT = re.compile(r"\.\s*£\d+(\.\d+)?\s*supplement", re.I)
_DIET = re.compile(r"\s*\((?:GF|V|VE)\)", re.I)
_TRAILING_DIET = re.compile(r"\s+(?:GF|V|VE)$")
_SHARE = re.compile(r"\s*\(?\bfor two to share\b\)?", re.I)


def clean_name(raw: str) -> tuple[str, str]:
    """-> (name, serving). Drops the chain's footnote marks (* † # °), (V)/(VE)/(GF) labels (V/VE become tags), trademark
    signs and a '. £1 supplement' price; 'for two to share' moves to `serving` (it is the chain's own statement)."""
    name = squash(raw)
    serving = ""
    if _SHARE.search(name):
        serving = "For two to share"
        name = _SHARE.sub("", name)
    name = _SUPPLEMENT.sub("", name)
    name = _DIET.sub("", name)
    name = _TRAILING_DIET.sub("", name)
    name = re.sub(r"[*†°®™]", "", name).replace("#", "")
    name = squash(name)
    if name.isupper() and len(name) > 4:   # SHOUTED headings only; 'BBQ' stays as printed
        name = name.title()
    return name, serving


def is_vegetarian(item: dict, raw: str) -> bool:
    c = item.get("claims") or {}
    marked = bool(re.search(r"\((?:V|VE)\)|\s(?:V|VE)$", raw))
    return bool(c.get("madeWithVegetarianIngs") or c.get("madeWithVeganIngs") or marked)


PORK = re.compile(r"\b(bacon|ham|gammon|pork|sausages?|chorizo|pepperoni|salami|pancetta|pigs in blankets|riblets|boar|"
                  r"prosciutto|nduja|bangers?)\b", re.I)
BEEF = re.compile(r"\b(beef|(?<!gammon )steaks?|sirloin|(?<!lamb )rump|rib-?eye|fillet steak|brisket|t-bone|porterhouse|chateaubriand|wagyu|"
                  r"filet mignon|short rib|bone marrow)\b", re.I)
# Words that say what the meat is when it is neither pork nor beef; used only to list "meat type not stated".
OTHER_PROTEIN = re.compile(r"\b(chicken|turkey|lamb|duck|fish|salmon|cod|haddock|scampi|prawns?|calamari|scallops?|lobster|"
                           r"sea bass|seabass|anchov\w+|halloumi|mushroom|veg\w*|cheese|egg|tuna|crab|squid)\b", re.I)
AMBIGUOUS_MEAT = re.compile(r"\b(ribs?|mince|meatballs?|bolognese|ragu)\b", re.I)   # a meat dish that never says which meat
VEGGIE_BURGER = re.compile(r"\b(plant|beyond|fable|veggie|vegan)\b", re.I)


def auto_note(item: dict, nut: dict, kj: str) -> str:
    """Odd things worth knowing (the notes column is not exported): kJ that disagrees with kcal, and the menu's choices."""
    parts = []
    try:
        kcal, kjf = float(nut["calories"]), float(kj)
        if kcal >= 50 and abs(kjf / 4.184 - kcal) / kcal > 0.15:
            parts.append(f"Feed kJ ({kj}) does not match its kcal ({nut['calories']}); kJ is not used")
    except ValueError:
        pass
    names = [squash(c.get("name")) for p in item.get("portions", []) for c in p.get("choices", [])]
    if names:
        parts.append("Menu choices not added in: " + "; ".join(dict.fromkeys(names)))
    return ". ".join(parts)


def meat_tags(name: str, description: str, vegetarian: bool) -> list[str]:
    """contains_pork / contains_beef only when the item's own name or description says so (playbook rule)."""
    if vegetarian:
        return []
    text = f"{name} {description}"
    tags = []
    if PORK.search(text) and not re.search(r"\bno pork\b", text, re.I):
        tags.append("contains_pork")
    if BEEF.search(text) and not VEGGIE_BURGER.search(name):
        tags.append("contains_beef")
    return tags


# ---------------------------------------------------------------- chain description

@dataclass
class Place:
    """Where a section / sub-section goes: its category, a short label used only to tell same-named items apart, whether
    its items may be suggested by "Best for you", and whether a missing meat type is worth listing in the report."""
    category: str
    label: str = ""
    rankable: bool = True
    meat: bool = True


@dataclass
class Chain:
    chain_id: str
    name: str
    cuisine: str
    aliases: list[str]
    source_url: str
    source_title_prefix: str                       # e.g. "Harvester online main menu with nutrition"
    places: dict[tuple[str, str | None], Place]    # (section, sub) -> Place; sub None = items directly under the section
    expected_entries: int                          # top-level items in the feed on the day it was reviewed
    not_items: dict[tuple[str, str | None], str] = field(default_factory=dict)  # whole sub-sections that are not menu items
    moves: dict[str, Place] = field(default_factory=dict)    # clean name -> Place, for an item that sits under the wrong heading
    rename: dict[str, str] = field(default_factory=dict)     # clean name (or "Category|clean name") -> clearer name from the menu's own heading
    skip: dict[str, str] = field(default_factory=dict)       # name (or "Category|name") -> why it is left out
    holdback: dict[str, str] = field(default_factory=dict)   # clean name (or "Category|clean name") -> why it is held back
    rankable: dict[str, bool] = field(default_factory=dict)  # clean-name overrides of the section default
    serving: dict[str, str] = field(default_factory=dict)    # clean name -> serving text the menu states
    notes: dict[str, str] = field(default_factory=dict)      # clean name -> note for the notes column (not exported)
    tag_fixes: dict[str, list[str]] = field(default_factory=dict)  # clean name -> full tag list, after human review
    limited: set[str] = field(default_factory=set)
    note_txt: str = ""
    shared_menu_note: str = ""


def _key(category: str, name: str, table: dict) -> str | None:
    for k in (f"{category}|{name}", name):
        if k in table:
            return k
    return None


def build(chain: Chain, menu: dict, *, checked_on: str, out: Path | None, source_file: Path | None = None) -> dict:
    """Turn the feed into data/source/<id>/. Returns a report dict (also used by the spot check)."""
    ents = entries(menu)
    if len(ents) != chain.expected_entries:
        raise SystemExit(f"The feed has {len(ents)} menu items but this script was reviewed against {chain.expected_entries}. "
                         "The menu changed: re-check the sections, names and exclusions in the script before running again.")
    unknown = sorted({(e.section, e.sub) for e in ents} - set(chain.places) - set(chain.not_items), key=str)
    if unknown:
        raise SystemExit("New or renamed menu sections the script does not know (decide a category for each):\n  "
                         + "\n  ".join(map(str, unknown)))

    skipped: list[tuple[str, str]] = []
    rows: list[dict] = []
    seen_keys: set[str] = set()      # every spelling a script table may use to point at an entry
    for e in ents:
        loc = (e.section, e.sub)
        name, serving = clean_name(e.raw)
        cat = chain.places[loc].category if loc in chain.places else ""
        seen_keys.update({name, f"{cat}|{name}"})
        rn = _key(cat, name, chain.rename)
        if rn:
            name = chain.rename[rn]
            seen_keys.update({name, f"{cat}|{name}"})
        if loc in chain.not_items:
            skipped.append((e.raw, chain.not_items[loc]))
            continue
        place = chain.moves.get(name, chain.places[loc])
        got = printed_nutrition(e)
        sk = _key(place.category, name, chain.skip)
        if got is None:
            skipped.append((e.raw, "the feed has no nutrition values for it"))
            continue
        nut, kj = got
        if sk:
            skipped.append((e.raw, chain.skip[sk]))
            continue
        veg = is_vegetarian(e.item, e.raw)
        vegan = bool((e.item.get("claims") or {}).get("madeWithVeganIngs") or re.search(r"\(VE\)", e.raw))
        tags = (["vegetarian"] if veg else []) + meat_tags(name, e.description, veg)
        tf = _key(place.category, name, chain.tag_fixes)
        if tf:
            tags = list(chain.tag_fixes[tf])
        rk = _key(place.category, name, chain.rankable)
        rows.append({
            "name": name, "category": place.category, "label": place.label or place.category, "raw": e.raw,
            "section": e.section, "sub": e.sub, "serving": chain.serving.get(name, serving),
            "rankable": chain.rankable[rk] if rk else place.rankable, "meat": place.meat,
            "tags": tags, "description": e.description, "nut": nut, "veg": veg, "vegan": vegan,
            "limited": name in chain.limited, "clean": name,
            "auto_note": auto_note(e.item, nut, kj), "allergens": printed_allergens(e),
        })

    # Identical repeats (the same dish listed under several headings with the same numbers) are one item.
    kept: list[dict] = []
    seen: dict[tuple, dict | None] = {}
    for r in rows:
        k = (r["name"], tuple(r["nut"].values()))
        if k in seen:
            if seen[k] != r["allergens"]:
                raise SystemExit(f"{r['name']!r} is listed twice with the same numbers but different allergens "
                                 f"({seen[k]} / {r['allergens']}): re-check the feed before publishing either.")
            continue
        seen[k] = r["allergens"]
        kept.append(r)
    dropped_repeats = len(rows) - len(kept)

    # Same name, different numbers: tell them apart with the heading they sit under, else with vegan/vegetarian.
    by_name: dict[str, list[dict]] = {}
    for r in kept:
        by_name.setdefault(r["name"].lower(), []).append(r)
    for group in by_name.values():
        if len(group) == 1:
            continue
        name = group[0]["name"]
        labels = [r["label"] for r in group]
        diets = ["vegan" if r["vegan"] else "vegetarian" if r["veg"] else "" for r in group]
        if len(set(labels)) == len(group):
            suffixes = labels
        elif len(set(diets)) == len(group) and all(diets):
            suffixes = diets
        else:
            raise SystemExit(f"{name!r} appears {len(group)} times with different numbers and the headings "
                             f"{labels} do not tell them apart: give the sections different labels in the script.")
        for r, suf in zip(group, suffixes):
            r["name"] = f"{name} ({suf})"
    ids = [slug(r["name"]) for r in kept]
    clash_ids = {i for i in ids if ids.count(i) > 1}
    if clash_ids:
        raise SystemExit(f"Two names make the same id: {sorted(clash_ids)}")

    items, holdback = [], []
    used_holdback: set[str] = set()
    for r, item_id in zip(kept, ids):
        it = {"id": item_id, "name": r["name"], "category": r["category"], "serving": r["serving"],
              "tags": "|".join(r["tags"]), "limited_time": r["limited"], "rankable": r["rankable"],
              "notes": ". ".join(x for x in (chain.notes.get(r["name"], chain.notes.get(r["clean"], "")), r["auto_note"]) if x),
              "allergens": r["allergens"], **r["nut"]}
        items.append(it)
        for k in (r["name"], f"{r['category']}|{r['name']}", r["clean"], f"{r['category']}|{r['clean']}"):
            if k in chain.holdback:
                holdback.append((item_id, chain.holdback[k]))
                used_holdback.add(k)
                break
    seen_keys.update(i["name"] for i in items)
    renamed_from = [k for k in chain.rename if k.split("|")[-1] not in seen_keys]
    if renamed_from:
        raise SystemExit(f"rename: these entries match no item in the feed (renamed or removed?): {renamed_from}")
    for table_name in ("moves", "skip", "rankable", "serving", "tag_fixes", "notes"):
        missing = [k for k in getattr(chain, table_name) if k not in seen_keys]
        if missing:
            raise SystemExit(f"{table_name}: these entries match no item in the feed (renamed or removed?): {missing}")
    missing = [k for k in chain.holdback if k not in used_holdback]
    if missing:
        raise SystemExit(f"holdback: these entries match no published item (renamed, removed or dropped as a repeat?): {missing}")

    date = (menu.get("lastModified") or "")[:10]
    source_title = f"{chain.source_title_prefix}: menu '{menu.get('name', '').strip()}', last modified {date}"
    # The same feed is the brand's allergen information: the menu page shows each dish's allergens from it.
    ing_date = (menu.get("lastIngredientsModified") or menu.get("lastModified") or "")[:10]
    guide = {"title": f"{chain.name} allergens in its online menu (M&B menu feed): menu '{squash(menu.get('name'))}', "
                      f"ingredients last modified {ing_date}",
             "url": chain.source_url, "checked_on": checked_on,
             "may_contain_published": any(v == "mayContain" for e in ents for v in (e.item.get("allergens") or {}).values())}
    folder = write_chain_folder(chain_id=chain.chain_id, name=chain.name, cuisine=chain.cuisine, source_title=source_title,
                                source_url=chain.source_url, checked_on=checked_on, aliases=chain.aliases, items=items,
                                out=out, note=chain.note_txt, holdback=holdback, allergen_guide=guide)
    return {"folder": folder, "items": items, "holdback": holdback, "skipped": skipped, "rows": kept, "allergen_guide": guide,
            "repeats_dropped": dropped_repeats, "menu_name": menu.get("name"), "last_modified": menu.get("lastModified"),
            "source_sha256": hashlib.sha256(source_file.read_bytes()).hexdigest() if source_file else ""}


def meat_not_stated(rows: list[dict]) -> list[str]:
    """Items that look like a meat dish but whose own name/description names no meat at all."""
    out = []
    for r in rows:
        if not r["meat"] or r["veg"] or r["tags"]:
            continue
        text = f"{r['name']} {r['description']}"
        if OTHER_PROTEIN.search(text) and not AMBIGUOUS_MEAT.search(text):
            continue
        out.append(r["name"])
    return out


def run(chain: Chain, argv: list[str] | None = None) -> int:
    """Command line shared by the chain scripts."""
    ap = argparse.ArgumentParser(description=f"Build data/source/{chain.chain_id}/ from the M&B menu feed.")
    ap.add_argument("source", nargs="?", type=Path, help="a saved copy of the menu JSON (or the Vintage Inns page HTML)")
    ap.add_argument("--fetch", type=Path, metavar="DIR", help="download the feed once into DIR first")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the feed")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / chain.chain_id)
    args = ap.parse_args(argv)
    if args.fetch:
        ext = "html" if chain.source_url.endswith("/mainmenu") else "json"
        args.source = fetch(chain.source_url, args.fetch / f"{chain.chain_id}.{ext}")
    if not args.source:
        ap.error("give a saved feed file or use --fetch DIR")
    menu = load_menu(args.source)
    rep = build(chain, menu, checked_on=args.checked_on, out=args.out, source_file=args.source)
    print(f"wrote {len(rep['items'])} items ({len(rep['holdback'])} held back) to {rep['folder']}; menu {rep['menu_name']!r} "
          f"last modified {rep['last_modified']}; feed sha256 {rep['source_sha256'][:16]}")
    for raw, why in rep["skipped"]:
        print(f"  left out: {raw!r}: {why}")
    for item_id, why in rep["holdback"]:
        print(f"  held back: {item_id}: {why}")
    missing = [i["name"] for i in rep["items"] if i["allergens"] is None]
    if missing:
        print(f"  allergens: {len(missing)} items carry no allergen map ({missing[:5]}...): allergen_guide.csv only, no allergens.csv")
    else:
        print(f"  allergens: all {len(rep['items'])} items read; may-contain published: {rep['allergen_guide']['may_contain_published']}; "
              f"guide: {rep['allergen_guide']['title']}")
    return 0
