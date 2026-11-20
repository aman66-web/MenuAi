"use client";

import { radioKeyNav } from "../_components/ui";

// The Stats screen's three tabs along the top (founder 2026-11-20), as the row of words under the heading in the founder's example screen: the words from
// the left, all in one weight (so the row never shifts), the one shown in ink with a short ink bar under it, the others in the secondary grey; 48 px tall.
// A real tab list: the arrow keys move between them, and each one names the panel it shows.

export type StatsTab = "calories" | "macros" | "nutrients";
export const STATS_TABS: readonly StatsTab[] = ["calories", "macros", "nutrients"];

/** The tab an address asks for (`/app/stats?tab=macros`); anything else is Calories. */
export const parseStatsTab = (raw: string | null | undefined): StatsTab => (STATS_TABS as readonly string[]).includes(raw ?? "") ? (raw as StatsTab) : "calories";

export const tabId = (tab: StatsTab) => `stats-tab-${tab}`;
export const PANEL_ID = "stats-panel";

export function StatsTabs({ value, labels, onChange, label }: { value: StatsTab; labels: Record<StatsTab, string>; onChange: (tab: StatsTab) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-ms-3 flex flex-wrap">
      {STATS_TABS.map((tab, i) => {
        const on = tab === value;
        return (
          <button
            key={tab}
            id={tabId(tab)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={PANEL_ID}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(e) => radioKeyNav(e, i, STATS_TABS.length, (n) => onChange(STATS_TABS[n]!))}
            className={`relative flex min-h-12 min-w-11 items-center justify-center px-3 pb-1 text-[1.125rem] font-semibold leading-tight transition-colors ${on ? "text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {labels[tab]}
            <span aria-hidden className={`absolute inset-x-3 bottom-0.5 h-[3px] rounded-full ${on ? "bg-ink" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}
