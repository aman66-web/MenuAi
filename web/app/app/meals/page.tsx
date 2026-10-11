"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MealsScreen, type MealsTab } from "./MealsScreen";

function Meals() {
  const asked = useSearchParams().get("tab");
  const tab: MealsTab | null = asked === "recipes" || asked === "restaurant" ? asked : null;
  return <MealsScreen tab={tab} />;
}

export default function MealsPage() {
  return (
    <Suspense fallback={null}>
      <Meals />
    </Suspense>
  );
}
