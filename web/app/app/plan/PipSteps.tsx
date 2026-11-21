"use client";

import { tk } from "@/lib/mm/i18n";
import { AIMS, BREADS, BREAKFASTS, COOK_TIMES, MAX_NOTES, SPICES, TRAINING, WEEKDAY_NUMBERS, type BreakfastLike, type CookTime, type PlanAim, type PlanAnswers, type Spice, type Training } from "@/lib/mm/planAi";
import type { BreadLike } from "@/lib/mm/mealBalance";
import { FRUIT_VEG_AIMS, type FruitVegAim } from "@/lib/mm/fiveADay";
import { CUISINES, type CuisineId } from "@/lib/mm/recipeBook/niches";
import { CheckIcon } from "../_components/icons";
import { ChoiceMark, inputClass } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { CHIP, CHIP_ON } from "../groceries/PageBits";

// Pip's extra questions on Meal plan (founder 2026-11-21: "we want to use full customization ... I'm fine for you to ask as many questions as you want ... It's
// just got to be the perfect plan for them"): the aim, training, cooking time, leftovers, breakfast, bread, spice and a note in the person's own words, one
// question a screen in Meal plan's own look, nothing chosen when a screen opens (the founder: options are never pre-ticked), each skippable (the bottom button
// says Skip while nothing is chosen). Tapping a chosen answer again clears it. With Premium and a connection, Pip's AI plans the week around them (lib/mm/planAi.ts);
// the cuisines to skip sit on the existing "The food you like" step (SkipCuisines).

/** A big answer row in the choice look (page.tsx CHOICE_ROW): unchosen white with the 1.5 px edge, chosen lime with the dark green edge and a filled ring. */
const ROW = "flex w-full items-center gap-3 rounded-[1.25rem] border-[1.5px] text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ROW_OFF = "border-edge bg-card text-foreground hover:bg-background";
const ROW_ON = "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]";

type T = ReturnType<typeof useT>;

export const AIM_LABEL: Record<PlanAim, string> = { muscle: tk("Build muscle"), loseFat: tk("Lose fat"), steady: tk("Keep steady"), eatWell: tk("Just eat well") };
const AIM_LINE: Record<PlanAim, string> = { muscle: tk("More protein in every meal"), loseFat: tk("More food for the calories"), steady: tk("Meals that match your numbers"), eatWell: tk("Lots of variety") };
export const TRAINING_LABEL: Record<Training, string> = { none: tk("None"), "1-2": tk("1 to 2 days"), "3-4": tk("3 to 4 days"), "5+": tk("5 or more") };
const COOK_LABEL: Record<CookTime, string> = { 15: tk("15 min"), 30: tk("30 min"), 45: tk("45 min"), 60: tk("1 hour+") };
export const BREAKFAST_LABEL: Record<BreakfastLike, string> = { sweet: tk("Sweet"), savoury: tk("Savoury"), quick: tk("Quick") };
export const BREAD_LABEL: Record<BreadLike, string> = { mostDays: tk("Most days"), fewTimes: tk("A few times a week"), rarely: tk("Rarely") };
export const SPICE_LABEL: Record<Spice, string> = { mild: tk("Mild"), medium: tk("Medium"), hot: tk("Hot") };
const SPICE_LINE: Record<Spice, string> = { mild: tk("No chilli heat"), medium: tk("A little heat now and then"), hot: tk("Bring on the chilli") };
const DAY_SHORT: Record<number, string> = { 1: tk("Mon"), 2: tk("Tue"), 3: tk("Wed"), 4: tk("Thu"), 5: tk("Fri"), 6: tk("Sat"), 0: tk("Sun") };

/** One single-choice answer as a big row: `line` under the name when given. Tapping the chosen one again clears it (nothing chosen = Skip). */
function Rows<V extends string | number | boolean>({ label, options, value, onChange, name, line }: { label: string; options: readonly V[]; value: V | undefined; onChange: (v: V | undefined) => void; name: (v: V) => string; line?: (v: V) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button key={String(o)} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? undefined : o)} className={`${ROW} min-h-[3.75rem] px-4 py-3 ${on ? ROW_ON : ROW_OFF}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-[1.0625rem] font-bold leading-snug">{name(o)}</span>
              {line && <span className={`mt-0.5 block text-[0.9375rem] leading-snug ${on ? "" : "text-muted"}`}>{line(o)}</span>}
            </span>
            <ChoiceMark on={on} kind="circle" />
          </button>
        );
      })}
    </div>
  );
}

/** A single choice as chips (short answers: minutes, how many days). */
function Chips<V extends string | number>({ label, options, value, onChange, name }: { label: string; options: readonly V[]; value: V | undefined; onChange: (v: V | undefined) => void; name: (v: V) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button key={String(o)} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? undefined : o)} className={`${on ? CHIP_ON : CHIP} app-numbers min-w-[5.5rem] justify-center gap-1.5 px-5`}>
            {on && <CheckIcon aria-hidden className="h-4 w-4" />}{name(o)}
          </button>
        );
      })}
    </div>
  );
}

/** Fruit and veg a day (founder 2026-11-21: "5 a day, 7 a day is also a thing that matters too"): 5 a day, 7 a day, or no aim. */
export function FruitVegStep({ value, onChange }: { value: FruitVegAim | "none" | undefined; onChange: (v: FruitVegAim | "none" | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Fruit and veg a day")} options={[...FRUIT_VEG_AIMS, "none"] as const} value={value} onChange={onChange} name={(v) => fruitVegWords(t, v)} />;
}
const fruitVegWords = (t: T, v: FruitVegAim | "none") => (v === "none" ? t("No aim") : v === 5 ? t("5 a day") : t("7 a day"));

export function AimStep({ value, onChange }: { value: PlanAim | undefined; onChange: (v: PlanAim | undefined) => void }) {
  const t = useT();
  return <Rows label={t("What's your aim?")} options={AIMS} value={value} onChange={onChange} name={(a) => t(AIM_LABEL[a])} line={(a) => t(AIM_LINE[a])} />;
}

/** How many days a week, then (optional) which days: Pip gives those days the meals with more carbs. */
export function TrainingStep({ value, days, onChange, onDays }: { value: Training | undefined; days: readonly number[]; onChange: (v: Training | undefined) => void; onDays: (d: number[]) => void }) {
  const t = useT();
  const flip = (d: number) => onDays(WEEKDAY_NUMBERS.filter((x) => (x === d ? !days.includes(x) : days.includes(x))));
  return (
    <div>
      <Rows label={t("How often do you train?")} options={TRAINING} value={value} onChange={onChange} name={(v) => t(TRAINING_LABEL[v])} />
      {value && value !== "none" && (
        <>
          <h2 className="mt-6 text-lg font-[800]">{t("Which days? (optional)")}</h2>
          <div role="group" aria-label={t("Which days?")} className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_NUMBERS.map((d) => {
              const on = days.includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => flip(d)} className={`${on ? CHIP_ON : CHIP} min-w-[4.25rem] justify-center gap-1.5 px-4`}>
                  {on && <CheckIcon aria-hidden className="h-4 w-4" />}{t(DAY_SHORT[d]!)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function CookTimeStep({ weekday, weekend, onWeekday, onWeekend }: { weekday: CookTime | undefined; weekend: CookTime | undefined; onWeekday: (v: CookTime | undefined) => void; onWeekend: (v: CookTime | undefined) => void }) {
  const t = useT();
  return (
    <div>
      <h2 className="text-lg font-[800]">{t("On weekdays")}</h2>
      <div className="mt-2"><Chips label={t("On weekdays")} options={COOK_TIMES} value={weekday} onChange={onWeekday} name={(m) => t(COOK_LABEL[m])} /></div>
      <h2 className="mt-6 text-lg font-[800]">{t("At weekends")}</h2>
      <div className="mt-2"><Chips label={t("At weekends")} options={COOK_TIMES} value={weekend} onChange={onWeekend} name={(m) => t(COOK_LABEL[m])} /></div>
    </div>
  );
}

export function LeftoversStep({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Cook once, eat twice?")} options={[true, false] as const} value={value} onChange={onChange} name={(v) => (v ? t("Yes, I like leftovers") : t("No, cook fresh each time"))} line={(v) => (v ? t("Some lunches and dinners come round the next day.") : t("A new meal each time."))} />;
}

/** One or more: sweet, savoury, quick (none: a mix). */
export function BreakfastStep({ value, onChange }: { value: readonly BreakfastLike[]; onChange: (v: BreakfastLike[]) => void }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("What do you like for breakfast?")} className="space-y-2">
      {BREAKFASTS.map((b) => {
        const on = value.includes(b);
        return (
          <button key={b} type="button" aria-pressed={on} onClick={() => onChange(BREAKFASTS.filter((x) => (x === b ? !on : value.includes(x))))} className={`${ROW} min-h-[3.75rem] px-4 py-3 ${on ? ROW_ON : ROW_OFF}`}>
            <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug">{t(BREAKFAST_LABEL[b])}</span>
            <ChoiceMark on={on} kind="circle" />
          </button>
        );
      })}
    </div>
  );
}

export function BreadStep({ value, onChange }: { value: BreadLike | undefined; onChange: (v: BreadLike | undefined) => void }) {
  const t = useT();
  return <Rows label={t("How often do you like bread?")} options={BREADS} value={value} onChange={onChange} name={(b) => t(BREAD_LABEL[b])} />;
}

export function SpiceStep({ value, onChange }: { value: Spice | undefined; onChange: (v: Spice | undefined) => void }) {
  const t = useT();
  return <Rows label={t("How hot do you like it?")} options={SPICES} value={value} onChange={onChange} name={(s) => t(SPICE_LABEL[s])} line={(s) => t(SPICE_LINE[s])} />;
}

/** Anything else, in the person's own words (at most MAX_NOTES characters), with what happens to it said under the box. */
export function NotesStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div>
      <label htmlFor="pip-notes" className="sr-only">{t("Anything else Pip should know?")}</label>
      <textarea id="pip-notes" value={value} maxLength={MAX_NOTES} rows={4} onChange={(e) => onChange(e.target.value.slice(0, MAX_NOTES))}
        placeholder={t("For example: I don't like courgette, and I eat late on Fridays.")} aria-describedby="pip-notes-count pip-notes-sent"
        className={`${inputClass} min-h-32 py-3 text-[1.0625rem] leading-snug placeholder:font-medium`} />
      <p id="pip-notes-count" className="app-numbers mt-1.5 text-end text-[0.875rem] text-muted">{t("{n} of {max}", { n: value.length, max: MAX_NOTES })}</p>
      <p id="pip-notes-sent" className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Sent to Pip with your answers. Please leave out names and health details.")}</p>
    </div>
  );
}

/** The kinds of food to skip for lunch and dinner (under the ones they like): any not already chosen. */
export function SkipCuisines({ value, liked, onChange }: { value: readonly CuisineId[]; liked: readonly CuisineId[]; onChange: (v: CuisineId[]) => void }) {
  const t = useT();
  const offered = CUISINES.filter((c) => !liked.includes(c.id));
  if (!offered.length) return null;
  return (
    <div className="mt-6">
      <h2 className="text-lg font-[800]">{t("Any you'd rather skip?")}</h2>
      <div role="group" aria-label={t("Any you'd rather skip?")} className="mt-2 flex flex-wrap gap-2">
        {offered.map((c) => {
          const on = value.includes(c.id);
          return (
            // named "Skip Italian" for a screen reader (the chips above say "Italian" for the kinds they like)
            <button key={c.id} type="button" aria-pressed={on} aria-label={t("Skip {kind}", { kind: t(c.label) })} onClick={() => onChange(CUISINES.map((x) => x.id).filter((x) => (x === c.id ? !on : value.includes(x))))} className={`${on ? CHIP_ON : CHIP} gap-1.5 px-5`}>
              {on && <CheckIcon aria-hidden className="h-4 w-4" />}{t(c.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- the check screen's lines ----------

const list = (words: string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(words);

/** Each answer in words for its row on the check screen ("Not set" while unanswered). */
export function pipAnswerLines(t: T, a: PlanAnswers): Record<"aim" | "fruitVeg" | "training" | "cookTime" | "leftovers" | "breakfast" | "bread" | "spice" | "notes", string> {
  const notSet = t("Not set");
  const cook = [a.cookWeekday ? t("{time} on weekdays", { time: t(COOK_LABEL[a.cookWeekday]) }) : "", a.cookWeekend ? t("{time} at weekends", { time: t(COOK_LABEL[a.cookWeekend]) }) : ""].filter(Boolean);
  return {
    aim: a.aim ? t(AIM_LABEL[a.aim]) : notSet,
    fruitVeg: a.fruitVeg ? fruitVegWords(t, a.fruitVeg) : notSet,
    training: !a.training ? notSet : a.training === "none" ? t("No training")
      : a.trainingDays?.length ? t("{days} a week: {which}", { days: t(TRAINING_LABEL[a.training]), which: list(a.trainingDays.map((d) => t(DAY_SHORT[d]!))) })
      : t("{days} a week", { days: t(TRAINING_LABEL[a.training]) }),
    cookTime: cook.length ? cook.join(", ") : notSet,
    leftovers: a.leftovers === undefined ? notSet : a.leftovers ? t("Yes, I like leftovers") : t("No, cook fresh each time"),
    breakfast: a.breakfast?.length ? list(a.breakfast.map((b) => t(BREAKFAST_LABEL[b]))) : notSet,
    bread: a.bread ? t(BREAD_LABEL[a.bread]) : notSet,
    spice: a.spice ? t(SPICE_LABEL[a.spice]) : notSet,
    notes: a.notes ? `“${a.notes}”` : t("Nothing"),
  };
}
