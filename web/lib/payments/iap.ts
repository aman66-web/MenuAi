// The iPhone app's side of buying Premium with Apple In-App Purchase (app version 1.1; App Store rule 3.1.1: digital features bought inside the app go through Apple).
// StoreKit on the phone shows Apple's own payment sheet and checks the purchase (MenuMacros/Services/StoreKitPurchaseService.swift); our server checks Apple's
// signature again and answers with the same access token the rest of the app reads (lib/payments/token.ts, POST /api/v1/entitlement/apple). Only used in an In-App
// Purchase build of the app (config.ts IAP_ENABLED); the website never calls any of this.
//
// Apple keeps the purchase record. A new phone, a reinstall or "Restore purchases" asks StoreKit for the person's current purchases and swaps them for a fresh token;
// a refund or a subscription that has ended disappears from that list, and the token goes at the next start-up or return to the app.

import { API_BASE } from "../mm/config";
import { nativeCall, type NativeAction, type NativeProduct, type NativeResult } from "../mm/native";
import { forgetPaidToken, paidStore } from "../mm/stores";
import { acceptToken, publicKey } from "./client";
import { isAccountPlan, verifyToken } from "./token";

/**
 * The plans the iPhone app sells: Annual and Monthly, two auto-renewable subscriptions in the group "Numbite Premium", each with a free first week
 * (Config/Numbite.storekit, App Store Connect; MenuMacros/App/AppConfig.swift iapProductIDs holds the same two). The Founding Member 90-Day Pass is not sold
 * (the overnight audit of 20 November 2026): the app never asks StoreKit for it. Our server (lib/payments/apple.ts) still knows its id, so a test purchase
 * made with build 7 keeps working, and the website's Stripe drafts (plans.ts) keep their own list.
 */
export const IAP_PLAN_IDS = ["annual", "monthly"] as const;
export type IapPlanId = (typeof IAP_PLAN_IDS)[number];

/** The App Store product of each plan (App Store Connect and Config/Numbite.storekit use the same ids). */
export const IAP_PRODUCT_IDS: Readonly<Record<IapPlanId, string>> = {
  annual: "com.amanmarwaha.numbite.pro.annual",
  monthly: "com.amanmarwaha.numbite.pro.monthly",
};

/** A token with less than this left is swapped for a fresh one when the app starts or comes back to the front. */
export const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

type Call = (action: NativeAction, payload?: Record<string, unknown>, timeoutMs?: number) => Promise<NativeResult>;
type Fetch = typeof fetch;

export interface StoreProduct extends NativeProduct {
  plan: IapPlanId;
}

/** The plans as the App Store sells them on this phone (names and prices from StoreKit), in the app's order; null when StoreKit didn't answer. */
export async function loadProducts(call: Call = nativeCall): Promise<StoreProduct[] | null> {
  const r = await call("iap.products", { ids: IAP_PLAN_IDS.map((p) => IAP_PRODUCT_IDS[p]) }, 30_000);
  const found = IAP_PLAN_IDS.flatMap((plan) => {
    const p = r.products?.find((x) => x.id === IAP_PRODUCT_IDS[plan]);
    return p ? [{ ...p, plan }] : [];
  });
  return found.length > 0 ? found : null;
}

export type ClaimResult = "ok" | "not_paid" | "failed";

/** Swaps Apple's signed transactions for our access token (the server checks every one with Apple's certificates). */
export async function claimTransactions(transactions: string[], fetchImpl: Fetch = fetch): Promise<ClaimResult> {
  if (transactions.length === 0) return "not_paid";
  try {
    const res = await fetchImpl(`${API_BASE}entitlement/apple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: transactions.slice(0, 10) }),
    });
    if (res.status === 402) return "not_paid";
    const body = (await res.json().catch(() => ({}))) as { token?: unknown };
    return res.ok && typeof body.token === "string" && (await acceptToken(body.token)) ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

/** "not_confirmed": Apple took the payment but our server couldn't be reached or didn't agree; Restore purchases tries again (nothing is charged twice). */
export type BuyResult = "ok" | "cancelled" | "pending" | "unavailable" | "not_confirmed";

export async function buyPlan(plan: IapPlanId, call: Call = nativeCall, fetchImpl: Fetch = fetch): Promise<BuyResult> {
  // Apple's sheet stays open while the person reads it, signs in or checks with their bank: a long wait is normal.
  const r = await call("iap.purchase", { id: IAP_PRODUCT_IDS[plan] }, 15 * 60_000);
  if (r.pending) return "pending";
  if (r.error === "cancelled") return "cancelled";
  if (!r.transactions || r.transactions.length === 0) return "unavailable";
  return (await claimTransactions(r.transactions, fetchImpl)) === "ok" ? "ok" : "not_confirmed";
}

/** Forgets a stored token that came from Apple (or no longer checks out). A token from elsewhere is left alone. */
async function forgetAppleToken(nowMs: number): Promise<void> {
  const { token } = paidStore.get();
  if (!token) return;
  const key = publicKey();
  const claims = key ? await verifyToken(token, key, nowMs) : null;
  if (!claims || claims.src === "apple") forgetPaidToken();
}

/**
 * "refused": Apple holds a current purchase for this Apple ID but our server didn't switch Premium on for it (it used to say "nothing to restore", which was
 * untrue and sent people away); "none" only when Apple's own list is empty.
 */
export type RestoreResult = "restored" | "none" | "refused" | "cancelled" | "failed";

/** "Restore purchases": StoreKit syncs with the App Store (it may ask for the Apple ID password), then the current purchases are swapped for a token. */
export async function restorePurchases(call: Call = nativeCall, fetchImpl: Fetch = fetch, nowMs: number = Date.now()): Promise<RestoreResult> {
  const r = await call("iap.restore", {}, 5 * 60_000);
  if (r.error === "cancelled") return "cancelled";
  if (!r.transactions) return "failed";
  if (r.transactions.length === 0) {
    await forgetAppleToken(nowMs);
    return "none";
  }
  const c = await claimTransactions(r.transactions, fetchImpl);
  return c === "ok" ? "restored" : c === "not_paid" ? "refused" : "failed";
}

let running: Promise<void> | null = null;

/**
 * At start-up and when the app comes back to the front. Apple's list of current purchases decides: nothing there (refunded, cancelled and ended) and an Apple token
 * is forgotten; something there and no token, or one running out within a week, and a fresh token is fetched. No answer from StoreKit or the server (no signal)
 * changes nothing. Never shows a dialog.
 */
export function refreshAppStoreAccess(call: Call = nativeCall, fetchImpl: Fetch = fetch, nowMs: number = Date.now()): Promise<void> {
  running ??= (async () => {
    try {
      const r = await call("iap.entitlements", {}, 30_000);
      if (!r.transactions) return;
      if (r.transactions.length === 0) return await forgetAppleToken(nowMs);
      // the account's own free week or gift never stands in for a purchase Apple holds: the purchase's token replaces it at once
      const { until, plan } = paidStore.get();
      if (until !== null && until - nowMs > REFRESH_BEFORE_MS && !isAccountPlan(plan)) return;
      await claimTransactions(r.transactions, fetchImpl);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Apple's own screen for changing or cancelling a subscription. */
export async function manageSubscriptions(call: Call = nativeCall): Promise<void> {
  await call("iap.manage", {}, 10 * 60_000);
}
