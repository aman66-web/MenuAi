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
        "sainsburys": "https://www.sainsburys.co.uk/gol-ui/product/{id}", "waitrose": "https://www.waitrose.com/ecom/products/{slug}/{id}",
        "morrisons": "https://groceries.morrisons.com/products/{slug}/{id}", "iceland": "https://www.iceland.co.uk/p/x/{id}.html",
        "coop": "https://www.coop.co.uk/products/{id}"}
# wine, beer and spirits names a slug can carry without a size (is_alcohol needs one): left out of Co-op's list
import re as _re
COOP_DRINK = _re.compile(r"\b(wines?|chardonnay|shiraz|merlot|sauvignon|pinot|rioja|malbec|cabernet|prosecco|cava|champagne|riesling|grenache|tempranillo|zinfandel|"
                         r"chenin|semillon|viognier|beaujolais|bordeaux|chianti|primitivo|montepulciano|valpolicella|lambrusco|muscadet|claret|lagers?|beers?|ciders?|"
                         r"ipa|stout|porter|gin|vodka|whisky|whiskey|rum|brandy|cognac|tequila|liqueurs?|sherry|spritz|seltzer|spirits|croft|baileys|pimms|aperol|"
                         r"smirnoff|gordons|bacardi|jagermeister|kopparberg|strongbow|carling|stella|peroni|corona|guinness|budweiser|fosters|heineken|magners|"
                         r"thatchers|brewdog|madri|birra|moretti|desperados|hooch|wkd|martini|cointreau|disaronno|tia maria|kahlua|captain morgan|jack daniels|"
                         r"famous grouse|bells|glenfiddich|jameson|southern comfort|archers|malibu|sambuca|amaretto|vermouth|mead|perry|shandy)\b")
# a name that also names a food or a soft drink is food ("Chardonnay Wine Vinegar Crisps", "Chianti Beef Pizza", "Bells Scotch Steak Pie", "Ginger Beer")
COOP_FOOD = _re.compile(r"\b(vinegar|crisps|chips|pizza|pie|pies|ginger beer|ginger ale|sauce|gravy|cake|cakes|truffles?|chocolates?|mustard|beef|chicken|steak|pork|"
                        r"ham|cheese|battered|glazed|marinade|stock|soup|pudding|trifle|jam|chutney|sausages?|alcohol free|non alcoholic|0 0|zero)\b")
# wine and spirits bottles named by region or brand ("Languedoc 75cl", "Talisker Skye 70cl")
COOP_BOTTLE = _re.compile(r"\b(75cl|70cl|35cl|50cl|37 5cl|20cl|1 litre)\b")
# groceries only: pet food and household goods are left out first, whatever else the name says
COOP_NOT_FOOD = _re.compile(r"\b(whiskas|felix|pedigree|dreamies|sheba|cesar|winalot|purina|go cat|cat|cats|dog|dogs|kitten|puppy|washing up|laundry|detergent|"
                            r"toilet|bin bags|bleach|kitchen roll|tissues|nappies|wipes|fabric|dishwasher|shampoo|toothpaste|deodorant|batteries)\b")
READER = 4  # the reader's version (it sends it as "v"): 3 tried every "Ingredients" heading, 4 skips a box holding the nutrition table too (18 November 2026)


def slug(name: str) -> str:
    """A product name as a page address part ("Kalamata & Halkidiki Olive Bread 400g" -> "kalamata-halkidiki-olive-bread-400g")."""
    import re
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower().replace("&", " and ").replace("'", "")).strip("-") or "product"


def all_products(shop: str):
    """Every product in the shop's published list (web/public/groceries/all/<shop>.json) with its own product page (founder 2026-11-17: "we need nutrients for
    every single product"; 2026-11-18: "not just the product, but the ingredients"), as rows shaped like recipe-candidates (product_id, page, name): those with no
    label of any kind first, then those whose label came from somewhere else or whose ingredients haven't been read. Rows whose only address is the shop's search
    are skipped. Alcoholic drinks are never in these lists (build_all_products.py leaves them out)."""
    if shop == "coop":
        # Co-op has no list in the app yet: its catalogue's own sitemap (saved once, 18 November 2026), alcoholic drinks left out by name
        import re
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import build_groceries as bg
        xml = (ROOT / "data" / "groceries" / "listing" / "raw" / "coop_products_sitemap.xml").read_text(encoding="utf-8")
        for url in re.findall(r"<loc>https://www\.coop\.co\.uk/products/([a-z0-9-]+)</loc>", xml):
            name = url.replace("-", " ")
            drink = bg.is_alcohol(name) or COOP_DRINK.search(name) or (COOP_BOTTLE.search(name) and not _re.search(r"\b(oil|vinegar|water|juice)\b", name))
            # a liqueur, a strength ("17 vol") or a wine sold by the bottle is a drink whatever food it names ("Jam Shed Rose Wine 75cl", "Baileys x Terry's
            # Chocolate Orange Irish Cream Liqueur")
            strong = _re.search(r"\b(liqueur|liqueurs|\d+ vol|abv|jam shed)\b", name) or (_re.search(r"\bwines?\b", name) and COOP_BOTTLE.search(name))
            if url != "search" and not strong and not COOP_NOT_FOOD.search(name) and (COOP_FOOD.search(name) or not drink):
                yield {"product_id": url, "page": url, "name": name}
        return
    doc = json.loads((ROOT / "web" / "public" / "groceries" / "all" / f"{shop}.json").read_text(encoding="utf-8"))
    first, then = [], []
    for row in doc["products"]:
        nut = row[10] if len(row) > 10 else None
        page = row[11] if len(row) > 11 and isinstance(row[11], str) else ""
        if shop in ("aldi", "marks-and-spencer") and not page:
            continue
        (then if nut else first).append({"product_id": row[0], "page": page, "name": row[1]})
    yield from first
    yield from then


TRANSCRIPTS = Path.home() / ".claude" / "projects" / ("-" + str(ROOT).strip("/").replace("/", "-"))
HOSTS = {"asda.com": "asda", "aldi.co.uk": "aldi", "marksandspencer.com": "marks-and-spencer", "tesco.com": "tesco", "sainsburys.co.uk": "sainsburys",
         "waitrose.com": "waitrose", "groceries.morrisons.com": "morrisons", "iceland.co.uk": "iceland", "coop.co.uk": "coop"}
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


_ICE: dict = {}


def _iceland_names() -> dict:
    if not _ICE:
        doc = json.loads((ROOT / "web" / "public" / "groceries" / "all" / "iceland.json").read_text(encoding="utf-8"))
        _ICE.update({r[0]: r[1] for r in doc["products"]})
    return _ICE


def stored_versions(shop: str) -> dict[str, int]:
    """Every page in raw-<shop>/chrome.jsonl, with the newest reader version that read it."""
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
    out: dict[str, int] = {}
    if raw.exists():
        for line in raw.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                k = str(r.get("id"))
                # a line without a version: read by reader 2 if it came through the harvest (it has pageId), else by the first reader
                out[k] = max(out.get(k, 0), r.get("reader") or (2 if "pageId" in r else 1))
    return out


def done_ids(shop: str) -> set[str]:
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
    done = set()
    if raw.exists():
        for line in raw.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                # Tesco pages read before reader 4 without ingredients are read once more (earlier readers missed Tesco's list); before 4, "reader" was
                # stamped by this script whatever the tab ran, so only a page the tab itself said was read by 4 counts
                if shop == "tesco" and (r.get("reader") or 0) < READER and r.get("nut") and not r.get("ingredients"):
                    continue
                done.add(str(r.get("id")))
    return done


def harvest(days: float = 4) -> str:
    """Copy reader v2 results from the transcripts of the last few days into raw-<shop>/chrome.jsonl (new pages only). Returns a one-line summary."""
    import time
    parts: dict[tuple[str, str], dict] = {}
    seen: dict[tuple[str, str], int] = {}  # how many times each page's main result came back (a page read 3 times is kept with what came back whole)
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
                        if not shop or not isinstance(want, str) or not want or r.get("part") not in ("main", "ing", "ing2", "ice"):
                            continue
                        if r["part"] == "main":
                            if "nut" not in r or "checked_on" not in r:
                                continue
                            if r.get("blocked"):
                                blocked.setdefault(shop, set()).add(want)
                                continue
                        elif r["part"] in ("ing", "ing2") and not isinstance(r.get("ingredients"), str):
                            continue
                        parts.setdefault((shop, want), {})[r["part"]] = r
                        if r["part"] == "main":
                            seen[(shop, want)] = seen.get((shop, want), 0) + 1
    added: dict[str, int] = {}
    done = {}
    for (shop, want), got in sorted(parts.items()):
        main = got.get("main")
        if not main:
            continue
        if shop not in done:
            done[shop] = stored_versions(shop)
        # a page is added when it isn't in the file yet, or when this read was made by a newer reader than the one stored (Tesco's re-reads)
        if want in done[shop] and (main.get("v") or 2) <= done[shop][want]:
            continue
        text = (got.get("ing") or {}).get("ingredients", "") + (got.get("ing2") or {}).get("ingredients", "")
        tries = seen.get((shop, want), 0)
        if len(text) < (main.get("ingLen") or 0) and tries < 3:
            continue  # its ingredients didn't come back whole: offered again (at most three times)
        if shop == "iceland" and "ice" not in got and tries < 3:
            continue  # Iceland's embedded record didn't come back whole: offered again
        rec = {k: v for k, v in main.items() if k not in ("part", "want", "host", "ingLen", "v")}
        rec["pageId"], rec["id"], rec["reader"] = main.get("id"), want, main.get("v") or 2
        rec["ingredients"] = text
        if (main.get("ingLen") or 0) > len(text):
            rec["ingredientsCut"] = True
        raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
        raw.parent.mkdir(parents=True, exist_ok=True)
        with open(raw, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        ice = (got.get("ice") or {}).get("iceland")
        if shop == "iceland" and isinstance(ice, dict) and ice.get("nutritionInformation"):
            # the page's own product record, filed where labels_iceland.py keeps the pages its script read, so its write step (and every check in it) applies
            url = f"https://www.iceland.co.uk/p/x/{want}.html"
            names = _iceland_names()
            with open(ROOT / "data" / "groceries" / "nutrition" / "raw-iceland" / "pages.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({"product_id": want, "page_url": url, "final_url": url, "http": 200, "checked_on": rec.get("checked_on", ""),
                                    "listing_name": names.get(want, ""), "status": "ok" if ice.get("page_id") == want else "redirected",
                                    "page_id": ice.get("page_id", ""), "page_name": ice.get("page_name", ""), "nutritionInformation": ice["nutritionInformation"],
                                    "drainedWeight": ice.get("drainedWeight"), "allergenContains": ice.get("contains"), "allergenMayContain": ice.get("mayContain"),
                                    "read_in": "chrome"}, ensure_ascii=False) + "\n")
        done[shop][want] = main.get("v") or 2
        added[shop] = added.get(shop, 0) + 1
    bl = {s: len(v - set(stored_versions(s))) for s, v in blocked.items()}
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
                if short and shop != "coop":  # Co-op's catalogue prints no ingredients
                    actions.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": ing_code.replace("WANT", want)}})
                if short and shop != "coop":
                    actions.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": ing_code.replace("WANT", want).replace('("ing"', '("ing2"')}})
                if short and shop == "iceland":
                    actions.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": ing_code.replace("WANT", want).replace('("ing"', '("ice"')}})
            out += 1
            if out >= n:
                break
    if tab is not None:
        print(json.dumps(actions, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
