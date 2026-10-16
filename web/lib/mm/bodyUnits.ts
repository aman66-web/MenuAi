import { parseNumber } from "./addFood";

// Body measurements for the onboarding plan (founder 2026-10-16: age, sex, height, weight and how active, then targets pre-filled from them).
// Pure helpers: the exact conversions between kg / cm and stone-pounds / feet-inches, reading what a text box holds, and the ranges the plan
// accepts. A person's measurements are used once, on the phone, to work out suggested targets; nothing here stores or sends them (CLAUDE.md rule 4).

// ---- exact factors (the same ones SPEC §6.2 uses)
export const KG_PER_LB = 0.45359237;
export const LB_PER_STONE = 14;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

// ---- ranges the plan accepts (inclusive). Outside them the plan says "invalid" (or "under18" below AGE_MIN) and shows no numbers.
export const AGE_MIN = 18;
export const AGE_MAX = 100;
export const WEIGHT_KG_MIN = 30;
export const WEIGHT_KG_MAX = 300;
export const HEIGHT_CM_MIN = 100;
export const HEIGHT_CM_MAX = 230;

export type WeightUnit = "kg" | "st";
export type HeightUnit = "cm" | "ft";
export type WeightInput = { unit: "kg"; kg: number } | { unit: "st"; st: number; lb: number };
export type HeightInput = { unit: "cm"; cm: number } | { unit: "ft"; ft: number; inch: number };

const isNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const nonNegative = (n: unknown): n is number => isNumber(n) && n >= 0;
const round1 = (x: number): number => Math.round(x * 10) / 10;

// ---- plain conversions (no range check)

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;

/**
 * Body mass index = kg / (m x m): the one number `targets.ts` uses to notice a height and weight that look mistyped (a weight typed in the wrong
 * unit) and a plan that may not suit the person. It is never shown, never a judgement of a body, and not stored or sent. 0 for nonsense.
 */
export function bmi(kg: number, cm: number): number {
  if (!isNumber(kg) || !isNumber(cm) || kg <= 0 || cm <= 0) return 0;
  const m = cm / 100;
  return kg / (m * m);
}

// A weight written in stones and pounds (or a height in feet and inches) comes from kg (cm) rounded to one decimal place of pounds (inches), which can
// land up to half of that last place outside the range at its very edge (30 kg is 66.1 lb is 29.98 kg). That much is let through and brought to the
// edge, so switching the unit on an in-range value never makes it invalid. Typed in kg or cm there is no such slack.
const WEIGHT_SLACK_KG = 0.05 * KG_PER_LB + 1e-9;
const HEIGHT_SLACK_CM = 0.05 * CM_PER_INCH + 1e-9;

function withinRange(x: number, min: number, max: number, slack: number): number | undefined {
  if (x >= min && x <= max) return x;
  if (x < min && x >= min - slack) return min;
  if (x > max && x <= max + slack) return max;
  return undefined;
}

/** A weight in kilograms, or undefined when it is not a usable number or outside WEIGHT_KG_MIN..WEIGHT_KG_MAX (inclusive). */
export function toKg(w: WeightInput): number | undefined {
  if (!w || typeof w !== "object") return undefined;
  if (w.unit === "kg") {
    return isNumber(w.kg) ? withinRange(w.kg, WEIGHT_KG_MIN, WEIGHT_KG_MAX, 0) : undefined;
  }
  if (w.unit === "st") {
    if (!nonNegative(w.st) || !nonNegative(w.lb)) return undefined;
    return withinRange(lbToKg(w.st * LB_PER_STONE + w.lb), WEIGHT_KG_MIN, WEIGHT_KG_MAX, WEIGHT_SLACK_KG);
  }
  return undefined;
}

/** A height in centimetres, or undefined when it is not a usable number or outside HEIGHT_CM_MIN..HEIGHT_CM_MAX (inclusive). */
export function toCm(h: HeightInput): number | undefined {
  if (!h || typeof h !== "object") return undefined;
  if (h.unit === "cm") {
    return isNumber(h.cm) ? withinRange(h.cm, HEIGHT_CM_MIN, HEIGHT_CM_MAX, 0) : undefined;
  }
  if (h.unit === "ft") {
    if (!nonNegative(h.ft) || !nonNegative(h.inch)) return undefined;
    return withinRange(inchesToCm(h.ft * INCHES_PER_FOOT + h.inch), HEIGHT_CM_MIN, HEIGHT_CM_MAX, HEIGHT_SLACK_CM);
  }
  return undefined;
}

/** Kilograms as stones and pounds (pounds to 1 decimal place, always under 14), for switching a typed weight to another unit. */
export function kgToStonePounds(kg: number): { st: number; lb: number } {
  const totalLb = round1(kgToLb(kg));
  const st = Math.floor(totalLb / LB_PER_STONE);
  return { st, lb: round1(totalLb - st * LB_PER_STONE) };
}

/** Centimetres as feet and inches (inches to 1 decimal place, always under 12), for switching a typed height to another unit. */
export function cmToFeetInches(cm: number): { ft: number; inch: number } {
  const totalIn = round1(cmToInches(cm));
  const ft = Math.floor(totalIn / INCHES_PER_FOOT);
  return { ft, inch: round1(totalIn - ft * INCHES_PER_FOOT) };
}

/** A weight in kilograms written in the unit asked for. */
export function weightInputFromKg(kg: number, unit: WeightUnit): WeightInput {
  return unit === "kg" ? { unit: "kg", kg } : { unit: "st", ...kgToStonePounds(kg) };
}

/** A height in centimetres written in the unit asked for. */
export function heightInputFromCm(cm: number, unit: HeightUnit): HeightInput {
  return unit === "cm" ? { unit: "cm", cm } : { unit: "ft", ...cmToFeetInches(cm) };
}

// ---- reading what a text box holds
// Digits typed in another numeral system and a comma as the decimal point are read as numbers (parseNumber in addFood.ts). Empty, a minus sign,
// letters or anything else is "not a number" = undefined; nothing is guessed.

/** What one text box holds as a number, or undefined (empty, or not a number). A negative number can't be typed: "-" is not a digit. */
export function parseBox(raw: string): number | undefined {
  const v = parseNumber(raw);
  return typeof v === "number" ? v : undefined;
}

/**
 * True when a box holds a number with a fractional part ("5.10", "5,10", "11.7"). The stone and feet boxes take whole numbers only: "5.10" is how
 * many people write 5 ft 10 in, but read as a number it is 5.1 feet (155 cm, not 178 cm), so it is refused (the screen can say "Use the inches
 * box for part of a foot", "Use the pounds box for part of a stone") rather than read the wrong way. Pounds, inches, kg and cm may have a fraction.
 */
export function isPartNumber(raw: string): boolean {
  const v = parseNumber(raw);
  return typeof v === "number" && !Number.isInteger(v);
}

/** A two-box measurement (stones + pounds, feet + inches): one box may be empty (= 0) but not both; the first box must be a whole number. */
function readPair(major: string, minor: string): [number, number] | undefined {
  const a = parseNumber(major);
  const b = parseNumber(minor);
  if (a === "bad" || b === "bad") return undefined;
  if (a === null && b === null) return undefined;
  if (typeof a === "number" && !Number.isInteger(a)) return undefined;
  return [a ?? 0, b ?? 0];
}

/** The weight the boxes hold: kg in `major` (`minor` ignored), or stones in `major` (a whole number) and pounds in `minor`. Not range-checked: pass it to toKg. */
export function weightFromBoxes(unit: WeightUnit, major: string, minor = ""): WeightInput | undefined {
  if (unit === "kg") {
    const kg = parseBox(major);
    return kg === undefined ? undefined : { unit: "kg", kg };
  }
  const pair = readPair(major, minor);
  return pair ? { unit: "st", st: pair[0], lb: pair[1] } : undefined;
}

/** The height the boxes hold: cm in `major` (`minor` ignored), or feet in `major` (a whole number) and inches in `minor`. Not range-checked: pass it to toCm. */
export function heightFromBoxes(unit: HeightUnit, major: string, minor = ""): HeightInput | undefined {
  if (unit === "cm") {
    const cm = parseBox(major);
    return cm === undefined ? undefined : { unit: "cm", cm };
  }
  const pair = readPair(major, minor);
  return pair ? { unit: "ft", ft: pair[0], inch: pair[1] } : undefined;
}

/** The weight in kilograms the boxes hold, or undefined when empty, not a number or outside the range. */
export function readWeightKg(unit: WeightUnit, major: string, minor = ""): number | undefined {
  const w = weightFromBoxes(unit, major, minor);
  return w ? toKg(w) : undefined;
}

/** The height in centimetres the boxes hold, or undefined when empty, not a number or outside the range. */
export function readHeightCm(unit: HeightUnit, major: string, minor = ""): number | undefined {
  const h = heightFromBoxes(unit, major, minor);
  return h ? toCm(h) : undefined;
}

export type AgeReading = { kind: "ok"; age: number } | { kind: "under18" } | { kind: "invalid" };

/**
 * The age box. A whole number from AGE_MIN to AGE_MAX is "ok"; a whole number from 1 to 17 is "under18" (the plan shows no numbers, only the
 * existing "Ask a doctor or dietitian for targets."); everything else (empty, 0, a part number, over AGE_MAX, not a number) is "invalid".
 */
export function readAge(raw: string): AgeReading {
  const v = parseNumber(raw);
  if (typeof v !== "number" || !Number.isInteger(v)) return { kind: "invalid" };
  if (v >= AGE_MIN && v <= AGE_MAX) return { kind: "ok", age: v };
  if (v >= 1 && v < AGE_MIN) return { kind: "under18" };
  return { kind: "invalid" };
}

/** The age from AGE_MIN to AGE_MAX the box holds, else undefined (see readAge for under 18). */
export function parseAge(raw: string): number | undefined {
  const r = readAge(raw);
  return r.kind === "ok" ? r.age : undefined;
}
