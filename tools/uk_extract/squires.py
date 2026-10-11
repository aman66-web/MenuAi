#!/usr/bin/env python3
"""Build data/source/squires-garden-centres/ from the café bar menus of Squire's Garden Centres (a CALORIES-ONLY chain).

    python3 -I tools/uk_extract/squires.py --cache DIR --checked-on 2026-10-11 [--fetch] [--out DIR] [--show]

Source: each Squire's café bar page on the chain's own site (https://www.squiresgardencentres.co.uk/cafe_bars/<centre>/, 17 centres
in Surrey, Sussex, Berkshire and Middlesex, listed in the site's own menu) links that café bar's menus as PDFs on the same site:
breakfast, lunch, drinks and the Little Gardener's (children's) menu, Autumn/Winter 2026, plus the afternoon tea menu. Every dish line
prints its calories ("CLASSIC BRUNCH gfa 881kcal ... £14"). robots.txt of www.squiresgardencentres.co.uk disallows only admin, search
and account paths; --fetch saves the home page, the 17 café bar pages and each distinct PDF (one request a second; any 401/403/429 or
robots refusal stops the run).

HOW THE PDFs ARE READ: `pdftotext -bbox` gives every word with its box. The menus use one type size per role, which the reader relies on
and checks: 19.2 pt section headings, 13.2 pt dish names and prices, 12 pt (10.8 pt on the children's menu) descriptions and option names,
9.6 pt diet codes (gf, gfa, v, vg, vga) and 8.4 pt calorie figures. Words are grouped into lines by baseline (the children's menu is cut
into its four printed columns first). A calorie figure belongs to the dish name on its line; figures printed after option names under
a priced heading with no figure of its own ("SCONE & BUTTER gfa v £3.75" / "Plain 459kcal fruit 461kcal ...") are that dish's options;
a "|" printed in the figure type between two figures ("Latte 139kcal | 208kcal") is the large size, and the size names come from the
REGULAR / LARGE column heading of that section. "Add ..." lines are add-ons. "Swap salad for ... 192kcal" lines are left out (the
figure could be the side or the difference). Every calorie figure in every PDF must be used or left out by one of these rules, or the
run stops; nothing is estimated and protein, carbs and fat are not published (calories only).

MENUS VARY BY CENTRE (three lunch layouts, an extra pizza section at two centres, Chertsey's own versions): a dish is published only
when the same name and the same calories are printed on the menus of at least two café bars, and a name printed with different calories
on different menus is held back. The afternoon tea menu is not used: its figures are for the parts of one set served together.
Left out on purpose: alcoholic drinks (founder, 11 Oct 2026; the drinks menus print no figures for the wine, cider and beer anyway).

Independent check: data/audit/verified/squires-garden-centres.json.
"""
from __future__ import annotations
import argparse
import html
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "squires-garden-centres"
SITE = "https://www.squiresgardencentres.co.uk"
EXPECTED_CENTRES = 17
MIN_CENTRES = 2
UA = ic.UA
DELAY = 1.1
CLASS = {19.2: "H", 13.2: "T", 12.0: "B", 10.8: "B", 9.6: "C", 8.4: "K"}
KCAL = re.compile(r"^(\d[\d,]*)kcal[,.]?$")
PRICE = re.compile(r"^£\d+(?:\.\d\d)?$")
CODES = {"gf", "gfa", "v", "vg", "vga"}
SIZES = {"REGULAR", "LARGE", "SMALL"}
GAP = 20.0  # points between lines that end a group of options
KIDS_COLUMNS = [(30, 230), (230, 421), (421, 613), (613, 842)]
KIDS_Y = (130, 570)
MENU_ORDER = ["breakfast", "lunch", "drinks", "kids"]
MENU_LABEL = {"breakfast": "Breakfast menu", "lunch": "Lunch menu", "drinks": "Drinks menu", "kids": "Little Gardener's menu"}
# How an option is named under its group or priced heading ({label} = the option as printed); default "{parent} ({label})".
FORMAT = {
    "COFFEE": "{label}", "POT OF TEA": "Pot of Tea ({label})", "HOT CHOCOLATE": "Hot Chocolate ({label})",
    "FENTIMANS": "Fentimans {label}", "BUBBLE TEA": "Bubble Tea ({label})", "ICED DRINKS": "Iced {label}",
    "MILKSHAKES": "{label} Milkshake", "SMOOTHIES": "{label} Smoothie",
}
# Dishes printed with no name of their own in a section (adult menus), and children's sections whose dish names need the section word.
SECTION_FORMAT = {"BAKED POTATOES": "Baked Potato ({label})", "MOCKTAILS": "{label} (mocktail)"}
KIDS_SUFFIX = {"SANDWICHES": " Sandwich", "TOASTIES": " Toastie"}
LIMITED = {"SEASONAL DRINKS"}
ALCOHOL_SECTION = re.compile(r"WINE|CIDER|BEER|SPIRIT|COCKTAIL")
SMALL_WORDS = {"and", "of", "the", "with", "on", "in", "a", "or", "for", "to"}

NOTE = (
    "Calories only, from each café bar's own Autumn/Winter 2026 menus. Menus vary by centre: a dish is listed only where the same calories "
    "are printed on the menus of at least two of the 17 café bars. The menus say calories are based on the ingredients uncooked. No allergen "
    "chart is published online: ask the staff. Afternoon tea is not listed."
)

_last = [0.0]


def get(url: str, dest: Path, fetch: bool) -> bytes:
    if dest.exists() and dest.stat().st_size:
        return dest.read_bytes()
    if not fetch:
        raise SystemExit(f"{dest} is not in the cache: run with --fetch")
    if not ic._robots_allow(url):
        raise SystemExit(f"robots.txt disallows {url}: stopped")
    wait = _last[0] + DELAY - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} from {url}: stopped (never worked round)") from e
    finally:
        _last[0] = time.monotonic()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


def centre_menus(cache: Path, fetch: bool) -> dict[str, list[str]]:
    """{centre page: [menu PDF urls]} from the café bar pages the home page lists."""
    home = get(SITE + "/", cache / "home.html", fetch).decode("utf-8", "replace")
    pages = sorted(set(re.findall(r'(?:https://www\.squiresgardencentres\.co\.uk)?(/cafe_bars/[a-z0-9\-]+/)', home)))
    if len(pages) != EXPECTED_CENTRES:
        raise SystemExit(f"the home page lists {len(pages)} café bars, expected {EXPECTED_CENTRES}: check the site")
    out = {}
    for p in pages:
        text = get(SITE + p, cache / "centres" / (p.strip("/").split("/")[-1] + ".html"), fetch).decode("utf-8", "replace")
        pdfs = []
        for u in re.findall(r'href="((?:https://www\.squiresgardencentres\.co\.uk)?/wp-content/uploads/[^"]+\.pdf)"', text):
            u = SITE + u if u.startswith("/") else u
            if u not in pdfs:
                pdfs.append(u)
        out[p.strip("/").split("/")[-1]] = pdfs
    return out


def menu_kind(url: str) -> str | None:
    name = url.rsplit("/", 1)[1]
    if "Afternoon-Tea" in name:
        return None
    for key, kind in (("Little-Gardeners", "kids"), ("Breakfast", "breakfast"), ("Lunch", "lunch"), ("Drinks", "drinks")):
        if key in name:
            return kind
    raise SystemExit(f"unrecognised menu file {name}: add it to menu_kind()")


def pdf_path(cache: Path, url: str) -> Path:
    return cache / "pdf" / url.split("/wp-content/uploads/")[1].replace("/", "_")


# ---------------------------------------------------------------- reading one PDF

def words_of(pdf: Path) -> list[list[tuple]]:
    """[[(x0, y0, x1, y1, word, class), ...] per page]."""
    xml = subprocess.run(["pdftotext", "-bbox", str(pdf), "/dev/stdout"], capture_output=True, text=True, check=True).stdout
    pages = []
    for pg in xml.split("<page ")[1:]:
        ws = []
        for a, b, c, d, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', pg):
            a, b, c, d = float(a), float(b), float(c), float(d)
            ws.append((a, b, c, d, html.unescape(w), CLASS.get(round(d - b, 1), "?")))
        pages.append(ws)
    return pages


def lines_of(ws: list[tuple]) -> list[dict]:
    ws = sorted(ws, key=lambda w: (w[3], w[0]))
    lines: list[dict] = []
    for w in ws:
        if lines and abs(lines[-1]["y"] - w[3]) <= 2.5:
            lines[-1]["w"].append(w)
        else:
            lines.append({"y": w[3], "w": [w]})
    for ln in lines:
        ln["w"].sort(key=lambda w: w[0])
        # drop words in sizes the menus use for nothing we read (registered marks, boxed offers, the daily-intake line)
        ln["w"] = [w for w in ln["w"] if w[5] != "?"]
    return [ln for ln in lines if ln["w"]]


def streams(pdf: Path, kind: str) -> list[list[dict]]:
    """Lines of each page (or, on the children's menu, of each printed column of page 1)."""
    pages = words_of(pdf)
    if kind != "kids":
        return [lines_of(ws) for ws in pages]
    out = []
    for x0, x1 in KIDS_COLUMNS:
        col = [w for w in pages[0] if x0 <= w[0] < x1 and KIDS_Y[0] <= w[1] < KIDS_Y[1]]
        out.append(lines_of(col))
    return out


def is_kcal(w) -> bool:
    return w[5] == "K" and bool(KCAL.match(w[4]))


def is_price(w) -> bool:
    return w[5] == "T" and bool(PRICE.match(w[4]))


def uppercase_run(ws: list[tuple]) -> str:
    """The leading words printed in capitals ('MILKSHAKES' of 'MILKSHAKES Topped with whipped cream')."""
    run = []
    for w in ws:
        if w[5] == "C" or w[4] == "NEW" and not run:
            continue
        letters = re.sub(r"[^A-Za-zÀ-ÿ]", "", w[4])
        if w[5] in ("T", "B") and not PRICE.match(w[4]) and (letters == letters.upper()) and (letters or run):
            run.append(w[4])
        else:
            break
    return " ".join(run)


def title_case(printed: str) -> str:
    out = []
    for i, tok in enumerate(printed.split()):
        low = tok.lower()
        if i and low in SMALL_WORDS:
            out.append(low)
            continue
        chars, up = list(low), True
        for j, ch in enumerate(chars):
            if ch.isalpha():
                if up:
                    chars[j] = ch.upper()
                up = False
            elif ch == "-":
                up = True
        out.append("".join(chars))
    return " ".join(out)


def tidy(text: str) -> str:
    """An option or dish name as printed: NEW markers and connecting words dropped, capitals made readable."""
    text = re.sub(r"^\s*(?:\||–|-|or|Choose from:?)\s+", "", text.strip())
    text = re.sub(r"^\s*(?:\||–|-|or)\s+", "", text)
    text = re.sub(r"\bNEW\s+", "", text).strip(" ,")
    text = text.replace(" | ", " / ")
    letters = re.sub(r"[^A-Za-z]", "", text)
    if letters and letters == letters.upper():
        return title_case(text)
    return text[:1].upper() + text[1:]


class Reader:
    """Reads the dish lines of one PDF into entries: (menu, section, name, kcal, codes, how)."""

    def __init__(self, kind: str, name: str):
        self.kind, self.name = kind, name
        self.section = ""
        self.sizes: list[str] = []
        self.block: dict | None = None
        self.entries: list[dict] = []
        self.skipped: list[str] = []
        self.used = 0

    # ---- naming
    def section_title(self) -> str:
        t = title_case(re.sub(r"^NEW\s+", "", self.section))
        return f"Kids' {t}" if self.kind == "kids" else t

    def emit(self, name: str, kcal: str, codes: set, how: str):
        if self.kind == "kids":
            sec = re.sub(r"^NEW\s+", "", self.section)
            name = "Kids' " + name + KIDS_SUFFIX.get(sec, "")
        self.entries.append({"menu": self.kind, "section": self.section_title(), "raw_section": self.section, "name": name,
                             "kcal": kcal.replace(",", ""), "codes": sorted(codes), "how": how, "pdf": self.name})
        self.used += 1

    def option_name(self, fmt: str, label: str, size: str | None) -> str:
        name = fmt.format(label=label)
        if size:
            name = name[:-1] + f", {size})" if name.endswith(")") else f"{name} ({size})"
        return name

    # ---- blocks (a priced heading with options, or a group heading such as COFFEE / POT OF TEA)
    def end_block(self):
        b, self.block = self.block, None
        if not b or not b["entries"]:
            return
        if b["kind"] == "parent" and len(b["entries"]) == 1 and not b["entries"][0]["titled"]:
            e = b["entries"][0]
            self.emit(b["name"], e["kcal"], b["codes"] | e["codes"], f"dish figure printed under the heading ({e['label'] or 'no label'})")
            return
        for e in b["entries"]:
            codes = e["codes"] | ({c for c in b["codes"] if c in ("v", "vg")} if b["kind"] == "parent" else set())
            self.emit(self.option_name(b["fmt"], e["label"], e["size"]), e["kcal"], codes, f"option under {b['title']}")

    def start_block(self, kind: str, title: str, codes: set):
        self.end_block()
        name = tidy(title)
        self.block = {"kind": kind, "title": title, "name": name, "codes": codes, "entries": [],
                      "fmt": FORMAT.get(title.upper(), name + " ({label})")}

    # ---- one line with calorie figures
    def figures(self, ln: dict):
        ws = ln["w"]
        first = next((w for w in ws if w[5] != "C"), ws[0])
        text_all = " ".join(w[4] for w in ws)
        if first[4] == "Swap":
            n = sum(1 for w in ws if is_kcal(w))
            self.skipped.append(f"{self.name}: left out (swap price line): {text_all}")
            self.used += n
            return
        add_line = first[4] == "Add"
        priced = any(is_price(w) for w in ws)
        titled = first[5] == "T" and first[4] != "NEW" or (first[4] == "NEW" and len(ws) > 1 and ws[1][5] == "T")
        if not add_line:
            if self.block and (priced and (self.block["kind"] == "parent" or titled)):
                self.end_block()
            elif self.block and titled and self.block["kind"] == "group":
                self.end_block()
        seg: list[tuple] = []
        last_name = None
        for w in ws:
            if is_kcal(w):
                kcal = KCAL.match(w[4]).group(1)
                if seg and seg[-1][4] == "|" and seg[-1][5] == "K" and last_name is not None:
                    self.size_variant(last_name, kcal)
                    seg = []
                    continue
                label_ws = [x for x in seg if x[5] in ("T", "B") and not PRICE.match(x[4]) and x[4] != "NEW"]
                codes = {x[4] for x in seg if x[5] == "C" and x[4] in CODES}
                seg_titled = any(x[5] == "T" for x in label_ws)
                if seg_titled:  # 'AVO GO-GO Avocado, broccoli, ...': the name is the part in the name type, the rest describes it
                    label_ws = [x for x in label_ws if x[5] == "T"]
                label = tidy(" ".join(x[4] for x in label_ws)) if label_ws else ""
                if ":" in label:  # 'Speciality: Camomile, Green Tea, ...' -> 'Speciality'
                    label = label.split(":")[0].strip()
                if add_line:
                    lab = re.sub(r"^Add\s+(?:additional items\s+)?", "", " ".join(x[4] for x in label_ws), flags=re.I)
                    lab = tidy(lab)
                    self.emit("Add " + lab[:1].lower() + lab[1:], kcal, codes, "add-on")
                    last_name = None
                elif seg_titled and not (self.block and not priced):
                    self.emit(self.titled_name(label), kcal, codes, "dish line")
                    last_name = ("direct", len(self.entries) - 1)
                elif self.block:
                    self.block["entries"].append({"label": label, "kcal": kcal, "codes": codes, "titled": seg_titled, "size": None})
                    last_name = ("block", len(self.block["entries"]) - 1)
                elif label:
                    fmt = SECTION_FORMAT.get(re.sub(r"^NEW\s+", "", self.section), "{label}")
                    self.emit(fmt.format(label=label), kcal, codes, "dish line (name in the description type)")
                    last_name = ("direct", len(self.entries) - 1)
                else:
                    raise SystemExit(f"{self.name}: a calorie figure with no dish: {text_all!r}")
                seg = []
            else:
                seg.append(w)

    def titled_name(self, label: str) -> str:
        return SECTION_FORMAT.get(re.sub(r"^NEW\s+", "", self.section), "{label}").format(label=label)

    def size_variant(self, last, kcal: str):
        if not self.sizes or len(self.sizes) < 2:
            raise SystemExit(f"{self.name}: a second size figure with no REGULAR/LARGE heading in section {self.section}")
        where, i = last
        if where == "block":
            e = self.block["entries"][i]
            if e["size"] is None:
                e["size"] = self.sizes[0]
            self.block["entries"].append({**e, "kcal": kcal, "size": self.sizes[1]})
        else:
            e = self.entries[i]
            if "(" in e["name"]:
                raise SystemExit(f"{self.name}: size pair after {e['name']!r}: not handled")
            e["name"] = f"{e['name']} ({self.sizes[0]})"
            self.emit(e["name"].rsplit(" (", 1)[0] + f" ({self.sizes[1]})", kcal, set(e["codes"]), e["how"])

    # ---- the whole stream
    def read(self, lines: list[dict]):
        lines = self.prepare(lines)
        prev_y = None
        for ln in lines:
            ws = ln["w"]
            gap = None if prev_y is None else ln["y"] - prev_y
            prev_y = ln.get("y_end", ln["y"])
            if self.block and self.block["entries"] and gap is not None and gap >= GAP:
                self.end_block()
            if all(w[5] == "H" for w in ws):
                self.end_block()
                self.section = " ".join(w[4] for w in ws)
                self.sizes = []
                continue
            if any(w[5] == "H" for w in ws):
                raise SystemExit(f"{self.name}: heading words mixed with other text: {' '.join(w[4] for w in ws)!r}")
            sizes = [w[4] for w in ws if w[5] == "C" and w[4] in SIZES]
            if sizes:
                self.sizes = [s.title() for s in sizes]
            if any(is_kcal(w) for w in ws):
                if ALCOHOL_SECTION.search(self.section):
                    raise SystemExit(f"{self.name}: a calorie figure in the alcohol section: check it")
                self.figures(ln)
                continue
            if all(PRICE.match(w[4]) for w in ws):
                continue
            if any(is_price(w) for w in ws):
                name_ws = [w for w in ws if w[5] in ("T", "B") and not PRICE.match(w[4]) and w[4] not in ("From", "NEW")]
                run = uppercase_run(ws)
                title = run if run else " ".join(w[4] for w in name_ws)
                self.start_block("parent", title, {w[4] for w in ws if w[5] == "C" and w[4] in CODES})
                continue
            run = uppercase_run(ws)
            if run and len(re.sub(r"[^A-Z]", "", run)) >= 3:
                self.start_block("group", run, set())
                continue
            # a description line: nothing to read
        self.end_block()

    def prepare(self, lines: list[dict]) -> list[dict]:
        """Join a priced name line that ends in a comma with the next line, and a dish name printed over two lines in capitals."""
        out: list[dict] = []
        i = 0
        while i < len(lines):
            ln = lines[i]
            ws = ln["w"]
            text_ws = [w for w in ws if not PRICE.match(w[4])]
            has_k = any(is_kcal(w) for w in ws)
            if (not has_k and any(is_price(w) for w in ws) and text_ws and text_ws[-1][4].endswith(",") and i + 1 < len(lines)):
                nxt = lines[i + 1]
                out.append({"y": ln["y"], "y_end": nxt["y"], "w": text_ws + nxt["w"] + [w for w in ws if PRICE.match(w[4])]})
                i += 2
                continue
            caps_only = (not has_k and ws and all(w[5] == "T" for w in ws) and not any(PRICE.match(w[4]) for w in ws)
                         and not re.search(r"[a-z]", " ".join(w[4] for w in ws)))
            if caps_only:
                j = i + 1
                while j < len(lines) and all(PRICE.match(w[4]) for w in lines[j]["w"]):
                    j += 1
                if j < len(lines) and lines[j]["y"] - ln["y"] < GAP:
                    nws = lines[j]["w"]
                    if nws and nws[0][5] == "T" and any(is_kcal(w) for w in nws):
                        moved = [w for k in range(i + 1, j) for w in lines[k]["w"]]
                        out.append({"y": ln["y"], "y_end": lines[j]["y"], "w": ws + nws + moved})
                        i = j + 1
                        continue
            out.append(ln)
            i += 1
        return out


def read_pdf(pdf: Path, kind: str) -> tuple[list[dict], list[str]]:
    r = Reader(kind, pdf.name)
    total = 0
    stray = []
    for lines in streams(pdf, kind):
        for ln in lines:
            total += sum(1 for w in ln["w"] if is_kcal(w))
        r.read(lines)
        r.block = None
        r.section = r.section if kind != "kids" else ""
    # every calorie figure printed in the figure type must have been used or left out by a named rule
    printed = 0
    for page in words_of(pdf):
        for w in page:
            printed += is_kcal(w)
            if "kcal" in w[4] and not is_kcal(w) and w[4] != "2000kcal":
                stray.append(w[4])
    if printed != total:
        raise SystemExit(f"{pdf.name}: {printed} calorie figures printed but {total} inside the areas read (columns or page edges)")
    if stray:
        raise SystemExit(f"{pdf.name}: calorie figures in an unexpected type size: {stray}")
    if r.used != total:
        raise SystemExit(f"{pdf.name}: {total} calorie figures printed, {r.used} read: the reader missed or doubled some")
    return r.entries, r.skipped


# ---------------------------------------------------------------- the chain

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--show", action="store_true", help="print every dish read from every PDF")
    args = ap.parse_args()
    menus = centre_menus(args.cache, args.fetch)
    pdf_entries: dict[str, list[dict]] = {}
    report: list[str] = []
    for centre, urls in menus.items():
        for u in urls:
            kind = menu_kind(u)
            if kind is None or u in pdf_entries:
                continue
            path = pdf_path(args.cache, u)
            get(u, path, args.fetch)
            entries, skipped = read_pdf(path, kind)
            pdf_entries[u] = entries
            report += skipped
            if args.show:
                print(f"== {path.name} ({kind}): {len(entries)} figures")
                for e in entries:
                    print(f"   {e['section']:<28} {e['name']:<60} {e['kcal']:>5}  {','.join(e['codes'])}  [{e['how']}]")
    # name -> kcal -> centres; and the menus each was read from
    seen: dict[str, dict] = {}
    for centre, urls in menus.items():
        for u in urls:
            for e in pdf_entries.get(u, []):
                k = slug(e["name"])
                s = seen.setdefault(k, {"first": e, "kcal": defaultdict(set), "veg": set(), "pdfs": set(), "sections": set()})
                s["kcal"][e["kcal"]].add(centre)
                if {"v", "vg"} & set(e["codes"]):
                    s["veg"].add(centre)
                s["pdfs"].add(e["pdf"])
                s["sections"].add(e["section"])
    order = {m: i for i, m in enumerate(MENU_ORDER)}
    items = []
    for k, s in sorted(seen.items(), key=lambda kv: order[kv[1]["first"]["menu"]]):
        e = s["first"]
        if len(s["kcal"]) > 1:
            report.append(f"held back (different calories on different menus): {e['name']}: "
                          + "; ".join(f"{v} kcal at {len(c)} ({', '.join(sorted(c))})" for v, c in s["kcal"].items()))
            continue
        kcal, centres = next(iter(s["kcal"].items()))
        if len(centres) < MIN_CENTRES:
            report.append(f"left out (on the menus of only {len(centres)} café bar: {', '.join(sorted(centres))}): {e['name']} {kcal} kcal")
            continue
        items.append({
            "name": e["name"], "category": e["section"], "calories": kcal, "rankable": False,
            "tags": "vegetarian" if len(s["veg"]) >= MIN_CENTRES else "",
            "limited_time": e["raw_section"] in LIMITED,
            "notes": (f"{MENU_LABEL[e['menu']]} > {e['section']}; printed with {kcal} kcal on the menus of {len(centres)} of "
                      f"{EXPECTED_CENTRES} café bars ({', '.join(sorted(s['pdfs']))}); read as {e['how']}"),
        })
    names = [slug(i["name"]) for i in items]
    if len(set(names)) != len(names):
        raise SystemExit(f"names not unique: {sorted(n for n in names if names.count(n) > 1)}")
    print("\n".join(report))
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Squire's Garden Centres", cuisine="Garden centre cafe",
        source_title=(f"Squire's Garden Centres café bar menus, Autumn/Winter 2026 (breakfast, lunch, drinks and Little Gardener's PDFs linked "
                      f"from each of the 17 café bar pages on squiresgardencentres.co.uk; read {args.checked_on})"),
        source_url=f"{SITE}/cafe-bars/menus-2/", checked_on=args.checked_on,
        aliases=["squires", "squire's", "squires garden centre", "squire's cafe bar", "squires cafe"],
        items=items, out=args.out, note=NOTE, nutrition_level="calories")
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
