"use client";

import type { BodyAnswers } from "@/lib/mm/onboardingPlan";
import type { Activity } from "@/lib/mm/targets";
import { ActivityTiles, AgeField, BODY_CARD, BodyPrivacyNote, HeightField, SexTiles, WeightField } from "../_components/BodyFields";
import { PipSays } from "../_components/Mascot";
import { useT } from "../_lib/i18n";
import { HEADLINE } from "./parts";

// The three questions before "Your daily targets" (founder 2026-10-16: "3 screens asking their age and then another thing asking another thing"):
// About you (sex and age), Your height and weight (each in the unit the person uses) and how active they are. The page owns the answers and the
// buttons; these draw one screen's questions each. What is typed is kept in the page's React state only and used once, to work out the suggested targets
// (CLAUDE.md rule 4: never stored, never sent), and every screen says so straight under Pip's line, before anything is typed (usability test 2026-11-19).
// Pip listens on all three (a calm face, size 64) and never reacts to what is typed about the person's body.

interface StepProps { body: BodyAnswers; change: (patch: Partial<BodyAnswers>) => void }

/** Pip's line, then the privacy promise outside the live region (so a screen reader doesn't read the promise again when Pip's words change). */
function PipThenPromise({ children }: { children: string }) {
  return (
    <>
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={64} mood="listen">{children}</PipSays>
      </div>
      <BodyPrivacyNote />
    </>
  );
}

export function AboutYouStep({ body, change }: StepProps) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("About you")}</h1>
      <PipThenPromise>{t("I only need these to work out your daily calories. Skip them if you'd rather.")}</PipThenPromise>
      <div className="mt-5 space-y-3.5">
        <div className={BODY_CARD}><SexTiles value={body.sex} onChange={(sex) => change({ sex })} /></div>
        <div className={BODY_CARD}><AgeField value={body.age} onChange={(age) => change({ age })} /></div>
      </div>
    </>
  );
}

export function YourSizeStep({ body, change }: StepProps) {
  const t = useT();
  return (
    <>
      {/* not "Your size", which read as a clothes size or a judgement (usability test 2026-11-19) */}
      <h1 className={HEADLINE}>{t("Your height and weight")}</h1>
      <PipThenPromise>{t("Use whichever units you know. Rather not say? Skip these questions.")}</PipThenPromise>
      <div className="mt-5 space-y-3.5">
        {/* height first, in the headline's order */}
        <div className={BODY_CARD}><HeightField value={body.height} onChange={(height) => change({ height })} /></div>
        <div className={BODY_CARD}><WeightField value={body.weight} onChange={(weight) => change({ weight })} /></div>
      </div>
    </>
  );
}

/** `activity` is null until the person taps a tile (nothing is picked for them); `pick` is their tap. */
export function ActivityStep({ activity, pick }: { activity: Activity | null; pick: (a: Activity) => void }) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("How active are you?")}</h1>
      <PipThenPromise>{t("Think of a normal week, not your busiest one.")}</PipThenPromise>
      <div className="mt-5">
        <ActivityTiles value={activity} onChange={pick} />
      </div>
    </>
  );
}
