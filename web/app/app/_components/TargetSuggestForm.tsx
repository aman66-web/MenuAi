"use client";

import { useState } from "react";
import { ACTIVITY_LABEL, suggestTargets, SUGGESTION_NOTE, UNDER_18_COPY, type Activity, type Sex } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { Button, Field, inputClass, Segmented } from "./ui";

// SPEC §6.2: Mifflin-St Jeor suggestion, shown with "Suggested starting points, not medical advice."

const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

export function TargetSuggestForm({ goal, onApply }: { goal: Goal; onApply: (calories: number, protein: number) => void }) {
  const [sex, setSex] = useState<Sex>("unspecified");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [activity, setActivity] = useState<Activity>("light");
  const [result, setResult] = useState<ReturnType<typeof suggestTargets> | null>(null);

  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-soft p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(suggestTargets({ sex, age: Number(age), weightLb: Number(weight), heightFt: Number(ft), heightIn: Number(inch || 0), activity, goal }));
      }}
    >
      <Segmented label="Sex for the formula" value={sex} options={SEX_OPTIONS} onChange={setSex} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age"><input className={inputClass} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} required /></Field>
        <Field label="Weight (lb)"><input className={inputClass} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} required /></Field>
        <Field label="Height (ft)"><input className={inputClass} inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} required /></Field>
        <Field label="Height (in)"><input className={inputClass} inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} /></Field>
      </div>
      <Field label="Activity">
        <select className={inputClass} value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
          {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => (<option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>))}
        </select>
      </Field>
      <Button type="submit" variant="secondary" full>Suggest targets</Button>

      {result?.kind === "under18" && <p role="status" className="text-sm font-medium">{UNDER_18_COPY}</p>}
      {result?.kind === "invalid" && <p role="alert" className="text-sm text-muted">Enter an age from 18 to 100, your weight and your height.</p>}
      {result?.kind === "ok" && (
        <div role="status" className="space-y-2 rounded-lg bg-background p-3">
          <p className="app-numbers text-base"><span className="font-bold">{result.calories.toLocaleString("en-US")}</span> kcal · <span className="font-bold">{result.protein}g</span> protein</p>
          <p className="text-xs text-muted">{SUGGESTION_NOTE}</p>
          <Button full onClick={() => onApply(result.calories, result.protein)}>Use these</Button>
        </div>
      )}
    </form>
  );
}
