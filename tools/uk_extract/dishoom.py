#!/usr/bin/env python3
"""Build data/source/dishoom/ from Dishoom's own allergen-and-calorie menu app (a CALORIES-ONLY chain, with complete allergens).

    python3 tools/uk_extract/dishoom.py CACHE_DIR --fetch                          # open the page in Chromium once and read it
    python3 tools/uk_extract/dishoom.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--report]

Source: https://app.served-app.com/website/dishoom ("Dishoom Allergen Menus", the page Dishoom's own site links for allergens). It is a Next.js page that
draws the menu from Google Firestore (the project's own scripts open a realtime stream; there is no JSON file or API route to download), so the script
loads the page in Chromium like any visitor, opens each menu tab, expands every dish (the dish's panel shows "Vegetarian/Vegan", "Contains: ..." and
"May Contain: ...") and saves what the page shows (capture.json: tab, section, name, description text, panel text). Needs Node with playwright-core and a
Chromium (NODE_PLAYWRIGHT / CHROME below). One page load, four tab clicks, no crawling.
robots.txt: https://app.served-app.com/robots.txt is `User-agent: *` / `Allow: /` (checked with robots_rfc.py). firestore.googleapis.com/robots.txt is a 404
(no rules); the browser reaches Firestore only through the page's own scripts, and this script never calls Firestore itself.

Nutrition: every dish prints calories only, "(NNN kcal)" at the end of its description: protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable).

Tabs read: ALL DAY, BREAKFAST, KIDS, DRINKS (the restaurant menus). Not read: CHRISTMAS 2026 (no calories), AT HOME (kits), the DELIVERY, DELIVERY MANCHESTER
and CANARY WHARF CLICK & COLLECT menus (the same dish names print different, larger calories there, e.g. Chicken Ruby 728 in the restaurant and 984 on the
delivery menu, so they are other portions), EVENTS, GROUP FEASTING and SUPPER CLUB (event menus, not opened).

Sites: the page is one menu for all Dishoom restaurants. It names 13 of them (Covent Garden, Shoreditch, King's Cross, Carnaby, Edinburgh, Kensington,
Manchester, Birmingham, Canary Wharf, Battersea, Glasgow, Leeds, Borough), and it labels each dish served at only some of them in the dish name ("... ONLY",
"CHEF'S SPECIAL, GLASGOW, KINGS CROSS & MANCHESTER ..."). A dish with no such label is read as served everywhere; a labelled dish is published only when its
label names 2 or more restaurants (Haggis Pau: Glasgow & Edinburgh; Irn Bru: Glasgow & Edinburgh; Lamb Nihari: Shoreditch & Kensington; Nalli Nihari Biryani:
Glasgow, King's Cross & Manchester). One-restaurant dishes are left out.

Published: a dish whose description has exactly one "NNN kcal" (decimals as printed: 67.1). Left out and listed with --report: no calories printed; two
figures (Half/Full plate, "HALF - 481/KCAL - FULL - 349/KCAL", "Half : 245/ Full : 350"); "per 100ml"; dishes at one restaurant only; dishes whose name
appears twice with different calories or allergens (Vegetable Samosas 415 / 218: the same name, different dishes, so neither is published: never chosen
between); dishes whose panel shows no "Vegetarian"/"Vegan" mark and no allergen at all (Four rashers of bacon, Kids - tomato jam mayo): that cannot be told
apart from a dish with no allergen record, and an allergen row must never be guessed.
Allergens: copied from each dish's panel ("Contains:" and "May Contain:" lists, with the cereals and tree nuts the panel names); a panel with a
Vegetarian/Vegan mark and no allergen lines is read as none of the 14 (the page says "Dish or drink contains the allergen", and these dishes are
the plain ones: Kachumber, rice, sodas). Complete for every published dish, so allergens.csv is written.
Tags: vegetarian only when the panel says Vegetarian or Vegan (for every copy of the dish); contains_pork / contains_beef when the printed name or
description names bacon, ham, sausage, pork, or beef, steak (a dish the panel marks vegetarian or vegan gets neither).
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "dishoom"
HOST = "app.served-app.com"
PAGE_PATH = "/website/dishoom"
SOURCE_URL = f"https://{HOST}{PAGE_PATH}"
SOURCE_TITLE = "Dishoom Allergen Menus with calories (all day, breakfast, kids and drinks; app.served-app.com, the allergen page Dishoom's own site links)"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
NODE_PLAYWRIGHT = os.environ.get("NODE_PLAYWRIGHT", "/home/user/MenuAi/web/e2e/node_modules/playwright-core")
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
TABS = ["ALL DAY", "BREAKFAST", "KIDS", "DRINKS"]
EXPECTED_RECORDS = {"ALL DAY": 98, "BREAKFAST": 41, "KIDS": 20, "DRINKS": 153}
MIN_ITEMS, MAX_ITEMS = 180, 330
SITES = {"covent garden": "Covent Garden", "shoreditch": "Shoreditch", "kings cross": "King's Cross", "carnaby": "Carnaby", "edinburgh": "Edinburgh",
         "kensington": "Kensington", "manchester": "Manchester", "birmingham": "Birmingham", "canary wharf": "Canary Wharf", "battersea": "Battersea",
         "glasgow": "Glasgow", "leeds": "Leeds", "borough": "Borough"}
NOTE = ("Calories only, per dish as printed in Dishoom's allergen menu (restaurant menus, not delivery, which print different figures); protein, carbs and fat "
        "are not published. Dishes with two sizes or only one restaurant's menu are left out, and the page does not state a drink's size unless it says so.")

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [, , , chrome, ua, outDir, url, tabsJson] = process.argv;
const tabs = JSON.parse(tabsJson);
(async () => {
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, userAgent: ua });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  const out = { url, captured_at: new Date().toISOString(), tabs: {}, tab_buttons: [] };
  out.tab_buttons = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button')).map(e => e.innerText.trim());
    const i = all.indexOf('ALL DAY'), j = all.indexOf('View Terms & Disclaimer');
    return all.slice(i, j).filter(x => x);
  });
  for (const t of tabs) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.locator('button', { hasText: new RegExp('^' + esc + '$') }).first().click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { document.querySelectorAll('.menu-item h3').forEach(h => h.click()); });
    await page.waitForTimeout(1500);
    out.tabs[t] = await page.evaluate(() => {
      const res = [];
      document.querySelectorAll('.menu-section').forEach(sec => {
        const title = ((sec.querySelector('.menu-section-title') || {}).innerText || '').trim();
        sec.querySelectorAll('.menu-item').forEach(it => {
          res.push({ section: title, name: ((it.querySelector('h3') || {}).innerText || '').trim(),
                     desc: ((it.querySelector('.menu-item-description') || {}).textContent || ''), text: it.innerText });
        });
      });
      return res;
    });
    fs.writeFileSync(outDir + '/tab_' + t.replace(/[^A-Z]+/g, '_') + '.html', await page.content());
  }
  fs.writeFileSync(outDir + '/capture.json', JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
"""


# ---------------------------------------------------------------------------------------------- fetching (robots-checked)
def curl(url: str, out: Path) -> tuple[int, str]:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code} %{content_type}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    code, _, ctype = res.stdout.strip().partition(" ")
    return int(code or 0), ctype


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    robots = cache / "robots_served-app.txt"
    code, _ = curl(f"https://{HOST}/robots.txt", robots)
    if code != 200:
        raise SystemExit(f"cannot read https://{HOST}/robots.txt (HTTP {code}): stop (never work round it)")
    rules = robots_rfc.parse(robots.read_text(encoding="utf-8-sig"))
    if not robots_rfc.allowed(rules, PAGE_PATH):
        raise SystemExit(f"robots.txt of {HOST} disallows {PAGE_PATH}: stop (never work round it)")
    time.sleep(1.1)
    js = cache / "capture.js"
    js.write_text(CAPTURE_JS, encoding="utf-8")
    res = subprocess.run(["node", str(js), NODE_PLAYWRIGHT, CHROME, UA, str(cache), SOURCE_URL, json.dumps(TABS)], capture_output=True, text=True, timeout=300)
    if res.returncode != 0:
        raise SystemExit(f"the browser capture failed: {res.stderr.strip()[:500]}")


# ---------------------------------------------------------------------------------------------- reading
KC = re.compile(r"(\d+(?:\.\d+)?)\s*kcal", re.I)
ML = re.compile(r"\b(\d{2,4})\s?ml\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|salami|prosciutto|pepperoni|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?)\b", re.I)
SMALL = {"and", "of", "with", "on", "in", "the", "a", "or", "to", "for", "at"}
ACRONYMS = {"CBD", "CB", "IPA", "NV"}
GLASS = re.compile(r"\((Up|Tall|Peg|Rocks|Pot|Mug|Can|Flute)\)")  # the page's glass / serving markers stay upper case: (UP), (TALL)
PRE = {"ALL - NEW": "ALL-NEW", "NO -BUTTER": "NO-BUTTER", "\u2013": "-"}
SECTION = {
    ("ALL DAY", "AT LUNCH, AND LATER"): "Lunch and later", ("ALL DAY", "ROOMALI ROLLS"): "Roomali rolls", ("ALL DAY", "SMALL PLATES"): "Small plates",
    ("ALL DAY", "GRILLS"): "Grills", ("ALL DAY", "BIRYANI"): "Biryani", ("ALL DAY", "RUBY MURRAY"): "Ruby Murray (curries)",
    ("ALL DAY", "VEG. SIDE DISHES"): "Vegetable sides", ("ALL DAY", "BREAD & RICE"): "Bread and rice", ("ALL DAY", "CHEF'S SPECIALS"): "Chef's specials",
    ("ALL DAY", "VEGAN ALL DAY"): "Vegan all day", ("ALL DAY", "PUDDINGS"): "Puddings", ("ALL DAY", "KULFI ON A STICK"): "Kulfi on a stick",
    ("ALL DAY", "A BOWL OF ICE CREAM"): "Ice cream", ("BREAKFAST", "COOKED BREAKFASTS"): "Cooked breakfasts",
    ("BREAKFAST", "FRUITS, GRAINS & BREADS"): "Fruits, grains and breads", ("BREAKFAST", "DISHOOM NAAN ROLLS"): "Naan rolls",
    ("BREAKFAST", "SIDE ORDERS"): "Breakfast sides", ("BREAKFAST", "VEGAN BREAKFAST"): "Vegan breakfast", ("KIDS", "BREAKFAST"): "Kids' breakfast",
    ("KIDS", "AT LUNCH, AND LATER"): "Kids' lunch and later", ("KIDS", "PUDDINGS"): "Kids' puddings", ("KIDS", "DRINKS"): "Kids' drinks",
}


def tidy_name(raw: str) -> str:
    s = " ".join(raw.replace(" ", " ").split())
    for a, b in PRE.items():
        s = s.replace(a, b)
    s = re.sub(r"(?<=\w)\u2019(?=\w)", "'", s)
    s = re.sub(r"\s*\*+$", "", s)
    s = re.sub(r"\s+-\s*|\s*-\s+", " - ", s)  # "KIDS -MURGH" -> "KIDS - MURGH"; hyphens inside words stay
    s = s.lower()
    s = re.sub(r"(^|[\s(/\-:&,\"\u2018\u201c])([^\W\d_])", lambda m: m.group(1) + m.group(2).upper(), s)
    s = re.sub(r"\b(And|Of|With|On|In|The|A|Or|To|For|At)\b", lambda m: m.group(1).lower(), s)
    s = s[0].upper() + s[1:]
    s = re.sub(r"[A-Za-z]+", lambda m: m.group(0).upper() if m.group(0).upper() in ACRONYMS else m.group(0), s)
    return GLASS.sub(lambda m: "(" + m.group(1).upper() + ")", s)


def sentence_case(raw: str) -> str:
    s = " ".join(raw.split()).lower()
    return s[:1].upper() + s[1:]


def split_top(text: str) -> list[str]:
    """Split on commas that are not inside brackets."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def parse_allergen_line(value: str, where: str) -> tuple[set, set, set]:
    keys, cereals, nuts = set(), set(), set()
    for part in split_top(value):
        m = re.fullmatch(r"(.+?)\s*\((.+)\)", part)
        base, spec = (m.group(1), split_top(m.group(2))) if m else (part, [])
        k, _, _ = allergen_words([base], where)
        keys |= k
        if spec and k <= {"crustaceans", "molluscs"}:
            continue  # "Crustaceans (Prawn, Crab)", "Molluscs (Squid)": the species are not modelled, the allergen is recorded
        if spec:
            k2, c2, n2 = allergen_words(spec, where)
            if (k2 - {"gluten", "nuts"}) or not (k2 <= k):
                raise SystemExit(f"{where}: bracketed words {spec!r} do not match {base!r}")
            cereals |= c2
            nuts |= n2
    return keys, cereals, nuts


def read_record(tab: str, rec: dict) -> dict:
    name = rec["name"]
    desc = " ".join(rec["desc"].replace(" ", " ").split())
    lines = [l.strip() for l in rec["text"].splitlines() if l.strip()]
    marks = [l for l in lines if l in ("Vegetarian", "Vegan")]
    contains = [l[len("Contains:"):].strip() for l in lines if l.startswith("Contains:")]
    may = [l[len("May Contain:"):].strip() for l in lines if l.startswith("May Contain:")]
    if len(contains) > 1 or len(may) > 1 or len(marks) > 1:
        raise SystemExit(f"{name!r}: the panel has more than one Contains / May Contain / mark line: the page changed shape")
    where = f"{tab} / {name}"
    return dict(tab=tab, section=rec["section"], name=name, desc=desc, marks=marks, contains=contains[0] if contains else "", may=may[0] if may else "",
                kcal=KC.findall(desc),
                c=parse_allergen_line(contains[0], where) if contains else (set(), set(), set()),
                m=parse_allergen_line(may[0], where) if may else (set(), set(), set()))


def site_scope(name: str) -> int | None:
    """None = no label (served everywhere); otherwise the number of named restaurants in a 'ONLY' / chef's special label."""
    up = name.upper().replace("’", "'").replace("KING'S", "KINGS")
    if "ONLY" not in up and "CHEF" not in up:
        return None
    return sum(1 for k in SITES if k.upper() in up)


def classify(r: dict) -> tuple[str, str]:
    """('publish', '') or ('skip', reason)."""
    desc = r["desc"]
    low = desc.lower()
    if re.search(r"\bhalf\b.*\bfull\b", low):
        return "skip", "two sizes (half / full) with two figures"
    if not r["kcal"]:
        return "skip", "no calories on the page"
    if len(r["kcal"]) > 1:
        return "skip", f"two or more figures: {r['kcal']}"
    if re.search(r"per 100\s?ml|per 100\s?g", low):
        return "skip", "figure is per 100 ml, not per drink"
    scope = site_scope(r["name"])
    if scope is not None and scope < 2:
        return "skip", "served at only one restaurant (label in the dish name)"
    if not r["marks"] and not r["contains"] and not r["may"]:
        return "skip", "panel shows no Vegetarian/Vegan mark and no allergen: indistinguishable from a missing allergen record"
    return "publish", ""


def category_of(r: dict) -> str:
    c = SECTION.get((r["tab"], r["section"].upper()))
    if c:
        return c
    if r["tab"] == "DRINKS":
        return sentence_case(r["section"].replace("DARU-WALLA", "Daru-Walla")).replace("&", "and")
    raise SystemExit(f"{r['tab']} / {r['section']!r}: a new section: add it to SECTION by hand (or leave it out)")


LABELLED = {  # dishes the page labels for some restaurants only, with 2 or more named: the display name is written by hand
    "CHEFS SPECIAL - SHOREDITCH & KENSINGTON - LAMB NIHARI WITH KHAMIRI ROTI": "Lamb Nihari with Khamiri Roti (chef's special, Shoreditch & Kensington)",
    "CHEF'S SPECIAL, GLASGOW, KINGS CROSS & MANCHESTER - NALLI NIHARI BIRYANI": "Nalli Nihari Biryani (chef's special, Glasgow, King's Cross & Manchester)",
    "HAGGIS PAU (GLASGOW & EDINBURGH ONLY)": "Haggis Pau (Glasgow & Edinburgh only)",
    "IRN BRU - GLASGOW & EDINBURGH ONLY": "Irn Bru (Glasgow & Edinburgh only)",
}


def display_name(r: dict) -> str:
    n = r["name"]
    if site_scope(n) is not None:
        key = " ".join(re.sub(r"[\u2013\u2014]", "-", n.replace("\u2019", "'")).split())
        key = re.sub(r"\s*-\s*", " - ", key).upper()
        key = key.replace("KHAMIRI ROTI", "KHAMIRI ROTI")
        if key not in LABELLED:
            raise SystemExit(f"{n!r} is labelled for some restaurants only and names 2 or more: add its display name to LABELLED (key {key!r})")
        return LABELLED[key]
    return tidy_name(n)


def build(cache: Path) -> dict:
    cap = json.loads((cache / "capture.json").read_text(encoding="utf-8"))
    for tab, want in EXPECTED_RECORDS.items():
        got = len(cap["tabs"].get(tab, []))
        if not (0.85 * want <= got <= 1.15 * want + 2):
            raise SystemExit(f"{tab}: {got} dishes on the page, expected about {want}: the menu changed shape, re-check before publishing")
    for t in TABS:
        if t not in cap["tab_buttons"]:
            raise SystemExit(f"tab {t!r} is no longer on the page (tabs: {cap['tab_buttons']})")
    recs = [read_record(tab, r) for tab in TABS for r in cap["tabs"][tab]]
    for r in recs:
        if not r["name"]:
            raise SystemExit("a dish without a name: the page changed shape")
    left_out, groups = [], collections.OrderedDict()
    for r in recs:
        verdict, why = classify(r)
        if verdict == "skip":
            left_out.append((r["tab"], r["name"], why))
            continue
        # one dish name may appear in several sections (Okra Fries in Small plates and Vegan all day): the same calories and allergens, or none of its
        # copies is published. The KIDS tab holds kids' portions, so its copy of a name is compared on its own.
        key = re.sub(r"[^A-Z0-9]+", " ", tidy_name(r["name"]).upper()).strip()
        groups.setdefault((key, r["tab"] == "KIDS"), []).append(r)
    sig = lambda r: (r["kcal"][0], frozenset(r["c"][0]), frozenset(r["c"][1]), frozenset(r["c"][2]), frozenset(r["m"][0]), frozenset(r["m"][1]), frozenset(r["m"][2]))  # noqa: E731
    published = []
    for (key, kids), rs in groups.items():
        if len({sig(r) for r in rs}) != 1:
            for r in rs:
                left_out.append((r["tab"], r["name"], f"the same name appears {len(rs)} times with different calories or allergens "
                                                      f"({sorted({r2['kcal'][0] for r2 in rs})}): not published, never chosen between"))
            continue
        twin = groups.get((key, not kids))
        if kids and twin and len({sig(r) for r in twin}) == 1 and sig(twin[0]) == sig(rs[0]):
            continue  # the same dish is printed on an adult tab with the same figures: published from there
        published.append((rs, kids and bool(twin)))
    return dict(cap=cap, recs=recs, published=published, left_out=left_out)


def to_items(published: list) -> list[dict]:
    items = []
    for rs, kids_variant in published:
        r = rs[0]
        keys, cereals, nuts = r["c"]
        mkeys = r["m"][0]
        vegetarian = all(x["marks"] or re.search(r"\(V(G|GA)?\)", x["desc"]) for x in rs)  # the panel's mark, or the dish's own "(V)" in its description
        # meat words from the name and the description, leaving out sentences about extras ("Add a couple of crisp bacon rashers.")
        sentences = [s for s in re.split(r"(?<=[.!?])\s*(?=[A-Z*])", r["desc"]) if not re.match(r"\s*(\*?\s*)?(add|extra|optional)\b", s, re.I)]
        text = r["name"] + " " + " ".join(sentences)
        tags = ["vegetarian"] if vegetarian else [t for t, rx in (("contains_pork", PORK), ("contains_beef", BEEF)) if rx.search(text)]
        mls = {m for m in ML.findall(r["desc"])}
        name = display_name(r)
        if kids_variant:
            name += " (kids' portion)"  # the same name is a different, adult portion on another tab
        item = dict(name=name, category=category_of(r), calories=r["kcal"][0], tags="|".join(tags), rankable=False,
                    serving=f"{mls.pop()}ml" if len(mls) == 1 else "",
                    allergens=dict(contains=keys, may_contain=mkeys, cereals=cereals, nuts=nuts))
        if len(rs) > 1:
            item["notes"] = "printed in " + ", ".join(sorted({f"{x['tab']} / {x['section']}" for x in rs}))
        items.append(item)
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--checked-on", default=time.strftime("%Y-%m-%d"))
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--report", action="store_true", help="list every dish left out and why")
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
    b = build(args.cache)
    items = to_items(b["published"])
    if not MIN_ITEMS <= len(items) <= MAX_ITEMS:
        raise SystemExit(f"{len(items)} items: outside {MIN_ITEMS}-{MAX_ITEMS}; the menu changed shape, re-check before publishing")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Dishoom", cuisine="Indian", source_title=SOURCE_TITLE, source_url=SOURCE_URL, checked_on=args.checked_on,
                             aliases=["dishoom"], items=items, out=args.out, note=NOTE, nutrition_level="calories",
                             allergen_guide=dict(title="Dishoom Allergen Menus (the dish panels list what each dish contains and may contain)", url=SOURCE_URL,
                                                 checked_on=args.checked_on, may_contain_published=True))
    print(f"wrote {out}: {len(items)} items from {len(b['recs'])} dishes on the 4 tabs ({len(b['left_out'])} left out)")
    for f in ("capture.json", "tab_ALL_DAY.html", "tab_BREAKFAST.html", "tab_KIDS.html", "tab_DRINKS.html"):
        print(f"  sha256 {f} {sha256_file(args.cache / f)}  captured {b['cap']['captured_at']}")
    by = collections.Counter(r for _, _, r in b["left_out"])
    for why, n in by.most_common():
        print(f"  left out x{n}: {why[:110]}")
    if args.report:
        for tab, name, why in b["left_out"]:
            print(f"  - {tab} | {name} | {why[:140]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
