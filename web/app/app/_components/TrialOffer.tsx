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
import { AppStorePlans, PREMIUM_ON_NOTE } from "./AppStorePlans";
import { PremiumOffer } from "./PremiumOffer";
import { Toast } from "./Toast";
import { Button, Sheet } from "./ui";

// The iPhone app's one-time offer of the free trial (founder 2026-11-16: "sign up to Premium today, get a 7-day free trial, which they can skip"). Shown once on this
// phone, and only when Apple says this Apple ID can still have the free trial and Premium isn't already on. Skipping keeps the free version; the trial can be
// started later from any Premium feature's paywall or Settings › Subscription.
// When (the onboarding meeting of 19 November, question 5, approved that day; lib/mm/tour.ts trialOfferDue): never straight after setup, where the first free
// moment became an offer to pay. The first time someone taps a Premium feature, the paywall it opens is the offer (it carries the free-trial banner), and this sheet
// then never follows it. Otherwise this sheet opens on Home on their second visit day: a later day than the first day the app was used on this phone (the same
// count of days as the rating question, lib/mm/ratingPrompt.ts), never in the visit where the welcome screens finished (finishWelcome, after sign-in, "Not now" or a
// signed-in run's last step: the onboarding meeting of 20 November 2026 keeps this timing unchanged), and never over another sheet (the setup card's, Add
// food...): it waits until that one is closed. Inside (the overnight audit of 20 November 2026): one line saying a free trial is still there, the plans with the
// billed amount and Continue first, "Not now" straight under Continue, then what Premium adds and the free trial's card (PremiumOffer.tsx). Starting the trial
// closes the sheet and says "Premium is on. Thank you." once. Never in a visit that came through the sign-in screen either (AppShell holds it then: every 1.0
// user updating to 1.1 signs in once, and the sheet used to pop up straight after).

/** Set by the welcome screens when they finish (finishWelcome) and by AppShell after the sign-in screen: no offer in the rest of this visit (the app's JavaScript
 *  lives as long as the visit). */
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
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!due || !trial) return;
    // a moment after the person lands, so it doesn't jump in front of the page they were taken to; while another sheet is open it waits (and isn't marked shown)
    let timer = window.setTimeout(function show() {
      if (setUpThisVisit) return; // held since (AppShell after the sign-in screen: its effect runs after this one in the same commit)
      if (document.querySelector("dialog[open]")) {
        timer = window.setTimeout(show, 1000);
        return;
      }
      trialOfferStore.set(true);
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [due, trial]);

  if (!trial && !open && !unlocked) return null;
  return (
    <>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("{app} Premium", { app: site.name })}>
        <div className="pb-1 font-medium">
          {trial && <p className="mb-4 text-base font-semibold leading-snug">{t("You can still have a {days}-day free trial.", { days: trial })}</p>}
          <AppStorePlans
            onUnlocked={() => { setOpen(false); setUnlocked(true); }}
            afterContinue={
              <>
                <Button size="lg" full variant="secondary" className="mt-2.5" onClick={() => setOpen(false)}>{t("Not now")}</Button>
                <p className="mt-2 text-center text-[0.9375rem] leading-snug text-muted">{t("You can start it later in Settings › Subscription.")}</p>
                <div className="mt-6"><PremiumOffer /></div>
              </>
            }
          />
        </div>
      </Sheet>
      {unlocked && <Toast onClose={() => setUnlocked(false)}>{t(PREMIUM_ON_NOTE)}</Toast>}
    </>
  );
}
