"""Tests for tools/build_menus.py. Run: python3 -m unittest discover -s tools/tests"""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import build_menus as bm  # noqa: E402

NUT = "calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,sugar_g,fiber_g"
EMPTY_NUTRIENTS = ",,,,,,,"  # eight empty nutrient cells


def write_chain(src: Path, chain_id="test-chain", builder="build_your_own", components="", items="", modifiers="", combos="",
                chain_row=None):
    folder = src / chain_id
    folder.mkdir(parents=True)
    (folder / "chain.csv").write_text(
        "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample\n"
        + (chain_row or f"{chain_id},Test Chain,Test,{builder},Guide,https://example.com,2026-10-01,test chain,true") + "\n")
    (folder / "components.csv").write_text(f"id,group,name,portion,{NUT},tags,removable,allow_double\n" + components)
    (folder / "items.csv").write_text(f"id,name,category,serving,{NUT},tags,limited_time,rankable,components,added_on,notes\n" + items)
    (folder / "modifiers.csv").write_text(f"item_id,id,label,kind,{NUT},tags\n" + modifiers)
    (folder / "combos.csv").write_text("id,name,item_ids\n" + combos)
    return folder


def item_row(item_id, name, category, components="", nutrients=EMPTY_NUTRIENTS, tags="", rankable=""):
    """items.csv row: id,name,category,serving,<8 nutrients>,tags,limited_time,rankable,components,added_on,notes"""
    return f"{item_id},{name},{category},1,{nutrients},{tags},,{rankable},{components},2026-10-01,\n"


BASIC_COMPONENTS = (
    "rice,base,Rice,4 oz,210,4,40,4,1,350,0,1,vegetarian,false,false\n"
    "greens,base,Greens,2 oz,10,1,2,0,0,10,0,1,vegetarian,false,false\n"
    "chicken,protein,Chicken,4 oz,180,32,0,7,3,310,0,0,,false,true\n"
    "cheese,topping,Cheese,1 oz,110,6,1,8.5,5,190,0,0,vegetarian,true,false\n"
    "dressing,sauce,Dressing,2 oz,220,1,18,16,2.5,,12,1,vegetarian,true,false\n"
)
BASIC_ITEMS = item_row("bowl", "Chicken bowl", "Bowls", components="chicken|rice|cheese|dressing")


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / "source"
        self.out = self.tmp / "out"
        self.src.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def build(self, *extra, source=None):
        with contextlib.redirect_stderr(io.StringIO()):
            return bm.main(["--source", str(source or self.src), "--out", str(self.out), "--quiet", *extra])

    def report(self):
        return (self.out / "check-report.md").read_text()

    def doc(self, chain_id="test-chain"):
        return json.loads((self.out / f"chain-{chain_id}.json").read_text())

    # --- the shipped samples -------------------------------------------------
    def test_shipped_samples_build_without_errors_or_warnings(self):
        # Only the two fictional sample chains: real chains sit beside them in data/source and have their own checks.
        samples = self.tmp / "samples"
        for name in ("bowl-and-co", "cluck-house"):
            shutil.copytree(ROOT / "data" / "source" / name, samples / name)
        self.assertEqual(self.build(source=samples), 0)
        manifest = json.loads((self.out / "menus-manifest.json").read_text())
        self.assertEqual({c["id"] for c in manifest["chains"]}, {"bowl-and-co", "cluck-house"})
        for c in manifest["chains"]:
            self.assertEqual(bm.file_sha256(self.out / c["file"]), c["sha256"])
        self.assertIn("Warnings: 0", self.report())

    def test_output_matches_json_schema(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("pip install jsonschema to run schema validation")
        self.build(source=ROOT / "data" / "source")
        chain_schema = json.loads((ROOT / "data/schema/chain.schema.json").read_text())
        manifest_schema = json.loads((ROOT / "data/schema/manifest.schema.json").read_text())
        manifest = json.loads((self.out / "menus-manifest.json").read_text())
        jsonschema.validate(manifest, manifest_schema)
        for c in manifest["chains"]:
            jsonschema.validate(json.loads((self.out / c["file"]).read_text()), chain_schema)

    # --- nutrient maths ------------------------------------------------------
    def test_optional_nutrient_missing_in_any_part_is_omitted(self):
        total = bm.add_nutrients([({"calories": 100, "protein": 10, "carbs": 5, "fat": 4, "sodium": 200}, 1),
                                  ({"calories": 50, "protein": 1, "carbs": 10, "fat": 0}, 1)])
        self.assertEqual(total["calories"], 150)
        self.assertNotIn("sodium", total)

    def test_double_quantity_and_half_up_rounding(self):
        self.assertEqual(bm.add_nutrients([({"calories": 180, "protein": 32, "carbs": 0, "fat": 7.25}, 2)]),
                         {"calories": 360, "protein": 64, "carbs": 0, "fat": 14.5})
        self.assertEqual(bm.round_nutrient("calories", 100.5), 101)   # Python's round() would give 100
        self.assertEqual(bm.round_nutrient("fat", 10.25), 10.3)

    def test_energy_check(self):
        self.assertIsNone(bm.energy_problem({"calories": 440, "protein": 28, "carbs": 41, "fat": 18}))
        self.assertIsNotNone(bm.energy_problem({"calories": 900, "protein": 28, "carbs": 41, "fat": 18}))
        self.assertIsNone(bm.energy_problem({"calories": 40, "protein": 3, "carbs": 0, "fat": 3}))
        self.assertIsNotNone(bm.energy_problem({"calories": 1, "protein": 500, "carbs": 40, "fat": 20}))  # small-item check

    def test_less_than_values_are_stored_as_zero(self):
        write_chain(self.src, builder="standard", items=item_row("tea", "Tea", "Drinks", nutrients="5,<1,1,0,0,<5,0,0"))
        self.assertEqual(self.build(), 0)
        n = self.doc()["items"][0]["nutrients"]
        self.assertEqual((n["protein"], n["sodium"]), (0, 0))

    # --- validation ----------------------------------------------------------
    def test_valid_chain_builds_and_item_totals_come_from_components(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.assertEqual(self.build(), 0)
        bowl = self.doc()["items"][0]
        self.assertEqual(bowl["nutrients"]["calories"], 720)
        self.assertNotIn("sodium", bowl["nutrients"])  # dressing has no published sodium
        self.assertEqual(bowl["tags"], [])  # chicken is not vegetarian

    def test_unquoted_comma_is_an_error(self):
        write_chain(self.src, builder="standard", items="melt,Chicken, bacon melt,Sandwiches,1,500,30,40,20,,,,,,,,,2026-10-01,\n")
        self.assertEqual(self.build(), 1)
        self.assertIn("must be quoted", self.report())

    def test_misspelled_header_is_an_error(self):
        folder = write_chain(self.src, builder="standard", items=item_row("a", "A", "B", nutrients="100,5,10,4,,,,"))
        (folder / "items.csv").write_text((folder / "items.csv").read_text().replace("sodium_mg", "sodium"))
        self.assertEqual(self.build(), 1)
        self.assertIn("header mismatch", self.report())

    def test_non_utf8_file_is_a_clear_error(self):
        folder = write_chain(self.src, builder="standard", items=item_row("a", "A", "B", nutrients="100,5,10,4,,,,"))
        (folder / "items.csv").write_bytes((folder / "items.csv").read_text().replace("a,A,B", "a,Jalapeño,B").encode("cp1252"))
        self.assertEqual(self.build(), 1)
        self.assertIn("not UTF-8", self.report())

    def test_bad_values_are_errors(self):
        write_chain(self.src, builder="standard",
                    chain_row="test-chain,Test,Test,standard,Guide,http://example.com,2026-13-45,,true",
                    items=item_row("a", "A", "B", nutrients="nan,5,10,4,,,,", tags="halal")
                          + item_row("b", "B", "B", nutrients="100,5,10,,,,,"))
        self.assertEqual(self.build(), 1)
        r = self.report()
        for expected in ["https://", "real date", "not a number", "unknown tag 'halal'", "fat_g"]:
            self.assertIn(expected, r)

    def test_unknown_component_is_an_error(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=item_row("bowl", "Bowl", "Bowls", components="chicken|tofu"))
        self.assertEqual(self.build(), 1)
        self.assertIn("unknown component 'tofu'", self.report())

    def test_doubling_rules(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=item_row("bowl", "Bowl", "Bowls", components="chicken|cheese:2"))
        self.assertEqual(self.build(), 1)
        shutil.rmtree(self.src / "test-chain")
        write_chain(self.src, components=BASIC_COMPONENTS, items=item_row("bowl", "Bowl", "Bowls", components="chicken|chicken|rice"))
        self.assertEqual(self.build(), 1)
        self.assertIn("listed twice", self.report())

    def test_remove_modifier_larger_than_item_is_an_error(self):
        write_chain(self.src, builder="standard",
                    items=item_row("sandwich", "Sandwich", "Sandwiches", nutrients="300,20,30,10,,,5,"),
                    modifiers="sandwich,no-sauce,No sauce,remove,60,0,14,0,,,9,,\n")
        self.assertEqual(self.build(), 1)

    def test_duplicate_combo_and_reserved_ids_are_errors(self):
        write_chain(self.src, builder="standard",
                    items=item_row("a", "A", "Mains", nutrients="300,20,30,10,,,,") + item_row("combo-x", "B", "Mains", nutrients="100,5,10,4,,,,"),
                    combos="x,One,a|a\nx,Two,a|a\n")
        self.assertEqual(self.build(), 1)
        r = self.report()
        self.assertIn("duplicate combo id", r)
        self.assertIn("reserved", r)

    def test_only_with_unknown_chain_is_an_error(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.assertEqual(self.build(), 0)
        self.assertEqual(self.build("--only", "nope"), 1)

    def test_energy_mismatch_is_a_warning_not_an_error(self):
        write_chain(self.src, builder="standard", items=item_row("burger", "Burger", "Burgers", nutrients="900,25,40,20,,,,"))
        self.assertEqual(self.build(), 0)
        self.assertIn("Re-check the source", self.report())

    # --- candidates ----------------------------------------------------------
    def test_variations_cover_double_protein_removals_and_base_swaps(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.build()
        doc = self.doc()
        names = [c["name"] for c in doc["combinations"]]
        self.assertIn("Chicken bowl · double chicken", names)
        self.assertIn("Chicken bowl · no cheese, no dressing", names)
        self.assertIn("Chicken bowl · greens instead of rice", names)
        best = next(c for c in doc["combinations"] if c["name"] == "Chicken bowl · double chicken · no cheese, no dressing · greens instead of rice")
        self.assertEqual((best["nutrients"]["calories"], best["nutrients"]["protein"]), (370, 65))
        self.assertEqual(len({c["id"] for c in doc["combinations"]}), len(doc["combinations"]))

    def test_modifier_variations_tags_and_combos(self):
        write_chain(self.src, builder="standard",
                    items=(item_row("sandwich", "Sandwich", "Sandwiches", nutrients="440,28,41,18,,,,")
                           + item_row("melt", "Grilled cheese", "Sandwiches", nutrients="400,15,40,20,,,,", tags="vegetarian")
                           + item_row("fruit", "Fruit cup", "Sides", nutrients="60,1,15,0,,,,", tags="vegetarian")
                           + item_row("soda", "Soda", "Drinks", nutrients="200,0,52,0,,,,", tags="vegetarian", rankable="false")),
                    modifiers=("sandwich,no-mayo,No mayo,remove,100,0,0,11,,,,,\n"
                               "sandwich,no-bbq,No BBQ sauce,remove,60,0,14,0,,,,,\n"
                               "melt,add-bacon,Add bacon,add,40,3,0,3,,,,,contains_pork\n"),
                    combos="lunch,Sandwich + fruit,sandwich|fruit\n")
        self.assertEqual(self.build(), 0)
        by_name = {c["name"]: c for c in self.doc()["combinations"]}
        self.assertEqual(by_name["Sandwich · no mayo"]["nutrients"]["calories"], 340)
        self.assertIn("Sandwich · no mayo · no BBQ sauce", by_name)  # first letter lowered, acronym kept
        self.assertEqual(by_name["Grilled cheese · add bacon"]["tags"], ["contains_pork"])  # no longer vegetarian
        self.assertEqual(by_name["Sandwich + fruit"]["nutrients"]["calories"], 500)
        self.assertFalse(any("Soda" in n for n in by_name))  # rankable=false never becomes a candidate

    # --- manifest, versions, bundling ----------------------------------------
    def test_data_version_is_a_utc_timestamp_and_increases(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.build()
        v1 = json.loads((self.out / "menus-manifest.json").read_text())["dataVersion"]
        time.sleep(1.1)
        self.build()
        v2 = json.loads((self.out / "menus-manifest.json").read_text())["dataVersion"]
        self.assertEqual(len(str(v1)), 14)
        self.assertGreater(v2, v1)

    def test_only_keeps_other_chains_in_manifest(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        write_chain(self.src, chain_id="other", components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.build()
        self.assertEqual(self.build("--only", "other"), 0)
        ids = [c["id"] for c in json.loads((self.out / "menus-manifest.json").read_text())["chains"]]
        self.assertEqual(ids, ["other", "test-chain"])

    def test_bundle_into_copies_flat_files(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        dest = self.tmp / "bundle"
        self.build("--bundle-into", str(dest))
        self.assertEqual(sorted(p.name for p in dest.iterdir()), ["chain-test-chain.json", "menus-manifest.json", "menus-search.json"])

    def test_no_samples_flag_skips_sample_chains(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.build("--no-samples")
        self.assertEqual(json.loads((self.out / "menus-manifest.json").read_text())["chains"], [])


class SaltTests(unittest.TestCase):
    """UK guides publish salt (g) instead of sodium: an optional `salt_g` column, kept to 2 decimals, never converted."""
    NUT_SALT = "calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / "source"
        self.out = self.tmp / "out"
        self.src.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def chain(self, items, components="", modifiers=""):
        folder = self.src / "uk-chain"
        folder.mkdir(parents=True)
        (folder / "chain.csv").write_text(
            "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample\n"
            "uk-chain,UK Chain,Test,standard,Guide,https://example.com,2026-10-01,uk chain,true\n")
        (folder / "components.csv").write_text(f"id,group,name,portion,{self.NUT_SALT},tags,removable,allow_double\n" + components)
        (folder / "items.csv").write_text(f"id,name,category,serving,{self.NUT_SALT},tags,limited_time,rankable,components,added_on,notes\n" + items)
        (folder / "modifiers.csv").write_text(f"item_id,id,label,kind,{self.NUT_SALT},tags\n" + modifiers)
        (folder / "combos.csv").write_text("id,name,item_ids\n")

    def build(self):
        with contextlib.redirect_stderr(io.StringIO()):
            return bm.main(["--source", str(self.src), "--out", str(self.out), "--quiet"])

    def doc(self):
        return json.loads((self.out / "chain-uk-chain.json").read_text())

    @staticmethod
    def row(item_id, name, nutrients):
        """One items.csv row: nutrients is the nine cells calories,protein,carbs,fat,sat_fat,sodium,salt,sugar,fiber."""
        return ",".join([item_id, name, "Sides", "1", *nutrients, "", "", "", "", "2026-10-01", ""]) + "\n"

    def test_salt_is_read_and_kept_to_two_decimals(self):
        self.chain(self.row("burger", "Burger", ["463", "28.8", "43.0", "18.7", "2.2", "", "2.20", "6.5", ""]))
        self.assertEqual(self.build(), 0)
        n = self.doc()["items"][0]["nutrients"]
        self.assertEqual(n["salt"], 2.2)
        self.assertNotIn("sodium", n)  # sodium was blank: not published, and never derived from salt

    def test_small_salt_values_are_not_rounded_away(self):
        self.chain(self.row("side", "Side salad", ["56", "0.8", "4.7", "3.6", "0.3", "", "0.20", "2.1", ""])
                   + self.row("hash", "Hash brown", ["92", "0.9", "8.8", "5.5", "0.2", "", "0.55", "0.7", ""]))
        self.assertEqual(self.build(), 0)
        salts = {i["id"]: i["nutrients"]["salt"] for i in self.doc()["items"]}
        self.assertEqual(salts, {"side": 0.2, "hash": 0.55})
        self.assertEqual(bm.round_nutrient("salt", 0.164), 0.16)
        self.assertEqual(bm.round_nutrient("salt", 0.165), 0.17)  # half up
        self.assertEqual(bm.round_nutrient("sugar", 6.55), 6.6)  # other nutrients still use one decimal

    def test_salt_total_only_when_every_part_publishes_it(self):
        total = bm.add_nutrients([({"calories": 100, "protein": 1, "carbs": 1, "fat": 1, "salt": 0.5}, 1),
                                  ({"calories": 50, "protein": 1, "carbs": 1, "fat": 1, "salt": 0.16}, 2)])
        self.assertEqual(total["salt"], 0.82)
        missing = bm.add_nutrients([({"calories": 100, "protein": 1, "carbs": 1, "fat": 1, "salt": 0.5}, 1),
                                    ({"calories": 50, "protein": 1, "carbs": 1, "fat": 1}, 1)])
        self.assertNotIn("salt", missing)

    def test_the_salt_column_may_be_left_out_of_older_files(self):
        # the shipped samples have no salt_g column and must keep building (and stay byte-identical)
        out = self.tmp / "samples"
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(bm.main(["--source", str(ROOT / "data" / "source"), "--out", str(out), "--quiet"]), 0)
        self.assertNotIn("salt", (out / "chain-cluck-house.json").read_text())

    def test_other_unknown_columns_are_still_rejected(self):
        self.chain(self.row("burger", "Burger", ["463", "28.8", "43.0", "18.7", "2.2", "", "2.20", "6.5", ""]))
        folder = self.src / "uk-chain"
        text = (folder / "items.csv").read_text().replace("salt_g", "salt_mg")
        (folder / "items.csv").write_text(text)
        self.assertEqual(self.build(), 1)


class MixedLevelTests(SaltTests):
    """nutrition_level 'mixed' (docs/DATA.md): items have protein, carbs and fat together or not at all; those without are never rankable."""

    def chain(self, items, components="", modifiers=""):
        super().chain(items, components, modifiers)
        csv = self.src / "uk-chain" / "chain.csv"
        csv.write_text(
            "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample,nutrition_level\n"
            "uk-chain,UK Chain,Test,standard,Guide,https://example.com,2026-10-01,uk chain,true,mixed\n")

    def test_a_drink_with_calories_only_sits_beside_full_items(self):
        self.chain(self.row("burger", "Burger", ["463", "28.8", "43.0", "18.7", "2.2", "", "2.20", "6.5", ""])
                   + self.row("lager", "Lager", ["210", "", "", "", "", "", "", "", ""]))
        self.assertEqual(self.build(), 0)
        items = {i["id"]: i for i in self.doc()["items"]}
        self.assertEqual(items["burger"]["rankable"], True)
        self.assertEqual(items["lager"]["nutrients"], {"calories": 210})
        self.assertEqual(items["lager"]["rankable"], False)   # never suggested without protein, carbs and fat
        self.assertNotIn("nutritionLevel", self.doc())  # the chain itself is shown as a full-nutrition chain

    def test_one_or_two_of_protein_carbs_fat_is_an_error(self):
        self.chain(self.row("half", "Half", ["300", "10", "", "", "", "", "", "", ""]))
        self.assertNotEqual(self.build(), 0)

    def test_calories_are_still_required(self):
        self.chain(self.row("none", "Nothing", ["", "", "", "", "", "", "", "", ""]))
        self.assertNotEqual(self.build(), 0)

    def test_a_full_chain_still_needs_all_four_numbers(self):
        SaltTests.chain(self, self.row("lager", "Lager", ["210", "", "", "", "", "", "", "", ""]))
        self.assertNotEqual(self.build(), 0)


if __name__ == "__main__":
    unittest.main()


class NoteAndHoldbackTests(unittest.TestCase):
    """Optional chain `note` (a published-data limit) and holdback.csv (impossible printed numbers are not published)."""
    NUT = "calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,sugar_g,fiber_g"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / "source"
        self.out = self.tmp / "out"
        (self.src / "uk-chain").mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def write(self, chain_header="id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample",
              chain_row="uk-chain,UK Chain,Test,standard,Guide,https://example.com,2026-10-01,uk chain,true", holdback=None):
        f = self.src / "uk-chain"
        (f / "chain.csv").write_text(chain_header + "\n" + chain_row + "\n")
        (f / "components.csv").write_text(f"id,group,name,portion,{self.NUT},tags,removable,allow_double\n")
        rows = "".join(",".join([i, n, "Mains", "1", str(cal), str(p), str(c), str(fa), "1", "100", "1", "1", "", "false", "true", "", "2026-10-01", ""]) + "\n"
                       for i, n, cal, p, c, fa in [("burger", "Burger", 463, 28, 43, 19), ("odd", "Odd burger", 510, 28, 367, 19)])
        (f / "items.csv").write_text(f"id,name,category,serving,{self.NUT},tags,limited_time,rankable,components,added_on,notes\n" + rows)
        (f / "modifiers.csv").write_text(f"item_id,id,label,kind,{self.NUT},tags\n")
        (f / "combos.csv").write_text("id,name,item_ids\n")
        if holdback is not None:
            (f / "holdback.csv").write_text("item_id,reason\n" + holdback)

    def build(self):
        with contextlib.redirect_stderr(io.StringIO()):
            return bm.main(["--source", str(self.src), "--out", str(self.out), "--quiet"])

    def doc(self):
        return json.loads((self.out / "chain-uk-chain.json").read_text())

    def test_note_is_optional_and_only_exported_when_present(self):
        self.write()
        self.assertEqual(self.build(), 0)
        self.assertNotIn("note", self.doc())
        (self.src / "uk-chain" / "note.txt").write_text("Sauces are\nnot included.\n")
        self.assertEqual(self.build(), 0)
        self.assertEqual(self.doc()["note"], "Sauces are not included.")
        (self.src / "uk-chain" / "note.txt").write_text("x" * 401)
        self.assertEqual(self.build(), 1)

    def test_holdback_leaves_the_item_out_and_reports_it(self):
        self.write(holdback="odd,Guide prints 367 g of carbohydrate\n")
        self.assertEqual(self.build(), 0)
        self.assertEqual([i["id"] for i in self.doc()["items"]], ["burger"])
        report = (self.out / "check-report.md").read_text()
        self.assertIn("Held back", report)
        self.assertIn("Odd burger (odd): Guide prints 367 g of carbohydrate", report)

    def test_holdback_is_not_a_correction_and_a_stale_line_only_warns(self):
        self.write(holdback="gone,No longer on the menu\n")
        self.assertEqual(self.build(), 0)
        self.assertEqual(len(self.doc()["items"]), 2)  # nothing held, nothing changed
        self.assertIn("'gone' is not in items.csv any more", (self.out / "check-report.md").read_text())

    def test_holdback_needs_a_reason(self):
        self.write(holdback="odd,\n")
        self.assertEqual(self.build(), 1)


    def test_search_index_lists_published_items_only_and_matches_the_manifest(self):
        self.write(holdback="odd,Guide prints 367 g of carbohydrate\n")
        self.assertEqual(self.build(), 0)
        manifest = json.loads((self.out / "menus-manifest.json").read_text())
        self.assertEqual(manifest["search"]["file"], "menus-search.json")
        self.assertEqual(bm.file_sha256(self.out / "menus-search.json"), manifest["search"]["sha256"])
        search = json.loads((self.out / "menus-search.json").read_text())
        (chain,) = search["chains"]
        self.assertEqual((chain["id"], chain["sample"]), ("uk-chain", True))
        self.assertEqual(chain["items"], [["burger", "Burger", 463]])  # the held-back item is not searchable either


class ImagesTests(unittest.TestCase):
    """images.csv: the chain's own item photo, exported as item.image once the stored file checks out."""
    NUT = NoteAndHoldbackTests.NUT

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / "source"
        self.out = self.tmp / "out"
        self.images = self.tmp / "images"
        (self.src / "uk-chain").mkdir(parents=True)
        (self.images / "uk-chain").mkdir(parents=True)
        NoteAndHoldbackTests.write(self, holdback="odd,Guide prints 367 g of carbohydrate\n")
        (self.images / "uk-chain" / "abc123def456.webp").write_bytes(b"RIFFxxxxWEBPfake")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def images_csv(self, *rows):
        (self.src / "uk-chain" / "images.csv").write_text("item_id,file,source_url,retrieved_on\n" + "".join(r + "\n" for r in rows))

    def build(self):
        with contextlib.redirect_stderr(io.StringIO()):
            return bm.main(["--source", str(self.src), "--out", str(self.out), "--images-dir", str(self.images), "--quiet"])

    def items(self):
        return {i["id"]: i for i in json.loads((self.out / "chain-uk-chain.json").read_text())["items"]}

    def test_no_images_file_means_no_image_key(self):
        self.assertEqual(self.build(), 0)
        self.assertNotIn("image", self.items()["burger"])

    def test_a_valid_row_exports_the_image_path(self):
        self.images_csv("burger,abc123def456.webp,https://example.com/menu/burger,2026-10-06")
        self.assertEqual(self.build(), 0)
        self.assertEqual(self.items()["burger"]["image"], "uk-chain/abc123def456.webp")

    def test_a_missing_file_is_an_error(self):
        self.images_csv("burger,000000000000.webp,https://example.com/menu/burger,2026-10-06")
        self.assertEqual(self.build(), 1)

    def test_only_webp_names_and_https_sources_are_accepted(self):
        self.images_csv("burger,abc123def456.png,https://example.com/x,2026-10-06")
        self.assertEqual(self.build(), 1)
        self.images_csv("burger,abc123def456.webp,http://example.com/x,2026-10-06")
        self.assertEqual(self.build(), 1)

    def test_an_oversized_file_is_an_error(self):
        (self.images / "uk-chain" / "abc123def456.webp").write_bytes(b"x" * (bm.MAX_IMAGE_BYTES + 1))
        self.images_csv("burger,abc123def456.webp,https://example.com/x,2026-10-06")
        self.assertEqual(self.build(), 1)

    def test_rows_for_held_back_items_are_ignored_and_stale_rows_only_warn(self):
        self.images_csv("odd,abc123def456.webp,https://example.com/x,2026-10-06",
                        "gone,abc123def456.webp,https://example.com/y,2026-10-06")
        self.assertEqual(self.build(), 0)
        report = (self.out / "check-report.md").read_text()
        self.assertIn("images.csv line 3: item 'gone' is not in items.csv any more", report)
        self.assertNotIn("'odd' is not in items.csv", report)
        self.assertNotIn("image", self.items()["burger"])

    def test_items_may_share_one_photo(self):
        (self.src / "uk-chain" / "holdback.csv").unlink()
        self.images_csv("burger,abc123def456.webp,https://example.com/x,2026-10-06",
                        "odd,abc123def456.webp,https://example.com/x,2026-10-06")
        self.assertEqual(self.build(), 0)
        self.assertEqual({self.items()[i]["image"] for i in ("burger", "odd")}, {"uk-chain/abc123def456.webp"})


class AllergenTests(unittest.TestCase):
    """allergens.csv + allergen_guide.csv: copied from the chain's own guide, all or nothing (docs/DATA.md "Allergens")."""

    GUIDE = "title,url,checked_on,may_contain_published\nAllergen guide (Oct 2026),https://example.com/allergens,2026-10-06,yes\n"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src, self.out = self.tmp / "source", self.tmp / "out"
        self.src.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def build(self):
        with contextlib.redirect_stderr(io.StringIO()):
            return bm.main(["--source", str(self.src), "--out", str(self.out), "--quiet"])

    def report(self):
        return (self.out / "check-report.md").read_text()

    def doc(self):
        return json.loads((self.out / "chain-test-chain.json").read_text())

    def chain(self, rows, guide=GUIDE, builder="build_your_own"):
        f = write_chain(self.src, builder=builder, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        if guide is not None:
            (f / "allergen_guide.csv").write_text(guide)
        if rows is not None:
            (f / "allergens.csv").write_text("id,contains,may_contain,cereals,nuts\n" + rows)
        return f

    FULL = ("rice,,,,\ngreens,celery,,,\nchicken,gluten|eggs,mustard,wheat|barley,\n"
            "cheese,milk,nuts,,\ndressing,mustard|eggs|nuts,sesame,,almond|walnut\n")

    def test_component_items_contain_everything_their_parts_contain(self):
        self.chain(self.FULL)
        self.assertEqual(self.build(), 0, self.report())
        doc = self.doc()
        bowl = doc["items"][0]["allergens"]
        self.assertEqual(bowl["contains"], ["gluten", "eggs", "milk", "mustard", "nuts"])  # canonical order
        self.assertEqual(bowl["mayContain"], ["sesame"])  # mustard and nuts are contained by another part, so not "may"
        self.assertEqual(bowl["cereals"], ["wheat", "barley"])
        self.assertEqual(bowl["nuts"], ["almond", "walnut"])
        self.assertEqual(doc["allergenGuide"], {"title": "Allergen guide (Oct 2026)", "url": "https://example.com/allergens",
                                                "checkedOn": "2026-10-06", "mayContainPublished": True, "complete": True})
        self.assertEqual(next(c for c in doc["components"] if c["id"] == "greens")["allergens"]["contains"], ["celery"])

    def test_a_missing_row_is_an_error_never_a_partial_list(self):
        self.chain(self.FULL.replace("cheese,milk,nuts,,\n", ""))
        self.assertEqual(self.build(), 1)
        self.assertIn("no row for component 'cheese'", self.report())

    def test_standard_item_without_a_row_is_an_error(self):
        f = write_chain(self.src, builder="standard", items=item_row("a", "A", "B", nutrients="100,5,10,4,,,,") + item_row("b", "B", "B", nutrients="100,5,10,4,,,,"))
        (f / "allergen_guide.csv").write_text(self.GUIDE)
        (f / "allergens.csv").write_text("id,contains,may_contain,cereals,nuts\na,milk,,,\n")
        self.assertEqual(self.build(), 1)
        self.assertIn("no row for item 'b'", self.report())

    def test_bad_values_are_errors(self):
        for rows, message in [
            (self.FULL.replace("rice,,,,", "rice,gluten-free,,,"), "unknown allergen 'gluten-free'"),
            (self.FULL.replace("rice,,,,", "rice,milk,milk,,"), "both 'contains' and 'may contain'"),
            (self.FULL.replace("rice,,,,", "rice,,,wheat,"), "cereals named but 'gluten' is not in contains"),
            (self.FULL.replace("rice,,,,", "rice,nuts,,,peanut"), "unknown tree nut 'peanut'"),
            (self.FULL + "rice,,,,\n", "duplicate id 'rice'"),
            (self.FULL + "ghost,,,,\n", "neither an item nor a component"),
        ]:
            with self.subTest(message=message):
                shutil.rmtree(self.src); self.src.mkdir()
                self.chain(rows)
                self.assertEqual(self.build(), 1)
                self.assertIn(message, self.report())

    def test_allergens_need_the_guide(self):
        self.chain(self.FULL, guide=None)
        self.assertEqual(self.build(), 1)
        self.assertIn("needs allergen_guide.csv", self.report())

    def test_guide_without_allergens_is_link_only(self):
        self.chain(None)
        self.assertEqual(self.build(), 0, self.report())
        doc = self.doc()
        self.assertFalse(doc["allergenGuide"]["complete"])
        self.assertNotIn("allergens", doc["items"][0])

    def test_output_matches_schema(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("pip install jsonschema to run schema validation")
        self.chain(self.FULL)
        self.assertEqual(self.build(), 0)
        jsonschema.validate(self.doc(), json.loads((ROOT / "data/schema/chain.schema.json").read_text()))


class ExtraNutrientTests(unittest.TestCase):
    """Optional extra columns (energy_kj, weight_g, mono/poly/trans fat, caffeine_mg): copied when printed, optional in old files."""

    def test_extra_columns_are_read_and_old_files_still_build(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            src, out = tmp / "s", tmp / "o"
            f = write_chain(src, builder="standard", items=item_row("a", "A", "B", nutrients="100,5,10,4,,,,"))
            (f / "items.csv").write_text(
                f"id,name,category,serving,{NUT},salt_g,energy_kj,weight_g,mono_fat_g,poly_fat_g,trans_fat_g,caffeine_mg,tags,limited_time,rankable,components,added_on,notes\n"
                "a,A,B,1,100,5,10,4,,,,,0.5,418,120,1.2,0.8,<0.1,75,,,,,,\n")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(bm.main(["--source", str(src), "--out", str(out), "--quiet"]), 0, (out / "check-report.md").read_text())
            n = json.loads((out / "chain-test-chain.json").read_text())["items"][0]["nutrients"]
            self.assertEqual((n["energyKj"], n["weight"], n["monounsaturatedFat"], n["polyunsaturatedFat"], n["transFat"], n["caffeine"]), (418, 120, 1.2, 0.8, 0, 75))
        finally:
            shutil.rmtree(tmp)


class CaloriesOnlyTests(unittest.TestCase):
    """nutrition_level=calories: only calories required, macros stay absent, nothing rankable."""

    def build(self, chain_row, items_text, builder="standard"):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        src, out = tmp / "s", tmp / "o"
        f = write_chain(src, builder=builder, items="")
        (f / "chain.csv").write_text("id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample,nutrition_level\n" + chain_row + "\n")
        (f / "items.csv").write_text(f"id,name,category,serving,{NUT},tags,limited_time,rankable,components,added_on,notes\n" + items_text)
        with contextlib.redirect_stderr(io.StringIO()):
            code = bm.main(["--source", str(src), "--out", str(out), "--quiet"])
        report = (out / "check-report.md").read_text()
        doc = json.loads((out / "chain-test-chain.json").read_text()) if code == 0 else None
        manifest = json.loads((out / "menus-manifest.json").read_text())["chains"][0] if code == 0 else None
        return code, report, doc, manifest

    ROW = "test-chain,Test Chain,Test,standard,Guide,https://example.com,2026-10-01,test chain,true,calories"

    def test_calories_only_items_build_without_macros_and_are_never_rankable(self):
        code, report, doc, manifest = self.build(self.ROW, "a,Cod & chips,Mains,1,900,,,,,,,,,,true,,2026-10-01,\nb,Garden salad,Sides,1,150,,,,,,,,,,,,2026-10-01,\n")
        self.assertEqual(code, 0, report)
        self.assertEqual(doc["nutritionLevel"], "calories")
        self.assertEqual(manifest["nutritionLevel"], "calories")
        for item in doc["items"]:
            self.assertEqual(list(item["nutrients"]), ["calories"])  # protein, carbs and fat are absent, not 0
            self.assertFalse(item["rankable"])
        self.assertEqual(doc["combinations"], [])

    def test_a_full_chain_still_needs_every_macro(self):
        row = "test-chain,Test Chain,Test,standard,Guide,https://example.com,2026-10-01,test chain,true,"
        code, report, _, _ = self.build(row, "a,Cod,Mains,1,900,,,,,,,,,,,,2026-10-01,\n")
        self.assertEqual(code, 1)
        self.assertIn("missing required nutrient column", report)

    def test_bad_level_and_build_your_own_are_errors(self):
        code, report, _, _ = self.build(self.ROW.replace(",calories", ",lots"), "a,Cod,Mains,1,900,,,,,,,,,,,,2026-10-01,\n")
        self.assertEqual(code, 1)
        self.assertIn("nutrition_level must be", report)
        code, report, _, _ = self.build(self.ROW.replace("standard", "build_your_own"), "a,Cod,Mains,1,900,,,,,,,,,,,,2026-10-01,\n", builder="build_your_own")
        self.assertEqual(code, 1)
        self.assertIn("can't be build_your_own", report)

    def test_schema(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("pip install jsonschema")
        _, _, doc, manifest = self.build(self.ROW, "a,Cod,Mains,1,900,,,,,,,,,,,,2026-10-01,\n")
        jsonschema.validate(doc, json.loads((ROOT / "data/schema/chain.schema.json").read_text()))
        self.assertEqual(manifest["nutritionLevel"], "calories")
