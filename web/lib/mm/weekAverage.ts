import type { Nutrients } from "./types";

// "Last 7 days" on the day page: the average calories and protein a day over the seven days that end on the day shown, counting only the days that
// have something logged (a day with nothing logged is not a day of 0 kcal: the person may simply not have logged it). Days are local calendar days, as on
// the rest of the day page (lib/mm/day.ts, budget.ts). Nothing is estimated: an entry typed in with calories only has no protein figure, and then no
// protein average is given at all rather than one that counts it as 0. The figures are left unrounded; the page rounds them like Today's (format.ts).

export const WEEK_DAYS = 7;

export interface WeekAverage {
  /** How many of the seven days have at least one entry (1 to 7). */
  days: number;
  /** Average calories a day over those days. */
  calories: number;
  /** Average protein (g) a day over those days, or null when an entry in them has no protein figure. */
  protein: number | null;
}

/** The average a day over the seven days ending on `day` (any time of that day), or null when none of them has anything logged. */
export function weekAverage(entries: ReadonlyArray<{ loggedAt: string; nutrients: Nutrients }>, day: Date): WeekAverage | null {
  // local midnights (new Date rolls over months and keeps a day a day across the clock changes)
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - (WEEK_DAYS - 1)).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const days = new Set<string>();
  let calories = 0;
  let protein = 0;
  let proteinMissing = false;
  for (const e of entries) {
    const t = Date.parse(e.loggedAt);
    if (!Number.isFinite(t) || t < start || t >= end) continue;
    const d = new Date(t);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    calories += e.nutrients.calories;
    if (e.nutrients.protein === undefined) proteinMissing = true;
    else protein += e.nutrients.protein;
  }
  if (days.size === 0) return null;
  return { days: days.size, calories: calories / days.size, protein: proteinMissing ? null : protein / days.size };
}
