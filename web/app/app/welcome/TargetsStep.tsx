"use client";

import { useState } from "react";
import { parseNumber } from "@/lib/mm/addFood";
import { suggestCarbFat, suggestProtein, MAX_MACRO_TARGET, CARB_FAT_NOTE, isLowCalories, LOW_CALORIES_NOTE, SUGGESTION_NOTE, UNDER_18_COPY, type PlanNote } from "@/lib/mm/targets";
import type { AnswersPlan, TargetFieldKey, TargetFieldTexts, TargetFieldsReading } from "@/lib/mm/onboardingPlan";
import type { Goal, Preferences } from "@/lib/mm/types";
import { BoltIcon, DropIcon, FlameIcon, ShieldIcon, SproutIcon } from "../_components/icons";
import { PlanNotes } from "../_components/BodyFields";
import { SourcesLink } from "../_components/SourcesLink";
import { focusTargetBox, TargetSuggestForm } from "../_components/TargetSuggestForm";
import { useT } from "../_lib/i18n";
import { HEADLINE, StepperCard } from "./parts";

// "Your daily targets", step 9 of the welcome steps, after the questions about the person (founder 2026-10-16: "arrive on this screen with pre typed information
// which they can change"). The cards arrive filled with the plan worked out from the goal, the diet and the body questions, and every one can be changed.
// GLP-1's "Comfortable meal size" stays at its default (it is not worked out from the plan: a different meal size changes what Best for you ranks). A person
// who skipped the questions (or whose answers gave no plan) gets the starting numbers, said to be starting numbers, with the Calories box ringed so they can tap
// it and type their own (the keyboard is not forced open: on a 667 pt screen it would cover − and + and Next), and "Not sure? Suggest targets for me".
// The onboarding redesign meeting (20 November 2026, approved by the founder): no Pip here (a number screen: his sentence is plain text), sentence-case labels,
// the numbers at their final value (no count-up, no confetti), calories and protein first and a size bigger, then carbs and fat; for GLP-1 the meal size comes
// first as a full card, then protein, then calories, carbs and fat. Where the numbers come from is one tap away above the cards (App Review 1.4.1), and the
// line under them says truly, at 16 px, what is and isn't kept. The 1,200 kcal suggestion floor and the low-calorie caution are unchanged and never block anyone.

// the lines that say what is wrong, named by the boxes they are about
const MAIN_PROBLEM = "target-problem-main";
const MACRO_PROBLEM = "target-problem-macros";

export function TargetsStep({ goal, prefs, answers, skipped, fields, setField, reading, suggestedNotes, applySuggestion, counter }: {
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
  /** "Step n of N", read by a screen reader with the headline. */
  counter?: string;
}) {
  const t = useT();
  const [showSuggest, setShowSuggest] = useState(false);
  const plan = answers?.plan ?? null;
  // The boxes hold a worked-out plan: from the questions, or from the suggestion form after they were skipped.
  const filled = plan?.kind === "ok" || suggestedNotes !== null;
  const under18 = plan?.kind === "under18";
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
  // what is wrong is said right under the cards, in plain ink, and named on the boxes it is about
  const mainProblem = bad("calories") || bad("protein") || bad("mealCap");
  const macroProblem = bad("carbs") || bad("fat");
  const glp1 = goal === "glp1";

  const caloriesCard = <StepperCard key="calories" id="target-calories" label={t("Calories")} Icon={FlameIcon} value={fields.calories} onChange={changeCalories} step={50} min={500} max={10000} invalid={bad("calories")} describedBy={MAIN_PROBLEM} large={!glp1} highlight={skipped && !filled && !under18} />;
  const proteinCard = <StepperCard key="protein" id="target-protein" label={t("Protein (g)")} Icon={BoltIcon} value={fields.protein} onChange={(v) => setField("protein", v)} step={5} min={5} max={1000} placeholder={t("Optional")} from={suggestedProtein} invalid={bad("protein")} describedBy={MAIN_PROBLEM} large />;
  const carbsCard = <StepperCard key="carbs" id="target-carbs" label={t("Carbs (g)")} Icon={SproutIcon} value={fields.carbs} onChange={(v) => setField("carbs", v)} step={5} min={5} max={MAX_MACRO_TARGET} placeholder={t("Optional")} from={suggestedCarbFat.carbs} invalid={bad("carbs")} describedBy={MACRO_PROBLEM} />;
  const fatCard = <StepperCard key="fat" id="target-fat" label={t("Fat (g)")} Icon={DropIcon} value={fields.fat} onChange={(v) => setField("fat", v)} step={5} min={5} max={MAX_MACRO_TARGET} placeholder={t("Optional")} from={suggestedCarbFat.fat} invalid={bad("fat")} describedBy={MACRO_PROBLEM} />;

  return (
    <section className="relative mt-5 flex flex-1 flex-col">
      <h1 className={HEADLINE}>{t("Your daily targets")}{counter && <span className="sr-only">{`, ${counter}`}</span>}</h1>
      {/* the app's own voice, plain text in the page's ink (no Pip on a number screen) */}
      <p aria-live="polite" className="mt-3 text-base leading-snug text-foreground">
        {under18
          ? t(UNDER_18_COPY)
          : filled
            ? t("Worked out on your phone from your answers. They're only a starting point: tap a number to type your own, or use − and +.")
            : t("These are starting numbers, not worked out for you. Know your number? Tap Calories and type it in.")}
      </p>
      {/* "Suggested starting points" is about numbers that were suggested: none were for an age under 18. App Review 1.4.1: the sources, one tap away above the
          cards, in a sheet so the answers on this screen are never lost; its 44 pt tap area is kept, pulled into the line with negative margins. */}
      {!under18 && (
        <div className="mt-2 text-[0.9375rem] leading-snug text-muted">
          {t(SUGGESTION_NOTE)} <SourcesLink className="-my-2.5 align-baseline" />
        </div>
      )}
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5">
        {glp1 && (
          // the meal size first, as a full card, with what it does
          <div className="col-span-full">
            <StepperCard id="target-mealcap" label={t("Comfortable meal size")} Icon={FlameIcon} value={fields.mealCap} onChange={(v) => setField("mealCap", v)} step={50} min={100} max={2000} invalid={bad("mealCap")} describedBy={MAIN_PROBLEM} large />
            <p className="mt-2 text-[0.9375rem] leading-snug text-foreground">{t("Orders and recipes are kept to this size, protein first.")}</p>
          </div>
        )}
        {glp1 ? [proteinCard, caloriesCard, carbsCard, fatCard] : [caloriesCard, proteinCard, carbsCard, fatCard]}
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
      {/* what is kept, named in full (the account also keeps the goal, the foods avoided and the shops: SYNCED_SETTING_KEYS), so it is never untrue by leaving
          things out; 16 px in the page's ink */}
      <p className="mt-4 flex items-start gap-2.5 text-base leading-snug text-foreground">
        <ShieldIcon aria-hidden className="mt-[0.2rem] h-[1.125rem] w-[1.125rem] shrink-0 text-accent" />
        <span>{t("Your sex, age, height, weight and activity aren't kept. Your daily numbers, goal, the foods you avoid and your shops are kept on this phone, and in your account once you sign in.")}</span>
      </p>
      {skipped && !under18 && (
        <>
          <button type="button" className="mt-3 min-h-12 self-start text-start text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px]" onClick={() => setShowSuggest((v) => !v)} aria-expanded={showSuggest}>
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
