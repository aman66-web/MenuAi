"use client";

import { useEffect, useState } from "react";
import { loadProducts, type StoreProduct } from "@/lib/payments/iap";

// The App Store's plans, asked of StoreKit once per app session and shared by the plans screen, the paywall's trial banner and the trial offer after setup.
// Asked again after a purchase or a restore, because whether this Apple ID can still have the free trial changes then.

let asked: Promise<StoreProduct[] | null> | null = null;

export function storeProducts(fresh = false): Promise<StoreProduct[] | null> {
  if (fresh || !asked) {
    asked = loadProducts().then((found) => {
      if (!found) asked = null; // no answer (no signal): ask again next time
      return found;
    });
  }
  return asked;
}

/** The plans, "loading" while StoreKit answers, or null when it didn't. */
export function useStoreProducts(enabled = true): { products: StoreProduct[] | null | "loading"; retry: () => void } {
  const [products, setProducts] = useState<StoreProduct[] | null | "loading">(enabled ? "loading" : null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void storeProducts(round > 0).then((found) => {
      if (live) setProducts(found);
    });
    return () => {
      live = false;
    };
  }, [round, enabled]);
  return {
    products,
    retry: () => {
      setProducts("loading");
      setRound((n) => n + 1);
    },
  };
}

/** The free trial on offer to this Apple ID, in days (the longest of the plans), or null when there is none or it has been used. */
export function trialDaysOf(products: StoreProduct[] | null | "loading"): number | null {
  if (!products || products === "loading") return null;
  const days = Math.max(0, ...products.map((p) => p.trialDays ?? 0));
  return days > 0 ? days : null;
}
