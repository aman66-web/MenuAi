"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Spinner } from "../../_components/ui";
import { ProductScreen } from "./ProductScreen";

// A static shell: the barcode comes from ?code= (and an optional ?r=retailer to load that file first; ?scan=1 when it was scanned or typed into the scanner,
// which opens the product in a shop's full list where one has it), so one cached page opens any product. No barcode: back to Groceries, never a dead end.
function ProductRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  useEffect(() => { if (!code) router.replace("/app/groceries"); }, [code, router]);
  return code ? <ProductScreen code={code} retailerHint={params.get("r")} scan={params.get("scan") === "1"} /> : <Spinner />;
}

export default function ProductPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductRoute />
    </Suspense>
  );
}
