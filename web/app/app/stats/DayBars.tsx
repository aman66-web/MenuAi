"use client";

import { shortDate } from "@/lib/mm/day";
import type { StatsDayState } from "@/lib/mm/stats";
import { useT } from "../_lib/i18n";

// A bar a day, or a bar a week (the Stats screen, founder 2026-11-20), drawn like the founder's example screen: a rounded grey track for each day with the
// day's figure filling it from the bottom, the day letters under it. Drawn only: a screen reader gets the list under it, one line a day. A day with nothing
// logged (or, on Macros and Nutrients, no food that gave the figure) is its empty track, never a bar of 0 (CLAUDE.md rule 1); a day still to come is a faint
// track. One flat colour for every bar, never a colour for "over" (rule 3): the target is a dashed line across the tracks. Seven days read Monday to Sunday,
// today in lime with its dark green edge as on Home; four weeks read by each week's Monday, this week in lime ("This week").

export interface Bar {
  key: string;
  /** The day, or the week's Monday. */
  date: Date;
  state: StatsDayState;
  /** The day's figure, or null when there is none to show. */
  value: number | null;
}

const TODAY = "rounded-full border-[1.5px] border-on-sun bg-sun px-1.5 py-px font-bold text-on-sun";

export function DayBars({ bars, top, target, color, weeks = false, spoken, listLabel, htmlLang }: {
  bars: readonly Bar[];
  /** The top of the scale. */
  top: number;
  /** The dashed target line. */
  target?: number;
  /** The bars' fill (bg-ink, bg-protein, bg-carbs, bg-fat). */
  color: string;
  /** A bar a week (Monday dates under them) rather than a bar a day. */
  weeks?: boolean;
  /** What a screen reader hears for a day (or week): `name` is the day's long name, or the week's Monday. */
  spoken: (bar: Bar, name: string) => string;
  listLabel: string;
  htmlLang: string;
}) {
  const t = useT();
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / top) * 100))}%`;
  const narrow = new Intl.DateTimeFormat(htmlLang, { weekday: "narrow" });
  const longDay = new Intl.DateTimeFormat(htmlLang, weeks ? { day: "numeric", month: "long" } : { weekday: "long", day: "numeric", month: "long" });
  const cols = { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` };
  // a figure always shows at least a round end, so a small one never looks like an empty day
  const least = weeks ? "1rem" : "0.875rem";
  return (
    <div>
      <div aria-hidden>
        <div className="relative grid h-28" style={cols}>
          {bars.map((b) => (
            <div key={b.key} className="flex justify-center">
              <div className={`relative h-full overflow-hidden rounded-full bg-soft-strong ${weeks ? "w-4" : "w-3.5"} ${b.state === "future" ? "opacity-40" : ""}`}>
                {b.value !== null && <div className={`absolute inset-x-0 bottom-0 rounded-full ${color}`} style={{ height: `max(${least}, ${pct(b.value)})` }} />}
              </div>
            </div>
          ))}
          {target !== undefined && target > 0 && <div className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-edge" style={{ bottom: pct(target) }} />}
        </div>
        <div className="mt-2 grid text-center text-[0.875rem] font-semibold leading-none" style={cols}>
          {bars.map((b) => (
            <span key={b.key} className="flex min-w-0 justify-center">
              {weeks ? (
                <span className={`app-numbers whitespace-nowrap ${b.state === "today" ? TODAY : "py-0.5"}`}>{b.state === "today" ? t("This week") : shortDate(b.date, htmlLang)}</span>
              ) : (
                <span className={b.state === "today" ? TODAY : b.state === "future" ? "py-0.5 text-muted" : "py-0.5"}>{narrow.format(b.date)}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <ol className="sr-only" aria-label={listLabel}>
        {bars.filter((b) => b.state !== "future").map((b) => <li key={b.key}>{spoken(b, longDay.format(b.date))}</li>)}
      </ol>
    </div>
  );
}

/** The key under a chart: the dashed target line. */
export function TargetKey({ children }: { children: React.ReactNode }) {
  return (
    <p className="app-numbers flex items-center gap-1.5">
      <span aria-hidden className="inline-block w-4 shrink-0 border-t-[1.5px] border-dashed border-edge" />
      {children}
    </p>
  );
}
