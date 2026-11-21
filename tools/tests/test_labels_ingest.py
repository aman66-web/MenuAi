"""Reading a label whose heading says just "per 100" (Aldi), by the pack's unit (founder 2026-11-21: "Yes, that is perfect"), and Aldi's size lines."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "groceries"))
import labels_chrome_ingest as L  # noqa: E402
import aldi_sizes_chrome as A  # noqa: E402

TABLE = [["Average Nutritional Information", "per 100"], ["Energy kcal", "19.21 kcal"], ["Fat", "0 g"], ["Carbohydrate", "1.13 g"], ["Protein", "0 g"]]


class PerHundred(unittest.TestCase):
    def test_pack_unit(self):
        self.assertEqual(L.pack_unit("THE PANTRY Lemon Juice 250 ml"), "ml")
        self.assertEqual(L.pack_unit("Semi Skimmed Milk 2 Litres"), "ml")
        self.assertEqual(L.pack_unit("Beef Stock Pots 4 x 28 g"), "g")
        self.assertEqual(L.pack_unit("Rice 1kg"), "g")
        self.assertIsNone(L.pack_unit("Chicken Stock Pots 4 Pack"))
        self.assertIsNone(L.pack_unit(""))

    def test_unitless_heading_takes_the_packs_unit(self):
        t, _ = L.read_table({"nut": TABLE}, "THE PANTRY Lemon Juice 250 ml")
        self.assertEqual(t["per"], "ml")
        self.assertEqual(t["kcal"], "19.21")
        t, _ = L.read_table({"nut": TABLE}, "Beef Stock Pots 4 x 28 g")
        self.assertEqual(t["per"], "g")

    def test_no_pack_size_stays_left_out(self):
        t, why = L.read_table({"nut": TABLE}, "Chicken Stock Pots 4 Pack")
        self.assertIsNone(t)
        self.assertEqual(why, "no per-100 column")

    def test_a_printed_unit_still_wins(self):
        rows = [["Typical values", "per 100ml"], ["Energy kcal", "33"], ["Fat", "0.5 g"], ["Carbohydrate", "2.1 g"], ["Protein", "1.0 g"]]
        t, _ = L.read_table({"nut": rows}, "Lemon Juice 250 g")
        self.assertEqual(t["per"], "ml")


class AldiSizes(unittest.TestCase):
    def test_size_and_price_patterns(self):
        self.assertTrue(A.SIZE.fullmatch("1 kg"))
        self.assertTrue(A.SIZE.fullmatch("4 x 28 g"))
        self.assertFalse(A.SIZE.search("EVERYDAY ESSENTIALS Porridge Oats"))
        m = A.PER.search("1 kg (£0.85/1 KG)")
        self.assertEqual((m.group(1), m.group(2), m.group(3)), ("0.85", "1", "KG"))
        m = A.PER.search("150 g (£1.06/100 G)")
        self.assertEqual((m.group(1), m.group(2), m.group(3)), ("1.06", "100", "G"))


if __name__ == "__main__":
    unittest.main()
