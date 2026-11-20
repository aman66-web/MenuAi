"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { mealSlotFor } from "@/lib/mm/budget";
import { APP_BUILD } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { formatPrice, retailerName } from "@/lib/mm/groceries";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import type { MealType } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { CheckIcon } from "../_components/icons";
import { RecipeTile } from "../recipes/RecipeTile";
import { useNow, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeShopSet, type RecipeCard } from "../_lib/recipes";
import { useShopManifest } from "../_lib/shopProducts";
import { ShowcaseWindow } from "./ShowcaseWindow";

// Step 5 of the welcome steps, "Recipes from {shop}" (the onboarding redesign meeting of 20 November 2026, build list 4; approved by the founder): two of our own
// recipes made from real products at the person's shop, with the price of a serving, for the meal of the day and the other main meal, with their diet applied.
// The person can choose one to cook first: it waits on Home ("Your first recipe"). Nothing is written anywhere: the choice is only a navigation hint, kept in the
// welcome screens' memory and their local progress note, never saved as a recipe.
// - The tiles are the app's own RecipeTile at full size, with our illustration where there is one (no visible caption; screen readers hear "An illustration of
//   {recipe}") and the kcal, protein, carbs and fat, and "£x a serving · n min". Recipes with an illustration are offered first.
// - Recipes are shown as written: no target is used before "Your daily targets" (step 9), so the default 2,000 kcal never sizes them.
// - Choosing: each tile has a real button over it, with aria-pressed (not a link), that chooses it; a chosen tile gets the 2 px dark green edge and a lime "Your
//   first recipe" tag with a tick; tapping again un-chooses it. The tile underneath is inert (it isn't a link here).
// - Loading: a status line and the window's page-fill bars; on the website the shop's file (1.3 to 3.5 MB) is waited for up to 6 s, then a words-only line.

/** The other main meal to offer beside the one for the time of day, so the two are different kinds of dish. */
const OTHER_MAIN: Record<MealType, MealType> = { breakfast: "lunch", lunch: "dinner", dinner: "lunch", snack: "lunch" };
/** How long the website waits for the shop's file before the words-only line (the meeting: 6 s). */
const SHOP_WAIT_MS = 6000;

/**
 * Two recipes for this person: the one that fits their meal best for the meal of the day (breakfast before 10:30, lunch to 16:00, dinner after:
 * SPEC §6.3), and the best fit for the other main meal. Without a meal target (the welcome screens) the higher-protein recipes come first. Recipes with an
 * illustration (`illustrated`) are preferred over those without. Snacks are never offered. Fewer than two come back when the diet leaves little.
 */
export function pickTwoRecipes(cards: readonly RecipeCard[], slot: MealType, hasTarget: boolean, illustrated: (id: string) => boolean = () => true): RecipeCard[] {
  const key = (c: RecipeCard): number => (hasTarget ? c.distance : -c.totals.perServing.protein);
  const sorted = cards
    .filter((c) => c.recipe.meal !== "snack")
    .sort((a, b) => Number(illustrated(b.recipe.id)) - Number(illustrated(a.recipe.id)) || key(a) - key(b) || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  const first = sorted.find((c) => c.recipe.meal === slot) ?? sorted[0];
  if (!first) return [];
  const other = OTHER_MAIN[slot];
  const second = sorted.find((c) => c.recipe.id !== first.recipe.id && c.recipe.meal === other) ?? sorted.find((c) => c.recipe.id !== first.recipe.id);
  return second ? [first, second] : [first];
}

const hasIllustration = (id: string): boolean => !!RECIPE_IMAGES[id];

/** The shop step 5 (and Meal plan's preview) uses, and why: the first ticked shop that is in recipes, else the default recipe shop. */
export function useRecipeShop(): { shop: string | null; shopName: string; left: string[]; picked: boolean; loading: boolean } {
  const settings = useSettings();
  const manifest = useShopManifest();
  const shopIds = recipeShopSetFor(manifest, null, settings.shops);
  const shop = shopIds[0] ?? null;
  const nameOf = (id: string) => manifest?.retailers.find((r) => r.id === id)?.name ?? retailerName(id);
  const usable = new Set(recipeShops(manifest).map((r) => r.id));
  const picked = settings.shops ?? [];
  // the picked shops recipes can't use yet (usability test 2026-11-19: Tesco picked, Sainsbury's shown, no word why); recipes use one shop, the first usable one
  const left = picked.filter((id) => !usable.has(id)).map(nameOf);
  return { shop, shopName: shop ? nameOf(shop) : "", left, picked: picked.length > 0, loading: manifest === null };
}

/** Step 5's window and the lines under it. `chosen`: the recipe chosen as the first one (null = none); `onChoose` sets it (null to un-choose). */
export function RecipeChoice({ chosen, onChoose }: { chosen: string | null; onChoose: (id: string | null) => void }) {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  // the same shops, together, as the recipe page the card would open, so the card and the page agree
  const shopIds = recipeShopSetFor(manifest, null, settings.shops);
  const { shop, shopName, left, picked } = useRecipeShop();
  const state = useRecipeShopSet(shopIds);
  const products = state.status === "ready" ? state.products : null;
  // shown as written: no target before "Your daily targets"
  const { cards } = useRecipeCards(null, products, settings.preferences, null);
  const now = useNow();
  const slot = mealSlotFor(now);
  const picks = useMemo(() => pickTwoRecipes(cards, slot, false, hasIllustration), [cards, slot]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (APP_BUILD) return; // the shop files are inside the iPhone app
    const id = window.setTimeout(() => setWaited(true), SHOP_WAIT_MS);
    return () => window.clearTimeout(id);
  }, []);
  // still working out which shop and which recipes: the manifest, then the shop's list
  const working = manifest === null || (shop !== null && state.status === "loading");
  const loading = working && !waited;
  const ready = !working && shop !== null && picks.length > 0;
  const list = (names: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
  const why = !ready ? null
    : left.length > 1 ? t("{left} aren't in recipes yet, so these use {shop}: every ingredient is a real product there, with its price.", { left: list(left), shop: shopName })
    : left.length === 1 ? t("{left} isn't in recipes yet, so these use {shop}: every ingredient is a real product there, with its price.", { left: left[0]!, shop: shopName })
    : !picked ? t("You didn't pick a shop, so these use {shop}: every ingredient is a real product there, with its price.", { shop: shopName })
    : null;

  return (
    <>
      <ShowcaseWindow kind="recipes" loading={loading} status={shopName ? t("Finding two recipes at {shop}…", { shop: shopName }) : t("Finding two recipes for you…")} rows={2}>
        {ready ? (
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
            {picks.map((c) => (
              <li key={c.recipe.id} className="min-w-0">
                <ChoiceTile card={c} shop={shop!} on={chosen === c.recipe.id} onToggle={() => onChoose(chosen === c.recipe.id ? null : c.recipe.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="text-[0.9375rem] leading-snug text-foreground">{t("Recipes can't load just now. You'll find them under Recipes.")}</p>
        )}
      </ShowcaseWindow>
      {ready && (
        <div className="mt-3 space-y-2 text-[0.9375rem] leading-snug text-foreground">
          <p className="font-semibold">{t("Tap one to cook first. It'll be waiting on Home.")}</p>
          {why && <p>{why}</p>}
          <p>{t("Prices are {shop}'s shelf prices and vary by store.", { shop: shopName })}</p>
        </div>
      )}
    </>
  );
}

/**
 * One recipe in choose mode: the app's own tile, inert underneath (no link, no heart), with a real button over the whole of it that says what the tile says
 * and chooses it (aria-pressed: "Selected" once chosen). Chosen: the 2 px dark green edge round the tile and, at the foot of its picture, the lime tag with a
 * tick and "Your first recipe" (the picture's own shape is repeated in the button, so the tag sits on the picture at every text size).
 */
function ChoiceTile({ card, shop, on, onToggle }: { card: RecipeCard; shop: string; on: boolean; onToggle: () => void }) {
  const t = useT();
  const hint = useId();
  const { recipe, totals } = card;
  const name = recipe.ai ? recipe.name : t(recipe.name);
  const price = totals.costPerServing !== null ? formatPrice(totals.costPerServing) : null;
  const spoken = price
    ? t("{recipe}, {kcal} calories, {protein} grams of protein, {price} a serving, {minutes} minutes.", { recipe: name, kcal: formatInt(totals.perServing.kcal), protein: formatInt(totals.perServing.protein), price, minutes: recipe.minutes })
    : t("{recipe}, {kcal} calories, {protein} grams of protein, {price} to buy, {minutes} minutes.", { recipe: name, kcal: formatInt(totals.perServing.kcal), protein: formatInt(totals.perServing.protein), price: formatPrice(totals.basket), minutes: recipe.minutes });
  return (
    <div className="@container relative h-full">
      <div inert className="h-full">
        <RecipeTile card={card} href={`/app/recipes/view?id=${recipe.id}&r=${shop}`} saveable={false} />
      </div>
      <button
        type="button"
        aria-pressed={on}
        aria-label={spoken}
        aria-describedby={hint}
        onClick={onToggle}
        className={`absolute inset-0 rounded-[1.25rem] text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-2 border-on-sun" : ""}`}
      >
        <span id={hint} className="sr-only">{t("Double-tap to choose it as your first recipe.")}</span>
        {on && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[4/3] items-end p-2 @[14rem]:aspect-[2/1]">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border-2 border-on-sun bg-sun px-2.5 py-1 text-[0.8125rem] font-bold leading-tight text-on-sun">
              <CheckIcon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
              <span className="min-w-0">{t("Your first recipe")}</span>
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
