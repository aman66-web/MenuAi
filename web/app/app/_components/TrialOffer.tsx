"use client";

import { useEffect, useState } from "react";
import { site } from "@/site.config";
import { usePathname } from "next/navigation";
import { IAP_ENABLED } from "@/lib/mm/config";
import { hasNative } from "@/lib/mm/native";
import { paidActive } from "@/lib/mm/paid";
import { localDay } from "@/lib/mm/ratingPrompt";
import { paidStore, ratingStore, settingsStore, tourStore, trialOfferStore } from "@/lib/mm/stores";
import { TOUR_VERSION, trialOfferDue } from "@/lib/mm/tour";
import { useNow, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { trialDaysOf, useStoreProducts } from "../_lib/storeProducts";
import { AppStorePlans } from "./AppStorePlans";
import { PremiumOffer } from "./PremiumOffer";
import { Button, Sheet } from "./ui";

// The iPhone app's one-time offer of the free trial (founder 2026-11-16: "sign up to Premium today, get a 7-day free trial, which they can skip"). Shown once on this
// phone, and only when Apple says this Apple ID can still have the free trial and Premium isn't already on. Skipping keeps the free version; the trial can be
// started later from any Premium feature's paywall or Settings › Subscription.
// When (the onboarding meeting of 19 November, question 5, approved that day; lib/mm/tour.ts trialOfferDue): never straight after setup, where the first free
// moment became an offer to pay. The first time someone taps a Premium feature, the paywall it opens is the offer (it carries the free-trial banner), and this sheet
// then never follows it. Otherwise this sheet opens on Home on their second visit day: a later day than the first day the app was used on this phone (the same
// count of days as the rating question, lib/mm/ratingPrompt.ts), never in the visit where setup or "Look around first" finished, and never over another sheet
// (the setup card's, Add food...): it waits until that one is closed.

/** Set by the welcome screens when setup or "Look around first" finishes: no offer in the rest of this visit (the app's JavaScript lives as long as the visit). */
let setUpThisVisit = false;
export function holdTrialOfferThisVisit(): void {
  setUpThisVisit = true;
}

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
  const rating = useStore(ratingStore);
  const now = useNow();
  const tourSeen = useStore(tourStore) >= TOUR_VERSION;
  const due = trialOfferDue({
    native: hasNative(),
    onboarded: settings.hasCompletedOnboarding,
    tourSeen,
    shown,
    paid: paidActive(paid, now.getTime()),
    pathname,
    firstDay: rating.firstDay,
    today: localDay(now),
    // a paywall closed at least once: a Premium feature was tapped, and its paywall already offered the trial
    paywallSeen: settings.paywallDismissCount > 0,
    setUpThisVisit,
  });
  const trial = trialDaysOf(useStoreProducts(due).products);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!due || !trial) return;
    // a moment after the person lands, so it doesn't jump in front of the page they were taken to; while another sheet is open it waits (and isn't marked shown)
    let timer = window.setTimeout(function show() {
      if (document.querySelector("dialog[open]")) {
        timer = window.setTimeout(show, 1000);
        return;
      }
      trialOfferStore.set(true);
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
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
