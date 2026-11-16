# Numbite 1.0.1 (build 5): App Store text, draft

**Draft for the founder to approve (CLAUDE.md rule 8). Nothing here is in App Store Connect yet, and `docs/STORE.md` is unchanged.**
Written 16 November 2026 by a cloud session for release 1.0.1 (branch `release-1-0-1-b`): the free "viral upgrade" screens only, no payments.

Rules followed: no payment, subscription or "Pro" wording (this version has no in-app purchases); no health claims and no "good", "bad" or "healthy";
no restaurant, supermarket or other company name (App Review 2.3.7 and 5.2.1, and STORE.md's own rule; that is also why "WhatsApp" is not named);
no claim of any partnership or permission; nothing promised that the screens don't do.

## What's New in This Version (limit 4,000 characters)

Paste this into App Store Connect › Numbite › 1.0.1 › "What's New in This Version" (1,348 characters):

```
What's new in 1.0.1

• See the truth: tap the new button on a menu item to see its calories as a share of the 2,000 kcal reference intake used on food labels, a protein score from 1 to 5, the UK's front-of-pack traffic lights for fat, saturates, sugars and salt, and its sugar, fat and protein shown as sugar cubes, grams of butter and eggs. "Where these numbers come from" lists the sources.

• Smart Swap: when the same restaurant has a dish from the same part of the menu with fewer calories that fits your diet and allergy settings (and, where it publishes protein, has at least as much protein), you see the two side by side, with the calories it saves.

• Quick answers: one tap on a restaurant's page shows its top 5 meals of 500 calories or less, with 35 g of protein or more, for a small appetite, with 5 g of sugar or less, or with the most protein for the calories.

• Cheapest protein: in Groceries, see what 10 g of protein costs, worked out from each product's own label and shelf price.

• Share: send a dish's numbers in a message, or save them as an image card.

• Starts straight away: no questions first. Set your goal and what you avoid whenever you like.

Every figure still comes from each restaurant's or shop's own published information. Numbite isn't affiliated with any restaurant or shop, and doesn't give medical advice.
```

Facts behind each line (checked against the code on `release-1-0-1-b`):
- "2,000 kcal reference intake": `web/lib/mm/truth/referenceIntake.ts` (UK reference intakes, Regulation 1169/2011 Annex XIII Part B, linked in the app).
- Protein score 1 to 5 and "Numbite's own": `web/lib/mm/truth/proteinScore.ts`; the card says it is Numbite's own score.
- Traffic lights for fat, saturates, sugars and salt only: `web/lib/mm/truth/fsaLights.ts` (UK government front-of-pack guidance, 2016, linked in the app).
- Sugar cubes, grams of butter, eggs: `web/lib/mm/truth/household.ts` (NHS, McCance and Widdowson via Patient.info, British Egg Information Service, each linked).
- Smart Swap rules: `web/lib/mm/truth/swap.ts`. Quick answers limits: `web/lib/mm/truth/presets.ts` (a chain that publishes no protein or no sugar does not get those lists: the text says "shows its top 5 ... or ...", so it does not promise every list on every page).
- Cheapest protein: `web/lib/mm/truth/proteinValue.ts`. It uses only shops whose labels have been read (today one supermarket), which is why the text names no shop.
- Share: the message link (`wa.me`, opens the messaging app or Safari) and "Save image card" (the iPhone share sheet) in `TruthBody.tsx`.
- Starts straight away: no welcome gate since 13 November (PROGRESS 2026-11-13/14, D1).

Not mentioned on purpose: Filming mode (Settings), the dark card, the public restaurant pages (website only, never in the app), paid access (off; not in the app).

## Promotional text

No change needed. If you want to use it for 1.0.1 (limit 170, can be changed without a new build):

```
New: see any menu item's calories, protein score and traffic lights in one tap, find a lighter swap at the same restaurant, and share the numbers. Free.
```
(152 characters.)

## Notes for App Review: what to add for 1.0.1

Keep the 1.0 notes in `docs/STORE.md` ("Notes for App Review") as they are and add this paragraph after the "Guideline 1.4.1 (build 4)" paragraph:

```
New in 1.0.1 (build 5): a menu item's page has "See the truth", which opens a card with the item's own published figures and a few numbers worked out from them: calories and protein as a percentage of the UK reference intakes used on food labels, the UK government's front-of-pack traffic-light colours for fat, saturates, sugars and salt, and the sugar, fat and protein shown as sugar cubes, grams of butter and eggs. Each of these links its published source on the card, and a "Where these numbers come from" link at the top of the card (and under any Quick answers list) opens one screen listing all the sources: Regulation (EU) No 1169/2011 Annex XIII as it applies in Great Britain (legislation.gov.uk), the UK front-of-pack labelling guidance (gov.uk), the NHS "Sugar: the facts", McCance and Widdowson's Composition of Foods dataset (via Patient.info) and the British Egg Information Service. The same screen says which rules are Numbite's own and have no published source: the 1 to 5 protein score (it compares the calories from protein with the item's calories), the Quick answers limits, the Smart Swap rules and the Cheapest protein list's line for a protein food. It is also under Settings > About > "Where these numbers come from", below the sources for the suggested daily targets. Nothing in 1.0.1 can be bought: there are no in-app purchases and no paid features. Sharing a card opens the iPhone share sheet or a message link; nothing is posted by the app.
```

## Things to check in App Store Connect before submitting (founder)

- Version 1.0.1, build 5 (the Mac session packs and archives it; build 5 is set in `MenuMacros.xcodeproj`).
- Age rating: no change expected (no new kind of content; the share card is the person's own choice to send).
- App Privacy: no change expected (the Truth card and sharing send nothing to us; the share text goes only where the person sends it). The creator code
  and paid access exist only on the website and are off.
- Screenshots: no change needed. If you make new ones, `web/e2e/store-shots.mjs` leaves out every logo and photo; do not show a restaurant's name in them.
