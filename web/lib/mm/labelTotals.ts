import { isSameLocalDay } from "./budget";
import type { Nutrients } from "./types";

// Home's third page, "Today: sugar, salt and fibre" (the 20-person meeting, 2026-11-19). Pure. Only figures a label or menu printed are added up (CLAUDE.md
// rule 1): a food that didn't give one is left out and the page says how many did ("from 3 of your 4 foods"); none at all reads "not published". No targets,
// reference intakes, colours or high/low words (rule 3). Sodium is never turned into salt.

export type LabelKey = "sugar" | "salt" | "fiber";
export const LABEL_KEYS: readonly LabelKey[] = ["sugar", "salt", "fiber"];
/** Every label figure added up anywhere: Home's three, and saturates for the Stats screen's Nutrients tab (lib/mm/stats.ts). */
export type LabelFigureKey = LabelKey | "saturatedFat";

export interface LabelTotal {
  /** The sum over the foods that gave the figure (undefined when none did: "not published"). */
  total: number | undefined;
  /** How many of today's foods gave it. */
  count: number;
}

export interface LabelTotals {
  /** How many foods were logged today (typed foods and photo estimates included: they never carry these figures). */
  entries: number;
  sugar: LabelTotal;
  salt: LabelTotal;
  fiber: LabelTotal;
}

/** A stored label figure that is a real amount (lib/mm/stats.ts uses the same rule, so the Stats screen and Home always agree). */
export const usable = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** One local day's label figures for `keys`, from the foods whose label or menu printed them, and how many foods were logged that day. */
export function dayLabelTotals<K extends LabelFigureKey>(log: ReadonlyArray<{ loggedAt: string; nutrients: Partial<Pick<Nutrients, LabelFigureKey>> }>, day: Date, keys: readonly K[]): { entries: number; totals: Record<K, LabelTotal> } {
  const days = log.filter((e) => {
    const t = Date.parse(e.loggedAt);
    return !Number.isNaN(t) && isSameLocalDay(new Date(t), day);
  });
  const totals = {} as Record<K, LabelTotal>;
  for (const key of keys) {
    const figures = days.map((e) => e.nutrients?.[key]).filter(usable);
    totals[key] = { total: figures.length ? figures.reduce((s, n) => s + n, 0) : undefined, count: figures.length };
  }
  return { entries: days.length, totals };
}

/** Today's sugar, salt and fibre from the foods whose label or menu printed them (a stored value that isn't a real amount is skipped). */
export function todayLabelTotals(log: ReadonlyArray<{ loggedAt: string; nutrients: Partial<Pick<Nutrients, LabelKey>> }>, now: Date): LabelTotals {
  const { entries, totals } = dayLabelTotals(log, now, LABEL_KEYS);
  return { entries, ...totals };
}
