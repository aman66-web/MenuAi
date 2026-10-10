"use client";

import { useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { mealSizes, moreProteinGrams, type MealSize, type MealTarget } from "@/lib/mm/recipes";
import { currentRecipeMeal, mealTargetFor } from "@/lib/mm/mealTarget";
import { updateSettings } from "@/lib/mm/stores";
import { CheckIcon } from "../_components/icons";
import { Button, inputClass, radioKeyNav } from "../_components/ui";
import { useSettings } from "../_lib/hooks";

// "Your meal": the few choices Recipes and Pip's recipe maker fit every recipe to. Big buttons, one question per row, plain words
// (founder 2026-10-10: older people use it too). Kept in Settings so it is remembered.

const SIZES: ReadonlyArray<{ value: MealSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "big", label: "Big" },
];

function Choice({ on, onClick, onKeyDown, children, label, focusable }: { on: boolean; onClick: () => void; onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void; children: React.ReactNode; label: string; focusable?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      tabIndex={on || focusable ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]" : "border-line bg-soft hover:bg-soft-strong"}`}
    >
      {on && <span aria-hidden className="bg-sun absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-on-accent shadow"><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /></span>}
      {children}
    </button>
  );
}

/** One line saying what recipes are fitted to (or that they are shown as written). */
export function targetSentence(t: MealTarget | null, subject = "Each recipe is"): string {
  if (!t) return "Recipes are shown as written.";
  const extra = [t.protein ? `${t.protein} g protein` : "", t.carbsMax ? `no more than ${t.carbsMax} g carbs` : "", t.fatMax ? `no more than ${t.fatMax} g fat` : ""].filter(Boolean);
  return `${subject} fitted to about ${formatInt(t.kcal)} kcal${extra.length ? ` and ${extra.join(", ")}` : ""} a serving.`;
}

export function MealPicker() {
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
    <section aria-labelledby="meal-heading" className="glass rounded-3xl p-4">
      <h2 id="meal-heading" className="text-lg font-extrabold tracking-tight">Your meal</h2>
      <p className="mt-3 text-sm font-bold">How big a meal?</p>
      <div role="radiogroup" aria-label="How big a meal" className="mt-2 grid grid-cols-3 gap-2">
        {SIZES.map((s, i) => (
          <Choice key={s.value} on={meal.size === s.value} focusable={i === 0 && !SIZES.some((x) => x.value === meal.size)} label={`${s.label}, ${formatInt(sizeFor(s.value))} kcal`} onClick={() => pick(s.value)} onKeyDown={(e) => radioKeyNav(e, i, SIZES.length, (n) => pick(SIZES[n]!.value))}>
            <span className="text-base font-extrabold">{s.label}</span>
            <span className="app-numbers text-sm opacity-80">{formatInt(sizeFor(s.value))} kcal</span>
          </Choice>
        ))}
      </div>
      {meal.size !== "custom" && meal.size !== "written" && (
        <>
          <p className="mt-4 text-sm font-bold">Protein</p>
          <div role="radiogroup" aria-label="Protein" className="mt-2 grid grid-cols-2 gap-2">
            <Choice on={!meal.moreProtein} label="Normal protein" onClick={() => updateSettings({ recipeMeal: { ...meal, moreProtein: false } })} onKeyDown={(e) => radioKeyNav(e, 0, 2, (n) => updateSettings({ recipeMeal: { ...meal, moreProtein: n === 1 } }))}>
              <span className="text-base font-extrabold">Normal</span>
              <span className="text-sm opacity-80">as the recipe has it</span>
            </Choice>
            <Choice on={meal.moreProtein} label={`More protein, about ${moreProteinGrams(presetKcal)} grams`} onClick={() => updateSettings({ recipeMeal: { ...meal, moreProtein: true } })} onKeyDown={(e) => radioKeyNav(e, 1, 2, (n) => updateSettings({ recipeMeal: { ...meal, moreProtein: n === 1 } }))}>
              <span className="text-base font-extrabold">More protein</span>
              <span className="app-numbers text-sm opacity-80">about {moreProteinGrams(presetKcal)} g</span>
            </Choice>
          </div>
        </>
      )}
      <p role="status" aria-live="polite" className="app-numbers mt-3 rounded-2xl bg-accent-soft px-3 py-2 text-sm font-semibold">{targetSentence(target)}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" aria-expanded={own} onClick={() => setOwn((v) => !v)} className="min-h-11 text-sm font-bold text-accent underline underline-offset-4">Type my own numbers</button>
        {meal.size !== "written" ? (
          <button type="button" onClick={() => { setOwn(false); updateSettings({ recipeMeal: { size: "written", moreProtein: meal.moreProtein } }); }} className="min-h-11 text-sm font-bold text-accent underline underline-offset-4">Show recipes as written</button>
        ) : (
          <button type="button" onClick={() => pick("normal")} className="min-h-11 text-sm font-bold text-accent underline underline-offset-4">Fit recipes to my meal</button>
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
          <label className="block text-sm font-semibold">Calories a serving<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Protein (g)<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" placeholder="Optional" value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Carbs, at most (g)<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" placeholder="Optional" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Fat, at most (g)<input className={`${inputClass} mt-1 min-h-12 text-lg`} inputMode="numeric" placeholder="Optional" value={fat} onChange={(e) => setFat(e.target.value)} /></label>
          {!valid && <p role="alert" className="col-span-2 text-sm font-medium text-accent">Calories should be 150 to 2,500; the others above 0.</p>}
          <Button type="submit" className="col-span-2" disabled={!valid}>Use my numbers</Button>
        </form>
      )}
    </section>
  );
}
