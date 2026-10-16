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


class RobotsStatusTests(unittest.TestCase):
    """How images_common reads a robots.txt it can't get (founder 2026-10-12: follow RFC 9309, so a 403 means no rules)."""

    def check(self, code: int) -> bool:
        import io
        import urllib.error
        from unittest import mock

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "uk_extract"))
        import images_common as ic

        ic._robots.clear()
        ic._last_request.clear()
        err = urllib.error.HTTPError("https://cdn.example.org/robots.txt", code, "x", {}, io.BytesIO(b"denied"))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            return ic._robots_allow("https://cdn.example.org/logo.png")

    def test_403_and_other_4xx_mean_no_rules(self):
        self.assertTrue(self.check(403))
        self.assertTrue(self.check(404))

    def test_401_429_and_5xx_still_stop(self):
        for code in (401, 429, 500, 503):
            self.assertFalse(self.check(code), code)


class _Resp:
    """A minimal urlopen() result: a context manager with read()."""

    def __init__(self, data: bytes):
        self.data = data

    def read(self):
        return self.data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class RobotsUnreachableTests(unittest.TestCase):
    """RFC 9309 section 2.3.1.4: a robots.txt that cannot be fetched because of a network or server error means "assume complete
    disallow". Only an HTTP answer in the 4xx range (except 401/429) means "no rules"."""

    URL = "https://cdn.example.org/logo.png"

    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "uk_extract"))
        import images_common as ic

        self.ic = ic
        ic._robots.clear()
        ic._robots_unreadable.clear()
        ic._last_request.clear()

    def test_network_errors_mean_do_not_fetch(self):
        import http.client
        import socket
        import ssl
        import urllib.error
        from unittest import mock

        for exc in (socket.timeout("timed out"), urllib.error.URLError("dns failure"), ConnectionResetError("reset"),
                    http.client.IncompleteRead(b"par"), http.client.BadStatusLine("x"), ssl.SSLError("eof"), OSError("unreachable")):
            self.ic._robots.clear()
            self.ic._last_request.clear()
            with mock.patch("urllib.request.urlopen", side_effect=exc):
                self.assertFalse(self.ic._robots_allow(self.URL), repr(exc))

    def test_the_failure_is_not_cached_so_a_later_call_asks_again(self):
        import socket
        from unittest import mock

        with mock.patch("urllib.request.urlopen", side_effect=socket.timeout("timed out")):
            self.assertFalse(self.ic._robots_allow(self.URL))
        self.assertNotIn("https://cdn.example.org", self.ic._robots)
        self.ic._last_request.clear()
        with mock.patch("urllib.request.urlopen", return_value=_Resp(b"User-agent: *\nDisallow:\n")):
            self.assertTrue(self.ic._robots_allow(self.URL))
        self.assertNotIn("https://cdn.example.org", self.ic._robots_unreadable)

    def test_polite_get_stops_with_the_reason_and_never_asks_for_the_page(self):
        import socket
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as d, mock.patch("urllib.request.urlopen", side_effect=socket.timeout("timed out")) as opened:
            with self.assertRaises(self.ic.Blocked) as cm:
                self.ic.polite_get(self.URL, Path(d))
        self.assertEqual(opened.call_count, 1)   # the robots.txt request only: the page itself was never requested
        self.assertIn("robots.txt could not be read", str(cm.exception))
        self.assertIn("timed out", str(cm.exception))

    def test_a_readable_disallow_still_says_disallows(self):
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as d, mock.patch("urllib.request.urlopen", return_value=_Resp(b"User-agent: *\nDisallow: /\n")):
            with self.assertRaises(self.ic.Blocked) as cm:
                self.ic.polite_get(self.URL, Path(d))
        self.assertIn("robots.txt disallows", str(cm.exception))

    def test_the_robots_request_keeps_the_one_second_pace(self):
        import time
        from unittest import mock

        self.ic._last_request["cdn.example.org"] = time.monotonic()
        with mock.patch("urllib.request.urlopen", return_value=_Resp(b"")), mock.patch("time.sleep") as slept:
            self.assertTrue(self.ic._robots_allow(self.URL))
        self.assertTrue(slept.called)
        self.assertTrue(0 < slept.call_args[0][0] <= self.ic.ROBOTS_DELAY)
