"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { analytics } from "@/lib/mm/analytics";
import { DEV_TOOLS_ENABLED, PAYMENTS_ENABLED } from "@/lib/mm/config";
import { needsPaywall, PAYWALL_BULLETS, PAYWALL_TITLE, type PaywallTrigger } from "@/lib/mm/entitlements";
import { format, tk } from "@/lib/mm/i18n";
import { savedStore, settingsStore, updateSettings } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { useIsPro, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { CheckIcon } from "./icons";
import { Button, Field, inputClass, Sheet } from "./ui";

// SPEC §9: the paywall appears only when a free user taps a Pro action. Closing returns to exactly where they were.
// Payments aren't wired on the web yet (docs/WEB_BUILD_PLAN.md), so instead of a purchase button it says so honestly
// and offers the waitlist. Testers can unlock a preview when dev tools are enabled.

interface Gate {
  /** Run `action` if allowed, otherwise show the paywall for `trigger`. */
  gate: (trigger: PaywallTrigger, action: () => void) => void;
  showPaywall: (trigger: PaywallTrigger) => void;
}

const PaywallContext = createContext<Gate | null>(null);

// The exact title copy (PAYWALL_TITLE) with one phrase set in the accent face: {accent} lets a translation put the phrase where its
// language needs it. If PAYWALL_TITLE changes and no longer matches, the title is shown plain rather than out of date.
const TITLE_RICH = tk("Build the {accent}, every time");
const TITLE_ACCENT = tk("perfect order");
const TITLE_FITS = format(TITLE_RICH, { accent: TITLE_ACCENT }) === PAYWALL_TITLE;

export function useGate(): Gate {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error("useGate must be used inside <PaywallProvider>");
  return ctx;
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const pro = useIsPro();
  const saved = useStore(savedStore);
  const [trigger, setTrigger] = useState<PaywallTrigger | null>(null);
  const triggerRef = useRef<PaywallTrigger | null>(null);

  const showPaywall = useCallback((t: PaywallTrigger) => {
    analytics.track({ name: "paywallShown", trigger: t });
    triggerRef.current = t;
    setTrigger(t);
  }, []);

  const gate = useCallback(
    (t: PaywallTrigger, action: () => void) => {
      if (needsPaywall(t, { pro, savedCount: saved.length })) showPaywall(t);
      else action();
    },
    [pro, saved.length, showPaywall],
  );

  const close = useCallback(() => {
    const current = triggerRef.current;
    if (!current) return; // already closed (the dialog also fires onClose after we close it ourselves)
    triggerRef.current = null;
    analytics.track({ name: "paywallDismissed", trigger: current });
    updateSettings({ paywallDismissCount: settingsStore.get().paywallDismissCount + 1 });
    setTrigger(null);
  }, []);

  const value = useMemo(() => ({ gate, showPaywall }), [gate, showPaywall]);
  return (
    <PaywallContext.Provider value={value}>
      {children}
      <Sheet open={trigger !== null} onClose={close} title={`${site.name} Pro`}>
        <PaywallBody onDone={() => { triggerRef.current = null; setTrigger(null); }} />
      </Sheet>
    </PaywallContext.Provider>
  );
}

function PaywallBody({ onDone }: { onDone: () => void }) {
  const t = useT();
  const settings = useStore(settingsStore);
  return (
    <div>
      <h3 className="mt-3 text-3xl font-extrabold leading-[1.08] tracking-tight">
        {TITLE_FITS ? <Rich text={t(TITLE_RICH)} values={{ accent: <span className="serif-em sun-text">{t(TITLE_ACCENT)}</span> }} /> : t(PAYWALL_TITLE)}
      </h3>
      <ul className="mt-5 space-y-3">
        {PAYWALL_BULLETS.map((b) => (
          <li key={b} className="flex items-start gap-3">
            <span aria-hidden className="bg-sun mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-on-accent"><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /></span>
            <span className="font-medium">{t(b)}</span>
          </li>
        ))}
      </ul>

      {PAYMENTS_ENABLED ? null : (
        <div className="mt-5 glass rounded-3xl p-4">
          <p className="font-semibold">{t("Pro isn't on the web yet.")}</p>
          <p className="mt-1 text-sm text-muted">{t("Everything free stays free: every chain's full menu with calories and macros. Leave your email and we'll tell you once, when Pro is ready.")}</p>
          <WaitlistInline />
        </div>
      )}

      {DEV_TOOLS_ENABLED && (
        <div className="mt-4 rounded-3xl border border-dashed border-line p-3">
          <p className="text-xs text-muted">{t("Testing build: unlock Pro features on this device without paying.")}</p>
          <Button
            variant="secondary"
            full
            className="mt-2"
            onClick={() => {
              updateSettings({ devProOverride: !settings.devProOverride });
              onDone();
            }}
          >
            {settings.devProOverride ? t("Turn off Pro preview") : t("Unlock Pro preview (testing)")}
          </Button>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted">
        <a className="underline" href="/privacy">{t("Privacy")}</a> · <a className="underline" href="/terms">{t("Terms")}</a>
      </p>
    </div>
  );
}

function WaitlistInline() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  return (
    <form
      className="mt-3 space-y-2"
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
        <p role="status" className="text-sm font-medium">{t("Thanks, you're on the list.")}</p>
      ) : (
        <>
          <Field label={t("Email")}>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
          </Field>
          <Button type="submit" full disabled={state === "sending"}>{state === "sending" ? t("Sending…") : t("Tell me when Pro is ready")}</Button>
          {state === "error" && <p role="alert" className="text-sm text-muted">{t("Couldn't send that. Check the address and try again.")}</p>}
        </>
      )}
    </form>
  );
}
