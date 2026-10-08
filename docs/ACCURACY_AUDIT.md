# Accuracy audit of nutrition and allergen data

Founder's instruction, 8 October 2026: "make sure to ensure the accuracy of the nutritional information and allergies".
People use these numbers to count calories and to avoid allergens, so a wrong figure or a missing allergen is a real harm.
This page says how accuracy is checked, the rules that came out of it, what the first full pass found, and what stays risky.

## How accuracy is checked

1. **Automated consistency audit** — `python3 tools/audit/accuracy_audit.py` (also printed by `tools/uk_extract/check_chain.py`, which
   `--fail-on-high` turns into a gate; the banking helper refuses a chain with an unreviewed high flag). It reads every published chain
   and flags numbers that cannot hold: calories against 4·protein + 4·carbs + 9·fat (alcohol drinks aside), saturates above fat, sugars or
   fibre above carbohydrate, kJ against kcal, salt against sodium, macros heavier than the serving, a "large" smaller than a "small",
   implausible quantities; and allergen contradictions: a "vegan" dish marked milk or egg, a "gluten free" dish marked gluten, a vegetarian
   dish marked fish, a dish whose name says cheese, bread, egg, fish, nuts... with that allergen not marked. A flag is a **question**,
   never a correction.
2. **Independent second reader** — for every published chain a helper re-downloaded the chain's official source and read it itself, with a
   method different from our extraction script (another parser, the rendered page in a browser, pixel colours of allergen marks, the
   page's own data), then compared every flagged row plus a spread of random items, all published values and all allergen marks.
   `python3 tools/audit/sample.py <chain>` prints the checklist. Results: `data/audit/verified/<chain>.json`.
3. **Fix rules** — never "correct" a number. An extraction mistake is fixed in the chain's script (so a re-run reproduces the data); a
   row the chain's own document contradicts is **held back**; a flag the source really prints is logged with evidence in
   `data/audit/reviewed/<chain>.csv` so the audit stops raising it.

## Policies decided (all conservative)

1. **kJ that disagrees with kcal.** If we publish kJ for the chain, the dish is held back when kJ and kcal disagree (outside 0.85–1.15
   × 4.184 per kcal; some chains use the stricter 0.93–1.07). If we publish no kJ for the chain and the kcal agrees with the dish's own
   protein, carbs and fat (within 15–20%), the dish stays and no kJ is shown (Mitchells & Butlers guides). A kcal that disagrees with the
   dish's own macros by more than 30% (food) is held back.
2. **A dish that contains one tree nut or cereal and "may contain" another kind.** The model stores an allergen once, as "contains", so
   naming only the contained kind would hide the other warning. The writers now publish the generic allergen (no named kind) in that case
   (`tools/uk_extract/common.py write_allergens`, and the three Ten Kites helpers). Safe direction: more warning, less detail.
3. **Allergen row contradicts the dish's own name or ingredient text** (cheese with no milk marked, battered with no gluten marked, a
   brownie with no gluten, mayonnaise with no egg, pistachio with no nut...) → the dish is held back, not shown with a wrong "safe" row.
   Where the guide itself says its row excludes choices ("click through for choices"), the dish is held back too.
4. **Allergens are all or nothing per chain** (unchanged): every published dish has a row copied from the chain's own guide, or the
   chain shows only the link to the guide.
5. **Stale or drifting guides are re-read, not trusted.** Guides regenerate within days (All Bar One, Wagamama, Ember Inns, Miller &
   Carter, Sizzling Pubs, Stonehouse, The Botanist, Pure, Rosa's Thai, Hickory's, BarBurrito, Caffè Nero had all changed since 5–7 Oct).
   Each such chain was re-run on the fresh source. A source that is old is said so in the chain's note (Sainsbury's Café: 2023 files;
   Oodles Wok: January 2025 analysis; Rola Wala: 2024 chart; Browns: the live guide no longer lists the menus we publish).
6. **robots.txt is never worked round.** The accuracy pass also found that Starbucks' guide PDFs are disallowed
   (`Disallow: /*.pdf`); Starbucks is out of the app (`data/held-robots/`).

## What the first full pass found (8 October 2026)

- 154 published chains, about 23,200 items; each of the 150 chains published at the start of the pass was re-read from its official
  source by a second reader (24,000+ item comparisons); the chains added during the day were checked by their extractors and, where
  noted in `data/audit/verified/`, a second reader.
- **Extraction mistakes were rare and specific:** a title line cut off at a page top (Gail's), a tag one row too low (Greene King), 12 allergen
  rows (Bistrot Pierre), allergens never extracted although the guide prints them (Puccino's, IKEA, Itsu, Chipotle, Five Guys, Yalla Yalla,
  the Mitchells & Butlers guides), a column never extracted (Tim Hortons "may contain" on 126 rows), data built before kJ/allergen code existed
  (Caffè Nero, Chilango, Tortilla, Vintage Inns, IKEA, Itsu).
- **The chains' own documents contradict themselves far more often:** per-100 g figures printed as a serving (Real Greek dips, Blacklock
  by-weight chops), kJ vs kcal gaps, "vegan" dishes marked milk or egg, battered or crumbed dishes with no gluten, desserts with no gluten,
  dishes with mayonnaise or aioli and no egg, water bottles marked with all 14 allergens. About 480 rows were held back for these reasons;
  about 840 flags were checked against the source and logged as printed.
- High-severity flags: 76 → 0 for nutrition and 35 → 0 for allergens (a few remain in chains being re-read; see the latest report in
  `data/audit/accuracy_report.md`).

## What can still be wrong (so you know)

- **Chains' own errors we cannot detect:** a figure that is wrong but self-consistent (Real Greek brownie salt 6.8 g, JW Lees nachos 175 kcal,
  Amigos pages that look cloned from other dishes, Blank Street prints different calories for the same pastry by city). They are published as
  printed; each is noted in `data/audit/verified/<chain>.json` or the chain note.
- **Drift:** a published number is only as current as its check date (shown on every chain page). A weekly re-run is planned (not built):
  `tools/uk_extract/<chain>.py` re-runs stop if a page changes shape and `check_chain.py` re-gates the result.
- **Unnamed "other nuts/cereals" in a chain's may-contain** now show as generic allergens; the exact kind is only given when the chain names it
  and does not list a different kind under "may contain".
- **Chains with only a link to the allergen guide** (about 70) show no allergen list at all: there is no per-dish allergen data to check.
- **Judgement calls** that the founder may prefer to reverse are one line each in the chain's `holdback.csv` (delete the line to publish).

## Commands

```bash
python3 tools/audit/accuracy_audit.py                 # whole-site audit → data/audit/accuracy_report.md + flags/<chain>.csv
python3 tools/audit/sample.py <chain> --n 12          # checklist for an independent source re-read
python3 tools/uk_extract/check_chain.py <chain> --fail-on-high   # build one chain + audit it (exit 3 on an unreviewed high flag)
python3 tools/uk_extract/robots_audit.py              # every source address (and every URL in each chain's script) against robots.txt
```
