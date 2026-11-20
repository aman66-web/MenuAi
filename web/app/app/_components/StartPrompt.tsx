"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/site.config";
import { tk } from "@/lib/mm/i18n";
import { updateSettings } from "@/lib/mm/stores";
import { GLP1_NOTE } from "@/lib/mm/targets";
import type { Goal, Preferences } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { useHydrated, useSettings } from "../_lib/hooks";
import { DietPicker, PickTile } from "./DietPicker";
import { SourcesLink } from "./SourcesLink";
import { Button, Card, Sheet } from "./ui";

// Instant utility first (founder's brief, 13 Nov 2026): nobody is stopped at the door by a questionnaire any more. A first visit goes straight to
// the app with sensible defaults (goal "Maintain", a 2,000 kcal day, no diet filters), and this quiet card offers to fit it to the person: one
// sheet with the goal and what they avoid, nothing else. The longer guided setup (Pip, daily numbers from age and size) is reached through the welcome tour's
// "Set up my daily numbers" (a first plain launch opens the tour: lib/mm/tour.ts), and is reachable from Settings > Set up with Pip. Someone who arrived by a link and hasn't
// had a plain launch yet can see the tour from here ("Show me around": just the five stops, nothing saved, back to this page).
// Answering saves the goal and diet and counts as having set up, so the card goes away; "Not now" hides it too (the same flag the targets card uses).
// The goals' hints are the welcome screen's own (the onboarding meeting, 19 November: "Stay where you are" was unclear, and "orders" didn't fit people who cook).

const GOALS: ReadonlyArray<{ value: Goal; label: string; hint: string }> = [
  { value: "lose", label: tk("Lose weight"), hint: tk("Meals and orders that fit a lower calorie target") },
  { value: "maintain", label: tk("Maintain"), hint: tk("Keep my weight steady") },
  { value: "buildMuscle", label: tk("Build muscle"), hint: tk("Higher-protein meals and orders") },
  { value: "glp1", label: tk("I'm on a GLP-1 medication"), hint: tk("Smaller, protein-first orders") },
  { value: "other", label: tk("Other"), hint: tk("Something else, or just here for the numbers") },
];

/** Whether the card is still due: the person hasn't been through setup and hasn't said "Not now". */
export const startPromptDue = (s: { hasCompletedOnboarding: boolean; dismissedTargetsCard: boolean }): boolean => !s.hasCompletedOnboarding && !s.dismissedTargetsCard;

export function StartPrompt({ className = "" }: { className?: string }) {
  const t = useT();
  const hydrated = useHydrated();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<Goal>(settings.goal);
  const [prefs, setPrefs] = useState<Preferences>(settings.preferences);

  if (!hydrated || !startPromptDue(settings)) return null;

  const save = () => {
    updateSettings({ goal, preferences: prefs, hasCompletedOnboarding: true });
    setOpen(false);
  };

  return (
    <>
      <Card className={`flex flex-col gap-3 p-5 ${className}`}>
        <div>
          <h2 className="text-xl font-extrabold leading-snug tracking-tight">{t("Make {app} fit you", { app: site.name })}</h2>
          <p className="mt-1.5 text-base leading-snug">{t("Choose your goal and what you avoid. It takes a minute and you can change it any time.")}</p>
          {/* App Review 1.4.1: a first visit now lands on Home with the default targets above this card, so their sources are one tap away here too
              (the same sheet as Settings > Daily targets). */}
          <SourcesLink className="mt-1" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button size="lg" aria-haspopup="dialog" onClick={() => { setGoal(settings.goal); setPrefs(settings.preferences); setOpen(true); }}>{t("Set up")}</Button>
          <Button size="lg" variant="secondary" onClick={() => updateSettings({ dismissedTargetsCard: true })}>{t("Not now")}</Button>
        </div>
        {/* green words are always underlined, like every link (colour meeting, 19 November 2026) */}
        <Link href="/app/welcome?tour=1" className="inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-accent underline underline-offset-2">{t("Show me around")}</Link>
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("Make {app} fit you", { app: site.name })}>
        <p className="text-base font-bold">{t("Your goal")}</p>
        <div role="radiogroup" aria-label={t("Your goal")} className="mt-2 grid gap-2">
          {GOALS.map((g) => (
            <PickTile key={g.value} tall role="radio" aria-checked={goal === g.value} on={goal === g.value} onClick={() => setGoal(g.value)}>
              <span className="block text-base font-bold leading-snug">{t(g.label)}</span>
              <span className={`mt-0.5 block text-[0.9375rem] leading-snug ${goal === g.value ? "" : "text-muted"}`}>{t(g.hint)}</span>
            </PickTile>
          ))}
        </div>
        {goal === "glp1" && (
          <>
            <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t(GLP1_NOTE, { app: site.name })}</p>
            <SourcesLink />
          </>
        )}
        <p className="mb-2 mt-6 text-base font-bold">{t("Anything you avoid?")}</p>
        <DietPicker value={prefs} onChange={setPrefs} />
        <div className="mt-5">
          <Button size="lg" full onClick={save}>{t("Save")}</Button>
        </div>
      </Sheet>
    </>
  );
}
