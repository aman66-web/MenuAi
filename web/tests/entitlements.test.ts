import { describe, expect, it } from "vitest";
import { AI_RECIPES_ENABLED, PRO_ENABLED } from "../lib/mm/config";
import { isPro, needsPaywall, paywallCopy, type PaywallTrigger } from "../lib/mm/entitlements";

describe("gating matrix (SPEC §4)", () => {
  const triggers: PaywallTrigger[] = ["bestForYou", "orderBuilder", "log", "recipeMaker"];
  it("free users hit the paywall on every Pro action; Pro users never do", () => {
    for (const t of triggers) {
      expect(needsPaywall(t, { pro: false })).toBe(true);
      expect(needsPaywall(t, { pro: true })).toBe(false);
    }
  });
  it("saveLimit: free users can save 3 orders, the 4th hits the paywall; Pro is unlimited", () => {
    expect(needsPaywall("saveLimit", { pro: false, savedCount: 0 })).toBe(false);
    expect(needsPaywall("saveLimit", { pro: false, savedCount: 2 })).toBe(false);
    expect(needsPaywall("saveLimit", { pro: false, savedCount: 3 })).toBe(true);
    expect(needsPaywall("saveLimit", { pro: false, savedCount: 10 })).toBe(true);
    expect(needsPaywall("saveLimit", { pro: true, savedCount: 10 })).toBe(false);
  });
});

describe("free launch switches (founder 2026-10-12)", () => {
  it("while Pro is switched off, everyone counts as Pro (every feature open, no paywall); logging stays a Pro feature underneath", () => {
    expect(PRO_ENABLED).toBe(process.env.NEXT_PUBLIC_PRO === "1");
    if (!PRO_ENABLED) expect(isPro({ devProOverride: false })).toBe(true);
    expect(needsPaywall("log", { pro: false })).toBe(true);
  });
  it("Pip's AI recipe maker is off, and is a constant (no environment variable or key can turn it on)", () => {
    expect(AI_RECIPES_ENABLED).toBe(false);
  });
});

describe("paywall copy variants (SPEC §9)", () => {
  it("yearly, eligible for the trial", () => {
    expect(paywallCopy({ plan: "yearly", price: "$34.99", trialDays: 7, trialEligible: true })).toEqual({
      button: "Start 7-day free trial",
      smallPrint: "Free for 7 days, then $34.99/year. We'll remind you 2 days before your trial ends. Cancel any time in Settings.",
    });
  });
  it("yearly, not eligible", () => {
    expect(paywallCopy({ plan: "yearly", price: "$34.99", trialDays: 7, trialEligible: false })).toEqual({
      button: "Subscribe",
      smallPrint: "$34.99/year, renews automatically. Cancel any time in Settings.",
    });
  });
  it("monthly", () => {
    expect(paywallCopy({ plan: "monthly", price: "$6.99" })).toEqual({
      button: "Subscribe",
      smallPrint: "$6.99/month, renews automatically. Cancel any time in Settings.",
    });
  });
  it("builds copy from the product values it is given, never from constants", () => {
    expect(paywallCopy({ plan: "yearly", price: "$39.99", trialDays: 14, trialEligible: true }).button).toBe("Start 14-day free trial");
  });
});
