"""Small copies of dish photos (tools/uk_extract/make_thumbs.py), on synthetic pictures in a temporary folder.
Run: python3 -m unittest discover -s tools/tests"""
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "uk_extract"))
import make_thumbs as mt  # noqa: E402


def webp(size, mode="RGB", colour=(200, 80, 40)) -> bytes:
    im = Image.new(mode, size, colour if mode == "RGB" else (*colour, 128))
    # some detail, so the encoder has something to keep
    for x in range(0, size[0], 7):
        for y in range(0, size[1], 5):
            im.putpixel((x, y), (10, 10, 10) if mode == "RGB" else (10, 10, 10, 255))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=74)
    return buf.getvalue()


class MakeThumbsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "menu-images"
        (self.root / "kfc").mkdir(parents=True)
        (self.root / "pret").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, rel, data):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return p

    def test_resizes_proportionally_never_crops(self):
        self.put("kfc/aaa111.webp", webp((640, 480)))
        self.put("pret/bbb222.webp", webp((300, 600)))
        rep = mt.run(self.root)
        self.assertEqual((rep.made, rep.errors), (2, []))
        with Image.open(self.root / "thumbs/kfc/aaa111.webp") as im:
            self.assertEqual(im.size, (224, 168))  # 168 px on the short side
            self.assertEqual(im.format, "WEBP")
        with Image.open(self.root / "thumbs/pret/bbb222.webp") as im:
            self.assertEqual(im.size, (168, 336))

    def test_keeps_transparency(self):
        self.put("kfc/ccc333.webp", webp((400, 400), mode="RGBA"))
        mt.run(self.root)
        with Image.open(self.root / "thumbs/kfc/ccc333.webp") as im:
            self.assertIn("A", im.getbands())

    def test_small_photo_is_copied_byte_for_byte(self):
        raw = webp((150, 100))
        self.put("kfc/ddd444.webp", raw)
        rep = mt.run(self.root)
        self.assertEqual(rep.copied, 1)
        self.assertEqual((self.root / "thumbs/kfc/ddd444.webp").read_bytes(), raw)

    def test_rerun_skips_up_to_date_and_refreshes_newer_photos(self):
        full = self.put("kfc/eee555.webp", webp((640, 480)))
        mt.run(self.root)
        rep = mt.run(self.root)
        self.assertEqual((rep.made, rep.refreshed, rep.up_to_date), (0, 0, 1))
        later = (self.root / "thumbs/kfc/eee555.webp").stat().st_mtime + 10
        os.utime(full, (later, later))
        rep = mt.run(self.root)
        self.assertEqual((rep.refreshed, rep.up_to_date), (1, 0))
        self.assertGreaterEqual((self.root / "thumbs/kfc/eee555.webp").stat().st_mtime, later)

    def test_orphans_are_deleted_with_their_empty_folder(self):
        self.put("kfc/fff666.webp", webp((640, 480)))
        self.put("thumbs/kfc/gone00.webp", b"x")
        self.put("thumbs/old-chain/gone11.webp", b"x")
        rep = mt.run(self.root)
        self.assertEqual(rep.deleted, 2)
        self.assertFalse((self.root / "thumbs/kfc/gone00.webp").exists())
        self.assertFalse((self.root / "thumbs/old-chain").exists())
        self.assertTrue((self.root / "thumbs/kfc/fff666.webp").exists())

    def test_ignores_names_the_pipeline_would_refuse(self):
        self.put("kfc/Not-OK.webp", webp((640, 480)))
        self.put("kfc/a.png", b"x")
        self.put("Bad_Chain/hhh777.webp", webp((640, 480)))
        rep = mt.run(self.root)
        self.assertEqual(rep.made, 0)
        self.assertFalse((self.root / "thumbs").exists())

    def test_unreadable_photo_is_reported_and_the_rest_carry_on(self):
        self.put("kfc/bad000.webp", b"not a picture")
        self.put("kfc/iii888.webp", webp((640, 480)))
        rep = mt.run(self.root)
        self.assertEqual(rep.made, 1)
        self.assertEqual(len(rep.errors), 1)
        self.assertFalse((self.root / "thumbs/kfc/bad000.webp").exists())

    def test_check_changes_nothing_and_fails_when_stale(self):
        self.put("kfc/jjj999.webp", webp((640, 480)))
        self.put("thumbs/kfc/gone22.webp", b"x")
        with redirect_stdout(io.StringIO()):
            code = mt.main(["--check", "--images-dir", str(self.root)])
        self.assertEqual(code, 1)
        self.assertFalse((self.root / "thumbs/kfc/jjj999.webp").exists())
        self.assertTrue((self.root / "thumbs/kfc/gone22.webp").exists())
        with redirect_stdout(io.StringIO()):
            self.assertEqual(mt.main(["--images-dir", str(self.root)]), 0)
            self.assertEqual(mt.main(["--check", "--images-dir", str(self.root)]), 0)

    def test_thumbs_is_never_a_chain(self):
        # the small copies' own folder is never read as a chain of full photos
        self.put("thumbs/kfc/kkk000.webp", webp((160, 120)))
        self.put("kfc/kkk000.webp", webp((640, 480)))
        self.assertNotIn("thumbs", [p.name for p in mt.chain_dirs(self.root)])
        rep = mt.run(self.root)
        self.assertFalse((self.root / "thumbs/thumbs").exists())
        self.assertEqual(rep.errors, [])


if __name__ == "__main__":
    unittest.main()
