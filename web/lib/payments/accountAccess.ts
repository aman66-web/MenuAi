// The iPhone app's side of the free week and gifts of Premium (lib/payments/freeWeek.ts on the server): after signing in, at start-up and when the app comes back
// to the front, the signed-in account asks POST /api/v1/entitlement/account (with Apple's DeviceCheck token for this iPhone when the phone can make one) and keeps
// the answer's signed token exactly as a purchase's is kept (lib/mm/stores.ts paidStore), so isPro and every gate follow, and the AI routes accept it. What the
// server said goes into freeWeekStore for the screens (Settings › Subscription, Home's one line, the paywall's headline once the free week has ended).
//
// A bought token always wins: while one from the App Store (or the website) is running, the account isn't asked at all (so a subscriber's free week isn't used up
// either). The account's token is the account's: a different account on this phone, signing out, Delete my account and Clear data forget it
// (forgetAccountAccess). No answer (offline, the server down, the tables not made yet) changes nothing.

import type { NativeAction, NativeResult } from "../mm/native";
import { nativeCall } from "../mm/native";
import { boughtActive } from "../mm/paid";
import { forgetPaidToken, freeWeekStore, paidStore } from "../mm/stores";
import { NO_FREE_WEEK, type FreeWeekState } from "../mm/freeWeek";
import { acceptToken } from "./client";
import { isAccountPlan } from "./token";

/** At most this often when the app only comes back to the front (start-up and a new sign-in always ask). */
export const ACCOUNT_REFRESH_GAP_MS = 30 * 60 * 1000;

type Call = (action: NativeAction, payload?: Record<string, unknown>, timeoutMs?: number) => Promise<NativeResult>;
/** A signed-in request to our API (app/app/_lib/account.ts accountApi().request: the session, renewed once on a 401). */
export type AccountRequest = (path: string, init?: { method?: string; body?: unknown }) => Promise<Response>;

export type AccountAccessResult = "trial" | "gift" | "none" | "bought" | "skipped" | "failed";

/** The account's own token (its free week or a gift) and what the phone knows about it go: the account has left this phone. A bought token is left alone. */
export function forgetAccountAccess(): void {
  if (isAccountPlan(paidStore.get().plan)) forgetPaidToken();
  freeWeekStore.set(NO_FREE_WEEK);
}

interface Answer {
  premium?: unknown;
  token?: unknown;
  plan?: unknown;
  freeWeek?: unknown;
  freeWeekEndsAt?: unknown;
  claimedNow?: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

let running: Promise<AccountAccessResult> | null = null;
let lastAsked = 0;

/** For tests: start again as if the app had just opened. */
export function resetAccountAccessForTests(): void {
  running = null;
  lastAsked = 0;
}

export function refreshAccountAccess(opts: { userId: string; request: AccountRequest; call?: Call; nowMs?: number; force?: boolean }): Promise<AccountAccessResult> {
  running ??= run(opts).finally(() => {
    running = null;
  });
  return running;
}

async function run({ userId, request, call = nativeCall, nowMs = Date.now(), force = false }: { userId: string; request: AccountRequest; call?: Call; nowMs?: number; force?: boolean }): Promise<AccountAccessResult> {
  const known = freeWeekStore.get();
  // another account's token or notes on this phone: not this account's
  if (known.user !== null && known.user !== userId) forgetAccountAccess();
  if (boughtActive(paidStore.get(), nowMs)) return "bought";
  if (!force && nowMs - lastAsked < ACCOUNT_REFRESH_GAP_MS) return "skipped";
  lastAsked = nowMs;

  // Apple's DeviceCheck token, only while the server may still start a free week for this account (it has none yet that this phone knows of)
  const mine = freeWeekStore.get();
  const needsDevice = !(mine.user === userId && (mine.status === "running" || mine.status === "ended"));
  const device = needsDevice ? await call("deviceCheck.token", {}, 10_000) : null;
  const body = device?.deviceToken ? { deviceToken: device.deviceToken, ...(device.deviceEnv ? { deviceEnv: device.deviceEnv } : {}) } : {};

  let res: Response;
  try {
    res = await request("entitlement/account", { method: "POST", body });
  } catch {
    lastAsked = 0; // offline: nothing changes, and the next return to the front asks again
    return "failed";
  }
  const answer = res.ok ? ((await res.json().catch(() => null)) as Answer | null) : null;
  if (!answer || typeof answer.premium !== "boolean") {
    lastAsked = 0;
    return "failed";
  }
  // a purchase that landed while we asked wins
  if (boughtActive(paidStore.get(), Date.now())) return "bought";

  const before = freeWeekStore.get();
  const endsAt = num(answer.freeWeekEndsAt);
  if (answer.premium && typeof answer.token === "string" && (answer.plan === "trial" || answer.plan === "gift")) {
    if (!(await acceptToken(answer.token))) {
      lastAsked = 0;
      return "failed";
    }
    const next: FreeWeekState = answer.plan === "gift"
      ? { user: userId, status: "gift", endsAt: null, welcomeDue: false }
      // Home's one line is owed only when this phone's own ask started the week, and never again once this phone knew it was running
      : { user: userId, status: "running", endsAt, welcomeDue: before.user === userId && before.status === "running" ? before.welcomeDue : answer.claimedNow === true };
    freeWeekStore.set(next);
    return answer.plan;
  }
  // no Premium of its own: an account token kept from before (a gift taken away, a week run out) goes
  if (isAccountPlan(paidStore.get().plan)) forgetPaidToken();
  // "device_used" (this iPhone had a free week on another account) is not said to be this account's free week ending
  freeWeekStore.set({ user: userId, status: answer.freeWeek === "ended" ? "ended" : "none", endsAt, welcomeDue: false });
  return "none";
}

/** Home has shown "Your free week has started" once: not again on this phone. */
export function welcomeSaid(): void {
  const s = freeWeekStore.get();
  if (s.welcomeDue) freeWeekStore.set({ ...s, welcomeDue: false });
}
