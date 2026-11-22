// The apps' side of buying Premium: Apple In-App Purchase in the iPhone app (app version 1.1; App Store rule 3.1.1: digital features bought inside the app go through Apple)
// and Google Play Billing in the Android app (docs/ANDROID_BRIDGE.md). StoreKit on the phone shows Apple's own payment sheet and checks the purchase
// (MenuMacros/Services/StoreKitPurchaseService.swift); our server checks Apple's signature again and answers with the same access token the rest of the app reads
// (lib/payments/token.ts, POST /api/v1/entitlement/apple). Play Billing shows Google's sheet and hands the app a purchase token; our server asks Google about it
// (POST /api/v1/entitlement/google) and answers with the same kind of token, and the page then tells the app to acknowledge the purchase (Google refunds one that
// isn't acknowledged within 3 days). Only used in an In-App Purchase build of the app (config.ts IAP_ENABLED); the website never calls any of this.
//
// The store keeps the purchase record. A new phone, a reinstall or "Restore purchases" asks the store for the person's current purchases and swaps them for a fresh
// token; a refund or a subscription that has ended disappears from that list, and the token goes at the next start-up or return to the app. Which store is asked is
// the phone's (nativePlatform()); every function takes the platform last so tests can name it, and the iPhone's behaviour is exactly what it was.

import { API_BASE } from "../mm/config";
import { nativeCall, nativePlatform, type NativeAction, type NativePlatform, type NativeProduct, type NativePurchase, type NativeResult } from "../mm/native";
import { forgetPaidToken, paidStore } from "../mm/stores";
import { acceptToken, publicKey } from "./client";
import { googleProductId } from "./googleIds";
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

/** The Google Play product of each plan: one subscription with two base plans, named `<subscription id>:<base plan id>` (Play Console; docs/ANDROID_BRIDGE.md). */
export const GOOGLE_PRODUCT_IDS: Readonly<Record<IapPlanId, string>> = {
  annual: googleProductId("annual"),
  monthly: googleProductId("monthly"),
};

/** The phone's own store: Google Play in the Android app, the App Store in the iPhone app (and in anything else that asks, such as a test). */
export const currentPlatform = (): NativePlatform => nativePlatform() ?? "ios";
/** The product ids to ask the phone's store about. */
export const productIdsFor = (platform: NativePlatform): Readonly<Record<IapPlanId, string>> => (platform === "android" ? GOOGLE_PRODUCT_IDS : IAP_PRODUCT_IDS);

/** A token with less than this left is swapped for a fresh one when the app starts or comes back to the front. */
export const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

type Call = (action: NativeAction, payload?: Record<string, unknown>, timeoutMs?: number) => Promise<NativeResult>;
type Fetch = typeof fetch;

export interface StoreProduct extends NativeProduct {
  plan: IapPlanId;
}

/** The plans as the phone's store sells them (names and prices from StoreKit, or from Play Billing: the store's own text, never ours), in the app's order; null when the store didn't answer. */
export async function loadProducts(call: Call = nativeCall, platform: NativePlatform = currentPlatform()): Promise<StoreProduct[] | null> {
  const ids = productIdsFor(platform);
  const r = await call("iap.products", { ids: IAP_PLAN_IDS.map((p) => ids[p]) }, 30_000);
  const found = IAP_PLAN_IDS.flatMap((plan) => {
    const p = r.products?.find((x) => x.id === ids[plan]);
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

/**
 * Swaps Google Play purchase tokens (Android) for our access token (our server asks Google about each one), then tells the app to acknowledge them: Google refunds a
 * purchase that isn't acknowledged within 3 days, and only a purchase our server accepted is acknowledged. The server answers with one token, so every token sent is
 * acknowledged once it said yes; the app sends only purchases of our own subscription, and acknowledging one twice does nothing. A failed acknowledgement is not
 * the person's problem (the next start-up or Restore purchases claims again and tries again).
 */
export async function claimPurchases(purchases: NativePurchase[], fetchImpl: Fetch = fetch, call: Call = nativeCall): Promise<ClaimResult> {
  if (purchases.length === 0) return "not_paid";
  const sent = purchases.slice(0, 10).map(({ productId, token }) => ({ productId, token }));
  try {
    const res = await fetchImpl(`${API_BASE}entitlement/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchases: sent }) });
    if (res.status === 402) return "not_paid";
    const body = (await res.json().catch(() => ({}))) as { token?: unknown };
    if (!(res.ok && typeof body.token === "string" && (await acceptToken(body.token)))) return "failed";
  } catch {
    return "failed";
  }
  await Promise.allSettled(sent.map((p) => call("iap.acknowledge", { token: p.token }, 30_000)));
  return "ok";
}

/** What a phone's answer holds: how many purchases, and how to swap them for our token. Null when the store gave no list at all. */
function heldIn(r: NativeResult, platform: NativePlatform, fetchImpl: Fetch, call: Call): { count: number; claim: () => Promise<ClaimResult> } | null {
  if (platform === "android") {
    const purchases = r.purchases;
    return purchases ? { count: purchases.length, claim: () => claimPurchases(purchases, fetchImpl, call) } : null;
  }
  const transactions = r.transactions;
  return transactions ? { count: transactions.length, claim: () => claimTransactions(transactions, fetchImpl) } : null;
}

/** "not_confirmed": the store took the payment but our server couldn't be reached or didn't agree; Restore purchases tries again (nothing is charged twice). */
export type BuyResult = "ok" | "cancelled" | "pending" | "unavailable" | "not_confirmed";

export async function buyPlan(plan: IapPlanId, call: Call = nativeCall, fetchImpl: Fetch = fetch, platform: NativePlatform = currentPlatform()): Promise<BuyResult> {
  // The store's sheet stays open while the person reads it, signs in or checks with their bank: a long wait is normal.
  const r = await call("iap.purchase", { id: productIdsFor(platform)[plan] }, 15 * 60_000);
  if (r.pending) return "pending";
  if (r.error === "cancelled") return "cancelled";
  const held = heldIn(r, platform, fetchImpl, call);
  if (!held || held.count === 0) return "unavailable";
  return (await held.claim()) === "ok" ? "ok" : "not_confirmed";
}

/** Forgets a stored token that came from this phone's store (or no longer checks out). A token from elsewhere (the website, the account's free week, the other store) is left alone. */
async function forgetStoreToken(nowMs: number, platform: NativePlatform): Promise<void> {
  const { token } = paidStore.get();
  if (!token) return;
  const key = publicKey();
  const claims = key ? await verifyToken(token, key, nowMs) : null;
  if (!claims || claims.src === (platform === "android" ? "google" : "apple")) forgetPaidToken();
}

/**
 * "refused": Apple holds a current purchase for this Apple ID but our server didn't switch Premium on for it (it used to say "nothing to restore", which was
 * untrue and sent people away); "none" only when Apple's own list is empty.
 */
export type RestoreResult = "restored" | "none" | "refused" | "cancelled" | "failed";

/** "Restore purchases": the phone's store syncs (StoreKit may ask for the Apple ID password; Play Billing asks Google Play), then the current purchases are swapped for a token. */
export async function restorePurchases(call: Call = nativeCall, fetchImpl: Fetch = fetch, nowMs: number = Date.now(), platform: NativePlatform = currentPlatform()): Promise<RestoreResult> {
  const r = await call("iap.restore", {}, 5 * 60_000);
  if (r.error === "cancelled") return "cancelled";
  const held = heldIn(r, platform, fetchImpl, call);
  if (!held) return "failed";
  if (held.count === 0) {
    await forgetStoreToken(nowMs, platform);
    return "none";
  }
  const c = await held.claim();
  return c === "ok" ? "restored" : c === "not_paid" ? "refused" : "failed";
}

let running: Promise<void> | null = null;

/**
 * At start-up and when the app comes back to the front. The store's list of current purchases decides: nothing there (refunded, cancelled and ended) and a token from
 * that store is forgotten; something there and no token, or one running out within a week, and a fresh token is fetched. No answer from the store or the server (no
 * signal) changes nothing. Never shows a dialog. (The name is the iPhone's; on Android it asks Google Play.)
 */
export function refreshAppStoreAccess(call: Call = nativeCall, fetchImpl: Fetch = fetch, nowMs: number = Date.now(), platform: NativePlatform = currentPlatform()): Promise<void> {
  running ??= (async () => {
    try {
      const r = await call("iap.entitlements", {}, 30_000);
      const held = heldIn(r, platform, fetchImpl, call);
      if (!held) return;
      if (held.count === 0) return await forgetStoreToken(nowMs, platform);
      // the account's own free week or gift never stands in for a purchase the store holds: the purchase's token replaces it at once
      const { until, plan } = paidStore.get();
      if (until !== null && until - nowMs > REFRESH_BEFORE_MS && !isAccountPlan(plan)) return;
      await held.claim();
    } finally {
      running = null;
    }
  })();
  return running;
}

/** The store's own screen for changing or cancelling a subscription (Apple's, or Google Play's). */
export async function manageSubscriptions(call: Call = nativeCall): Promise<void> {
  await call("iap.manage", {}, 10 * 60_000);
}
