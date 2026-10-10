"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../../_components/ui";
import { RecipeScreen } from "./RecipeScreen";

// A static shell: the recipe and shop come from ?id= and ?r=, so one cached page opens any recipe.
function RecipeRoute() {
  const params = useSearchParams();
  const id = params.get("id");
  const shop = params.get("r");
  return id && /^[a-z0-9-]{2,60}$/.test(id) ? <RecipeScreen id={id} shop={shop && /^[a-z0-9-]{2,40}$/.test(shop) ? shop : null} /> : <ErrorBox message="Choose a recipe first." />;
}

export default function RecipePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecipeRoute />
    </Suspense>
  );
}
