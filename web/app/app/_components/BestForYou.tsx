"use client";

import { useRouter } from "next/navigation";
import { builderHref } from "@/lib/mm/routes";
import { useEffect, useMemo } from "react";
import { analytics } from "@/lib/mm/analytics";
import { loggedToday, MEAL_LABEL } from "@/lib/mm/budget";
import type { ChainIndex } from "@/lib/mm/chain-index";
import { PAYMENTS_ENABLED } from "@/lib/mm/config";
import { formatCalories } from "@/lib/mm/format";
import { NO_MATCHES_COPY, OUT_OF_BUDGET_BANNER, OUT_OF_BUDGET_EMPTY, rank, type Pick } from "@/lib/mm/ranking";
import { logStore } from "@/lib/mm/stores";
import type { Meal, Preferences } from "@/lib/mm/types";
import { useGate } from "./Paywall";
import { LockIcon } from "./icons";
import { Button, SectionTitle } from "./ui";
import { useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";

// SPEC §6.4 and §7.4 block 1. Uses the chain page's current filters and meal chip.
// Free users see the real cards blurred under an overlay; Pro users can tap a card to open the builder prefilled.

export function BestForYou({ index, meal, preferences, onClearFilters }: { index: ChainIndex; meal: Meal; preferences: Preferences; onClearFilters: () => void }) {
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
        chain: index.chain,
        profile: { goal: settings.goal, dailyCalories: settings.dailyCalories, glp1MealCap: settings.glp1MealCap },
        loggedCalories,
        meal,
        preferences,
      }),
    [index.chain, settings.goal, settings.dailyCalories, settings.glp1MealCap, loggedCalories, meal, preferences],
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
      ? result.picks.length > 0 ? OUT_OF_BUDGET_BANNER : OUT_OF_BUDGET_EMPTY
      : result.mode === "nothingFits"
        ? "Nothing here fits your meal budget. Closest options:"
        : result.mode === "noMatches"
          ? NO_MATCHES_COPY
          : null;

  const cards = result.picks.length > 0 && (
    <ol className="space-y-2">
      {result.picks.map((pick, i) => (
        <li key={pick.id}>
          <button
            type="button"
            onClick={() => open(pick, i + 1)}
            disabled={!pro}
            className="app-numbers flex min-h-16 w-full flex-col items-start rounded-xl border border-line bg-background p-3 text-left enabled:hover:border-muted focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="text-base font-semibold">{pick.name}</span>
            <span className="text-sm text-muted">
              {pick.reason}
              {pick.overBy !== undefined && <> · Over by {formatCalories(pick.overBy)}</>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <section aria-labelledby="best-heading">
      <SectionTitle>
        <span id="best-heading">Best for you</span>
      </SectionTitle>
      {result.mode === "ranked" && (
        <p className="-mt-1 mb-2 text-sm text-muted">{MEAL_LABEL[meal]} · up to {formatCalories(result.budget)}</p>
      )}
      {copy && <p role="status" className="mb-2 text-sm font-medium">{copy}</p>}
      {result.mode === "noMatches" && <Button variant="secondary" onClick={onClearFilters}>Clear filters</Button>}

      {cards && (
        <div className="relative">
          {pro ? (
            cards
          ) : (
            <>
              <div aria-hidden inert className="pointer-events-none select-none blur-sm">{cards}</div>
              <div className="absolute inset-0 flex items-start justify-center rounded-xl bg-background/40 px-3 pt-10">
                <Button onClick={() => showPaywall("bestForYou")} className="shadow-lg">
                  <LockIcon className="h-5 w-5" />
                  {PAYMENTS_ENABLED ? "See your 5 best orders · Try Pro free" : "See your 5 best orders · Pro"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
