"use client";

import { useState } from "react";
import { parseNumber } from "@/lib/mm/addFood";
import { suggestCarbFat, suggestProtein, MAX_MACRO_TARGET, CARB_FAT_NOTE, isLowCalories, LOW_CALORIES_NOTE, SUGGESTION_NOTE, UNDER_18_COPY, type PlanNote } from "@/lib/mm/targets";
import type { AnswersPlan, TargetFieldKey, TargetFieldTexts, TargetFieldsReading } from "@/lib/mm/onboardingPlan";
import type { Goal, Preferences } from "@/lib/mm/types";
import { BoltIcon, DropIcon, FlameIcon, SproutIcon } from "../_components/icons";
import { PlanNotes, ShieldNote } from "../_components/BodyFields";
import { SourcesLink } from "../_components/SourcesLink";
import { PipSays } from "../_components/Mascot";
import { focusTargetBox, TargetSuggestForm } from "../_components/TargetSuggestForm";
import { inputClass } from "../_components/ui";
import { useSignInRequired } from "../_lib/appSwitches";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { CARD, HEADLINE, StepperCard } from "./parts";

// "Your daily targets", now after the questions about the person (founder 2026-10-16: "arrive on this screen with pre typed information which they can
// change"). The four cards (calories, protein, carbs, fat) arrive filled with the plan worked out from the goal, the diet and the body questions, and
// every one can be changed. GLP-1's "Comfortable meal size" stays at its default (it is not worked out from the plan: a different meal size changes what
// Best for you ranks). A person who skipped the questions (or whose answers gave no plan) gets the screen as it was: the default calories, the rest
// empty (Home works those out), and "Not sure? Suggest targets for me", which opens the single-screen form from Settings.
// Each number shows once, in its card (usability test 2026-11-19: 12 of 16 flagged the numbers shown twice, and the clipped plate); where the numbers come from
// is said straight under Pip, above the cards (App Review 1.4.1); and one line under the cards says truly what is and isn't kept.

// the lines that say what is wrong, named by the boxes they are about
const MAIN_PROBLEM = "target-problem-main";
const MACRO_PROBLEM = "target-problem-macros";

export function TargetsStep({ goal, prefs, answers, skipped, fields, setField, reading, suggestedNotes, applySuggestion }: {
  goal: Goal;
  prefs: Preferences;
  /** The plan for the answers given (null when the person skipped the questions). */
  answers: AnswersPlan | null;
  skipped: boolean;
  fields: TargetFieldTexts;
  setField: (key: TargetFieldKey, value: string) => void;
  reading: TargetFieldsReading;
  /** The notes of the suggestion the person applied on this screen (they skipped the questions), or null if none was. */
  suggestedNotes: readonly PlanNote[] | null;
  applySuggestion: (targets: { calories: string; protein: string; carbs: string; fat: string }, notes: readonly PlanNote[]) => void;
}) {
  const t = useT();
  // where everyone signs in, the account comes on the next screen ("Save your plan: make your free account"), so the line under the cards says what it keeps
  const signInRequired = useSignInRequired();
  const [showSuggest, setShowSuggest] = useState(false);
  const plan = answers?.plan ?? null;
  // The four boxes hold a worked-out plan: from the questions, or from the suggestion form after they were skipped.
  const filled = plan?.kind === "ok" || suggestedNotes !== null;
  const bad = (k: TargetFieldKey) => reading.problems.includes(k);
  const calories = reading.calories;
  // What an empty protein, carbs or fat box stands for on Home (and where a tap on − or + starts from).
  const baseCalories = calories ?? Number(fields.calories);
  const suggestedProtein = suggestProtein(baseCalories);
  const suggestedCarbFat = suggestCarbFat(baseCalories, reading.protein);
  const anyEmpty = fields.protein.trim() === "" || fields.carbs.trim() === "" || fields.fat.trim() === "";
  // carbs and fat that are still the worked-out figures follow a change of calories (usability test 2026-11-19: Barbara typed 2,000 and carbs and fat
  // stayed at the 1,500 figures); ones the person changed are kept
  // (compared with the figures for the last whole calorie number, so the digits on the way to "2000" don't count)
  const [followFrom, setFollowFrom] = useState<number | null>(() => { const x = parseNumber(fields.calories); return typeof x === "number" ? x : null; });
  const changeCalories = (v: string) => {
    setField("calories", v);
    const now = parseNumber(v);
    if (typeof now !== "number" || now < 500 || now > 10000) return;
    if (followFrom !== null) {
      const before = suggestCarbFat(followFrom, reading.protein);
      const after = suggestCarbFat(now, reading.protein);
      const near = (text: string, figure: number) => { const x = parseNumber(text); return typeof x === "number" && Math.abs(x - figure) <= 5; };
      if (near(fields.carbs, before.carbs)) setField("carbs", String(after.carbs));
      if (near(fields.fat, before.fat)) setField("fat", String(after.fat));
    }
    setFollowFrom(now);
  };
  const notes: readonly PlanNote[] = plan?.kind === "ok" ? plan.notes : suggestedNotes ?? (goal === "glp1" ? ["glp1"] : []);
  // Pip does not cheer over a caution to check the measurements or to talk to a doctor or dietitian
  const cautious = notes.some((n) => n === "check-measurements" || n === "low-calories-floor" || n === "low-bmi") || isLowCalories(fields.calories);
  // what is wrong is said right under the cards, in plain ink, and named on the boxes it is about
  const mainProblem = bad("calories") || bad("protein") || bad("mealCap");
  const macroProblem = bad("carbs") || bad("fat");

  return (
    <section className="relative mt-5 flex flex-1 flex-col">
      <h1 className={HEADLINE}><Rich text={t("Your daily {targets}")} values={{ targets: t("targets") }} /></h1>
      {/* Pip never cheers over a calorie target (the dietitian and the GLP-1 user): he listens, and thinks under a caution */}
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={64} mood={cautious ? "think" : filled ? "listen" : "point"}>
          {filled
            ? t("I worked these out on your phone from your answers. They're only a starting point: tap a number to type your own, or use − and +.")
            : plan?.kind === "under18"
              ? t(UNDER_18_COPY)
              : t("Know your number? Tap Calories and type it in. Not sure? Tap “Not sure? Suggest targets for me” below and I'll help.")}
        </PipSays>
      </div>
      {/* "Suggested starting points" is about numbers that were suggested: none were for an age under 18. App Review 1.4.1: the sources of the suggestions, one
          tap away above the cards, in a sheet so the answers on this screen are never lost. The link ends the note's own line (a div, not a p: the link brings its
          sheet with it); its 44 pt tap area is kept, pulled into the line with negative margins, so the carbs and fat − and + clear the bottom bar at 390x844. */}
      {plan?.kind !== "under18" && (
        <div className="mt-3 text-[0.9375rem] leading-snug text-muted">
          {t(SUGGESTION_NOTE)} <SourcesLink className="-my-2.5 align-baseline" />
        </div>
      )}
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5">
        <StepperCard id="target-calories" label={t("Calories")} Icon={FlameIcon} value={fields.calories} onChange={changeCalories} step={50} min={500} max={10000} invalid={bad("calories")} describedBy={MAIN_PROBLEM} />
        <StepperCard id="target-protein" label={t("Protein (g)")} Icon={BoltIcon} value={fields.protein} onChange={(v) => setField("protein", v)} step={5} min={5} max={1000} placeholder={t("Optional")} from={suggestedProtein} invalid={bad("protein")} describedBy={MAIN_PROBLEM} />
        <StepperCard id="target-carbs" label={t("Carbs (g)")} Icon={SproutIcon} value={fields.carbs} onChange={(v) => setField("carbs", v)} step={5} min={5} max={MAX_MACRO_TARGET} placeholder={t("Optional")} from={suggestedCarbFat.carbs} invalid={bad("carbs")} describedBy={MACRO_PROBLEM} />
        <StepperCard id="target-fat" label={t("Fat (g)")} Icon={DropIcon} value={fields.fat} onChange={(v) => setField("fat", v)} step={5} min={5} max={MAX_MACRO_TARGET} placeholder={t("Optional")} from={suggestedCarbFat.fat} invalid={bad("fat")} describedBy={MACRO_PROBLEM} />
      </div>
      {mainProblem && (
        <p id={MAIN_PROBLEM} role="alert" className="mt-3 text-[0.9375rem] font-medium leading-snug">{t("Calories should be 500–10,000, protein above 0, and the meal size 100–2,000.")}</p>
      )}
      {macroProblem && (
        <p id={MACRO_PROBLEM} role="alert" className="mt-3 text-[0.9375rem] font-medium leading-snug">{t("Carbs and fat should be above 0 and at most 2,000 g.")}</p>
      )}
      {/* under 1,200 by hand: one caution is enough, so not when the suggestion's own 1,200 line is already showing */}
      {isLowCalories(fields.calories) && !notes.includes("low-calories-floor") && <p role="status" className="mt-3 text-[0.9375rem] font-medium leading-snug">{t(LOW_CALORIES_NOTE)}</p>}
      <PlanNotes notes={notes} className="mt-3" />
      {anyEmpty && <p className="mt-3 text-sm text-muted">{t(CARB_FAT_NOTE)}</p>}
      {goal === "glp1" && (
        <div className={`glass ${CARD} mt-3.5 p-4`}>
          {/* the words on one line, the figure and its unit on the next (the shared input is full width, so it is capped here) */}
          <label className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.9375rem] font-semibold">
            <span className="basis-full">{t("Comfortable meal size:")}</span>
            <input className={`${inputClass} app-numbers max-w-[6.5rem] text-center text-[1.25rem] font-medium`} inputMode="numeric" autoComplete="off" aria-label={t("Comfortable meal size in calories")} aria-invalid={bad("mealCap") || undefined} aria-describedby={bad("mealCap") ? MAIN_PROBLEM : undefined} value={fields.mealCap} onChange={(e) => setField("mealCap", e.target.value)} />
            <span className="text-muted">{t("calories")}</span>
          </label>
          <p className="mt-2 text-sm text-muted">{t("Orders are capped at this size. The default is 450.")}</p>
        </div>
      )}
      {/* what is kept, named in full (the account also keeps the goal, the foods avoided and the shops: SYNCED_SETTING_KEYS), so it is never untrue by leaving things out */}
      <ShieldNote className="mt-4">
        {signInRequired
          ? t("Your sex, age, height, weight and activity aren't kept. Your daily numbers, goal, the foods you avoid and your shops are saved with your account.")
          : t("Your sex, age, height, weight and activity aren't kept. Your daily numbers, goal, the foods you avoid and your shops are saved on this phone.")}
      </ShieldNote>
      {skipped && (
        <>
          <button type="button" className="mt-3 min-h-12 text-start text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px]" onClick={() => setShowSuggest((v) => !v)} aria-expanded={showSuggest}>
            {t("Not sure? Suggest targets for me")}
          </button>
          {showSuggest && (
            <div className="mt-1">
              <TargetSuggestForm goal={goal} preferences={prefs} onApply={(targets, suggestionNotes) => { applySuggestion(targets, suggestionNotes); setShowSuggest(false); focusTargetBox("#target-calories"); }} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
