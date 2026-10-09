"""Read LEON UK's official menu pages (https://leon.co/menu/<menu>/) into the items each page actually shows.

Used by tools/uk_extract/leon.py. Standard library only. Numbers are returned exactly as the page's own JSON text
prints them (strings such as "760", "4.47", "0.1"): nothing is converted, rounded or estimated here.

Where the data comes from: every leon.co page is a Next.js page whose HTML carries the site's whole Sanity content set in
`self.__next_f.push([1, "..."])` script chunks (the "flight" payload). Each `menuItem` there has `nutritionInfo` (kcal,
protein, carb, fat, satFat, sugar, fibre, salt, mono, poly, totalPortionWeight and sometimes gi), or null. The site's own
code labels every one of those values "per portion" ("Kcal per portion", "grams per portion"; the portion weight is
printed in grams) and an item page such as https://leon.co/menu/aji-verde-chicken/ shows the same table.

Which items are on the menu: the payload also holds many menuItem documents that no menu page shows (old seasonal and
discontinued items, a "Kids Pick and Mix Meals" placeholder with every value 0, ...). A menu page lists a submenu's items
the way the site's own code does: if the submenu entry has `reorder` set, exactly the items named in its `menuItems` list,
in that order; otherwise every menuItem whose own submenuType has that submenu's slug. Only those items are read here.
(Checked against the server-rendered HTML of each page: every item read here appears on its page and no other item name
does.)

Six pages hold the whole menu: all-day, breakfast, bits-in-between, coffee, drinks, kids. Save each one once (one request
per second) into a folder as <menu>.html and give that folder to leon.py.
"""
from __future__ import annotations
import json
import re
from collections import OrderedDict
from pathlib import Path

PAGES = ["all-day", "breakfast", "bits-in-between", "coffee", "drinks", "kids"]
URL = "https://leon.co/menu/{}/"
NUTRIENT_KEYS = ("kcal", "protein", "carb", "fat", "satFat", "sugar", "fibre", "salt", "totalPortionWeight")
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
INVISIBLE = re.compile("[​‌‍⁠﻿]")

# parse_float / parse_int = str keeps every number exactly as written in the page's JSON text.
_DECODER = json.JSONDecoder(parse_float=str, parse_int=str)
_REF = re.compile(r"^\$([0-9a-f]+)$")


def tidy(name: str) -> str:
    """The name as printed, minus zero-width characters and stray spaces."""
    return re.sub(r"\s+", " ", INVISIBLE.sub("", name)).strip()


def _slug(value) -> str:
    return value["current"] if isinstance(value, dict) else value


def read_flight(html: str) -> dict[str, object]:
    """Decode the Next.js flight records: id -> parsed JSON value, or the text for a text ('T') record."""
    chunks = [json.loads('"' + m.group(2) + '"') for m in re.finditer(r'self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)</script>', html)
              if m.group(1) == "1"]
    if not chunks:
        raise ValueError("no Next.js flight data found: the page layout changed")
    data = "".join(chunks).encode("utf-8")
    recs: dict[str, object] = {}
    pos = 0
    head = re.compile(rb"([0-9a-f]*):")
    text_head = re.compile(rb"T([0-9a-f]+),")
    while pos < len(data):
        m = head.match(data, pos)
        if not m:
            raise ValueError(f"unreadable flight record at byte {pos}")
        rid, p = m.group(1).decode(), m.end()
        if data[p:p + 1] == b"T":
            t = text_head.match(data, p)
            n = int(t.group(1), 16)
            p = t.end()
            recs[rid] = data[p:p + n].decode("utf-8")
            pos = p + n
        else:
            end = data.find(b"\n", p)
            end = len(data) if end == -1 else end
            line = data[p:end].decode("utf-8")
            try:
                recs[rid] = _DECODER.raw_decode(line)[0]
            except ValueError:
                recs[rid] = line
            pos = end + 1
    return recs


def _payload(recs: dict[str, object], path: Path) -> list[dict]:
    for v in recs.values():
        if isinstance(v, list) and len(v) == 4 and isinstance(v[3], dict) and "initialPayload" in v[3]:
            return v[3]["initialPayload"]["payload"]
    raise ValueError(f"{path}: no initialPayload in the page data: the layout changed")


def ingredient_text(item: dict, recs: dict[str, object]) -> str:
    """The item's ingredient list as plain text (long spans are sent as '$<id>' references to a text record)."""
    out = []
    for block in item.get("ingredients") or []:
        for child in block.get("children", []):
            t = child.get("text") or ""
            m = _REF.match(t)
            if m:
                if not isinstance(recs.get(m.group(1)), str):
                    raise ValueError(f"{item.get('name')!r}: unresolved text reference {t}")
                t = recs[m.group(1)]
            out.append(t)
    return "".join(out)


def allergen_slugs(item: dict) -> tuple[str, ...] | None:
    """The allergens the menu page lists for an item: the sorted site slugs ("milk", "gluten-wheat", "sulphur-dioxide", ...), an
    empty tuple when the page lists an empty list, and None when the field is blank (null or absent): a blank is NOT "none"
    (the same blank sits on Levantine Squash Salad, whose own ingredients print SOY and MUSTARD). The site shows these lists as
    its allergen summary and filters dishes by them."""
    value = item.get("allergens")
    if value is None:
        return None
    return tuple(sorted(a["slug"] for a in value))


def read_pages(folder: Path) -> tuple[list[dict], dict]:
    """Return (live items in page order, facts). Each live item dict has: key (Sanity id), name (tidied), printed (raw name),
    nutrition (dict of printed text, or None when the site shows none), dietary (set of the site's own slugs), ingredients
    (text), where [(page, submenu name)]. `facts` counts what was seen (documents in the payload, items no page shows)."""
    live: OrderedDict[str, dict] = OrderedDict()
    seen_docs: dict[str, dict] = {}
    for page in PAGES:
        path = Path(folder) / f"{page}.html"
        recs = read_flight(path.read_text(encoding="utf-8"))
        payload = _payload(recs, path)
        top = {d["_id"]: d for d in payload if d.get("type") == "menuItem"}
        subs = {d["_id"]: d for d in payload if d.get("type") == "submenuType"}
        menus = [d for d in payload if d.get("type") == "menuType" and "moduleGroups" in d and _slug(d["slug"]) == page]
        if len(menus) != 1:
            raise ValueError(f"{path}: expected one menu document with modules for {page!r}, found {len(menus)}")
        for key, doc in top.items():  # the same item must read the same on every page
            if key in seen_docs and (doc["name"] != seen_docs[key]["name"] or doc["nutritionInfo"] != seen_docs[key]["nutritionInfo"]):
                raise ValueError(f"{path}: item {doc['name']!r} reads differently on another page")
            seen_docs[key] = doc
        listings = 0
        for group in menus[0]["moduleGroups"]:
            for module in group["modules"]:
                if module.get("type") != "submenuTypeModule":
                    continue
                for entry in module["submenuTypes"]:
                    sub = subs.get(entry["_ref"])
                    if sub is None:
                        raise ValueError(f"{path}: submenu {entry['_ref']} has no submenuType document")
                    sub_name = tidy(sub["name"])
                    if entry.get("reorder"):
                        chosen = []
                        for e in entry.get("menuItems") or []:
                            ref = e.get("_ref") or e.get("_id")
                            hits = [k for k, d in top.items() if k == ref or _slug(d["slug"]) == ref]
                            if len(hits) != 1:
                                raise ValueError(f"{path}: listed item {ref} matches {len(hits)} menuItem documents")
                            merged = {**top[hits[0]], **e}  # the site shows the document overlaid with the listing
                            chosen.append((hits[0], merged))
                    else:
                        chosen = [(k, d) for k, d in top.items()
                                  if d.get("submenuType") and _slug(d["submenuType"]["slug"]) == _slug(sub["slug"])]
                    listings += 1
                    for key, doc in chosen:
                        if key not in live:
                            nut = doc.get("nutritionInfo")
                            if nut is not None:
                                missing = [k for k in NUTRIENT_KEYS if k not in nut]
                                bad = [k for k in NUTRIENT_KEYS if k in nut and not NUMBER.match(str(nut[k]))]
                                if missing or bad:
                                    raise ValueError(f"{path}: {doc['name']!r} has missing {missing} or non-numeric {bad}")
                                nut = {k: str(nut[k]) for k in (*NUTRIENT_KEYS, "mono", "poly", "gi") if k in nut}
                            live[key] = {
                                "key": key, "printed": doc["name"], "name": tidy(doc["name"]), "nutrition": nut,
                                "dietary": {x["slug"] for x in doc.get("dietary") or []},
                                "ingredients": ingredient_text(doc, recs), "where": [],
                                "allergens": allergen_slugs(doc),
                            }
                        elif live[key]["allergens"] != allergen_slugs(doc):
                            raise ValueError(f"{path}: item {doc['name']!r} lists different allergens on another page")
                        live[key]["where"].append((page, sub_name))
        if listings == 0:
            raise ValueError(f"{path}: no submenu listings found")
    facts = {
        "documents": len(seen_docs),
        "unlisted": sorted(tidy(d["name"]) for k, d in seen_docs.items() if k not in live),
    }
    return list(live.values()), facts
