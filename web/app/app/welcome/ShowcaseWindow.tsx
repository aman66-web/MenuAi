"use client";

// Relative imports (not "@/"), so the unit tests can draw it (tests/welcomeShowcase.test.ts).
import { useLayoutEffect, useRef } from "react";
import { GATING_ENABLED, PHOTO_RECIPES_ENABLED } from "../../../lib/mm/config";
import { tk } from "../../../lib/mm/i18n";
import { CalendarIcon, ForkIcon, PotIcon, StarIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";

// The "window" each feature screen of the welcome steps shows a real part of the app in (the onboarding redesign meeting of 20 November 2026, build list 4;
// approved by the founder): a full-size white card with the 1 px line and 20 px corners. Flat (no lift shadow) where nothing inside can be tapped (Eat out and the
// week); the recipe tiles keep their own lifted look, because tapping one chooses it. A caption row with the real tab's icon in a page-fill well says which part of
// the app it is ("A look at Eat out", "A look at Recipes", "A look at Meal plan, on Home"), so it teaches where each feature lives without a tour and says
// plainly that it is a preview. Where Premium is sold (GATING_ENABLED), the free ones carry a white "Free" tag and the week the ink "Premium" badge with
// "Nothing is charged during setup." straight under it; on the website, where nothing is sold, neither. A fixed minimum height, so a chip swap or the end of
// loading never moves the button under it; the window fades in over 200 ms (still under Reduce Motion); while its contents load it holds page-fill bars with no
// digits and no shimmer (CLAUDE.md rule 1: no figure is ever drawn that isn't real).

export type ShowcaseKind = "eatOut" | "recipes" | "week";

const CAPTION: Readonly<Record<ShowcaseKind, string>> = {
  eatOut: tk("A look at Eat out"),
  recipes: tk("A look at Recipes"),
  week: tk("A look at Meal plan, on Home"),
};
const ICON: Readonly<Record<ShowcaseKind, (p: React.SVGProps<SVGSVGElement>) => React.ReactNode>> = { eatOut: ForkIcon, recipes: PotIcon, week: CalendarIcon };
const MIN_HEIGHT: Readonly<Record<ShowcaseKind, string>> = { eatOut: "min-h-[12.5rem]", recipes: "min-h-[17rem]", week: "min-h-[16rem]" };

/** Which tags a window carries on this build: the "Free" tag on Eat out and Recipes, and the "Premium" badge on the week, only where Premium is sold. */
export function windowTags(kind: ShowcaseKind, gating: boolean = GATING_ENABLED): { free: boolean; premium: boolean } {
  return { free: gating && kind !== "week", premium: gating && kind === "week" };
}

/**
 * The week's "Also in Premium" line, only where Premium is sold: Meal plan and Cook with what you already have are on wherever it is, and Scan your food and
 * Make it at home share one switch (FOOD_SCAN_ENABLED is PHOTO_RECIPES_ENABLED). Scan your food is named, never demonstrated (CLAUDE.md rule 1).
 */
export function alsoInPremium(gating: boolean = GATING_ENABLED, photo: boolean = PHOTO_RECIPES_ENABLED): string | null {
  if (!gating) return null;
  return photo ? tk("Also in Premium: Scan your food, Make it at home, and Cook with what you already have.") : tk("Also in Premium: Cook with what you already have.");
}

/** The ink Premium badge's look (6 px corners, the word in lime, a small star; as _components/PremiumBadge.tsx draws it), always with its word. */
function PremiumTag() {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[0.375rem] border border-transparent bg-ink px-1.5 py-0.5 text-[0.8125rem] font-bold leading-snug text-sun">
      <StarIcon filled aria-hidden className="h-3 w-3 shrink-0" />
      {t("Premium")}
    </span>
  );
}

/** The white "Free" tag: its word, 6 px corners and the 1.5 px control edge (never colour alone). */
function FreeTag() {
  const t = useT();
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[0.375rem] border-[1.5px] border-edge bg-card px-1.5 py-0.5 text-[0.8125rem] font-bold leading-snug text-foreground">{t("Free")}</span>;
}

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
 * The window. `children` is its contents once ready (or the plain line when there is nothing to show); `loading` draws the skeleton in their place, with
 * `status` as the line saying what is really happening (`quiet`: for a screen reader only). `region` is the window's spoken name (its caption by default).
 */
export function ShowcaseWindow({ kind, loading, status, quiet, region, rows, children }: { kind: ShowcaseKind; loading?: boolean; status?: string; quiet?: boolean; region?: string; rows?: number; children?: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    // the window fades in over 200 ms (nothing under Reduce Motion, or where the browser can't animate)
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, []);
  const tags = windowTags(kind);
  const Icon = ICON[kind];
  return (
    <section ref={ref} aria-label={region ?? t(CAPTION[kind])} className={`mt-4 rounded-[1.25rem] border border-line bg-card p-4 ${MIN_HEIGHT[kind]}`}>
      <div className="flex min-h-9 items-center gap-2.5">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background text-accent"><Icon className="h-[1.125rem] w-[1.125rem]" /></span>
        <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug text-foreground">{t(CAPTION[kind])}</span>
        {tags.free && <FreeTag />}
        {tags.premium && <PremiumTag />}
      </div>
      {tags.premium && <p className="mt-2 text-[0.9375rem] font-semibold leading-snug text-foreground">{t("Nothing is charged during setup.")}</p>}
      <div className="mt-3">
        {loading ? (
          <>
            {status && <p role="status" className={quiet ? "sr-only" : "mb-3 text-[0.9375rem] leading-snug text-foreground"}>{status}</p>}
            <WindowSkeleton rows={rows} />
          </>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
