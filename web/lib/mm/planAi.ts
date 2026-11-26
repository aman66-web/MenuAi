import {
  EXERCISE_CHOICES, GOAL_PACES, LIFTING, SESSION_MINUTES, SPORT_KINDS, TRAINING_KINDS,
  type ExerciseChoice, type GoalPace, type Lifting, type SessionMinutes, type SportKind, type TrainingKind,
} from "./bodyGoal";
import { GATING_ENABLED } from "./config";
import { cleanFruitVegAim, type FruitVegAim } from "./fiveADay";
import type { AgeGroup, PortionSize } from "./household";
import type { BreadLike } from "./mealBalance";
import type { MealType } from "./recipes";
import { CUISINES, type CuisineId } from "./recipeBook/niches";

// Meal plan with Pip (founder 2026-11-21: "we want to use full customization. Use Opus to make the meal timetable ... it's got to be the perfect diet. I'm fine
// for you to ask as many questions as you want ... It's just got to be the perfect plan for them to be like, oh my god, this is exactly what I wanted"; earlier
// that day: "Everyone has a different lifestyle. Some people can be bodybuilders ... if they're trying to bulk, they want to cut ... or if they're just eating
// for fun"). Pip asks more about the person's week (their aim, training, cooking time, leftovers, spice, breakfast, bread and a note in their own words), and with
// Premium and a connection the AI chooses and orders the week from our own recipes, the ones the phone has already fitted and priced for them. It never makes a
// number: every figure, price and shopping line still comes from the shops' labels (CLAUDE.md rule 1); the phone checks every recipe it chooses and falls back to
// its own planner wherever an answer can't be used (lib/mm/planAiWeek.ts). This file is what the phone and the server share (POST /api/v1/plan/ai,
// lib/planAiHandler.ts): the answers, the request's shape and the checks on the answer. Pure, no recipe book, so the server route stays small.

/** The route answers unless NEXT_PUBLIC_PLAN_AI=0 (it still needs Premium and ANTHROPIC_API_KEY). */
export const PLAN_AI_API_ENABLED = process.env.NEXT_PUBLIC_PLAN_AI !== "0";
/** Pip's extra questions and the AI plan exist only where Meal plan is Premium (the iPhone app; never free, where nothing could use the answers). */
export const PLAN_AI_ENABLED = PLAN_AI_API_ENABLED && GATING_ENABLED;

export const AIMS = ["loseFat", "muscle", "sport", "steady", "eatWell"] as const;
export type PlanAim = (typeof AIMS)[number];
export const TRAINING = ["none", "1-2", "3-4", "5+"] as const;
export type Training = (typeof TRAINING)[number];
/** Minutes of cooking (60 = an hour or more). */
export const COOK_TIMES = [15, 30, 45, 60] as const;
export type CookTime = (typeof COOK_TIMES)[number];
export const SPICES = ["mild", "medium", "hot"] as const;
export type Spice = (typeof SPICES)[number];
export const BREAKFASTS = ["sweet", "savoury", "quick"] as const;
export type BreakfastLike = (typeof BREAKFASTS)[number];
export const BREADS = ["mostDays", "fewTimes", "rarely"] as const satisfies readonly BreadLike[];
/** The meal that may be the day's biggest (founder 2026-11-26, the flowchart's questions): its share of the day grows (mealPlan.ts BIG_MEAL_SHARE). */
export const BIG_MEALS = ["breakfast", "lunch", "dinner"] as const;
export type BigMeal = (typeof BIG_MEALS)[number];
/** The longest note to Pip. */
export const MAX_NOTES = 300;
/** Days of the week as the phone's clock counts them: 0 Sunday to 6 Saturday. */
export const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 0] as const;

/** Pip's extra questions, as answered (nothing answered: absent). Kept with the plan on this phone (SavedPlan.answers); sent only to make the week. */
export interface PlanAnswers {
  aim?: PlanAim;
  /** Fruit and veg portions a day they aim for, counted the NHS way (fiveADay.ts), or "none": they said no aim. */
  fruitVeg?: FruitVegAim | "none";
  training?: Training;
  /** The days they train (0 Sunday to 6 Saturday), when they said; otherwise Pip spreads the training days out. */
  trainingDays?: number[];
  // the flowchart's questions (founder 2026-11-26: "different questions may need to be asked based on what they put for earlier questions"); the body's own
  // answers (weight, body fat, goal) are never here: they stay on the phone in the saved plan's goal (bodyGoal.ts), and only these choices go to Pip
  /** What their training is (when they train). */
  trainingKind?: TrainingKind;
  /** Training for a sport: what kind. */
  sportKind?: SportKind;
  /** A usual session's length (their own training, or a sport). */
  sessionMinutes?: SessionMinutes;
  /** Building muscle: how long they have lifted weights. */
  lifting?: Lifting;
  /** Losing fat or building muscle: Pip plans the exercise, or they keep their own. */
  exercise?: ExerciseChoice;
  /** Losing fat or building muscle: Steady or Faster. */
  pace?: GoalPace;
  /** The meal they like to be the day's biggest. */
  bigMeal?: BigMeal;
  cookWeekday?: CookTime;
  cookWeekend?: CookTime;
  /** Happy to cook once and eat it twice. */
  leftovers?: boolean;
  /** Kinds of food they'd rather skip for lunch and dinner. */
  skipCuisines?: CuisineId[];
  spice?: Spice;
  breakfast?: BreakfastLike[];
  bread?: BreadLike;
  /** Anything else, in their own words (at most MAX_NOTES characters). */
  notes?: string;
}

const pick = <T extends string | number>(list: readonly T[], x: unknown): T | undefined => (list as readonly unknown[]).includes(x) ? (x as T) : undefined;

/** A note as it may be kept and sent: no control characters, spaces collapsed, at most MAX_NOTES characters. */
export function cleanNotes(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOTES).trim();
}

/** The answers as kept or received: known values only, each list once in a fixed order. */
export function sanitizeAnswers(raw: unknown): PlanAnswers {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: PlanAnswers = {};
  const aim = pick(AIMS, r.aim);
  if (aim) out.aim = aim;
  const fruitVeg = r.fruitVeg === "none" ? "none" : cleanFruitVegAim(r.fruitVeg);
  if (fruitVeg) out.fruitVeg = fruitVeg;
  const training = pick(TRAINING, r.training);
  if (training) out.training = training;
  if (training && training !== "none" && Array.isArray(r.trainingDays)) {
    const days = WEEKDAY_NUMBERS.filter((d) => (r.trainingDays as unknown[]).includes(d));
    if (days.length) out.trainingDays = [...days];
  }
  const trainingKind = pick(TRAINING_KINDS, r.trainingKind);
  if (trainingKind && training && training !== "none") out.trainingKind = trainingKind;
  const sportKind = pick(SPORT_KINDS, r.sportKind);
  if (sportKind && aim === "sport") out.sportKind = sportKind;
  const sessionMinutes = pick(SESSION_MINUTES, r.sessionMinutes);
  if (sessionMinutes) out.sessionMinutes = sessionMinutes;
  const lifting = pick(LIFTING, r.lifting);
  if (lifting && aim === "muscle") out.lifting = lifting;
  const exercise = pick(EXERCISE_CHOICES, r.exercise);
  if (exercise && (aim === "loseFat" || aim === "muscle")) out.exercise = exercise;
  const pace = pick(GOAL_PACES, r.pace);
  if (pace && (aim === "loseFat" || aim === "muscle")) out.pace = pace;
  const bigMeal = pick(BIG_MEALS, r.bigMeal);
  if (bigMeal) out.bigMeal = bigMeal;
  const weekday = pick(COOK_TIMES, r.cookWeekday);
  if (weekday) out.cookWeekday = weekday;
  const weekend = pick(COOK_TIMES, r.cookWeekend);
  if (weekend) out.cookWeekend = weekend;
  if (typeof r.leftovers === "boolean") out.leftovers = r.leftovers;
  if (Array.isArray(r.skipCuisines)) {
    const skip = CUISINES.map((c) => c.id).filter((id) => (r.skipCuisines as unknown[]).includes(id));
    if (skip.length) out.skipCuisines = skip;
  }
  const spice = pick(SPICES, r.spice);
  if (spice) out.spice = spice;
  if (Array.isArray(r.breakfast)) {
    const b = BREAKFASTS.filter((x) => (r.breakfast as unknown[]).includes(x));
    if (b.length) out.breakfast = [...b];
  }
  const bread = pick(BREADS, r.bread);
  if (bread) out.bread = bread;
  const notes = cleanNotes(r.notes);
  if (notes) out.notes = notes;
  return out;
}

/** Whether any of Pip's extra questions has an answer (none: the week is the phone's own, the same one Meal plan's first open shows before Premium). */
export const hasPipAnswers = (a: PlanAnswers): boolean => Object.keys(sanitizeAnswers(a)).length > 0;

// ------------------------------------------------------------------------------------------------ what the phone sends

/** One recipe Pip may choose for a meal, with the person's own serving's figures (from the labels) and what a serving costs. */
export interface AiCandidate {
  id: string;
  name: string;
  /** The recipe book's cuisine (niches.ts), or null. */
  cuisine: string | null;
  /** What kind of dish it is (dishForm.ts). */
  form: string;
  /** What most of a lunch's or dinner's protein comes from (mealBalance.ts), or null. */
  main: string | null;
  /** Every ingredient that leads part of the meal (mealBalance.ts featured). */
  leads: string[];
  minutes: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Fruit and veg portions, and bean and pulse portions, in the person's serving (fiveADay.ts, from the recipe's own weights; one decimal). */
  fruitVeg: number;
  pulses: number;
  /** £ a serving (for a household: everyone's servings). */
  cost: number;
  tags: Array<"spicy" | "cheesy" | "bread">;
}

export interface AiDay {
  /** "Saturday" */
  name: string;
  weekend: boolean;
  training: boolean;
}

export interface PlanAiRequest {
  answers: PlanAnswers;
  /** How they like to eat (mealPlan.ts EATING_STYLES): the recipes are already of it. */
  style: string;
  /** The kinds of food they chose for lunch and dinner (the recipes sent are of them, where there are enough). */
  cuisines: CuisineId[];
  /** The day's meals and snacks in order (planSlots). */
  slots: MealType[];
  /** Each meal's size, from the person's own daily numbers. */
  targets: Partial<Record<MealType, { kcal: number; protein: number }>>;
  daily: { kcal: number; protein: number };
  /** The plan's seven days, from today. */
  days: AiDay[];
  /** Everyone else the meals are cooked for: age group and portion size only (never a name or their own numbers), or null for just the person. */
  household: { others: Array<{ group: AgeGroup; portion: PortionSize }> } | null;
  /** How often a recipe may come round (mealPlan.ts VARIETIES). */
  variety: 7 | 4 | 2;
  budget: number | null;
  /** The week the phone's own planner made (days × slots of ids) and what its shopping comes to. */
  draft: string[][];
  draftCost: number;
  /** The recipes for each meal of the day. */
  candidates: Partial<Record<MealType, AiCandidate[]>>;
}

/** The most recipes sent for each meal. */
export const AI_CANDIDATES = 40;

// ------------------------------------------------------------------------------------------------ what comes back

/** The week Pip chose: days × slots of recipe ids (null: an answer that wasn't one of that meal's recipes), and a sentence or two of why. */
export interface PlanAiAnswer {
  ids: Array<Array<string | null>>;
  why: string;
}

/**
 * Pip's week checked against what was sent: seven days, each with the day's slots, every id one of that slot's recipes (anything else is null). Null when the
 * answer isn't a week at all, or when more than a third of it is unusable (`bad` counts the cells that were nulled).
 */
export function checkAiIds(raw: unknown, req: Pick<PlanAiRequest, "slots" | "candidates" | "days">): { ids: Array<Array<string | null>>; bad: number } | null {
  if (!Array.isArray(raw) || raw.length !== req.days.length) return null;
  const allowed = new Map<MealType, Set<string>>();
  for (const [m, list] of Object.entries(req.candidates) as Array<[MealType, AiCandidate[]]>) allowed.set(m, new Set(list.map((c) => c.id)));
  let bad = 0;
  const ids: Array<Array<string | null>> = [];
  for (const day of raw) {
    if (!Array.isArray(day) || day.length !== req.slots.length) return null;
    const seen = new Set<string>();
    ids.push(day.map((id, i) => {
      const meal = req.slots[i]!;
      // the same recipe twice in one day (two snacks) is not a choice the plan allows
      const ok = typeof id === "string" && !!allowed.get(meal)?.has(id) && !seen.has(`${meal}:${id}`);
      if (!ok) { bad++; return null; }
      seen.add(`${meal}:${id}`);
      return id as string;
    }));
  }
  const cells = req.days.length * req.slots.length;
  return bad * 3 > cells ? null : { ids, bad };
}

/** The longest "why this week" kept. */
export const MAX_WHY = 320;

/**
 * Words Pip's note may never use (CLAUDE.md rule 3: no medical claims, food never called good, bad or healthy): any of these and the note is dropped (the week
 * is kept). Figures too: Pip never stands beside a number (the screens carry them).
 */
const WHY_BANNED = /\b(?:healthy|healthier|healthiest|unhealthy|health|good for|bad for|clean eating|clean|junk|nutritious|wholesome|superfoods?|detox|toxins?|cure|cures|heal|medic\w*|medication|doctor|diabet\w*|cholesterol|blood|heart|immun\w*|vitamins?|minerals?|burn(?:s|ing)? fat|fat[- ]burning|metabolism|guilt[- ]free|cheat|sinful|naughty|diet pills?|weight[- ]loss drug|ozempic|wegovy|mounjaro|glp-?1)\b/i;

/** Pip's note as it may be shown: one or two plain sentences, no digits, none of WHY_BANNED, at most MAX_WHY characters; null otherwise. */
export function cleanWhy(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (s.length < 10 || s.length > MAX_WHY) return null;
  if (/[0-9£$%<>{}[\]\\]/.test(s) || WHY_BANNED.test(s)) return null;
  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 3) return null;
  return s;
}
