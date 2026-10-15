"use client";

import { useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { tk, type T } from "@/lib/mm/i18n";
import { mealSizes, moreProteinGrams, type MealSize, type MealTarget } from "@/lib/mm/recipes";
import { currentRecipeMeal, mealTargetFor } from "@/lib/mm/mealTarget";
import { updateSettings } from "@/lib/mm/stores";
import { CheckIcon } from "../_components/icons";
import { Button, inputClass, radioKeyNav } from "../_components/ui";
import { useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// "Your meal": the few choices Recipes and Pip's recipe maker fit every recipe to. Big buttons, one question per row, plain words
// (founder 2026-10-10: older people use it too). Kept in Settings so it is remembered. Styled like Home's cards (2026-10-15): a white
// card, each question as a small spaced-capitals label, grey option tiles with the chosen one dark and a lime tick.

const SIZES: ReadonlyArray<{ value: MealSize; label: string }> = [
  { value: "small", label: tk("Small") },
  { value: "normal", label: tk("Normal") },
  { value: "big", label: tk("Big") },
];

const QUESTION = "text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted";
/** The two secondary choices under the sizes: full-width light grey pills of equal width on the white card, like "Done" under it. */
const PILL_BASE = "inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-2.5 text-center text-[0.9375rem] font-bold leading-tight transition active:scale-[0.98]";
const LINK_PILL = `${PILL_BASE} bg-[var(--fill)] hover:bg-soft-strong`;

function Choice({ on, onClick, onKeyDown, title, sub, label, focusable, numbers }: { on: boolean; onClick: () => void; onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void; title: string; sub: string; label: string; focusable?: boolean; numbers?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      tabIndex={on || focusable ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center rounded-[1.25rem] px-2 pb-2.5 pt-3.5 text-center transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "bg-[var(--fill)] hover:bg-soft-strong"}`}
    >
      {/* the tick hangs off the corner by 8 px and reaches 12 px down into the tile, inside the 14 px top padding, so it never meets the words
          at any text size (the words start below it however wide they are) */}
      {on && <span aria-hidden className="bg-sun absolute -end-2 -top-2 grid h-5 w-5 place-items-center rounded-full text-on-accent"><CheckIcon className="h-3 w-3" strokeWidth={3} /></span>}
      <span className="max-w-full text-[0.9375rem] font-bold leading-tight hyphens-auto [overflow-wrap:anywhere]">{title}</span>
      <span className={`mt-0.5 text-[0.8125rem] leading-tight ${numbers ? "app-numbers" : ""} ${on ? "text-background" : "text-muted"}`}>{sub}</span>
    </button>
  );
}

/** One line saying what recipes are fitted to (or that they are shown as written): "Each recipe is…" in the list, "This recipe is…" on a recipe. */
export function targetSentence(t: T, target: MealTarget | null, subject: "each" | "this" = "each"): string {
  if (!target) return t("Recipes are shown as written.");
  const extra = [target.protein ? t("{n} g protein", { n: target.protein }) : "", target.carbsMax ? t("no more than {n} g carbs", { n: target.carbsMax }) : "", target.fatMax ? t("no more than {n} g fat", { n: target.fatMax }) : ""].filter(Boolean);
  const kcal = formatInt(target.kcal);
  if (!extra.length) return subject === "this" ? t("This recipe is fitted to about {kcal} kcal a serving.", { kcal }) : t("Each recipe is fitted to about {kcal} kcal a serving.", { kcal });
  const more = extra.join(", ");
  return subject === "this" ? t("This recipe is fitted to about {kcal} kcal and {more} a serving.", { kcal, more }) : t("Each recipe is fitted to about {kcal} kcal and {more} a serving.", { kcal, more });
}

/** `summary={false}` where the page already shows the sentence ("Each recipe is fitted to …") next to the button that opens this. */
export function MealPicker({ summary = true }: { summary?: boolean } = {}) {
  const t = useT();
  const settings = useSettings();
  const meal = currentRecipeMeal(settings);
  const sizes = mealSizes(settings.dailyCalories);
  const target = mealTargetFor(settings);
  const [own, setOwn] = useState(meal.size === "custom");
  const [kcal, setKcal] = useState(String(meal.kcal ?? sizes.normal));
  const [protein, setProtein] = useState(meal.protein ? String(meal.protein) : "");
  const [carbs, setCarbs] = useState(meal.carbsMax ? String(meal.carbsMax) : "");
  const [fat, setFat] = useState(meal.fatMax ? String(meal.fatMax) : "");
  const sizeFor = (s: MealSize) => (settings.goal === "glp1" ? Math.min(sizes[s], settings.glp1MealCap) : sizes[s]);
  const pick = (size: MealSize) => { setOwn(false); updateSettings({ recipeMeal: { size, moreProtein: meal.moreProtein } }); };
  const kcalN = Number(kcal);
  const opt = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const valid = Number.isFinite(kcalN) && kcalN >= 150 && kcalN <= 2500 && [protein, carbs, fat].every((v) => v.trim() === "" || (Number(v) > 0 && Number(v) <= 500));
  const presetKcal = sizeFor(meal.size === "small" || meal.size === "big" ? meal.size : "normal");

  return (
    <section aria-labelledby="meal-heading" className="glass rounded-[1.25rem] p-4">
      <h2 id="meal-heading" className="text-[1.0625rem] font-bold tracking-[-0.01em]">{t("Your meal")}</h2>
      <p className={`mt-3.5 ${QUESTION}`}>{t("How big a meal?")}</p>
      <div role="radiogroup" aria-label={t("How big a meal")} className="mt-2 grid grid-cols-3 gap-2">
        {SIZES.map((s, i) => (
          <Choice key={s.value} on={meal.size === s.value} focusable={i === 0 && !SIZES.some((x) => x.value === meal.size)} label={`${t(s.label)}, ${formatInt(sizeFor(s.value))} kcal`} onClick={() => pick(s.value)} onKeyDown={(e) => radioKeyNav(e, i, SIZES.length, (n) => pick(SIZES[n]!.value))} title={t(s.label)} sub={`${formatInt(sizeFor(s.value))} kcal`} numbers />
        ))}
      </div>
      {meal.size !== "custom" && meal.size !== "written" && (
        <>
          <p className={`mt-4 ${QUESTION}`}>{t("Protein")}</p>
          <div role="radiogroup" aria-label={t("Protein")} className="mt-2 grid grid-cols-2 gap-2">
            <Choice on={!meal.moreProtein} label={t("Normal protein")} onClick={() => updateSettings({ recipeMeal: { ...meal, moreProtein: false } })} onKeyDown={(e) => radioKeyNav(e, 0, 2, (n) => updateSettings({ recipeMeal: { ...meal, moreProtein: n === 1 } }))} title={t("Normal")} sub={t("as the recipe has it")} />
            <Choice on={meal.moreProtein} label={t("More protein, about {n} grams", { n: moreProteinGrams(presetKcal) })} onClick={() => updateSettings({ recipeMeal: { ...meal, moreProtein: true } })} onKeyDown={(e) => radioKeyNav(e, 1, 2, (n) => updateSettings({ recipeMeal: { ...meal, moreProtein: n === 1 } }))} title={t("More protein")} sub={t("about {n} g", { n: moreProteinGrams(presetKcal) })} numbers />
          </div>
        </>
      )}
      {summary && <p role="status" aria-live="polite" className="app-numbers mt-3 rounded-[1rem] bg-[var(--fill)] px-3.5 py-2.5 text-[0.9375rem] font-semibold leading-snug">{targetSentence(t, target)}</p>}

      <div className="mt-3.5 grid gap-2">
        <button type="button" aria-expanded={own} onClick={() => setOwn((v) => !v)} className={own ? `${PILL_BASE} bg-foreground text-background` : LINK_PILL}>{t("Type my own numbers")}</button>
        {meal.size !== "written" ? (
          <button type="button" onClick={() => { setOwn(false); updateSettings({ recipeMeal: { size: "written", moreProtein: meal.moreProtein } }); }} className={LINK_PILL}>{t("Show recipes as written")}</button>
        ) : (
          <button type="button" onClick={() => pick("normal")} className={LINK_PILL}>{t("Fit recipes to my meal")}</button>
        )}
      </div>
      {own && (
        <form
          className="mt-2 grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            updateSettings({ recipeMeal: { size: "custom", moreProtein: false, kcal: Math.round(kcalN), ...(opt(protein) ? { protein: Math.round(opt(protein)!) } : {}), ...(opt(carbs) ? { carbsMax: Math.round(opt(carbs)!) } : {}), ...(opt(fat) ? { fatMax: Math.round(opt(fat)!) } : {}) } });
          }}
        >
          <label className="block text-[0.8125rem] font-semibold">{t("Calories a serving")}<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
          <label className="block text-[0.8125rem] font-semibold">{t("Protein (g)")}<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" placeholder={t("Optional")} value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
          <label className="block text-[0.8125rem] font-semibold">{t("Carbs, at most (g)")}<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" placeholder={t("Optional")} value={carbs} onChange={(e) => setCarbs(e.target.value)} /></label>
          <label className="block text-[0.8125rem] font-semibold">{t("Fat, at most (g)")}<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" placeholder={t("Optional")} value={fat} onChange={(e) => setFat(e.target.value)} /></label>
          {!valid && <p role="alert" className="col-span-2 text-sm font-medium text-accent">{t("Calories should be 150 to 2,500; the others above 0.")}</p>}
          <Button type="submit" className="col-span-2" disabled={!valid}>{t("Use my numbers")}</Button>
        </form>
      )}
    </section>
  );
}
