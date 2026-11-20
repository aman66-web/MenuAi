#!/usr/bin/env python3
"""Turn the stored reads of tools/groceries/labels_chrome.js into data/groceries/nutrition/<shop>.csv (the same columns and rules as sainsburys.csv).

    python3 tools/groceries/labels_chrome_ingest.py <shop> [--page-base URL]

Reads data/groceries/nutrition/raw-<shop>/chrome.jsonl (one JSON line per product page, as the extractor returned it) and
data/groceries/recipe-candidates/<shop>.csv (the products asked for). A row is written only when:
  - the page is the product asked for (its id, and its title naming the same product as the shop's list: most of the list's words appear in it);
  - the table has a per 100 g or per 100 ml column (its heading says so), copied exactly as printed ("<0.5" kept as printed; nothing computed);
  - a heading that says the figures are for the food cooked, prepared, drained... puts that word in `state`;
  - energy, fat, carbohydrate and protein are all printed, kJ and kcal agree within 7%, and build_groceries.implausible() accepts the numbers.
Everything else is left out and counted in the summary (the product then shows no numbers in the app, never guessed ones).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402

PAGE_BASE = {"asda": "https://www.asda.com/groceries/product/", "aldi": "https://www.aldi.co.uk/product/",
             "tesco": "https://www.tesco.com/groceries/en-GB/products/", "marks-and-spencer": "https://www.marksandspencer.com/food/",
             "sainsburys": "https://www.sainsburys.co.uk/gol-ui/product/", "waitrose": "https://www.waitrose.com/ecom/products/x/",
             "morrisons": "https://groceries.morrisons.com/products/x/", "iceland": "https://www.iceland.co.uk/p/x/{id}.html"}
# Sainsbury's main nutrition file is written by t2_sainsburys.py: Chrome reads go to a file of their own, which build_all_products.py uses only where the main
# file has no row (it never replaces one)
OUT_NAME = {"sainsburys": "sainsburys-chrome", "morrisons": "morrisons-chrome", "iceland": "iceland-chrome"}


# an ingredients list ends where the page's next section starts: reads made before reader 4 ran on into it ("...ascorbic acid)Allergy AdviceMay contain
# nuts...LifestyleThis product is suitable for Vegetarians" on Waitrose); the same cut reader 4 makes, capitalised headings only
SECTION = re.compile(r"\s*(Allergy Advice|ALLERGY ADVICE|Allergy Information|ALLERGY INFORMATION|Allergen Information|Lifestyle|Storage|Dietary Information|"
                     r"Preparation and Usage)(?=[A-Z:\s]|$).*$")


def spaces(text: str) -> str:
    """A space the page wrote as an HTML entity ("&nbsp;", which the reader's "&" -> " and " turned into " and nbsp;") and zero-width spaces are spaces."""
    t = re.sub(r"\s*\band (?:nbsp|#160);\s*", " ", text or "").replace("\u200b", "")
    return re.sub(r"[ \t]{2,}", " ", re.sub(r"\band amp;", "and", t)).strip()


def section_cut(text: str) -> str:
    """The ingredients list as printed, cut at the page's next section; text that isn't an ingredients list at all is dropped (""): the nutrition table read under
    an "Ingredients" heading by an earlier reader, a shop's own notices (M&S "Handling raw meat safely...", Waitrose "Warnings: Wash before use", Asda's
    "Product Information" terms) and a bare allergen line ("Contains Milk.", which belongs with the allergens, not the list)."""
    t = SECTION.sub("", spaces(text)).strip()
    if NOT_A_LIST.match(t) or re.search(r"typical values|nutrition(?:al)? (?:information|values)|\bkcal\b|\d\s*kj\b", t, re.I):
        return ""
    return t


NOT_A_LIST = re.compile(r"(?:handling raw meat safely|warnings|asda product information|nutritional values|typical values|for try me love me|features|storage)(?=[A-Z0-9:\s\u200b]|$)|contains [a-z ,&]+\.?\s*$", re.I)


def page_address(base: str, page: str) -> str:
    return base.format(id=page) if "{id}" in base else base + page
STATE = re.compile(r"\b(cooked|prepared|drained|grilled|baked|fried|roasted|oven baked|microwaved|as consumed|as served|reconstituted|made up|boiled|steamed|heated)\b", re.I)
NUM = re.compile(r"(<\s*)?(\d+(?:\.\d+)?)")


def same_product(list_name: str, page_title: str) -> bool:
    """The page is the product the list names: most of the list's words appear in the page's title, or (shops whose titles leave out the brand and the size,
    like Aldi: "NATURE'S PICK Bananas 5 Each" -> "Bananas") every word of the page's title appears in the list's name."""
    lw, hw = words(list_name), words(page_title)
    if not lw or not hw:
        return False
    return len(lw & hw) / len(lw) >= 0.5 or (len(hw) >= 1 and hw <= lw)


def words(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().replace("&", " and ")
    return set(re.findall(r"[a-z0-9]+", s))


def thousands(text: str) -> str:
    """A thousands separator taken out ("1,222.9 kJ" -> "1222.9 kJ", as Aldi prints energy), then a decimal comma read as a point ("Fat 1,5g" -> "1.5g", as
    labels printed for several countries do; before 18 November 2026 these were cut at the comma, "1,5" read as 1). "0,125" is a decimal, never a thousand."""
    text = re.sub(r"(?<![\d,.])([1-9]\d{0,2}),(\d{3})(?![\d,])", r"\1\2", text or "")
    return re.sub(r"(?<![\d,.])(\d+),(\d{1,3})(?![\d,])", r"\1.\2", text)


def printed(cell: str) -> str | None:
    """The first number in a cell exactly as printed, with a leading "<" kept ("<0.5"); None when there is none."""
    if re.search(r"\d\s*[-–]\s*\d", cell or ""):
        return None  # a range ("Protein 0-1g") is not one figure
    m = NUM.search(thousands(cell))
    if not m:
        # "nil" is how some labels print none at all ("Fat nil")
        return "0" if re.fullmatch(r"\s*nil\s*(g|mg)?\s*", cell or "", re.I) else None
    return ("<" if m.group(1) else "") + m.group(2)


def energy(cells: list[str], label: str) -> tuple[str | None, str | None]:
    """(kJ, kcal) from one energy cell ("99kJ/23kcal", "99 kJ 23 kcal") or a labelled row ("Energy (kcal)" -> kcal only)."""
    text = thousands(" ".join(cells))
    kj = re.search(r"(\d+(?:\.\d+)?)\s*kj", text, re.I)
    kc = re.search(r"(\d+(?:\.\d+)?)\s*kcal", text, re.I)
    if not kj and not kc:
        v = printed(text)
        if re.search(r"kcal", label, re.I):
            return None, v
        if re.search(r"kj", label, re.I):
            return v, None
        return None, None
    return (kj.group(1) if kj else None), (kc.group(1) if kc else None)


def read_table(rec: dict) -> tuple[dict | None, str]:
    rows = rec.get("nut") or []
    if not rows:
        return None, "no table"
    header = rows[0]
    col, per = None, None
    for i, h in enumerate(header):
        # the first column holds the row names, even when its heading says "Typical values per 100g" (Sainsbury's fruit)
        if i == 0 and len(header) > 1:
            continue
        m = re.search(r"100\s*(g|ml)(?:ms|rams)?\b", h, re.I)  # "Per 100g", "Per 100gms", "Per 100 grams"
        if m and not re.search(r"%|\bri\b|reference", h, re.I):
            col, per = i, m.group(1).lower()
            break
    if col is None:
        m = re.search(r"per\s*100\s*(g|ml)(?:ms|rams)?\b", rec.get("above", ""), re.I)
        if m and len(header) >= 2:
            col, per = 1, m.group(1).lower()
    if col is None:
        return None, "no per-100 column"
    heading = header[col] + " " + (rec.get("above") or "")
    st = STATE.search(header[col])
    state = st.group(1).lower() if st else ""
    out = {"per": per, "state": state, "kj": None, "kcal": None}
    keys = [("saturates_g", r"saturate"), ("sugars_g", r"sugar"), ("fat_g", r"^\W*(?:total )?fat"), ("carbs_g", r"carbohydrate|carohydrate"), ("fibre_g", r"fibre|fiber"), ("protein_g", r"protein|protien"), ("salt_g", r"^\W*salt")]
    last_energy = False
    for r in rows[1:]:
        if len(r) <= col:
            continue
        label, cell = r[0], r[col]
        # the row under "Energy" when that label spans two rows (Sainsbury's): its cells sit one column to the left, so the per-100 figure is in the label's place
        # ("473kcal", "227kcal", "11%"); the kJ/kcal check below still has to agree
        if last_energy and col >= 1 and re.fullmatch(r"\s*<?\s*\d[\d,.]*\s*(kcal|kj)\s*", label, re.I):
            kj, kc = energy([r[col - 1]], "")
            out["kj"] = out["kj"] or kj
            out["kcal"] = out["kcal"] or kc
            last_energy = False
            continue
        # the second energy row may be headed only by its unit ("- kcal" on Morrisons, "kcal" on Sainsbury's oils)
        if re.search(r"energy", label, re.I) or (last_energy and (not label.strip() or re.fullmatch(r"\W*(kcal|kj)\W*", label, re.I)) and re.search(r"kcal|kj|^\s*<?\d", cell + " " + label, re.I)):
            kj, kc = energy([cell], label)
            out["kj"] = out["kj"] or kj
            out["kcal"] = out["kcal"] or kc
            last_energy = True
            continue
        last_energy = False
        for k, pat in keys:
            if re.search(pat, label, re.I) and out.get(k) is None:
                out[k] = printed(cell)
                break
    return out, ""


NUTRITION = ROOT / "data" / "groceries" / "nutrition"


def read_status(shop: str, base: Path | None = None) -> dict[str, str]:
    """What reading each product's own page found, by the shop's product id: "table" (the page printed a nutrition table), "no table" (it was read and printed
    none), "blocked" or "unreadable"; a product missing from the result has not been read. Only "no table" lets build_all_products.py give loose fresh produce the
    government's figures (2026-11-20: a product whose page wasn't read must say so, never take the figures of a raw vegetable). From every store of page reads:
    raw-<shop>/chrome.jsonl (Chrome readers), raw/results_K.tsv and raw/none_K.txt (Sainsbury's tier-2 readers) and raw-iceland/pages.jsonl (Iceland's own
    feed). The newest read of a page wins within one store; a page any store found a table on counts as "table"."""
    base = base or NUTRITION
    out: dict[str, str] = {}

    def put(pid: str, status: str) -> None:
        if not pid:
            return
        if out.get(pid) == "table":
            return  # a table found anywhere stands
        out[pid] = status

    chrome = base / f"raw-{shop}" / "chrome.jsonl"
    if chrome.exists():
        reads: dict[str, dict] = {}
        with open(chrome, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                rid = str(rec.get("id") or "")
                reads[rid] = rec
                m = re.search(r"-0*(\d+)$", rid)  # Aldi's page address ends with the zero-padded product id
                if m:
                    reads[m.group(1)] = rec
        for rid, rec in reads.items():
            put(rid, "blocked" if rec.get("blocked") else "unreadable" if rec.get("unreadable") else "table" if rec.get("nut") else "no table")
    if shop == "sainsburys":
        t2 = base / "raw"
        for path in sorted(t2.glob("results_*.tsv")) if t2.exists() else []:
            for line in path.read_text(encoding="utf-8").splitlines():
                put(line.split("\t", 1)[0].strip(), "table")
        for path in sorted(t2.glob("none_*.txt")) if t2.exists() else []:
            for line in path.read_text(encoding="utf-8").splitlines():
                put(line.split("\t", 1)[0].strip(), "no table")
    if shop == "iceland":
        feed = base / "raw-iceland" / "pages.jsonl"
        if feed.exists():
            for line in feed.read_text(encoding="utf-8").splitlines():
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("status") != "ok":
                    continue
                info = rec.get("nutritionInformation") or {}
                put(str(rec.get("product_id") or ""), "table" if info.get("nutrients") else "no table")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("shop")
    ap.add_argument("--page-base")
    a = ap.parse_args()
    base = a.page_base or PAGE_BASE[a.shop]
    want, pages = {}, {}
    # every product in the shop's published list (founder 2026-11-17: nutrition for every product), and the recipe candidates (same ids)
    listing = ROOT / "web" / "public" / "groceries" / "all" / f"{a.shop}.json"
    if listing.exists():
        for row in json.loads(listing.read_text(encoding="utf-8"))["products"]:
            want[row[0]] = row[1]
            pages[row[0]] = (row[11] if len(row) > 11 and isinstance(row[11], str) and row[11] else row[0])
    cand = ROOT / "data" / "groceries" / "recipe-candidates" / f"{a.shop}.csv"
    if cand.exists():
        with open(cand, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                want.setdefault(r["product_id"], r["name"])
                pages.setdefault(r["product_id"], r.get("page") or r["product_id"])
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{a.shop}" / "chrome.jsonl"
    reads: dict[str, dict] = {}
    with open(raw, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            rid = str(rec.get("id"))
            reads[rid] = rec  # the last read of a page wins
            m = re.search(r"-0*(\d+)$", rid)  # Aldi's page address ends with the zero-padded product id
            if m:
                reads[m.group(1)] = rec
    # products whose page shows another product's label (data/groceries/nutrition/holdback.csv): never used, counted below
    hb = ROOT / "data" / "groceries" / "nutrition" / "holdback.csv"
    held = {r["product_id"] for r in csv.DictReader(open(hb, newline="", encoding="utf-8")) if r["shop"] == a.shop} if hb.exists() else set()
    counts: dict[str, int] = {}
    rows = []
    facts = []  # the ingredients and allergens as each page printed them (data/groceries/ingredients/<shop>.csv)
    for pid, name in want.items():
        if pid in held:
            counts["held back"] = counts.get("held back", 0) + 1
            continue
        rec = reads.get(pid)
        if rec is not None and not rec.get("blocked") and (rec.get("ingredients") or rec.get("bold") or rec.get("allergy")):
            if same_product(name, rec.get("h1", "")):
                may = [m for m in (rec.get("mayContain") or []) if "{" not in m and len(m) < 240]
                facts.append({"product_id": pid, "ingredients": section_cut(rec.get("ingredients", "")), "allergens_bold": "; ".join(spaces(b) for b in (rec.get("bold") or [])),
                              "allergy_info": spaces(rec.get("allergy", "")), "may_contain": " | ".join(spaces(m) for m in may), "checked_on": rec.get("checked_on", ""), "page_url": page_address(base, pages[pid])})
        if rec is None and pid not in reads:
            continue  # not read yet (every product in the list is asked for; only the read ones count)
        if rec is not None and rec.get("unreadable"):
            counts["unreadable in Chrome"] = counts.get("unreadable in Chrome", 0) + 1
            continue
        if rec is None:
            counts["not read"] = counts.get("not read", 0) + 1
            continue
        if rec.get("blocked"):
            counts["blocked page"] = counts.get("blocked page", 0) + 1
            continue
        if not same_product(name, rec.get("h1", "")):  # the id is the product asked for; the shop may have renamed it since the list was read ("Sweet & Earthy Parsnips" -> "British Parsnips")
            counts["title differs"] = counts.get("title differs", 0) + 1
            continue
        t, why = read_table(rec)
        if t is None:
            counts[why] = counts.get(why, 0) + 1
            continue
        main_ = [bg.printed_num(t.get(k)) for k in ("kcal", "protein_g", "carbs_g", "fat_g")]
        if None in main_:
            counts["a main figure missing"] = counts.get("a main figure missing", 0) + 1
            continue
        kj = bg.printed_num(t.get("kj"))
        if kj is not None and main_[0] and abs(kj / (main_[0] * 4.184) - 1) > 0.07:
            counts["kJ and kcal disagree"] = counts.get("kJ and kcal disagree", 0) + 1
            continue
        if bg.implausible(*main_, None, bg.printed_num(t.get("fibre_g"))):
            counts["implausible"] = counts.get("implausible", 0) + 1
            continue
        rows.append({"product_id": pid, "per": t["per"], "state": t["state"], "kj": t.get("kj") or "", "kcal": t["kcal"], "fat_g": t["fat_g"], "saturates_g": t.get("saturates_g") or "",
                     "carbs_g": t["carbs_g"], "sugars_g": t.get("sugars_g") or "", "fibre_g": t.get("fibre_g") or "", "protein_g": t["protein_g"], "salt_g": t.get("salt_g") or "",
                     "checked_on": rec.get("checked_on", ""), "page_url": page_address(base, pages[pid])})
    out = ROOT / "data" / "groceries" / "nutrition" / f"{OUT_NAME.get(a.shop, a.shop)}.csv"
    cols = ["product_id", "per", "state", "kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g", "checked_on", "page_url"]
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["product_id"]))
    fdir = ROOT / "data" / "groceries" / "ingredients"
    fdir.mkdir(parents=True, exist_ok=True)
    with open(fdir / f"{OUT_NAME.get(a.shop, a.shop)}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["product_id", "ingredients", "allergens_bold", "allergy_info", "may_contain", "checked_on", "page_url"])
        w.writeheader()
        w.writerows(sorted(facts, key=lambda r: r["product_id"]))
    print(f"{a.shop}: {len(rows)} nutrition rows and {len(facts)} ingredient lists written from {sum(1 for k in want if k in reads)} pages read; left out: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
