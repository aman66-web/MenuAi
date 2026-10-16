import { parseNumber } from "./addFood";
import {
  INCHES_PER_FOOT, LB_PER_STONE, inchesToCm, isPartNumber, lbToKg, readAge, readHeightCm, readWeightKg, heightFromBoxes, heightInputFromCm, toCm, toKg, weightFromBoxes, weightInputFromKg,
  type HeightUnit, type WeightUnit,
} from "./bodyUnits";
import { MAX_MACRO_TARGET, dietKindFrom, planTargets, type Activity, type DietPrefs, type Plan, type Sex } from "./targets";
import type { Goal } from "./types";

// The screens that come before "Your daily targets" in onboarding (founder 2026-10-16: "have 3 screens asking their age and then another thing asking
// another thing etc, and use that information to then arrive on this screen with pre typed information which they can change"), and the same single
// form in Settings. This file is the pure part: what a person typed (text boxes, a unit for the weight and one for the height) turned into the plan from
// targets.ts, the messages' keys for what is wrong, converting a typed value when its unit is switched, and reading the four target boxes back.
//
// PRIVACY (CLAUDE.md rule 4): age, sex, height, weight and activity are used once, on the phone, to work out suggested targets. They live only in React
// state while the screens are open: nothing here (or in the screens) writes them to storage, the address, analytics or the network, and what comes out of
// `planFromAnswers` holds only the plan's numbers and the keys of what is wrong, never a typed value.

/** The text in a measurement's boxes: kilograms or centimetres in `major`, or stones / feet in `major` with pounds / inches in `minor`. */
export interface Boxes<U extends string> { unit: U; major: string; minor: string }
/**
 * A weight or height as typed. After a unit switch the boxes show the converted value to one decimal place, and two things remember the person's own
 * words until a box is typed in again: `was` (what the boxes held in the other unit, so switching back gives exactly that) and `exact` (the kilograms or
 * centimetres that was typed, so the plan is the same plan, not one worked out from the rounded copy).
 */
export type WeightAnswer = Boxes<WeightUnit> & { was?: WeightWas; exact?: number };
export type HeightAnswer = Boxes<HeightUnit> & { was?: HeightWas; exact?: number };
/** What the boxes held in the other unit. It carries its own `exact` too, so a unit switched to and fro any number of times still plans from the typed value. */
type WeightWas = Boxes<WeightUnit> & { exact?: number };
type HeightWas = Boxes<HeightUnit> & { exact?: number };

export interface BodyAnswers {
  sex: Sex;
  /** The age box, as typed. */
  age: string;
  weight: WeightAnswer;
  height: HeightAnswer;
  activity: Activity;
}

/** Where the screens start: stones and pounds, feet and inches (UK first), nothing typed, "Prefer not to say" and "Lightly active" chosen (as the old form was). */
export const EMPTY_BODY: BodyAnswers = {
  sex: "unspecified",
  age: "",
  weight: { unit: "st", major: "", minor: "" },
  height: { unit: "ft", major: "", minor: "" },
  activity: "light",
};

// ---- typing and switching units

const one = (n: number): string => String(Math.round(n * 10) / 10);
const isBlank = (b: Boxes<string>): boolean => b.major.trim() === "" && b.minor.trim() === "";

/** A box was typed in: the value is the person's own now, so any remembered copy in the other unit is dropped. */
export function typeWeight(w: WeightAnswer, patch: { major?: string; minor?: string }): WeightAnswer {
  return { unit: w.unit, major: patch.major ?? w.major, minor: patch.minor ?? w.minor };
}
export function typeHeight(h: HeightAnswer, patch: { major?: string; minor?: string }): HeightAnswer {
  return { unit: h.unit, major: patch.major ?? h.major, minor: patch.minor ?? h.minor };
}

/**
 * The weight in the other unit: what was typed is converted (to one decimal place) so the person keeps their own value. The conversion is not range
 * checked (a typo is still a typo in the other unit; the screen says so). Boxes that can't be read (empty, not a number, a part of a stone) come out empty.
 * Switching straight back gives the original boxes exactly.
 */
export function switchWeightUnit(w: WeightAnswer, to: WeightUnit): WeightAnswer {
  if (w.unit === to) return w;
  const now: WeightWas = { unit: w.unit, major: w.major, minor: w.minor, ...(w.exact !== undefined ? { exact: w.exact } : {}) };
  if (w.was && w.was.unit === to) return { ...w.was, was: now };
  const read = weightFromBoxes(w.unit, w.major, w.minor);
  if (!read) return isBlank(now) ? { unit: to, major: "", minor: "" } : { unit: to, major: "", minor: "", was: now };
  const kg = read.unit === "kg" ? read.kg : lbToKg(read.st * LB_PER_STONE + read.lb);
  const out = weightInputFromKg(kg, to);
  return out.unit === "kg" ? { unit: "kg", major: one(out.kg), minor: "", was: now, exact: kg } : { unit: "st", major: String(out.st), minor: String(out.lb), was: now, exact: kg };
}

/** The height in the other unit; the same rules as `switchWeightUnit`. */
export function switchHeightUnit(h: HeightAnswer, to: HeightUnit): HeightAnswer {
  if (h.unit === to) return h;
  const now: HeightWas = { unit: h.unit, major: h.major, minor: h.minor, ...(h.exact !== undefined ? { exact: h.exact } : {}) };
  if (h.was && h.was.unit === to) return { ...h.was, was: now };
  const read = heightFromBoxes(h.unit, h.major, h.minor);
  if (!read) return isBlank(now) ? { unit: to, major: "", minor: "" } : { unit: to, major: "", minor: "", was: now };
  const cm = read.unit === "cm" ? read.cm : inchesToCm(read.ft * INCHES_PER_FOOT + read.inch);
  const out = heightInputFromCm(cm, to);
  return out.unit === "cm" ? { unit: "cm", major: one(out.cm), minor: "", was: now, exact: cm } : { unit: "ft", major: String(out.ft), minor: String(out.inch), was: now, exact: cm };
}

// ---- what the answers come to

/** The kilograms the weight comes to, or undefined (empty, not a number, outside the range): the exact value that was typed before a unit switch, else what the boxes hold. */
export function weightKgOf(w: WeightAnswer): number | undefined {
  const exact = w.exact !== undefined ? toKg({ unit: "kg", kg: w.exact }) : undefined;
  return exact ?? readWeightKg(w.unit, w.major, w.minor);
}

/** The centimetres the height comes to, or undefined; the same rules as `weightKgOf`. */
export function heightCmOf(h: HeightAnswer): number | undefined {
  const exact = h.exact !== undefined ? toCm({ unit: "cm", cm: h.exact }) : undefined;
  return exact ?? readHeightCm(h.unit, h.major, h.minor);
}

// ---- what is wrong with the answers

/**
 * - "age": not a whole number from 18 to 100 (under 18 is not a problem here: it is its own plan, "under18").
 * - "weight" / "height": empty, not a number, or outside what the plan accepts (30 to 300 kg, 100 to 230 cm).
 * - "weight-part" / "height-part": a part of a stone or a foot in the stone or feet box ("5.10"): refused, the pounds or inches box is for that.
 */
export type BodyProblem = "age" | "weight" | "height" | "weight-part" | "height-part";

export function bodyProblems(body: BodyAnswers): BodyProblem[] {
  const out: BodyProblem[] = [];
  if (readAge(body.age).kind === "invalid") out.push("age");
  const w = body.weight;
  if (w.unit === "st" && isPartNumber(w.major)) out.push("weight-part");
  else if (weightKgOf(w) === undefined) out.push("weight");
  const h = body.height;
  if (h.unit === "ft" && isPartNumber(h.major)) out.push("height-part");
  else if (heightCmOf(h) === undefined) out.push("height");
  return out;
}

export interface AnswersPlan {
  /** "ok" with the four suggested targets and the notes, "under18" (no numbers), or "invalid" (something above is wrong, or nothing was answered). */
  plan: Plan;
  /** What is wrong, by key. Empty for "ok" and for "under18". */
  problems: BodyProblem[];
}

/**
 * The plan for what was typed, the goal and the diet chosen earlier. Under 18 is answered from the age alone (the height and weight are not even read).
 * Nothing typed is in the result: only the plan's own numbers and the keys of what is wrong.
 */
export function planFromAnswers(input: { goal: Goal; prefs: DietPrefs | null | undefined; body: BodyAnswers }): AnswersPlan {
  const { goal, prefs, body } = input;
  const age = readAge(body.age);
  if (age.kind === "under18") return { plan: { kind: "under18" }, problems: [] };
  const problems = bodyProblems(body);
  const weightKg = weightKgOf(body.weight);
  const heightCm = heightCmOf(body.height);
  if (problems.length > 0 || age.kind !== "ok" || weightKg === undefined || heightCm === undefined) return { plan: { kind: "invalid" }, problems };
  return { plan: planTargets({ sex: body.sex, age: age.age, weightKg, heightCm, activity: body.activity, goal, diet: dietKindFrom(prefs) }), problems: [] };
}

type OkPlan = Extract<Plan, { kind: "ok" }>;

/** The four suggested targets as the text for the four target boxes. */
export function targetTexts(plan: OkPlan): { calories: string; protein: string; carbs: string; fat: string } {
  return { calories: String(plan.calories), protein: String(plan.protein), carbs: String(plan.carbs), fat: String(plan.fat) };
}

/** A short key for a plan's numbers: the same key means the same suggestion, so the boxes the person has changed by hand are left alone. null for no numbers. */
export function planKey(plan: Plan | null): string | null {
  return plan && plan.kind === "ok" ? `${plan.calories}/${plan.protein}/${plan.carbs}/${plan.fat}` : null;
}

// ---- the four target boxes (calories, protein, carbs, fat) and the GLP-1 meal size

export interface TargetFieldTexts { calories: string; protein: string; carbs: string; fat: string; mealCap: string }
export type TargetFieldKey = keyof TargetFieldTexts;

export interface TargetFieldsReading {
  /** The numbers the boxes hold. Calories and the meal size are needed; protein, carbs and fat are undefined when empty (Home then works them out). */
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  mealCap?: number;
  /** Boxes with something wrong in them (the meal size only counts for the GLP-1 goal). Empty = fine to continue. */
  problems: TargetFieldKey[];
}

// The limits are the ones the screen has always had (calories 500 to 10,000; protein above 0 and at most 1,000 g; meal size 100 to 2,000) and the ones
// Settings has for carbs and fat (above 0 and at most MAX_MACRO_TARGET g).
const CALORIES_MIN = 500;
const CALORIES_MAX = 10000;
const PROTEIN_MAX = 1000;
const MEAL_CAP_MIN = 100;
const MEAL_CAP_MAX = 2000;

/**
 * Reads the boxes the way every number box in the app is read (`parseNumber`: a thousands comma, a decimal comma and digits typed in another numeral system
 * all count), and rounds to whole numbers, so "2,000" is 2000, "112.5" is 113 and "1e3" is not a number.
 */
export function readTargetFields(texts: TargetFieldTexts, glp1: boolean): TargetFieldsReading {
  const problems: TargetFieldKey[] = [];
  const out: TargetFieldsReading = { problems };
  const read = (raw: string, min: number, max: number): number | null | "bad" => {
    const n = parseNumber(raw);
    if (n === null || n === "bad") return n;
    const whole = Math.round(n);
    return whole >= min && whole <= max ? whole : "bad";
  };
  const calories = read(texts.calories, CALORIES_MIN, CALORIES_MAX);
  if (typeof calories === "number") out.calories = calories;
  else problems.push("calories");
  const grams = (key: "protein" | "carbs" | "fat", max: number) => {
    const n = read(texts[key], 1, max);
    if (n === null) return;
    if (n === "bad") problems.push(key);
    else out[key] = n;
  };
  grams("protein", PROTEIN_MAX);
  grams("carbs", MAX_MACRO_TARGET);
  grams("fat", MAX_MACRO_TARGET);
  const cap = read(texts.mealCap, MEAL_CAP_MIN, MEAL_CAP_MAX);
  if (typeof cap === "number") out.mealCap = cap;
  else if (glp1) problems.push("mealCap");
  return out;
}
