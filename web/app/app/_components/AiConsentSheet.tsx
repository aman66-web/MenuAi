"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AI_CONSENT_TEXT, AI_MESSAGES, aiAllowed, aiConsentStore, withAiAllowed, type AiFeature } from "@/lib/mm/aiConsent";
import { useT } from "../_lib/i18n";
import { InfoBanner } from "./Note";
import { Button, Sheet } from "./ui";

// The permission sheet before Pip's AI sees anything (lib/mm/aiConsent.ts has the rules; App Review 5.1.2(i)): Scan your food, Make it at home and Cook with
// what you have each ask once, before their first request, saying that Pip uses AI from Anthropic and exactly what that feature sends. "Allow" goes on with
// what the person was doing; "Not now" (or closing the sheet) sends nothing and leaves them where they were. Also the one offline line the three share.

/** Whether the browser says it is online (true on the server and until it says otherwise). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** "You're offline. Pip needs a connection to work this out." at the top of a feature while the phone is offline. */
export function OfflineBanner({ className }: { className?: string }) {
  const t = useT();
  return <InfoBanner className={className} heading={null}>{t(AI_MESSAGES.offline)}</InfoBanner>;
}

// one sheet for all of Pip since 21 November evening (lib/mm/aiConsent.ts): `feature` and `shop` are kept for the callers, the words are the same everywhere
export function AiConsentSheet({ open, onAllow, onClose }: { open: boolean; feature?: AiFeature; shop?: string; onAllow: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Pip uses AI")}>
      <p className="text-base leading-snug text-foreground">{t(AI_CONSENT_TEXT)}</p>
      <div className="mt-5 grid gap-2.5">
        <Button full size="lg" onClick={onAllow}>{t("Allow")}</Button>
        <Button full size="lg" variant="secondary" onClick={onClose}>{t("Not now")}</Button>
      </div>
    </Sheet>
  );
}

/**
 * `ask(go)`: runs `go` at once when the person has allowed this feature, otherwise opens the sheet and runs it on "Allow" (in the same tap, so a photo picker it
 * opens still counts as the person's own action). Put `sheet` anywhere in the page.
 */
export function useAiConsent(feature: AiFeature, shop?: string): { ask: (go: () => void) => void; sheet: ReactNode } {
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const ask = (go: () => void) => {
    if (aiAllowed(aiConsentStore.get(), feature)) return go();
    pending.current = go;
    setOpen(true);
  };
  const allow = () => {
    aiConsentStore.update((list) => withAiAllowed(list, feature));
    const go = pending.current;
    pending.current = null;
    setOpen(false);
    go?.();
  };
  const close = () => {
    pending.current = null;
    setOpen(false);
  };
  return { ask, sheet: <AiConsentSheet open={open} feature={feature} shop={shop} onAllow={allow} onClose={close} /> };
}
