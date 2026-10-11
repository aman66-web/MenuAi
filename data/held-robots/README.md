# Held back: source file's host disallows automated downloads (robots.txt)

On 2026-10-08 a check of every chain's source address against its host's robots.txt, using a matcher that understands the `*` and `$`
wildcards (Python's urllib.robotparser does not, which is how these slipped through), found six chains (a seventh, Starbucks, and an eighth, Burger King, were found later the same day) whose official PDF was
downloaded by script from a host that disallows it:

| Chain | Host and rule |
|---|---|
| Zizzi, ASK Italian, Coco di Mama, Ole & Steen | `cdn.sanity.io`: `Disallow: /*.pdf` (only `/files/cgnmnbqj/` is allowed) |
| Pizza Express | `content-cdn.pizzaexpress.com`: `Disallow: /*.pdf` (only `/files/cgnmnbqj/` is allowed) |
| Subway | `media.subway.com`: `Disallow: /` |
| Burger King (added 2026-10-08 by the allergen pass) | the nutrition PDF is a Google Drive file the site redirects to; it was fetched by script from `drive.google.com/uc?export=download`, which Drive's robots.txt disallows (`Disallow: /`, with only /file, /view, /viewer, /folder... allowed), and Drive's download host `drive.usercontent.google.com` is `Disallow: /`. The allergen PDF is on `cdn.sanity.io` (`Disallow: /*.pdf`) |
| Starbucks (added 2026-10-08 by the accuracy re-check) | `www.starbucks.co.uk`: `Disallow: /*.pdf` (both the Beverages and Food guide PDFs are .pdf files; the chain page that links them is allowed, the files are not) |

The standing rule (docs/UK_DATA_PLAYBOOK.md): a robots.txt Disallow stops us and we never work round it. So these chains are not in the
app (`tools/build_menus.py` reads only `data/source/`). Nothing was changed or deleted: each folder here is exactly what was published.

## Update 2026-10-11: four are back, from their own HTML menus

ASK Italian, Zizzi, Coco di Mama and PizzaExpress are published again, **calories only**, from each chain's own HTML menu pages, which
robots.txt allows (`tools/uk_extract/zizzi_html.py`, `ask_italian_html.py`, `coco_di_mama_html.py` with the shared reader `azzurri_html.py`, and
`pizza_express_html.py`). Nothing in this folder and none of the PDFs was used; the old PDF readers moved to `tools/uk_extract/held_pdf/`.
The folders here stay as the record of what was published from the PDFs (with full nutrition and allergens): a PDF you save from your own
browser would bring those figures back.

**Subway** is back too (2026-10-11), with full nutrition and no allergens, from its own product pages on www.subway.com
(robots.txt disallows only `/sitecore/` and some delivery-locator paths): `tools/uk_extract/subway_html.py`. The `media.subway.com`
PDF was not used.

## To put one back

Either (a) download the chain's official PDF yourself in your browser from the chain's own page (a person is not what robots.txt is
about), tell me where you saved it, and I rebuild from your copy; or (b) tell me to restore it anyway (`git mv data/held-robots/<chain>
data/source/<chain>`; your accepted risk, as with logos).
Source addresses are in each folder's `chain.csv` and `allergen_guide.csv`.
