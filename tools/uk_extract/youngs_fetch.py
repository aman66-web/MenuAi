"""Polite downloader for Young's pubs' own websites (used by tools/uk_extract/youngs.py).

Young's runs 265 pubs on 263 separate web addresses (the list is the site's own public API,
https://www.youngs.co.uk/wp-json/wp/v2/venues, the one its "Our pubs" page loads). Every host has its own robots.txt: it is read once per
host (RFC 9309 matcher in robots_rfc.py) and every path is checked against it before the page is requested. One request at a time, at
least 1.1 s apart across ALL hosts, a normal browser User-Agent, no cookies. A redirect is followed by hand (up to 3 hops) and the new
address is checked against its own host's robots.txt. 403, 429 or a disallowed path is never worked round: it is recorded in the
cache's `blocked.txt` and the page is skipped (the build report says so). Pages already in the cache are not requested again.
Standard library only; runs on Python 3.9.
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
DELAY = 1.1
VENUES_URL = "https://www.youngs.co.uk/wp-json/wp/v2/venues?per_page=100&page={page}&order=asc&orderby=title"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def _fetch_once(url: str) -> tuple:
    """(status, bytes, location). Dropped connections are retried twice; every HTTP status is returned to the caller."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json,*/*"})
    for attempt in range(3):
        try:
            with _OPENER.open(req, timeout=60) as resp:
                return resp.status, resp.read(), resp.headers.get("Location", "")
        except urllib.error.HTTPError as exc:
            return exc.code, b"", exc.headers.get("Location", "") if exc.headers else ""
        except OSError:
            if attempt == 2:
                return 0, b"", ""
            time.sleep(5)
    return 0, b"", ""


def cache_name(url: str) -> str:
    p = urllib.parse.urlsplit(url)
    stem = re.sub(r"[^A-Za-z0-9]+", "_", (p.path or "/") + ("?" + p.query if p.query else "")).strip("_")[:60] or "home"
    digest = hashlib.sha1(url.encode()).hexdigest()[:8]
    return f"{p.netloc}__{stem}__{digest}.html"


class Fetcher:
    def __init__(self, cache: Path, network: bool = True):
        self.network = network     # False = read the cache only; a page or robots.txt that is not cached stops the run
        self.cache = Path(cache)
        (self.cache / "robots").mkdir(parents=True, exist_ok=True)
        (self.cache / "pages").mkdir(parents=True, exist_ok=True)
        self.rules = {}      # host -> parsed robots rules
        self.last = 0.0
        self.requests = 0
        self.blocked = []    # (url, why)
        self.missing = []    # (url, status)
        self._gate = threading.Lock()

    def _wait(self) -> None:
        """Request STARTS are at least DELAY apart across all hosts and all threads (downloads may overlap; the request rate does not)."""
        with self._gate:
            gap = DELAY - (time.time() - self.last)
            if gap > 0:
                time.sleep(gap)
            self.last = time.time()
            self.requests += 1

    def _note(self, line: str) -> None:
        with self._gate:
            with open(self.cache / "blocked.txt", "a", encoding="utf-8") as fh:
                fh.write(line + "\n")

    def prefetch(self, urls: list, workers: int = 6) -> None:
        """Download (and cache) every url not cached yet. One thread per host at a time, so a host never sees two requests at once;
        the global request rate stays one per DELAY."""
        by_host: dict = {}
        for u in urls:
            by_host.setdefault(urllib.parse.urlsplit(u).netloc, []).append(u)

        def work(host: str) -> None:
            for u in by_host[host]:
                self.get(u)

        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(work, sorted(by_host)))

    def robots(self, host: str, scheme: str = "https") -> list:
        """The parsed rules of `host`, or None when its robots.txt could not be read (then no page of the host is requested).
        A host whose robots.txt answered an error is remembered in robots/<host>.err (delete the file to ask again)."""
        if host in self.rules:
            return self.rules[host]
        f = self.cache / "robots" / (host + ".txt")
        err = self.cache / "robots" / (host + ".err")
        if err.exists():
            if self.network and err.read_text(encoding="utf-8").startswith("connection failed"):
                err.unlink()           # a failed connection is asked again when the network is on
            else:
                self.rules[host] = None
                return None
        if f.exists():
            text = f.read_text(encoding="utf-8", errors="replace")
        else:
            if not self.network:
                raise SystemExit(f"{host}: robots.txt is not in the cache {self.cache}: run with --fetch")
            url = f"{scheme}://{host}/robots.txt"
            status, data, loc = 0, b"", ""
            for _hop in range(5):      # RFC 9309: follow redirects (a pub's old address often forwards everything to its new one)
                self._wait()
                status, data, loc = _fetch_once(url)
                if status in (301, 302, 303, 307, 308) and loc:
                    url = urllib.parse.urljoin(url, loc)
                    continue
                break
            if status == 200:
                text = data.decode("utf-8", errors="replace")
            elif status in (404, 410):
                text = ""          # no robots.txt = nothing is disallowed (RFC 9309)
            else:
                text = None
            if text is None:
                err.write_text(f"robots.txt answered {status}\n" if status else "connection failed\n", encoding="utf-8")
                self._note(f"robots.txt of {host} answered {status}: no page of this host was requested")
                self.rules[host] = None
                return None
            f.write_text(text, encoding="utf-8")
        self.rules[host] = robots_rfc.parse(text)
        return self.rules[host]

    def get(self, url: str, hops: int = 0) -> tuple:
        """(status, text, final_url). status 0 = not fetched (blocked / robots / network); text '' unless 200. Cached on disk
        (a page that answered 200, 404 or a redirect is never asked for again; a network failure or a 5xx is asked again)."""
        p = urllib.parse.urlsplit(url)
        f = self.cache / "pages" / cache_name(url)
        meta = f.with_suffix(".json")
        if meta.exists():
            m = json.loads(meta.read_text(encoding="utf-8"))
            retry = self.network and (m["status"] == 0 or m["status"] >= 500)
            if not retry:
                if m["status"] == 200:
                    return 200, f.read_text(encoding="utf-8", errors="replace"), m["final"]
                if m["status"] in (301, 302, 303, 307, 308) and m.get("location") and hops < 3:
                    return self.get(urllib.parse.urljoin(url, m["location"]), hops + 1)
                return m["status"], "", m["final"]
        rules = self.robots(p.netloc)
        if rules is None:
            self.blocked.append((url, "robots.txt unreadable"))
            return 0, "", url
        path = p.path + ("?" + p.query if p.query else "") or "/"
        if not robots_rfc.allowed(rules, path):
            self.blocked.append((url, "robots.txt disallows"))
            self._note(f"{url}: robots.txt disallows this path: not requested")
            return 0, "", url
        if not self.network:
            raise SystemExit(f"{url} is not in the cache {self.cache}: run with --fetch")
        self._wait()
        status, data, loc = _fetch_once(url)
        meta.write_text(json.dumps({"url": url, "status": status, "final": url, "location": loc}), encoding="utf-8")
        if status in (301, 302, 303, 307, 308) and loc and hops < 3:
            return self.get(urllib.parse.urljoin(url, loc), hops + 1)
        if status == 200:
            f.write_bytes(data)
            return 200, data.decode("utf-8", errors="replace"), url
        if status in (403, 429, 401, 503):
            self.blocked.append((url, f"HTTP {status}"))
            self._note(f"{url}: HTTP {status}: not worked round")
        elif status != 404:
            self.missing.append((url, status))
        return status, "", url


def clean_site(url: str) -> str:
    """The pub's address from the API with the one known typo fixed ('https://https://www...' for two pubs) and a trailing '/'."""
    url = (url or "").strip()
    url = re.sub(r"^(https?://)+", lambda m: m.group(0).split("//")[0] + "//", url)
    return url.rstrip("/") + "/" if url else ""


def load_venues(cache: Path, fetcher: Fetcher) -> list:
    """The pubs from the site's own API: [{slug, name, site, rooms, postcode, city, id}], cached as venues.json."""
    f = Path(cache) / "venues.json"
    if f.exists():
        out = json.loads(f.read_text(encoding="utf-8"))
        for v in out:
            v["site"] = clean_site(v["site"])
        return out
    rows, page = [], 1
    while True:
        fetcher._wait()
        status, data, _ = _fetch_once(VENUES_URL.format(page=page))
        if status != 200:
            raise SystemExit(f"the venues API answered HTTP {status}: stop and report")
        got = json.loads(data.decode("utf-8"))
        rows += got
        if len(got) < 100:
            break
        page += 1
    out = []
    for v in rows:
        a = v["acf"]
        out.append({"slug": v["slug"], "name": re.sub(r"\s+", " ", v["title"]["rendered"]), "site": clean_site(a.get("pubExternalUrl") or ""),
                    "rooms": a.get("roomsExternalUrl") or "", "city": a.get("city") or "", "postcode": a.get("postcode") or "",
                    "status": v["status"], "id": v["id"]})
    f.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out
