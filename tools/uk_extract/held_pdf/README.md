# Held PDF readers (not used)

These read ASK Italian, Zizzi, Coco di Mama and PizzaExpress's nutrition PDFs. Those PDFs sit on hosts whose robots.txt disallows them
(`cdn.sanity.io` and `content-cdn.pizzaexpress.com` disallow `/*.pdf`), so the chains were pulled on 2026-10-08 (`data/held-robots/`).
Since 2026-10-11 the four chains are published again from their own HTML menu pages, which robots.txt allows: `../zizzi_html.py`,
`../ask_italian_html.py`, `../coco_di_mama_html.py` (shared reader `../azzurri_html.py`) and `../pizza_express_html.py`. These old scripts are
kept only for a PDF the founder saves from their own browser; never run them against the disallowed hosts.
