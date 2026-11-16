import { DEV_TOOLS_ENABLED, FREE_SAVED_ORDER_LIMIT, GATING_ENABLED, PAID_ACCESS_ENABLED, PRO_ENABLED, PRO_PREVIEW_FROM_ENV } from "./config";
import { hasAccess, NO_PAID, type PaidState } from "./paid";
import { englishT, tk, type T } from "./i18n";
import type { UserSettings } from "./user-data";

// SPEC §4: free vs Pro. With GATING_ENABLED off (the free launch) every feature is open. With it on, "Pro" is a preview switch (test builds), a checked payment token
// or the 48 hours given for a WhatsApp share (lib/mm/paid.ts); a payment is verified on the server (lib/payments).

export type PaywallTrigger = "saveLimit" | "bestForYou" | "orderBuilder" | "log" | "recipeMaker" | "truthLimit" | "moreResults" | "leaderboard" | "smallAppetite";

export function isPro(settings: Pick<UserSettings, "devProOverride">, paid: PaidState = NO_PAID, nowMs: number = Date.now()): boolean {
  if (!GATING_ENABLED) return true;
  if (PRO_PREVIEW_FROM_ENV || (DEV_TOOLS_ENABLED && settings.devProOverride)) return true;
  return hasAccess(paid, nowMs);
}

/** Does this action need the paywall? Pro actions are gated; the 4th saved order is gated. */
/**
 * With real paid access on (not the older all-or-nothing test build), the free tier is the one the founder's brief describes: menus, the Truth card for three dishes a day, the top two
 * results of Best for you and of each Quick answers list, and up to three saved orders. Logging and the order builder stay free; what is paid is the rest of those lists, every Smart Swap,
 * the full Cheapest protein list, the small-appetite optimiser and unlimited saved orders.
 */
export const PAID_TIER_ONLY = PAID_ACCESS_ENABLED && !PRO_ENABLED;
/** Results of Best for you a free person sees in that tier. */
export const FREE_BEST_RESULTS = 2;

export function needsPaywall(trigger: PaywallTrigger, ctx: { pro: boolean; savedCount?: number }, limit = FREE_SAVED_ORDER_LIMIT): boolean {
  if (ctx.pro) return false;
  if (PAID_TIER_ONLY && (trigger === "orderBuilder" || trigger === "log" || trigger === "recipeMaker")) return false;
  if (trigger === "saveLimit") return (ctx.savedCount ?? 0) >= limit;
  return true;
}

// ---- paywall copy (SPEC §9), built from product values so prices are never hard-coded in UI ----

export interface PaywallProduct {
  plan: "yearly" | "monthly";
  price: string; // display price, e.g. "$34.99"
  monthlyEquivalent?: string; // yearly only, e.g. "$2.92"
  trialDays?: number; // introductory offer length
  trialEligible?: boolean;
}

export interface PaywallCopy {
  button: string;
  smallPrint: string;
}

export function paywallCopy(p: PaywallProduct, t: T = englishT): PaywallCopy {
  if (p.plan === "monthly") {
    return { button: t("Subscribe"), smallPrint: t("{price}/month, renews automatically. Cancel any time in Settings.", { price: p.price }) };
  }
  if (p.trialEligible && p.trialDays) {
    return {
      button: t("Start {days}-day free trial", { days: p.trialDays }),
      smallPrint: t("Free for {days} days, then {price}/year. We'll remind you 2 days before your trial ends. Cancel any time in Settings.", { days: p.trialDays, price: p.price }),
    };
  }
  return { button: t("Subscribe"), smallPrint: t("{price}/year, renews automatically. Cancel any time in Settings.", { price: p.price }) };
}

export const PAYWALL_TITLE = tk("Build the perfect order, every time");
/** What paid access adds once it exists (shown instead of the older list when payments are on). */
export const PAID_BULLETS = [
  tk("Truth cards for every dish, not just three a day"),
  tk("Every Smart Swap and every Quick answer"),
  tk("The full Cheapest protein list"),
  tk("Top 5 picks for your goal at every chain"),
  tk("Unlimited saved orders"),
] as const;
export const PAYWALL_BULLETS = [
  tk("Top 5 picks for your goal at every chain"),
  tk("Build your order with live totals"),
  tk("Keep a log of what you eat today"),
  tk("Unlimited saved orders"),
  tk("Pip makes new recipes just for you"),
] as const;
