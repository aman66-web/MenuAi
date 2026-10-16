"""M&S Foodhall crawler (tools/groceries/mns_food_listing.py), tested on tiny SYNTHETIC aisle pages: no request is made and no real page is stored.
Run: python3 -m unittest discover -s tools/tests"""
import argparse
import contextlib
import csv
import http.client
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS / "groceries"))
sys.path.insert(0, str(TOOLS / "uk_extract"))
import mns_food_listing as m  # noqa: E402
import robots_rfc  # noqa: E402

REAL_ROBOTS = """User-agent: *
Disallow: /l/*:
Disallow: /*pgNumber
Disallow: /*prefn1
Disallow: /*prefv1
Disallow: /*srule=
Disallow: /*productId=
Disallow: /*quickView=
Disallow: /*search?q=
Disallow: /search
Disallow: /offers
""" + "".join(f"Disallow: /private{i}\n" for i in range(20))
RULES = robots_rfc.parse(REAL_ROBOTS)


def tile(n, **over):
    t = {"id": str(60000000 + n), "seoUrl": f"/food/item-{n}/p/fdp{60000000 + n}", "title": f"Item {n}", "imageUrl": f"{n:032x}.jpg", "weight": "100 g",
         "labels": ["Eat Well"], "brand": "", "isRanged": None, "price": None, "unitPrice": None, "stockLevelIndicator": None}
    t.update(over)
    return t


def page_html(slug, page, tiles, total_items, total_pages, *, first=None, canonical=True, pad=60_000, title="Aisle"):
    first = first if first is not None else (page - 1) * 96 + 1
    data = {"props": {"pageProps": {"viewModel": {
        "canonicalUrl": f"https://www.marksandspencer.com/food/l/{slug}" if canonical else "",
        "productSearch": {"pagination": {"totalItems": total_items, "totalPages": total_pages, "pageFirstItemNum": first, "pageLastItemNum": first + len(tiles) - 1},
                          "productLists": {"ranged": tiles, "unranged": []}}}}},
            "page": "/food/l/[...categories]", "query": {"categories": slug.split("/"), **({"page": str(page)} if page > 1 else {})}, "buildId": "food-catalogue-test"}
    return f'<html><head><title>{title}</title></head><body><script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script><!--{"x" * pad}--></body></html>'


class Quiet(unittest.TestCase):
    """The crawler prints its progress; keep the test output clean."""

    def setUp(self):
        self._quiet = contextlib.redirect_stdout(io.StringIO())
        self._quiet.__enter__()

    def tearDown(self):
        self._quiet.__exit__(None, None, None)


EGGS = m.BY_SLUG["eggs"]  # expected 36 -> allowed 29 to 45 printed


class AddressTests(unittest.TestCase):
    def test_the_aisle_table_has_no_alcohol_or_non_food_aisle(self):
        m.assert_units_safe()
        slugs = [u.slug for u in m.UNITS]
        for bad in ("drinks", "drinks/alcoholic-drinks", "household", "pet-supplies", "kids-toddler-and-baby-products", "christmas-groceries-in-store",
                    "new-in", "home-of-health", "food-brands", "ready-to-eat-meats"):
            self.assertNotIn(bad, slugs)
        self.assertFalse(any("wine" in s or "alcohol" in s for s in slugs))
        self.assertEqual(slugs[0], "meat/meat-alternatives")  # labelled meat-free before Meat takes its subset
        with self.assertRaises(AssertionError):
            with mock.patch.object(m, "UNITS", [m.Unit("drinks/alcoholic-drinks", "Alcoholic", 600)]):
                m.assert_units_safe()

    def test_allow_list(self):
        ok = m.allowed_url
        self.assertTrue(ok("https://www.marksandspencer.com/food/l/food-cupboard"))
        self.assertTrue(ok("https://www.marksandspencer.com/food/l/food-cupboard?page=2", 19))
        self.assertTrue(ok("https://www.marksandspencer.com/food/l/food-cupboard?page=19", 19))
        self.assertTrue(ok("https://www.marksandspencer.com/food/l/drinks/hot-drinks?page=2", 2))
        self.assertFalse(ok("https://www.marksandspencer.com/food/l/food-cupboard?page=20", 19))      # past the last page
        self.assertFalse(ok("https://www.marksandspencer.com/food/l/food-cupboard?page=2"))             # total pages not known yet
        self.assertFalse(ok("https://www.marksandspencer.com/food/l/food-cupboard?page=1", 19))
        self.assertFalse(ok("https://www.marksandspencer.com/food/l/food-cupboard?page=31", 40))        # hard cap 30
        for bad in ("https://www.marksandspencer.com/food/l/drinks", "https://www.marksandspencer.com/food/l/drinks/alcoholic-drinks",
                    "https://www.marksandspencer.com/food/l/household", "https://www.marksandspencer.com/food/l/dairy?pgNumber=2",
                    "https://www.marksandspencer.com/food/l/dairy?page=2&prefn1=x", "https://www.marksandspencer.com/search?searchTerm=x",
                    "https://www.marksandspencer.com/food/l/dairy:brand", "https://www.marksandspencer.com/food/l/ways-to-save/10-0-off",
                    "http://www.marksandspencer.com/food/l/dairy", "https://christmasfood.marksandspencer.com/food/l/dairy",
                    "https://www.marksandspencer.com/food/fruit-and-vegetables/p/fdp21000815", "https://example.com/food/l/dairy"):
            self.assertFalse(ok(bad, 9), bad)

    def test_robots_rules_read_as_the_shop_writes_them(self):
        self.assertTrue(robots_rfc.allowed(RULES, "/food/l/food-cupboard?page=2"))
        self.assertFalse(robots_rfc.allowed(RULES, "/food/l/x?pgNumber=2"))
        self.assertFalse(robots_rfc.allowed(RULES, "/search?searchTerm=x"))


class NameTests(unittest.TestCase):
    def test_clean_title(self):
        self.assertEqual(m.clean_title("Red Diamondandtrade; Strawberries<br />Class 1"), "Red Diamond Strawberries Class 1")
        self.assertEqual(m.clean_title("Rosé &amp; Co&reg; 75cl&trade; ©"), "Rosé & Co 75cl")
        self.assertEqual(m.clean_title("Tom &amp;amp; Jerry"), "Tom & Jerry")
        self.assertEqual(m.clean_title(None), "")

    def test_the_size_is_added_once_and_the_brand_is_written_once(self):
        self.assertEqual(m.row_name("Baby Rainbow Carrots", "", "200 g"), "Baby Rainbow Carrots 200 g")
        self.assertEqual(m.row_name("Baby Rainbow Carrots 200g", "", "200 g"), "Baby Rainbow Carrots 200g")   # the title already has a size
        self.assertEqual(m.row_name("Baby Carrots", "M&S", "200 g"), "M&S Baby Carrots 200 g")
        self.assertEqual(m.row_name("M&S Baby Carrots", "M&S", "200 g"), "M&S Baby Carrots 200 g")
        self.assertEqual(m.row_name("Gastropub Milk Toffee Tarte", "Gastropub", "150 g"), "Gastropub Milk Toffee Tarte 150 g")
        self.assertEqual(m.row_name("Collection Mini Macaroons", "M&S Collection", "144 g"), "M&S Collection Mini Macaroons 144 g")
        self.assertEqual(m.row_name("No Chicken Nuggets", "Plant Kitchen", "200 g"), "Plant Kitchen No Chicken Nuggets 200 g")
        self.assertEqual(m.row_name("Organic Kombucha", "Daylesford", "75 cl"), "Daylesford Organic Kombucha 75 cl")
        self.assertEqual(m.row_name("Tastebuds Pears", "Taste Buds", "550 g"), "Tastebuds Pears 550 g")
        self.assertEqual(m.row_name("Baby Carrots", "M & S", "200 g"), "M & S Baby Carrots 200 g")

    def test_a_brand_the_title_already_names_is_not_written_twice(self):
        """The brand sits inside the title (not at its start): M&S's own words are shown as printed, with no brand in front."""
        self.assertEqual(m.row_name("Scottish Organic Large Eggs", "Organic", "408 g"), "Scottish Organic Large Eggs 408 g")
        self.assertEqual(m.row_name("Reduced Sugar Percy Pig Sweets", "Percy Pig", "150 g"), "Reduced Sugar Percy Pig Sweets 150 g")
        self.assertEqual(m.row_name("4 Count On Us Lemon Mousses", "Count on Us", "280 g"), "4 Count On Us Lemon Mousses 280 g")
        self.assertEqual(m.row_name("Percy Pig and Colin the Caterpillar Chocolate Lollies", "Colin the Caterpillar", "26 g"), "Percy Pig and Colin the Caterpillar Chocolate Lollies 26 g")
        self.assertEqual(m.row_name("Get Your Skis on Colin the Caterpillar", "Colin the Caterpillar", "52 g"), "Get Your Skis on Colin the Caterpillar 52 g")
        # a brand that only appears inside a longer word is not "named"
        self.assertEqual(m.row_name("Mandarin Segments", "M&S", "300 g"), "M&S Mandarin Segments 300 g")
        self.assertEqual(m.row_name("Organically Grown Carrots", "Organic", "500 g"), "Organic Organically Grown Carrots 500 g")

    def test_the_pack_size_is_added_unless_the_title_has_that_same_size(self):
        self.assertEqual(m.row_name("6g Protein Smoked Paprika Popped Red Lentil Tortillas", "High Protein", "90 g"), "6g Protein Smoked Paprika Popped Red Lentil Tortillas 90 g")
        self.assertEqual(m.row_name("Cantaloupe Melon 800g", "", "800 g"), "Cantaloupe Melon 800g")
        self.assertEqual(m.row_name("Cantaloupe Melon 800 G", "", "800g"), "Cantaloupe Melon 800 G")
        self.assertEqual(m.row_name("Still Water 1.5 Litres", "", "1.5 l"), "Still Water 1.5 Litres")
        self.assertEqual(m.row_name("Still Water 1.5ltr", "", "1.5 l"), "Still Water 1.5ltr")
        self.assertEqual(m.row_name("Mixed Nuts 200g", "", "1 kg"), "Mixed Nuts 200g 1 kg")      # a different size is not this pack's size
        # M&S prints no pack size for things sold by the piece: the name stands alone
        self.assertEqual(m.row_name("Pain Aux Raisins", "", ""), "Pain Aux Raisins")
        self.assertEqual(m.row_name("Plain Pretzel", "", None), "Plain Pretzel")

    def test_a_claim_or_label_brand_is_never_put_in_front_of_the_title(self):
        for brand in ("High Protein", "Nutrient Dense", "Brain Food", "Good Gut", "Made Without", "Eat Well", "ONLY \u2026 INGREDIENTS"):
            self.assertEqual(m.row_name("Naked Chicken Kebab Salad", brand, "310 g"), "Naked Chicken Kebab Salad 310 g", brand)
        # M&S's own title keeps its words exactly as printed
        self.assertEqual(m.row_name("Nutrient Dense 35 Plants Salad", "Nutrient Dense", "280 g"), "Nutrient Dense 35 Plants Salad 280 g")
        self.assertEqual(m.row_name("Gruy\u00e8re d\u2019Alpage AOP", "The Rolling Cheese Co", "150 g"), "The Rolling Cheese Co Gruy\u00e8re d\u2019Alpage AOP 150 g")

    def test_norm_name_for_priced_duplicates(self):
        self.assertEqual(m.norm_name("M&S Rainbow Cake (Serves 12)"), m.norm_name("Marks & Spencer Rainbow cake - serves 12"))
        self.assertNotEqual(m.norm_name("Rainbow Cake 1.2 kg"), m.norm_name("Rainbow Cake 600 g"))


class TileTests(unittest.TestCase):
    def test_a_good_tile_keeps_only_the_few_fields_and_no_label_or_price(self):
        t = m.read_tile(tile(1, labels=["Eat Well", "New In"], brand="M&S"))
        self.assertEqual(sorted(t), ["brand", "id", "img", "seo", "title", "weight"])
        self.assertNotIn("Eat Well", json.dumps(t))

    def test_tiles_of_the_wrong_shape_are_skipped(self):
        for over in ({"id": "abc"}, {"id": "123"}, {"seoUrl": "/food/x/p/fdp99999999"}, {"seoUrl": "https://evil.example/food/x/p/fdp60000001"}, {"seoUrl": "/food/X Y/p/fdp60000001"},
                     {"imageUrl": "../../x.jpg"}, {"imageUrl": "SD_FD_F09A_1"}, {"title": " "}, {"title": None}):
            self.assertIsNone(m.read_tile(tile(1, **over)), over)
        self.assertIsNone(m.read_tile("not a tile"))

    def test_a_tile_with_no_pack_size_is_a_valid_product(self):
        """M&S prints no pack size for things sold by the piece ("Pain Aux Raisins", "Palmier", "Plain Pretzel"): that is not a change of format."""
        for over in ({"weight": ""}, {"weight": None}, {"weight": "  "}, {"weight": 12}):
            t = m.read_tile(tile(1, **over))
            self.assertIsNotNone(t, over)
            self.assertIn(t["weight"], ("", "  "))
            self.assertIsNone(m.tile_problem(tile(1, **over)))
        palmier = m.read_tile(tile(1, title="Palmier", weight=None))
        self.assertEqual(m.row_name(palmier["title"], "", palmier["weight"]), "Palmier")


class PageTests(unittest.TestCase):
    def parse(self, body, page=1, unit=EGGS):
        return m.parse_page("https://www.marksandspencer.com/food/l/eggs", unit, page, body)

    def test_a_good_page(self):
        r = self.parse(page_html("eggs", 1, [tile(i) for i in range(36)], 36, 1))
        self.assertEqual((len(r["tiles"]), r["skipped"], r["priced"], r["unranged"]), (36, 0, 0, 0))
        self.assertEqual(r["pagination"]["totalPages"], 1)

    def test_a_price_on_a_tile_is_counted_and_never_kept(self):
        r = self.parse(page_html("eggs", 1, [tile(1, price=3.5), tile(2, unitPrice="1.2")] + [tile(i) for i in range(3, 36)], 36, 1))
        self.assertEqual(r["priced"], 2)
        self.assertNotIn("price", r["tiles"][0])

    def test_pages_that_must_stop_the_run(self):
        good = [tile(i) for i in range(36)]
        cases = {
            "challenge": page_html("eggs", 1, good, 36, 1, title="Access Denied"),
            "too small": page_html("eggs", 1, good, 36, 1, pad=0)[:2000],
            "no next data": "<html>" + "x" * 60_000 + "</html>",
            "wrong first item (a redirect back to page 1)": page_html("eggs", 2, good, 150, 2, first=1),
            "total far outside the band": page_html("eggs", 1, good, 400, 5),
            "another aisle's canonical": page_html("dairy", 1, good, 36, 1),
            "page 1 has the wrong page count": page_html("eggs", 1, good, 36, 6),
        }
        for why, body in cases.items():
            with self.assertRaises(m.Stop, msg=why):
                self.parse(body)
        with self.assertRaises(m.Stop):  # the page says it is a different page than we asked for
            self.parse(page_html("eggs", 1, good, 36, 2), page=2)
        bad_json = '<script id="__NEXT_DATA__" type="application/json">{not json}</script>' + "x" * 60_000
        with self.assertRaises(m.Stop):
            self.parse(bad_json)

    def test_challenge_words_in_the_body_far_from_the_top_are_not_a_stop(self):
        body = page_html("eggs", 1, [tile(i) for i in range(36)], 36, 1, pad=0) + "<p>Just a moment, ... " + "x" * 60_000 + "</p>"
        body = body.replace("</body>", "<div>pardon our interruption</div></body>")
        self.assertEqual(len(self.parse(body)["tiles"]), 36)  # only the first 4 KB and the <title> are searched

    def test_one_odd_tile_is_tolerated_and_counted_two_stop(self):
        tiles = [tile(i) for i in range(36)]
        tiles[5] = tile(5, seoUrl="/food/x/p/fdp99999999")
        r = self.parse(page_html("eggs", 1, tiles, 36, 1))
        self.assertEqual((len(r["tiles"]), r["skipped"]), (35, 1))
        self.assertEqual(r["skipped_why"], ["60000005: seoUrl = '/food/x/p/fdp99999999'"])      # what was skipped is noted (the id and the failing field only)
        tiles[6] = tile(6, imageUrl="x")
        with self.assertRaises(m.Stop) as ctx:
            self.parse(page_html("eggs", 1, tiles, 36, 1))
        self.assertIn("60000006: imageUrl = 'x'", ctx.exception.reason)  # the stop says which tile and which field

    def test_products_with_no_pack_size_do_not_stop_the_run(self):
        """The Bakery & Cakes page 3 case: 3 of 96 tiles (a pain aux raisins, a palmier, a pretzel) print no pack size. They are kept, none is skipped."""
        unit = m.Unit("bakery-and-cakes", "Bakery & Cakes", 414)
        tiles = [tile(i) for i in range(96)]
        for i, name in ((10, "Pain Aux Raisins"), (40, "Palmier"), (70, "Plain Pretzel")):
            tiles[i] = tile(i, title=name, weight="")
        r = m.parse_page("u", unit, 3, page_html("bakery-and-cakes", 3, tiles, 414, 5))
        self.assertEqual((len(r["tiles"]), r["skipped"], r["skipped_why"]), (96, 0, []))
        self.assertEqual([t["title"] for t in r["tiles"] if not t["weight"]], ["Pain Aux Raisins", "Palmier", "Plain Pretzel"])

    def test_a_short_page_that_is_not_the_last_is_a_warning(self):
        unit = m.Unit("x", "X", None)
        r = m.parse_page("u", unit, 1, page_html("x", 1, [tile(i) for i in range(50)], 150, 2))
        self.assertEqual(len(r["warnings"]), 1)
        self.assertEqual(m.parse_page("u", unit, 2, page_html("x", 2, [tile(i) for i in range(54)], 150, 2))["warnings"], [])


class FakeSite:
    """polite_get replacement: serves synthetic pages by URL and records every request."""

    def __init__(self, pages=None, error=None):
        self.pages, self.error, self.requested = pages or {}, error, []

    def __call__(self, url, cache_dir, **kw):
        self.requested.append(url)
        if self.error:
            raise self.error
        return self.pages[url].encode()


class ReadTests(Quiet):
    def setUp(self):
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        self.raw = Path(self.tmp.name)
        self.saved_robots = dict(m.ic._robots)
        self.patches = [mock.patch.object(m, "preflight", return_value=RULES), mock.patch.object(m, "shop_taken_down", return_value=False)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        m.ic._robots.clear()
        m.ic._robots.update(self.saved_robots)
        self.tmp.cleanup()
        super().tearDown()

    def args(self, **kw):
        return argparse.Namespace(only=kw.get("only", "eggs"), redo=kw.get("redo"), cache=None, raw_dir=str(self.raw))

    def two_page_site(self):
        unit = m.Unit("eggs", "Eggs", None)
        t1, t2 = [tile(i) for i in range(96)], [tile(i) for i in range(96, 130)]
        return unit, {"https://www.marksandspencer.com/food/l/eggs": page_html("eggs", 1, t1, 130, 2),
                      "https://www.marksandspencer.com/food/l/eggs?page=2": page_html("eggs", 2, t2, 130, 2)}

    def test_reads_every_page_once_never_past_the_last_and_resumes(self):
        unit, pages = self.two_page_site()
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}):
            site = FakeSite(pages)
            with mock.patch.object(m.ic, "polite_get", site):
                self.assertEqual(m.cmd_read(self.args()), 0)
            self.assertEqual(site.requested, list(pages))                       # page 1, page 2, nothing else
            state_pages, state_tiles = m.load_state(self.raw / "marks-and-spencer-food.jsonl")
            self.assertEqual(sorted(state_pages), [("eggs", 1), ("eggs", 2)])
            self.assertEqual(sum(len(v) for v in state_tiles.values()), 130)
            again = FakeSite(pages)
            with mock.patch.object(m.ic, "polite_get", again):
                self.assertEqual(m.cmd_read(self.args()), 0)
            self.assertEqual(again.requested, [])                                # resumed: nothing left to read
            redo = FakeSite(pages)
            with mock.patch.object(m.ic, "polite_get", redo):
                self.assertEqual(m.cmd_read(self.args(redo="eggs")), 0)
            self.assertEqual(len(redo.requested), 2)
            _, t = m.load_state(self.raw / "marks-and-spencer-food.jsonl")
            self.assertEqual(sum(len(v) for v in t.values()), 130)               # --redo left no duplicate lines
            self.assertIn("DONE", (self.raw / "marks-and-spencer-food_progress.txt").read_text())

    def test_a_cut_off_page_is_read_again_cleanly(self):
        unit, pages = self.two_page_site()
        jsonl = self.raw / "marks-and-spencer-food.jsonl"
        jsonl.write_text(json.dumps({"k": "tile", "unit": "eggs", "page": 1, "id": "60000001"}) + "\n" + '{"k": "ti', encoding="utf-8")  # tiles, no page line, half a line
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}), mock.patch.object(m.ic, "polite_get", FakeSite(pages)):
            self.assertEqual(m.cmd_read(self.args()), 0)
        _, t = m.load_state(jsonl)
        self.assertEqual(sum(len(v) for v in t.values()), 130)

    def stop_cases(self):
        unit, pages = self.two_page_site()
        h = lambda code: urllib.error.HTTPError("u", code, "x", {}, None)  # noqa: E731
        return unit, pages, {
            "403": m.ic.Blocked("HTTP 403 from u"), "429": m.ic.Blocked("HTTP 429 from u"), "401": m.ic.Blocked("HTTP 401 from u"),
            "500": h(500), "503": h(503), "404": h(404), "dropped connection": urllib.error.URLError("reset"), "timeout": TimeoutError("timed out"),
        }

    def test_a_refusal_or_error_stops_the_run_keeps_what_was_read_and_exits_2(self):
        unit, pages, errors = self.stop_cases()
        for why, err in errors.items():
            with self.subTest(why), mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}):
                jsonl = self.raw / "marks-and-spencer-food.jsonl"
                jsonl.unlink(missing_ok=True)
                # page 1 is served, page 2 fails
                def get(url, cache_dir, _err=err, _calls=[], **kw):
                    _calls.append(url)
                    if len(_calls) == 1:
                        return pages[url].encode()
                    raise _err
                with mock.patch.object(m.ic, "polite_get", get):
                    self.assertEqual(m.cmd_read(self.args()), 2)
                got, _ = m.load_state(jsonl)
                self.assertEqual(sorted(got), [("eggs", 1)])
                self.assertIn("STOPPED", (self.raw / "marks-and-spencer-food_progress.txt").read_text())

    def test_a_redo_that_cannot_start_leaves_the_saved_pages_alone(self):
        """`read --redo` used to delete the aisle's lines before robots.txt was checked: a 429 on robots.txt cost the 19 pages already read."""
        unit, pages = self.two_page_site()
        jsonl = self.raw / "marks-and-spencer-food.jsonl"
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}):
            with mock.patch.object(m.ic, "polite_get", FakeSite(pages)):
                self.assertEqual(m.cmd_read(self.args()), 0)
            before = jsonl.read_bytes()
            site = FakeSite(pages)
            with mock.patch.object(m, "preflight", side_effect=m.Stop("https://www.marksandspencer.com/robots.txt", "robots.txt answered HTTP 429")), mock.patch.object(m.ic, "polite_get", site):
                self.assertEqual(m.cmd_read(self.args(redo="eggs")), 2)
            self.assertEqual(jsonl.read_bytes(), before)
            self.assertEqual(site.requested, [])
            with mock.patch.object(m, "shop_taken_down", return_value=True), mock.patch.object(m.ic, "polite_get", site):    # taken down: same
                self.assertEqual(m.cmd_read(self.args(redo="eggs")), 2)
            self.assertEqual(jsonl.read_bytes(), before)
            bad = argparse.Namespace(only="eggs", redo="eggs", cache=str(Path(__file__).resolve().parents[2] / "x-cache"), raw_dir=str(self.raw))   # a --cache inside the repo is refused
            with mock.patch.object(m.ic, "polite_get", site):
                self.assertEqual(m.cmd_read(bad), 1)
            self.assertEqual(jsonl.read_bytes(), before)

    def test_a_redo_that_stops_before_reading_a_page_puts_the_old_lines_back(self):
        unit, pages = self.two_page_site()
        jsonl = self.raw / "marks-and-spencer-food.jsonl"
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}):
            with mock.patch.object(m.ic, "polite_get", FakeSite(pages)):
                self.assertEqual(m.cmd_read(self.args()), 0)
            before = sorted(jsonl.read_text().splitlines())
            with mock.patch.object(m.ic, "polite_get", FakeSite(error=m.ic.Blocked("HTTP 429 from u"))):
                self.assertEqual(m.cmd_read(self.args(redo="eggs")), 2)           # stops on the first page of the re-read
            self.assertEqual(sorted(jsonl.read_text().splitlines()), before)       # nothing was lost
            self.assertEqual(sorted(m.load_state(jsonl)[0]), [("eggs", 1), ("eggs", 2)])
            # a re-read that gets page 1 and then stops keeps the new page 1 (the old lines are superseded, the run resumes from page 2)
            def get(url, cache_dir, _calls=[], **kw):
                _calls.append(url)
                if len(_calls) == 1:
                    return pages[url].encode()
                raise m.ic.Blocked("HTTP 429 from u")
            with mock.patch.object(m.ic, "polite_get", get):
                self.assertEqual(m.cmd_read(self.args(redo="eggs")), 2)
            self.assertEqual(sorted(m.load_state(jsonl)[0]), [("eggs", 1)])

    def test_a_reply_cut_short_or_garbled_stops_the_run_with_a_report(self):
        """http.client.IncompleteRead and BadStatusLine are not OSError: they used to end the run with a traceback and no STOPPED line."""
        unit, pages = self.two_page_site()
        for why, err in {"incomplete": http.client.IncompleteRead(b"abc", 100), "bad status line": http.client.BadStatusLine("garbled")}.items():
            with self.subTest(why), mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}):
                (self.raw / "marks-and-spencer-food.jsonl").unlink(missing_ok=True)
                with mock.patch.object(m.ic, "polite_get", FakeSite(pages, error=err)):
                    self.assertEqual(m.cmd_read(self.args()), 2)
                self.assertIn("STOPPED", (self.raw / "marks-and-spencer-food_progress.txt").read_text())
                self.assertNotIn("status: running", (self.raw / "marks-and-spencer-food_progress.txt").read_text())

    def test_a_challenge_page_stops_the_run(self):
        unit, pages = self.two_page_site()
        pages["https://www.marksandspencer.com/food/l/eggs"] = page_html("eggs", 1, [tile(1)], 130, 2, title="Access Denied")
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}), mock.patch.object(m.ic, "polite_get", FakeSite(pages)):
            self.assertEqual(m.cmd_read(self.args()), 2)
        self.assertFalse((self.raw / "marks-and-spencer-food.jsonl").exists() and (self.raw / "marks-and-spencer-food.jsonl").read_text().strip())

    def test_request_cap(self):
        unit = m.Unit("eggs", "Eggs", None)
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}), mock.patch.object(m, "MAX_REQUESTS", 1):
            _, pages = self.two_page_site()
            site = FakeSite(pages)
            with mock.patch.object(m.ic, "polite_get", site):
                self.assertEqual(m.cmd_read(self.args()), 2)
            self.assertEqual(len(site.requested), 1)

    def test_robots_rules_are_checked_before_every_fetch(self):
        unit, pages = self.two_page_site()
        with mock.patch.object(m, "UNITS", [unit]), mock.patch.object(m, "BY_SLUG", {"eggs": unit}):
            with mock.patch.object(m, "preflight", return_value=robots_rfc.parse("User-agent: *\nDisallow: /food/l/\n")):
                site = FakeSite(pages)
                with mock.patch.object(m.ic, "polite_get", site):
                    self.assertEqual(m.cmd_read(self.args()), 2)
                self.assertEqual(site.requested, [])

    def test_a_taken_down_shop_stops_before_any_request(self):
        unit, pages = self.two_page_site()
        site = FakeSite(pages)
        with mock.patch.object(m, "shop_taken_down", return_value=True), mock.patch.object(m.ic, "polite_get", site):
            self.assertEqual(m.cmd_read(self.args()), 2)
        self.assertEqual(site.requested, [])

    def test_preflight_stops_on_a_bad_robots_txt(self):
        class Resp:
            def __init__(self, status, text):
                self.status, self.text = status, text.encode()

            def read(self):
                return self.text

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        self.patches[0].stop()
        try:
            good = REAL_ROBOTS + "Disallow: /food/l/x?pgNumber=2\n"
            with mock.patch.object(m.urllib.request, "urlopen", return_value=Resp(200, good)):
                self.assertEqual(len(m.preflight()), len(robots_rfc.parse(good)))
            for why, text in {"too few rules": "User-agent: *\nDisallow: /a\n", "an AI crawler group": REAL_ROBOTS + "\nUser-agent: ClaudeBot\nDisallow: /\n",
                              "aisles disallowed": REAL_ROBOTS + "Disallow: /food/l/\n", "paging allowed": "User-agent: *\n" + "".join(f"Disallow: /p{i}\n" for i in range(30))}.items():
                with self.subTest(why), mock.patch.object(m.urllib.request, "urlopen", return_value=Resp(200, text)):
                    with self.assertRaises(m.Stop):
                        m.preflight()
            for code in (401, 403, 429, 500):
                with self.subTest(code), mock.patch.object(m.urllib.request, "urlopen", side_effect=urllib.error.HTTPError("u", code, "x", {}, None)):
                    with self.assertRaises(m.Stop):
                        m.preflight()
            for err in (http.client.IncompleteRead(b"x", 5), http.client.BadStatusLine("x")):    # a robots.txt reply cut short is a stop too, not a traceback
                with self.subTest(type(err).__name__), mock.patch.object(m.urllib.request, "urlopen", side_effect=err):
                    with self.assertRaises(m.Stop):
                        m.preflight()
        finally:
            self.patches[0].start()


class PoliteGetTests(unittest.TestCase):
    """A reply cut short (IncompleteRead) or garbled (BadStatusLine) is a dropped connection, like a reset: polite_get asks again twice, then gives up."""

    def test_a_cut_off_reply_is_asked_for_again_twice_then_raised(self):
        class Body:
            def __init__(self, data):
                self.data = data

            def read(self):
                return self.data

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        calls = []

        def flaky(req, timeout=0):
            calls.append(1)
            if len(calls) < 3:
                raise http.client.IncompleteRead(b"ab", 100)
            return Body(b"whole page")

        with tempfile.TemporaryDirectory() as d, mock.patch.object(m.ic, "_robots_allow", return_value=True), mock.patch.object(m.ic.time, "sleep"), \
                mock.patch.object(m.ic.urllib.request, "urlopen", flaky):
            self.assertEqual(m.ic.polite_get("https://www.marksandspencer.com/food/l/eggs", Path(d)), b"whole page")
            self.assertEqual(len(calls), 3)
        calls.clear()
        with tempfile.TemporaryDirectory() as d, mock.patch.object(m.ic, "_robots_allow", return_value=True), mock.patch.object(m.ic.time, "sleep"), \
                mock.patch.object(m.ic.urllib.request, "urlopen", side_effect=http.client.BadStatusLine("garbled")) as opened:
            with self.assertRaises(http.client.BadStatusLine):
                m.ic.polite_get("https://www.marksandspencer.com/food/l/eggs", Path(d))
            self.assertEqual(opened.call_count, 3)


class StateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "x.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def lines(self, *recs):
        return "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs)

    def page_line(self, page=1, tiles=1):
        return {"k": "page", "unit": "eggs", "page": page, "totalItems": 1, "totalPages": 1, "tiles": tiles, "skipped": 0, "checked_on": "2026-10-16"}

    def test_a_title_with_a_unicode_line_separator_is_read_whole(self):
        """str.splitlines() splits on U+2028, U+2029 and U+0085, which json.dumps(ensure_ascii=False) writes raw: the tile used to vanish without an error."""
        titles = ["Two\u2028Lines", "Para\u2029graph", "Next\u0085Line", "Form\x0cFeed", "Vertical\x0bTab", "Plain"]
        recs = [{"k": "tile", "unit": "eggs", "page": 1, **m.read_tile(tile(i, title=t))} for i, t in enumerate(titles)]
        self.path.write_text(self.lines(*recs, self.page_line(tiles=len(titles))), encoding="utf-8")
        pages, tiles = m.load_state(self.path)
        self.assertEqual([t["title"] for t in tiles[("eggs", 1)]], titles)
        self.assertEqual(len(pages), 1)

    def test_forgetting_an_aisle_keeps_the_other_lines_whole_and_returns_what_it_dropped(self):
        other = {"k": "tile", "unit": "meat", "page": 1, **m.read_tile(tile(1, title="Odd\u2028Title"))}
        mine = {"k": "tile", "unit": "eggs", "page": 1, **m.read_tile(tile(2))}
        self.path.write_text(self.lines(other, mine, self.page_line()), encoding="utf-8")
        dropped = m.forget_unit(self.path, "eggs")
        self.assertEqual(len(dropped), 2)
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8").split("\n")[0])["title"], "Odd\u2028Title")
        self.assertTrue(m.restore_unit(self.path, "eggs", dropped))
        self.assertFalse(m.restore_unit(self.path, "eggs", dropped))        # already back: not written twice
        self.assertEqual(len([x for x in self.path.read_text(encoding="utf-8").split("\n") if x]), 3)

    def test_only_a_half_written_last_line_is_forgiven(self):
        tile_line = json.dumps({"k": "tile", "unit": "eggs", "page": 1, **m.read_tile(tile(1))})
        self.path.write_text(self.lines(self.page_line()) + tile_line + '\n{"k": "ti', encoding="utf-8")
        self.assertEqual(len(m.load_state(self.path, repair=False)[0]), 1)       # cut-off last line ignored
        self.path.write_text(self.lines(self.page_line()) + '{"k": "ti\n' + tile_line + "\n", encoding="utf-8")
        with self.assertRaises(SystemExit) as ctx:                                  # a bad line in the middle is a damaged file
            m.load_state(self.path, repair=False)
        self.assertIn("line 2", str(ctx.exception))


class WriteTests(Quiet):
    """`write` on a tiny two-aisle world: dedupe in table order, empty prices, exclusions, priced duplicates, the 98% gate."""

    def setUp(self):
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.raw, self.out, self.cov = d / "raw", d / "food.csv", d / "cov.csv"
        self.raw.mkdir()
        self.exclude, self.priced = d / "exclude.csv", d / "priced.csv"
        self.priced.write_text("product_id,name,price_gbp\nfdp21000001,M&S Rainbow Cake 1 kg,35.00\nfdp60000003,Item 3 100 g,2.00\n", encoding="utf-8")
        self.a, self.b = m.Unit("meat/meat-alternatives", "Meat Alternatives", None), m.Unit("meat", "Meat", 4)
        self.patches = [mock.patch.object(m, n, v) for n, v in {
            "UNITS": [self.a, self.b], "BY_SLUG": {u.slug: u for u in (self.a, self.b)}, "OUT": self.out, "COVERAGE": self.cov, "EXCLUDE": self.exclude,
            "PRICED": self.priced, "ROWS_RANGE": (1, 100)}.items()]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        super().tearDown()

    def add(self, unit, page, tiles, total_items, total_pages, day="2026-10-16"):
        with open(self.raw / "marks-and-spencer-food.jsonl", "a", encoding="utf-8") as f:
            for t in tiles:
                f.write(json.dumps({"k": "tile", "unit": unit.slug, "page": page, **m.read_tile(t)}) + "\n")
            f.write(json.dumps({"k": "page", "unit": unit.slug, "page": page, "totalItems": total_items, "totalPages": total_pages, "first": 1, "last": len(tiles),
                                "tiles": len(tiles), "skipped": 0, "unranged": 0, "priced_tiles": sum(1 for t in tiles if t.get("price")), "checked_on": day, "warnings": []}) + "\n")

    def run_write(self, **kw):
        return m.cmd_write(argparse.Namespace(raw_dir=str(self.raw), dry=kw.get("dry", False), partial=kw.get("partial", False)))

    def rows(self):
        with open(self.out, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def test_write_dedupes_in_table_order_keeps_same_name_ids_and_leaves_prices_empty(self):
        self.add(self.a, 1, [tile(1, title="Plant Chicken", weight="200 g")], 1, 1)
        both = [tile(1, title="Plant Chicken", weight="200 g"), tile(2, title="Frites", weight="300 g", brand="M&S"), tile(4, title="Frites", weight="300 g"),
                tile(5, title="Rainbow Roll", brand="M&S", weight="1 kg", price=9.99)]
        self.add(self.b, 1, both, 4, 1)              # 4 distinct ids against a printed 4
        self.assertEqual(self.run_write(), 0)
        rows = self.rows()
        self.assertEqual([r["product_id"] for r in rows], ["fdp60000001", "fdp60000002", "fdp60000004", "fdp60000005"])
        self.assertEqual(rows[0]["category_path"], "Meat Alternatives")                    # the first aisle to list it gives its category
        self.assertEqual({r["name"] for r in rows if r["product_id"] in ("fdp60000002", "fdp60000004")}, {"M&S Frites 300 g", "Frites 300 g"})
        for r in rows:
            for col in ("price_gbp", "unit_price_gbp", "unit", "member_price_gbp", "member_scheme"):
                self.assertEqual(r[col], "")
            self.assertRegex(r["page_url"], r"^https://www\.marksandspencer\.com/food/[a-z0-9\-_.%]+/p/fdp\d+$")
            self.assertRegex(r["image_url"], r"^https://assets\.digitalcontent\.marksandspencer\.app/image/upload/w_400,q_auto,f_jpg/[0-9a-f]{32}\.jpg$")
            self.assertEqual(r["checked_on"], "2026-10-16")
        with open(self.cov, encoding="utf-8") as f:
            cov = list(csv.DictReader(f))
        self.assertEqual([c["collected_of_printed"] for c in cov], ["collected 1 of 1", "collected 4 of 4"])
        self.assertEqual(cov[1]["new_ids_after_dedupe"], "3")
        self.assertTrue((self.raw / "marks-and-spencer-food_summary.txt").exists())

    def test_a_priced_row_with_the_same_name_is_dropped_and_an_excluded_id_is_dropped(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.add(self.b, 1, [tile(1), tile(3), tile(6, title="Rainbow Cake", brand="M&S", weight="1 kg"), tile(7, title="Rainbow Cake", brand="M&S", weight="2 kg"), tile(8)], 5, 1)
        self.exclude.write_text("product_id,reason\nfdp60000008,not food\n", encoding="utf-8")
        self.assertEqual(self.run_write(), 0)
        ids = [r["product_id"] for r in self.rows()]
        self.assertNotIn("fdp60000008", ids)                 # excluded
        self.assertNotIn("fdp60000003", ids)                 # "Item 3 100 g" is a priced row's name
        self.assertNotIn("fdp60000006", ids)                 # "M&S Rainbow Cake 1 kg" = the priced "M&S Rainbow Cake 1 kg"
        self.assertIn("fdp60000007", ids)                    # "M&S Rainbow Cake 2 kg" is another product
        self.assertIn("fdp60000001", ids)

    def test_an_aisle_that_reaches_less_than_98_percent_stops_the_write(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.add(self.b, 1, [tile(i) for i in range(10, 13)], 4, 1)   # 3 of 4 printed
        self.assertEqual(self.run_write(), 1)
        self.assertFalse(self.out.exists() or self.cov.exists())

    def test_missing_pages_or_aisles_stop_the_write(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.assertEqual(self.run_write(), 1)                           # Meat not read at all
        self.add(self.b, 1, [tile(i) for i in range(10, 14)], 8, 2)     # page 2 of 2 missing
        self.assertEqual(self.run_write(), 1)
        self.assertFalse(self.out.exists())

    def test_the_row_count_sanity_band(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.add(self.b, 1, [tile(i) for i in range(10, 14)], 4, 1)
        with mock.patch.object(m, "ROWS_RANGE", (100, 200)):
            self.assertEqual(self.run_write(), 1)
        self.assertFalse(self.out.exists())
        self.assertEqual(self.run_write(dry=True), 0)
        self.assertFalse(self.out.exists())                              # --dry writes nothing

    def test_partial_write_for_a_crawl_that_stopped(self):
        """A stop rule is never worked round, so a crawl can end with aisles unread: --partial writes what was read and says so, and only then."""
        third = m.Unit("eggs", "Eggs", 36)
        with mock.patch.object(m, "UNITS", [self.a, self.b, third]), mock.patch.object(m, "BY_SLUG", {u.slug: u for u in (self.a, self.b, third)}):
            self.add(self.a, 1, [tile(1)], 1, 1)
            self.add(self.b, 1, [tile(i) for i in range(10, 14)], 8, 2)     # page 2 of 2 never read; Eggs never read
            self.assertEqual(self.run_write(), 1)                           # without --partial nothing is written
            self.assertFalse(self.out.exists())
            self.assertEqual(self.run_write(partial=True), 0)
            self.assertEqual([r["product_id"] for r in self.rows()], ["fdp60000001", "fdp60000010", "fdp60000011", "fdp60000012", "fdp60000013"])
            with open(self.cov, encoding="utf-8") as f:
                cov = list(csv.DictReader(f))
            self.assertEqual([c["status"] for c in cov], ["complete", "partial", "not read"])
            self.assertEqual([c["collected_of_printed"] for c in cov], ["collected 1 of 1", "collected 4 of 8 (stopped after 1 of 2 pages)", "not read"])
            self.assertEqual((cov[1]["pages_loaded"], cov[1]["pages_printed"]), ("1", "2"))
            summary = (self.raw / "marks-and-spencer-food_summary.txt").read_text()
            self.assertIn("PARTIAL", summary)
            self.assertIn("eggs: not read at all", summary)
            self.assertIn("meat: pages [2] of 2 are missing", summary)

    def test_partial_still_holds_a_finished_aisle_to_the_98_percent_gate_and_refuses_an_empty_crawl(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.add(self.b, 1, [tile(i) for i in range(10, 13)], 4, 1)         # a finished aisle with 3 of 4 printed
        self.assertEqual(self.run_write(partial=True), 1)
        self.assertFalse(self.out.exists())
        (self.raw / "marks-and-spencer-food.jsonl").unlink()
        self.assertEqual(self.run_write(partial=True), 1)                   # nothing read at all

    def test_a_page_whose_tile_lines_do_not_add_up_is_never_written_not_even_partially(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.add(self.b, 1, [tile(i) for i in range(10, 14)], 4, 1)
        jsonl = self.raw / "marks-and-spencer-food.jsonl"
        lines = jsonl.read_text(encoding="utf-8").split("\n")
        victim = next(i for i, x in enumerate(lines) if '"fdp' not in x and '"id": "60000011"' in x)
        del lines[victim]                                                  # one tile line lost from a finished page
        jsonl.write_text("\n".join(lines), encoding="utf-8")
        for partial in (False, True):
            self.assertEqual(self.run_write(partial=partial), 1)
            self.assertFalse(self.out.exists() or self.cov.exists())

    def test_a_product_with_no_pack_size_is_listed_by_its_name(self):
        self.add(self.a, 1, [tile(1, title="Pain Aux Raisins", weight="")], 1, 1)
        self.add(self.b, 1, [tile(i) for i in range(10, 14)], 4, 1)
        self.assertEqual(self.run_write(), 0)
        self.assertIn("Pain Aux Raisins", [r["name"] for r in self.rows()])

    def test_partial_cannot_exceed_the_whole_range_band(self):
        self.add(self.a, 1, [tile(1)], 1, 1)
        self.add(self.b, 1, [tile(i) for i in range(10, 14)], 8, 2)
        with mock.patch.object(m, "ROWS_RANGE", (1, 3)):                    # 5 rows: above the top of the band
            self.assertEqual(self.run_write(partial=True), 1)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
