"""Read itsu UK's official menu pages into rows of printed numbers.

Used by tools/uk_extract/itsu.py. Standard library only.

itsu publishes its nutrition on its own website, https://www.itsu.com/menu/ : the menu page lists every dish as a card and
each dish has its own page (https://www.itsu.com/menu/<category>/<dish>/) with a "nutrition facts" list (energy kcal, fat,
of which saturates, protein, carbohydrates, of which sugars, fibre, salt). Those pages carry one set of values per dish
(no per-100g column) and no date. Numbers are returned exactly as the page prints them, as strings ("17.3", "1.22").

The same page also embeds the data it was rendered from (window.__NUXT__ ... calories:"318", salt:"1.218"). That copy is
less rounded for salt, so it is only used to cross-check the printed numbers (see `embedded`), never as the source.

Allergens: each dish page prints "contains: gluten, sesame, soya" and "may contain: celery, sulphur dioxide" (read_item returns
both lines as printed); the embedded copy (allergens:[{name:"Gluten"},...], may_contain:[...]) is read by
`embedded_allergens` only to cross-check them.
"""
from __future__ import annotations
import html
import re

# Printed label (as it appears on the page) -> our key. Order is the page's order.
LABELS = {
    "energy (kcal)": "kcal",
    "fat (g)": "fat",
    "of which saturates (g)": "sat",
    "protein (g)": "protein",
    "carbohydrates (g)": "carbs",
    "of which sugars (g)": "sugars",
    "fibre (g)": "fibre",
    "salt (g)": "salt",
}
# Keys of the embedded copy, same meaning as above.
EMBEDDED_KEYS = {"calories": "kcal", "fat": "fat", "fat_saturated": "sat", "protein": "protein", "carbs": "carbs",
                 "sugars": "sugars", "fibre": "fibre", "salt": "salt"}

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
_TAGS = re.compile(r"<[^>]+>")
_CARD = re.compile(r'<a href="(/menu/[^"]*)" class="base-lined-card product-listing-card".*?<strong class="title"[^>]*>(.*?)</strong>(.*?)</a>', re.S)
_FACT = re.compile(r'<dt class="fact-title"[^>]*>(.*?)</dt>\s*<dd class="fact-description"[^>]*>(.*?)</dd>', re.S)
_CONTAIN = re.compile(r'<span class="labeller"[^>]*>(.*?)</span>:\s*<span[^>]*>(.*?)</span>', re.S)


def _text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAGS.sub(" ", s))).strip()


def menu_cards(menu_html: str) -> list[dict[str, str]]:
    """Every dish card on the menu page, in page order: path, title, and the line under the title ('318 kcal')."""
    cards = []
    for m in _CARD.finditer(menu_html):
        cards.append({"path": m.group(1), "title": _text(m.group(2)), "line": _text(m.group(3))})
    return cards


def category_links(menu_html: str) -> list[str]:
    """The menu's category pages, as linked from the page's own category navigation (dish cards are not categories)."""
    dishes = {c["path"] for c in menu_cards(menu_html)}
    seen: list[str] = []
    for m in re.finditer(r'href="(/menu/(?:menu/)?[a-z-]+/)"', menu_html):
        if m.group(1) != "/menu/" and m.group(1) not in seen and m.group(1) not in dishes:
            seen.append(m.group(1))
    return seen


def read_item(page: str) -> dict:
    """One dish page -> {name, description, kcal_header, printed, contains, may_contain, embedded, title, ingredients}."""
    h1 = re.search(r'<h1[^>]*class="[^"]*secondary-name[^"]*"[^>]*>(.*?)</h1>', page, re.S)
    if not h1:
        raise SystemExit("A dish page has no title (the layout changed, or the page failed to load): re-check the source.")
    desc = re.search(r'<p class="description"[^>]*>(.*?)</p>', page, re.S)
    head = re.search(r'<p class="calories"[^>]*>(.*?)</p>', page, re.S)
    printed: dict[str, str] = {}
    labels: list[str] = []
    for dt, dd in _FACT.findall(page):
        label = _text(dt).lower()
        value = _text(dd)
        labels.append(label)
        if label not in LABELS:
            raise SystemExit(f"Unknown nutrition label {label!r} on a dish page: the layout changed, re-check the source.")
        if label in (k for k in printed):
            raise SystemExit(f"Label {label!r} printed twice on one dish page.")
        printed[LABELS[label]] = value
    contains: dict[str, str] = {}
    for lab, val in _CONTAIN.findall(page):
        contains[_text(lab).lower()] = _text(val)
    title = re.search(r"<title>(.*?)</title>", page, re.S)
    return {
        "name": _text(h1.group(1)),
        "description": _text(desc.group(1)) if desc else "",
        "kcal_header": _text(head.group(1)) if head else "",
        "labels": labels,
        "printed": printed,
        "contains": contains.get("contains", ""),
        "may_contain": contains.get("may contain", ""),
        "embedded": embedded(page),
        "title": _text(title.group(1)) if title else "",
        "ingredients": embedded_text(page, "ingredients"),
    }


def _split_args(s: str) -> list[str]:
    """Split a JavaScript argument list on top-level commas (strings, brackets and braces are kept whole)."""
    out, depth, start, quote, i = [], 0, 0, "", 0
    while i < len(s):
        c = s[i]
        if quote:
            if c == "\\":
                i += 1
            elif c == quote:
                quote = ""
        elif c in "\"'":
            quote = c
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == "," and depth == 0:
            out.append(s[start:i])
            start = i + 1
        i += 1
    out.append(s[start:])
    return [a.strip() for a in out]


_STR = r'"(?:[^"\\]|\\.)*"'


def _unjs(lit: str) -> str:
    """A JavaScript string literal ("...\\u002F...") -> its text."""
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), lit[1:-1].replace('\\"', '"').replace("\\\\", "\\"))


def _nuxt(page: str) -> tuple[str, dict[str, str]]:
    """The page's embedded data (window.__NUXT__ = (function(a,b,...){return {...}})(args)) and its short variable names.
    The data repeats a value as a short variable name, so names are looked up in the argument list (strings only)."""
    i = page.find("window.__NUXT__")
    if i < 0:
        return "", {}
    blob = page[i:page.find("</script>", i)]
    head = re.match(r"window\.__NUXT__=\(function\(([^)]*)\)\{return ", blob)
    names: dict[str, str] = {}
    if head:
        tail = blob.rfind("}}(")
        args = _split_args(blob[tail + 3:blob.rfind("))")]) if tail > 0 else []
        params = head.group(1).split(",")
        if len(params) == len(args):
            names = {n: a for n, a in zip(params, args) if re.fullmatch(_STR, a)}
    return blob, names


def embedded_text(page: str, key: str) -> str:
    """One text field of the dish ('ingredients', 'marketing_product_description') from the page's embedded data, or ''."""
    blob, names = _nuxt(page)
    m = re.search(r'[,{]' + key + r':(' + _STR + r'|[A-Za-z_$][\w$]*)', blob)
    if not m:
        return ""
    v = m.group(1)
    if v.startswith('"'):
        return _unjs(v)
    return _unjs(names[v]) if v in names else ""


def embedded(page: str) -> dict[str, str]:
    """The nutrition values inside the page's own embedded data. Only plain strings count."""
    out: dict[str, str] = {}
    for key, ours in EMBEDDED_KEYS.items():
        v = embedded_text(page, key)
        if v != "" or re.search(r'[,{]' + key + r':""', _nuxt(page)[0]):
            out[ours] = v
    return out


_NAME_ENTRY = re.compile(r'\{name:(' + _STR + r'|[A-Za-z_$][\w$]*)\}')


def embedded_allergens(page: str) -> tuple[list[str], list[str]] | None:
    """The dish's own allergen lists from the page's embedded data: (contains names, may-contain names), or None when the
    page carries no such lists (or more than one pair, so it is not clear which belongs to the dish)."""
    blob, names = _nuxt(page)
    pairs = re.findall(r"[,{]allergens:\[(.*?)\],may_contain:\[(.*?)\]", blob)
    if len(pairs) != 1:
        return None

    def read(lst: str) -> list[str]:
        out = []
        for v in _NAME_ENTRY.findall(lst):
            if v.startswith('"'):
                out.append(_unjs(v))
            elif v in names:
                out.append(_unjs(names[v]))
            else:
                raise SystemExit(f"An allergen name in the page's embedded data is not a plain string ({v}): re-check the reader.")
        if re.sub(_NAME_ENTRY, "", lst).replace(",", "").strip():
            raise SystemExit(f"Unexpected allergen entry in the page's embedded data: {lst[:120]!r}")
        return out

    return read(pairs[0][0]), read(pairs[0][1])
