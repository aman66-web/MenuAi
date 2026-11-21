"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "../_components/PageHeader";
import { EmptyState, LinkButton, Spinner } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { ItemScreen } from "./ItemScreen";

function ItemRoute() {
  const t = useT();
  const params = useSearchParams();
  const chain = params.get("chain");
  const item = params.get("item");
  // keyed by the dish, so moving from one dish to another ("See the swap's full numbers" in the Truth sheet) starts the page afresh: the sheet, "More detail"
  // and the meal choice of the dish before never stay open over the new one (the 21 November 2026 meeting)
  return chain && item ? <ItemScreen key={`${chain}/${item}`} chainId={chain} itemId={item} /> : (
    // a link with no dish or restaurant in it: a missing page with the way back, never a red error (the 20 November 2026 audit)
    <div>
      <PageHeader back={{ href: "/app/eat-out", label: t("Back to restaurants") }} />
      <div className="mt-4"><EmptyState title={t("Choose an item first.")} action={<LinkButton href="/app/eat-out" variant="secondary">{t("See all restaurants")}</LinkButton>} /></div>
    </div>
  );
}

export default function ItemPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ItemRoute />
    </Suspense>
  );
}
