#!/usr/bin/env python3
"""Build data/source/papas-fish-and-chips/ from Papa's Fish & Chips' own nutrition page (six lab-report PDFs, December 2018).

    python3 tools/uk_extract/papas_fish_and_chips.py --pdfs DIR [--page DIR/nutritional-information.html] --checked-on 2026-10-09 [--fetch] [--out DIR]

Source (official, https://papasfishandchips.com/robots.txt allows it: only /wp-admin/ and WooCommerce upload folders are disallowed):
    https://papasfishandchips.com/nutritional-information/  links six one-page PDFs, one per item, in /wp-content/uploads/2018/12/
    Nutritional-Information-{Haddock,Chips,Sausage,Fishcake,Pattie,Mushy-Peas}.pdf (Microsoft Word 2010, created 23 Dec 2018, served
    Last-Modified 23 Dec 2018). Each is a Campden BRI (UKAS accredited laboratory No. 1079) report: rows Energy (KJ), Energy (Kcal),
    Fat, Carbohydrate, Protein, Total Sodium (mg), columns "Per 100g" and "Per Portion", and a printed "Portion weight".
    --fetch downloads the page and the six PDFs (one request each, 1.2 s apart, browser User-Agent, robots.txt checked).

The PDFs have NO text layer (the letters are vector outlines), so the numbers cannot be copied by a script. They were read from
the rendered pages (pdftoppm -r 150 and -r 400) with the Read tool, and every cell was confirmed twice by eye (full page and a
400 dpi crop of the table); tesseract OCR of each cell was only a first pass (it agreed on all but glyph-level slips, which are why
OCR is not trusted here). The values are therefore typed below in TABLE, as read, and this script is the guard that keeps them honest:
- it stops if a PDF's SHA-256 is not the one that was read (a new file must be re-read by eye and TABLE updated),
- it stops if a PDF gains a text layer,
- it re-computes, for every item, that the per-portion column equals the per-100 g column times the printed portion weight (within
  rounding), kJ is about 4.184 x kcal, and kcal is within 5% of 4 x protein + 4 x carbohydrate + 9 x fat,
- with --page it checks the chain's own calculator (the checkbox values on the nutrition page are kcal per regular portion) and the page's
  sentence "Regular Haddock & Chips is only 575 kcal per portion" (217 + 358) against the PDFs.
The per-100 g columns are used ONLY for those checks. Published figures are the per-portion column, exactly as printed; nothing is converted.

What is published (founder, 9 Oct 2026: full nutrition but old data, per-portion figures only):
  kcal, energy kJ, fat, carbohydrate, protein, sodium (mg, as printed: never converted to salt) and the portion weight, for five items.
  Not printed by the chain: saturates, sugars, fibre, salt. Per-100 g figures are never published.

Decisions and anomalies (all copied as printed, nothing corrected):
- Fishcake sodium: the row is labelled "Total Sodium (mg)" but the fishcake prints 1.27 (per 100 g) and 1.35 (per portion), which cannot be
  milligrams (the other items print 5 to 1100 in the same row; a fishcake cannot hold 1.35 mg of sodium). The unit is probably wrong on the
  chain's report (grams?), but converting would be a guess: the cell is left blank ("not published").
- Fishcake portion weight: printed 105 g, but its per-portion column is 1.06 x the per-100 g column (implies about 106 g, 1% more). Within
  laboratory rounding, so the printed figures are published as they are.
- Mushy Peas HELD BACK: the chain's own nutrition-page calculator gives 114 kcal for a regular portion of "Peas", which is exactly the lab
  report's PER-100 g figure; the report's PER-PORTION figure for its 173.4 g portion is 198 kcal. Two official figures for the same dish
  disagree, so neither is published (holdback.csv; the row stays in items.csv so a rerun can't bring it back by accident).
- Rankable: Battered Haddock, Battered Sausage and Fishcake (the chain's calculator lists them as MAIN) are rankable; Chips and Pattie (the
  calculator lists Pattie under both MAIN and SIDE, one set of figures) are not.
- Tags: the allergen guide says "Unless requested otherwise, our meals are fried in the highest quality refined and deodorised beef dripping"
  (page 4, "Meat free alternatives"), so every fried item (haddock, chips, sausage, fishcake, pattie) is tagged contains_beef; a vegetable-oil
  fryer exists at most sites, on request. "Sausage" in the name -> contains_pork (the playbook's list); the guide does not say what a Pattie is
  made of ("meat type not stated"). Nothing is tagged vegetarian: the chain's pages mark none of these items vegetarian.
- Chips print sodium 10.0 mg (5.0 per 100 g): plausible for unsalted chips and consistent across both columns, published as printed.

Allergens: link only (docs/DATA.md "Allergens", all or nothing). The chain's Allergen-Guide-5.pdf (13 pages, PDF created 2 Apr 2025, a matrix
of red = contains / amber = may contain ticks; dish names are outlines, no text layer) has separate TAKEAWAY and RESTAURANT matrices. Exact
names exist for Chips, Battered Sausage, Fishcake and Pattie, but the guide's row for the haddock is "HADDOCK" while the lab report says
"Battered Haddock" (the chain's calculator calls it "Haddock"; its 217 kcal equals the report's per-portion figure, so they are the same
dish), so not every published item matches by name and the rule is to publish the guide link only. If the founder accepts that one name
equivalence, the takeaway row HADDOCK reads: contains cereals containing gluten, fish, soya; may contain eggs, milk, mustard.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "papas-fish-and-chips"
SITE = "https://papasfishandchips.com"
PAGE_URL = SITE + "/nutritional-information/"
PDF_BASE = SITE + "/wp-content/uploads/2018/12/"
SOURCE_TITLE = "Papa's Fish & Chips nutritional information: Campden BRI lab reports, PDFs created 23 December 2018 (2018 data)"
ALLERGEN_TITLE = "Papa's Fish & Chips Allergen Guide: dishes and their allergen content, takeaway and restaurant (PDF created 2 April 2025)"
ALLERGEN_URL = SITE + "/wp-content/uploads/2019/03/Allergen-Guide-5.pdf"
ALIASES = ["papas fish and chips", "papa's fish and chips", "papas fish & chips", "papa's fish & chips"]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SERVING = "1 regular portion"  # the nutrition page: "All items ... represent the 'Regular' portion size served in Papa's Takeaways"
NOTE = ("Lab results from December 2018 (Campden BRI, UKAS accredited) for one regular takeaway portion of five items; the chain publishes no "
        "other figures. The fishcake's sodium is printed in a unit that can't be right, so it is not shown. Mushy peas are left out because "
        "the chain's own figures disagree. Fried in beef dripping unless the restaurant is asked for vegetable oil (not all can).")

# One entry per PDF, read by eye from the rendered page. kj/kcal/fat/carb/protein/sodium are strings exactly as printed, per 100 g and per
# portion; `weight` is the printed "Portion weight" in grams. `calc` is the chain's calculator label and kcal (checkbox value).
TABLE = [
    dict(id="battered-haddock", name="Battered Haddock", category="Mains", file="Nutritional-Information-Haddock.pdf",
         sha256="ea74f1336cba779f40323385ba674e742c7bd7d587e21c20f04f2712cfa43bf3", rankable=True, tags=["contains_beef"],
         weight="131.4", calc=("Haddock", 217),
         per100=dict(kj="692", kcal="165", fat="6.5", carb="4.4", protein="22.2", sodium="160"),
         portion=dict(kj="909", kcal="217", fat="8.5", carb="5.8", protein="29.2", sodium="210")),
    dict(id="battered-sausage", name="Battered Sausage", category="Mains", file="Nutritional-Information-Sausage.pdf",
         sha256="f3f0385700bec3c61e91a1449494c160a67629a97b98b9c41c488f72a333e214", rankable=True, tags=["contains_pork", "contains_beef"],
         weight="53.2", calc=("Battered Sausage", 174),
         per100=dict(kj="1360", kcal="328", fat="27.1", carb="7.9", protein="13.1", sodium="1100"),
         portion=dict(kj="724", kcal="174", fat="14.4", carb="4.2", protein="7.0", sodium="585")),
    dict(id="fishcake", name="Fishcake", category="Mains", file="Nutritional-Information-Fishcake.pdf",
         sha256="1a64e050d64dced8d4998cce9944c096ee900948a67014fbc342d4c3262ec8d6", rankable=True, tags=["contains_beef"],
         weight="105", calc=("Fishcake", 212),
         per100=dict(kj="839", kcal="200", fat="8.2", carb="23.3", protein="8.3", sodium="1.27"),
         portion=dict(kj="891", kcal="212", fat="8.7", carb="24.7", protein="8.8", sodium="1.35"),
         sodium_unit_wrong=True,
         notes="Sodium printed 1.27 per 100 g and 1.35 per portion under 'Total Sodium (mg)': not milligrams, left blank. Printed weight 105 g but "
               "the per-portion column is 1.06 x the per-100 g column (about 106 g): within laboratory rounding, copied as printed"),
    dict(id="chips", name="Chips", category="Sides", file="Nutritional-Information-Chips.pdf",
         sha256="cb18a1428073d80952069af70c6f75e765b6df2da9a5bdbe0d1f3f336ede55e7", rankable=False, tags=["contains_beef"],
         weight="200", calc=("Chips", 358),
         per100=dict(kj="753", kcal="179", fat="5.0", carb="29.5", protein="3.9", sodium="5.0"),
         portion=dict(kj="1504", kcal="358", fat="10.0", carb="58.9", protein="7.8", sodium="10.0"),
         notes="Sodium 10.0 mg per 200 g portion (5.0 per 100 g): consistent in both columns, copied as printed"),
    dict(id="pattie", name="Pattie", category="Sides", file="Nutritional-Information-Pattie.pdf",
         sha256="a63faf1bbe15833fff9c3b1864ea9ed6b79821273fd2973ee88484a231ab0d77", rankable=False, tags=["contains_beef"],
         weight="87.8", calc=("Pattie", 203),
         per100=dict(kj="963", kcal="231", fat="13.7", carb="24.3", protein="2.6", sodium="350"),
         portion=dict(kj="846", kcal="203", fat="12.0", carb="21.3", protein="2.3", sodium="307"),
         notes="The chain's calculator lists Pattie under MAIN and under SIDE with the same 203 kcal; meat type not stated"),
    dict(id="mushy-peas", name="Mushy Peas", category="Extras", file="Nutritional-Information-Mushy-Peas.pdf",
         sha256="288af6a6cb582d81ef5bd5aa79e2abbf6acaea25568c9e7f7bbd30b3b183da4b", rankable=False, tags=[],
         weight="173.4", calc=("Peas", 114),
         per100=dict(kj="483", kcal="114", fat="0.6", carb="20.1", protein="7.0", sodium="120.0"),
         portion=dict(kj="838", kcal="198", fat="1.0", carb="34.9", protein="12.1", sodium="208.0"),
         held_back=True,
         notes="Calculator says 114 kcal (= the per-100 g figure) for a regular portion of Peas; the report says 198 kcal per 173.4 g portion"),
]
HOLDBACK_REASON = {
    "mushy-peas": ("The chain's own nutrition-page calculator gives 114 kcal for a regular portion of peas (the lab report's per-100 g figure) but the "
                   "report's per-portion figure for its 173.4 g portion is 198 kcal: two official figures disagree, so neither is published"),
}
# The calculator on the nutrition page: checkbox groups in this order, labels as printed (stop if the page differs).
CALC_LABELS = [["Haddock", "Scampi", "Battered Sausage", "Fishcake", "Pattie"], ["Chips", "Salad", "Pattie"],
               ["Peas", "Beans", "Curry", "Gravy", "Breadcake"]]
CALC_VALUES = [[217, 274, 174, 212, 203], [358, 17, 203], [114, 112, 74, 40, 114]]
PDF_FIELDS = (("kj", "energy_kj"), ("kcal", "calories"), ("fat", "fat_g"), ("carb", "carbs_g"), ("protein", "protein_g"))


def fetch(url: str, dest: Path, rules: list) -> None:
    path = "/" + url.split("//", 1)[1].split("/", 1)[1]
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt disallows {path}: stop (never work round it); ask the founder to save the file in a browser")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        dest.write_bytes(r.read())
    time.sleep(1.2)


def num(s: str) -> float:
    return float(s)


def check_item(it: dict) -> list[str]:
    """Consistency checks between the two printed columns and the printed weight. Returns warnings; raises SystemExit on a failure."""
    notes = []
    w = num(it["weight"]) / 100.0
    for key, label in (("kj", "kJ"), ("kcal", "kcal"), ("fat", "fat"), ("carb", "carbohydrate"), ("protein", "protein"), ("sodium", "sodium")):
        per100, portion = it["per100"][key], it["portion"][key]
        expect = num(per100) * w
        decimals = len(portion.split(".")[1]) if "." in portion else 0
        tol = max(0.015 * expect, 1.01 * 10 ** (-decimals))
        if abs(expect - num(portion)) > tol:
            raise SystemExit(f"{it['name']}: per-portion {label} {portion} is not per-100 g {per100} x {it['weight']} g (= {expect:.2f}): "
                             "re-read the rendered page")
        if abs(expect - num(portion)) > 0.006 * max(expect, 1e-9) + 1.01 * 10 ** (-decimals) * 0.5 and key != "sodium":
            notes.append(f"{label}: {portion} printed vs {expect:.1f} from per-100 g x weight")
    p = it["portion"]
    ratio = num(p["kj"]) / num(p["kcal"])
    if not 4.10 <= ratio <= 4.30:
        raise SystemExit(f"{it['name']}: kJ/kcal = {ratio:.2f}, not about 4.184: re-read the rendered page")
    macro = 4 * num(p["protein"]) + 4 * num(p["carb"]) + 9 * num(p["fat"])
    if abs(macro - num(p["kcal"])) > 0.05 * num(p["kcal"]):
        raise SystemExit(f"{it['name']}: 4P+4C+9F = {macro:.0f} vs {p['kcal']} kcal: re-read the rendered page")
    return notes


def check_pdf(path: Path, it: dict) -> None:
    if not path.exists():
        raise SystemExit(f"missing {path} (use --fetch)")
    digest = sha256_file(path)
    if digest != it["sha256"]:
        raise SystemExit(f"{path.name} changed (sha256 {digest}): render it (pdftoppm -r 150), read the table by eye and update TABLE")
    text = subprocess.run(["pdftotext", str(path), "-"], capture_output=True, text=True, check=True).stdout
    if text.strip():
        raise SystemExit(f"{path.name} now has a text layer: write a text reader instead of the typed TABLE")


def check_page(page: Path) -> list[str]:
    html = page.read_text(encoding="utf-8", errors="replace")
    groups = re.findall(r'<span class="wpcf7-list-item-label">([^<]*)</span>\s*<input type="checkbox" name="(checkbox_custom-\d+)\[\]" value="(\d+)"', html)
    if not groups:  # label after the input in some builds
        groups = [(b, a, c) for a, c, b in re.findall(r'<input type="checkbox" name="(checkbox_custom-\d+)\[\]" value="(\d+)"\s*/?>\s*<span[^>]*>([^<]*)</span>', html)]
    by_group: dict = {}
    for label, group, value in groups:
        by_group.setdefault(group, []).append((label.strip(), int(value)))
    got_labels = [[l for l, _ in v] for _, v in sorted(by_group.items())]
    got_values = [[v for _, v in vals] for _, vals in sorted(by_group.items())]
    if got_labels != CALC_LABELS or got_values != CALC_VALUES:
        raise SystemExit(f"the page's calculator changed (labels {got_labels}, kcal {got_values}): re-check TABLE against it")
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    if "575 kcal per portion" not in text or 217 + 358 != 575:
        raise SystemExit("the page no longer says 'Regular Haddock & Chips is only 575 kcal per portion' (217 + 358): re-check")
    return [f"calculator kcal {dict((l, v) for l, v in zip(CALC_LABELS[0] + CALC_LABELS[1] + CALC_LABELS[2], CALC_VALUES[0] + CALC_VALUES[1] + CALC_VALUES[2]))}",
            "page sentence 'Regular Haddock & Chips is only 575 kcal per portion' = 217 + 358 (haddock + chips), confirmed"]


def build(pdf_dir: Path, page: Path | None) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    items, holdback = [], []
    if page is not None:
        report += check_page(page)
    for it in TABLE:
        check_pdf(pdf_dir / it["file"], it)
        report += [f"{it['name']}: {n}" for n in check_item(it)]
        if page is not None:
            calc_label, calc_kcal = it["calc"]
            if calc_kcal != int(it["portion"]["kcal"]):
                if it.get("held_back"):
                    report.append(f"{it['name']}: calculator '{calc_label}' = {calc_kcal} kcal vs report {it['portion']['kcal']} kcal per portion: held back")
                else:
                    raise SystemExit(f"{it['name']}: calculator {calc_kcal} kcal differs from the report's {it['portion']['kcal']}: hold the row back or re-read")
            elif it.get("held_back"):
                raise SystemExit(f"{it['name']}: the calculator now agrees with the report ({calc_kcal} kcal): remove the holdback after re-reading")
        p = it["portion"]
        row = {"id": it["id"], "name": it["name"], "category": it["category"], "serving": SERVING, "weight_g": it["weight"],
               "calories": p["kcal"], "energy_kj": p["kj"], "protein_g": p["protein"], "carbs_g": p["carb"], "fat_g": p["fat"],
               "sodium_mg": "" if it.get("sodium_unit_wrong") else p["sodium"],
               "tags": "|".join(it["tags"]), "rankable": it["rankable"], "notes": it.get("notes", ""), "allergens": None}
        items.append(row)
        if it.get("held_back"):
            holdback.append((it["id"], HOLDBACK_REASON[it["id"]]))
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters; the limit is 400")
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs", type=Path, required=True, help="folder holding the six PDFs (and the saved page)")
    ap.add_argument("--page", type=Path, default=None, help="the saved nutritional-information.html (enables the calculator cross-check)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDFs were compared with the live page")
    ap.add_argument("--fetch", action="store_true", help="download the page and the six PDFs into --pdfs first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    page = args.page
    if args.fetch:
        args.pdfs.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(SITE + "/robots.txt", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            rules = robots_rfc.parse(r.read().decode("utf-8", "replace"))
        time.sleep(1.2)
        page = args.pdfs / "nutritional-information.html"
        fetch(PAGE_URL, page, rules)
        for it in TABLE:
            fetch(PDF_BASE + it["file"], args.pdfs / it["file"], rules)
    elif page is None and (args.pdfs / "nutritional-information.html").exists():
        page = args.pdfs / "nutritional-information.html"
    items, holdback, report = build(args.pdfs, page)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Papa's Fish & Chips", cuisine="Fish and chips", source_title=SOURCE_TITLE,
                             source_url=PAGE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    for it in TABLE:
        print(f"{it['file']} sha256 {it['sha256']}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
