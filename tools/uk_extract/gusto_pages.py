"""Reader for Gusto Italian's allergen matrix page (https://www.gustorestaurants.com/allergen-matrix/).

The page is plain server-rendered HTML (no script needed). Each menu is a "worksheet" <section id="sheet-...">; its desktop table
has a header row (one <th data-allergen-name> per allergen column, and the columns differ from sheet to sheet) and, for every dish, a
"dish-row" (name, one cell per column holding "Yes" or "Yes*" or nothing) followed by a hidden "dish-details-row" with the dish's
Calories / Contains / Removable Ingredients / Gluten Type / Tree Nut Type lists. The mobile "cards" repeat the same data and are ignored.
Only the standard library is used (Python 3.9).
"""
from __future__ import annotations
import re
from html.parser import HTMLParser


class _Matrix(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sheet = None          # id of the worksheet being read
        self.headers = {}          # sheet -> {column index: allergen column name}
        self.rows = []             # one dict per dish row
        self.last_updated = None
        self._row = None
        self._mode = None          # "row" | "details"
        self._cap = None           # what the text being read is for
        self._buf = []
        self._cell = None
        self._cell_removable = False
        self._msec = None
        self._page_text = []

    # ------------------------------------------------------------------ helpers
    def _start_cap(self, what: str) -> None:
        self._cap, self._buf = what, []

    def _flush_msec(self) -> None:
        if self._msec is not None and self._row is not None:
            title = " ".join(self._msec["title"].split())
            if title in self._row["meta"]:
                raise SystemExit(f"{self._row['sheet']} / {self._row['name']!r}: section {title!r} printed twice in the dish details")
            self._row["meta"][title] = {"items": self._msec["items"], "text": " ".join(self._msec["text"].split())}
        self._msec = None

    # ------------------------------------------------------------------ parser callbacks
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "section" and "allergen-worksheet" in cls:
            self.sheet = a.get("id")
            self.headers.setdefault(self.sheet, {})
        elif tag == "th" and "col-allergen" in cls and "data-allergen-name" in a and self.sheet:
            m = re.search(r"dyn-col-(\d+)", a.get("class", ""))
            if not m:
                raise SystemExit(f"{self.sheet}: allergen header without a column number")
            self.headers[self.sheet][int(m.group(1))] = a["data-allergen-name"].strip()
        elif tag == "tr" and "dish-row" in cls and self.sheet:
            self._row = {"sheet": self.sheet, "name": "", "attrs": {k: v for k, v in a.items() if k.startswith("data-")},
                         "cells": {}, "meta": {}}
            self._mode = "row"
        elif tag == "tr" and "dish-details-row" in cls and self._row is not None:
            self._mode = "details"
        elif self._mode == "row":
            if tag == "span" and "dish-name" in cls:
                self._start_cap("name")
            elif tag == "td" and "col-allergen" in cls:
                m = re.search(r"dyn-col-(\d+)", a.get("class", ""))
                self._cell = int(m.group(1)) if m else None
                if self._cell is None:
                    raise SystemExit(f"{self._row['sheet']} / {self._row['name']!r}: allergen cell without a column number")
                self._row["cells"][self._cell] = ""
            elif tag == "span" and "has-allergen" in cls and self._cell is not None:
                self._cell_removable = "removable" in cls
                self._start_cap("cell")
        elif self._mode == "details":
            if tag == "div" and "meta-section" in cls:
                self._flush_msec()
                self._msec = {"title": "", "items": [], "text": ""}
            elif tag == "strong" and self._msec is not None:
                self._start_cap("title")
            elif tag == "li" and self._msec is not None:
                self._start_cap("li")
            elif tag == "p" and self._msec is not None:
                self._start_cap("p")

    def handle_endtag(self, tag):
        text = " ".join("".join(self._buf).split())
        if self._cap == "name" and tag == "span":
            self._row["name"] = text
            self._cap = None
        elif self._cap == "cell" and tag == "span":
            if text not in ("Yes", "Yes*"):
                raise SystemExit(f"{self._row['sheet']} / {self._row['name']!r}: unexpected allergen cell text {text!r}")
            if (text == "Yes*") != self._cell_removable:
                raise SystemExit(f"{self._row['sheet']} / {self._row['name']!r}: cell text {text!r} does not match its 'removable' class")
            self._row["cells"][self._cell] = text
            self._cap = None
        elif self._cap == "title" and tag == "strong":
            self._msec["title"] = text
            self._cap = None
        elif self._cap == "li" and tag == "li":
            self._msec["items"].append(text)
            self._cap = None
        elif self._cap == "p" and tag == "p":
            self._msec["text"] += " " + text
            self._cap = None
        elif tag == "td":
            self._cell = None
        elif tag == "tr" and self._mode == "details":
            self._flush_msec()
            self.rows.append(self._row)
            self._row, self._mode = None, None
        elif tag == "tr" and self._mode == "row":
            self._mode = "row-done"

    def handle_data(self, data):
        if self._cap:
            self._buf.append(data)
        self._page_text.append(data)

    def close(self):
        super().close()
        if self._row is not None:
            raise SystemExit("The page ended in the middle of a dish row: the layout changed")
        m = re.search(r"Last Updated:\s*(\d\d/\d\d/\d{4})", " ".join(" ".join(self._page_text).split()))
        self.last_updated = m.group(1) if m else None


def read_matrix(html_text: str):
    """Returns (rows, headers, last_updated). rows[i] = {sheet, name, attrs (data-*), cells {col: "Yes"|"Yes*"}, meta {title: {items, text}}}."""
    p = _Matrix()
    p.feed(html_text)
    p.close()
    return p.rows, p.headers, p.last_updated
