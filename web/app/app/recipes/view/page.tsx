"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { RecipeScreen } from "./RecipeScreen";

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
  // ?n= and ?w=1: a meal from a plan cooked for a household opens for everyone's servings, as written (founder 2026-11-19, the meeting: "Every amount is for all 4 of you")
  const n = Number(params.get("n"));
  const servings = Number.isInteger(n) && n >= 1 && n <= 20 ? n : undefined;
  const asWritten = params.get("w") === "1";
  return okId || okMine ? <RecipeScreen id={okId} mine={okMine} shop={shop && /^[a-z0-9-]{2,40}$/.test(shop) ? shop : null} have={have} servings={servings} asWritten={asWritten} /> : <ErrorBox message={t("Choose a recipe first.")} />;
}

export default function RecipePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecipeRoute />
    </Suspense>
  );
}
