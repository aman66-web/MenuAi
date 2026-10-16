"use client";

import { useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { suggestCarbFat, suggestProtein, MAX_MACRO_TARGET, CARB_FAT_NOTE, isLowCalories, LOW_CALORIES_NOTE, SUGGESTION_NOTE, UNDER_18_COPY, type PlanNote } from "@/lib/mm/targets";
import type { AnswersPlan, TargetFieldKey, TargetFieldTexts, TargetFieldsReading } from "@/lib/mm/onboardingPlan";
import type { Goal, Preferences } from "@/lib/mm/types";
import { BoltIcon, DropIcon, FlameIcon, SproutIcon } from "../_components/icons";
import { PlanNotes } from "../_components/BodyFields";
import { PipSays } from "../_components/Mascot";
import { focusTargetBox, TargetSuggestForm } from "../_components/TargetSuggestForm";
import { inputClass } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { CARD, HEADLINE, PlateArt, StepperCard } from "./parts";

// "Your daily targets", now after the questions about the person (founder 2026-10-16: "arrive on this screen with pre typed information which they can
// change"). The four cards (calories, protein, carbs, fat) arrive filled with the plan worked out from the goal, the diet and the body questions, and
// every one can be changed. GLP-1's "Comfortable meal size" stays at its default (it is not worked out from the plan: a different meal size changes what
// Best for you ranks). A person who skipped the questions (or whose answers gave no plan) gets the screen as it was: the default calories, the rest
// empty (Home works those out), and "Not sure? Suggest targets for me", which opens the single-screen form from Settings.

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
  const notes: readonly PlanNote[] = plan?.kind === "ok" ? plan.notes : suggestedNotes ?? (goal === "glp1" ? ["glp1"] : []);
  // Pip does not cheer over a caution to check the measurements or to talk to a doctor or dietitian
  const cautious = notes.some((n) => n === "check-measurements" || n === "low-calories-floor" || n === "low-bmi") || isLowCalories(fields.calories);
  // what is wrong is said right under the cards, in plain ink, and named on the boxes it is about
  const mainProblem = bad("calories") || bad("protein") || bad("mealCap");
  const macroProblem = bad("carbs") || bad("fat");

  return (
    <section className="relative mt-5 flex flex-1 flex-col">
      {/* the plate runs off the edge of the screen, like the reference's photo; its box is clipped so the page never scrolls sideways */}
      <div aria-hidden className="pointer-events-none absolute -end-5 -top-5 h-44 w-36 overflow-hidden">
        <PlateArt className="absolute -end-10 top-0 h-44 w-44" />
      </div>
      <h1 className={`${HEADLINE} pe-24`}><Rich text={t("Your daily {targets}")} values={{ targets: t("targets") }} /></h1>
      {/* the plan as it stands, like the reference's coloured bars (the app's two greens): it follows the numbers below as they change */}
      <div aria-hidden className="app-numbers mt-5 space-y-2.5 pe-24">
        <p className="flex items-baseline gap-3"><span className="h-7 w-1.5 shrink-0 self-center rounded-full bg-[var(--bar)]" /><span className="text-[1.6rem] font-medium leading-none tracking-[-0.01em]">{calories !== undefined ? formatInt(calories) : "–"}</span><span className="text-sm font-semibold text-muted">kcal</span></p>
        <p className="flex items-baseline gap-3"><span className="h-7 w-1.5 shrink-0 self-center rounded-full bg-accent" /><span className="text-[1.6rem] font-medium leading-none tracking-[-0.01em]">{reading.protein !== undefined ? `${formatInt(reading.protein)}g` : "–"}</span><span className="text-sm font-semibold text-muted">{t("protein")}</span></p>
      </div>
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={56} mood={cautious ? "think" : filled ? "cheer" : "point"}>
          {filled
            ? t("I worked these out from your answers. They're only a starting point, so change any of them.")
            : plan?.kind === "under18"
              ? t(UNDER_18_COPY)
              : t("Not sure of your numbers? Tap “Suggest targets for me” and I'll help.")}
        </PipSays>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5">
        <StepperCard id="target-calories" label={t("Calories")} Icon={FlameIcon} value={fields.calories} onChange={(v) => setField("calories", v)} step={50} min={500} max={10000} invalid={bad("calories")} describedBy={MAIN_PROBLEM} />
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
            <input className={`${inputClass} app-numbers max-w-[6.5rem] bg-soft-strong text-center text-[1.25rem] font-medium`} inputMode="numeric" autoComplete="off" aria-label={t("Comfortable meal size in calories")} aria-invalid={bad("mealCap") || undefined} aria-describedby={bad("mealCap") ? MAIN_PROBLEM : undefined} value={fields.mealCap} onChange={(e) => setField("mealCap", e.target.value)} />
            <span className="text-muted">{t("calories")}</span>
          </label>
          <p className="mt-2 text-sm text-muted">{t("Orders are capped at this size. The default is 450.")}</p>
        </div>
      )}
      {skipped && (
        <>
          <button type="button" className="mt-3 min-h-12 text-start text-[0.9375rem] font-semibold text-accent underline-offset-4 hover:underline" onClick={() => setShowSuggest((v) => !v)} aria-expanded={showSuggest}>
            {t("Not sure? Suggest targets for me")}
          </button>
          {showSuggest && (
            <div className="mt-1">
              <TargetSuggestForm goal={goal} preferences={prefs} onApply={(targets, suggestionNotes) => { applySuggestion(targets, suggestionNotes); setShowSuggest(false); focusTargetBox("#target-calories"); }} />
            </div>
          )}
        </>
      )}
      {/* "Suggested starting points" is about numbers that were suggested: none were for an age under 18 */}
      {plan?.kind !== "under18" && <p className="mt-3 text-[0.9375rem] text-muted">{t(SUGGESTION_NOTE)}</p>}
    </section>
  );
}
