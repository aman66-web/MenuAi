---
name: milestone
description: Plan and build one MenuMacros milestone (M0–M10) from docs/BUILD_PLAN.md, end to end
disable-model-invocation: true
arguments: [milestone]
---

Build milestone **$milestone** of MenuMacros.

1. **Load context (read, don't skim):**
   - `docs/PROGRESS.md` — what exists already and any decisions that override the spec.
   - The `$milestone` section of `docs/BUILD_PLAN.md`.
   - Every `docs/SPEC.md` section that milestone cites (and `docs/DATA.md` if it's cited).
   - The existing code you will touch.
2. **Plan:** write a short plan: files to create/change, types and their responsibilities, tests to
   write, anything in the spec that is ambiguous or conflicts with the code. Ask the founder about
   ambiguities before coding. Wait for the founder to approve the plan.
3. **Build in small steps.** For logic in `Domain/` or `MenuData/`, write the Swift Testing tests
   first, then the code. After each step run `./scripts/test.sh --unit` and fix failures before moving
   on; run the full `./scripts/test.sh` before step 4.
4. **Check it like a user.** Build and run the app in the iOS Simulator; walk through the
   milestone's "Done when" in light and dark mode and with a large text size. Fix what you find.
5. **Review.** Ask the `spec-reviewer` agent to compare the milestone's code with the cited spec
   sections; fix real gaps.
6. **Wrap up.**
   - Update `docs/PROGRESS.md` (status, decisions with reasons, known issues, founder to-dos).
   - Summarise for the founder: what was built, how to try it, what they need to do.
   - Propose a commit message. Do not push.
