#!/usr/bin/env python3
"""Build ONE chain in isolation and print the pipeline's verdict, so half-written chains elsewhere can't get in the way.

    python3 tools/uk_extract/check_chain.py <chain-id> [--source data/source]

Exit code 0 = no errors. Warnings are printed: each one is a possible typo, so re-read the source for that row.
"""
import argparse
import csv
import json
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
    ap.add_argument("--fail-on-high", action="store_true",
                    help="exit 3 when the accuracy audit has high-severity flags nobody has marked reviewed (see tools/audit)")
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
        if proc.returncode == 0:
            high = audit_summary(args.chain_id, out)
            if high and args.fail_on_high:
                return 3
        return proc.returncode


def audit_summary(chain_id: str, out: Path) -> int:
    """Run tools/audit's consistency checks on the freshly built chain; print them. Returns the unreviewed high count."""
    sys.path.insert(0, str(ROOT / "tools" / "audit"))
    import accuracy_audit as aa  # noqa: E402
    doc_path = out / f"chain-{chain_id}.json"
    if not doc_path.exists():
        return 0
    flags = aa.audit_chain(json.loads(doc_path.read_text()))
    reviewed = aa.reviewed_pairs(ROOT / "data" / "audit")
    flags = [f for f in flags if (f["chain"], f["item"], f["code"]) not in reviewed]
    high = [f for f in flags if f["severity"] == aa.HIGH]
    med = [f for f in flags if f["severity"] == aa.MED]
    print(f"## Accuracy audit: {len(high)} high, {len(med)} medium flags (tools/audit/accuracy_audit.py)")
    for f in high:
        print(f"- HIGH {f['code']}: {f['name']}: {f['detail']}")
    for f in med[:15]:
        print(f"- medium {f['code']}: {f['name']}: {f['detail']}")
    if len(med) > 15:
        print(f"- ... and {len(med) - 15} more medium flags")
    if high:
        print("Re-read the source for each HIGH row: fix the script, hold the row back, or (only when the source prints it so) add it to "
              "data/audit/reviewed/<chain>.csv.")
    return len(high)


if __name__ == "__main__":
    sys.exit(main())
