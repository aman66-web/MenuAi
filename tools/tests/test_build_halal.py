"""Run: python3 -m unittest discover -s tools/tests

How tools/dietary/build_halal.py combines the halal-*.csv files: the latest row for a chain decides (newest checked_on, then the file that
sorts last); `no` removes an earlier all/some; `not_stated` never changes anything; a row without the chain's own words is an error;
a chain that is not published is skipped."""
import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dietary"))
import build_halal as bh  # noqa: E402

HEAD = ["chain_id", "scope", "statement", "source_url", "checked_on"]
URL = "https://example.com/halal"


def write(folder: Path, name: str, rows: list[tuple]) -> None:
    with open(folder / name, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(HEAD)
        w.writerows(rows)


class BuildHalalTests(unittest.TestCase):
    def load(self, files: dict[str, list[tuple]], published=("a", "b")):
        with tempfile.TemporaryDirectory() as d:
            for name, rows in files.items():
                write(Path(d), name, rows)
            return bh.load_rows(Path(d), set(published))

    def test_all_and_some_are_published_with_the_chains_own_words(self):
        rows, errors, skipped = self.load({"halal-a.csv": [("a", "all", "All our meat is halal.", URL, "2026-10-16"), ("b", "some", "Our chicken is halal.", URL, "2026-10-16")]})
        self.assertEqual(errors, [])
        self.assertEqual(skipped, [])
        self.assertEqual(rows["a"], {"scope": "all", "statement": "All our meat is halal.", "url": URL, "checkedOn": "2026-10-16"})
        self.assertEqual(rows["b"]["scope"], "some")

    def test_no_and_not_stated_are_never_published(self):
        rows, _, _ = self.load({"halal-a.csv": [("a", "no", "We are not halal.", URL, "2026-10-16"), ("b", "not_stated", "", "", "2026-10-16")]})
        self.assertEqual(rows, {})

    def test_a_later_file_replaces_an_earlier_row_of_the_same_date(self):
        rows, _, _ = self.load({
            "halal-a.csv": [("a", "some", "Some of our chicken is halal.", URL, "2026-10-16")],
            "halal-c.csv": [("a", "all", "All of our meat is halal.", URL, "2026-10-16")],
        })
        self.assertEqual(rows["a"]["scope"], "all")

    def test_a_newer_date_beats_a_file_that_sorts_later(self):
        rows, _, _ = self.load({
            "halal-a.csv": [("a", "all", "All of our meat is halal.", URL, "2026-10-16")],
            "halal-z.csv": [("a", "some", "An old page said this.", URL, "2026-10-01")],
        })
        self.assertEqual(rows["a"]["scope"], "all")

    def test_a_later_no_removes_an_earlier_all_or_some(self):
        rows, _, _ = self.load({
            "halal-a.csv": [("a", "all", "All our meat is halal.", URL, "2026-10-06"), ("b", "some", "Our chicken is halal.", URL, "2026-10-06")],
            "halal-c.csv": [("a", "no", "We are not a halal restaurant.", URL, "2026-10-16")],
        })
        self.assertNotIn("a", rows)
        self.assertEqual(rows["b"]["scope"], "some")

    def test_an_older_no_does_not_remove_a_newer_some(self):
        rows, _, _ = self.load({
            "halal-a.csv": [("a", "no", "We were not halal.", URL, "2026-10-01")],
            "halal-c.csv": [("a", "some", "Our chicken is now halal.", URL, "2026-10-16")],
        })
        self.assertEqual(rows["a"]["scope"], "some")

    def test_a_later_not_stated_keeps_what_an_earlier_row_says(self):
        rows, _, _ = self.load({
            "halal-a.csv": [("a", "some", "Our chicken is halal.", URL, "2026-10-06")],
            "halal-c.csv": [("a", "not_stated", "", "", "2026-10-16")],
        })
        self.assertEqual(rows["a"]["scope"], "some")

    def test_a_row_without_words_or_an_https_page_is_an_error(self):
        _, errors, _ = self.load({"halal-a.csv": [("a", "some", "", URL, "2026-10-16"), ("b", "all", "All halal.", "http://example.com", "2026-10-16")]})
        self.assertEqual(len(errors), 2)

    def test_a_chain_that_is_not_published_is_skipped(self):
        rows, errors, skipped = self.load({"halal-a.csv": [("zzz", "all", "All halal.", URL, "2026-10-16"), ("a", "some", "Some halal.", URL, "2026-10-16")]})
        self.assertEqual(errors, [])
        self.assertEqual(skipped, ["zzz"])
        self.assertEqual(list(rows), ["a"])


if __name__ == "__main__":
    unittest.main()
