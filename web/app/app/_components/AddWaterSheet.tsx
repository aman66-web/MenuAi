"use client";

import { useId, useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { BOTTLE_ML, GLASS_ML, MAX_WATER_ENTRY_ML, mlToLevel, parseWaterAmount } from "@/lib/mm/water";
import { NumberDone } from "./SearchDone";
import { WaterBottle } from "./WaterBottle";
import { Button, Sheet, inputClass } from "./ui";
import { useT } from "../_lib/i18n";

// "Add water", opened by the + on Home's Water card (founder 2026-10-16: "a water bottle which you can move up and type the amount of water you've
// had extra when the plus is pressed"). A bottle whose water you drag up or down (or move with the arrow keys) and an "Amount (ml)" box you can type
// in: they stay in step. Two quick buttons, a glass (250 ml) and a bottle (500 ml), fill it in for you. What is added is on top of what is already
// drunk today. Nothing here is advice about how much to drink (CLAUDE.md rule 3).

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[0.9375rem] font-bold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background" : "border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] bg-transparent text-foreground hover:bg-soft-strong"}`;

function AddWaterForm({ onAdd }: { onAdd: (ml: number) => void }) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(String(GLASS_ML));
  const ml = parseWaterAmount(text);
  const shown = ml ?? 0;

  const quick = (label: string, value: number) => (
    <button type="button" aria-pressed={ml === value} onClick={() => setText(String(value))} className={chip(ml === value)}>
      <span>{label}</span>
      <span className="app-numbers text-sm font-semibold opacity-70">{value} ml</span>
    </button>
  );

  return (
    <form
      className="space-y-5 pb-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (ml !== null) onAdd(ml);
      }}
    >
      <div className="flex items-center gap-5">
        <WaterBottle
          interactive
          level={mlToLevel(shown)}
          ml={shown}
          onChange={(v) => setText(String(v))}
          label={t("Water to add")}
          valueText={t("{n} ml", { n: formatInt(shown) })}
          className="w-24 shrink-0"
        />
        <div className="group/nums relative min-w-0 flex-1 space-y-4">
          <div>
            <label htmlFor={id} className="mb-2 flex min-h-8 items-center pe-20 text-[0.9375rem] font-semibold leading-snug">{t("Amount (ml)")}</label>
            <NumberDone />
            <input
              id={id}
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              aria-invalid={ml === null || undefined}
              aria-describedby={`${id}-note`}
              className={`${inputClass} app-numbers`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {quick(t("Glass"), GLASS_ML)}
            {quick(t("Bottle"), BOTTLE_ML)}
          </div>
        </div>
      </div>

      <p id={`${id}-note`} role="status" className="min-h-12 text-[0.9375rem] leading-snug text-muted">
        {ml === null ? t("Type an amount from {min} to {max}.", { min: 1, max: MAX_WATER_ENTRY_ML.toLocaleString("en-GB") }) : t("Drag the water up, or type how much you had.")}
      </p>

      <Button type="submit" full disabled={ml === null} className="min-h-12 text-base">
        {ml === null ? t("Add water") : t("Add {n} ml", { n: formatInt(ml) })}
      </Button>
    </form>
  );
}

/** `onAdd` gets the millilitres to add (1 to MAX_WATER_ENTRY_ML); the caller adds them and closes the sheet. The form starts afresh each time the sheet opens. */
export function AddWaterSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (ml: number) => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Add water")}>
      <AddWaterForm onAdd={onAdd} />
    </Sheet>
  );
}
