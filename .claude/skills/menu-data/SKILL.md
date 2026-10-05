---
name: menu-data
description: Rules for adding or changing restaurant menu data (data/source CSVs), running the menu pipeline, and reading its check report. Use whenever menu data, the pipeline, or bundled menu JSON is involved.
---

# Menu data

The contract is `docs/DATA.md`. Key rules:

- **Numbers come only from the chain's published nutrition guide.** Never estimate, average or
  fill a blank. If the founder asks you to "add a chain", help with the CSV structure and checks,
  but the values must be typed from the source the founder provides (a PDF, a page they paste).
  If you're given a source document, transcribe exactly and list anything you couldn't read.
- One folder per chain in `data/source/<chain-id>/` (copy `_template/`). `checked_on` = today when
  the whole menu was checked.
- Build: `python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus`.
  Errors stop the build; fix them in the CSV. Warnings (energy check etc.) must be shown to the
  founder to confirm against the source — don't "fix" a warning by changing numbers yourself.
- Never edit `MenuMacros/Resources/Menus/*.json` or `dist/` by hand.
- Pipeline tests: `python3 -m unittest discover -s tools/tests`.
- If you change the sample chains or `tools/reference_ranking.py` constants, rerun
  `python3 tools/reference_ranking.py --write-fixture`, copy everything in `data/fixtures/`
  to `MenuMacrosTests/Fixtures/`, and make sure the Swift ranking and builder tests still pass. Ranking
  constants must stay identical in `RankingConfig.swift` and the Python reference.
- Release builds use `--no-samples`.
