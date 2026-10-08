"""Reader for JD Wetherspoon's own allergen and nutrition guide (the page www.jdwetherspoon.com/food-drink/ sends visitors to).

    https://www.jdwetherspoon.com/food-drink/ says "Full allergen/nutritional information can be found on this website, by searching
    for a pub here, on the app and on the customer information screens" and links to https://allergens.jdwetherspoon.com/?pubId=<id>

That page is a small web app (no login, no cookie wall). Opened in a browser it shows "Please choose your menu": Food menu, Vegetarian &
Vegan, Lighter choice and Drinks, each category opens to a list of dishes, and a dish's (i) button opens "Allergens" (the 14, each Yes or
No), "Suitable for" (Vegetarians, Vegans), "Nutritional" (Calories, Carbohydrates, Fat, Saturated Fat, Sugar, Protein, Salt, Fibre) and
"Ingredients". The app fills those lists from JSON that the PAGE ITSELF requests when it loads (the guide's own data feed). This module
only listens to the answers a normal visitor's browser receives while the page loads (no key or token is read, copied or replayed, and
nothing is requested by hand):

    capture(pub_ids, cache_dir)   opens each pub's page once in headless Chromium, waits for it to load, saves the answers it received:
                                  venue-<id>.json (the pub's name), venue-<id>_food.json (the pub's food menu: every dish with its
                                  numbers and allergen marks), food-categories.json, allergens.json (the guide's list of allergens),
                                  and once, after choosing "Drinks" in the menu list, drink-categories.json and drinks.json.
    load(cache_dir)               reads those files back and checks their shape; anything unexpected stops the run.

robots.txt: www.jdwetherspoon.com answers `Crawl-delay: 10` and `Disallow:` (nothing); allergens.jdwetherspoon.com has no robots.txt (every
path answers the app's own page). The delay is honoured: a pub's page is opened at most once every 10 seconds, and only a sample of pubs is
read, never all of them. Needs Node with playwright-core and a Chromium (the same pattern as images_blank_street_coffee.py).

Feed shape (as read on 2026-10-08, data version 184): the food answer is {"success": true, "data": [dish, ...]}; a dish has `id` (global:
the same id has identical content in every pub), `dish_ref`, `name`, `summary` (the line printed under the name), `ingredients`,
`category` / `sub_category` (ids into food-categories.json), `allergens` (ids), `calories`, `fat`, `saturated_fat`, `carbohydrates`, `sugar`,
`fibre`, `protein`, `salt` (whole numbers, per dish as served; the page prints them as "1312kcal", "107g"), `vegetarians`, `vegans`
(booleans: the page's "Suitable for" rows and its V and vegan icons) and *_percent fields the page does not print.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
PAGE = "https://allergens.jdwetherspoon.com/?pubId={pub}"
DELAY_SECONDS = 10  # www.jdwetherspoon.com/robots.txt: Crawl-delay: 10
PLAYWRIGHT = os.environ.get(
    "PLAYWRIGHT_CORE",
    "/tmp/claude-0/-home-user-MenuAi/a431c667-67f2-527e-bd7d-6a276d3d71be/scratchpad/pw/node_modules/playwright-core")
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

CAPTURE_JS = r"""
const fs = require('fs');
const { chromium } = require(process.argv[2]);
const [chrome, ua, outDir, delay, withDrinks, pageTpl, ...pubs] = process.argv.slice(3);
(async () => {
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  let first = true;
  for (const pub of pubs) {
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1000, height: 1400 } });
    const page = await ctx.newPage();
    const pending = [];
    page.on('response', (r) => {
      const m = r.url().match(/\/api\/allergens\/v0\.1\/jdw(?:\/(venues\/\d+\/food|venues\/\d+|food-categories|drink-categories|drinks))?$/);
      if (!m) return;
      const key = m[1] ? m[1].replace(/venues\/\d+\/food/, 'venue-' + pub + '_food').replace(/^venues\/\d+$/, 'venue-' + pub) : 'allergens';
      pending.push(r.text().then((t) => fs.writeFileSync(outDir + '/' + key + '.json', t)));
    });
    await page.goto(pageTpl.replace('{pub}', pub), { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    if (first && withDrinks === '1') {
      await page.getByText('VIEW MENUS').click();
      await page.waitForTimeout(800);
      await page.getByText('FOOD MENU').first().click();
      await page.waitForTimeout(500);
      await page.locator('li, div, a, button, span').filter({ hasText: /^\s*drinks\s*$/i }).last().click();
      await page.waitForTimeout(2500);
    }
    first = false;
    await Promise.all(pending);
    await ctx.close();
    await new Promise((res) => setTimeout(res, Number(delay) * 1000));
  }
  await browser.close();
})().catch((e) => { console.error(String(e)); process.exit(1); });
"""


def capture(pub_ids: list[str], cache: Path, with_drinks: bool = True) -> None:
    """Open each pub's guide page once (DELAY_SECONDS apart) and save the JSON the page loads into `cache`."""
    cache.mkdir(parents=True, exist_ok=True)
    js = cache / "capture.js"
    js.write_text(CAPTURE_JS)
    cmd = ["node", str(js), PLAYWRIGHT, CHROME, UA, str(cache), str(DELAY_SECONDS), "1" if with_drinks else "0", PAGE, *pub_ids]
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60 * 60)
    if r.returncode != 0:
        raise SystemExit("capturing the guide pages failed (a 403, a challenge page or a changed layout are NOT to be worked round: "
                         "stop and ask the founder to save the pages instead):\n" + r.stderr[-800:])
    print(f"captured {len(pub_ids)} pub page(s) in {time.time() - t0:.0f}s into {cache}")


def _json(path: Path, versions: set | None = None) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    if d.get("success") is not True or "data" not in d:
        raise SystemExit(f"{path.name}: not the shape this reader knows ({str(d)[:120]})")
    if versions is not None and isinstance(d.get("meta"), dict) and "version" in d["meta"]:
        versions.add(d["meta"]["version"])
    return d


def load(cache: Path, pub_ids: list[str]) -> dict:
    """{'versions': {feed versions seen}, 'allergens': {id: (name, property)}, 'categories': {id: name}, 'subcategories': {id: name}, 'sort': {...},
        'pubs': {pub: {'name': str, 'dishes': [dish...]}}, 'drinks': [..] or None}"""
    versions: set = set()
    allergens = {a["id"]: (a["name"], a["property"]) for a in _json(cache / "allergens.json", versions)["data"]}
    tree = _json(cache / "food-categories.json", versions)["data"]
    categories = {c["id"]: c["name"] for c in tree}
    subs = {s["id"]: s["name"] for c in tree for s in c["sub_categories"]}
    order = {c["id"]: (c["menu_sort_order"] if c["menu_sort_order"] is not None else 10 ** 6) for c in tree}
    suborder = {s["id"]: (s["menu_sort_order"] if s["menu_sort_order"] is not None else 10 ** 6) for c in tree for s in c["sub_categories"]}
    pubs = {}
    for pub in pub_ids:
        venue = _json(cache / f"venue-{pub}.json", versions)["data"]
        food = _json(cache / f"venue-{pub}_food.json", versions)["data"]
        if isinstance(venue, list) or not isinstance(food, list):
            pubs[pub] = {"name": "", "dishes": []}  # a pub the guide has no menu for (answers an empty list)
            continue
        if str(venue.get("identifier")) != str(pub):
            raise SystemExit(f"venue-{pub}.json is for pub {venue.get('identifier')}")
        pubs[pub] = {"name": venue["name"], "dishes": food}
    drinks = None
    if (cache / "drinks.json").exists():
        drinks = _json(cache / "drinks.json", versions)["data"]
    return {"versions": versions, "allergens": allergens, "categories": categories, "subcategories": subs, "order": order, "suborder": suborder,
            "pubs": pubs, "drinks": drinks}
