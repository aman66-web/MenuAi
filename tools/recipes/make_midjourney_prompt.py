#!/usr/bin/env python3
"""Rebuild docs/MIDJOURNEY_CHROME_PROMPT.md (one message to paste into Claude in Chrome) from docs/RECIPE_IMAGE_PROMPTS.md.

  cd web && WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts   # first: rewrite RECIPE_IMAGE_PROMPTS.md from the recipe book
  python3 tools/recipes/make_midjourney_prompt.py                       # then: rebuild the paste-ready file

The file says which commit and how many recipes it was built from, so a copy that does not match someone's app is easy to spot.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEAD = '# Midjourney pictures for every Numbite recipe: paste this whole file into Claude in Chrome\n\nHOW TO USE: open Midjourney (midjourney.com/imagine) in Chrome and log in, open Claude in Chrome, and paste EVERYTHING below the line as one message.\nIf Claude stops part-way (a limit, a warning, a pause), paste "Continue from recipe <the next id>" and the list again.\nWhen it finishes, move the downloaded files into the project folder `data/recipe-images/` and tell Claude Code "import the recipe pictures" (it runs `python3 tools/recipes/import_recipe_images.py`).\nNote: Midjourney\'s Community Guidelines say it has no API and that automating the site can get an account blocked. The instructions below go slowly (one job at a time, stop on any warning) to keep clear of that, but it is your account: the safe alternative is to paste the prompts yourself.\n\n--------------------------------------------------------------------------------------------------------------\n\nYou are making ONE picture for each of the {TOTAL} recipes below, using Midjourney in this browser (I am already logged in with a paid plan). The pictures are for Numbite, a UK calories and protein app, and they must all look like they were shot by the same photographer in the same studio: same camera angle, same table, same light, same colour feel.\n\nTHE LOOK (already inside every prompt, do not change it): a bird\'s-eye view photograph taken straight down from directly above (90 degrees, flat lay), one dish centred on a light oak wooden table with space around it, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. Every prompt ends with the settings `--ar 4:3 --v 7 --style raw` and a `--no` list. Never remove or change them.\n\nRULES\n1. Work in the Midjourney tab only. One recipe at a time, one job at a time. Send the next prompt only when the previous one has finished. If Midjourney says to slow down or wait, wait.\n2. Paste each prompt EXACTLY as written (the only thing you may add is the style anchor in rule 5). Do not edit, shorten or add words.\n3. When the four pictures are ready, choose the best one that passes EVERY test: (a) taken straight down from above, not tilted, the whole plate or bowl in view and centred with space around it; (b) shows the dish described and no other food (no lemon wedge, herbs, sauce pot or side dish the prompt does not mention); (c) no writing, letters, numbers, logos, brand names, packaging, jars, tins or bottles anywhere; (d) no hands, people, cutlery or steam; (e) natural food colours, appetising, nothing plastic, burnt or half-raw; (f) one portion on a light wooden table; (g) not almost the same picture as another recipe\'s.\n4. Open the chosen picture, upscale it (Upscale Subtle, if offered) and download the PNG. Save it as `<recipe id>.png` (the id is the code after "id:", for example `overnight-oats.png`) in one folder called `numbite-recipe-images` in Downloads. If none of the four passes, run the same prompt again (or "Vary Subtle" on the closest one), at most 3 tries in total; if it still fails, add the id to a list called NEEDS ATTENTION and move on.\n5. KEEP ONE LOOK: when recipe 1 (overnight-oats) has its chosen picture, copy that picture\'s image link and add ` --sref <that link>` to the very end of every later prompt. If the pictures start to look too alike, stop adding it.\n6. STOP and tell me (do not try to get past it) if Midjourney shows a CAPTCHA or human check, a login or payment page, an error about too many jobs, or any warning about my account.\n7. After every 10 recipes, tell me in one line: done so far, and the NEEDS ATTENTION list. At the end tell me which ids are done, which need attention, and where the files are. Do not upload other images or add text or branding to any picture.\n\nTHE {TOTAL} RECIPES (paste each prompt exactly; "id" is the file name):\n'


def main() -> None:
    src = (ROOT / "docs" / "RECIPE_IMAGE_PROMPTS.md").read_text(encoding="utf-8")
    parts = re.split(r"(?m)^## (Breakfast|Lunch|Dinner|Snacks)\n", src)
    groups = []
    for i in range(1, len(parts), 2):
        items = re.findall(r"### (.+?) · `([a-z0-9-]+)`\n\n```\n(.+?)\n```", parts[i + 1], re.S)
        groups.append((parts[i], items))
    total = sum(len(items) for _, items in groups)
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    stamp = (
        f"BUILT FROM the recipe book at commit {sha}: {total} recipes ("
        + ", ".join(f"{len(items)} {name.lower()}" for name, items in groups)
        + "). If your copy of the app lists a different number of recipes, or still has dishes such as the halloumi or lentil ones "
        "(replaced on 15 October 2026), your copy of the app is older than this file: update it first.\n\n"
    )
    head = HEAD.replace("{TOTAL}", str(total))
    out = [stamp + head]
    n = 0
    for name, items in groups:
        out.append(f"\n=== {name.upper()} ({len(items)}) ===\n")
        for title, rid, prompt in items:
            n += 1
            out.append(f"{n}. {title}  |  id: {rid}\nPROMPT: {prompt}\n")
    (ROOT / "docs" / "MIDJOURNEY_CHROME_PROMPT.md").write_text("\n".join(out), encoding="utf-8")
    print(f"wrote docs/MIDJOURNEY_CHROME_PROMPT.md: {n} recipes from commit {sha}")


if __name__ == "__main__":
    main()
