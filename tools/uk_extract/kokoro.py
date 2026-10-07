#!/usr/bin/env python3
"""Build data/source/kokoro/ from Kokoro UK's own menu page (a CALORIES-ONLY chain, with complete allergens).

    python3 tools/uk_extract/kokoro.py --page DIR/menu.html --checked-on 2026-10-07 [--fetch] [--allergen-pdf DIR/chart.pdf] [--out DIR]

Source: https://www.kokorouk.com/menu (a Webflow site; kokoro.co.uk is a different, Cloudflare-protected domain). Every dish is a card
on that page; clicking it opens a popup with the dish description, "Ingredients & Allergens" and "Energy (Regular / Large Kcal)".
The page prints calories ONLY (no protein, carbs, fat, salt, kJ or weights), so protein/carbs/fat and every other nutrient stay
blank (docs/DATA.md "Calories-only chains"). robots.txt is empty (nothing disallowed). --fetch downloads the page once.

What the popup shows, and what is published
- The visible energy is the card's "Energy" text (in the page's markup it sits in the rich-text field class "item-allergen", which the
  popup script copies under the heading "Energy (Regular / Large Kcal)"). The card also holds a hidden field "item-kcal" that no popup
  shows (display:none, no popup element reads it); it only feeds the "under 400/500/600 kcal" filter icons. It is NOT a source here.
  It is used as a contradiction check: when the visible figure and the hidden field disagree, or the filter icons contradict the
  visible figure, the dish's rows are HELD BACK (holdback.csv), never corrected.
- One figure ("396 Kcal") -> one item. "Regular 798 Kcal / Large 989 Kcal" -> two items.
- Bowl dishes print a topping line (and "Curry Sauce") plus a list of four bases, each as regular/large: "Topping (207/289 Kcal)",
  "Curry Sauce (187/228 Kcal)", then Rice, Noodle, Egg Fried Rice, Kimchi Fried Rice. The chain prints no total for the bowl, and we
  never add numbers up, so each topping is published as its own items (regular, large); the curry sauce's large figure becomes
  "Curry Sauce (large)"; the four bases (identical on every bowl dish: checked) are copied into note.txt, not published as items.
- KOKORO MIX & MATCH prints no energy ("-") and is not listed.
- serving: only where the dish description itself gives a count ("10 large pcs", "sets of 3"), see SERVING (the phrase is checked).
- vegetarian: the card's own vegetarian filter icon. contains_pork / contains_beef: the dish name, description or ingredient list names
  pork products / beef cuts (same words as the other UK scripts). The pork/beef filter icons are compared and any difference is reported.

Allergens (docs/DATA.md "Allergens"): LINK ONLY, because Kokoro's two official allergen sources contradict each other.
The same popup prints each dish's "ALLERGENS : ..." and "MAY CONTAIN : ..." lines (read here dish by dish, no name matching), and the
chain also publishes "Allergen chart V3 AUG 2026 (22nd edition)" (a tick matrix: green tick = contains, grey tick = may contain; read
by kokoro_pdf.py). With --allergen-pdf the script compares every dish that is on both: 65 of the 65 listed dishes are, and they
DISAGREE for 14 (e.g. the chart marks milk in Cheese Cake and wheat in Vegetable Gyoza, the page does not; the page says Kimchi
contains crustaceans and soya, the chart only fish). Allergens are safety information and we never choose between two sources or
merge them, so per-item allergens are written ONLY when the page and the chart agree on every dish; otherwise only the guide link
is published (allergen_guide.csv, pointing at the chart). The page has two typos ("EEGS"), read as eggs in the comparison only
(CHAIN_SPELLINGS) because the chart's own tick shows eggs on those two dishes.
"""
from __future__ import annotations
import argparse
import html
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "kokoro"
PAGE_URL = "https://www.kokorouk.com/menu"
CHART_URL = "https://cdn.prod.website-files.com/67a6072523ff621bc008dd6a/6a8711faebbfbfb136d5d4c7_Allergen%20chart%20V3%20AUG%202026.pdf"
SOURCE_TITLE = "Kokoro UK website menu with calories (kokorouk.com/menu, accessed {checked}, no date shown)"
ALLERGEN_TITLE = "Kokoro allergen chart V3 AUG 2026 (22nd edition)"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

EXPECTED_DISHES = 66
EXPECTED_CATEGORIES = {"Korean Food": 10, "Hearty Bowl": 16, "Fresh Roll": 15, "Salad": 4, "Dessert": 4, "Side": 17}
NO_ENERGY = {"KOKORO MIX & MATCH"}  # prints "-" instead of calories: not listed
# Printed typos, accepted only because the chart's own tick confirms the allergen (checked by --allergen-pdf).
CHAIN_SPELLINGS = {"eegs": ("eggs", None)}
# Chart names that differ from the menu's (cross-check only; never used to fill in an item). Chart -> menu page name.
CHART_NAMES = {
    "Chicken Katsu 1PC": "CHICKEN KATSU", "Soy Chichen Wings": "SOY CHICKEN WINGS", "Sweet & Chili Chicken": "SWEET CHILLI CHICKEN",
    "Sweet & Sour Chicken": "SWEET SOUR CHICKEN", "Dorayaki Chocolate": "CHOCOLATE DORAYAKI", "Dorayaki Custard": "CUSTARD DORAYAKI",
    "All Salmon Love Set": "ALL SALMON LOVE", "KOKORO Deluxe Sushi Set": "KOKORO DELUXE SUSHI", "Sushi Katsu Combi": "SUSHI & KATSU COMBI",
    "Chilli Pork with Egg Fried Rice Onigiri": "CHILLI PORK & EGG FRIED RICE ONIGIRI",
    "Crabstick Tobiko & Mayo Onigiri": "CRABSTICK, TOBIKO & MAYO ONIGIRI", "Tuna Tobiko & Mayo Onigiri": "TUNA, TOBIKO & MAYO ONIGIRI",
    "Buchu(Chive) Jeon": "BUCHU (Chive) JEON", "Buchu (Chive) Jeon": "BUCHU (Chive) JEON",
}

# page name -> (phrase the dish description must contain, serving shown). Only counts the description states outright.
_KIMBAP = ("10 large pcs", "10 large pieces")
_WINGS = ("sets of 3", "Set of 3")
_EIGHT = ("8 pieces of", "8 pieces")
SERVING = {
    "VEGGIE KIMBAP": _KIMBAP, "TUNA MAYO KIMBAP": _KIMBAP, "KIMCHI KIMBAP": _KIMBAP, "BULGOGI KIMBAP": _KIMBAP,
    "KOKORO CHICKEN WINGS": _WINGS, "SOY CHICKEN WINGS": _WINGS, "MINI MAKI DELIGHT": ("12 pieces in total", "12 pieces"),
    "SALMON & AVO ROLL": _EIGHT, "CRAB & AVO ROLL": _EIGHT, "CRUNCHY PRAWN ROLL": _EIGHT, "AVOCADO HOSOMAKI": _EIGHT,
    "CUCUMBER HOSOMAKI": _EIGHT, "SALMON HOSOMAKI": _EIGHT, "INARI POCKET": ("2 sweet and savoury deep-fried tofu pockets", "2 pockets"),
    "KIMCHI JEON": ("3 pcs of crispy korean pancake", "3 pieces"), "BUCHU (Chive) JEON": ("3 pcs of crispy korean pancake", "3 pieces"),
    "CHICKEN GYOZA": ("5 steamed chicken gyoza", "5 gyoza"), "SHRIMP GYOZA": ("4 steamed shrimp gyoza", "4 gyoza"),
    "VEGETABLE GYOZA": ("4 steamed veggie gyoza", "4 gyoza"), "FRIED CHICKEN GYOZA": ("2 crispy fried chicken gyoza", "2 gyoza"),
    "VEGETABLE SPRING ROLL": ("3 crispy vegetable spring rolls", "3 spring rolls"),
    "PRAWN KATSU": ("3 crispy panko-breaded prawn tempura", "3 pieces"),
    "PUMPKIN KOROKKE": ("3 sweet & savoury crispy panko-breaded pumpkin korokke", "3 korokke"),
    "POTATO KOROKKE": ("3 sweet & savoury crispy panko-breaded potato korokke", "3 korokke"),
}

PORK = re.compile(r"\b(pork|bacon|ham|gammon|pepperoni|sausages?|salami|salame|chorizo|pancetta|prosciutto|guanciale|speck|"
                  r"mortadella|spianata|lardons?|lard|nduja|'nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|brisket|sirloin|rump|ribeye|flank)\b", re.I)

BASE_ORDER = ["Rice", "Noodle", "Egg Fried Rice", "Kimchi Fried Rice"]
SINGLE = re.compile(r"^(\d+) Kcal$", re.I)
REG_LARGE = re.compile(r"^Regular (\d+) Kcal / Large (\d+) Kcal$", re.I)
PART = re.compile(r"^(Topping|Curry Sauce|Rice|Noodle|Egg Fried Rice|Kimchi Fried Rice) \((\d+)/(\d+) Kcal\)$", re.I)
UNDER = {"400": 400, "500": 500, "600": 600}  # the "under N kcal" filter icons



def text_of(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).replace("‍", " ").split())


def paragraphs(fragment: str) -> list[str]:
    return [t for t in (text_of(p) for p in re.findall(r"<p>(.*?)</p>", fragment, re.S)) if t]


def read_page(page_html: str) -> list[dict]:
    """One dict per dish card, in page order, with the fields the popup uses."""
    body = re.sub(r"<script.*?</script>", "", page_html, flags=re.S)
    cards = body.split('<div role="listitem" class="collection-item-3 w-dyn-item w-col w-col-3">')[1:]
    dishes = []
    for c in cards:
        def field(cls: str) -> str:
            m = re.search(r'class="' + cls + r'(?: w-richtext)?">(.*?)</div>', c, re.S)
            if not m:
                raise SystemExit(f"a dish card has no '{cls}' field: the page layout changed")
            return m.group(1)
        cat = re.search(r'<div category="([^"]*)" class="div-block-87', c)
        if not cat:
            raise SystemExit("a dish card has no category: the page layout changed")
        dishes.append({
            "category": text_of(cat.group(1)),
            "page_name": text_of(re.search(r'<div class="body-4">(.*?)</div>', c, re.S).group(1)),
            "desc": text_of(field("item-desc")),
            "ingredients": paragraphs(field("item-ingrident")),
            "energy": paragraphs(field("item-allergen")),   # the popup's "Energy (Regular / Large Kcal)"
            "hidden_kcal": text_of(field("item-kcal")),
            "hidden_large": text_of(field("item-large-kcal")),
            "note": text_of(field("item-note")),
            "icons": set(re.findall(r'data-filter="([^"]*)"', c)),
        })
    return dishes


def tidy(name: str) -> str:
    out = []
    for w in name.split():
        letters = [ch for ch in w if ch.isalpha()]
        out.append(w[:1].upper() + w[1:].lower() if letters and w.upper() == w else w)
    return " ".join(out)


def parse_energy(d: dict) -> dict:
    """-> {'kind': 'single'|'regular_large'|'parts'|'none', ...} with the numbers exactly as printed (strings)."""
    lines, name = d["energy"], d["page_name"]
    if lines == ["-"]:
        return {"kind": "none"}
    if len(lines) == 1 and SINGLE.match(lines[0]):
        return {"kind": "single", "kcal": SINGLE.match(lines[0]).group(1)}
    if len(lines) == 1 and REG_LARGE.match(lines[0]):
        m = REG_LARGE.match(lines[0])
        return {"kind": "regular_large", "regular": m.group(1), "large": m.group(2)}
    if lines and PART.match(lines[0]):
        parts, bases, seen_dash = [], [], False
        for ln in lines:
            if re.fullmatch(r"-+", ln):
                seen_dash = True
                continue
            m = PART.match(ln)
            if not m:
                raise SystemExit(f"{name}: unrecognised energy line {ln!r}")
            (bases if seen_dash else parts).append((tidy(m.group(1)), m.group(2), m.group(3)))
        if [p[0] for p in parts] not in (["Topping"], ["Topping", "Curry Sauce"]) or [b[0] for b in bases] != BASE_ORDER or not seen_dash:
            raise SystemExit(f"{name}: the bowl energy list changed shape: {lines!r}")
        return {"kind": "parts", "parts": parts, "bases": bases}
    raise SystemExit(f"{name}: unrecognised energy text {lines!r}: check the page and extend parse_energy")


def parse_allergen_line(seg: str, where: str) -> tuple[set, set, set]:
    keys, cereals, nuts = set(), set(), set()
    for outer, inner in re.findall(r"([^,;.()/]+)?(?:\(([^)]*)\))?", seg):
        words = ([outer] if outer and outer.strip() else []) + [w for w in re.split(r"[,\s]+", inner) if w]
        k, c, n = allergen_words(words, where, extra=CHAIN_SPELLINGS)
        keys |= k
        cereals |= c
        nuts |= n
    return keys, cereals, nuts


def parse_allergens(d: dict) -> dict:
    text = " ".join(d["ingredients"])
    heads = list(re.finditer(r"ALLERGENS\s*:", text))
    if len(heads) != 1:
        raise SystemExit(f"{d['page_name']}: expected one 'ALLERGENS :' statement, found {len(heads)}")
    rest = text[heads[0].end():]
    may_head = list(re.finditer(r"MAY CONTAIN\s*:", rest))
    if len(may_head) > 1:
        raise SystemExit(f"{d['page_name']}: more than one 'MAY CONTAIN' statement")
    contains_txt, may_txt = (rest[:may_head[0].start()], rest[may_head[0].end():]) if may_head else (rest, "")
    contains_txt, may_txt = contains_txt.strip(" /"), may_txt.strip(" /")
    ck, cc, cn = parse_allergen_line(contains_txt, d["page_name"] + " ALLERGENS")
    mk, mc, mn = parse_allergen_line(may_txt, d["page_name"] + " MAY CONTAIN")
    return {"contains": ck, "may_contain": mk, "cereals": cc, "nuts": cn, "may_cereals": mc, "may_nuts": mn}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower().replace("&", "and"))


def chart_columns(a: dict) -> tuple[set, set]:
    """Page allergens -> the chart's column names (contains, may contain), cereals split into wheat/rye/barley/oats."""
    def cols(keys: set, cereals: set) -> set:
        out = {k for k in keys if k != "gluten"}
        out |= set(cereals) if "gluten" in keys else set()
        if "gluten" in keys and not cereals:
            out.add("gluten (cereal not named)")
        return out
    return cols(a["contains"], a["cereals"]), cols(a["may_contain"], a["may_cereals"])


def cross_check(records: dict, chart_rows: list):
    """Compare every chart row that names a dish on the page. Returns (differences, matched page names, chart rows with no dish on the page)."""
    by_norm = {norm(name): name for name in records}
    problems, matched, chart_only = [], set(), []
    for r in chart_rows:
        page_name = CHART_NAMES.get(r["name"]) or by_norm.get(norm(r["name"]))
        if page_name is None or page_name not in records:
            chart_only.append(r["name"])
            continue
        matched.add(page_name)
        c_contains, c_may = chart_columns(records[page_name])
        # nuts: the page may name which nut; the chart only has a "Nuts" column. Cereals and everything else compare 1:1.
        if c_contains != r["contains"] or c_may != r["may"]:
            problems.append(f"{r['section']} / {r['name']} -> {page_name}: page contains {sorted(c_contains)} may {sorted(c_may)}; "
                            f"chart contains {sorted(r['contains'])} may {sorted(r['may'])}")
    return problems, matched, chart_only


def fetch_page(dest: Path) -> None:
    req = urllib.request.Request(PAGE_URL, headers={"User-Agent": USER_AGENT})
    dest.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    time.sleep(1)


def build(dishes: list[dict]):
    if len(dishes) != EXPECTED_DISHES:
        raise SystemExit(f"the page has {len(dishes)} dishes but this script expects {EXPECTED_DISHES}: the menu changed, re-check it")
    counts = {}
    for d in dishes:
        counts[d["category"]] = counts.get(d["category"], 0) + 1
    if counts != EXPECTED_CATEGORIES:
        raise SystemExit(f"category counts changed: now {counts}, expected {EXPECTED_CATEGORIES}")
    names = [d["page_name"] for d in dishes]
    if len(set(names)) != len(names):
        raise SystemExit("two dishes share a name")
    items, holdback, report, records = [], [], [], {}
    bases_seen, curry_sauce = None, {}
    for d in dishes:
        if d["hidden_large"]:
            raise SystemExit(f"{d['page_name']}: the hidden large-kcal field is filled ({d['hidden_large']!r}): the layout changed")
        e = parse_energy(d)
        if e["kind"] == "none":
            if d["page_name"] not in NO_ENERGY:
                raise SystemExit(f"{d['page_name']} prints no energy: add it to NO_ENERGY after checking the page")
            report.append(f"not listed (no calories printed, '-'): {d['page_name']}")
            continue
        if d["page_name"] in NO_ENERGY:
            raise SystemExit(f"{d['page_name']} now prints energy: remove it from NO_ENERGY and re-check")
        al = parse_allergens(d)
        records[d["page_name"]] = al
        name = tidy(d["page_name"])
        tags = ["vegetarian"] if "vegetarian" in d["icons"] else []
        text = " ".join([d["page_name"], d["desc"], d["ingredients"][0] if d["ingredients"] else ""])
        pork, beef = bool(PORK.search(text)), bool(BEEF.search(text))
        if pork:
            tags.append("contains_pork")
        if beef:
            tags.append("contains_beef")
        if pork != ("pork" in d["icons"]):
            report.append(f"{name}: pork filter icon {'on' if 'pork' in d['icons'] else 'off'} but the text {'names' if pork else 'does not name'} pork")
        if beef != ("beef" in d["icons"]):
            report.append(f"{name}: beef filter icon {'on' if 'beef' in d['icons'] else 'off'} but the text {'names' if beef else 'does not name'} beef")
        serving = ""
        if d["page_name"] in SERVING:
            phrase, label = SERVING[d["page_name"]]
            if phrase.lower() not in d["desc"].lower():
                raise SystemExit(f"{d['page_name']}: the description no longer says {phrase!r}; re-check SERVING")
            serving = label
        base = {"category": d["category"], "tags": "|".join(tags), "rankable": False, "allergens": al}
        printed = " / ".join(d["energy"])
        rows = []
        # ---- rows and the contradiction check
        if e["kind"] == "single":
            rows.append({**base, "name": name, "serving": serving, "calories": e["kcal"], "notes": f"Printed: {printed}"})
            visible_total = int(e["kcal"])
        elif e["kind"] == "regular_large":
            rows.append({**base, "name": f"{name} (regular)", "serving": "Regular", "calories": e["regular"], "notes": f"Printed: {printed}"})
            rows.append({**base, "name": f"{name} (large)", "serving": "Large", "calories": e["large"], "notes": f"Printed: {printed}"})
            visible_total = int(e["regular"])
        else:
            if bases_seen is None:
                bases_seen = e["bases"]
            elif bases_seen != e["bases"]:
                raise SystemExit(f"{d['page_name']}: the bowl bases differ from the other bowls: the note would be wrong")
            top = e["parts"][0]
            for label, idx, size in (("regular", 1, "Regular"), ("large", 2, "Large")):
                rows.append({**base, "name": f"{name} topping ({label})", "serving": size, "calories": top[idx],
                             "notes": f"Printed: {printed}. Topping only: the base is chosen separately (see note.txt)"})
            if len(e["parts"]) == 2:
                sauce = e["parts"][1]
                if curry_sauce and curry_sauce != sauce:
                    raise SystemExit(f"{d['page_name']}: curry sauce figures differ between bowls")
                curry_sauce = sauce
            visible_total = None
        for r in rows:
            r["_dish"] = d["page_name"]
        # hidden field and icons vs the visible figure. A filter icon that is SHOWN is a claim ("under 500 kcal"); a missing icon is
        # not (the icons are set by hand per dish: most under-400 dishes lack theirs), so only a shown icon can contradict.
        reasons = []
        hidden = d["hidden_kcal"]
        if hidden and not hidden.isdigit():
            raise SystemExit(f"{d['page_name']}: hidden kcal field {hidden!r} is not a number")
        if visible_total is not None:
            if hidden != str(visible_total):
                reasons.append(f"the popup shows {visible_total} kcal but the page's own hidden calorie field says {hidden or 'nothing'}")
            for icon, limit in UNDER.items():
                if icon in d["icons"] and not visible_total < limit:
                    reasons.append(f"the page shows an 'under {icon} kcal' icon but the popup shows {visible_total} kcal")
        else:
            expected = int(top[1]) + (int(e["parts"][1][1]) if len(e["parts"]) == 2 else 0) + int(bases_seen[0][1])
            if hidden and hidden != str(expected):
                reasons.append(f"the page's hidden calorie field says {hidden}, not topping + sauce + regular rice ({expected})")
            for icon, limit in UNDER.items():
                if icon in d["icons"] and hidden and not int(hidden) < limit:
                    reasons.append(f"the page shows an 'under {icon} kcal' icon but its hidden calorie field says {hidden}")
        items.extend(rows)
        if reasons:
            for r in rows:
                holdback.append((r["_dish"], "; ".join(reasons)))
            report.append(f"HELD BACK {name}: " + "; ".join(reasons))
        if d["page_name"] == "CURRY SAUCE":
            curry_serving_regular = int(e["kcal"])
    # curry sauce large (printed in the katsu curries' energy list): same record as the Curry Sauce dish
    if not curry_sauce:
        raise SystemExit("no katsu curry prints a curry sauce line any more: re-check")
    if int(curry_sauce[1]) != curry_serving_regular:
        raise SystemExit("the Curry Sauce dish and the bowls' curry sauce regular figure differ: re-check")
    items.append({"name": "Curry Sauce (large)", "category": "Side", "serving": "Large", "calories": curry_sauce[2], "tags": "vegetarian",
                  "rankable": False, "allergens": records["CURRY SAUCE"], "_dish": "CURRY SAUCE (large)",
                  "notes": f"Printed as 'Curry Sauce ({curry_sauce[1]}/{curry_sauce[2]} Kcal)' in the katsu curry bowls; the Curry Sauce dish itself prints only {curry_serving_regular} Kcal"})
    # ids: one per row, from the name; held-back rows are named by dish, so map dish -> row ids afterwards
    ids = [slug(r["name"]) for r in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two rows share an id")
    held = []
    for dish, reason in holdback:
        for r in items:
            if r["_dish"] == dish:
                held.append((slug(r["name"]), reason))
    for r in items:
        r.pop("_dish")
    return items, held, report, records, bases_seen


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved menu page (kokorouk.com/menu)")
    ap.add_argument("--checked-on", required=True, help="the day the page was read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the page to --page first (one request)")
    ap.add_argument("--allergen-pdf", type=Path, help="the chart PDF: cross-check every dish present in both")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_page(args.page)
    print(f"menu page sha256 {sha256_file(args.page)}  {args.page}")
    dishes = read_page(args.page.read_text(encoding="utf-8"))
    items, held, report, records, bases = build(dishes)
    publish_allergens = False
    if args.allergen_pdf:
        import kokoro_pdf
        print(f"allergen chart sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
        problems, matched, chart_only = cross_check(records, kokoro_pdf.read_chart(args.allergen_pdf))
        print(f"allergen cross-check: {len(matched)} of {len(records)} listed dishes are on the chart; {len(problems)} differ")
        for p in problems:
            print("  DIFFERENCE " + p)
        report.append("on the chart but not on the menu page (not listed): " + ", ".join(chart_only))
        report.append("not on the chart: " + (", ".join(sorted(set(records) - matched)) or "none"))
        publish_allergens = not problems and len(matched) == len(records)
    print("allergens: " + ("per item (page and chart agree on every dish)" if publish_allergens else "guide link only (page and chart disagree or the chart was not checked)"))
    if not publish_allergens:
        for it in items:
            it["allergens"] = None
    note = ("Kokoro prints calories only. For bowl dishes each row is the topping (and curry sauce) without the base: add the base you "
            "choose, regular/large kcal: " + ", ".join(f"{n} {r}/{l}" for n, r, l in bases) + ". Kokoro says its menu may differ across branches.")
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters: shorten it")
    guide = {"title": ALLERGEN_TITLE, "url": CHART_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Kokoro", cuisine="Japanese", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=PAGE_URL, checked_on=args.checked_on, aliases=["kokoro", "kokoro sushi"], items=items, out=args.out,
                             note=note, holdback=held, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(held)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
