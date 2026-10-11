"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CompareScreen } from "./CompareScreen";

function Compare() {
  const asked = useSearchParams().get("tab");
  return <CompareScreen tab={asked === "food" || asked === "dish" ? asked : null} />;
}

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <Compare />
    </Suspense>
  );
}
