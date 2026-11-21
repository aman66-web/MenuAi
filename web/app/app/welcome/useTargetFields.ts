"use client";

import { useCallback, useRef, useState } from "react";
import { parseNumber } from "../../../lib/mm/addFood";
import { planKey, targetTexts, type TargetFieldKey, type TargetFieldTexts } from "../../../lib/mm/onboardingPlan";
import { suggestCarbFat, type Plan, type PlanNote } from "../../../lib/mm/targets";
import type { UserSettings } from "../../../lib/mm/user-data";

// The text in the targets screen's boxes (calories, protein, carbs, fat and GLP-1's comfortable meal size), and the plan filling them in. Relative imports (not
// "@/"), so the unit tests can load changeTargetField (tests/welcomeTargets.test.ts).

const fromSettings = (s: UserSettings): TargetFieldTexts => ({
  calories: String(s.dailyCalories),
  protein: s.dailyProtein ? String(s.dailyProtein) : "",
  carbs: s.dailyCarbs ? String(s.dailyCarbs) : "",
  fat: s.dailyFat ? String(s.dailyFat) : "",
  mealCap: String(s.glp1MealCap),
});

/** A box's number, or undefined when it is empty or not a number. */
const boxNumber = (text: string): number | undefined => {
  const n = parseNumber(text);
  return typeof n === "number" ? n : undefined;
};

/**
 * The boxes after one of them changes. Your plan shows only calories and protein, so when either changes, carbs and fat that still follow them (the figures
 * the plan put in, or the worked-out split of the old calories and protein to within 5 g, the same test as Settings' followCalories) are emptied: saved empty,
 * they are worked out from the new numbers (lib/mm/targets.ts macroTargets). Carbs and fat the person typed in Settings themselves are kept. (The meeting of 21
 * November 2026, Ada: "Change" kept the old plan's hidden carbs and fat.)
 */
export function changeTargetField(f: TargetFieldTexts, key: TargetFieldKey, value: string, planned: { carbs: string; fat: string } | null): TargetFieldTexts {
  const next: TargetFieldTexts = { ...f, [key]: value };
  if ((key !== "calories" && key !== "protein") || f[key] === value) return next;
  const oldCalories = boxNumber(f.calories);
  const was = oldCalories !== undefined ? suggestCarbFat(oldCalories, boxNumber(f.protein)) : null;
  for (const k of ["carbs", "fat"] as const) {
    const n = boxNumber(f[k]);
    if (n === undefined) continue;
    if ((planned !== null && f[k].trim() === planned[k]) || (was !== null && Math.abs(n - was[k]) <= 5)) next[k] = "";
  }
  return next;
}

export function useTargetFields(initial: UserSettings) {
  // what the boxes held on arrival (the saved targets): state, so a sign-in that empties the phone or "Start again" can set it again (resetTo)
  const [start, setStart] = useState(() => fromSettings(initial));
  const [fields, setFields] = useState<TargetFieldTexts>(start);
  // The notes of a suggestion the person asked for on this screen ("Not sure? Suggest targets for me"), which fills the four boxes like the plan does: kept here
  // (not in the screen, which is gone when the person goes on) so they are still under the numbers after going forward and back. null = none was applied.
  const [suggestedNotes, setSuggestedNotes] = useState<PlanNote[] | null>(null);
  const lastPlan = useRef<string | null>(null);
  // the carbs and fat the last plan or suggestion put in the boxes (null = none did): they follow a change of calories or protein (changeTargetField)
  const planned = useRef<{ carbs: string; fat: string } | null>(null);

  const setField = useCallback((key: TargetFieldKey, value: string) => setFields((f) => changeTargetField(f, key, value, planned.current)), []);

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
    if (plan && plan.kind === "ok") {
      const texts = targetTexts(plan);
      planned.current = { carbs: texts.carbs, fat: texts.fat };
      setFields((f) => ({ ...f, ...texts }));
    } else if (had) {
      planned.current = null;
      setFields((f) => ({ ...start, mealCap: f.mealCap }));
    }
  }, [start]);

  /** "Use these" in the suggestion form: the four boxes take the suggested numbers, and its notes stay under them. */
  const apply = useCallback((targets: { calories: string; protein: string; carbs: string; fat: string }, notes: readonly PlanNote[]) => {
    planned.current = { carbs: targets.carbs, fat: targets.fat };
    setFields((f) => ({ ...f, ...targets }));
    setSuggestedNotes([...notes]);
  }, []);

  /** The cover's "Start again", or a sign-in that emptied the phone: the boxes, and what they count as on arrival, as these settings have them, with no plan or
   *  suggestion behind them. */
  const resetTo = useCallback((s: UserSettings) => {
    lastPlan.current = null;
    planned.current = null;
    setSuggestedNotes(null);
    const texts = fromSettings(s);
    setStart(texts);
    setFields(texts);
  }, []);

  // `start` is what the boxes held on arrival (the saved targets), so the page can tell whether the person changed a box
  return { fields, setField, applyPlan, apply, resetTo, suggestedNotes, start };
}
