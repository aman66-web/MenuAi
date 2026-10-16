"use client";

import { useState } from "react";
import { EMPTY_BODY, planFromAnswers, targetTexts, type AnswersPlan, type BodyAnswers } from "@/lib/mm/onboardingPlan";
import { UNDER_18_COPY, type PlanNote } from "@/lib/mm/targets";
import type { Goal, Preferences } from "@/lib/mm/types";
import { formatInt } from "@/lib/mm/format";
import { useT } from "../_lib/i18n";
import { ActivityTiles, AgeField, BodyPrivacyNote, HeightField, PlanNotes, SexTiles, WeightField } from "./BodyFields";
import { Button } from "./ui";

// SPEC §6.2: the suggestion from Mifflin-St Jeor, now for all four targets (founder 2026-10-16) and in the units people use here: kilograms or stone and pounds,
// centimetres or feet and inches. It is the single-screen version of the onboarding's three questions (sex and age, height and weight, how active), made of the
// same fields, and works out the same numbers with the same code (planFromAnswers). Both hosts, Settings and onboarding (for a person who skipped the
// questions), print "Suggested starting points, not medical advice." right under this form, so the result tile doesn't repeat it.
//
// PRIVACY (CLAUDE.md rule 4): what is typed lives in this form's state only; it is used once and never stored or sent.

export interface SuggestedTargets { calories: string; protein: string; carbs: string; fat: string }

/**
 * "Use these" removes the form, and the button the person pressed with it, so the focus would fall to the top of the page. The host calls this after it has
 * filled its boxes to put the focus on the first box (calories) instead, scrolled into view, where the numbers now are.
 */
export function focusTargetBox(selector: string) {
  window.requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "auto" });
  });
}

/** `onApply` gets the four numbers as text for the boxes and the plan's notes (a caution about the measurements, the 1,200 floor...) to show under them. */
export function TargetSuggestForm({ goal, preferences, onApply }: { goal: Goal; preferences: Preferences; onApply: (targets: SuggestedTargets, notes: readonly PlanNote[]) => void }) {
  const t = useT();
  const [body, setBody] = useState<BodyAnswers>(EMPTY_BODY);
  const [result, setResult] = useState<AnswersPlan | null>(null);
  // Any change to an answer takes the old result away, so the numbers shown are always for the answers shown.
  const change = (patch: Partial<BodyAnswers>) => {
    setBody((b) => ({ ...b, ...patch }));
    setResult(null);
  };
  const plan = result?.plan;

  return (
    <form
      // A white card on the page (onboarding). Inside a card already (Settings › Daily targets) it melts into that card instead of
      // stacking a card on a card: no fill, padding or shadow of its own, just a hairline above it so it reads as the next step, and
      // its tiles, inputs and buttons take the light grey fill.
      className="glass space-y-5 rounded-[1.25rem] p-4 [.glass_&]:rounded-none [.glass_&]:border-t-line [.glass_&]:bg-transparent [.glass_&]:px-0 [.glass_&]:pb-0 [.glass_&]:pt-5 [.glass_&]:shadow-none"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(planFromAnswers({ goal, prefs: preferences, body }));
      }}
    >
      <SexTiles value={body.sex} onChange={(sex) => change({ sex })} />
      <AgeField value={body.age} onChange={(age) => change({ age })} />
      <WeightField value={body.weight} onChange={(weight) => change({ weight })} />
      <HeightField value={body.height} onChange={(height) => change({ height })} />
      <ActivityTiles compact value={body.activity} onChange={(activity) => change({ activity })} />
      <BodyPrivacyNote />
      <Button type="submit" variant="secondary" full>{t("Suggest targets")}</Button>

      {plan?.kind === "under18" && <p role="status" className="text-[0.9375rem] font-medium leading-snug">{t(UNDER_18_COPY)}</p>}
      {plan?.kind === "invalid" && <p role="alert" className="text-[0.9375rem] leading-snug text-muted">{t("Enter an age from 18 to 100, your weight and your height.")}</p>}
      {plan?.kind === "ok" && (
        <div role="status" className="tile rounded-[1.25rem] p-4">
          {/* the four figures like Home's: a big number in a regular weight, its unit small and muted under it */}
          <div className="app-numbers grid grid-cols-2 gap-x-4 gap-y-5">
            <Figure value={formatInt(plan.calories)} unit="kcal" />
            <Figure value={`${plan.protein}g`} unit={t("protein")} />
            <Figure value={`${plan.carbs}g`} unit={t("carbs")} />
            <Figure value={`${plan.fat}g`} unit={t("fat")} />
          </div>
          <PlanNotes notes={plan.notes} className="mt-4" />
          <Button full className="mt-5" onClick={() => onApply(targetTexts(plan), plan.notes)}>{t("Use these")}</Button>
        </div>
      )}
    </form>
  );
}

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <p className="min-w-0">
      <span className="block text-[2rem] font-normal leading-none tracking-[-0.02em]">{value}</span>
      <span className="mt-2 block text-[0.9375rem] leading-snug text-muted">{unit}</span>
    </p>
  );
}
