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


if __name__ == "__main__":
    unittest.main()
