"use client";

import { tk } from "@/lib/mm/i18n";
import type { QuickFilter } from "@/lib/mm/recipeSearch";
import { LeafIcon, SproutIcon, TodayIcon } from "../_components/icons";
import { ChoiceMark } from "../_components/ui";

/** The quick filters as tiles: Quick, No meat or fish, Vegan (the Recipes screen and Meal plan's Swap sheet). */
export const QUICK_FILTERS: ReadonlyArray<{ value: QuickFilter; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "quick", label: tk("Quick"), Icon: TodayIcon },
  { value: "meatFree", label: tk("No meat or fish"), Icon: LeafIcon },
  { value: "vegan", label: tk("Vegan"), Icon: SproutIcon },
];

/**
 * One of the Recipes screen's big tiles: an icon over a word. A meal or a filter is a choice (any number at once): white with the 1px line and an empty tick ring at its
 * corner, chosen lime with the 2 px dark-green edge (1px border plus a 1px ring, so nothing moves), a tick and dark-green words. "More" is not a choice: it opens
 * the Filters sheet, and is white like the rest (a lime More tile looked already chosen).
 */
export function FilterTile({ label, Icon, pressed, onClick, more }: { label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; pressed?: boolean; onClick: () => void; more?: boolean }) {
  const look = pressed ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_1px_var(--on-sun)]" : "border-line bg-card text-foreground shadow-[var(--card-shadow)] hover:bg-background";
  return (
    <button
      type="button"
      onClick={onClick}
      {...(more ? { "aria-haspopup": "dialog" as const } : { "aria-pressed": !!pressed })}
      className={`relative flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.25rem] border px-1.5 py-2.5 text-center transition active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${look}`}
    >
      {!more && <ChoiceMark on={!!pressed} className="absolute end-2 top-2" />}
      <Icon className={`h-6 w-6 ${pressed ? "" : "text-accent"}`} />
      <span className={`w-full text-sm leading-tight [hyphens:auto] [overflow-wrap:break-word] ${pressed ? "font-bold" : "font-semibold"}`}>{label}</span>
    </button>
  );
}
