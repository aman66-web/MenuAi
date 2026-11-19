"use client";

import { useLanguage, useT } from "../_lib/i18n";
import { localeInfo } from "@/lib/mm/i18n";
import { CameraIcon, PlusIcon } from "./icons";

// Small pictures of what a feature gives you, so a card says what it does at a glance (founder 2026-11-19: "Make It At Home, you notice what it does straight
// away ... with the other icons ... it's hard to recognize what they do straight away"). Each shows the thing itself: the scanner's corners round a camera, the
// foods you'd type in, a week of days. They are decorative (aria-hidden): the card's own words say what it is.

/** A camera inside the scanner's lime corner marks on a dark square: "scan" everywhere it appears (Make it at home, Scan your food). */
export function ScanFrameIcon({ size = "md", onDark = false }: { size?: "sm" | "md"; /** On a dark card already (Make it at home): a lighter square. */ onDark?: boolean }) {
  const box = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  return (
    <span aria-hidden className={`relative grid ${box} shrink-0 place-items-center rounded-[0.875rem] ${onDark ? "bg-white/10" : "bg-[#1d2320]"} text-[var(--sun)]`}>
      <span className="absolute start-1 top-1 h-2.5 w-2.5 rounded-ss-md border-s-2 border-t-2 border-[var(--sun)]" />
      <span className="absolute end-1 top-1 h-2.5 w-2.5 rounded-se-md border-e-2 border-t-2 border-[var(--sun)]" />
      <span className="absolute bottom-1 start-1 h-2.5 w-2.5 rounded-es-md border-b-2 border-s-2 border-[var(--sun)]" />
      <span className="absolute bottom-1 end-1 h-2.5 w-2.5 rounded-ee-md border-b-2 border-e-2 border-[var(--sun)]" />
      <CameraIcon className={size === "sm" ? "h-5 w-5" : "h-6 w-6"} />
    </span>
  );
}

/** The foods you'd type in, as chips: "Cook with what you have". `large` (a card across the width): bigger chips and a third food where it fits. */
export function HaveChips({ large = false }: { large?: boolean }) {
  const t = useT();
  // on the cream Cook card (large): white chips with dark words; small: the lime chips
  const chip = `inline-flex items-center rounded-full font-bold leading-none ${large ? "min-h-8 bg-white px-3 text-[0.875rem] text-[#1d2320] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "min-h-6 bg-sun px-2 text-[0.75rem] text-[var(--on-accent)]"}`;
  const plus = large ? "h-8 w-8" : "h-6 w-6";
  return (
    // the "+" only where it fits on the same line (a narrow card at large text shows the two foods alone)
    <span aria-hidden className="@container block"><span className="flex flex-wrap items-center gap-1.5">
      <span className={chip}>{t("Eggs")}</span>
      <span className={chip}>{t("Onion")}</span>
      {large && <span className={`${chip} hidden @[14rem]:inline-flex`}>{t("Rice")}</span>}
      <span className={`hidden ${plus} items-center justify-center rounded-full border-2 border-dashed border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-muted @[8.75rem]:inline-flex`}><PlusIcon className="h-3.5 w-3.5" /></span>
    </span></span>
  );
}

/** A week of days, Monday first, each a small square with its letter: "Meal plan". `onTint` (on the pale green Meal plan card): white squares, taller. */
export function WeekStrip({ onTint = false }: { onTint?: boolean }) {
  const language = useLanguage();
  const f = new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "narrow" });
  // 3 to 9 November 2026 is a Monday to a Sunday: only the letters are used
  const days = Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 10, 2 + i, 12)));
  return (
    <span aria-hidden className="flex gap-1">
      {days.map((d, i) => (
        <span key={i} className={`grid min-w-0 flex-1 place-items-center rounded-[0.5rem] font-bold leading-none ${onTint ? "h-8 bg-white text-[0.875rem] text-[#1d2320] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "h-6 bg-sun text-[0.75rem] text-[var(--on-accent)]"}`}>{d}</span>
      ))}
    </span>
  );
}
