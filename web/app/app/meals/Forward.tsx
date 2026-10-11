"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "../_components/ui";
import type { MealsTab } from "./MealsScreen";

/** The old addresses of "My saved meals" (/app/saved) and "My recipes" (/app/recipes/saved) open the matching tab of "My meals". */
export function ForwardToMeals({ tab }: { tab: MealsTab }) {
  const router = useRouter();
  useEffect(() => { router.replace(`/app/meals?tab=${tab}`); }, [router, tab]);
  return <Spinner />;
}
