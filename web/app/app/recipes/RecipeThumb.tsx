"use client";

import { useState } from "react";
import { assetUrl } from "@/lib/mm/config";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { RECIPE_THUMBS } from "@/lib/mm/recipeThumbs";
import type { MealType } from "@/lib/mm/recipes";
import { AppleIcon, EggGlyph, FishGlyph, MoonIcon, NoodleGlyph, OatsGlyph, PastaGlyph, PotIcon, RiceBowlGlyph, SaladGlyph, SandwichIcon, SunriseIcon, TacoGlyph, TrayGlyph } from "../_components/icons";
import { useRecipePhoto } from "../_lib/recipePhotos";

// A recipe shown small (founder 2026-11-17: "Use images please when possible"): the shopping list's "What can I cook with this?" and "You might also
// need", the Recipes list's "Cook with what's on your list". The recipe's own picture (CLAUDE.md rule 2: our recipes' pictures, or the person's own photo of
// a Make it at home recipe), from its small copy (tools/recipes/make_recipe_thumbs.py, ~11 KB instead of ~100 KB: the iPhone app loads pictures from the
// website, lib/mm/config.ts assetUrl), then the full picture, then, when neither loads (offline before it has been seen once), the plate and dish drawing of
// the recipe's card. Decorative: the recipe's name is always written beside it.
//
// The drawing is the one RecipeTile.tsx draws on a card (the same words pick the same glyph); RecipeTile keeps its own copy of these
// lists for now, and can import them from here.

type Glyph = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;

const MEAL_GLYPH: Record<MealType, Glyph> = { breakfast: SunriseIcon, lunch: SandwichIcon, dinner: MoonIcon, snack: AppleIcon };

/** The kind of dish, from the words in the recipe's English name (the meal's own icon when none fits). */
export const DISH: ReadonlyArray<[RegExp, Glyph]> = [
  [/noodle|chow mein|pad thai|stir-fry/i, NoodleGlyph],
  [/kebab|skewer/i, TrayGlyph],
  [/chicken and rice bowl/i, RiceBowlGlyph],
  [/pasta|spaghetti|linguine|macaroni|gnocchi|bolognese|carbonara|meatball/i, PastaGlyph],
  [/wrap|burrito|fajita|quesadilla|roll-up/i, TacoGlyph],
  [/egg|omelette|shakshuka|huevos|scramble/i, EggGlyph],
  [/salad|bites|dip\b/i, SaladGlyph],
  [/porridge|oats|muesli|granola|yogurt|pancake|bark/i, OatsGlyph],
  [/curry|chilli|dhal|keema|jalfrezi|stew|soup|minestrone|hash/i, PotIcon],
  [/bake|traybake|pie|lasagne|steak/i, TrayGlyph],
  [/salmon|cod|tuna|mackerel|prawn|kedgeree/i, FishGlyph],
  [/rice|bowl/i, RiceBowlGlyph],
];
// The drawing's ground is the page fill for every recipe, the plate white with the card line and an ink glyph (colour meeting, 19 November 2026; approved by
// the founder that day: the six pastels are retired).

/** Whether a recipe has a picture of its own in the app (the book's; a Make it at home photo lives on the phone only). */
export const hasRecipePicture = (id: string) => !!RECIPE_IMAGES[id];

/** The first of `srcs` that loads: the next one when it fails, null when none is left. A new list starts again from the first. */
function useImageChain(srcs: readonly string[]): { src: string; fail: () => void } | null {
  const key = srcs.join("\n");
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const n = failed.key === key ? failed.n : 0;
  const src = srcs[n];
  return src ? { src, fail: () => setFailed({ key, n: n + 1 }) } : null;
}

const SIZE = {
  // the size and rounding of PhotoTile, so a recipe sits beside a product row as an equal
  md: { box: "h-16 w-16 rounded-[0.875rem]", plate: "h-12 w-12", glyph: "h-7 w-7", px: 64 },
  // the overlapping stacks (three at most)
  sm: { box: "h-10 w-10 rounded-xl", plate: "h-8 w-8", glyph: "h-5 w-5", px: 40 },
} as const;

/** A recipe's picture as a small square (64 px, or 40 px for a stack), never stretched (object-cover), with the card's drawing when no picture loads. */
export function RecipeThumb({ id, name, meal, size = "md", className = "" }: { id: string; name: string; meal?: MealType; size?: keyof typeof SIZE; className?: string }) {
  const own = useRecipePhoto(id);
  const srcs = [own, RECIPE_THUMBS[id], RECIPE_IMAGES[id]].filter((s): s is string => !!s).map((s) => (s.startsWith("/") ? assetUrl(s) : s));
  const image = useImageChain(srcs);
  const s = SIZE[size];
  const Dish = DISH.find(([re]) => re.test(name))?.[1] ?? MEAL_GLYPH[meal ?? "dinner"] ?? MoonIcon;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden ${s.box} bg-fill ${className}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- static file named by its hash (or the person's own photo); decorative, the name is beside it
        <img key={image.src} src={image.src} alt="" width={s.px} height={s.px} loading="lazy" decoding="async" onError={image.fail} className="h-full w-full object-cover" />
      ) : (
        <span className={`grid place-items-center rounded-full border border-line bg-card text-ink ${s.plate}`}>
          <Dish className={s.glyph} strokeWidth={1.6} />
        </span>
      )}
    </span>
  );
}

type StackRecipe = { id: string; name: string; meal?: MealType };

/**
 * Up to three recipes' pictures overlapping (like the shops' logos beside the recipe search), for a card that leads to a list of recipes. Only recipes with a
 * picture of their own are shown; null when none has one, so the card keeps its icon. `ring`: the colour that separates them (the card's own background).
 * `moreClass` goes on the second and third (e.g. to hide them where the card is narrow).
 */
export function RecipeThumbStack({ recipes, ring = "ring-card", moreClass = "" }: { recipes: readonly StackRecipe[]; ring?: string; moreClass?: string }) {
  const shown = recipes.filter((r) => hasRecipePicture(r.id)).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0 items-center">
      {shown.map((r, i) => (
        // each in its own box (a flex item), so `moreClass` can hide it without fighting the picture's own display
        <span key={r.id} className={i > 0 ? `-ms-3 ${moreClass}` : ""}>
          <RecipeThumb id={r.id} name={r.name} meal={r.meal} size="sm" className={`ring-2 ${ring}`} />
        </span>
      ))}
    </span>
  );
}
