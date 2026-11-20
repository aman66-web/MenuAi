"use client";

import { useCommunityBadge } from "../_lib/community";
import { useT } from "../_lib/i18n";

// The small number on the Community tab: shopping lists friends sent that you haven't opened, plus friend requests waiting for an answer. It is drawn over the corner
// of the tab's icon (the tab's link gives it room), is hidden from screen readers as a figure and said in words instead ("3 new"), and is only there while
// someone is signed in and something is waiting. How it stays fresh is in _lib/community.ts (useCommunityBadge): no push, no open connection.
export function CommunityBadge() {
  const t = useT();
  const n = useCommunityBadge();
  if (n <= 0) return null;
  return (
    <>
      {/* white with an ink figure and an ink ring, on the ink tab bar (colour meeting, 19 November 2026: count badges are never red; colours from the tokens) */}
      <span aria-hidden className="app-numbers pointer-events-none absolute start-1/2 top-0.5 ms-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-card px-1 text-[0.6875rem] font-bold leading-none text-ink ring-2 ring-ink">{n > 9 ? "9+" : n}</span>
      <span className="sr-only">{t("{n} new", { n })}</span>
    </>
  );
}
