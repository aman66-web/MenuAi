"""Tests for tools/groceries/build_groceries.py. Run: python3 -m unittest discover -s tools/tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "groceries"))
import build_groceries as bg  # noqa: E402
import fetch_retailer_images as fri  # noqa: E402
import select_stored_photos as ssp  # noqa: E402
import build_all_products as bap  # noqa: E402
import t2_sainsburys as t2  # noqa: E402

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
        self.assertNotIn("image", item)  # no Open Food Facts picture, ever (founder 2026-10-10): only the shop's own photo is shown
        self.assertEqual(item["category"], "dairy-eggs")
        self.assertEqual(item["allergens"], {"contains": ["milk"], "mayContain": ["nuts"]})  # trace milk is already "contains"

    def test_missing_or_implausible_numbers_are_left_out_never_filled(self):
        for changes, why in [
            ({"nutriments": {"proteins_100g": None}}, "kcal, protein, carbs or fat missing"),
            ({"nutriments": {"energy-kcal_100g": None}}, "kcal, protein, carbs or fat missing"),
            ({"nutriments": {"fat_100g": 70, "proteins_100g": 40}}, "implausible numbers"),
            ({"nutriments": {"energy-kcal_100g": 600}}, "energy doesn't match macros (check)"),
            ({"nutriments": {"energy-kj_100g": 2000}}, "kJ and kcal disagree"),
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
        bg.apply_details(it, self.row(energy_kj="1980kJ", energy_kcal="473kcal", protein_g="6.1g", fat_g="20.5g", carbs_g="", other_nutrients="Available Carbohydrate: 62.9g; * Reference intake"), notes)
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
        self.assertIsNone(bg.type_for(["en:plant-based-foods-and-beverages", "en:plant-based-foods"]))  # an umbrella is not a kind of product to compare with

    def test_umbrella_tags_no_longer_send_foods_to_the_wrong_type(self):
        umbrella = ["en:plant-based-foods-and-beverages", "en:plant-based-foods"]
        self.assertEqual(bg.category_for(umbrella + ["en:olive-tree-products", "en:olives", "en:green-olives"]), "cupboard")   # was Drinks
        self.assertEqual(bg.category_for(umbrella + ["en:meat-alternatives", "en:tofu"]), "meat-alternatives")                 # was Drinks
        self.assertEqual(bg.category_for(umbrella + ["en:seeds", "en:sunflower-seeds"]), "cupboard")
        self.assertEqual(bg.category_for(umbrella + ["en:cereals-and-potatoes", "en:cereals-and-their-products", "en:doughs", "en:puff-pastry-sheets"]), "bakery")  # was Breakfast
        self.assertEqual(bg.category_for(umbrella + ["en:cereals-and-their-products", "en:durum-wheat-semolinas-for-couscous"]), "cupboard")
        self.assertEqual(bg.category_for(umbrella), "other")

    def test_clear_type_rules_put_products_in_the_right_type(self):
        cases = {
            "crunchy-peanut-butters": "cupboard", "easter-eggs": "snacks-sweets", "scotch-eggs": "ready-meals", "salad-creams": "cupboard",
            "vegetarian-sausages": "meat-alternatives", "vegetarian-hot-dog-sausages": "meat-alternatives", "chicken-kievs-substitutes": "meat-alternatives",
            "chicken-tikka-masala": "ready-meals", "beef-dishes": "ready-meals", "butter-chicken-with-side-dishes": "ready-meals",
            "apple-pies": "bakery", "brioches": "bakery", "panettone": "bakery", "spring-rolls": "ready-meals", "prawn-crackers": "snacks-sweets",
            "puffed-rice-cakes": "snacks-sweets", "fish-cakes": "fish", "pickled-onions": "cupboard", "caster-sugars": "cupboard", "amber-maple-syrups": "cupboard",
            "vegetarian-lasagne": "ready-meals", "fruits-in-syrup": "fruit-veg", "puff-pastry-meals": "ready-meals", "meat-pies": "ready-meals", "chocolate-covered-biscuits": "bakery",
            "semi-skimmed-milks": "dairy-eggs", "chicken-breasts": "meat",
        }
        for tag, group in cases.items():
            self.assertEqual(bg.category_for([f"en:{tag}"]), group, tag)
        # a rule never catches a food only because of what it is in or with: the general tags above it still decide
        for parent, tag, group in (("fishes", "sardines-in-olive-oil", "fish"), ("fishes", "mackerel-fillets-with-tomato-sauce", "fish"),
                                   ("dairy-substitutes", "cheese-substitutes", "dairy-eggs")):
            self.assertIsNone(bg.tag_group(tag), tag)
            self.assertEqual(bg.category_for([f"en:{parent}", f"en:{tag}"]), group, tag)
        self.assertIsNone(bg.tag_group("meat-in-puff-pastry"))  # a sausage roll is not pastry sheets

    def test_a_built_product_is_moved_only_by_a_specific_rule_on_its_type(self):
        self.assertEqual(bg.recategorise({"category": "drinks", "type": "green-olives"}), "cupboard")
        self.assertEqual(bg.recategorise({"category": "meat", "type": "vegetarian-sausages"}), "meat-alternatives")
        self.assertEqual(bg.recategorise({"category": "frozen", "type": "vegetarian-sausages"}), "frozen")       # frozen came from a tag no longer kept
        self.assertEqual(bg.recategorise({"category": "drinks", "type": "plant-based-foods"}), "other")          # an umbrella type says nothing
        self.assertEqual(bg.recategorise({"category": "snacks-sweets", "type": "mixed-nuts-and-dried-fruits"}), "snacks-sweets")  # word rules: kept as built
        self.assertEqual(bg.recategorise({"category": "other"}), "other")
        self.assertIn("meat-alternatives", bg.CATEGORY_LABELS)


class ShopRuleTests(unittest.TestCase):
    """A supermarket's own-brand product is listed only under that supermarket (founder 2026-10-10: "some brands are just mixed up")."""

    def test_brand_entries_and_names_name_the_shop(self):
        claims = lambda brand, name="x": bg.shop_claims(brand, name)[0]
        self.assertEqual(claims("Coop, Sainsbury's, Cano"), {"coop", "sainsburys"})
        self.assertEqual(claims("Stockwell & Co"), {"tesco"})
        self.assertEqual(claims("Ms Molly's (Tesco), Tesco"), {"tesco"})
        self.assertEqual(claims("Sainsbury's, Taste the difference"), {"sainsburys"})
        self.assertEqual(claims("Taste The Difference"), {"sainsburys"})
        self.assertEqual(claims("M&S Food"), {"marks-and-spencer"})
        self.assertEqual(claims("Marks & Spencers"), {"marks-and-spencer"})
        self.assertEqual(claims("Essential Waitrose"), {"waitrose"})
        self.assertEqual(claims("No.1"), {"waitrose"})
        self.assertEqual(claims("Asda Extra Special"), {"asda"})
        self.assertEqual(claims("Extra Special"), {"asda"})
        self.assertEqual(claims("The Best"), {"morrisons"})
        self.assertEqual(claims("Dulano, Lidl"), {"lidl"})
        self.assertEqual(claims("Iceland"), {"iceland"})
        self.assertEqual(claims("Trader Joe's, Taste the difference"), {"other:trader-joes", "sainsburys"})
        # other firms' brands, and labels other firms also use, name no shop
        for brand in ("Kirsty's", "No1 Living", "Wickedly Welsh", "Deluxe", "Specially Selected", "Jumbo", "Icelandic Provisions", "Snack a Jacks", "Scoop", "Rinaldi", ""):
            self.assertEqual(claims(brand), set(), brand)
        self.assertEqual(bg.shop_claims("Co Op, Tesco", "Co-op Cherryade"), ({"coop", "tesco"}, {"coop"}))
        self.assertEqual(bg.shop_claims("", "Tesco Finest Smoked Salmon")[1], {"tesco"})
        self.assertEqual(bg.shop_claims("", "Iceland Cod Fillets")[1], set())  # Iceland is also a country: only a whole brand entry names that shop

    def test_a_claim_on_a_barcode_the_shop_could_not_have_issued_is_not_believed(self):
        self.assertEqual(bg.believed_claims("3023290001349", "Tesco", "Milky bar")[0], set())          # a French barcode typed in as "Tesco"
        self.assertEqual(bg.believed_claims("7610900037322", "Emmi, Sainsbury's", "Biopot")[0], set())  # a Swiss one
        self.assertEqual(bg.believed_claims("4056489737551", "Dulano, Lidl", "Antipasto")[0], {"lidl"})  # Lidl's German barcodes are its own
        self.assertEqual(bg.believed_claims("5000128962575", "Coop", "Greek yogurt")[0], {"coop"})
        self.assertEqual(bg.believed_claims("00113168", "Sainsbury's", "Petit pois")[0], {"sainsburys"})  # a shop's own short code
        self.assertEqual(bg.believed_claims("0288508002355", "Tesco finest", "Cheddar")[0], {"tesco"})     # an in-store weighed-goods number

    def test_company_prefixes(self):
        self.assertEqual(bg.company_prefix("5059697123459"), "5059697")
        self.assertEqual(bg.company_prefix("05063250552526"), "5063250")   # GTIN-14 written as EAN-13
        self.assertEqual(bg.company_prefix("00113168"), "8:00")             # EAN-8: its first two digits
        self.assertIsNone(bg.company_prefix("0288508002355"))               # in-store numbers belong to no one company
        self.assertIsNone(bg.company_prefix("2028429900007"))
        self.assertIsNone(bg.company_prefix("20284299"))

    def test_prefixes_are_learned_from_the_catalogue_only_when_clear(self):
        claims = {f"505969700{i:03d}0": {"tesco"} for i in range(9)} | {"5059697999990": set()}   # 9 of 10 name Tesco: 90%
        claims |= {f"500012800{i:03d}0": {"coop"} for i in range(2)}                                # only 2: too few
        claims |= {f"5010251000{i:02d}0": ({"sainsburys"} if i % 2 else {"morrisons"}) for i in range(8)}  # split: no owner
        learned = bg.learn_prefixes(claims)
        self.assertEqual(learned, {"5059697": ("tesco", 9)})

    def test_decisions(self):
        d = bg.decide_shops
        self.assertEqual(d({"sainsburys"}, {"coop"}, set(), None, set())[0], {"coop"})                       # moved to its own shop
        self.assertEqual(d({"tesco", "sainsburys"}, {"sainsburys"}, set(), None, set())[0], {"sainsburys"})  # taken off the other shop
        self.assertEqual(d({"sainsburys"}, {"other:eurospin"}, set(), None, set())[0], set())                # a shop abroad: listed by none of ours
        self.assertEqual(d({"sainsburys"}, {"coop", "sainsburys"}, set(), None, set())[0], set())            # can't tell: held back
        self.assertEqual(d({"sainsburys"}, {"coop", "sainsburys"}, set(), ("coop", 4), set())[0], {"coop"})  # the barcode prefix tells
        self.assertEqual(d({"tesco"}, {"coop", "tesco"}, {"coop"}, None, set())[0], {"coop"})                 # the name starts with one of them
        self.assertEqual(d({"tesco"}, {"asda"}, set(), ("tesco", 15), set())[0], set())                      # brand and barcode disagree: held back
        self.assertEqual(d({"sainsburys"}, set(), set(), ("tesco", 19), set())[0], {"sainsburys"})           # a prefix alone moves only when well proven
        self.assertEqual(d({"sainsburys"}, set(), set(), ("tesco", 20), set())[0], {"tesco"})
        self.assertEqual(d({"tesco"}, set(), set(), None, {"sainsburys"})[0], {"tesco", "sainsburys"})        # a shop's own website lists it: added
        self.assertEqual(d({"tesco"}, {"iceland"}, set(), None, {"sainsburys"})[0], {"tesco", "sainsburys"})  # ...even when the brand says otherwise
        self.assertEqual(d({"tesco", "sainsburys"}, {"sainsburys", "tesco"}, set(), None, {"sainsburys"})[0], {"sainsburys"})
        self.assertEqual(d({"tesco"}, set(), set(), None, set())[0], {"tesco"})                               # a branded product stays where it is

    def test_assign_shops_moves_copies_and_holds_back(self):
        rec = lambda gtin, brand, name, **x: {"gtin": gtin, "brand": brand, "name": name, "kcal": 1, "protein": 1, "carbs": 1, "fat": 1, **x}
        by_rid = {
            "tesco": [rec("5000128962575", "Coop", "Greek yogurt", price={"amount": 1}, retailerImage="https://x"),  # Co-op's: moved, without Tesco's price or photo
                      rec("00113168", "Sainsbury's", "Petit pois"),                                                  # Sainsbury's: only there
                      rec("5000116125838", "Birds Eye", "Fish fingers"),                                             # branded, on Sainsbury's own website: added there
                      rec("5059697000010", "Tesco", "Beans")],
            "sainsburys": [rec("00113168", "Sainsbury's", "Petit pois"), rec("5010251733911", "Sainsbury's, Eurospin", "Cucumber")],  # can't tell: held back
            "coop": [],
        }
        log: dict = {}
        out = bg.assign_shops(by_rid, {bg.norm_code("5000116125838"): {"sainsburys"}}, log)
        self.assertEqual([p["gtin"] for p in out["tesco"]], ["5000116125838", "5059697000010"])
        self.assertEqual(sorted(p["gtin"] for p in out["sainsburys"]), ["00113168", "5000116125838"])
        self.assertEqual([p["gtin"] for p in out["coop"]], ["5000128962575"])
        self.assertNotIn("price", out["coop"][0])
        self.assertNotIn("retailerImage", out["coop"][0])
        self.assertEqual(log["moves"][("sainsburys", "removed", "held back: its brand and barcode name different supermarkets")], 1)
        self.assertFalse(any("_keep" in p for items in out.values() for p in items))


class ShopPhotoTests(unittest.TestCase):
    """The shop's own picture is joined to a barcode by exact identifiers only; a name can only stop a picture, never choose one."""

    def write(self, root: Path, rel: str, text: str):
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_barcode_to_page_to_picture(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            img = lambda n: f"https://digitalcontent.api.tesco.com/v2/media/ghs/{n}.jpeg?h=225&w=225"
            self.write(base, "discovery/tesco-barcodes.csv", "product_id,gtin\n111,5012345678900\n")
            self.write(base, "discovery/tesco.csv", f"product_id,name_on_page,price_gbp,unit_price_gbp,unit,category_path,page_url,image_url,in_stock,checked_on\n111,Tesco Greek Yogurt 500g,1,1,kg,x,https://www.tesco.com/groceries/en-GB/products/111,{img('a')},yes,2026-10-07\n")
            self.write(base, "prices/tesco.csv", "gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on\n5012345678917,1.00,,,https://www.tesco.com/groceries/en-GB/products/222,2026-10-07\n")
            header = "product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on\n"
            self.write(base, "listing/tesco.csv", header + f"222,Tesco Cottage Cheese 300g,1,,,,,x,https://www.tesco.com/groceries/en-GB/products/222,{img('b')},2026-10-09\n"
                       f"333,Tesco Plain Skyr 450g,1,,,,,x,https://www.tesco.com/groceries/en-GB/products/333,{img('c')},2026-10-09\n")
            pages = bg.shop_pages("tesco", base)
            self.assertEqual(pages[bg.norm_code("5012345678900")]["photos"], [(img("a"), "Tesco Greek Yogurt 500g")])
            self.assertEqual(pages[bg.norm_code("5012345678917")]["photos"], [(img("b"), "Tesco Cottage Cheese 300g")])   # price row's page -> listing row
            self.assertNotIn(bg.norm_code("5012345678924"), pages)  # page 333 has no barcode anywhere: never matched by its name
            products = [{"gtin": "5012345678900", "name": "Greek Style Yogurt"}, {"gtin": "5012345678917", "name": "Whey Protein"}, {"gtin": "5012345678924", "name": "Plain Skyr"}]
            rejected: set = set()
            skipped: dict = {}
            self.assertEqual(bg.apply_retailer_images("tesco", products, {}, skipped, pages=pages, rejected=rejected), 1)
            self.assertEqual(products[0]["retailerImage"], img("a"))
            self.assertNotIn("retailerImage", products[1])   # the shop's page for that barcode names a different product
            self.assertNotIn("retailerImage", products[2])
            self.assertEqual(rejected, {bg.norm_code("5012345678917")})
            self.assertEqual(len(skipped["names disagree"]), 1)

    def test_names_can_only_stop_a_picture(self):
        self.assertFalse(bg.names_agree("Coockies", "Cherry Tomatoes 500g"))
        self.assertFalse(bg.names_agree("Whole Scottish Porridge Oats", "Sainsbury's Vegetable Lasagne 400g"))
        self.assertTrue(bg.names_agree("Medium Eggs", "The Happy Egg Co. Free Range Medium x6"))
        self.assertTrue(bg.names_agree("Cous Cous", "Tesco Finest Moroccan Inspired Couscous 200g"))
        self.assertTrue(bg.names_agree("Mature Chedder", "Cathedral City Mature Cheddar 350g"))
        self.assertIsNone(bg.names_agree("Tesco Finest", "Something"))  # nothing to compare

    def test_a_rejected_picture_has_no_stored_copy_either(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d) / "photos"
            folder.mkdir()
            (folder / "0123456789ab.webp").write_bytes(b"x")
            csv_path = Path(d) / "sainsburys.csv"
            csv_path.write_text("gtin,image_url,page_url,checked_on,file\n5012345678900,https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg,https://www.sainsburys.co.uk/groceries/product/x,2026-10-08,0123456789ab.webp\n")
            products = [{"gtin": "5012345678900"}]
            self.assertEqual(bg.apply_stored_photos("sainsburys", products, [], rejected={"5012345678900"}, folder=folder, path=csv_path), 0)
            self.assertNotIn("photo", products[0])

    def test_tesco_listing_pictures_are_rebuilt_as_the_crawl_says(self):
        import ingest_listing as il
        u = "ghs/63de2b2b-9761-46fb-a709-d05b6298e588/695a3010-3d7c-4391-a2da-95dd49641046"
        self.assertEqual(il.image_url("tesco", u + "_1469833947"), f"https://digitalcontent.api.tesco.com/v2/media/{u}_1469833947.jpeg?h=225&w=225")
        self.assertEqual(il.image_url("tesco", u), f"https://digitalcontent.api.tesco.com/v2/media/{u}.jpeg?h=225&w=225")
        self.assertEqual(il.image_url("tesco", "ghs-mktg/b0b04216-fa73-466d-a9d7-c9fcfa1ce9b3/no-image"), "")   # Tesco's own "no image" tile
        self.assertEqual(il.image_url("tesco", "NOIMG"), "")


class OtherShopListTests(unittest.TestCase):
    """Asda, Aldi and Lidl lists (founder 2026-10-11): picture addresses, unit prices, page paths, types."""

    def test_listing_pictures_units_and_offer_notes(self):
        import ingest_listing as il
        self.assertEqual(il.image_url("asda", "20337087"), "https://asdagroceries.scene7.com/is/image/asdagroceries/20337087")
        self.assertEqual(il.image_url("aldi", "b55a9555-b044-484b-b1a0-9b4490319df5"),
                         "https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/b55a9555-b044-484b-b1a0-9b4490319df5/image")
        self.assertEqual(il.image_url("aldi", "not-a-uuid"), "")
        self.assertEqual(il.image_url("lidl", "uk/1/ABC.jpg"), "")  # a storage key, not an address: the photo comes from the product page
        self.assertEqual(il.unit_basis("1 KG"), (1, "per kg"))
        self.assertEqual(il.unit_basis("100 G"), (10, "per kg"))
        self.assertAlmostEqual(il.unit_basis("75 CL")[0], 1 / 0.75)
        self.assertEqual(il.unit_basis("per litre"), (1, "per litre"))
        self.assertEqual(il.unit_basis("per 10g"), (100, "per kg"))
        self.assertEqual(il.unit_basis("1 Each"), (1, "each"))
        self.assertIsNone(il.unit_basis("pomegranate"))
        with tempfile.TemporaryDirectory() as d:
            raw = Path(d) / "aldi_listing.txt"
            raw.write_text("#CAT fresh-food/fruit | https://x | tiles 2\n"
                           "339805|NATURE'S PICK Apple 200 g|0.99|0.50|100 G|||note:While Stock Lasts|a1189ed0-b092-48d6-9bb2-debff6e5ff11\n"
                           "672124|NATURE'S PICK Avocado|0.69||||||\n")
            rows, _, problems = il.parse("aldi", [str(raw)], "2026-10-08", None)
        self.assertEqual(problems, [])
        apple = rows["339805"]
        self.assertEqual((apple["price_gbp"], apple["member_price_gbp"], apple["unit_price_gbp"], apple["unit"]), ("0.99", "", "5", "per kg"))
        self.assertEqual(rows["672124"]["image_url"], "")

    def build(self, shop: str, rows: list[str], pages=None, photos=None):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / f"{shop}.csv"
            path.write_text("product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on\n" + "\n".join(rows) + "\n")
            problems: list = []
            doc = bap.build_shop(shop, problems, path=path, gtins={}, nutrition={}, pages=pages or {}, photos=photos or {})
        return doc, problems

    def test_asda_template_search_links_and_types(self):
        doc, problems = self.build("asda", [
            "165468,ASDA Semi Skimmed Milk 4 Pints,1.65,0.726,per litre,,,Chilled Food > Milk | Chilled Food > Dairy,,https://asdagroceries.scene7.com/is/image/asdagroceries/20337087,2026-10-08",
            "1,Out of stock,,,,,,Bakery > Bread,,https://asdagroceries.scene7.com/is/image/asdagroceries/1234,2026-10-08",
            "2,Foreign photo,1.00,,,,,? > ?,,https://evil.example.com/x.jpg,2026-10-08"])
        self.assertEqual(problems, [])
        milk, foreign = doc["products"]
        self.assertEqual((milk[8], doc["categories"][milk[7]], len(milk)), ("20337087", "Chilled Food", 11))
        self.assertEqual((foreign[8], doc["categories"][foreign[7]]), ("", "Other"))       # only the shop's own picture host
        self.assertTrue(doc["pageSearch"])
        self.assertIn("{photo}", doc["photoTemplate"])

    def test_aldi_page_paths_and_main_aisle(self):
        doc, _ = self.build("aldi", [
            "340660002,NATURE'S PICK Apple + Grape Snack Pack,0.39,,,,,christmas-new-year/party | fresh-food/fruit,,https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/b55a9555-b044-484b-b1a0-9b4490319df5/image,2026-10-08",
            "9,Seasonal only,1.00,,,,,halloween/sweets,,,2026-10-08"],
            pages={"340660002": "nature-s-pick-apple-grape-snack-pack-000000000340660002"})
        snack, seasonal = doc["products"]
        self.assertEqual(snack[8], "b55a9555-b044-484b-b1a0-9b4490319df5")
        self.assertEqual(snack[11], "nature-s-pick-apple-grape-snack-pack-000000000340660002")
        self.assertEqual(doc["categories"][snack[7]], "Fresh Food")                        # the main aisle wins over a seasonal one
        self.assertEqual((doc["categories"][seasonal[7]], len(seasonal)), ("Halloween", 11))

    def test_lidl_photos_from_product_pages_and_offer_only_rows_left_out(self):
        img = "https://imgproxy-retcat.assets.schwarz/DqDe/sm:0/w:1500/h:1125/cz/M6Ly9w.jpg"
        doc, _ = self.build("lidl", [
            "p10052648,KULJANKA Vegetable Salad,1.49,3.47,per kg,,,Food & Drink / Food Cupboard | Offers / Pick of the Week,,,2026-10-08",
            "p99,Next week's deal,2.99,,,,,Offers / Pick of the Week (NEXT WEEK),,,2026-10-08"],
            pages={"p10052648": "kuljanka-vegetable-salad-with-white-cabbage/p10052648"}, photos={"p10052648": img})
        self.assertEqual([p[0] for p in doc["products"]], ["p10052648"])
        salad = doc["products"][0]
        self.assertEqual((salad[8], doc["categories"][salad[7]]), (img[len("https://imgproxy-retcat.assets.schwarz/"):], "Food Cupboard"))

    def test_sitemap_and_og_image_readers(self):
        import shop_pages as sp
        import lidl_photos as lp
        xml = ("<url><loc>https://www.aldi.co.uk/product/nature-s-pick-apple-000000000340660002</loc></url>"
               "<url><loc>https://www.aldi.co.uk/products/fresh-food/k/1</loc></url>")
        self.assertEqual(sp.page_paths("aldi", xml), {"340660002": "nature-s-pick-apple-000000000340660002"})
        self.assertEqual(sp.page_paths("lidl", "<loc>https://www.lidl.co.uk/p/marmite/p10000037</loc>"), {"p10000037": "marmite/p10000037"})
        page = '<meta property="og:image" content="https://imgproxy-retcat.assets.schwarz/Dq/sm:0/w:1500/cz/M6Ly9w.jpg">'
        self.assertEqual(lp.og_image(page), "https://imgproxy-retcat.assets.schwarz/Dq/sm:0/w:1500/cz/M6Ly9w.jpg")
        self.assertEqual(lp.og_image('<meta property="og:image" content="https://evil.example.com/x.jpg">'), "")

    def test_lidl_everyday_range_without_a_price(self):
        """Lidl's own product pages (lidl_range.py): a product its page prints no price for is listed as "Price in store", for Lidl only."""
        head = "product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on"
        img = "https://imgproxy-retcat.assets.schwarz/mn0Ye/sm:0/w:1500/cz/M6Ly9w.jpg"
        with tempfile.TemporaryDirectory() as d:
            listing, more = Path(d) / "lidl.csv", Path(d) / "lidl-range.csv"
            listing.write_text(head + "\np10052648,KULJANKA Vegetable Salad,1.49,3.47,per kg,1.29,Lidl Plus,Food & Drink / Food Cupboard,,,2026-10-08\n"
                               "p10056233,Pomegranate [Each],0.65,,,,,Offers / Pick of the Week,,,2026-10-08\n")
            more.write_text(head + ",availability\n"
                            "p10052648,KULJANKA Vegetable Salad,1.59,,,,,Food & Drink / Food Cupboard,https://www.lidl.co.uk/p/kuljanka/p10052648,,2026-10-11,Available in store now\n"
                            f"p10003405,Spinach,,,,,,Food & Drink / Frozen,https://www.lidl.co.uk/p/spinach/p10003405,{img},2026-10-11,Available in store now\n"
                            "p10000001,Odd page,,,,,,Food & Drink / Bakery,https://evil.example.com/p/x/p10000001,,2026-10-11,Available in store now\n"
                            "p10056233,Pomegranate,0.65,,,,,Food & Drink / Fruit & veg,https://www.lidl.co.uk/p/pomegranate/p10056233,,2026-10-11,Available in store now\n")
            problems: list = []
            doc = bap.build_shop("lidl", problems, path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more, exclude=set())
            hidden = bap.build_shop("lidl", problems, path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more, exclude={("lidl", "p10003405")})
            asda = bap.build_shop("asda", problems, path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more)
        rows = {r[0]: r for r in doc["products"]}
        self.assertEqual(sorted(rows), ["p10000001", "p10003405", "p10052648", "p10056233"])
        self.assertEqual((rows["p10056233"][1], rows["p10056233"][2], rows["p10056233"][11]), ("Pomegranate", 0.65, "pomegranate/p10056233"))  # an offer-page-only row gives way to its own page
        self.assertEqual(rows["p10052648"][2], 1.49)                 # the category page's row wins (offer and Lidl Plus price)
        self.assertEqual(rows["p10052648"][5], 1.29)
        spinach = rows["p10003405"]
        self.assertEqual((spinach[2], spinach[3], spinach[5]), (None, None, None))   # no price printed: nothing estimated
        self.assertEqual((spinach[8], spinach[11]), (img[len("https://imgproxy-retcat.assets.schwarz/"):], "spinach/p10003405"))
        self.assertEqual(doc["categories"][spinach[7]], "Frozen")
        self.assertEqual(len(rows["p10000001"]), 11)                # a page address that isn't Lidl's own is not used
        self.assertNotIn("p10003405", [r[0] for r in asda["products"]])   # every other shop: no price printed -> not listed
        self.assertEqual(next(r for r in hidden["products"] if r[0] == "p10003405")[8], "")   # a photo on listing-exclude.csv is not shown

    def test_lidl_page_reader(self):
        import lidl_range as lr
        offer = '"offers":[{"@type":"Offer",{price}"priceCurrency":"GBP","itemCondition":"NewCondition","availability":"InStoreOnly"}]'
        page = ('<meta property="og:title" content="Spinach - Lidl">'
                '"categoryPrimary":"Food","wonCategoryPrimary":"Worlds of need/Food and near food/Frozen food (Frozen food)/Frozen Fruit &amp; Vegetables"'
                '<h1 class="heading__title" data-qa-label="keyfacts-title" data-v-1>Spinach </h1>' + offer.replace("{price}", "") +
                '{"text":90,"type":91},"Available in store now","IN_STORE_TODAY_DATE_RANGE",'
                '<meta property="og:image" content="https://imgproxy-retcat.assets.schwarz/mn0Ye/sm:0/w:1500/cz/M6Ly9w.jpg">')
        r = lr.parse("https://www.lidl.co.uk/p/spinach/p10003405", "p10003405", page)
        self.assertEqual((r["name"], r["category"], r["price"], r["availability"]), ("Spinach", "Food", "", "Available in store now"))
        self.assertEqual(lr.aisle_of(r["won"]), "Frozen")
        self.assertTrue(lr.on_sale(r))
        priced = lr.parse("u", "p1", page.replace(offer.replace("{price}", ""), offer.replace("{price}", '"price":1.49,')))
        self.assertEqual(priced["price"], "1.49")
        self.assertIsNone(lr.aisle_of("Worlds of need/Pet supplies/Dog food"))
        self.assertIsNone(lr.aisle_of("Worlds of need/Food and near food/Drugstore & Personal Care/Hair Care", "Cien Herbal Shampoo"))
        self.assertIsNone(lr.aisle_of("Worlds of need/Living & Furnishing/Decoration", "Deluxe Botanical Candle"))
        self.assertIsNone(lr.aisle_of("Worlds of need/Food and near food/Baby & Child/Baby Care", "Baby Wipes"))
        self.assertEqual(lr.aisle_of("Worlds of need/Food and near food/Baby & Child/Baby Food & Formula", "Organic Baby Banana & Apple Pouch"), "Baby Food & Formula")
        self.assertEqual(lr.aisle_of("Worlds of need/Food and near food/Drugstore & Personal Care/Vitamins & Sports Nutrition", "Milbona High Protein Drink"), "Sports Nutrition")
        self.assertIsNone(lr.aisle_of("Worlds of need/Food and near food/Drugstore & Personal Care/Vitamins & Sports Nutrition", "Vitamin C Effervescent Tablets"))
        self.assertEqual(lr.aisle_of("Worlds of need/Food and near food/Candy & Snacks/Nuts", "Alesto Walnuts"), "Confectionery & Snacks")
        self.assertFalse(lr.on_sale({"availability": ""}))
        self.assertTrue(lr.on_sale({"availability": "In store from 15.10", "checked_on": "2026-10-11"}))
        self.assertTrue(lr.on_sale({"availability": "In store from 18.10", "checked_on": "2026-10-11"}))
        self.assertTrue(lr.on_sale({"availability": "In store from 01.10", "checked_on": "2026-10-11"}))
        self.assertFalse(lr.on_sale({"availability": "In store from 19.11", "checked_on": "2026-10-11"}))
        self.assertTrue(lr.on_sale({"availability": "In store from 02.01", "checked_on": "2026-12-28"}))


class MoreShopListTests(unittest.TestCase):
    """Tesco, Waitrose, Morrisons, Iceland and M&S lists (founder 2026-10-11: "all the grocery stores, all the items ... only groceries")."""

    def test_listing_lines_of_each_shop(self):
        import ingest_listing as il
        with tempfile.TemporaryDirectory() as d:
            mor = Path(d) / "morrisons_listing.txt"
            mor.write_text("#CAT fruit-veg/fruit | https://x | tiles 3\n"
                           "1|Explore Sable Seedless Grapes|1.50|3.75|kg||||b41f9f6e-707e-4e0a-8296-8981b52f8d62|400g\n"
                           "2|Morrisons Blueberries 150g Punnet|2.00|13.33|kg|2.40|16.00|More Card|7cda084e-d45b-4fea-b7a9-ab6cc4545ed8|150g\n"
                           "3|King Prawns|2.30|28.75|kg|||MCd To Go Meal Deal for £3.65|20d1020e-d392-430a-bf99-2a3dbbc303c2|80g\n"
                           "4|Fyffes Bananas 5 Pack|0.78|0.156|item||||20d1020e-d392-430a-bf99-2a3dbbc303c2/7cda084e-d45b-4fea-b7a9-ab6cc4545ed8|5 per pack\n")
            rows, _, problems = il.parse("morrisons", [str(mor)], "2026-10-08", None)
            self.assertEqual(problems, [])
            self.assertEqual(rows["1"]["name"], "Explore Sable Seedless Grapes 400g")          # the tile's size line follows the name
            self.assertEqual(rows["2"]["name"], "Morrisons Blueberries 150g Punnet")           # already there: not repeated
            self.assertEqual((rows["2"]["price_gbp"], rows["2"]["member_price_gbp"]), ("2.40", "2.00"))
            self.assertEqual((rows["3"]["price_gbp"], rows["3"]["member_price_gbp"]), ("2.30", ""))  # a meal deal is not a card price
            self.assertEqual(rows["4"]["unit"], "each")
            self.assertEqual(rows["1"]["image_url"], "https://groceries.morrisons.com/images-v3/4b85987b-1398-4173-a0c1-3546047c9d74/b41f9f6e-707e-4e0a-8296-8981b52f8d62/300x300.jpg")
            self.assertTrue(rows["4"]["image_url"].endswith("/20d1020e-d392-430a-bf99-2a3dbbc303c2/7cda084e-d45b-4fea-b7a9-ab6cc4545ed8/300x300.jpg"))

            wai = Path(d) / "waitrose_listing.txt"
            wai.write_text("#CAT bakery/fresh_bread | https://x | tiles 2\n"
                           "065131-33004-33005|Waitrose Baguette|1.10|4.40|kg||||D\n"
                           "604336-502747-502748|No.1 Salted Caramel Tart Typical weight 945g|14.50|15.34|kg||||D\n")
            rows, _, problems = il.parse("waitrose", [str(wai)], "2026-10-08", None)
            self.assertEqual(list(rows), ["065131-33004-33005"])                               # an estimated loose-item price is never shown
            self.assertEqual(len(problems), 1)
            self.assertEqual(rows["065131-33004-33005"]["image_url"], "https://ecom-su-static-prod.wtrecom.com/images/products/9/LN_065131_BP_9.jpg")

            ice = Path(d) / "iceland_listing.txt"
            ice.write_text("#CAT Frozen > frozen-pies | https://x | tiles 3\n"
                           "89177|Slimming World Salt & Pepper Chow Mein 550g|4.00|7.27|kg||||iceland/slimming_world_salt_&_pepper_chicken_chow_mein_550g_89177.jpg\n"
                           "/p/iceland-majestics-334g/B60037.html|Iceland 4 Majestics 334g|3.00|0.9|per 100 gram||||iceland/B60037_Majestics_12\n"
                           "101294||9.00|10.00|kg||||iceland.a.bigcontent.io/v1/static/icelandloading\n")
            rows, _, problems = il.parse("iceland", [str(ice)], "2026-10-09", None)
            self.assertEqual(len(problems), 1)                                                   # no name: left out
            self.assertEqual(rows["89177"]["image_url"], "https://assets.iceland.co.uk/i/iceland/slimming_world_salt_%26_pepper_chicken_chow_mein_550g_89177.jpg")
            self.assertEqual((rows["B60037"]["page_url"], rows["B60037"]["unit_price_gbp"], rows["B60037"]["unit"]),
                             ("https://www.iceland.co.uk/p/x/B60037.html", "9", "per kg"))

            ms = Path(d) / "marks-and-spencer_listing.txt"
            ms.write_text("#CAT Food to order > Cakes | https://x | tiles 2\n"
                          "ckp60095316|M&S Rainbow Cake (Serves 12)|35||||||a:SD_FD_F09A_00346825_NC_X_EC_0\n"
                          "pb44706492|Whole Bronze Turkey|72|||135||MULTI|a:MS_FD_F01C_29426669_NC_X_EC_0\n"
                          "#CAT Food to order > Cakes > Birthday cakes | https://y | tiles 1\n"
                          "K|ckp60095316\n")
            rows, _, problems = il.parse("marks-and-spencer", [str(ms)], "2026-10-09", None)
            self.assertEqual(list(rows), ["ckp60095316"])                                      # two prices without "was": no single price
            cake = rows["ckp60095316"]
            self.assertEqual(cake["category_path"], ["Food to order > Cakes", "Food to order > Cakes > Birthday cakes"])
            self.assertEqual(cake["image_url"], "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/SD_FD_F09A_00346825_NC_X_EC_0")

    def build(self, shop: str, rows: list[str]):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / f"{shop}.csv"
            path.write_text("product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on\n" + "\n".join(rows) + "\n")
            problems: list = []
            doc = bap.build_shop(shop, problems, path=path, gtins={}, nutrition={}, pages={}, photos={})
        return doc, problems

    def test_aisles_photos_pages_and_groceries_only(self):
        doc, _ = self.build("waitrose", [
            "065131-33004-33005,Waitrose Baguette,1.10,4.4,per kg,,,bakery/fresh_bread,,https://ecom-su-static-prod.wtrecom.com/images/products/9/LN_065131_BP_9.jpg,2026-10-08",
            "1-2-3,Talking Tables 16 Gold Candles Each,3.00,,,,,bakery/cakes,,,2026-10-08",
            "2-3-4,Candles Celebration Cake each,20.00,,,,,bakery/cakes,,,2026-10-08"])
        self.assertEqual([p[1] for p in doc["products"]], ["Waitrose Baguette", "Candles Celebration Cake each"])  # candles out; a cake named after them stays
        bread = doc["products"][0]
        self.assertEqual((bread[8], doc["categories"][bread[7]], doc["pageSearch"]), ("065131", "Bakery", True))
        self.assertEqual(doc["photoTemplate"].replace("{photo}", bread[8]), "https://ecom-su-static-prod.wtrecom.com/images/products/11/LN_065131_BP_11.jpg")
        doc, _ = self.build("morrisons", ["1,Morrisons Chicken Breast Fillets 300g,3.00,10,per kg,,,meat-fish/chicken,,"
                                          "https://groceries.morrisons.com/images-v3/4b85987b-1398-4173-a0c1-3546047c9d74/b41f9f6e-707e-4e0a-8296-8981b52f8d62/300x300.jpg,2026-10-08"])
        self.assertEqual(doc["categories"], ["Meat & Fish"])
        self.assertEqual(doc["products"][0][8], "4b85987b-1398-4173-a0c1-3546047c9d74/b41f9f6e-707e-4e0a-8296-8981b52f8d62")
        doc, _ = self.build("iceland", ["87650,Iceland Chicken Breast Fillets 600g,4.00,6.67,per kg,,,Frozen > frozen-meat-and-chicken,https://www.iceland.co.uk/p/x/87650.html,"
                                        "https://assets.iceland.co.uk/i/iceland/iceland_chicken_breast_fillets_600g_87650.jpg,2026-10-09"])
        chicken = doc["products"][0]
        self.assertEqual((chicken[8], chicken[11], doc["categories"]), ("iceland/iceland_chicken_breast_fillets_600g_87650.jpg", "87650.html", ["Frozen"]))
        doc, _ = self.build("tesco", ["300734646,Tesco Finest Cherries 300G,4.40,14.67,per kg,,,fresh-food > fresh-fruit,,"
                                      "https://digitalcontent.api.tesco.com/v2/media/ghs/01071426-3898-47d0-ae3b-4a8567fbedf2/90b7413d-097d-4d94-a921-000000000000_1.jpeg?h=225&w=225,2026-10-09",
                                      "1,Tesco White Roses Flowers Bouquet,5.00,,,,,fresh-food > fresh-vegetables-and-fresh-flowers,,,2026-10-09"])
        self.assertEqual([p[1] for p in doc["products"]], ["Tesco Finest Cherries 300G"])
        self.assertEqual((doc["products"][0][8], doc["categories"]), ("ghs/01071426-3898-47d0-ae3b-4a8567fbedf2/90b7413d-097d-4d94-a921-000000000000_1", ["Fresh Food"]))
        doc, _ = self.build("marks-and-spencer", ["flp1,Flower Market Roses with Chocolates,40,,,,,Food & drink gifts (all),,,2026-10-09",
                                                  "ckp1,M&S Rainbow Cake (Serves 12),35,,,,,Food to order > Cakes,,,2026-10-09"])
        self.assertEqual([p[0] for p in doc["products"]], ["ckp1"])                               # M&S flower gifts are not groceries

    def test_non_food_words(self):
        for name in ("Dr. Oetker Number 0 Candle", "Birthday Cake Sparkler Candle Number 2", "Dr. Oetker Birthday Cake Topper", "Finest Rose & Lily Bouquet", "Tesco Belle Bouquet"):
            self.assertTrue(bap.not_food(name), name)
        for name in ("Jaume Serra Bouquet Cava Brut 75cl", "Waitrose Rose Bouquet Cake each", "Jahan Charcoal Chicken Kebabs 500g", "Peter's Yard Rye, Charcoal Sourdough Crackers 90g",
                     "10th Birthday Balloon & Stars Cake each", "M and M's Crispy Party Bag 850g", "Plant Kitchen Brownies"):
            self.assertFalse(bap.not_food(name), name)


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

    def test_the_shops_own_photo_is_kept_only_from_its_own_https_image_host(self):
        skipped: dict = {}
        ok = "https://digitalcontent.api.tesco.com/v2/media/ghs/a/b.jpeg?h=225&w=225"
        self.assertEqual(bg.clean_image_url("tesco", ok, skipped), ok)
        self.assertIsNone(bg.clean_image_url("tesco", "http://digitalcontent.api.tesco.com/x.jpg", skipped))
        self.assertIsNone(bg.clean_image_url("tesco", "https://evil.example.com/x.jpg", skipped))
        self.assertIsNone(bg.clean_image_url("sainsburys", ok, skipped))          # another shop's host is not accepted for this shop
        self.assertIsNone(bg.clean_image_url("asda", "https://ui.assets-asda.com/x.jpg", skipped))  # no host listed yet: counted, not shown
        self.assertEqual(skipped.get("evil.example.com"), 1)
        self.assertEqual(skipped.get("ui.assets-asda.com"), 1)
        self.assertIsNone(bg.clean_image_url("tesco", 'https://digitalcontent.api.tesco.com/x.jpg" onerror="x', skipped))

    def test_barcodes_match_with_or_without_leading_zeros(self):
        self.assertEqual(bg.norm_code("05063250552526"), bg.norm_code("5063250552526"))

    def test_apply_retailer_images_sets_and_clears_the_photo(self):
        url = "https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg"
        products = [{"gtin": "5012345678900"}, {"gtin": "5099999999990", "retailerImage": "https://old"}]
        details = {"5012345678900": {"image_url": url}}
        n = bg.apply_retailer_images("sainsburys", products, details, {})
        self.assertEqual(n, 1)
        self.assertEqual(products[0]["retailerImage"], url)
        self.assertNotIn("retailerImage", products[1])

    def test_a_stored_photo_counts_only_with_a_real_file_https_page_and_date(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d) / "photos"
            folder.mkdir()
            (folder / "0123456789ab.webp").write_bytes(b"x")
            csv_path = Path(d) / "sainsburys.csv"
            page = "https://www.sainsburys.co.uk/groceries/product/x"
            csv_path.write_text(
                "gtin,image_url,page_url,checked_on,file\n"
                f"5012345678900,https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg,{page},2026-10-08,0123456789ab.webp\n"   # good
                f"5012345678917,https://assets.sainsburys-groceries.co.uk/gol/2/image.jpg,{page},2026-10-08,\n"                      # hotlink address only: no stored copy
                f"5012345678924,https://assets.sainsburys-groceries.co.uk/gol/3/image.jpg,{page},2026-10-08,ffffffffffff.webp\n"   # file missing
                f"5012345678931,https://assets.sainsburys-groceries.co.uk/gol/4/image.jpg,http://insecure,2026-10-08,0123456789ab.webp\n"  # page not https
                f"5012345678948,https://assets.sainsburys-groceries.co.uk/gol/5/image.jpg,{page},yesterday,0123456789ab.webp\n"    # bad date
                f"5012345678955,https://assets.sainsburys-groceries.co.uk/gol/6/image.jpg,{page},2026-10-08,../../x.webp\n"        # not our file-name shape
            )
            problems: list = []
            self.assertEqual(bg.read_photos("sainsburys", problems, folder=folder, path=csv_path), {"5012345678900": "0123456789ab.webp"})
            self.assertEqual(len(problems), 4)
            products = [{"gtin": "5012345678900"}, {"gtin": "5012345678917", "photo": "old.webp"}]
            self.assertEqual(bg.apply_stored_photos("sainsburys", products, [], folder=folder, path=csv_path), 1)
            self.assertEqual(products[0]["photo"], "0123456789ab.webp")
            self.assertNotIn("photo", products[1])

    def test_stored_copies_are_only_ever_kept_for_shops_that_allow_it(self):
        self.assertEqual(fri.STORE, ("sainsburys",))   # Tesco's images are hotlinked only
        self.assertNotIn("tesco", fri.STORE)
        self.assertEqual(fri.download_url("sainsburys", "https://assets.sainsburys-groceries.co.uk/gol/6325944/image.jpg"), "https://assets.sainsburys-groceries.co.uk/gol/6325944/1/640x640.jpg")
        self.assertEqual(fri.download_url("sainsburys", "https://assets.sainsburys-groceries.co.uk/gol/6325944/1/640x640.jpg"), "https://assets.sainsburys-groceries.co.uk/gol/6325944/1/640x640.jpg")
        self.assertEqual(fri.ic.MAX_SIDE, 400)

    def test_priced_products_come_first_then_the_most_protein_per_100_kcal_up_to_the_cap(self):
        img = lambda n: f"https://assets.sainsburys-groceries.co.uk/gol/{n}/image.jpg"
        prod = lambda g, kcal, protein, n, **x: {"gtin": g, "kcal": kcal, "protein": protein, "retailerImage": img(n), **x}
        built = {
            "sainsburys": [
                prod("1000000000001", 100, 5, 1),                     # density 5
                prod("1000000000002", 100, 20, 2),                    # density 20
                prod("1000000000003", 400, 4, 3, price={"amount": 1}),  # density 1 but priced: first
                prod("1000000000004", 100, 30, 4, retailerImage="https://evil.example.com/x.jpg"),  # not the shop's own host
                prod("1000000000005", 100, 40, 5),                    # no shop page recorded
            ],
            "tesco": [prod("1000000000002", 100, 20, 2, retailerImage="https://digitalcontent.api.tesco.com/v2/media/ghs/a/b.jpeg")],
        }
        page = ("https://www.sainsburys.co.uk/groceries/product/x", "2026-10-08")
        prov = {"sainsburys": {bg.norm_code(g): page for g in ("1000000000001", "1000000000002", "1000000000003", "1000000000004")}}
        chosen, stats = ssp.choose(built, prov, 10)
        self.assertEqual(list(chosen["sainsburys"]), ["1000000000003", "1000000000002", "1000000000001"])
        self.assertEqual((stats["considered"], stats["no_page"], stats["priced"]), (4, 1, 1))
        self.assertEqual(list(ssp.choose(built, prov, 2)[0]["sainsburys"]), ["1000000000003", "1000000000002"])
        self.assertNotIn("tesco", chosen)

    def test_pictures_left_out_after_looking_never_come_back(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "exclude.csv"
            path.write_text("shop,gtin,reason\nsainsburys,00280815,wrong product\ntesco,05063250552526,sticker\n")
            self.assertEqual(bg.read_excludes("sainsburys", path), {"280815"})
            self.assertEqual(bg.read_excludes("tesco", path), {"5063250552526"})   # leading zeros do not matter
            self.assertEqual(bg.read_excludes("asda", path), set())
            self.assertEqual(bg.read_excludes("sainsburys", Path(d) / "missing.csv"), set())
        # the committed list is read by the real build: a product on it shows neither the shop's picture address nor a stored copy
        self.assertIn(bg.norm_code("00280815"), bg.read_excludes("sainsburys"))
        products = [{"gtin": "00280815", "retailerImage": "https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg", "photo": "0123456789ab.webp"}]
        bg.apply_retailer_images("sainsburys", products, {"00280815": {"image_url": "https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg"}}, {})
        bg.apply_stored_photos("sainsburys", products, [])
        self.assertNotIn("retailerImage", products[0])
        self.assertNotIn("photo", products[0])

    def test_every_product_file_keeps_only_priced_valid_rows_and_lower_named_card_prices(self):
        header = "product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on\n"
        rows = [
            "sainsburys-yogurt-500g,Sainsbury's Yogurt 500g,1.15,2.30,per kg,,,Chilled food > Dairy | Chilled food > Yogurt,https://x,https://assets.sainsburys-groceries.co.uk/gol/6325944/1/640x640.jpg,2026-10-08",
            "sainsburys-loaf-800g,Loaf 800g,1.60,2,per kg,1.20,Nectar price,Bakery > Bread,https://x,,2026-10-08",
            "no-price,Out of stock thing,,,,,,Bakery > Bread,https://x,,2026-10-08",
            "higher-card,Card price not lower,1.00,1,per kg,1.50,Nectar price,Bakery > Bread,https://x,,2026-10-08",
            "no-scheme,Card price without a name,1.00,1,per kg,0.80,,Bakery > Bread,https://x,,2026-10-08",
            "bad id!,Bad id,1.00,1,per kg,,,Bakery > Bread,https://x,,2026-10-08",
            "brita-%E2%80%93-3-pack,Brita Filter,22.50,,each,,,Household,https://x,,2026-10-09",
        ]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "sainsburys.csv"
            path.write_text(header + "\n".join(rows) + "\n")
            problems: list = []
            doc = bap.build_shop("sainsburys", problems, path=path, gtins={"sainsburys-yogurt-500g": "5012345678900"})
        self.assertEqual([p[0] for p in doc["products"]], ["sainsburys-yogurt-500g", "sainsburys-loaf-800g", "higher-card", "no-scheme", "brita-%E2%80%93-3-pack"])
        yogurt, loaf, higher, noscheme, brita = doc["products"]
        self.assertEqual((yogurt[2], yogurt[3], yogurt[4], yogurt[8], yogurt[9]), (1.15, 2.3, "per kg", "6325944", "5012345678900"))
        self.assertEqual(doc["categories"][yogurt[7]], "Chilled food")                       # the top-level type only
        self.assertEqual((loaf[5], doc["schemes"][loaf[6]], loaf[8]), (1.2, "Nectar price", ""))
        self.assertEqual((higher[5], higher[6], noscheme[5]), (None, None, None))           # a card price counts only when lower and named
        self.assertIsNone(brita[3])                                                         # no unit price printed: none invented
        self.assertEqual(len(problems), 1)                                                  # the bad id is reported, the unpriced row is simply not listed
        self.assertEqual(doc["checkedOn"], "2026-10-08")                                    # the earliest day: never fresher than the oldest row
        # founder 2026-10-11: "all the grocery stores, all the items" (Co-op and Ocado have no usable list; no other shop without their go-ahead)
        self.assertEqual(bap.PUBLISH, ("sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons", "waitrose", "iceland", "marks-and-spencer"))

    def test_tier2_brewed_coffee_and_tea_figures_are_labelled_brewed(self):
        import re
        self.assertTrue(t2.BREWED.search("nescafe-gold-blend-instant-coffee-200g"))
        self.assertTrue(t2.BREWED.search("yorkshire-tea-bags-x80-250g"))
        self.assertTrue(t2.BREWED.search("kenco-millicano-smooth-latte-sachets"))
        self.assertFalse(t2.BREWED.search("sainsburys-steak-and-ale-pie"))
        self.assertFalse(t2.BREWED.search("sainsburys-sea-salt-flakes"))

    def test_tier2_heading_words_become_clear_labels_or_the_basis_is_dropped(self):
        self.assertEqual(t2.canon_state(""), "")
        self.assertEqual(t2.canon_state("of product"), "")
        self.assertEqual(t2.canon_state("typical analysis"), "")
        self.assertEqual(t2.canon_state("grilled"), "grilled")
        self.assertEqual(t2.canon_state("oven cooked for pulled p"), "oven cooked")
        self.assertEqual(t2.canon_state("as consumed edible porti"), "edible portion")
        self.assertEqual(t2.canon_state("cooked as per instruction"), "cooked")
        self.assertEqual(t2.canon_state("edible portion"), "edible portion")
        for unclear in ("rams", "per", "serving", "pouch", "contains"):
            self.assertIsNone(t2.canon_state(unclear), unclear)

    def test_tier2_checks_match_the_page_extractor_and_reject_slips(self):
        # these two values were printed by tools/groceries/t2_extractor.js on the live Sainsbury's Greek yogurt page
        self.assertEqual(t2.H("sainsburys-greek-style-natural-yogurt-500g"), "3l5r")
        self.assertEqual(t2.H("g|426|103|7.6|5.1|4.2|4.2|<0.5|4.0|0.10"), "bf5f")
        self.assertEqual(t2.H(""), "0007")
        # alcohol is never handed out (no nutrition table), the protein-first categories come first
        self.assertIsNone(t2.priority("Beer, wine & spirits > Wine"))
        self.assertLess(t2.priority("Meat & fish > Beef"), t2.priority("Food cupboard > Pasta"))

    def test_tier2_append_keeps_the_heading_word_and_requeues_old_unusable_rows(self):
        import io
        from contextlib import redirect_stdout
        from unittest import mock
        with tempfile.TemporaryDirectory() as d, mock.patch.object(t2, "OUT", Path(d) / "nutrition.csv"):  # not the repo's real nutrition file
            work = Path(d)
            slugs = ["bacon-1", "milk-1", "old-1", "old-2"]
            (work / "slice1.txt").write_text("\n".join(slugs) + "\n")
            lines = []
            for slug, basis, rest in (("bacon-1", "g:grilled", "1514|365|27.7|11.2|1.0|<0.5|0.6|27.5|4.78"), ("milk-1", "ml", "210|50|1.7|1.1|4.8|4.8||3.4|0.1")):
                body = f"{basis}|{rest}"
                lines.append(f"{t2.H(slug)}|{body}|{t2.H(body)}")
            old_ok = f"{t2.H('old-1')}|g?|1|2|3|4|5|6|7|8|9|{t2.H('g?|1|2|3|4|5|6|7|8|9')}"
            sys_stdin = sys.stdin
            sys.stdin = io.StringIO("\n".join(lines + [old_ok]) + "\n")
            try:
                with redirect_stdout(io.StringIO()):
                    t2.cmd_append(type("A", (), {"work": str(work), "slice": 1}))
            finally:
                sys.stdin = sys_stdin
            rows = [l.split("\t") for l in (work / "results_1.tsv").read_text().splitlines()]
            self.assertEqual([r[0] for r in rows], ["bacon-1", "milk-1"])                 # the bad basis "g?" was rejected, not stored
            self.assertEqual(rows[0][1], "g:grilled")
            self.assertEqual(rows[0][12], "7")
            # an older v2 row with an unusable basis is read again; an older complete plain row stays done
            with open(work / "results_1.tsv", "a") as f:
                f.write("\t".join(["old-1", "g?", "1", "2", "3", "4", "5", "6", "7", "8", "9", "2026-10-09", "2"]) + "\n")
                f.write("\t".join(["old-2", "g", "1", "100", "5", "", "20", "", "", "10", "0.1", "2026-10-09", "2"]) + "\n")
            self.assertEqual(t2.done_slugs(work), {"bacon-1", "milk-1", "old-2"})
            # a "no table" answer counts only from extractor v4 (older ones could not open the collapsed Nutrition accordion)
            (work / "none_1.txt").write_text("old-1\n")                                   # an old NONE line: read again
            self.assertNotIn("old-1", t2.done_slugs(work))
            (work / "none_1.txt").write_text("old-1\t4\n")
            self.assertIn("old-1", t2.done_slugs(work))
            # v3/v4 rows whose kJ and kcal disagree (kcal read as kJ), or that took a reference-intake column, are read again; a v5 row is final
            with open(work / "results_1.tsv", "a") as f:
                f.write("\t".join(["bad-kcal", "g", "1176", "1176", "23", "7.8", "5.1", "0.9", "0.5", "14", "0.8", "2026-10-09", "4"]) + "\n")
                f.write("\t".join(["ri-col", "g:reference intake", "", "", "25", "", "", "", "", "50", "", "2026-10-09", "4"]) + "\n")
                f.write("\t".join(["fixed", "g", "1176", "283", "23", "7.8", "5.1", "0.9", "0.5", "14", "0.8", "2026-10-09", "5"]) + "\n")
            done = t2.done_slugs(work)
            self.assertTrue("bad-kcal" not in done and "ri-col" not in done and "fixed" in done)
            # dry staples read before v7 may hold cooked figures under a plain heading: read again; a v7 row is final
            with open(work / "results_1.tsv", "a") as f:
                f.write("\t".join(["sainsburys-farfalle-pasta-500g", "g", "696", "164", "0.7", "0.2", "33.2", "0.7", "1.5", "5.5", "0.01", "2026-10-09", "5"]) + "\n")
                f.write("\t".join(["sainsburys-butter-500g", "g", "3000", "740", "82", "52", "0.5", "0.5", "0", "0.5", "0.01", "2026-10-09", "5"]) + "\n")
                f.write("\t".join(["sainsburys-spaghetti-pasta-1kg", "g:cooked", "696", "164", "0.7", "0.2", "33.2", "0.7", "1.5", "5.5", "0.01", "2026-10-09", "7"]) + "\n")
            done = t2.done_slugs(work)
            self.assertTrue("sainsburys-farfalle-pasta-500g" not in done and "sainsburys-butter-500g" in done and "sainsburys-spaghetti-pasta-1kg" in done)


if __name__ == "__main__":
    unittest.main()


class ListingBarcodeTests(unittest.TestCase):
    """Products sold at several shops share one listing, joined by exact barcode only (founder 2026-10-11, the Alpro example)."""

    LISTING_HEADER = "product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on\n"

    def test_shop_internal_numbers_are_never_shared(self):
        for code in ("0000000462563", "00515290", "2000000012345", "0412345678905", "20123456"):
            self.assertTrue(bg.restricted_code(code), code)
        for code in ("5010084702399", "05063250552526", "96123456", "5000159407236"):
            self.assertFalse(bg.restricted_code(code), code)

    def test_asda_list_rows_by_picture_barcode_with_prices_and_search_links(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base / "listing").mkdir()
            (base / "listing" / "asda.csv").write_text(self.LISTING_HEADER +
                "1,Alpro Soya Drink 1L,1.85,1.85,per litre,1.50,Asda Rewards,Chilled > Milk,,https://asdagroceries.scene7.com/is/image/asdagroceries/5411188080213,2026-10-08\n"
                "2,ASDA Own Ham,2.00,,,,,Chilled > Ham,,https://asdagroceries.scene7.com/is/image/asdagroceries/0000000462563,2026-10-08\n"
                "3,Not a barcode,1.00,,,,,Bakery,,https://asdagroceries.scene7.com/is/image/asdagroceries/1234567,2026-10-08\n")
            rows = bg.listing_rows("asda", base)
            self.assertEqual(list(rows), ["5411188080213"])                              # internal numbers and non-barcodes are left out
            price = bg.listing_prices("asda", rows)["5411188080213"]
            self.assertEqual(price["amount"], 1.85)
            self.assertEqual(price["member"], {"amount": 1.5, "scheme": "Asda Rewards"})
            self.assertEqual(price["url"], "https://www.asda.com/groceries/search/Alpro%20Soya%20Drink%201L")
            self.assertIn("asda", bg.read_shop_evidence(base)["5411188080213"])          # the shop's own list proves it sells the barcode
            photos = bg.shop_pages("asda", base)["5411188080213"]["photos"]
            self.assertTrue(photos[0][0].startswith("https://asdagroceries.scene7.com/is/image/asdagroceries/5411188080213?"))

    def test_added_records_need_a_shop_list_and_a_name_that_agrees(self):
        good = {"code": "5411188080213", "product_name": "Soya drink", "nutriments": {"energy-kcal_100g": 39, "proteins_100g": 3, "carbohydrates_100g": 2.5, "fat_100g": 1.8}}
        wrong = {**good, "code": "5000159407236", "product_name": "Chocolate cookies"}
        unlisted = {**good, "code": "5010084702399"}
        lists = {"asda": {"5411188080213": {"name": "Alpro Soya Drink 1L"}, "5000159407236": {"name": "Heinz Baked Beans 415g"}}, "tesco": {}}
        by_rid = {"asda": [], "tesco": []}
        with tempfile.TemporaryDirectory() as d:
            for p in (good, wrong, unlisted):
                (Path(d) / f"{p['code']}.json").write_text(json.dumps({"status": 1, "product": p}))
            (Path(d) / "0.json").write_text(json.dumps({"status": 0}))
            lines = bg.add_codes(by_rid, Path(d), lists)
        self.assertEqual([it["gtin"] for it in by_rid["asda"]], ["5411188080213"])      # the cookies record names another product; the third isn't on a shop list
        self.assertTrue(any("share no word" in line for line in lines))


class NameMatchTests(unittest.TestCase):
    """Founder 2026-10-11: a branded product is the same item at two shops when its name and pack size match exactly; never a shop's own brand."""

    def test_the_key_is_exact_after_tidying(self):
        self.assertEqual(bg.name_key("Galaxy Milk Chocolate Bar 100g"), "galaxy milk chocolate bar 100g")
        self.assertEqual(bg.name_key("Alpro Soya Drink 1 Litre"), bg.name_key("Alpro Soya Drink 1L"))
        self.assertEqual(bg.name_key("Cornetto MAX Pistachio Ice Cream Cones 4 x 90ml"), bg.name_key("Cornetto MAX Pistachio Ice Cream Cones 4x 90 ml"))
        self.assertEqual(bg.name_key("Sweet Baby Ray's Barbecue Sauce 510g"), "sweet baby rays barbecue sauce 510g")
        self.assertNotEqual(bg.name_key("Galaxy Milk Chocolate Bar 100g"), bg.name_key("Galaxy Milk Chocolate Bar 110g"))  # another size is another product
        self.assertNotEqual(bg.name_key("Heinz Baked Beans 415g"), bg.name_key("Heinz Baked Beanz 415g"))

    def test_own_brands_and_unsized_names_never_match(self):
        for name in ("Tesco Baked Beans 420g", "Sainsbury's Lemon Curd 411g", "ASDA Semi Skimmed Milk 2L", "Morrisons The Best Sausages 400g",
                     "Essential Waitrose Butter 250g", "M&S Percy Pig 170g", "Galaxy Milk Chocolate Bar"):
            self.assertIsNone(bg.name_key(name), name)

    def test_rows_take_the_one_barcode_of_their_exact_name_and_ambiguous_names_none(self):
        header = "product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on\n"
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base / "listing").mkdir()
            (base / "listing" / "asda.csv").write_text(header +
                "1,Galaxy Milk Chocolate Bar 100g,1.50,,,,,Sweets,,https://asdagroceries.scene7.com/is/image/asdagroceries/5000159407236,2026-10-08\n"
                "2,Capri Sun Orange 330ml,1.00,,,,,Drinks,,https://asdagroceries.scene7.com/is/image/asdagroceries/5010084702399,2026-10-08\n"
                "3,Capri-Sun Orange 330ml,1.00,,,,,Drinks,,https://asdagroceries.scene7.com/is/image/asdagroceries/5411188080213,2026-10-08\n")
            (base / "listing" / "waitrose.csv").write_text(header +
                "065131-1-1,Galaxy Milk Chocolate Bar 100g,1.60,,,,,food_cupboard/chocolate,,https://ecom-su-static-prod.wtrecom.com/images/products/9/LN_065131_BP_9.jpg,2026-10-08\n"
                "065132-1-1,Capri Sun Orange 330ml,1.10,,,,,drinks,,https://ecom-su-static-prod.wtrecom.com/images/products/9/LN_065132_BP_9.jpg,2026-10-08\n")
            bg._NAME_CACHE.pop(base, None)
            rows = bg.listing_rows("waitrose", base)
        self.assertEqual(list(rows), ["5000159407236"])                                  # two Asda barcodes share the Capri Sun name: no match
        self.assertEqual(rows["5000159407236"]["name"], "Galaxy Milk Chocolate Bar 100g")
        price = bg.listing_prices("waitrose", rows)["5000159407236"]
        self.assertTrue(price["url"].startswith("https://www.waitrose.com/ecom/shop/search?searchTerm="))


class AlcoholAndPhotoTests(unittest.TestCase):
    """Founder 2026-10-11: no alcoholic drinks ("like whisky etc. Just no point"); every listed product should have a photo, from another supermarket's
    website or the exact barcode's Open Food Facts photo where its own shop showed none."""

    def test_alcohol_goes_but_alcohol_free_drinks_mixers_and_food_stay(self):
        gone = [("Gordon's Gin 70cl", "Christmas"), ("Guinness Draught Stout 10x440ml", "Drinks"), ("Tesco Finest Cinsault Rose 75Cl", "fresh-food"),
                ("Jack Daniel's and Coca-Cola 330ml", "tea_coffee_and_soft_drinks/fizzy_drinks/cola"), ("Adnams Broadside Premium Ale 6.0% 500ml", "Beer, Wine & Spirits > Beer"),
                ("Four Loko Dark Berry Burst 440ml", "Beer, Wine & Spirits > Ready to Drink Spirits & Cocktails"), ("Cobra 620ml", "beer_wine_and_spirits/beer")]
        stay = [("Heineken 0.0 Alcohol Free Premium Lager Beer 0% ABV Cans 6x330ml", "Beer, Wine & Spirits > Beer"), ("Fever-Tree Raspberry Mojito Mixer 4 x 150ml", "Hot drinks > mixers"),
                ("Shloer Rosé Sparkling Fruit Drink 750ml", "Drinks"), ("Nielsen-Massey Rose Water 60ml", "Food cupboard"), ("Baileys Chocolate Truffles 200g", "Food cupboard"),
                ("Cooks' Ingredients Mirin Rice Wine 150ml", "food_cupboard/cooking_sauces"), ("Exceptional by ASDA Mojito Mocktail 750ml", "Drinks > Fruit Juice"),
                ("Pringles Prawn Cocktail 165g", "Snacks > cocktail crisps"), ("Sea Bass Fillets 240g", "Meat & fish"), ("Cawston Press Ginger Beer Cans 4x250ml", "soft drinks")]
        for name, aisle in gone:
            self.assertTrue(bg.is_alcohol(name, aisle), name)
        for name, aisle in stay:
            self.assertFalse(bg.is_alcohol(name, aisle), name)

    def test_adverts_and_flowers_are_not_groceries(self):
        for name in ("Rainbow Alstroemeria", "Tesco Oriental Lilies", "Simply Roses", "Seasonal Show"):
            self.assertTrue(bap.not_food(name), name)
        for name in ("Cadbury Roses Chocolate Assortment Carton 240 g", "Carnation Evaporated Milk 410g Tin", "Sunflower Seeds 200g", "Plant Pioneers Chocolate Cake 390g"):
            self.assertFalse(bap.not_food(name), name)
        self.assertIn("sponsored", bap.ADVERT)

    def test_rows_without_a_photo_borrow_one_by_barcode_name_or_open_food_facts_never_an_own_brand(self):
        row = lambda pid, name, photo="", gtin="": [pid, name, 1.0, None, "", None, None, 0, photo, gtin, None]
        docs = {
            "asda": {"products": [row("a1", "Heinz Baked Beans 415g", "5000157024671", "5000157024671"), row("a2", "Hovis Soft White Medium Sliced Bread 800g", "5010044000046")]},
            "sainsburys": {"products": [row("s1", "Heinz Baked Beans 415g", gtin="05000157024671"), row("s2", "Hovis Soft Medium Sliced White Bread 800g"),
                                        row("s3", "Sainsbury's White Bread 800g"), row("s4", "Nutella 350g", gtin="3017620422003"), row("s5", "Own Thing 100g", "123")]},
        }
        counts = bap.fill_photos(docs, off={"3017620422003": "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.633.400.jpg"})
        s = {r[0]: r for r in docs["sainsburys"]["products"]}
        self.assertEqual(s["s1"][12][0], "asda")                                     # same barcode (leading zeros don't matter)
        self.assertEqual(s["s2"][12][0], "asda")                                     # same words in another order, same size
        self.assertEqual(len(s["s3"]), 11)                                           # a shop's own brand never borrows
        self.assertEqual(s["s4"][12][0], "off")
        self.assertEqual(s["s4"][11], "")                                            # the page slot stays empty
        self.assertEqual(len(s["s5"]), 11)                                           # has its own photo
        self.assertEqual(counts["sainsburys"], {"barcode": 1, "name": 1, "off": 1, "none": 1})


class MsFoodRangeTests(unittest.TestCase):
    """M&S's everyday food range (tools/groceries/mns_food_listing.py, founder 2026-10-16: "M&S definetly has more products add the rest of them please"):
    M&S's aisle pages list no price for these, so they are listed as "Price in store", like Lidl's everyday range, and open their own page."""

    HEAD = "product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on"
    IMG = "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/"
    HASH = "5202e37a68b76b677fcb077d8e419d0b"
    PAGE = "https://www.marksandspencer.com/food/"

    def setUp(self):
        bap.NAME_SKIP.clear()

    def tearDown(self):
        bap.NAME_SKIP.clear()

    def write(self, path: Path, rows: list[list[str]]) -> Path:
        """A listing csv as the tools write it (the picture address has commas in it, so it is quoted)."""
        import csv
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(self.HEAD.split(","))
            w.writerows(rows)
        return path

    def files(self, d: str):
        row = lambda pid, name, price, cat, page, img, day: [pid, name, price, "", "", "", "", cat, page, img, day]
        listing = self.write(Path(d) / "marks-and-spencer.csv", [
            row("ckp60095316", "M&S Rainbow Cake (Serves 12)", "35.00", "Food to order > Cakes", "", self.IMG + "SD_FD_F09A_00346825_NC_X_EC_0", "2026-10-08"),
            row("fdp60064368", "M&S Baby Rainbow Carrots 200 g", "2.00", "Food to order > Veg", "", self.IMG + "SD_FD_F09A_11111111_NC_X_EC_0", "2026-10-08")])
        more = self.write(Path(d) / "marks-and-spencer-food.csv", [
            row("fdp60064368", "Baby Rainbow Carrots 200 g", "", "Fruit & Vegetables", self.PAGE + "baby-rainbow-carrots/p/fdp60064368", f"{self.IMG}{self.HASH}.jpg", "2026-10-16"),
            row("fdp60000002", "Plant Kitchen No Chicken Nuggets 200 g", "", "Meat Alternatives", self.PAGE + "plant-kitchen-no-chicken-nuggets/p/fdp60000002", f"{self.IMG}{'a' * 32}.jpg", "2026-10-16"),
            row("fdp60000003", "Odd Page 100 g", "", "Dairy", "https://evil.example.com/food/odd/p/fdp60000003", f"{self.IMG}{'b' * 32}.jpg", "2026-10-16"),
            row("fdp60000004", "Odd Picture 100 g", "", "Dairy", self.PAGE + "odd-picture/p/fdp60000004", f"https://evil.example.com/x/{'c' * 32}.jpg", "2026-10-16"),
            row("fdp60000005", "Wrong Product Page 100 g", "", "Dairy", self.PAGE + "wrong/p/fdp60099999", f"{self.IMG}{'d' * 32}.jpg", "2026-10-16"),
            row("flp60000006", "Flower Market Roses with Chocolates 1 kg", "", "Food Cupboard", self.PAGE + "roses/p/flp60000006", f"{self.IMG}{'e' * 32}.jpg", "2026-10-16")])
        return listing, more

    def build(self, shop="marks-and-spencer", exclude=None):
        with tempfile.TemporaryDirectory() as d:
            listing, more = self.files(d)
            problems: list = []
            doc = bap.build_shop(shop, problems, path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more, exclude=exclude if exclude is not None else set())
        return doc

    def test_the_range_is_listed_without_a_price_and_opens_its_own_page(self):
        doc = self.build()
        rows = {r[0]: r for r in doc["products"]}
        self.assertEqual(sorted(rows), ["ckp60095316", "fdp60000002", "fdp60000003", "fdp60000004", "fdp60000005", "fdp60064368"])   # a flower gift is not a grocery
        nuggets = rows["fdp60000002"]
        self.assertEqual((nuggets[2], nuggets[3], nuggets[5], nuggets[6]), (None, None, None, None))      # nothing estimated: no price, no unit price, no card price
        self.assertEqual((nuggets[8], nuggets[9], doc["categories"][nuggets[7]]), ("a" * 32 + ".jpg", "", "Meat Alternatives"))
        self.assertEqual(nuggets[11], "plant-kitchen-no-chicken-nuggets/p/fdp60000002")
        self.assertEqual(doc["pageRoot"], self.PAGE)
        self.assertEqual(doc["priceNote"], "stores")
        self.assertTrue(doc["pageSearch"])
        # the priced row of the same id wins: its price, its picture and its search link (no page element)
        carrots = rows["fdp60064368"]
        self.assertEqual((carrots[1], carrots[2], carrots[8], len(carrots)), ("M&S Baby Rainbow Carrots 200 g", 2.0, "SD_FD_F09A_11111111_NC_X_EC_0", 11))
        self.assertEqual(rows["ckp60095316"][2], 35.0)
        # a page address that is not under M&S's /food/, or not that product's own, is not used; the row keeps the search link
        self.assertEqual(len(rows["fdp60000003"]), 11)
        self.assertEqual(len(rows["fdp60000005"]), 11)
        # a picture that is not on M&S's own image host is not shown
        self.assertEqual(rows["fdp60000004"][8], "")
        self.assertEqual(rows["fdp60000004"][11] if len(rows["fdp60000004"]) > 11 else "", "odd-picture/p/fdp60000004")

    def test_only_lidl_and_mands_may_list_a_product_without_a_price(self):
        self.assertEqual(bap.PRICE_IN_STORE, {"lidl", "marks-and-spencer"})
        self.assertEqual(bap.PUBLISH, ("sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons", "waitrose", "iceland", "marks-and-spencer"))
        self.assertEqual(bap.MORE_ROWS["marks-and-spencer"].name, "marks-and-spencer-food.csv")
        # the same unpriced rows given to any other shop are not listed (the exception is for these two shops only, and only for their own range file)
        for shop in ("asda", "tesco", "morrisons", "waitrose", "iceland", "sainsburys", "aldi"):
            with tempfile.TemporaryDirectory() as d:
                listing, more = self.files(d)
                other = bap.build_shop(shop, [], path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more, exclude=set())
            self.assertEqual([r for r in other["products"] if r[2] is None], [], shop)
        # Lidl's file does not carry M&S's two optional fields, so it is unchanged by this
        self.assertNotIn("pageRoot", bap.SHOPS["lidl"])
        self.assertNotIn("priceNote", bap.SHOPS["lidl"])

    def test_picture_ids_the_old_names_and_the_new_hash_dot_jpg(self):
        photo = bap.SHOPS["marks-and-spencer"]["photo"]
        for pid in ("SD_FD_F09A_00346825_NC_X_EC_0", f"{self.HASH}.jpg"):
            self.assertEqual(photo.search(self.IMG + pid).group(1), pid)
        for bad in (self.IMG + "../x.jpg", self.IMG + "a/b.jpg", self.IMG + "abc.jpg", f"https://evil.example.com/image/upload/w_400,q_auto,f_jpg/{self.HASH}.jpg",
                    f"http://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/{self.HASH}.jpg", self.IMG + self.HASH + ".jpg?x=1", self.IMG + self.HASH + ".png"):
            self.assertIsNone(photo.search(bad), bad)
        self.assertEqual(bap.own_photo_url("marks-and-spencer", f"{self.HASH}.jpg"), self.IMG + self.HASH + ".jpg")

    def test_no_alcohol_no_flowers_and_a_picture_on_the_exclusion_list_is_not_shown(self):
        names = ["Artelium English Sparkling Wine 75 cl", "Alcohol Free Winter Ale 500 ml", "Wine Vinegar 250 ml", "Prosecco Rosé Brut 75 cl", "Gin and Diet Tonic 1000 ml",
                 "Scotch Beef Mince 5% Fat 500 g", "Ginger Beer 500 ml", "40 Coffee Filter Papers 40 pieces", "Wine Gums 225 g"]
        rows = [[f"fdp6100000{i}", n, "", "", "", "", "", "Food Cupboard", f"{self.PAGE}x-{i}/p/fdp6100000{i}", f"{self.IMG}{str(i) * 32}.jpg", "2026-10-16"] for i, n in enumerate(names)]
        with tempfile.TemporaryDirectory() as d:
            listing, more = self.write(Path(d) / "m.csv", []), self.write(Path(d) / "more.csv", rows)
            doc = bap.build_shop("marks-and-spencer", [], path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more, exclude={("marks-and-spencer", "fdp61000006")})
        kept = [p[1] for p in doc["products"]]
        self.assertEqual(kept, ["Alcohol Free Winter Ale 500 ml", "Wine Vinegar 250 ml", "Scotch Beef Mince 5% Fat 500 g", "Ginger Beer 500 ml", "Wine Gums 225 g"])
        by_name = {p[1]: p for p in doc["products"]}
        self.assertEqual(by_name["Wine Gums 225 g"][8], "8" * 32 + ".jpg")
        self.assertEqual(by_name["Ginger Beer 500 ml"][8], "")  # fdp61000006 is on the exclusion list: no picture, the row stays

    def test_the_same_name_at_another_shop_is_not_the_same_product_for_the_range(self):
        """No barcode and no photo by name for these rows, in either direction; the priced rows and every other shop keep the name matching."""
        from unittest import mock
        code = "5000157024671"
        with tempfile.TemporaryDirectory() as d, mock.patch.object(bg, "name_barcodes", return_value={"baby rainbow carrots 200g": code, "heinz baked beans 415g": code}):
            listing, more = self.files(d)
            ms = bap.build_shop("marks-and-spencer", [], path=listing, gtins={}, nutrition={}, pages={}, photos={}, more=more, exclude=set())
            mor = self.write(Path(d) / "morrisons.csv", [["1", "Baby Rainbow Carrots 200g", "1.00", "", "", "", "", "fruit-veg/veg", "", "", "2026-10-08"]])
            morrisons = bap.build_shop("morrisons", [], path=mor, gtins={}, nutrition={}, pages={}, photos={})
            beans = self.write(Path(d) / "ms-beans.csv", [["ckp1", "Heinz Baked Beans 415g", "1.00", "", "", "", "", "Food to order > Tins", "", self.IMG + "SD_FD_F09A_22222222_NC_X_EC_0", "2026-10-08"]])
            priced = bap.build_shop("marks-and-spencer", [], path=beans, gtins={}, nutrition={}, pages={}, photos={}, more=None, exclude=set())
        self.assertEqual({r[0]: r[9] for r in ms["products"] if r[0] == "fdp60000002"}, {"fdp60000002": ""})
        self.assertEqual(morrisons["products"][0][9], code)                          # another shop's row of that name still gets the barcode
        self.assertEqual(priced["products"][0][9], code)                             # and so does a priced M&S row: unchanged
        self.assertEqual({("marks-and-spencer", r[0]) for r in ms["products"] if r[0].startswith("fdp") and r[0] != "fdp60064368"}, bap.NAME_SKIP | set())
        self.assertNotIn(("marks-and-spencer", "ckp60095316"), bap.NAME_SKIP)
        self.assertNotIn(("marks-and-spencer", "fdp60064368"), bap.NAME_SKIP)        # the priced row won that id

    def test_range_rows_neither_lend_nor_borrow_a_photo_by_name(self):
        row = lambda pid, name, photo="", gtin="": [pid, name, None if pid.startswith("fdp") else 1.0, None, "", None, None, 0, photo, gtin, None]
        bap.NAME_SKIP.update({("marks-and-spencer", "fdp1"), ("marks-and-spencer", "fdp2")})
        docs = {
            "marks-and-spencer": {"products": [row("fdp1", "Cheese and Onion Crisps 150 g", "1" * 32 + ".jpg"), row("fdp2", "Heinz Baked Beans 415g"), row("ckp3", "Hovis Soft White Bread 800g")]},
            "tesco": {"products": [row("t1", "Cheese and Onion Crisps 150g"), row("t2", "Heinz Baked Beans 415g", "ghs/abc"), row("t3", "Hovis Soft White Bread 800g", "ghs/def")]},
        }
        counts = bap.fill_photos(docs)
        t, m = {r[0]: r for r in docs["tesco"]["products"]}, {r[0]: r for r in docs["marks-and-spencer"]["products"]}
        self.assertEqual(len(t["t1"]), 11)                                           # M&S's "Cheese and Onion Crisps" lends nothing to Tesco's
        self.assertEqual(len(m["fdp2"]), 11)                                         # and Tesco's beans lend nothing to the M&S range row
        self.assertEqual(m["ckp3"][12][0], "tesco")                                  # a priced M&S row borrows by name as before
        self.assertEqual((counts["tesco"]["none"], counts["marks-and-spencer"]["name"], counts["marks-and-spencer"]["none"]), (1, 1, 1))

    def test_only_rewrites_one_shop_and_its_manifest_entry(self):
        import contextlib
        import io
        from unittest import mock
        shops = ("lidl", "marks-and-spencer", "asda")
        doc = lambda shop, n: {"v": 1, "retailer": shop, "name": shop, "checkedOn": "2026-10-16", "pageBase": "https://x/", "photoBase": "https://x/", "categories": [], "schemes": [],
                               "nutritionCheckedOn": "", "products": [[f"p{i}", f"Item {i} 100g", 1.0, None, "", None, None, 0, "", "", None] for i in range(n)]}
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            with mock.patch.object(bap, "OUT", out), mock.patch.object(bap, "PUBLISH", shops), mock.patch.object(bap, "build_shop", lambda shop, problems: doc(shop, 3)), \
                    mock.patch.object(bap, "catalogue_photos", return_value={}), mock.patch.object(bap, "read_off_images", return_value={}), \
                    mock.patch.object(bap, "write_wanted_off", return_value=0) as wanted, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bap.main([]), 0)
                self.assertEqual(wanted.call_count, 1)
                first = json.loads((out / "all-manifest.json").read_text())
                self.assertEqual([r["id"] for r in first["retailers"]], list(shops))
                lidl_bytes, asda_bytes = (out / "lidl.json").read_bytes(), (out / "asda.json").read_bytes()
                before_text = (out / "all-manifest.json").read_text()
                # now every shop's inputs have CHANGED (M&S 3 -> 5 rows, the others 3 -> 7): only M&S's file and entry may change. If --only ever rewrote the other
                # shops or the whole manifest, their bytes and entries would differ from the first run and these assertions would fail.
                with mock.patch.object(bap, "build_shop", lambda shop, problems: doc(shop, 5 if shop == "marks-and-spencer" else 7)):
                    self.assertEqual(bap.main(["--only", "marks-and-spencer"]), 0)
                self.assertEqual(wanted.call_count, 1)                                # the wanted-barcodes list is not rewritten by --only
                second = json.loads((out / "all-manifest.json").read_text())
                self.assertEqual([r["id"] for r in second["retailers"]], list(shops))   # same order
                self.assertEqual(second["retailers"][0], first["retailers"][0])
                self.assertEqual(second["retailers"][2], first["retailers"][2])
                self.assertEqual((first["retailers"][1]["count"], second["retailers"][1]["count"]), (3, 5))
                self.assertNotEqual(first["retailers"][1]["sha256"], second["retailers"][1]["sha256"])      # M&S's entry is the one that changed
                self.assertEqual((second["retailers"][0]["count"], second["retailers"][2]["count"]), (3, 3))   # the others still describe the files on disk (3 rows), not the new inputs (7)
                self.assertEqual(len(json.loads((out / "lidl.json").read_text())["products"]), 3)
                self.assertEqual((out / "lidl.json").read_bytes(), lidl_bytes)
                self.assertEqual((out / "asda.json").read_bytes(), asda_bytes)
                self.assertEqual(len(json.loads((out / "marks-and-spencer.json").read_text())["products"]), 5)
                self.assertNotEqual((out / "all-manifest.json").read_text(), before_text)
                # a shop that is not published, and a missing manifest, are refused
                with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                    bap.main(["--only", "co-op"])
                (out / "all-manifest.json").unlink()
                self.assertEqual(bap.main(["--only", "lidl"]), 1)
