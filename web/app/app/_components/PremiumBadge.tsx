"use client";

import type { ReactNode } from "react";
import { GATING_ENABLED } from "@/lib/mm/config";
import { useIsPro } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { StarIcon } from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/**
 * A small square-cornered ink tag with lime words (12.72:1) and a small star: the Premium badge's look, also "Best value" on the plans (colour meeting,
 * 19 November 2026). 6 px corners and no shadow, text height, so it never reads as a button. On an ink surface (`onInk`) it has no fill, only a thin light
 * edge (10.26:1 against ink), with the same lime words.
 */
export function InkBadge({ children, onInk, star = true, className }: { children: ReactNode; onInk?: boolean; star?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[0.375rem] px-1.5 py-0.5 text-[0.8125rem] font-bold leading-snug text-sun", onInk ? "border border-on-ink-2" : "border border-transparent bg-ink", className)}>
      {star && <StarIcon filled aria-hidden className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}

/**
 * The one Premium badge (O3: "Premium" is the one name on screen). Shown only where free and paid are told apart (GATING_ENABLED) and the person isn't
 * Premium; at most one per feature card, never on rows, prices, the header or the tab bar. `always` shows it even so (the paywall's own plan list).
 */
export function PremiumBadge({ onInk, always, className }: { onInk?: boolean; always?: boolean; className?: string }) {
  const t = useT();
  const pro = useIsPro();
  if (!always && (!GATING_ENABLED || pro)) return null;
  return <InkBadge onInk={onInk} className={className}>{t("Premium")}</InkBadge>;
}
