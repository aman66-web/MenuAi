#!/usr/bin/env python3
"""The next product pages to read in Chrome: the ids in data/groceries/recipe-candidates/<shop>.csv not yet in raw-<shop>/chrome.jsonl, with their addresses.

    python3 tools/groceries/labels_chrome_next.py <shop> [N]      # prints "id<TAB>url" lines, N (default 70) at most
    python3 tools/groceries/labels_chrome_next.py <shop> --add 'JSON'  # appends one extractor line (validated) to the raw file
    python3 tools/groceries/labels_chrome_next.py <shop> N --batch TAB  # the next N pages as a browser_batch action list (navigate + extractor each)
    python3 tools/groceries/labels_chrome_next.py <shop> --add-file F   # appends every extractor line found in file F (one JSON object per line)
    python3 tools/groceries/labels_chrome_next.py <shop> --install         # the line that stores the reader in the open tab (window.name; kept while the tab
                                                                          # stays on that shop's site), to run once with javascript_tool before --short batches
    python3 tools/groceries/labels_chrome_next.py <shop> N --short TAB [--all]  # --all: every product in the shop's list without its own label, not only recipe ones
    python3 tools/groceries/labels_chrome_next.py <shop> N --short TAB    # the next N pages as navigate + a one-line call of the stored reader (about 200 bytes
                                                                          # a page instead of 2.9 KB); a page where the reader isn't stored answers needInstall
    python3 tools/groceries/labels_chrome_next.py --harvest               # copy every page result from Claude's own transcripts into raw-<shop>/chrome.jsonl

Reader v2 (2026-11-17): each page is read in two calls, "main" (the table, allergens, title) and "ing" (the ingredients, up to 1,500 characters), so neither
is cut off by the browser tool, and both name the product asked for ("want") and the site. A helper only runs the batches: the results are copied from its
transcript (~/.claude/projects/<project>/**/*.jsonl) byte for byte by harvest(), which every --short call runs first, so nothing is retyped and a figure can't
be mistyped. A page counts as read only when its main result (and its ingredients, when it has any) came back whole; a blocked page is never counted as read.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = {"asda": "https://www.asda.com/groceries/product/{id}", "aldi": "https://www.aldi.co.uk/product/{page}",
        "tesco": "https://www.tesco.com/groceries/en-GB/products/{id}", "marks-and-spencer": "https://www.marksandspencer.com/food/{page}",
        "sainsburys": "https://www.sainsburys.co.uk/gol-ui/product/{id}", "waitrose": "https://www.waitrose.com/ecom/products/{slug}/{id}"}


def slug(name: str) -> str:
    """A product name as a page address part ("Kalamata & Halkidiki Olive Bread 400g" -> "kalamata-halkidiki-olive-bread-400g")."""
    import re
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower().replace("'", "")).strip("-") or "product"


def all_products(shop: str):
    """Every product in the shop's published list (web/public/groceries/all/<shop>.json) that has its own product page and no label read from it yet (founder 2026-11-17:
    "we need nutrients for every single product"), as rows shaped like recipe-candidates (product_id, page). Rows whose only address is the shop's search are skipped."""
    doc = json.loads((ROOT / "web" / "public" / "groceries" / "all" / f"{shop}.json").read_text(encoding="utf-8"))
    for row in doc["products"]:
        nut = row[10] if len(row) > 10 else None
        if nut and not (len(nut) > 11 and nut[11] == "off"):
            continue  # the shop's own label is already read
        page = row[11] if len(row) > 11 and isinstance(row[11], str) else ""
        if shop in ("aldi", "marks-and-spencer") and not page:
            continue
        yield {"product_id": row[0], "page": page, "name": row[1]}


TRANSCRIPTS = Path.home() / ".claude" / "projects" / ("-" + str(ROOT).strip("/").replace("/", "-"))
HOSTS = {"asda.com": "asda", "aldi.co.uk": "aldi", "marksandspencer.com": "marks-and-spencer", "tesco.com": "tesco", "sainsburys.co.uk": "sainsburys",
         "waitrose.com": "waitrose"}
MARK = "[javascript_tool:javascript_exec] "


def _texts(node):
    """Every text inside a transcript line's tool results."""
    if isinstance(node, dict):
        if node.get("type") == "text" and isinstance(node.get("text"), str):
            yield node["text"]
        for v in node.values():
            if isinstance(v, (dict, list)):
                yield from _texts(v)
            elif isinstance(v, str) and MARK in v:
                yield v
    elif isinstance(node, list):
        for v in node:
            yield from _texts(v)


def _results(text: str):
    """The JSON objects the reader returned, exactly as returned; one cut short by the browser tool doesn't parse and is skipped (the page is offered again)."""
    dec = json.JSONDecoder()
    i = text.find(MARK)
    while i >= 0:
        j = i + len(MARK)
        try:
            obj, _ = dec.raw_decode(text, j)
            if isinstance(obj, str):
                obj = json.loads(obj)
            if isinstance(obj, dict):
                yield obj
        except ValueError:
            pass
        i = text.find(MARK, j)


def done_ids(shop: str) -> set[str]:
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
    done = set()
    if raw.exists():
        for line in raw.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(str(json.loads(line).get("id")))
    return done


def harvest(days: float = 4) -> str:
    """Copy reader v2 results from the transcripts of the last few days into raw-<shop>/chrome.jsonl (new pages only). Returns a one-line summary."""
    import time
    parts: dict[tuple[str, str], dict] = {}
    blocked: dict[str, set] = {}
    cutoff = time.time() - days * 86400
    for path in TRANSCRIPTS.glob("**/*.jsonl"):
        try:
            if path.stat().st_mtime < cutoff:
                continue
            lines = open(path, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with lines:
            for line in lines:
                if MARK not in line or "want" not in line:
                    continue
                try:
                    node = json.loads(line)
                except ValueError:
                    continue
                for text in _texts(node):
                    for r in _results(text):
                        shop, want = HOSTS.get(str(r.get("host", ""))), r.get("want")
                        if not shop or not isinstance(want, str) or not want or r.get("part") not in ("main", "ing"):
                            continue
                        if r["part"] == "main":
                            if "nut" not in r or "checked_on" not in r:
                                continue
                            if r.get("blocked"):
                                blocked.setdefault(shop, set()).add(want)
                                continue
                        elif not isinstance(r.get("ingredients"), str):
                            continue
                        parts.setdefault((shop, want), {})[r["part"]] = r
    added: dict[str, int] = {}
    done = {}
    for (shop, want), got in sorted(parts.items()):
        main = got.get("main")
        if not main:
            continue
        if shop not in done:
            done[shop] = done_ids(shop)
        if want in done[shop]:
            continue
        ing = got.get("ing")
        if (main.get("ingLen") or 0) > 0 and not ing:
            continue  # its ingredients didn't come back whole: offered again
        rec = {k: v for k, v in main.items() if k not in ("part", "want", "host", "ingLen")}
        rec["pageId"], rec["id"] = main.get("id"), want
        rec["ingredients"] = ing["ingredients"] if ing else ""
        if (main.get("ingLen") or 0) > len(rec["ingredients"]):
            rec["ingredientsCut"] = True
        raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
        raw.parent.mkdir(parents=True, exist_ok=True)
        with open(raw, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        done[shop].add(want)
        added[shop] = added.get(shop, 0) + 1
    bl = {s: len(v - done_ids(s)) for s, v in blocked.items()}
    return "harvested " + (", ".join(f"{s} {n}" for s, n in sorted(added.items())) or "nothing new") + ("; BLOCKED pages seen: " + ", ".join(f"{s} {n}" for s, n in bl.items() if n) if any(bl.values()) else "")


def main() -> int:
    if sys.argv[1] == "--harvest":
        print(harvest())
        return 0
    shop = sys.argv[1]
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 3 and sys.argv[2] == "--add-file":
        added = 0
        with open(raw, "a", encoding="utf-8") as out:
            for line in Path(sys.argv[3]).read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line.startswith("{"):
                    continue
                rec = json.loads(line)
                if isinstance(rec, dict) and str(rec.get("id", "")).strip() and "nut" in rec:
                    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    added += 1
                    if rec.get("blocked"):
                        print("BLOCKED PAGE:", rec["id"])
        print("added", added)
        return 0
    if len(sys.argv) > 3 and sys.argv[2] == "--add":
        rec = json.loads(sys.argv[3])
        assert isinstance(rec, dict) and str(rec.get("id", "")).strip(), "not an extractor line"
        with open(raw, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print("added", rec["id"], "blocked" if rec.get("blocked") else "")
        return 0
    reader = (Path(__file__).resolve().parent / "labels_chrome.js").read_text(encoding="utf-8")
    reader = " ".join(line.strip() for line in reader[reader.index("((mode, want) => {"):].splitlines() if line.strip() and not line.strip().startswith("//"))
    if len(sys.argv) > 2 and sys.argv[2] == "--install":
        print("window.name = " + json.dumps(reader) + "; 'installed'")
        return 0
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 70
    short = len(sys.argv) > 4 and sys.argv[3] == "--short"
    tab = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[3] in ("--batch", "--short") else None
    code = None
    if short:
        # the site allows inline scripts but not eval: the stored reader runs as a script element and leaves its JSON line on window.__lbl
        # --wait S: seconds on each page before reading (a gentler pace for a shop that slows down a quick reader: Tesco)
        wait_ms = int(float(sys.argv[sys.argv.index("--wait") + 1]) * 1000) if "--wait" in sys.argv else 2500
        # v2: two calls a page, "main" then "ing", each naming the product asked for; __lbl is emptied first, so a failed run can't return the last page's result
        code = ("await new Promise((r) => setTimeout(r, WAIT_MS)); if (!window.name.startsWith('((mode, want) => {')) JSON.stringify({ want: WANT, needInstall: true }); "
                "else { window.__lbl = null; const s = document.createElement('script'); s.textContent = 'window.__lbl = (' + window.name + ')(\"main\", ' + JSON.stringify(WANT) + ')'; "
                "document.head.appendChild(s); s.remove(); window.__lbl }").replace("WAIT_MS", str(wait_ms))
        ing_code = ("if (!window.name.startsWith('((mode, want) => {')) JSON.stringify({ want: WANT, needInstall: true }); "
                    "else { window.__lbl = null; const s = document.createElement('script'); s.textContent = 'window.__lbl = (' + window.name + ')(\"ing\", ' + JSON.stringify(WANT) + ')'; "
                    "document.head.appendChild(s); s.remove(); window.__lbl }")
        print(harvest(), file=sys.stderr)
    elif tab is not None:
        js = (Path(__file__).resolve().parent / "labels_chrome.js").read_text(encoding="utf-8")
        # a moment for the page to draw its folded sections before reading
        body = js[js.index("((mode, want) => {"):]
        # comments and indentation out (it is sent once per page): the same code, smaller
        body = " ".join(line.strip() for line in body.splitlines() if line.strip() and not line.strip().startswith("//"))
        code = "await new Promise((r) => setTimeout(r, 2500)); (" + body + ")(\"main\", location.pathname.split(\"/\").filter(Boolean).pop())"
    actions = []
    done = done_ids(shop)
    out = 0
    every = "--all" in sys.argv
    for r in (all_products(shop) if every else csv.DictReader(open(ROOT / "data" / "groceries" / "recipe-candidates" / f"{shop}.csv", newline="", encoding="utf-8"))):
        if True:
            key = r["product_id"] if shop != "aldi" else (r["page"] or r["product_id"]).rstrip("/").split("/")[-1]
            if r["product_id"] in done or key in done:
                continue
            url = BASE[shop].format(id=r["product_id"], page=r["page"] or r["product_id"], slug=slug(r.get("name", "")))
            if tab is None:
                print(f"{r['product_id']}\t{url}")
            else:
                want = json.dumps(str(r["product_id"]))
                actions += [{"name": "navigate", "input": {"url": url, "tabId": tab}}, {"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": code.replace("WANT", want)}}]
                if short:
                    actions.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": ing_code.replace("WANT", want)}})
            out += 1
            if out >= n:
                break
    if tab is not None:
        print(json.dumps(actions, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
