"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { parseShops } from "@/lib/mm/shopPick";
import { Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { NoChoice } from "../shop/ShopListScreen";
import { MultiShopScreen } from "./MultiShopScreen";

// A static shell: the shops come from ?r=tesco,asda (ticked with "Select" on Groceries), so one cached page opens any set of shops.
function ShopsRoute() {
  const t = useT();
  const shops = parseShops(useSearchParams().get("r"));
  return shops.length > 0 ? <MultiShopScreen shops={shops} /> : <NoChoice title={t("Choose a supermarket first.")} body={t("Tap Select on the shops you want.")} />;
}

export default function ShopsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ShopsRoute />
    </Suspense>
  );
}
