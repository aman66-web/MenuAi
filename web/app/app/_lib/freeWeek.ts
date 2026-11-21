"use client";

import { IAP_ENABLED } from "@/lib/mm/config";
import { freeWeekDaysLeft, freeWeekEnded, freeWeekHad } from "@/lib/mm/freeWeek";
import { hasNative } from "@/lib/mm/native";
import { paidActive } from "@/lib/mm/paid";
import { freeWeekStore, paidStore } from "@/lib/mm/stores";
import { refreshAccountAccess, type AccountAccessResult } from "@/lib/payments/accountAccess";
import { accountApi, useAccountUser, userStore } from "./account";
import { useNow, useStore } from "./hooks";

// The running app's side of the free week (lib/mm/freeWeek.ts, lib/payments/accountAccess.ts): only in the In-App Purchase iPhone app, only for a signed-in
// account. The website sells nothing and keeps every feature open, so it never asks.

/** Ask the server for the signed-in account's own Premium (its free week or a gift). `force`: at start-up and straight after signing in. */
export function refreshFreeWeek(force = false): Promise<AccountAccessResult> {
  const user = userStore.get();
  if (!IAP_ENABLED || !hasNative() || !user) return Promise.resolve("skipped");
  return refreshAccountAccess({ userId: user.id, request: (path, init) => accountApi().request(path, init), force });
}

/** The signed-in account's free week has ended (the paywall then says so). */
export function useFreeWeekEnded(): boolean {
  const user = useAccountUser();
  const state = useStore(freeWeekStore);
  const now = useNow();
  return IAP_ENABLED && freeWeekEnded(state, user?.id ?? null, now.getTime());
}

/** The signed-in account has had the free week (running or ended): Apple's own free trial, if a store still offered one, isn't offered as a second one. */
export function useFreeWeekHad(): boolean {
  const user = useAccountUser();
  const state = useStore(freeWeekStore);
  return IAP_ENABLED && freeWeekHad(state, user?.id ?? null);
}

/**
 * Whole days left of the free week this phone holds (0 when none is running): worked out as Settings › Subscription does, from the checked token's plan and end
 * (paidStore), so the two can't disagree. The plans' headline says so while it runs (the meeting of 21 November 2026, Tara and Bea: See plans said "Get more
 * with Premium" during the free week and never that Premium was already on).
 */
export function useFreeWeekDaysLeft(): number {
  const paid = useStore(paidStore);
  const nowMs = useNow().getTime();
  if (!IAP_ENABLED) return 0;
  return paidActive(paid, nowMs) && paid.plan === "trial" && paid.until ? freeWeekDaysLeft(paid.until, nowMs) : 0;
}
