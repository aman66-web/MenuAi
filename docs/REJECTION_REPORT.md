# Numbite 1.0 (build 3): App Review rejection report

Prepared 31 October 2026. Nothing has been replied to, changed, committed, pushed or resubmitted. No fix has been started: this report is the stopping point until you pick an option (section 6).

## 1. Summary

**What Apple objected to:** one thing, **Guideline 1.4.1 (Safety: Physical Harm)**. Apple says Numbite "includes medical information but does not include citations for the medical information", and wants "citations in the app of the sources of the recommendations or information, such as links to those sources", easy for the user to find.

**What Apple was looking at:** the screenshot Apple attached is the **Settings > Daily targets** screen. It shows calories 3,980, protein 290 g, carbs 400 g, fat 135 g, a 2,000 ml water goal, the line "about 20% from protein, 30% from fat and the rest from carbs", and a **Suggest targets** button. So the reviewer treated the app's suggested daily targets as health recommendations.

**Is Apple right?** On the facts, yes: there is no link to a health or nutrition-guidance source anywhere in the app (the links it does have point to where the food data comes from: each restaurant's own guide, Open Food Facts and supermarket pages). Apple's wording ("medical recommendations") overstates what the app does, because the app already says "not medical advice". But arguing that costs a review cycle, and what Apple asks for is cheap to give.

**Is it quickly fixable?** Yes, but it needs a **new build (build 4)**, because Apple wants the citations "in the app" and the app's screens are packed inside it. A reply to Apple alone is very unlikely to be enough. My estimate: a few hours of work from me, then about 30 minutes of archive and upload from you, then Apple's review (usually a day or two, but that is Apple's call).

**The catch:** only some of the app's rules can be backed by a source today (the calorie formula, the average calories, the protein range for people who exercise). Others have no source I could find (the 1,200 calorie floor, the 500-calorie deficit, the 20/30/50 split, the activity multipliers, the GLP-1 meal-size cap). Section 4 lists them. The recommended fix labels those honestly as Numbite's own starting points, but it is your decision whether to keep them as they are (section 7).

**Recommendation: Option A** (add a sources screen and links, build 4, plus a short factual reply to Apple when you resubmit).

## 2. The rejection, word for word

Source: App Store Connect > Numbite: Calories & Protein > App Review > submission of Oct 18 at 7:30 PM > Messages (1). Copied from the page.

- Message from: Apple, "Yesterday 8:22 PM" (30 October 2026)
- Submission ID: `396dfb5d-7738-4aa0-ac84-6e93d16747d4`
- Review date: October 30, 2026
- Review device: iPad Air 11-inch (M3)
- Version reviewed: 1.0 (3)
- Status on the page: "Unresolved Issues". "Your app version was rejected and no other items submitted can be accepted or approved." Item: iOS App 1.0, build 1.0 (3), Rejected, "1.4.1 Safety: Physical Harm".
- Attachment: `Screenshot-1030-132037.png`
- Only one issue is listed.

> Hello,
>
> Thank you for submitting the new app, Numbite: Calories & Protein, for review. We noticed some issues that require your attention. Please see below for additional information.
>
> If you have any questions, we are here to help. Reply to this message in App Store Connect and let us know.
>
> Review Environment
> Submission ID: 396dfb5d-7738-4aa0-ac84-6e93d16747d4
> Review date: October 30, 2026
> Review Device: iPad Air 11-inch (M3)
> Version reviewed: 1.0 (3)
>
> Guideline 1.4.1 - Safety - Physical Harm
>
> Issue Description
>
> The app includes medical information but does not include citations for the medical information.
>
> Specifically, the app provides health or medical recommendations in the binary without citations, such as links to sources for this information.
>
> All apps with medical and health information should include citations to ensure users are provided accurate information.
>
> Next Steps
>
> Include citations in the app of the sources of the recommendations or information, such as links to those sources. The citations to the sources should be easy for the user to find.
>
> Resources
>
> Learn more about requirements for medical apps in guideline 1.4.1.
>
> Support
> - Reply to this message in your preferred language if you need assistance. If you need additional support, use the Contact Us module.
> - Consult with fellow developers and Apple engineers on the Apple Developer Forums.
> - Provide feedback on this message and your review experience by completing a short survey.

**Not raised this round:** nothing about logos or photos (5.2.1), Community and reporting (1.2), Sign in with Apple (4.8), account deletion (5.1.1), reminders (4.5.4), web-view design (4.2), privacy labels or metadata. I can't promise Apple won't raise something new on resubmission.

## 3. What Apple's screenshot shows

`Screenshot-1030-132037.png` is 1640 x 2360 px, taken on the iPad at 06:20 on 30 Oct. It shows the Settings page scrolled to **Daily targets**, just below the goal list (the "Other" option is visible at the top). In order:

- Calories **3980**, Protein (g) **290**, Carbs (g) **400**, Fat (g) **135**
- Water (ml) **2000**, "Your goal for the day on Home. Left empty it is 2,000 ml."
- "Left empty, protein, carbs and fat are worked out from your calories: about 20% from protein, 30% from fat and the rest from carbs. Type your own to change them."
- **Save targets** and **Suggest targets >**
- The floating tab bar (Home, Eat out, Groceries, Recipes, Community) covers the bottom, so the line "Suggested starting points, not medical advice. Adjust any time." is out of view in this picture.

The numbers add up the way the app's own plan works out targets (4 x 290 + 4 x 400 + 9 x 135 is about 3,975 kcal), so they were most likely suggested by the app from body measurements the reviewer entered, not typed in by hand. I can't tell which measurements.

## 4. Diagnosis: where the uncited health guidance is

I read the code on `main` (commit be47b77, the latest). I can't compare it against build 3 itself, but Apple's screenshot matches what this code draws. The calorie and macro suggestions are in `web/lib/mm/targets.ts`; they appear in Settings (`web/app/app/settings/page.tsx`), in onboarding's targets step (`web/app/app/welcome/TargetsStep.tsx`) and in the Suggest targets form (`web/app/app/_components/TargetSuggestForm.tsx`).

| # | What the app says or does | Where | Source status |
|---|---|---|---|
| 1 | Resting calories from the Mifflin-St Jeor equation (male +5, female -161) | targets.ts:62-64, 261-263 | **Sourced**: Mifflin et al. 1990, checked on PubMed (section 5) |
| 2 | "Unspecified" sex uses an offset of -78 | targets.ts:17 | **Not in the paper.** It is Numbite's midpoint of the two. Must be labelled as ours |
| 3 | Activity multipliers 1.2 / 1.375 / 1.55 / 1.725 | targets.ts:10 | **No source found** this session |
| 4 | Goal adjustments: lose weight -500, build muscle +250, GLP-1 -500 kcal a day | targets.ts:18 | The NHS page I read supports only the idea (eating fewer calories than you use is likely to lose weight); **it does not give the 500 figure** |
| 5 | Never suggest below 1,200 kcal; "That's lower than most adults need" | targets.ts:21-25, 134, 174 | The NHS average (men 2,500, women 2,000) supports "lower than most adults need". **No source found for 1,200** |
| 6 | Protein 1.2 / 1.4 / 1.6 g per kg of body weight; kept between 15% and 35% of calories | targets.ts:19, 119-120 | ISSN supports 1.4-2.0 g/kg for **exercising** adults. It does not cover 1.2, non-exercisers, or the 15-35% limits |
| 7 | Default split about 20% protein, 30% fat, rest carbs (the line in Apple's screenshot) | targets.ts:73-77; settings/page.tsx:211 | **No source found** |
| 8 | GLP-1 goal: "Comfortable meal size", pre-filled 300-450 kcal, default 450; "Smaller, protein-first orders" | targets.ts:129-131; budget.ts:9; settings/page.tsx:194, 207-208; TargetsStep.tsx:96-104 | **No source found.** This is the most medical-looking item |
| 9 | Water goal 2,000 ml when left empty (in Apple's screenshot) | water.ts:21; settings/page.tsx:206 | Not checked |
| 10 | Notes telling people to see a doctor, dietitian or pharmacist (low calories, small body, GLP-1) | targets.ts:22-27, 172-178 | These are cautions, not claims. Already present |
| 11 | Medication reminders | docs/STORE.md; reminders code | No recommendation is given; the add sheet says to follow the doctor's or pharmacist's advice. Low risk |
| 12 | Food articles (Community) | web/lib/mm/blog/ | I read two of the eight in full and searched all eight for health wording. No health recommendations found. They contain no links at all |

**Why this slipped through:** docs/STORE.md read 1.4.1 as "remind people to check with a doctor" and concluded the app was not that kind of app. Apple's actual request here is about citations, which nobody had planned for.

**Something else Apple's screenshot shows:** the app suggested about 4,000 kcal and 290 g protein without any "please check" note. The app has guards for very low calories and for a height and weight that look mistyped, but nothing for unusually high targets. Optional: see decision 5.

## 5. Sources: what I could and could not verify

**Verified in this session** (I opened the page or paper and read it):

1. **Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO.** A new predictive equation for resting energy expenditure in healthy individuals. *Am J Clin Nutr* 1990;51(2):241-7. doi:10.1093/ajcn/51.2.241. PMID 2305711. https://pubmed.ncbi.nlm.nih.gov/2305711/
   Supports: the equation, for healthy people aged 19-78 (separate male and female formulas). Does not support: the "unspecified" offset, activity multipliers, deficits.
2. **NHS, "Understanding calories".** As my fetch tool reported it (read the page for the exact wording before quoting it): an average man needs about 2,500 kcal a day and an average woman about 2,000 kcal, which could differ with age, weight, height and exercise; and you are likely to lose weight if you eat and drink fewer calories than you use. The page says it was last reviewed 17 April 2023 with the next review due 17 April 2026, so it is past its own review date. Address I fetched: https://www.nhs.uk/common-health-questions/food-and-diet/what-should-my-daily-intake-of-calories-be/ (the usual address is probably https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/understanding-calories/ but I did not open that one: confirm the address before it goes in the app).
3. **Jäger R, Kerksick CM, Campbell BI, et al.** International Society of Sports Nutrition Position Stand: protein and exercise. *J Int Soc Sports Nutr* 2017;14:20. doi:10.1186/s12970-017-0177-8. PMID 28642676. https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
   Says "an overall daily protein intake in the range of 1.4-2.0 g protein/kg body weight/day ... is sufficient for most exercising individuals". It is about healthy exercising people, so it fits the lose-weight, build-muscle and GLP-1 factors (1.4, 1.6) when the person exercises, not the "maintain" 1.2.
4. **NHS Better Health, "How to lose weight".** https://www.nhs.uk/better-health/lose-weight/ exists and has calorie-counting material ("Calories and weight loss", "set a daily calorie target"). I only read headings and link text, not the detail, so I would cite it only as general reading.

**Could not verify:**

- **NICE** (for the GLP-1 medicines, e.g. guidance TA875): nice.org.uk refused both my web-fetch tool and your Chrome with "403 Forbidden". I did not try to get round that. You can open https://www.nice.org.uk/guidance/ta875 yourself to check it exists and says what we would cite.
- The UK protein reference figure (I believe 0.75 g per kg a day): not checked, so not listed as a source.
- Any source for items 3, 4 (the 500 figure), 5 (the 1,200 figure), 6 (15-35%), 7 and 8 in section 4. I found none, and I did not guess one.

Nothing unverified should go into the app as a citation. Whoever writes the sources screen should open each link first.

## 6. Options

**Option A (recommended): add citations in the app, build 4, with a short reply to Apple.**
- What changes: a plain "Where our targets come from" screen (or a new section on the existing "How we get our numbers" page, `web/app/app/settings/numbers/NumbersContent.tsx`) listing each rule, its source with a tappable link, and the date checked. For rules with no source, it says so plainly ("Numbite's own starting point: change it any time") instead of implying a source. A "Where these numbers come from" link goes next to the Daily targets in Settings, in onboarding's targets step, in the Suggest targets form, and under the GLP-1 notes. Links should open in Safari: that is what `MenuMacros/Features/WebApp/WebAppView.swift` does for web links, by my reading of the code (not tried in the simulator).
- Work: new strings must be translated into the 10 other languages or the screen kept English-only (decision 4); unit tests; a rebuild of the packed web app; a simulator check; the build number raised from 3 to 4 (two lines in `MenuMacros.xcodeproj/project.pbxproj`, lines 282 and 471).
- Time: a few hours of my work, about 30 minutes of yours (archive and upload), then Apple's review.
- Risk of a second rejection: moderate to low. Apple's request is specific and this meets it. The risk is a reviewer who reads "Numbite's own starting point" as an uncited recommendation, which is why decision 2 matters.
- What you give up: nothing.

**Option B: reply to Apple only, no new build.** Minutes of work and no upload, but Apple asked for citations "in the app" and the app would be unchanged. I expect the same rejection and about a day or two lost. Not recommended on its own.

**Option C: remove the recommendations.** Delete Suggest targets, the onboarding plan and the automatic 20/30/50 split, so the app only holds numbers the person types. Strongest on 1.4.1 and it needs a build 4 as well, but it removes features you built on purpose (onboarding plan, GLP-1 meal size) and touches several screens. Only worth it if A is rejected.

**Option D: appeal to the App Review Board.** Not recommended. Apple's request is reasonable and cheap to meet, and an appeal takes longer than a fix.

## 7. Decisions only you can make

1. **Which option?** (I recommend A.)
2. **Rules with no source** (items 3, 4, 5, 6, 7, 8): keep the numbers and label them as Numbite's own starting points (recommended; no number changes), or change a number to match a source (CLAUDE.md rule 8 needs your yes, and a source has to be found first)?
3. **GLP-1 "Comfortable meal size"** (300-450 kcal, default 450): keep with the "your own setting, follow your doctor or pharmacist" wording, reword it, or stop pre-filling a number? It is the item I'd worry about most.
4. **Translations:** translate the new sources screen into the 10 languages (more work, matches the rest of the app), or leave it English-only like the restaurant notes and articles?
5. **Optional:** add a calm "please check your height and weight" or "that is higher than most people need" note for very high targets, like Apple's 3,980 kcal screenshot? Not required by Apple.
6. **Reply to Apple** when you resubmit: yes or no. I recommend a short factual one (draft below).
7. **Sources:** are you happy to link to the NHS, PubMed and the ISSN paper? Please open the NICE page yourself (I couldn't).

## 8. Steps that are yours

**Now:** nothing to click. If you want to read Apple's message yourself: appstoreconnect.apple.com > Apps > Numbite: Calories & Protein > View App Review Issues & Messages > the "Oct, 18 at 7:30 PM" submission. Don't press Cancel Submission.

**After I've built the fix** (these labels are as I saw the pages today; I haven't clicked any of them):

1. **Xcode:** open `MenuMacros.xcodeproj`. Scheme MenuMacros, destination "Any iOS Device (arm64)". Product > Archive. In the Organizer: Distribute App > App Store Connect > Upload, and accept the defaults. (The build number will already be 4.)
2. **App Store Connect:** wait for the email saying build 4 has finished processing.
3. Open Numbite > App Review > the rejected submission. In "Items Submitted", on the **iOS App 1.0** row click **Edit**. I expect that to open the version page, where the Build section lets you swap build 3 for **build 4**; Save.
4. Back on the submission page, optionally use **Reply to App Review** at the bottom of Apple's message and paste the reply below.
5. Click **Resubmit to App Review**. The release option stays "Manually release this version".

## 9. What I did not do

- **I did not run the app in the simulator.** My shell on your Mac failed every time this session ("device_bash failed"). I read the code from a read-only copy of the public GitHub repo in the cloud instead, on a branch `rejection-check` in that copy. This issue is missing content, not a crash or a behaviour, and Apple's own screenshot shows the screen, so I don't think a reproduction was needed, but I haven't seen the app run.
- I clicked **Download** on Apple's attachment in Chrome, which may have left a copy of the PNG in your Downloads folder. I also showed the image on the App Store Connect page for a moment to read it, then removed it. Nothing on the page was changed.
- I did not read all of docs/ (for example IMAGE_TERMS.md and the accounts docs), because the rejection doesn't touch them.
- Nothing is committed. Say yes and I'll commit this report to `rejection-check`.

## Draft reply to Apple (use only after build 4 contains the citations)

> Hello, and thank you for the review.
>
> We have added citations for the health and nutrition guidance in build 4. In Settings > Daily targets, on the targets step of onboarding, and under the GLP-1 goal there is now a "Where these numbers come from" link. It opens a screen that lists each source with a link: the Mifflin-St Jeor equation for resting energy (American Journal of Clinical Nutrition, 1990), the NHS's guideline daily calories, and the International Society of Sports Nutrition position stand on protein. Where a default is Numbite's own starting point rather than taken from a source, the screen says so.
>
> The suggested targets are starting points that the person can change at any time, and the app states that it does not give medical advice. Please tell us if you would like the citations shown anywhere else.
>
> Thank you.

(Edit the list to match the final screen. It must never claim permission from any restaurant or shop, and it doesn't.)
