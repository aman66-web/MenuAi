#!/usr/bin/env python3
"""Re-check what published chains' OWN websites say about halal food (track A of the halal round, 2026-10-16).

    python3 tools/dietary/recheck_halal.py --out DIR [--only id,id] [--workers 24]

For each published chain whose halal row is `not_stated` (or has no row), plus the `no` rows and the pages of the rows we already hold,
this fetches the chain's own site politely and records every place the word "halal" appears, with its surrounding words. It decides
nothing: a person reads the snippets and writes data/dietary/halal-c.csv. Rules it keeps:

* robots.txt as RFC 9309 reads it (tools/uk_extract/robots_rfc.py). A 4xx answer for robots.txt (403 included) means "no rules" (founder,
  2026-10-12); 401, 429, a 5xx or a dropped connection after retries means "do not fetch this host".
* One request a second per host, a normal browser User-Agent, pages found from the site's own links and sitemap only.
* A page that itself answers 401/403/429, or a bot-check / challenge page, stops that chain. Nothing is worked round.
* Only the chain's own domain (and its sub-domains) is fetched. Nothing from a third party is ever used as evidence.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import gzip
import hashlib
import html
import json
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import robots_rfc  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Safari/537.36")
SPECIAL_SLDS = {"co.uk", "org.uk", "com.au", "co.nz", "com.gg", "co.je", "gov.uk", "ac.uk", "uk.com"}
MAX_PAGES = 16
CHALLENGE = re.compile(
    r"_Incapsula_Resource|Incapsula incident|Just a moment\.\.\.|cf-chl|cf_chl|Attention Required! \| Cloudflare|Pardon Our Interruption|"
    r"px-captcha|Access Denied</title>|<title>Access Denied|errors\.edgesuite\.net|Request unsuccessful\. Incapsula|"
    r"Checking your browser before accessing|Enable JavaScript and cookies to continue|DataDome|geo\.captcha-delivery\.com|"
    r"Sorry, you have been blocked|This website is using a security service|You have been blocked", re.I)
SKIP_EXT = re.compile(r"\.(jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|woff2?|ttf|otf|mp4|webm|mp3|zip|xml|json|txt|docx?|xlsx?)(\?|$)", re.I)
SCORES = [
    (re.compile(r"halal"), 100),
    (re.compile(r"faq|frequently|questions|q-and-a"), 60),
    (re.compile(r"dietary|special-diet|diets|vegan|vegetarian|allerg|nutrition|calorie"), 30),
    (re.compile(r"food-polic|our-food|food-and-drink|sourcing|provenance|ingredient|meat|quality|ethic|food-promise|supply|welfare|our-story|our-menu"), 25),
    (re.compile(r"help|support|contact|customer|information|/info|about|good-to-know|polic|guest|visit"), 10),
    (re.compile(r"menu|restaurant"), 4),
]
EXCLUDE = re.compile(r"career|/jobs?|recruit|news|press|investor|privacy|terms|cookie|login|sign-?in|basket|checkout|gift|voucher|offers?|events?|franchis|"
                     r"modern-slavery|accessib|sitemap|unsubscribe|competition|careers|csr|sustainab|charity|donat|reward|app-?store|play\.google", re.I)

_lock = threading.Lock()
_host_next: dict[str, float] = {}
_robots: dict[str, object] = {}
_sitemaps: dict[str, list[str]] = {}


def registrable(host: str) -> str:
    host = host.lower().removeprefix("www.")
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in SPECIAL_SLDS:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


class Stop(Exception):
    """A refusal or a challenge: stop this chain, never work round it."""


class Skip(Exception):
    """This page is not available (404, timeout...): carry on with the others."""


def _pace(host: str, delay: float = 1.0) -> None:
    with _lock:
        now = time.monotonic()
        at = max(_host_next.get(host, 0), now)
        _host_next[host] = at + delay
    wait = at - now
    if wait > 0:
        time.sleep(wait)


def _open(url: str, accept: str = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", maxbytes: int = 4_000_000):
    host = urllib.parse.urlsplit(url).netloc
    last = None
    for attempt in range(3):
        _pace(host)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en-GB,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read(maxbytes + 1)
                return r.status, r.geturl(), r.headers.get("content-type", ""), data[:maxbytes], r.headers.get("content-encoding", "")
        except urllib.error.HTTPError as e:
            return e.code, url, e.headers.get("content-type", "") if e.headers else "", b"", ""
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            last = e
            time.sleep(4 * (attempt + 1))
    raise Skip(f"connection failed: {last}")


def robots_for(origin: str) -> tuple[list, str]:
    """(rules, note). note is '' when fine; 'UNREACHABLE' / '401' / '429' / '5xx' mean do not fetch."""
    with _lock:
        if origin in _robots:
            return _robots[origin]  # type: ignore[return-value]
    try:
        status, _, ctype, data, _enc = _open(origin + "/robots.txt", accept="text/plain,*/*")
    except Skip as e:
        res = ([("disallow", "/")], f"UNREACHABLE: {e}")
    else:
        text = data.decode("utf-8", "replace")
        if status == 200 and "<html" not in text[:500].lower():
            res = (robots_rfc.parse(text), f"robots 200 ({len(text)} bytes)")
            _sitemaps[origin] = [m.strip() for m in re.findall(r"(?im)^\s*sitemap:\s*(\S+)", text)]
        elif status == 200:
            res = ([], "robots.txt is an html page (no rules)")
        elif 400 <= status < 500 and status not in (401, 429):
            res = ([], f"robots {status} = no rules (RFC 9309)")
        else:
            res = ([("disallow", "/")], f"robots {status}: do not fetch")
    with _lock:
        _robots[origin] = res
    return res



class TextParser(HTMLParser):
    BLOCK = {"p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td", "th", "section", "article", "header", "footer",
             "details", "summary", "dt", "dd", "table", "button", "blockquote", "form", "label", "option"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._atext: list[str] = []
        self.scripts: list[str] = []
        self._in_script = False
        self._script_buf: list[str] = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script",):
            self._in_script = True
            self._script_buf = []
            return
        if tag in ("style", "noscript", "svg", "template"):
            self.skip += 1
            return
        if tag == "title":
            self._in_title = True
        if tag == "a" and a.get("href"):
            self._href = a["href"]
            self._atext = []
        if tag == "meta" and (a.get("name") in ("description", "twitter:description") or a.get("property") in ("og:description",)) and a.get("content"):
            self.out.append("\n" + a["content"] + "\n")
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_script = False
            self.scripts.append("".join(self._script_buf))
            return
        if tag in ("style", "noscript", "svg", "template"):
            self.skip = max(0, self.skip - 1)
            return
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._atext).split())))
            self._href = None
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self._in_script:
            self._script_buf.append(data)
            return
        if self.skip:
            return
        if self._in_title:
            self.title += data
        self.out.append(data)
        if self._href is not None:
            self._atext.append(data)


def parse_html(raw: str) -> tuple[str, list[tuple[str, str]], list[str], str]:
    p = TextParser()
    try:
        p.feed(raw)
        p.close()
    except Exception:
        pass
    text = "".join(p.out)
    text = re.sub(r"[ \t\r\f\v ]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip(), p.links, p.scripts, " ".join(p.title.split())


def script_text(scripts: list[str]) -> str:
    """Text held in script blobs (JSON-LD FAQs, Next.js data) that mention halal, decoded and with tags removed."""
    out = []
    for s in scripts:
        if "halal" not in s.lower():
            continue
        t = s
        try:
            t = json.dumps(json.loads(s), ensure_ascii=False)  # decodes \u escapes in valid JSON
        except Exception:
            t = s.encode("utf-8", "replace").decode("unicode_escape", "ignore") if "\\u" in s else s
        t = html.unescape(t.replace("\\n", " ").replace("\\/", "/").replace('\\"', '"'))
        t = re.sub(r"<[^>]+>", " ", t)
        out.append(" ".join(t.split()))
    return "\n".join(out)


def contexts(text: str, width: int = 320, limit: int = 8) -> list[str]:
    spans: list[list[int]] = []
    for m in re.finditer(r"halal|hal[aā]l|\bzabiha", text, re.I):
        a, b = max(0, m.start() - width), min(len(text), m.end() + width)
        if spans and a <= spans[-1][1]:
            spans[-1][1] = b
        else:
            spans.append([a, b])
    return [" ".join(text[a:b].split()) for a, b in spans[:limit]]


def score(url: str, text: str = "") -> int:
    path = urllib.parse.urlsplit(url).path.lower() + " " + text.lower()
    s = sum(v for rx, v in SCORES if rx.search(path))
    if s < 100 and EXCLUDE.search(path):
        return 0
    return s


def fetch_page(url: str, origin_rules: dict[str, list]):
    """-> dict(status, final, ctype, text, links, scripts, title) or raises Stop/Skip."""
    parts = urllib.parse.urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    if origin not in origin_rules:
        rules, note = robots_for(origin)
        origin_rules[origin] = rules
        if note.startswith(("UNREACHABLE", "robots 401", "robots 429", "robots 5")):
            raise Stop(f"{origin}: {note}")
    if not robots_rfc.allowed(origin_rules[origin], parts.path + ("?" + parts.query if parts.query else "")):
        raise Skip("robots.txt disallows")
    big = url.lower().split("?")[0].endswith(".pdf")
    status, final, ctype, data, enc = _open(url, maxbytes=40_000_000) if big else _open(url)
    if status in (401, 403, 429):
        raise Stop(f"HTTP {status} from {url}")
    if status >= 400:
        raise Skip(f"HTTP {status}")
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    if "pdf" in ctype.lower() or url.lower().split("?")[0].endswith(".pdf"):
        return {"status": status, "final": final, "ctype": ctype, "pdf": data}
    raw = data.decode("utf-8", "replace")
    if CHALLENGE.search(raw[:200000]) and len(raw) < 200000:
        raise Stop(f"bot check / challenge page at {url}")
    text, links, scripts, title = parse_html(raw)
    return {"status": status, "final": final, "ctype": ctype, "text": text, "links": links, "scripts": scripts, "title": title, "rawlen": len(raw)}


def pdf_text(data: bytes, tmp: Path) -> str:
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(data)
    try:
        out = subprocess.run(["pdftotext", "-layout", str(tmp), "-"], capture_output=True, timeout=120).stdout.decode("utf-8", "replace")
    except Exception:
        out = ""
    tmp.unlink(missing_ok=True)
    return out


def sitemap_urls(origin: str, rules: list, budget: int = 4) -> list[str]:
    cands = _sitemaps.get(origin) or [origin + "/sitemap.xml"]
    seen, urls, fetched = set(), [], 0
    queue = list(cands)
    while queue and fetched < budget:
        u = queue.pop(0)
        if u in seen:
            continue
        seen.add(u)
        pu = urllib.parse.urlsplit(u)
        if registrable(pu.netloc) != registrable(urllib.parse.urlsplit(origin).netloc):
            continue
        if not robots_rfc.allowed(rules, pu.path + ("?" + pu.query if pu.query else "")):
            continue
        try:
            status, _f, ctype, data, _e = _open(u, accept="application/xml,text/xml,*/*", maxbytes=6_000_000)
        except Skip:
            continue
        fetched += 1
        if status in (401, 403, 429):
            raise Stop(f"HTTP {status} from {u}")
        if status != 200:
            continue
        if data[:2] == b"\x1f\x8b":
            try:
                data = gzip.decompress(data)
            except Exception:
                continue
        t = data.decode("utf-8", "replace")
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", t)
        if "<sitemapindex" in t:
            # prefer sub-sitemaps that look like general pages; never walk store / product / location lists
            good = [l for l in locs if re.search(r"page|general|faq|help|content|static|main|site|info|post", l, re.I) and not re.search(r"store|product|location|pub|hotel|venue|branch|menu-item|recipe", l, re.I)]
            queue = (good or locs[:2])[:3] + queue
        else:
            urls += [html.unescape(l) for l in locs]
    return urls


def check_chain(cid: str, start: str, extra: list[str], cache: Path, known_url: str | None) -> dict:
    res: dict = {"chain": cid, "start": start, "pages": [], "blocked": None, "robots": {}, "notes": []}
    origin_rules: dict[str, list] = {}
    base = urllib.parse.urlsplit(start)
    origin = f"{base.scheme}://{base.netloc}"
    reg = registrable(base.netloc)
    queue: list[tuple[int, str]] = []
    seen: set[str] = set()
    pages_done = 0
    cdir = cache / cid
    cdir.mkdir(parents=True, exist_ok=True)

    def add(u: str, sc: int):
        u = u.split("#")[0]
        if not u or u in seen:
            return
        pu = urllib.parse.urlsplit(u)
        if pu.scheme not in ("http", "https") or registrable(pu.netloc) != reg:
            return
        if SKIP_EXT.search(pu.path) and not pu.path.lower().endswith(".pdf"):
            return
        seen.add(u)
        queue.append((sc, u))

    def visit(u: str) -> dict | None:
        nonlocal pages_done
        try:
            pg = fetch_page(u, origin_rules)
        except Skip as e:
            res["pages"].append({"url": u, "skipped": str(e)})
            return None
        pages_done += 1
        rec = {"url": u, "final": pg["final"], "status": pg["status"], "ctype": pg["ctype"]}
        if "pdf" in pg:
            text = pdf_text(pg["pdf"], cdir / "tmp.pdf")
            rec["pdf"] = True
        else:
            text = pg["text"]
            rec["title"] = pg["title"]
            st = script_text(pg["scripts"])
            if st:
                rec["script_contexts"] = contexts(st, 300, 6)
        rec["halal_in_text"] = len(re.findall(r"halal", text, re.I))
        rec["contexts"] = contexts(text)
        h = hashlib.sha1(u.encode()).hexdigest()[:12]
        (cdir / f"{h}.txt").write_text(f"URL: {u}\nFINAL: {pg['final']}\n\n{text}\n\n--- SCRIPT HALAL TEXT ---\n{script_text(pg.get('scripts', [])) if 'scripts' in pg else ''}", encoding="utf-8")
        res["pages"].append(rec)
        return pg

    try:
        rules, note = robots_for(origin)
        res["robots"][origin] = note
        origin_rules[origin] = rules
        if note.startswith(("UNREACHABLE", "robots 401", "robots 429", "robots 5")):
            res["blocked"] = f"{origin}: {note}"
            return res
        # sitemap lines
        # (re-read cheaply: robots_for kept only rules; fetch the Sitemap: lines from the cached text on disk is overkill, so ask again once)
        # The first page also gives us links.
        home = visit(start)
        if home is not None and "links" in home:
            for href, txt in home["links"]:
                u = urllib.parse.urljoin(home["final"], html.unescape(href))
                sc = score(u, txt)
                if sc >= 10:
                    add(u, sc)
        for e in extra:
            add(e, 150)
        if known_url:
            add(known_url, 140)
        # sitemap (only if robots allows it; uses Sitemap: lines found in robots.txt)
        try:
            smap = sitemap_urls(origin, rules)
        except Stop as e:
            raise
        for u in smap[:20000]:
            sc = score(u)
            if sc >= 30:
                add(u, sc)
        for g in ("/halal", "/faqs", "/faq", "/help", "/dietary", "/allergens"):
            add(origin + g, 20)
        queue.sort(key=lambda t: -t[0])
        visited_follow = 0
        while queue and pages_done < MAX_PAGES:
            sc, u = queue.pop(0)
            pg = visit(u)
            # one more hop: an FAQ / help index linking to its answers
            if pg is not None and "links" in pg and visited_follow < 4 and sc >= 30 and not pg["final"].lower().endswith(".pdf"):
                visited_follow += 1
                for href, txt in pg["links"]:
                    uu = urllib.parse.urljoin(pg["final"], html.unescape(href))
                    s2 = score(uu, txt)
                    if s2 >= 60:
                        add(uu, s2 - 5)
                queue.sort(key=lambda t: -t[0])
    except Stop as e:
        res["blocked"] = str(e)
    except Exception as e:  # noqa: BLE001
        res["notes"].append(f"error: {type(e).__name__}: {e}")
    return res


def load_targets() -> tuple[dict, dict]:
    rows: dict[str, dict] = {}
    for f in sorted((ROOT / "data" / "dietary").glob("halal-[ab].csv")):
        for r in csv.DictReader(open(f, newline="", encoding="utf-8")):
            rows[r["chain_id"]] = r
    return rows, {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--sites", required=True, help="json: chain id -> list of start URLs (first is the main one)")
    args = ap.parse_args()
    out = Path(args.out)
    cache = out / "cache"
    out.mkdir(parents=True, exist_ok=True)
    sites = json.loads(Path(args.sites).read_text())
    rows, _ = load_targets()
    want = [c for c in sites if (not args.only or c in args.only.split(","))]

    def run(cid: str) -> dict:
        spec = sites[cid]
        start, extra = spec[0], spec[1:]
        known = (rows.get(cid) or {}).get("source_url") or None
        if known and (not known.startswith("https://") or known.endswith("sitemap.xml")):
            known = None
        if known and registrable(urllib.parse.urlsplit(known).netloc) != registrable(urllib.parse.urlsplit(start).netloc):
            known = None
        return check_chain(cid, start, extra, cache, known)

    results = {}
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(run, c): c for c in want}
        for fut in cf.as_completed(futs):
            c = futs[fut]
            try:
                r = fut.result()
            except Exception as e:  # noqa: BLE001
                r = {"chain": c, "error": f"{type(e).__name__}: {e}"}
            results[c] = r
            hits = sum(p.get("halal_in_text", 0) for p in r.get("pages", []))
            print(f"{c:30} pages={len(r.get('pages', [])):2} halal-mentions={hits:3} blocked={r.get('blocked')}", flush=True)
            (out / f"{c}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "ALL.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
