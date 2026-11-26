"use client";

import Link from "next/link";
import { formatInt } from "@/lib/mm/format";
import { nativeSteps } from "@/lib/mm/native";
import { STEP_SETTING_NAME, stepFraction, stepGoal, stepsCardView, stepsOn } from "@/lib/mm/steps";
import { stepsStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { dismissStepsOffer, turnOnSteps, useSteps } from "../_lib/steps";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { useNativePlatform } from "../_lib/platform";
import { ChevronRightIcon, FootstepsIcon } from "./icons";
import { Button } from "./ui";

// Home's "Steps" section, under Water (founder 2026-11-26: "the app should also track peoples steps too"; lib/mm/steps.ts). Inside the phone apps only: the
// offer to turn step counting on, a calm line when the phone's permission is off, or today's steps against the person's own goal, which opens the week
// (/app/steps). On the website, on a phone with no step counter, and after "Not now", nothing at all. No day is called good or bad (CLAUDE.md rule 3).

/**
 * Steps against the goal: a plain bar (more than the goal is a full bar; the figure beside it says the real number). With no `label` it is only drawn: the
 * words next to it already say the numbers (inside a link, a progress bar would be read out as part of the link's name).
 */
export function StepBar({ steps, goal, label, className = "mt-2" }: { steps: number; goal: number; label?: string; className?: string }) {
  const fraction = stepFraction(steps, goal);
  const a11y = label
    ? { role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(fraction * 100) }
    : { "aria-hidden": true };
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-[var(--line)] ${className}`} {...a11y}>
      <div className="h-full rounded-full bg-[var(--bar)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

/** "Count your steps" with "Turn on step counting" (and, on Home, "Not now"). */
export function StepsOffer({ onNotNow, className = "" }: { onNotNow?: () => void; className?: string }) {
  const t = useT();
  const { asking } = useSteps();
  return (
    <div className={`glass rounded-[1.75rem] p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fill text-ink"><FootstepsIcon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold leading-snug tracking-tight">{t("Count your steps")}</p>
          <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("See today's steps here. They stay on this phone.")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button busy={asking} onClick={() => void turnOnSteps()}>{t("Turn on step counting")}</Button>
        {onNotNow && <Button variant="secondary" onClick={onNotNow}>{t("Not now")}</Button>}
      </div>
    </div>
  );
}

/** Step counting is on in Numbite but the phone's own permission is off: say where to turn it on, calmly, with the button that goes there. */
export function StepsDenied({ onNotNow, className = "" }: { onNotNow?: () => void; className?: string }) {
  const t = useT();
  const platform = useNativePlatform();
  const setting = t(STEP_SETTING_NAME[platform === "android" ? "android" : "ios"]);
  return (
    <div className={`glass rounded-[1.75rem] p-4 ${className}`}>
      <p className="text-base leading-snug">{t("{app} can't see your steps. To allow it, turn on {setting} in Settings.", { app: site.name, setting })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void nativeSteps.openSettings()}>{t("Open Settings")}</Button>
        {onNotNow && <Button variant="secondary" onClick={onNotNow}>{t("Not now")}</Button>}
      </div>
    </div>
  );
}

/** `now` is Home's own clock (it moves on at midnight). */
export function StepsCard({ now }: { now: Date }) {
  const t = useT();
  const platform = useNativePlatform();
  const state = useStore(stepsStore);
  const { permission, days } = useSteps();
  const view = stepsCardView({ inApp: platform !== null, permission, state });
  if (view === "hidden") return null;

  const goal = stepGoal(state);
  const today = stepsOn(days, now);
  const steps = today?.steps ?? 0;

  return (
    <section aria-labelledby="home-steps">
      <h2 id="home-steps" className="mt-7 text-xl font-extrabold tracking-tight">{t("Steps")}</h2>
      {view === "offer" && <StepsOffer className="mt-3" onNotNow={dismissStepsOffer} />}
      {view === "denied" && <StepsDenied className="mt-3" onNotNow={dismissStepsOffer} />}
      {view === "showing" && (
        <Link href="/app/steps" className="glass mt-3 flex min-h-[5.5rem] items-center gap-4 rounded-[1.75rem] p-4 transition active:scale-[0.99]">
          <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fill text-ink"><FootstepsIcon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="app-numbers block text-lg font-bold">
              {/* drawn "6,240 / 8,000 steps", heard "6,240 of 8,000 steps today", as the water card does; left to right in every language */}
              <span aria-hidden dir="ltr">
                <span className="whitespace-nowrap">{formatInt(steps)} /</span> <span className="whitespace-nowrap">{formatInt(goal)}</span> <span className="text-sm font-semibold text-muted">{t("steps")}</span>
              </span>
              <span className="sr-only">{t("{steps} of {goal} steps today", { steps: formatInt(steps), goal: formatInt(goal) })}</span>
            </span>
            <StepBar steps={steps} goal={goal} />
            {today?.partial && <span className="mt-1.5 block text-[0.9375rem] leading-snug text-muted">{t("Counted since you turned it on")}</span>}
            <span className="sr-only">{t("See your week")}</span>
          </span>
          <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" />
        </Link>
      )}
    </section>
  );
}
