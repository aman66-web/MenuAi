#!/usr/bin/env python3
"""Morrisons nutrition labels, read from each product's own page on groceries.morrisons.com (so recipes can use Morrisons' products).

Which products: data/groceries/recipe-candidates/morrisons.csv (Morrisons' priced products whose names fit a recipe ingredient). The product id
there is Morrisons' own retailer product id (the number at the end of its product page address, data/groceries/listing/morrisons.csv).

Where the label is: a product page, https://groceries.morrisons.com/products/<name-slug>/<id>, is rendered on Morrisons' own server and carries
the page's own data in `window.__QUERY_INITIAL_STATE__` (the same data the "Nutritional Data" section of the page shows). The product's
back-of-pack fields are in `bopData.fields`; the one titled `nutritionalData` holds the nutrition table as HTML. We read that table only:
no JSON API is called (robots.txt disallows /api/), no other site is asked.

Rules (founder's data rules, CLAUDE.md rule 1):
  * numbers are copied exactly as printed (the unit is dropped, the figure is not touched: "<0.5", "1,234" and "0.50" stay as they are);
  * only a per 100 g or per 100 ml column is used; `state` is the word the column's heading (or the table's first heading) adds for the food
    cooked, prepared, drained, as consumed... (labels as in tools/groceries/t2_sainsburys.py); a plain, "as sold" or "uncooked" heading is "";
  * a table whose basis or figures are unclear (no per-100 column, two different per-100 columns, mixed units, a value we can't read as a
    number, a main figure missing, kJ and kcal that disagree, numbers that fail build_groceries.implausible) gives no row: the product stays
    without numbers in the app. Nothing is computed, converted, rounded, guessed or filled in.

Fetching: one request a second, a normal browser User-Agent, robots.txt honoured (tools/uk_extract/images_common.py's RFC 9309 reader).
A 401/403/429, a bot check, CAPTCHA or "access denied" page stops the run (never worked round). Pages are not stored: each read keeps only
the table as the page served it (data/groceries/nutrition/raw-morrisons/reads.jsonl), so the CSV can be rebuilt without fetching again.

    python3 tools/groceries/labels_morrisons.py fetch --limit 10     # read 10 more pages (skips products already read)
    python3 tools/groceries/labels_morrisons.py write                # rebuild data/groceries/nutrition/morrisons.csv from the stored reads
    python3 tools/groceries/labels_morrisons.py show 112077141       # the stored table of one product and what was taken from it
    python3 tools/groceries/labels_morrisons.py                      # fetch everything not read yet, then write
"""
from __future__ import annotations

import argparse
import csv
import gzip
import html
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import build_groceries as bg  # noqa: E402  (printed_num, implausible: the number rules every shop's labels go through)
import images_common as ic  # noqa: E402  (UA and the RFC 9309 robots.txt reader every fetch helper uses)

SHOP = "morrisons"
CANDIDATES = ROOT / "data" / "groceries" / "recipe-candidates" / f"{SHOP}.csv"
OUT = ROOT / "data" / "groceries" / "nutrition" / f"{SHOP}.csv"
RAW = ROOT / "data" / "groceries" / "nutrition" / f"raw-{SHOP}"
READS = RAW / "reads.jsonl"
SUMMARY = RAW / "summary.txt"
BLOCKED = RAW / "blocked.jsonl"
HOST = "https://groceries.morrisons.com"
HEADER = ["product_id", "per", "state", "kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g", "checked_on", "page_url"]
DELAY = 1.0

# A page that is a bot check or a refusal rather than a product page. Checked only on pages that carry no product data.
CHALLENGE = re.compile(r"captcha|access denied|request blocked|are you a robot|verify you are (a )?human|cf-chl|challenge-platform|awswaf|"
                       r"request unsuccessful|incapsula|perimeterx|px-captcha|unusual traffic", re.I)


class Blocked(Exception):
    """Morrisons refused us or showed a check page: stop, report, never work round it."""


# ---------------------------------------------------------------- fetching

_last = 0.0


def slug(name: str) -> str:
    s = name.lower().replace("&", " and ").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "product"


def page_url(pid: str, name: str) -> str:
    return f"{HOST}/products/{slug(name)}/{pid}"


def get(url: str) -> tuple[int, str, str]:
    """(status, final url, text). One request a second, robots.txt honoured; 401/403/429 raise Blocked; 404/410 are returned."""
    global _last
    if not ic._robots_allow(url):
        why = ic._robots_unreadable.get(HOST)
        raise Blocked(f"robots.txt could not be read ({why})" if why else f"robots.txt disallows {url}")
    headers = {"User-Agent": ic.UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
               "Accept-Language": "en-GB,en;q=0.9", "Accept-Encoding": "gzip"}
    for attempt in range(3):
        wait = _last + DELAY - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        try:
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40) as r:
                    data, status, final, enc = r.read(), r.status, r.geturl(), (r.headers.get("Content-Encoding") or "").lower()
            finally:
                _last = time.monotonic()
            if enc == "gzip":
                data = gzip.decompress(data)
            elif enc == "deflate":
                data = zlib.decompress(data)
            return status, final, data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429):
                raise Blocked(f"HTTP {e.code} from {url}") from e
            if e.code in (404, 410):
                return e.code, url, ""
            if e.code >= 500 and attempt < 2:
                time.sleep(10 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, OSError, http.client.HTTPException):
            if attempt == 2:
                raise
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("unreachable")


def page_product(text: str, pid: str) -> dict | None:
    """The product record and its back-of-pack data from the page's own server-rendered state, or None when the page has none."""
    m = re.search(r"window\.__QUERY_INITIAL_STATE__\s*=\s*", text)
    if not m:
        return None
    try:
        state, _ = json.JSONDecoder().raw_decode(text, m.end())
    except ValueError:
        return None
    for q in state.get("queries") or []:
        d = ((q or {}).get("state") or {}).get("data") or {}
        p = d.get("product") if isinstance(d, dict) else None
        if isinstance(p, dict) and str(p.get("retailerProductId") or "") == pid:
            return {"name": p.get("name"), "retailerProductId": p.get("retailerProductId"), "bop": d.get("bopData") or {}}
    return None


def read_one(pid: str, name: str) -> dict:
    url = page_url(pid, name)
    status, final, text = get(url)
    rec = {"product_id": pid, "url": url, "final_url": final, "status": status, "fetched_on": date.today().isoformat()}
    if status != 200:
        rec["outcome"] = f"http {status}"
        return rec
    prod = page_product(text, pid)
    if prod is None:
        if CHALLENGE.search(text[:200000]) or "__INITIAL_STATE__" not in text:
            raise Blocked(f"no product data and a check/refusal page at {final}: {re.sub(r'<[^>]+>', ' ', text[:600]).split()[:40]}")
        rec["outcome"] = "no product on page"
        return rec
    canon = re.search(r'<link[^>]*rel="canonical"[^>]*href="([^"]+)"', text)
    rec["canonical"] = html.unescape(canon.group(1)) if canon else None
    rec["page_name"] = prod["name"]
    fields = (prod["bop"] or {}).get("fields") or []
    tables = [f.get("content") for f in fields if isinstance(f, dict) and f.get("title") == "nutritionalData"]
    rec["nutrition_html"] = tables[0] if len(tables) == 1 else (tables or None)
    rec["outcome"] = "read" if tables else "no nutrition field"
    return rec


def load_reads() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if READS.exists():
        for line in READS.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["product_id"]] = r
    return out


def candidates() -> list[dict]:
    with open(CANDIDATES, newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if (r.get("product_id") or "").strip()]


def cmd_fetch(limit: int | None, ids: list[str] | None = None) -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    done = load_reads()
    todo = [r for r in candidates() if r["product_id"].strip() not in done and (not ids or r["product_id"].strip() in ids)]
    if limit is not None:
        todo = todo[:limit]
    print(f"{len(done)} read before, {len(todo)} to read now")
    n = 0
    with open(READS, "a", encoding="utf-8") as out:
        for r in todo:
            pid = r["product_id"].strip()
            try:
                rec = read_one(pid, r["name"])
            except Blocked as e:
                with open(BLOCKED, "a", encoding="utf-8") as b:
                    b.write(json.dumps({"product_id": pid, "when": time.strftime("%Y-%m-%dT%H:%M:%S"), "why": str(e)}) + "\n")
                print(f"STOPPED at {pid}: {e}")
                return 2
            except Exception as e:  # a network failure after retries: not stored, so a rerun asks again
                print(f"  {pid}: not read ({type(e).__name__}: {e})")
                continue
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            out.flush()
            n += 1
            if n % 50 == 0:
                print(f"  {n} read")
    print(f"{n} pages read")
    return 0


# ---------------------------------------------------------------- the table

class _Tables(HTMLParser):
    """Every <table> as rows of (is_header, [cell texts]) with colspans expanded; <br> becomes a space."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: list[list[tuple[bool, list[str]]]] = []
        self.outside: list[str] = []
        self._row: list[str] | None = None
        self._th = False
        self._cell: list[str] | None = None
        self._span = 1
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._depth += 1
            if self._depth == 1:
                self.tables.append([])
        elif tag == "tr" and self._depth:
            self._row, self._th = [], False
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
            self._th = self._th or tag == "th"
            try:
                self._span = max(1, min(10, int(dict(attrs).get("colspan") or 1)))
            except ValueError:
                self._span = 1
        elif tag == "br":
            (self._cell if self._cell is not None else self.outside).append(" ")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            text = " ".join("".join(self._cell).split())
            self._row.extend([text] * self._span)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self.tables:
                self.tables[-1].append((self._th, self._row))
            self._row = None
        elif tag == "table" and self._depth:
            self._depth -= 1

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)
        elif not self._depth:
            self.outside.append(data)


PER100 = re.compile(r"(?<![\d.,])100\s*(g|grams?|ml|mls|millilitres?|milliliters?)(?![a-z])", re.I)
# (word in the heading, the label written to `state`): the same labels as Sainsbury's (tools/groceries/t2_sainsburys.py STATE_LABELS).
# A heading for the food as sold ("as sold", "uncooked", "unprepared", "raw", "dry") is plain: state "" (checked before "cook" / "prepar" / "dr").
STATE_LABELS = [
    ("as served", "as served"), ("grill", "grilled"), ("fried", "fried"), ("frying", "fried"), ("roast", "roasted"), ("bak", "baked"), ("oven", "oven cooked"),
    ("boil", "boiled"), ("microwav", "microwaved"), ("steam", "steamed"), ("cook", "cooked"), ("prepar", "prepared"), ("made up", "made up"),
    ("reconstitut", "made up"), ("rehydrat", "prepared"), ("dilut", "diluted"), ("drain", "drained"), ("edible", "edible portion"), ("consum", "as consumed"),
    ("brew", "brewed"), ("heated", "heated"), ("toast", "toasted"), ("serv", None), ("mixed", None), ("with", None),
]
AS_SOLD = re.compile(r"\b(uncooked|unprepared|as sold|as purchased|as bought|as packed|raw|dry weight|dry|undrained|frozen)\b")
FILLER = re.compile(r"\b(typical|values?|nutrition(al)?|information|energy|per|for|provides|contains|average|approx(imately)?|amount|of|product|food|"
                    r"the|a|an|as|when|in|g|ml|grams?|and|at|on|pack|instructions|according|to|by|weight)\b")


def basis(text: str) -> tuple[str | None, str | None]:
    """(per, state) of a heading: per = "g"/"ml" when it names exactly one 100 g or 100 ml basis (else None); state = "" for the food as sold,
    a label for a cooked/prepared basis, None when the heading's words are unclear."""
    t = " ".join(text.lower().replace("\u00a0", " ").split())
    units = {("ml" if m.group(1).startswith("m") else "g") for m in PER100.finditer(t)}
    per = units.pop() if len(units) == 1 and not re.search(r"100\s*(g|ml)\s*/\s*(100\s*)?(g|ml)\b", t) else None
    return per, state_of(PER100.sub(" ", t))


def state_of(text: str) -> str | None:
    """"" for the food as sold, a STATE_LABELS label for a cooked/prepared basis, None when the words are unclear (no row is then written)."""
    t = " ".join(re.sub(r"[()\[\]:;*,./\-–—]+", " ", text.lower().replace("\u00a0", " ")).split())
    labels: set = set()
    explicit_sold = re.search(r"\b(as sold|uncooked|unprepared|raw)\b", t) is not None
    if AS_SOLD.search(t):
        labels.add("")
        t = AS_SOLD.sub(" ", t)
    first = None
    for word, label in STATE_LABELS:  # the first word in this order names the state ("when oven baked" -> baked), as for Sainsbury's
        if word in t:
            if label is None:
                return None  # a serving description or a mix ("with milk"): unclear basis
            first = first or label
            t = re.sub(r"\S*" + re.escape(word) + r"\S*", " ", t)
    if first:
        labels.add(first)
    leftover = " ".join(FILLER.sub(" ", t).split())
    stated = labels - {""}
    if stated and "" in labels:
        return None  # two bases ("as sold" and "cooked") in one heading: unclear
    if leftover and not stated and not explicit_sold:
        return None  # words we don't understand and no basis named: unclear (e.g. "per 100g (per mousse)", "(skin off)")
    return stated.pop() if stated else ""


NUM = r"(?:[1-9]\d{0,2}(?:,\d{3})+|\d+)(?:\.\d+)?"  # "1,161" kJ is a thousands comma; "0,5" / "1,5" (a decimal comma) is not read
VALUE = re.compile(r"^(<\s*)?(\d+(?:\.\d+)?)\s*(g|grams?)?$", re.I)  # gram figures never carry a thousands comma
ENERGY_TOKEN = re.compile(rf"(<\s*)?({NUM})\s*(kj|kcals?)(?![a-z])", re.I)


def plain_value(cell: str) -> tuple[str | None, str]:
    """A gram figure as printed ("1.4g" -> "1.4", "<0.5g" -> "<0.5"); (None, why) when the cell isn't one."""
    t = re.sub(r"[*†‡]+$", "", cell.strip().replace("\u00a0", " ")).strip()  # a footnote mark after the figure
    if not t or t in ("-", "–", "—", "n/a", "N/A"):
        return None, "empty"
    m = VALUE.fullmatch(t)
    if not m:
        return None, f"not a gram figure: {t!r}"
    return (m.group(1) or "") + m.group(2), ""


def label_of(cell: str) -> str:
    t = cell.lower().replace("\u00a0", " ").replace("\u00b5", "u").replace("\u03bc", "u")
    t = re.sub(r"[*†‡]+", "", t)
    return " ".join(re.sub(r"[^a-z()/ -]", " ", t).split())


def nutrient(lbl: str) -> str | None:
    """Which nutrient a row label names, or None. Sodium, starch, polyols, mono/polyunsaturates are never read."""
    l = " ".join(lbl.replace("(", " ").replace(")", " ").split()).strip(" -")  # "(of which Saturates", "(kcal": a bracket the table didn't close
    if not l:
        return None
    if re.search(r"\b(mg|ug|mcg)$", l):
        return None  # figures in milligrams or micrograms: never read as grams
    l = re.sub(r"\s+g$", "", l)  # "Fat (g)": the label names the unit the figures are printed in
    if l.startswith("energy") or re.fullmatch(r"(kj|kcals?)( ?/ ?(kj|kcals?))?( calories)?|calories", l):
        return "energy"
    if "unsat" in l or "trans" in l or "omega" in l or "cholesterol" in l or "mono" in l or "poly" in l:
        return None
    l = re.sub(r"\s*-\s*", " ", l).strip()  # "Fat - Total", "- Sugars"
    if re.fullmatch(r"(of which )?(saturates|saturated fat|saturated fats|saturated|sat fat|saturated fatty acids|fat saturated|fat saturates)", l):
        return "saturates"
    if re.fullmatch(r"(total )?fats?( total| of which| vegetable)?", l):
        return "fat"
    if re.fullmatch(r"(total |available )?(carbohydrates?|carohydrates?|carboydrates?|carbohyrates?)", l):  # the last three: spelt so on the page
        return "carbs"
    if re.fullmatch(r"(of which )?(total )?sugars?", l):
        return "sugars"
    if re.fullmatch(r"(dietary )?fib(re|er)s?( aoac| ec definition)?", l):
        return "fibre"
    if re.fullmatch(r"(proteins?|protin)", l):  # "Protin": spelt so on the page
        return "protein"
    if re.fullmatch(r"salt( equivalent)?|equivalent as salt( to sodium)?", l):
        return "salt"
    return None


def energy_values(lbl: str, cell: str) -> tuple[list[tuple[str, str]], str]:
    """[(unit, figure as printed)] from an energy cell ("573kJ/135kcal", "573 kJ", or "135" under a "(kcal)" label)."""
    t = cell.replace("\u00a0", " ").strip()
    pair = re.fullmatch(rf"(?i)(<\s*)?({NUM})\s*/\s*(<\s*)?({NUM})\s*(kj|kcals?)\s*/\s*(kj|kcals?)", t)
    if pair and {pair.group(5).lower().rstrip("s"), pair.group(6).lower().rstrip("s")} == {"kj", "kcal"}:
        # "241/57 kJ/kcal": the two figures in the order the cell names their units
        return [(pair.group(5).lower().rstrip("s"), (pair.group(1) or "") + pair.group(2)),
                (pair.group(6).lower().rstrip("s"), (pair.group(3) or "") + pair.group(4))], ""
    found = [((m.group(3).lower().rstrip("s")), (m.group(1) or "") + m.group(2)) for m in ENERGY_TOKEN.finditer(t)]
    rest = ENERGY_TOKEN.sub(" ", t)
    if found:
        if re.search(r"\d", rest):
            return [], f"energy cell has other figures: {t!r}"
        return found, ""
    units = re.findall(r"\b(kj|kcals?)\b", lbl)
    pair = re.fullmatch(rf"(<\s*)?({NUM})\s*/\s*(<\s*)?({NUM})", t)
    if len(units) == 2 and {u.rstrip("s") for u in units} == {"kj", "kcal"} and pair:
        # "Energy kJ / kcal | 719 / 170": the two figures in the order the label names them
        return [(units[0].rstrip("s"), (pair.group(1) or "") + pair.group(2)), (units[1].rstrip("s"), (pair.group(3) or "") + pair.group(4))], ""
    unit = units[0].rstrip("s") if len(units) == 1 else None
    m = re.fullmatch(rf"(<\s*)?({NUM})", t)
    if unit and m:
        return [(unit, (m.group(1) or "") + m.group(2))], ""
    return [], f"energy cell not readable: {t!r}"


def parse_table(rows: list[tuple[bool, list[str]]]) -> list[dict] | str:
    """The per-100 column(s) of one table as [{per, state, kj, kcal, fat, ...}], or why none can be read."""
    head_i = None
    for i, (_, cells) in enumerate(rows[:4]):
        if any(PER100.search(c) for c in cells[1:]):
            head_i = i
            break
    if head_i is None:
        return "no per 100 g/ml column"
    head = rows[head_i][1]
    first_state = state_of(PER100.sub(" ", head[0].lower())) if head else ""
    cols, unclear = [], []
    for j, c in enumerate(head):
        if j == 0 or not PER100.search(c):
            continue
        if re.search(r"%|\bri\b|reference|gda", c, re.I):
            continue
        per, st = basis(c)
        if per is None:
            unclear.append(f"unclear basis {c!r}")
            continue
        if st is None or first_state is None:
            unclear.append(f"unclear basis wording {c!r} / {head[0]!r}")
            continue
        if st and first_state and st != first_state:
            unclear.append(f"two bases in one heading {head[0]!r} / {c!r}")
            continue
        cols.append((j, per, st or first_state, c))
    if unclear and not any(st == "" for _, _, st, _ in cols):
        return unclear[0]  # the unclear column might be the as-sold one: no row
    if not cols:
        return unclear[0] if unclear else "no per 100 g/ml column"
    out = []
    for j, per, st, heading in cols:
        vals: dict[str, str] = {}
        energy: list[tuple[str, str]] = []
        prev = None
        problem = None
        for _, cells in rows[head_i + 1:]:
            if not cells:
                continue
            lbl = label_of(cells[0])
            kind = nutrient(lbl)
            if kind is None and not lbl and prev == "energy":
                kind = "energy"  # the kcal line printed under the kJ line with no label of its own
            prev = kind
            if kind is None or j >= len(cells):
                continue
            if kind == "energy":
                got, why = energy_values(lbl, cells[j])
                if why and cells[j].strip():
                    problem = problem or why
                energy += got
                continue
            v, why = plain_value(cells[j])
            if v is None:
                if why != "empty":
                    vals.setdefault(kind + "!", why)
                continue
            if kind in vals and vals[kind] != v:
                problem = problem or f"two different {kind} figures"
            vals[kind] = v
        kj = {v for u, v in energy if u == "kj"}
        kcal = {v for u, v in energy if u == "kcal"}
        if len(kj) > 1 or len(kcal) > 1:
            problem = problem or "two different energy figures"
        rec = {"per": per, "state": st, "heading": heading, "kj": next(iter(kj), ""), "kcal": next(iter(kcal), ""), "problem": problem}
        for k in ("fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt"):
            rec[k] = vals.get(k, "")
            if not rec[k] and (k + "!") in vals:
                rec[k + "!"] = vals[k + "!"]
        out.append(rec)
    return out


TEXT_LABELS = [("energy", r"energy"), ("fat", r"(?:total )?fat"), ("saturates", r"(?:of which:? )?saturates|(?:of which:? )?saturated fat"),
               ("carbs", r"carbohydrates?"), ("sugars", r"(?:of which:? )?sugars?"), ("fibre", r"fibre"), ("protein", r"protein"), ("salt", r"salt")]


def text_label(text: str) -> list[dict] | str:
    """A label printed as one line of text instead of a table ("Typical Values Per 100g Energy 333kJ/78kcal Fat 0.2g ... Salt 0.48g"). Read only
    when the whole line is one per-100 heading followed by known nutrients each with one figure, in the table's usual order; anything else: no row."""
    t = " ".join(text.replace("\u00a0", " ").split())
    m = re.match(r"(?i)(typical values?:?\s+|nutrition(al)?( information)?:?\s+)?(?P<head>(\([^)]*\)\s*)?per 100\s*(g|ml)(\s*\([^)]*\))?)\s*:?\s+", t)
    if not m:
        return "nutrition printed as text, not a table"
    per, st = basis(m.group("head"))
    if per is None or st is None:
        return f"unclear basis wording {m.group('head')!r}"
    rest, rec, seen = t[m.end():], {"per": per, "state": st, "heading": m.group("head"), "kj": "", "kcal": "", "problem": None}, []
    for key, rx in TEXT_LABELS:
        mm = re.match(rf"(?i)({rx})\s*:?\s*", rest)
        if not mm:
            continue
        rest = rest[mm.end():]
        if key == "energy":
            e = re.match(rf"(?i)(<\s*)?({NUM})\s*kj\s*/?\s*(<\s*)?({NUM})\s*kcal\b\s*", rest)
            if not e:
                return "nutrition printed as text, not a table"
            rec["kj"], rec["kcal"] = (e.group(1) or "") + e.group(2), (e.group(3) or "") + e.group(4)
        else:
            e = re.match(rf"(?i)(<\s*)?({NUM})\s*g\b\s*", rest)
            if not e:
                return "nutrition printed as text, not a table"
            rec[key] = (e.group(1) or "") + e.group(2)
        rest = rest[e.end():]
        seen.append(key)
    if rest.strip() or "energy" not in seen:
        return "nutrition printed as text, not a table"
    for k in ("fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt"):
        rec.setdefault(k, "")
    return [rec]


def label_from(nutrition_html) -> tuple[dict | None, str]:
    """The one row to write for a product (or None and why not)."""
    if not nutrition_html:
        return None, "no nutrition table on the page"
    if isinstance(nutrition_html, list):
        return None, "two nutrition fields on the page"
    p = _Tables()
    p.feed(nutrition_html)
    p.close()
    found: list[dict] = []
    reasons = []
    if not p.tables:
        r = text_label("".join(p.outside))
        if isinstance(r, str):
            return None, r
        found, p.outside = r, []
    for t in p.tables:
        r = parse_table(t)
        if isinstance(r, str):
            reasons.append(r)
        else:
            found += r
    outside = " ".join("".join(p.outside).split())
    if outside and re.search(r"cook|prepar|drain|consum|serv|made up|dilut|heat|bak|grill|fri|roast|microwav|boil", outside, re.I):
        return None, f"words outside the table may change its basis: {outside[:120]!r}"
    if not found:
        return None, reasons[0] if reasons else "no per 100 g/ml column"
    plain = [r for r in found if r["state"] == ""]
    pool = plain if plain else found
    keyset = {tuple(r.get(k) for k in ("per", "state", "kj", "kcal", "fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt")) for r in pool}
    if len(keyset) > 1:
        return None, "more than one per-100 column and no single as-sold one"
    r = pool[0]
    if r["problem"]:
        return None, r["problem"]
    for k in ("kcal", "fat", "carbs", "protein"):
        if not r[k]:
            return None, f"{k} not printed as a number" + (f" ({r[k + '!']})" if r.get(k + "!") else "")
    main = [bg.printed_num(r[k]) for k in ("kcal", "protein", "carbs", "fat")]
    if None in main:
        return None, "a main figure isn't a number"
    kj = bg.printed_num(r["kj"]) if r["kj"] else None
    bad = bg.implausible(main[0], main[1], main[2], main[3], kj)
    if not bad and kj and main[0] >= 20 and not 3.55 <= kj / main[0] <= 4.82:
        bad = "kJ and kcal disagree"
    if bad:
        return None, bad
    return r, ""


# ---------------------------------------------------------------- writing

def cmd_write() -> int:
    reads = load_reads()
    order = [r["product_id"].strip() for r in candidates()]
    rows, why = [], {}
    for pid in order:
        rec = reads.get(pid)
        if rec is None:
            why["not read yet"] = why.get("not read yet", 0) + 1
            continue
        if rec.get("outcome") != "read":
            key = rec.get("outcome") or "?"
            why[key] = why.get(key, 0) + 1
            continue
        r, reason = label_from(rec.get("nutrition_html"))
        if r is None:
            key = reason.split(" (")[0].split(":")[0].split(" '")[0]
            why[key] = why.get(key, 0) + 1
            continue
        url = rec.get("canonical") or rec.get("final_url") or rec["url"]
        if not url.rstrip("/").endswith("/" + pid):
            why["page address doesn't end with the product id"] = why.get("page address doesn't end with the product id", 0) + 1
            continue
        rows.append({"product_id": pid, "per": r["per"], "state": r["state"], "kj": r["kj"], "kcal": r["kcal"], "fat_g": r["fat"], "saturates_g": r["saturates"],
                     "carbs_g": r["carbs"], "sugars_g": r["sugars"], "fibre_g": r["fibre"], "protein_g": r["protein"], "salt_g": r["salt"],
                     "checked_on": rec["fetched_on"], "page_url": url})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        for row in sorted(rows, key=lambda x: x["product_id"]):
            w.writerow(row)
    states = {}
    for row in rows:
        states[row["state"] or "(as sold)"] = states.get(row["state"] or "(as sold)", 0) + 1
    lines = [f"Morrisons labels, {date.today().isoformat()}: {len(order)} candidates, {len(reads)} pages read, {len(rows)} rows written to {OUT.relative_to(ROOT)}",
             "rows by basis: " + ", ".join(f"{k} {v}" for k, v in sorted(states.items(), key=lambda kv: -kv[1])),
             "left without numbers:"] + [f"  {v:5d}  {k}" for k, v in sorted(why.items(), key=lambda kv: -kv[1])]
    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


def cmd_show(pid: str) -> int:
    rec = load_reads().get(pid)
    if not rec:
        print("not read")
        return 1
    print(json.dumps({k: v for k, v in rec.items() if k != "nutrition_html"}, ensure_ascii=False, indent=1))
    h = rec.get("nutrition_html")
    if isinstance(h, str):
        p = _Tables()
        p.feed(h)
        for t in p.tables:
            for th, cells in t:
                print(("TH " if th else "   ") + " | ".join(cells))
        if "".join(p.outside).strip():
            print("outside:", " ".join("".join(p.outside).split()))
    print("->", label_from(h))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd")
    f = sub.add_parser("fetch")
    f.add_argument("--limit", type=int)
    f.add_argument("--ids", nargs="*", help="only these product ids (a trial on chosen products)")
    sub.add_parser("write")
    s = sub.add_parser("show")
    s.add_argument("product_id")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    if a.cmd == "fetch":
        return cmd_fetch(a.limit, a.ids)
    if a.cmd == "write":
        return cmd_write()
    if a.cmd == "show":
        return cmd_show(a.product_id)
    code = cmd_fetch(a.limit)
    cmd_write()
    return code


if __name__ == "__main__":
    sys.exit(main())
