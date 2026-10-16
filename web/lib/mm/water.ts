import { parseNumber } from "./addFood";

// Water intake (founder 2026-10-15, on Home under Today's meals: "There should be a water intake section below dinners with its own heading").
// A drink of water is one entry: when it was added and how many millilitres. Home shows today's total against the person's own goal and adds a
// glass or a bottle at a time. Entries stay on this device (they are not one of the synced stores: the table that holds synced data lists the
// stores it accepts, and widening that list is a database change that needs the founder's go-ahead, docs/ACCOUNTS_SYNC.md); the goal is a setting
// and syncs with the other settings. Pure: no browser, no React.
//
// Founder 2026-10-16: "a water bottle which you can move up and type the amount of water you've had extra when the plus is pressed". Home's card
// shows a bottle filled to today's level and a + that opens "Add water": a bigger bottle whose level you drag, and an amount you can type; the two
// stay in step (levelToMl / mlToLevel / stepMl / parseWaterAmount below), and what is added is on top of what is already drunk.

/** The two quick buttons on Home. */
export const GLASS_ML = 250;
export const BOTTLE_ML = 500;

/**
 * The goal a person starts with, until they type their own in Settings: 2 litres, eight 250 ml glasses. It is a starting number the person
 * can change, not a recommendation, and nothing in the app says it is what anyone should drink (CLAUDE.md rule 3).
 */
export const DEFAULT_WATER_GOAL_ML = 2000;
export const MIN_WATER_GOAL_ML = 250;
export const MAX_WATER_GOAL_ML = 6000;

/** The most one entry can be, and how long entries are kept (two weeks: today is what is shown, the rest is for what may come next). */
export const MAX_WATER_ENTRY_ML = 5000;
export const KEEP_WATER_DAYS = 14;
export const MAX_WATER_ENTRIES = 600;

export interface WaterEntry {
  id: string;
  /** When it was added (ISO 8601). */
  loggedAt: string;
  /** Millilitres, a whole number from 1 to MAX_WATER_ENTRY_ML. */
  ml: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Defensive parse of whatever is in storage: an entry that isn't one is dropped, the rest kept (oldest first, newest MAX_WATER_ENTRIES). */
export function sanitizeWater(raw: unknown): WaterEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WaterEntry[] = [];
  for (const e of raw) {
    if (!isObject(e)) continue;
    const { id, loggedAt, ml } = e;
    if (typeof id !== "string" || id.length === 0 || id.length > 80 || seen.has(id)) continue;
    if (typeof loggedAt !== "string" || !Number.isFinite(Date.parse(loggedAt))) continue;
    if (typeof ml !== "number" || !Number.isFinite(ml) || ml < 1 || ml > MAX_WATER_ENTRY_ML) continue;
    seen.add(id);
    out.push({ id, loggedAt: new Date(loggedAt).toISOString(), ml: Math.round(ml) });
  }
  out.sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
  return out.slice(-MAX_WATER_ENTRIES);
}

const sameLocalDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The entries added on the local calendar day of `now`, oldest first. */
export function waterEntriesToday(entries: readonly WaterEntry[], now: Date): WaterEntry[] {
  return entries.filter((e) => sameLocalDay(new Date(e.loggedAt), now));
}

/** Millilitres drunk today. */
export function waterToday(entries: readonly WaterEntry[], now: Date): number {
  return waterEntriesToday(entries, now).reduce((sum, e) => sum + e.ml, 0);
}

/** The goal in millilitres: the person's own from Settings when it is a sensible number, else the starting goal. */
export function waterGoal(settings: { dailyWater?: number }): number {
  const g = settings.dailyWater;
  return typeof g === "number" && Number.isFinite(g) && g >= MIN_WATER_GOAL_ML && g <= MAX_WATER_GOAL_ML ? Math.round(g) : DEFAULT_WATER_GOAL_ML;
}

/** How full the bar is: 0 to 1 (more than the goal is a full bar; the figure beside it still says the real amount). */
export function waterFraction(ml: number, goal: number): number {
  return goal > 0 ? Math.min(1, Math.max(0, ml / goal)) : 0;
}

/** Add a drink. Entries older than KEEP_WATER_DAYS are dropped as it goes, so the list can't grow for ever. An amount outside 1 to MAX_WATER_ENTRY_ML adds nothing. */
export function addWater(entries: readonly WaterEntry[], ml: number, now: Date, id: string): WaterEntry[] {
  if (!Number.isFinite(ml) || ml < 1 || ml > MAX_WATER_ENTRY_ML) return [...entries];
  const cutoff = now.getTime() - KEEP_WATER_DAYS * 24 * 60 * 60 * 1000;
  const kept = entries.filter((e) => Date.parse(e.loggedAt) >= cutoff);
  return [...kept, { id, loggedAt: now.toISOString(), ml: Math.round(ml) }].slice(-MAX_WATER_ENTRIES);
}

/** The drink added last today (what Undo takes back), or undefined when nothing was added today. */
export function lastWaterToday(entries: readonly WaterEntry[], now: Date): WaterEntry | undefined {
  const today = waterEntriesToday(entries, now);
  return today.reduce<WaterEntry | undefined>((latest, e) => (!latest || Date.parse(e.loggedAt) >= Date.parse(latest.loggedAt) ? e : latest), undefined);
}

/** Take one entry back out. */
export function removeWater(entries: readonly WaterEntry[], id: string): WaterEntry[] {
  return entries.filter((e) => e.id !== id);
}

// ---- the bottle in the "Add water" sheet

/** The sheet's bottle is full at one litre of water to add; dragging snaps to DRAG_STEP_ML (typing allows any amount up to MAX_WATER_ENTRY_ML). */
export const BOTTLE_FULL_ML = 1000;
export const DRAG_STEP_ML = 50;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** How full the bottle is for an amount (0 to 1; more than a litre is a full bottle). */
export function mlToLevel(ml: number): number {
  return clamp01(ml / BOTTLE_FULL_ML);
}

/** The amount for a bottle level (0 to 1, from where a finger is), snapped to DRAG_STEP_ML. */
export function levelToMl(level: number): number {
  return Math.round((clamp01(level) * BOTTLE_FULL_ML) / DRAG_STEP_ML) * DRAG_STEP_ML;
}

/** One keyboard step on the bottle: from the amount now (a typed amount over a litre starts from the top of the bottle), kept between 0 and the full bottle. */
export function stepMl(ml: number, delta: number): number {
  const from = Math.min(BOTTLE_FULL_ML, Math.max(0, Number.isFinite(ml) ? ml : 0));
  return Math.min(BOTTLE_FULL_ML, Math.max(0, Math.round((from + delta) / DRAG_STEP_ML) * DRAG_STEP_ML));
}

/** The amount typed in the box: a whole or part number of millilitres from 1 to MAX_WATER_ENTRY_ML (rounded to a whole ml), else null. A comma or another numeral system is read as elsewhere in the app. */
export function parseWaterAmount(raw: string): number | null {
  const v = parseNumber(raw);
  if (typeof v !== "number") return null;
  const ml = Math.round(v);
  return ml >= 1 && ml <= MAX_WATER_ENTRY_ML ? ml : null;
}
