import { dayParam } from "./day";

// Home's swipe pages' first-visit hint (the 20-person meeting, 2026-11-19): "Slide the cards sideways, or tap here, to see your week" shows under the dots until
// page 2 or 3 has been seen, and on at most HINT_DAYS different days, then never again. The one demonstration slide plays once per device. Kept on this
// device only (mm.v1.homePages): never synced, never sent; cleared by Settings › Clear data and Reset onboarding.

export interface HomePagesState {
  /** Page 2 or 3 has been shown (by a swipe, a dot or the hint). */
  seen: boolean;
  /** The one demonstration slide has played (or started). */
  slid: boolean;
  /** How many different days the hint has been shown on. */
  hintDays: number;
  /** The last day the hint was shown (YYYY-MM-DD), so a second visit the same day doesn't count again. */
  lastHintDay: string;
}

export const NO_HOME_PAGES: HomePagesState = { seen: false, slid: false, hintDays: 0, lastHintDay: "" };
/** The hint retires after showing on this many days, even if the pages were never looked at (the dots and Pip's tip still teach them). */
export const HINT_DAYS = 5;

export function sanitizeHomePages(raw: unknown): HomePagesState {
  if (!raw || typeof raw !== "object") return NO_HOME_PAGES;
  const r = raw as Record<string, unknown>;
  const days = typeof r.hintDays === "number" && Number.isInteger(r.hintDays) && r.hintDays >= 0 && r.hintDays <= 99 ? r.hintDays : 0;
  const last = typeof r.lastHintDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.lastHintDay) ? r.lastHintDay : "";
  return { seen: r.seen === true, slid: r.slid === true, hintDays: days, lastHintDay: last };
}

/** Whether the hint shows today: page 2 or 3 not seen yet, and fewer than HINT_DAYS days used (today's visit counts as one already used). */
export function hintShows(s: HomePagesState, now: Date): boolean {
  if (s.seen) return false;
  return s.lastHintDay === dayParam(now) ? s.hintDays <= HINT_DAYS : s.hintDays < HINT_DAYS;
}

/** The state after the hint was shown today: one more day, unless today was already counted. */
export function withHintShown(s: HomePagesState, now: Date): HomePagesState {
  const today = dayParam(now);
  return s.lastHintDay === today ? s : { ...s, hintDays: s.hintDays + 1, lastHintDay: today };
}
