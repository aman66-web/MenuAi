"""Read Sticks'n'Sushi's official UK "Menu with kcal" PDF into records with their printed calories.

Used by tools/uk_extract/sticks_n_sushi.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such
as "402" or "81 / 154"); nothing is converted, rounded or estimated here.

The file (KCAL UK 05.2026) is a 19-page InDesign menu with a real text layer. Each dish prints its calories next to its name, in
one of these shapes (read from `pdftotext -raw`, which keeps each text block together):

    HOTATE KATAIFI | 402 kcal                 <- name | calories, then description and price
    INARI IKURA | 81 / 154 kcal               <- nigiri and sticks: calories for 1 piece / 2 pieces (the price line reads
                                                 "3.9 / 2 pcs 7.6", the same one / two split)
    IMO YAKI                                  <- sticks page: the name, then the calories on their own line
    56 / 112 kcal
    Spicy miso & sesame 5 | 150 kcal          <- edamame variants and rice: description, price, | calories
    Wagyu. Wagyu tartare ... 19.5 | 243 kcal  <- house rolls: name. description, price | calories
    Price per person 60 | 1878 kcal per person  <- set menus (heading above the dish list)

The page-10 rolls sit in two columns under the headings "URAMAKI | 8 pcs of each roll" and "KABURIMAKI | 8 pcs of each roll":
which column a roll is in is read from its position (`pdftotext -bbox-layout`), never assumed.

Every "N kcal" in the text layer (except the "Adults need around 2000 kcal a day" footer) must end up in exactly one record, or the
run stops, so a calorie value that the patterns above do not understand can never be silently dropped.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

GROUP = r"\d+(?: / \d+)?"
SET_END = re.compile(r"^Price per person (?P<price>\d+(?:\.\d+)?) \| (?P<k>\d+) kcal per person$")
R_ALONE = re.compile(r"^(?P<k>\d+ / \d+) kcal$")
R_PRICE = re.compile(r"^(?P<label>.+?) (?P<price>\d+(?:\.\d+)?) \| (?P<k>\d+) kcal$")
R_BAR = re.compile(rf"^(?P<label>.+?) \| (?P<k>{GROUP}) kcal(?P<tail>,| or)?$")
CAPS = re.compile(r"^[A-ZŌÀÏ’' &\-]+$")
KCAL_ANY = re.compile(rf"({GROUP}) kcal")
FOOTER = "Adults need around 2000 kcal a day"
# Only "À LA CARTE" is ever glued to the first dish of its page in the text layer (page 3). Other headings are NOT stripped:
# "SASHIMI DELUXE" and "MAKI MAKI" are dish names.
HEADING_PREFIXES = ("À LA CARTE ",)
FIRST_PAGE, LAST_PAGE = 3, 18


def _pdftotext(pdf: Path, page: int, mode: str) -> str:
    return subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), mode, str(pdf), "-"], check=True, capture_output=True,
                          text=True).stdout


def _lines(pdf: Path, page: int) -> list[str]:
    out = []
    for ln in _pdftotext(pdf, page, "-raw").splitlines():
        t = " ".join(ln.replace("​", "").replace("\xa0", " ").split())
        if t:
            out.append(t)
    return out


def page_count(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))


def read_records(pdf: Path) -> list[dict]:
    """One record per printed calorie group: page, label (as printed), values (list of strings, e.g. ['81', '154']), text (the
    description lines under it), kind ('bar' | 'alone' | 'price' | 'set')."""
    if page_count(pdf) != 19:
        raise SystemExit(f"The menu PDF now has {page_count(pdf)} pages, expected 19: it is a new menu, re-read it")
    records: list[dict] = []
    for page in range(FIRST_PAGE, LAST_PAGE + 1):
        lines = _lines(pdf, page)
        caps_run: list[str] = []
        current = None
        for i, ln in enumerate(lines):
            rec = None
            m = SET_END.match(ln)
            if m:
                j = i
                while j >= 0 and not CAPS.match(lines[j]):
                    j -= 1
                if j < 0:
                    raise SystemExit(f"page {page}: set menu line {ln!r} has no heading above it")
                rec = dict(kind="set", label=lines[j], values=[m["k"]], text=" ".join(lines[j + 1:i]), price=m["price"])
            elif R_ALONE.match(ln):
                if not caps_run:
                    raise SystemExit(f"page {page}: calories {ln!r} have no name line above them")
                rec = dict(kind="alone", label=" ".join(caps_run), values=R_ALONE.match(ln)["k"].split(" / "), text="")
            elif R_PRICE.match(ln):
                m = R_PRICE.match(ln)
                rec = dict(kind="price", label=m["label"], values=[m["k"]], text="", price=m["price"])
            elif R_BAR.match(ln):
                m = R_BAR.match(ln)
                label = m["label"]
                if "KABURIMAKI | 8 pcs of each roll " in label:
                    label = label.split("KABURIMAKI | 8 pcs of each roll ")[-1]
                for p in HEADING_PREFIXES:
                    if label.startswith(p) and len(label) > len(p):
                        label = label[len(p):]
                rec = dict(kind="bar", label=label, values=m["k"].split(" / "), text="")
            if rec:
                rec["page"] = page
                records.append(rec)
                current = rec
                caps_run = []
                continue
            if CAPS.match(ln):
                caps_run.append(ln)
                current = None
            else:
                caps_run = []
                if current is not None and current["kind"] != "set":
                    current["text"] = (current["text"] + " " + ln).strip()
    # every printed calorie group must be in a record
    printed = 0
    for page in range(FIRST_PAGE, LAST_PAGE + 1):
        for ln in _lines(pdf, page):
            if FOOTER in ln:
                ln = ln.replace(FOOTER, "")
            printed += len(KCAL_ANY.findall(ln))
    if printed != len(records):
        raise SystemExit(f"{printed} calorie values are printed on pages {FIRST_PAGE}-{LAST_PAGE} but {len(records)} were read: "
                         "a layout changed, re-check the patterns")
    return records


def roll_columns(pdf: Path, page: int = 10) -> dict[str, str]:
    """Page 10: {roll name as printed -> 'URAMAKI' | 'KABURIMAKI'} from the x position of each roll's "NAME | N kcal" line
    against the two column headings."""
    out = _pdftotext(pdf, page, "-bbox-layout")
    lines = []
    for m in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', out, re.S):
        words = [html.unescape(w) for w in re.findall(r"<word[^>]*>(.*?)</word>", m.group(5))]
        lines.append((float(m.group(1)), float(m.group(3)), " ".join(words)))
    heads = {t: x0 for x0, _, t in lines if t in ("URAMAKI | 8 pcs of each roll", "KABURIMAKI | 8 pcs of each roll")}
    if len(heads) != 2:
        # the two headings can share one line: take their words' own positions
        words = [(float(a), html.unescape(b)) for a, b in re.findall(r'<word xMin="([\d.]+)"[^>]*>(.*?)</word>', out)]
        heads = {w: x for x, w in words if w in ("URAMAKI", "KABURIMAKI")}
        if len(heads) != 2:
            raise SystemExit("page 10: the URAMAKI / KABURIMAKI column headings were not found")
        u_x, k_x = heads["URAMAKI"], heads["KABURIMAKI"]
    else:
        u_x, k_x = heads["URAMAKI | 8 pcs of each roll"], heads["KABURIMAKI | 8 pcs of each roll"]
    cols = {}
    for x0, x1, text in lines:
        m = re.match(r"^([A-ZÏ’' ]+) \| \d+ kcal$", text)
        if m:
            cols[m.group(1)] = "KABURIMAKI" if (x0 + x1) / 2 >= k_x else "URAMAKI"
    if not u_x < k_x:
        raise SystemExit("page 10: column headings are not left to right as expected")
    return cols
