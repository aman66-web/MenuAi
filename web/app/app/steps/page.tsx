"use client";

import { formatInt } from "@/lib/mm/format";
import { localeInfo } from "@/lib/mm/i18n";
import { MAX_STEP_GOAL, MIN_STEP_GOAL, nudgeStepGoal, STEP_GOAL_STEP, stepGoal, stepsCardView, stepsOn, stepWeek, stepWeekSummary, type StepWeekDay } from "@/lib/mm/steps";
import { stepsStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { MinusIcon, PlusIcon } from "../_components/icons";
import { PageHeader } from "../_components/PageHeader";
import { StepBar, StepsDenied, StepsOffer } from "../_components/StepsCard";
import { Button } from "../_components/ui";
import { turnOffSteps, useSteps } from "../_lib/steps";
import { useHydrated, useNow, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { useNativePlatform } from "../_lib/platform";

// Steps (lib/mm/steps.ts): today's steps, the last seven days and the person's own daily goal. Reached from Home's Steps card and from Settings › Steps.
// The phone counts the steps; this page only shows them, and they are never stored, synced or sent. No day is called good or bad (CLAUDE.md rule 3): each day
// is its number and a bar against the goal. On the website there are no steps: the page says where they are and nothing else.

function dayName(d: StepWeekDay, htmlLang: string, t: ReturnType<typeof useT>, yesterday: string): string {
  if (d.today) return t("Today");
  if (d.date === yesterday) return t("Yesterday");
  const lang = /^en(-|$)/i.test(htmlLang) ? "en-GB" : htmlLang;
  try {
    return new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }).format(d.day);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d.day);
  }
}

export default function StepsPage() {
  const t = useT();
  const hydrated = useHydrated();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const platform = useNativePlatform();
  const state = useStore(stepsStore);
  const { permission, days } = useSteps();
  const now = useNow();
  if (!hydrated) return null;

  // Settings › Steps can turn counting on even after Home's "Not now": the page offers it whatever Home does
  const view = stepsCardView({ inApp: platform !== null, permission, state: { ...state, dismissed: false } });
  const goal = stepGoal(state);
  const today = stepsOn(days, now);
  const week = stepWeek(days, now);
  const summary = stepWeekSummary(week);
  const yesterday = week[week.length - 2]?.date ?? "";
  const setGoal = (delta: number) => stepsStore.update((s) => ({ ...s, goal: nudgeStepGoal(stepGoal(s), delta) }));

  return (
    <div>
      <PageHeader back={{ href: "/app", label: t("Back to home") }} />
      <h1 className="mt-3 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Steps")}</h1>

      {platform === null && <p className="mt-4 text-base leading-snug text-muted">{t("Step counting is in the {app} app on your phone.", { app: site.name })}</p>}
      {platform !== null && permission === "unavailable" && <p className="mt-4 text-base leading-snug text-muted">{t("This phone can't count steps.")}</p>}
      {view === "offer" && <StepsOffer className="mt-5" />}
      {view === "denied" && <StepsDenied className="mt-5" />}

      {view === "showing" && (
        <>
          <section aria-labelledby="steps-today" className="glass mt-5 rounded-[1.75rem] p-5">
            <h2 id="steps-today" className="kicker">{t("Today")}</h2>
            <p className="app-numbers mt-1 text-[2.5rem] font-extrabold leading-none tracking-tight">
              {formatInt(today?.steps ?? 0)} <span className="text-lg font-semibold text-muted">{t("steps")}</span>
            </p>
            <p className="app-numbers mt-2 text-[0.9375rem] text-muted">{t("Goal: {goal} steps", { goal: formatInt(goal) })}</p>
            <StepBar steps={today?.steps ?? 0} goal={goal} label={t("Steps today against your goal")} className="mt-3" />
            {today?.partial && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Counted since you turned it on")}</p>}
          </section>

          <section aria-labelledby="steps-week" className="mt-7">
            <h2 id="steps-week" className="text-xl font-extrabold tracking-tight">{t("Last 7 days")}</h2>
            <ul className="glass mt-3 divide-y divide-line overflow-hidden rounded-[1.25rem]">
              {[...week].reverse().map((d) => {
                const name = dayName(d, htmlLang, t, yesterday);
                return (
                  <li key={d.date} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={`text-base ${d.today ? "font-bold" : "font-semibold"}`}>{name}</span>
                      <span className="app-numbers text-base font-bold">
                        {d.steps === null ? <span className="font-semibold text-muted">{t("Not counted")}</span> : <>{formatInt(d.steps)} <span className="text-sm font-semibold text-muted">{t("steps")}</span></>}
                      </span>
                    </div>
                    {d.steps !== null && <StepBar steps={d.steps} goal={goal} />}
                    {d.partial && !d.today && <p className="mt-1 text-sm leading-snug text-muted">{t("Counted since you turned it on")}</p>}
                  </li>
                );
              })}
            </ul>
            <p className="app-numbers mt-3 px-1 text-[0.9375rem] leading-snug text-muted">
              {t("{n} steps in these 7 days", { n: formatInt(summary.total) })}
              {summary.average !== null && <><span aria-hidden>{" ·"}</span> {t("{n} a day on average", { n: formatInt(summary.average) })}</>}
            </p>
          </section>
        </>
      )}

      {/* the goal can be set as soon as counting is on (and before the phone has answered); it stays on this phone */}
      {platform !== null && permission !== "unavailable" && state.on && (
        <section aria-labelledby="steps-goal" className="mt-7">
          <h2 id="steps-goal" className="text-xl font-extrabold tracking-tight">{t("Daily goal")}</h2>
          <div className="glass mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] p-3">
            <button
              type="button"
              onClick={() => setGoal(-1)}
              disabled={goal <= MIN_STEP_GOAL}
              aria-label={t("Lower the goal by {n} steps", { n: formatInt(STEP_GOAL_STEP) })}
              className="inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition active:scale-95 disabled:border-transparent disabled:bg-soft-strong disabled:text-muted"
            >
              <MinusIcon className="h-[24px] w-[24px]" />
            </button>
            {/* the two round buttons keep 48 px at any text size, so the goal (which may wrap) always has the room between them */}
            <p role="status" className="app-numbers min-w-0 flex-1 text-center text-xl font-bold">
              {formatInt(goal)} <span className="text-base font-semibold text-muted">{t("steps")}</span>
            </p>
            <button
              type="button"
              onClick={() => setGoal(1)}
              disabled={goal >= MAX_STEP_GOAL}
              aria-label={t("Raise the goal by {n} steps", { n: formatInt(STEP_GOAL_STEP) })}
              className="inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full bg-ink text-on-ink transition active:scale-95 hover:bg-ink-pressed disabled:bg-soft-strong disabled:text-muted"
            >
              <PlusIcon className="h-[24px] w-[24px]" />
            </button>
          </div>
        </section>
      )}

      {platform !== null && permission !== "unavailable" && (
        <p className="mt-7 px-1 text-[0.9375rem] leading-snug text-muted">{t("Your steps stay on this phone. {app} doesn't save or send them.", { app: site.name })}</p>
      )}
      {platform !== null && permission !== "unavailable" && state.on && (
        <Button variant="secondary" className="mt-4" onClick={turnOffSteps}>{t("Stop counting steps")}</Button>
      )}
    </div>
  );
}
