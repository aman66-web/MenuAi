"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { analytics } from "@/lib/mm/analytics";
import { DEV_TOOLS_ENABLED, IAP_ENABLED, PAID_ACCESS_ENABLED, PAYMENTS_ENABLED } from "@/lib/mm/config";
import { needsPaywall, PAYWALL_BULLETS, PAYWALL_TITLE, type PaywallTrigger } from "@/lib/mm/entitlements";
import { format, tk } from "@/lib/mm/i18n";
import { PAYWALL_REASON } from "@/lib/mm/premiumFeatures";
import { savedStore, settingsStore, updateSettings } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { useIsPro, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { AppStorePlans, PREMIUM_ON_NOTE } from "./AppStorePlans";
import { CheckIcon } from "./icons";
import { ProPlans } from "./ProPlans";
import { PremiumOffer } from "./PremiumOffer";
import { ErrorBanner } from "./Note";
import { Toast } from "./Toast";
import { Button, Sheet, inputClass } from "./ui";

// SPEC §9: the paywall appears only when a free user taps a Premium action. Closing returns to exactly where they were. "Premium" is the one name on screen
// (O3, 19 November 2026); the code keeps its old "Pro" names.
// The iPhone app (1.1, In-App Purchase), after the overnight audit of 20 November 2026: one plain line says why it opened (PAYWALL_REASON), then the plans, the
// billed amount and Continue, then what Premium adds (the one list, lib/mm/premiumFeatures.ts). Buying or restoring there closes the sheet, says "Premium is on.
// Thank you." once (a toast) and carries on with what was tapped (the action gate() was given).
// Payments aren't wired on the web yet (docs/WEB_BUILD_PLAN.md), so instead of a purchase button it says so honestly
// and offers the waitlist. Testers can unlock a preview when dev tools are enabled.

interface Gate {
  /** Run `action` if allowed, otherwise show the paywall for `trigger`. */
  gate: (trigger: PaywallTrigger, action: () => void) => void;
  showPaywall: (trigger: PaywallTrigger) => void;
}

const PaywallContext = createContext<Gate | null>(null);

// The exact title copy (PAYWALL_TITLE), built from two keys so a translation can put the phrase where its language needs it. Like
// every heading in the app it is one plain ink (2026-10-15), so the phrase is no longer coloured. If PAYWALL_TITLE changes and no
// longer matches, the title is shown plain rather than out of date.
const TITLE_RICH = tk("Build the {accent}, every time");
const TITLE_ACCENT = tk("perfect order");
const TITLE_FITS = format(TITLE_RICH, { accent: TITLE_ACCENT }) === PAYWALL_TITLE;

export function useGate(): Gate {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error("useGate must be used inside <PaywallProvider>");
  return ctx;
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const pro = useIsPro();
  const saved = useStore(savedStore);
  const [trigger, setTrigger] = useState<PaywallTrigger | null>(null);
  const triggerRef = useRef<PaywallTrigger | null>(null);
  /** What was tapped, kept while its paywall is open, so a purchase there carries on with it. */
  const pendingRef = useRef<(() => void) | null>(null);
  const [unlocked, setUnlocked] = useState(0);

  const showPaywall = useCallback((t: PaywallTrigger) => {
    analytics.track({ name: "paywallShown", trigger: t });
    triggerRef.current = t;
    pendingRef.current = null;
    setTrigger(t);
  }, []);

  const gate = useCallback(
    (t: PaywallTrigger, action: () => void) => {
      if (needsPaywall(t, { pro, savedCount: saved.length })) {
        showPaywall(t);
        pendingRef.current = action;
      } else action();
    },
    [pro, saved.length, showPaywall],
  );

  const close = useCallback(() => {
    const current = triggerRef.current;
    if (!current) return; // already closed (the dialog also fires onClose after we close it ourselves)
    triggerRef.current = null;
    pendingRef.current = null;
    analytics.track({ name: "paywallDismissed", trigger: current });
    updateSettings({ paywallDismissCount: settingsStore.get().paywallDismissCount + 1 });
    setTrigger(null);
  }, []);

  /** Premium switched on inside the sheet: close it (not a dismissal), say so once, then do what was tapped, once the page below is Premium. */
  const done = useCallback(() => {
    const action = pendingRef.current;
    triggerRef.current = null;
    pendingRef.current = null;
    setTrigger(null);
    if (action) window.setTimeout(action, 0);
  }, []);
  const unlockedHere = useCallback(() => {
    setUnlocked((n) => n + 1);
    done();
  }, [done]);

  const value = useMemo(() => ({ gate, showPaywall }), [gate, showPaywall]);
  return (
    <PaywallContext.Provider value={value}>
      {children}
      <Sheet open={trigger !== null} onClose={close} title={`${site.name} Premium`}>
        <PaywallBody trigger={trigger} onDone={done} onUnlocked={unlockedHere} />
      </Sheet>
      {unlocked > 0 && <Toast key={unlocked} onClose={() => setUnlocked(0)}>{t(PREMIUM_ON_NOTE)}</Toast>}
    </PaywallContext.Provider>
  );
}

function PaywallBody({ trigger, onDone, onUnlocked }: { trigger: PaywallTrigger | null; onDone: () => void; onUnlocked: () => void }) {
  const t = useT();
  const settings = useStore(settingsStore);
  const reason = trigger ? PAYWALL_REASON[trigger] : null;
  // This sheet lives outside AppShell's .app-surface (the provider wraps it), so the running weight is set here to match the rest of
  // the app (500). The Sheet turns every soft surface light grey, so the two cards below sit as grey blocks on its white panel.
  return (
    <div className="pb-1 font-medium">
      {IAP_ENABLED ? (
        // the iPhone app (1.1): why it opened, then the plans with the billed amount and Continue, then what Premium adds, then the free week's card when this
        // Apple ID can still have it (below the prices: the onboarding meeting of 20 November 2026), Restore and Apple's words
        <>
          {reason && <p className="mb-4 text-base font-semibold leading-snug">{t(reason.text, reason.values)}</p>}
          <AppStorePlans onUnlocked={onUnlocked} afterContinue={<div className="mt-6"><PremiumOffer /></div>} />
        </>
      ) : (
        <>
          {reason && PAID_ACCESS_ENABLED && <p className="mb-4 text-base font-semibold leading-snug">{t(reason.text, reason.values)}</p>}
          {PAID_ACCESS_ENABLED ? <PremiumOffer /> : (
            <>
              <h3 className="text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">
                {TITLE_FITS ? <Rich text={t(TITLE_RICH)} values={{ accent: <span>{t(TITLE_ACCENT)}</span> }} /> : t(PAYWALL_TITLE)}
              </h3>
              <ul className={`mt-5 divide-y divide-line ${card}`}>
                {PAYWALL_BULLETS.map((b) => (
                  <li key={b} className="flex items-center gap-3.5 px-4 py-3.5">
                    <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink"><CheckIcon className="h-4 w-4" strokeWidth={2.5} /></span>
                    <span className="text-base font-semibold leading-snug">{t(b)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {IAP_ENABLED ? null : PAID_ACCESS_ENABLED ? <div className="mt-5"><ProPlans /></div> : PAYMENTS_ENABLED ? null : (
        <div className={`mt-3.5 p-4 ${card}`}>
          <p className="text-lg font-[800] leading-snug tracking-[-0.01em]">{t("Premium isn't on the web yet.")}</p>
          <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("Everything free stays free: every chain's full menu with calories and macros. Leave your email and we'll tell you once, when Premium is ready.")}</p>
          <WaitlistInline />
        </div>
      )}

      {DEV_TOOLS_ENABLED && (
        <div className="mt-3.5 rounded-[1.25rem] border border-dashed border-line p-4">
          <p className="text-[0.9375rem] leading-snug text-muted">{t("Testing build: unlock Premium features on this device without paying.")}</p>
          <Button
            variant="secondary"
            full
            className="mt-3"
            onClick={() => {
              updateSettings({ devProOverride: !settings.devProOverride });
              onDone();
            }}
          >
            {settings.devProOverride ? t("Turn off Premium preview") : t("Unlock Premium preview (testing)")}
          </Button>
        </div>
      )}
      {/* the In-App Purchase plans already end with the Terms of Use (EULA), Terms and Privacy Policy links Apple requires: not twice */}
      {!IAP_ENABLED && (
        <p className="mt-2 text-center text-[0.9375rem] text-muted">
          <a className="inline-flex min-h-11 items-center px-1.5 text-accent underline underline-offset-[3px]" href="/privacy">{t("Privacy")}</a> · <a className="inline-flex min-h-11 items-center px-1.5 text-accent underline underline-offset-[3px]" href="/terms">{t("Terms")}</a>
        </p>
      )}
    </div>
  );
}

/** A card on the sheet: bg-soft, which the Sheet makes the light grey fill (.glass would add a border and blur here, outside .app-surface). */
const card = "rounded-[1.25rem] bg-soft";
/** A visible label over the field, in the body's ink (sentence case, never spaced capitals). */
const labelClass = "mb-2 block text-[0.9375rem] font-semibold leading-snug";

function WaitlistInline() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        try {
          const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "web-app-pro" }) });
          setState(res.ok ? "done" : "error");
        } catch {
          setState("error");
        }
      }}
    >
      {state === "done" ? (
        <p role="status" className="flex items-center gap-3 text-base font-semibold">
          <CheckIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" strokeWidth={2.6} />
          {t("Thanks, you're on the list.")}
        </p>
      ) : (
        <>
          <label className="block">
            <span className={labelClass}>{t("Email")}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
          </label>
          <Button type="submit" full className="min-h-13" busy={state === "sending"} busyLabel={t("Sending…")}>{t("Tell me when Premium is ready")}</Button>
          {state === "error" && <ErrorBanner heading={null}>{t("Couldn't send that. Check the address and try again.")}</ErrorBanner>}
        </>
      )}
    </form>
  );
}
