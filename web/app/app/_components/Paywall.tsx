"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { analytics } from "@/lib/mm/analytics";
import { DEV_TOOLS_ENABLED, PAYMENTS_ENABLED } from "@/lib/mm/config";
import { needsPaywall, PAYWALL_BULLETS, PAYWALL_TITLE, type PaywallTrigger } from "@/lib/mm/entitlements";
import { savedStore, settingsStore, updateSettings } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { useIsPro, useStore } from "../_lib/hooks";
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

export function useGate(): Gate {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error("useGate must be used inside <PaywallProvider>");
  return ctx;
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const pro = useIsPro();
  const saved = useStore(savedStore);
  const [trigger, setTrigger] = useState<PaywallTrigger | null>(null);

  const showPaywall = useCallback((t: PaywallTrigger) => {
    analytics.track({ name: "paywallShown", trigger: t });
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
    setTrigger((current) => {
      if (current) {
        analytics.track({ name: "paywallDismissed", trigger: current });
        updateSettings({ paywallDismissCount: settingsStore.get().paywallDismissCount + 1 });
      }
      return null;
    });
  }, []);

  const value = useMemo(() => ({ gate, showPaywall }), [gate, showPaywall]);
  return (
    <PaywallContext.Provider value={value}>
      {children}
      <Sheet open={trigger !== null} onClose={close} title={`${site.name} Pro`}>
        <PaywallBody onDone={() => setTrigger(null)} />
      </Sheet>
    </PaywallContext.Provider>
  );
}

function PaywallBody({ onDone }: { onDone: () => void }) {
  const settings = useStore(settingsStore);
  return (
    <div>
      <h3 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{PAYWALL_TITLE}</h3>
      <ul className="mt-4 space-y-2">
        {PAYWALL_BULLETS.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {PAYMENTS_ENABLED ? null : (
        <div className="mt-5 rounded-xl border border-line bg-soft p-4">
          <p className="font-semibold">Pro isn&apos;t on the web yet.</p>
          <p className="mt-1 text-sm text-muted">Everything free stays free: every chain&apos;s full menu with calories and macros. Leave your email and we&apos;ll tell you once, when Pro is ready.</p>
          <WaitlistInline />
        </div>
      )}

      {DEV_TOOLS_ENABLED && (
        <div className="mt-4 rounded-xl border border-dashed border-line p-3">
          <p className="text-xs text-muted">Testing build: unlock Pro features on this device without paying.</p>
          <Button
            variant="secondary"
            full
            className="mt-2"
            onClick={() => {
              updateSettings({ devProOverride: !settings.devProOverride });
              onDone();
            }}
          >
            {settings.devProOverride ? "Turn off Pro preview" : "Unlock Pro preview (testing)"}
          </Button>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted">
        <a className="underline" href="/privacy">Privacy</a> · <a className="underline" href="/terms">Terms</a>
      </p>
    </div>
  );
}

function WaitlistInline() {
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
        <p role="status" className="text-sm font-medium">Thanks, you&apos;re on the list.</p>
      ) : (
        <>
          <Field label="Email">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
          </Field>
          <Button type="submit" full disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Tell me when Pro is ready"}</Button>
          {state === "error" && <p role="alert" className="text-sm text-muted">Couldn&apos;t send that. Check the address and try again.</p>}
        </>
      )}
    </form>
  );
}
