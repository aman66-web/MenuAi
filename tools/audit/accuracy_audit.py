#!/usr/bin/env python3
"""Accuracy audit of the published menu data (web/public/menus/chain-*.json).

    python3 tools/audit/accuracy_audit.py [--menus web/public/menus] [--out DIR] [--chain ID ...]

Nothing here corrects data (CLAUDE.md rule 1). It finds rows whose numbers or allergens look wrong *on their own terms*
(arithmetic that cannot hold, a "vegan" item that contains milk, a cheese dish with no milk marked) so a person or a
re-read of the official source can decide. A flag is a question, never a verdict: a chain's own guide may really print it,
in which case the chain gets a note or the row is held back; we never "fix" a number to make it pass.

Writes DIR/accuracy_report.md (per-chain table + worst flags) and DIR/flags/<chain>.csv (every flag, one row each).
Exit code is always 0; read the report.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

HIGH, MED, LOW = "high", "medium", "low"

# ---------------------------------------------------------------- nutrition

SIZE_WORDS = ["mini", "small", "regular", "medium", "large", "extra large", "xl", "grande", "venti", "tall"]
SIZE_RANK = {"mini": 0, "small": 1, "tall": 1, "regular": 2, "medium": 2, "grande": 2, "large": 3, "venti": 3, "extra large": 4, "xl": 4}
SIZE_RE = re.compile(r"\b(" + "|".join(sorted(SIZE_WORDS, key=len, reverse=True)) + r")\b", re.I)
ZERO_RE = re.compile(r"\b(diet|zero|no sugar|sugar[- ]free|0%|light)\b", re.I)
DRINKS_CATEGORY_RE = re.compile(r"drink|beer|lager|wine|spirit|cocktail|cider|gin|vodka|rum|whisk|liqueur|aperitif|shot|sparkling|champagne|"
                                r"bottle|draught|draft|cask|\bale|stout|mocktail|spritz|bar\b|bubbl|fizz|brandy|port\b|sherry|vermouth", re.I)
ALCOHOL_RE = re.compile(r"\b(wine|beer|lager|ale|cider|prosecco|champagne|gin|vodka|rum|whisk(?:e)?y|cocktail|spritz|martini|"
                        r"mojito|margarita|liqueur|sangria|stout|ipa|pint|bellini|negroni|daiquiri|brandy|baileys|amaretto)\b", re.I)


def nutrition_flags(it: dict) -> list[tuple[str, str, str]]:
    """(severity, code, message) for one item or component's nutrients."""
    n, out = it["nutrients"], []
    drinkish = bool(DRINKS_CATEGORY_RE.search(it.get("category", "") or ""))
    kcal = n.get("calories")
    p, c, f = n.get("protein"), n.get("carbs"), n.get("fat")
    name = it["name"]
    if kcal is None:
        return out
    alcoholic = bool(ALCOHOL_RE.search(name))
    if p is not None and c is not None and f is not None:
        est = 4 * p + 4 * c + 9 * f
        gap = abs(kcal - est)
        rel = gap / kcal if kcal else (1 if est > 25 else 0)
        # alcohol (7 kcal/g), polyols and fibre make real drinks/desserts differ: only the big gaps are high
        if kcal > est and (alcoholic or drinkish) and est <= kcal * 0.8 and kcal >= 50:
            # alcohol supplies 7 kcal/g that no macro column carries: expected, but worth the ABV sanity glance
            out.append((LOW, "energy-gap-alcohol", f"{kcal} kcal vs 4P+4C+9F={est:.0f}: energy not in the macros (alcohol?)"))
        elif kcal >= 50 and rel > 0.30 and not alcoholic:
            out.append((HIGH, "energy-gap", f"{kcal} kcal vs 4P+4C+9F={est:.0f} ({rel:.0%} off)"))
        elif kcal >= 50 and rel > 0.20 and not alcoholic:
            out.append((MED, "energy-gap", f"{kcal} kcal vs 4P+4C+9F={est:.0f} ({rel:.0%} off)"))
        elif kcal < 50 and est > kcal + 30:
            out.append((MED, "energy-gap", f"{kcal} kcal but 4P+4C+9F={est:.0f}"))
        if kcal == 0 and est > 8:
            out.append((HIGH, "zero-kcal", f"0 kcal but macros add to {est:.0f} kcal"))
    sat, sug, fib, wt = n.get("saturatedFat"), n.get("sugar"), n.get("fiber"), n.get("weight")
    if f is not None and sat is not None and sat > f + 0.6:
        out.append((HIGH, "sat-gt-fat", f"saturates {sat} g > fat {f} g"))
    if c is not None and sug is not None and sug > c + 1.0:
        out.append((HIGH, "sugar-gt-carbs", f"sugars {sug} g > carbohydrate {c} g"))
    if c is not None and fib is not None and fib > c + 1.0:
        # UK guides print carbohydrate without fibre, so avocado, beans and mushrooms can truly have more fibre than carbohydrate
        out.append((LOW, "fibre-gt-carbs", f"fibre {fib} g > carbohydrate {c} g"))
    if c is not None and sug is not None and fib is not None and sug + fib > c + 2.0 and sug <= c + 1.0 and fib <= c + 1.0:
        out.append((LOW, "sugar+fibre-gt-carbs", f"sugars {sug} + fibre {fib} > carbohydrate {c} (starch would be negative)"))
    salt, sod = n.get("salt"), n.get("sodium")
    if salt is not None and sod is not None and sod > 0:
        ratio = salt / (sod / 1000 * 2.5) if sod else 0
        if not 0.8 <= ratio <= 1.25 and abs(salt - sod / 1000 * 2.5) > 0.15:
            out.append((HIGH, "salt-sodium", f"salt {salt} g vs sodium {sod} mg (salt = 2.5 x sodium gives {sod / 1000 * 2.5:.2f} g)"))
    if salt is not None and (salt >= 10 or (salt >= 5 and kcal < 400)):
        out.append((MED, "salt-very-high", f"salt {salt} g with {kcal} kcal (6 g is the whole day's limit)"))
    if sod is not None and sod >= 2400:
        out.append((MED, "sodium-very-high", f"sodium {sod} mg"))
    for key, lim in (("sugar", 120), ("fat", 150), ("carbs", 400), ("saturatedFat", 80)):
        v = n.get(key)
        if v is not None and v > lim and not re.search(r"\b(box|platter|feast|shar(?:e|ing)|whole|round|square|serves|for (?:two|2|four|4)|metre|bucket|party|loaf|pack|tray|family|bundle|banquet|cake)\b", name, re.I):
            out.append((MED, f"{key}-implausible", f"{key} {v} g in one item"))
    kj = n.get("energyKj")
    if kj is not None and kcal >= 20:
        ratio = kj / (kcal * 4.184)
        if not 0.93 <= ratio <= 1.07:
            out.append((HIGH if not 0.85 <= ratio <= 1.15 else MED, "kj-kcal", f"{kj} kJ vs {kcal} kcal (expected about {kcal * 4.184:.0f} kJ)"))
    if wt:
        macro_g = sum(v for v in (p, c, f) if v is not None)
        if macro_g > wt * 1.05 + 1:
            out.append((HIGH, "macros-exceed-weight", f"protein+carbs+fat = {macro_g:.0f} g in a {wt} g serving"))
        if kcal / wt > 9.3:
            out.append((HIGH, "kcal-per-gram", f"{kcal} kcal in {wt} g is {kcal / wt:.1f} kcal/g (fat is 9)"))
    sharing = re.search(r"\b(box|platter|feast|shar(?:e|ing)|whole|round|square|serves|for (?:two|2|four|4)|metre|bucket|party|loaf|pack|tray|"
                        r"family|bundle|banquet|tower|hamper|roast for|trio|cake|sharer|sharers)\b", name, re.I)
    if kcal > 4000 and not sharing:
        out.append((HIGH, "huge", f"{kcal} kcal in one item"))
    elif kcal > 4000:
        out.append((LOW, "huge", f"{kcal} kcal in one sharing item"))
    elif kcal > 2500:
        out.append((LOW, "huge", f"{kcal} kcal in one item"))
    if p is not None and p > 120:
        out.append((MED, "huge-protein", f"{p} g protein"))
    if p is not None and kcal >= 100 and p * 4 > kcal * 1.02:
        out.append((HIGH, "protein-over-energy", f"protein {p} g would supply {p * 4:.0f} kcal of {kcal}"))
    if ZERO_RE.search(name) and kcal > 15 and "light" not in name.lower() and "0%" not in name:
        out.append((LOW, "zero-named-has-kcal", f"named diet/zero/no sugar but {kcal} kcal"))
    if p is not None and c is not None and f is not None and kcal == 0 and p == c == f == 0 and re.search(r"\b(burger|pizza|chicken|cake|fries)\b", name, re.I):
        out.append((HIGH, "all-zero", "every nutrient is zero for a cooked dish"))
    return out


def size_pair_flags(items: list[dict]) -> list[tuple[dict, str, str, str]]:
    """Small < regular < large for the same base name; an inverted pair often means two columns were swapped."""
    groups: dict[tuple, list[tuple[int, dict]]] = defaultdict(list)
    for it in items:
        m = SIZE_RE.findall(it["name"])
        if len(m) != 1:
            continue
        base = SIZE_RE.sub("", it["name"]).lower()
        base = re.sub(r"[\W_]+", " ", base).strip()
        groups[(it.get("category", ""), base)].append((SIZE_RANK[m[0].lower()], it))
    out = []
    for (cat, base), members in groups.items():
        members.sort(key=lambda t: t[0])
        for (ra, a), (rb, b) in zip(members, members[1:]):
            ka, kb = a["nutrients"].get("calories"), b["nutrients"].get("calories")
            if ra < rb and ka is not None and kb is not None and kb < ka * 0.97 - 2:
                out.append((b, HIGH, "size-inverted", f"larger size '{b['name']}' has {kb} kcal but smaller '{a['name']}' has {ka}"))
    return out


def duplicate_vector_flags(items: list[dict]) -> list[tuple[dict, str, str, str]]:
    """Three or more differently named items with the identical full nutrient vector (a copy-down error looks like this).
    Milk/size variants that the chain prints identically are fine, so this is LOW and meant for a human eye."""
    by_vec: dict[tuple, list[dict]] = defaultdict(list)
    for it in items:
        n = it["nutrients"]
        if n.get("calories", 0) >= 100 and all(k in n for k in ("protein", "carbs", "fat")):
            by_vec[tuple(sorted(n.items()))].append(it)
    out = []
    for vec, members in by_vec.items():
        names = {m["name"] for m in members}
        if len(names) >= 4:
            for m in members[:1]:
                out.append((m, LOW, "identical-numbers", f"{len(names)} differently named items share these exact numbers (e.g. {sorted(names)[:3]})"))
    return out


# ---------------------------------------------------------------- allergens

def _re(words: str) -> re.Pattern:
    return re.compile(r"\b(?:" + words + r")", re.I)


# word fragments that make the allergen near-certain for a dish of that name. Matches are checked against contains+mayContain.
KEYWORDS: dict[str, re.Pattern] = {
    "milk": _re(r"cheese|cheddar|mozzarella|parmesan|parmigiano|cream(?!\s+soda)|butter(?!nut|scotch|fly|cup)|latte|cappuccino|flat white|mocha|"
                r"macchiato|yoghurt|yogurt|ice cream|gelato|milkshake|custard|mascarpone|ricotta|halloumi|brie|gorgonzola|paneer|"
                r"cheesecake|carbonara|alfredo|tiramisu|panna cotta|béchamel|bechamel|lasagn|mac(?:aroni)? (?:&|and) cheese|"
                r"white chocolate|milk chocolate|hot chocolate|fondue|raita|burrata|feta|camembert|dolcelatte"),
    "gluten": _re(r"bun\b|burger bun|bread|toast|wrap\b|pizza|pasta|spaghetti|penne|linguine|fusilli|tagliatelle|lasagn|noodle|sandwich|"
                  r"baguette|bagel|croissant|muffin|cake|cookie|brownie|waffle|pancake|pie\b|pastry|donut|doughnut|scone|flatbread|naan|"
                  r"pitta|pita|battered|breaded|crumb|nuggets?|tempura|dumpling|gnocchi|couscous|sausage roll|crumpet|panini|ciabatta|"
                  r"focaccia|calzone|churro|crepe|yorkshire|dough|biscuit|crisp(?:s)?\b.*\bwheat|fish (?:&|and) chips|schnitzel|katsu|"
                  r"fish finger|kiev|pastie|pasty|stuffing|beer[- ]battered|rice krispie"),
    "eggs": _re(r"egg|omelette|omelet|mayo|mayonnaise|carbonara|meringue|hollandaise|aioli|quiche|frittata|brioche|pavlova|eggnog|"
                r"custard|scotch egg|benedict|florentine|royale|shakshuka|tiramisu|zabaglione"),
    "fish": _re(r"salmon|tuna|cod\b|haddock|fish|anchov|sea bass|seabass|mackerel|sardine|trout|plaice|halibut|bream|kipper|"
                r"smoked haddock|worcestershire|caesar|pollock|swordfish|monkfish|whitebait|sushi|sashimi|nigiri|maki"),
    "crustaceans": _re(r"prawn|shrimp|crab|lobster|langoustine|crayfish|scampi|king prawn"),
    "molluscs": _re(r"mussel|oyster|squid|calamari|clam|scallop|octopus|whelk|cockle|abalone|snail|escargot"),
    "peanuts": _re(r"peanut|satay|groundnut|monkey nut"),
    "nuts": _re(r"almond|hazelnut|walnut|cashew|pecan|pistachio|macadamia|praline|marzipan|nutella|brazil nut|frangipane|baklava|"
                r"pine nut|mixed nuts|amaretti"),
    "soya": _re(r"soy|soya|tofu|edamame|miso|tempeh|teriyaki|tamari|katsu"),
    "sesame": _re(r"sesame|tahini|hummus|houmous|halva|halwa|gomashio|bagel seeds"),
    "mustard": _re(r"mustard|piccalilli|honey mustard"),
    "celery": _re(r"celery|celeriac|bloody mary"),
    "sulphites": _re(r"\bwine\b|prosecco|champagne|cava\b|cider|sangria|vermouth|sherry|port\b|dried (?:apricot|fruit|mango)|spritz|bellini|sauvignon|chardonnay|merlot|rosé|rose wine|malbec|pinot|prosecco"),
}
# when one of these appears the keyword is probably not what it looks like
NEGATE: dict[str, re.Pattern] = {
    "milk": re.compile(r"\b(oat|soy|soya|almond|coconut|plant|vegan|dairy[- ]free|dairy free|hazelnut|rice|pea|sproud|no cheese|without cheese|"
                       r"no butter|no cream|non[- ]dairy|oatly|alpro|cashew|black|americano|espresso|cold brew)\b", re.I),
    "gluten": re.compile(r"\b(gluten[- ]free|gf|corn tortilla|rice noodle|no bun|no bread|bunless|lettuce wrap|without bun|salad|bowl|rice paper|"
                         r"no wrap|no pizza base)\b", re.I),
    "eggs": re.compile(r"\b(egg[- ]free|vegan|no egg|eggless|plant)\b", re.I),
    "fish": re.compile(r"\b(fish[- ]free|vegan|vegetarian|no fish|plant|caesar salad dressing)\b", re.I),
    "sulphites": re.compile(r"\b(non[- ]alcoholic|alcohol[- ]free|0\.0|zero|free|0%|virgin|apple cider vinegar|vinegar)\b", re.I),
    "soya": re.compile(r"\b(soy[- ]free|no soy)\b", re.I),
    "nuts": re.compile(r"\b(nut[- ]free|no nuts|coconut|butternut|nutmeg|water chestnut|chestnut)\b", re.I),
    "peanuts": re.compile(r"\b(peanut[- ]free|no peanut)\b", re.I),
}
FREE_FROM = {
    "gluten": re.compile(r"\bgluten[- ]free\b|\bgf\b", re.I),
    "milk": re.compile(r"\bdairy[- ]free\b|\bmilk[- ]free\b|\bno dairy\b", re.I),
    "nuts": re.compile(r"\bnut[- ]free\b|\bno nuts\b", re.I),
    "peanuts": re.compile(r"\bnut[- ]free\b|\bpeanut[- ]free\b", re.I),
    "eggs": re.compile(r"\begg[- ]free\b", re.I),
}
VEGAN_RE = re.compile(r"\bvegan\b|\bplant[- ]based\b|\(ve\)|\bve\b", re.I)
ANIMAL_ALLERGENS_VEGAN = {"milk", "eggs", "fish", "crustaceans", "molluscs"}
VEGETARIAN_ANIMAL = {"fish", "crustaceans", "molluscs"}


def allergen_flags(it: dict, chain_has_allergens: bool) -> list[tuple[str, str, str]]:
    a = it.get("allergens")
    out = []
    if not a:
        return out
    present = set(a["contains"]) | set(a["mayContain"])
    contains = set(a["contains"])
    name = it["name"]
    tags = set(it.get("tags", []))
    for key, rx in KEYWORDS.items():
        if key in present:
            continue
        m = rx.search(name)
        if not m:
            continue
        neg = NEGATE.get(key)
        if neg and neg.search(name):
            continue
        # Plain drinks that merely mention 'milk' as a variant are covered by NEGATE; the rest are flags for review.
        sev = MED if key in ("milk", "gluten", "eggs", "peanuts", "nuts", "crustaceans", "molluscs", "fish", "sesame", "soya") else LOW
        out.append((sev, f"name-implies-{key}", f"'{m.group(0)}' in the name but {key} is not marked (contains: {sorted(contains) or 'none'})"))
    for key, rx in FREE_FROM.items():
        if rx.search(name) and key in contains:
            out.append((HIGH, f"free-from-{key}-contains", f"named '{rx.search(name).group(0)}' but allergens say it contains {key}"))
    if VEGAN_RE.search(name) and not re.search(r"\bnon[- ]vegan\b", name, re.I):
        bad = contains & ANIMAL_ALLERGENS_VEGAN
        if bad:
            out.append((HIGH, "vegan-contains-animal", f"named vegan/plant-based but allergens say it contains {sorted(bad)}"))
    if "vegetarian" in tags:
        bad = contains & VEGETARIAN_ANIMAL
        if bad:
            out.append((HIGH, "vegetarian-contains-fish", f"tagged vegetarian but allergens say it contains {sorted(bad)}"))
    if "contains_pork" in tags and "contains_beef" in tags and "vegetarian" in tags:
        out.append((HIGH, "tag-conflict", "tagged vegetarian and contains pork/beef"))
    return out


def chain_allergen_stats(doc: dict) -> list[tuple[str, str, str]]:
    items = [i for i in doc["items"] if i.get("allergens")]
    out = []
    if not items:
        return out
    n = len(items)
    empty = sum(1 for i in items if not i["allergens"]["contains"])
    anymay = sum(1 for i in items if i["allergens"]["mayContain"])
    if n >= 40 and empty / n > 0.5:
        out.append((MED, "chain-mostly-allergen-free", f"{empty} of {n} items list no allergen at all: check the parser read every column"))
    if n >= 40 and sum(1 for i in items if i["allergens"]["contains"]) == 0:
        out.append((HIGH, "chain-no-allergens", f"none of {n} items lists any allergen: the table was probably not read"))
    guide = doc.get("allergenGuide") or {}
    if guide.get("mayContainPublished") and n >= 40 and anymay == 0:
        out.append((MED, "chain-may-contain-empty", "guide prints 'may contain' but no item has any"))
    if guide.get("mayContainPublished") is False and anymay:
        out.append((MED, "chain-may-contain-unexpected", f"{anymay} items have 'may contain' though the guide is recorded as printing none"))
    return out


# ---------------------------------------------------------------- driver

def reviewed_pairs(audit_dir: Path) -> set[tuple[str, str, str]]:
    """(chain, item, code) triples a person or an agent re-read against the official source and judged fine; kept in
    data/audit/reviewed/<chain>.csv with columns item,code,verdict,evidence. They stay in the flags file marked reviewed."""
    out = set()
    for f in (audit_dir / "reviewed").glob("*.csv"):
        for r in csv.DictReader(f.open()):
            if r.get("verdict", "").strip().lower() in ("ok", "source-prints-it", "reviewed-ok"):
                out.add((f.stem, r["item"], r["code"]))
    return out


def audit_chain(doc: dict) -> list[dict]:
    flags: list[dict] = []

    def add(it, sev, code, msg, kind):
        flags.append({"chain": doc["id"], "kind": kind, "severity": sev, "code": code, "item": it["id"] if it else "",
                      "name": it["name"] if it else "", "category": it.get("category", "") if it else "", "detail": msg})

    for it in doc["items"]:
        for sev, code, msg in nutrition_flags(it):
            add(it, sev, code, msg, "nutrition")
        for sev, code, msg in allergen_flags(it, bool(doc.get("allergenGuide"))):
            add(it, sev, code, msg, "allergen")
    for comp in doc.get("components", []):
        c = {"id": comp["id"], "name": comp["name"], "category": comp.get("group", ""), "nutrients": comp["nutrients"]}
        for sev, code, msg in nutrition_flags(c):
            add(c, sev, code, msg, "nutrition")
    for it, sev, code, msg in size_pair_flags(doc["items"]):
        add(it, sev, code, msg, "nutrition")
    for it, sev, code, msg in duplicate_vector_flags(doc["items"]):
        add(it, sev, code, msg, "nutrition")
    for sev, code, msg in chain_allergen_stats(doc):
        add(None, sev, code, msg, "allergen")
    return flags


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--menus", type=Path, default=ROOT / "web" / "public" / "menus")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "audit")
    ap.add_argument("--chain", nargs="*")
    args = ap.parse_args()
    files = sorted(args.menus.glob("chain-*.json"))
    (args.out / "flags").mkdir(parents=True, exist_ok=True)
    rows = []
    totals = Counter()
    reviewed = reviewed_pairs(args.out)
    for f in files:
        doc = json.loads(f.read_text())
        if doc.get("sample") or (args.chain and doc["id"] not in args.chain):
            continue
        flags = audit_chain(doc)
        for x in flags:
            if (x["chain"], x["item"], x["code"]) in reviewed:
                x["severity"] = "reviewed"
        with (args.out / "flags" / f"{doc['id']}.csv").open("w", newline="") as fh:
            w = csv.DictWriter(fh, ["chain", "kind", "severity", "code", "item", "name", "category", "detail"])
            w.writeheader()
            w.writerows(sorted(flags, key=lambda r: ({HIGH: 0, MED: 1, LOW: 2, "reviewed": 3}[r["severity"]], r["code"], r["item"])))
        items = doc["items"]
        with_a = sum(1 for i in items if i.get("allergens"))
        c = Counter((x["kind"], x["severity"]) for x in flags)
        rows.append({
            "id": doc["id"], "items": len(items), "level": doc.get("nutritionLevel", "full"), "allergens": with_a,
            "n_high": c[("nutrition", HIGH)], "n_med": c[("nutrition", MED)], "n_low": c[("nutrition", LOW)],
            "a_high": c[("allergen", HIGH)], "a_med": c[("allergen", MED)], "a_low": c[("allergen", LOW)],
            "codes": Counter(x["code"] for x in flags if x["severity"] == HIGH),
        })
        for x in flags:
            totals[(x["kind"], x["severity"])] += 1
    rows.sort(key=lambda r: -(r["n_high"] + r["a_high"]) / max(r["items"], 1))
    lines = ["# Accuracy audit (generated by tools/audit/accuracy_audit.py)", "",
             "Flags are questions for a re-read of the chain's official source, never corrections. Severity: high = arithmetic that "
             "cannot hold or a contradiction inside the data; medium = suspicious; low = worth a glance.", "",
             f"Chains: {len(rows)} · items: {sum(r['items'] for r in rows)} · "
             f"nutrition flags high/med/low: {totals[('nutrition', HIGH)]}/{totals[('nutrition', MED)]}/{totals[('nutrition', LOW)]} · "
             f"allergen flags high/med/low: {totals[('allergen', HIGH)]}/{totals[('allergen', MED)]}/{totals[('allergen', LOW)]}", "",
             "| chain | items | level | with allergens | nutr H/M/L | allergen H/M/L | high-severity codes |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        codes = ", ".join(f"{k}×{v}" for k, v in r["codes"].most_common(4))
        lines.append(f"| {r['id']} | {r['items']} | {r['level']} | {r['allergens']} | {r['n_high']}/{r['n_med']}/{r['n_low']} | "
                     f"{r['a_high']}/{r['a_med']}/{r['a_low']} | {codes} |")
    (args.out / "accuracy_report.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:8]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
