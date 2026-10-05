"use client";

import { useEffect, useRef, useState } from "react";
import { loggedToday, isSameLocalDay } from "@/lib/mm/budget";
import { PAYMENTS_ENABLED } from "@/lib/mm/config";
import { formatCalories, formatGrams, formatInt } from "@/lib/mm/format";
import { deleteLogEntry, logStore, restoreLogEntry } from "@/lib/mm/stores";
import type { LogEntry } from "@/lib/mm/user-data";
import { useGate } from "../_components/Paywall";
import { TrashIcon } from "../_components/icons";
import { Button, Card, EmptyState } from "../_components/ui";
import { useHydrated, useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

// SPEC §7.8. Free: explainer + the paywall. Pro: totals against targets and today's entries.
export default function TodayPage() {
  const hydrated = useHydrated();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const settings = useSettings();
  const log = useStore(logStore);
  const now = useNow();
  const [undo, setUndo] = useState<LogEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!hydrated) return null;

  if (!pro) {
    return (
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Today</h1>
        <Card className="mt-6 p-5">
          <p className="font-semibold">Keep track of what you eat today</p>
          <p className="mt-1 text-sm text-muted">Log a meal from any order and see your calories and protein against your targets, so you always know what&apos;s left.</p>
          <Button className="mt-4" onClick={() => showPaywall("log")}>{PAYMENTS_ENABLED ? "Try Pro free" : "See Pro"}</Button>
        </Card>
      </div>
    );
  }

  const totals = loggedToday(log, now);
  const todays = log.filter((e) => isSameLocalDay(new Date(e.loggedAt), now)).sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
  const calFraction = Math.min(1, totals.calories / settings.dailyCalories);
  const proteinFraction = settings.dailyProtein ? Math.min(1, totals.protein / settings.dailyProtein) : 0;

  function remove(entry: LogEntry) {
    deleteLogEntry(entry.id);
    setUndo(entry);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 6000);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Today</h1>
      <Card className="app-numbers mt-4 space-y-4 p-4">
        <div>
          <p className="text-base"><span className="text-3xl font-bold">{formatInt(totals.calories)}</span> / {formatCalories(settings.dailyCalories)}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Calories" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(calFraction * 100)}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${calFraction * 100}%` }} />
          </div>
        </div>
        {settings.dailyProtein ? (
          <div>
            <p className="text-base"><span className="text-3xl font-bold">{formatGrams(totals.protein)}</span> / {formatGrams(settings.dailyProtein)} protein</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Protein" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(proteinFraction * 100)}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${proteinFraction * 100}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-base"><span className="text-3xl font-bold">{formatGrams(totals.protein)}</span> protein</p>
        )}
        <p className="text-sm text-muted">{formatGrams(totals.carbs)} carbs · {formatGrams(totals.fat)} fat</p>
      </Card>

      {todays.length === 0 ? (
        <div className="mt-6"><EmptyState title="Nothing logged yet today" body="Open an item or build an order, then tap Log." /></div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {todays.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-muted">{timeFormat.format(new Date(e.loggedAt))} · {e.chainName}</p>
                <p className="font-semibold leading-snug">{e.name}</p>
                <p className="app-numbers text-sm text-muted" aria-label={`${Math.round(e.nutrients.calories)} calories, ${Math.round(e.nutrients.protein)} grams protein`}>{formatCalories(e.nutrients.calories)} · {formatGrams(e.nutrients.protein)} protein</p>
              </div>
              <button type="button" aria-label={`Delete ${e.name}`} onClick={() => remove(e)} className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft">
                <TrashIcon className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-background px-4 py-2 shadow-lg">
          <span className="text-sm">Deleted “{undo.name}”.</span>
          <button type="button" className="min-h-11 px-2 font-semibold text-accent" onClick={() => { restoreLogEntry(undo); setUndo(null); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
