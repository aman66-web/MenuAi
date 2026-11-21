// What this device knows about paid access (founder's brief, 13 Nov 2026), and the free-tier counters. Pure: the stores that keep it are in stores.ts, the checks
// that read it in entitlements.ts. None of it is inert only because of a flag: it is simply never asked while GATING_ENABLED is false (config.ts).
//
//  - `token`  the signed access token the server gave after a payment (lib/payments/token.ts). It is checked with the public key before it counts.
//  - `until`  when that checked token ends (ms), kept so the app can ask "is this device paid?" without checking a signature on every screen.
//  - `plan`   which plan it was, for Settings: a paid one, or "trial" (the account's free week) or "gift" (Premium the founder gave the account).
//  - `unlockUntil`  the 48 hours given for sharing on WhatsApp. A WhatsApp link opens another app, so a share can't be verified: this is a soft, honest nudge (said
//                   in the code and the privacy text), not a lock. It is given at most once while one is running.

import { PLAN_IDS } from "../payments/plans";
import { isAccountPlan, type AccessPlan } from "../payments/token";

export interface PaidState {
  token: string | null;
  plan: AccessPlan | null;
  until: number | null;
  unlockUntil: number | null;
}

export const NO_PAID: PaidState = { token: null, plan: null, until: null, unlockUntil: null };

/** Free tier: this many different dishes' Truth cards a day; this many results of a Quick answers list; this many rows of the Cheapest protein list. */
export const FREE_TRUTH_PER_DAY = 3;
export const FREE_PRESET_RESULTS = 2;
export const FREE_LEADERBOARD_ROWS = 5;
export const SHARE_UNLOCK_MS = 48 * 60 * 60 * 1000;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export function sanitizePaid(raw: unknown): PaidState {
  if (typeof raw !== "object" || raw === null) return NO_PAID;
  const r = raw as Record<string, unknown>;
  const token = typeof r.token === "string" && r.token.length > 20 && r.token.length < 2000 && /^[A-Za-z0-9._-]+$/.test(r.token) ? r.token : null;
  const plan = typeof r.plan === "string" && ((PLAN_IDS as readonly string[]).includes(r.plan) || isAccountPlan(r.plan)) ? (r.plan as AccessPlan) : null;
  return { token, plan: token ? plan : null, until: token ? num(r.until) : null, unlockUntil: num(r.unlockUntil) };
}

/** Paid and not run out. */
export const paidActive = (p: PaidState, nowMs: number): boolean => p.until !== null && p.until > nowMs;
export const shareUnlockActive = (p: PaidState, nowMs: number): boolean => p.unlockUntil !== null && p.unlockUntil > nowMs;
/** Premium that was bought (on the website or from the App Store) and hasn't run out: not the account's free week or a gift. */
export const boughtActive = (p: PaidState, nowMs: number): boolean => paidActive(p, nowMs) && !isAccountPlan(p.plan);
/** The account's free week or a gift, running. */
export const accountAccessActive = (p: PaidState, nowMs: number): boolean => paidActive(p, nowMs) && isAccountPlan(p.plan);
/** Access of either kind (a payment, or the 48 hours given for sharing). */
export const hasAccess = (p: PaidState, nowMs: number): boolean => paidActive(p, nowMs) || shareUnlockActive(p, nowMs);

/** Give 48 hours for a share, unless a payment or an earlier unlock is running. */
export function grantShareUnlock(p: PaidState, nowMs: number): PaidState {
  return hasAccess(p, nowMs) ? p : { ...p, unlockUntil: nowMs + SHARE_UNLOCK_MS };
}

/** A token that checked out: keep it with its end date and plan. */
export function withVerifiedToken(p: PaidState, token: string, plan: AccessPlan, untilMs: number): PaidState {
  return { ...p, token, plan, until: untilMs };
}

/** A token that no longer checks out (changed, run out): forget it (the share unlock is separate). */
export const withoutToken = (p: PaidState): PaidState => ({ ...p, token: null, plan: null, until: null });

// ---- the Truth card's free views: different dishes looked at today (the same dish again costs nothing)

export interface TruthDay {
  day: string;
  keys: string[];
}
export const NO_TRUTH_DAY: TruthDay = { day: "", keys: [] };

export function sanitizeTruthDay(raw: unknown): TruthDay {
  if (typeof raw !== "object" || raw === null) return NO_TRUTH_DAY;
  const r = raw as Record<string, unknown>;
  const keys = Array.isArray(r.keys) ? r.keys.filter((k): k is string => typeof k === "string" && k.length < 120).slice(0, 50) : [];
  return typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? { day: r.day, keys } : NO_TRUTH_DAY;
}

export const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** How many more different dishes a free person may open today. */
export function truthViewsLeft(t: TruthDay, today: string, perDay = FREE_TRUTH_PER_DAY): number {
  return t.day === today ? Math.max(0, perDay - t.keys.length) : perDay;
}

/** May this dish's card be opened, and what is the new count? A dish already opened today is free again; a new one needs a view left. */
export function openTruth(t: TruthDay, today: string, key: string, perDay = FREE_TRUTH_PER_DAY): { allowed: boolean; next: TruthDay } {
  const current = t.day === today ? t : { day: today, keys: [] };
  if (current.keys.includes(key)) return { allowed: true, next: current };
  if (current.keys.length >= perDay) return { allowed: false, next: current };
  return { allowed: true, next: { day: today, keys: [...current.keys, key] } };
}
