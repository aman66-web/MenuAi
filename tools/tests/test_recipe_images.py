"""Tests for tools/recipes/import_recipe_images.py. Run: python3 -m unittest discover -s tools/tests"""
import io
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "recipes"))
import import_recipe_images as iri  # noqa: E402


def png(w: int, h: int) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 120, 40)).save(buf, "PNG")
    return buf.getvalue()


class RecipeImageTests(unittest.TestCase):
    def test_ids_come_from_the_recipe_book(self):
        ids = iri.recipe_ids()
        self.assertIn("chicken-rice-bowl", ids)
        self.assertGreater(len(ids), 10)

    def test_import_crops_resizes_and_lists(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            src, out, index = d / "src", d / "out", d / "recipeImages.ts"
            src.mkdir()
            (src / "chicken-rice-bowl.png").write_bytes(png(1024, 1024))
            (src / "Not-A-Recipe.jpg").write_bytes(png(10, 10))
            (src / "notes.txt").write_text("ignored")
            out.mkdir()
            (out / "old-1234.webp").write_bytes(b"x")
            mapping, skipped = iri.run(src, out, index, {"chicken-rice-bowl"})
            self.assertEqual(list(mapping), ["chicken-rice-bowl"])
            self.assertEqual(skipped, ["Not-A-Recipe.jpg"])
            files = list(out.glob("*.webp"))
            self.assertEqual(len(files), 1)
            self.assertTrue(files[0].name.startswith("chicken-rice-bowl-"))
            with Image.open(files[0]) as im:
                self.assertEqual(im.size, (800, 600))
            text = index.read_text()
            self.assertIn(f'"chicken-rice-bowl": "/recipe-images/{files[0].name}"', text)
            # removing the source takes it out again
            (src / "chicken-rice-bowl.png").unlink()
            mapping, _ = iri.run(src, out, index, {"chicken-rice-bowl"})
            self.assertEqual(mapping, {})
            self.assertEqual(list(out.glob("*.webp")), [])
            self.assertIn("= {};", index.read_text())

    def test_small_pictures_are_not_enlarged(self):
        from PIL import Image

        with Image.open(io.BytesIO(iri.to_webp(png(400, 200)))) as im:
            self.assertEqual(im.size, (266, 200))


if __name__ == "__main__":
    unittest.main()
