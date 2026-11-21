import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { changeTargetField, useTargetFields } from "../app/app/welcome/useTargetFields";
import { readTargetFields, targetTexts, type TargetFieldTexts } from "../lib/mm/onboardingPlan";
import { macroTargets, planTargets, suggestCarbFat } from "../lib/mm/targets";
import { DEFAULT_SETTINGS, type UserSettings } from "../lib/mm/user-data";

// A few lines of React's hooks, enough to call useTargetFields as a screen would, draw after draw (the unit tests have no page to draw on).
vi.mock("react", () => {
  let slots: unknown[] = [];
  let at = 0;
  return {
    useState: (init: unknown) => {
      const k = at++;
      if (!(k in slots)) slots[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [slots[k], (v: unknown) => void (slots[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(slots[k]) : v)];
    },
    useRef: (init: unknown) => {
      const k = at++;
      if (!(k in slots)) slots[k] = { current: init };
      return slots[k];
    },
    useCallback: (fn: unknown) => (at++, fn),
    draw: <T,>(f: () => T): T => ((at = 0), f()),
    forget: () => void (slots = []),
  };
});
const hooks = React as unknown as { draw: <T>(f: () => T) => T; forget: () => void };

// Your plan's "Change" shows only calories and protein (app/app/welcome/PlanStep.tsx). The meeting of 21 November 2026 (Ada): changing them kept the old plan's
// carbs and fat, hidden, and saved them beside the new calories. Carbs and fat that still follow the numbers are emptied, so they are worked out from the new
// ones; ones the person typed in Settings themselves are kept.

const plan = planTargets({ sex: "female", age: 40, weightKg: 70, heightCm: 165, activity: "light", goal: "lose", diet: "vegan" });
if (plan.kind !== "ok") throw new Error("the example plan has numbers");
const texts = targetTexts(plan);
const planned = { carbs: texts.carbs, fat: texts.fat };
const fromPlan: TargetFieldTexts = { ...texts, mealCap: "450" };

describe("Your plan's Change (calories and protein only)", () => {
  it("a new calorie figure empties the plan's carbs and fat, so they are worked out from the new numbers", () => {
    const next = changeTargetField(fromPlan, "calories", "1400", planned);
    expect(next).toEqual({ ...fromPlan, calories: "1400", carbs: "", fat: "" });
    // saved as the page saves them: carbs and fat left out, then worked out from 1,400 kcal and the protein
    const r = readTargetFields(next, false);
    expect(r.carbs).toBeUndefined();
    expect(r.fat).toBeUndefined();
    expect(macroTargets({ dailyCalories: r.calories!, dailyProtein: r.protein })).toMatchObject(suggestCarbFat(1400, Number(texts.protein)));
  });

  it("so does a new protein figure", () => {
    expect(changeTargetField(fromPlan, "protein", "150", planned)).toMatchObject({ protein: "150", carbs: "", fat: "" });
  });

  it("carbs and fat from the settings that were the worked-out split of the old numbers (to within 5 g) follow too, as in Settings", () => {
    const split = suggestCarbFat(2000, 120);
    const saved: TargetFieldTexts = { calories: "2000", protein: "120", carbs: String(split.carbs + 5), fat: String(split.fat), mealCap: "450" };
    expect(changeTargetField(saved, "calories", "1800", null)).toMatchObject({ calories: "1800", carbs: "", fat: "" });
  });

  it("carbs and fat the person typed in Settings themselves are kept", () => {
    const typed: TargetFieldTexts = { calories: "2000", protein: "120", carbs: "90", fat: "110", mealCap: "450" };
    expect(changeTargetField(typed, "calories", "1800", null)).toEqual({ ...typed, calories: "1800" });
  });

  it("empty carbs and fat stay empty, and a change to carbs, fat or the meal size touches nothing else", () => {
    const empty: TargetFieldTexts = { calories: "2000", protein: "", carbs: "", fat: "", mealCap: "450" };
    expect(changeTargetField(empty, "calories", "2100", null)).toEqual({ ...empty, calories: "2100" });
    expect(changeTargetField(fromPlan, "carbs", "200", planned)).toEqual({ ...fromPlan, carbs: "200" });
    expect(changeTargetField(fromPlan, "mealCap", "400", planned)).toEqual({ ...fromPlan, mealCap: "400" });
  });

  it("a calorie box being typed (not a number yet) still empties the plan's own carbs and fat", () => {
    const halfTyped = { ...fromPlan, calories: "" };
    expect(changeTargetField(halfTyped, "calories", "1", planned)).toMatchObject({ calories: "1", carbs: "", fat: "" });
  });
});

// The meeting of 21 November 2026 (Ada): what the boxes held on arrival was fixed at the first draw, so after a sign-in that emptied the phone (or "Start again")
// the previous person's targets came back on a skip and the default 2,000 kcal counted as a change made by hand.
describe("the boxes on arrival follow resetTo", () => {
  const previous: UserSettings = { ...DEFAULT_SETTINGS, dailyCalories: 1650, dailyProtein: 130, dailyCarbs: 150, dailyFat: 55, hasSetTargets: true };
  /** The screen's one call of the hook, opened with the previous person's settings. */
  function useBoxes() {
    return useTargetFields(previous);
  }
  const use = () => hooks.draw(useBoxes);

  it("resetTo sets what the boxes count as on arrival, so the new settings' numbers are not a change, and no plan after a plan puts those back", () => {
    hooks.forget();
    let t = use();
    expect(t.start.calories).toBe("1650");
    t.resetTo(DEFAULT_SETTINGS); // "Start again", or a sign-in that emptied the phone
    t = use();
    expect(t.start).toEqual(t.fields);
    expect(t.start).toMatchObject({ calories: String(DEFAULT_SETTINGS.dailyCalories), protein: "", carbs: "", fat: "" });
    // the questions answered, then skipped: the boxes go back to the new start, never to the previous person's numbers
    t.applyPlan(plan);
    t = use();
    expect(t.fields.calories).toBe(texts.calories);
    t.applyPlan(null);
    t = use();
    expect(t.fields).toEqual(t.start);
    expect(t.fields.calories).toBe(String(DEFAULT_SETTINGS.dailyCalories));
  });

  it("after resetTo, a change of calories on Your plan no longer treats the previous plan's carbs and fat as following", () => {
    hooks.forget();
    let t = use();
    t.applyPlan(plan);
    t = use();
    t.resetTo({ ...previous, dailyCarbs: Number(texts.carbs), dailyFat: Number(texts.fat), dailyCalories: 2500, dailyProtein: 100 });
    t = use();
    t.setField("calories", "2400");
    t = use();
    // typed in Settings (not the split of 2,500 kcal and 100 g), so kept
    expect(t.fields).toMatchObject({ calories: "2400", carbs: texts.carbs, fat: texts.fat });
  });
});
