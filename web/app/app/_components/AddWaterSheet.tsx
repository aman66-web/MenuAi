"use client";

import { useId, useState, type ReactNode } from "react";
import { formatInt } from "@/lib/mm/format";
import { BOTTLE_ML, GLASS_ML, MAX_WATER_ENTRY_ML, mlToLevel, parseWaterAmount } from "@/lib/mm/water";
import { NumberDone } from "./SearchDone";
import { WaterBottle } from "./WaterBottle";
import { Button, ChoiceMark, Sheet, inputClass } from "./ui";
import { useT } from "../_lib/i18n";

// "Add water", opened by the + on Home's Water card (founder 2026-10-16: "a water bottle which you can move up and type the amount of water you've
// had extra when the plus is pressed"). A bottle whose water you drag up or down (or move with the arrow keys), on its own soft stage with a measuring
// scale, and an "Amount (ml)" box you can type in, in big figures: they stay in step. Two quick buttons, a glass (250 ml) and a bottle (500 ml), fill it
// in for you. What is added is on top of what is already drunk today. Nothing here is advice about how much to drink (CLAUDE.md rule 3).

// The two quick amounts are choices (colour meeting, 19 November 2026): white with the 1.5 px edge and an empty tick ring; the one that matches the amount is
// lime with the 2 px dark green edge (a 1.5 px border plus a half-pixel ring, so nothing moves), a tick and dark green words.
const chip = (on: boolean) =>
  `inline-flex min-h-12 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl border-[1.5px] px-3 py-2 text-[0.9375rem] font-bold transition active:scale-95 ${on ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card text-foreground hover:bg-background"}`;

/** Our own small drawings for the two quick buttons, with a little blue water in each. */
const GlassIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden focusable="false" className="h-5 w-5 shrink-0">
    <path d="M5.9 10h8.2l-.6 6a1.5 1.5 0 01-1.5 1.3H8a1.5 1.5 0 01-1.5-1.3z" fill="#38b6ef" />
    <path d="M5 3h10l-1.4 13.2a1.5 1.5 0 01-1.5 1.3H7.9a1.5 1.5 0 01-1.5-1.3z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
  </svg>
);
const BottleIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden focusable="false" className="h-5 w-5 shrink-0">
    <path d="M5.5 9.5h9V16a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16z" fill="#38b6ef" />
    <path d="M8.2 2h3.6v2c0 .9 2.7 1.5 2.7 3.8V16a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16V7.8c0-2.3 2.7-2.9 2.7-3.8z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
  </svg>
);

/** The bottle's stage: the page fill, flat, so the bottle (its blues and its grey outline: WaterBottle.tsx) stands out on the white sheet. */
const STAGE = "bg-fill";

function AddWaterForm({ onAdd }: { onAdd: (ml: number) => void }) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(String(GLASS_ML));
  const ml = parseWaterAmount(text);
  const shown = ml ?? 0;

  const quick = (icon: ReactNode, label: string, value: number) => (
    <button type="button" aria-pressed={ml === value} onClick={() => setText(String(value))} className={chip(ml === value)}>
      <ChoiceMark on={ml === value} />
      {icon}
      <span>{label}</span>
      <span className={`app-numbers text-sm font-semibold ${ml === value ? "" : "text-muted"}`}>{value} ml</span>
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
      <div className={`relative flex justify-center overflow-hidden rounded-[1.5rem] px-4 pb-5 pt-6 ${STAGE}`}>
        <WaterBottle
          interactive
          level={mlToLevel(shown)}
          ml={shown}
          onChange={(v) => setText(String(v))}
          label={t("Water to add")}
          valueText={t("{n} ml", { n: formatInt(shown) })}
          className="w-[6.5rem] shrink-0"
        />
      </div>

      <div className="group/nums relative">
        <label htmlFor={id} className="mb-2 flex min-h-8 items-center pe-20 text-[0.9375rem] font-semibold leading-snug">{t("Amount (ml)")}</label>
        <NumberDone />
        <div className="relative">
          <input
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            aria-invalid={ml === null || undefined}
            aria-describedby={`${id}-note`}
            className={`${inputClass} app-numbers !min-h-[3.75rem] !pe-14 !text-[1.75rem] font-bold tracking-tight`}
          />
          <span aria-hidden className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted">ml</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {quick(<GlassIcon />, t("Glass"), GLASS_ML)}
        {quick(<BottleIcon />, t("Bottle"), BOTTLE_ML)}
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
