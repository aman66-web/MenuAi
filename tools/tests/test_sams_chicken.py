"""Run: python3 -m unittest discover -s tools/tests

Sam's Chicken extractor: a page whose basis line is a weight ("Average per 25g.") is held back when its own figures cannot fit in that
weight (the accuracy audit's macros-exceed-weight and kcal-per-gram rules), and the gram basis is read from the basis line."""
import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "uk_extract"))
import sams_chicken as sc  # noqa: E402


def figures(energy, protein, fat, sat, carbs, sugars, sodium="0.5"):
    return {"ENERGY": energy, "PROTEIN": protein, "FAT": fat, "SAT FAT": sat, "CARBS": carbs, "SUGARS": sugars, "SODIUM": sodium}


class SamsChickenWeightRuleTests(unittest.TestCase):
    def test_basis_grams_reads_only_weights(self):
        self.assertEqual(sc.basis_grams("Average per 25g."), Decimal(25))
        self.assertEqual(sc.basis_grams("Average per one 150g."), Decimal(150))
        self.assertEqual(sc.basis_grams("Average per 100g."), Decimal(100))
        for counted in ("", "Average per one wing.", "Average per 5 nuggets.", "Average per whole chicken."):
            self.assertIsNone(sc.basis_grams(counted))

    def test_sams_mayo_is_held_back_by_its_own_25_g_basis(self):
        f = figures("261", "0.3", "23", "2.6", "12", "8.5")      # 35.3 g of macros and 10.4 kcal a gram in a 25 g basis
        self.assertIsNone(sc.contradiction(f))                    # fine on its own numbers (energy agrees with 4P+4C+9F)
        why = sc.contradiction(f, sc.basis_grams("Average per 25g."))
        self.assertIn("35.3 g of macros in a basis of only 25 g", why)
        self.assertIn("more than pure fat", why)

    def test_sweet_chili_mayo_is_held_back_but_chili_mayo_is_inside_the_audit_tolerance(self):
        sweet = figures("196", "0.25", "16.44", "1.86", "10.95", "8.42")    # 27.64 g > 25 x 1.05 + 1
        self.assertIn("27.6 g of macros", sc.contradiction(sweet, Decimal(25)) or "")
        chili = figures("189", "0.29", "16.53", "1.87", "8.86", "6.13")     # 25.68 g, within the tolerance
        self.assertIsNone(sc.contradiction(chili, Decimal(25)))

    def test_ordinary_gram_basis_rows_and_counted_rows_are_untouched(self):
        fries = figures("295", "3.57", "11.83", "0.93", "46.01", "0.53")   # 61.4 g of macros in 150 g
        self.assertIsNone(sc.contradiction(fries, Decimal(150)))
        wing = figures("184", "11.52", "12.11", "2.17", "7.48", "0.3")
        self.assertIsNone(sc.contradiction(wing, sc.basis_grams("Average per one wing.")))

    def test_kcal_per_gram_rule_alone(self):
        oil = figures("300", "0", "30", "4", "0", "0")   # 30 g of macros against 25 x 1.05 + 1 = 27.25 g: the macros rule fires
        self.assertIsNotNone(sc.contradiction(oil, Decimal(25)))
        dense = figures("240", "0", "20", "3", "2", "1")  # 22 g of macros fits 25 g, but 240 kcal / 25 g = 9.6 kcal a gram
        self.assertIn("9.6 kcal a gram", sc.contradiction(dense, Decimal(25)) or "")


if __name__ == "__main__":
    unittest.main()
