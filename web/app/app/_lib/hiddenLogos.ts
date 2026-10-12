"use client";

import { APP_BUILD, REMOTE_BASE } from "@/lib/mm/config";
import { sanitizeHiddenLogos } from "@/lib/mm/logos";
import { hiddenLogosStore } from "@/lib/mm/stores";
import { useStore } from "./hooks";

// The taken-down logos list (public/logos/hidden.json; lib/mm/logos.ts). Read once per launch: the website reads its own copy; the iPhone
// app asks the live website first (so a logo can come down without an app update) and falls back to the copy packed inside it. Offline,
// the device keeps the last list it read.

let started = false;

export function refreshHiddenLogos(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const live = APP_BUILD && REMOTE_BASE ? `${REMOTE_BASE}/logos/hidden.json` : null;
  void (async () => {
    for (const url of live ? [live, "/logos/hidden.json"] : ["/logos/hidden.json"]) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const ids = sanitizeHiddenLogos(await res.json());
        // the copy packed in the app may be older than the live list, so it only adds to what the device already knows
        if (live && url !== live) hiddenLogosStore.update((current) => [...new Set([...current, ...ids])]);
        else hiddenLogosStore.set(ids);
        return;
      } catch {
        /* offline or blocked: keep the last list */
      }
    }
  })();
}

/** Re-render when the list changes (logoFor/shopLogoFor read it). */
export function useHiddenLogos(): readonly string[] {
  return useStore(hiddenLogosStore);
}
