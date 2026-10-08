# Extracted but not published: not a place the public can order from

Chains here were extracted correctly from the organisation's own official file, but they are not restaurants a person can walk
into and order from, so the app does not publish them (founder's rule: the app is for ordering at restaurant chains).
`tools/build_menus.py` only reads `data/source/`, so nothing in this folder reaches the site.

| Folder | What it is | Source |
|---|---|---|
| `norse-catering/` | Norfolk primary-school lunch menu (72 items, full nutrition, one held back). Script: `tools/uk_extract/norse_catering.py`, `norse_catering_pdf.py` (they read `data/source/norse-catering`: move the folder back to restore) | Norse Group "Nutrition Analysis for Primary Menu Spring/Summer 2026" PDF, created 26 March 2026 |

To publish one anyway: move its folder back into `data/source/`, then `python3 tools/uk_extract/check_chain.py <id> --fail-on-high`.
