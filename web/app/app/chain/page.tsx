"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../_components/ui";
import { ChainScreen } from "./ChainScreen";

// A static shell: the chain id comes from ?id=, so the same cached page works for every restaurant, offline too.
function ChainRoute() {
  const id = useSearchParams().get("id");
  return id ? <ChainScreen chainId={id} /> : <ErrorBox message="Choose a restaurant first." />;
}

export default function ChainPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChainRoute />
    </Suspense>
  );
}
