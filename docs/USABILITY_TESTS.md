# Usability tests with older people (AI testers)

Founder, 19 November 2026: "Get a few AI agents to act like 80-year-old granddads and grandmas" (round 1, four testers, small hours), then "Have 10 ai
agents act as 80 yr old elders And navigate the app. Then tell me what we need to work on" (round 2). Each tester is a Claude agent playing one person,
on its own headless phone (390 x 844, touch; `web/e2e/persona-driver.mjs`) against a production build of the website app on this Mac with sign-in
switched off (`NEXT_PUBLIC_SIGN_IN_REQUIRED=0`), from the welcome screen, mostly at Extra large text. They tap by the words on screen and look at
screenshots. They are a cheap first look, not real users: check anything surprising before acting on it.

Things they reported that come from the test build, not the app: the support address "support@example.com" (no `NEXT_PUBLIC_SUPPORT_EMAIL` in the
test build); "No account needed" / "You don't need an account" (sign-in is off in the test build; the real app shows "Free account"); the meal plan
being free although the tour calls it Premium (the website sells nothing, so GATING is off; the tour line is still wrong on the website); no language
choice (English only since 16 October, founder's decision: `LANGUAGES_ENABLED`).

## Round 2 testers (19 November 2026)

| Tester | Jobs | Result |
|---|---|---|
| Elsie, 84, Bristol | Pizza Express dish under 600 kcal, compare two, keep one, calories left | 4 of 5; a calories-only dish can't be saved or logged; no "calories left" |
| Harold, 81, Newcastle | wife's peanut allergy at Nando's, "may contain", most protein, where figures come from | 4 of 5; never found what "may contain" means |
| Pat, 86, Belfast | cook with what's in the house, time and calories, what to buy, keep it | all done; the "Uses your ..." line is hidden; typos not forgiven |
| Raj, 80, Leicester | own language, vegetarian Indian plan from Asda for two, cost, no meat on the list | Indian plan is a dead end with a wrong message; no "how many people" |
| George, 87, Cardiff | food diary: porridge, Greggs sausage roll, move an item, today's total | all done the hard way; no Move; chain + dish search fails |
| Joan, 83, Brighton | recipe to list, add milk and bread, tick and remove, which shop is cheaper | 4 of 5; can't compare shops for a list |
| Frank, 90, Liverpool | biggest text, the tour, a 500 kcal burger, contact the makers | all done; results below the fold; headings break mid-word |
| Irene, 82, Edinburgh | vegetarian Italian plan from two shops, swap a dinner, new plan, back to the first | 4 of 5; "no spicy" not honoured; Earlier plans hidden at the bottom |
| Stan, 85, Birmingham | most protein yoghurt, cheapest shop, cheap breakfast, add to list | all done; leaderboard rows unreadable at large text; logos without names |
| Barbara, 79, Plymouth | change targets, what's kept, does it cost anything, wipe and start again | 4 of 5; cost question has three different answers |

Each tester's full notes: `docs/usability/2026-11-19/<name>.md`.

## What to work on (both rounds, most important first)

### 1. Bugs that stopped or misled someone
1. **Meal plan dead end** (Raj): Indian + vegetarian at Asda greys out Continue; the reason is hidden under the sticky button and blames "foods you left
   out" when nothing was left out (`app/app/plan/page.tsx`, the noneFor message). Also: "no spicy" kept "Crispy spiced chickpeas" and "Devilled eggs"
   (Irene); after a swap the plan said "£0.69 over your budget: it's the cheapest week our recipes allow" (Irene); a week of 4 lunches repeats without a word.
2. **Calories-only restaurants** (Elsie): a Pizza Express dish can't be saved or logged ("they need protein, carbs and fat"); its Quick answer "Under 500
   calories" says "most protein first" on a chain with no protein and lists olives and kids' dishes; My meals says "Save an order from any menu item".
3. **Search** (George, round 1 too): "greggs sausage roll" finds nothing, "greggs" shows Greggs crisps instead of the menu; Poppadoms in yoghurt results;
   the typed word is squeezed ("ghurt") beside Done (Stan).
4. **Leaderboard rows unreadable at Large and Extra large** (Stan, round 1 too): the name shrinks to one letter, the logo hides behind the price badge.
5. **Cook with what you have** (Pat): the "Uses your ..." line is hidden behind the next card's photo; "potatos" isn't matched.
6. **Today's food** (George, round 1 too): no way to move an item to another meal or change its amount; the add sheet doesn't say which meal; delete has
   no confirm; with a sheet open the page behind is still tappable (two "Add to Breakfast" buttons). No "calories left" figure anywhere (Elsie, round 1).
7. **Allergies** (Harold): "May contain" is never explained and looks weaker than "Contains"; the person's own allergen isn't highlighted; the floating
   totals card covers the allergen table; tapping a Best for you dish opens "Build your order".
8. **Tabs** (Joan, Stan, Pat, Frank): the shopping list lights up Home; Home and Groceries reopen the last page instead of their main screen.
9. **Numbers** (Barbara, Elsie): changing calories leaves carbs and fat at the old figures; the -/+ steps of 50 can't reach 1,500 from 1,370; after Clear
   data there's no "done", the text size resets, and the dialog says "this browser".
10. **Words and layout slips**: headings break mid-word at Extra large ("McDonal/d's", "PizzaExp/ress"); the tour still lists the old tab order; the tour
    calls the meal plan Premium on the website, where nothing is sold; "1 snacks"; "other yogurts products"; the Waitrose swap keeps "spring onion" in the blurb.

### 2. What every tester hit (the biggest wins)
- **First run too long**: 20 to 30 taps (welcome, 5 tour screens, 9 questions, a recipe pick, then 6 tips on Home that dim and scroll the screen by
  themselves). "Skip" is faint and skips one step. One big "Skip the questions" button, a shorter tour, no Home tips after the tour.
- **"About you" (all 10)**: Continue is grey with no reason; the Age box has no label or hint and sits below the fold.
- **"You're all set"**: the McDonald's line ("27 dishes with 20g+ protein that fit a 700 kcal lunch") means nothing; defaults are shown as "your plan"
  after Skip; picking Tesco then reading "every ingredient is a real product at Sainsbury's" with no reason.
- **Faint controls**: "Get started" white on grey; Skip, Skip tour, Stop the tips, grey captions, thin radio rings.
- **Extra large text**: the sticky Continue and the tab bar cover content; results appear far below the chip that was tapped (Under 500 calories,
  Breakfast, 35 g+ protein), so the tap seems to do nothing; confetti over "You're all set!"; the fork picture cut off at the right.
- **Logos without names** (search cards, leaderboards): testers couldn't tell the shops apart; the cheapest isn't marked; "Only at Sainsbury's" never said.
- **Words**: kcal (say calories), GLP-1 on the first goal screen, See the truth, traffic lights, Smart Swap, Best fit, Swap, Worked out, per 100 kcal,
  "community data". Three names for saved recipes (My recipes, My meals, Saved to My meals).

### 3. Shopping list and plans
- List: make "Remove ticked" the main button and move "Clear list" away; hide the barcode after each price; shorter rows at large text; typed items (milk,
  bread) get no price; it re-suggests what was just removed; "Add all" doesn't change after tapping; no way to compare a list's total between shops (Joan).
- Plans: Earlier plans sit at the very bottom with no cuisine in the label; "Make a new plan" restarts at step 1; every swap button is "Swap this meal";
  no "how many people"; no "all vegetarian" line on the plan or list.

### 4. Founder decisions raised
- A language choice (Raj): English only since 16 October by your decision; the 10 translations are in the repository, not checked by native speakers.
- A text size bigger than Extra large (Frank).
- "Does Numbite cost anything?" in Settings with one answer (Barbara), once Premium is on.
- "Help and contact" near the top of Settings, and whether to show a phone number (Frank).

## Round 3 (19 November 2026, early morning): five of the round 2 testers again, on the night's fixes

Same people and jobs where they struggled, on the development server of the `iap` branch (sign-in off there), each from the welcome screen.

| Tester | Result | Fixed after this round |
|---|---|---|
| Raj | 4 of 5: plan for 2 people worked (£81.90 within £86); a dinner swap said only "No other recipes fit" | the swap says why (every dinner of the chosen kinds is in the plan) and offers Make a new plan |
| Joan | 4 of 5: Choose a product for milk and bread, basket count, Remove ticked, Add one more all worked; opening peas from the list hit "That barcode isn't in our list yet" | list items open their shop's own page; the missing-barcode screen offers ways on; every "I have this" names its ingredient; a ticked ingredient says it's left off |
| George | 6 of 6 | eaten and left now add up exactly; Today says what's left; "½ portion"; the amount box selects its 100; results name their shop; the sheet's label reads "For breakfast" |
| Pat | 5 of 5, two the hard way: "an onion", "a tin of beans" and "some chedar" were ignored silently; the list suggested things she'd ticked | typed foods read without "a", "some", "tin of"; a one-letter slip read and said ("I read chedar as cheddar"); what no recipe uses is named; the list leaves out what she has |
| Harold | 5 of 5: "You avoid" on every dish worked; the "may contain" peanut warning looked like an all-clear | own allergies listed worst first; contains as a dark box, may contain with a heavy border and its meaning; may-contain counted apart |

Not changed (decisions or the test tool): the "35 g+ protein" order (most protein for the calories, as its own line says); Pip's tips over Home after setup; eggs in a
plan for two looked many to Raj (42, from the recipes' own amounts); Asda prices checked 8 October; a dropdown and some taps the test tool couldn't do like a finger.
