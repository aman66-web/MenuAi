"""Shared helpers for UK chain extractors (see docs/UK_DATA_PLAYBOOK.md).

An extractor reads the chain's official file, builds a list of item dicts with the numbers EXACTLY as printed
(strings such as "<0.5", "2.20"), and calls write_chain_folder(). Nothing here converts, rounds or estimates.
"""
import csv
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ITEM_FIELDS = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg",
               "salt_g", "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
NUTRIENT_KEYS = ["calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g", "sugar_g", "fiber_g"]


def slug(name: str) -> str:
    """'Chicken & Bacon Melt (large)' -> 'chicken-and-bacon-melt-large'."""
    s = name.lower().replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "item"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_chain_folder(*, chain_id: str, name: str, cuisine: str, source_title: str, source_url: str, checked_on: str,
                       aliases: list[str], items: list[dict], out: Path | None = None, note: str = "",
                       holdback: list[tuple[str, str]] | None = None) -> Path:
    """Write data/source/<chain_id>/ (or `out`). Each item dict needs name, category and the four required numbers
    (calories, protein_g, carbs_g, fat_g); every other key is optional ('' = not published). Items keep their order
    inside a category and categories keep first-seen order. Ids come from the name; clashes get a numeric suffix
    ONLY if the rows are different products (identical duplicate rows should be dropped by the caller)."""
    out = Path(out) if out else ROOT / "data" / "source" / chain_id
    out.mkdir(parents=True, exist_ok=True)
    seen: dict[str, int] = {}
    rows = []
    for it in items:
        for key in ("name", "category", "calories", "protein_g", "carbs_g", "fat_g"):
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
        rows.append(row)
    order: list[str] = []
    for r in rows:
        if r["category"] not in order:
            order.append(r["category"])
    rows.sort(key=lambda r: order.index(r["category"]))
    with open(out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS)
        w.writeheader()
        w.writerows(rows)
    with open(out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([chain_id, name, cuisine, "standard", source_title, source_url, checked_on, "|".join(aliases), ""])
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
