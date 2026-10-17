"""scripts/pack_app_web.py: what goes inside the iPhone app (docs/APP_BUILD.md)."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("pack_app_web", Path(__file__).resolve().parents[2] / "scripts/pack_app_web.py")
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


def make_export(root: Path) -> None:
    for rel in ["app.html", "sw.js", "menus/menus-manifest.json", "menus-sample/x.json", "menu-images/kfc/a.webp", "logos/kfc.png",
                "groceries/tesco.json", "groceries/sainsburys.json", "groceries/coop.json", "groceries/all/tesco.json", "groceries/all/sainsburys.json",
                "groceries/recipe/tesco.json", "groceries/recipe/asda.json", "grocery-images/tesco/1.webp", "grocery-images/sainsburys/1.webp"]:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("x")
    (root / "groceries/all/all-manifest.json").write_text(json.dumps({"v": 1, "retailers": [{"id": "sainsburys", "file": "sainsburys.json"},
                                                                                    {"id": "tesco", "file": "tesco.json", "recipe": {"file": "tesco.json", "count": 1, "own": 1, "sha256": "x"}},
                                                                                    {"id": "asda", "file": "asda.json", "recipe": {"file": "asda.json", "count": 1, "own": 1, "sha256": "x"}}]}))
    (root / "groceries/groceries-manifest.json").write_text(json.dumps({"v": 1, "retailers": [{"id": "tesco", "file": "tesco.json"}, {"id": "sainsburys", "file": "sainsburys.json"}, {"id": "coop", "file": "coop.json"}]}))


class PackTests(unittest.TestCase):
    def run_pack(self, content: dict) -> Path:
        tmp = Path(tempfile.mkdtemp())
        make_export(tmp / "src")
        (tmp / "content.json").write_text(json.dumps(content))
        self.assertEqual(pack.main(tmp / "src", tmp / "dst", tmp / "content.json"), 0)
        return tmp / "dst"

    def test_everything_in_except_samples_and_service_worker(self):
        dst = self.run_pack({"menuPhotos": True, "shops": ["sainsburys", "tesco"]})
        self.assertTrue((dst / "menu-images/kfc/a.webp").exists())
        self.assertTrue((dst / "groceries/all/tesco.json").exists())
        self.assertTrue((dst / "groceries/recipe/tesco.json").exists())
        self.assertFalse((dst / "groceries/recipe/asda.json").exists())                # asda is not in the shops list: its list and its recipe rows are left out
        self.assertFalse((dst / "menus-sample").exists())
        self.assertFalse((dst / "sw.js").exists())

    def test_photos_and_a_shop_left_out(self):
        dst = self.run_pack({"menuPhotos": False, "shops": ["sainsburys"]})
        self.assertFalse((dst / "menu-images").exists())
        self.assertFalse((dst / "groceries/all/tesco.json").exists())
        self.assertFalse((dst / "groceries/tesco.json").exists())
        self.assertFalse((dst / "grocery-images/tesco").exists())
        self.assertFalse((dst / "groceries/recipe/tesco.json").exists())               # the labelled rows recipes swap to at a left-out shop go too
        self.assertFalse((dst / "groceries/recipe/asda.json").exists())
        full = json.loads((dst / "groceries/all/all-manifest.json").read_text())
        self.assertEqual([r["id"] for r in full["retailers"]], ["sainsburys"])
        cat = json.loads((dst / "groceries/groceries-manifest.json").read_text())
        self.assertEqual([r["id"] for r in cat["retailers"]], ["sainsburys", "coop"])  # community-only shops stay as on the website
        self.assertTrue((dst / "logos/kfc.png").exists())

    def test_unknown_shop_is_an_error(self):
        tmp = Path(tempfile.mkdtemp())
        make_export(tmp / "src")
        (tmp / "content.json").write_text(json.dumps({"shops": ["sainsburys", "costco"]}))
        self.assertEqual(pack.main(tmp / "src", tmp / "dst", tmp / "content.json"), 1)


if __name__ == "__main__":
    unittest.main()
