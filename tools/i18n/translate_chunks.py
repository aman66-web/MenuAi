#!/usr/bin/env python3
"""Split the app's text into chunks for translators, and merge their translations back, with checks.

  python3 tools/i18n/translate_chunks.py pending <locale> [--size 150]
      Writes data/i18n/chunks/<locale>/pending-NN.json: the English keys from web/lib/mm/locales/keys.json that
      web/lib/mm/locales/<locale>.json doesn't translate yet, in chunks; prints the chunk numbers (or "none").
  python3 tools/i18n/translate_chunks.py merge <locale>
      Reads data/i18n/out/<locale>-NN.json ({english: translation}) and adds every valid entry to
      web/lib/mm/locales/<locale>.json. An entry is refused when its key isn't in keys.json, it's empty, or its {placeholders}
      differ from the English. Prints what was refused. Keys no longer in keys.json are dropped from the dictionary.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KEYS = ROOT / "web" / "lib" / "mm" / "locales" / "keys.json"
LOCALES = ROOT / "web" / "lib" / "mm" / "locales"
CHUNKS = ROOT / "data" / "i18n" / "chunks"
OUT = ROOT / "data" / "i18n" / "out"
CODES = ["pl", "ro", "pa", "ur", "pt", "es", "ar", "bn", "gu", "it"]


def placeholders(s: str) -> list[str]:
    return sorted(set(re.findall(r"\{(\w+)\}", s)))


def keys() -> list[str]:
    return json.loads(KEYS.read_text(encoding="utf-8"))


def pending(code: str, size: int) -> None:
    folder = CHUNKS / code
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("pending-*.json"):
        old.unlink()
    d = load_dict(code)
    ks = [k for k in keys() if not str(d.get(k, "")).strip()]
    names = []
    for i in range(0, len(ks), size):
        name = f"{len(names) + 1:02d}"
        (folder / f"pending-{name}.json").write_text(json.dumps(ks[i : i + size], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        names.append(name)
    print(f"{code}: {len(ks)} keys to translate" + (f" in chunks {' '.join(names)} ({folder.relative_to(ROOT)}/pending-NN.json)" if names else ": none"))


def load_dict(code: str) -> dict[str, str]:
    p = LOCALES / f"{code}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def merge(code: str) -> None:
    valid = set(keys())
    d = {k: v for k, v in load_dict(code).items() if k in valid}
    refused: list[str] = []
    added = 0
    for p in sorted(OUT.glob(f"{code}-*.json")):
        try:
            part = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            refused.append(f"{p.name}: not valid JSON ({e})")
            continue
        for k, v in part.items():
            if k not in valid:
                refused.append(f"{p.name}: unknown key {k[:60]!r}")
            elif not isinstance(v, str) or not v.strip():
                refused.append(f"{p.name}: empty translation for {k[:60]!r}")
            elif placeholders(v) != placeholders(k):
                refused.append(f"{p.name}: placeholders {placeholders(v)} != {placeholders(k)} for {k[:60]!r}")
            else:
                if d.get(k) != v:
                    added += 1
                d[k] = v
    ordered = {k: d[k] for k in sorted(d)}
    (LOCALES / f"{code}.json").write_text(json.dumps(ordered, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = [k for k in valid if not str(d.get(k, "")).strip()]
    print(f"{code}: {added} added or changed, {len(d)} of {len(valid)} keys translated, {len(missing)} missing, {len(refused)} refused")
    for r in refused[:40]:
        print("  refused", r)


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    if args[0] == "pending" and len(args) >= 2 and args[1] in CODES:
        pending(args[1], int(args[3]) if len(args) > 3 and args[2] == "--size" else 150)
    elif args[0] == "merge" and len(args) == 2 and args[1] in CODES:
        merge(args[1])
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
