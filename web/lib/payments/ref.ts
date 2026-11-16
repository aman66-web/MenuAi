// The creator code (?ref=anna), kept IN MEMORY ONLY (founder 14 Nov 2026): nothing is written to session storage, local storage or a cookie, so no consent banner is needed.
// It survives moving around the app (the page is never reloaded when the person taps a link inside it) and is gone when the page is reloaded or closed. A creator's link
// should therefore point straight at the app, for example https://numbite.com/app?ref=anna, so the code is read on the page the person lands on.
// It is only ever sent with the person's own Checkout request (lib/payments/client.ts), where it is cleaned again (lib/payments/plans.ts cleanRef).

import { cleanRef } from "./plans";

let remembered: string | null = null;

/** Reads `ref` from an address's query string; a valid code replaces the one held, anything else leaves it as it was. */
export function captureRef(search: string): void {
  try {
    const ref = cleanRef(new URLSearchParams(search).get("ref"));
    if (ref) remembered = ref;
  } catch {
    // a query string that cannot be read: no creator credit, nothing else changes
  }
}

/**
 * Reads the code from the page's own address AND takes `?ref=` out of the address (the history entry is replaced, the path, other parameters, `#` part and history state stay).
 * Without this the code would be saved by things that remember addresses: the app's "tabs remember where you were" (session storage) and the browser's history, so "memory only" would not be true.
 */
export function captureRefFromLocation(): void {
  try {
    if (typeof window === "undefined") return;
    captureRef(window.location.search);
    const url = new URL(window.location.href);
    if (!url.searchParams.has("ref")) return;
    url.searchParams.delete("ref");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    // an address that cannot be read or replaced: the code (if any) is still held, nothing else changes
  }
}

export function currentRef(): string | null {
  return remembered;
}

/** For tests, and for when the person signs out or clears their data. */
export function forgetRef(): void {
  remembered = null;
}
