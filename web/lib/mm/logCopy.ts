import type { Meal } from "./types";
import type { LogEntry, SavedOrder } from "./user-data";

// Logging again what was logged or saved before: "Add to today" on a past day's meal (the day page) and "Log" on a saved restaurant meal (My meals).
// Pure copies: every figure is the one already stored, exactly (a figure that was never entered stays absent, never 0), and nothing is worked out again.
// The store gives each new entry its own id and the time of the tap (stores.ts addLogEntry).

/** What one entry becomes when its past meal is added to today: the same restaurant, name, source and figures, in the same meal row (Breakfast, Lunch or Dinner). */
export function copyForToday(e: LogEntry, meal: Meal): Omit<LogEntry, "id" | "loggedAt"> {
  return { chainId: e.chainId, chainName: e.chainName, name: e.name, nutrients: { ...e.nutrients }, source: e.source, meal };
}

/** A saved restaurant meal logged now: its own snapshot of figures, as the Add food sheet logs a saved meal (DishPick), in the meal its time falls in. */
export function savedOrderEntry(o: SavedOrder): Omit<LogEntry, "id" | "loggedAt"> {
  return { chainId: o.chainId, chainName: o.chainName, name: o.name, nutrients: { ...o.nutrients }, source: "savedOrder" };
}

/** The log without the given entries (Undo takes back exactly what was just added). */
export function withoutEntries<E extends { id: string }>(log: readonly E[], ids: ReadonlySet<string>): E[] {
  return log.filter((e) => !ids.has(e.id));
}
