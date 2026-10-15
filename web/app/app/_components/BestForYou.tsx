"use client";

import { useRouter } from "next/navigation";
import { builderHref } from "@/lib/mm/routes";
import { Fragment, useEffect, useMemo } from "react";
import { analytics } from "@/lib/mm/analytics";
import { loggedToday, MEAL_LABEL } from "@/lib/mm/budget";
import type { ChainIndex } from "@/lib/mm/chain-index";
import { PAYMENTS_ENABLED } from "@/lib/mm/config";
import { formatCalories, nutrientsSpoken } from "@/lib/mm/format";
import { chainForDiet } from "@/lib/mm/menu-view";
import { NO_MATCHES_COPY, OUT_OF_BUDGET_BANNER, OUT_OF_BUDGET_EMPTY, rank, type Pick } from "@/lib/mm/ranking";
import { logStore } from "@/lib/mm/stores";
import type { Meal, Preferences } from "@/lib/mm/types";
import { useGate } from "./Paywall";
import { ChevronRightIcon, LockIcon } from "./icons";
import { Button, SectionTitle } from "./ui";
import { useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// SPEC §6.4 and §7.4 block 1. Uses the chain page's current filters and meal chip.
// Free users see the real cards blurred under an overlay; Pro users can tap a card to open the builder prefilled.
// Look (founder 2026-10-15, Home's language): the picks straight on the white card with fine lines between them, a number in a grey
// circle at the start, the first pick's circle in the brand lime (the one highlighted thing), a small chevron at the end.

export function BestForYou({ index, meal, preferences, onClearFilters, bare = false }: { index: ChainIndex; meal: Meal; preferences: Preferences; onClearFilters: () => void; bare?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { gate, showPaywall } = useGate();
  const pro = useIsPro();
  const settings = useSettings();
  const log = useStore(logStore);
  const now = useNow();

  // Free users log nothing, so what's left is always the daily target (SPEC §6.3).
  const loggedCalories = pro ? loggedToday(log, now).calories : 0;
  const result = useMemo(
    () =>
      rank({
        chain: chainForDiet(index.chain, preferences),
        profile: { goal: settings.goal, dailyCalories: settings.dailyCalories, glp1MealCap: settings.glp1MealCap },
        loggedCalories,
        meal,
        preferences,
      }, t),
    [index.chain, settings.goal, settings.dailyCalories, settings.glp1MealCap, loggedCalories, meal, preferences, t],
  );

  useEffect(() => {
    analytics.track({ name: "bestForYouViewed", chainId: index.chain.id, mode: result.mode });
  }, [index.chain.id, result.mode]);

  const open = (pick: Pick, rankNumber: number) =>
    gate("orderBuilder", () => {
      analytics.track({ name: "bestForYouPickOpened", rank: rankNumber });
      router.push(builderHref({ chain: index.chain.id, pick: pick.id }));
    });

  const copy =
    result.mode === "outOfBudget"
      ? t(result.picks.length > 0 ? OUT_OF_BUDGET_BANNER : OUT_OF_BUDGET_EMPTY)
      : result.mode === "nothingFits"
        ? t("Nothing here fits your meal budget. Closest options:")
        : result.mode === "noMatches"
          ? t(NO_MATCHES_COPY)
          : null;

  // The picks sit straight on the white card, divided by fine lines (no box per pick), each with its number in a small grey circle;
  // the first pick's circle is the brand lime, the one highlighted thing.
  const cards = result.picks.length > 0 && (
    <ol>
      {result.picks.map((pick, i) => (
        <li key={pick.id} className="relative before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-line first:before:hidden">
          <button
            type="button"
            onClick={() => open(pick, i + 1)}
            disabled={!pro}
            className="app-numbers group -mx-2 flex min-h-[4.5rem] w-[calc(100%+1rem)] items-center gap-3.5 rounded-2xl px-2 py-3 text-start transition enabled:active:bg-[var(--fill)] enabled:hover:bg-[var(--fill)] focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-bold ${i === 0 ? "bg-sun text-on-accent" : "bg-[var(--fill)] text-foreground"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-base font-bold leading-snug tracking-[-0.005em]">{pick.name}</span>
              <span className="mt-0.5 block text-pretty text-[0.9375rem] leading-snug text-muted">
                <ReasonLine parts={[pick.reason, ...(pick.overBy !== undefined ? [t("Over by {kcal}", { kcal: formatCalories(pick.overBy) })] : [])]} />
              </span>
              <span className="sr-only">, {nutrientsSpoken(pick.nutrients, t)}</span>
            </span>
            <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-muted transition group-enabled:group-hover:text-foreground rtl:rotate-180" />
          </button>
        </li>
      ))}
    </ol>
  );

  const body = (
    <>
      {result.mode === "ranked" && (
        <p className="app-numbers mb-1.5 text-[0.9375rem] text-muted">{t(MEAL_LABEL[meal])} · {t("up to {kcal}", { kcal: formatCalories(result.budget) })}</p>
      )}
      {copy && <p role="status" className="mb-2.5 text-[0.9375rem] font-medium leading-snug">{copy}</p>}
      {result.mode === "noMatches" && <Button variant="secondary" onClick={onClearFilters}>{t("Clear filters")}</Button>}

      {cards && (
        <div className="relative">
          {pro ? (
            cards
          ) : (
            <>
              <div aria-hidden inert className="pointer-events-none select-none blur-sm">{cards}</div>
              <div className="absolute inset-0 flex items-start justify-center rounded-2xl bg-white/75 px-3 pt-10">
                <Button onClick={() => showPaywall("bestForYou")} className="shadow-[0_12px_28px_-12px_rgba(17,24,20,0.5)]">
                  <LockIcon className="h-5 w-5" />
                  {PAYMENTS_ENABLED ? t("See your 5 best orders · Try Pro free") : t("See your 5 best orders · Pro")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
  // `bare`: the restaurant page puts the heading, the meal choice and the diet line around it in one card
  if (bare) return body;
  return (
    <section aria-labelledby="best-heading">
      <SectionTitle>
        <span id="best-heading">{t("Best for you")}</span>
      </SectionTitle>
      {body}
    </section>
  );
}

/**
 * A pick's reason line ("57g protein · 814 kcal · 7.0g per 100 kcal", then "Over by …" when it's over), each figure kept whole on its
 * line ("7.0g per / 100 kcal" never splits) and a line breaking after a "·", never before one. A figure is an inline block, so one
 * too long for the line (very large text, a long translation) still wraps inside itself instead of running off the side. A translated
 * reason without " · " is shown as it is, free to wrap anywhere.
 */
function ReasonLine({ parts }: { parts: string[] }) {
  const pieces = parts.flatMap((part, i) => {
    const figures = part.split(" · ");
    return figures.length > 1 ? figures.map((text) => ({ text, keep: true })) : [{ text: part, keep: i > 0 }];
  });
  return pieces.map((piece, k) => {
    const last = k === pieces.length - 1;
    const text = last ? piece.text : `${piece.text} ·`;
    return (
      <Fragment key={k}>
        {piece.keep ? <span className="inline-block">{text}</span> : text}
        {!last && " "}
      </Fragment>
    );
  });
}
