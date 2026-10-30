"use client";

import { Suspense } from "react";
import { Spinner } from "../../_components/ui";
import { GroceriesSearchScreen } from "./SearchScreen";

// A static shell: the screen reads its choices from the address in the browser (?r= picks a shop to start on, as a shop's list's "More products with their
// numbers" does; ?type=, ?sort= and ?diet= come back with Back). useSearchParams needs the Suspense boundary in a static export.
export default function GroceriesSearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <GroceriesSearchScreen />
    </Suspense>
  );
}
