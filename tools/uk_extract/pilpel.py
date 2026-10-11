#!/usr/bin/env python3
"""Build data/source/pilpel/ from Pilpel's own nutrition calculator (full nutrition, per ingredient).

    python3 -I tools/uk_extract/pilpel.py --checked-on 2026-10-11 [--page FILE] [--out DIR]

Source: https://www.pilpel.co.uk/nutrition/ ("Nutrition calculator", linked from the site's main menu). Pilpel is a London falafel
chain: 7 sites on its own locations page on 2026-10-11 (Aldgate, Canary Wharf, Fenchurch Street, Fleet Street, Lime Street,
Spitalfields (Brushfield), St Paul's), one menu for all. The calculator lists 18 ingredients in five groups (Bread, Falafel, Salad,
Sauces, Toppings); each ingredient's figures sit in the page next to its checkbox (<span class="kcalSum" id="value-<id>-kcal"> and the
same for carbohydrates, protein, fat, saturates, calcium, iron and salt) and the calculator shows them when a visitor ticks it ("Based
on average serving per person"). robots.txt of www.pilpel.co.uk disallows only /wp/wp-admin/. One download of the page.

PILPEL PUBLISHES NO FIGURES FOR A FINISHED PITA OR BOX: only per ingredient, and the visitor adds up a build (the meal choices
"Falafel in Pita", "Falafel in Container", "Saabich", "Saabich in Container" change nothing in the sums: pilpel-nutrition.js only adds
the ticked ingredients). So every ingredient is its own item, as printed, never summed here (the same approach as BarBurrito's parts);
none is suggested as a meal on its own (rankable false). Calcium and iron have no column in the app and are not copied. Numbers are
copied exactly as printed (decimals kept). The page shows no date. No allergen information is published (none on the site).

Independent check: data/audit/verified/pilpel.json.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402  (robots.txt check)
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "pilpel"
URL = "https://www.pilpel.co.uk/nutrition/"
UA = ic.UA
GROUPS = {"Bread": "Bread", "Falafel": "Falafel", "Salad": "Salad", "Sauces": "Sauces", "Toppings": "Toppings"}
FIELDS = {"kcal": "calories", "carbohydrates": "carbs_g", "protein": "protein_g", "fat": "fat_g", "saturates": "sat_fat_g",
          "salt": "salt_g", "calcium": None, "iron": None}
EXPECTED = {"Bread": 2, "Falafel": 1, "Salad": 9, "Sauces": 2, "Toppings": 4}
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
NOTE = ("Pilpel publishes its figures per ingredient (an average serving of each), not for a finished pita or box: add up the bread, "
        "falafel, salads, sauces and toppings you choose. Pilpel publishes no allergen information online.")
assert len(NOTE) < 400


def fetch(dest: Path) -> bytes:
    if dest.exists():
        return dest.read_bytes()
    if not ic._robots_allow(URL):
        raise SystemExit(f"robots.txt disallows {URL}")
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": UA}), timeout=60) as r:
        data = r.read()
    time.sleep(1)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


def parse(text: str) -> list[dict]:
    start = text.find("Choose your ingredients")
    end = text.find('id="totalCalories"')
    if start < 0 or end < 0:
        raise SystemExit("the calculator's layout changed (no 'Choose your ingredients' / totals block)")
    body = text[start:end]
    items = []
    for sec in re.finditer(r'<div class="nut-cats bold">([^<]+)</div>(.*?)</ul>', body, re.S):
        group = html.unescape(sec.group(1)).strip()
        if group not in GROUPS:
            raise SystemExit(f"new ingredient group {group!r}")
        for li in re.finditer(r'<input type="checkbox" id="ingredient-([a-z0-9-]+)"[^>]*>\s*<label for="ingredient-\1">([^<]+)</label>(.*?)</li>',
                              sec.group(2), re.S):
            iid, name, spans = li.group(1), html.unescape(li.group(2)).strip(), li.group(3)
            vals = {}
            for m in re.finditer(r'<span class="hidden (\w+)Sum" id="value-' + re.escape(iid) + r'-(\w+)">([^<]*)</span>', spans):
                cls, key, v = m.group(1), m.group(2), m.group(3).strip()
                if key not in FIELDS or (cls != key and not (cls == "kcal" and key == "kcal")):
                    raise SystemExit(f"{name}: unexpected figure {cls}/{key}")
                if not NUMBER.match(v):
                    raise SystemExit(f"{name}: {key} printed as {v!r}")
                vals[key] = v
            if set(vals) != set(FIELDS):
                raise SystemExit(f"{name}: figures {sorted(vals)}, expected {sorted(FIELDS)}")
            items.append({"group": group, "id_on_page": iid, "name": name, "vals": vals})
    counts = {g: sum(1 for i in items if i["group"] == g) for g in GROUPS}
    if counts != EXPECTED:
        raise SystemExit(f"ingredient counts {counts}, expected {EXPECTED}: the calculator changed, re-check it")
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--page", type=Path, default=ROOT.parent / "pilpel-nutrition.html")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    raw = fetch(args.page)
    rows = parse(raw.decode("utf-8", "replace"))
    items = []
    for r in rows:
        it = {"name": r["name"], "category": GROUPS[r["group"]], "serving": "average serving", "rankable": False,
              "notes": f"Pilpel nutrition calculator, group {r['group']}, ingredient id {r['id_on_page']}; one ingredient of a build, "
                       f"not a finished meal"}
        for key, col in FIELDS.items():
            if col:
                it[col] = r["vals"][key]
        items.append(it)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Pilpel", cuisine="Middle Eastern",
        source_title=f"Pilpel nutrition calculator (pilpel.co.uk/nutrition, values per ingredient; no date shown; read {args.checked_on})",
        source_url=URL, checked_on=args.checked_on, aliases=["pilpel", "pilpel falafel"], items=items, out=args.out, note=NOTE)
    print(f"page sha256 {hashlib.sha256(raw).hexdigest()}; wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
