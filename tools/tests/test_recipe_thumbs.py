"""Tests for tools/recipes/make_recipe_thumbs.py. Run: python3 -m unittest discover -s tools/tests"""
import io
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "recipes"))
import make_recipe_thumbs as mrt  # noqa: E402


def webp(w: int, h: int) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 120, 40)).save(buf, "WEBP")
    return buf.getvalue()


class RecipeThumbTests(unittest.TestCase):
    def test_copies_are_resized_only_listed_and_tidied(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            images, thumbs = d / "recipe-images", d / "recipe-images" / "thumbs"
            images.mkdir()
            (images / "chicken-rice-bowl-0123456789.webp").write_bytes(webp(800, 600))
            (images / "tiny-snack-abcdef0123.webp").write_bytes(webp(200, 150))
            index, out_index = d / "recipeImages.ts", d / "recipeThumbs.ts"
            index.write_text(
                'export const RECIPE_IMAGES: Readonly<Record<string, string>> = {\n'
                '  "chicken-rice-bowl": "/recipe-images/chicken-rice-bowl-0123456789.webp",\n'
                '  "gone-recipe": "/recipe-images/gone-recipe-9999999999.webp",\n'
                '  "tiny-snack": "/recipe-images/tiny-snack-abcdef0123.webp",\n'
                "};\n"
            )
            thumbs.mkdir()
            (thumbs / "old-1111111111.webp").write_bytes(b"x")
            mapping = mrt.run(images, thumbs, index, out_index)
            # a picture listed but missing on disk gets no copy; an old copy is deleted
            self.assertEqual(mapping, {"chicken-rice-bowl": "chicken-rice-bowl-0123456789.webp", "tiny-snack": "tiny-snack-abcdef0123.webp"})
            self.assertEqual(sorted(p.name for p in thumbs.glob("*.webp")), sorted(mapping.values()))
            with Image.open(thumbs / "chicken-rice-bowl-0123456789.webp") as im:
                self.assertEqual(im.size, (240, 180))  # the same shape, never cropped
            with Image.open(thumbs / "tiny-snack-abcdef0123.webp") as im:
                self.assertEqual(im.size, (200, 150))  # never enlarged
            text = out_index.read_text()
            self.assertIn('"chicken-rice-bowl": "/recipe-images/thumbs/chicken-rice-bowl-0123456789.webp"', text)
            self.assertNotIn("gone-recipe", text)
            # the full pictures themselves are never touched
            self.assertEqual(sorted(p.name for p in images.glob("*.webp")), ["chicken-rice-bowl-0123456789.webp", "tiny-snack-abcdef0123.webp"])

    def test_every_published_picture_has_its_copy(self):
        # the generated list matches the pictures in the app (rerun the script after import_recipe_images.py if this fails)
        full = mrt.read_index()
        thumbs = mrt.ENTRY_THUMB.findall(mrt.THUMBS_INDEX.read_text(encoding="utf-8"))
        self.assertEqual(dict(thumbs), full)
        for name in full.values():
            self.assertTrue((mrt.THUMBS / name).exists(), name)


if __name__ == "__main__":
    unittest.main()
