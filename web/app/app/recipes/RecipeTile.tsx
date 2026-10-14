"use client";

import Link from "next/link";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { formatPrice } from "@/lib/mm/groceries";
import { formatInt } from "@/lib/mm/format";
import { MEAL_TYPES, type MealType } from "@/lib/mm/recipes";
import { savedRecipesStore, toggleSavedRecipe } from "@/lib/mm/stores";
import { AppleIcon, EggGlyph, FishGlyph, HeartIcon, MoonIcon, NoodleGlyph, OatsGlyph, PastaGlyph, PotIcon, RiceBowlGlyph, SaladGlyph, SandwichIcon, SunriseIcon, TacoGlyph, TrayGlyph } from "../_components/icons";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import type { RecipeCard } from "../_lib/recipes";

// One recipe in a list (Recipes, My meals). Founder 2026-10-14, from two reference pictures: a picture on top with a heart to save it, then the
// name and, under it, calories and protein as two small chips; then the price of a serving at the shop and how long it takes. The picture is
// the recipe's AI illustration once there is one (captioned, CLAUDE.md rule 2); until then a plate with a drawing of the kind of dish (below).

export const MEAL_LOOK: Record<MealType, { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = {
  breakfast: { Icon: SunriseIcon },
  lunch: { Icon: SandwichIcon },
  dinner: { Icon: MoonIcon },
  snack: { Icon: AppleIcon },
};

type Glyph = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
// Until a recipe has its picture, its card shows a plate with a simple drawing of the kind of dish (from the words in its English name; the meal's
// own icon when none fits) on one of six colours chosen by the recipe's id, so a list of a hundred doesn't look like one card repeated.
const DISH: ReadonlyArray<[RegExp, Glyph]> = [
  [/noodle|pad thai|stir-fry/i, NoodleGlyph],
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
const ART = [
  "bg-[radial-gradient(120%_90%_at_20%_10%,#fef3c7,#fcd34d_55%,#f59e0b)]",
  "bg-[radial-gradient(120%_90%_at_20%_10%,#ffe4e6,#fda4af_55%,#fb7185)]",
  "bg-[radial-gradient(120%_90%_at_20%_10%,#ecfccb,#bef264_55%,#84cc16)]",
  "bg-[radial-gradient(120%_90%_at_20%_10%,#d1fae5,#6ee7b7_55%,#10b981)]",
  "bg-[radial-gradient(120%_90%_at_20%_10%,#cffafe,#67e8f9_55%,#06b6d4)]",
  "bg-[radial-gradient(120%_90%_at_20%_10%,#ffedd5,#fdba74_55%,#f97316)]",
];
const artOf = (id: string) => ART[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % ART.length]!;

/** The picture area: the recipe's AI illustration, or a plate with a drawing of the kind of dish. */
function RecipeArt({ id, name, meal, wide }: { id: string; name: string; meal: MealType | undefined; wide: boolean }) {
  const t = useT();
  const image = RECIPE_IMAGES[id];
  const look = MEAL_LOOK[meal ?? "dinner"] ?? MEAL_LOOK.dinner;
  const Dish = DISH.find(([re]) => re.test(name))?.[1] ?? look.Icon;
  const mealLabel = MEAL_TYPES.find((m) => m.value === meal)?.label;
  return (
    <span className={`relative block overflow-hidden ${wide ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it
        <img src={image} alt="" loading="lazy" decoding="async" width={800} height={600} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className={`flex h-full w-full items-center justify-center ${artOf(id)}`}>
          <span className={`grid place-items-center rounded-full bg-white/85 text-[#0b1a12] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45),inset_0_0_0_6px_rgba(255,255,255,0.6)] ${wide ? "h-28 w-28" : "h-[4.25rem] w-[4.25rem]"}`}>
            <Dish className={wide ? "h-16 w-16" : "h-10 w-10"} strokeWidth={1.6} />
          </span>
        </span>
      )}
      {image ? (
        <span className="absolute bottom-2 start-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white">{t("AI illustration")}</span>
      ) : mealLabel ? (
        <span aria-hidden className="absolute bottom-2 start-2 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-bold text-[#0b1a12]">{t(mealLabel)}</span>
      ) : null}
    </span>
  );
}

export function RecipeTile({ card, href, badge, wide = false, saveable = true }: { card: RecipeCard; href: string; badge?: string; wide?: boolean; saveable?: boolean }) {
  const t = useT();
  const savedList = useStore(savedRecipesStore);
  const { recipe, totals } = card;
  // our recipe book is translated; what Pip wrote with AI is shown as it wrote it
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const saved = savedList.some((s) => s.id === recipe.id);
  const canSave = saveable && !recipe.ai; // Pip's recipes are already kept on this phone
  const price = totals.costPerServing !== null ? formatPrice(totals.costPerServing) : null;
  return (
    <div className="glass lift relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.6rem]">
      <Link href={href} prefetch={false} className="flex flex-1 flex-col focus-visible:outline-offset-[-3px]">
        <RecipeArt id={recipe.id} name={recipe.name} meal={recipe.meal} wide={wide} />
        <span className={`flex flex-1 flex-col ${wide ? "p-4" : "px-2.5 pb-3 pt-2.5"}`}>
          {badge && <span className="mb-1 inline-block self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-bold text-accent">{badge}</span>}
          <span className={`line-clamp-2 font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere] ${wide ? "text-xl" : "text-base"}`}>{rt(recipe.name)}</span>
          <span className={`app-numbers mt-2 flex flex-wrap ${wide ? "gap-1.5 text-sm [&>span]:px-2" : "gap-1 text-xs [&>span]:px-[0.3rem]"}`}>
            <span className="inline-flex items-baseline gap-[0.2rem] rounded-lg bg-soft-strong py-1"><span className="text-[1.1em] font-extrabold">{formatInt(totals.perServing.kcal)}</span><span className="font-bold text-muted">kcal</span></span>
            <span className="inline-flex items-baseline gap-[0.2rem] rounded-lg bg-accent-soft py-1"><span className="text-[1.1em] font-extrabold text-accent">{Math.round(totals.perServing.protein)}g</span><span className="font-bold text-muted">{t("protein")}</span></span>
          </span>
          <span className="app-numbers mt-auto flex flex-wrap gap-x-2 pt-2 text-sm text-muted">
            {price && <span><span className="font-bold text-foreground">{price}</span> {t("a serving")}</span>}
            <span>{t("{n} min", { n: recipe.minutes })}</span>
          </span>
        </span>
      </Link>
      {canSave && (
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t("Saved to My meals") : t("Save to My meals")}
          onClick={() => toggleSavedRecipe(recipe.id)}
          className={`absolute end-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)] transition active:scale-90 ${saved ? "text-[#e11d48]" : "text-[#0b1a12]"}`}
        >
          <HeartIcon filled={saved} className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
