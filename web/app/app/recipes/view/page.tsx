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
  return okId || okMine ? <RecipeScreen id={okId} mine={okMine} shop={shop && /^[a-z0-9-]{2,40}$/.test(shop) ? shop : null} /> : <ErrorBox message={t("Choose a recipe first.")} />;
}

export default function RecipePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecipeRoute />
    </Suspense>
  );
}
