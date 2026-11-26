import { dayParam } from "./day";
import { tk } from "./i18n";

// Steps (founder 2026-11-26: "the app should also track peoples steps too"). Inside the iPhone and Android apps the phone counts the steps itself (the iPhone's
// motion chip through Core Motion, never Apple Health: CLAUDE.md rule 4; on Android, Google Play services' on-phone step recording) and the page asks it for
// the last few days through the bridge ("steps.get", web/lib/mm/native.ts). The numbers are shown and forgotten: never stored by the page, never synced (not in
// SYNC_STORES), never sent anywhere. What the page keeps, on this device only, is whether the person turned step counting on and their daily step goal
// (stepsStore, mm.v1.steps). On the website there is no bridge and no steps anywhere.
//
// No day is called good or bad (CLAUDE.md rule 3): a day shows its number and a bar against the person's own goal, nothing more. The goal starts at 8,000, a
// number the person can change, not advice.
//
// Pure: no browser, no React. The meal plan may import stepsOn() to show a day's steps beside its exercise.

/** One day's steps as the phone counted them. `date` is the phone's own calendar day (YYYY-MM-DD, local time). */
export interface DaySteps {
  date: string;
  steps: number;
  /** The phone started counting part-way through this day (the day step counting was turned on on Android): the number is from then, not from midnight. */
  partial?: true;
}

/** How many days the page asks for: today and the six before it (the iPhone keeps seven days of steps; Google Play services ten). */
export const STEP_DAYS = 7;
/** More than this in one day is not a real count (and is dropped). */
export const MAX_DAY_STEPS = 150_000;
/** The most days one answer may hold; a longer list isn't trusted at all. */
const MAX_ANSWER_DAYS = 31;

export const DEFAULT_STEP_GOAL = 8_000;
export const MIN_STEP_GOAL = 1_000;
export const MAX_STEP_GOAL = 30_000;
/** The goal's − and + buttons move it by this much. */
export const STEP_GOAL_STEP = 500;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date "YYYY-MM-DD" (2000 to 2100; no 2026-02-30). */
export function isStepDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/**
 * The phone's answer, cleaned: only days with a real date and a whole number of steps from 0 to MAX_DAY_STEPS, each date once (the first kept), oldest first.
 * Not a list, or a list too long to be an answer: undefined. Any other field in an entry is dropped.
 */
export function cleanStepDays(raw: unknown): DaySteps[] | undefined {
  if (!Array.isArray(raw) || raw.length > MAX_ANSWER_DAYS) return undefined;
  const seen = new Set<string>();
  const out: DaySteps[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const { date, steps, partial } = e as Record<string, unknown>;
    if (!isStepDate(date) || seen.has(date)) continue;
    if (typeof steps !== "number" || !Number.isInteger(steps) || steps < 0 || steps > MAX_DAY_STEPS) continue;
    seen.add(date);
    out.push({ date, steps, ...(partial === true ? { partial: true as const } : {}) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The day's steps, when the phone counted that day. `day` is a local Date (its calendar day is used) or a "YYYY-MM-DD" string. */
export function stepsOn(days: readonly DaySteps[], day: Date | string): DaySteps | undefined {
  const key = typeof day === "string" ? day : dayParam(day);
  return days.find((d) => d.date === key);
}

/** One row of the week view. */
export interface StepWeekDay {
  /** Local midnight of that day. */
  day: Date;
  date: string;
  /** null: the phone has no count for that day (before step counting was on, or the phone was off). */
  steps: number | null;
  partial: boolean;
  today: boolean;
}

/** The last STEP_DAYS days ending today, oldest first, each with its count or null. */
export function stepWeek(days: readonly DaySteps[], now: Date): StepWeekDay[] {
  return Array.from({ length: STEP_DAYS }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (STEP_DAYS - 1 - i));
    const found = stepsOn(days, day);
    return { day, date: dayParam(day), steps: found ? found.steps : null, partial: found?.partial === true, today: i === STEP_DAYS - 1 };
  });
}

/**
 * The week's figures: the total of every day counted, and the average a day over the whole days only (today isn't over yet, and a partial day wasn't counted
 * from midnight). `average` is null until there is one whole day.
 */
export function stepWeekSummary(week: readonly StepWeekDay[]): { total: number; average: number | null; wholeDays: number } {
  const total = week.reduce((s, d) => s + (d.steps ?? 0), 0);
  const whole = week.filter((d) => d.steps !== null && !d.today && !d.partial);
  const average = whole.length > 0 ? Math.round(whole.reduce((s, d) => s + (d.steps ?? 0), 0) / whole.length) : null;
  return { total, average, wholeDays: whole.length };
}

/** How full the bar is: 0 to 1 (more than the goal is a full bar; the figure beside it still says the real number). */
export function stepFraction(steps: number, goal: number): number {
  if (!Number.isFinite(steps) || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(1, Math.max(0, steps / goal));
}

// ---- what this device keeps (stepsStore, mm.v1.steps): never synced, never sent; cleared by Clear data

export interface StepsState {
  /** The person turned step counting on (the phone's own question was asked then). */
  on: boolean;
  /** "Not now" on Home's offer: the card doesn't come back (Settings › Steps still turns it on). */
  dismissed: boolean;
  /** Their own daily goal; absent = DEFAULT_STEP_GOAL. */
  goal?: number;
}

export const NO_STEPS: StepsState = { on: false, dismissed: false };

/** A goal the person may have: a whole multiple of STEP_GOAL_STEP from MIN_STEP_GOAL to MAX_STEP_GOAL, else null. */
export function cleanStepGoal(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const g = Math.round(raw / STEP_GOAL_STEP) * STEP_GOAL_STEP;
  return g >= MIN_STEP_GOAL && g <= MAX_STEP_GOAL ? g : null;
}

export function sanitizeSteps(raw: unknown): StepsState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NO_STEPS;
  const r = raw as Record<string, unknown>;
  const goal = cleanStepGoal(r.goal);
  return { on: r.on === true, dismissed: r.dismissed === true, ...(goal !== null && goal !== DEFAULT_STEP_GOAL ? { goal } : {}) };
}

export function stepGoal(state: Pick<StepsState, "goal">): number {
  return cleanStepGoal(state.goal) ?? DEFAULT_STEP_GOAL;
}

/** The goal after one press of − (delta < 0) or + (delta > 0): one STEP_GOAL_STEP, kept from MIN_STEP_GOAL to MAX_STEP_GOAL. */
export function nudgeStepGoal(goal: number, delta: number): number {
  const from = cleanStepGoal(goal) ?? DEFAULT_STEP_GOAL;
  const to = from + Math.sign(delta) * STEP_GOAL_STEP;
  return Math.min(MAX_STEP_GOAL, Math.max(MIN_STEP_GOAL, to));
}

// ---- what Home shows

/** What the phone said about counting steps: "unavailable" = this phone can't (or the website, or an older app with no steps), so nothing is shown. */
export type StepPermission = "granted" | "denied" | "notDetermined" | "unavailable";

/**
 * Home's steps card:
 *   "hidden"  nothing at all (the website, a phone with no step counter, or the person said "Not now" and never turned it on);
 *   "offer"   "Count your steps" with "Turn on step counting" (and "Not now");
 *   "denied"  turned on in Numbite, but the phone's permission is off: a calm line and "Open Settings";
 *   "showing" today's steps against the goal.
 * `permission` is null while the phone's answer isn't in yet: nothing is shown until it is (no card that jumps).
 */
export type StepsCardView = "hidden" | "offer" | "denied" | "showing";

export function stepsCardView(input: { inApp: boolean; permission: StepPermission | null; state: StepsState }): StepsCardView {
  const { inApp, permission, state } = input;
  if (!inApp || permission === null || permission === "unavailable") return "hidden";
  if (state.on) return permission === "granted" ? "showing" : permission === "denied" ? "denied" : "offer";
  return state.dismissed ? "hidden" : "offer";
}

/** The name of the switch in the phone's own Settings, for the "denied" line. */
export const STEP_SETTING_NAME = { ios: tk("Motion & Fitness"), android: tk("Physical activity") } as const;
