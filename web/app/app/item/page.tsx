"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../_components/ui";
import { ItemScreen } from "./ItemScreen";

function ItemRoute() {
  const params = useSearchParams();
  const chain = params.get("chain");
  const item = params.get("item");
  return chain && item ? <ItemScreen chainId={chain} itemId={item} /> : <ErrorBox message="Choose an item first." />;
}

export default function ItemPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ItemRoute />
    </Suspense>
  );
}
