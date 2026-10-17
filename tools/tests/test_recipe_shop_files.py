"""Tests for tools/groceries/build_recipe_shop_files.py. Run: python3 -m unittest discover -s tools/tests"""
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "groceries"))
import build_groceries as bg  # noqa: E402
import build_recipe_shop_files as rsf  # noqa: E402


def ean(body: str) -> str:
    """A GS1-valid EAN/UPC from its digits without the check digit."""
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return body + str((10 - total % 10) % 10)


CODE = ean("500016800150")            # 13 digits, ordinary company prefix
CODE2 = ean("501234567890")
CODE3 = ean("502345678901")
CODE4 = ean("503456789012")
OWN_BRAND = ean("200016800150")       # EAN-13 starting 2: a shop-internal number
PRODUCE = "00000003249833"            # Tesco-style short produce code (GTIN-14 with leading zeros, shop-internal)


def label(kcal=100.0, protein=5.0, carbs=10.0, fat=3.0, sat=None, sugars=None, fibre=1.0, salt=0.1, kj=None, per="g", state=""):
    """A page label whose rows can hold: saturates half the fat and sugars half the carbohydrate unless given."""
    return [kcal, protein, carbs, fat, fat / 2 if sat is None else sat, carbs / 2 if sugars is None else sugars, fibre, salt, kj if kj is not None else round(kcal * 4.184), per, state]


def row(pid, name, price=1.5, gtin="", nutrition=None, *extra):
    return [pid, name, price, None, "", None, None, 0, "", gtin, nutrition, *extra]


def doc(shop, rows, **head):
    return {"v": 1, "retailer": shop, "name": shop.title(), "checkedOn": "2026-10-08", "pageBase": "https://x/", "photoBase": "https://x/",
            "categories": ["Food Cupboard", "Fresh"], "schemes": [], "nutritionCheckedOn": head.pop("nutritionCheckedOn", ""), "products": rows, **head}


def record(gtin, name, kcal=100, protein=5, carbs=10, fat=3, per="g", **more):
    return {"gtin": gtin, "name": name, "brand": "x", "per": per, "kcal": kcal, "protein": protein, "carbs": carbs, "fat": fat, **more}


def pool_of(*rows, proven=None, strict=False):
    return rsf.sainsburys_pool(doc("sainsburys", list(rows), nutritionCheckedOn="2026-10-01"), proven, strict)


def build(rows, pool, records=(), **kw):
    cat = rsf.catalogue_index(list(records))
    return rsf.build_shop("tesco", doc("tesco", rows), pool[0], cat, "2026-10-11", "2026-10-01", pool[1], **kw)


def slots(result):
    out = result[0]
    return {r[0]: r[10] for r in out["products"]} if out else {}


class SainsburysPool(unittest.TestCase):
    def test_a_page_label_is_offered_under_the_normalised_barcode(self):
        pool, stats = pool_of(row("s1", "Heinz Baked Beans 415g", gtin=CODE, nutrition=label(80, 4.7, 12.9, 0.2)))
        self.assertEqual(list(pool), [bg.norm_code(CODE)])
        self.assertEqual(pool[bg.norm_code(CODE)]["label"], label(80, 4.7, 12.9, 0.2))
        self.assertEqual((stats["kept"], stats["restricted"], stats["state"]), (1, 0, 0))

    def test_shop_internal_barcodes_are_never_offered(self):
        pool, stats = pool_of(row("s1", "Sainsbury's Chicken Breast 650g", gtin=OWN_BRAND, nutrition=label(110, 24, 0, 1.5)))
        self.assertEqual(pool, {})
        self.assertEqual(stats["restricted"], 1)
        self.assertIn(bg.norm_code(OWN_BRAND), stats["restricted_codes"])

    def test_states_recipes_cannot_use_are_kept_out_but_remembered(self):
        pool, stats = pool_of(row("s1", "Albert Bartlett Rooster Potatoes 2kg", gtin=CODE, nutrition=label(state="boiled")))
        self.assertEqual(pool, {})
        self.assertEqual(stats["state"], 1)
        self.assertEqual(stats["state_codes"][bg.norm_code(CODE)][0], "boiled")

    def test_a_drained_label_is_offered_with_its_state(self):
        pool, _ = pool_of(row("s1", "Chickpeas in Water 400g (240g*)", gtin=CODE, nutrition=label(120, 7.5, 17, 2.4, state="drained")))
        self.assertEqual(pool[bg.norm_code(CODE)]["label"][10], "drained")

    def test_the_kj_against_kcal_test_is_applied_to_page_labels_and_reported(self):
        # 223 kcal is 933 kJ; the page printed 792 kJ: one of the two is wrong, and the list's own row is not touched
        bad = label(223, 25.7, 0, 13.3, kj=792)
        r = row("goatsbridge-trout", "Goatsbridge Hot Smoked Trout 170g", gtin=CODE, nutrition=bad)
        pool, stats = pool_of(r)
        self.assertEqual(pool, {})
        self.assertEqual(len(stats["kj"]), 1)
        self.assertIn("goatsbridge-trout", stats["kj"][0])
        self.assertEqual(r[10], bad)

    def test_a_kj_failure_is_found_whatever_the_state(self):
        _, stats = pool_of(row("pie", "Young's Fisherman's Pie 300g", gtin=CODE, nutrition=label(115, 6.3, 12.1, 4.4, kj=418, state="baked")))
        self.assertEqual((len(stats["kj"]), stats["state"]), (1, 0))

    def test_two_different_labels_under_one_barcode_offer_neither(self):
        pool, stats = pool_of(row("a", "Heinz Beans 415g", gtin=CODE, nutrition=label(80)), row("b", "Heinz Beans 415g", gtin=CODE, nutrition=label(90)))
        self.assertEqual((pool, stats["ambiguous"]), ({}, 1))
        same, _ = pool_of(row("a", "Heinz Beans 415g", gtin=CODE, nutrition=label(80)), row("b", "Heinz Beans 415g", gtin=CODE, nutrition=label(80)))
        self.assertEqual(len(same), 1)

    def test_a_bad_check_digit_or_no_barcode_is_not_offered(self):
        wrong = CODE[:-1] + str((int(CODE[-1]) + 1) % 10)
        pool, stats = pool_of(row("a", "Heinz Beans 415g", gtin=wrong, nutrition=label()), row("b", "Heinz Beans 400g", nutrition=label()))
        self.assertEqual((pool, stats["bad_barcode"], stats["no_barcode"]), ({}, 1, 1))

    def test_page_barcodes_only_leaves_out_barcodes_paired_by_name(self):
        a, b = row("a", "Heinz Beans 415g", gtin=CODE, nutrition=label()), row("b", "Heinz Soup 400g", gtin=CODE2, nutrition=label())
        proven = {"a": CODE}                                       # only a's own page printed its barcode
        every, s_all = pool_of(a, b, proven=proven)
        strict, s_strict = pool_of(a, b, proven=proven, strict=True)
        self.assertEqual((len(every), len(strict)), (2, 1))
        self.assertEqual((s_all["name_paired_kept"], s_strict["name_paired"]), (1, 1))
        self.assertFalse(every[bg.norm_code(CODE2)]["page"])
        self.assertTrue(every[bg.norm_code(CODE)]["page"])


class JoinRules(unittest.TestCase):
    def setUp(self):
        self.sains = pool_of(row("s1", "Heinz Baked Beans 415g", gtin=CODE, nutrition=label(80, 4.7, 12.9, 0.2, sat=0.1, sugars=4.8, fibre=3.7, salt=0.9)))

    def test_the_identical_barcode_copies_the_label_unchanged_with_no_flag(self):
        r = row("t1", "Heinz Baked Beans 415G", 1.5, "0" + CODE, None, "p/t1", ["asda", "https://x/y.jpg"])   # a GTIN-14 spelling of the same number
        result = build([r], self.sains)
        got = result[0]["products"][0]
        self.assertEqual(got[10], label(80, 4.7, 12.9, 0.2, sat=0.1, sugars=4.8, fibre=3.7, salt=0.9))
        self.assertEqual(len(got[10]), 11)                                   # no 12th element: it is a supermarket's own page label
        self.assertEqual(got[:10], r[:10])
        self.assertEqual(got[11:], ["p/t1", ["asda", "https://x/y.jpg"]])   # page path and borrowed photo ride along unchanged
        self.assertEqual((result[1]["page"], result[1]["community"]), (1, 0))

    def test_a_restricted_barcode_is_not_joined_across_shops(self):
        pool = pool_of(row("s1", "Sainsbury's British Chicken Breast Fillets 640g", gtin=OWN_BRAND, nutrition=label(137, 30.6, 0, 1.6)))
        result = build([row("t1", "Tesco British Chicken Breast Fillets 650g", gtin=OWN_BRAND)], pool)
        self.assertIsNone(result[0])
        self.assertEqual(result[1]["restricted"], 1)
        self.assertEqual(len(result[2]), 1)                                  # listed as held back, with the reason
        self.assertIn("shop-internal", result[2][0][4])

    def test_a_row_with_no_price_no_barcode_or_a_bad_check_digit_is_only_counted(self):
        wrong = CODE[:-1] + str((int(CODE[-1]) + 1) % 10)
        result = build([row("t1", "Heinz Baked Beans 415g", price=None, gtin=CODE), row("t2", "Heinz Baked Beans 415g"), row("t3", "Heinz Baked Beans 415g", gtin=wrong),
                        row("t4", "Heinz Baked Beans 415g", gtin=CODE2)], self.sains)
        self.assertIsNone(result[0])
        self.assertEqual((result[1]["unpriced"], result[1]["no_barcode"], result[1]["bad_barcode"], result[1]["no_label"]), (1, 1, 1, 1))
        self.assertEqual(result[2], [])

    def test_a_community_record_is_flagged_and_copied_as_it_is(self):
        rec = record(CODE2, "Napolina Spaghetti 500g", 356, 12, 72, 1.5, saturates=0.3, sugars=3.5, fibre=3, salt=0.01, kj=1500)
        result = build([row("t1", "Napolina Spaghetti 500G", gtin=CODE2)], self.sains, [rec])
        slot = result[0]["products"][0][10]
        self.assertEqual(slot, [356, 12, 72, 1.5, 0.3, 3.5, 3, 0.01, 1500, "g", "", "c"])
        self.assertEqual((result[1]["community"], result[1]["page"]), (1, 0))
        self.assertEqual(result[0]["communityGeneratedOn"], "2026-10-11")

    def test_a_record_with_missing_optional_rows_keeps_them_null(self):
        result = build([row("t1", "Napolina Spaghetti 500G", gtin=CODE2)], self.sains, [record(CODE2, "Napolina Spaghetti 500g", 356, 12, 72, 1.5)])
        self.assertEqual(result[0]["products"][0][10], [356, 12, 72, 1.5, None, None, None, None, None, "g", "", "c"])

    def test_a_record_whose_name_shares_no_word_is_refused(self):
        result = build([row("t1", "Tesco Free From Raspberry Strawberry Soya Alternative 4X90g", gtin=CODE2)], self.sains, [record(CODE2, "Fromage frais")])
        self.assertIsNone(result[0])
        self.assertEqual(result[1]["name_differs"], 1)
        self.assertEqual(len(result[2]), 1)

    def test_an_implausible_community_record_is_refused(self):
        result = build([row("t1", "Napolina Spaghetti 500G", gtin=CODE2)], self.sains, [record(CODE2, "Napolina Spaghetti 500g", 30, 40, 50, 20)])
        self.assertIsNone(result[0])
        self.assertEqual(result[1]["community_refused"], 1)

    def test_the_shops_own_page_record_counts_as_a_page_label_with_no_flag(self):
        rec = record(CODE2, "Tesco Greek Style Natural Yogurt 1Kg", 99, 3.7, 4.2, 7.5, saturates=5.1, sugars=4.2, fibre=0, salt=0.1, kj=413, source="retailer", checkedOn="2026-10-07")
        result = build([row("t1", "Tesco Greek Style Natural Yogurt 1Kg", gtin=CODE2)], self.sains, [rec])
        self.assertEqual(len(result[0]["products"][0][10]), 11)
        self.assertEqual((result[1]["shop_page"], result[1]["community"]), (1, 0))
        self.assertEqual(result[0]["nutritionCheckedOn"], "2026-10-07")
        self.assertNotIn("communityGeneratedOn", result[0])

    def test_a_shops_own_restricted_number_joins_a_record_within_that_shop_only(self):
        rec = record(PRODUCE, "Blueberries", 57, 0.7, 7.3, 0.2)
        r = row("t1", "Tesco Blueberries 150G", gtin=PRODUCE)
        result = build([r], self.sains, [rec])
        self.assertEqual(result[1]["community_restricted"], 1)
        self.assertEqual(result[0]["products"][0][10][-1], "c")
        none = build([r], self.sains, [rec], allow_restricted_community=False)
        self.assertIsNone(none[0])


class ConflictsAndSources(unittest.TestCase):
    def pair(self, mine, theirs, **rec):
        pool = pool_of(row("s1", "Heinz Baked Beans 415g", gtin=CODE, nutrition=mine))
        return build([row("t1", "Heinz Baked Beans 415G", gtin=CODE)], pool, [record(CODE, "Heinz Baked Beans 415g", **theirs, **rec)])

    def test_sources_that_agree_give_the_page_label_and_never_a_blend(self):
        mine = label(80, 4.7, 12.9, 0.2, sat=0.1, sugars=4.8, fibre=3.7, salt=0.9)
        got = self.pair(mine, dict(kcal=82, protein=4.6, carbs=13, fat=0.3, saturates=9, sugars=9, fibre=9, salt=9))   # the record's extra rows differ: none is mixed in
        self.assertEqual(got[0]["products"][0][10], mine)
        self.assertEqual((got[1]["page"], got[1]["community"], got[1]["conflict"]), (1, 0, 0))

    def test_sources_that_disagree_hold_the_row_back_and_say_why(self):
        got = self.pair(label(100, 5, 10, 3), dict(kcal=140, protein=5, carbs=10, fat=3))
        self.assertIsNone(got[0])
        self.assertEqual(got[1]["conflict"], 1)
        self.assertIn("kcal 100 against 140", got[2][0][4])

    def test_the_thresholds_sit_where_the_docs_say(self):
        def macros(kcal, p, c, f):
            return dict(kcal=kcal, protein=p, carbs=c, fat=f)
        for mine, theirs, conflict in (
            (macros(100, 5, 10, 3), macros(112, 5, 10, 3), False), (macros(100, 5, 10, 3), macros(118, 5, 10, 3), True),    # 15% of the larger figure and more than 10 kcal
            (macros(20, 1, 2, 0), macros(28, 1, 2, 0), False),                                                              # 40% but only 8 kcal: rounding on a low-calorie food
            (macros(100, 10, 10, 2), macros(100, 12.9, 10, 2), False), (macros(100, 10, 10, 2), macros(100, 13.5, 10, 2), True),
            (macros(310, 5, 70, 1), macros(326, 5, 74, 1), False), (macros(100, 5, 20, 1), macros(115, 5, 26, 1), True),    # carbs: 6 g and 23%
            (macros(150, 5, 10, 10), macros(158, 5, 10, 14), False), (macros(150, 5, 10, 10), macros(180, 5, 10, 16), True),   # fat: 4 g, then 6 g and 38%
        ):
            got = self.pair(label(**mine), theirs)
            self.assertEqual(got[0] is None, conflict, (mine, theirs))

    def test_a_different_unit_alone_is_not_a_conflict(self):
        got = self.pair(label(41, 3.4, 4.8, 1.8, per="ml"), dict(kcal=41, protein=3.4, carbs=4.8, fat=1.8, per="g"))
        self.assertEqual(got[0]["products"][0][10][9], "ml")                 # the page's own unit
        self.assertEqual((got[1]["conflict"], got[1]["unit_note"]), (0, 1))

    def test_a_drained_page_label_is_used_and_the_stateless_record_ignored(self):
        mine = label(120, 7.5, 17, 2.4, state="drained")
        got = self.pair(mine, dict(kcal=84, protein=5.2, carbs=11, fat=1.6))
        self.assertEqual(got[0]["products"][0][10], mine)
        self.assertEqual((got[1]["drained_community_ignored"], got[1]["conflict"]), (1, 0))

    def test_a_cooked_page_label_stops_a_stateless_record_being_trusted(self):
        pool = pool_of(row("s1", "Albert Bartlett Rooster Potatoes 2kg", gtin=CODE, nutrition=label(75, 1.8, 16, 0.1, state="boiled")))
        got = build([row("t1", "Albert Bartlett Rooster Potatoes 2kg", gtin=CODE)], pool, [record(CODE, "Albert Bartlett Rooster Potatoes 2kg", 75, 1.8, 16, 0.1)])
        self.assertIsNone(got[0])
        self.assertEqual(got[1]["state_blocked"], 1)
        self.assertEqual(len(got[2]), 1)

    def test_a_page_label_is_enough_when_there_is_no_record_and_a_record_when_there_is_no_label(self):
        pool = pool_of(row("s1", "Heinz Baked Beans 415g", gtin=CODE, nutrition=label(80, 4.7, 12.9, 0.2)))
        got = build([row("t1", "Heinz Baked Beans 415G", gtin=CODE), row("t2", "Napolina Spaghetti 500G", gtin=CODE2)], pool, [record(CODE2, "Napolina Spaghetti 500g")])
        self.assertEqual({r[0]: len(r[10]) for r in got[0]["products"]}, {"t1": 11, "t2": 12})

    def test_a_sainsburys_product_with_an_unrelated_name_is_refused(self):
        pool = pool_of(row("s1", "Philadelphia Original Soft Cheese 165g", gtin=CODE, nutrition=label(230, 5, 4, 22)))
        got = build([row("t1", "Fray Bentos Steak Pie 425g", gtin=CODE)], pool)
        self.assertIsNone(got[0])
        self.assertEqual(got[1]["name_differs"], 1)

    def test_optional_rows_that_cannot_hold_are_left_out_not_corrected(self):
        pool = pool_of(row("s1", "Heinz Baked Beans 415g", gtin=CODE, nutrition=label(80, 4.7, 12.9, 0.2, sat=0.9, sugars=20, fibre=3.7, salt=0.9)))
        slot = build([row("t1", "Heinz Baked Beans 415G", gtin=CODE)], pool)[0]["products"][0][10]
        self.assertEqual((slot[4], slot[5], slot[6], slot[7]), (None, None, 3.7, 0.9))   # saturates above fat, sugars above carbohydrate
        self.assertEqual(slot[:4], [80, 4.7, 12.9, 0.2])                                  # the four main numbers are never touched


class RunFiles(unittest.TestCase):
    def make_root(self, d: Path):
        (d / "all").mkdir(parents=True)
        sains = doc("sainsburys", [row("s1", "Heinz Baked Beans 415g", gtin=CODE, nutrition=label(80, 4.7, 12.9, 0.2)),
                                  row("s2", "Napolina Spaghetti 500g", gtin=CODE2, nutrition=label(351, 12, 70, 1.5)),
                                  row("s3", "Rubbish", gtin=CODE3)], nutritionCheckedOn="2026-10-01")
        tesco = doc("tesco", [row("t0", "Something with no label 100g", gtin=CODE3), row("t1", "Heinz Baked Beans 415G", 1.5, CODE, None, "p/t1"),
                              row("t2", "Napolina Spaghetti 500G", gtin=CODE2), row("t3", "Tesco Fresh Carrots 1kg"), row("t5", "Dolmio Bolognese Sauce 500G", gtin=CODE4)],
                    photoTemplate="https://x/{photo}", pageSearch=True)
        asda = doc("asda", [row("a1", "Unlabelled thing 1kg")])
        for shop, d_ in (("sainsburys", sains), ("tesco", tesco), ("asda", asda)):
            (d / "all" / f"{shop}.json").write_text(json.dumps(d_))
        (d / "tesco.json").write_text(json.dumps({"v": 1, "retailer": "tesco", "generatedOn": "2026-10-11", "products": [record(CODE2, "Napolina Spaghetti 500g", 355, 12, 71, 1.5),
                                                                                                                    record(CODE4, "Dolmio Bolognese Sauce 500g", 60, 1.5, 9, 2)]}))
        manifest = {"v": 1, "retailers": [{"id": s, "name": s, "file": f"{s}.json", "count": 1, "checkedOn": "x", "nutrition": 0, "priced": 1, "sha256": "00"} for s in ("sainsburys", "tesco", "asda")]}
        manifest["retailers"][2]["recipe"] = {"file": "asda.json", "count": 5, "own": 1, "sha256": "stale"}         # a leftover from an older build
        (d / "all" / "all-manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
        return d

    def run_in(self, d: Path, **kw):
        return rsf.run(d, d / "report", proven={"s1": CODE, "s2": CODE2}, quiet=True, **kw)

    def test_files_manifest_and_report_are_written(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.make_root(Path(t))
            res = self.run_in(d)
            self.assertEqual((res["tesco"]["page"], res["tesco"]["community"], res["tesco"]["no_label"], res["tesco"]["no_barcode"]), (2, 1, 1, 1))
            text = (d / "recipe" / "tesco.json").read_text()
            f = json.loads(text)
            self.assertEqual([r[0] for r in f["products"]], ["t1", "t2", "t5"])                    # list order, only labelled rows
            self.assertEqual([k for k in f if k != "products"], [k for k in json.loads((d / "all" / "tesco.json").read_text()) if k != "products"] + ["communityGeneratedOn"])
            self.assertEqual((f["photoTemplate"], f["pageSearch"], f["categories"]), ("https://x/{photo}", True, ["Food Cupboard", "Fresh"]))
            self.assertEqual(f["nutritionCheckedOn"], "2026-10-01")
            self.assertEqual(f["products"][0][11], "p/t1")
            m = {r["id"]: r for r in json.loads((d / "all" / "all-manifest.json").read_text())["retailers"]}
            self.assertEqual(m["tesco"]["recipe"], {"file": "tesco.json", "count": 3, "own": 2, "sha256": hashlib.sha256(text.encode()).hexdigest()})
            self.assertNotIn("recipe", m["sainsburys"])
            self.assertNotIn("recipe", m["asda"])                                                  # no labelled row: no file, and the stale entry is gone
            self.assertFalse((d / "recipe" / "asda.json").exists())
            self.assertEqual({k: v for k, v in m["tesco"].items() if k != "recipe"}, {"id": "tesco", "name": "tesco", "file": "tesco.json", "count": 1, "checkedOn": "x",
                                                                                      "nutrition": 0, "priced": 1, "sha256": "00"})                # the list's own entry is untouched
            self.assertIn("Recipe shop files", (d / "report" / "report.txt").read_text())
            self.assertTrue((d / "report" / "held-back.csv").read_text().startswith("shop,product_id,name,barcode,reason,detail"))

    def test_the_output_is_deterministic_and_the_lists_are_not_touched(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.make_root(Path(t))
            before = {p.name: p.read_bytes() for p in (d / "all").glob("*.json") if p.name != "all-manifest.json"}
            self.run_in(d)
            first = ((d / "recipe" / "tesco.json").read_bytes(), (d / "all" / "all-manifest.json").read_bytes(), (d / "report" / "held-back.csv").read_bytes())
            self.run_in(d)
            self.assertEqual(first, ((d / "recipe" / "tesco.json").read_bytes(), (d / "all" / "all-manifest.json").read_bytes(), (d / "report" / "held-back.csv").read_bytes()))
            self.assertEqual(before, {p.name: p.read_bytes() for p in (d / "all").glob("*.json") if p.name != "all-manifest.json"})

    def test_page_barcodes_only_changes_which_labels_are_offered(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.make_root(Path(t))
            rsf.run(d, None, page_barcodes_only=True, proven={"s1": CODE}, quiet=True)             # s2's barcode came from a name twin, not its page
            f = json.loads((d / "recipe" / "tesco.json").read_text())
            self.assertEqual({r[0]: len(r[10]) for r in f["products"]}, {"t1": 11, "t2": 12, "t5": 12})      # t2 falls back to the record


class PublishedFiles(unittest.TestCase):
    """The files in web/public/groceries/recipe agree with the lists and the manifest they were built from (rebuild with build_recipe_shop_files.py)."""

    def test_every_published_recipe_file_matches_its_manifest_entry_and_its_list(self):
        allp = rsf.GROCERIES / "all"
        manifest = json.loads((allp / "all-manifest.json").read_text())
        shops = {r["id"]: r for r in manifest["retailers"] if r.get("recipe")}
        self.assertEqual(set(shops), set(rsf.RECIPE_SHOPS))
        for shop, entry in shops.items():
            e = entry["recipe"]
            raw = (rsf.GROCERIES / "recipe" / e["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), e["sha256"], shop)
            f = json.loads(raw)
            self.assertEqual(len(f["products"]), e["count"], shop)
            self.assertEqual(sum(1 for r in f["products"] if len(r[10]) == 11), e["own"], shop)
            listed = {r[0]: r for r in json.loads((allp / entry["file"]).read_text())["products"]}
            self.assertEqual({k: v for k, v in f.items() if k not in ("products", "nutritionCheckedOn", "communityGeneratedOn")},
                             {k: v for k, v in json.loads((allp / entry["file"]).read_text()).items() if k not in ("products", "nutritionCheckedOn")}, shop)
            seen = set()
            for r in f["products"]:
                src = listed[r[0]]                                                                  # every row is a row of the list ...
                self.assertEqual(r[:10], src[:10], (shop, r[0]))                                    # ... copied unchanged,
                self.assertEqual(r[11:], src[11:], (shop, r[0]))
                self.assertGreater(r[2], 0)                                                         # ... with a price,
                self.assertIsNone(rsf.label_problem(r[10]), (shop, r[0], r[10]))                    # ... and a label that passes the same tests as the catalogue's,
                self.assertIn(len(r[10]), (11, 12), (shop, r[0]))
                self.assertTrue(len(r[10]) == 11 or r[10][11] == "c")
                self.assertIn(r[10][10], rsf.USABLE_STATES)
                self.assertTrue(rsf.valid_barcode(r[9]), (shop, r[0]))
                seen.add(r[0])
            self.assertEqual(len(seen), len(f["products"]), shop)                                   # ... once
            self.assertEqual(sum(1 for r in f["products"] if len(r[10]) == 12), e["count"] - e["own"], shop)

    def test_no_published_row_borrows_a_shop_internal_barcode_from_sainsburys(self):
        allp = rsf.GROCERIES / "all"
        sains = {bg.norm_code(r[9]): r for r in json.loads((allp / "sainsburys.json").read_text())["products"] if r[9] and r[10]}
        for shop in rsf.RECIPE_SHOPS:
            for r in json.loads((rsf.GROCERIES / "recipe" / f"{shop}.json").read_text())["products"]:
                if bg.restricted_code(r[9]) and bg.norm_code(r[9]) in sains and len(r[10]) == 11:
                    self.fail(f"{shop} {r[0]}: a page label under a shop-internal barcode that Sainsbury's also has")


if __name__ == "__main__":
    unittest.main()
