"use client";

import type { ReactNode } from "react";
import type { CompareItem } from "@/lib/mm/compare";
import { reasonLine } from "@/lib/mm/comparePick";
import type { Goal } from "@/lib/mm/types";
import { Pip, type PipMood } from "../_components/Mascot";
import { Button } from "../_components/ui";
import { useComparePick } from "../_lib/comparePick";
import { useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// Pip's pick (founder 2026-11-17: "when the person compares two products, you should use the AI to say what you think personally is better out of the two"): under the
// side-by-side table, when exactly two products or two dishes are compared. Pip says which one fits the person's goal in one short sentence with no numbers; the lines
// under it are worked out by the app from the figures in the table (lib/mm/comparePick.ts), never written by the AI. Words stay inside CLAUDE.md rule 3: a pick for a
// goal, never "good", "bad" or "healthy". Only shown when the switch is on (NEXT_PUBLIC_COMPARE_PICK=1).

/** The goal in words the app already uses (Settings and onboarding). */
function goalWord(goal: Goal, t: ReturnType<typeof useT>): string {
  switch (goal) {
    case "lose": return t("Lose weight");
    case "maintain": return t("Maintain");
    case "buildMuscle": return t("Build muscle");
    case "glp1": return t("GLP-1");
    case "other": return t("Other");
  }
}

export function PipsPick({ items, picture }: { items: readonly CompareItem[]; picture: (item: CompareItem) => ReactNode }) {
  const t = useT();
  const goal = useSettings().goal;
  const { state, retry } = useComparePick(items);
  if (items.length < 2 || (items.length === 2 && state.status === "idle")) return null;

  const mood: PipMood = state.status === "ready" ? (state.pick.chosen ? "point" : "wave") : "think";
  const dishes = items[0]?.kind === "dish";
  const chosen = state.status === "ready" && state.pick.chosen ? items.find((i) => i.key === state.pick.chosen!.key) : undefined;

  return (
    <section aria-labelledby="pick-heading" className="glass mt-5 rounded-[1.25rem] px-4 py-4">
      <div className="flex items-center gap-3">
        <Pip mood={mood} size={52} />
        <h2 id="pick-heading" className="text-xl font-[800] tracking-[-0.01em]">{t("Pip's pick")}</h2>
      </div>

      {/* one live region: what Pip says is read once it arrives */}
      <div role="status" className="mt-3">
        {items.length > 2 && <p className="text-[0.9375rem] leading-snug text-muted">{t("Pip picks between two items. Remove some to see Pip's pick.")}</p>}
        {items.length === 2 && state.status === "incomparable" && <p className="text-[0.9375rem] leading-snug text-muted">{t("These labels count different things, so Pip can't pick between them.")}</p>}
        {items.length === 2 && state.status === "thinking" && <p className="text-[0.9375rem] leading-snug text-muted motion-safe:animate-pulse">{t("Pip is thinking…")}</p>}
        {items.length === 2 && state.status === "failed" && (
          <div>
            <p className="text-[0.9375rem] leading-snug text-muted">{state.offline ? t("You're offline, so Pip can't pick right now.") : t("Pip couldn't pick just now.")}</p>
            <Button variant="secondary" className="mt-3" onClick={retry}>{t("Try again")}</Button>
          </div>
        )}
        {items.length === 2 && state.status === "ready" && (
          <div>
            {chosen ? (
              <div className="flex items-center gap-3">
                <span className="block h-16 w-16 shrink-0">{picture(chosen)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{chosen.name}</span>
                  <span className="mt-0.5 block text-[0.875rem] leading-snug text-muted [overflow-wrap:anywhere]">{chosen.from}</span>
                </span>
              </div>
            ) : (
              <p className="text-[0.6875rem] font-semibold uppercase leading-tight tracking-[0.1em] text-muted">{t("A tie for your goal")}</p>
            )}
            <p className={`${chosen ? "mt-3" : "mt-2"} text-base font-semibold leading-snug`}>{state.pick.sentence}</p>
            {state.pick.reasons.length > 0 && (
              <ul className="mt-3 space-y-2">
                {state.pick.reasons.map((r) => (
                  <li key={r.key} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug">
                    <span aria-hidden className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="app-numbers">{reasonLine(r, t)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[0.8125rem] leading-snug text-muted">
              {dishes
                ? t("Pip's pick is for your goal ({goal}) and only looks at the numbers each restaurant publishes.", { goal: goalWord(goal, t) })
                : t("Pip's pick is for your goal ({goal}) and only looks at the numbers on the labels.", { goal: goalWord(goal, t) })}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
