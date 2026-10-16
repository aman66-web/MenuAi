import { describe, expect, it } from "vitest";
import { DEFAULT_GLP1_MEAL_CAP } from "../lib/mm/budget";
import { CM_PER_INCH, KG_PER_LB, bmi, inchesToCm, lbToKg } from "../lib/mm/bodyUnits";
import { englishT } from "../lib/mm/i18n";
import { NO_PREFERENCES } from "../lib/mm/types";
import type { Goal } from "../lib/mm/types";
import {
  ACTIVITY_FACTOR, CALORIE_ADJUSTMENT, CHECK_BMI_MAX, CHECK_BMI_MIN, DIET_PROTEIN_FACTOR, GLP1_NOTE, GLP1_MEAL_CAP_MAX, GLP1_MEAL_CAP_MIN, GLP1_MEAL_CAP_STEP,
  LOW_BMI, MIN_CARB_SHARE, MIN_FAT_SHARE, MIN_SUGGESTED_CALORIES, PLAN_NOTE_COPY, PROTEIN_PER_KG, PROTEIN_SHARE_MAX, PROTEIN_SHARE_MIN, SEX_OFFSET, dietKindFrom,
  measurementsLookOff, planNoteText, planTargets, splitFatCarbs, suggestCarbFat, suggestGlp1MealCap, suggestTargets,
  type Activity, type DietKind, type Plan, type PlanInput, type PlanNote, type Sex,
} from "../lib/mm/targets";

// planTargets: every target pre-filled from the person's answers. Calories are suggestTargets' calories; protein is per kg for the goal x a small diet
// factor, kept between 15% and 35% of the calories; fat and carbs share what is left; GLP-1 also gets a comfortable meal size to start from.

type Ok = Extract<Plan, { kind: "ok" }>;
function ok(p: Plan): Ok {
  if (p.kind !== "ok") throw new Error(`expected an ok plan, got ${p.kind}`);
  return p;
}

const SEXES: Sex[] = ["male", "female", "unspecified"];
const AGES = [18, 30, 55, 80, 100];
const WEIGHTS = [45, 70, 100, 160];
const HEIGHTS = [150, 170, 190];
const ACTIVITIES: Activity[] = ["sedentary", "light", "active", "veryActive"];
const GOALS: Goal[] = ["lose", "maintain", "buildMuscle", "glp1", "other"];
const DIETS: DietKind[] = ["none", "pescatarian", "vegetarian", "vegan"];

interface Cell { input: PlanInput; plan: Ok; suggested: { calories: number; protein: number } }

/**
 * The grid. suggestTargets takes pounds and feet-inches, so each person's kilograms and centimetres are turned into pounds and inches first, and the
 * plan is given the kilograms and centimetres those turn back into (the very floats suggestTargets works from). Without that, a person whose
 * calories land exactly on a rounding tie (for example 2,035 kcal) can differ by 10 kcal through floating-point noise alone.
 */
function* grid(): Generator<Cell> {
  for (const sex of SEXES) for (const age of AGES) for (const kg of WEIGHTS) for (const cm of HEIGHTS) for (const activity of ACTIVITIES) for (const goal of GOALS) {
    const weightLb = kg / KG_PER_LB;
    const heightIn = cm / CM_PER_INCH;
    const s = suggestTargets({ sex, age, weightLb, heightFt: 0, heightIn, activity, goal });
    if (s.kind !== "ok") throw new Error("the grid is inside suggestTargets' ranges");
    const input: PlanInput = { sex, age, weightKg: weightLb * KG_PER_LB, heightCm: heightIn * CM_PER_INCH, activity, goal };
    yield { input, plan: ok(planTargets(input)), suggested: { calories: s.calories, protein: s.protein } };
  }
}

// Exact integer tests of "x% of the calories" (calories are whole numbers and protein a multiple of 5, so these have no rounding noise).
const proteinShareAtLeast = (protein: number, calories: number, percent: number): boolean => protein * 400 >= calories * percent;
const proteinShareAtMost = (protein: number, calories: number, percent: number): boolean => protein * 400 <= calories * percent;
/** The smallest and largest multiples of 5 g inside 15%..35% of the calories, found by counting up. */
function proteinBounds(calories: number): { lo: number; hi: number } {
  let lo = 0;
  while (!proteinShareAtLeast(lo, calories, 15)) lo += 5;
  let hi = lo;
  while (proteinShareAtMost(hi + 5, calories, 35)) hi += 5;
  return { lo, hi };
}

const base: PlanInput = { sex: "male", age: 30, weightKg: 70, heightCm: 175, activity: "active", goal: "lose" };

describe("constants", () => {
  it("are the starting points proposed on 2026-10-16 (not yet approved by the founder: change them only with a yes, rule 8)", () => {
    expect(DIET_PROTEIN_FACTOR).toEqual({ vegan: 1.1, vegetarian: 1.05, pescatarian: 1, none: 1 });
    expect(PROTEIN_SHARE_MIN).toBe(0.15);
    expect(PROTEIN_SHARE_MAX).toBe(0.35);
    expect(MIN_CARB_SHARE).toBe(0.2);
    expect(MIN_FAT_SHARE).toBe(0.2);
    expect([GLP1_MEAL_CAP_MIN, GLP1_MEAL_CAP_MAX, GLP1_MEAL_CAP_STEP]).toEqual([300, 450, 50]);
    expect([LOW_BMI, CHECK_BMI_MIN, CHECK_BMI_MAX]).toEqual([18.5, 15, 50]);
  });
  it("the pre-filled GLP-1 meal size never goes above the app's default of 450 (SPEC §8 step 2), which is the budget's own default", () => {
    expect(GLP1_MEAL_CAP_MAX).toBe(DEFAULT_GLP1_MEAL_CAP);
    expect(DEFAULT_GLP1_MEAL_CAP).toBe(450);
  });
  it("the existing per-goal figures are unchanged and exported", () => {
    expect(CALORIE_ADJUSTMENT).toEqual({ lose: -500, maintain: 0, buildMuscle: 250, glp1: -500, other: 0 });
    expect(PROTEIN_PER_KG).toEqual({ lose: 1.4, maintain: 1.2, buildMuscle: 1.6, glp1: 1.4, other: 1.2 });
    expect(ACTIVITY_FACTOR).toEqual({ sedentary: 1.2, light: 1.375, active: 1.55, veryActive: 1.725 });
  });
});

describe("planTargets against suggestTargets (SPEC §6.2)", () => {
  it("gives the four SPEC test vectors' calories and protein, with the weight and height written in pounds and inches", () => {
    const vectors: Array<[PlanInput, number, number]> = [
      [{ sex: "male", age: 30, weightKg: lbToKg(180), heightCm: inchesToCm(70), activity: "active", goal: "lose" }, 2260, 115],
      [{ sex: "female", age: 42, weightKg: lbToKg(150), heightCm: inchesToCm(64), activity: "light", goal: "glp1" }, 1320, 95],
      [{ sex: "unspecified", age: 25, weightKg: lbToKg(200), heightCm: inchesToCm(73), activity: "veryActive", goal: "buildMuscle" }, 3460, 145],
      [{ sex: "female", age: 70, weightKg: lbToKg(110), heightCm: inchesToCm(60), activity: "sedentary", goal: "lose" }, 1200, 70],
    ];
    for (const [input, calories, protein] of vectors) {
      const p = ok(planTargets(input));
      expect([p.calories, p.protein]).toEqual([calories, protein]);
    }
  });

  it("has the same calories as suggestTargets for every person in the grid, and the same protein unless the 15%..35% limit moved it", () => {
    let n = 0, same = 0, raised = 0, lowered = 0, floored = 0;
    for (const { input, plan, suggested } of grid()) {
      n++;
      expect(plan.calories, JSON.stringify(input)).toBe(suggested.calories);
      const { lo, hi } = proteinBounds(plan.calories);
      if (suggested.protein >= lo && suggested.protein <= hi) {
        expect(plan.protein, JSON.stringify(input)).toBe(suggested.protein);
        same++;
      } else if (suggested.protein < lo) {
        expect(plan.protein, JSON.stringify(input)).toBe(lo);
        raised++;
      } else {
        expect(plan.protein, JSON.stringify(input)).toBe(hi);
        lowered++;
      }
      if (plan.notes.includes("low-calories-floor")) floored++;
    }
    expect(n).toBe(3 * 5 * 4 * 3 * 4 * 5);
    // the grid really exercises all four cases
    expect(same).toBeGreaterThan(1000);
    expect(raised).toBeGreaterThan(50);
    expect(lowered).toBeGreaterThan(5);
    expect(floored).toBeGreaterThan(50);
  });

  it("with plain metric inputs the calories are suggestTargets' to within one rounding step (10 kcal), the difference being floating-point ties", () => {
    for (const sex of SEXES) for (const age of AGES) for (const kg of WEIGHTS) for (const cm of HEIGHTS) for (const activity of ACTIVITIES) for (const goal of GOALS) {
      const s = suggestTargets({ sex, age, weightLb: kg / KG_PER_LB, heightFt: 0, heightIn: cm / CM_PER_INCH, activity, goal });
      const p = ok(planTargets({ sex, age, weightKg: kg, heightCm: cm, activity, goal }));
      if (s.kind !== "ok") throw new Error("unreachable");
      expect(Math.abs(p.calories - s.calories)).toBeLessThanOrEqual(10);
    }
  });

  it("fat and carbs are the existing suggestCarbFat of the plan's own calories and protein", () => {
    for (const { plan } of grid()) {
      expect({ carbs: plan.carbs, fat: plan.fat }).toEqual(suggestCarbFat(plan.calories, plan.protein));
    }
  });
});

describe("planTargets output is plausible for everyone in the grid", () => {
  it("calories 1,200 to 5,000, protein 40 to 300 g, carbs and fat above zero, whole multiples of 5 g and 10 kcal", () => {
    for (const { input, plan } of grid()) {
      const label = JSON.stringify(input);
      expect(plan.calories, label).toBeGreaterThanOrEqual(1200);
      expect(plan.calories, label).toBeLessThanOrEqual(5000);
      expect(plan.calories % 10, label).toBe(0);
      expect(plan.protein, label).toBeGreaterThanOrEqual(40);
      expect(plan.protein, label).toBeLessThanOrEqual(300);
      expect(plan.carbs, label).toBeGreaterThan(0);
      expect(plan.fat, label).toBeGreaterThan(0);
      for (const g of [plan.protein, plan.carbs, plan.fat]) expect(g % 5, label).toBe(0);
    }
  });

  it("4 kcal x protein + 4 x carbs + 9 x fat is the calories to within 10 kcal (carbs take what rounding leaves: half of 5 g x 4)", () => {
    for (const { input, plan } of grid()) {
      const total = plan.protein * 4 + plan.carbs * 4 + plan.fat * 9;
      expect(Math.abs(total - plan.calories), JSON.stringify(input)).toBeLessThanOrEqual(10);
    }
  });

  it("protein is always 15% to 35% of the calories, fat at least 20%, carbs at least 30% (so the 20% carb floor is never reached from here)", () => {
    for (const { input, plan } of grid()) {
      const label = JSON.stringify(input);
      expect(proteinShareAtLeast(plan.protein, plan.calories, 15), label).toBe(true);
      expect(proteinShareAtMost(plan.protein, plan.calories, 35), label).toBe(true);
      expect(plan.fat * 9 * 100 >= plan.calories * 20, label).toBe(true);
      expect(plan.carbs * 4 * 100 >= plan.calories * 30, label).toBe(true);
    }
  });

  it("a note 'low-calories-floor' appears exactly when the 1,200 floor raised the calories, 'glp1' only for GLP-1, 'plant-protein' never without a plant-based diet", () => {
    let floored = 0;
    for (const { input, plan } of grid()) {
      const label = JSON.stringify(input);
      // the calories before the floor, worked out here the way SPEC §6.2 says
      const tdee = (10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + SEX_OFFSET[input.sex]) * ACTIVITY_FACTOR[input.activity];
      const beforeTheFloor = Math.floor((tdee + CALORIE_ADJUSTMENT[input.goal]) / 10 + 0.5) * 10;
      expect(plan.notes.includes("low-calories-floor"), label).toBe(beforeTheFloor < MIN_SUGGESTED_CALORIES);
      if (beforeTheFloor < MIN_SUGGESTED_CALORIES) floored++;
      if (plan.notes.includes("low-calories-floor")) expect(plan.calories, label).toBe(MIN_SUGGESTED_CALORIES);
      expect(plan.notes.includes("glp1"), label).toBe(input.goal === "glp1");
      expect(plan.notes.includes("plant-protein"), label).toBe(false);
      expect(plan.glp1MealCap !== undefined, label).toBe(input.goal === "glp1");
    }
    expect(floored).toBeGreaterThan(50);
  });

  it("someone whose calories come to exactly 1,200 without the floor gets no floor note (the note is for people it raised)", () => {
    // 60-year-old woman, 49 kg, 155 cm, mostly sitting, maintaining: (490 + 968.75 - 300 - 161) x 1.2 = 1,197.3 -> 1,200
    const p = ok(planTargets({ sex: "female", age: 60, weightKg: 49, heightCm: 155, activity: "sedentary", goal: "maintain" }));
    expect(p).toEqual({ kind: "ok", calories: 1200, protein: 60, carbs: 150, fat: 40, notes: [] });
  });
});

describe("the diet", () => {
  it("scales protein per kg: 70 kg losing weight (98 g) is 100 g, 105 g or 110 g by diet", () => {
    // 70 x 1.4 = 98; x 1.05 = 102.9; x 1.1 = 107.8; calories 2,060 so the 15%..35% limits (75..175 g) don't bite
    const by = (diet: DietKind) => ok(planTargets({ ...base, diet }));
    expect(by("none").calories).toBe(2060);
    expect(by("none").protein).toBe(100);
    expect(by("pescatarian").protein).toBe(100);
    expect(by("vegetarian").protein).toBe(105);
    expect(by("vegan").protein).toBe(110);
    expect(ok(planTargets(base)).protein).toBe(100);
    expect(ok(planTargets({ ...base, diet: undefined })).protein).toBe(100);
  });

  it("never changes the calories, never lowers protein, and orders none = pescatarian <= vegetarian <= vegan across the grid", () => {
    for (const { input, plan } of grid()) {
      const label = JSON.stringify(input);
      const byDiet = Object.fromEntries(DIETS.map((diet) => [diet, ok(planTargets({ ...input, diet }))])) as Record<DietKind, Ok>;
      for (const diet of DIETS) expect(byDiet[diet].calories, label).toBe(plan.calories);
      expect(byDiet.none.protein, label).toBe(plan.protein);
      expect(byDiet.pescatarian.protein, label).toBe(byDiet.none.protein);
      expect(byDiet.vegetarian.protein, label).toBeGreaterThanOrEqual(byDiet.pescatarian.protein);
      expect(byDiet.vegan.protein, label).toBeGreaterThanOrEqual(byDiet.vegetarian.protein);
      // the 15%..35% limit still holds with a diet
      for (const diet of DIETS) {
        expect(proteinShareAtLeast(byDiet[diet].protein, plan.calories, 15), label).toBe(true);
        expect(proteinShareAtMost(byDiet[diet].protein, plan.calories, 35), label).toBe(true);
      }
    }
  });

  it("adds the 'plant-protein' note exactly when the diet changed the protein (not when the limit made no difference)", () => {
    let withNote = 0, limitOnly = 0;
    for (const { input } of grid()) {
      const none = ok(planTargets({ ...input, diet: "none" }));
      for (const diet of DIETS) {
        const d = ok(planTargets({ ...input, diet }));
        const changed = d.protein !== none.protein;
        expect(d.notes.includes("plant-protein"), `${JSON.stringify(input)} ${diet}`).toBe(changed);
        if (changed) withNote++;
        else if (diet === "vegan") limitOnly++;
      }
    }
    expect(withNote).toBeGreaterThan(500);
    expect(limitOnly).toBeGreaterThan(50); // a vegan whose protein the 15% or 35% limit had already fixed
  });

  it("a vegan's protein is still held to 35% of the calories", () => {
    // 38-year-old woman, 82 kg, 1,260 kcal GLP-1: 82 x 1.4 x 1.1 = 126 g, but 35% of 1,260 kcal is 110 g
    const p = ok(planTargets({ sex: "female", age: 38, weightKg: 82, heightCm: 160, activity: "sedentary", goal: "glp1", diet: "vegan" }));
    expect(p.calories).toBe(1260);
    expect(p.protein).toBe(110);
    expect(p.notes).toEqual(["glp1"]);
  });
});

describe("dietKindFrom (the strictest preference wins)", () => {
  it("maps the app's preferences", () => {
    expect(dietKindFrom(NO_PREFERENCES)).toBe("none");
    expect(dietKindFrom({})).toBe("none");
    expect(dietKindFrom(undefined)).toBe("none");
    expect(dietKindFrom(null)).toBe("none");
    expect(dietKindFrom({ ...NO_PREFERENCES, pescatarianOnly: true })).toBe("pescatarian");
    expect(dietKindFrom({ ...NO_PREFERENCES, vegetarianOnly: true })).toBe("vegetarian");
    expect(dietKindFrom({ ...NO_PREFERENCES, veganOnly: true })).toBe("vegan");
  });
  it("vegan beats vegetarian beats pescatarian", () => {
    expect(dietKindFrom({ vegetarianOnly: true, pescatarianOnly: true })).toBe("vegetarian");
    expect(dietKindFrom({ veganOnly: true, vegetarianOnly: true })).toBe("vegan");
    expect(dietKindFrom({ veganOnly: true, vegetarianOnly: true, pescatarianOnly: true })).toBe("vegan");
    expect(dietKindFrom({ veganOnly: true, pescatarianOnly: true })).toBe("vegan");
  });
  it("false and unrelated preferences count for nothing (halal, pork and beef don't change the macros)", () => {
    expect(dietKindFrom({ vegetarianOnly: false, veganOnly: false, pescatarianOnly: false })).toBe("none");
    expect(dietKindFrom({ ...NO_PREFERENCES, noPork: true, noBeef: true, halalOnly: true, avoidAllergens: ["milk"] })).toBe("none");
  });
});

describe("fat and carbs (splitFatCarbs)", () => {
  it("equals suggestCarbFat wherever the carb floor doesn't bite (every calorie level, protein from 15% to 35%)", () => {
    for (let calories = 1200; calories <= 5000; calories += 10) {
      const { lo, hi } = proteinBounds(calories);
      for (let protein = lo; protein <= hi; protein += 5) {
        expect(splitFatCarbs(calories, protein), `${calories} kcal, ${protein} g`).toEqual(suggestCarbFat(calories, protein));
      }
    }
  });

  it("fat is 30% of calories at 9 kcal a gram and carbs the rest at 4 (2,000 kcal, 120 g: 65 g fat, 235 g carbs)", () => {
    expect(splitFatCarbs(2000, 120)).toEqual({ fat: 65, carbs: 235 });
    expect(splitFatCarbs(2800, 180)).toEqual({ fat: 95, carbs: 305 });
  });

  it("the carb floor: when protein would leave carbs under 20% of the calories, fat is lowered to keep them there", () => {
    // 2,000 kcal, 275 g protein (55%): 30% fat would leave carbs at 15%; fat comes down to 25% (55 g) and carbs are 20% (100 g)
    const normal = suggestCarbFat(2000, 275);
    expect(normal).toEqual({ carbs: 80, fat: 65 });
    const floored = splitFatCarbs(2000, 275);
    expect(floored).toEqual({ carbs: 100, fat: 55 });
    expect(floored.fat).toBeLessThan(normal.fat);
    expect(floored.carbs).toBeGreaterThan(normal.carbs);
    expect(floored.carbs * 4 * 100).toBeGreaterThanOrEqual(2000 * MIN_CARB_SHARE * 100);
  });

  it("the carb floor survives the 5 g rounding of fat: 1,350 kcal and 174 g protein once gave 45 g fat and only 17.8% carbs", () => {
    // 30% fat would be 405 kcal (45 g); the carbs allow at most 384 kcal of fat (42.7 g), which rounds DOWN to 40 g, not back up to 45 g
    expect(splitFatCarbs(1350, 174)).toEqual({ fat: 40, carbs: 75 });
    expect(75 * 4).toBeGreaterThanOrEqual(1350 * MIN_CARB_SHARE);
  });

  it("whenever the least fat leaves room, the carbs are at least 20% of the calories to within their own rounding (10 kcal), for every calorie level and protein", () => {
    let held = 0, fatFirst = 0;
    for (let calories = 1200; calories <= 5000; calories += 10) {
      const leastFat = Math.ceil((calories * MIN_FAT_SHARE) / 9 / 5 - 1e-9) * 5;
      for (let protein = 0; protein <= 1000; protein += 5) {
        const { fat, carbs } = splitFatCarbs(calories, protein);
        const label = `${calories} kcal, ${protein} g protein -> ${fat} g fat, ${carbs} g carbs`;
        expect(fat, label).toBeGreaterThanOrEqual(leastFat);
        if (calories - protein * 4 - leastFat * 9 >= calories * MIN_CARB_SHARE) {
          expect(carbs * 4, label).toBeGreaterThanOrEqual(calories * MIN_CARB_SHARE - 10 - 1e-9);
          held++;
        } else {
          expect(fat, label).toBe(leastFat); // protein so high that the fat floor wins
          fatFirst++;
        }
      }
    }
    expect(held).toBeGreaterThan(10000);
    expect(fatFirst).toBeGreaterThan(1000);
  });

  it("fat never goes below 20% of the calories, even when that leaves no room for carbs; carbs never go below 0", () => {
    // 2,000 kcal, 400 g protein (80%): 20% fat (44.4 g, rounded up to 45) is the least; carbs would be negative
    expect(splitFatCarbs(2000, 400)).toEqual({ fat: 45, carbs: 0 });
    expect(splitFatCarbs(2000, 500)).toEqual({ fat: 45, carbs: 0 });
    for (let calories = 1200; calories <= 5000; calories += 50) {
      for (let protein = 0; protein <= 1200; protein += 25) {
        const { fat, carbs } = splitFatCarbs(calories, protein);
        expect(fat * 9, `${calories}/${protein}`).toBeGreaterThanOrEqual(calories * MIN_FAT_SHARE);
        expect(carbs, `${calories}/${protein}`).toBeGreaterThanOrEqual(0);
        expect(fat % 5).toBe(0);
        expect(carbs % 5).toBe(0);
      }
    }
  });

  it("with no protein it is the plain 30% fat and the rest carbs (unlike suggestCarbFat, 0 means none, not 20%), and nonsense gives zeros", () => {
    expect(splitFatCarbs(2000, 0)).toEqual({ fat: 65, carbs: 355 }); // (2,000 - 585) / 4 = 353.75
    expect(splitFatCarbs(Number.NaN, 100)).toEqual({ fat: 0, carbs: 0 });
    expect(splitFatCarbs(-5, 100)).toEqual({ fat: 0, carbs: 0 });
    expect(splitFatCarbs(2000, Number.NaN).fat).toBe(65);
    expect(splitFatCarbs(2000, -50)).toEqual(splitFatCarbs(2000, 0));
  });
});

describe("the GLP-1 comfortable meal size", () => {
  it("is a third of the day's calories to the nearest 50, kept between 300 and 450 (never above the app's default)", () => {
    expect(suggestGlp1MealCap(1200)).toBe(400);
    expect(suggestGlp1MealCap(1320)).toBe(450); // 440
    expect(suggestGlp1MealCap(1260)).toBe(400); // 420
    expect(suggestGlp1MealCap(1350)).toBe(450);
    expect(suggestGlp1MealCap(1500)).toBe(450); // 500 -> capped
    expect(suggestGlp1MealCap(1730)).toBe(450); // 576.7 -> capped
    expect(suggestGlp1MealCap(1800)).toBe(450);
    expect(suggestGlp1MealCap(2400)).toBe(450); // 800 -> capped
    expect(suggestGlp1MealCap(5000)).toBe(450);
    expect(suggestGlp1MealCap(900)).toBe(300);
    expect(suggestGlp1MealCap(300)).toBe(300); // 100 -> raised
    for (let calories = 0; calories <= 6000; calories += 10) {
      const cap = suggestGlp1MealCap(calories);
      expect(cap, `${calories} kcal`).toBeLessThanOrEqual(DEFAULT_GLP1_MEAL_CAP);
      expect(cap, `${calories} kcal`).toBeGreaterThanOrEqual(300);
    }
  });
  it("rounds a tie up and the rest to the nearest 50", () => {
    expect(suggestGlp1MealCap(1275)).toBe(450); // 425 exactly
    expect(suggestGlp1MealCap(1274)).toBe(400); // 424.67
    expect(suggestGlp1MealCap(1276)).toBe(450); // 425.33
    expect(suggestGlp1MealCap(1125)).toBe(400); // 375 exactly
    expect(suggestGlp1MealCap(1124)).toBe(350); // 374.67
    expect(suggestGlp1MealCap(1126)).toBe(400); // 375.33
    expect(suggestGlp1MealCap(1425)).toBe(450); // 475 exactly, capped
    expect(suggestGlp1MealCap(1424)).toBe(450);
  });
  it("copes with nonsense", () => {
    expect(suggestGlp1MealCap(Number.NaN)).toBe(300);
    expect(suggestGlp1MealCap(Number.POSITIVE_INFINITY)).toBe(300);
    expect(suggestGlp1MealCap(-1200)).toBe(300);
  });
  it("planTargets includes it only for the GLP-1 goal, a multiple of 50 within 300..450, and 1,320 kcal gives the app's default of 450", () => {
    const p = ok(planTargets({ sex: "female", age: 42, weightKg: lbToKg(150), heightCm: inchesToCm(64), activity: "light", goal: "glp1" }));
    expect(p.calories).toBe(1320);
    expect(p.glp1MealCap).toBe(DEFAULT_GLP1_MEAL_CAP);
    for (const { input, plan } of grid()) {
      if (input.goal !== "glp1") {
        expect("glp1MealCap" in plan, JSON.stringify(input)).toBe(false);
        continue;
      }
      const cap = plan.glp1MealCap!;
      expect(cap % 50).toBe(0);
      expect(cap).toBeGreaterThanOrEqual(300);
      expect(cap).toBeLessThanOrEqual(DEFAULT_GLP1_MEAL_CAP);
      expect(cap).toBe(suggestGlp1MealCap(plan.calories));
      const third = plan.calories / 3;
      if (third >= 275 && third <= 475) expect(Math.abs(cap - third)).toBeLessThanOrEqual(25 + 1e-9);
    }
  });
});

describe("under 18 and invalid input", () => {
  const status = (over: Partial<PlanInput>): string => planTargets({ ...base, ...over }).kind;

  it("age: 17 is under 18, 18 and 100 are fine, 101 is invalid", () => {
    expect(status({ age: 17 })).toBe("under18");
    expect(status({ age: 17.9 })).toBe("under18");
    expect(status({ age: 18 })).toBe("ok");
    expect(status({ age: 100 })).toBe("ok");
    expect(status({ age: 100.1 })).toBe("invalid");
    expect(status({ age: 101 })).toBe("invalid");
    expect(planTargets({ ...base, age: 17 })).toEqual({ kind: "under18" });
    expect(planTargets({ ...base, age: 101 })).toEqual({ kind: "invalid" });
  });
  it("age that is not a number is invalid; a number below 18 (even 0 or negative) is under 18, as in suggestTargets", () => {
    expect(status({ age: Number.NaN })).toBe("invalid");
    expect(status({ age: Number.POSITIVE_INFINITY })).toBe("invalid");
    expect(status({ age: Number.NEGATIVE_INFINITY })).toBe("invalid");
    expect(status({ age: 0 })).toBe("under18");
    expect(status({ age: -3 })).toBe("under18");
  });
  it("weight: 30 to 300 kg", () => {
    expect(status({ weightKg: 29.9 })).toBe("invalid");
    expect(status({ weightKg: 30 })).toBe("ok");
    expect(status({ weightKg: 300 })).toBe("ok");
    expect(status({ weightKg: 300.1 })).toBe("invalid");
    expect(status({ weightKg: 0 })).toBe("invalid");
    expect(status({ weightKg: -70 })).toBe("invalid");
    expect(status({ weightKg: Number.NaN })).toBe("invalid");
    expect(status({ weightKg: Number.POSITIVE_INFINITY })).toBe("invalid");
    expect(status({ weightKg: Number.NEGATIVE_INFINITY })).toBe("invalid");
  });
  it("height: 100 to 230 cm", () => {
    expect(status({ heightCm: 99 })).toBe("invalid");
    expect(status({ heightCm: 100 })).toBe("ok");
    expect(status({ heightCm: 230 })).toBe("ok");
    expect(status({ heightCm: 231 })).toBe("invalid");
    expect(status({ heightCm: 0 })).toBe("invalid");
    expect(status({ heightCm: -175 })).toBe("invalid");
    expect(status({ heightCm: Number.NaN })).toBe("invalid");
    expect(status({ heightCm: Number.POSITIVE_INFINITY })).toBe("invalid");
  });
  it("someone under 18 gets no numbers even if the other answers are nonsense (as suggestTargets)", () => {
    expect(planTargets({ ...base, age: 17, weightKg: Number.NaN })).toEqual({ kind: "under18" });
    expect(planTargets({ ...base, age: 12, heightCm: -1 })).toEqual({ kind: "under18" });
  });
  it("an unknown sex, activity, goal or diet is invalid, never a plan full of NaN", () => {
    expect(status({ sex: "robot" as never })).toBe("invalid");
    expect(status({ activity: "athlete" as never })).toBe("invalid");
    expect(status({ goal: "bulk" as never })).toBe("invalid");
    expect(status({ diet: "carnivore" as never })).toBe("invalid");
    expect(status({ sex: "toString" as never })).toBe("invalid");
    expect(status({ sex: undefined as never })).toBe("invalid");
    // an array that spells a key is not that key (it would coerce to it as a property name)
    expect(status({ sex: ["male"] as never })).toBe("invalid");
    expect(status({ activity: ["light"] as never })).toBe("invalid");
    expect(status({ goal: ["lose"] as never })).toBe("invalid");
    expect(status({ diet: ["vegan"] as never })).toBe("invalid");
  });
  it("no answers at all (null, undefined, a string) is invalid and never throws", () => {
    for (const nothing of [null, undefined, "", "male", 0, 42, true]) {
      expect(planTargets(nothing as never), String(nothing)).toEqual({ kind: "invalid" });
    }
    expect(planTargets({} as never)).toEqual({ kind: "invalid" });
  });
  it("the extreme corners of the accepted ranges still give whole, positive numbers", () => {
    for (const age of [18, 100]) for (const weightKg of [30, 300]) for (const heightCm of [100, 230]) for (const sex of SEXES) for (const goal of GOALS) {
      for (const diet of DIETS) {
        const p = ok(planTargets({ sex, age, weightKg, heightCm, activity: "veryActive", goal, diet }));
        const label = JSON.stringify(p);
        for (const n of [p.calories, p.protein, p.carbs, p.fat]) expect(Number.isFinite(n) && n > 0, label).toBe(true);
        expect(p.calories, label).toBeGreaterThanOrEqual(1200);
        expect(proteinShareAtLeast(p.protein, p.calories, 15), label).toBe(true);
        expect(proteinShareAtMost(p.protein, p.calories, 35), label).toBe(true);
      }
    }
  });
});

describe("planTargets is monotone in the obvious directions", () => {
  const ASC_WEIGHTS = [30, 45, 60, 70, 85, 100, 130, 160, 200, 300];
  const ASC_HEIGHTS = [100, 140, 150, 160, 170, 180, 190, 210, 230];
  const ASC_AGES = [18, 21, 25, 30, 35, 45, 55, 65, 80, 100];

  it("more weight never lowers calories, nor (with a limit that rises with them) protein", () => {
    for (const sex of SEXES) for (const age of [18, 45, 100]) for (const heightCm of [100, 170, 230]) for (const activity of ACTIVITIES) for (const goal of GOALS) for (const diet of DIETS) {
      let before: Ok | undefined;
      for (const weightKg of ASC_WEIGHTS) {
        const p = ok(planTargets({ sex, age, weightKg, heightCm, activity, goal, diet }));
        if (before) {
          expect(p.calories, `${sex} ${age} ${heightCm} ${activity} ${goal} ${weightKg}`).toBeGreaterThanOrEqual(before.calories);
          expect(p.protein, `${sex} ${age} ${heightCm} ${activity} ${goal} ${diet} ${weightKg}`).toBeGreaterThanOrEqual(before.protein);
        }
        before = p;
      }
    }
  });
  it("more height never lowers calories", () => {
    for (const sex of SEXES) for (const age of [18, 45, 100]) for (const weightKg of [30, 70, 300]) for (const activity of ACTIVITIES) for (const goal of GOALS) {
      let before = 0;
      for (const heightCm of ASC_HEIGHTS) {
        const p = ok(planTargets({ sex, age, weightKg, heightCm, activity, goal }));
        expect(p.calories).toBeGreaterThanOrEqual(before);
        before = p.calories;
      }
    }
  });
  it("more activity never lowers calories", () => {
    for (const sex of SEXES) for (const age of AGES) for (const weightKg of ASC_WEIGHTS) for (const heightCm of HEIGHTS) for (const goal of GOALS) {
      let before = 0;
      for (const activity of ACTIVITIES) {
        const p = ok(planTargets({ sex, age, weightKg, heightCm, activity, goal }));
        expect(p.calories, `${sex} ${age} ${weightKg} ${heightCm} ${goal} ${activity}`).toBeGreaterThanOrEqual(before);
        before = p.calories;
      }
    }
  });
  it("more age never raises calories", () => {
    for (const sex of SEXES) for (const weightKg of ASC_WEIGHTS) for (const heightCm of HEIGHTS) for (const activity of ACTIVITIES) for (const goal of GOALS) {
      let before = Number.POSITIVE_INFINITY;
      for (const age of ASC_AGES) {
        const p = ok(planTargets({ sex, age, weightKg, heightCm, activity, goal }));
        expect(p.calories, `${sex} ${weightKg} ${heightCm} ${activity} ${goal} ${age}`).toBeLessThanOrEqual(before);
        before = p.calories;
      }
    }
  });
  it("the goals order the calories: losing and GLP-1 <= maintain = other <= build muscle (before the 1,200 floor)", () => {
    for (const { input } of grid()) {
      const at = (goal: Goal) => ok(planTargets({ ...input, goal })).calories;
      expect(at("other")).toBe(at("maintain"));
      expect(at("glp1")).toBe(at("lose"));
      expect(at("lose")).toBeLessThanOrEqual(at("maintain"));
      expect(at("maintain")).toBeLessThanOrEqual(at("buildMuscle"));
    }
  });
});

describe("worked examples (golden values)", () => {
  const examples: Array<{ name: string; input: PlanInput; calories: number; protein: number; carbs: number; fat: number; glp1MealCap?: number; notes: string[] }> = [
    { name: "25-year-old woman, 60 kg, 165 cm, lightly active, losing weight", input: { sex: "female", age: 25, weightKg: 60, heightCm: 165, activity: "light", goal: "lose" }, calories: 1350, protein: 85, carbs: 150, fat: 45, notes: [] },
    { name: "45-year-old man, 95 kg, 180 cm, mostly sitting, GLP-1", input: { sex: "male", age: 45, weightKg: 95, heightCm: 180, activity: "sedentary", goal: "glp1" }, calories: 1730, protein: 135, carbs: 165, fat: 60, glp1MealCap: 450, notes: ["glp1"] },
    { name: "30-year-old vegan woman, 58 kg, 168 cm, active, building muscle", input: { sex: "female", age: 30, weightKg: 58, heightCm: 168, activity: "active", goal: "buildMuscle", diet: "vegan" }, calories: 2290, protein: 100, carbs: 305, fat: 75, notes: ["plant-protein"] },
    { name: "70-year-old man, 76 kg, 172 cm, lightly active, maintaining", input: { sex: "male", age: 70, weightKg: 76, heightCm: 172, activity: "light", goal: "maintain" }, calories: 2050, protein: 90, carbs: 265, fat: 70, notes: [] },
    { name: "38-year-old vegetarian woman, 82 kg, 160 cm, mostly sitting, GLP-1 (35% protein limit)", input: { sex: "female", age: 38, weightKg: 82, heightCm: 160, activity: "sedentary", goal: "glp1", diet: "vegetarian" }, calories: 1260, protein: 110, carbs: 115, fat: 40, glp1MealCap: 400, notes: ["glp1"] },
    { name: "22-year-old man, 72 kg, 183 cm, very active, building muscle (15% protein limit)", input: { sex: "male", age: 22, weightKg: 72, heightCm: 183, activity: "veryActive", goal: "buildMuscle" }, calories: 3280, protein: 125, carbs: 450, fat: 110, notes: [] },
    { name: "68-year-old vegan woman, 50 kg, 155 cm, mostly sitting, GLP-1 (1,200 floor)", input: { sex: "female", age: 68, weightKg: 50, heightCm: 155, activity: "sedentary", goal: "glp1", diet: "vegan" }, calories: 1200, protein: 75, carbs: 135, fat: 40, glp1MealCap: 400, notes: ["low-calories-floor", "glp1", "plant-protein"] },
    { name: "52-year-old (sex not given), 68 kg, 170 cm, active, pescatarian, losing weight", input: { sex: "unspecified", age: 52, weightKg: 68, heightCm: 170, activity: "active", goal: "lose", diet: "pescatarian" }, calories: 1680, protein: 95, carbs: 200, fat: 55, notes: [] },
    // calories that land exactly half-way between two tens (2,035 kcal) round up
    { name: "70-year-old man, 75 kg, 172 cm, lightly active, maintaining (2,035 kcal is a tie and rounds up)", input: { sex: "male", age: 70, weightKg: 75, heightCm: 172, activity: "light", goal: "maintain" }, calories: 2040, protein: 90, carbs: 265, fat: 70, notes: [] },
    // protein that lands exactly half-way between two fives (87.5 x 1.4 = 122.5 g) rounds up too, although 87.5 x 1.4 is 122.49999999999999 in floating point
    { name: "30-year-old man, 87.5 kg, 180 cm, active, losing weight (122.5 g protein is a tie and rounds up)", input: { sex: "male", age: 30, weightKg: 87.5, heightCm: 180, activity: "active", goal: "lose" }, calories: 2380, protein: 125, carbs: 290, fat: 80, notes: [] },
    // a figure of exactly 1,200 that the floor did not raise has no floor note
    { name: "60-year-old woman, 49 kg, 155 cm, mostly sitting, maintaining (1,200 without the floor)", input: { sex: "female", age: 60, weightKg: 49, heightCm: 155, activity: "sedentary", goal: "maintain" }, calories: 1200, protein: 60, carbs: 150, fat: 40, notes: [] },
    // small bodies on a lose-weight or GLP-1 plan get the "low-bmi" note; the calories are the same as ever
    { name: "25-year-old woman, 50 kg, 168 cm, lightly active, losing weight (1,240 kcal, above the floor, with the low-bmi note)", input: { sex: "female", age: 25, weightKg: 50, heightCm: 168, activity: "light", goal: "lose" }, calories: 1240, protein: 70, carbs: 150, fat: 40, notes: ["low-bmi"] },
    { name: "30-year-old woman, 40 kg, 160 cm, very active, losing weight (1,380 kcal with the low-bmi note)", input: { sex: "female", age: 30, weightKg: 40, heightCm: 160, activity: "veryActive", goal: "lose" }, calories: 1380, protein: 55, carbs: 190, fat: 45, notes: ["low-bmi"] },
    { name: "20-year-old man, 52 kg, 180 cm, very active, losing weight (2,170 kcal with the low-bmi note)", input: { sex: "male", age: 20, weightKg: 52, heightCm: 180, activity: "veryActive", goal: "lose" }, calories: 2170, protein: 85, carbs: 300, fat: 70, notes: ["low-bmi"] },
    { name: "18-year-old man, 36 kg, 150 cm, active, losing weight (1,380 kcal with the low-bmi note)", input: { sex: "male", age: 18, weightKg: 36, heightCm: 150, activity: "active", goal: "lose" }, calories: 1380, protein: 55, carbs: 190, fat: 45, notes: ["low-bmi"] },
    { name: "40-year-old woman, 54 kg, 170 cm, lightly active, GLP-1 (just above the low-bmi line: no low-bmi note)", input: { sex: "female", age: 40, weightKg: 54, heightCm: 170, activity: "light", goal: "glp1" }, calories: 1210, protein: 75, carbs: 140, fat: 40, glp1MealCap: 400, notes: ["glp1"] },
    // a weight typed in pounds in the kilograms box: the plan is still shown, with a note asking for a check
    { name: "30-year-old man, 160 kg (really 160 lb), 170 cm, lightly active, maintaining (check-measurements)", input: { sex: "male", age: 30, weightKg: 160, heightCm: 170, activity: "light", goal: "maintain" }, calories: 3460, protein: 190, carbs: 415, fat: 115, notes: ["check-measurements"] },
    { name: "30-year-old man, 72.6 kg, 170 cm, lightly active, maintaining (what 160 lb really is)", input: { sex: "male", age: 30, weightKg: 72.6, heightCm: 170, activity: "light", goal: "maintain" }, calories: 2260, protein: 85, carbs: 310, fat: 75, notes: [] },
    // every note at once, in order
    { name: "68-year-old vegan woman, 33 kg, 150 cm, mostly sitting, GLP-1 (all five notes, in order)", input: { sex: "female", age: 68, weightKg: 33, heightCm: 150, activity: "sedentary", goal: "glp1", diet: "vegan" }, calories: 1200, protein: 50, carbs: 160, fat: 40, glp1MealCap: 400, notes: ["check-measurements", "low-calories-floor", "low-bmi", "glp1", "plant-protein"] },
  ];
  for (const e of examples) {
    it(e.name, () => {
      const { name: _name, input, ...expected } = e;
      void _name;
      expect(planTargets(input)).toEqual({ kind: "ok", ...expected });
    });
  }
});

describe("planTargets is pure", () => {
  it("does not change its input, and the same input always gives the same, separate answer", () => {
    const input: PlanInput = Object.freeze({ sex: "female", age: 68, weightKg: 50, heightCm: 155, activity: "sedentary", goal: "glp1", diet: "vegan" });
    const first = planTargets(input);
    expect(input).toEqual({ sex: "female", age: 68, weightKg: 50, heightCm: 155, activity: "sedentary", goal: "glp1", diet: "vegan" });
    const second = planTargets(input);
    expect(second).toEqual(first);
    // the notes array belongs to each answer: changing one never changes the next
    const a = ok(first);
    expect(ok(second).notes).not.toBe(a.notes);
    a.notes.length = 0;
    a.calories = 1;
    expect(ok(planTargets(input)).notes).toEqual(["low-calories-floor", "glp1", "plant-protein"]);
    expect(ok(planTargets(input)).calories).toBe(1200);  });
  it("does not change suggestTargets, suggestCarbFat or the preferences it reads", () => {
    const prefs = Object.freeze({ ...NO_PREFERENCES, veganOnly: true });
    expect(dietKindFrom(prefs)).toBe("vegan");
    expect(prefs).toEqual({ vegetarianOnly: false, noPork: false, noBeef: false, veganOnly: true });
    expect(suggestTargets({ sex: "male", age: 30, weightLb: 180, heightFt: 5, heightIn: 10, activity: "active", goal: "lose" })).toEqual({ kind: "ok", calories: 2260, protein: 115 });
  });
});

describe("measurements that look mistyped", () => {
  it("bmi is kilograms over metres squared, and 0 for nonsense", () => {
    expect(bmi(60, 200)).toBe(15);
    expect(bmi(200, 200)).toBe(50);
    expect(bmi(72.6, 170)).toBeCloseTo(25.12, 2);
    for (const [kg, cm] of [[0, 170], [70, 0], [-70, 170], [70, -170], [Number.NaN, 170], [70, Number.NaN], [Number.POSITIVE_INFINITY, 170]] as const) {
      expect(bmi(kg, cm), `${kg} ${cm}`).toBe(0);
    }
  });

  it("asks for a check below 15 and above 50, never at 15 or 50 themselves", () => {
    expect(measurementsLookOff(60, 200)).toBe(false); // 15
    expect(measurementsLookOff(59.9, 200)).toBe(true);
    expect(measurementsLookOff(200, 200)).toBe(false); // 50
    expect(measurementsLookOff(200.1, 200)).toBe(true);
    expect(measurementsLookOff(72.6, 170)).toBe(false);
  });

  it("a weight typed in pounds in the kilograms box is caught, and the same man at his real 72.6 kg is not (the plan is shown either way)", () => {
    const base2: PlanInput = { sex: "male", age: 30, weightKg: 160, heightCm: 170, activity: "light", goal: "maintain" };
    const typo = ok(planTargets(base2));
    const real = ok(planTargets({ ...base2, weightKg: 72.6 }));
    expect(typo.notes).toEqual(["check-measurements"]);
    expect(real.notes).toEqual([]);
    expect(typo.calories).toBeGreaterThan(real.calories + 1000);
  });

  it("the extreme corner of the accepted ranges (30 kg at 230 cm) is flagged, and the heaviest and tallest are flagged too", () => {
    expect(ok(planTargets({ ...base, weightKg: 30, heightCm: 230 })).notes).toContain("check-measurements");
    expect(ok(planTargets({ ...base, weightKg: 300, heightCm: 230 })).notes).toContain("check-measurements"); // BMI 56.7
    expect(ok(planTargets({ ...base, weightKg: 30, heightCm: 150 })).notes).toContain("check-measurements"); // BMI 13.3
  });

  it("the note is there exactly when measurementsLookOff says so, for everyone in the grid (and the grid has both kinds of people)", () => {
    let flagged = 0, plain = 0;
    for (const { input, plan } of grid()) {
      const expected = measurementsLookOff(input.weightKg, input.heightCm);
      expect(plan.notes.includes("check-measurements"), JSON.stringify(input)).toBe(expected);
      if (expected) flagged++; else plain++;
    }
    expect(flagged).toBeGreaterThan(100);
    expect(plain).toBeGreaterThan(1000);
  });
});

describe("a plan to lose weight for a small body (the low-bmi note)", () => {
  it("is added for the lose and GLP-1 goals below a BMI of 18.5, and for no other goal or higher BMI", () => {
    let withNote = 0, without = 0;
    for (const { input, plan } of grid()) {
      const label = JSON.stringify(input);
      const expected = (input.goal === "lose" || input.goal === "glp1") && bmi(input.weightKg, input.heightCm) < LOW_BMI;
      expect(plan.notes.includes("low-bmi"), label).toBe(expected);
      if (expected) withNote++; else without++;
    }
    expect(withNote).toBeGreaterThan(50);
    expect(without).toBeGreaterThan(1000);
  });

  it("the 18.5 line is exact: at 170 cm, 53.4 kg gets the note and 53.5 kg does not", () => {
    const person = (weightKg: number, goal: Goal): Ok => ok(planTargets({ sex: "female", age: 40, weightKg, heightCm: 170, activity: "light", goal }));
    expect(person(53.4, "lose").notes).toEqual(["low-bmi"]);
    expect(person(53.5, "lose").notes).toEqual([]);
    expect(person(53.4, "glp1").notes).toEqual(["low-bmi", "glp1"]);
    expect(person(53.4, "maintain").notes).toEqual([]);
    expect(person(53.4, "buildMuscle").notes).toEqual([]);
    expect(person(53.4, "other").notes).toEqual([]);
  });

  it("is the case the 1,200 floor alone misses: small people whose deficit leaves them well above the floor", () => {
    // each of these was a plan of 1,240 to 2,170 kcal with no caution at all before the note
    const inputs: PlanInput[] = [
      { sex: "female", age: 25, weightKg: 50, heightCm: 168, activity: "light", goal: "lose" },
      { sex: "female", age: 30, weightKg: 40, heightCm: 160, activity: "veryActive", goal: "lose" },
      { sex: "male", age: 20, weightKg: 52, heightCm: 180, activity: "veryActive", goal: "lose" },
      { sex: "male", age: 18, weightKg: 36, heightCm: 150, activity: "active", goal: "lose" },
    ];
    for (const input of inputs) {
      const p = ok(planTargets(input));
      expect(p.calories, JSON.stringify(input)).toBeGreaterThan(MIN_SUGGESTED_CALORIES);
      expect(p.notes, JSON.stringify(input)).toContain("low-bmi");
    }
  });

  it("does not change the calories: they are suggestTargets' exactly as before (the founder decides whether a small body gets a smaller deficit)", () => {
    const s = suggestTargets({ sex: "female", age: 25, weightLb: 50 / KG_PER_LB, heightFt: 0, heightIn: 168 / CM_PER_INCH, activity: "light", goal: "lose" });
    const p = ok(planTargets({ sex: "female", age: 25, weightKg: 50, heightCm: 168, activity: "light", goal: "lose" }));
    expect(s.kind === "ok" && s.calories).toBe(1240);
    expect(p.calories).toBe(1240);
  });

  it("comes after the 1,200 floor note and before the GLP-1 note, and a person can have all five notes in order", () => {
    const p = ok(planTargets({ sex: "female", age: 68, weightKg: 33, heightCm: 150, activity: "sedentary", goal: "glp1", diet: "vegan" }));
    expect(p.notes).toEqual(["check-measurements", "low-calories-floor", "low-bmi", "glp1", "plant-protein"]);
  });
});

describe("protein that lands exactly half-way between two fives rounds up", () => {
  it("every weight in tenths of a kilogram from 40 to 170 kg: protein is the exact half-up value, kept inside the 15%..35% limits", () => {
    const perKg: Array<[Goal, number]> = [["lose", 14], ["maintain", 12], ["buildMuscle", 16]]; // tenths of a gram per kg
    let ties = 0;
    for (let tenths = 400; tenths <= 1700; tenths++) {
      const weightKg = tenths / 10;
      for (const [goal, per] of perKg) {
        const p = ok(planTargets({ sex: "male", age: 30, weightKg, heightCm: 175, activity: "active", goal }));
        // weight in tenths x per-kg in tenths = hundredths of a gram; five grams are 500 hundredths
        const hundredths = tenths * per;
        const { lo, hi } = proteinBounds(p.calories);
        const exact = Math.floor((hundredths + 250) / 500) * 5;
        expect(p.protein, `${weightKg} kg ${goal}`).toBe(Math.min(hi, Math.max(lo, exact)));
        if (hundredths % 500 === 250) ties++;
      }
    }
    // only losing weight (1.4 g per kg) has exact ties at these weights: 62.5, 87.5, 112.5, 137.5 and 162.5 kg
    expect(ties).toBe(5);
  });
  it("87.5 kg losing weight is 125 g (122.5 exactly) and 162.5 kg is 230 g (227.5 exactly)", () => {
    expect(ok(planTargets({ ...base, weightKg: 87.5, heightCm: 180 })).protein).toBe(125);
    expect(ok(planTargets({ ...base, weightKg: 162.5, heightCm: 180 })).protein).toBe(230);
  });
});

describe("the words for each note", () => {
  const KEYS: PlanNote[] = ["check-measurements", "low-calories-floor", "low-bmi", "glp1", "plant-protein"];
  it("every note has some, GLP-1 reuses the existing line, and none calls a food good or bad, judges a body or makes a medical claim (rule 3)", () => {
    expect(Object.keys(PLAN_NOTE_COPY).sort()).toEqual([...KEYS].sort());
    expect(PLAN_NOTE_COPY.glp1).toBe(GLP1_NOTE);
    for (const key of KEYS.filter((k) => k !== "glp1")) {
      const text = PLAN_NOTE_COPY[key];
      expect(text.length).toBeGreaterThan(20);
      expect(text, key).not.toMatch(/healthy|unhealthy|\bgood\b|\bbad\b|\bcure|\bdisease|\bdeficien|\bneed/i);
      expect(text, key).not.toMatch(/\bBMI\b|body mass|underweight|overweight|obese|obesity|\bthin\b|\bfat\b|ideal weight/i);
    }
    expect(PLAN_NOTE_COPY["low-calories-floor"]).toContain("1,200");
    expect(PLAN_NOTE_COPY["low-calories-floor"]).toMatch(/doctor or dietitian/);
    expect(PLAN_NOTE_COPY["low-bmi"]).toMatch(/doctor or dietitian/);
    expect(PLAN_NOTE_COPY["check-measurements"]).toMatch(/height and weight/);
  });
  it("planNoteText fills in the app's name in the GLP-1 line and leaves no {placeholder} in any note", () => {
    for (const key of KEYS) {
      const text = planNoteText(key, englishT, "Numbite");
      expect(text, key).not.toMatch(/[{}]/);
    }
    expect(planNoteText("glp1", englishT, "Numbite")).toContain("Numbite doesn't give medical advice");
    expect(PLAN_NOTE_COPY.glp1).toContain("{app}");
    // a plain translator call with no values is exactly what the helper exists to prevent
    expect(englishT(PLAN_NOTE_COPY.glp1)).toContain("{app}");
  });
});
