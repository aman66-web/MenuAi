---
name: verify
description: Build MenuMacros, run all tests, launch it in the iOS Simulator and check a flow. Use after changing app code or before saying work is done.
arguments: [flow]
---

Verify the app. Flow to check (optional): $flow

1. Run `./scripts/test.sh`. If anything fails, stop and fix it (or report it clearly).
2. Build and launch the app in an iPhone simulator. If the founder is using Claude Code Desktop,
   the iOS Simulator pane opens automatically. Otherwise build with
   `xcodebuild -scheme MenuMacros -destination 'id=<udid>' -derivedDataPath build/DerivedData build`,
   then `xcrun simctl install booted build/DerivedData/Build/Products/Debug-iphonesimulator/MenuMacros.app`
   and `xcrun simctl launch booted <bundle id>`.
3. Walk through the flow (default: onboarding with Skip → Home → open a sample chain → sort by
   protein → open an item → tap "Best for you" as a free user → paywall appears → close it).
4. Check each changed screen in light and dark mode (`xcrun simctl ui booted appearance dark`,
   reset with `light`) and at a large Dynamic Type size
   (`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`, reset with `large`).
5. Report: tests passed/failed, what you checked, anything that looked wrong, with screenshots
   saved via `xcrun simctl io booted screenshot <path>` when useful.
