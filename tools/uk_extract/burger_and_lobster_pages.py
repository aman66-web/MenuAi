"""Reader for the menu pages on burgerandlobster.com (used by burger_and_lobster.py).

Each restaurant has a page https://www.burgerandlobster.com/locations/<city>/<site>/menu/ that is plain server-rendered HTML:

    div.menu-section > h2.section-title            (section, e.g. "The Originals")
      h3.subsection-title                           (optional sub-heading, e.g. "Burger")
      div.dish-item[data-dish-id] > ... h3|h4.dish-title
          div.dish-ingredients                      (description text; its span.dish-dietary-calories holds "V | 708 kcal")
          div.dish-size-variations > div.size-variation > span.size-name + span.size-details (span.size-variation-calories + price)
          div.dish-price, div.dish-disclaimer, div.dish-place-of-origin, div.dish-bac-per-volume-inline

read_dishes(html) returns one dict per dish in page order. Nothing is converted: text is returned as printed (whitespace collapsed).
"""
from __future__ import annotations
from html.parser import HTMLParser

TEXT_CLASSES = ("section-title", "section-description", "subsection-title", "subsection-description", "dish-title", "dish-ingredients",
                "dish-dietary-calories", "size-name", "size-variation-calories", "size-details", "dish-price", "dish-disclaimer",
                "dish-place-of-origin", "dish-bac-per-volume-inline", "separator")


def _clean(s: str) -> str:
    return " ".join(s.split())


class _Reader(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, list[str]]] = []
        self.in_menu = False
        self.section = ""
        self.section_desc: list[str] = []
        self.subsection = ""
        self.dishes: list[dict] = []
        self.dish: dict | None = None
        self.variation: dict | None = None

    # --- helpers
    def _innermost(self) -> str:
        for _, classes in reversed(self.stack):
            for c in TEXT_CLASSES:
                if c in classes:
                    return c
        return ""

    def _has(self, cls: str) -> bool:
        return any(cls in classes for _, classes in self.stack)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        self.stack.append((tag, classes))
        if "restaurant-menu-display" in classes:
            self.in_menu = True
        if not self.in_menu:
            return
        if "section-title" in classes:
            self.section, self.subsection = "", ""
        elif "subsection-title" in classes:
            self.subsection = ""
        elif "dish-item" in classes:
            self.dish = {"dish_id": a.get("data-dish-id", ""), "section": self.section, "subsection": self.subsection, "title": "",
                         "description": [], "marks": [], "kcal": [], "variations": [], "price": [], "disclaimer": [], "origin": [],
                         "volume": []}
            self.dishes.append(self.dish)
            self.variation = None
        elif "size-variation" in classes and self.dish is not None:
            self.variation = {"name": "", "kcal": "", "price": ""}
            self.dish["variations"].append(self.variation)

    def handle_endtag(self, tag: str) -> None:
        while self.stack:
            t, classes = self.stack.pop()
            if "size-variation" in classes:
                self.variation = None
            if t == tag:
                break

    def handle_data(self, data: str) -> None:
        text = _clean(data)
        if not self.in_menu or not text:
            return
        where = self._innermost()
        if where == "section-title":
            self.section = _clean(self.section + " " + text)
        elif where == "subsection-title":
            self.subsection = _clean(self.subsection + " " + text)
        elif self.dish is None:
            return
        elif where == "dish-title":
            self.dish["title"] = _clean(self.dish["title"] + " " + text)
        elif where == "dish-ingredients":
            self.dish["description"].append(text)
        elif where == "dish-dietary-calories":
            (self.dish["kcal"] if "kcal" in text.lower() else self.dish["marks"]).append(text)
        elif self.variation is not None and where == "size-name":
            self.variation["name"] = _clean(self.variation["name"] + " " + text)
        elif self.variation is not None and where == "size-variation-calories":
            self.variation["kcal"] = _clean(self.variation["kcal"] + " " + text)
        elif self.variation is not None and where == "size-details":
            self.variation["price"] = _clean(self.variation["price"] + " " + text)
        elif where == "dish-price":
            self.dish["price"].append(text)
        elif where == "dish-disclaimer":
            self.dish["disclaimer"].append(text)
        elif where == "dish-place-of-origin":
            self.dish["origin"].append(text)
        elif where == "dish-bac-per-volume-inline":
            self.dish["volume"].append(text)


def read_dishes(html: str) -> list[dict]:
    r = _Reader()
    r.feed(html)
    if not r.dishes:
        raise SystemExit("No dishes found on the page: the site's markup changed (expected div.dish-item inside div.restaurant-menu-display)")
    return r.dishes
