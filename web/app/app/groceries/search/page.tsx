"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "../../_components/ui";
import { GroceriesSearchScreen } from "./SearchScreen";

// A static shell: ?r= picks a shop to start on (from a shop's list: "More products with their numbers").
function SearchRoute() {
  const r = useSearchParams().get("r");
  return <GroceriesSearchScreen initialShop={r && /^[a-z0-9-]{2,40}$/.test(r) ? r : null} />;
}

export default function GroceriesSearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SearchRoute />
    </Suspense>
  );
}
