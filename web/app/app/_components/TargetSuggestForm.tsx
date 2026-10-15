"use client";

import { useState } from "react";
import { tk } from "@/lib/mm/i18n";
import { ACTIVITY_LABEL, suggestTargets, UNDER_18_COPY, type Activity, type Sex } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { PickTile } from "./DietPicker";
import { Button, Field, inputClass, radioKeyNav } from "./ui";

// SPEC §6.2: Mifflin-St Jeor suggestion, shown with "Suggested starting points, not medical advice." (both hosts, Settings and
// onboarding, print that sentence right under this form, so the result tile doesn't repeat it).

const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "male", label: tk("Male") },
  { value: "female", label: tk("Female") },
  { value: "unspecified", label: tk("Prefer not to say") },
];

export function TargetSuggestForm({ goal, onApply }: { goal: Goal; onApply: (calories: number, protein: number) => void }) {
  const t = useT();
  const [sex, setSex] = useState<Sex>("unspecified");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [activity, setActivity] = useState<Activity>("light");
  const [result, setResult] = useState<ReturnType<typeof suggestTargets> | null>(null);

  return (
    <form
      // A white card on the page (onboarding). Inside a card already (Settings › Daily targets) it melts into that card instead of
      // stacking a card on a card: no fill, padding or shadow of its own, just a hairline above it so it reads as the next step, and
      // its tiles, inputs and buttons take the light grey fill.
      className="glass space-y-4 rounded-[1.25rem] p-4 [.glass_&]:rounded-none [.glass_&]:border-t-line [.glass_&]:bg-transparent [.glass_&]:px-0 [.glass_&]:pb-0 [.glass_&]:pt-5 [.glass_&]:shadow-none"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(suggestTargets({ sex, age: Number(age), weightLb: Number(weight), heightFt: Number(ft), heightIn: Number(inch || 0), activity, goal }));
      }}
    >
      {/* Male and Female side by side, "Prefer not to say" on its own full-width tile under them; with large text the columns
          become one (the minimum column width is in rem, so it grows with the text) and no word is ever broken in two. */}
      <div role="radiogroup" aria-label={t("Sex for the formula")} className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2.5">
        {SEX_OPTIONS.map((o, i) => (
          <PickTile
            key={o.value}
            on={o.value === sex}
            role="radio"
            aria-checked={o.value === sex}
            tabIndex={o.value === sex ? 0 : -1}
            onClick={() => setSex(o.value)}
            onKeyDown={(e) => radioKeyNav(e, i, SEX_OPTIONS.length, (n) => setSex(SEX_OPTIONS[n]!.value))}
            className={`text-[0.9375rem] font-semibold leading-snug ${i === SEX_OPTIONS.length - 1 ? "col-span-full" : ""}`}
          >
            {t(o.label)}
          </PickTile>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label={t("Age")}><input className={inputClass} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} required /></Field>
        <Field label={t("Weight (lb)")}><input className={inputClass} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} required /></Field>
        <Field label={t("Height (ft)")}><input className={inputClass} inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} required /></Field>
        <Field label={t("Height (in)")}><input className={inputClass} inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} /></Field>
      </div>
      <Field label={t("Activity")}>
        <select className={inputClass} value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
          {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => (<option key={a} value={a}>{t(ACTIVITY_LABEL[a])}</option>))}
        </select>
      </Field>
      <Button type="submit" variant="secondary" full>{t("Suggest targets")}</Button>

      {result?.kind === "under18" && <p role="status" className="text-[0.9375rem] font-medium leading-snug">{t(UNDER_18_COPY)}</p>}
      {result?.kind === "invalid" && <p role="alert" className="text-[0.9375rem] leading-snug text-muted">{t("Enter an age from 18 to 100, your weight and your height.")}</p>}
      {result?.kind === "ok" && (
        <div role="status" className="tile rounded-[1.25rem] p-4">
          {/* the two figures like Home's: a big number in a regular weight, its unit small and muted under it, a hairline between */}
          <div className="app-numbers grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
            <p className="min-w-0">
              <span className="block text-[2rem] font-normal leading-none tracking-[-0.02em]">{result.calories.toLocaleString("en-US")}</span>
              <span className="mt-2 block text-[0.9375rem] leading-snug text-muted">kcal</span>
            </p>
            <span aria-hidden className="w-px bg-line" />
            <p className="min-w-0">
              <span className="block text-[2rem] font-normal leading-none tracking-[-0.02em]">{result.protein}<span className="ms-0.5 text-[1.25rem] tracking-normal">g</span></span>
              <span className="mt-2 block text-[0.9375rem] leading-snug text-muted">{t("protein")}</span>
            </p>
          </div>
          <Button full className="mt-5" onClick={() => onApply(result.calories, result.protein)}>{t("Use these")}</Button>
        </div>
      )}
    </form>
  );
}
