# Held back: source file's host disallows automated downloads (robots.txt)

On 2026-10-08 a check of every chain's source address against its host's robots.txt, using a matcher that understands the `*` and `$`
wildcards (Python's urllib.robotparser does not, which is how these slipped through), found six chains whose official PDF was
downloaded by script from a host that disallows it:

| Chain | Host and rule |
|---|---|
| Zizzi, ASK Italian, Coco di Mama, Ole & Steen | `cdn.sanity.io`: `Disallow: /*.pdf` (only `/files/cgnmnbqj/` is allowed) |
| Pizza Express | `content-cdn.pizzaexpress.com`: `Disallow: /*.pdf` (only `/files/cgnmnbqj/` is allowed) |
| Subway | `media.subway.com`: `Disallow: /` |

The standing rule (docs/UK_DATA_PLAYBOOK.md): a robots.txt Disallow stops us and we never work round it. So these chains are not in the
app (`tools/build_menus.py` reads only `data/source/`). Nothing was changed or deleted: each folder here is exactly what was published.

## To put one back

Either (a) download the chain's official PDF yourself in your browser from the chain's own page (a person is not what robots.txt is
about), tell me where you saved it, and I rebuild from your copy; or (b) tell me to restore it anyway (`git mv data/held-robots/<chain>
data/source/<chain>`; your accepted risk, as with logos).
Source addresses are in each folder's `chain.csv` and `allergen_guide.csv`.
