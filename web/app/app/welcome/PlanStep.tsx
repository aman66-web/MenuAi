"use client";

import { useState } from "react";
import { formatInt } from "@/lib/mm/format";
import type { TargetFieldKey, TargetFieldTexts, TargetFieldsReading } from "@/lib/mm/onboardingPlan";
import { isLowCalories, LOW_CALORIES_NOTE, SUGGESTION_NOTE, suggestProtein, UNDER_18_COPY, type PlanNote } from "@/lib/mm/targets";
import type { Goal, Preferences } from "@/lib/mm/types";
import type { FirstDish } from "@/lib/mm/welcomeSteps";
import { PlanNotes } from "../_components/BodyFields";
import { BoltIcon, FlameIcon } from "../_components/icons";
import { SourcesLink } from "../_components/SourcesLink";
import { useT } from "../_lib/i18n";
import { type FeatureBottom, FeatureFoot } from "./FeatureSteps";
import { H1, SECONDARY } from "./Frame";
import { CARD, HEADLINE, STEP_TOP, StepperCard, SUBLINE } from "./parts";
import { CounterText } from "./QuestionSteps";
import { RestaurantRow } from "./RestaurantRow";
import { WeekShowcase } from "./WeekShowcase";

// Screen 7, "Your plan" (founder, 20 November 2026): the daily calories and protein, big; the week as a picture timetable with its shopping (WeekShowcase); then a
// row of restaurant dishes in the chains' own photos (RestaurantRow). No caption or tag on any of it, and few words: what must be said stays, short.
// - The numbers are worked out on the phone from About you and How active are you? (lib/mm/onboardingPlan.ts planFromAnswers), or are the starting numbers when
//   those were skipped (said so in the grey line under the heading). "Change", a white pill at the heading's end, opens the calorie and protein boxes (− and
//   +, or type), so anyone can put in their own number; "Save" saves them, and the week follows. Carbs and fat aren't shown: ones that followed the old numbers
//   follow the new ones (useTargetFields.ts changeTargetField). Under 18, no numbers: "Ask a doctor or dietitian for
//   targets." (UNDER_18_COPY), and no week.
// - App Review 1.4.1: "Suggested starting points, not medical advice." and where the numbers come from (SourcesLink), small, under the numbers; the plan's
//   own notes (the 1,200 floor, check the measurements, the medicine plan...) and the low-calorie caution for a number typed by hand, as before.

const MAIN_PROBLEM = "plan-target-problem";

export interface PlanTargets {
  fields: TargetFieldTexts;
  setField: (key: TargetFieldKey, value: string) => void;
  reading: TargetFieldsReading;
  /** The numbers on the screen are the starting numbers, not worked out for the person (the questions were skipped). */
  starting: boolean;
  /** Under 18: no numbers. */
  under18: boolean;
  /** The worked-out plan's notes. */
  notes: readonly PlanNote[];
  /** "Save" under the boxes: the page saves the numbers (true when they could be saved). */
  save: () => boolean;
}

/** One big number in a card: its icon, the figure and what it is. */
function BigNumber({ Icon, dot, value, unit, label }: { Icon?: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; dot?: string; value: string; unit: string; label: string }) {
  return (
    <div className={`glass ${CARD} min-w-0 p-4`}>
      <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-muted">
        {Icon && <Icon aria-hidden className="h-[1.125rem] w-[1.125rem] text-accent" />}
        {dot && <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className="app-numbers mt-1 flex items-baseline gap-1.5 leading-none">
        <span className="text-[2.5rem] font-bold tracking-[-0.02em]">{value}</span>
        <span className="text-[1.0625rem] font-semibold text-muted">{unit}</span>
      </p>
    </div>
  );
}

export function PlanStep({ counter, goal, prefs, targets, replay, planLine, onDish, bottom }: {
  counter: string;
  /** The goal chosen (null after Skip on step 1): which list the restaurant dishes come from. */
  goal: Goal | null;
  prefs: Preferences;
  targets: PlanTargets;
  /** Settings › Help's replay: nothing is changed or kept, so no "Change". */
  replay?: boolean;
  planLine?: boolean;
  onDish?: (dish: FirstDish | null) => void;
  bottom: FeatureBottom;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const { fields, setField, reading, starting, under18, notes } = targets;
  const calories = reading.calories;
  const protein = reading.protein ?? (calories !== undefined ? suggestProtein(calories) : undefined);
  const bad = reading.problems.includes("calories") || reading.problems.includes("protein");
  const done = () => {
    if (targets.save()) setEditing(false);
  };
  return (
    <section className={`${STEP_TOP} flex flex-1 flex-col`}>
      {/* the heading, with "Change" at its end (a white pill, like Skip); the one grey line under it says when these are the starting numbers */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Your plan")}<CounterText text={counter} /></h1>
        {!replay && !under18 && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={`${SECONDARY} -me-1 inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[1rem] font-bold`}>{t("Change")}</button>
        )}
      </div>
      {under18 ? (
        <p className="mt-3 text-[1.0625rem] font-semibold leading-snug text-foreground">{t(UNDER_18_COPY)}</p>
      ) : (
        <>
          {starting && !editing && <p className={SUBLINE}>{t("Starting numbers.")}</p>}
          {editing ? (
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3">
              <StepperCard id="plan-calories" label={t("Calories")} Icon={FlameIcon} value={fields.calories} onChange={(v) => setField("calories", v)} step={50} min={500} max={10000} invalid={reading.problems.includes("calories")} describedBy={MAIN_PROBLEM} large />
              <StepperCard id="plan-protein" label={t("Protein (g)")} Icon={BoltIcon} value={fields.protein} onChange={(v) => setField("protein", v)} step={5} min={5} max={1000} placeholder={t("Optional")} from={calories !== undefined ? suggestProtein(calories) : undefined} invalid={reading.problems.includes("protein")} describedBy={MAIN_PROBLEM} large />
            </div>
          ) : (
            // two side by side, one a row on the narrowest phones and at large text sizes (the cards were crushed to a letter a line at 200%, and "kcal" ran out of its card at 320 px)
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
              <BigNumber Icon={FlameIcon} value={calories !== undefined ? formatInt(calories) : "–"} unit={t("kcal")} label={t("Calories a day")} />
              <BigNumber dot="bg-protein" value={protein !== undefined ? formatInt(protein) : "–"} unit="g" label={t("Protein a day")} />
            </div>
          )}
          {/* the words for the box that is wrong, as in Settings (the meeting of 21 November 2026, Ada: the old line named a meal size this screen doesn't have) */}
          {bad && editing && (
            <p id={MAIN_PROBLEM} role="alert" className="mt-3 text-[0.9375rem] font-medium leading-snug">
              {[reading.problems.includes("calories") && t("Calories should be between 500 and 10,000."), reading.problems.includes("protein") && t("Protein should be above 0 and at most 1,000 g.")].filter(Boolean).join(" ")}
            </p>
          )}
          {!replay && editing && (
            <button type="button" onClick={done} className="mt-3 inline-flex min-h-11 items-center self-start rounded-full bg-ink px-5 text-[1rem] font-bold text-on-ink transition hover:bg-ink-pressed active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t("Save")}</button>
          )}
          {isLowCalories(fields.calories) && !notes.includes("low-calories-floor") && <p role="status" className="mt-2 text-[0.9375rem] font-medium leading-snug">{t(LOW_CALORIES_NOTE)}</p>}
          <PlanNotes notes={notes} className="mt-2" />
          {/* App Review 1.4.1: not medical advice, and where the numbers come from, one tap away */}
          <div className="mt-3 text-sm leading-snug text-muted">
            {t(SUGGESTION_NOTE)} <SourcesLink className="-my-2.5 align-baseline text-sm" />
          </div>
        </>
      )}
      {!editing && <WeekShowcase under18={under18} planLine={planLine} />}
      <RestaurantRow goal={goal} prefs={prefs} onDish={onDish} />
      <div aria-hidden className="h-4 shrink-0" />
      <FeatureFoot {...bottom} />
    </section>
  );
}
