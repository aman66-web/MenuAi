"use client";

import Link from "next/link";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { formatPrice } from "@/lib/mm/groceries";
import { formatInt } from "@/lib/mm/format";
import { isMeatFree } from "@/lib/mm/recipes";
import { ChevronRightIcon, PotIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import type { RecipeCard } from "../_lib/recipes";

// One recipe in a list: its name and blurb, then calories, protein and the cost of a serving at the shop (Recipes, My recipes).

export function RecipeTile({ card, href, badge }: { card: RecipeCard; href: string; badge?: string }) {
  const t = useT();
  const { recipe, totals } = card;
  // our recipe book is translated; what Pip wrote with AI is shown as it wrote it
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const image = RECIPE_IMAGES[recipe.id];
  return (
    <Link href={href} prefetch={false} className="glass lift flex h-full min-w-0 flex-col rounded-3xl p-4">
      {image && (
        <span className="relative -mx-1 -mt-1 mb-3 block overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it */}
          <img src={image} alt="" loading="lazy" decoding="async" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
          <span className="absolute bottom-2 start-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{t("AI illustration")}</span>
        </span>
      )}
      <span className="flex items-start gap-3">
        {!image && <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 rounded-2xl"><PotIcon className="h-6 w-6" /></span>}
        <span className="min-w-0 flex-1">
          {badge && <span className="mb-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{badge}</span>}
          <span className="block text-[17px] font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere]">{rt(recipe.name)}</span>
          {recipe.blurb && <span className="mt-0.5 block text-sm text-muted">{rt(recipe.blurb)}</span>}
        </span>
        <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-muted" />
      </span>
      <span className="app-numbers mt-3 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 text-center">
        <span className="inset-card rounded-2xl px-2 py-2"><span className="block text-lg font-extrabold leading-tight">{formatInt(totals.perServing.kcal)}</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">kcal</span></span>
        <span className="rounded-2xl bg-accent-soft px-2 py-2"><span className="block text-lg font-extrabold leading-tight text-accent">{Math.round(totals.perServing.protein)}g</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{t("protein")}</span></span>
        <span className="inset-card rounded-2xl px-2 py-2"><span className="block text-lg font-extrabold leading-tight">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{t("each")}</span></span>
      </span>
      <span className="app-numbers mt-2 block text-xs text-muted">{t("Per serving")} · {t("{n}g carbs", { n: Math.round(totals.perServing.carbs) })} · {t("{n}g fat", { n: Math.round(totals.perServing.fat) })} · {t("serves {n}", { n: recipe.servings })} · {t("{n} min", { n: recipe.minutes })}{isMeatFree(recipe) ? ` · ${t("no meat or fish")}` : ""}</span>
    </Link>
  );
}
