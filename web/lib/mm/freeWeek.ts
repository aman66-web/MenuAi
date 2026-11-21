import { tk } from "./i18n";

// The free week (founder, 20 November 2026: "Whenever someone signs into the app for the first time, they automatically get a 7-day free trial ... They don't
// need to type any details"): every account has Premium for its first FREE_WEEK_DAYS days from its first sign-in in the iPhone app, given by our server as the
// same signed token a purchase gives (plan "trial"; a gift of Premium from the founder is plan "gift"). The server decides who may have it and stops a second
// one (lib/payments/freeWeek.ts); this file is only what the phone remembers about it, so the screens can say so: Settings › Subscription ("Free week: {n} days
// left", "Premium, a gift"), the one line on Home when it starts, and the paywall's headline once it has ended. It belongs to the account signed in on this
// phone (`user`), and is forgotten with the account (sign out, Delete my account, Clear data). Pure: the store is in stores.ts, the calls in
// lib/payments/accountAccess.ts.

/** How long the free week lasts, from the account's first sign-in. */
export const FREE_WEEK_DAYS = 7;

/** What the server last said about this account: its free week is running, has ended (or was had before: the same email or Apple ID, or this iPhone), it has a
 *  gift of Premium, or nothing is known yet. */
export type FreeWeekStatus = "running" | "ended" | "gift" | "none";

export interface FreeWeekState {
  /** The account it is about (a different account on this phone starts from nothing). */
  user: string | null;
  status: FreeWeekStatus;
  /** When the free week ends or ended (ms), when known. */
  endsAt: number | null;
  /** The one line on Home ("Premium is yours free for 7 days.") is owed: the free week started with this phone's own request. */
  welcomeDue: boolean;
}

export const NO_FREE_WEEK: FreeWeekState = { user: null, status: "none", endsAt: null, welcomeDue: false };

const STATUSES: readonly FreeWeekStatus[] = ["running", "ended", "gift", "none"];

export function sanitizeFreeWeek(raw: unknown): FreeWeekState {
  if (typeof raw !== "object" || raw === null) return NO_FREE_WEEK;
  const r = raw as Record<string, unknown>;
  const user = typeof r.user === "string" && /^[A-Za-z0-9-]{1,64}$/.test(r.user) ? r.user : null;
  const status = STATUSES.includes(r.status as FreeWeekStatus) ? (r.status as FreeWeekStatus) : "none";
  const endsAt = typeof r.endsAt === "number" && Number.isFinite(r.endsAt) && r.endsAt > 0 ? r.endsAt : null;
  if (!user) return NO_FREE_WEEK;
  return { user, status, endsAt, welcomeDue: r.welcomeDue === true && status === "running" };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left of a free week ending at `endsAtMs` (a part day counts as a day; 0 once it has ended). */
export function freeWeekDaysLeft(endsAtMs: number, nowMs: number): number {
  return endsAtMs > nowMs ? Math.ceil((endsAtMs - nowMs) / DAY_MS) : 0;
}

/** This account's free week has ended (the server said so, or the one it gave has run out on this phone since). */
export function freeWeekEnded(s: FreeWeekState, userId: string | null, nowMs: number): boolean {
  if (!userId || s.user !== userId) return false;
  return s.status === "ended" || (s.status === "running" && s.endsAt !== null && s.endsAt <= nowMs);
}

/** This account has had the free week (running or ended): Apple's own free trial, if a store still offered one, is not offered as well. */
export function freeWeekHad(s: FreeWeekState, userId: string | null): boolean {
  return !!userId && s.user === userId && (s.status === "running" || s.status === "ended");
}

// ---- the words (rule 8: listed in the report)

/** The one line on Home when the free week starts. */
export const FREE_WEEK_NOTE = tk("Premium is yours free for {days} days.");
/** Settings › Subscription while it runs. */
export const FREE_WEEK_LEFT = tk("Free week: {n} days left");
export const FREE_WEEK_LAST_DAY = tk("Free week: 1 day left");
/** Settings › Subscription with a gift of Premium. */
export const PREMIUM_GIFT = tk("Premium, a gift");
/** The paywall's headline once the free week has ended. */
export const FREE_WEEK_ENDED = tk("Your free week has ended");
