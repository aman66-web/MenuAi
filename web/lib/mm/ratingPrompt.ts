// "Are you enjoying Numbite?" (founder 2026-11-17: "after they use it for a while they are asked if they are liking it on a scale of 1-5; if they choose 5 and only if
// they choose 5 a pop up comes up asking to leave a review; if they've already pressed they will leave a review then don't show that pop up again"; "show them the pop up
// only every so often so they feel like they're not being harassed"). In the iPhone app only. Asked first once the app has been used on 5 different days and 14 days have
// passed since the first; after "Not now" or 1-4, not again for 90 days; after a 5 (Apple's own review pop-up asked for), never again. Apple also limits its pop-up to
// three times a year and never tells the app whether a review was left. Device only, never synced. Pure and unit-tested.

export const FIRST_ASK_AFTER_DAYS = 14;
export const MIN_DAYS_USED = 5;
export const ASK_AGAIN_AFTER_DAYS = 90;

export interface RatingState {
  /** The first day the app was used on this phone ("YYYY-MM-DD", local). */
  firstDay: string | null;
  /** The last day it was used, and on how many different days in all. */
  lastDay: string | null;
  daysUsed: number;
  /** The last day the question was shown (any answer, or Not now). */
  lastAsked: string | null;
  /** Someone picked 5 and Apple's review pop-up was asked for: the question never comes back. */
  reviewAsked: boolean;
}

export const EMPTY_RATING: RatingState = { firstDay: null, lastDay: null, daysUsed: 0, lastAsked: null, reviewAsked: false };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string | null => (typeof v === "string" && DAY.test(v) ? v : null);

/** What storage holds, tidied (anything else is the empty state). */
export function sanitizeRating(raw: unknown): RatingState {
  if (!raw || typeof raw !== "object") return EMPTY_RATING;
  const r = raw as Record<string, unknown>;
  const n = typeof r.daysUsed === "number" && Number.isFinite(r.daysUsed) ? Math.max(0, Math.min(10_000, Math.floor(r.daysUsed))) : 0;
  return { firstDay: day(r.firstDay), lastDay: day(r.lastDay), daysUsed: n, lastAsked: day(r.lastAsked), reviewAsked: r.reviewAsked === true };
}

/** A day as "YYYY-MM-DD" in the phone's own time zone. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from one "YYYY-MM-DD" to another (calendar days, so clock changes don't matter). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86_400_000);
}

/** The app was opened today: counts the day once. */
export function noteUse(s: RatingState, today: string): RatingState {
  if (s.lastDay === today) return s;
  return { ...s, firstDay: s.firstDay ?? today, lastDay: today, daysUsed: s.daysUsed + 1 };
}

/** Whether to ask today. */
export function ratingDue(s: RatingState, today: string): boolean {
  if (s.reviewAsked || !s.firstDay) return false;
  if (s.daysUsed < MIN_DAYS_USED || daysBetween(s.firstDay, today) < FIRST_ASK_AFTER_DAYS) return false;
  return !s.lastAsked || daysBetween(s.lastAsked, today) >= ASK_AGAIN_AFTER_DAYS;
}

/** The person answered (1-5) or closed it (null) today. Only a 5 asks for Apple's review pop-up, and then the question never comes back. */
export function answered(s: RatingState, today: string, rating: number | null): RatingState {
  return { ...s, lastAsked: today, reviewAsked: s.reviewAsked || rating === 5 };
}
