#!/usr/bin/env python3
"""Reference implementation of the "Best for you" ranking (docs/SPEC.md §6.4).

Goal values: "lose", "maintain", "buildMuscle", "glp1" (Swift: enum Goal: String).
Meal values: "breakfast", "lunch", "dinner". Modes: ranked, outOfBudget, nothingFits, noMatches.

The Swift RankingEngine must produce the same results. This script also writes the
golden test fixture the Swift tests load:

    python3 tools/reference_ranking.py --write-fixture    # -> data/fixtures/ranking-golden.json

By default it builds the chains fresh from data/source into a temporary folder, and
--write-fixture also copies the sample chain files it used into data/fixtures/, so the
fixture and the chain JSON always match. Swift tests load all of them from
MenuMacrosTests/Fixtures/ (copy the whole data/fixtures/ folder there).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MEAL_SHARE = {"breakfast": 0.25, "lunch": 0.35, "dinner": 0.40}
UNDER_BUDGET_BONUS = 2.0        # lose + glp1: up to +2 for being further under budget
TOTAL_PROTEIN_BONUS = 0.05      # buildMuscle: +0.05 per gram of protein
GLP1_PROTEIN_FIRST = 25         # glp1: picks with >= 25 g protein are listed first
OUT_OF_BUDGET_THRESHOLD = 200   # remaining kcal below this -> "lowest-calorie options" mode
OUT_OF_BUDGET_MIN_PROTEIN = 10
MAX_PER_BASE_ITEM = 2
RESULT_COUNT = 5


def candidates(chain: dict) -> list[dict]:
    out = []
    for it in chain["items"]:
        if it["rankable"]:
            out.append({"id": it["id"], "name": it["name"], "nutrients": it["nutrients"], "tags": it["tags"],
                        "baseKey": it["id"], "itemCount": 1})
    for c in chain["combinations"]:
        out.append({"id": c["id"], "name": c["name"], "nutrients": c["nutrients"], "tags": c["tags"],
                    "baseKey": c["baseItemId"] or c["id"], "itemCount": c["itemCount"]})
    return out


def passes_preferences(tags: list[str], prefs: dict) -> bool:
    if prefs.get("vegetarianOnly") and "vegetarian" not in tags:
        return False
    if prefs.get("noPork") and "contains_pork" in tags:
        return False
    if prefs.get("noBeef") and "contains_beef" in tags:
        return False
    return True


def meal_budget(profile: dict, logged_calories: int, meal: str) -> tuple[int, int]:
    remaining = profile["dailyCalories"] - logged_calories
    if profile["goal"] == "glp1":
        budget = min(remaining, profile.get("glp1MealCap", 450))
    else:
        budget = min(remaining, int(half_up(profile["dailyCalories"] * MEAL_SHARE[meal])))
    return remaining, budget


def density(n: dict) -> float:
    return n["protein"] / n["calories"] * 100 if n["calories"] > 0 else 0.0


def score(n: dict, goal: str, budget: int) -> float:
    d = density(n)
    if goal in ("lose", "glp1"):
        return d + UNDER_BUDGET_BONUS * (1 - n["calories"] / budget)
    if goal == "buildMuscle":
        return d + TOTAL_PROTEIN_BONUS * n["protein"]
    return d  # maintain


def half_up(x: float, places: int = 0) -> float:
    """Round half away from zero (matches Swift's .rounded()); Python's round() is banker's rounding."""
    f = 10 ** places
    return math.floor(x * f + 0.5) / f


def reason(n: dict) -> str:
    """Display rule (SPEC §6.1): grams half-up to integers, calories with a thousands separator."""
    return f"{int(half_up(n['protein']))}g protein · {n['calories']:,} kcal · {half_up(density(n), 1):.1f}g per 100 kcal"


def rank(chain: dict, profile: dict, logged_calories: int, meal: str, prefs: dict) -> dict:
    remaining, budget = meal_budget(profile, logged_calories, meal)
    pool = [c for c in candidates(chain) if c["nutrients"]["calories"] > 0 and passes_preferences(c["tags"], prefs)]
    if not pool:
        return {"mode": "noMatches", "remaining": remaining, "budget": budget, "picks": []}

    if remaining < OUT_OF_BUDGET_THRESHOLD:
        picks = sorted([c for c in pool if c["nutrients"]["protein"] >= OUT_OF_BUDGET_MIN_PROTEIN],
                       key=lambda c: (c["nutrients"]["calories"], -c["nutrients"]["protein"], c["name"]))[:RESULT_COUNT]
        return {"mode": "outOfBudget", "remaining": remaining, "budget": budget, "picks": [p["id"] for p in picks]}

    fits = [c for c in pool if c["nutrients"]["calories"] <= budget]
    if not fits:
        closest = sorted(pool, key=lambda c: (c["nutrients"]["calories"], c["name"]))[:3]
        return {"mode": "nothingFits", "remaining": remaining, "budget": budget, "picks": [p["id"] for p in closest]}

    def key(c):
        n = c["nutrients"]
        primary = 0
        if profile["goal"] == "glp1":
            primary = 0 if n["protein"] >= GLP1_PROTEIN_FIRST else 1
        return (primary, -half_up(score(n, profile["goal"], budget), 6), budget - n["calories"], c["itemCount"], c["name"])

    picks, per_base = [], {}
    for c in sorted(fits, key=key):
        if per_base.get(c["baseKey"], 0) >= MAX_PER_BASE_ITEM:
            continue
        per_base[c["baseKey"]] = per_base.get(c["baseKey"], 0) + 1
        picks.append(c)
        if len(picks) == RESULT_COUNT:
            break
    return {"mode": "ranked", "remaining": remaining, "budget": budget,
            "picks": [p["id"] for p in picks],
            "reasons": [reason(p["nutrients"]) for p in picks],
            "names": [p["name"] for p in picks]}


SCENARIOS = [
    {"name": "A build muscle, lunch, 1050 left", "chain": "bowl-and-co",
     "profile": {"goal": "buildMuscle", "dailyCalories": 2400}, "loggedCalories": 1350, "meal": "lunch", "prefs": {}},
    {"name": "B lose weight, dinner, nothing logged", "chain": "bowl-and-co",
     "profile": {"goal": "lose", "dailyCalories": 1600}, "loggedCalories": 0, "meal": "dinner", "prefs": {}},
    {"name": "C GLP-1, 450 cap", "chain": "cluck-house",
     "profile": {"goal": "glp1", "dailyCalories": 1500, "glp1MealCap": 450}, "loggedCalories": 300, "meal": "lunch", "prefs": {}},
    {"name": "D maintain, vegetarian only", "chain": "cluck-house",
     "profile": {"goal": "maintain", "dailyCalories": 2000}, "loggedCalories": 0, "meal": "lunch", "prefs": {"vegetarianOnly": True}},
    {"name": "E build muscle, no beef", "chain": "bowl-and-co",
     "profile": {"goal": "buildMuscle", "dailyCalories": 2800}, "loggedCalories": 0, "meal": "dinner", "prefs": {"noBeef": True}},
    {"name": "F out of budget", "chain": "cluck-house",
     "profile": {"goal": "lose", "dailyCalories": 2000}, "loggedCalories": 1900, "meal": "dinner", "prefs": {}},
    {"name": "G nothing fits a tiny budget", "chain": "bowl-and-co",
     "profile": {"goal": "glp1", "dailyCalories": 1400, "glp1MealCap": 150}, "loggedCalories": 0, "meal": "lunch", "prefs": {}},
    {"name": "H out of budget, vegetarian, nothing with 10 g protein", "chain": "cluck-house",
     "profile": {"goal": "maintain", "dailyCalories": 2000}, "loggedCalories": 1850, "meal": "dinner", "prefs": {"vegetarianOnly": True}},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--menus", default=None, help="folder with built chain-*.json (default: build fresh from data/source)")
    ap.add_argument("--write-fixture", action="store_true")
    ap.add_argument("--check", action="store_true", help="exit 1 if data/fixtures/ranking-golden.json is out of date")
    args = ap.parse_args()
    if args.menus:
        menus = Path(args.menus)
    else:  # build ONLY the sample chains, fresh, so real-chain errors can't block this
        import shutil, sys, tempfile
        sys.path.insert(0, str(ROOT / "tools"))
        import build_menus
        tmp = Path(tempfile.mkdtemp())
        for chain_id in sorted({s["chain"] for s in SCENARIOS}):
            shutil.copytree(ROOT / "data" / "source" / chain_id, tmp / "source" / chain_id)
        menus = tmp / "out"
        if build_menus.main(["--source", str(tmp / "source"), "--out", str(menus), "--quiet"]) != 0:
            raise SystemExit("sample chain build failed; run python3 tools/build_menus.py to see errors")
    results = []
    for s in SCENARIOS:
        chain = json.loads((menus / f"chain-{s['chain']}.json").read_text())
        r = rank(chain, s["profile"], s["loggedCalories"], s["meal"], s["prefs"])
        results.append({**s, "expected": r})
        if args.check:
            continue
        print(f"\n{s['name']}  [{r['mode']}] remaining={r['remaining']} budget={r['budget']}")
        names = r.get("names") or r["picks"]
        for i, p in enumerate(names):
            extra = f"   ({r['reasons'][i]})" if "reasons" in r else ""
            print(f"  {i + 1}. {p}{extra}")
    if args.check:
        fixture = json.loads((ROOT / "data" / "fixtures" / "ranking-golden.json").read_text())
        stale = [c["name"] for c, r in zip(fixture["cases"], results) if c["expected"] != r["expected"]]
        if stale or len(fixture["cases"]) != len(results):
            raise SystemExit(f"ranking-golden.json is out of date ({stale or 'case count differs'}). Run: python3 tools/reference_ranking.py --write-fixture")
        for chain_id in sorted({s["chain"] for s in SCENARIOS}):
            if (ROOT / "data" / "fixtures" / f"chain-{chain_id}.json").read_bytes() != (menus / f"chain-{chain_id}.json").read_bytes():
                raise SystemExit(f"data/fixtures/chain-{chain_id}.json is out of date. Run: python3 tools/reference_ranking.py --write-fixture")
    if args.write_fixture:
        out = ROOT / "data" / "fixtures" / "ranking-golden.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"description": "Golden cases for RankingEngine. Generated by tools/reference_ranking.py from the fictional sample chains (chain-*.json in this folder). Regenerate after changing sample data or ranking constants.",
                                   "cases": results}, indent=1, ensure_ascii=False) + "\n")
        for chain_id in sorted({s["chain"] for s in SCENARIOS}):
            (out.parent / f"chain-{chain_id}.json").write_bytes((menus / f"chain-{chain_id}.json").read_bytes())
        print(f"\nwrote {out.relative_to(ROOT)} and the sample chain files next to it")


if __name__ == "__main__":
    main()
