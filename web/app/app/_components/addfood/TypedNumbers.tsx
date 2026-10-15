"use client";

import { useId, useState } from "react";
import { ADD_TO, MAX_NAME_LENGTH, typedEntry, type TypedField } from "@/lib/mm/addFood";
import { tk } from "@/lib/mm/i18n";
import type { Meal } from "@/lib/mm/types";
import { dismissKeyboard, NumberDone } from "../SearchDone";
import { Button, inputClass } from "../ui";
import { useT } from "../../_lib/i18n";
import type { NewEntry } from "./parts";

// "Type in your numbers": a name (optional) and the calories, protein, carbs and fat of something the person ate. Calories are needed; the other
// three may stay empty and then the entry has no figure for them (never 0). The numbers are the person's own, so nothing is checked against a menu.

const PROBLEM: Record<TypedField, string> = {
  calories: tk("Check the calories: use a number from 0 to 5,000."),
  protein: tk("Check the protein: use a number from 0 to 1,000 g."),
  carbs: tk("Check the carbs: use a number from 0 to 1,000 g."),
  fat: tk("Check the fat: use a number from 0 to 1,000 g."),
};

export function TypedNumbers({ meal, onAdd }: { meal: Meal; onAdd: (entry: NewEntry) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const ids: Record<TypedField | "name" | "note", string> = { name: useId(), calories: useId(), protein: useId(), carbs: useId(), fat: useId(), note: useId() };
  const result = typedEntry({ name, calories, protein, carbs, fat }, t("My own numbers"));
  const wrong = !result.ok && result.problem !== "missing" ? result : null;

  const number = (field: TypedField, label: string, value: string, set: (v: string) => void) => (
    <div>
      <label htmlFor={ids[field]} className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{label}</label>
      <input
        id={ids[field]}
        value={value}
        onChange={(e) => set(e.target.value)}
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        aria-required={field === "calories" || undefined}
        aria-invalid={wrong?.field === field || undefined}
        aria-describedby={ids.note}
        className={`${inputClass} app-numbers`}
      />
    </div>
  );

  return (
    <form
      className="space-y-5 pb-2 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (result.ok) onAdd({ chainId: "", chainName: "", name: result.name, nutrients: result.nutrients, source: "custom" });
      }}
    >
      <div>
        <label htmlFor={ids.name} className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{t("Name (optional)")}</label>
        <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder={t("e.g. Toast and jam")} enterKeyHint="done" onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); dismissKeyboard(); } }} autoComplete="off" className={inputClass} />
      </div>

      {/* A number pad has no Return key, so a Done sits at the corner of the group while a box is in use (SearchDone.tsx). */}
      <div className="group/nums relative">
        <p className="mb-2 flex min-h-8 items-center text-[0.9375rem] font-semibold leading-snug">{t("Numbers")}</p>
        <NumberDone />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3.5">
          {number("calories", t("Calories (kcal)"), calories, setCalories)}
          {number("protein", t("Protein (g)"), protein, setProtein)}
          {number("carbs", t("Carbs (g)"), carbs, setCarbs)}
          {number("fat", t("Fat (g)"), fat, setFat)}
        </div>
      </div>

      {wrong ? (
        <p id={ids.note} role="alert" className="text-[0.9375rem] font-semibold leading-snug">{t(PROBLEM[wrong.field])}</p>
      ) : (
        <p id={ids.note} className="text-[0.9375rem] leading-snug text-muted">{t("Calories are needed. Protein, carbs and fat can stay empty.")}</p>
      )}

      <Button type="submit" full disabled={!result.ok} className="min-h-12 text-base">{t(ADD_TO[meal])}</Button>
    </form>
  );
}
