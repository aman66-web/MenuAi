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
                "grocery-images/tesco/1.webp", "grocery-images/sainsburys/1.webp", "recipe-images/oats-1a2b.webp", "recipe-images/thumbs/oats-1a2b.webp"]:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("x")
    (root / "groceries/all/all-manifest.json").write_text(json.dumps({"v": 1, "retailers": [{"id": "sainsburys", "file": "sainsburys.json"}, {"id": "tesco", "file": "tesco.json"}]}))
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
        self.assertFalse((dst / "menus-sample").exists())
        self.assertFalse((dst / "sw.js").exists())

    def test_photos_and_a_shop_left_out(self):
        dst = self.run_pack({"menuPhotos": False, "shops": ["sainsburys"]})
        self.assertFalse((dst / "menu-images").exists())
        self.assertFalse((dst / "groceries/all/tesco.json").exists())
        self.assertFalse((dst / "groceries/tesco.json").exists())
        self.assertFalse((dst / "grocery-images/tesco").exists())
        full = json.loads((dst / "groceries/all/all-manifest.json").read_text())
        self.assertEqual([r["id"] for r in full["retailers"]], ["sainsburys"])
        cat = json.loads((dst / "groceries/groceries-manifest.json").read_text())
        self.assertEqual([r["id"] for r in cat["retailers"]], ["sainsburys", "coop"])  # community-only shops stay as on the website
        self.assertTrue((dst / "logos/kfc.png").exists())

    def test_remote_images_leave_out_dish_and_product_photos_but_keep_our_recipe_pictures(self):
        # 20 November 2026: a recipe and its picture ship in the same build, so a build newer than the live site never shows recipes without pictures
        dst = self.run_pack({"menuPhotos": True, "remoteImages": True, "shops": ["sainsburys", "tesco"]})
        self.assertFalse((dst / "menu-images").exists())
        self.assertFalse((dst / "grocery-images").exists())
        self.assertTrue((dst / "recipe-images/oats-1a2b.webp").exists())
        self.assertTrue((dst / "recipe-images/thumbs/oats-1a2b.webp").exists())

    def test_unknown_shop_is_an_error(self):
        tmp = Path(tempfile.mkdtemp())
        make_export(tmp / "src")
        (tmp / "content.json").write_text(json.dumps({"shops": ["sainsburys", "costco"]}))
        self.assertEqual(pack.main(tmp / "src", tmp / "dst", tmp / "content.json"), 1)


if __name__ == "__main__":
    unittest.main()
