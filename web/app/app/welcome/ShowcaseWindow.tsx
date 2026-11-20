"use client";

// Relative imports (not "@/"), so the unit tests can draw it (tests/welcomeShowcase.test.ts).
import { useLayoutEffect, useRef } from "react";
import { tk } from "../../../lib/mm/i18n";
import { useT } from "../_lib/i18n";

// The place a welcome screen shows a real part of the app in: step 4's two recipes and Your plan's week. Since the seven-screen onboarding of 20 November 2026
// (founder: "no labels on previews") it has no caption, no Free tag and no line about charges: the recipes and the week speak for themselves.
// A minimum height while it loads, so the end of loading never pulls the screen up under the person's finger; it fades in over 200 ms (still under Reduce Motion); while its contents
// load it holds page-fill bars with no digits and no shimmer (CLAUDE.md rule 1: no figure is ever drawn that isn't real).

export type ShowcaseKind = "recipes" | "week";

/** Its name for a screen reader (a region). */
const REGION: Readonly<Record<ShowcaseKind, string>> = { recipes: tk("Recipes"), week: tk("Your week") };
const MIN_HEIGHT: Readonly<Record<ShowcaseKind, string>> = { recipes: "min-h-[15rem]", week: "min-h-[24rem]" };

/** Page-fill bars where the contents will be: no digits, no shimmer. `rows` of a name bar and a shorter figures bar. */
export function WindowSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-4 pt-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2">
          <span className="block h-4 w-3/4 rounded-md bg-background" />
          <span className="block h-3.5 w-1/2 rounded-md bg-background" />
        </div>
      ))}
    </div>
  );
}

/**
 * The window. `children` is its contents once ready (or the plain line when there is nothing to show); `loading` draws `skeleton` (or the bars) in their
 * place, with `status` as the line saying what is really happening (`quiet`: for a screen reader only).
 */
export function ShowcaseWindow({ kind, loading, status, quiet, rows, skeleton, children }: { kind: ShowcaseKind; loading?: boolean; status?: string; quiet?: boolean; rows?: number; skeleton?: React.ReactNode; children?: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    // the window fades in over 200 ms (nothing under Reduce Motion, or where the browser can't animate)
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, []);
  return (
    // the minimum height while loading only: what arrives is at least as tall, and a one-line answer (no week) leaves no empty space under it
    <section ref={ref} aria-label={t(REGION[kind])} className={`mt-6 ${loading ? MIN_HEIGHT[kind] : ""}`}>
      {loading ? (
        <>
          {status && <p role="status" className={quiet ? "sr-only" : "mb-3 text-[0.9375rem] leading-snug text-foreground"}>{status}</p>}
          {skeleton ?? <WindowSkeleton rows={rows} />}
        </>
      ) : (
        children
      )}
    </section>
  );
}
