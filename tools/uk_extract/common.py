"""Shared helpers for UK chain extractors (see docs/UK_DATA_PLAYBOOK.md).

An extractor reads the chain's official file, builds a list of item dicts with the numbers EXACTLY as printed
(strings such as "<0.5", "2.20"), and calls write_chain_folder(). Nothing here converts, rounds or estimates.
"""
from __future__ import annotations
import csv
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Extra columns some guides print (docs/DATA.md "Extra nutrients"): copied as printed when present, blank otherwise.
EXTRA_KEYS = ["energy_kj", "weight_g", "mono_fat_g", "poly_fat_g", "trans_fat_g", "caffeine_mg"]
ITEM_FIELDS = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg",
               "salt_g", "sugar_g", "fiber_g", *EXTRA_KEYS, "tags", "limited_time", "rankable", "components", "added_on", "notes"]
NUTRIENT_KEYS = ["calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g", "sugar_g", "fiber_g", *EXTRA_KEYS]


def slug(name: str) -> str:
    """'Chicken & Bacon Melt (large)' -> 'chicken-and-bacon-melt-large'."""
    s = name.lower().replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "item"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# ---------------------------------------------------------------- allergens (docs/DATA.md "Allergens")
# Printed allergen words -> (key, specific). Only words a guide actually prints belong here; an unknown word stops the run
# (allergen_words raises), so nothing is ever guessed. Keys are the 14 UK allergens used by tools/build_menus.py.
_A = {
    "celery": ("celery", None), "celeriac": ("celery", None),
    "gluten": ("gluten", None), "cereals containing gluten": ("gluten", None), "cereals with gluten": ("gluten", None),
    "cereal containing gluten": ("gluten", None), "cereals": ("gluten", None),
    "wheat": ("gluten", "wheat"), "rye": ("gluten", "rye"), "barley": ("gluten", "barley"), "oats": ("gluten", "oats"),
    "oat": ("gluten", "oats"), "spelt": ("gluten", "spelt"), "kamut": ("gluten", "kamut"), "khorasan": ("gluten", "kamut"),
    "crustaceans": ("crustaceans", None), "crustacean": ("crustaceans", None),
    "eggs": ("eggs", None), "egg": ("eggs", None),
    "fish": ("fish", None), "lupin": ("lupin", None), "milk": ("milk", None), "dairy": ("milk", None),
    "molluscs": ("molluscs", None), "mollusc": ("molluscs", None), "mollusks": ("molluscs", None),
    "mustard": ("mustard", None),
    "nuts": ("nuts", None), "tree nuts": ("nuts", None), "tree nut": ("nuts", None), "nut": ("nuts", None),
    "almond": ("nuts", "almond"), "almonds": ("nuts", "almond"), "almond nuts": ("nuts", "almond"), "hazelnut": ("nuts", "hazelnut"), "hazelnuts": ("nuts", "hazelnut"), "hazelnut nuts": ("nuts", "hazelnut"),
    "walnut": ("nuts", "walnut"), "walnuts": ("nuts", "walnut"), "walnut nuts": ("nuts", "walnut"), "cashew": ("nuts", "cashew"), "cashews": ("nuts", "cashew"),
    "cashew nuts": ("nuts", "cashew"), "pecan": ("nuts", "pecan"), "pecans": ("nuts", "pecan"), "pecan nuts": ("nuts", "pecan"),
    "brazil nut": ("nuts", "brazil nut"), "brazil nuts": ("nuts", "brazil nut"), "pistachio": ("nuts", "pistachio"),
    "pistachios": ("nuts", "pistachio"), "pistachio nuts": ("nuts", "pistachio"), "macadamia": ("nuts", "macadamia"),
    "macadamias": ("nuts", "macadamia"), "macadamia nuts": ("nuts", "macadamia"), "queensland nuts": ("nuts", "macadamia"),
    "peanuts": ("peanuts", None), "peanut": ("peanuts", None),
    "sesame": ("sesame", None), "sesame seeds": ("sesame", None), "sesame seed": ("sesame", None),
    "soya": ("soya", None), "soy": ("soya", None), "soybeans": ("soya", None), "soya beans": ("soya", None),
    "sulphites": ("sulphites", None), "sulphite": ("sulphites", None), "sulphur dioxide": ("sulphites", None),
    "sulphur dioxide and sulphites": ("sulphites", None), "sulphur dioxide/sulphites": ("sulphites", None),
    "sulphites/sulphur dioxide": ("sulphites", None), "sulphur dioxide & sulphites": ("sulphites", None),
    "sulfites": ("sulphites", None),
}


def allergen_words(words: list[str], where: str, extra: dict | None = None) -> tuple[set[str], set[str], set[str]]:
    """Printed allergen words -> (keys, cereals, tree nuts). Raises on any word not in the list above. `extra` adds a
    chain's own printed spellings (lower-case word -> (key, specific or None)), kept in that chain's script."""
    keys, cereals, nuts = set(), set(), set()
    for raw in words:
        w = " ".join(raw.strip().strip(".").lower().split())
        if not w:
            continue
        table = {**_A, **(extra or {})}
        if w not in table:
            raise SystemExit(f"{where}: unknown allergen word {raw!r}: check the guide and add it to common._A if it is one of the 14")
        key, specific = table[w]
        keys.add(key)
        if specific and key == "gluten":
            cereals.add(specific)
        elif specific and key == "nuts":
            nuts.add(specific)
    return keys, cereals, nuts


def write_allergens(out: Path, chain_id: str, rows: list[tuple[str, dict]], guide: dict | None) -> None:
    """allergen_guide.csv always when `guide` is given; allergens.csv only when every item has its allergens (all or
    nothing: a chain read partially gets the guide link only). Each allergens dict: contains, may_contain (sets of keys),
    cereals, nuts (sets). Removes stale files when the guide is not given."""
    for f in ("allergens.csv", "allergen_guide.csv"):
        (out / f).unlink(missing_ok=True)
    if guide is None:
        return
    with open(out / "allergen_guide.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["title", "url", "checked_on", "may_contain_published"])
        w.writerow([guide["title"], guide["url"], guide["checked_on"], "yes" if guide["may_contain_published"] else "no"])
    if not rows or any(a is None for _, a in rows):
        return
    with open(out / "allergens.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "contains", "may_contain", "cereals", "nuts"])
        for item_id, a in rows:
            contains = set(a.get("contains", ()))
            may = set(a.get("may_contain", ())) - contains
            w.writerow([item_id, "|".join(sorted(contains)), "|".join(sorted(may)),
                        "|".join(sorted(a.get("cereals", ()))) if "gluten" in contains else "",
                        "|".join(sorted(a.get("nuts", ()))) if "nuts" in contains else ""])


def write_chain_folder(*, chain_id: str, name: str, cuisine: str, source_title: str, source_url: str, checked_on: str,
                       aliases: list[str], items: list[dict], out: Path | None = None, note: str = "",
                       holdback: list[tuple[str, str]] | None = None, allergen_guide: dict | None = None,
                       nutrition_level: str = "full") -> Path:
    """Write data/source/<chain_id>/ (or `out`). Each item dict needs name, category and the four required numbers
    (calories, protein_g, carbs_g, fat_g); every other key is optional ('' = not published). Items keep their order
    inside a category and categories keep first-seen order. Ids come from the name; clashes get a numeric suffix
    ONLY if the rows are different products (identical duplicate rows should be dropped by the caller)."""
    out = Path(out) if out else ROOT / "data" / "source" / chain_id
    out.mkdir(parents=True, exist_ok=True)
    seen: dict[str, int] = {}
    rows = []
    for it in items:
        required = ("name", "category", "calories") if nutrition_level == "calories" else ("name", "category", "calories", "protein_g", "carbs_g", "fat_g")
        for key in required:
            if str(it.get(key, "")).strip() == "":
                raise ValueError(f"{chain_id}: item {it.get('name')!r} is missing {key}")
        base = it.get("id") or slug(it["name"])
        n = seen.get(base, 0)
        seen[base] = n + 1
        row = {k: "" for k in ITEM_FIELDS}
        row.update({k: ("" if v is None else str(v)) for k, v in it.items() if k in ITEM_FIELDS})
        row["id"] = base if n == 0 else f"{base}-{n + 1}"
        row["limited_time"] = str(bool(it.get("limited_time", False))).lower()
        row["rankable"] = str(bool(it.get("rankable", True))).lower()
        row["_allergens"] = it.get("allergens")
        rows.append(row)
    order: list[str] = []
    for r in rows:
        if r["category"] not in order:
            order.append(r["category"])
    rows.sort(key=lambda r: order.index(r["category"]))
    write_allergens(out, chain_id, [(r["id"], r.pop("_allergens")) for r in rows], allergen_guide)
    with open(out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS)
        w.writeheader()
        w.writerows(rows)
    with open(out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        calories_only = nutrition_level == "calories"  # docs/DATA.md: the chain publishes calories only
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample", *(["nutrition_level"] if calories_only else [])])
        w.writerow([chain_id, name, cuisine, "standard", source_title, source_url, checked_on, "|".join(aliases), "", *(["calories"] if calories_only else [])])
    (out / "components.csv").write_text("id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (out / "modifiers.csv").write_text("item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")
    if note.strip():
        (out / "note.txt").write_text(note.strip() + "\n", encoding="utf-8")
    if holdback:
        with open(out / "holdback.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["item_id", "reason"])
            w.writerows(holdback)
    return out
