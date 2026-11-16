"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ErrorBox, Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { ProductScreen } from "./ProductScreen";

// A static shell: the barcode comes from ?code= (and an optional ?r=retailer to load that file first), so one cached page opens any product.
function ProductRoute() {
  const t = useT();
  const params = useSearchParams();
  const code = params.get("code");
  // keyed by the barcode: another size is a fresh screen, so "Added to your list for …" and "Copied" never carry over to a pack they weren't about
  return code ? <ProductScreen key={code} code={code} retailerHint={params.get("r")} /> : <ErrorBox message={t("Choose a product first.")} />;
}

export default function ProductPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductRoute />
    </Suspense>
  );
}
