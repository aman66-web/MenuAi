import { dayParam, startOfDay, weekOf } from "./day";
import { dayLabelTotals, usable, type LabelTotal } from "./labelTotals";
import type { Nutrients } from "./types";

// The Stats screen behind Home's numbers (founder 2026-11-20, 12:54, from another app's Progress screen): Calories, Macros and Nutrients. Pure: no browser,
// no React. Every figure is added up from the food log (CLAUDE.md rule 1): a day with nothing logged is never a 0, a food without a figure is left out and
// counted as left out, today (still going) is never in an average and nothing is divided by days that weren't logged. Calories and protein, carbs and fat
// follow Home (lib/mm/week.ts, budget.ts loggedToday: any real figure); the label figures follow lib/mm/labelTotals.ts (a real amount, never below 0),
// so the Stats screen and Home always agree. No steps, sleep or weight (Health is write-only; weight would be new personal data: rule 4), and no scores,
// reference intakes or "over" (rule 3).

export const MACRO_KEYS = ["protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];
/** The Nutrients tab's figures, in the order a UK label prints them. */
export const NUTRIENT_KEYS = ["sugar", "saturatedFat", "salt", "fiber"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type StatKey = "calories" | MacroKey | NutrientKey;
const STAT_KEYS: readonly StatKey[] = ["calories", ...MACRO_KEYS, ...NUTRIENT_KEYS];

/** The fields of a logged food the Stats screen reads (LogEntry has them all). */
export interface StatsEntry {
  loggedAt: string;
  nutrients: Partial<Pick<Nutrients, StatKey>>;
  /** A Scan your food estimate (LogEntry.estimate). */
  estimate?: true;
}

export type StatsDayState = "past" | "today" | "future";

/** One figure over one day's foods: the sum over the foods that gave it, and how many did. */
export interface StatFigure {
  total: number;
  count: number;
}

export interface StatsDay {
  date: Date;
  /** YYYY-MM-DD, as day addresses write it. */
  key: string;
  state: StatsDayState;
  /** How many foods were logged that day (0 = nothing logged). */
  entries: number;
  /** How many of them are Scan your food estimates. */
  estimates: number;
  figures: Record<StatKey, StatFigure>;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
/** Calories, protein, carbs and fat count as Home counts them (any real figure); label figures as labelTotals.ts does (a real amount). */
const counts = (key: StatKey, n: unknown): n is number => (key === "calories" || (MACRO_KEYS as readonly string[]).includes(key) ? finite(n) : usable(n));

/** A day's figure for `key`, or null when nothing was logged or no food that day gave it (never a 0 it didn't have). */
export function dayValue(d: StatsDay, key: StatKey): number | null {
  const f = d.figures[key];
  return f.count > 0 ? f.total : null;
}

/** The given local days, each with its foods added up. A day after today shows nothing, even if a food was somehow dated then. */
export function statsDays(log: readonly StatsEntry[], dates: readonly Date[], now: Date): StatsDay[] {
  const today = startOfDay(now).getTime();
  const keys = new Set(dates.map(dayParam));
  const groups = new Map<string, StatsEntry[]>();
  for (const e of log) {
    const t = Date.parse(e.loggedAt);
    if (Number.isNaN(t)) continue;
    const key = dayParam(new Date(t));
    if (!keys.has(key)) continue;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return dates.map((date) => {
    const time = startOfDay(date).getTime();
    const state: StatsDayState = time < today ? "past" : time === today ? "today" : "future";
    const foods = state === "future" ? [] : groups.get(dayParam(date)) ?? [];
    const figures = {} as Record<StatKey, StatFigure>;
    for (const key of STAT_KEYS) {
      let total = 0, count = 0;
      for (const e of foods) {
        const n = e.nutrients?.[key];
        if (counts(key, n)) { total += n; count++; }
      }
      figures[key] = { total, count };
    }
    return { date: startOfDay(date), key: dayParam(date), state, entries: foods.length, estimates: foods.filter((e) => e.estimate === true).length, figures };
  });
}

export interface Average {
  /** A day, over the days before today that gave the figure (null when none did). */
  average: number | null;
  /** How many days that is. */
  days: number;
}

/** The average a day of `key` over the days before today that gave it: today is still going, and a day without the figure is never a 0. */
export function averageOf(days: readonly StatsDay[], key: StatKey): Average {
  const values = days.filter((d) => d.state === "past").map((d) => dayValue(d, key)).filter((v): v is number => v !== null);
  return { average: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null, days: values.length };
}

/** The top of a chart's scale: the target or the highest day, whichever is higher, plus 15% headroom (as Home's week). */
export function scaleTop(days: readonly StatsDay[], key: StatKey, target?: number): number {
  const highest = Math.max(0, ...days.map((d) => dayValue(d, key) ?? 0));
  const top = Math.max(target && target > 0 ? target : 0, highest);
  return (top > 0 ? top : 1) * 1.15;
}

/** Whole-number shares of a total that add up to exactly 100 (largest remainder), or null when there is nothing to share. */
export function sharesOf(values: readonly number[]): number[] | null {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(total > 0)) return null;
  const exact = values.map((v) => (Math.max(0, v) / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => ({ i, rest: v - Math.floor(v) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}

// ---- Calories ----

export type CalorieRange = "week" | "4weeks";

export interface CalorieStats {
  /** Monday to Sunday of this week, or of the four weeks ending with this one (28 days). */
  days: StatsDay[];
  /** Calories a day over the days before today with food logged (null when there are none). */
  average: number | null;
  /** How many days that is. */
  countedDays: number;
  /** Some food in the range up to now is a Scan your food estimate. */
  estimates: boolean;
  scaleTop: number;
}

/** The days of a range: this week, or the three weeks before it and this one. Built from calendar dates, so a clock change can't move a day. */
export function rangeDates(now: Date, range: CalorieRange): Date[] {
  if (range === "week") return weekOf(now);
  const monday = weekOf(now)[0]!;
  return Array.from({ length: 28 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 21 + i));
}

export function calorieStats(log: readonly StatsEntry[], now: Date, range: CalorieRange, targetKcal: number): CalorieStats {
  const days = statsDays(log, rangeDates(now, range), now);
  // calories are on every logged food, so the days counted are the days before today with food logged (as Home's week)
  const counted = days.filter((d) => d.state === "past" && d.entries > 0);
  return {
    days,
    average: counted.length ? counted.reduce((s, d) => s + d.figures.calories.total, 0) / counted.length : null,
    countedDays: counted.length,
    estimates: days.some((d) => d.estimates > 0),
    scaleTop: scaleTop(days, "calories", targetKcal),
  };
}

export interface WeekAverage {
  /** The week's Monday. */
  start: Date;
  key: string;
  /** This week (it holds today). */
  current: boolean;
  /** Calories a day over the week's days before today with food logged (null when there are none). */
  average: number | null;
  days: number;
  /** How many foods were logged in the week up to today (0 = nothing logged; today's foods count here though not in the average). */
  entries: number;
}

/**
 * The last 4 weeks as a bar a week (founder's example screen, 2026-11-20: a few calm bars, not 28 thin ones): each week's calories a day, worked out as the
 * range's own figure is (the days before today with food logged), so this week's bar is this week's figure exactly. A week with none has no bar.
 */
export function weeklyCalories(days: readonly StatsDay[]): WeekAverage[] {
  const out: WeekAverage[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const counted = week.filter((d) => d.state === "past" && d.entries > 0);
    out.push({
      start: week[0]!.date,
      key: week[0]!.key,
      current: week.some((d) => d.state === "today"),
      average: counted.length ? counted.reduce((s, d) => s + d.figures.calories.total, 0) / counted.length : null,
      days: counted.length,
      entries: week.reduce((s, d) => s + d.entries, 0),
    });
  }
  return out;
}

// ---- Protein, carbs and fat ----

export interface MacroStat extends Average {
  scaleTop: number;
}

/** Calories a gram of protein, carbs and fat (the rule lib/mm/mealPlan.ts fitsStyle uses: protein and carbs 4, fat 9). */
export const KCAL_PER_GRAM: Readonly<Record<MacroKey, number>> = { protein: 4, carbs: 4, fat: 9 };

export interface MacroSplit {
  /** Grams this week up to now, from the foods that gave all three figures. */
  grams: Record<MacroKey, number>;
  /**
   * Each one's share of the calories those grams give (KCAL_PER_GRAM), whole numbers adding up to 100: the same measure as the meal plan's High protein (at
   * least 30% of calories from protein), so "30% protein" means the same thing on both screens.
   */
  shares: Record<MacroKey, number>;
}

export interface MacroStats {
  /** Monday to Sunday of this week. */
  days: StatsDay[];
  macros: Record<MacroKey, MacroStat>;
  /** The week's split as shares of calories (null when no food this week up to now gave all three). */
  split: MacroSplit | null;
  /** Some food this week up to now has no protein, carbs or fat figure, so those count only the foods that have them. */
  gap: boolean;
  estimates: boolean;
}

export function macroStats(log: readonly StatsEntry[], now: Date, targets: Partial<Record<MacroKey, number>>): MacroStats {
  const dates = weekOf(now);
  const days = statsDays(log, dates, now);
  const macros = {} as Record<MacroKey, MacroStat>;
  for (const key of MACRO_KEYS) macros[key] = { ...averageOf(days, key), scaleTop: scaleTop(days, key, targets[key]) };
  // the split compares like with like: only foods that gave all three figures (a calories-only restaurant gives none)
  const today = startOfDay(now).getTime();
  const keys = new Set(dates.filter((d) => d.getTime() <= today).map(dayParam));
  const grams = { protein: 0, carbs: 0, fat: 0 };
  let gap = false;
  for (const e of log) {
    const t = Date.parse(e.loggedAt);
    if (Number.isNaN(t) || !keys.has(dayParam(new Date(t)))) continue;
    const n: StatsEntry["nutrients"] = e.nutrients ?? {};
    if (MACRO_KEYS.every((k) => finite(n[k]))) for (const k of MACRO_KEYS) grams[k] += n[k]!;
    else gap = true;
  }
  const shares = sharesOf(MACRO_KEYS.map((k) => grams[k] * KCAL_PER_GRAM[k]));
  return {
    days,
    macros,
    split: shares ? { grams, shares: { protein: shares[0]!, carbs: shares[1]!, fat: shares[2]! } } : null,
    gap,
    estimates: days.some((d) => d.estimates > 0),
  };
}

// ---- Sugar, saturates, salt and fibre ----

export interface NutrientStat extends Average {
  /** Today's total from labelTotals.ts (undefined when no food today gave it), and how many of today's foods did. */
  today: LabelTotal;
  /** Over this week's days before today with food logged: the foods that gave it, and all the foods. */
  weekCount: number;
  weekEntries: number;
  scaleTop: number;
}

export interface NutrientStats {
  /** Monday to Sunday of this week. */
  days: StatsDay[];
  /** How many foods were logged today. */
  todayEntries: number;
  nutrients: Record<NutrientKey, NutrientStat>;
}

export function nutrientStats(log: readonly StatsEntry[], now: Date): NutrientStats {
  const days = statsDays(log, weekOf(now), now);
  const today = dayLabelTotals(log, now, NUTRIENT_KEYS);
  const past = days.filter((d) => d.state === "past" && d.entries > 0);
  const weekEntries = past.reduce((s, d) => s + d.entries, 0);
  const nutrients = {} as Record<NutrientKey, NutrientStat>;
  for (const key of NUTRIENT_KEYS) {
    nutrients[key] = {
      ...averageOf(days, key),
      today: today.totals[key],
      weekCount: past.reduce((s, d) => s + d.figures[key].count, 0),
      weekEntries,
      scaleTop: scaleTop(days, key),
    };
  }
  return { days, todayEntries: today.entries, nutrients };
}
