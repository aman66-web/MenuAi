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
        self.assertEqual(self.build(source=ROOT / "data" / "source"), 0)
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
        self.assertEqual(sorted(p.name for p in dest.iterdir()), ["chain-test-chain.json", "menus-manifest.json"])

    def test_no_samples_flag_skips_sample_chains(self):
        write_chain(self.src, components=BASIC_COMPONENTS, items=BASIC_ITEMS)
        self.build("--no-samples")
        self.assertEqual(json.loads((self.out / "menus-manifest.json").read_text())["chains"], [])


if __name__ == "__main__":
    unittest.main()
