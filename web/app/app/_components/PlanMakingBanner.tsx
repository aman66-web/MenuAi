"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { clearPlanMaking, planMakingStore, planMakingWatchedStore } from "../_lib/planMaking";
import { useNow, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { CalendarIcon, CloseIcon } from "./icons";

/** About how long Pip takes: the bar fills to here and waits (never full until he is back). */
const PIP_MS = 60_000;

/**
 * The plan Pip is making, at the top of every screen (founder 2026-11-21: "if they go into a different screen they can still see their plan progress is loading
 * at the top of the screen like a notification and will say when ready"): "Pip is making your plan" with a bar while he works, then "Your meal plan is ready"
 * with Open. Not over "Making your plan" itself; opening the week, or the close button, puts it away.
 */
export function PlanMakingBanner() {
  const t = useT();
  const pathname = usePathname();
  const making = useStore(planMakingStore);
  const watched = useStore(planMakingWatchedStore);
  const now = useNow(1000);
  const onPlan = /^\/app\/plan\/?$/.test(pathname);
  // ready and the week is on screen: seen
  useEffect(() => {
    if (making?.state === "ready" && onPlan && !watched) clearPlanMaking();
  }, [making?.state, onPlan, watched]);
  if (!making || watched || (making.state === "ready" && onPlan)) return null;
  const pip = making.state === "pip";
  const share = pip ? Math.min(0.92, Math.max(0.08, (now.getTime() - making.started) / PIP_MS)) : 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div role="status" aria-live="polite" className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[1.25rem] border border-line bg-card shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-3 px-3.5 py-2.5">
          {pip ? (
            <span aria-hidden className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />
          ) : (
            <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sun text-on-sun"><CalendarIcon className="h-4 w-4" /></span>
          )}
          <p className="min-w-0 flex-1 text-[0.9375rem] font-bold leading-snug">{pip ? t("Pip is making your plan…") : t("Your meal plan is ready")}</p>
          <Link href="/app/plan" onClick={() => { if (!pip) clearPlanMaking(); }} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-ink px-4 text-[0.9375rem] font-bold text-on-ink transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {pip ? t("See it") : t("Open")}
          </Link>
          {!pip && (
            <button type="button" onClick={clearPlanMaking} aria-label={t("Close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {pip && (
          <div aria-hidden className="h-1.5 bg-line">
            <span className="block h-full bg-bar transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
