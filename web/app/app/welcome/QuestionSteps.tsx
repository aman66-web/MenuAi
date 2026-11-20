"use client";

import { moreDietsOn } from "@/lib/mm/foodDiet";
import { tk } from "@/lib/mm/i18n";
import { assetUrl } from "@/lib/mm/config";
import { GLP1_NOTE } from "@/lib/mm/targets";
import type { DietKey } from "@/lib/mm/menu-view";
import type { Goal, Preferences } from "@/lib/mm/types";
import { site } from "@/site.config";
import { DietPicker } from "../_components/DietPicker";
import { BoltIcon, DotsIcon, PillIcon, ScaleIcon, TrendDownIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { ShopPicker } from "../_components/ShopPicker";
import { radioKeyNav } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { bookDietPictures } from "./dietPictures";
import { Bottom, BottomButton, CHOSEN, H1, TickSlot, UNCHOSEN, WHY_GREY, WHY_GREY_LINE } from "./Frame";
import { CARD, GAP, HEADLINE, STEP_TOP } from "./parts";

// The three questions of the welcome steps (founder, 20 November 2026: one question a screen, a short heading, a big input, far fewer words, pictures over
// text): 1 What's your goal? (big tiles), 2 Anything you avoid? (each diet a picture of one of our recipes that fits it, the allergies as big chips) and 3 Where
// do you shop? (the shops' own logos). Each has the top-right white "Skip" (page.tsx), which means "skip this question"; nothing is pre-picked. Pip appears
// once, small, beside step 1's heading, with no speech bubble; he gives no medication guidance: for GLP-1 the note is a plain line under the tiles.

export const GOALS: ReadonlyArray<{ value: Goal; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "lose", label: tk("Lose weight"), Icon: TrendDownIcon },
  { value: "maintain", label: tk("Maintain"), Icon: ScaleIcon },
  { value: "buildMuscle", label: tk("Build muscle"), Icon: BoltIcon },
  { value: "glp1", label: tk("I'm on a GLP-1 medication"), Icon: PillIcon },
  { value: "other", label: tk("Other"), Icon: DotsIcon },
];

/** The sr-only end of a headline: ", Step n of N" (the bar is hidden from screen readers, so the step is heard with each headline). */
export function CounterText({ text }: { text?: string }) {
  return text ? <span className="sr-only">{`, ${text}`}</span> : null;
}

/** Step 1. `shown`: a goal is ticked (tapped in this run, or the saved one in a Settings rerun). `jump`: Pip's one entrance. */
export function GoalStep({ goal, shown, pick, onContinue, counter, jump }: { goal: Goal; shown: boolean; pick: (g: Goal) => void; onContinue: () => void; counter: string; jump: boolean }) {
  const t = useT();
  return (
    <section className={`${STEP_TOP} flex flex-1 flex-col`}>
      <div className="flex items-end justify-between gap-3">
        <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("What's your goal?")}<CounterText text={counter} /></h1>
        {/* Pip, small and bare: no speech bubble (founder, 20 November 2026) */}
        <span className={`inline-flex shrink-0 ${jump ? "pip-jump" : ""}`} style={jump ? { animationDuration: "800ms", animationDelay: "0ms" } : undefined}>
          <Pip mood="wave" size={48} label={t("Pip, a small round green character with a sprout on top.")} />
        </span>
      </div>
      <div role="radiogroup" aria-label={t("Your goal")} className={`${GAP} grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3`}>
        {GOALS.map((g, i) => {
          const on = shown && goal === g.value;
          const last = i === GOALS.length - 1;
          return (
            <button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={on}
              // with none ticked yet, the first goal takes the Tab key (and Switch Control), so the group can be reached
              tabIndex={on || (!shown && i === 0) ? 0 : -1}
              onClick={() => pick(g.value)}
              onKeyDown={(e) => radioKeyNav(e, i, GOALS.length, (n) => pick(GOALS[n]!.value))}
              className={`${CARD} relative flex w-full text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${last ? "col-span-full min-h-[4.5rem] flex-row items-center gap-3.5" : "min-h-[8.25rem] flex-col items-start justify-between gap-3"} ${on ? CHOSEN : UNCHOSEN}`}
            >
              {/* the icon in a page-fill well, in the link green */}
              <span aria-hidden className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${on ? "bg-card" : "bg-background"} text-accent`}><g.Icon className="h-7 w-7" /></span>
              <span className={`block min-w-0 text-[1.125rem] font-[700] leading-tight tracking-[-0.01em] [overflow-wrap:normal] ${last ? "flex-1" : ""}`}>{t(g.label)}</span>
              <span className={last ? "" : "absolute end-3 top-3"}><TickSlot on={on} /></span>
            </button>
          );
        })}
      </div>
      {/* GLP-1: the plain note, not Pip's (he gives no medication guidance) */}
      {shown && goal === "glp1" && <p className="mt-3 text-[0.9375rem] leading-snug text-foreground">{t(GLP1_NOTE, { app: site.name })}</p>}
      <Bottom>
        {!shown && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Pick one, or tap Skip.")}</p>}
        <BottomButton disabled={!shown} describedBy={shown ? undefined : WHY_GREY} onClick={() => { if (shown) onContinue(); }}>{t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}

/** How many things to avoid are ticked: the diets (the six newer ones too) and the allergies. */
export function avoidCount(p: Preferences): number {
  return [p.vegetarianOnly, p.veganOnly, p.pescatarianOnly, p.halalOnly, p.noPork, p.noBeef].filter(Boolean).length + moreDietsOn(p).length + (p.avoidAllergens?.length ?? 0);
}

/** Each diet tile's picture, ready to load (our own recipes' illustrations). */
function pictureSources(): Partial<Record<DietKey, string>> {
  const out: Partial<Record<DietKey, string>> = {};
  for (const [key, pic] of Object.entries(bookDietPictures()) as Array<[DietKey, { src: string }]>) out[key] = assetUrl(pic.src);
  return out;
}

/** Step 2. On Continue the page saves the foods avoided. */
export function AvoidStep({ prefs, setPrefs, onContinue, counter }: { prefs: Preferences; setPrefs: (p: Preferences) => void; onContinue: () => void; counter: string }) {
  const t = useT();
  const count = avoidCount(prefs);
  return (
    <section className={`${STEP_TOP} flex flex-1 flex-col`}>
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Anything you avoid?")}<CounterText text={counter} /></h1>
      <div className={GAP}>
        {/* the allergy caution under "Allergies to avoid", read before anything is ticked and never under the bottom button */}
        <DietPicker value={prefs} onChange={setPrefs} allergyCautionFirst pictures={pictureSources()} chips allergyCaution={t("Filters use each restaurant's own allergen guide. Always check with staff.")} />
      </div>
      <div aria-hidden className="h-6 shrink-0" />
      <Bottom>
        <BottomButton onClick={onContinue}>{count === 0 ? t("Nothing to avoid") : t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}

/** Step 3: the shops' own logos, big. */
export function ShopsStep({ shops, setShops, onContinue, counter }: { shops: string[]; setShops: (s: string[]) => void; onContinue: () => void; counter: string }) {
  const t = useT();
  return (
    <section className={`${STEP_TOP} flex flex-1 flex-col`}>
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Where do you shop?")}<CounterText text={counter} /></h1>
      <div className={GAP}>
        <ShopPicker value={shops} onChange={setShops} warm tiles />
      </div>
      <div aria-hidden className="h-6 shrink-0" />
      <Bottom>
        <BottomButton onClick={onContinue}>{t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}
