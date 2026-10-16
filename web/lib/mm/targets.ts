import { AGE_MAX, HEIGHT_CM_MAX, HEIGHT_CM_MIN, WEIGHT_KG_MAX, WEIGHT_KG_MIN, bmi } from "./bodyUnits";
import { tk, type T } from "./i18n";
import type { Goal, Preferences } from "./types";

// SPEC §6.2: Mifflin-St Jeor suggestion. Always shown with "Suggested starting points, not medical advice."

export type Sex = "male" | "female" | "unspecified";
export type Activity = "sedentary" | "light" | "active" | "veryActive";

export const ACTIVITY_FACTOR: Record<Activity, number> = { sedentary: 1.2, light: 1.375, active: 1.55, veryActive: 1.725 };
export const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: tk("Mostly sitting"),
  light: tk("Lightly active"),
  active: tk("Active"),
  veryActive: tk("Very active"),
};
export const SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };
export const CALORIE_ADJUSTMENT: Record<Goal, number> = { lose: -500, maintain: 0, buildMuscle: 250, glp1: -500, other: 0 };
export const PROTEIN_PER_KG: Record<Goal, number> = { lose: 1.4, maintain: 1.2, buildMuscle: 1.6, glp1: 1.4, other: 1.2 }; // "other" = maintain

export const MIN_SUGGESTED_CALORIES = 1200;
export const UNDER_18_COPY = tk("Ask a doctor or dietitian for targets.");
export const SUGGESTION_NOTE = tk("Suggested starting points, not medical advice. Adjust any time.");
/** Shown (not blocking) under a typed calorie target below what suggestions ever start from (App Review 1.4.1: no encouraging of unsafe dieting). */
export const LOW_CALORIES_NOTE = tk("That's lower than most adults need. If you plan to eat this little, please talk to a doctor or dietitian first.");
/** Under the GLP-1 goal: the app follows the person's medicine plan, it doesn't give medical advice (App Review 1.4.1). */
export const GLP1_NOTE = tk("If you take a GLP-1 medicine, follow the advice of your doctor or pharmacist. {app} doesn't give medical advice.");
/** True for a typed target that is a number but below MIN_SUGGESTED_CALORIES. */
export const isLowCalories = (value: string | number): boolean => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < MIN_SUGGESTED_CALORIES;
};

export interface SuggestionInput {
  sex: Sex;
  age: number;
  weightLb: number;
  heightFt: number;
  heightIn: number;
  activity: Activity;
  goal: Goal;
}

export type Suggestion = { kind: "ok"; calories: number; protein: number } | { kind: "under18" } | { kind: "invalid" };

function roundTo(x: number, increment: number): number {
  return Math.floor(x / increment + 0.5) * increment; // half away from zero (x is positive here)
}

export function suggestTargets(input: SuggestionInput): Suggestion {
  const { sex, age, weightLb, heightFt, heightIn, activity, goal } = input;
  if (Number.isFinite(age) && age < 18) return { kind: "under18" };
  const valid =
    Number.isFinite(age) && age >= 18 && age <= 100 &&
    Number.isFinite(weightLb) && weightLb > 0 &&
    Number.isFinite(heightFt) && heightFt >= 0 && Number.isFinite(heightIn) && heightIn >= 0 &&
    heightFt * 12 + heightIn > 0;
  if (!valid) return { kind: "invalid" };

  const kg = weightLb * 0.45359237;
  const cm = (heightFt * 12 + heightIn) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + SEX_OFFSET[sex];
  const tdee = bmr * ACTIVITY_FACTOR[activity];
  const calories = Math.max(MIN_SUGGESTED_CALORIES, roundTo(tdee + CALORIE_ADJUSTMENT[goal], 10));
  const protein = roundTo(kg * PROTEIN_PER_KG[goal], 5);
  return { kind: "ok", calories, protein };
}

// Carbs and fat get targets too (founder 2026-10-15, for Home's "CARBS 98g / 305g" rows, like their reference picture): worked out from
// the calorie and protein targets as suggested starting points, and changeable in Settings. About 30% of the day's calories from fat
// (9 kcal a gram) and the rest from carbs (4 kcal a gram) after protein (4 kcal a gram; 20% of calories when no protein target is set),
// rounded to 5 g. They are targets the person can change, never figures about a food.
export const FAT_SHARE = 0.3;
const PROTEIN_SHARE_WITHOUT_TARGET = 0.2;
// Protein gets a suggested target too (founder 2026-10-15, on Home's protein row with no bar: "there should be a bar like for carbs and fats"):
// left empty it is 20% of the day's calories at 4 kcal a gram, rounded to 5 g, the same share carbs are worked out after.
export const CARB_FAT_NOTE = tk("Left empty, protein, carbs and fat are worked out from your calories: about 20% from protein, 30% from fat and the rest from carbs. Type your own to change them.");
export const MAX_MACRO_TARGET = 2000;

/** The protein target used when none is typed in Settings: 20% of the day's calories, 4 kcal a gram, to the nearest 5 g (0 for nonsense). */
export function suggestProtein(dailyCalories: number): number {
  const calories = Number.isFinite(dailyCalories) && dailyCalories > 0 ? dailyCalories : 0;
  return roundTo((calories * PROTEIN_SHARE_WITHOUT_TARGET) / 4, 5);
}

export function suggestCarbFat(dailyCalories: number, dailyProtein?: number): { carbs: number; fat: number } {
  const calories = Number.isFinite(dailyCalories) && dailyCalories > 0 ? dailyCalories : 0;
  const fat = roundTo((calories * FAT_SHARE) / 9, 5);
  const proteinKcal = dailyProtein !== undefined && Number.isFinite(dailyProtein) && dailyProtein > 0 ? dailyProtein * 4 : calories * PROTEIN_SHARE_WITHOUT_TARGET;
  const carbs = Math.max(0, roundTo((calories - fat * 9 - proteinKcal) / 4, 5));
  return { carbs, fat };
}

/** The day's targets for each macro: protein, carbs and fat as typed in Settings or else worked out (protein from the calories alone). */
export function macroTargets(s: { dailyCalories: number; dailyProtein?: number; dailyCarbs?: number; dailyFat?: number }): { protein: number; carbs: number; fat: number } {
  const suggested = suggestCarbFat(s.dailyCalories, s.dailyProtein);
  return {
    protein: s.dailyProtein ?? suggestProtein(s.dailyCalories),
    carbs: s.dailyCarbs ?? suggested.carbs,
    fat: s.dailyFat ?? suggested.fat,
  };
}

// ---- The plan: all four targets pre-filled from the person's answers (founder 2026-10-16, on onboarding's "Your daily targets": "come to this screen
// later ... use that information to then arrive on this screen with pre typed information which they can change"). `planTargets` is the same
// Mifflin-St Jeor calories as `suggestTargets` (tested equal) and then works out protein, carbs and fat for the goal and the diet. Everything it
// returns is a suggested starting point the person can change, never a figure about a food (rule 1) and never medical advice (rule 3). Body
// measurements are used once, on the phone, and are not stored or sent (rule 4).
//
// The constants below (the diet factors, the 15%..35% protein limits, the 20% carb and fat floors, the GLP-1 meal size, the measurement checks) are
// starting points proposed on 2026-10-16 and NOT yet approved by the founder (rule 8: do not change them without the founder's yes; see
// docs/PROGRESS.md). Protein per kg of body weight is the existing PROTEIN_PER_KG; the diet factor nudges it up a little for vegan and vegetarian eating.

export type DietKind = "vegan" | "vegetarian" | "pescatarian" | "none";

/** Protein per kg is multiplied by this for the diet (pescatarian eats fish, so no change). */
export const DIET_PROTEIN_FACTOR: Record<DietKind, number> = { vegan: 1.1, vegetarian: 1.05, pescatarian: 1, none: 1 };
/** Protein is kept between these shares of the day's calories (4 kcal a gram), so protein per kg can't produce an extreme split. */
export const PROTEIN_SHARE_MIN = 0.15;
export const PROTEIN_SHARE_MAX = 0.35;
/** Fat is the usual FAT_SHARE of calories, lowered when the carbs would otherwise fall below MIN_CARB_SHARE, but never below MIN_FAT_SHARE. */
export const MIN_CARB_SHARE = 0.2;
export const MIN_FAT_SHARE = 0.2;
/**
 * GLP-1: a pre-filled "Comfortable meal size" = a third of the day's calories, to the nearest 50, between these. It is never above 450, the default
 * in SPEC §8 step 2 and Settings (DEFAULT_GLP1_MEAL_CAP in budget.ts; a test keeps the two equal): the meal size feeds the meal budgets and Best for you,
 * so a bigger pre-filled size than the default needs the founder's yes (rule 8) and would also work against the "smaller, protein-first orders" copy.
 */
export const GLP1_MEAL_CAP_MIN = 300;
export const GLP1_MEAL_CAP_MAX = 450;
export const GLP1_MEAL_CAP_STEP = 50;
/**
 * Body mass index below which a plan to lose weight (or on a GLP-1 medicine) comes with the "low-bmi" note: a deficit of 500 kcal a day is the same
 * for everyone (SPEC §6.2), and the 1,200 kcal floor only bites for small appetites, so a person who is already small is told to ask a doctor or
 * dietitian first. The calories are NOT changed for them (that would need the founder's yes). Never shown as a number or as a word about a body.
 */
export const LOW_BMI = 18.5;
/** Outside these the height and weight were probably typed wrongly (a weight in pounds in the kilograms box, say): the screen asks the person to check them. It does not block. */
export const CHECK_BMI_MIN = 15;
export const CHECK_BMI_MAX = 50;

export interface PlanInput {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activity: Activity;
  goal: Goal;
  /** Left out = "none". */
  diet?: DietKind;
}

/**
 * Machine keys for the lines the plan screen may show under the numbers (see PLAN_NOTE_COPY), in the order they come in `Plan.notes`.
 *  - "check-measurements": the height and weight look mistyped (CHECK_BMI_MIN..CHECK_BMI_MAX); ask the person to check them, show the plan anyway.
 *  - "low-calories-floor": the calories were raised to the 1,200 floor.
 *  - "low-bmi": a lose-weight or GLP-1 plan for a small body (LOW_BMI); ask a doctor or dietitian first.
 *  - "glp1": follow the medicine plan from the doctor or pharmacist.
 *  - "plant-protein": the diet raised the protein a little.
 */
export type PlanNote = "check-measurements" | "low-calories-floor" | "low-bmi" | "glp1" | "plant-protein";

export type Plan =
  | { kind: "ok"; calories: number; protein: number; carbs: number; fat: number; glp1MealCap?: number; notes: PlanNote[] }
  | { kind: "under18" }
  | { kind: "invalid" };

/**
 * The words for each PlanNote. The under-18 and "suggested starting points" lines are UNDER_18_COPY and SUGGESTION_NOTE above.
 * The "glp1" line holds an `{app}` placeholder (it is GLP1_NOTE): show a note with `planNoteText`, or pass `{ app: site.name }` to `t`, never plain `t(PLAN_NOTE_COPY[note])`.
 */
export const PLAN_NOTE_COPY: Record<PlanNote, string> = {
  "check-measurements": tk("Please check your height and weight, because your plan is worked out from them. If they are right, you can carry on."),
  "low-calories-floor": tk("Your suggested calories are never below 1,200 a day. If you plan to eat less than that, please talk to a doctor or dietitian first."),
  "low-bmi": tk("At your height and weight, a lower-calorie plan may not suit you. Please talk to a doctor or dietitian before you start."),
  glp1: GLP1_NOTE,
  "plant-protein": tk("Because of your diet, we set your protein a little higher. Change it any time."),
};

/** The translated words of a note with every placeholder filled in (the only placeholder is the app's name). */
export function planNoteText(note: PlanNote, t: T, appName: string): string {
  return t(PLAN_NOTE_COPY[note], { app: appName });
}

/** True when a height and weight look mistyped, so the screen should ask the person to check them (never blocks, never a comment on a body). */
export function measurementsLookOff(weightKg: number, heightCm: number): boolean {
  const index = bmi(weightKg, heightCm);
  return index < CHECK_BMI_MIN || index > CHECK_BMI_MAX;
}

/** The app's preferences (or any part of them): only vegan, vegetarian and pescatarian are read. */
export type DietPrefs = Partial<Preferences>;

/** The diet that matters for the plan from the app's preferences; the strictest wins (vegan, then vegetarian, then pescatarian). Halal, pork and beef don't change the macros. */
export function dietKindFrom(prefs: DietPrefs | null | undefined): DietKind {
  if (prefs?.veganOnly) return "vegan";
  if (prefs?.vegetarianOnly) return "vegetarian";
  if (prefs?.pescatarianOnly) return "pescatarian";
  return "none";
}

// 1e-9 of a step keeps 300.00000000000006 / 5 from rounding up a whole step.
const ceilTo = (x: number, increment: number): number => Math.ceil(x / increment - 1e-9) * increment;
const floorTo = (x: number, increment: number): number => Math.floor(x / increment + 1e-9) * increment;
// A half-way value rounds up whatever the floating-point noise: 87.5 x 1.4 is 122.49999999999999, and half-way between 120 and 125 is 125.
const roundHalfUpTo = (x: number, increment: number): number => Math.floor(x / increment + 0.5 + 1e-9) * increment;

/** The "Comfortable meal size" to pre-fill for the GLP-1 goal: a third of the day's calories to the nearest 50, between 300 and 600. */
export function suggestGlp1MealCap(dailyCalories: number): number {
  const third = Number.isFinite(dailyCalories) && dailyCalories > 0 ? dailyCalories / 3 : 0;
  return Math.min(GLP1_MEAL_CAP_MAX, Math.max(GLP1_MEAL_CAP_MIN, roundTo(third, GLP1_MEAL_CAP_STEP)));
}

/**
 * Fat and carbs for a day's calories and protein (grams, rounded to 5). Fat is FAT_SHARE of the calories at 9 kcal a gram, but no more than leaves the
 * carbs (4 kcal a gram) MIN_CARB_SHARE of the calories (that limit is rounded DOWN to 5 g, so the carbs keep their share), and never below MIN_FAT_SHARE
 * (rounded up, so it stays at or above it). Carbs are what is left, never below 0, so they come to at least MIN_CARB_SHARE of the calories to within the
 * rounding of the carbs themselves (under 2.5 g = 10 kcal), unless protein is so high that even the least fat leaves less. With protein kept at
 * PROTEIN_SHARE_MAX or less and FAT_SHARE at 30%, the carbs are always at least 35% of the calories, so the carb floor can't bite from `planTargets`; it is
 * here so any protein figure gives a sane split.
 * Where the carb floor does not bite, this equals `suggestCarbFat(calories, protein)` (except that here a protein of 0 or less means no protein at all,
 * where suggestCarbFat takes it as "not set" and uses 20% of the calories).
 */
export function splitFatCarbs(dailyCalories: number, dailyProtein: number): { fat: number; carbs: number } {
  const calories = Number.isFinite(dailyCalories) && dailyCalories > 0 ? dailyCalories : 0;
  const proteinKcal = Number.isFinite(dailyProtein) && dailyProtein > 0 ? dailyProtein * 4 : 0;
  const mostFatKcalTheCarbsAllow = calories - proteinKcal - calories * MIN_CARB_SHARE;
  const leastFat = ceilTo((calories * MIN_FAT_SHARE) / 9, 5);
  // Math.max(0, ...) also keeps a -0 out of the answer.
  const fat = Math.max(0, leastFat, Math.min(roundTo((calories * FAT_SHARE) / 9, 5), floorTo(mostFatKcalTheCarbsAllow / 9, 5)));
  const carbs = Math.max(0, roundTo((calories - proteinKcal - fat * 9) / 4, 5));
  return { fat, carbs };
}

const has = (record: object, key: unknown): boolean => typeof key === "string" && Object.prototype.hasOwnProperty.call(record, key);

/**
 * All four daily targets from a person's answers.
 *  - calories: exactly `suggestTargets` (Mifflin-St Jeor x activity, then the goal's adjustment, to the nearest 10, never below 1,200).
 *  - protein: PROTEIN_PER_KG for the goal x kg x DIET_PROTEIN_FACTOR, kept between PROTEIN_SHARE_MIN and PROTEIN_SHARE_MAX of the calories, to the
 *    nearest 5 g with a half-way value (122.5 g) rounding up (the share limits are rounded inwards to a multiple of 5, so the result is always inside them).
 *  - fat and carbs: `splitFatCarbs`.
 *  - GLP-1 goal: also a pre-filled meal size (`suggestGlp1MealCap`, never above 450).
 *  - notes: see PlanNote. The calories are the same with or without a note; a note only adds a line under the numbers.
 * Under 18 gets no numbers; nonsense (not a finite number, or outside the ranges in bodyUnits.ts, or an unknown sex, activity, goal or diet, or no
 * answers at all) is "invalid".
 */
export function planTargets(input: PlanInput): Plan {
  if (!input || typeof input !== "object") return { kind: "invalid" };
  const { sex, age, weightKg, heightCm, activity, goal } = input;
  const diet: DietKind = input.diet ?? "none";
  if (Number.isFinite(age) && age < 18) return { kind: "under18" };
  const valid =
    has(SEX_OFFSET, sex) && has(ACTIVITY_FACTOR, activity) && has(CALORIE_ADJUSTMENT, goal) && has(DIET_PROTEIN_FACTOR, diet) &&
    Number.isFinite(age) && age <= AGE_MAX &&
    Number.isFinite(weightKg) && weightKg >= WEIGHT_KG_MIN && weightKg <= WEIGHT_KG_MAX &&
    Number.isFinite(heightCm) && heightCm >= HEIGHT_CM_MIN && heightCm <= HEIGHT_CM_MAX;
  if (!valid) return { kind: "invalid" };

  // Calories: the same expression as suggestTargets, so the two always agree.
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_OFFSET[sex];
  const tdee = bmr * ACTIVITY_FACTOR[activity];
  const wanted = roundTo(tdee + CALORIE_ADJUSTMENT[goal], 10);
  const calories = Math.max(MIN_SUGGESTED_CALORIES, wanted);

  // Protein: per kg for the goal, nudged for the diet, kept to a share of the calories.
  const lowest = ceilTo((calories * PROTEIN_SHARE_MIN) / 4, 5);
  const highest = floorTo((calories * PROTEIN_SHARE_MAX) / 4, 5);
  const proteinFor = (factor: number): number => Math.min(highest, Math.max(lowest, roundHalfUpTo(weightKg * PROTEIN_PER_KG[goal] * factor, 5)));
  const protein = proteinFor(DIET_PROTEIN_FACTOR[diet]);

  const { fat, carbs } = splitFatCarbs(calories, protein);

  // Notes in a fixed order: check the measurements, the floor, a small body on a deficit, GLP-1, then the diet.
  const notes: PlanNote[] = [];
  if (measurementsLookOff(weightKg, heightCm)) notes.push("check-measurements");
  if (wanted < MIN_SUGGESTED_CALORIES) notes.push("low-calories-floor");
  if ((goal === "lose" || goal === "glp1") && bmi(weightKg, heightCm) < LOW_BMI) notes.push("low-bmi");
  if (goal === "glp1") notes.push("glp1");
  if (protein !== proteinFor(1)) notes.push("plant-protein");

  return goal === "glp1"
    ? { kind: "ok", calories, protein, carbs, fat, glp1MealCap: suggestGlp1MealCap(calories), notes }
    : { kind: "ok", calories, protein, carbs, fat, notes };
}
