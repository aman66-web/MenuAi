import { describe, expect, it } from "vitest";
import {
  EMPTY_BODY, bodyProblems, planFromAnswers, planKey, readTargetFields, switchHeightUnit, switchWeightUnit, targetTexts, typeHeight, typeWeight,
  type BodyAnswers, type TargetFieldTexts,
} from "../lib/mm/onboardingPlan";
import { planTargets, type Activity, type Plan, type Sex } from "../lib/mm/targets";
import { NO_PREFERENCES, type Goal, type Preferences } from "../lib/mm/types";

// The onboarding screens' pure part: what was typed (text boxes, a unit for the weight and one for the height) turned into the plan from targets.ts.

type Ok = Extract<Plan, { kind: "ok" }>;
function ok(p: Plan): Ok {
  if (p.kind !== "ok") throw new Error(`expected an ok plan, got ${p.kind}`);
  return p;
}

/** A vegan woman in stone and pounds, feet and inches. */
const imperial: BodyAnswers = {
  sex: "female", age: "34", activity: "light",
  weight: { unit: "st", major: "11", minor: "0" },
  height: { unit: "ft", major: "5", minor: "10" },
};
/** A man in kilograms and centimetres. */
const metric: BodyAnswers = {
  sex: "male", age: "47", activity: "active",
  weight: { unit: "kg", major: "83.7", minor: "" },
  height: { unit: "cm", major: "181", minor: "" },
};
const vegan: Preferences = { ...NO_PREFERENCES, veganOnly: true };
const plan = (goal: Goal, body: BodyAnswers, prefs: Preferences = NO_PREFERENCES) => planFromAnswers({ goal, prefs, body });

describe("planFromAnswers", () => {
  it("is exactly planTargets for the kilograms and centimetres the boxes hold", () => {
    expect(plan("lose", metric).plan).toEqual(planTargets({ sex: "male", age: 47, weightKg: 83.7, heightCm: 181, activity: "active", goal: "lose", diet: "none" }));
    // 11 st = 154 lb, 5 ft 10 in = 70 in
    expect(plan("lose", imperial, vegan).plan).toEqual(planTargets({ sex: "female", age: 34, weightKg: 154 * 0.45359237, heightCm: 70 * 2.54, activity: "light", goal: "lose", diet: "vegan" }));
    expect(plan("lose", imperial, vegan).problems).toEqual([]);
  });

  it("gives the same plan for the same person typed in either unit", () => {
    const converted: BodyAnswers = { ...imperial, weight: switchWeightUnit(imperial.weight, "kg"), height: switchHeightUnit(imperial.height, "cm") };
    expect(converted.weight).toMatchObject({ unit: "kg", major: "69.9" });
    expect(converted.height).toMatchObject({ unit: "cm", major: "177.8" });
    for (const goal of ["lose", "maintain", "buildMuscle", "glp1", "other"] as const) {
      expect(plan(goal, converted, vegan).plan).toEqual(plan(goal, imperial, vegan).plan);
    }
    const back: BodyAnswers = { ...metric, weight: switchWeightUnit(metric.weight, "st"), height: switchHeightUnit(metric.height, "ft") };
    expect(back.weight).toMatchObject({ unit: "st", major: "13", minor: "2.5" });
    expect(back.height).toMatchObject({ unit: "ft", major: "5", minor: "11.3" });
    expect(plan("maintain", back).plan).toEqual(plan("maintain", metric).plan);
  });

  it("vegan, vegetarian and pescatarian differ as planTargets says (a little more protein for the plant diets, a note for them)", () => {
    const none = ok(plan("maintain", imperial).plan);
    const pesc = ok(plan("maintain", imperial, { ...NO_PREFERENCES, pescatarianOnly: true }).plan);
    const veg = ok(plan("maintain", imperial, { ...NO_PREFERENCES, vegetarianOnly: true }).plan);
    const vgn = ok(plan("maintain", imperial, vegan).plan);
    expect(pesc).toEqual(none);
    expect(vgn.calories).toBe(none.calories);
    expect(vgn.protein).toBeGreaterThan(none.protein);
    expect(veg.protein).toBeGreaterThanOrEqual(none.protein);
    expect(veg.protein).toBeLessThanOrEqual(vgn.protein);
    expect(vgn.notes).toContain("plant-protein");
    expect(none.notes).not.toContain("plant-protein");
    // the strictest diet wins
    expect(plan("maintain", imperial, { ...vegan, vegetarianOnly: true, pescatarianOnly: true, halalOnly: true }).plan).toEqual(vgn);
  });

  it("GLP-1 gets the note and a suggested meal size that never goes above 450; 'other' plans exactly like 'maintain'", () => {
    const g = ok(plan("glp1", metric).plan);
    expect(g.notes).toContain("glp1");
    expect(g.glp1MealCap).toBeLessThanOrEqual(450);
    expect(ok(plan("maintain", metric).plan).glp1MealCap).toBeUndefined();
    expect(plan("other", metric).plan).toEqual(plan("maintain", metric).plan);
  });

  it("a weight typed in pounds in the kilograms box asks the person to check it, and still gives a plan", () => {
    const wrong: BodyAnswers = { ...metric, weight: { unit: "kg", major: "160", minor: "" }, height: { unit: "cm", major: "170", minor: "" } };
    const r = plan("maintain", wrong);
    expect(r.problems).toEqual([]);
    expect(ok(r.plan).notes).toContain("check-measurements");
  });

  it("a small body on a lose-weight plan gets the low-bmi note", () => {
    const small: BodyAnswers = { ...metric, sex: "female", weight: { unit: "kg", major: "47", minor: "" }, height: { unit: "cm", major: "165", minor: "" } };
    expect(ok(plan("lose", small).plan).notes).toContain("low-bmi");
    expect(ok(plan("maintain", small).plan).notes).not.toContain("low-bmi");
  });

  it("under 18 gets no numbers and no problems, whatever else was typed", () => {
    expect(plan("lose", { ...metric, age: "17" })).toEqual({ plan: { kind: "under18" }, problems: [] });
    expect(plan("lose", { ...EMPTY_BODY, age: "9" })).toEqual({ plan: { kind: "under18" }, problems: [] });
  });

  it("an age that isn't a whole number from 18 to 100, or nothing typed, is invalid with the right keys", () => {
    expect(plan("lose", { ...metric, age: "" })).toEqual({ plan: { kind: "invalid" }, problems: ["age"] });
    expect(plan("lose", { ...metric, age: "101" }).problems).toEqual(["age"]);
    expect(plan("lose", { ...metric, age: "34.5" }).problems).toEqual(["age"]);
    expect(plan("lose", { ...metric, age: "abc" }).problems).toEqual(["age"]);
    expect(plan("lose", EMPTY_BODY)).toEqual({ plan: { kind: "invalid" }, problems: ["age", "weight", "height"] });
    expect(plan("lose", { ...metric, age: "100" }).plan.kind).toBe("ok");
    expect(plan("lose", { ...metric, age: "18" }).plan.kind).toBe("ok");
  });

  it("a weight or height outside what the plan accepts is invalid", () => {
    expect(plan("lose", { ...metric, weight: { unit: "kg", major: "5", minor: "" } }).problems).toEqual(["weight"]);
    expect(plan("lose", { ...metric, weight: { unit: "kg", major: "301", minor: "" } }).problems).toEqual(["weight"]);
    expect(plan("lose", { ...metric, height: { unit: "cm", major: "99", minor: "" } }).problems).toEqual(["height"]);
    expect(plan("lose", { ...metric, height: { unit: "cm", major: "231", minor: "" } }).problems).toEqual(["height"]);
    expect(plan("lose", { ...metric, height: { unit: "cm", major: "", minor: "" } }).problems).toEqual(["height"]);
  });

  it("a part of a stone or a foot in the stone or feet box is refused with its own key, never read the wrong way", () => {
    const part: BodyAnswers = { ...imperial, weight: { unit: "st", major: "11.5", minor: "" }, height: { unit: "ft", major: "5.10", minor: "" } };
    expect(bodyProblems(part)).toEqual(["weight-part", "height-part"]);
    expect(plan("lose", part)).toEqual({ plan: { kind: "invalid" }, problems: ["weight-part", "height-part"] });
    // the same part of a foot in the inches box is fine
    expect(plan("lose", { ...imperial, height: { unit: "ft", major: "5", minor: "10.5" } }).plan.kind).toBe("ok");
    // kilograms and centimetres may have a fraction
    expect(plan("lose", { ...metric, weight: { unit: "kg", major: "83,7", minor: "" } }).plan).toEqual(plan("lose", metric).plan);
    // an empty stone box with the pounds filled in is fine (0 stone)
    expect(plan("lose", { ...imperial, weight: { unit: "st", major: "", minor: "154" } }).plan).toEqual(plan("lose", imperial).plan);
  });

  it("carries none of the typed values in what it returns (privacy: nothing about the body is kept)", () => {
    const typed: BodyAnswers = { sex: "male", age: "47", activity: "active", weight: { unit: "kg", major: "83.7", minor: "" }, height: { unit: "cm", major: "181.4", minor: "" } };
    const text = JSON.stringify(plan("lose", typed));
    for (const secret of ["83.7", "181.4", "\"47\"", "male", "active", "age", "weight", "height"]) expect(text).not.toContain(secret);
    expect(Object.keys(plan("lose", typed)).sort()).toEqual(["plan", "problems"]);
    // the problems are keys, not the typed text
    expect(JSON.stringify(plan("lose", { ...typed, weight: { unit: "kg", major: "9999", minor: "" } }))).not.toContain("9999");
  });
});

describe("the people e2e/onboarding-body.mjs types in (the numbers it expects are checked here, against the same code)", () => {
  const body = (sex: Sex, age: string, activity: Activity, weight: BodyAnswers["weight"], height: BodyAnswers["height"]): BodyAnswers => ({ sex, age, activity, weight, height });
  const A = body("female", "34", "light", { unit: "st", major: "11", minor: "0" }, { unit: "ft", major: "5", minor: "10" });
  const B = body("male", "47", "active", { unit: "kg", major: "83.7", minor: "" }, { unit: "cm", major: "183.4", minor: "" });
  const C = body("male", "47", "active", { unit: "kg", major: "160", minor: "" }, { unit: "cm", major: "170", minor: "" });
  const D = body("female", "47", "sedentary", { unit: "kg", major: "47", minor: "" }, { unit: "cm", major: "165", minor: "" });
  it("a vegan woman in stone and feet who wants to lose weight", () => {
    expect(plan("lose", A, vegan).plan).toEqual({ kind: "ok", calories: 1530, protein: 110, carbs: 160, fat: 50, notes: ["plant-protein"] });
    expect(plan("lose", A).plan).toEqual({ kind: "ok", calories: 1530, protein: 100, carbs: 170, fat: 50, notes: [] });
  });
  it("a man in kilograms and centimetres on a GLP-1 medicine", () => {
    expect(plan("glp1", B).plan).toEqual({ kind: "ok", calories: 2220, protein: 115, carbs: 270, fat: 75, glp1MealCap: 450, notes: ["glp1"] });
  });
  it("a 160 typed in the kilograms box (pounds, probably) asks for a check but still plans", () => {
    expect(plan("maintain", C).plan).toEqual({ kind: "ok", calories: 3770, protein: 190, carbs: 470, fat: 125, notes: ["check-measurements"] });
  });
  it("a small body on a lose-weight plan: the 1,200 floor and the doctor-first note", () => {
    expect(plan("lose", D).plan).toEqual({ kind: "ok", calories: 1200, protein: 65, carbs: 145, fat: 40, notes: ["low-calories-floor", "low-bmi"] });
  });
});

describe("switching a unit keeps the person's value", () => {
  it("converts stones and pounds to kilograms and back, to one decimal place", () => {
    const kg = switchWeightUnit({ unit: "st", major: "13", minor: "5" }, "kg");
    expect(kg).toMatchObject({ unit: "kg", major: "84.8", minor: "" });
    const cm = switchHeightUnit({ unit: "ft", major: "6", minor: "1" }, "cm");
    expect(cm).toMatchObject({ unit: "cm", major: "185.4", minor: "" });
  });

  it("the plan after a switch is worked out from the value that was typed, not from the rounded copy in the boxes", () => {
    // 83.7 kg shows as 13 st 2.5 lb (rounded); worked out from those boxes alone it would come to a different plan (2,700 kcal against 2,690)
    const shown = switchWeightUnit(metric.weight, "st");
    const shownHeight = switchHeightUnit(metric.height, "ft");
    expect(plan("maintain", { ...metric, weight: shown, height: shownHeight }).plan).toEqual(plan("maintain", metric).plan);
    expect(plan("maintain", { ...metric, weight: typeWeight(shown, {}), height: typeHeight(shownHeight, {}) }).plan).not.toEqual(plan("maintain", metric).plan);
  });

  it("switching straight back gives exactly what was typed, even if the conversion was rounded", () => {
    const w = switchWeightUnit(switchWeightUnit({ unit: "st", major: "11", minor: "4" }, "kg"), "st");
    expect(w).toMatchObject({ unit: "st", major: "11", minor: "4" });
    const h = switchHeightUnit(switchHeightUnit({ unit: "cm", major: "181", minor: "" }, "ft"), "cm");
    expect(h).toMatchObject({ unit: "cm", major: "181", minor: "" });
  });

  it("the plan is the same plan however many times the units were switched to and fro (the typed value is remembered through every switch)", () => {
    // 62.3 kg and 149.5 cm show as 9 st 11.3 lb and 4 ft 10.9 in; a plan worked out from those rounded boxes differs from the one for the typed values
    const typed: BodyAnswers = { sex: "male", age: "68", activity: "active", weight: { unit: "kg", major: "62.3", minor: "" }, height: { unit: "cm", major: "149.5", minor: "" } };
    const expected = plan("maintain", typed).plan;
    let w = typed.weight;
    let h = typed.height;
    for (let switches = 1; switches <= 6; switches++) {
      w = switchWeightUnit(w, switches % 2 ? "st" : "kg");
      h = switchHeightUnit(h, switches % 2 ? "ft" : "cm");
      expect(plan("maintain", { ...typed, weight: w, height: h }).plan, `after ${switches} switches`).toEqual(expected);
    }
    // and the other way round: typed in stone and feet, switched through kilograms and back several times
    const imperialTyped: BodyAnswers = { ...typed, weight: { unit: "st", major: "9", minor: "11.3" }, height: { unit: "ft", major: "4", minor: "10.9" } };
    const expectedImperial = plan("maintain", imperialTyped).plan;
    let w2 = imperialTyped.weight;
    let h2 = imperialTyped.height;
    for (let switches = 1; switches <= 6; switches++) {
      w2 = switchWeightUnit(w2, switches % 2 ? "kg" : "st");
      h2 = switchHeightUnit(h2, switches % 2 ? "cm" : "ft");
      expect(plan("maintain", { ...imperialTyped, weight: w2, height: h2 }).plan, `imperial, after ${switches} switches`).toEqual(expectedImperial);
    }
    // typing again forgets all of it
    expect(typeWeight(w, { major: "70" }).exact).toBeUndefined();
  });

  it("typing in a box forgets the remembered copy, so the next switch converts what is there now", () => {
    const kg = switchWeightUnit({ unit: "st", major: "11", minor: "4" }, "kg");
    const edited = typeWeight(kg, { major: "80" });
    expect(edited.was).toBeUndefined();
    expect(edited.exact).toBeUndefined();
    expect(switchWeightUnit(edited, "st")).toMatchObject({ unit: "st", major: "12", minor: "8.4" });
    const ft = switchHeightUnit({ unit: "cm", major: "170", minor: "" }, "ft");
    expect(typeHeight(ft, { minor: "8" }).was).toBeUndefined();
  });

  it("empty or unreadable boxes come out empty (nothing is made up); a refused part number comes back if the person switches back", () => {
    expect(switchWeightUnit({ unit: "st", major: "", minor: "" }, "kg")).toEqual({ unit: "kg", major: "", minor: "" });
    const part = switchHeightUnit({ unit: "ft", major: "5.10", minor: "" }, "cm");
    expect(part).toMatchObject({ unit: "cm", major: "", minor: "" });
    expect(switchHeightUnit(part, "ft")).toMatchObject({ unit: "ft", major: "5.10", minor: "" });
  });

  it("the same unit is no change", () => {
    const w = { unit: "kg", major: "70", minor: "" } as const;
    expect(switchWeightUnit(w, "kg")).toBe(w);
  });

  it("converts without a range check, so a typo in the wrong box is still a typo in the other (the screen says so)", () => {
    expect(switchWeightUnit({ unit: "kg", major: "5", minor: "" }, "st")).toMatchObject({ unit: "st", major: "0", minor: "11" });
  });
});

describe("the four target boxes", () => {
  const texts: TargetFieldTexts = { calories: "2400", protein: "150", carbs: "", fat: "", mealCap: "450" };
  it("reads the numbers; protein, carbs and fat may be empty (Home works them out)", () => {
    expect(readTargetFields(texts, false)).toEqual({ calories: 2400, protein: 150, mealCap: 450, problems: [] });
    expect(readTargetFields({ ...texts, protein: "", carbs: "300", fat: "70" }, false)).toEqual({ calories: 2400, carbs: 300, fat: 70, mealCap: 450, problems: [] });
  });
  it("names every box that is wrong, with the limits the screen has always had", () => {
    expect(readTargetFields({ ...texts, calories: "499" }, false).problems).toEqual(["calories"]);
    expect(readTargetFields({ ...texts, calories: "10001" }, false).problems).toEqual(["calories"]);
    expect(readTargetFields({ ...texts, calories: "" }, false).problems).toEqual(["calories"]);
    expect(readTargetFields({ ...texts, protein: "0" }, false).problems).toEqual(["protein"]);
    expect(readTargetFields({ ...texts, protein: "1001" }, false).problems).toEqual(["protein"]);
    expect(readTargetFields({ ...texts, carbs: "2001", fat: "-5" }, false).problems).toEqual(["carbs", "fat"]);
    expect(readTargetFields({ ...texts, carbs: "2000", fat: "5" }, false).problems).toEqual([]);
  });
  it("reads a box like every other number box in the app: a thousands comma, a decimal comma, other numeral systems; fractions are rounded; exponents are refused", () => {
    expect(readTargetFields({ ...texts, calories: "2,000" }, false).calories).toBe(2000);
    expect(readTargetFields({ ...texts, calories: "٢٠٠٠" }, false)).toMatchObject({ calories: 2000, problems: [] });
    expect(readTargetFields({ ...texts, calories: "2000.5" }, false).calories).toBe(2001);
    expect(readTargetFields({ ...texts, protein: "112.5", carbs: "160,4" }, false)).toMatchObject({ protein: 113, carbs: 160, problems: [] });
    expect(readTargetFields({ ...texts, calories: "1e3" }, false).problems).toEqual(["calories"]);
    expect(readTargetFields({ ...texts, protein: "0.4" }, false).problems).toEqual(["protein"]);
    expect(readTargetFields({ ...texts, calories: "abc" }, false).problems).toEqual(["calories"]);
  });
  it("the meal size only matters for the GLP-1 goal", () => {
    expect(readTargetFields({ ...texts, mealCap: "50" }, false).problems).toEqual([]);
    expect(readTargetFields({ ...texts, mealCap: "50" }, true).problems).toEqual(["mealCap"]);
    expect(readTargetFields({ ...texts, mealCap: "2001" }, true).problems).toEqual(["mealCap"]);
  });
  it("a plan fills the four boxes as text; the same numbers have the same key", () => {
    const p = ok(plan("lose", metric).plan);
    expect(targetTexts(p)).toEqual({ calories: String(p.calories), protein: String(p.protein), carbs: String(p.carbs), fat: String(p.fat) });
    expect(planKey(p)).toBe(planKey(ok(plan("lose", metric).plan)));
    expect(planKey(p)).not.toBe(planKey(ok(plan("buildMuscle", metric).plan)));
    expect(planKey(null)).toBeNull();
    expect(planKey({ kind: "under18" })).toBeNull();
    expect(planKey({ kind: "invalid" })).toBeNull();
  });
});
