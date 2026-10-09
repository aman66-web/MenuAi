# Nutrition read from each product's own page (Tier 2)

`sainsburys.csv`: one row per Sainsbury's product whose own page printed a usable nutrition table (per 100 g or ml, as printed; "<0.5" counts as 0; `state` is the word the table's own
heading adds for cooked or prepared food). Built by `python3 tools/groceries/t2_sainsburys.py ingest --work data/groceries/nutrition/raw` from the stored reads, which come from Chrome
agents running `tools/groceries/t2_extractor.js` (checksummed lines: the page's own slug hash and a line check; the tool refuses a line it cannot verify).

`raw/`: the stored reads (`results_K.tsv`, `none_K.txt` = pages with no nutrition table, `sliceK.txt` = the products handed out), the agent brief, kept so the work can resume:
`python3 tools/groceries/t2_sainsburys.py status --work data/groceries/nutrition/raw`. A read is left out of the CSV (never fixed) when its basis is not a plain per-100 column
(or a clearly labelled cooked/prepared one), a main number is missing, kJ and kcal disagree, or the numbers fail the plausibility checks; those pages show "nutrition not read yet" in the app.
Allergens are not read. No barcodes are available on Sainsbury's pages.
