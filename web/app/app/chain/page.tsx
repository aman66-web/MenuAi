"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "../_components/PageHeader";
import { EmptyState, LinkButton, Spinner } from "../_components/ui";
import { ChainScreen } from "./ChainScreen";
import { useT } from "../_lib/i18n";

// A static shell: the chain id comes from ?id=, so the same cached page works for every restaurant, offline too.
function ChainRoute() {
  const t = useT();
  const id = useSearchParams().get("id");
  return id ? <ChainScreen chainId={id} /> : (
    // a link with no dish or restaurant in it: a missing page with the way back, never a red error (the 20 November 2026 audit)
    <div>
      <PageHeader back={{ href: "/app/eat-out", label: t("Back to restaurants") }} />
      <div className="mt-4"><EmptyState title={t("Choose a restaurant first.")} action={<LinkButton href="/app/eat-out" variant="secondary">{t("See all restaurants")}</LinkButton>} /></div>
    </div>
  );
}

export default function ChainPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChainRoute />
    </Suspense>
  );
}
