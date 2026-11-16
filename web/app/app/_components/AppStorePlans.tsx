"use client";

import { useState } from "react";
import { tk } from "@/lib/mm/i18n";
import { formatDate } from "@/lib/mm/format";
import { paidActive } from "@/lib/mm/paid";
import { paidStore } from "@/lib/mm/stores";
import { buyPlan, manageSubscriptions, restorePurchases } from "@/lib/payments/iap";
import { PLANS, type PlanId } from "@/lib/payments/plans";
import { site } from "@/site.config";
import { useNow, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { storeProducts, useStoreProducts } from "../_lib/storeProducts";
import { Button } from "./ui";

// The plans in the iPhone app (version 1.1), sold with Apple In-App Purchase (App Store rule 3.1.1). Names and prices come from StoreKit, never from our own table, so
// the screen always shows what Apple will charge. Under the plans: Apple's required words about renewing and cancelling, and links to the Terms of Use and the Privacy
// Policy (App Store rule 3.1.2). Nothing here mentions the website or any other way to pay.

const TAGLINE: Record<PlanId, string> = {
  pass90: tk("One payment. 90 days of access. It doesn't renew."),
  annual: tk("Renews each year until you cancel."),
  monthly: tk("Renews each month until you cancel."),
};

const BUY_NOTE = {
  ok: tk("Premium is on. Thank you!"),
  pending: tk("Waiting for approval. Premium switches on once the purchase is approved."),
  unavailable: tk("The purchase didn't go through. Please try again."),
  not_confirmed: tk("Your purchase went through, but Premium couldn't be switched on just now. Check your connection, then tap Restore purchases."),
} as const;

const RESTORE_NOTE = {
  restored: tk("Your purchases are restored."),
  none: tk("There's nothing to restore for this Apple ID."),
  failed: tk("Couldn't check just now. Please try again."),
} as const;

const LINK = "inline-flex min-h-11 items-center underline underline-offset-4";

export function AppStorePlans({ level = "h3" }: { level?: "h2" | "h3" }) {
  const Heading = level;
  const t = useT();
  const paid = useStore(paidStore);
  const now = useNow();
  const { products: found, retry } = useStoreProducts();
  // plans with a free trial for this Apple ID come first: the trial is the headline when there is one
  const products = found === "loading" || found === null ? found : [...found].sort((a, b) => Number(!!b.trialDays) - Number(!!a.trialDays));
  const trial = products && products !== "loading" ? products.find((p) => p.trialDays)?.trialDays ?? null : null;
  const [busy, setBusy] = useState<PlanId | "restore" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const active = paidActive(paid, now.getTime());
  const subscribed = active && (paid.plan === "annual" || paid.plan === "monthly");

  const buy = async (plan: PlanId) => {
    setBusy(plan);
    setNote(null);
    const r = await buyPlan(plan);
    setBusy(null);
    if (r !== "cancelled") setNote(t(BUY_NOTE[r]));
    if (r === "ok" || r === "pending") void storeProducts(true); // a trial taken can't be taken again
  };

  const restore = async () => {
    setBusy("restore");
    setNote(null);
    const r = await restorePurchases();
    setBusy(null);
    if (r !== "cancelled") setNote(t(RESTORE_NOTE[r]));
  };

  return (
    <div>
      {active ? (
        <div className="rounded-[1.25rem] bg-soft p-4">
          <p className="text-lg font-extrabold leading-snug">{t("Premium is on.")}</p>
          {paid.plan === "pass90" && paid.until && (
            <p className="mt-1 text-base leading-snug text-muted">{t("Your pass ends on {date}.", { date: formatDate(new Date(paid.until).toISOString().slice(0, 10), t) })}</p>
          )}
          {subscribed && (
            <Button size="lg" full variant="secondary" className="mt-3" onClick={() => void manageSubscriptions()}>{t("Manage subscription")}</Button>
          )}
        </div>
      ) : products === "loading" ? (
        <p role="status" className="rounded-[1.25rem] bg-soft p-4 text-base font-semibold">{t("Getting prices from the App Store…")}</p>
      ) : products === null ? (
        <div className="rounded-[1.25rem] bg-soft p-4">
          <p role="alert" className="text-base font-semibold">{t("Couldn't reach the App Store. Check your connection and try again.")}</p>
          <Button size="lg" full variant="secondary" className="mt-3" onClick={retry}>{t("Try again")}</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => {
            const plan = PLANS[p.plan];
            const per = p.period === "year" ? t("a year") : p.period === "month" ? t("a month") : t("one payment");
            return (
              <li key={p.id} className={`rounded-[1.25rem] p-4 ${plan.badge === "Most popular" ? "bg-[var(--sun)] text-[var(--tl-ink)]" : "bg-soft"}`}>
                {plan.badge && <p className="text-base font-bold uppercase tracking-wide">{t(plan.badge)}</p>}
                <Heading className="mt-0.5 text-xl font-extrabold leading-snug tracking-tight">{p.name}</Heading>
                <p className="app-numbers mt-1 text-4xl font-extrabold leading-none tracking-tight">{p.price} <span className="text-lg font-bold opacity-80">{per}</span></p>
                {p.trialDays ? (
                  <p className="mt-2 text-base font-bold leading-snug">{t("First {days} days free, then {price} {per}.", { days: p.trialDays, price: p.price, per })}</p>
                ) : null}
                <p className="mt-2 text-base leading-snug">{t(TAGLINE[p.plan])}</p>
                <Button size="lg" full className="mt-3" disabled={busy !== null} onClick={() => void buy(p.plan)}>
                  {busy === p.plan ? t("Waiting for the App Store…") : p.trialDays ? t("Start {days}-day free trial", { days: p.trialDays }) : p.period === "none" ? t("Buy for {price}", { price: p.price }) : t("Subscribe for {price} {per}", { price: p.price, per })}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {note && <p role="status" className="mt-3 text-base font-semibold">{note}</p>}

      <Button size="lg" full variant="secondary" className="mt-4" disabled={busy !== null} onClick={() => void restore()}>
        {busy === "restore" ? t("Checking with the App Store…") : t("Restore purchases")}
      </Button>

      <p className="mt-4 text-[0.9375rem] leading-snug text-muted">
        {t("Annual and Monthly are subscriptions that renew automatically. Payment is charged to your Apple ID when you confirm the purchase. A subscription renews at the same price for the same length unless you cancel it at least 24 hours before the end of the current period, and the renewal is charged within the 24 hours before that. Manage or cancel it in your App Store account settings. The Founding Member 90-Day Pass is one payment and doesn't renew.")}
      </p>
      {trial && (
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
          {t("With the free trial you pay nothing for the first {days} days. If you don't cancel at least 24 hours before it ends, the subscription starts and you're charged. There is one free trial per Apple ID.", { days: trial })}
        </p>
      )}
      <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
        <a className={LINK} href={site.appleStandardEula} target="_blank" rel="noopener noreferrer">{t("Terms of Use (EULA)")}</a>
        {" · "}
        <a className={LINK} href="/terms">{t("Terms")}</a>
        {" · "}
        <a className={LINK} href="/privacy">{t("Privacy Policy")}</a>
      </p>
    </div>
  );
}

/** Settings › Subscription in the In-App Purchase app: Restore purchases, and Apple's own Manage subscription screen while a subscription is running. */
export function AppStoreAccountButtons() {
  const t = useT();
  const paid = useStore(paidStore);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const subscribed = paidActive(paid, now.getTime()) && (paid.plan === "annual" || paid.plan === "monthly");
  const restore = async () => {
    setBusy(true);
    setNote(null);
    const r = await restorePurchases();
    setBusy(false);
    if (r !== "cancelled") setNote(t(RESTORE_NOTE[r]));
  };
  return (
    <div className="mt-3 space-y-2.5">
      {subscribed && <Button size="lg" full variant="secondary" onClick={() => void manageSubscriptions()}>{t("Manage subscription")}</Button>}
      <Button size="lg" full variant="secondary" disabled={busy} onClick={() => void restore()}>{busy ? t("Checking with the App Store…") : t("Restore purchases")}</Button>
      {note && <p role="status" className="text-base font-semibold">{note}</p>}
    </div>
  );
}
