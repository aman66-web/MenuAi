import { dayParam, startOfDay, weekOf } from "./day";
import type { Nutrients } from "./types";

// Home's second page, "Calories and protein this week" (founder 2026-11-19: "3 dots ... swipe right to see different things like stats"; the 20-person meeting's
// conclusion the same day). Pure: no browser, no React. Only what was logged is shown (CLAUDE.md rule 1): a day with nothing logged is never counted as 0, today
// (still going) is never in an average, and nothing is ever divided by seven. No streaks, scores or "over" (rule 3).

/** The fields of a logged food this page reads. */
export interface WeekEntry {
  loggedAt: string;
  nutrients: Pick<Nutrients, "calories" | "protein">;
  /** A Scan your food estimate (LogEntry.estimate). */
  estimate?: true;
}

export type DayState = "past" | "today" | "future";

export interface WeekDay {
  date: Date;
  /** YYYY-MM-DD, as day addresses and the calendar write it. */
  key: string;
  state: DayState;
  /** How many foods were logged that day (0 = nothing logged: no bar, never a 0). */
  entries: number;
  calories: number;
  /** The protein of the foods that gave one. */
  protein: number;
  /** How many of the day's foods gave a protein figure. */
  proteinCount: number;
}

export interface WeekSummary {
  days: WeekDay[];
  /** The days before today with food logged: the averages are over these. */
  countedDays: number;
  /** Calories a day over the counted days (null when there are none). */
  caloriesAverage: number | null;
  /** Protein a day over the counted days that have at least one protein figure (null when none has). */
  proteinAverage: number | null;
  /** Some food on a counted day has no protein figure, so protein counts only the rest. */
  proteinGap: boolean;
  /** Some food this week up to now is a Scan your food estimate. */
  estimates: boolean;
  /** The top of the chart's scale: the target or the highest day, whichever is higher, plus 15% headroom. */
  scaleTop: number;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** One local day's foods, and how much they add up to. */
function dayOf(entries: readonly WeekEntry[], date: Date, state: DayState): WeekDay {
  let calories = 0, protein = 0, proteinCount = 0;
  for (const e of entries) {
    if (finite(e.nutrients.calories)) calories += e.nutrients.calories;
    if (finite(e.nutrients.protein)) { protein += e.nutrients.protein; proteinCount++; }
  }
  return { date, key: dayParam(date), state, entries: entries.length, calories, protein, proteinCount };
}

/** The log's foods by local day, for the days asked about only (the log is kept for ever: everything else is skipped). */
function byDay(log: readonly WeekEntry[], keys: ReadonlySet<string>): Map<string, WeekEntry[]> {
  const out = new Map<string, WeekEntry[]>();
  for (const e of log) {
    const t = Date.parse(e.loggedAt);
    if (Number.isNaN(t)) continue;
    const key = dayParam(new Date(t));
    if (!keys.has(key)) continue;
    const list = out.get(key);
    if (list) list.push(e);
    else out.set(key, [e]);
  }
  return out;
}

/** Calories a day over the days of `days` with food logged, or null when none has. */
function averageOf(days: readonly WeekDay[]): number | null {
  const logged = days.filter((d) => d.entries > 0);
  return logged.length ? logged.reduce((s, d) => s + d.calories, 0) / logged.length : null;
}

/** Monday to Sunday of this week, each day's calories and protein, and the averages over the days before today that have food logged. */
export function weekSummary(log: readonly WeekEntry[], now: Date, targetKcal: number): WeekSummary {
  const today = startOfDay(now).getTime();
  const dates = weekOf(now);
  const groups = byDay(log, new Set(dates.map(dayParam)));
  const days = dates.map((d) => {
    const state: DayState = d.getTime() < today ? "past" : d.getTime() === today ? "today" : "future";
    // a day still to come shows nothing, even if a food was somehow dated then
    return dayOf(state === "future" ? [] : groups.get(dayParam(d)) ?? [], d, state);
  });
  const counted = days.filter((d) => d.state === "past" && d.entries > 0);
  const withProtein = counted.filter((d) => d.proteinCount > 0);
  const upToNow = days.filter((d) => d.state !== "future").map((d) => d.key);
  const highest = Math.max(0, ...days.map((d) => d.calories));
  return {
    days,
    countedDays: counted.length,
    caloriesAverage: averageOf(counted),
    proteinAverage: withProtein.length ? withProtein.reduce((s, d) => s + d.protein, 0) / withProtein.length : null,
    proteinGap: counted.some((d) => d.proteinCount < d.entries),
    estimates: upToNow.some((k) => (groups.get(k) ?? []).some((e) => e.estimate === true)),
    scaleTop: Math.max(targetKcal > 0 ? targetKcal : 0, highest, 1) * 1.15,
  };
}

/** Last week's calories a day (Monday to Sunday before this one) over the days with food logged, or null when none has. Shown on a Monday only. */
export function lastWeekAverage(log: readonly WeekEntry[], now: Date): number | null {
  const lastWeekDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const dates = weekOf(lastWeekDay);
  const groups = byDay(log, new Set(dates.map(dayParam)));
  return averageOf(dates.map((d) => dayOf(groups.get(dayParam(d)) ?? [], d, "past")));
}
