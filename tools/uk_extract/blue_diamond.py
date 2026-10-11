#!/usr/bin/env python3
"""Build data/source/blue-diamond/ from Blue Diamond Garden Centres' own calorie-counted restaurant menus (a CALORIES-ONLY chain).

    python3 -I tools/uk_extract/blue_diamond.py --cache DIR --checked-on 2026-10-11 [--fetch] [--sheets DIR] [--out DIR]

Source: "Our Calorie-Counted Menus" on the chain's own site, https://www.bluediamond.gg/our-restaurant-menus-calorie-counts ("To help
you make informed choices when dining with us, we have produced these calorie-counted online menus ... Please note: Menus and prices may
vary by location"), with five pages: breakfast, lunch-menu, sunday-lunch-menu, drinks and patisserie-menu. Blue Diamond runs about 45
garden centres in England and Wales (the /our-locations/ pages in its sitemap), most with a Blue Diamond restaurant. robots.txt of
www.bluediamond.gg disallows only newsletter folders. --fetch saves the five pages and every dish card image they show (one request
per second, a normal browser User-Agent; any 401/403/429 stops the run).

EACH DISH IS A PICTURE: a 640 x 720 card per dish (file name like classic-fish-chips-3333x3750-....jpg) with the dish's name printed
across the top and its calories in a circle ("1373 kcal"); the page has no text for it (alt=""). So the numbers can only be read from the
pictures: every card is read by OCR (tesseract) twice, at the served size and at twice the size, and the two reads must give the same name
and the same calorie figures; the name must also agree with the words of the card's own file name. Every card was then looked at by eye
on contact sheets (--sheets) and compared with what this script read (data/audit/verified/blue-diamond.json). A card the two OCR passes
disagree on, or whose name doesn't match its file name, stops the run unless it is in CONFIRMED (read by eye, keyed by the image's
SHA-256, so a changed picture stops the run again). Cards with more than one figure, or none, are listed and left out unless CONFIRMED
says what each figure is. Nothing is estimated; protein, carbs and fat are not published (calories only).

Left out on purpose: every alcoholic drink (founder, 11 Oct 2026; the drinks menu is hot drinks, soft drinks and milkshakes, checked by
name), and cards that are not a dish (logos, banners).

Independent check: data/audit/verified/blue-diamond.json.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import blue_diamond_cards as bc  # noqa: E402
import images_common as ic  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "blue-diamond"
BASE = "https://www.bluediamond.gg/our-restaurant-menus-calorie-counts"
PAGES = ["breakfast", "lunch-menu", "sunday-lunch-menu", "drinks", "patisserie-menu"]
PAGE_LABEL = {"breakfast": "Breakfast menu", "lunch-menu": "Lunch menu", "sunday-lunch-menu": "Sunday lunch menu", "drinks": "Drinks menu",
              "patisserie-menu": "Patisserie menu"}
UA = ic.UA
DELAY = 1.1
FILES = "https://www.bluediamond.gg/files/files/"
IMG = re.compile(r'<img alt="[^"]*"(?: height="\d+")? src="(' + re.escape(FILES) + r'[^"]+\.(?:jpg|jpeg|png|webp))"', re.I)
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
NOT_DISH = re.compile(r"logo|banner|diddly-squad|header", re.I)
KCAL = re.compile(r"(\d[\d,]*)\s*kcal", re.I)
ALCOHOL = re.compile(r"\b(prosecco|wine|beer|lager|cider|gin|vodka|rum|whisk(?:e)?y|spritz|cocktail|baileys|pimm'?s|fizz|champagne)\b", re.I)
ALCOHOL_FREE = re.compile(r"\b0(?:\.0)?\s?%|alcohol[- ]free|non[- ]alcoholic|mocktail", re.I)
# Cards read by eye where OCR could not be trusted on its own: image sha256 -> (name as printed, [(label, kcal as printed), ...]).
CONFIRMED: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "407bcb84d050ad5f4a099d9723cda1e9605240ee9d8ff9200643318c506deb84": ('Child’s Breakfast', [('', '583')]),  # card 003 child-s-breakfast-3333x3750-6914b14e98f6c.jpg
    "fc61f4ab56136d706e093fea50dc498c8dfc662e46598160f8c6848d2310fbdc": ('Fried Eggs on Toast', [('', '423')]),  # card 004 fried-eggs-on-toast-3333x3750-6967c58eb9568.jpg
    "a7c936d58649a2611ec9c118e999c169e8821077b3849ab89c92d1e4a7e1e370": ('Toast and Preserve', [('', '462')]),  # card 007 toast-and-preserve-1-3333x3750-69c1625dd5cb3.jpg
    "bbb3bcb83424e1588952c97678b351668127eb2c43301d9681d4c48695e6e34a": ('Eggs Royale', [('', '682')]),  # card 008 eggs-royale-3333x3750-6914b1e2115bb.jpg
    "4487ce42e68a114427c92d3babbf61e5b7daa83bf6636cd343937454252cb650": ('Eggs Benedict', [('', '641')]),  # card 009 eggs-benedict-3333x3750-6914b21bb4f51.jpg
    "5b101951a09946c224c3e8cba9940c5433bcd1dee0cdac31100b51a82936d593": ('Eggs Cypriot', [('', '1042')]),  # card 010 eggs-cypriot-3333x3750-6915b853981ff.jpg
    "0a301c7b3ca1a40558b5992514f824616b06ad91b44ce999c982674fb6059581": ('American Style Pancake Stack', [('', '746')]),  # card 013 american-style-pancake-stack-3333x3750-6914b2e20
    "844fbebf293a2f5bfca38c0427b52879ab555234588a47f2fb5a9996166baaea": ('American Style Pancake Stack (V)', [('', '569')]),  # card 014 american-style-pancake-stack-v-3333x3750-6925b74
    "362d23c6a7e4e918e084f805ab14eea5526ccfb4656cbae1ce9942466f566b70": ('Bacon', [('', '258')]),  # card 016 bacon-side-3333x3750-69c160a55aca8.jpg
    "6f652b39ed9d83e98be46fb9ca9dcf3f7aa87d0ad25fcb5952f7e140d9af72b1": ('Halloumi', [('', '240')]),  # card 018 halloumi-extra-3333x3750-696dfbc0859b5.jpg
    "3d4938a80f7c623d81a24e20dd8530408ea53e1142293156d39c501a1c71d1be": ('Tomato', [('', '51')]),  # card 024 tomato-side-3333x3750-69c16181f321e.jpg
    "47b895ff9304b0bf20cf580f8e15fc5d591de819a87e234782c6892778af84bf": ('Fried Eggs', [('', '185')]),  # card 030 fried-eggs-extra-3333x3750-6968e5f821c53.jpg
    "91d92b8bb005301c7a7320c980827fba6414d1560ee03d6c22a82d1e1a9e48fe": ('Steak & Ale Pie', [('', '1111')]),  # card 043 steak-ale-pie-3333x3750-6925beb4c246d.jpg
    "1bd24025ee10b4fc4ed64b8aae8b2131d3db0abe58802884ab49500a715597a1": ('Gourmet Chips', [('', '492')]),  # card 058 gourmet-chips-3333x3750-6973ac3914d2d.jpg
    "ec7a1942ebfd520c5a0ca0cf8ce7fe67942e779de6805c0547bc51344aed0261": ('Homemade Beef Chilli Con Carne', [('', '1098')]),  # card 062 homemade-beef-chilli-con-carne-3333x3750-69788ea
    "bc0e5153cb76f3e6ce251391d86c3bc1ae55231e9827187baa755dc2bc476dbe": ('Prawn Marie Rose', [('', '671')]),  # card 064 prawn-marie-rose-baked-potato-3333x3750-69788ef9
    "16bd4accb383f65056bcd10b0a2db8bd59d15f71d075905c15f5f05b381b78dc": ('Tuna Mayonnaise', [('', '812')]),  # card 065 tuna-mayonnaise-baked-potato-3333x3750-69788f174
    "780490c2186f83d1f9462c3c5a153ccf587515c888a58607c35055cb412f96ca": ('Melted Brie & Crispy Bacon', [('', '982')]),  # card 066 melted-brie-crispy-bacon-baked-potato-3333x3750-
    "ce523393e7c3bf3d1225a6eb8db358304c82cad02267fb2fe159defda8fae89a": ('Traditional Ploughman’s Platter', [('', '1281')]),  # card 068 traditional-ploughman-s-platter-3333x3750-6925cc
    "0d3e505f57edd76cae8a771e55993e0f871c79ae1fa72a385bbe52bd858b7bc0": ('Warm Goats Cheese & Roasted Beetroot Salad', [('', '654')]),  # card 070 warm-goats-cheese-roasted-beetroot-salad-3333x37
    "6641ba23d6d892f00a5fbdce2038910c187d79d9fe83b429be5b3df7f5a3eb78": ('Glazed Ham, Mature Cheddar & Tomato', [('', '747')]),  # card 071 glazed-ham-mature-cheddar-tomato-3333x3750-6925c
    "75b8b463abc4121f332303528b15cbb4209773f61e66ca0f39eba3af0655ca7b": ('Ranch Chicken with Bacon, Spring Onion & Cheddar', [('', '812')]),  # card 073 ranch-chicken-with-bacon-spring-onions-cheddar-3
    "9ca7b93ebcc0af491962d924b49a53df62c786ec55aafed9d1e5bd4cca66d85d": ('Smoked Applewood Vegan Cheese, Tomato & Basil', [('', '612')]),  # card 074 smoked-applewood-vegan-cheese-tomato-basil-3333x
    "9f63ab36735c498e90cbca882fe86cbb5adcbb21160117ab02fae97b8bbd5bfb": ('Tuna, Black Pepper Mayonnaise & Cheddar Melt', [('', '911')]),  # card 075 tuna-black-pepper-mayonnaise-cheddar-melt-3333x3
    "759a173552477e112cee1df5a73f975e890f8896e376cb1c980de6b9ccd880df": ('Prawn Marie Rose', [('', '527')]),  # card 077 prawn-marie-rose-sandwich1-3333x3750-697767a8789
    "13bce838d4b6e721d85a2563a5f0222ced6881d61b4d65137364ff8b76cd7607": ('Tuna Mayonnaise & Cucumber', [('', '746')]),  # card 078 tuna-mayonnaise-cucumber1-3333x3750-6977676d4342
    "5200e2b654f81c4883aad9b2e0cc2d63831802134c5eb829756ed3caaee7d4a9": ('Egg Mayonnaise & Chive', [('', '654')]),  # card 079 egg-mayonnaise-chive1-3333x3750-6977672095f00.jp
    "bb59e7216bf1bcce2dc389bbb0c18ca5a371acc0a58d0effb920bf2d0fc6a3c1": ('Ham & Cheese Ploughman’s', [('', '685')]),  # card 080 ham-cheese-ploughmans-3333x3750-6977669dd7e42.jp
    "ba312b78e111883ae165c0ed06acc7ec0c372520bca647ff9a64e047b176bdf1": ('Garden Leaf Salad', [('', '34')]),  # card 081 garden-leaf-salad-3333x3750-6925d440709b9.jpg
    "3a7bf6ef802326b653c542ba852facd68a9293a1749e19430efb83f4b61bd63b": ('Homemade Classic Coleslaw', [('', '113')]),  # card 082 homemade-classic-coleslaw-3333x3750-6925d47b3db3
    "62e0d753ac15e83041257903bd63de248c90ea7dfbc789a0c6045ffddaab2d61": ('Italian Style Pasta Salad', [('', '214')]),  # card 083 italian-style-pasta-salad-3333x3750-6925d4afb4ad
    "ad5d3b30fde16f638fc2d3b07a11082ca7f82fd96aa7ba6d93d6964388800c67": ('Roast Topside of Beef', [('', '1589')]),  # card 094 roast-topside-of-beef-3333x3750-69402d46b38bd.jp
    "6d3474887bb2988d55a821a62ea7fcddb6b46b60d306800e0b7015d8e85109f8": ('Three Meats', [('', '1596')]),  # card 097 three-meats-3333x3750-69402fc6ad9ec.jpg
    "cabf62a19e0cf8b6ead1c64a5baf472c9ebd9161a121185e3e3d151bff007f4c": ('Parmesan, Kale & Squash Pie', [('', '1352')]),  # card 099 parmesan-kale-squash-pie-3333x3750-696dfda0b149d
    "96a74878e375065fe8fdcff44692afe794f07e7db337ed93c89de370597df331": ('Wholetail Scampi', [('', '1281')]),  # card 101 wholetail-scampi-3333x3750-6925be6b7e271.jpg
    "0575d5c641a6d2e2de04859a2104d42b194c4674bd4e27cd2a14f7f6bfbb7731": ('Roasted Seasonal Vegetables', [('', '544')]),  # card 104 roasted-seasonal-vegetables-3333x3750-6940356733
    "aae78f654e774809b85bfa779d7f9e3f97e5aca15cc9c8730098da46847fbab5": ('Thyme Roasted Potatoes', [('', '292')]),  # card 105 thyme-roasted-potatoes-3333x3750-694035bc409c4.j
    "9c2de13a98f52c987d895e4cd0782d74cf9b55d0d3a706dfd7fed244670f4ab7": ('Three Egg Omelette - Cheese & Mushroom', [('', '766')]),  # card 111 omelette-cheese-mushroom-3333x3750-6925c24e5329d
    "d69975c5b85a216fdb86ae0e45911e17857c239d02351f44b760febde7c8b543": ('Three Egg Omelette - Plain', [('', '551')]),  # card 112 omelette-plain-3333x3750-6925c2742940b.jpg
    "366b94b222a34784a38503e156c54f061a003e0ef8b410f21673c9659d269468": ('Garlic Ciabatta with Dressed Salad', [('', '569')]),  # card 115 garlic-bread-3333x3750-692d7e7602ace.jpg
    "de562825fd7390ab259e8c1bb64bfe3bca5100b83b167eb490bef7afc8fda975": ('Onion Rings', [('', '278')]),  # card 118 onion-rings-3333x3750-69cce24c476dd.jpg
    "bfc65baeb7432cc00b3cefc2c61c4f8cf296832b15ccf8c43ff44bca53398ee5": ('Americano', [('Regular', '44'), ('Large', '57')]),  # card 119 americano-3333x3750-694522538653f.jpg
    "bf5adc0e821ec1c6c2fa952b8132cb4052ca805ddb1ee57169ac4381f786c379": ('Cappuccino', [('Regular', '178'), ('Large', '195')]),  # card 120 cappuccino-3333x3750-6945227ef3f06.jpg
    "f2da03a53b31991d367ccc401036549b2f039b7f17d255925d35ec16a31604bd": ('Cafetière with Milk', [('For One', '68'), ('For Two', '116')]),  # card 124 cafetiere-3333x3750-694523cb9bdb9.jpg
    "91ee08204e5aa4f1b9f63ad4e718fd96ba00555873b5d3b15f2d9b223dd7f0d2": ('Matcha Latte', [('', '155')]),  # card 129 matcha-latte-3333x3750-6945265eb1d39.jpg
    "d80adc3715a7d37c0c859b9139ea27e66a0de0e1213a8ad7512adf84fc02ca64": ('Pot of Tea for One', [('', '44')]),  # card 130 pot-of-tea-for-one-3333x3750-695d249013c05.jpg
    "e4c7d8aa7eb782420811ea1a4f2dc19b22301d6b62bbe94194fd9490be0948ae": ('Pot of Speciality Loose Leaf Tea for One', [('', '20')]),  # card 131 pot-of-speciality-tea-3333x3750-695d24beb6845.jp
    "72d704b929b857060b83f54cb805e02a629a56db14b76fdb337c9f968c0789d8": ('Salted Caramel Iced Latte', [('', '252')]),  # card 137 salted-caramel-iced-latte-3333x3750-69ccde3a9027
}
NOTE = ("Calories only, from Blue Diamond's own calorie-counted online menus (each figure printed on the dish's picture); protein, carbs "
        "and fat are not published. Blue Diamond says menus and prices may vary by garden centre. Alcoholic drinks are not listed.")
assert len(NOTE) < 400

_last = [0.0]


def get(url: str, dest: Path) -> bytes:
    if dest.exists() and dest.stat().st_size:
        return dest.read_bytes()
    if not ic._robots_allow(url):
        raise SystemExit(f"robots.txt disallows {url}: stopped")
    wait = _last[0] + DELAY - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} from {url}: stopped (never worked round)") from e
    finally:
        _last[0] = time.monotonic()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


def cards(text: str) -> list[tuple[str, str]]:
    """(section heading, image url) for every card on a menu page, in page order."""
    out, section = [], ""
    start = text.find("Diamond Club News")
    body = text[start:] if start > 0 else text
    for m in re.finditer(r"<h1[^>]*>.*?</h1>|<img[^>]*>", body, re.S):
        tag = m.group(0)
        if tag.lower().startswith("<h1"):
            head = html.unescape(re.sub(r"<[^>]+>", "", tag)).replace("\xa0", " ").strip()
            if head:
                section = head
            continue
        im = IMG.search(tag)
        if im and not NOT_DISH.search(im.group(1)) and "-3333x3750-" in im.group(1):   # dish cards only (banners are other sizes)
            out.append((section, im.group(1)))
    return out


LABELS = {"Regular", "Large", "Small", "Single", "Double", "For One", "For Two", "Half", "Full", "Kids", "Adult"}
DIGIT_FIX = str.maketrans({"I": "1", "l": "1", "|": "1", "]": "1", "O": "0", "o": "0"})


def tidy_title(t: str) -> str:
    """OCR's title text with stray marks from the photo dropped (trailing tokens of 1-3 non-letters or mixed junk)."""
    words = t.split()
    while words and not re.fullmatch(r"[A-Za-z][A-Za-z'’&.,()-]*|&|-", words[-1]):
        words.pop()
    return " ".join(words)


def parse_figure(text: str) -> tuple[str, str] | None:
    """'Regular 44 kcal' -> ('Regular', '44'). OCR's usual confusions inside the number (I or l for 1, O for 0) are mapped back; the
    result is still compared by eye with the card."""
    m = re.search(r"([0-9IlO|\]][0-9IlO|\],]*)\s*k[ce]al", text)
    if not m:
        return None
    num = m.group(1).translate(DIGIT_FIX).replace(",", "")
    if not num.isdigit():
        return None
    words = re.sub(r"[^A-Za-z ]", " ", text[:m.start()]).split()
    label = ""
    for n in (2, 1):   # a size label the cards print, if it is the last word(s) before the figure; other letters are OCR noise
        cand = " ".join(words[-n:]).title()
        if cand in LABELS:
            label = cand
            break
    return label, num


def propose(card: dict) -> tuple[str, list[tuple[str, str]], list[str]]:
    """(name, [(label, kcal)], doubts) from the two OCR reads of each part of one card."""
    doubts = []
    t1, t2 = (tidy_title(t) for t in card["titles"])
    if norm(t1) != norm(t2):
        doubts.append(f"title reads differ: {t1!r} / {t2!r}")
    figs = []
    for f in card["figures"]:
        a, b = (parse_figure(x) for x in f["reads"])
        if a is None or b is None or a[1] != b[1] or norm(a[0]) != norm(b[0]):
            doubts.append(f"figure reads differ: {f['reads']}")
        figs.append(a or b or ("?", "?"))
    if not figs:
        doubts.append("no calorie circle found")
    return t1, figs, doubts


def norm(s: str) -> str:
    s = s.lower().replace("&", " ").replace("’", "").replace("'", "")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def file_words(url: str) -> str:
    stem = url.rsplit("/", 1)[1]
    stem = re.sub(r"-\d+x\d+-[0-9a-f]+\.\w+$", "", stem)
    return norm(stem.replace("-", " "))


def read_cards(cache: Path, fetch: bool) -> tuple[list[dict], list[str]]:
    rows, report = [], []
    for page in PAGES:
        text = get(f"{BASE}/{page}", cache / f"{page}.html").decode("utf-8", "replace") if fetch else \
            (cache / f"{page}.html").read_text(encoding="utf-8", errors="replace")
        for section, url in cards(text):
            path = cache / "img" / url.rsplit("/", 1)[1]
            raw = get(url, path) if fetch else path.read_bytes()
            sha = hashlib.sha256(raw).hexdigest()
            card = bc.read_card(path)
            name, figs, doubts = propose(card)
            fw = [w for w in file_words(url).split() if w not in ("and", "with", "s")]
            if sum(w in norm(name).split() for w in fw) * 2 < len(fw):
                doubts.append(f"OCR name {name!r} shares less than half the file name words {file_words(url)!r}")
            rows.append({"page": page, "section": section, "url": url, "file": path.name, "sha": sha, "name": name,
                         "figures": figs, "doubts": doubts, "raw": card, "words": file_words(url)})
    return rows, report


def decide(rows: list[dict]) -> tuple[list[dict], list[str]]:
    items, report, problems = [], [], []
    for r in rows:
        if r["sha"] in CONFIRMED:
            name, figs = CONFIRMED[r["sha"]]
            r["how"] = "read by eye (the OCR reads disagreed or misread a character)"
        else:
            if r["doubts"]:
                problems.append(f"{r['file']}: {'; '.join(r['doubts'])}")
                continue
            name, figs = r["name"], r["figures"]
            r["how"] = "OCR (two enlargements agreeing, name holding the card's file-name words), checked by eye"
        if r["page"] == "drinks" and ALCOHOL.search(name) and not ALCOHOL_FREE.search(name):
            report.append(f"left out (alcoholic drink): {name}")
            continue
        for label, kcal in figs:
            items.append({**r, "name": f"{name} ({label})" if label else name, "kcal": kcal})
    return items, problems + report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--dump", type=Path, default=None, help="write every card's OCR reads as JSON (for the by-eye check)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    rows, _ = read_cards(args.cache, args.fetch)
    if args.dump:
        args.dump.write_text(json.dumps(rows, indent=1))
    items, report = decide(rows)
    problems = [p for p in report if not p.startswith("left out")]
    print("\n".join(report))
    if problems:
        print(f"{len(problems)} cards need a by-eye decision (CONFIRMED) before the chain can be written", file=sys.stderr)
        return 1
    out_items, seen = [], {}
    for it in items:
        cat = it["section"] or PAGE_LABEL[it["page"]]
        key = (it["name"].lower(), it["kcal"])
        if key in seen:
            report.append(f"dropped repeat: {it['name']} ({it['kcal']} kcal) on {it['page']} > {cat}")
            continue
        seen[key] = it
        out_items.append({"name": it["name"], "category": cat, "calories": it["kcal"], "rankable": False, "page_label": PAGE_LABEL[it["page"]],
                          "limited_time": cat == "Summer Drinks",
                          "notes": f"{PAGE_LABEL[it['page']]} > {cat}; card {it['file']} (sha256 {it['sha'][:16]}); {it['how']}"})
    # the same printed name on different dishes (different figures): add the section, then the menu as well, until each is unique
    for stage in ("category", "page"):
        names = [slug(i["name"]) for i in out_items]
        dup = {n for n in names if names.count(n) > 1}
        if not dup:
            break
        for i in out_items:
            if slug(i["name"]) in dup:
                base = i.get("base_name", i["name"])
                i["base_name"] = base
                i["name"] = (f"{base} ({i['category'].lower()})" if stage == "category" else
                             f"{base} ({i['page_label'].lower()}, {i['category'].lower()})")
    names = [slug(i["name"]) for i in out_items]
    if len(set(names)) != len(names):
        raise SystemExit(f"names still not unique: {sorted(n for n in names if names.count(n) > 1)}")
    for i in out_items:
        i.pop("base_name", None)
        i.pop("page_label", None)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Blue Diamond", cuisine="Garden centre cafe",
        source_title=(f"Blue Diamond Garden Centres: Our Calorie-Counted Menus (breakfast, lunch, Sunday lunch, drinks and patisserie pages on "
                      f"bluediamond.gg; figures printed on each dish's picture; read {args.checked_on})"),
        source_url=BASE, checked_on=args.checked_on, aliases=["blue diamond", "blue diamond garden centre", "blue diamond restaurant"],
        items=out_items, out=args.out, note=NOTE, nutrition_level="calories")
    print(f"wrote {len(out_items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
