"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

// The Back bar of the privacy, terms and support pages inside the iPhone app. Those pages are separate documents (they are opened by an ordinary address,
// not by the app's own navigation), so the app's depth marker (app/app/_lib/backNav.ts) does not exist here. They are only reachable from inside the app,
// from Settings or from the welcome screen's "Terms · Privacy" line, so the entry before is always the page that opened them: Back returns to it. The link's
// own address (Settings) is used when there is no earlier entry, and by a new tab or window (modified clicks are left alone).
export function SiteBack() {
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.history.length <= 1) return;
    e.preventDefault();
    window.history.back();
  };
  return (
    <Link href="/app/settings" onClick={onClick} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-base font-bold text-accent">
      <span aria-hidden>←</span> Back
    </Link>
  );
}
