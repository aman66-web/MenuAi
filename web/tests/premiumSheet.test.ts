import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { RECIPE_THUMBS } from "../lib/mm/recipeThumbs";

// The Premium sheet redesign (founder, 20 November 2026, 23:05: "This has got to look more interesting also mention is a 7 day free trial"). What a screenshot
// can't keep honest: the pictures are our own recipes', the free-trial headline is never larger
// than the billed amount (App Review 3.1.2(c)) and the price after the trial sits under it, Apple's words stay on the sheet, and nothing promises a reminder the
// app doesn't send.

const src = (f: string) => readFileSync(f, "utf8");
const PICTURES = src("app/app/_components/PremiumPictures.tsx");
const OFFER = src("app/app/_components/PremiumOffer.tsx");
const PLANS = src("app/app/_components/AppStorePlans.tsx");
const TRIAL = src("app/app/_components/TrialOffer.tsx");

/** px of a Tailwind arbitrary rem size, e.g. text-[1.625rem] → 26. */
const rem = (cls: string) => Number(cls.match(/text-\[([\d.]+)rem\]/)?.[1]) * 16;

describe("the Premium sheet's pictures", () => {
  it("are only our own recipes' pictures, each in the book", () => {
    const block = PICTURES.slice(PICTURES.indexOf("PREMIUM_PICTURE_RECIPES = {"), PICTURES.indexOf("} as const;"));
    const ids = [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const id of ids) expect(RECIPE_THUMBS[id] ?? RECIPE_IMAGES[id], `${id} has no picture`).toMatch(/^\/recipe-images\//);
  });

  it("show no chain or shop picture, no logo, no Pip and no number", () => {
    expect(PICTURES).not.toMatch(/menu-images|\/logos\/|ChainMark|ItemPhoto|Mascot|<Pip|kcal|\{n\}/);
    expect(OFFER).not.toMatch(/Mascot|<Pip/);
  });

  it("are decorative: every picture is hidden from screen readers", () => {
    expect(PICTURES).toMatch(/export function PremiumHeroPicture[\s\S]*?aria-hidden/);
    const cases = PICTURES.slice(PICTURES.indexOf("export function FeaturePicture"));
    expect((cases.match(/<span aria-hidden/g) ?? []).length).toBe(4);
    expect(PICTURES).toMatch(/alt=""/);
  });
});

describe("the free trial and the price on the sheet (App Review 3.1.2)", () => {
  it("the trial headline is smaller than the billed amount under the plans, and the price after the trial sits straight under it", () => {
    const headline = OFFER.match(/<Heading className=\{`mt-4 [^`]*(text-\[[\d.]+rem\])/)?.[1] ?? "";
    const billed = PLANS.match(/<span className="(text-\[[\d.]+rem\]) font-extrabold tracking-tight">\{selected\.price\}/)?.[1] ?? "";
    expect(rem(headline)).toBeGreaterThan(20);
    expect(rem(billed)).toBeGreaterThan(rem(headline));
    expect(OFFER).toMatch(/t\("Try Premium free for \{days\} days", \{ days: trial \}\)[\s\S]{0,200}<\/Heading>\s*\{trial && price && !waiting && <p[^>]*>\{t\("Then \{price\} \{per\}\.", \{ price, per \}\)\}/);
  });

  it("the prices come from StoreKit through AppStorePlans, never typed", () => {
    const code = `${OFFER}${PICTURES}`.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    expect(code).not.toMatch(/£|\$\d|49\.99|4\.99/);
    expect(PLANS).toMatch(/<PremiumHero trial=\{selected\?\.trialDays \?\? null\} price=\{selected\?\.price \?\? null\}/);
  });

  it("keeps Apple's words, Restore and the links on the sheet", () => {
    for (const words of [
      "With the free trial you pay nothing for the first {days} days. If you don't cancel at least 24 hours before it ends, the subscription starts and you're charged. There is one free trial per Apple ID.",
      "Payment is charged to your Apple ID when you confirm.",
      "Restore purchases",
      "Terms of Use (EULA)",
      "Privacy Policy",
      "First {days} days free, then {price} {per}. Renews until you cancel.",
      "First {days} days free",
    ]) expect(PLANS, words).toContain(words);
  });

  it("the trial's steps say when it is charged and how to cancel, and promise no reminder (the app sends none)", () => {
    const story = OFFER.slice(OFFER.indexOf("export function TrialStory"));
    expect(story).toContain("Your plan starts. You pay {price} {per}.");
    expect(story).toContain("Cancel in your App Store settings at least 24 hours before, and you pay nothing.");
    expect(`${story}${PLANS}${TRIAL}`).not.toMatch(/remind/i);
  });
});

describe("the one-time free-trial offer uses the same sheet", () => {
  it("Not now straight under Continue, then how the trial works and what Premium adds; no second line about the trial over the headline", () => {
    expect(TRIAL).toMatch(/afterContinue=\{\s*<>\s*<Button size="lg" full variant="secondary" className="mt-2\.5" onClick=\{\(\) => setOpen\(false\)\}>\{t\("Not now"\)\}<\/Button>/);
    expect(TRIAL).toMatch(/features=\{<PremiumOffer \/>\}/);
    expect(TRIAL).not.toContain("You can still have a {days}-day free trial.");
  });
});
