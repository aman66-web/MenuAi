"use client";

import { useEffect, useState } from "react";
import { site } from "@/site.config";
import { usePathname } from "next/navigation";
import { IAP_ENABLED } from "@/lib/mm/config";
import { hasNative } from "@/lib/mm/native";
import { paidActive } from "@/lib/mm/paid";
import { paidStore, settingsStore, trialOfferStore } from "@/lib/mm/stores";
import { useNow, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { trialDaysOf, useStoreProducts } from "../_lib/storeProducts";
import { AppStorePlans } from "./AppStorePlans";
import { PremiumOffer } from "./PremiumOffer";
import { Button, Sheet } from "./ui";

// The iPhone app's one-time offer after setup (founder 2026-11-16: "after they've done all the onboarding screens, they will then see sign up to Premium today, get a 7-day
// free trial, which they can skip"). Shown once on this phone, never in the middle of the welcome screens, and only when Apple says this Apple ID can still have the free
// trial and Premium isn't already on. Skipping keeps the free version; the trial can be started later from any Premium feature's paywall or Settings › Subscription.

export function TrialOffer() {
  if (!IAP_ENABLED) return null;
  return <TrialOfferInApp />;
}

function TrialOfferInApp() {
  const t = useT();
  const pathname = usePathname();
  const settings = useStore(settingsStore);
  const shown = useStore(trialOfferStore);
  const paid = useStore(paidStore);
  const now = useNow();
  const due = hasNative() && settings.hasCompletedOnboarding && !shown && !paidActive(paid, now.getTime()) && !pathname.startsWith("/app/welcome");
  const trial = trialDaysOf(useStoreProducts(due).products);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!due || !trial) return;
    // a moment after the person lands, so it doesn't jump in front of the page they were taken to
    const timer = setTimeout(() => {
      trialOfferStore.set(true);
      setOpen(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [due, trial]);

  if (!trial && !open) return null;
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={t("{app} Premium", { app: site.name })}>
      <div className="pb-1 font-medium">
        <PremiumOffer trial={trial} />
        <div className="mt-5"><AppStorePlans /></div>
        <Button size="lg" full variant="secondary" className="mt-4" onClick={() => setOpen(false)}>{t("Not now")}</Button>
        <p className="mt-2 text-center text-[0.9375rem] leading-snug text-muted">{t("You can start your free trial later from any Premium feature, or in Settings › Subscription.")}</p>
      </div>
    </Sheet>
  );
}
