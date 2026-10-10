"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../../../_components/ui";
import { useT } from "../../../_lib/i18n";
import { ShopItemScreen } from "./ShopItemScreen";

// A static shell: the shop and product come from ?r= and ?id=, so one cached page opens any product.
function ShopItemRoute() {
  const t = useT();
  const params = useSearchParams();
  const shop = params.get("r");
  const id = params.get("id");
  return shop && id && /^[a-z0-9-]{2,40}$/.test(shop) ? <ShopItemScreen shop={shop} id={id} /> : <ErrorBox message={t("Choose a product first.")} />;
}

export default function ShopItemPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ShopItemRoute />
    </Suspense>
  );
}
