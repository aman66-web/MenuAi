"use client";

import { useCallback, useRef, useState } from "react";
import { planKey, targetTexts, type TargetFieldKey, type TargetFieldTexts } from "@/lib/mm/onboardingPlan";
import type { Plan, PlanNote } from "@/lib/mm/targets";
import type { UserSettings } from "@/lib/mm/user-data";

// The text in the targets screen's boxes (calories, protein, carbs, fat and GLP-1's comfortable meal size), and the plan filling them in.

const fromSettings = (s: UserSettings): TargetFieldTexts => ({
  calories: String(s.dailyCalories),
  protein: s.dailyProtein ? String(s.dailyProtein) : "",
  carbs: s.dailyCarbs ? String(s.dailyCarbs) : "",
  fat: s.dailyFat ? String(s.dailyFat) : "",
  mealCap: String(s.glp1MealCap),
});

export function useTargetFields(initial: UserSettings) {
  const [start] = useState(() => fromSettings(initial));
  const [fields, setFields] = useState<TargetFieldTexts>(start);
  // The notes of a suggestion the person asked for on this screen ("Not sure? Suggest targets for me"), which fills the four boxes like the plan does: kept here
  // (not in the screen, which is gone when the person goes on) so they are still under the numbers after going forward and back. null = none was applied.
  const [suggestedNotes, setSuggestedNotes] = useState<PlanNote[] | null>(null);
  const lastPlan = useRef<string | null>(null);

  const setField = useCallback((key: TargetFieldKey, value: string) => setFields((f) => ({ ...f, [key]: value })), []);

  /**
   * Arriving on the targets screen with the plan for the answers just given (null when the questions were skipped, or gave no numbers). A plan fills the
   * four boxes; the same plan as last time leaves them alone, so a number the person changed by hand survives going back and forward; no plan after
   * a plan puts the boxes back as they were at the start. The meal size is never touched (it is not worked out from the plan). Skipping the targets screen
   * itself does nothing here: nothing is saved by Skip, and going Back finds the boxes as they were left.
   */
  const applyPlan = useCallback((plan: Plan | null) => {
    const key = planKey(plan);
    if (key === lastPlan.current) return;
    const had = lastPlan.current !== null;
    lastPlan.current = key;
    setSuggestedNotes(null); // new answers, new numbers: an older suggestion's notes no longer apply
    if (plan && plan.kind === "ok") setFields((f) => ({ ...f, ...targetTexts(plan) }));
    else if (had) setFields((f) => ({ ...start, mealCap: f.mealCap }));
  }, [start]);

  /** "Use these" in the suggestion form: the four boxes take the suggested numbers, and its notes stay under them. */
  const apply = useCallback((targets: { calories: string; protein: string; carbs: string; fat: string }, notes: readonly PlanNote[]) => {
    setFields((f) => ({ ...f, ...targets }));
    setSuggestedNotes([...notes]);
  }, []);

  return { fields, setField, applyPlan, apply, suggestedNotes };
}
