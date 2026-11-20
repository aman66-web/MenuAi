"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MAX_RECIPE_SERVINGS, type MealTarget } from "@/lib/mm/recipes";
import { ErrorBox, Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { RecipeScreen } from "./RecipeScreen";

/** A number from the address, or undefined when it isn't one inside [min, max]. */
function numberParam(raw: string | null, min: number, max: number): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

// A static shell: the recipe and shop come from ?id= (or ?mine= for a saved one) and ?r=, so one cached page opens any recipe.
function RecipeRoute() {
  const t = useT();
  const params = useSearchParams();
  const id = params.get("id");
  const mine = params.get("mine");
  const shop = params.get("r");
  const okId = id && /^[a-z0-9-]{2,60}$/.test(id) ? id : null;
  const okMine = mine && /^ai-[a-z0-9-]{4,40}$/.test(mine) ? mine : null;
  // ?have=: the recipe's ingredients the person said they have (Cook with what you have), by key
  const have = (params.get("have") ?? "").split(",").filter((k) => /^[a-z0-9-]{1,40}$/.test(k)).slice(0, 30);
  // ?n= and ?w=1: a meal from a plan cooked for a household opens for everyone's servings, as written (founder 2026-11-19, the meeting: "Every amount is for all 4 of
  // you"). Everyone's portions added up can be a fraction (5.25 servings): the page cooks exactly that, in quarters, up to the most a recipe page cooks for.
  const n = numberParam(params.get("n"), 0.25, 20);
  const servings = n === undefined ? undefined : Math.min(MAX_RECIPE_SERVINGS, Math.max(1, Math.round(n * 4) / 4));
  const asWritten = params.get("w") === "1";
  // ?kcal= and ?p=: the plan slot's meal size, so the recipe is fitted exactly as its plan card was; ?better=1: with the better products the plan chose
  const kcal = numberParam(params.get("kcal"), 100, 3000);
  const protein = numberParam(params.get("p"), 1, 400);
  const planTarget: MealTarget | null = kcal !== undefined ? { kcal: Math.round(kcal), ...(protein !== undefined ? { protein: Math.round(protein) } : {}) } : null;
  const better = params.get("better") === "1";
  return okId || okMine ? <RecipeScreen id={okId} mine={okMine} shop={shop && /^[a-z0-9-]{2,40}$/.test(shop) ? shop : null} have={have} servings={servings} asWritten={asWritten} planTarget={planTarget} better={better} /> : <ErrorBox message={t("Choose a recipe first.")} />;
}

export default function RecipePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecipeRoute />
    </Suspense>
  );
}
