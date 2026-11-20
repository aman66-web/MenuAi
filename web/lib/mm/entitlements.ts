import { DEV_TOOLS_ENABLED, FREE_SAVED_ORDER_LIMIT, GATING_ENABLED, PAID_ACCESS_ENABLED, PRO_ENABLED, PRO_PREVIEW_FROM_ENV } from "./config";
import { hasAccess, NO_PAID, type PaidState } from "./paid";
import { englishT, tk, type T } from "./i18n";
import type { UserSettings } from "./user-data";

// SPEC §4: free vs Pro. With GATING_ENABLED off (the free launch) every feature is open. With it on, "Pro" is a preview switch (test builds), a checked payment token
// or the 48 hours given for a WhatsApp share (lib/mm/paid.ts); a payment is verified on the server (lib/payments).

export const PAYWALL_TRIGGERS = ["saveLimit", "bestForYou", "orderBuilder", "log", "recipeMaker", "truthLimit", "moreResults", "leaderboard", "smallAppetite", "photoRecipe", "foodScan", "mealPlan", "fridgeRecipe"] as const;
export type PaywallTrigger = (typeof PAYWALL_TRIGGERS)[number];

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
/** What stays free in that tier: logging (founder 19-20 Nov, free in 1.1), the order builder, and Pip's dormant recipe maker. Every other trigger is on the
 *  Premium list (lib/mm/premiumFeatures.ts; tests/premiumFeatures.test.ts checks it). */
export const FREE_IN_PAID_TIER: readonly PaywallTrigger[] = ["orderBuilder", "log", "recipeMaker"];
/** Results of Best for you a free person sees in that tier. */
export const FREE_BEST_RESULTS = 2;

export function needsPaywall(trigger: PaywallTrigger, ctx: { pro: boolean; savedCount?: number }, limit = FREE_SAVED_ORDER_LIMIT): boolean {
  if (ctx.pro) return false;
  if (PAID_TIER_ONLY && FREE_IN_PAID_TIER.includes(trigger)) return false;
  if (trigger === "saveLimit") return (ctx.savedCount ?? 0) >= limit;
  return true;
}

/**
 * Is adding a meal paid on this build? The same test Home's + makes (gate("log")): only where free and paid are told apart (GATING_ENABLED) and the paid
 * tier doesn't keep logging free (PAID_TIER_ONLY makes needsPaywall("log") false). Bare needsPaywall is true on a build with no gating at all, so it can't be
 * used alone. Pip's + tip (coachSteps.ts) says "It's part of Premium", and the last welcome screen's free and Premium line names adding what you eat on the
 * paid side, exactly when this is true, so neither is untrue on any build.
 */
export const LOG_IS_PAID = GATING_ENABLED && needsPaywall("log", { pro: false });

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
      // no reminder is promised: nothing sends one (the onboarding meeting, 20 November 2026; App Review 3.1.2(c)). A line may mention a reminder only once one
      // is really scheduled.
      smallPrint: t("Free for {days} days, then {price}/year. Cancel any time in Settings.", { days: p.trialDays, price: p.price }),
    };
  }
  return { button: t("Subscribe"), smallPrint: t("{price}/year, renews automatically. Cancel any time in Settings.", { price: p.price }) };
}

export const PAYWALL_TITLE = tk("Build the perfect order, every time");
// What paid access adds is one list, lib/mm/premiumFeatures.ts (read by PremiumOffer on the paywall, the trial offer and /app/pro). This older list is only the
// test builds' (NEXT_PUBLIC_PRO=1, no paid access), where logging and the order builder are still behind the paywall; Pip's recipe maker is dormant, so it isn't on it.
export const PAYWALL_BULLETS = [
  tk("Top 5 picks for your goal at every restaurant"),
  tk("Build your order with live totals"),
  tk("Keep a log of what you eat today"),
  tk("Unlimited saved orders"),
] as const;
