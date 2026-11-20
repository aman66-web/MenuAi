"use client";

import type { BodyAnswers } from "@/lib/mm/onboardingPlan";
import type { Activity } from "@/lib/mm/targets";
import { ActivityTiles, AgeField, BODY_CARD, HeightField, SexTiles, WeightField } from "../_components/BodyFields";
import { ShieldIcon } from "../_components/icons";
import { PipSays } from "../_components/Mascot";
import { useT } from "../_lib/i18n";
import { HEADLINE } from "./parts";

// The three questions before "Your daily targets" (founder 2026-10-16: "3 screens asking their age and then another thing asking another thing"), steps 6 to 8:
// About you (sex and age), Your height and weight (each in the unit the person uses) and how active they are. The page owns the answers and the buttons; these
// draw one screen's questions each. What is typed is kept in the page's React state only and used once, to work out the suggested targets (CLAUDE.md rule 4:
// never stored, never sent), and every screen says so on its own line at 16 px, before anything is typed.
// Pip is off About you and Your height and weight (the onboarding redesign meeting of 20 November 2026: a typed body measurement counts as a number screen, so
// his sentence stays as plain text in the app's voice). On How active are you? he listens and says it is the last question: that screen has no figure and no
// typed measurement. He never reacts to what is typed about the person's body.

/** `counter`: "Step n of N", read by a screen reader with the headline (the bar's own words are hidden from it). */
interface StepProps { body: BodyAnswers; change: (patch: Partial<BodyAnswers>) => void; counter?: string }

/** The privacy promise, on its own line at 16 px in the page's ink, clear of the grey button's reason line. */
function PrivacyLine() {
  const t = useT();
  return (
    <p className="mt-4 flex items-start gap-2.5 text-base leading-snug text-foreground">
      <ShieldIcon aria-hidden className="mt-[0.2rem] h-[1.125rem] w-[1.125rem] shrink-0 text-accent" />
      <span>{t("Your answers are only used to work out your numbers. They aren't saved or sent anywhere.")}</span>
    </p>
  );
}

function Counter({ text }: { text?: string }) {
  return text ? <span className="sr-only">{`, ${text}`}</span> : null;
}

export function AboutYouStep({ body, change, counter }: StepProps) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("About you")}<Counter text={counter} /></h1>
      <p className="mt-3 text-base leading-snug text-foreground">{t("Only to work out your daily calories.")}</p>
      {/* the calorie-number route, with no new screen: skip the questions and type the number on the targets screen */}
      <p className="mt-2 text-base leading-snug text-foreground">{t("Already have a daily calorie number? Skip these questions and type it in on the next screen.")}</p>
      <PrivacyLine />
      <div className="mt-5 space-y-3.5">
        <div className={BODY_CARD}><SexTiles value={body.sex} onChange={(sex) => change({ sex })} /></div>
        <div className={BODY_CARD}><AgeField value={body.age} onChange={(age) => change({ age })} /></div>
      </div>
    </>
  );
}

export function YourSizeStep({ body, change, counter }: StepProps) {
  const t = useT();
  return (
    <>
      {/* not "Your size", which read as a clothes size or a judgement (usability test 2026-11-19) */}
      <h1 className={HEADLINE}>{t("Your height and weight")}<Counter text={counter} /></h1>
      <p className="mt-3 text-base leading-snug text-foreground">{t("Use whichever units you know. Rather not say? Skip these questions.")}</p>
      <PrivacyLine />
      <div className="mt-5 space-y-3.5">
        {/* height first, in the headline's order */}
        <div className={BODY_CARD}><HeightField value={body.height} onChange={(height) => change({ height })} /></div>
        <div className={BODY_CARD}><WeightField value={body.weight} onChange={(weight) => change({ weight })} /></div>
      </div>
    </>
  );
}

/** `activity` is null until the person taps a tile (nothing is picked for them); `pick` is their tap. */
export function ActivityStep({ activity, pick, counter }: { activity: Activity | null; pick: (a: Activity) => void; counter?: string }) {
  const t = useT();
  return (
    <>
      <h1 className={HEADLINE}>{t("How active are you?")}<Counter text={counter} /></h1>
      <div className="mt-4">
        <PipSays size={64} mood="listen">{t("Last question. Think of a normal week, not your busiest one.")}</PipSays>
      </div>
      <div className="mt-4">
        <ActivityTiles value={activity} onChange={pick} />
      </div>
    </>
  );
}
