#!/usr/bin/env python3
"""Build ONE chain in isolation and print the pipeline's verdict, so half-written chains elsewhere can't get in the way.

    python3 tools/uk_extract/check_chain.py <chain-id> [--source data/source]

Exit code 0 = no errors. Warnings are printed: each one is a possible typo, so re-read the source for that row.
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chain_id")
    ap.add_argument("--source", type=Path, default=ROOT / "data" / "source")
    args = ap.parse_args()
    folder = args.source / args.chain_id
    if not folder.is_dir():
        print(f"no folder {folder}", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory() as tmp:
        src, out = Path(tmp) / "src", Path(tmp) / "out"
        shutil.copytree(folder, src / args.chain_id)
        proc = subprocess.run([sys.executable, str(ROOT / "tools" / "build_menus.py"), "--source", str(src), "--out", str(out), "-q"],
                              capture_output=True, text=True)
        report = out / "check-report.md"
        print(report.read_text() if report.exists() else proc.stderr)
        return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
