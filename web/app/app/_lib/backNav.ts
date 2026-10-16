"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { canGoBack, stateFor } from "@/lib/mm/navDepth";

// The window half of "Back goes to the page before" (lib/mm/navDepth.ts has the reasoning). installBackDepth() wraps history.pushState/replaceState once so every
// history entry the app makes carries its depth in history.state; useBack(fallback) is what a Back button uses: the browser's own Back when this page was reached
// from another page of the app, the fixed `fallback` page otherwise (a page opened by address, a shared link, a fresh launch).

const FLAG = "__mmBackDepth";

/**
 * Call once in the app shell. Safe to call again (React runs effects twice in development). It is never undone: Next.js patches the same two functions
 * around ours and puts back what it found when it unmounts, so undoing ours as well would fight with that.
 */
export function installBackDepth(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    return push(stateFor("push", data, window.history.state), unused, url);
  };
  window.history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    return replace(stateFor("replace", data, window.history.state), unused, url);
  };
}

/** Whether the page on screen was reached from another page of the app (read from the browser when asked, so it is never stale). */
export const reachedFromApp = (): boolean => typeof window !== "undefined" && canGoBack(window.history.state);

/**
 * Props for a Back link: `href` is the fixed page used when there is nothing earlier (it is also what "open in a new tab" and a screen reader's link list
 * use), `onClick` takes the browser's own Back instead when there is, and `cameFromApp` says which of the two a tap will do (so the spoken name can be plain
 * "Back" rather than a destination that may be wrong).
 */
export function useBack(fallback: string): { href: string; onClick: (e: MouseEvent<HTMLElement>) => void; cameFromApp: boolean } {
  const router = useRouter();
  const [cameFromApp, setCame] = useState(false);
  // read after every render: the entry changes with each navigation, and the answer must come from the browser, not from the first render
  useEffect(() => { setCame(reachedFromApp()); });
  const onClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab / window: leave it to the link
      if (!reachedFromApp()) return; // nothing earlier: the link goes to `fallback`
      e.preventDefault();
      router.back();
    },
    [router],
  );
  return { href: fallback, onClick, cameFromApp };
}
