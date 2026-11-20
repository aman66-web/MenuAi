"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { tk } from "@/lib/mm/i18n";
import { paidActive } from "@/lib/mm/paid";
import { paidStore } from "@/lib/mm/stores";
import { buyPlan, manageSubscriptions, restorePurchases, type IapPlanId, type RestoreResult, type StoreProduct } from "@/lib/payments/iap";
import { site } from "@/site.config";
import { useNow, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { storeProducts, useStoreProducts } from "../_lib/storeProducts";
import { ErrorBanner } from "./Note";
import { InkBadge } from "./PremiumBadge";
import { PremiumHero, TrialStory } from "./PremiumOffer";
import { Button, ChoiceMark, ErrorBox, radioKeyNav } from "./ui";

// The plans in the iPhone app (version 1.1), sold with Apple In-App Purchase (App Store rule 3.1.1). Names and prices come from StoreKit, never from our own table, so
// the screen always shows what Apple will charge. Under the plans: the chosen plan's billed amount, the largest price on the screen, with the free trial's line
// smaller beneath it and "Continue" (the onboarding meeting of 20 November 2026, App Review 3.1.2(c): the main button used to say "Start my {days}-day free trial",
// and the trial headline sat above the prices); then the free trial's own card (PremiumOffer.tsx TrialStory), Restore, Apple's required words about renewing and
// cancelling, and links to the Terms of Use and the Privacy Policy (App Store rule 3.1.2). Nothing here mentions the website or any other way to pay. Colours
// (colour meeting, 19 November 2026, approved by the founder that day): each plan white with the 1.5 px edge and an empty ring, the chosen one lime with the 2 px
// dark green edge and a tick; prices in the body's ink; "Best value" in the Premium badge's ink look (never lime); Continue the one ink button, busy with its
// words while the App Store works; Restore an underlined link; a purchase that fails is the error banner; Apple's words at 15 px.
// The overnight audit of 20 November 2026: only Annual and Monthly are sold (the Founding Member pass is gone, and Apple's small print names exactly the plans
// StoreKit returned); `afterContinue` puts what the screen needs straight under Continue ("Not now" on the trial offer, what Premium adds on a paywall); and a
// purchase or restore that switches Premium on hands over to `onUnlocked` (the paywall closes, says so once and carries on to the feature) or, with no
// `onUnlocked`, says so in one line with nothing else.
// The founder, 20 November 2026 (23:05: "This has got to look more interesting also mention is a 7 day free trial"): the plans now open with a picture-led top
// (PremiumOffer.tsx PremiumHero: "Try Premium free for 7 days", "Then £49.99 a year." from StoreKit's price for the chosen plan, smaller than the billed amount
// under the plans, and `reason`); under Continue come `afterContinue`, how the free trial works, then `features` (what Premium adds, as picture cards), then
// Restore and Apple's words, all still on the sheet.

const TAGLINE: Record<IapPlanId, string> = {
  annual: tk("Renews each year until you cancel."),
  monthly: tk("Renews each month until you cancel."),
};

/** The badge on a plan (the App Store app's own; the website's Stripe drafts in lib/payments/plans.ts have their own and are never read here). */
const BADGE: Partial<Record<IapPlanId, string>> = { annual: tk("Best value") };

/** The one line said when Premium switches on (house style: no "!"). Also the paywall's toast. */
export const PREMIUM_ON_NOTE = tk("Premium is on. Thank you.");

const BUY_NOTE = {
  ok: PREMIUM_ON_NOTE,
  pending: tk("Waiting for approval. Premium switches on once the purchase is approved."),
  unavailable: tk("The purchase didn't go through. Please try again."),
  not_confirmed: tk("Your purchase went through, but Premium couldn't be switched on just now. Check your connection, then tap Restore purchases."),
} as const;

const RESTORE_NOTE = {
  restored: tk("Your purchases are restored."),
  none: tk("There's nothing to restore for this Apple ID."),
  refused: tk("Apple has a purchase for this Apple ID, but Premium couldn't be switched on. Please try again later or contact us."),
  failed: tk("Couldn't check just now. Please try again."),
} as const;

const LINK = "inline-flex min-h-11 items-center text-accent underline underline-offset-[3px]";
/** What failed is said in the error banner; anything else (on, waiting, restored) in a plain status line. */
const FAILED: readonly string[] = [BUY_NOTE.unavailable, BUY_NOTE.not_confirmed, RESTORE_NOTE.failed, RESTORE_NOTE.refused];
/** Premium has just switched on: said once, in the "Premium is on" box. */
const UNLOCKED: readonly string[] = [BUY_NOTE.ok, RESTORE_NOTE.restored];

/** Apple's renewal words, naming the plans StoreKit returned that renew (App Store rule 3.1.2), then the non-renewing sentence only if one is on sale. */
function renewalWords(products: readonly StoreProduct[] | null, t: ReturnType<typeof useT>): string[] {
  const renewing = (products ?? []).filter((p) => p.period !== "none").map((p) => p.name);
  const once = (products ?? []).filter((p) => p.period === "none").map((p) => p.name);
  const words: string[] = [];
  if (renewing.length === 1) words.push(t("{plan} is a subscription that renews automatically.", { plan: renewing[0]! }));
  else if (renewing.length > 1) words.push(t("{plans} and {last} are subscriptions that renew automatically.", { plans: renewing.slice(0, -1).join(", "), last: renewing[renewing.length - 1]! }));
  words.push(t("Payment is charged to your Apple ID when you confirm. A subscription renews at the same price and length unless you cancel at least 24 hours before the period ends; the renewal is charged within those 24 hours. Manage or cancel it in your App Store account settings."));
  for (const name of once) words.push(t("{plan} is one payment and doesn't renew.", { plan: name }));
  return words;
}

export function AppStorePlans({ reason, afterContinue, features, onUnlocked, level = "h3" }: {
  /** Why the sheet opened, one plain line under the headline. */
  reason?: ReactNode;
  /** Straight under Continue ("Not now" on the trial offer). */
  afterContinue?: ReactNode;
  /** What Premium adds, under how the free trial works. */
  features?: ReactNode;
  onUnlocked?: () => void;
  /** The headline's level: h3 in a sheet (under its h2 title), h2 on a page. */
  level?: "h2" | "h3";
} = {}) {
  const t = useT();
  const paid = useStore(paidStore);
  const now = useNow();
  const { products: found, retry } = useStoreProducts();
  // plans with a free trial for this Apple ID come first (and the first is chosen), so the trial's card below the prices is about the chosen plan
  const products = found === "loading" || found === null ? found : [...found].sort((a, b) => Number(!!b.trialDays) - Number(!!a.trialDays));
  const listed = products && products !== "loading" ? products : null;
  const trial = listed?.find((p) => p.trialDays)?.trialDays ?? null;
  const [busy, setBusy] = useState<IapPlanId | "restore" | null>(null);
  const [note, setNote] = useState<{ key: string; text: string } | null>(null);
  const noteRef = useShowNote(note?.text ?? null);
  const [chosen, setChosen] = useState<IapPlanId | null>(null);
  // the plan chosen, or the first (a plan with the free trial when this Apple ID can still have one)
  const selected = listed ? (listed.find((p) => p.plan === chosen) ?? listed[0] ?? null) : null;
  const perOf = (p: StoreProduct) => (p.period === "year" ? t("a year") : p.period === "month" ? t("a month") : t("one payment"));

  const active = paidActive(paid, now.getTime());
  const subscribed = active && (paid.plan === "annual" || paid.plan === "monthly");
  // just switched on here: the box says it once (and Manage subscription waits for a later visit)
  const justOn = active && note !== null && UNLOCKED.includes(note.key);

  const buy = async (plan: IapPlanId) => {
    setBusy(plan);
    setNote(null);
    const r = await buyPlan(plan);
    setBusy(null);
    if (r === "ok" || r === "pending") void storeProducts(true); // a trial taken can't be taken again
    if (r === "ok" && onUnlocked) return onUnlocked();
    if (r !== "cancelled") setNote({ key: BUY_NOTE[r], text: t(BUY_NOTE[r]) });
  };

  const restore = async () => {
    setBusy("restore");
    setNote(null);
    const r = await restorePurchases();
    setBusy(null);
    if (r === "restored" && onUnlocked) return onUnlocked();
    if (r !== "cancelled") setNote({ key: RESTORE_NOTE[r], text: t(RESTORE_NOTE[r]) });
  };

  return (
    <div>
      {!active && <PremiumHero trial={selected?.trialDays ?? null} price={selected?.price ?? null} per={selected ? perOf(selected) : ""} waiting={products === "loading"} reason={reason} level={level} />}
      {active ? (
        <div className="rounded-[1.25rem] bg-soft p-4">
          <p ref={justOn ? noteRef : undefined} role={justOn ? "status" : undefined} className="scroll-mb-32 text-lg font-extrabold leading-snug">{justOn ? note?.text : t("Premium is on.")}</p>
          {subscribed && !justOn && (
            <Button size="lg" full variant="secondary" className="mt-3" onClick={() => void manageSubscriptions()}>{t("Manage subscription")}</Button>
          )}
        </div>
      ) : products === "loading" ? (
        <p role="status" className="rounded-[1.25rem] bg-soft p-4 text-base font-semibold">{t("Getting prices from the App Store…")}</p>
      ) : products === null ? (
        <ErrorBox message={t("Couldn't reach the App Store. Check your connection and try again.")} onRetry={retry} />
      ) : (
        <>
          {/* founder 2026-11-16 ("looks basic, make it look more interesting"): the plans as one choice and one big button, the price of each on the right */}
          <div role="radiogroup" aria-label={t("Choose a plan")} className="space-y-2.5">
            {products.map((p, i) => {
              const badge = BADGE[p.plan];
              const on = p.plan === selected?.plan;
              const per = perOf(p);
              const line = p.trialDays ? t("First {days} days free", { days: p.trialDays }) : t(TAGLINE[p.plan]);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setChosen(p.plan)}
                  onKeyDown={(e) => radioKeyNav(e, i, products.length, (n) => setChosen(products[n]!.plan))}
                  className={`@container flex min-h-[4.75rem] w-full items-center gap-3 rounded-[1.25rem] border-[1.5px] p-3.5 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card text-foreground hover:bg-background"}`}
                >
                  {/* the price on the right where the words fit beside it; at large text (the card narrower than 17rem of that text) under the plan's words, so
                      the name, the free days and the price never run into each other */}
                  <span className="flex w-full items-center gap-3">
                    <ChoiceMark on={on} kind="circle" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5 @[17rem]:flex-row @[17rem]:items-center @[17rem]:gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[1.0625rem] font-extrabold leading-snug">{p.name}</span>
                          {badge && <InkBadge star={false}>{t(badge)}</InkBadge>}
                        </span>
                        <span className={`mt-0.5 block text-[0.9375rem] leading-snug ${p.trialDays || on ? "font-semibold" : "text-muted"}`}>{line}</span>
                      </span>
                      <span className="app-numbers shrink-0 @[17rem]:text-end">
                        <span className="block text-[1.5rem] font-extrabold leading-none tracking-tight">{p.price}</span>
                        <span className={`mt-1 block text-[0.8125rem] ${on ? "" : "text-muted"}`}>{per}</span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {selected && (
            <>
              {/* what Apple will charge for the chosen plan: the largest price text on the screen (StoreKit's own words, never typed), then the trial or renewal
                  line smaller beneath it, then the button */}
              <p className="app-numbers mt-5 text-center leading-tight">
                <span className="text-[2rem] font-extrabold tracking-tight">{selected.price}</span>{" "}
                <span className="text-[1.0625rem] font-bold">{perOf(selected)}</span>
              </p>
              <p className="app-numbers mt-1 text-center text-[0.9375rem] leading-snug">
                {selected.trialDays ? t("First {days} days free, then {price} {per}. Renews until you cancel.", { days: selected.trialDays, price: selected.price, per: perOf(selected) }) : selected.period === "none" ? t("{price}, one payment. It doesn't renew.", { price: selected.price }) : t("{price} {per}. Renews until you cancel.", { price: selected.price, per: perOf(selected) })}
              </p>
              <Button size="lg" full className="mt-3.5 min-h-14 text-[1.0625rem]" busy={busy === selected.plan} busyLabel={t("Waiting for the App Store…")} disabled={busy === "restore"} onClick={() => void buy(selected.plan)}>
                {selected.trialDays ? t("Continue") : selected.period === "none" ? t("Buy for {price}", { price: selected.price }) : t("Subscribe for {price} {per}", { price: selected.price, per: perOf(selected) })}
              </Button>
            </>
          )}
        </>
      )}

      {/* the purchase's outcome, straight under Continue where the finger was (a success that switched Premium on is said in the box above instead) */}
      {note && !justOn && (FAILED.includes(note.key)
        ? <div ref={noteRef} className="mt-3 scroll-mb-32"><ErrorBanner heading={null}>{note.text}{note.key === RESTORE_NOTE.refused && <> <a className={LINK} href="/support">{t("Contact us")}</a></>}</ErrorBanner></div>
        : <p ref={noteRef} role="status" className="mt-3 scroll-mb-32 text-center text-base font-semibold">{note.text}</p>)}

      {afterContinue}

      {/* how the free week works for the chosen plan, below the prices (never above them) */}
      {!active && selected && <TrialStory trial={selected.trialDays ?? null} price={selected.price} per={perOf(selected)} />}

      {features && <div className="mt-6">{features}</div>}

      {/* an underlined link; while it checks it says so (and does nothing on a second tap) */}
      <button type="button" disabled={busy !== null && busy !== "restore"} aria-busy={busy === "restore" || undefined} onClick={() => { if (busy === null) void restore(); }} className="mx-auto mt-4 flex min-h-11 items-center px-3 text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px] disabled:cursor-not-allowed disabled:text-muted">
        {busy === "restore" ? t("Checking with the App Store…") : t("Restore purchases")}
      </button>

      <p className="mt-4 text-[0.9375rem] leading-snug text-muted">{renewalWords(listed, t).join(" ")}</p>
      {trial && (
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
          {/* Apple's free-trial terms (guideline 3.1.2): what happens when the trial ends must stay on this screen; the words pass of 20 Nov cut it, restored */}
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

/** A purchase or restore message can land under the floating tab bar (founder 2026-11-17: "after I pressed it, nothing happened"), so it is scrolled into view when it appears. */
function useShowNote(note: string | null) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!note) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  }, [note]);
  return ref;
}

/** Settings › Subscription in the In-App Purchase app: Restore purchases, and Apple's own Manage subscription screen while a subscription is running. */
export function AppStoreAccountButtons() {
  const t = useT();
  const paid = useStore(paidStore);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Exclude<RestoreResult, "cancelled"> | null>(null);
  const noteRef = useShowNote(note);
  const subscribed = paidActive(paid, now.getTime()) && (paid.plan === "annual" || paid.plan === "monthly");
  const restore = async () => {
    setBusy(true);
    setNote(null);
    const r = await restorePurchases();
    setBusy(false);
    if (r !== "cancelled") setNote(r);
  };
  return (
    <div className="mt-3 space-y-2.5">
      {subscribed && <Button size="lg" full variant="secondary" onClick={() => void manageSubscriptions()}>{t("Manage subscription")}</Button>}
      <Button size="lg" full variant="secondary" busy={busy} busyLabel={t("Checking with the App Store…")} onClick={() => void restore()}>{t("Restore purchases")}</Button>
      {note && (note === "failed" || note === "refused"
        ? <div ref={noteRef} className="scroll-mb-32"><ErrorBanner heading={null}>{t(RESTORE_NOTE[note])}{note === "refused" && <> <a className={LINK} href="/support">{t("Contact us")}</a></>}</ErrorBanner></div>
        : <p ref={noteRef} role="status" className="scroll-mb-32 text-base font-semibold">{t(RESTORE_NOTE[note])}</p>)}
    </div>
  );
}
