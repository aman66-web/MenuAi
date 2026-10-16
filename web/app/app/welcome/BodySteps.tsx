"use client";

import type { BodyAnswers } from "@/lib/mm/onboardingPlan";
import { ActivityTiles, AgeField, BODY_CARD, BodyPrivacyNote, HeightField, SexTiles, WeightField } from "../_components/BodyFields";
import { PipSays } from "../_components/Mascot";
import { useT } from "../_lib/i18n";
import { HEADLINE } from "./parts";

// The three questions before "Your daily targets" (founder 2026-10-16: "3 screens asking their age and then another thing asking another thing"):
// About you (sex and age), Your size (weight and height, each in the unit the person uses) and how active they are. The page owns the answers and the
// buttons; these draw one screen's questions each. What is typed is kept in the page's React state only and used once, to work out the suggested targets
// (CLAUDE.md rule 4: never stored, never sent), and every screen says so.

interface StepProps { body: BodyAnswers; change: (patch: Partial<BodyAnswers>) => void }

export function AboutYouStep({ body, change }: StepProps) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("About you")}</h1>
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={56} mood="think">{t("A few quick questions, and I'll work out your daily numbers for you.")}</PipSays>
      </div>
      <div className="mt-5 space-y-3.5">
        <div className={BODY_CARD}><SexTiles value={body.sex} onChange={(sex) => change({ sex })} /></div>
        <div className={BODY_CARD}><AgeField value={body.age} onChange={(age) => change({ age })} /></div>
      </div>
      <BodyPrivacyNote />
    </>
  );
}

export function YourSizeStep({ body, change }: StepProps) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("Your size")}</h1>
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={56} mood="point">{t("Tell me your weight and height, in whichever units you like.")}</PipSays>
      </div>
      <div className="mt-5 space-y-3.5">
        <div className={BODY_CARD}><WeightField value={body.weight} onChange={(weight) => change({ weight })} /></div>
        <div className={BODY_CARD}><HeightField value={body.height} onChange={(height) => change({ height })} /></div>
      </div>
      <BodyPrivacyNote />
    </>
  );
}

export function ActivityStep({ body, change }: StepProps) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("How active are you?")}</h1>
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={56} mood="think">{t("Pick the one that sounds most like a normal week for you.")}</PipSays>
      </div>
      <div className="mt-5">
        <ActivityTiles value={body.activity} onChange={(activity) => change({ activity })} />
      </div>
      <BodyPrivacyNote />
    </>
  );
}
