"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { mealSlotFor } from "@/lib/mm/budget";
import { APP_BUILD } from "@/lib/mm/config";
import { retailerName } from "@/lib/mm/groceries";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { pickTwoRecipes as pickTwo, SMALLER_MEAL_KCAL } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { radioKeyNav } from "../_components/ui";
import { RecipeTile } from "../recipes/RecipeTile";
import { useNow, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeShopSet } from "../_lib/recipes";
import { useShopManifest } from "../_lib/shopProducts";
import { SUBLINE } from "./parts";
import { ShowcaseWindow } from "./ShowcaseWindow";

// Step 4 of the welcome steps, "Recipes from {shop}" (kept as the founder liked it on 20 November 2026: "keep that look"): two of our own recipes made from
// real products at the person's shop, with the price of a serving, for the meal of the day and the other main meal, with their diet applied, and one short
// line, "Tap one to cook first." The one chosen waits on Home ("Your first recipe"). Nothing is written anywhere: the choice is only a navigation hint, kept in
// the welcome screens' memory and their local progress note, never saved as a recipe. In the replay (Settings › Help, ?showcase=1) nothing is kept, so the two
// are plain links that open the recipe, with no line and no tag.
// - The tiles are the app's own RecipeTile at full size, with our illustration where there is one (no visible caption; screen readers hear "An illustration of
//   {recipe}") and the kcal, protein, carbs and fat, and "£x a serving · n min". Recipes with an illustration are offered first. No caption over them and no
//   Free tag (founder, 20 November 2026: no labels on previews).
// - Recipes are shown as written: no target is used before Your plan, so the default 2,000 kcal never sizes them.
// - Choosing: the tiles are RecipeTile's own choose mode (a radio in a group, no link, no heart); a chosen tile is lime with the dark green edge, a tick and a lime
//   "Your first recipe" tag; tapping again un-chooses it. Two fit side by side down to about 290 px.
// - Ranked by the most protein for the calories (never simply the most protein), and for someone losing weight or on a GLP-1 medicine those at or under 600 kcal
//   a serving first.
// - "Tap one to cook first." is the screen's one grey line under its heading, as in the founder's example screens.
// - Under them only what must be said: the shop recipes use when a ticked one isn't in recipes yet, and that shelf prices vary by store.
// - Loading: a status line and page-fill bars; on the website the shop's file (1.3 to 3.5 MB) is waited for up to 6 s, then a words-only line.

/** How long the website waits for the shop's file before the words-only line (the meeting: 6 s). */
const SHOP_WAIT_MS = 6000;

/** Two recipes for this person (lib/mm/recipes.ts pickTwoRecipes, where it is unit-tested). */
export const pickTwoRecipes = pickTwo;

const hasIllustration = (id: string): boolean => !!RECIPE_IMAGES[id];

/** The shop step 4 (and Your plan's week) uses, and why: the first ticked shop that is in recipes, else the default recipe shop. */
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

/** Step 4's window and the lines around it. `chosen`: the recipe chosen as the first one (null = none); `onChoose` sets it (null to un-choose). */
export function RecipeChoice({ chosen, onChoose }: { chosen: string | null; onChoose: (id: string | null) => void }) {
  const t = useT();
  const settings = useSettings();
  const params = useSearchParams();
  const replay = params.get("showcase") === "1" || params.get("tour") === "1";
  const manifest = useShopManifest();
  // the same shops, together, as the recipe page the card would open, so the card and the page agree
  const shopIds = recipeShopSetFor(manifest, null, settings.shops);
  const { shop, shopName, left } = useRecipeShop();
  const state = useRecipeShopSet(shopIds);
  const products = state.status === "ready" ? state.products : null;
  // shown as written: no target before "Your daily targets"; the book a few recipes at a time, so the step never freezes (the second sort of the 21 November
  // meeting, Xena)
  const { cards, ready: cardsReady } = useRecipeCards(null, products, settings.preferences, null, { chunked: true });
  const now = useNow();
  const slot = mealSlotFor(now);
  const smaller = settings.goal === "lose" || settings.goal === "glp1" ? SMALLER_MEAL_KCAL : undefined;
  const picks = useMemo(() => pickTwoRecipes(cards, slot, false, hasIllustration, smaller), [cards, slot, smaller]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (APP_BUILD) return; // the shop files are inside the iPhone app
    const id = window.setTimeout(() => setWaited(true), SHOP_WAIT_MS);
    return () => window.clearTimeout(id);
  }, []);
  // still working out which shop and which recipes: the manifest, then the shop's list, then the recipes (else noneFit would flash "nothing fits")
  const working = manifest === null || (shop !== null && (state.status === "loading" || (state.status === "ready" && !cardsReady)));
  const loading = working && !waited;
  const ready = !working && shop !== null && picks.length > 0;
  // the shop's list came but nothing suits the diet: said so, never blamed on the connection
  const noneFit = !working && shop !== null && state.status === "ready" && picks.length === 0;
  const list = (names: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
  // a shop ticked that recipes can't use yet: said, shortly (the heading names the shop they come from)
  const why = !ready ? null
    : left.length > 1 ? t("{left} aren't in recipes yet.", { left: list(left) })
    : left.length === 1 ? t("{left} isn't in recipes yet.", { left: left[0]! })
    : null;

  return (
    <>
      {/* the one line, before the recipes it is about (not in the replay, where nothing is chosen) */}
      {!replay && <p className={SUBLINE}>{t("Tap one to cook first.")}</p>}
      <ShowcaseWindow kind="recipes" loading={loading} status={shopName ? t("Finding two recipes at {shop}…", { shop: shopName }) : t("Finding two recipes for you…")} rows={2} skeleton={<TileSkeleton />}>
        {ready ? (
          replay ? (
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.75rem),1fr))] gap-2.5">
              {picks.map((c) => <li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} saveable={false} /></li>)}
            </ul>
          ) : (
            <ul role="radiogroup" aria-label={t("Your first recipe")} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.75rem),1fr))] gap-2.5">
              {picks.map((c, i) => {
                const on = chosen === c.recipe.id;
                return (
                  // role none: the radios belong to the radiogroup itself
                  <li key={c.recipe.id} role="none" className="min-w-0">
                    <RecipeTile
                      card={c}
                      href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`}
                      choose={{
                        on,
                        onChoose: () => onChoose(on ? null : c.recipe.id),
                        onKeyDown: (e) => radioKeyNav(e, i, picks.length, (n) => onChoose(picks[n]!.recipe.id)),
                        tabIndex: i === Math.max(0, picks.findIndex((p) => p.recipe.id === chosen)) ? 0 : -1,
                        tag: t("Your first recipe"),
                        hint: t("Double-tap to choose it as your first recipe."),
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <p role="status" className="text-[0.9375rem] leading-snug text-foreground">{noneFit ? t("None of our recipes fit what you avoid yet. Every recipe is under Recipes.") : t("Recipes can't load just now. You'll find them under Recipes.")}</p>
        )}
      </ShowcaseWindow>
      {ready && (
        <div className="mt-3 space-y-2">
          {why && <p className="text-[0.9375rem] leading-snug text-foreground">{why}</p>}
          <p className="text-sm leading-snug text-muted">{t("Prices are {shop}'s shelf prices and vary by store.", { shop: shopName })}</p>
        </div>
      )}
    </>
  );
}

/** Two tile-shaped page-fill blocks where the recipes will be (no digits). */
function TileSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.75rem),1fr))] gap-2.5">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-[1.25rem] border border-line bg-card">
          <span className="block aspect-[4/3] bg-background" />
          <span className="m-3 block h-4 w-3/4 rounded-md bg-background" />
          <span className="mx-3 mb-3 block h-10 rounded-xl bg-background" />
        </div>
      ))}
    </div>
  );
}

