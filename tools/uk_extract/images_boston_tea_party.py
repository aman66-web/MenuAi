#!/usr/bin/env python3
"""Item photos for Boston Tea Party from its own online-ordering menu (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_boston_tea_party.py --dump <dump-dir> --harvest [--cache DIR] [--dry-run]   # reads the menu, then matches
    python3 tools/uk_extract/images_boston_tea_party.py --dump <dump-dir> [--cache DIR] [--dry-run]             # matches an existing dump

(--harvest reads the ordering menu in a headless browser with the DUMP_JS below: Node + web/e2e/node_modules/playwright-core and Playwright's
own installed headless browser, or the one named by $PW_CHROME. It replaces the older tools/uk_extract/images_boston_tea_party_dump.js, which
still clicks the cafe button's old label "View Menu" and a Linux-only browser path; the dump format is the same, so either dump works here.)

Source: https://bostonteaparty.vmos.io/ (the chain's own "Click & collect" ordering site, linked as "Click & Collect" from
https://bostonteaparty.co.uk/how-to-order/ and as "Order" from the site's header; the platform is Vita Mojo, white-labelled with the chain's
name). The nutrition data came from the chain's menu PDFs (bostonteaparty.co.uk/media/...), which carry no photos; the chain's own website
(bostonteaparty.co.uk/our-menus/) has no per-item pages, only those PDFs and photos of its cafes (its home page's few food pictures are
lifestyle shots described in sentences, e.g. "Our signature Sausage breakfast muffin. Sausage patty, ...", not menu records naming a dish:
not used). The ordering app only answers inside a browser session, so the harvest reads each menu category page for chosen cafes and saves
the JSON the page itself loads (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles): every dish ("bundle") has a uuid and a
name, and the page's photo of that dish is https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid
(the page's own <img> tags use exactly these ids behind a Cloudflare resize-and-crop wrapper; the harvest saves the <img> list of every
category page as imgs<cafe>_<category>.json.txt so the tie can be checked: on 2026-11-17 every dish uuid on the menu had its own <img>; we
fetch the ORIGINAL image, never the cropped wrapper, and store_image only downsizes it to <= 640 px WebP).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when
  1. a dish on the ordering menu has the same name as the item (images_common.norm_name equality), the dish's uuid is the
     same in every cafe/category where the name appears, and no other dish carries that name;
  2. the item's name is unique among the published items;
  3. the photo is the one the page ties to that dish's uuid (entityUUID = dish uuid).
Variants of a dish ("Bacon Cheeseburger without bacon", "(kids)" portions, add-ons, drinks sizes) have no photo of their own
on the site and get none. The ordering menu names a dish differently from the printed menu in many places ("The Veggie
with Halloumi" vs "Add halloumi (to The Veggie)", "Scrambled Eggs" vs "Scrambled Egg", "The Green One" vs "The Green One Smoothie",
"Kids OJ" vs "OJ (kids)", "Sausage Muffin" vs "Sausage Breakfast Muffin"): no photo, we never match by similarity or reorder words.
"Iced Latte" is two different dishes on the ordering menu (one under "Cold Brew", one under "Iced Coffee & Tea") with two different
photos, so it gets none.

Run of 2026-11-17 (menu re-extracted the same day from the November 2026 PDFs): the cafe list's button now reads "Order" (was "View Menu");
the "Click & Collect" menu (uuid below) is the only menu offered; read at 5 cafes (Kingsmead Square and Alfred Street, Bath; Park Street,
Bristol; Cheltenham; Stratford): 159 distinct dishes in all, the Bristol, Cheltenham and Stratford menus add only three cakes over the two
Bath cafes, so the default harvest reads the two Bath cafes (Alfred Street is the one that lists the burgers). "Eat In" lists no cafe for
online ordering. The menu has no Eggs Benedict/Royale, Smoked Salmon Hash, Shakshuka, Mexican Eggs, Buddha Bowl, kids' meals under our names,
toasties under our names or the Christmas Cream Tea: those items keep no photo. 47 exact matches, 42 kept after looking (below), then 41 after an independent check left out Piccolo (SKIP_PHOTOS); Lotus Biscoff
Shake left the menu and the data; The Festive Full Monty, Bacon, Brie & Cranberry Toastie, Christmas Trifle Iced Matcha and Tiramisu Shake are new.

Terms and robots (re-read 2026-11-17):
  * https://bostonteaparty.co.uk/terms-and-conditions/ ("BTP Rewards Terms and Conditions", "Last updated: 08/06/26") covers the Rewards
    programme, reward vouchers and booking deposits: no clause about images, photography, copyright or reuse of the site's content (searched
    for copyright, intellectual, image, photo, reproduce, trade mark, licence, content, scrape, robot); the pages carry no copyright line.
    The site's only other legal page is the privacy policy. The ordering site links no terms of its own. None found.
  * robots.txt of bostonteaparty.co.uk: "User-agent: *" disallows only /App_Data, /App_Plugins, /umbraco, /uSync.
    bostonteaparty.vmos.io/robots.txt and media-multitenant.vmos-static.com/robots.txt: "User-agent: *  Disallow:" (nothing).
    vmos2.vmos.io/robots.txt answers a redirect to the app's HTML (no rules); multitenant.vmos-static.com (the resize wrapper) is not used.
    The ordering site loads a Cloudflare passive bot-detection script but let a normal headless browser read it without any challenge.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

Left out after looking (2026-10-08, again 2026-11-17): the ordering site uses ONE photo (a latte-art coffee in a teal cup, sha256 17a4f55ed652...)
for Espresso, Cappuccino, Mocha and Macchiato: it cannot show each of them, and for an espresso it is plainly not the drink, so none gets it
(SKIP_UUIDS and SKIP_PHOTOS). (Flat White/Latte and Matcha Latte/Vanilla Matcha Latte also share a photo each; those pairs are variants of the
same drink and the photo shows that drink, so they keep it.) Also left out on 2026-11-17 (kept on 2026-10-08): the five canned soft drinks,
Coca-Cola, Diet Coke, Coke Zero, Belvoir Farm Sparkling Elderflower and Counter Culture Kombucha Soda, whose photos are a third-party brand's
can (its logo and pack), not food or a drink in a glass (playbook: no third-party brand's pack or logo). The coffees' "Be an everyday HERO"
print is the chain's own reusable cup (its cups campaign), not a sticker or offer about the drink: kept.

A 401/403/429, a challenge page or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "boston-tea-party"
APP = "https://bostonteaparty.vmos.io"
MENU_UUID = "dc763602-0c74-43ab-934e-bcb5d67eb9ae"   # "Click & Collect" menu
STORES = {"0": "0ee3a901-b800-410f-8474-f83c51eeaf4d",   # Kingsmead Square, Bath
          "1": "49bd9746-0e9c-40a1-ab7d-731db455154b",   # Alfred Street, Bath
          "2": "b5c6de61-054b-4571-84b2-670e529d621d",   # Park Street, Bristol
          "6": "16b40648-9c75-4356-923a-f08431bae2d9",   # Cheltenham
          "12": "11427bca-8ce9-4bc3-bb31-7926f6fdfaa7"}  # Stratford
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
DEFAULT_CACHE = Path("/tmp/menumacros-images-boston-tea-party")
PLAYWRIGHT = ic.ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
# Dish uuids looked at by eye and left out (see the docstring): the shared latte-art photo on Espresso, Cappuccino, Mocha (and Macchiato,
# which we don't publish), and the canned soft drinks. SKIP_PHOTOS catches the same pictures if the site gives a dish a new uuid.
SKIP_UUIDS: set[str] = {
    "ca4fbe2e-75fe-4157-abbb-980cbe125745",  # Espresso
    "101834a2-6b6f-48bc-bfd6-1c19c35aa285",  # Cappuccino
    "028625ba-bab6-4bd7-b6cb-cfb84ab4627c",  # Mocha
    # a third-party brand's can, not the drink (2026-11-17)
    "9d3c5ea4-0b09-4772-bf2d-7c64ed70fe53",  # Coca Cola
    "c3b5dd90-8fa7-4743-8973-fa60ebf1339c",  # Diet Coke
    "81952403-b090-474b-84f5-1f4bdfa9bcc8",  # Coke Zero
    "f1cd75dc-646c-40d6-95c2-ae161c9217a8",  # Belvoir Farm Sparkling Elderflower
    "88bea5cf-6ecc-4236-8659-93d36534ca57",  # Counter Culture Kombucha Soda
}
SKIP_PHOTOS: set[str] = {  # sha256[:12] of the source bytes (= the stored file name without .webp): the same pictures if a uuid changes
    "17a4f55ed652",                                                                   # shared latte-art cup
    "de4ab5c67141", "93dc0f73dceb", "bb1c56b82868", "1d6b37047e85", "84dacc4c40c1",   # the five cans above
    "165519728903",  # Piccolo (2026-11-17 check): a lifestyle shot of a full-size reusable cup with a third-party "ecoffee cup" logo, not a piccolo
}

# Reads the ordering menu as a visitor would: the cafe list for a Bath postcode, "Order" on the chosen cafe, then every category page of its
# menu, 2 s apart. Saves the JSON each page loads and the page's <img> list. Stops on 401/403/429 from the platform or a challenge page.
DUMP_JS = r"""
const { chromium } = require(process.argv[3]);
const fs = require('fs');
const OUT = process.argv[2];
const STORES = process.argv.slice(4).map(Number);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const launch = { headless: true };
  if (process.env.PW_CHROME) launch.executablePath = process.env.PW_CHROME;
  const b = await chromium.launch(launch);
  try {
    for (const si of STORES) {
      const ctx = await b.newContext({ userAgent: UA, viewport: { width: 1200, height: 1400 }, locale: 'en-GB' });
      await ctx.route(/googletagmanager|google-analytics|doubleclick|facebook|hotjar|clarity|bugsnag|tiktok/i, (r) => r.abort());
      const p = await ctx.newPage();
      const bad = [];
      p.on('response', async (r) => {
        const u = r.url();
        if ([401, 403, 429].includes(r.status()) && /vmos/.test(u)) bad.push(`${r.status()} ${u}`);
        const m = u.match(/vmos2\.vmos\.io\/catalog\/categories\/([0-9a-f-]{36})\/bundles/);
        if (m && r.status() === 200) { try { fs.writeFileSync(`${OUT}/store${si}_${m[1]}.json`, await r.text()); } catch (e) {} }
        if (/vmos2\.vmos\.io\/catalog\/v2\/menu$/.test(u) && r.status() === 200) { try { fs.writeFileSync(`${OUT}/menu${si}.json.txt`, await r.text()); } catch (e) {} }
      });
      const check = async (where) => {
        const head = (await p.evaluate(() => (document.body ? document.body.innerText : ''))).slice(0, 400);
        if (/just a moment|verify you are human|attention required|access denied/i.test(head)) throw new Error(`challenge page at ${where}: stop`);
        if (bad.length) throw new Error(`refused: ${bad.join(' | ')}: stop`);
      };
      await p.goto('https://bostonteaparty.vmos.io/store/store-selection?app=online', { waitUntil: 'networkidle', timeout: 60000 });
      await check('store-selection');
      await p.fill('input', 'BA1 1SR'); await sleep(2000);
      await p.click('text=BA1 1SR, Bath'); await sleep(3500);
      fs.writeFileSync(`${OUT}/stores_page${si}.txt`, await p.evaluate(() => document.body.innerText));
      await p.getByText('Order', { exact: true }).nth(si).click();
      await p.waitForSelector('a[href*="/menu/category/"]', { timeout: 40000 }).catch(() => {});
      await sleep(2500);
      await check('menu overview');
      const uniq = [...new Set(await p.evaluate(() => [...document.querySelectorAll('a[href*="/menu/category/"]')].map((a) => a.href)))];
      console.log(`store ${si}: ${uniq.length} categories (${p.url()})`);
      for (const h of uniq) {
        await sleep(2000);
        await p.goto(h, { waitUntil: 'networkidle', timeout: 60000 });
        await sleep(3000);
        await check(h);
        const cat = h.split('/menu/category/')[1].slice(0, 36);
        const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map((i) => [i.currentSrc || i.src, i.alt]));
        fs.writeFileSync(`${OUT}/imgs${si}_${cat}.json.txt`, JSON.stringify(imgs));
        console.log('  ', cat, fs.existsSync(`${OUT}/store${si}_${cat}.json`) ? 'saved' : 'NO DATA');
      }
      await ctx.close();
    }
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
"""


def harvest(dump: Path, stores: list[str]) -> None:
    for u in (f"{APP}/store/store-selection?app=online", f"{APP}/store/x/menu/category/c/bundles?menuUUID={MENU_UUID}",
              "https://vmos2.vmos.io/catalog/categories/c/bundles", "https://vmos2.vmos.io/catalog/v2/menu", MEDIA.format(uuid="x")):
        if not ic._robots_allow(u):
            raise Blocked(f"robots.txt disallows {u}")
    with tempfile.TemporaryDirectory() as tmp:   # the script is kept apart from the downloaded data
        js = Path(tmp) / "dump.js"
        js.write_text(DUMP_JS)
        r = subprocess.run(["node", str(js), str(dump), str(PLAYWRIGHT), *stores], capture_output=True, text=True, timeout=3600,
                           env=os.environ.copy())
    print(r.stdout[-3000:])
    if r.returncode != 0:
        raise Blocked("reading the ordering menu failed (a refusal, challenge page or changed page is never worked round):\n" + r.stderr[-1500:])


def walk_bundles(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        yield from walk_bundles(sub)


def read_dump(dump: Path) -> dict[str, list[dict]]:
    """norm_name(dish name) -> [{uuid, name, store, category}] over every saved category page."""
    dishes: dict[str, list[dict]] = {}
    for f in sorted(dump.glob("store*_*.json")):
        store, cat = f.stem.split("_", 1)
        payload = json.loads(f.read_text(encoding="utf-8"))["payload"]
        for b in walk_bundles(payload):
            dishes.setdefault(norm_name(b["name"]), []).append(
                {"uuid": b["uuid"], "name": b["name"], "store": store.removeprefix("store"), "category": cat})
    return dishes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", type=Path, required=True, help="folder of saved menu pages (written by --harvest)")
    ap.add_argument("--harvest", action="store_true", help="read the ordering menu into --dump first (headless browser)")
    ap.add_argument("--stores", default="0,1", help="cafe positions in the list for BA1 1SR to read with --harvest (keys of STORES)")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    try:
        if args.harvest:
            harvest(args.dump, [s.strip() for s in args.stores.split(",") if s.strip()])
    except Blocked as e:
        print(f"BLOCKED: {e}")
        return 1
    items = load_items(CHAIN_ID)
    count: dict[str, int] = {}
    for it in items:
        count[norm_name(it["name"])] = count.get(norm_name(it["name"]), 0) + 1
    dishes = read_dump(args.dump)
    if not dishes:
        print("no saved menu pages in --dump: run with --harvest")
        return 1
    print(f"{sum(len(v) for v in dishes.values())} dish entries, {len(dishes)} distinct names on the ordering menu")
    rows: dict[str, tuple[str, str]] = {}
    try:
        for it in items:
            key = norm_name(it["name"])
            hits = dishes.get(key)
            if not hits or count[key] != 1:
                continue
            uuids = {h["uuid"] for h in hits}
            if len(uuids) != 1:
                print(f"  skip {it['name']!r}: {len(uuids)} different dishes carry that name")
                continue
            uuid = next(iter(uuids))
            if uuid in SKIP_UUIDS:
                print(f"  skip {it['name']!r}: photo {uuid} left out after looking (see SKIP_UUIDS)")
                continue
            h = hits[0]
            if h["store"] not in STORES:
                print(f"  skip {it['name']!r}: cafe {h['store']} has no known store id")
                continue
            page = f"{APP}/store/{STORES[h['store']]}/menu/category/{h['category']}/bundles?menuUUID={MENU_UUID}"
            print(f"  MATCH {it['id']}: {it['name']!r} = dish {h['name']!r} ({uuid})")
            if args.dry_run:
                continue
            raw = polite_get(MEDIA.format(uuid=uuid), args.cache)
            if hashlib.sha256(raw).hexdigest()[:12] in SKIP_PHOTOS:
                print(f"    left out: the shared photo {hashlib.sha256(raw).hexdigest()[:12]} is not this dish")
                continue
            try:
                rows[it["id"]] = (store_image(CHAIN_ID, raw), page)
            except ValueError as e:
                print(f"    not stored: {e}")
    except Blocked as e:
        print(f"BLOCKED: {e}")
        return 1
    print(f"{len(rows)} of {len(items)} published items have a photo")
    if args.dry_run:
        return 0
    write_images_csv(CHAIN_ID, rows)
    for f, ids in suspected_placeholders(rows).items():
        print(f"  shared photo {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
