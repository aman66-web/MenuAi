import { DEV_TOOLS_ENABLED, FREE_SAVED_ORDER_LIMIT, PRO_PREVIEW_FROM_ENV } from "./config";
import type { UserSettings } from "./user-data";

// SPEC §4: free vs Pro. Payments are not wired on the web yet, so "Pro" comes only from the preview switches.
// When payments exist, this is the one place to add a verified purchase.

export type PaywallTrigger = "saveLimit" | "bestForYou" | "orderBuilder" | "log";

export function isPro(settings: Pick<UserSettings, "devProOverride">): boolean {
  return PRO_PREVIEW_FROM_ENV || (DEV_TOOLS_ENABLED && settings.devProOverride);
}

/** Does this action need the paywall? Pro actions are gated; the 4th saved order is gated. */
export function needsPaywall(trigger: PaywallTrigger, ctx: { pro: boolean; savedCount?: number }, limit = FREE_SAVED_ORDER_LIMIT): boolean {
  if (ctx.pro) return false;
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

export function paywallCopy(p: PaywallProduct): PaywallCopy {
  if (p.plan === "monthly") {
    return { button: "Subscribe", smallPrint: `${p.price}/month, renews automatically. Cancel any time in Settings.` };
  }
  if (p.trialEligible && p.trialDays) {
    return {
      button: `Start ${p.trialDays}-day free trial`,
      smallPrint: `Free for ${p.trialDays} days, then ${p.price}/year. We'll remind you 2 days before your trial ends. Cancel any time in Settings.`,
    };
  }
  return { button: "Subscribe", smallPrint: `${p.price}/year, renews automatically. Cancel any time in Settings.` };
}

export const PAYWALL_TITLE = "Build the perfect order, every time";
export const PAYWALL_BULLETS = [
  "Top 5 picks for your goal at every chain",
  "Build your order with live totals",
  "Keep a log of what you eat today",
  "Unlimited saved orders",
] as const;
