"use client";

import { ASK_PIP_STARTERS } from "@/lib/mm/askPip";
import { AskPipFace } from "../_components/AskPip";
import { BasketIcon, ChevronDownIcon, GearIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { Bottom, BottomButton, H1 } from "./Frame";
import { GAP, HEADLINE, STEP_TOP } from "./parts";
import { PhoneFrame } from "./PhoneFrame";
import { CounterText } from "./QuestionSteps";

// The welcome screens' Ask Pip moment (founder 2026-11-26: "make sure to say that all you have to do is just press Pip"), shown only while Ask Pip is switched on
// (lib/mm/askPip.ts ASK_PIP_ENABLED; lib/mm/welcomeSteps.ts startRun), so the app never promises a chat that isn't there. A headline only, then a picture on a
// phone that can't be tapped (PhoneFrame): the top of Home with the real Pip button (AskPipFace, as in every main tab's top bar) ringed, and under it two of the
// questions the chat offers first, as the person's own message bubbles. Continue moves on; nothing is asked or saved here.

/** The two questions in the picture: the chat's first two starters. */
const QUESTIONS = ASK_PIP_STARTERS.slice(0, 2);

export function AskPipStep({ counter, onContinue }: { counter: string; onContinue: () => void }) {
  const t = useT();
  return (
    <section className={`${STEP_TOP} flex flex-1 flex-col`}>
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Tap Pip to ask anything")}<CounterText text={counter} /></h1>
      <PhoneFrame
        className={GAP}
        screen="h-[17.5rem]"
        label={t("Example: the Pip button at the top of each main screen, and questions you can ask it, such as “{question}”", { question: t(QUESTIONS[0]) })}
      >
        {/* the top of Home as it is on a phone: the day, then Pip (its real button, full size and ringed in ink), the shopping list (the basket alone, as on a small
            phone) and Settings */}
        <div className="flex items-center gap-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-0.5 whitespace-nowrap text-[1rem] font-[800] leading-tight [overflow-wrap:normal]">{t("Today")}<ChevronDownIcon className="h-3.5 w-3.5 shrink-0" /></span>
          <span className="inline-flex shrink-0 rounded-full border-2 border-ink p-[2px]"><AskPipFace /></span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink"><BasketIcon className="h-3.5 w-3.5" /></span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink"><GearIcon className="h-3.5 w-3.5" /></span>
        </div>
        {/* what a tap opens: the person's questions, as in the chat */}
        <ul className="mt-7 space-y-2.5">
          {QUESTIONS.map((q) => (
            <li key={q} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-ee-md bg-ink px-3 py-2 text-[0.8125rem] leading-snug text-on-ink">{t(q)}</p>
            </li>
          ))}
        </ul>
      </PhoneFrame>
      <div aria-hidden className="h-6 shrink-0" />
      <Bottom>
        <BottomButton onClick={onContinue}>{t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}
