"use client";

import type { ReactNode } from "react";
import { formatInt } from "@/lib/mm/format";
import { formatPrice } from "@/lib/mm/groceries";
import type { WeekCosts, WeekPlan } from "@/lib/mm/mealPlan";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { useLastingLine } from "./TwoWeeks";

// The top of the finished week (founder 2026-11-21: "the meal plan screen is way too basic ... make it look better visually"): on the meal plan's own pale
// green (tint-plan, as its card on Home), the day's calories and protein as two big figures, each with a bar against the person's own target, then the money in
// a white tile: the first shop and each week after as big figures (or the one figure when they cost about the same), what lasts, and the budget in plain dark
// words. Then how much of the fresh food is eaten, and any note the week needs. The figures are drawn for the eye and said in full sentences to a screen reader
// (the same sentences as before). No Pip here (no Pip near money), nothing lime on the tint, and nothing coloured for good or bad: a bar past its target is
// simply full.

/** One of the day's figures: "1,988 kcal" big, a bar against the person's target and the target in words. */
function Figure({ value, unit, word, fraction, target }: { value: string; unit: string; word?: string; fraction: number; target: string }) {
  return (
    <div className="min-w-0">
      {/* the figure and its unit never part; a word after them ("protein") may go under them when the column is narrow */}
      <p className="app-numbers text-[0.9375rem] font-semibold leading-tight text-muted">
        <span className="whitespace-nowrap"><span className="text-[2rem] font-[800] leading-none tracking-[-0.02em] text-foreground">{value}</span> {unit}</span>{word ? <> {word}</> : null}
      </p>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-bar" style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }} />
      </div>
      <p className="app-numbers mt-1.5 text-[0.8125rem] leading-snug text-muted">{target}</p>
    </div>
  );
}

/** "Your first shop" over "about £59", big. */
function Money({ label, pounds, className = "" }: { label: string; pounds: number; className?: string }) {
  const t = useT();
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[0.8125rem] font-semibold leading-snug text-muted">{label}</p>
      <p className="app-numbers mt-1.5 text-[0.9375rem] font-semibold leading-none text-muted [overflow-wrap:anywhere]">
        <Rich text={t("about {n}")} values={{ n: <span className="whitespace-nowrap text-[2rem] font-[800] tracking-[-0.02em] text-foreground">£{formatInt(Math.round(pounds))}</span> }} />
      </p>
    </div>
  );
}

/** A small ring filled to a share, in the deep green of progress on a light surface. Decorative: its sentence is beside it. */
function ShareRing({ pct }: { pct: number }) {
  return (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--bar) ${pct * 3.6}deg, var(--line) 0)` }}>
      <span className="h-5 w-5 rounded-full bg-tint-plan" />
    </span>
  );
}

export function WeekSummary({ week, costs, twoWeeks, people, kcal, protein, targetKcal, targetProtein, budgetLine, fresh, children }: {
  week: WeekPlan;
  costs: WeekCosts;
  /** The first shop and each week after (showsWeekAfter), else the one figure. */
  twoWeeks: boolean;
  people: number;
  /** The week's average day. */
  kcal: number;
  protein: number;
  targetKcal: number;
  targetProtein: number;
  /** Where the shopping sits against the budget, in plain words ("No budget set."). */
  budgetLine: string;
  /** The share of the fresh food bought that the week eats, or null when it buys none. */
  fresh: number | null;
  /** The notes the week needs (a day short of the target, a meal size, allergies, a household). */
  children?: ReactNode;
}) {
  const t = useT();
  const lasting = useLastingLine(week);
  return (
    <div className="mt-4 rounded-[1.5rem] border border-line bg-tint-plan p-3 shadow-[var(--card-shadow)]">
      <p className="sr-only">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(kcal), protein: formatInt(protein), target: formatInt(targetKcal) })}</p>
      {/* "Each day, about" over the two figures, side by side (one under the other at large text: the width is in rem, so it grows with the text) */}
      <div aria-hidden className="rounded-[1.125rem] border border-line bg-card px-3.5 pb-3 pt-3">
        <p className="text-[0.8125rem] font-semibold leading-snug text-muted">{t("Each day, about")}</p>
        <div className="mt-1.5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))] gap-x-5 gap-y-4">
          <Figure value={formatInt(kcal)} unit="kcal" fraction={kcal / targetKcal} target={t("Your target: {n} kcal", { n: formatInt(targetKcal) })} />
          <Figure value={formatInt(protein)} unit="g" word={t("protein")} fraction={targetProtein > 0 ? protein / targetProtein : 0} target={t("Your target: {n} g", { n: formatInt(targetProtein) })} />
        </div>
      </div>

      {/* the money: never green or red, and no picture or icon on it */}
      <div className="mt-2.5 rounded-[1.125rem] border border-line bg-card px-3.5 py-3">
        {twoWeeks ? (
          <>
            <p className="sr-only">{t("Your first shop: about £{cost}", { cost: formatInt(Math.round(costs.first)) })}</p>
            <p className="sr-only">{t("Each week after: about £{cost}", { cost: formatInt(Math.round(costs.after)) })}</p>
            <div aria-hidden className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-x-4 gap-y-3">
              <Money label={t("Your first shop")} pounds={costs.first} />
              <Money label={t("Each week after")} pounds={costs.after} />
            </div>
            {lasting && <p className="mt-3 text-[0.875rem] leading-snug text-muted">{lasting}</p>}
          </>
        ) : (
          <>
            <p className="app-numbers text-[2rem] font-[800] leading-none tracking-[-0.02em]">{formatPrice(week.shoppingCost)}</p>
            <p className="mt-1.5 text-[0.9375rem] font-semibold text-muted">{people > 1 ? t("for the week's shopping for {n} people", { n: people }) : t("for the week's shopping")}</p>
          </>
        )}
        <p className="mt-3 border-t border-line pt-3 text-[0.9375rem] font-semibold leading-snug">{budgetLine}</p>
      </div>

      {(fresh !== null || children) && (
        <div className="space-y-2 px-1.5 pb-1 pt-3">
          {fresh !== null && (
            <p className="app-numbers flex items-center gap-2.5 text-[0.9375rem] font-semibold leading-snug">
              <ShareRing pct={fresh} />
              <span className="min-w-0">{t("{pct}% of the fresh food you buy is eaten this week.", { pct: fresh })}</span>
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
