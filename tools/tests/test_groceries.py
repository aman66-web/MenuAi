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
        self.assertEqual(bap.PUBLISH, ("sainsburys",))                                       # no other shop is published without the founder's go-ahead

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
        with tempfile.TemporaryDirectory() as d:
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
            self.assertEqual(rows[0][12], "3")
            # an older v2 row with an unusable basis is read again; an older complete plain row stays done
            with open(work / "results_1.tsv", "a") as f:
                f.write("\t".join(["old-1", "g?", "1", "2", "3", "4", "5", "6", "7", "8", "9", "2026-10-09", "2"]) + "\n")
                f.write("\t".join(["old-2", "g", "1", "100", "5", "", "20", "", "", "10", "0.1", "2026-10-09", "2"]) + "\n")
            self.assertEqual(t2.done_slugs(work), {"bacon-1", "milk-1", "old-2"})


if __name__ == "__main__":
    unittest.main()
