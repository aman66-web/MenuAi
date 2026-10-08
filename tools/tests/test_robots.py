"""Run: python3 -m unittest discover -s tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "uk_extract"))
import robots_rfc as rr  # noqa: E402

SANITY = "User-agent: *\nAllow: /files/cgnmnbqj/\nDisallow: /*.pdf\nDisallow: /*.PDF\n"


class RobotsTests(unittest.TestCase):
    def test_wildcard_disallow_matches_a_pdf_anywhere_in_the_path(self):
        rules = rr.parse(SANITY)
        self.assertFalse(rr.allowed(rules, "/files/ysupxjc9/production/abc.pdf/Guide.pdf"))
        self.assertTrue(rr.allowed(rules, "/files/ysupxjc9/production/abc.png"))

    def test_the_longer_allow_beats_the_shorter_disallow(self):
        rules = rr.parse(SANITY)
        self.assertTrue(rr.allowed(rules, "/files/cgnmnbqj/production/abc.pdf"))

    def test_disallow_everything_and_empty_disallow(self):
        self.assertFalse(rr.allowed(rr.parse("User-Agent: *\nDisallow: /\n"), "/dam/x/original.pdf"))
        self.assertTrue(rr.allowed(rr.parse("User-agent: *\nDisallow:\n"), "/anything"))

    def test_end_anchor_and_other_groups(self):
        rules = rr.parse("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private$\n")
        self.assertFalse(rr.allowed(rules, "/private"))
        self.assertTrue(rr.allowed(rules, "/private/page"))


if __name__ == "__main__":
    unittest.main()
