"use client";

import { SchemePicker } from "../_components/SchemePicker";
import { useT } from "../_lib/i18n";
import { Bottom, BottomButton, H1 } from "./Frame";
import { CounterText } from "./QuestionSteps";
import { GAP, HEADLINE, STEP_TOP } from "./parts";

// The welcome screens' last question (founder 2026-11-26: "at the end of the onboarding ... they then can pick a color scheme, and the default one's the one it's
// on now, but they can choose another color scheme if they want"): the six schemes, today's Lime ticked; a tap recolours the screen at once and is kept. No
// Skip: Continue keeps whatever is ticked. A headline only, no grey line under it.

export function ColoursStep({ counter, onContinue }: { counter: string; onContinue: () => void }) {
  const t = useT();
  return (
    <section className={`${STEP_TOP} flex flex-1 flex-col`}>
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Pick your colours")}<CounterText text={counter} /></h1>
      <SchemePicker label={t("Colours")} className={GAP} />
      <div aria-hidden className="h-6 shrink-0" />
      <Bottom>
        <BottomButton onClick={onContinue}>{t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}
