"use client";

import Link from "next/link";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { formatPrice } from "@/lib/mm/groceries";
import { formatInt } from "@/lib/mm/format";
import { isMeatFree, MEAL_TYPES, type MealType } from "@/lib/mm/recipes";
import { AppleIcon, ChevronRightIcon, MoonIcon, SandwichIcon, SunriseIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import type { RecipeCard } from "../_lib/recipes";

// One recipe in a list (Recipes, My meals): a coloured band for its meal (or its AI picture once there is one), the name and a line about it, then the
// three things people look at first in plain words, calories, protein and the price of a serving at the shop, and how long it takes and how many it serves.
// Founder 2026-10-11: "improve the look of the recipes page ... they need to be able to understand everything".

export const MEAL_LOOK: Record<MealType, { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; band: string }> = {
  breakfast: { Icon: SunriseIcon, band: "bg-[linear-gradient(135deg,rgba(251,191,36,0.30),rgba(251,146,60,0.10))]" },
  lunch: { Icon: SandwichIcon, band: "bg-[linear-gradient(135deg,rgba(132,204,22,0.30),rgba(16,185,129,0.10))]" },
  dinner: { Icon: MoonIcon, band: "bg-[linear-gradient(135deg,rgba(16,185,129,0.30),rgba(14,116,144,0.12))]" },
  snack: { Icon: AppleIcon, band: "bg-[linear-gradient(135deg,rgba(244,114,182,0.26),rgba(251,113,133,0.10))]" },
};

export function RecipeTile({ card, href, badge }: { card: RecipeCard; href: string; badge?: string }) {
  const t = useT();
  const { recipe, totals } = card;
  // our recipe book is translated; what Pip wrote with AI is shown as it wrote it
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const image = RECIPE_IMAGES[recipe.id];
  const look = MEAL_LOOK[recipe.meal ?? "dinner"] ?? MEAL_LOOK.dinner;
  const mealLabel = MEAL_TYPES.find((m) => m.value === recipe.meal)?.label;
  return (
    <Link href={href} prefetch={false} className="glass lift flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem]">
      {image ? (
        <span className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it */}
          <img src={image} alt="" loading="lazy" decoding="async" width={800} height={600} className="aspect-[16/9] w-full object-cover" />
          <span className="absolute bottom-2 start-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm font-semibold text-white">{t("AI illustration")}</span>
        </span>
      ) : (
        <span aria-hidden className={`flex h-20 items-center justify-between px-4 ${look.band}`}>
          <look.Icon className="h-9 w-9 text-foreground/70" />
          {mealLabel && <span className="rounded-full bg-background/70 px-3 py-1 text-sm font-bold">{t(mealLabel)}</span>}
        </span>
      )}
      <span className="flex flex-1 flex-col p-4">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            {badge && <span className="mb-1 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-bold text-accent">{badge}</span>}
            <span className="block text-lg font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere]">{rt(recipe.name)}</span>
            {recipe.blurb && <span className="mt-1 line-clamp-2 block text-base leading-snug text-muted">{rt(recipe.blurb)}</span>}
          </span>
          <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-muted" />
        </span>
        <span className="app-numbers mt-auto grid grid-cols-3 gap-2 pt-4 text-center">
          <span className="inset-card min-w-0 rounded-2xl px-1 py-2"><span className="block text-xl font-extrabold leading-tight">{formatInt(totals.perServing.kcal)}</span><span className="block text-sm text-muted">{t("calories")}</span></span>
          <span className="min-w-0 rounded-2xl bg-accent-soft px-1 py-2"><span className="block text-xl font-extrabold leading-tight text-accent">{Math.round(totals.perServing.protein)}g</span><span className="block text-sm text-muted">{t("protein")}</span></span>
          <span className="inset-card min-w-0 rounded-2xl px-1 py-2"><span className="block text-xl font-extrabold leading-tight">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</span><span className="block text-sm text-muted">{t("a serving")}</span></span>
        </span>
        <span className="mt-3 flex flex-wrap gap-1.5 text-sm">
          <span className="app-numbers rounded-full bg-soft px-2.5 py-1">{t("{n} min", { n: recipe.minutes })}</span>
          <span className="app-numbers rounded-full bg-soft px-2.5 py-1">{t("Serves {n}", { n: recipe.servings })}</span>
          {isMeatFree(recipe) && <span className="rounded-full bg-soft px-2.5 py-1">{t("No meat or fish")}</span>}
        </span>
      </span>
    </Link>
  );
}
