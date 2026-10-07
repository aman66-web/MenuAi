"""Tests for tools/groceries/build_groceries.py. Run: python3 -m unittest discover -s tools/tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "groceries"))
import build_groceries as bg  # noqa: E402

GOOD = {
    "code": "5012345678900", "product_name": "  Greek   Style Yogurt ", "brands": "Aldi, Mamia", "quantity": "500 g",
    "nutriments": {"energy-kcal_100g": 97, "proteins_100g": 9, "carbohydrates_100g": 4.2, "fat_100g": 5, "saturated-fat_100g": 3.4, "sugars_100g": 4.1, "salt_100g": 0.1, "energy-kj_100g": 405.6},
    "allergens_tags": ["en:milk"], "traces_tags": ["en:nuts", "en:milk"], "ingredients_text": "milk",
    "image_front_url": "https://images.openfoodfacts.org/images/products/501/234/567/8900/front_en.12.400.jpg",
    "categories_tags": ["en:dairies", "en:fermented-milk-products", "en:yogurts"], "last_modified_t": 1759000000,
}


class GroceryTests(unittest.TestCase):
    def convert(self, **changes):
        p = json.loads(json.dumps(GOOD))
        for k, v in changes.items():
            if k == "nutriments":
                p["nutriments"].update(v)
            else:
                p[k] = v
        reasons: dict = {}
        return bg.convert(p, reasons), reasons

    def test_barcode_check_digit(self):
        self.assertTrue(bg.gtin_ok("5012345678900"))
        self.assertTrue(bg.gtin_ok("96385074"))  # a valid EAN-8
        self.assertFalse(bg.gtin_ok("5012345678901"))
        self.assertFalse(bg.gtin_ok("abc"))
        self.assertFalse(bg.gtin_ok("123"))

    def test_a_good_product_is_copied_as_given(self):
        item, _ = self.convert()
        self.assertEqual((item["gtin"], item["name"], item["brand"], item["size"], item["per"]), ("5012345678900", "Greek Style Yogurt", "Aldi, Mamia", "500 g", "g"))
        self.assertEqual((item["kcal"], item["protein"], item["carbs"], item["fat"]), (97, 9, 4.2, 5))
        self.assertEqual((item["saturates"], item["sugars"], item["salt"], item["kj"]), (3.4, 4.1, 0.1, 406))
        self.assertEqual(item["image"], "501/234/567/8900/front_en.12")
        self.assertEqual(item["category"], "dairy-eggs")
        self.assertEqual(item["allergens"], {"contains": ["milk"], "mayContain": ["nuts"]})  # trace milk is already "contains"

    def test_missing_or_implausible_numbers_are_left_out_never_filled(self):
        for changes, why in [
            ({"nutriments": {"proteins_100g": None}}, "kcal, protein, carbs or fat missing"),
            ({"nutriments": {"energy-kcal_100g": None}}, "kcal, protein, carbs or fat missing"),
            ({"nutriments": {"fat_100g": 70, "proteins_100g": 40}}, "implausible numbers"),
            ({"nutriments": {"energy-kcal_100g": 600}}, "energy doesn't match macros (check)"),
            ({"code": "5012345678901"}, "invalid barcode"),
            ({"product_name": ""}, "no usable name"),
        ]:
            with self.subTest(why=why):
                item, reasons = self.convert(**changes)
                self.assertIsNone(item)
                self.assertEqual(list(reasons), [why])

    def test_unknown_allergens_stay_unknown_not_none(self):
        item, _ = self.convert(allergens_tags=[], traces_tags=[], ingredients_text="", ingredients_text_en="")
        self.assertIsNone(item["allergens"])
        item, _ = self.convert(allergens_tags=[], traces_tags=[], ingredients_text="water, salt")
        self.assertEqual(item["allergens"], {"contains": [], "mayContain": []})  # ingredients recorded, no allergen tags

    def test_drinks_are_per_100_ml_and_extra_allergens_map_to_our_keys(self):
        item, _ = self.convert(quantity="1.5 litres", allergens_tags=["en:soybeans", "en:sulphur-dioxide-and-sulphites", "en:sesame-seeds", "en:something-else"])
        self.assertEqual(item["per"], "ml")
        self.assertEqual(item["allergens"]["contains"], ["sesame", "soya", "sulphites"])

    def test_serving_values_only_when_the_database_gives_all_four(self):
        item, _ = self.convert(serving_size="30 g", serving_quantity=30, nutriments={"energy-kcal_serving": 29, "proteins_serving": 2.7, "carbohydrates_serving": 1.3, "fat_serving": 1.5})
        self.assertEqual(item["serving"], {"size": "30 g", "kcal": 29, "protein": 2.7, "carbs": 1.3, "fat": 1.5})
        item, _ = self.convert(serving_size="30 g", serving_quantity=30, nutriments={"energy-kcal_serving": 29})
        self.assertNotIn("serving", item)

    def test_shouted_names_get_ordinary_capitals_but_mixed_case_is_untouched(self):
        self.assertEqual(bg.tidy("FLAMEGRILLED ROAST CHICKEN BREAST SLICES"), "Flamegrilled Roast Chicken Breast Slices")
        self.assertEqual(bg.tidy("TESCO"), "Tesco")
        self.assertEqual(bg.tidy("MACARONI AND CHEESE WITH BACON"), "Macaroni and Cheese with Bacon")
        self.assertEqual(bg.tidy("Ben's Original rice"), "Ben's Original rice")
        self.assertEqual(bg.tidy("M&S"), "M&S")  # too short to tell: left alone
        self.assertEqual(bg.tidy("KING'S PRAWNS"), "King's Prawns")

    def test_junk_names_are_left_out(self):
        for name in ["t out 1016 TESCO CHICKEN PASTE QUICK & TASTY of th", "", "x" * 101, "12345"]:
            with self.subTest(name=name):
                item, reasons = self.convert(product_name=name)
                self.assertIsNone(item)
        item, _ = self.convert(product_name="Tesco Finest 12 Smoked Salmon Slices")
        self.assertIsNotNone(item)

    def test_the_most_specific_category_tag_wins(self):
        self.assertEqual(bg.category_for(["en:beverages-and-beverages-preparations", "en:sauces", "en:pickles", "en:sandwich-pickles"]), "cupboard")
        self.assertEqual(bg.category_for(["en:dairies", "en:cheeses", "en:frozen-foods"]), "frozen")

    def test_categories(self):
        self.assertEqual(bg.category_for(["en:frozen-foods", "en:pizzas"]), "frozen")
        self.assertEqual(bg.category_for(["en:beverages", "en:waters"]), "drinks")
        self.assertEqual(bg.category_for(["en:chicken-breast"]), "meat")
        self.assertEqual(bg.category_for(["en:unknown-thing"]), "other")
        self.assertEqual(bg.category_for([]), "other")

    def test_prices_need_a_valid_barcode_https_page_and_date(self):
        tmp = Path(tempfile.mkdtemp())
        orig = bg.ROOT
        try:
            (tmp / "data" / "groceries" / "prices").mkdir(parents=True)
            (tmp / "data" / "groceries" / "prices" / "aldi.csv").write_text(
                "gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on\n"
                "5012345678900,1.25,0.25,100g,https://www.aldi.co.uk/p/1,2026-10-07\n"
                "5012345678900x,1.25,,,https://www.aldi.co.uk/p/1,2026-10-07\n"
                "5012345678900,0,,,https://www.aldi.co.uk/p/1,2026-10-07\n"
                "5012345678900,1.25,,,http://insecure,2026-10-07\n")
            bg.ROOT = tmp
            problems: list = []
            prices = bg.read_prices("aldi", problems)
        finally:
            bg.ROOT = orig
        self.assertEqual(prices, {"5012345678900": {"amount": 1.25, "url": "https://www.aldi.co.uk/p/1", "checkedOn": "2026-10-07", "perUnit": {"amount": 0.25, "unit": "100g"}}})
        self.assertEqual(len(problems), 3)


class DetailsTests(unittest.TestCase):
    def item(self, **over):
        item = {"gtin": "5012345678900", "name": "Greek Style Yogurt", "brand": "Mamia", "size": "500 g", "per": "g", "kcal": 97, "protein": 9, "carbs": 4.2, "fat": 5,
                "saturates": 3.4, "sugars": 4.1, "salt": 0.1, "kj": 406, "serving": {"size": "100 g", "kcal": 97, "protein": 9, "carbs": 4.2, "fat": 5}}
        item.update(over)
        return item

    def row(self, **over):
        d = {"gtin": "5012345678900", "name_on_page": "Sainsbury's Mini Potatoes 750g", "pack_size": "750g", "ingredients": "Potatoes", "allergy_advice": "None",
             "nutrition_basis": "per 100g", "energy_kj": "300kJ", "energy_kcal": "72kcal", "fat_g": "0.2g", "saturates_g": "<0.1g", "carbs_g": "15.5g", "sugars_g": "1.1g", "fibre_g": "2.0g",
             "protein_g": "2.0g", "salt_g": "0.01g", "other_nutrients": "Starch: 14g", "per_portion_text": "Serving 175g: 126 kcal", "in_stock": "yes",
             "page_url": "https://www.sainsburys.co.uk/gol-ui/product/x", "checked_on": "2026-10-07"}
        d.update(over)
        return d

    def test_the_shops_exact_name_and_its_own_numbers_win(self):
        it, notes = self.item(), {}
        bg.apply_details(it, self.row(), notes)
        self.assertEqual(it["name"], "Sainsbury's Mini Potatoes 750g")
        self.assertEqual(it["size"], "750g")
        self.assertEqual((it["kcal"], it["protein"], it["carbs"], it["fat"]), (72, 2, 15.5, 0.2))
        self.assertEqual(it["source"], "retailer")
        self.assertEqual(it["ingredients"], "Potatoes")
        self.assertEqual(it["advice"], "None")
        self.assertEqual(it["other"], "Starch: 14g")
        self.assertEqual(it["portion"], "Serving 175g: 126 kcal")
        self.assertTrue(it["inStock"])
        self.assertEqual((it["pageUrl"], it["checkedOn"]), ("https://www.sainsburys.co.uk/gol-ui/product/x", "2026-10-07"))
        self.assertNotIn("serving", it)  # the community per-serving numbers are not mixed in
        self.assertEqual(it["kj"], 300)
        self.assertEqual(notes["differs"], 1)  # 97 kcal in the community data vs 72 on the shop's page

    def test_optional_numbers_the_shop_does_not_print_are_dropped_not_kept_from_the_community_data(self):
        it, notes = self.item(), {}
        bg.apply_details(it, self.row(saturates_g="", sugars_g="", salt_g="", energy_kj=""), notes)
        for k in ("saturates", "sugars", "salt", "kj"):
            self.assertNotIn(k, it)

    def test_numbers_are_replaced_only_when_per_100_in_the_same_unit_complete_and_plausible(self):
        for change, key in (({"nutrition_basis": "per portion only"}, None), ({"nutrition_basis": "per 100ml"}, "basis"), ({"protein_g": ""}, "incomplete"), ({"energy_kcal": "900", "fat_g": "1"}, "implausible")):
            it, notes = self.item(), {}
            bg.apply_details(it, self.row(**change), notes)
            self.assertEqual(it["kcal"], 97, change)       # the community numbers stay
            self.assertNotIn("source", it)
            self.assertEqual(it["name"], "Sainsbury's Mini Potatoes 750g")  # but the shop's name and text still apply
            if key:
                self.assertEqual(notes[key], 1)

    def test_text_that_is_too_long_is_left_out_not_cut(self):
        it = self.item()
        bg.apply_details(it, self.row(ingredients="x " * 2000), {})
        self.assertNotIn("ingredients", it)

    def test_details_rows_need_a_valid_barcode_https_page_and_date(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "data" / "groceries" / "details").mkdir(parents=True)
            cols = ["gtin", "name_on_page", "page_url", "checked_on"]
            rows = ["5012345678900,Good,https://x.example/a,2026-10-07", "5012345678901,Bad barcode,https://x.example/b,2026-10-07", "5012345678900,No https,http://x.example/c,2026-10-07", "5012345678900,Bad date,https://x.example/d,07/10/2026"]
            (root / "data" / "groceries" / "details" / "tesco.csv").write_text(",".join(cols) + "\n" + "\n".join(rows) + "\n")
            old = bg.ROOT
            bg.ROOT = root
            try:
                problems: list = []
                got = bg.read_details("tesco", problems)
            finally:
                bg.ROOT = old
        self.assertEqual(list(got), ["5012345678900"])
        self.assertEqual(len(problems), 3)

    def test_available_carbohydrate_printed_in_the_other_rows_is_the_carbohydrate(self):
        it, notes = self.item(), {}
        bg.apply_details(it, self.row(energy_kcal="473kcal", protein_g="6.1g", fat_g="20.5g", carbs_g="", other_nutrients="Available Carbohydrate: 62.9g; * Reference intake"), notes)
        self.assertEqual(it["carbs"], 62.9)
        self.assertEqual(it["source"], "retailer")

    def test_numbers_are_read_as_the_page_prints_them(self):
        for raw, want in (("365kJ", 365), ("87 kcal", 87), ("0.5g", 0.5), ("1,982", 1982), ("12mg", 12), ("<0.1g", 0), ("< 0.5", 0), ("4.4", 4.4), ("", None), ("trace", None), ("n/a", None), ("12 apples", None)):
            self.assertEqual(bg.printed_num(raw), want, raw)

    def test_a_less_than_value_counts_as_zero_and_the_ingredients_heading_is_dropped(self):
        it = self.item()
        bg.apply_details(it, self.row(), {})
        self.assertEqual(it["saturates"], 0)
        it2 = self.item()
        bg.apply_details(it2, self.row(ingredients="INGREDIENTS: Potatoes, Salt."), {})
        self.assertEqual(it2["ingredients"], "Potatoes, Salt.")

    def test_the_most_specific_category_is_the_type(self):
        self.assertEqual(bg.type_for(["en:dairies", "en:milks", "en:semi-skimmed-milks"]), "semi-skimmed-milks")
        self.assertIsNone(bg.type_for([]))


class PriceFileTests(unittest.TestCase):
    def read(self, body: str):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "data" / "groceries" / "prices").mkdir(parents=True)
            (root / "data" / "groceries" / "prices" / "tesco.csv").write_text(body)
            old = bg.ROOT
            bg.ROOT = root
            try:
                problems: list = []
                return bg.read_prices("tesco", problems), problems
            finally:
                bg.ROOT = old

    HEAD = "gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on,member_price_gbp,member_scheme,member_offer_ends\n"

    def test_the_regular_price_and_the_card_price_are_both_kept(self):
        prices, problems = self.read(self.HEAD + "5012345678900,1.50,3.00,per kg,https://www.tesco.com/p/1,2026-10-07,1.20,Clubcard Price,until 13 Oct\n")
        self.assertEqual(problems, [])
        self.assertEqual(prices["5012345678900"]["amount"], 1.5)
        self.assertEqual(prices["5012345678900"]["member"], {"amount": 1.2, "scheme": "Clubcard Price", "ends": "until 13 Oct"})

    def test_a_card_price_that_is_not_below_the_regular_price_or_has_no_card_name_is_ignored_and_reported(self):
        prices, problems = self.read(self.HEAD + "5012345678900,1.50,,,https://www.tesco.com/p/1,2026-10-07,1.60,Clubcard Price,\n5012345678900,1.50,,,https://www.tesco.com/p/1,2026-10-07,1.20,,\n")
        self.assertNotIn("member", prices["5012345678900"])
        self.assertEqual(len(problems), 2)

    def test_files_without_card_columns_still_work(self):
        prices, problems = self.read("gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on\n5012345678900,1.50,3.00,per kg,https://www.tesco.com/p/1,2026-10-07\n")
        self.assertEqual(problems, [])
        self.assertNotIn("member", prices["5012345678900"])


if __name__ == "__main__":
    unittest.main()
