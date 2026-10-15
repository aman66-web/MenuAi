"use client";

import { useMemo, useState } from "react";
import { MAX_SERVINGS, MIN_SERVINGS, recipeNutrients, stepServings } from "@/lib/mm/addFood";
import { formatCalories, formatGrams } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { normalizeForSearch } from "@/lib/mm/search";
import type { Meal } from "@/lib/mm/types";
import { MEAL_LOOK } from "../../recipes/RecipeTile";
import { MinusIcon, PlusIcon } from "../icons";
import { Button, ErrorBox, Spinner } from "../ui";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShop, useRecipeCards, type RecipeCard } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { AddPill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";

// "Choose a recipe": one of our recipes, a serving or more of it. The figures are exactly the ones the recipe's card and page show per serving
// (fitted to the person's meal size, from the shop's own labels); the servings stepper only multiplies them. Recipes that don't suit the
// person's diet are left out, as everywhere else.

const PAGE = 8;
const NAME_WITH_SERVINGS = tk("{name} ({n} servings)");

function matches(card: RecipeCard, query: string, t: (s: string) => string): boolean {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const r = card.recipe;
  const labels = r.ingredients.map((i) => i.label);
  const hay = normalizeForSearch([r.name, t(r.name), ...labels, ...labels.map((l) => t(l))].join(" "));
  return words.every((w) => hay.includes(w));
}

export function RecipePick({ meal, onAdd }: { meal: Meal; onAdd: (entry: NewEntry) => void }) {
  const t = useT();
  const settings = useSettings();
  const [retry, setRetry] = useState(0);
  const manifest = useShopManifest(retry);
  const shop = recipeShop(manifest, null, settings.shops);
  const state = useShopProducts(shop, retry);
  const products = state.status === "ready" ? state.products : null;
  const { cards } = useRecipeCards(null, products, settings.preferences, mealTargetFor(settings));
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

  if (!manifest || (shop && state.status === "loading")) return <div className="pt-4"><Spinner label={t("Loading recipes")} /></div>;
  if (!shop || state.status === "error") return <div className="pt-4"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>;

  return (
    <div className="space-y-4 pb-2 pt-4">
      <SheetSearch value={query} onChange={(v) => { setQuery(v); setLimit(PAGE); }} label={t("Search recipes")} placeholder={t("Search recipes, e.g. chicken or curry")} />

      {/* How many servings were eaten: the figures below follow it. */}
      <div role="group" aria-label={t("Servings")} className="glass flex items-center justify-between gap-3 rounded-full py-1.5 ps-5 pe-1.5">
        <span className="text-base font-semibold">{t("Servings")}</span>
        <span className="flex items-center gap-1">
          <button type="button" aria-label={t("Fewer servings")} disabled={servings <= MIN_SERVINGS} onClick={() => setServings((s) => stepServings(s, -1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white transition active:scale-95 disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><MinusIcon className="h-5 w-5" /></button>
          <output aria-live="polite" className="app-numbers min-w-10 text-center text-lg font-bold">{servings}</output>
          <button type="button" aria-label={t("More servings")} disabled={servings >= MAX_SERVINGS} onClick={() => setServings((s) => stepServings(s, 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white transition active:scale-95 disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><PlusIcon className="h-5 w-5" /></button>
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-[0.9375rem] text-muted">{t("No recipes match.")}</p>
      ) : (
        <>
          <ul className={PICK_LIST}>
            {shown.slice(0, limit).map((c) => {
              const n = recipeNutrients(c.totals, servings);
              const name = t(c.recipe.name);
              const Icon = (MEAL_LOOK[c.recipe.meal ?? "dinner"] ?? MEAL_LOOK.dinner).Icon;
              return (
                <PickRow
                  key={c.recipe.id}
                  lead={<span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-accent"><Icon className="h-5 w-5" /></span>}
                  title={name}
                  line={t("{kcal} · {protein} protein", { kcal: formatCalories(n.calories), protein: formatGrams(n.protein ?? 0) })}
                  action={<AddPill name={name} onClick={() => onAdd({ chainId: "", chainName: t("Recipe"), name: servings === 1 ? name : t(NAME_WITH_SERVINGS, { name, n: servings }), nutrients: n, source: "recipe" })} />}
                />
              );
            })}
          </ul>
          {shown.length > limit && <Button variant="secondary" full onClick={() => setLimit((l) => l + PAGE)}>{t("Show more recipes ({n} more)", { n: Math.min(PAGE, shown.length - limit) })}</Button>}
        </>
      )}
    </div>
  );
}
