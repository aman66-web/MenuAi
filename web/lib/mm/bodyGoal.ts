import { tk } from "./i18n";
import { ACTIVITY_FACTOR, MIN_SUGGESTED_CALORIES, SEX_OFFSET } from "./targets";

// Meal plan's goal (founder 2026-11-26: "depending on what they're doing maybe they have a target weight etc and body fat, based on that you should give them
// the optimal diet for whatever they are trying to achieve"; "state ... how long it will take them to reach their goal"; "make it realistic"; "tell them the
// best exercise per day"; "recommended 1 hr of exercise, weight training etc and how much that would burn"; "someone should just be able to put their current
// weight and body fat (if they know body fat)"; "the body fat questions should only be asked to someone who maybe wants to cut or bulk"; numbers approved the
// same day: "Yes, use these"; "people should be able to input if they are an athlete etc and it will have the most perfect meal timetable based on them"). Pure, no SwiftUI or React, unit-tested (tests/bodyGoal.test.ts).
//
// What it works out, from the person's weight, body fat (typed, or the drawing closest to them), goal weight, day-to-day activity, training and pace:
//   - what they burn: Katch-McArdle (370 + 21.6 × lean kg) × the day-to-day factor (targets.ts ACTIVITY_FACTOR, not counting workouts), plus each day's
//     exercise from the Compendium of Physical Activities (the MET values below; net of rest, so nothing is counted twice);
//   - what to eat: losing fat, 0.5% (Steady) or 1% (Faster) of body weight a week, never more than 1 kg (the NHS's range), never under 1,200 kcal or 75% of
//     what they burn; building muscle, 250 (Steady) or 500 (Faster) kcal a day over;
//   - protein: 2 g for each kg of lean mass;
//   - training for a sport (no body fat asked): Mifflin-St Jeor from weight, height, age and sex × the day-to-day factor, plus their own sessions, to keep their
//     weight while they train (training days get meals with more carbs: Pip's plan); protein 1.6 g a kg;
//   - how long: week by week, because a lighter body burns less. A quarter of any change is lean mass, and they make a new plan every 4 weeks with their new
//     weight (the screen says so). Shown as a range: the quicker end if everything goes to plan, the slower if three quarters of it does (missed days, and a
//     body that adapts), so the date is realistic, not a promise;
//   - and the cases it never plans: under 18, pregnant or breastfeeding, a goal the wrong way for the aim, or a goal lighter than LOWEST_GOAL_BODY_FAT allows.
// Every figure is a suggested starting point (SUGGESTION_NOTE), never medical advice (CLAUDE.md rule 3), and never a figure about a food (rule 1: the meals'
// figures still come from the labels). Body details stay on the phone (rule 4): they are kept with the saved plan (mealPlanStore, never synced) and never sent.

/** The aims that ask about the body: cutting, bulking and training for a sport (keeping steady and just eating well go on with the person's own daily targets). */
export type GoalAim = "loseFat" | "muscle" | "sport";
export const GOAL_AIMS: readonly GoalAim[] = ["loseFat", "muscle", "sport"];
/** The aims with a goal weight, body fat and a pace (founder: body fat "only ... to someone who maybe wants to cut or bulk"). */
export const WEIGHT_GOAL_AIMS: readonly GoalAim[] = ["loseFat", "muscle"];
export const hasWeightGoal = (aim: GoalAim): aim is "loseFat" | "muscle" => aim === "loseFat" || aim === "muscle";
/** The drawings' set (body fat sits differently on women and men), also the lowest goal's measure. */
export type BodySet = "female" | "male";
export type GoalPace = "steady" | "faster";
/** Day to day, not counting workouts (each workout is added on its own). */
export type DayToDay = "sedentary" | "light" | "active";
export type TrainingKind = "weights" | "cardio" | "sport" | "mix";
/** An athlete's sport, by the kind of training it takes. */
export type SportKind = "endurance" | "team" | "power";
export type Lifting = "new" | "underYear" | "fewYears" | "longer";
/** Pip plans the week's exercise, or counts the person's own. */
export type ExerciseChoice = "plan" | "own";
export type SessionMinutes = 30 | 45 | 60 | 90;
export type Training = "none" | "1-2" | "3-4" | "5+";

export const BODY_SETS: readonly BodySet[] = ["female", "male"];
export const GOAL_PACES: readonly GoalPace[] = ["steady", "faster"];
export const DAY_TO_DAY: readonly DayToDay[] = ["sedentary", "light", "active"];
export const TRAINING_KINDS: readonly TrainingKind[] = ["weights", "cardio", "sport", "mix"];
export const SPORT_KINDS: readonly SportKind[] = ["endurance", "team", "power"];
export const LIFTING: readonly Lifting[] = ["new", "underYear", "fewYears", "longer"];
export const EXERCISE_CHOICES: readonly ExerciseChoice[] = ["plan", "own"];
export const SESSION_MINUTES: readonly SessionMinutes[] = [30, 45, 60, 90];

/** Losing fat: the share of body weight a week (founder 2026-11-26). */
export const LOSE_SHARE_A_WEEK: Record<GoalPace, number> = { steady: 0.005, faster: 0.01 };
/** Never more than this a week (the NHS: 0.5 to 1 kg a week). */
export const MAX_LOSS_KG_A_WEEK = 1;
/** Building muscle: kcal a day over what they burn. */
export const GAIN_SURPLUS: Record<GoalPace, number> = { steady: 250, faster: 500 };
/** Food never under this share of what they burn (and never under MIN_SUGGESTED_CALORIES). */
export const MIN_SHARE_OF_BURN = 0.75;
/** kcal in a kg of body weight, for the time to the goal. */
export const KCAL_PER_KG = 7700;
/** Protein for each kg of lean mass (founder 2026-11-26). */
export const PROTEIN_PER_KG_LEAN = 2;
/** Protein for each kg of body weight when body fat isn't asked (training for a sport; founder 2026-11-26). */
export const PROTEIN_PER_KG_WEIGHT = 1.6;
/** The slower end of the time to the goal: this share of the planned change happens (missed days, a body that adapts). */
export const REAL_LIFE_SHARE = 0.75;
/** Of any change in weight, this share is lean mass (the rest fat), for the week-by-week time. */
export const LEAN_SHARE_OF_CHANGE = 0.25;
/** A new plan with the new weight every this many weeks (the screen asks for it; the time assumes it). */
export const REPLAN_WEEKS = 4;
/** Times past this many weeks are "more than 3 years". */
export const MAX_WEEKS = 156;
/** A goal is never planned below this body fat % (assuming lean mass kept): under it, "please talk to your GP first". */
export const LOWEST_GOAL_BODY_FAT: Record<BodySet, number> = { female: 18, male: 10 };
export const BODY_FAT_MIN = 4;
export const BODY_FAT_MAX = 60;
export const AGE_MIN = 18;
export const AGE_MAX = 100;
export const KG_MIN = 30;
export const KG_MAX = 300;
export const CM_MIN = 100;
export const CM_MAX = 230;
/** The drawings: about this body fat %, lowest first (the usual published guides' steps). */
export const BODY_FAT_DRAWINGS: Record<BodySet, readonly number[]> = { female: [15, 20, 25, 30, 35, 40], male: [10, 15, 20, 25, 30, 35] };

/**
 * Exercise at about this many times resting energy (MET), from the Compendium of Physical Activities (Ainsworth et al. 2011; Herrmann et al. 2024): strength
 * training, several exercises 8 to 15 reps (3.5); walking briskly, about 5.6 km/h (4.3); walking at an easy pace, about 4 km/h (3.0); running or other cardio
 * at a moderate effort (7.0); sport played for fun (6.0); a mix of weights and cardio (5.0).
 */
export const MET: Record<"strength" | "brisk" | "easy" | "cardio" | "sport" | "mix", number> = { strength: 3.5, brisk: 4.3, easy: 3.0, cardio: 7.0, sport: 6.0, mix: 5.0 };

export type ExerciseKind = "strength" | "brisk" | "easy" | "cardio" | "sport" | "mix" | "rest";
export type StrengthFocus = "whole" | "upper" | "lower";

/** One day's exercise: the weekday (0 Sunday to 6 Saturday), what, for how long and about what it burns (net of rest, for the person's weight). */
export interface ExerciseDay {
  day: number;
  kind: ExerciseKind;
  focus?: StrengthFocus;
  minutes: number;
  kcal: number;
}

/** What the person told the goal steps (all on this phone only). Absent: not answered yet. */
export interface BodyGoal {
  set?: BodySet;
  age?: number;
  weightKg?: number;
  bodyFat?: number;
  goalKg?: number;
  /** Training for a sport only (no body fat asked there). */
  heightCm?: number;
  /** How they typed their weight (stone and pounds, or kilograms), so the goal is said back the same way. */
  unit?: "kg" | "st";
  pregnant?: boolean;
  dayToDay?: DayToDay;
}

/** The training answers that shape the week's exercise (planAi.ts PlanAnswers carries them). */
export interface TrainingAnswers {
  training?: Training;
  trainingDays?: readonly number[];
  trainingKind?: TrainingKind;
  sportKind?: SportKind;
  sessionMinutes?: SessionMinutes;
  lifting?: Lifting;
  exercise?: ExerciseChoice;
  pace?: GoalPace;
}

export type GoalOutcome =
  | { kind: "incomplete" }
  | { kind: "under18" }
  | { kind: "pregnant" }
  | { kind: "wrongWay" }
  | { kind: "tooLean"; lowestKg: number }
  | {
      kind: "ok";
      aim: GoalAim;
      kcal: number;
      protein: number;
      /** What they burn a day now: body and day-to-day, and the week's exercise a day. */
      burnBody: number;
      burnExercise: number;
      lean: number;
      /** The first week's change in kg (minus: losing). */
      weeklyKg: number;
      /** Weeks to the goal: the quicker and the slower end; null when it is more than MAX_WEEKS away. */
      weeks: [number, number] | null;
      /** The food was held at the lowest it may be, so the pace is slower than asked. */
      floored: boolean;
      exercise: ExerciseDay[];
    };

const round = (x: number, step: number) => Math.round(x / step) * step;
const inRange = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

/** Monday first, as the plan's days are shown. */
const WEEK: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
/** Strength days by how many, when the person didn't say which. */
const DEFAULT_DAYS: Record<number, readonly number[]> = { 1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6] };

/** How many strength sessions Pip plans, from how often they train now: losing fat 2 to 4 (the NHS: strength at least twice a week), building muscle 3 to 5. */
export function strengthDays(aim: GoalAim, training: Training | undefined, lifting?: Lifting): number {
  const step = training === "5+" ? 2 : training === "3-4" ? 1 : 0;
  if (aim === "loseFat") return 2 + step;
  // someone new to weights starts with three whole-body sessions
  return lifting === "new" ? 3 : 3 + step;
}

/** Net kcal of a session: (MET − 1) × kg × hours, to the nearest 10. */
export function sessionKcal(met: number, kg: number, minutes: number): number {
  return Math.max(0, round((met - 1) * kg * (minutes / 60), 10));
}

/** The person's own training days, or the usual spread for how many. */
function pickDays(count: number, chosen: readonly number[] | undefined): number[] {
  const own = WEEK.filter((d) => chosen?.includes(d));
  if (own.length === count) return own;
  if (own.length > count) return own.slice(0, count);
  // too few chosen: theirs, then the usual days to make up the count
  const out = [...own];
  for (const d of DEFAULT_DAYS[count] ?? DEFAULT_DAYS[3]!) if (out.length < count && !out.includes(d)) out.push(d);
  for (const d of WEEK) if (out.length < count && !out.includes(d)) out.push(d);
  return WEEK.filter((d) => out.includes(d));
}

/**
 * The week's exercise, Monday first. "plan": Pip's week for the aim (losing fat: whole-body strength 45 min, brisk walks of 45 min, one easy walk; building
 * muscle: strength 60 min (upper and lower body from four days), two brisk walks of 30 min, rest days). "own": the person's own sessions, at their length, on
 * their days; nothing else added.
 */
export function exerciseWeek(aim: GoalAim, kg: number, t: TrainingAnswers): ExerciseDay[] {
  const at = (day: number, kind: ExerciseKind, minutes: number, focus?: StrengthFocus): ExerciseDay => {
    const met = kind === "rest" ? 1 : MET[kind];
    return { day, kind, minutes, kcal: kind === "rest" ? 0 : sessionKcal(met, kg, minutes), ...(focus ? { focus } : {}) };
  };
  if (aim === "sport" || t.exercise === "own") {
    if (!t.training || t.training === "none") return WEEK.map((d) => at(d, "rest", 0));
    const count = t.training === "1-2" ? 2 : t.training === "3-4" ? 3 : 5;
    const days = pickDays(count, t.trainingDays);
    const kind: ExerciseKind = aim === "sport"
      ? (t.sportKind === "endurance" ? "cardio" : t.sportKind === "power" ? "mix" : "sport")
      : t.trainingKind === "cardio" ? "cardio" : t.trainingKind === "sport" ? "sport" : t.trainingKind === "mix" ? "mix" : "strength";
    const minutes = t.sessionMinutes ?? 60;
    return WEEK.map((d) => (days.includes(d) ? at(d, kind, minutes, kind === "strength" ? "whole" : undefined) : at(d, "rest", 0)));
  }
  const n = strengthDays(aim, t.training, t.lifting);
  const days = pickDays(n, t.training && t.training !== "none" ? t.trainingDays : undefined);
  const free = WEEK.filter((d) => !days.includes(d));
  const split = aim === "muscle" && n >= 4;
  let s = 0;
  return WEEK.map((d) => {
    if (days.includes(d)) {
      const focus: StrengthFocus = split ? (s++ % 2 === 0 ? "upper" : "lower") : "whole";
      return at(d, "strength", aim === "muscle" ? 60 : 45, focus);
    }
    const i = free.indexOf(d);
    if (aim === "loseFat") return i === free.length - 1 ? at(d, "easy", 30) : at(d, "brisk", 45);
    // building muscle: two brisk walks, spread out, and rest
    const walks = free.length >= 3 ? [free[0], free[2]] : free.slice(0, 2);
    return walks.includes(d) ? at(d, "brisk", 30) : at(d, "rest", 0);
  });
}

/** Lean mass from weight and body fat %. */
export const leanOf = (kg: number, bodyFat: number) => kg * (1 - bodyFat / 100);

/** What the body burns a day at this lean mass, not counting workouts (Katch-McArdle × the day-to-day factor). */
export function bodyBurn(lean: number, dayToDay: DayToDay): number {
  return (370 + 21.6 * lean) * ACTIVITY_FACTOR[dayToDay];
}

/** Mifflin-St Jeor × the day-to-day factor (training for a sport: no body fat asked). */
export function mifflinBurn(b: { set: BodySet; age: number; weightKg: number; heightCm: number }, dayToDay: DayToDay): number {
  return (10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + SEX_OFFSET[b.set]) * ACTIVITY_FACTOR[dayToDay];
}

/** The day's food at this weight (the lowest it may be, and whether that held it). */
function foodFor(aim: GoalAim, pace: GoalPace, kg: number, burn: number): { kcal: number; floored: boolean } {
  if (aim === "sport") return { kcal: burn, floored: false };
  if (aim === "muscle") return { kcal: burn + GAIN_SURPLUS[pace], floored: false };
  const lossKg = Math.min(MAX_LOSS_KG_A_WEEK, LOSE_SHARE_A_WEEK[pace] * kg);
  const want = burn - (lossKg * KCAL_PER_KG) / 7;
  const floor = Math.max(MIN_SUGGESTED_CALORIES, MIN_SHARE_OF_BURN * burn);
  return want < floor ? { kcal: floor, floored: true } : { kcal: want, floored: false };
}

/**
 * Weeks to the goal, week by week: each week the change is (food − burn) × 7 / KCAL_PER_KG × share; a quarter of it is lean mass; the exercise burns in step
 * with the weight; every REPLAN_WEEKS the food is worked out again at the new weight. Null past MAX_WEEKS or once the change stops.
 */
export function weeksToGoal(o: { aim: GoalAim; pace: GoalPace; kg: number; lean: number; goalKg: number; dayToDay: DayToDay; exerciseWeekKcal: number }, share = 1): number | null {
  let kg = o.kg;
  let lean = o.lean;
  let food = 0;
  for (let week = 0; week < MAX_WEEKS; week++) {
    const burn = bodyBurn(lean, o.dayToDay) + (o.exerciseWeekKcal * (kg / o.kg)) / 7;
    if (week % REPLAN_WEEKS === 0) food = foodFor(o.aim, o.pace, kg, burn).kcal;
    const change = ((food - burn) * 7 * share) / KCAL_PER_KG;
    if (o.aim === "loseFat" ? change > -0.01 : change < 0.01) return null;
    const next = kg + change;
    if (o.aim === "loseFat" ? next <= o.goalKg : next >= o.goalKg) return week + 1;
    lean += change * LEAN_SHARE_OF_CHANGE;
    kg = next;
  }
  return null;
}

/** The lightest goal planned for: body fat no lower than LOWEST_GOAL_BODY_FAT, if lean mass is kept. */
export const lowestGoalKg = (lean: number, set: BodySet) => lean / (1 - LOWEST_GOAL_BODY_FAT[set] / 100);

/** Whether the body answers are all there for this aim. */
export function bodyComplete(aim: GoalAim, b: BodyGoal): boolean {
  const base = !!b.set && inRange(b.age, 0, AGE_MAX) && inRange(b.weightKg, KG_MIN, KG_MAX) && !!b.dayToDay;
  if (aim === "sport") return base && inRange(b.heightCm, CM_MIN, CM_MAX);
  return base && inRange(b.bodyFat, BODY_FAT_MIN, BODY_FAT_MAX) && inRange(b.goalKg, KG_MIN, KG_MAX);
}

/** The goal worked out (see the top of this file). */
export function goalOutcome(aim: GoalAim, b: BodyGoal, t: TrainingAnswers): GoalOutcome {
  if (inRange(b.age, 0, AGE_MIN - 0.001)) return { kind: "under18" };
  if (b.pregnant && hasWeightGoal(aim)) return { kind: "pregnant" };
  if (!bodyComplete(aim, b)) return { kind: "incomplete" };
  const kg = b.weightKg!;
  if (aim === "sport") {
    const exercise = exerciseWeek(aim, kg, t);
    const burnBody = mifflinBurn({ set: b.set!, age: b.age!, weightKg: kg, heightCm: b.heightCm! }, b.dayToDay!);
    const burnExercise = exercise.reduce((n, d) => n + d.kcal, 0) / 7;
    return {
      kind: "ok", aim, kcal: round(burnBody + burnExercise, 10), protein: round(kg * PROTEIN_PER_KG_WEIGHT, 5), burnBody: round(burnBody, 10),
      burnExercise: round(burnExercise, 10), lean: 0, weeklyKg: 0, weeks: null, floored: false, exercise,
    };
  }
  const lean = leanOf(kg, b.bodyFat!);
  const pace = t.pace ?? "steady";
  const goal = b.goalKg!;
  if (aim === "loseFat" ? goal >= kg - 0.5 : goal <= kg + 0.5) return { kind: "wrongWay" };
  if (aim === "loseFat") {
    const lowest = lowestGoalKg(lean, b.set!);
    if (goal < lowest) return { kind: "tooLean", lowestKg: Math.ceil(lowest) };
  }
  const exercise = exerciseWeek(aim, kg, t);
  const exerciseWeekKcal = exercise.reduce((n, d) => n + d.kcal, 0);
  const burnBody = bodyBurn(lean, b.dayToDay!);
  const burnExercise = exerciseWeekKcal / 7;
  const food = foodFor(aim, pace, kg, burnBody + burnExercise);
  const kcal = round(food.kcal, 10);
  const protein = round(lean * PROTEIN_PER_KG_LEAN, 5);
  const weeklyKg = Math.round((((kcal - burnBody - burnExercise) * 7) / KCAL_PER_KG) * 100) / 100;
  const o = { aim, pace, kg, lean, goalKg: goal, dayToDay: b.dayToDay!, exerciseWeekKcal };
  const quick = weeksToGoal(o, 1);
  const slow = weeksToGoal(o, REAL_LIFE_SHARE);
  const weeks: [number, number] | null = quick !== null && slow !== null ? [quick, Math.max(quick, slow)] : null;
  return { kind: "ok", aim, kcal, protein, burnBody: round(burnBody, 10), burnExercise: round(burnExercise, 10), lean: Math.round(lean * 10) / 10, weeklyKg, weeks, floored: food.floored, exercise };
}

/** The day a number of weeks after the plan's start (yyyy-mm-dd), as a Date at noon (no clock changes move it a day). */
export function weeksAfter(start: string, weeks: number): Date {
  const [y, m, d] = start.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, (d ?? 1) + weeks * 7, 12);
}

// ------------------------------------------------------------------------------------------------ kept with the plan

/** What the saved plan keeps of the goal (on this phone only; never synced, never sent). */
export interface SavedGoal {
  aim: GoalAim;
  body: BodyGoal;
  kcal: number;
  protein: number;
  weeks: [number, number] | null;
  weeklyKg: number;
  floored: boolean;
  exercise: ExerciseDay[];
}

const pick = <T>(list: readonly T[], x: unknown): T | undefined => (list as readonly unknown[]).includes(x) ? (x as T) : undefined;

/** The body answers as kept or read back: known values only. */
export function sanitizeBody(raw: unknown): BodyGoal {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: BodyGoal = {};
  const set = pick(BODY_SETS, r.set);
  if (set) out.set = set;
  if (inRange(r.age, 1, AGE_MAX)) out.age = Math.round(r.age);
  if (inRange(r.weightKg, KG_MIN, KG_MAX)) out.weightKg = Math.round(r.weightKg * 10) / 10;
  if (inRange(r.bodyFat, BODY_FAT_MIN, BODY_FAT_MAX)) out.bodyFat = Math.round(r.bodyFat * 10) / 10;
  if (inRange(r.goalKg, KG_MIN, KG_MAX)) out.goalKg = Math.round(r.goalKg * 10) / 10;
  if (inRange(r.heightCm, CM_MIN, CM_MAX)) out.heightCm = Math.round(r.heightCm);
  if (typeof r.pregnant === "boolean") out.pregnant = r.pregnant;
  if (r.unit === "kg" || r.unit === "st") out.unit = r.unit;
  const dtd = pick(DAY_TO_DAY, r.dayToDay);
  if (dtd) out.dayToDay = dtd;
  return out;
}

const KINDS: readonly ExerciseKind[] = ["strength", "brisk", "easy", "cardio", "sport", "mix", "rest"];
const FOCI: readonly StrengthFocus[] = ["whole", "upper", "lower"];

/** A saved goal read back (a damaged one is dropped). */
export function sanitizeSavedGoal(raw: unknown): SavedGoal | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const aim = pick(GOAL_AIMS, r.aim);
  if (!aim || !inRange(r.kcal, 500, 10000) || !inRange(r.protein, 0, 1000)) return undefined;
  const weeks = Array.isArray(r.weeks) && r.weeks.length === 2 && r.weeks.every((w) => inRange(w, 1, MAX_WEEKS)) ? [r.weeks[0], r.weeks[1]] as [number, number] : null;
  const exercise: ExerciseDay[] = Array.isArray(r.exercise)
    ? (r.exercise as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const e = x as Record<string, unknown>;
        const kind = pick(KINDS, e.kind);
        if (!kind || !inRange(e.day, 0, 6) || !inRange(e.minutes, 0, 600) || !inRange(e.kcal, 0, 5000)) return [];
        const focus = pick(FOCI, e.focus);
        return [{ day: e.day, kind, minutes: e.minutes, kcal: e.kcal, ...(focus ? { focus } : {}) }];
      })
    : [];
  return {
    aim, body: sanitizeBody(r.body), kcal: r.kcal, protein: r.protein, weeks,
    weeklyKg: inRange(r.weeklyKg, -5, 5) ? r.weeklyKg : 0, floored: r.floored === true, exercise,
  };
}

// ------------------------------------------------------------------------------------------------ words

export const BODY_SET_LABEL: Record<BodySet, string> = { female: tk("Female"), male: tk("Male") };
export const DAY_TO_DAY_LABEL: Record<DayToDay, string> = { sedentary: tk("Mostly sitting"), light: tk("On my feet some of the day"), active: tk("On my feet most of the day") };
export const DAY_TO_DAY_LINE: Record<DayToDay, string> = {
  sedentary: tk("A desk job or mostly at home"),
  light: tk("Some walking, errands, a bit of standing"),
  active: tk("A job on your feet, or heavy physical work"),
};
export const PACE_LABEL: Record<GoalPace, string> = { steady: tk("Steady"), faster: tk("Faster") };
export const SPORT_KIND_LABEL: Record<SportKind, string> = { endurance: tk("Running, cycling or swimming"), team: tk("A team or racket sport"), power: tk("Strength or power") };
export const SPORT_KIND_LINE: Record<SportKind, string> = { endurance: tk("Long or steady sessions"), team: tk("Football, rugby, netball, tennis and the like"), power: tk("Lifting, sprinting, throwing, combat") };
export const TRAINING_KIND_LABEL: Record<TrainingKind, string> = { weights: tk("Weights"), cardio: tk("Running or cardio"), sport: tk("A sport"), mix: tk("A mix") };
export const LIFTING_LABEL: Record<Lifting, string> = { new: tk("New to it"), underYear: tk("Under a year"), fewYears: tk("1 to 3 years"), longer: tk("More than 3 years") };
export const EXERCISE_CHOICE_LABEL: Record<ExerciseChoice, string> = { plan: tk("Yes, plan it for me"), own: tk("I'll keep my own training") };
export const SESSION_LABEL: Record<SessionMinutes, string> = { 30: tk("30 min"), 45: tk("45 min"), 60: tk("1 hour"), 90: tk("1½ hours") };
export const EXERCISE_LABEL: Record<ExerciseKind, string> = {
  strength: tk("Strength training"), brisk: tk("Brisk walk"), easy: tk("Easy walk"), cardio: tk("Running or cardio"), sport: tk("Your sport"), mix: tk("Weights and cardio"), rest: tk("Rest day"),
};
export const FOCUS_LABEL: Record<StrengthFocus, string> = { whole: tk("whole body"), upper: tk("upper body"), lower: tk("lower body") };
/** A line under each kind, so a beginner knows what to do. */
export const EXERCISE_HOW: Record<ExerciseKind, string> = {
  strength: tk("Squats, presses, rows and lunges: 3 sets of 8 to 12, the last few reps hard"),
  brisk: tk("Fast enough that talking takes a little effort"),
  easy: tk("An easy pace, to keep moving"),
  cardio: tk("At a pace you can keep up"),
  sport: tk("Your usual game or session"),
  mix: tk("Some weights, then some cardio"),
  rest: tk("Rest, or a gentle walk if you like"),
};

/** A weight said back as typed: "75 kg" or "11 st 11 lb". */
export function weightWords(kg: number, unit: "kg" | "st" | undefined): string {
  if (unit !== "st") return `${Math.round(kg * 10) / 10} kg`;
  const lb = Math.round(kg / 0.45359237);
  const st = Math.floor(lb / 14);
  return `${st} st ${lb - st * 14} lb`;
}

/** A week's change said back as typed: "0.4 kg" or "1 lb" (to the half pound). */
export function changeWords(kg: number, unit: "kg" | "st" | undefined): string {
  const a = Math.abs(kg);
  if (unit !== "st") return `${Math.round(a * 10) / 10} kg`;
  return `${Math.max(0.5, Math.round((a / 0.45359237) * 2) / 2)} lb`;
}
