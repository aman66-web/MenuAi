#!/usr/bin/env python3
"""Item photos for itsu from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_itsu.py --cache <dir> [--dry-run]

Source: https://www.itsu.com/menu/ (the page the nutrition data came from). Every dish card on it links to the dish's own
page (/menu/<category>/<dish>/), which is also where tools/uk_extract/itsu.py read the dish's name and numbers. Each dish
page shows ONE product photo of that dish: <img src="<photo>" ... class="lazy-image main-image"> inside its
"product-hero" block (the page's other images, such as the small "Dr Emma" GIF button, do not carry that class). The photos
are served from itsu's own asset bucket, itsu-production-assets.s3.eu-west-2.amazonaws.com, the host the site's pages load
them from (there is no copy of them on www.itsu.com). The files are the originals (about 2068 x 2160 px JPEG); store_image
only downsizes to <= 640 px WebP.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the item's own dish page names it
(the page's <h1>, tidied the way itsu.py tidied it: itsu's joining apostrophe in "egg'pot" becomes a space and the one known
typo "Cappucino" is spelt "Cappuccino", exactly as the published names were made), that name equals the published item
name (images_common.norm_name), and the menu card that links to that page carries the same title. A name that two dish
pages share, or a published item that no page (or two pages) names, gets no photo. The photo is the dish page's own main
photo. If that file is a "protein blobby" shot (itsu's product shots with a claim sticker; its "no blobby" versions are
plain) the same dish's menu-card photo is used instead (source page = the menu page that shows it); a file name saying
placeholder/logo/banner/GIF is never used (BADGE, PLACEHOLDER_WORDS). Nothing is matched by slug, file name or similarity.

Terms and robots, first read 2026-10-07, read again 2026-11-17 (unchanged):
- https://www.itsu.com/robots.txt is "User-agent: * / Disallow: / Sitemap: https://www.itsu.com/sitemap_index.xml" (nothing is
  disallowed on www.itsu.com).
- https://www.itsu.com/itsutermsandconditions/ (the only "terms & conditions" page the site links) is the terms of the
  vouchers, gift cards, loyalty and offers; it says nothing about images or reuse of content. The privacy policy, cookie
  policy, e-mail terms and the other terms pages (/cateringterms/, /giftcardterms/, /moneyterms/) have no image clause
  either. The only statement about content is the footer of every page: "Copyright (c) 2026. itsu - All rights reserved."
  Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
- The photo host's robots.txt (https://itsu-production-assets.s3.eu-west-2.amazonaws.com/robots.txt) answers HTTP 403
  AccessDenied: what Amazon S3 says for an object that does not exist in a bucket that cannot be listed, i.e. there is no
  robots.txt there. RFC 9309 reads a 4xx for robots.txt as "no rules", and so does images_common._robots_allow since the
  founder's decision of 2026-10-12 ("Yes, follow the standard"). The photo files themselves answer 200.

Rerun of 2026-11-17 (itsu's menu had changed since October: new dish pages dated 131126, new photo files for many dishes):
- The six sushi boxes left out in October for a baked-in "allergen update" / "tastier recipe" sticker (The Salmon Dragon, The
  Spicy Tuna Dragon, The Super Salmon Light, The California Rolls, The Salmon Full House, The Best of Itsu) now have plain photos
  on their own pages: looked at and kept. The Spicy Tuna Dragon's page moved to /menu/sushi-and-salads/sushi-tuna-dragon-roll-131126/
  (its <h1> and menu card still name "the spicy tuna dragon"); The Best of Itsu's to /menu/sushi-and-salads/the-best-of-itsu-/.
- Every kept photo was looked at on a contact sheet (tools/uk_extract/photo_sheet.py). itsu now lays stickers over many of its
  photos; each such file is left out (DROP_PHOTOS, by file name, so the menu card's photo is used instead when it is a different,
  plain file): a green "v"/"ve" diet badge (34 dishes and packs, incl. The Veggie Selection and Miso Soup's menu-card photo; Salted Caramel
  Protein Balls also a "new" flash), a "choose from 1-4 eggs" sticker
  (the six egg pots), a "tastier recipe" sticker (Korean Spicy Noodles), a "great taste 2026" award badge (King Prawn Gyoza) and a
  "Powered by Perfect Ted matcha" badge, another company's brand (the eight matcha lattes, and Iced Blueberry Matcha Latte's
  menu-card photo). Packs that print nutrition are left
  out too: the prawn cracker crisps and corn cakes print their kcal (the corn cakes also "NEW"), the zen water cans print "zero
  calorie, zero sugar", the chocolate edamame pack a "fibre" claim tick. In October the diet badges were let through; the photo
  rules now leave out every sticker laid over a photo.
- The three bento salads' page and menu-card photos are now both "protein blobby" shots printing "27g of protein" and the like:
  left out (BADGE). Their October photos came from the menu card, which no longer shows them, so they are no longer recorded.
- Spicy Miso Soup's page (/menu/soups/hot-spicy-miso-soup-120925/) now answers 404 and no other page names the dish: no photo.
- Third-party brands' packs are not a photo of itsu's food (THIRD_PARTY_PACK): the can or bottle of Coca-Cola, Diet Coke, Coca-Cola
  Zero Sugar, Asahi, Equinox kombucha, MOJU shots and Dot Dot bubble tea (several print "330ml", "NO CALORIES", "LOW SUGAR" or an
  award badge). In October the Coca-Cola, Asahi, kombucha, MOJU and Dot Dot photos had been kept; they are now left out.

A 401/403/429 or a robots refusal stops the script before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import hashlib
import sys
import time
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "itsu"
BASE = "https://www.itsu.com"
MENU_URL = f"{BASE}/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-itsu")
PHOTO_HOST = "itsu-production-assets.s3.eu-west-2.amazonaws.com"

# itsu.py spells this one itsu typo correctly in the published name (only the name changes).
NAME_FIXES = {"cappucino": "cappuccino"}
# Photo files looked at on 2026-11-17 and left out (a rerun must not bring them back): file name -> why. Keyed by file, so when the
# menu card shows a different file for the same dish that one is tried instead (and must be looked at). October 2026's seven
# sushi-box photos with a baked-in "allergen update" / "tastier recipe" sticker are no longer on itsu's site.
DIET_BADGE = "a green 'v' / 've' diet badge laid over the photo"
DIET_BADGE_PLUS = "a 've' diet badge plus a 'tastier recipe' sticker laid over the photo"
EGG_STICKER = "a 'choose from 1-4 eggs' sticker laid over the photo (some with a 'v' badge too)"
KCAL_PACK = "the pack prints its kcal ('96 kcal', '97 kcal', '84 kcal'); the corn cakes also a 'NEW' flash and a 'v'/'ve' badge"
CLAIM_PACK = "the can prints 'zero calorie, zero sugar'"
FIBRE_PACK = "the pack prints a 'fibre' claim tick"
PERFECT_TED = "a 'Powered by Perfect Ted matcha' badge (another company's brand) laid over the photo"
AWARD = "a 'great taste 2026' award badge laid over the photo"
DIET_BADGE_NEW = "a 've' diet badge and a 'new' flash laid over the photo"
DROP_PHOTOS = {
    "the_veggie_selection_website_product_64706c36c9.jpg": DIET_BADGE,   # the-veggie-selection
    "chocolate_moons_website_product_c228189910.jpg": DIET_BADGE,   # 60-dark-chocolate-moons
    "about_half_a_mango_website_product_908d42bbf2.jpg": DIET_BADGE,   # about-half-a-mango
    "angelic_almonds_website_product_1cf4f5afdb.jpg": DIET_BADGE,   # angelic-almonds
    "seaweed_thins_sea_salt_website_product_01e25fed84.jpg": DIET_BADGE,   # crispy-seaweed-thins-sea-salt
    "seaweed_thins_sweet_soy_and_sea_salt_website_product_fa67c64320.jpg": DIET_BADGE,   # crispy-seaweed-thins-sweet-soy
    "seaweed_thins_wasabi_website_product_5741065c75.jpg": DIET_BADGE,   # crispy-seaweed-thins-wasabi
    "detox_miso_noodle_soup_website_product_1_82481f35aa.jpg": DIET_BADGE,   # detox-miso-noodle-soup
    "edamame_website_product_1_85087e9378.jpg": DIET_BADGE,   # edamame
    "lemon_baked_pistachios_website_product_83b90d8725.jpg": DIET_BADGE,   # lemon-baked-pistachios
    "little_rice_and_greens_website_imagery_0705a6926b.png": DIET_BADGE,   # little-rice-and-greens
    "little_Thai_veggie_balls_rice_bowl_website_imagery_577aea5bda.png": DIET_BADGE,   # little-thai-veggie-balls-curry
    "little_veggie_balls_teriyaki_rice_bowl_website_imagery_deed0b782d.png": DIET_BADGE,   # little-veggie-balls-teriyaki
    "mango_yoghurt_kiosk_hero_3c6ff580f3.png": DIET_BADGE,   # mango-yoghurt-pot
    "miso_soup_website_product_aa1ba679a4.jpg": DIET_BADGE,   # miso-soup
    "pineapple_coconut_twist_website_product_670b48f6e0.jpg": DIET_BADGE,   # pineapple-and-coconut-twist
    "porridge_with_agave_kiosk_hero_8b486c71d0.png": DIET_BADGE,   # porridge-with-agave
    "berry_porridge_kiosk_hero_59a9d0a3a5.png": DIET_BADGE,   # porridge-with-fresh-blueberries
    "berry_seeds_porridge_kiosk_hero_29b805e4c6.png": DIET_BADGE,   # porridge-with-fresh-blueberries-and-superseeds
    "raspberry_yoghurt_kiosk_hero_50c9809970.png": DIET_BADGE,   # raspberry-yoghurt-pot
    "sushi_style_nori_crunch_website_product_0fa4094afd.jpg": DIET_BADGE,   # sushi-style-nori-crunch
    "sweet_chilli_cashews_website_product_a4f1c35836.jpg": DIET_BADGE,   # sweet-chilli-toasted-cashews
    "Thai_udon_noodles_website_product_23d4d7bdde.png": DIET_BADGE,   # thai-noodles
    "Thai_veggie_balls_rice_bowl_website_imagery_7bbe06c5f7.png": DIET_BADGE,   # thai-veggie-balls-curry
    "the_avo_baby_rolls_website_product_1162a4385d.jpg": DIET_BADGE,   # the-avo-baby-rolls
    "the_egg_bun_website_product_a305afdbf2.jpg": DIET_BADGE,   # the-egg-bun
    "umami_roasted_almonds_website_product_ad2c4714bf.jpg": DIET_BADGE,   # umami-roasted-almonds
    "vegetable_fusion_gyoza_8_website_productnoblobby_5954bb45c8.jpg": DIET_BADGE,   # vegetable-fusion-gyoza
    "veggie_meatballs_and_coconut_website_product_13cbe99e31.jpg": DIET_BADGE,   # veggie-balls-and-coconut-soup
    "veggie_balls_teriyaki_rice_bowl_website_imagery_b07b424588.png": DIET_BADGE,   # veggie-balls-teriyaki
    "veggie_gyoza_noodle_bowl_website_product_54b4b16938.png": DIET_BADGE,   # veggie-gyoza-noodle-bowl
    "wild_berry_knot_website_product_d5e98dc24d.jpg": DIET_BADGE,   # wild-berry-knot
    "yuzu_cheesecake_mochi_website_product_0449368d04.jpg": DIET_BADGE,   # yuzu-cheesecake-mochi
    # a 've' diet badge plus a 'tastier recipe' sticker
    "Korean_spicy_noodles_website_product_30f0fb6e31.png": DIET_BADGE_PLUS,   # korean-spicy-noodles
    # a 'choose from 1-4 eggs' sticker (some with a 'v' badge too)
    "sausage_egg_pot_kiosk_hero_f46598bae2.png": EGG_STICKER,   # little-sausages-egg-pot
    "bacon_egg_pot_kiosk_hero_123918321b.png": EGG_STICKER,   # roasted-bacon-egg-pot
    "salmon_and_avo_egg_pot_kiosk_hero_472d38d3b1.png": EGG_STICKER,   # smoked-salmon-and-avo-egg-pot
    "superseeds_egg_pot_kiosk_hero_d9b04777ff.png": EGG_STICKER,   # soy-roasted-seeds-egg-pot
    "spinach_and_avo_egg_pot_kiosk_hero_277e10623a.png": EGG_STICKER,   # spinach-and-avo-egg-pot
    "spinach_and_seeds_kiosk_hero_92e6894933.png": EGG_STICKER,   # spinach-and-seeds-egg-pot
    # the pack prints its kcal ('96 kcal', '97 kcal', '84 kcal'...); the corn cakes also a 'NEW' flash and a 'v'/'ve' badge
    "prawn_crackers_chinese_website_product_8a2c2f0c4a.jpg": KCAL_PACK,   # chinese-prawn-crackers
    "prawn_crackers_Japanese_website_product_fd6c0da60b.jpg": KCAL_PACK,   # japanese-prawn-crackers
    "prawn_crackers_original_website_product_0561665b9e.jpg": KCAL_PACK,   # original-prawn-crackers
    "prawn_crackers_Thai_website_product_38b5ef6dd0.jpg": KCAL_PACK,   # thai-prawn-crackers
    "dark_chocolate_corn_cakes_website_product_e1617cff5d.jpg": KCAL_PACK,   # dark-chocolate-corn-cakes
    "milk_chocolate_corn_cakes_website_product_ad8def9ef2.jpg": KCAL_PACK,   # milk-chocolate-corn-cakes
    "salted_caramel_corn_cakes_website_product_caa18ead12.jpg": KCAL_PACK,   # salted-caramel-corn-cakes
    # the can prints 'zero calorie, zero sugar'
    "cucumber_mint_zen_water_website_product_63356d05e1.jpg": CLAIM_PACK,   # cucumber-and-mint-zen-water-can
    "ginger_lime_zen_water_website_product_cce1659de3.jpg": CLAIM_PACK,   # ginger-and-lime-zen-water-can
    "lemon_yuzu_zen_water_zen_water_website_product_11c98dcb40.jpg": CLAIM_PACK,   # lemon-and-yuzu-zen-water-can
    "peach_lychee_zen_water_website_product_2539438003.jpg": CLAIM_PACK,   # peach-and-lychee-zen-water-can
    "raspberry_dragon_fruit_zen_water_website_product_05ea841f44.jpg": CLAIM_PACK,   # raspberry-and-dragon-fruit-zen-water-can
    # the pack prints a 'fibre' claim tick
    "chocolate_edamame_website_product_2572069a2b.jpg": FIBRE_PACK,   # chocolate-edamame
    # a 'Powered by Perfect Ted matcha' badge (another company's brand) laid over the photo
    "matcha_latte_blueberry_kiosk_hero_a999d60907.png": PERFECT_TED,   # blueberry-matcha-latte
    "iced_matcha_blueberry_latte_kiosk_hero_8aded20bc5.png": PERFECT_TED,   # iced-blueberry-matcha-latte
    "iced_matcha_latte_kiosk_hero_f2909875dd.png": PERFECT_TED,   # iced-matcha-latte
    "iced_matcha_saltedcaramel_latte_kiosk_hero_5541afafa5.png": PERFECT_TED,   # iced-salted-caramel-matcha-latte
    "iced_matcha_vanilla_latte_kiosk_hero_5eb5b51eb7.png": PERFECT_TED,   # iced-vanilla-matcha-latte
    "matcha_latte_kiosk_hero_f7f4788fc8.png": PERFECT_TED,   # matcha-latte
    "matcha_latte_saltedcaramel_kiosk_hero_123274a99c.png": PERFECT_TED,   # salted-caramel-matcha-latte
    "matcha_latte_vanilla_kiosk_hero_9ed3a0d1f0.png": PERFECT_TED,   # vanilla-matcha-latte
    # a 'great taste 2026' award badge laid over the photo
    "prawn_gyoza_8_website_product_08f017a4fd.jpg": AWARD,   # king-prawn-gyoza
    # a 've' diet badge and a 'new' flash
    "salted_caramal_protein_balls_website_product_c924ca45d2.jpg": DIET_BADGE_NEW,   # salted-caramel-protein-balls
    # menu-card photos tried after the dish page's own file was left out: the same stickers again
    "miso_soup_website_product_4f3c36ac92.jpg": DIET_BADGE,   # miso-soup (menu card)
    "iced_matcha_blueberry_latte_kiosk_hero_4f693ba235.png": PERFECT_TED,   # iced-blueberry-matcha-latte (menu card)
}
# Items whose photo is a third-party brand's own can or bottle rather than itsu's food (like a Pepsi can elsewhere): no photo.
THIRD_PARTY_PACK = {"coca-cola", "coca-cola-zero-sugar", "diet-coke", "asahi", "fiery-ginger-kombucha", "raspberry-and-elderflower-kombucha",
                    "ginger-shot", "hot-mango-shot", "lemon-bubble-tea", "lychee-rose-bubble-tea", "mango-passionfruit-bubble-tea"}
# File-name words that mean "not a photo of this dish" (logo, placeholder, banner...).
PLACEHOLDER_WORDS = re.compile(r"placeholder|coming[-_ ]?soon|default|no[-_ ]?image|logo|banner|dr[-_ ]?emma|\.gif", re.I)
# itsu's "blobby" product shots carry a sticker (e.g. "27g of protein", "choose from 1-4 eggs"): not used. Its "no blobby" files can
# still carry a diet badge, so they are looked at like any other photo (DROP_PHOTOS).
BADGE = re.compile(r"(?<!no)(?<!no_)(?<!no-)(?<!no )blobby", re.I)

CARD = re.compile(r'<a href="(?P<path>/menu/[^"]*)" class="base-lined-card product-listing-card"[^>]*>(?P<body>.*?)</a>', re.S)
CARD_IMG = re.compile(r'<img\b[^>]*?\bsrc="(?P<src>https://[^"]+)"', re.S)
CARD_TITLE = re.compile(r'<strong class="title"[^>]*>(?P<t>.*?)</strong>', re.S)
H1 = re.compile(r'<h1\b[^>]*class="[^"]*\bsecondary-name\b[^"]*"[^>]*>(?P<t>.*?)</h1>', re.S)
MAIN_IMG = re.compile(r'<img\b[^>]*\bclass="[^"]*\bmain-image\b[^"]*"[^>]*>', re.S)
SRC = re.compile(r'\bsrc="(https://[^"]+)"')


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def get_page(url: str, cache: Path, must: str, tries: int = 3) -> str:
    """One polite page fetch. itsu sometimes serves an error page (itsu.py saw 200/500 error pages): a page that lacks `must`
    is dropped from the cache and fetched again after a pause (each try is still one request, one second apart at least)."""
    page = ""
    for n in range(tries):
        try:
            page = ic.polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code < 500 or n == tries - 1:
                raise
        else:
            if must in page:
                return page
            (cache / hashlib.sha1(url.encode()).hexdigest()).unlink(missing_ok=True)
        time.sleep(3 * (n + 1))
    return page


def tidy(raw: str) -> str:
    """The page's name as itsu.py tidied it for the published item: the joining apostrophe becomes a space."""
    return re.sub(r"(?<=[A-Za-z])['’](?=[a-z])", " ", text(raw))


def key_of(raw: str) -> str:
    k = ic.norm_name(tidy(raw))
    return NAME_FIXES.get(k, k)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch pages only, print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    pages: dict[str, dict] = {}   # dish path -> {key, page_photo, card_photo, page_url}
    try:
        menu = get_page(MENU_URL, args.cache, "product-listing-card")
        cards: dict[str, tuple[str | None, str]] = {}   # dish path -> (photo the menu card shows, the card's title)
        for m in CARD.finditer(menu):
            img, title = CARD_IMG.search(m.group("body")), CARD_TITLE.search(m.group("body"))
            if m.group("path") in cards:
                skipped.append(f"{m.group('path')}: listed twice on the menu page")
            cards[m.group("path")] = (html.unescape(img.group("src")) if img else None, title.group("t") if title else "")
        print(f"{len(cards)} dish cards on {MENU_URL}")

        for path, (card_photo, card_title) in cards.items():
            page_url = BASE + path
            try:
                page = get_page(page_url, args.cache, "secondary-name")
            except urllib.error.HTTPError as e:   # itsu's page for one dish answers HTTP 500 (see itsu.py UNREADABLE)
                skipped.append(f"{path}: page returned HTTP {e.code}")
                continue
            h1, tags = H1.findall(page), MAIN_IMG.findall(page)
            if len(h1) != 1 or len(tags) > 1:
                skipped.append(f"{path}: {len(h1)} titles and {len(tags)} main photos on the page")
                continue
            key = key_of(h1[0])
            if key_of(card_title) != key:
                skipped.append(f"{path}: menu card is titled {tidy(card_title)!r} but the page {tidy(h1[0])!r}")
                continue
            src = SRC.search(tags[0]) if tags else None
            pages[path] = {"key": key, "page_photo": html.unescape(src.group(1)) if src else None,
                           "card_photo": card_photo, "page_url": page_url}
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    by_page_key: dict[str, list[str]] = {}
    for path, pg in pages.items():
        by_page_key.setdefault(pg["key"], []).append(path)

    found: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, item name)
    for k, its in sorted(by_key.items()):
        if len(its) != 1:
            skipped.append(f"{k}: {len(its)} published items share this name")
            continue
        item = its[0]
        if item["id"] in THIRD_PARTY_PACK:
            skipped.append(f"{item['id']}: its photo is a third-party brand's can or bottle, not itsu's food")
            continue
        paths = by_page_key.get(k, [])
        if len(paths) != 1:
            skipped.append(f"{item['id']}: {len(paths)} dish pages named {item['name']!r}")
            continue
        pg = pages[paths[0]]
        # The dish page's own photo first; the menu card's photo (same dish, linked to that page) only when the page's is
        # missing or unusable. The card photo's source page is the menu page that shows it.
        candidates = [(pg["page_photo"], pg["page_url"]), (pg["card_photo"], MENU_URL)]
        usable, why = None, []
        for photo, src_url in candidates:
            if not photo:
                continue
            fname = urllib.parse.unquote(photo.rsplit("/", 1)[-1])
            if PLACEHOLDER_WORDS.search(fname) or BADGE.search(fname):
                why.append(f"{fname} is a placeholder, logo or claim-sticker shot")
            elif fname in DROP_PHOTOS:
                why.append(f"{fname} left out after looking: {DROP_PHOTOS[fname]}")
            elif usable is None:
                usable = (photo, src_url, item["name"])
        if usable is None:
            skipped.append(f"{item['id']}: no usable photo ({'; '.join(why) or 'none on its page or card'})")
            continue
        found[item["id"]] = usable

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (photo, page_url, name) in sorted(found.items()):
            if args.dry_run:
                print(f"  {item_id:46} {name:42} {photo}  <- {page_url}")
                continue
            raw = ic.polite_get(photo, args.cache, referer=page_url)
            try:
                rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(found)} of {len(items)} published items matched")
        shared: dict[str, list[str]] = {}
        for item_id, (photo, _, _) in found.items():
            shared.setdefault(photo, []).append(item_id)
        for photo, ids in sorted(shared.items()):
            if len(ids) > 1:
                print(f"  SHARED PHOTO ({len(ids)} items): {photo}: {', '.join(sorted(ids))}")
        return 0
    if rows:
        ic.write_images_csv(CHAIN, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
