"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "../_components/ui";
import { BuilderScreen } from "./BuilderScreen";

function BuilderRoute() {
  const p = useSearchParams();
  return <BuilderScreen chainId={p.get("chain") ?? ""} itemId={p.get("item") ?? undefined} pickId={p.get("pick") ?? undefined} savedId={p.get("saved") ?? undefined} />;
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BuilderRoute />
    </Suspense>
  );
}
