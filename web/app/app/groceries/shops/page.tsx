"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { parseShops } from "@/lib/mm/shopPick";
import { ErrorBox, Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { MultiShopScreen } from "./MultiShopScreen";

// A static shell: the shops come from ?r=tesco,asda (ticked with "Select" on Groceries), so one cached page opens any set of shops.
function ShopsRoute() {
  const t = useT();
  const shops = parseShops(useSearchParams().get("r"));
  return shops.length > 0 ? <MultiShopScreen shops={shops} /> : <ErrorBox message={t("Choose a supermarket first.")} />;
}

export default function ShopsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ShopsRoute />
    </Suspense>
  );
}
