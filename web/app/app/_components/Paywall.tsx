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
import { Button, Sheet } from "./ui";

// SPEC §9: the paywall appears only when a free user taps a Pro action. Closing returns to exactly where they were.
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
  // This sheet lives outside AppShell's .app-surface (the provider wraps it), so the running weight is set here to match the rest of
  // the app (500). The Sheet turns every soft surface light grey, so the two cards below sit as grey blocks on its white panel.
  return (
    <div className="pb-1 font-medium">
      <h3 className="text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">
        {TITLE_FITS ? <Rich text={t(TITLE_RICH)} values={{ accent: <span>{t(TITLE_ACCENT)}</span> }} /> : t(PAYWALL_TITLE)}
      </h3>
      <ul className={`mt-5 divide-y divide-line ${card}`}>
        {PAYWALL_BULLETS.map((b) => (
          <li key={b} className="flex items-center gap-3.5 px-4 py-3.5">
            <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><CheckIcon className="h-4 w-4" strokeWidth={2.5} /></span>
            <span className="text-base font-semibold leading-snug">{t(b)}</span>
          </li>
        ))}
      </ul>

      {PAYMENTS_ENABLED ? null : (
        <div className={`mt-3.5 p-4 ${card}`}>
          <p className="text-lg font-[800] leading-snug tracking-[-0.01em]">{t("Pro isn't on the web yet.")}</p>
          <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("Everything free stays free: every chain's full menu with calories and macros. Leave your email and we'll tell you once, when Pro is ready.")}</p>
          <WaitlistInline />
        </div>
      )}

      {DEV_TOOLS_ENABLED && (
        <div className="mt-3.5 rounded-[1.25rem] border border-dashed border-line p-4">
          <p className="text-sm leading-snug text-muted">{t("Testing build: unlock Pro features on this device without paying.")}</p>
          <Button
            variant="secondary"
            full
            className="mt-3"
            onClick={() => {
              updateSettings({ devProOverride: !settings.devProOverride });
              onDone();
            }}
          >
            {settings.devProOverride ? t("Turn off Pro preview") : t("Unlock Pro preview (testing)")}
          </Button>
        </div>
      )}
      <p className="mt-2 text-center text-sm text-muted">
        <a className="inline-flex min-h-11 items-center px-1.5 underline" href="/privacy">{t("Privacy")}</a> · <a className="inline-flex min-h-11 items-center px-1.5 underline" href="/terms">{t("Terms")}</a>
      </p>
    </div>
  );
}

/** A card on the sheet: bg-soft, which the Sheet makes the light grey fill (.glass would add a border and blur here, outside .app-surface). */
const card = "rounded-[1.25rem] bg-soft";
const labelClass = "mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";
/** Inside the grey card the field is white, so it is plainly a place to type. */
const fieldClass =
  "min-h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

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
          <span aria-hidden className="bg-sun inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-accent"><CheckIcon className="h-4 w-4" strokeWidth={2.5} /></span>
          {t("Thanks, you're on the list.")}
        </p>
      ) : (
        <>
          <label className="block">
            <span className={labelClass}>{t("Email")}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="you@example.com" />
          </label>
          <Button type="submit" full className="min-h-13" disabled={state === "sending"}>{state === "sending" ? t("Sending…") : t("Tell me when Pro is ready")}</Button>
          {state === "error" && <p role="alert" className="text-[0.9375rem] leading-snug text-muted">{t("Couldn't send that. Check the address and try again.")}</p>}
        </>
      )}
    </form>
  );
}
