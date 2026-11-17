"""Read Sticks'n'Sushi's official UK "Menu with kcal" PDF into records with their printed calories.

Used by tools/uk_extract/sticks_n_sushi.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such
as "402" or "83 / 166"); nothing is converted, rounded or estimated here.

The file (UK KCAL 08.2026, PDF created 7 October 2026) is a 21-page InDesign menu with a real text layer; pages 2-21 are spreads of
two printed menu pages (1190 x 595 pt). Each dish prints its calories next to its name, in one of these shapes (read from
`pdftotext -raw`, which keeps each text block together):

    HIRAMASA KATAIFI | 219 kcal               <- name | calories, then description and price
    INARI IKURA | 83 / 166 kcal               <- nigiri and sticks: calories for 1 piece / 2 pieces (the price line reads
    INARI | 76 / 152kcal                         "3.9 / 2 pcs 7.6", the same one / two split); one line prints no space
    SHAKE TERIYAKI                            <- sticks page: the name, then the calories on their own line
    108 / 216 kcal
    Spicy miso & sesame 5 | 316 kcal          <- edamame variants, rice, aburi and house rolls: text, price | calories
    GOHAN 2.6 | 276 kcal
    ABURI SETTO | Menu                        <- a heading with no figure, a line of text, then price | calories alone
    10 pcs of seared and topped nigiri
    40 | 561 kcal
    AS GOOD AS IT GETS | 1502 kcal            <- set menus: heading | calories, the dishes, "Price per person 65"

Page 14 ("Chef's recommendations") prints some dishes a second time with their page number ("EBI BITES | Page 10"); the script
checks those repeats against the first printing.

The rolls on pages 10 and 11 sit under the headings "KABURIMAKI | 8 pcs of each" (left half of page 10; Maki Maki and Mini Maki
are on its right half) and "URAMAKI | 8 pcs of each" (left half of page 11): which heading a roll is under is read from its position
(`pdftotext -bbox-layout`), never assumed.

Every "N kcal" in the text layer (except the "Adults need around 2000 kcal a day" footer) must end up in exactly one record, or the
run stops, so a calorie value that the patterns above do not understand can never be silently dropped.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

EXPECTED_PAGES = 21
GROUP = r"\d+(?: / \d+)?"
KC = r" ?kcal"   # one figure on page 8 prints "152kcal" with no space
R_ALONE = re.compile(rf"^(?P<k>\d+ / \d+){KC}$")
R_PRICE_ONLY = re.compile(rf"^(?P<price>\d+(?:\.\d+)?) \| (?P<k>\d+){KC}$")
R_PRICE = re.compile(rf"^(?P<label>.+?) (?P<price>\d+(?:\.\d+)?) \| (?P<k>\d+){KC}$")
R_BAR = re.compile(rf"^(?P<label>.+?) \| (?P<k>{GROUP}){KC}(?P<tail>,| or)?$")
CAPS = re.compile(r"^[A-ZŌÀÏ’' &\-]+$")
HEADING = re.compile(r"^(?P<h>[A-ZŌÀÏ’'][A-ZŌÀÏ’' &\-]+?)(?: \|.*)?$")
KCAL_ANY = re.compile(rf"({GROUP}){KC}")
# A dish name printed on the same text line as the end of the dish before it ("chips, shiitake & truffle ponzu 15 MISO SOUP | 33 kcal",
# page 6): the name is the capitals after the previous dish's price.
GLUED = re.compile(r"^.*[a-z].* \d+(?:\.\d+)? (?P<name>[A-ZŌÀÏ’'][A-ZŌÀÏ’' &\-]+)$")
FOOTER = "Adults need around 2000 kcal a day"
# Only "À LA CARTE" could be glued to the first dish of its page in the text layer. Other headings are NOT stripped:
# "SASHIMI DELUXE" and "MAKI MAKI" are dish names.
HEADING_PREFIXES = ("À LA CARTE ",)
FIRST_PAGE, LAST_PAGE = 3, 20
ROLL_PAGES = {10: "KABURIMAKI", 11: "URAMAKI"}


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
    """One record per printed calorie group: page, label (as printed), values (list of strings, e.g. ['83', '166']), text (the
    description lines under it), kind ('bar' | 'alone' | 'price' | 'price-only')."""
    if page_count(pdf) != EXPECTED_PAGES:
        raise SystemExit(f"The menu PDF now has {page_count(pdf)} pages, expected {EXPECTED_PAGES}: it is a new menu, re-read it")
    records: list[dict] = []
    for page in range(FIRST_PAGE, LAST_PAGE + 1):
        lines = _lines(pdf, page)
        caps_run: list[str] = []
        current = None
        for i, ln in enumerate(lines):
            rec = None
            if R_ALONE.match(ln):
                if not caps_run:
                    raise SystemExit(f"page {page}: calories {ln!r} have no name line above them")
                rec = dict(kind="alone", label=" ".join(caps_run), values=R_ALONE.match(ln)["k"].split(" / "), text="")
            elif R_PRICE_ONLY.match(ln):
                m = R_PRICE_ONLY.match(ln)
                j = i - 1
                while j >= 0 and not HEADING.match(lines[j]):
                    j -= 1
                if j < 0:
                    raise SystemExit(f"page {page}: price and calories {ln!r} have no heading above them")
                rec = dict(kind="price-only", label=HEADING.match(lines[j])["h"], values=[m["k"]], text=" ".join(lines[j + 1:i]),
                           price=m["price"])
            elif R_PRICE.match(ln):
                m = R_PRICE.match(ln)
                rec = dict(kind="price", label=m["label"], values=[m["k"]], text="", price=m["price"])
            elif R_BAR.match(ln):
                m = R_BAR.match(ln)
                label = m["label"]
                for p in HEADING_PREFIXES:
                    if label.startswith(p) and len(label) > len(p):
                        label = label[len(p):]
                if GLUED.match(label):
                    label = GLUED.match(label)["name"]
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
                if current is not None:
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


def roll_sections(pdf: Path) -> dict[str, str]:
    """{roll name as printed -> 'KABURIMAKI' | 'URAMAKI'}: every "NAME | N kcal" line printed on the same half of its spread as
    that page's heading word (pages 10 and 11)."""
    cols: dict[str, str] = {}
    for page, head in ROLL_PAGES.items():
        out = _pdftotext(pdf, page, "-bbox-layout")
        width = float(re.search(r'<page width="([\d.]+)"', out).group(1))
        words = [(float(a), html.unescape(b)) for a, b in re.findall(r'<word xMin="([\d.]+)"[^>]*>(.*?)</word>', out)]
        heads = [x for x, w in words if w == head]
        if len(heads) != 1:
            raise SystemExit(f"page {page}: the {head} heading was found {len(heads)} times, expected once")
        left = heads[0] < width / 2
        for m in re.finditer(r'<line xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">(.*?)</line>', out, re.S):
            text = " ".join(html.unescape(w) for w in re.findall(r"<word[^>]*>(.*?)</word>", m.group(3)))
            r = re.match(rf"^([A-ZÏ’' ]+) \| \d+{KC}$", text)
            if r and ((float(m.group(1)) + float(m.group(2))) / 2 < width / 2) == left:
                if r.group(1) in cols:
                    raise SystemExit(f"roll {r.group(1)!r} is printed under both headings")
                cols[r.group(1)] = head
    return cols
