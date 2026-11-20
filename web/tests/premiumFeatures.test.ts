import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOOD_SCAN_ENABLED, PHOTO_RECIPES_ENABLED } from "../lib/mm/config";
import { FREE_IN_PAID_TIER, PAYWALL_TRIGGERS } from "../lib/mm/entitlements";
import { englishT } from "../lib/mm/i18n";
import { BOARD_SIZE } from "../lib/mm/leaderboards";
import { FREE_LEADERBOARD_ROWS, FREE_TRUTH_PER_DAY } from "../lib/mm/paid";
import { afterSignInGate, headlineFeatures, moreFeatures, PAYWALL_REASON, PREMIUM_FEATURES, premiumFeaturesOn } from "../lib/mm/premiumFeatures";

// What Premium adds is one list (lib/mm/premiumFeatures.ts): the paywall, the free-trial offer and /app/pro all read it through PremiumOffer, so they can't disagree
// again (the overnight audit of 20 November 2026 found three lists, one still selling a recipe maker that is off and "Cheapest protein" after it became the
// leaderboards).

describe("the one list of what Premium adds", () => {
  it("every Premium action someone can tap on a paid build is on it, once; what stays free there is not", () => {
    const listed = PREMIUM_FEATURES.flatMap((f) => f.triggers);
    expect(new Set(listed).size).toBe(listed.length);
    for (const trigger of PAYWALL_TRIGGERS) {
      if (FREE_IN_PAID_TIER.includes(trigger)) expect(listed, `${trigger} is free in 1.1 and must not be sold`).not.toContain(trigger);
      else expect(listed, `${trigger} opens a paywall but isn't on the Premium list`).toContain(trigger);
    }
  });

  it("logging stays free and Pip's dormant recipe maker is never sold (founder: logging is free in 1.1)", () => {
    expect(FREE_IN_PAID_TIER).toEqual(expect.arrayContaining(["log", "recipeMaker", "orderBuilder"]));
    const words = PREMIUM_FEATURES.map((f) => `${f.title} ${f.line}`).join(" ");
    expect(words).not.toMatch(/log what you eat|keep a log|recipe maker|recipes just for you|Cheapest protein|at every chain/i);
  });

  it("a photo feature is listed only on a build that has it", () => {
    const on = (id: string) => premiumFeaturesOn().some((f) => f.id === id);
    expect(on("foodScan")).toBe(FOOD_SCAN_ENABLED);
    expect(on("photoRecipe")).toBe(PHOTO_RECIPES_ENABLED);
    expect(on("fridgeRecipe")).toBe(PHOTO_RECIPES_ENABLED);
    expect(on("mealPlan") && on("truth") && on("leaderboards")).toBe(true);
  });

  it("four first, the rest behind the disclosure, nothing twice and nothing lost", () => {
    const head = headlineFeatures();
    const more = moreFeatures();
    expect(head).toHaveLength(4);
    expect(head[0]!.id).toBe("mealPlan");
    expect([...head, ...more].map((f) => f.id).sort()).toEqual(premiumFeaturesOn().map((f) => f.id).sort());
    // where the photo features are off, the four are still four
    const noPhotos = PREMIUM_FEATURES.filter((f) => !["foodScan", "photoRecipe", "fridgeRecipe"].includes(f.id));
    expect(headlineFeatures(noPhotos).map((f) => f.id)).toEqual(["mealPlan", "truth", "quickAnswers", "smallAppetite"]);
  });

  it("the numbers in its lines are the limits themselves, never typed again", () => {
    const line = (id: string) => {
      const f = PREMIUM_FEATURES.find((x) => x.id === id)!;
      return englishT(f.line, f.values);
    };
    expect(line("truth")).toBe(`Not just ${FREE_TRUTH_PER_DAY} a day`);
    expect(line("leaderboards")).toBe(`All ${BOARD_SIZE} on every board, every shop`);
    expect(englishT(PAYWALL_REASON.leaderboard.text, PAYWALL_REASON.leaderboard.values)).toBe(`The top ${FREE_LEADERBOARD_ROWS} are free. Premium shows the full top ${BOARD_SIZE}.`);
    expect(englishT(PAYWALL_REASON.truthLimit.text, PAYWALL_REASON.truthLimit.values)).toBe(`You've seen today's ${FREE_TRUTH_PER_DAY} free Truth cards. More tomorrow, or every one with Premium.`);
  });

  it("every trigger says why the paywall opened, in plain words with no placeholder left over", () => {
    for (const trigger of PAYWALL_TRIGGERS) {
      const r = PAYWALL_REASON[trigger];
      expect(r, trigger).toBeTruthy();
      expect(englishT(r.text, r.values), trigger).not.toMatch(/[{}!]/);
    }
  });

  it("PremiumOffer and the plans page draw exactly this list (no list of their own)", () => {
    const offer = readFileSync("app/app/_components/PremiumOffer.tsx", "utf8");
    expect(offer).toContain('from "@/lib/mm/premiumFeatures"');
    expect(offer).toMatch(/headlineFeatures\(\)/);
    expect(offer).toMatch(/moreFeatures\(\)/);
    expect(offer).not.toMatch(/tk\(/); // no feature words of its own
    const pro = readFileSync("app/app/pro/page.tsx", "utf8");
    expect(pro).toContain("<PremiumOffer");
    expect(pro).not.toMatch(/BULLETS/);
    const paywall = readFileSync("app/app/_components/Paywall.tsx", "utf8");
    expect(paywall).toContain("<PremiumOffer");
    expect(paywall).not.toMatch(/PAID_BULLETS/);
    expect(readFileSync("app/app/_components/TrialOffer.tsx", "utf8")).toContain("<PremiumOffer");
  });
});

describe("the free-trial sheet after the sign-in screen", () => {
  it("a visit that came through the sign-in screen holds the offer; a signed-in launch (wait, then open) never does", () => {
    // signed in already: a moment of "wait" while storage is read, then the app
    let s = afterSignInGate(false, "wait");
    expect(s).toEqual({ sawSignIn: false, holdTrialOffer: false });
    s = afterSignInGate(s.sawSignIn, "open");
    expect(s.holdTrialOffer).toBe(false);
    // a 1.0 user updating to 1.1: the sign-in screen, the check after Apple or Google ("wait"), then the app
    s = afterSignInGate(false, "signIn");
    expect(s).toEqual({ sawSignIn: true, holdTrialOffer: false });
    s = afterSignInGate(s.sawSignIn, "wait");
    expect(s).toEqual({ sawSignIn: true, holdTrialOffer: false });
    s = afterSignInGate(s.sawSignIn, "open");
    expect(s.holdTrialOffer).toBe(true);
  });

  it("AppShell holds the offer with it, and the trial sheet checks the hold again just before it shows", () => {
    const shell = readFileSync("app/app/_components/AppShell.tsx", "utf8");
    expect(shell).toMatch(/afterSignInGate\(sawSignIn\.current, gate\)/);
    expect(shell).toMatch(/holdTrialOfferThisVisit\(\)/);
    expect(readFileSync("app/app/_components/TrialOffer.tsx", "utf8")).toMatch(/function show\(\) \{\s*if \(setUpThisVisit\) return;/);
  });
});
