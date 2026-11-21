import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FREE_IN_PAID_TIER, FREE_BEST_RESULTS } from "../lib/mm/entitlements";
import { FREE_SAVED_ORDER_LIMIT } from "../lib/mm/config";
import { freeWeekDaysLeft } from "../lib/mm/freeWeek";
import { SYNC_STORES } from "../lib/mm/syncMerge";
import { suggestCarbFat } from "../lib/mm/targets";

// The 30-person meeting of 21 November 2026, second pass (fixer 6): the words, Premium, privacy, server, store text and script fixes that the first chair's list
// was cut off before. Each test is the check that would have caught its finding.

const read = (path: string) => readFileSync(path, "utf8");
const STORE = () => read("../docs/STORE.md");
/** The 1.1 What's New block the founder pastes for build 11 (the first code block after its heading). */
const whatsNew = () => /\*\*What's New in This Version\*\* \(build 11[^\n]*\n\n```\n([\s\S]*?)```/.exec(STORE())?.[1] ?? "";
/** The build 11 Notes for App Review block. */
const reviewNote = () => /\*\*Added to the Notes for App Review\*\* \(build 11[^\n]*\n\n```\n([\s\S]*?)```/.exec(STORE())?.[1] ?? "";

describe("the 1.1 store words say only what is true (Tara #5, Bea #65, #69; rule 8)", () => {
  it("What's New for build 11 is marked and no longer says everything free stays free, or sells Cheapest protein, logos or a synced meal plan", () => {
    const words = whatsNew();
    expect(words).toContain("What's new in 1.1");
    // 1.1 keeps Best for you to 2 picks and saved orders to 3 for free: not everything free stayed free; menus, recipes, labels and the food diary did
    expect(FREE_BEST_RESULTS).toBe(2);
    expect(FREE_SAVED_ORDER_LIMIT).toBe(3);
    expect(FREE_IN_PAID_TIER).toContain("log");
    expect(words).not.toContain("Everything that was free stays free.");
    expect(words).toContain("Every menu, recipe and label stays free, and so does your food diary.");
    expect(words).not.toMatch(/Cheapest protein/);
    expect(words).toContain("the full Nutrition leaderboards");
    // the free week is no Apple trial, and comes once per person and iPhone
    expect(words).not.toContain("Try it free for 7 days");
    expect(words).toContain("Your first 7 days of Premium are free (one free week per person and iPhone), then choose Monthly or Annual.");
    // no logo promised in store words (CLAUDE.md rule 2), and the meal plan isn't synced
    expect(words).not.toMatch(/logo/i);
    expect(words).toContain("with each shop's price side by side");
    expect(SYNC_STORES as readonly string[]).not.toContain("mealPlan");
    expect(words).not.toContain("your plan, meals and lists");
    expect(words).toContain("A free account keeps your goal, saved meals and lists on all your devices");
    // products with no label of their own are named on screen
    expect(words).toContain("own published information (where a shop prints none, Open Food Facts or the UK government's figures, each named on screen), except Scan your food");
    // the limit for What's New is 4,000 characters
    expect(words.length).toBeLessThan(4000);
  });

  it("the build 11 review note says the recipes' numbers come from the products' numbers, not only their own labels", () => {
    const note = reviewNote();
    expect(note).toContain("worked out by the app from the products' numbers.");
    expect(note).not.toContain("from the products' own labels");
    expect(STORE()).toMatch(/build 11: the founder pastes this block, with its In-App Purchase paragraph replaced by the one at the end of this file/);
  });

  it("the 1.0 description and promotional text are marked not for 1.1, and the price row names the purchases", () => {
    const store = STORE();
    expect(store).toMatch(/## Description \(draft\)\n\n\*\*1\.0 only, superseded: don't paste for 1\.1\.\*\*/);
    expect(store).toMatch(/\| Promotional text \(170\) \| \*\*1\.0 only, superseded: don't paste for 1\.1\*\*/);
    expect(store).toContain("| Price | Free, with In-App Purchase (Annual, Monthly) |");
    expect(store).not.toContain("Free (no in-app purchases in this version)");
  });
});

describe("Settings: a new protein target lets the worked-out carbs and fat follow (Arjun #54)", () => {
  it("carbs and fat are worked out from calories and protein, so a new protein makes the old split wrong", () => {
    expect(suggestCarbFat(2000, 100)).not.toEqual(suggestCarbFat(2000, 150));
  });

  it("the Protein box empties carbs and fat that were the old worked-out figures, as the Calories box does", () => {
    const src = read("app/app/settings/SettingsScreen.tsx");
    const tile = (label: string) => new RegExp(`<TargetTile[^\\n]*label=\\{t\\("${label.replace(/[()]/g, "\\$&")}"\\)\\}[^\\n]*`).exec(src)?.[0] ?? "";
    expect(tile("Calories")).toContain("followCalories();");
    expect(tile("Protein (g)")).toContain("followCalories();");
    // followCalories compares with the split of the SAVED numbers and keeps what the person typed (an untouched box is null)
    expect(src).toMatch(/function followCalories\(\) \{\s*const was = suggestCarbFat\(settings\.dailyCalories, settings\.dailyProtein\);\s*if \(carbs === null/);
  });
});

describe("onboarding's allergy caution covers recipes and products too (Tara #7, a safety correction)", () => {
  it("names where each kind of filter comes from and asks to check the pack or staff", () => {
    const src = read("app/app/welcome/QuestionSteps.tsx");
    expect(src).toContain('allergyCaution={t("Restaurants: from their allergen guide. Recipes and products: from their ingredients. Always check the pack or ask staff.")}');
    expect(src).not.toContain("Filters use each restaurant's own allergen guide. Always check with staff.");
  });
});

describe("the plans say the free week is on while it runs (Tara #9, Bea #68)", () => {
  it("whole days left, a part day counted as a day", () => {
    const now = 1_000_000_000;
    expect(freeWeekDaysLeft(now + 6.2 * 86_400_000, now)).toBe(7);
    expect(freeWeekDaysLeft(now + 3_600_000, now)).toBe(1);
    expect(freeWeekDaysLeft(now, now)).toBe(0);
  });

  it("useFreeWeekDaysLeft works it out as Settings › Subscription does, on the In-App Purchase app only", () => {
    const hook = read("app/app/_lib/freeWeek.ts");
    expect(hook).toMatch(/export function useFreeWeekDaysLeft\(\): number \{[\s\S]*?useStore\(paidStore\)[\s\S]*?useNow\(\)[\s\S]*?if \(!IAP_ENABLED\) return 0;[\s\S]*?paidActive\(paid, nowMs\) && paid\.plan === "trial" && paid\.until \? freeWeekDaysLeft\(paid\.until, nowMs\) : 0;/);
    const settings = read("app/app/settings/SettingsScreen.tsx");
    expect(settings).toContain('paying && paid.plan === "trial" && paid.until ? freeWeekDaysLeft(paid.until, nowMs) : 0');
  });

  it("PremiumHero's headline says the days left (Settings' own words) before 'Get more with Premium', and no trial price under it", () => {
    const offer = read("app/app/_components/PremiumOffer.tsx");
    const hero = /export function PremiumHero[\s\S]*?\n}\n/.exec(offer)?.[0] ?? "";
    // the hook is called on every render (never after a condition)
    expect(hero).toMatch(/\n  const left = useFreeWeekDaysLeft\(\);\n  const daysLeft = ended \? 0 : left;/);
    // while the free week runs no Apple trial is headlined (so its "Then £… a year." line goes too), and the days left come before "Get more with Premium"
    expect(hero).toMatch(/PremiumHero\(\{ trial: offered,/);
    expect(hero).toContain("const trial = daysLeft > 0 ? null : offered;");
    expect(hero).toMatch(/: daysLeft > 0 \? \(daysLeft === 1 \? t\(FREE_WEEK_LAST_DAY\) : t\(FREE_WEEK_LEFT, \{ n: daysLeft \}\)\) : t\("Get more with Premium"\)\}/);
    expect(hero.indexOf("FREE_WEEK_ENDED")).toBeLessThan(hero.indexOf("FREE_WEEK_LEFT"));
  });
});

describe("privacy: the AI features' limit counts the Premium token, and the date moved (Umar #15, #16; Bea #67)", () => {
  it("Make it at home, Cook with what you have and Scan your food no longer say an IP scramble limits them", () => {
    const page = read("app/(site)/privacy/page.tsx");
    expect(page).not.toMatch(/same one-way scramble of your IP address stops/);
    expect(page.match(/a one-way scramble of details in that token \(never a name or email\), held only in our server&apos;s memory for a day at most, stops one person asking too often\./gi)).toHaveLength(3);
    // what the server really counts: the token (or its fixed claims), hashed
    expect(read("lib/photoRecipeRoute.ts")).toMatch(/if \(r\.token && r\.claims\) who = limitKey\(r\.token, r\.claims\);/);
  });

  it("the barcode lookup's per-caller count is said where barcodes are", () => {
    const page = read("app/(site)/privacy/page.tsx");
    expect(page).not.toContain("only the barcode is sent, and nothing about you is kept.");
    expect(page).toContain("only the barcode is sent to it. A one-way scramble of your IP address, held\n          only in our server&apos;s memory for a day at most, stops one person asking too often.");
  });

  it("the policy's date is the day it last changed", () => {
    expect(read("site.config.ts")).toContain('privacyLastUpdated: "21 November 2026"');
  });
});

describe("the barcode route counts its caller (Umar #18)", () => {
  it("passes the salted IP hash to the lookup, and never fails a lookup because the server's settings are missing", () => {
    const route = read("app/api/v1/barcode/[code]/route.ts");
    expect(route).toContain("await barcodeLookup(code, caller(request))");
    expect(route).toMatch(/function caller\(request: Request\): string \| undefined \{\s*try \{\s*return ipHash\(request\) \?\? undefined;\s*\} catch \{\s*return undefined;/);
  });
});

describe("'How we get our numbers' (Tara #10)", () => {
  it("says 'Report a number' straight after the restaurants, where that button is, with SPEC §12.3's words", () => {
    const src = read("app/app/settings/numbers/NumbersContent.tsx");
    const paras = [...src.matchAll(/<p[^>]*>\{t\("([^"]+)"/g)].map((m) => m[1]!);
    const restaurants = paras.findIndex((p) => p.startsWith("Restaurant numbers in {app}"));
    expect(paras[restaurants + 1]).toBe("Spot something wrong? Tap ‘Report a number’ and we'll check within 48 hours.");
    expect(paras.filter((p) => p.startsWith("Spot something wrong?"))).toHaveLength(1);
  });
});

describe("Scan your food gives a scan back when the AI is down (first-pass leftover)", () => {
  it("its route hands the handler a give-back, as the photo, describe and fridge routes do", () => {
    const route = read("app/api/v1/scan/route.ts");
    expect(route).toContain("giveBack: () => limit.release(who.who()),");
    expect(read("lib/foodScanHandler.ts")).toContain("giveBack?: () => void;");
  });
});

describe("docs/BACKEND.md (Umar #19)", () => {
  it("says sign-in is required and that migrations go through the SQL Editor, never supabase db push", () => {
    const doc = read("../docs/BACKEND.md");
    expect(doc).not.toContain("No user accounts, no tracking.");
    expect(doc).toContain("- Sign-in is required (accounts and sync: see below); no tracking. The privacy policy is `web/app/(site)/privacy/page.tsx`.");
    expect(doc).not.toContain("Apply with `supabase db push`.");
    expect(doc).toContain("The founder applies each migration in Supabase's SQL Editor; never `supabase db push`.");
  });
});

describe("the App Store pack refuses a web/.env* file (Cal #75)", () => {
  it("stops before next build when one is there (only .env.example may be)", () => {
    const script = read("../scripts/build_app_web.sh");
    const guard = script.indexOf("for f in .env .env.local .env.production .env.production.local; do");
    expect(guard).toBeGreaterThan(script.indexOf('cd "$here/web"'));
    expect(guard).toBeLessThan(script.indexOf("npx next build"));
    expect(script).toContain('echo "Remove web/$f first: next build would read it into the app." >&2');
  });
});

describe("stale browser-test lines (Cal #73, part)", () => {
  it("iap.mjs walks the seven-screen welcome instead of a button that no longer exists", () => {
    const e2e = read("e2e/iap.mjs");
    expect(e2e).not.toMatch(/getByRole\("button", \{ name: "Skip setup and make my account" \}\)/);
    expect(e2e).toContain('import { planNext, recipes, shops, skipBody } from "./welcome-steps.mjs";');
    expect(e2e).toMatch(/await shops\(page\);\s*await recipes\(page\);\s*await skipBody\(page\);\s*await planNext\(page\);\s*expect\(\(await page\.getByRole\("dialog"\)\.count\(\)\) === 0/);
  });

  it("homepages.mjs expects the week's protein note Home really shows", () => {
    const note = "Some foods this week don't list protein, so protein counts only the foods that do.";
    expect(read("e2e/homepages.mjs")).toContain(note);
    expect(read("app/app/_components/HomeWeek.tsx")).toContain(note);
  });
});
