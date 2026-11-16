"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IAP_ENABLED } from "@/lib/mm/config";
import { PAID_BULLETS } from "@/lib/mm/entitlements";
import { hasNative } from "@/lib/mm/native";
import { paidActive } from "@/lib/mm/paid";
import { paidStore, settingsStore, trialOfferStore } from "@/lib/mm/stores";
import { useNow, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { trialDaysOf, useStoreProducts } from "../_lib/storeProducts";
import { AppStorePlans } from "./AppStorePlans";
import { CheckIcon } from "./icons";
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
    <Sheet open={open} onClose={() => setOpen(false)} title={t("Try Premium free for {days} days", { days: trial ?? 7 })}>
      <div className="pb-1 font-medium">
        <p className="text-base leading-snug text-muted">{t("Everything that's free stays free. Premium adds:")}</p>
        <ul className="mt-3 divide-y divide-line rounded-[1.25rem] bg-soft">
          {PAID_BULLETS.map((b) => (
            <li key={b} className="flex items-center gap-3.5 px-4 py-3.5">
              <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><CheckIcon className="h-4 w-4" strokeWidth={2.5} /></span>
              <span className="text-base font-semibold leading-snug">{t(b)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4"><AppStorePlans /></div>
        <Button size="lg" full variant="secondary" className="mt-4" onClick={() => setOpen(false)}>{t("Not now")}</Button>
        <p className="mt-2 text-center text-[0.9375rem] leading-snug text-muted">{t("You can start your free trial later from any Premium feature, or in Settings › Subscription.")}</p>
      </div>
    </Sheet>
  );
}
