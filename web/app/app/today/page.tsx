"use client";

import { useEffect, useRef, useState } from "react";
import { entryMeal, loggedGaps, loggedToday, isSameLocalDay, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { PAYMENTS_ENABLED } from "@/lib/mm/config";
import { formatCalories, formatGrams, formatInt } from "@/lib/mm/format";
import { macroTargets } from "@/lib/mm/targets";
import { itemImageUrl } from "@/lib/mm/images";
import { deleteLogEntry, logStore, restoreLogEntry } from "@/lib/mm/stores";
import type { LogEntry } from "@/lib/mm/user-data";
import type { Meal } from "@/lib/mm/types";
import { useGate } from "../_components/Paywall";
import Link from "next/link";
import { ChevronLeftIcon, ForkIcon, TrashIcon } from "../_components/icons";
import { Gauge } from "../_components/Gauge";
import { Pip } from "../_components/Mascot";
import { Ring } from "../_components/Ring";
import { Button, Card, EmptyState } from "../_components/ui";
import { useChainIndexes, useHydrated, useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

// SPEC §7.8, reached from Home's "today" card. Free: explainer + the paywall. Pro: totals against targets and today's entries.
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): one summary card in Home's voice (Home's calories dial,
// the figures in a regular weight with the eaten one in the accent, then Home's protein, carbs and fat rows with their targets and thin
// bars, so the same day reads the same on both screens), then what was eaten under Breakfast, Lunch and Dinner (SPEC §6.3 mealSlotFor,
// or the row an entry was added to from Home's +, as on Home: budget.ts entryMeal), each entry with the chain's own photo of the dish where we have one.

/** Home's macro row (app/app/page.tsx): "PROTEIN   144g / 150g" in small spaced capitals and DM Mono, the same grey, and a thin bar below. */
function MacroRow({ label, eaten, target }: { label: string; eaten: number; target?: number }) {
  const fraction = target ? Math.min(1, Math.max(0, eaten / target)) : 0;
  return (
    <div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-1.5 gap-y-0.5 text-muted">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">{label}</span>
        <span className="app-numbers whitespace-nowrap font-mono text-[0.6875rem] font-normal">{formatGrams(eaten)}{target ? ` / ${formatGrams(target)}` : null}</span>
      </p>
      {target ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--ring-track)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
          <div className="h-full rounded-full bg-[var(--bar)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${fraction * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}
export default function TodayPage() {
  const hydrated = useHydrated();
  const t = useT();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const settings = useSettings();
  const log = useStore(logStore);
  const now = useNow();
  const [undo, setUndo] = useState<LogEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const todays = log.filter((e) => isSameLocalDay(new Date(e.loggedAt), now)).sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
  const indexes = useChainIndexes(pro ? todays.filter((e) => e.source === "item").map((e) => e.chainId) : []);

  if (!hydrated) return null;

  if (!pro) {
    return (
      <div>
        <BackHome />
        <h1 className="mt-5 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Today's meals")}</h1>
        <Card className="mt-5 overflow-hidden p-5">
          {/* A picture of the Pro screen (no numbers: nothing here is a real figure). */}
          <div aria-hidden className="mb-5 flex items-center gap-5">
            <Ring id="today-preview" label="" fraction={0.68} size={92} stroke={10} />
            <div className="flex-1 space-y-4">
              <div className="h-1.5 w-4/5 rounded-full bg-[var(--ring-track)]"><div className="h-full w-3/5 rounded-full bg-[var(--bar)]" /></div>
              <div className="h-1.5 w-3/5 rounded-full bg-[var(--ring-track)]"><div className="h-full w-2/5 rounded-full bg-[var(--bar)]" /></div>
              <div className="h-1.5 w-2/3 rounded-full bg-[var(--ring-track)]"><div className="h-full w-1/2 rounded-full bg-[var(--bar)]" /></div>
            </div>
          </div>
          <p className="text-xl font-[800] leading-snug tracking-[-0.01em]"><Rich text={t("Keep track of what you eat {today}")} values={{ today: <span className="serif-em sun-text pe-0.5">{t("today")}</span> }} /></p>
          <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("Log a meal from any order and see your calories and protein against your targets, so you always know what's left.")}</p>
          <Button className="mt-4" onClick={() => showPaywall("log")}>{PAYMENTS_ENABLED ? t("Try Pro free") : t("See Pro")}</Button>
        </Card>
      </div>
    );
  }

  const totals = loggedToday(log, now);
  const gaps = loggedGaps(log, now);
  const calFraction = Math.min(1, totals.calories / settings.dailyCalories);
  const targets = macroTargets(settings);

  function remove(entry: LogEntry) {
    deleteLogEntry(entry.id);
    setUndo(entry);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 6000);
  }

  const photoOf = (e: LogEntry): string | undefined => {
    const ix = e.source === "item" ? indexes.get(e.chainId) : undefined;
    if (!ix || ix === "missing") return undefined;
    for (const item of ix.items.values()) if (item.name === e.name) return itemImageUrl(item.image);
    return undefined;
  };
  const byMeal = (meal: Meal) => todays.filter((e) => entryMeal(e) === meal);

  return (
    <div>
      <BackHome />
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Today's meals")}</h1>

      {/* One summary card in Home's voice: the calories dial with today's figure beside it (the eaten figure in the accent, the target
          below it), then protein, carbs and fat as Home's rows with their targets. Below the dial's width the figure moves under it
          (large text). */}
      <Card className="app-numbers mt-5 px-4 pb-5 pt-4">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-muted">{t("Calories")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Gauge id="today" label={t("Calories")} fraction={calFraction} size={100} stroke={17} disc>
            <span aria-hidden className="text-[23px] font-[800] leading-none tracking-tight">{Math.round(calFraction * 100)}%</span>
          </Gauge>
          <p className="min-w-0 flex-1 font-normal leading-tight [overflow-wrap:anywhere]">
            <span className="block text-[2rem] leading-none tracking-[-0.02em] text-accent">{formatInt(totals.calories)}</span>{" "}
            <span className="mt-2 block text-[1.0625rem]">/ {formatCalories(settings.dailyCalories)}</span>
          </p>
        </div>
        <div className="mt-6 space-y-5 border-t border-line pt-5">
          <MacroRow label={t("Protein")} eaten={totals.protein} target={targets.protein} />
          <MacroRow label={t("Carbs")} eaten={totals.carbs} target={targets.carbs} />
          <MacroRow label={t("Fat")} eaten={totals.fat} target={targets.fat} />
        </div>
        {gaps.any && <p className="mt-4 text-sm leading-snug text-muted">{t("Some meals you added have no protein, carbs or fat entered, so those figures only count the rest.")}</p>}
      </Card>

      {todays.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<Pip mood="point" size={64} />} title={t("Nothing logged yet today")} body={t("Open an item or build an order, then tap Log.")} /></div>
      ) : (
        <div className="mt-5 space-y-3.5">
          {MEALS.map((meal) => {
            const entries = byMeal(meal);
            if (entries.length === 0) return null;
            const kcal = entries.reduce((s, e) => s + e.nutrients.calories, 0);
            return (
              <section key={meal} aria-labelledby={`today-${meal}`} className="glass overflow-hidden rounded-[1.25rem]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pb-1 pt-4">
                  <h2 id={`today-${meal}`} className="text-lg font-[800] leading-snug tracking-[-0.01em]">{t(MEAL_LABEL[meal])}</h2>
                  <span className="app-numbers shrink-0 font-mono text-[0.75rem] text-muted">{formatCalories(kcal)}</span>
                </div>
                <ul className="divide-y divide-line">
                  {entries.map((e) => (
                    <li key={e.id} className="@container flex items-center gap-3.5 px-4 py-3">
                      {/* the picture steps aside when the row is narrow (large text), so the name and figures keep their room */}
                      <span className="hidden shrink-0 @[18rem]:block"><EatenThumb src={photoOf(e)} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{e.name}</p>
                        <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{timeFormat.format(new Date(e.loggedAt))}{e.chainName ? ` · ${e.chainName}` : ""}</p>
                        {/* typed numbers may leave protein out: then only the calories are shown, never a 0 */}
                        {e.nutrients.protein === undefined ? (
                          <p className="app-numbers mt-1.5 font-mono text-[0.75rem] font-normal text-muted">{formatCalories(e.nutrients.calories)}</p>
                        ) : (
                          <p className="app-numbers mt-1.5 font-mono text-[0.75rem] font-normal text-muted" aria-label={t("{calories} calories, {protein} grams protein", { calories: Math.round(e.nutrients.calories), protein: Math.round(e.nutrients.protein) })}>{t("{kcal} · {protein} protein", { kcal: formatCalories(e.nutrients.calories), protein: formatGrams(e.nutrients.protein) })}</p>
                        )}
                      </div>
                      <button type="button" aria-label={t("Delete {name}", { name: e.name })} onClick={() => remove(e)} className="group -me-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong text-foreground transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"><TrashIcon className="h-[18px] w-[18px]" /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-28 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-foreground py-1.5 ps-5 pe-2 text-background shadow-lg">
          <span className="min-w-0 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{t("Deleted “{name}”.", { name: undo.name })}</span>
          <button type="button" className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-[var(--sun)] transition hover:bg-white/10" onClick={() => { restoreLogEntry(undo); setUndo(null); }}>{t("Undo")}</button>
        </div>
      )}
    </div>
  );
}

/** A round picture of something eaten: the chain's own photo of the dish where we have one, otherwise a plain fork. */
function EatenThumb({ src }: { src: string | undefined }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py
    <img src={src} alt="" width={44} height={44} loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-full bg-white object-cover" />
  ) : (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-strong text-foreground"><ForkIcon className="h-5 w-5" /></span>
  );
}

function BackHome() {
  const t = useT();
  return <Link href="/app" aria-label={t("Back to home")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>;
}
