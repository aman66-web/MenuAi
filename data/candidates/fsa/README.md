# Chain discovery from the Food Standards Agency's food hygiene open data (round 7B, 12 October 2026)

**Source:** the FSA's Food Hygiene Rating Scheme / Food Hygiene Information Scheme bulk files, one XML file per local authority,
listed at https://ratings.food.gov.uk/open-data ("Downloadable XML data files (updated daily)"); the file addresses come from the
FSA API's own authority list (https://api.ratings.food.gov.uk/Authorities, header `x-api-version: 2`, field `FileName`).
Licence: Open Government Licence v3.0. Downloaded once on **12 October 2026** (files extracted 7-11 October 2026), one file at a time,
about one request a second, cached outside the repo (`/tmp/fsa-cache`); ratings.food.gov.uk serves no robots.txt (404 = no rules).
Every English-language file was used (England, Wales, Scotland and Northern Ireland: 363 authorities).

**Rebuild:** `tools/discovery/fsa/` (standard library only; cache in `/tmp/fsa-cache`): `download.py` (needs the authority list saved as
`/tmp/fsa-cache/authorities.json`), `parse.py`, `known.py <repo> /tmp/fsa-cache/known.json [chains-added-this-round]`,
`count.py /tmp/fsa-cache/known.json /tmp/fsa-cache/out`, `shortlist.py /tmp/fsa-cache/out data/candidates/fsa` (the by-eye review is the
lists at the top of `shortlist.py`). This round's `known` column was computed without `yo-to-go`, the chain this round added.

**Result:** 614,158 establishments read; 271,626 distinct normalised names; **11,831 names with 3+ GB outlets** in the kept business
types; 3,938 of them already known, generic or institutions; **7,893 new names on the shortlist**. By eye: 65 look like one brand at
10+ outlets (`kind` = chain, triaged in `data/candidates/triage7/b.csv`), 70 more small chains under 10 outlets, 14 known under another
name, 115 not public restaurant chains (leisure, charity, contract caterers, hotels), 580 names with 10+ outlets shared by unrelated
businesses, and 7,049 names with 3-9 outlets not reviewed one by one.

**Method** (the rules, so the list can be rebuilt):

1. Business types kept (the public orders food there): Restaurant/Cafe/Canteen, Takeaway/sandwich shop, Pub/bar/nightclub,
   Mobile caterer, Other catering premises, Hotel/bed & breakfast/guest house; plus "Retailers - other" only when the business name
   itself says bakery/baker/bakehouse/patisserie/pasty/pie/donut/café/coffee/deli/sandwich/cookie/crêpe/waffle/juice/bubble tea.
2. Name normalised: lower case, accents dropped, "t/a X" read as X, anything in brackets dropped, the part after " - ", "@", ":" or
   "," dropped (branch names such as "Costa - Leeds"), "&" = "and", punctuation dropped, "Ltd/Limited/PLC/LLP/UK" dropped, a
   leading "The" dropped, and trailing words that are this outlet's own town (address lines 2-4 or the council's name, but not
   line 1, which often repeats the business's own name) or numbers dropped ("Subway Leeds" -> "subway").
3. Outlets = distinct postcodes per normalised name; Northern Ireland outlets are counted separately (`ni_outlets`) and never
   make up the 3+ (a chain only counts if it has GB sites).
4. `counts.csv`: every name with **3 or more GB outlets** (with the number of councils and regions, the business types and the three
   commonest spellings). The `known` column marks names already in the repo: a published folder in `data/source/` (id, name and
   aliases), any list in `data/candidates/` (ids and names), `data/held-*` folders, and the chain names in `docs/UK_DATA_STATUS.md`,
   `docs/CHAINS_WORK_LIST.md`, `docs/PROGRESS.md` and `data/chrome-inbox/`: exact match, a known name followed by more words
   ("costa coffee" ~ "costa"), the same first two words or the same distinctive first word as a known name (`known-similar`), or
   the name written anywhere in those files (`mentioned`). `generic` marks names made only of everyday words (pub names such as
   "Red Lion", "Golden Dragon", "Fish Bar"): many unrelated businesses share them. `institution` marks clubs, churches, schools,
   charities, care homes and the like, and the big contract caterers (staff, school and hospital canteens run under the client's name).
5. `shortlist.csv`: the names left (not known, not generic, not an institution or contract caterer), each looked at by eye: the
   `kind` column says whether it is a chain (one brand at several sites), several unrelated businesses that share a name, not a food
   business, or unclear. Chains were triaged largest first (`data/candidates/triage7/b.csv`).

Counts are of registrations in the hygiene data, not a census: a closed outlet can linger, a kiosk inside a supermarket counts, and
an outlet registered under its operating company's name is missed.
