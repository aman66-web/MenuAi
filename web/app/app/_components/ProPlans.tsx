"use client";

import { useState } from "react";
import { PLAN_IDS, PLANS, type PlanId } from "@/lib/payments/plans";
import { startCheckout } from "@/lib/payments/client";
import { noteShareUnlock, paidStore } from "@/lib/mm/stores";
import { shareUnlockActive } from "@/lib/mm/paid";
import { formatDate } from "@/lib/mm/format";
import { whatsappUrl } from "@/lib/mm/truth/shareTruth";
import { site } from "@/site.config";
import { useNow, useStore } from "../_lib/hooks";
import { useAccountUser } from "../_lib/account";
import { getLastTruthMessage } from "../_lib/lastTruth";
import { useT } from "../_lib/i18n";
import { restoreFromAccount } from "@/lib/payments/client";
import { SignInSheet } from "./SignIn";
import { AppStorePlans } from "./AppStorePlans";
import { WhatsAppShareIcon } from "./truth/TruthIcons";
import { Button } from "./ui";

// The three plans, how they are paid for, and the two quieter ways in: "I've already paid" (sign in with the same email) and sharing on WhatsApp for 48 hours.
// Shown in the paywall sheet and on /app/pro. Only on the website's build when paid access is on (config.ts WEB_PRO_ENABLED): the iPhone app buys through the App Store.

const GENERIC_SHARE = `Look at the real calories and protein of UK restaurant meals, worked out from each restaurant's own published figures: ${site.url}`;

/** `level` is the heading level of each plan's name: h3 inside the paywall sheet (whose title is the h2), h2 on the Pro page (under its h1). */
/** True in the iPhone app's copy, written as a build-time constant: the app never shows plans or prices (App Store 3.1.1: purchases there go through Apple), and
 *  with this the plans, the prices and the words about paying on Stripe are left out of the app's files altogether (App Review 2.3.1: no dormant features). */
const IN_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1" && process.env.NEXT_PUBLIC_IAP !== "1"; // the free iPhone app (an In-App Purchase build, 1.1, keeps it)
/** The iPhone app that sells with Apple In-App Purchase (version 1.1): Apple's plans only. The Stripe plans below, their prices and the WhatsApp unlock are then left out
 *  of the app's files (written as a build-time constant so the minifier drops them). */
const IAP_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1" && process.env.NEXT_PUBLIC_IAP === "1";

export function ProPlans(props: { level?: "h2" | "h3" } = {}) {
  if (IN_APP) return null;
  if (IAP_APP) return <AppStorePlans {...props} />;
  return <PlansBody {...props} />;
}

function PlansBody({ level = "h3" }: { level?: "h2" | "h3" }) {
  const Heading = level;
  const t = useT();
  const paid = useStore(paidStore);
  const user = useAccountUser();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const now = useNow();
  const unlocked = shareUnlockActive(paid, now.getTime());

  const pay = async (plan: PlanId) => {
    setBusy(plan);
    setError(null);
    const r = await startCheckout(plan);
    if ("url" in r) {
      window.location.assign(r.url);
      return;
    }
    setBusy(null);
    setError(r.error === "unavailable" ? t("Paying isn't available right now. Please try again later.") : t("Couldn't start the payment. Please try again."));
  };

  const restore = async () => {
    if (!user) return setSignIn(true);
    setRestoring(true);
    setRestoreNote(null);
    const r = await restoreFromAccount();
    setRestoring(false);
    setRestoreNote(r.ok ? t("Your access is back.") : r.error === "none" ? t("We couldn't find a payment for this account's email address.") : t("Couldn't check just now. Please try again."));
  };

  return (
    <div>
      <ul className="space-y-3">
        {PLAN_IDS.map((id) => {
          const p = PLANS[id];
          return (
            <li key={id} className={`rounded-[1.25rem] p-4 ${p.badge === "Most popular" ? "bg-[var(--sun)] text-[var(--tl-ink)]" : "bg-soft"}`}>
              {p.badge && <p className="text-base font-bold uppercase tracking-wide">{t(p.badge)}</p>}
              <Heading className="mt-0.5 text-xl font-extrabold leading-snug tracking-tight">{t(p.label)}</Heading>
              <p className="app-numbers mt-1 text-4xl font-extrabold leading-none tracking-tight">{p.price} <span className="text-lg font-bold opacity-80">{t(p.per)}</span></p>
              <p className="mt-2 text-base leading-snug">{t(p.tagline)}</p>
              <Button size="lg" full className="mt-3" disabled={busy !== null} onClick={() => void pay(id)}>
                {busy === id ? t("Opening the payment page…") : t("Pay {price}", { price: p.price })}
              </Button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-3 text-base font-semibold">{error}</p>}
      <p className="mt-3 text-base leading-snug text-muted">
        {t("You pay on Stripe's secure page with a card, Apple Pay or Google Pay where your device has it. You don't need an account. Subscriptions renew until you cancel.")}
      </p>

      <div className="mt-5 space-y-2.5 border-t border-line pt-4">
        <Button size="lg" full variant="secondary" disabled={restoring} onClick={() => void restore()}>
          {user ? t("Restore my access") : t("I've already paid: sign in")}
        </Button>
        {restoreNote && <p role="status" className="text-base font-semibold">{restoreNote}</p>}
        {unlocked ? (
          <p role="status" className="text-base font-semibold">{t("Unlocked until {date}. Thanks for sharing.", { date: formatDate(new Date(paid.unlockUntil ?? 0).toISOString().slice(0, 10), t) })}</p>
        ) : (
          <a
            href={whatsappUrl(getLastTruthMessage() ?? GENERIC_SHARE)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => noteShareUnlock()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--tl-green)] px-6 text-center text-base font-bold leading-snug text-[var(--tl-ink)] transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <WhatsAppShareIcon className="h-6 w-6 shrink-0" />
            <span>{t("Or share on WhatsApp to unlock 48 hours free")}</span>
            <span className="sr-only">{t("(opens in a new tab)")}</span>
          </a>
        )}
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}
