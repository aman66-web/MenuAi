"use client";

import { useState } from "react";
import { assetUrl } from "@/lib/mm/config";
import { localeInfo } from "@/lib/mm/i18n";
import type { PremiumFeature } from "@/lib/mm/premiumFeatures";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { RECIPE_THUMBS } from "@/lib/mm/recipeThumbs";
import { useLanguage, useT } from "../_lib/i18n";
import { ArrowRightIcon, CameraIcon, PotIcon } from "./icons";

// The Premium sheet's pictures (founder, 20 November 2026: "This has got to look more interesting"): small scenes of what Premium does, made only of our own
// recipes' pictures (CLAUDE.md rule 2: our recipe illustrations in public/recipe-images, packed in the app) and our own drawing, never a chain's or a shop's
// photo or logo, never Pip (he never shares a screen with a price) and never a number. All decorative (aria-hidden): the words beside them say what each is.
// Each feature keeps its one look (colour meeting, 19 November 2026): the meal plan on its pale green (tint-plan), "cook with what you have" on its cream
// (tint-cook) with the foods as white tags, a scan as the scanner's white corners round a photo with the ink camera; nothing lime (lime means chosen, today or
// done). Every size is in px, so a picture keeps its shape at any text size (checked at 200%) while the words around it grow.

/** The recipes in the pictures: colourful, everyday, and in the book (tests/premiumPictures.test.ts checks each has a picture). */
export const PREMIUM_PICTURE_RECIPES = {
  heroWeek: ["berry-yogurt-porridge", "mexican-bean-rice-bowl", "salmon-lemon-rice-broccoli"],
  heroBack: "pesto-pasta-mozzarella-salad",
  heroScan: "coconut-vegetable-curry",
  planWeek: ["banana-berry-overnight-oats", "chickpea-rice-bowl", "soy-honey-salmon-bowl", "rice-stuffed-peppers"],
  scan: "paprika-chicken-peppers-rice",
  atHome: "spaghetti-bolognese",
} as const;

/** One of our recipes' pictures (its small copy first), cropped to the box; the page fill alone when it can't load. */
function RecipePic({ id, className, eager = false }: { id: string; className: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = RECIPE_THUMBS[id] ?? RECIPE_IMAGES[id];
  if (!src || failed) return <span className={`block bg-fill ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element -- our own recipe's illustration, a static file named by its hash; decorative
  return <img src={assetUrl(src)} alt="" width={240} height={180} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} className={`block bg-fill object-cover ${className}`} />;
}

/** The scanner's four white corners over a photo, inset a little from its edges. */
function ScanCorners({ inset = "6px" }: { inset?: string }) {
  const c = "absolute h-[16px] w-[16px] border-on-ink";
  return (
    <span className="absolute" style={{ inset }}>
      <span className={`${c} start-0 top-0 rounded-ss-[6px] border-s-[3px] border-t-[3px]`} />
      <span className={`${c} end-0 top-0 rounded-se-[6px] border-e-[3px] border-t-[3px]`} />
      <span className={`${c} bottom-0 start-0 rounded-es-[6px] border-b-[3px] border-s-[3px]`} />
      <span className={`${c} bottom-0 end-0 rounded-ee-[6px] border-b-[3px] border-e-[3px]`} />
    </span>
  );
}

/** The ink camera dot that marks a scan. */
function CameraDot({ className = "" }: { className?: string }) {
  return (
    <span className={`absolute grid h-[32px] w-[32px] place-items-center rounded-full border-2 border-card bg-ink text-on-ink ${className}`}>
      <CameraIcon className="h-[16px] w-[16px]" />
    </span>
  );
}

/** A recipe as a small white card: the pot and two lines of method. What a photo or the foods at home turn into. */
function MiniRecipe() {
  return (
    <span className="flex h-[58px] w-[52px] shrink-0 flex-col items-center justify-center gap-[6px] rounded-[12px] border border-line bg-card shadow-[var(--card-shadow)]">
      <PotIcon className="h-[20px] w-[20px] text-ink" />
      <span className="block h-[4px] w-[28px] rounded-full bg-line" />
      <span className="block h-[4px] w-[20px] rounded-full bg-line" />
    </span>
  );
}

/** Foods typed in, as white tags with the control edge (the look of FeaturePreviews' HaveChips, held at one size so the picture keeps its shape). */
function FoodTags() {
  const t = useT();
  return (
    <span className="flex shrink-0 flex-col items-start gap-[4px]">
      {[t("Eggs"), t("Onion"), t("Rice")].map((w) => (
        <span key={w} className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border-[1.5px] border-edge bg-card px-[8px] text-[12px] font-bold leading-none text-foreground">{w}</span>
      ))}
    </span>
  );
}

/** Weekday names, Monday first, in the person's language (3 to 9 November 2026 is a Monday to a Sunday: only the names are used). */
function useWeekdays(style: "short" | "narrow"): string[] {
  const language = useLanguage();
  const f = new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: style });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 10, 2 + i, 12)));
}

/**
 * The top of the Premium sheet: on the meal plan's pale green, a little week of our recipes (Monday to Wednesday, a picture and two lines each) beside two
 * photos, the front one in the scanner's corners with the ink camera.
 */
export function PremiumHeroPicture() {
  const days = useWeekdays("short");
  const P = PREMIUM_PICTURE_RECIPES;
  return (
    // the back photo only where the card is wide enough beside the week (a px width: the picture never grows with the text)
    <div aria-hidden className="@container relative h-[150px] overflow-hidden rounded-[24px] border border-line bg-tint-plan">
      <div className="absolute bottom-[12px] start-[12px] top-[12px] flex w-[47%] max-w-[176px] flex-col justify-between rounded-[16px] border border-line bg-card p-[8px] shadow-[var(--card-shadow)]">
        {P.heroWeek.map((id, i) => (
          <div key={id} className="flex items-center gap-[6px]">
            <span className="w-[28px] shrink-0 overflow-hidden text-[11px] font-bold leading-none text-foreground">{days[i]}</span>
            <RecipePic id={id} eager className="h-[30px] w-[40px] shrink-0 rounded-[6px]" />
            <span className="min-w-0 flex-1">
              <span className="block h-[6px] w-full rounded-full bg-fill" />
              <span className="mt-[4px] block h-[6px] w-2/3 rounded-full bg-fill" />
            </span>
          </div>
        ))}
      </div>
      <span className="absolute end-[64px] top-[12px] hidden -rotate-[8deg] rounded-[14px] border-[3px] border-card shadow-[var(--shadow-lift)] @[320px]:block">
        <RecipePic id={P.heroBack} eager className="h-[70px] w-[92px] rounded-[10px]" />
      </span>
      <span className="absolute bottom-[12px] end-[12px] block rotate-[4deg] rounded-[16px] border-[3px] border-card shadow-[var(--shadow-lift)]">
        <span className="relative block">
          <RecipePic id={P.heroScan} eager className="h-[90px] w-[120px] rounded-[12px]" />
          <ScanCorners />
        </span>
        <CameraDot className="-end-[12px] -top-[12px]" />
      </span>
    </div>
  );
}

const TILE = "relative flex h-[88px] items-center justify-center overflow-hidden";

/** The features with a picture of their own (the four most loved); any other feature shown as a card gets its big icon instead. */
export const PICTURED: readonly string[] = ["mealPlan", "foodScan", "photoRecipe", "fridgeRecipe"];

/** The picture at the top of each of the four feature cards (PICTURED); null for any other feature. */
export function FeaturePicture({ id }: { id: PremiumFeature["id"] }) {
  const letters = useWeekdays("narrow");
  const P = PREMIUM_PICTURE_RECIPES;
  switch (id) {
    case "mealPlan":
      // a week: the day's letter over each day's recipe
      return (
        <span aria-hidden className={`${TILE} gap-[6px] bg-tint-plan px-[12px]`}>
          {P.planWeek.map((r, i) => (
            <span key={r} className="flex min-w-0 flex-col items-center gap-[4px]">
              <span className="text-[11px] font-bold leading-none text-foreground">{letters[i]}</span>
              <RecipePic id={r} className="h-[38px] w-[38px] rounded-[8px] border-2 border-card" />
            </span>
          ))}
        </span>
      );
    case "foodScan":
      // a photo of a meal in the scanner's corners
      return (
        <span aria-hidden className={`${TILE} bg-fill`}>
          <RecipePic id={P.scan} className="absolute inset-0 h-full w-full" />
          <ScanCorners inset="10px 14px" />
          <CameraDot className="bottom-[8px] end-[8px]" />
        </span>
      );
    case "photoRecipe":
      // a photo of a dish, then the recipe it becomes
      return (
        <span aria-hidden className={`${TILE} gap-[8px] bg-fill`}>
          <span className="relative block -rotate-[4deg] rounded-[10px] border-[3px] border-card shadow-[var(--card-shadow)]">
            <RecipePic id={P.atHome} className="h-[52px] w-[64px] rounded-[6px]" />
            <ScanCorners inset="3px" />
          </span>
          <ArrowRightIcon className="h-[16px] w-[16px] shrink-0 text-ink rtl:rotate-180" />
          <MiniRecipe />
        </span>
      );
    case "fridgeRecipe":
      // the foods at home, then the recipe Pip makes of them
      return (
        <span aria-hidden className={`${TILE} gap-[8px] bg-tint-cook px-[12px]`}>
          <FoodTags />
          <ArrowRightIcon className="h-[16px] w-[16px] shrink-0 text-ink rtl:rotate-180" />
          <MiniRecipe />
        </span>
      );
    default:
      return null;
  }
}
