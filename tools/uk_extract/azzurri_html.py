"""Reader for the HTML menu pages of the Azzurri group's three sites (Zizzi, ASK Italian, Coco di Mama): calories-only chains.

Used by zizzi_html.py, ask_italian_html.py and coco_di_mama_html.py (one thin script per chain: its settings and category names).
It does NOT touch the group's nutrition PDFs (they sit on cdn.sanity.io, whose robots.txt says `Disallow: /*.pdf`; see
data/held-robots/README.md) and never reads anything under data/held-robots.

What the pages are. All three sites run the same platform (Next.js). The server sends each menu page already rendered: every dish is an
<article data-ui="menu-item"> with its name, description, a "NNN kcal" line and "Vegetarian" / "Vegan" chips, and the same page carries
the data it was drawn from in its own script tags (self.__next_f.push chunks: the sections, items, `kcal`, `dietary.claims`). Nothing is
loaded from another address: the files under /_next/ and /api/ (which robots.txt disallows for everybody) are never requested.
Pages read, per site: the full menu (/.../menus) and each other menu tab the site's own page lists (set menus, lunch, kids, festive).
Where the numbers come from: the rendered text of the page (what a visitor sees). The data in the page's scripts is a second route to
the same number and must agree for every dish (the run stops otherwise); the schema.org JSON-LD of the central page is a third.
A dish whose calories the page does not print (the alcoholic drinks: the page hides their calories although its script data holds a
number) is not published; the hidden number is never used.

Each site has a central menu page (/menus) and a menu page per restaurant (listed in the site's sitemap.xml, linked from its restaurant
pages), so menus can differ by site. A dish is published only when ALL of these hold (the script checks them, nothing is done by hand):
  1. the same dish name is printed with calories at 2 or more different sites (a site's several tabs count once);
  2. every record of that name on that kind of menu (tab) prints the same calories: a name printed with two values is left out;
  3. the name is not in a section the settings exclude (Coco di Mama's pasta: "Kcals shown are for sauce only").
Menus of different kinds (e.g. Zizzi's 2 Course Lunch Menu against its full menu) are separate: a dish that has the same name and the same
calories on two kinds of menu is one item; one with different calories on another menu is a second item named "Dish (Menu title)",
each with the number that menu prints. Nothing is chosen between.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import html as htmllib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
DELAY = 1.1  # seconds between two requests to one host (politeness: at most one request a second)
PUSH = re.compile(r"self\.__next_f\.push\(\[\d+,(.*?)\]\)</script>", re.S)
ARTICLE = re.compile(r'<article data-ui="menu-item"(.*?)</article>', re.S)

_PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pancetta|salami|chorizo|pork|prosciutto|nduja|gammon|speck|guanciale|mortadella|porchetta|"
                   r"lardons?|pigs? in blankets?|pigs? in blanket)\b", re.I)
_BEEF = re.compile(r"\b(beef|steak|sirloin|rump|ribeye|rib-eye|brisket|hamburger|bresaola)\b", re.I)
_MEATY = re.compile(r"\b(burgers?|meatballs?|mince[d]?|ribs?|bolognese|ragu|lasagne|meat|carne|patty|kebabs?|hot dogs?|sliders?)\b", re.I)
_ANIMAL = re.compile(r"\b(beef|pork|chicken|lamb|turkey|duck|fish|cod|haddock|salmon|tuna|prawns?|shrimp|crab|squid|calamari|seabass|sea bass|"
                     r"bacon|ham|sausages?|pepperoni|salami|chorizo|pancetta|steak|brisket|mussels?|anchov(y|ies)|veg(an|etarian)?|plant|halloumi|"
                     r"vegetable|bean|lentil|mushroom|venison)\b", re.I)


class Blocked(SystemExit):
    pass


def txt(s: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


# ------------------------------------------------------------------------------------------------------------------ fetching

_last: dict[str, float] = {}


def http_get(url: str, *, rules: list | None, accept: str = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") -> tuple[int, bytes]:
    """One GET: robots.txt honoured (RFC 9309 matcher), one request per DELAY seconds per host, a normal browser User-Agent, gzip.
    403 / 429 / 401 stop the whole run (never worked round). A dropped connection or 5xx is retried twice, slowly."""
    parts = urllib.parse.urlsplit(url)
    if rules is not None:
        path = parts.path + (("?" + parts.query) if parts.query else "")
        if not robots_rfc.allowed(rules, path):
            raise Blocked(f"robots.txt disallows {url}")
    host = parts.netloc
    for attempt in range(5):
        wait = _last.get(host, 0) + DELAY - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en-GB,en;q=0.9",
                                                   "Accept-Encoding": "gzip"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
                if r.headers.get("Content-Encoding", "").lower() == "gzip":
                    data = gzip.decompress(data)
                _last[host] = time.monotonic()
                return r.status, data
        except urllib.error.HTTPError as e:
            _last[host] = time.monotonic()
            if e.code in (401, 403, 429):
                raise Blocked(f"HTTP {e.code} from {url}: stopped, not worked round") from e
            if e.code == 404:
                return 404, b""
            if attempt == 4:
                raise Blocked(f"HTTP {e.code} from {url} five times: stopped") from e
            time.sleep(20 * (attempt + 1))
        except (urllib.error.URLError, OSError):
            _last[host] = time.monotonic()
            if attempt == 4:
                raise
            time.sleep(15 * (attempt + 1))
    raise Blocked(f"could not read {url}")


# ------------------------------------------------------------------------------------------------------------------ parsing

def _chunks(page: str) -> list[str]:
    out = []
    for m in PUSH.finditer(page):
        try:
            v = json.loads(m.group(1))
        except ValueError:
            continue
        if isinstance(v, str):
            out.append(v)
    return out


def _find_key(o, key: str, depth: int = 0):
    if depth > 6:
        return None
    if isinstance(o, dict):
        if key in o:
            return o
        for v in o.values():
            r = _find_key(v, key, depth + 1)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = _find_key(v, key, depth + 1)
            if r is not None:
                return r
    return None


def _rows(page: str, key: str):
    """The first script chunk holding a JSON row that contains `key`, as the dict that has it."""
    for s in _chunks(page):
        if f'"{key}"' not in s[:400000]:
            continue
        m = re.match(r"^[0-9a-f]+:(.*)$", s, re.S)
        if not m:
            continue
        try:
            o = json.loads(m.group(1))
        except ValueError:
            continue
        r = _find_key(o, key)
        if r is not None:
            return r
    return None


def jsonld(page: str):
    for s in _chunks(page):
        if s.startswith('{"@context":"https://schema.org","@type":"Menu"'):
            return json.loads(s)
    return None


def clean_name(raw: str) -> str:
    """The dish name as printed minus the promo marker ("NEW", "NEW⭐") and emoji decorations; nothing else is changed."""
    n = re.sub(r"^\s*NEW\b[\s:\-\u2013]*(?:[\u2b50\u2605]\ufe0f?)?\s*", "", raw)
    n = re.sub(r"[\u2b50\u2605\u2600-\u27bf\ufe0f\U0001F300-\U0001FAFF]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    n = re.sub(r"\s+-\s*$", "", n)
    if re.match(r"^NEW\b", n):
        raise SystemExit(f"name still starts with NEW after cleaning: {raw!r}: add a rule for this marker")
    return n


def key_of(name: str) -> str:
    return norm_ws(name.replace("’", "'").replace("‘", "'")).casefold()


def parse_page(page: str, url: str) -> dict:
    """{'items': [...], 'tabs': [...], 'note': str, 'venues': [...], 'sections': {path: description}, 'props': {...}} for one menu page.
    Every dish comes from the rendered article AND the page's script data, which must agree (names, descriptions, calories, diet marks);
    `kcal` is the number the page prints (None when it prints none, even if the script data holds one: never used)."""
    props = _rows(page, "menuSections")
    if props is None:
        return {"items": None, "tabs": [], "note": "", "venues": [], "sections": {}, "props": None}
    if 'data-hide-kcal="false"' not in page:
        raise SystemExit(f"{url}: the page no longer says data-hide-kcal=\"false\": calories may be hidden, re-check the page")
    flat: list[tuple[tuple, dict]] = []

    def walk(sec: dict, path: tuple) -> None:
        p = path + (norm_ws(sec["title"]),)
        for it in sec.get("items", []):
            flat.append((p, it))
        for ch in sec.get("children", []):
            walk(ch, p)

    descs: dict[tuple, str] = {}

    def walk_desc(sec: dict, path: tuple) -> None:
        p = path + (norm_ws(sec["title"]),)
        if norm_ws(sec.get("description", "")):
            descs[p] = norm_ws(sec["description"])
        for ch in sec.get("children", []):
            walk_desc(ch, p)

    for s in props["menuSections"]:
        walk(s, ())
        walk_desc(s, ())
    arts = ARTICLE.findall(page)
    if len(arts) != len(flat):
        raise SystemExit(f"{url}: {len(arts)} dishes on the page but {len(flat)} in its script data")
    items = []
    for (path, it), art in zip(flat, arts):
        name_dom = txt(re.search(r'data-ui="menu-item-name"[^>]*>(.*?)</h3>', art, re.S).group(1))
        if name_dom != norm_ws(it["name"]):
            raise SystemExit(f"{url}: page shows {name_dom!r} where its script data has {it['name']!r}")
        d = re.search(r"</h3>\s*<p[^>]*>(.*?)</p>", art, re.S)
        desc_dom = txt(d.group(1)) if d else ""
        if desc_dom != norm_ws(it.get("description", "")):
            raise SystemExit(f"{url}: description of {name_dom!r} differs between the page and its script data")
        k = re.search(r'data-ui="menu-item-kcal"[^>]*>(.*?)</span>', art, re.S)
        kcal = None
        if k:
            m = re.fullmatch(r"(\d+) kcal", txt(k.group(1)))
            if not m:
                raise SystemExit(f"{url}: {name_dom!r}: unexpected calories text {txt(k.group(1))!r}")
            kcal = int(m.group(1))
            if it.get("kcal") != kcal:
                raise SystemExit(f"{url}: {name_dom!r}: page prints {kcal} kcal, its script data says {it.get('kcal')}")
        chips = {txt(c) for c in re.findall(r'data-ui="chip"[^>]*>(.*?)</span>', art, re.S)}
        claims = {c for c in it.get("dietary", {}).get("claims", []) if c in ("vegetarian", "vegan")}
        if {c.lower() for c in chips} != claims:
            raise SystemExit(f"{url}: {name_dom!r}: diet marks differ: page {sorted(chips)} vs data {sorted(claims)}")
        if kcal is not None and not 0 <= kcal <= 4000:
            raise SystemExit(f"{url}: {name_dom!r}: implausible {kcal} kcal")
        items.append({"path": path, "raw": name_dom, "name": clean_name(name_dom), "desc": desc_dom, "kcal": kcal,
                      "hidden_kcal": it.get("kcal") if kcal is None else None, "diet": sorted(claims), "code": it.get("code")})
    note = ""
    modal = props.get("allergenMenuModal") or {}
    for info in modal.get("info", []) or []:
        if norm_ws(info.get("infoHeading", "")).lower() == "nutritional menu":
            note = norm_ws(" ".join(c.get("text", "") for blk in info.get("infoBodyText", []) for c in blk.get("children", [])))
    v = _rows(page, "venues")
    return {"items": items, "tabs": props.get("menuTabs", []), "note": note, "venues": (v or {}).get("venues", []), "sections": descs,
            "props": props, "venue_path": props.get("basePath"), "modal": modal}


# ------------------------------------------------------------------------------------------------------------------ settings

def default_variant(site: str, tab: str) -> str:
    """Zizzi and ASK Italian: the menu kind is the tab (file stem "menus" = the full menu, "menus__set-menu" = the tab /menus/set-menu)."""
    return "menu" if tab == "menus" else tab[len("menus__"):]


class Chain:
    """Settings of one chain (see zizzi_html.py)."""

    def __init__(self, *, id, name, host, cuisine, aliases, source_title, venue_re, venue_path, variants, categories, excluded_sections,
                 note, limited=(), variant_fn=default_variant, non_gb_cta=None, expected_items=None, min_sites=5, tab_titles=True):
        self.id, self.name, self.host, self.cuisine, self.aliases = id, name, host, cuisine, aliases
        self.source_title, self.venue_re, self.venue_path = source_title, re.compile(venue_re), venue_path
        self.variants = variants            # ordered {menu kind: title}; the first is the primary menu
        self.categories = categories        # {(menu kind, section path tuple): category}
        self.excluded_sections = excluded_sections  # {(menu kind, section path tuple): reason}
        self.note, self.limited = note, set(limited)
        self.variant_fn = variant_fn
        self.non_gb_cta = non_gb_cta
        self.expected_items, self.min_sites, self.tab_titles = expected_items, min_sites, tab_titles

    @property
    def base(self) -> str:
        return f"https://{self.host}"


# ------------------------------------------------------------------------------------------------------------------ fetch plan

def _save(cache: Path, rel: str, data: bytes, log: list[str], url: str) -> Path:
    dest = cache / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    log.append(f"{stamp}\t{url}\t{rel}\t{len(data)}\t{hashlib.sha256(data).hexdigest()}")
    return dest


def fetch_all(chain: Chain, cache: Path, limit: int | None = None) -> None:
    """Download robots.txt, sitemap.xml, the central pages and every restaurant's menu pages into `cache` (pages already there are kept)."""
    cache.mkdir(parents=True, exist_ok=True)
    logf = cache / "fetch-log.tsv"
    log: list[str] = logf.read_text().splitlines() if logf.exists() else []

    def flush():
        logf.write_text("\n".join(log) + "\n")

    robots_path = cache / "robots.txt"
    if not robots_path.exists():
        st, data = http_get(f"{chain.base}/robots.txt", rules=None, accept="text/plain,*/*")
        if st != 200:
            raise Blocked(f"robots.txt answered {st}")
        _save(cache, "robots.txt", data, log, f"{chain.base}/robots.txt")
    rules = robots_rfc.parse(robots_path.read_text(encoding="utf-8"))
    sm_path = cache / "sitemap.xml"
    if not sm_path.exists():
        st, data = http_get(f"{chain.base}/sitemap.xml", rules=rules, accept="application/xml,text/xml,*/*")
        if st != 200:
            raise Blocked(f"sitemap.xml answered {st}")
        _save(cache, "sitemap.xml", data, log, f"{chain.base}/sitemap.xml")
    flush()

    def get_page(url: str, rel: str) -> str | None:
        dest = cache / rel
        if dest.exists():
            return dest.read_text(encoding="utf-8")
        st, data = http_get(url, rules=rules)
        if st == 404:
            stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            log.append(f"{stamp}\t{url}\t404\t0\t")
            return None
        text = data.decode("utf-8")
        if "__next_f" not in text:
            raise Blocked(f"{url}: not a menu page (no page data): a challenge page? stopped")
        _save(cache, rel, data, log, url)
        return text

    central = get_page(f"{chain.base}/menus", "central/menus.html")
    if central is None:
        raise Blocked("the central menu page answered 404")
    cp = parse_page(central, "central")
    if cp["props"] is None:
        raise SystemExit("the central menu page has no menu data")
    for tab in cp["tabs"]:
        if tab["fullPath"] != "menus":
            get_page(f"{chain.base}/{tab['fullPath']}", f"central/{tab['fullPath'].replace('/', '__')}.html")
    flush()
    urls = venue_urls(chain, cache, cp)
    n = 0
    for url in urls:
        if limit is not None and n >= limit:
            break
        key = urllib.parse.urlsplit(url).path.strip("/").replace("/", "__")
        text = get_page(url, f"venues/{key}/menus.html")
        n += 1
        if text is not None:
            vp = parse_page(text, url)
            if vp["props"] is not None:
                base = urllib.parse.urlsplit(url).path
                if vp["venue_path"] != base:
                    raise SystemExit(f"{url}: the page says its menu base is {vp['venue_path']!r}")
                for tab in vp["tabs"]:
                    if tab["fullPath"] != "menus":
                        sub = tab["fullPath"][len("menus"):]
                        get_page(f"{chain.base}{base}{sub}", f"venues/{key}/{tab['fullPath'].replace('/', '__')}.html")
        if n % 10 == 0:
            flush()
            print(f"  {n}/{len(urls)} restaurants", flush=True)
    flush()


def venue_urls(chain: Chain, cache: Path, central_parsed: dict) -> list[str]:
    """Menu pages of the open restaurants in Great Britain: the sitemap's menu pages, minus restaurants the central page's own data marks as
    outside Great Britain (country other than GB, or the ROI & Belfast allergen/nutrition guides' restaurants), closed or test venues."""
    sm = (cache / "sitemap.xml").read_text(encoding="utf-8")
    locs = [u for u in re.findall(r"<loc>([^<]+)</loc>", sm) if chain.venue_re.match(urllib.parse.urlsplit(u).path)]
    out_ids: set = set()
    if chain.non_gb_cta:
        for c in central_parsed["modal"].get("ctas", []):
            if chain.non_gb_cta in c.get("copy", ""):
                out_ids |= set(c.get("includedVenues") or [])
    excluded_paths = {chain.venue_path(v["fullPath"]) for v in central_parsed["venues"]
                      if v.get("fullPath") and (v.get("country") != "GB" or v["_id"] in out_ids or v.get("closed") or v.get("testVenue"))}
    return sorted({u for u in locs if urllib.parse.urlsplit(u).path not in excluded_paths})


# ------------------------------------------------------------------------------------------------------------------ aggregate

def read_cache(chain: Chain, cache: Path) -> dict:
    """Parse every saved page: {'central': {file stem: parsed}, 'sites': [{'site', 'tab', 'parsed', 'file'}], 'nomenu': [...]}."""
    central = {}
    for f in sorted((cache / "central").glob("*.html")):
        central[f.stem] = parse_page(f.read_text(encoding="utf-8"), str(f))
    sites, nomenu = [], []
    for d in sorted((cache / "venues").iterdir()):
        for f in sorted(d.glob("*.html")):
            p = parse_page(f.read_text(encoding="utf-8"), str(f))
            if p["items"] is None:
                nomenu.append(str(f))
                continue
            sites.append({"site": d.name, "tab": f.stem, "parsed": p, "file": f})
    return {"central": central, "sites": sites, "nomenu": nomenu}


def check_tab_titles(chain: Chain, pages: list[tuple[str, str, dict]]) -> None:
    """The page's own tab bar must still call each menu kind what the settings say."""
    if not chain.tab_titles:
        return
    for name, tab, p in pages:
        for t in p["tabs"]:
            kind = "menu" if t["fullPath"] == "menus" else t["fullPath"][len("menus/"):]
            if kind not in chain.variants:
                raise SystemExit(f"{name}: the page lists a menu tab {t['fullPath']!r} the settings do not know: add it to VARIANTS")
            if t["title"] != chain.variants[kind]:
                raise SystemExit(f"{name}: tab {t['fullPath']!r} is now called {t['title']!r}, settings say {chain.variants[kind]!r}")


def aggregate(chain: Chain, data: dict, report: list[str]) -> list[dict]:
    variants = list(chain.variants)
    primary = variants[0]
    recs: dict[tuple, list[dict]] = defaultdict(list)
    sites_per_variant: dict[str, set] = defaultdict(set)
    sec_notes: dict[str, set] = defaultdict(set)
    for s in data["sites"]:
        v = chain.variant_fn(s["site"], s["tab"])
        if v not in chain.variants:
            raise SystemExit(f"{s['file']}: unknown menu kind {v!r}: add it to the settings")
        sites_per_variant[v].add(s["site"])
        for path, desc in s["parsed"]["sections"].items():
            sec_notes[v].add(" > ".join(path) + ": " + desc)
        for it in s["parsed"]["items"]:
            if (v, it["path"]) in chain.excluded_sections:
                continue
            recs[(v, key_of(it["name"]), "kcal" if it["kcal"] is not None else "nokcal")].append({**it, "site": s["site"]})
    cands: dict[str, dict[str, dict]] = {v: {} for v in variants}
    left: dict[str, list[str]] = defaultdict(list)
    for (v, k, kind), rs in sorted(recs.items()):
        if kind == "nokcal":
            continue
        sites = {r["site"] for r in rs}
        by_value = Counter(r["kcal"] for r in rs)
        nok = recs.get((v, k, "nokcal"), [])
        name = Counter(r["name"] for r in rs).most_common(1)[0][0]
        if len(by_value) > 1:
            shown = ", ".join(str(x) + " at " + str(n) for x, n in sorted(by_value.items()))
            left[v].append(name + ": printed with different calories (" + shown + ")")
            continue
        if len(sites) < 2:
            left[v].append(name + ": printed at only one site (" + next(iter(sites)) + ")")
            continue
        if nok:
            left[v].append(f"{name}: printed without calories at {len({r['site'] for r in nok})} sites and with them at {len(sites)}")
            continue
        paths = Counter(r["path"] for r in rs)
        diets = [set(r["diet"]) for r in rs]
        cands[v][k] = {"variant": v, "key": k, "name": name, "kcal": next(iter(by_value)), "sites": len(sites),
                       "path": paths.most_common(1)[0][0], "paths": sorted(paths), "desc": Counter(r["desc"] for r in rs).most_common(1)[0][0],
                       "diet_all_veg": all(d & {"vegetarian", "vegan"} for d in diets), "diet_some_veg": any(d & {"vegetarian", "vegan"} for d in diets),
                       "n_records": len(rs)}
    report.append("## Sites read per menu kind: " + ", ".join(f"{chain.variants[v]} {len(sites_per_variant[v])}" for v in variants))
    out: list[dict] = []
    first: dict[str, int] = {}  # name key -> calories of the first menu kind that published it
    seen_primary = {k for (v, k, kind) in recs if v == primary}
    for v in variants:
        for k, c in cands[v].items():
            if k in first:
                if first[k] == c["kcal"]:
                    continue  # the same name with the same calories on an earlier menu: one item
                c["name"] = c["name"] + " (" + chain.variants[v] + ")"
                c["suffixed"] = True
            elif v != primary and k in seen_primary:
                c["name"] = c["name"] + " (" + chain.variants[v] + ")"  # the full menu has the name but did not publish it (see the left-out list)
                c["suffixed"] = True
            else:
                first[k] = c["kcal"]
            out.append(c)
    unmapped: Counter = Counter()
    for c in out:
        c["category"] = chain.categories.get((c["variant"], c["path"]))
        if c["category"] is None:
            unmapped[(c["variant"], c["path"])] += 1
    if unmapped:
        raise SystemExit("sections with publishable dishes but no category in the script (add them to CATEGORIES):\n" +
                         "\n".join(f"  {v}: {' > '.join(p)} ({n} dishes)" for (v, p), n in sorted(unmapped.items())))
    names = Counter(c["name"] for c in out)
    dup = [n for n, k in names.items() if k > 1]
    if dup:
        raise SystemExit("two published dishes share a name: " + ", ".join(dup))
    for v in variants:
        report.append(f"## Left out on {chain.variants[v]} ({len(left[v])})")
        report.extend("- " + x for x in sorted(left[v]))
    report.append("## Section notes printed by the pages")
    for v in variants:
        for n in sorted(sec_notes[v]):
            report.append(f"- [{chain.variants[v]}] {n}")
    nokcal = Counter()
    hidden = 0
    for (v, k, kind), rs in recs.items():
        if kind == "nokcal" and (v, k, "kcal") not in recs:
            nokcal[(chain.variants[v], rs[0]["name"], rs[0]["path"][-1])] += 1
            hidden += any(r["hidden_kcal"] is not None for r in rs)
    report.append(f"## Printed without calories at every site, so not published: {len(nokcal)} (of which the page's script data holds a number it "
                  f"does not show: {hidden}; never used)")
    report.extend(f"- [{lab}] {sec}: {nme}" for (lab, nme, sec), _ in sorted(nokcal.items()))
    report.append("## Excluded sections")
    for (v, path), why in chain.excluded_sections.items():
        n = len({key_of(it["name"]) for s in data["sites"] if chain.variant_fn(s["site"], s["tab"]) == v
                 for it in s["parsed"]["items"] if it["path"] == path})
        report.append(f"- [{chain.variants[v]}] {' > '.join(path)}: {n} names with {why}")
    return out


# ------------------------------------------------------------------------------------------------------------------ cross-checks

def cross_checks(chain: Chain, data: dict, published: list[dict], ld, report: list[str]) -> None:
    """The central pages against what the restaurants agree on; the central full menu's JSON-LD against its rendered text."""
    pub = {(c["variant"], c["key"]): c["kcal"] for c in published if not c.get("suffixed")}
    mism = []
    for tab, p in data["central"].items():
        if tab != "menus":
            continue  # without a restaurant chosen the set-menu tabs may just repeat the full menu (ASK does)
        v = chain.variant_fn("central", tab)
        for it in p["items"]:
            k = key_of(it["name"])
            if it["kcal"] is not None and (v, k) in pub and pub[(v, k)] != it["kcal"]:
                mism.append(f"{it['name']} [{tab}]: central {it['kcal']} vs restaurants {pub[(v, k)]}")
    report.append(f"## Central pages against the restaurants' agreed values: {len(mism)} disagreements")
    report.extend("- " + m for m in mism)
    bad = []
    if ld is not None:
        names: dict[str, set] = {}

        def walk(o):
            for mi in o.get("hasMenuItem", []):
                m = re.match(r"(\d+) calories", (mi.get("nutrition") or {}).get("calories", ""))
                if m:
                    names.setdefault(norm_ws(mi["name"]), set()).add(int(m.group(1)))
            for sub in o.get("hasMenuSection", []):
                walk(sub)

        walk(ld)
        for it in data["central"]["menus"]["items"]:
            if it["kcal"] is not None and it["kcal"] not in names.get(it["raw"], set()):
                bad.append(f"{it['raw']}: page {it['kcal']} vs JSON-LD {sorted(names.get(it['raw'], []))}")
        report.append(f"## JSON-LD of the central full menu against its rendered text: {len(bad)} disagreements ({len(names)} names with calories there)")
        report.extend("- " + b for b in bad)
    if bad or mism:
        raise SystemExit("cross-check failed:\n" + "\n".join((mism + bad)[:20]))


# ------------------------------------------------------------------------------------------------------------------ tags and items

def tags_for(c: dict) -> tuple[str, bool]:
    """(tags, meat type not stated). vegetarian only when EVERY record of the dish carries the page's own Vegetarian/Vegan chip; pork / beef
    only from the dish's printed name or description; a vegetarian dish gets no meat tag."""
    if c["diet_all_veg"]:
        return "vegetarian", False
    text = f"{c['name']} {c['desc']}"
    tags = []
    if _PORK.search(text):
        tags.append("contains_pork")
    if _BEEF.search(text):
        tags.append("contains_beef")
    return "|".join(tags), bool(_MEATY.search(text)) and not _ANIMAL.search(text) and not tags


# ------------------------------------------------------------------------------------------------------------------ main

def run(chain: Chain, argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=f"Build data/source/{chain.id}/ from {chain.host}'s menu pages (calories only)")
    ap.add_argument("cache", type=Path, help="folder for the downloaded pages (keep it outside the repo)")
    ap.add_argument("--fetch", action="store_true", help="download the pages first (1 request a second, robots.txt honoured)")
    ap.add_argument("--limit", type=int, default=None, help="with --fetch: stop after this many restaurants (testing)")
    ap.add_argument("--checked-on", help="the day the pages were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--no-write", action="store_true", help="print the report and write nothing")
    args = ap.parse_args(argv)
    if args.fetch:
        fetch_all(chain, args.cache, args.limit)
        if not args.checked_on:
            return 0
    if not args.checked_on and not args.no_write:
        ap.error("--checked-on is required")
    data = read_cache(chain, args.cache)
    if "menus" not in data["central"] or not data["sites"]:
        raise SystemExit(f"no pages in {args.cache}: run with --fetch")
    check_tab_titles(chain, [("central", t, p) for t, p in data["central"].items()] +
                     [(s["site"], s["tab"], s["parsed"]) for s in data["sites"] if s["tab"] == "menus"])
    ld = jsonld((args.cache / "central" / "menus.html").read_text(encoding="utf-8"))
    report: list[str] = []
    published = aggregate(chain, data, report)
    cross_checks(chain, data, published, ld, report)
    n_sites = len({s["site"] for s in data["sites"]})
    report.insert(0, f"# {chain.name}: {len(published)} dishes published; {n_sites} restaurants' menu pages read ({len(data['sites'])} pages), "
                     f"{len(data['nomenu'])} restaurant pages without menu data")
    if n_sites < chain.min_sites:
        raise SystemExit(f"only {n_sites} restaurants read: a calories-only chain needs {chain.min_sites} or more sites")
    items, meat_unstated = [], []
    for c in published:
        tags, unstated = tags_for(c)
        if unstated:
            meat_unstated.append(c["name"])
        if c["diet_some_veg"] and not c["diet_all_veg"]:
            report.append(f"- diet mark on some sites only, no vegetarian tag: {c['name']}")
        items.append(dict(name=c["name"], category=c["category"], calories=c["kcal"], tags=tags, rankable=False,
                          limited_time=c["variant"] in chain.limited, notes=f"printed with the same calories at {c['sites']} sites"))
    report.append("## Items per category")
    report.extend(f"- {k}: {v}" for k, v in Counter(i["category"] for i in items).items())
    report.append(f"## Meat type not stated (no pork/beef tag): {len(meat_unstated)}")
    report.extend("- " + m for m in sorted(meat_unstated))
    report.append("## Central full-menu page SHA-256 " + sha256_file(args.cache / "central" / "menus.html"))
    (args.cache / "report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report[:3]))
    print(f"(full report: {args.cache / 'report.txt'})")
    if chain.expected_items is not None and len(items) != chain.expected_items:
        raise SystemExit(f"{len(items)} dishes published, expected {chain.expected_items}: the menus changed, read the report and update EXPECTED_ITEMS")
    if args.no_write:
        return 0
    out = write_chain_folder(chain_id=chain.id, name=chain.name, cuisine=chain.cuisine, source_title=chain.source_title,
                             source_url=f"{chain.base}/menus", checked_on=args.checked_on, aliases=chain.aliases, items=items, out=args.out,
                             note=chain.note, nutrition_level="calories")
    print(f"wrote {len(items)} items to {out}")
    return 0
