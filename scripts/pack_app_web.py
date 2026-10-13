#!/usr/bin/env python3
"""Copy the iPhone app's static export of the web app (web/.next-app, from `npm run build:app`) into MenuMacros/Resources/WebApp.bundle
(git-ignored; Xcode copies a .bundle folder into the app whole), keeping only what the app needs and what web/app-content.json allows
(docs/APP_BUILD.md).

  * always left out: the fictional sample menus (menus-sample/) and the website's service worker (sw.js); the website's landing page
    (index.html) is replaced by a page that only forwards to /app;
  * "appLogos": false leaves out logos/ (the build also sets NEXT_PUBLIC_APP_LOGOS=0, so chains show our cuisine icons and shops their names);
  * "menuPhotos": false leaves out menu-images/ (the build also sets NEXT_PUBLIC_MENU_PHOTOS=0, so no item asks for one);
  * "shops": the supermarkets whose full product lists (groceries/all/) and catalogue files (groceries/) are packed in. A shop with a full
    list that isn't named is removed from both manifests and its files are left out, so it disappears from the app's Groceries. Catalogue
    entries for shops that have no full list (Co-op, Ocado: community data only) are kept as on the website.

Usage: python3 scripts/pack_app_web.py web/.next-app MenuMacros/Resources/WebApp.bundle web/app-content.json
Prints a size report. Nothing is edited except the two grocery manifests (rewritten without the shops left out).
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ALWAYS_OUT = {"menus-sample", "sw.js"}


def size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) if path.is_dir() else path.stat().st_size


def main(src: Path, dst: Path, content_file: Path) -> int:
    content = json.loads(content_file.read_text())
    photos = bool(content.get("menuPhotos", True))
    shops = content.get("shops")
    if not (src / "app.html").is_file():
        print(f"{src} has no app.html: run `npm run build:app` in web/ first", file=sys.stderr)
        return 1
    if dst.exists():
        shutil.rmtree(dst)
    logos = bool(content.get("appLogos", True))
    out = set(ALWAYS_OUT) | (set() if photos else {"menu-images"}) | (set() if logos else {"logos"})
    shutil.copytree(src, dst, ignore=lambda d, names: [n for n in names if Path(d) == src and n in out])

    # The website's landing page (an app that "is planned", a waitlist) must not ship inside the app (App Review 2.3.10): its address only forwards to the app.
    (dst / "index.html").write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/app"><title>Numbite</title><script>location.replace("/app")</script>')

    full_manifest = dst / "groceries/all/all-manifest.json"
    catalogue_manifest = dst / "groceries/groceries-manifest.json"
    left_out: list[str] = []
    if isinstance(shops, list) and full_manifest.is_file():
        keep = set(shops)
        full = json.loads(full_manifest.read_text())
        listed = {r["id"] for r in full["retailers"]}
        left_out = sorted(listed - keep)
        unknown = sorted(keep - listed)
        if unknown:
            print(f"app-content.json names shops with no full list: {', '.join(unknown)}", file=sys.stderr)
            return 1
        for r in full["retailers"]:
            if r["id"] in left_out:
                (dst / "groceries/all" / r["file"]).unlink(missing_ok=True)
        full["retailers"] = [r for r in full["retailers"] if r["id"] not in left_out]
        full_manifest.write_text(json.dumps(full, ensure_ascii=False))
        if catalogue_manifest.is_file():
            cat = json.loads(catalogue_manifest.read_text())
            for r in cat["retailers"]:
                if r["id"] in left_out:
                    (dst / "groceries" / r["file"]).unlink(missing_ok=True)
            cat["retailers"] = [r for r in cat["retailers"] if r["id"] not in left_out]
            catalogue_manifest.write_text(json.dumps(cat, ensure_ascii=False))
        for sid in left_out:
            shutil.rmtree(dst / "grocery-images" / sid, ignore_errors=True)

    total = size(dst)
    print(f"{dst.name}: {total / 1e6:.1f} MB")
    for part in ["menus", "menu-images", "groceries", "grocery-images", "logos", "_next", "app"]:
        p = dst / part
        if p.exists():
            print(f"  {part}: {size(p) / 1e6:.1f} MB")
    print(f"  menu photos: {'in' if photos else 'left out'}; shops left out: {', '.join(left_out) or 'none'}")
    if total > 190e6:
        print("warning: over 190 MB; the App Store downloads apps over 200 MB only on Wi-Fi", file=sys.stderr)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()))
