"""Reader for English Heritage's food data portal pages (Civica Food Data Hub, https://englishheritage.mysaffronportal.com).

Used by english_heritage.py. Two page kinds, both server-rendered HTML (no JavaScript needed):

  /Menus                      "Available Menus": 8 menus per page (?page=1..5), each a link /Menus/Details/<slug>
  /Menus/Details/<slug>       one menu: a <div class="course"> per course (h2 = course name), every dish a
                              <div class="menu-list-item"> holding
                                data-id            the product id ("02659", "R02399")
                                menu-list-header   the dish name (link to /Products/<id>)
                                <p> (optional)     a note the portal prints under the name ("Red Tractor", "Suitable for vegans", ...)
                                "583kcal (2439kJ)" energy per portion ("Each portion contains")
                                Fat / Saturates / Sugars / Salts   "40g", "0.5g" (per portion; no protein, carbohydrate or fibre)
                                menu-list-allergen blocks: a top-level line "Contains X" / "May Contain X" and, nested under it,
                                  sub-lines for the named cereal / tree nut ("Contains Wheat" under "Contains Cereals containing Gluten")
                                right container: "Suitable for a Halal / Vegan / Vegetarian Diet" flags

Nothing is converted. Anything the reader does not understand stops the run (SystemExit) rather than being skipped.
"""
from __future__ import annotations
import html
import re

COURSE_END = '<div class="pre-footer">'
KCAL_RE = re.compile(r"(\d+(?:\.\d+)?)\s*kcal\s*\(\s*(\d+(?:\.\d+)?)\s*kJ\s*\)")
VALUE_RE = re.compile(r"^(<?\d+(?:\.\d+)?)g$")
NUTRIENT_TITLES = ["Fat", "Saturates", "Sugars", "Salts"]
MSG_RE = re.compile(r"^(Contains|May Contain) (.+)$")
FLAG_RE = re.compile(r"^Suitable for a (Halal|Vegan|Vegetarian) Diet$")


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


def parse_menu(page_html: str, where: str) -> dict:
    """One menu page -> {"title", "items": [dish dicts in page order]}. Each dish dict:
       course, product_id, name, note, kcal, kj, fat, sat_fat, sugar, salt (strings as printed, without the unit),
       contains / may_contain (sets of top-level printed allergen words), contains_sub / may_sub (printed sub-allergen words),
       flags (sorted list of 'Halal' / 'Vegan' / 'Vegetarian')."""
    page_html = re.sub(r"<script.*?</script>", "", page_html, flags=re.S)
    page_html = re.sub(r"<!--.*?-->", "", page_html, flags=re.S)
    start = page_html.find('<div class="content-page">')
    if start < 0:
        raise SystemExit(f"{where}: no content-page block: the portal's layout changed")
    body = page_html[start:page_html.find(COURSE_END, start)]
    title_m = re.search(r"<h1>(.*?)</h1>", page_html)
    title = _text(title_m.group(1)) if title_m else ""
    # Walk the body in order: course headings (h2), "Each portion contains" headings (h4) and dish blocks.
    # The page also holds a wide table of the same dishes (read by parse_menu_table); an item block ends where it starts.
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
    note_m = re.search(r"<p[^>]*>(.*?)</p>", after, re.S)
    note = _text(note_m.group(1)) if note_m else ""
    energy = KCAL_RE.search(_text(after.replace(note_m.group(0), "") if note_m else after))
    if not energy:
        raise SystemExit(f"{where}: dish {name!r} prints no 'N kcal (N kJ)' line: {_text(after)!r}")
    # Nutrient values: four titled blocks, always in this order.
    nutrients = re.findall(r'menu-list-ingredients-title">(.*?)</div>.*?<div>(.*?)</div>', block, re.S)
    titles = [t for t, _ in nutrients]
    if titles != NUTRIENT_TITLES:
        raise SystemExit(f"{where}: dish {name!r} prints the nutrient blocks {titles}, expected {NUTRIENT_TITLES}")
    values = {}
    for title, raw in nutrients:
        v = VALUE_RE.match(_text(raw).replace(" ", ""))
        if not v:
            raise SystemExit(f"{where}: dish {name!r}: {title} value {_text(raw)!r} is not like '12g' / '0.5g' / '<0.5g'")
        values[title] = v.group(1)
    # Allergens: the left container, top-level lines and their nested sub-lines.
    left_m = re.search(r'menu-list-allergen-left-container">(.*?)menu-list-allergen-right-container', block, re.S)
    right_m = re.search(r'menu-list-allergen-right-container">(.*)$', block, re.S)
    if not left_m or not right_m:
        raise SystemExit(f"{where}: dish {name!r}: allergen containers not found")
    contains, may, contains_sub, may_sub = set(), set(), set(), set()
    level_tok = re.compile(r'<div class="menu-list-allergen">|<div class="menu-list-suballergen">|<div class="menu-list-allergen-msg">\s*<div>(.*?)</div>', re.S)
    level = None
    top_open = None  # the top-level line the following sub-lines belong to: (kind, word)
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
                raise SystemExit(f"{where}: dish {name!r}: allergen line {line!r} is neither 'Contains ...' nor 'May Contain ...'")
            kind, word = ("contains" if mm.group(1) == "Contains" else "may"), mm.group(2)
            if level == "top":
                (contains if kind == "contains" else may).add(word)
                top_open = (kind, word)
            elif level == "sub":
                if top_open is None:
                    raise SystemExit(f"{where}: dish {name!r}: sub-allergen {line!r} without a parent line")
                (contains_sub if kind == "contains" else may_sub).add((top_open[1], word))
            else:
                raise SystemExit(f"{where}: dish {name!r}: allergen line {line!r} outside a block")
    flags = []
    right_text = _text(right_m.group(1))
    if re.sub(r"Suitable for a \w+ Diet", "", right_text).strip():
        raise SystemExit(f"{where}: dish {name!r}: unexpected text beside the diet flags: {right_text!r}")
    for text in re.findall(r"Suitable for a \w+ Diet", right_text):
        fm = FLAG_RE.match(text)
        if not fm:
            raise SystemExit(f"{where}: dish {name!r}: unknown diet flag {text!r}")
        if fm.group(1) not in flags:
            flags.append(fm.group(1))
    return dict(course=course, product_id=product_id, name=name, note=note, kcal=energy.group(1), kj=energy.group(2),
                fat=values["Fat"], sat_fat=values["Saturates"], sugar=values["Sugars"], salt=values["Salts"],
                contains=contains, may_contain=may, contains_sub=contains_sub, may_sub=may_sub, flags=sorted(flags))


# ---------------------------------------------------------------------------------------------------------------------------
# The wide table on the same page: an independent second rendering used only to cross-check parse_menu.
TABLE_ALLERGEN_HEADS = ["Cereals containing Gluten", "Crustaceans", "Eggs", "Fish", "Peanuts", "Soya", "Milk", "Nuts", "Celery",
                        "Mustard", "Sesame", "Sulphur Dioxide and Sulphites", "Lupin", "Molluscs"]


def parse_menu_table(page_html: str, where: str) -> list[dict]:
    """Rows of the wide tables, in page order: product_id, name, kcal, kj, fat, sat_fat, sugar, salt, marks (column head ->
    'contains' | 'may'), sub_contains / sub_may (printed words of the line under the row)."""
    page_html = re.sub(r"<script.*?</script>", "", page_html, flags=re.S)
    page_html = re.sub(r"<!--.*?-->", "", page_html, flags=re.S)
    start = page_html.find('<div class="content-page">')
    body = page_html[start:page_html.find(COURSE_END, start)]
    rows = []
    heads_seen = []
    # a table = thead (column heads) + tbody (rows); each dish is a <tr class="menu-table-row"> optionally followed by a subrow
    for tm in re.finditer(r"<table .*?</table>", body, re.S):
        table = tm.group(0)
        heads = [_text(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", table, re.S)]
        heads = [h.replace("Each portion contains ", "") for h in heads]
        if heads != ["Description", "Energy", "Fat", "Saturates", "Sugars", "Salt"] + TABLE_ALLERGEN_HEADS:
            raise SystemExit(f"{where}: table column heads changed: {heads}")
        heads_seen.append(heads)
        for rm in re.finditer(r'<tr class="menu-table-row"[^>]*>(.*?)</tr>(\s*<tr class="menu-table-subrow">(.*?)</tr>)?', table, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", rm.group(1), re.S)
            link = re.search(r'<a class="productlink[^"]*"\s+href="/Products/([^"]+)">(.*?)</a>', cells[0], re.S)
            if not link or len(cells) != 6 + len(TABLE_ALLERGEN_HEADS):
                raise SystemExit(f"{where}: a table row with {len(cells)} cells / no product link: layout changed")
            e = re.match(r"^(\d+(?:\.\d+)?)\s*kcal\s+(\d+(?:\.\d+)?)\s*kJ$", _text(cells[1]))
            if not e:
                raise SystemExit(f"{where}: table energy cell {_text(cells[1])!r} not like '583kcal 2439kJ'")
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
            rows.append(dict(product_id=link.group(1), name=_text(link.group(2)), kcal=e.group(1), kj=e.group(2),
                             fat=vals[0], sat_fat=vals[1], sugar=vals[2], salt=vals[3], marks=marks, sub_contains=sc, sub_may=sm))
    return rows


# ---------------------------------------------------------------------------------------------------------------------------
# The product page (/Products/<id>) of one dish: a third rendering of the same figures, plus the per-100 g column.
_N = r"(\d+(?:\.\d+)?)"
_V = r"(<?\d+(?:\.\d+)?)"
PRODUCT_HEAD_RE = re.compile(r"^(.*?) Each (.+?) contains Energy " + _N + r"kJ " + _N + r"kcal [\d.]+% Fat " + _V + r"g [\d.]+% Saturates " + _V +
                             r"g [\d.]+% Sugars " + _V + r"g [\d.]+% Salt " + _V + r"g")
PRODUCT_TABLE_RE = re.compile(r"Per 100g Per .+? % RI \* Per .+? Energy " + _N + r"kJ " + _N + r"kcal " + _N + r"kJ " + _N + r"kcal [\d.]+% Fat " + _V +
                              r"g " + _V + r"g [\d.]+% of which Saturates " + _V + r"g " + _V + r"g [\d.]+% of which Sugars " + _V + r"g " + _V +
                              r"g [\d.]+% Salt " + _V + r"g " + _V + r"g")


def parse_product(page_html: str, where: str) -> dict:
    """-> {name_line (name plus the line printed under it), label ("Ptn", "283g", "1 x 16 x 110g"), kj, kcal, fat, sat_fat, sugar, salt
    (per portion, strings), per100 {kcal, fat, salt}, contains / may (sets of printed allergen words, top-level and named alike)}."""
    t = re.sub(r"<script.*?</script>", "", page_html, flags=re.S)
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    i0, j = t.find('<div class="main'), t.find("pre-footer")
    if i0 < 0 or j < 0:
        raise SystemExit(f"{where}: product page layout changed")
    b = _text(t[i0:j])
    m, tab = PRODUCT_HEAD_RE.match(b), PRODUCT_TABLE_RE.search(b)
    if not m or not tab:
        raise SystemExit(f"{where}: product page headline / nutrition table not understood: {b[:200]!r}")
    seg = re.search(r"adult \(8400kJ / 2000kcal\)(.*?)(?:Carbon Footprint|Ingredient Specification|$)", b)
    text = re.split(r" Suitable for a ", seg.group(1).strip())[0] if seg else ""
    contains, may = set(), set()
    for kind, word in re.findall(r"(Contains|May Contain) (.*?)(?= Contains | May Contain |$)", text):
        (contains if kind == "Contains" else may).add(word.strip())
    return dict(name_line=m.group(1), label=m.group(2), kj=m.group(3), kcal=m.group(4), fat=m.group(5), sat_fat=m.group(6), sugar=m.group(7),
                salt=m.group(8), per100=dict(kcal=tab.group(2), fat=tab.group(5), salt=tab.group(11)),
                portion_table=dict(kcal=tab.group(4), fat=tab.group(6), salt=tab.group(12)), contains=contains, may=may)
