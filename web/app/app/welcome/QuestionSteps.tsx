"use client";

import { retailerName } from "@/lib/mm/groceries";
import { moreDietsOn } from "@/lib/mm/foodDiet";
import { tk } from "@/lib/mm/i18n";
import { GLP1_NOTE } from "@/lib/mm/targets";
import type { Goal, Preferences } from "@/lib/mm/types";
import { site } from "@/site.config";
import { DietPicker } from "../_components/DietPicker";
import { BoltIcon, DotsIcon, PillIcon, ScaleIcon, TrendDownIcon } from "../_components/icons";
import { BubbleWords, Pip, PipSays } from "../_components/Mascot";
import { ShopPicker } from "../_components/ShopPicker";
import { radioKeyNav } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { Bottom, BottomButton, CHOICE, CHOSEN, H1, TickSlot, UNCHOSEN, WHY_GREY, WHY_GREY_LINE } from "./Frame";
import { CARD, GOAL_REACTION, HEADLINE } from "./parts";

// The three question screens of the welcome steps (the onboarding redesign meeting of 20 November 2026, approved by the founder): 1 What's your goal?, 2 Anything
// you avoid? and 4 Where do you shop?. Each has the top-right white "Skip" (page.tsx), which always means "skip this question"; nothing is pre-picked; Pip, 64 px
// and bare, listens and says one calm line that points at the next screen, changed only when its meaning changes. Step 1 is his one entrance: last night's
// jump-and-land once (800 ms), then still; still under Reduce Motion. He gives no medication guidance: for GLP-1 the note is a plain line under the tiles.
// The 20 November 2026 audit: each bubble keeps the room of the longest line it can say on that screen (PipSays `reserve`), so a reaction never moves the
// choices under the person's finger; on step 1 Pip waves until a goal is tapped, then listens.

export const GOALS: ReadonlyArray<{ value: Goal; label: string; hint: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "lose", label: tk("Lose weight"), hint: tk("Meals and orders that fit a lower calorie target"), Icon: TrendDownIcon },
  { value: "maintain", label: tk("Maintain"), hint: tk("Keep my weight steady"), Icon: ScaleIcon },
  { value: "buildMuscle", label: tk("Build muscle"), hint: tk("Higher-protein meals and orders"), Icon: BoltIcon },
  { value: "glp1", label: tk("I'm on a GLP-1 medication"), hint: tk("Smaller, protein-first orders"), Icon: PillIcon },
  { value: "other", label: tk("Other"), hint: tk("Something else, or just here for the numbers"), Icon: DotsIcon },
];

/** The sr-only end of a headline: ", Step n of N" (the bar's own words are hidden from screen readers, so the counter is heard with each headline). */
export function CounterText({ text }: { text?: string }) {
  return text ? <span className="sr-only">{`, ${text}`}</span> : null;
}

/**
 * Step 1. `shown`: a goal is ticked (tapped in this run, or the saved one in a Settings rerun); `reacted`: one was tapped in this run, so Pip's bubble has
 * changed to his calm "Got it." for it. `total`: the run's N, the digit in Pip's first line. `jump`: Pip's entrance.
 */
export function GoalStep({ goal, shown, reacted, pick, onContinue, counter, total, jump }: { goal: Goal; shown: boolean; reacted: boolean; pick: (g: Goal) => void; onContinue: () => void; counter: string; total: number; jump: boolean }) {
  const t = useT();
  const hello = t("Hi, I'm Pip. {n} short steps, and I'll show you what {app} can do for you on the way.", { n: total, app: site.name });
  return (
    <section className="mt-5 flex flex-1 flex-col">
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("What's your goal?")}<CounterText text={counter} /></h1>
      {/* Pip's one entrance: described once, here; a hello wave until a goal is tapped, then he listens */}
      <div className="mt-4 flex items-end gap-3">
        <span className={`inline-flex shrink-0 ${jump ? "pip-jump" : ""}`} style={jump ? { animationDuration: "800ms", animationDelay: "0ms" } : undefined}>
          <Pip mood={reacted ? "listen" : "wave"} size={64} label={t("Pip, a small round green character with a sprout on top.")} />
        </span>
        <p aria-live="polite" className="speech glass relative mb-3 min-w-0 flex-1 rounded-3xl rounded-es-md px-4 py-3 text-[15px] font-medium leading-snug text-foreground">
          <BubbleWords reserve={[hello, ...GOALS.map((g) => t(GOAL_REACTION[g.value]))]}>{reacted ? t(GOAL_REACTION[goal]) : hello}</BubbleWords>
        </p>
      </div>
      <div role="radiogroup" aria-label={t("Your goal")} className="mt-4 space-y-2.5">
        {GOALS.map((g, i) => {
          const on = shown && goal === g.value;
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
              className={`${CARD} ${CHOICE} min-h-[4.5rem] ${on ? CHOSEN : UNCHOSEN}`}
            >
              {/* the icon in a page-fill well, in the link green (colour meeting: lime discs behind icons became page fill) */}
              <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-accent"><g.Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.0625rem] font-[700] leading-tight tracking-[-0.01em]">{t(g.label)}</span>
                <span className={`mt-0.5 block text-[0.9375rem] leading-snug ${on ? "font-semibold text-on-sun" : "text-muted"}`}>{t(g.hint)}</span>
              </span>
              <TickSlot on={on} />
            </button>
          );
        })}
      </div>
      {/* GLP-1: the plain note, not in Pip's bubble (he gives no medication guidance) */}
      {shown && goal === "glp1" && <p className="mt-3 text-[0.9375rem] leading-snug text-foreground">{t(GLP1_NOTE, { app: site.name })}</p>}
      <Bottom>
        {!shown && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Pick one to go on, or tap Skip at the top.")}</p>}
        <BottomButton disabled={!shown} describedBy={shown ? undefined : WHY_GREY} onClick={() => { if (shown) onContinue(); }}>{t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}

/** How many things to avoid are ticked: the diets (the six newer ones too) and the allergies. */
export function avoidCount(p: Preferences): number {
  return [p.vegetarianOnly, p.veganOnly, p.pescatarianOnly, p.halalOnly, p.noPork, p.noBeef].filter(Boolean).length + moreDietsOn(p).length + (p.avoidAllergens?.length ?? 0);
}

/** Step 2. On Continue the page saves the foods avoided and starts loading step 3's menus. */
export function AvoidStep({ prefs, setPrefs, onContinue, counter }: { prefs: Preferences; setPrefs: (p: Preferences) => void; onContinue: () => void; counter: string }) {
  const t = useT();
  const allergens = prefs.avoidAllergens?.length ?? 0;
  const count = avoidCount(prefs);
  const pulse = allergens > 0 ? "allergen" : count > 0 ? "diet" : "none";
  // the allergy line says what the filter really does: where a restaurant publishes allergens, dishes that list them are hidden; where it publishes none, its
  // page says so (lib/mm/menu-view.ts uncheckedDiet). Never a promise.
  const lines = {
    allergen: t("Where a restaurant publishes allergens, dishes that list them are hidden; where it publishes none we say so on its page. Always check with the restaurant."),
    diet: t("Got it. I'll leave those out where the menu or label says so."),
    none: t("Pick anything you don't eat. I'll leave it out of everything I show you next."),
  };
  return (
    <section className="mt-5 flex flex-1 flex-col">
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Anything you avoid?")}<CounterText text={counter} /></h1>
      {/* Pip pops up (and a screen reader reads him) only when his words change: re-reading on every tap was the low-vision tester's first complaint. */}
      <div aria-live="polite" className="mt-4">
        <PipSays lively pulse={pulse} size={64} mood="listen" reserve={[lines.allergen, lines.diet, lines.none]}>
          {lines[pulse]}
        </PipSays>
      </div>
      <p className="mb-4 mt-4 text-[15px] text-muted">{t("Tap everything that applies. Change it any time.")}</p>
      {/* the allergy caution under "Allergies to avoid", read before anything is ticked and never under the bottom button */}
      <DietPicker value={prefs} onChange={setPrefs} allergyCautionFirst />
      <Bottom>
        <BottomButton onClick={onContinue}>{count === 0 ? t("Nothing to avoid") : t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}

/** Step 4. `defaultShop`: the shop recipes use until one is chosen (named once the shops' list has loaded). */
export function ShopsStep({ shops, setShops, onContinue, counter, defaultShop }: { shops: string[]; setShops: (s: string[]) => void; onContinue: () => void; counter: string; defaultShop: string | undefined }) {
  const t = useT();
  return (
    <section className="mt-5 flex flex-1 flex-col">
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Where do you shop?")}<CounterText text={counter} /></h1>
      <div aria-live="polite" className="mt-4">
        <PipSays lively pulse={shops.length > 0 ? "picked" : "ask"} size={64} mood="listen" reserve={[t("Got it. I'll show those shops first."), t("Tick the shops you use. Next, I'll show you recipes made from their products.")]}>
          {shops.length > 0 ? t("Got it. I'll show those shops first.") : t("Tick the shops you use. Next, I'll show you recipes made from their products.")}
        </PipSays>
      </div>
      <p className="mb-4 mt-4 text-[15px] text-muted">{t("Tap all that apply. Change it any time in Settings.")}</p>
      <ShopPicker value={shops} onChange={setShops} warm />
      {/* with none ticked, Continue leads to one shop's recipes: said, with the shop named once the list of shops has loaded */}
      {shops.length === 0 && (
        <p className="mt-4 text-[15px] leading-snug text-muted">
          {defaultShop
            ? t("Not sure yet? That's fine. Until you choose, recipes use {shop}.", { shop: retailerName(defaultShop) })
            : t("Not sure yet? That's fine: until you choose, recipes use the supermarket we have the most labels for.")}
        </p>
      )}
      <div aria-hidden className="h-8 shrink-0" />
      <Bottom>
        <BottomButton onClick={onContinue}>{t("Continue")}</BottomButton>
      </Bottom>
    </section>
  );
}
