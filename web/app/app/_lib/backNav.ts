"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent, type RefObject } from "react";
import { canGoBack, queryOf, stateFor, withQuery } from "@/lib/mm/navDepth";

export { backName } from "@/lib/mm/navDepth";

// The window half of "Back goes to the page before" (lib/mm/navDepth.ts has the reasoning). installBackDepth() wraps history.pushState/replaceState once so every
// history entry the app makes carries its depth in history.state; useBack(fallback) is what a Back button uses: the browser's own Back when this page was reached
// from another page of the app, the fixed `fallback` page otherwise (a page opened by address, a shared link, a fresh launch).

const FLAG = "__mmBackDepth";

/** How long a Back that was handed to the browser may take before it is judged to have done nothing (a popstate normally arrives within a few milliseconds). */
const BACK_TIMEOUT_MS = 600;
/** True while a Back the app started is still travelling. history.state only changes when the traversal finishes, so a second tap before then would read the same depth and go back twice. */
let backing = false;

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
 * Takes the browser's own Back when the page on screen was reached from another page of the app; returns false (and does nothing) when there is nothing earlier.
 * Only one Back travels at a time (a second tap before the first has landed would go back twice), and when the browser does not move at all (the oldest entry it
 * still keeps can carry a depth above 0 with nothing before it) the person goes to `fallback` instead of being left on a button that does nothing.
 */
export function travelBack(router: ReturnType<typeof useRouter>, fallback: string): boolean {
  if (!reachedFromApp()) return false;
  if (backing) return true; // a Back is already on its way: a second tap must not take a second step
  backing = true;
  const from = window.location.href;
  let timer = 0;
  const settle = () => {
    backing = false;
    window.removeEventListener("popstate", settle);
    window.clearTimeout(timer);
  };
  window.addEventListener("popstate", settle);
  // A push, not a replace, which would keep the stale depth on the fixed page.
  timer = window.setTimeout(() => {
    const stuck = backing && window.location.href === from;
    settle();
    if (stuck) router.push(fallback);
  }, BACK_TIMEOUT_MS);
  router.back();
  return true;
}

/**
 * Props for a Back link: `href` is the fixed page used when there is nothing earlier (it is also what "open in a new tab" and a screen reader's link list
 * use), `onClick` takes the browser's own Back instead when there is, and `cameFromApp` says which of the two a tap will do (so the spoken name can be plain
 * "Back" rather than a destination that may be wrong).
 */
export function useBack(fallback: string): { href: string; onClick: (e: MouseEvent<HTMLElement>) => void; cameFromApp: boolean } {
  const router = useRouter();
  const [cameFromApp, setCame] = useState(false);
  // read after every render: the entry changes with each navigation, and the answer must come from the browser, not from the first render
  useEffect(() => { setCame(reachedFromApp()); }); // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- the browser is read after every render; setting the same value bails out, so there is no loop
  const onClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab / window: leave it to the link
      if (!reachedFromApp()) return; // nothing earlier: the link goes to `fallback`
      e.preventDefault();
      travelBack(router, fallback);
    },
    [router, fallback],
  );
  return { href: fallback, onClick, cameFromApp };
}

/**
 * The words in a page's search box, kept in the history entry: opening a result and coming Back finds the search as it was left (the page is built again
 * from nothing on the way back, so React state alone would show an empty box). A fresh visit starts empty. Written when the words change, never when the page
 * goes away (by then history.state may already belong to the next entry). Pass the input's ref when it grabs the focus on its own (autoFocus), so a
 * restored search does not raise the keyboard again.
 */
export function useEntryQuery(inputRef?: RefObject<HTMLElement | null>): [string, (value: string) => void] {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const saved = queryOf(window.history.state);
    if (!saved) return;
    setQuery(saved); // eslint-disable-line react-hooks/set-state-in-effect -- the entry's words are only known in the browser, after the page opens
    inputRef?.current?.blur();
  }, [inputRef]);
  const change = useCallback((value: string) => {
    setQuery(value);
    try { window.history.replaceState(withQuery(window.history.state, value), ""); } catch { /* Safari allows about 100 of these every 30 seconds: the words are just not kept */ }
  }, []);
  return [query, change];
}
