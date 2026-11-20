#!/usr/bin/env python3
"""Read McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (UK government, GOV.UK, Open Government Licence v3.0), saved unchanged as
data/groceries/cofid/CoFID_2021.xlsx, without any spreadsheet library (an .xlsx is a zip of XML files).

    python3 tools/groceries/cofid.py find WORD [WORD...]   # foods in the proximates table whose name has every word, with their code and main figures
    python3 tools/groceries/cofid.py show CODE              # one food's row

Used only for loose fruit and vegetables whose supermarket page prints no nutrition (founder 2026-11-17: "you can use the government food data for loose fruits and
vegetables. If it doesn't, of course, have it on the website of the supermarket"). UK law doesn't require a nutrition label on unpackaged single-ingredient produce.
"""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "data" / "groceries" / "cofid" / "CoFID_2021.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _col(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def sheet_rows(name: str, path: Path = XLSX) -> list[list[str]]:
    z = zipfile.ZipFile(path)
    strings = [("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    wb = z.read("xl/workbook.xml").decode()
    rid = re.search(r'<sheet [^>]*name="%s"[^>]*r:id="([^"]+)"' % re.escape(name), wb).group(1)
    target = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % rid, z.read("xl/_rels/workbook.xml.rels").decode()).group(1)
    root = ET.fromstring(z.read("xl/" + target.lstrip("/").replace("xl/", "")))
    rows = []
    for r in root.iter("{%s}row" % NS["m"]):
        cells: dict[int, str] = {}
        for c in r.findall("m:c", NS):
            v = c.find("m:v", NS)
            if v is None:
                continue
            cells[_col(c.get("r"))] = strings[int(v.text)] if c.get("t") == "s" else (v.text or "")
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def proximates(path: Path = XLSX) -> tuple[list[str], list[list[str]]]:
    rows = sheet_rows("1.3 Proximates", path)
    head = next(i for i, r in enumerate(rows) if r and r[0].strip().lower() == "food code")
    return rows[head], [r for r in rows[head + 1:] if r and r[0].strip()]


# Fresh fruit and vegetables, in the order tried (specific before general), and the raw entry each uses. Only for a product with no label of any kind (its own page,
# the same product at another shop, or community numbers by barcode), whose name says plainly what it is and nothing processed.
PRODUCE: list[tuple[str, str]] = [
    (r"\b(?:cherry|baby plum|mini plum|cocktail) tomato", "13-519"), (r"\btomato(?:es)?\b", "13-517"),
    (r"\bbananas?\b", "14-318"), (r"\b(?:gala|braeburn|granny smith|pink lady|jazz|cox|royal gala|eating) apples?\b|\bapples\b", "14-319"),
    (r"\bpears?\b", "14-365"), (r"\boranges?\b", "14-327"), (r"\bgrapes\b", "14-350"), (r"\bpineapples?\b", "14-376"), (r"\bmangos?(?:es)?\b", "14-378"),
    (r"\bkiwi(?: fruit)?s?\b", "14-371"), (r"\bcant[ae]loupe\b", "14-339"), (r"\bstrawberr(?:y|ies)\b", "14-324"), (r"\braspberr(?:y|ies)\b", "14-375"),
    (r"\bblueberr(?:y|ies)\b", "14-325"),
    (r"\bspring onions?\b", "13-352"), (r"\b(?:red |brown |white |sweet )?onions?\b", "13-499"),
    (r"\b(?:baby|chantenay) carrots?\b", "13-448"), (r"\bcarrots?\b", "13-496"),
    (r"\bred (?:bell )?peppers?\b", "13-524"), (r"\byellow (?:bell )?peppers?\b", "13-526"), (r"\bgreen (?:bell )?peppers?\b", "13-318"),
    (r"\bred chill(?:i|ies|is)\b", "13-317"), (r"\bgreen chill(?:i|ies|is)\b", "13-316"),
    (r"\bcucumbers?\b", "13-523"), (r"\b(?:iceberg|little gem|romaine|cos|round) lettuces?\b|\blettuces?\b", "13-520"), (r"\brocket\b", "13-522"),
    (r"\bbaby spinach\b", "13-521"), (r"\bspinach\b", "13-572"), (r"\bmushrooms?\b", "13-505"), (r"\bbroccoli\b", "13-502"),
    (r"\bcauliflowers?\b", "13-512"), (r"\bkale\b", "13-234"), (r"\bleeks?\b", "13-624"), (r"\bcelery\b", "13-636"), (r"\bcourgettes?\b", "13-627"),
    (r"\bsweet potato(?:es)?\b", "13-463"), (r"\bswedes?\b", "13-359"), (r"\bparsnips?\b", "13-312"), (r"\bbrussels sprouts?\b|\bsprouts\b", "13-177"), (r"\bred cabbage\b", "13-190"),
    (r"\b(?:green|fine|french) beans\b", "13-514"), (r"\bmange ?tout\b", "13-122"), (r"\bbeansprouts?\b|\bbean sprouts\b", "13-426"),
    (r"\bgarlic\b", "13-244"), (r"\bginger\b", "13-890"), (r"\bcoriander\b", "13-888"), (r"\bparsley\b", "13-844"), (r"\bbasil\b", "13-804"),
    (r"\b(?:new|baby|salad|charlotte|jersey royal) potato(?:es)?\b", "13-618"),
]
# a name with any of these is not plain fresh produce (frozen, tinned, dried, cooked, a mix, a dish, a flavour...); chopped tomatoes are a tin, garlic "in oil" a jar
NOT_PLAIN = re.compile(r"\b(?:frozen|tinned|canned|chopped tomato(?:es)?|in oil|in brine|puree|paste|in water|in juice|in syrup|juices?|juiced|dried|crisps?|chips|smoothies?|cakes?|bread|loaf|pies?|sauce|soups?|pur[eé]es?|kits?|"
                       r"coleslaw|dips?|houmous|hummus|pickles?|pickled|roast(?:ed)?|fried|mash(?:ed)?|medley|mix(?:ed)?|stir[ -]?fry|with|chutney|jam|bars?|yogh?urts?|milk|drinks?|"
                       r"flavour(?:ed)?|seasoning|powder|paste|oil|sweets|crispy|glazed|honey|butter|gratin|bake|cheese|dressing|salsa|beer|biscuits?|nuts|tea|sauce|ready|"
                       r"cooked|steamed|grilled|chargrilled|marinated|stuffed|salad kit|soup|rice|noodles?|wraps?|sandwich|tart|crumble|muffins?|loaves|cereal|granola|purée|"
                       r"concentrate|squash|cordial|dried|sugar|chocolate|ice|lolly|lollies|sorbet|baby food|pouch|organic baby|puffs|snacks?|fritters?|bhajis?|pakoras?)\b", re.I)


def cofid_rows(path: Path = XLSX) -> dict[str, list]:
    """Food code -> a list row's nutrition ([kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kJ, "g", "", "cofid", food name]) for the PRODUCE entries.
    "Tr" (trace) counts as 0, as a label's "<0.5" does; "N" (not measured) leaves that figure empty, and a food missing a main figure is left out. Salt stays empty:
    the dataset gives sodium, and the app never converts sodium to salt."""
    head, rows = proximates(path)
    cols = {h.strip().lower(): i for i, h in enumerate(head)}
    want = {code for _, code in PRODUCE}

    def num(r: list[str], key: str) -> float | None:
        i = cols.get(key)
        v = (r[i] if i is not None and i < len(r) else "").strip()
        if v.lower() in ("tr", "trace"):
            return 0.0
        try:
            return round(float(v), 2)
        except ValueError:
            return None

    out: dict[str, list] = {}
    for r in rows:
        if r[0] not in want:
            continue
        kcal, protein, carbs, fat = (num(r, k) for k in ("energy (kcal) (kcal)", "protein (g)", "carbohydrate (g)", "fat (g)"))
        if None in (kcal, protein, carbs, fat):
            continue
        out[r[0]] = [kcal, protein, carbs, fat, num(r, "satd fa /100g fd (g)"), num(r, "total sugars (g)"), num(r, "aoac fibre (g)"), None,
                     num(r, "energy (kj) (kj)"), "g", "", "cofid", r[1].strip()]
    return out


# Words a plain produce name may have besides the food itself (the shop or range, where it's from, its size or pack). Anything else (another food, a flavour, a
# product type: "Raspberry Swirl Buns", "Garlic Chicken Kievs", "Tango Orange") means it is not plain fresh produce, and it gets no government figures.
PLAIN_WORDS = set("""
tesco sainsbury sainsburys s asda aldi lidl morrisons waitrose iceland m and marks spencer co op the best finest exceptional extra special collection taste difference
by no 1 duchy essential essentials just everyday value nature natures pick freshona oaklands stockwell hearty food plant kitchen market street organic british english
scottish welsh irish uk spanish dutch kenyan moroccan imported loose fresh ripe ripened ready to eat perfectly large medium small mini baby family pack packs each
bunch bunched bag bags punnet net value whole washed trimmed prepared sliced diced chopped florets floret spears tips heads head stems stem bulbs bulb cloves clove
leaves leaf flat curly root vine classic sweet pointed piece pieces x pk kg g s approx min minimum class i ii grade wonky imperfect bigger smaller jumbo cut
""".split())


def produce_code(name: str) -> str | None:
    """The raw entry for a plainly-named fresh fruit or vegetable, or None: the name must be the food itself and nothing but PLAIN_WORDS and figures around it."""
    if not name or NOT_PLAIN.search(name):
        return None
    low = name.lower().replace("&", " and ").replace("'", "").replace("’", "")
    for pattern, code in PRODUCE:
        m = re.search(pattern, low, re.I)
        if not m:
            continue
        rest = (low[:m.start()] + " " + low[m.end():])
        words = re.findall(r"[a-z]+", re.sub(r"\d+(?:\.\d+)?", " ", rest))
        return code if all(w in PLAIN_WORDS for w in words) else None
    return None


def main() -> int:
    head, rows = proximates()
    if len(sys.argv) > 2 and sys.argv[1] == "find":
        words = [w.lower() for w in sys.argv[2:]]
        cols = {h.strip().lower(): i for i, h in enumerate(head)}
        pick = ["energy (kcal) (kcal)", "protein (g)", "fat (g)", "carbohydrate (g)"]
        for r in rows:
            if all(w in r[1].lower() for w in words):
                print(r[0], "|", r[1], "|", " ".join(f"{p.split(' ')[0]}={r[cols[p]] if p in cols and cols[p] < len(r) else '?'}" for p in pick))
        return 0
    if len(sys.argv) > 2 and sys.argv[1] == "show":
        for r in rows:
            if r[0] == sys.argv[2]:
                for h, v in zip(head, r):
                    print(f"{h}: {v}")
        return 0
    print(head)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
