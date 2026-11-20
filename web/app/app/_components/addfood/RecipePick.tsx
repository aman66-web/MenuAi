"use client";

import { useMemo, useState } from "react";
import { MAX_SERVINGS, MIN_SERVINGS, recipeNutrients, stepServings } from "@/lib/mm/addFood";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import type { Recipe } from "@/lib/mm/recipes";
import { myRecipesStore } from "@/lib/mm/stores";
import { halves } from "@/lib/mm/user-data";
import { formatCalories, formatGrams } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { normalizeForSearch } from "@/lib/mm/search";
import type { LogMeal } from "@/lib/mm/types";
import { RecipeThumb } from "../../recipes/RecipeThumb";
import { MinusIcon, PlusIcon } from "../icons";
import { Button, ErrorBox, Spinner } from "../ui";
import { useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeShopSet, type RecipeCard } from "../../_lib/recipes";
import { useShopManifest } from "../../_lib/shopProducts";
import { AddPill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";

// "Choose a recipe": one of our recipes, a serving or more of it. The figures are exactly the ones the recipe's card and page show per serving
// (fitted to the person's meal size, from the labels of the person's shops, worked out together as on those screens); the servings stepper only multiplies them. Recipes that don't suit the
// person's diet are left out, as everywhere else. Each row leads with the recipe's own picture (founder 2026-11-17, "use images please when
// possible"; RecipeThumb: its small copy, the full picture, else the card's plate drawing), the size of a product's picture in this sheet; the
// recipe's id is kept on the entry so Home and Today show the same picture.
// The person's own recipes come first, under "Your recipes" (founder 2026-11-19: a recipe made from a photo with Make it at home, or by Pip from what's in the
// fridge, couldn't be added, "only the standard recipes ... which shouldn't be the case"): worked out from the same shops' labels, the same way as on their
// own recipe page, so they log with the figures that page shows.
// Halves are written ½ and 1½ here too, as on the Today page (the 30-person audit, 20 November 2026: "1.5 servings" here, "1½ portions" there).

const PAGE = 8;
const NAME_WITH_SERVINGS = tk("{name} ({n} servings)");
/** Half a serving is "serving", like "½ portion" on the Today page. */
const NAME_WITH_SERVING = tk("{name} ({n} serving)");

function matches(card: RecipeCard, query: string, t: (s: string) => string): boolean {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const r = card.recipe;
  const labels = r.ingredients.map((i) => i.label);
  const hay = normalizeForSearch([r.name, t(r.name), ...labels, ...labels.map((l) => t(l))].join(" "));
  return words.every((w) => hay.includes(w));
}

export function RecipePick({ meal, onAdd }: { meal: LogMeal; onAdd: (entry: NewEntry) => void }) {
  const t = useT();
  const settings = useSettings();
  const [retry, setRetry] = useState(0);
  const manifest = useShopManifest(retry);
  // the same shops, together, as the Recipes page and the recipe page, so a recipe logs with the figures its card and page show
  const shopIds = recipeShopSetFor(manifest, null, settings.shops);
  const shop = shopIds[0] ?? null;
  const state = useRecipeShopSet(shopIds, retry);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const { cards } = useRecipeCards(null, products, settings.preferences, target);
  const saved = useStore(myRecipesStore);
  const dietKey = JSON.stringify(settings.preferences);
  const mine = useMemo(() => saved.map((s) => savedToRecipe(s, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [saved, dietKey]);
  const mineCards = useRecipeCards(mine, products, settings.preferences, target).cards;
  const [servings, setServings] = useState(1);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  // The recipes for this meal first (closest to the person's meal size first), then the rest; searching looks through all of them.
  const shown = useMemo(() => {
    const own = (c: RecipeCard) => (c.recipe.meal === meal ? 0 : 1);
    return cards
      .filter((c) => matches(c, query, t))
      .sort((a, b) => own(a) - own(b) || a.distance - b.distance || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  }, [cards, meal, query, t]);
  // the person's own, newest first (as kept), whatever the meal: there are only a few
  const yours = useMemo(() => mineCards.filter((c) => matches(c, query, t)), [mineCards, query, t]);

  const row = (c: RecipeCard) => {
    const n = recipeNutrients(c.totals, servings);
    const name = t(c.recipe.name);
    return (
      <PickRow
        key={c.recipe.id}
        lead={<RecipeThumb id={c.recipe.id} name={c.recipe.name} meal={c.recipe.meal} />}
        title={name}
        line={t("{kcal} · {protein} protein", { kcal: formatCalories(n.calories), protein: formatGrams(n.protein ?? 0) })}
        action={<AddPill name={name} onClick={() => onAdd({ chainId: "", chainName: t("Recipe"), name: servings === 1 ? name : t(servings < 1 ? NAME_WITH_SERVING : NAME_WITH_SERVINGS, { name, n: halves(servings) }), nutrients: n, source: "recipe", recipeId: c.recipe.id })} />}
      />
    );
  };

  if (!manifest || (shop && state.status === "loading")) return <div className="pt-4"><Spinner label={t("Loading recipes")} /></div>;
  if (!shop || state.status === "error") return <div className="pt-4"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>;

  return (
    <div className="space-y-4 pb-2 pt-4">
      <SheetSearch value={query} onChange={(v) => { setQuery(v); setLimit(PAGE); }} label={t("Search recipes")} placeholder={t("Search recipes, e.g. chicken or curry")} />

      {/* How many servings were eaten: the figures below follow it. */}
      {/* the − and + as one white control with the edge and ink icons; at a limit that side is the line fill with a grey icon (it can't go further) */}
      <div role="group" aria-label={t("Servings")} className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-base font-semibold [overflow-wrap:normal] [word-break:keep-all]">{t("Servings")}</span>
        <span className="flex items-center rounded-full border-[1.5px] border-edge bg-card">
          <button type="button" aria-label={t("Fewer servings")} disabled={servings <= MIN_SERVINGS} onClick={() => setServings((s) => stepServings(s, -1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-95 hover:not-disabled:bg-background disabled:bg-soft-strong disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><MinusIcon className="h-5 w-5" /></button>
          <output aria-live="polite" className="app-numbers min-w-10 whitespace-nowrap text-center text-lg font-bold">{halves(servings)}</output>
          <button type="button" aria-label={t("More servings")} disabled={servings >= MAX_SERVINGS} onClick={() => setServings((s) => stepServings(s, 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-95 hover:not-disabled:bg-background disabled:bg-soft-strong disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><PlusIcon className="h-5 w-5" /></button>
        </span>
      </div>

      {yours.length > 0 && (
        <section aria-labelledby="pick-yours" className="space-y-2">
          <h3 id="pick-yours" className="text-[0.9375rem] font-semibold text-muted">{t("Your recipes")}</h3>
          <ul className={PICK_LIST}>{yours.map((c) => row(c))}</ul>
        </section>
      )}
      {/* never a silent gap: one of the person's own recipes that can't be worked out here (an ingredient left out for their diet, or one their shops don't sell
          with a label) is said so */}
      {!query.trim() && saved.length > mineCards.length && (
        <p role="note" className="text-[0.9375rem] leading-snug text-muted">{saved.length - mineCards.length === 1 ? t("One of your recipes isn't here: it no longer suits your diet, or your shops don't sell something it needs with a label.") : t("{n} of your recipes aren't here: they no longer suit your diet, or your shops don't sell something they need with a label.", { n: saved.length - mineCards.length })}</p>
      )}

      {shown.length === 0 && yours.length === 0 ? (
        <p className="text-[0.9375rem] text-muted">{t("No recipes match.")}</p>
      ) : shown.length > 0 && (
        <section aria-labelledby={yours.length > 0 ? "pick-ours" : undefined} className="space-y-2">
          {yours.length > 0 && <h3 id="pick-ours" className="text-[0.9375rem] font-semibold text-muted">{t("Our recipes")}</h3>}
          <ul className={PICK_LIST}>{shown.slice(0, limit).map((c) => row(c))}</ul>
          {shown.length > limit && <Button variant="secondary" full onClick={() => setLimit((l) => l + PAGE)}>{t("Show more recipes ({n} more)", { n: Math.min(PAGE, shown.length - limit) })}</Button>}
        </section>
      )}
    </div>
  );
}
