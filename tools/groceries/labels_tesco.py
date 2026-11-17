#!/usr/bin/env python3
"""Nutrition labels for Tesco's recipe candidates, read from each product's own page on tesco.com.

    python3 tools/groceries/labels_tesco.py --limit 10            # a trial: read 10 products, then compare every row with the page yourself
    python3 tools/groceries/labels_tesco.py --all --trial-checked # every product in data/groceries/recipe-candidates/tesco.csv

Input:  data/groceries/recipe-candidates/tesco.csv (product_id = Tesco's own product id; its page is PAGE + id, as in data/groceries/listing/tesco.csv).
Output: data/groceries/nutrition/tesco.csv, the columns of sainsburys.csv (read by build_all_products.read_nutrition), rebuilt from the stored reads;
        data/groceries/nutrition/raw-tesco/reads.jsonl, one line per product read (the per-100 column of its table as printed, and what was decided);
        data/groceries/nutrition/raw-tesco/blocked.jsonl, every refusal (the run stops at the first one).
Resumable: a product with a line in reads.jsonl is not fetched again.

Rules (the founder's, not negotiable): only the product's own page on www.tesco.com; numbers copied exactly as printed (the unit is dropped, "<0.5"
kept as "<0.5"); only a per 100 g or per 100 ml column; a heading that says cooked/prepared/drained/... goes into `state`; no per-100 column, two
candidate columns, a missing main figure, kJ and kcal that disagree or numbers that fail build_groceries.implausible() = no row. One request a second,
a normal browser User-Agent, robots.txt honoured (tools/uk_extract/robots_rfc.py). A 401/403/429, an "Access Denied", a bot check, CAPTCHA or
challenge page STOPS the run: it is recorded and never worked round (no other user agents, hosts, proxies, cookies or headless browsers).

STATUS (2026-11-17): never run against a real Tesco page. Tesco's edge (Akamai) answered 403 "Access Denied" to robots.txt from this Mac, so
the run stopped before any product page (raw-tesco/blocked.jsonl). The table reader below is generic (an HTML <table> whose header names a per
100 g/ml column); it has NOT been checked against Tesco's markup. That is why a full run needs --trial-checked: run --limit 10 first, open those
pages yourself and compare each row with the page's own table.
"""
from __future__ import annotations

import argparse
import csv
import html
import html.parser
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
sys.path.insert(0, str(ROOT / "tools" / "groceries"))
import robots_rfc  # noqa: E402
import build_groceries as bg  # noqa: E402

SHOP = "tesco"
HOST = "https://www.tesco.com"
PAGE = HOST + "/groceries/en-GB/products/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Safari/537.36")
DELAY = 1.0
CANDIDATES = ROOT / "data" / "groceries" / "recipe-candidates" / f"{SHOP}.csv"
OUT = ROOT / "data" / "groceries" / "nutrition" / f"{SHOP}.csv"
RAW = ROOT / "data" / "groceries" / "nutrition" / f"raw-{SHOP}"
READS = RAW / "reads.jsonl"
BLOCKED = RAW / "blocked.jsonl"
COLUMNS = ["product_id", "per", "state", "kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g", "checked_on", "page_url"]
BLOCK_WORDS = re.compile(r"access denied|captcha|are you a robot|verify you are (a )?human|unusual traffic|request unsuccessful|incapsula|"
                         r"cf-chl|challenge-platform|_abck|bm-verify|pardon our interruption|errors\.edgesuite\.net", re.I)
STATE_WORDS = re.compile(r"\b(cooked|prepared|grilled|drained|as served|baked|fried|roasted|boiled|steamed|microwaved|heated|oven[- ]baked|"
                         r"reconstituted|as consumed|made up|toasted|poached)\b", re.I)


class Blocked(Exception):
    pass


# ---------------------------------------------------------------- fetching

_last = 0.0


def _get(url: str) -> tuple[int, str, str]:
    """(status, final url, body). Paced at one request a second; refusals raise Blocked."""
    global _last
    wait = _last + DELAY - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status, final, body = r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        _last = time.monotonic()
        body = e.read(4000).decode("utf-8", "replace")
        if e.code in (401, 403, 429) or BLOCK_WORDS.search(body):
            raise Blocked(f"HTTP {e.code} from {url}: {' '.join(re.sub('<[^>]+>', ' ', html.unescape(body)).split())[:200]}") from e
        return e.code, url, body
    _last = time.monotonic()
    if BLOCK_WORDS.search(body[:20000]) and "<table" not in body:
        raise Blocked(f"bot check / access denied page from {url}")
    return status, final, body


_rules: list | None = None


def robots_allows(path: str) -> bool:
    """robots.txt read once. A refusal of robots.txt itself (an "Access Denied" or challenge page, 401, 429) is a block and stops the run;
    a plain 4xx is "no rules" (RFC 9309); a robots.txt that can't be read at all means don't fetch."""
    global _rules
    if _rules is None:
        try:
            status, _, body = _get(HOST + "/robots.txt")
        except Blocked:
            raise
        except Exception as e:  # unreachable: RFC 9309 says assume complete disallow
            raise Blocked(f"robots.txt could not be read ({type(e).__name__}: {e}); not fetching") from e
        _rules = robots_rfc.parse(body) if status == 200 else ([("disallow", "/")] if status >= 500 else [])
    return robots_rfc.allowed(_rules, path)


# ---------------------------------------------------------------- the table

class _Tables(html.parser.HTMLParser):
    """Every <table> as rows of (is_header, cell text) plus its <caption>; nested tables are kept apart."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: list[dict] = []
        self.stack: list[dict] = []
        self.cell: list[str] | None = None
        self.cell_th = False
        self.row: list | None = None
        self.in_caption = False

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.stack.append({"caption": "", "rows": []})
        elif not self.stack:
            return
        elif tag == "caption":
            self.in_caption = True
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell, self.cell_th = [], tag == "th"
        elif tag == "br" and self.cell is not None:
            self.cell.append(" ")

    def handle_endtag(self, tag):
        if not self.stack:
            return
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append((self.cell_th, " ".join("".join(self.cell).split())))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.stack[-1]["rows"].append(self.row)
            self.row = None
        elif tag == "caption":
            self.in_caption = False
        elif tag == "table":
            self.tables.append(self.stack.pop())

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)
        elif self.in_caption and self.stack:
            self.stack[-1]["caption"] += data


PER100 = re.compile(r"(?<![\d.])100\s*(g|ml)\b", re.I)
VALUE = re.compile(r"^(<\s*)?\d+(?:\.\d+)?$")


def _num(cell: str, unit: str = "g") -> str | None:
    """The number as printed, its unit dropped ("23.7g" -> "23.7", "<0.5g" -> "<0.5"); None when the cell isn't one plain number in that unit."""
    t = cell.strip().replace(",", "")
    m = re.fullmatch(rf"(<\s*)?(\d+(?:\.\d+)?)\s*(?:{unit})?", t, re.I)
    return (("<" if m.group(1) else "") + m.group(2)) if m else None


def nutrition_from_html(body: str) -> tuple[dict | None, str, dict]:
    """(row or None, why, the per-100 column as printed). Only a table whose header row names exactly one per 100 g/ml column is read
    (or, with two, the one whose heading carries no cooked/prepared word); everything else gives no row."""
    p = _Tables()
    p.feed(body)
    found = []
    for t in p.tables:
        if not t["rows"]:
            continue
        head = [c for _, c in t["rows"][0]]
        cols = [i for i, c in enumerate(head) if PER100.search(c)]
        if cols and any(re.search(r"energy|kcal", " ".join(c for _, c in r), re.I) for r in t["rows"][1:]):
            found.append((t, head, cols))
    if not found:
        return None, "no per-100 table", {}
    if len(found) > 1:
        return None, "more than one nutrition table", {}
    t, head, cols = found[0]
    if len(cols) > 1:
        plain = [i for i in cols if not STATE_WORDS.search(head[i])]
        if len(plain) != 1:
            return None, "two per-100 columns", {}
        cols = plain
    ci = cols[0]
    heading = head[ci]
    per = PER100.search(heading).group(1).lower()
    sw = STATE_WORDS.search(heading) or STATE_WORDS.search(t["caption"])
    state = sw.group(1).lower() if sw else ""
    printed = {}
    row = {"per": per, "state": state}
    last_label = ""
    for r in t["rows"][1:]:
        cells = [c for _, c in r]
        if len(cells) <= ci:
            continue
        label, val = cells[0].lower(), cells[ci]
        printed[cells[0] or f"({last_label})"] = val
        lab = label or last_label
        if "energy" in lab or label in ("kj", "kcal") or (not label and last_label.startswith("energy")):
            kj = re.search(r"(<?\s*\d[\d,]*(?:\.\d+)?)\s*kj", val, re.I)
            kc = re.search(r"(<?\s*\d[\d,]*(?:\.\d+)?)\s*kcal", val, re.I)
            if kj or kc:
                if kj and "kj" not in row:
                    row["kj"] = kj.group(1).replace(",", "").replace(" ", "")
                if kc and "kcal" not in row:
                    row["kcal"] = kc.group(1).replace(",", "").replace(" ", "")
            elif "kj" in label and _num(val, "kj"):
                row.setdefault("kj", _num(val, "kj"))
            elif "kcal" in label and _num(val, "kcal"):
                row.setdefault("kcal", _num(val, "kcal"))
        else:
            key = None
            if re.match(r"(of which )?saturate", label) or label.startswith("saturated"):
                key = "saturates_g"
            elif re.match(r"(of which )?sugars?\b", label):
                key = "sugars_g"
            elif label.startswith("fat"):
                key = "fat_g"
            elif label.startswith("carbohydrate"):
                key = "carbs_g"
            elif label.startswith("fibre"):
                key = "fibre_g"
            elif label.startswith("protein"):
                key = "protein_g"
            elif label.startswith("salt"):
                key = "salt_g"
            if key and key not in row:
                v = _num(val, "g")
                if v is not None:
                    row[key] = v
        if label:
            last_label = label
    main = [bg.printed_num(row.get(k)) for k in ("kcal", "protein_g", "carbs_g", "fat_g")]
    if None in main:
        return None, "a main figure is missing", printed
    kj = bg.printed_num(row.get("kj"))
    why = bg.implausible(main[0], main[1], main[2], main[3], kj)
    if why:
        return None, why, printed
    return row, "ok", printed


# ---------------------------------------------------------------- the run

def done_ids() -> set[str]:
    if not READS.exists():
        return set()
    return {json.loads(line)["product_id"] for line in READS.read_text(encoding="utf-8").splitlines() if line.strip()}


def write_csv() -> int:
    rows = []
    if READS.exists():
        for line in READS.read_text(encoding="utf-8").splitlines():
            r = json.loads(line) if line.strip() else None
            if r and r.get("row"):
                rows.append({"product_id": r["product_id"], **r["row"], "checked_on": r["checked_on"], "page_url": r["page_url"]})
    rows.sort(key=lambda r: r["product_id"])
    if not rows:
        return 0
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in COLUMNS})
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--trial-checked", action="store_true", help="you compared a --limit trial's rows with the pages yourself")
    a = ap.parse_args()
    if not a.limit and not (a.all and a.trial_checked):
        ap.error("run a trial with --limit N first; a full run needs --all --trial-checked")
    RAW.mkdir(parents=True, exist_ok=True)
    with open(CANDIDATES, newline="", encoding="utf-8") as f:
        ids = [r["product_id"].strip() for r in csv.DictReader(f)]
    seen = done_ids()
    todo = [i for i in ids if i not in seen and re.fullmatch(r"\d{4,12}", i)]
    if a.limit:
        todo = todo[: a.limit]
    today = date.today().isoformat()
    n = 0
    try:
        for pid in todo:
            url = PAGE + pid
            if not robots_allows("/groceries/en-GB/products/" + pid):
                rec = {"product_id": pid, "page_url": url, "checked_on": today, "outcome": "robots.txt disallows", "row": None}
            else:
                status, final, body = _get(url)
                if status != 200 or not final.rstrip("/").endswith("/products/" + pid):
                    rec = {"product_id": pid, "page_url": url, "checked_on": today, "outcome": f"HTTP {status} / landed on {final}", "row": None}
                else:
                    row, why, printed = nutrition_from_html(body)
                    rec = {"product_id": pid, "page_url": url, "checked_on": today, "outcome": why, "printed": printed, "row": row}
            with open(READS, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
    except Blocked as e:
        with open(BLOCKED, "a", encoding="utf-8") as f:
            f.write(json.dumps({"when": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "after_reads": n, "why": str(e)}) + "\n")
        print(f"STOPPED (block, not worked round): {e}", file=sys.stderr)
        print(f"rows in {OUT.name}: {write_csv()}")
        return 2
    print(f"read {n} pages; rows in {OUT.name}: {write_csv()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
