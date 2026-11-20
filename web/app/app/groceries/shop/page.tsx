"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { NoChoice, ShopListScreen } from "./ShopListScreen";

// A static shell: the shop comes from ?r=, so one cached page opens any shop's full list.
function ShopRoute() {
  const t = useT();
  const shop = useSearchParams().get("r");
  return shop && /^[a-z0-9-]{2,40}$/.test(shop) ? <ShopListScreen shop={shop} /> : <NoChoice title={t("Choose a supermarket first.")} />;
}

export default function ShopListPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ShopRoute />
    </Suspense>
  );
}
