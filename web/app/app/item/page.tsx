"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { ItemScreen } from "./ItemScreen";

function ItemRoute() {
  const t = useT();
  const params = useSearchParams();
  const chain = params.get("chain");
  const item = params.get("item");
  return chain && item ? <ItemScreen chainId={chain} itemId={item} /> : <ErrorBox message={t("Choose an item first.")} />;
}

export default function ItemPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ItemRoute />
    </Suspense>
  );
}
