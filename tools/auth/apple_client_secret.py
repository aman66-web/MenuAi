#!/usr/bin/env python3
"""Generate the "Sign in with Apple" client secret (a signed JWT) for Supabase.

Reads your .p8 key, signs the JWT with the system openssl, and copies the result
to the clipboard. The secret is never printed (use --stdout only for testing with
a throwaway key). Apple allows at most 6 months, so this makes one that lasts
180 days; re-run it before it expires.

Usage:
  python3 apple_client_secret.py ~/Downloads/AuthKey_X374U6N8FP.p8
"""
import argparse
import base64
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

TEAM_ID = "S7G6ZHHK59"
SERVICES_ID = "com.amanmarwaha.numbite.web"
LIFETIME_SECONDS = 180 * 24 * 60 * 60  # Apple's maximum is 15777000 (~182.6 days)


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def der_to_raw(der: bytes) -> bytes:
    """Turn openssl's DER ECDSA signature into the 64-byte r||s that JWT ES256 needs."""
    if der[0] != 0x30 or der[2] != 0x02:
        raise ValueError("unexpected signature format from openssl")
    rlen = der[3]
    r = der[4:4 + rlen]
    if der[4 + rlen] != 0x02:
        raise ValueError("unexpected signature format from openssl")
    slen = der[5 + rlen]
    s = der[6 + rlen:6 + rlen + slen]
    return r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")


def build_jwt(key_path: Path, key_id: str) -> tuple[str, int]:
    issued = int(time.time())
    expires = issued + LIFETIME_SECONDS
    header = {"alg": "ES256", "kid": key_id}
    payload = {
        "iss": TEAM_ID,
        "iat": issued,
        "exp": expires,
        "aud": "https://appleid.apple.com",
        "sub": SERVICES_ID,
    }
    signing_input = (
        b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + b64url(json.dumps(payload, separators=(",", ":")).encode())
    )
    signed = subprocess.run(
        ["/usr/bin/openssl", "dgst", "-sha256", "-sign", str(key_path)],
        input=signing_input.encode(),
        capture_output=True,
    )
    if signed.returncode != 0:
        sys.exit("openssl could not sign with that key: " + signed.stderr.decode().strip())
    return signing_input + "." + b64url(der_to_raw(signed.stdout)), expires


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("p8", type=Path, help="path to AuthKey_<KEYID>.p8")
    parser.add_argument("--stdout", action="store_true", help="print the secret instead of copying it (testing only)")
    args = parser.parse_args()

    match = re.fullmatch(r"AuthKey_([A-Z0-9]{10})\.p8", args.p8.name)
    if not match:
        sys.exit("The file name should look like AuthKey_X374U6N8FP.p8; the 10 characters are the Key ID.")
    token, expires = build_jwt(args.p8.expanduser(), match.group(1))

    if args.stdout:
        print(token)
        return
    subprocess.run(["pbcopy"], input=token.encode(), check=True)
    when = datetime.fromtimestamp(expires, tz=timezone.utc).strftime("%d %B %Y")
    print(f"Copied the Apple client secret for key {match.group(1)} to your clipboard.")
    print(f"It expires on {when}. Put a reminder in your calendar a couple of weeks before.")


if __name__ == "__main__":
    main()
