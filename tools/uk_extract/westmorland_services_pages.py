"""Reader for the Westmorland Family food data portals (Civica Food Data Hub / "Saffron": https://<site>.mysaffronportal.com).

Used by westmorland_services.py. Same platform as English Heritage's portal (see english_heritage_pages.py, which this module is
modelled on; it is a separate copy so that the two chains' scripts never depend on each other). Three page kinds, all server-rendered
HTML (no JavaScript needed):

  /Menus                      "Browse Menus": 8 menus per page (?page=1..n), each a link /Menus/Details/<slug>
  /Menus/Details/<slug>       one menu: a <div class="course"> per course (h2 = course name; in the farm-shop menus a course is a
                              producer's name), every dish a <div class="menu-list-item"> holding
                                data-id            the product id ("3328", "R02399")
                                menu-list-header   the dish name (link to /Products/<id>)
                                "583kcal (2439kJ)" energy per portion ("Each portion contains"), ABSENT for a dish the portal holds
                                                   no nutrition for (then no Fat / Saturates / Sugars / Salts blocks either)
                                Fat / Saturates / Sugars / Salts   "40g", "0.5g", "<0.5g" (per portion; no protein, carbohydrate, fibre)
                                menu-list-allergen blocks: a top-level line "Contains X" / "May Contain X" / "Does not contain X" and,
                                  nested under it, sub-lines for the named cereal / tree nut ("Contains Wheat" under
                                  "Contains Cereals containing Gluten")
  /Products/<id>              the dish's own page: a third rendering plus the per-100 g column and the portion label

Nothing is converted. Anything the reader does not understand stops the run (SystemExit) rather than being skipped.
"""
from __future__ import annotations
import html
import re

COURSE_END = '<div class="pre-footer">'
KCAL_RE = re.compile(r"(\d+(?:\.\d+)?)\s*kcal\s*\(\s*(\d+(?:\.\d+)?)\s*kJ\s*\)")
VALUE_RE = re.compile(r"^(<?\d+(?:\.\d+)?)g$")
NUTRIENT_TITLES = ["Fat", "Saturates", "Sugars", "Salts"]
MSG_RE = re.compile(r"^(Contains|May Contain|Does not contain) (.+)$")
STATE = {"Contains": "contains", "May Contain": "may", "Does not contain": "not"}


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def parse_menu_list(page_html: str) -> list[tuple[str, str]]:
    """[(slug path as linked, menu title)] from one /Menus page, in page order."""
    out = []
    for m in re.finditer(r'<h2><a href="(/Menus/Details/[^"]+)">(.*?)</a></h2>', page_html):
        out.append((html.unescape(m.group(1)), _text(m.group(2))))
    return out


def list_summary(page_html: str) -> tuple[int, int, int]:
    """'Displaying items 9 to 16 of 36.' -> (9, 16, 36)."""
    m = re.search(r"Displaying items (\d+) to (\d+) of (\d+)", page_html)
    if not m:
        raise SystemExit("Menus page: the 'Displaying items a to b of n' line is gone: the portal's layout changed")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def _clean(page_html: str) -> str:
    page_html = re.sub(r"<script.*?</script>", "", page_html, flags=re.S)
    return re.sub(r"<!--.*?-->", "", page_html, flags=re.S)


def parse_menu(page_html: str, where: str) -> dict:
    """One menu page -> {"title", "items": [dish dicts in page order]}. Each dish dict:
       course, product_id, name, note (the description line under the name, often ''), kcal, kj, fat, sat_fat, sugar, salt (strings as printed, without the unit; all None when the portal
       prints no nutrition for the dish), states {printed top-level allergen word: 'contains' | 'may' | 'not'},
       sub_states {(parent word, printed sub-allergen word): 'contains' | 'may' | 'not'}."""
    page_html = _clean(page_html)
    start = page_html.find('<div class="content-page">')
    if start < 0:
        raise SystemExit(f"{where}: no content-page block: the portal's layout changed")
    body = page_html[start:page_html.find(COURSE_END, start)]
    title_m = re.search(r"<h1>(.*?)</h1>", page_html)
    title = _text(title_m.group(1)) if title_m else ""
    token = re.compile(r'<h2[^>]*>(.*?)</h2>|<h4>(.*?)</h4>|<div class="menu-list-item">|<table ', re.S)
    marks = list(token.finditer(body))
    items = []
    course = "Items not on a course"
    basis = None
    for idx, m in enumerate(marks):
        if m.group(1) is not None:
            course = _text(m.group(1))
            basis = None
            continue
        if m.group(0) == "<table ":
            continue
        if m.group(2) is not None:
            basis = _text(m.group(2))
            if basis != "Each portion contains":
                raise SystemExit(f"{where}: course {course!r} prints the basis {basis!r}, expected 'Each portion contains': per-100g or another basis must not be read as a portion")
            continue
        end = marks[idx + 1].start() if idx + 1 < len(marks) else len(body)
        items.append(_parse_item(body[m.end():end], course, basis, where))
    if not items:
        raise SystemExit(f"{where}: no dishes found")
    return {"title": title, "items": items}


def _parse_item(block: str, course: str, basis: str | None, where: str) -> dict:
    ids = re.findall(r'data-id="([^"]*)"\s+class="addtobasket"', block)
    head = re.search(r'<span class="menu-list-header"><a href="/Products/([^"]+)">(.*?)</a></span>(.*?)<div class="menu-list-header-sep">', block, re.S)
    if len(ids) != 1 or not head:
        raise SystemExit(f"{where}: a dish block without exactly one product id and name: layout changed")
    if basis != "Each portion contains":
        raise SystemExit(f"{where}: dish {head.group(2)!r} is not under an 'Each portion contains' heading")
    product_id = ids[0]
    if head.group(1) != product_id:
        raise SystemExit(f"{where}: product id {product_id!r} differs from the link {head.group(1)!r}")
    name = _text(head.group(2))
    after = head.group(3)
    note_m = re.search(r"<p[^>]*>(.*?)</p>", after, re.S)  # a one-line description the portal prints under some names
    note = _text(note_m.group(1)) if note_m else ""
    energy_text = _text(after.replace(note_m.group(0), "") if note_m else after)
    nutrients = re.findall(r'menu-list-ingredients-title">(.*?)</div>.*?<div>(.*?)</div>', block, re.S)
    if energy_text == "":
        if nutrients:
            raise SystemExit(f"{where}: dish {name!r} prints nutrient blocks but no 'N kcal (N kJ)' line")
        kcal = kj = fat = sat = sugar = salt = None
    else:
        energy = KCAL_RE.fullmatch(energy_text)
        if not energy:
            raise SystemExit(f"{where}: dish {name!r} prints {energy_text!r} where 'N kcal (N kJ)' is expected")
        titles = [t.strip() for t, _ in nutrients]
        if titles != NUTRIENT_TITLES:
            raise SystemExit(f"{where}: dish {name!r} prints the nutrient blocks {titles}, expected {NUTRIENT_TITLES}")
        values = {}
        for title, raw in nutrients:
            v = VALUE_RE.match(_text(raw).replace(" ", ""))
            if not v:
                raise SystemExit(f"{where}: dish {name!r}: {title.strip()} value {_text(raw)!r} is not like '12g' / '0.5g' / '<0.5g'")
            values[title.strip()] = v.group(1)
        kcal, kj = energy.group(1), energy.group(2)
        fat, sat, sugar, salt = values["Fat"], values["Saturates"], values["Sugars"], values["Salts"]
    left_m = re.search(r'menu-list-allergen-left-container">(.*?)menu-list-allergen-right-container', block, re.S)
    right_m = re.search(r'menu-list-allergen-right-container">(.*)$', block, re.S)
    if not left_m or not right_m:
        raise SystemExit(f"{where}: dish {name!r}: allergen containers not found")
    right_text = _text(right_m.group(1))
    if right_text:
        raise SystemExit(f"{where}: dish {name!r}: text in the right-hand container ({right_text!r}): the English Heritage portal printed diet flags there, this one has none; read it before going on")
    states: dict = {}
    sub_states: dict = {}
    level_tok = re.compile(r'<div class="menu-list-allergen">|<div class="menu-list-suballergen">|<div class="menu-list-allergen-msg">\s*<div>(.*?)</div>', re.S)
    level = None
    top_open = None
    for t in level_tok.finditer(left_m.group(1)):
        s = t.group(0)
        if s.startswith('<div class="menu-list-allergen">'):
            level = "top"
        elif s.startswith('<div class="menu-list-suballergen">'):
            level = "sub"
        else:
            line = _text(t.group(1))
            mm = MSG_RE.match(line)
            if not mm:
                raise SystemExit(f"{where}: dish {name!r}: allergen line {line!r} is not 'Contains ...' / 'May Contain ...' / 'Does not contain ...'")
            state, word = STATE[mm.group(1)], mm.group(2)
            if level == "top":
                if word in states:
                    raise SystemExit(f"{where}: dish {name!r}: allergen {word!r} printed twice")
                states[word] = state
                top_open = word
            elif level == "sub":
                if top_open is None:
                    raise SystemExit(f"{where}: dish {name!r}: sub-allergen {line!r} without a parent line")
                if (top_open, word) in sub_states:
                    raise SystemExit(f"{where}: dish {name!r}: sub-allergen {word!r} printed twice")
                sub_states[(top_open, word)] = state
            else:
                raise SystemExit(f"{where}: dish {name!r}: allergen line {line!r} outside a block")
    return dict(course=course, product_id=product_id, name=name, note=note, kcal=kcal, kj=kj, fat=fat, sat_fat=sat, sugar=sugar, salt=salt,
                states=states, sub_states=sub_states)


# ---------------------------------------------------------------------------------------------------------------------------
# The wide table on the same page: an independent second rendering used only to cross-check parse_menu.
TABLE_ALLERGEN_HEADS = ["Cereals containing Gluten", "Crustaceans", "Eggs", "Fish", "Peanuts", "Soya", "Milk", "Nuts", "Celery",
                        "Mustard", "Sesame", "Sulphur Dioxide and Sulphites", "Lupin", "Molluscs"]


def parse_menu_table(page_html: str, where: str) -> list[dict]:
    """Rows of the wide tables, in page order: product_id, name, kcal, kj, fat, sat_fat, sugar, salt (None for a dish without
    nutrition), marks (column head -> 'contains' | 'may'), sub_contains / sub_may (printed words of the line under the row)."""
    page_html = _clean(page_html)
    start = page_html.find('<div class="content-page">')
    body = page_html[start:page_html.find(COURSE_END, start)]
    rows = []
    for tm in re.finditer(r"<table .*?</table>", body, re.S):
        table = tm.group(0)
        heads = [_text(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", table, re.S)]
        heads = [h.replace("Each portion contains ", "") for h in heads]
        if heads != ["Description", "Energy", "Fat", "Saturates", "Sugars", "Salt"] + TABLE_ALLERGEN_HEADS:
            raise SystemExit(f"{where}: table column heads changed: {heads}")
        for rm in re.finditer(r'<tr class="menu-table-row"[^>]*>(.*?)</tr>(\s*<tr class="menu-table-subrow">(.*?)</tr>)?', table, re.S):
            cells = re.findall(r"<td([^>]*)>(.*?)</td>", rm.group(1), re.S)
            no_nutrition = len(cells) > 1 and 'colspan="5"' in cells[1][0]  # a dish without nutrition: one cell spans the five columns
            cells = [c for _, c in cells]
            link = re.search(r'<a class="productlink[^"]*"\s+href="/Products/([^"]+)">(.*?)</a>', cells[0], re.S)
            if no_nutrition:
                cells = cells[:1] + [""] * 5 + cells[2:]
                if _text(rm.group(1)).count("kcal"):
                    raise SystemExit(f"{where}: a table row without nutrition cells that still prints kcal")
            if not link or len(cells) != 6 + len(TABLE_ALLERGEN_HEADS):
                raise SystemExit(f"{where}: a table row with {len(cells)} cells / no product link: layout changed")
            etext = _text(cells[1])
            if etext == "":
                if any(_text(re.sub(r"<img[^>]*>", "", c)) for c in cells[2:6]):
                    raise SystemExit(f"{where}: a table row with values but no energy")
                kcal = kj = None
                vals = [None] * 4
            else:
                e = re.match(r"^(\d+(?:\.\d+)?)\s*kcal\s+(\d+(?:\.\d+)?)\s*kJ$", etext)
                if not e:
                    raise SystemExit(f"{where}: table energy cell {etext!r} not like '583kcal 2439kJ'")
                kcal, kj = e.group(1), e.group(2)
                vals = []
                for c in cells[2:6]:
                    v = VALUE_RE.match(_text(re.sub(r"<img[^>]*>", "", c)).replace(" ", ""))
                    if not v:
                        raise SystemExit(f"{where}: table value {_text(c)!r} not like '12g'")
                    vals.append(v.group(1))
            marks = {}
            for head, c in zip(TABLE_ALLERGEN_HEADS, cells[6:]):
                if "fa-check" in c and "fa-question" in c:
                    raise SystemExit(f"{where}: a cell with both marks")
                if "fa-check" in c:
                    marks[head] = "contains"
                elif "fa-question" in c:
                    marks[head] = "may"
                elif _text(c):
                    raise SystemExit(f"{where}: unexpected cell text {_text(c)!r}")
            sub = _text(rm.group(3) or "")
            sc, sm = [], []
            if sub:
                sm_ = re.match(r"^(?:Contains:\s*(.*?))?\s*(?:May Contain:\s*(.*))?$", sub)
                if not sm_ or not (sm_.group(1) or sm_.group(2)):
                    raise SystemExit(f"{where}: subrow {sub!r} not understood")
                sc = [w.strip() for w in (sm_.group(1) or "").split(",") if w.strip()]
                sm = [w.strip() for w in (sm_.group(2) or "").split(",") if w.strip()]
            rows.append(dict(product_id=link.group(1), name=_text(link.group(2)), kcal=kcal, kj=kj,
                             fat=vals[0], sat_fat=vals[1], sugar=vals[2], salt=vals[3], marks=marks, sub_contains=sc, sub_may=sm))
    return rows


# ---------------------------------------------------------------------------------------------------------------------------
# The product page (/Products/<id>) of one dish: a third rendering of the same figures, plus the per-100 g column.
_N = r"(\d+(?:\.\d+)?)"
_V = r"(<?\d+(?:\.\d+)?)"
PRODUCT_HEAD_RE = re.compile(r"^(.*?) Each (.+?) contains Energy " + _N + r"kJ " + _N + r"kcal [\d.]+% Fat " + _V + r"g [\d.]+% Saturates " + _V +
                             r"g [\d.]+% Sugars " + _V + r"g [\d.]+% Salt " + _V + r"g")
PRODUCT_TABLE_RE = re.compile(r"Per 100g Per .+? % RI \* Per .+? Energy " + _N + r"kJ " + _N + r"kcal " + _N + r"kJ " + _N + r"kcal [\d.]+% Fat " + _V +
                              r"g " + _V + r"g [\d.]+% of which Saturates " + _V + r"g " + _V + r"g [\d.]+% Carbohydrate " + _V + r"g " + _V +
                              r"g [\d.]+% of which Sugars " + _V + r"g " + _V + r"g [\d.]+% Fibre " + _V + r"g " + _V + r"g [\d.]+% Protein " + _V +
                              r"g " + _V + r"g [\d.]+% Salt " + _V + r"g " + _V + r"g")


def parse_product(page_html: str, where: str) -> dict:
    """-> {name, label (the portion word: "Each", "Ptn", "283g"), kj, kcal, fat, sat_fat, sugar, salt (per portion, strings),
    per100 / portion_table {kcal, fat, sat_fat, carb, sugar, fibre, protein, salt}, contains / may / not (sets of printed allergen words,
    top-level and named alike), ingredients (the text printed after 'Ingredient Specification', '' when absent)}. The product page also prints carbohydrate, fibre and protein columns; this chain's portal fills
    them with zeros that are not data (the menu pages never print them), so they are only used to recognise placeholders."""
    t = _clean(page_html)
    i0, j = t.find('<div class="main'), t.find("pre-footer")
    if i0 < 0 or j < 0:
        raise SystemExit(f"{where}: product page layout changed")
    j = t.rfind("<", i0, j)  # the page ends at the '<div class="pre-footer">' tag: cut before the tag, not inside it
    b = _text(t[i0:j])
    m, tab = PRODUCT_HEAD_RE.match(b), PRODUCT_TABLE_RE.search(b)
    if not m or not tab:
        raise SystemExit(f"{where}: product page headline / nutrition table not understood: {b[:300]!r}")
    seg = re.search(r"adult \(8400kJ / 2000kcal\)(.*?)(?:Carbon Footprint|Ingredient Specification|$)", b)
    text = seg.group(1).strip() if seg else ""
    words = {"Contains": set(), "May Contain": set(), "Does not contain": set()}
    for kind, word in re.findall(r"(Contains|May Contain|Does not contain) (.*?)(?= Contains | May Contain | Does not contain |$)", text):
        words[kind].add(word.strip())

    def cols(offset: int) -> dict:
        g = tab.groups()
        # groups: 1 kJ100 2 kcal100 3 kJptn 4 kcalptn 5.. pairs (per100, perportion) for fat, sat, carb, sugar, fibre, protein, salt
        pairs = [(g[4 + 2 * k], g[5 + 2 * k]) for k in range(7)]
        keys = ["fat", "sat_fat", "carb", "sugar", "fibre", "protein", "salt"]
        out = {k: pairs[n][offset] for n, k in enumerate(keys)}
        out["kcal"] = g[1] if offset == 0 else g[3]
        return out

    ing = re.search(r"Ingredient Specification(.*)$", b)
    return dict(name=m.group(1), label=m.group(2), kj=m.group(3), kcal=m.group(4), fat=m.group(5), sat_fat=m.group(6), sugar=m.group(7),
                salt=m.group(8), per100=cols(0), portion_table=cols(1), contains=words["Contains"], may=words["May Contain"],
                not_contains=words["Does not contain"], ingredients=ing.group(1).strip() if ing else "")
