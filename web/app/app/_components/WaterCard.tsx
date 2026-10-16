"use client";

import { useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { addWaterEntry, undoWaterEntry, waterStore } from "@/lib/mm/stores";
import { lastWaterToday, waterFraction, waterGoal, waterToday } from "@/lib/mm/water";
import { AddWaterSheet } from "./AddWaterSheet";
import { PlusIcon } from "./icons";
import { WaterBottle } from "./WaterBottle";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// Home's "Water" section, under Today's meals (founder 2026-10-15: "There should be a water intake section below dinners with its own heading";
// 2026-10-16: "a water bottle which you can move up and type the amount of water you've had extra when the plus is pressed"). One card in the look of
// a meal row: a small bottle filled to today's level, today's millilitres against the person's own goal, an Undo for the last drink added today and a
// round + that opens "Add water" (a bottle to drag and an amount to type, on top of what is already drunk). No advice and no claims about how much
// anyone should drink: the goal is a number the person can change in Settings (lib/mm/water.ts).

/**
 * `now` is Home's own clock (it moves on at midnight). `guard` runs what opens the sheet behind the logging gate (Pro, when Pro is on): Home passes
 * `(go) => gate("log", go)`.
 */
export function WaterCard({ now, guard }: { now: Date; guard: (go: () => void) => void }) {
  const t = useT();
  const settings = useSettings();
  const entries = useStore(waterStore);
  const [open, setOpen] = useState(false);
  const goal = waterGoal(settings);
  const ml = waterToday(entries, now);
  const canUndo = lastWaterToday(entries, now) !== undefined;

  return (
    <section aria-labelledby="home-water">
      <h2 id="home-water" className="mt-7 text-xl font-extrabold tracking-tight">{t("Water")}</h2>
      <div className="glass mt-3 flex min-h-[7.5rem] items-center gap-4 rounded-[1.75rem] p-4">
        <WaterBottle level={waterFraction(ml, goal)} className="h-24 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p role="status" className="app-numbers text-lg font-bold">
            {/* One unbreakable piece, and left to right in every language so "1,250 / 2,000 ml" reads in that order in Arabic and Urdu too. */}
            <span aria-hidden dir="ltr" className="inline-block whitespace-nowrap">
              {formatInt(ml)} / {formatInt(goal)} <span className="text-sm font-semibold text-muted">ml</span>
            </span>
            <span className="sr-only">{t("{ml} of {goal} ml of water today", { ml: formatInt(ml), goal: formatInt(goal) })}</span>
          </p>
          {/* Always in place, hidden when there is nothing to undo, so the card never changes height when a drink is added. */}
          <button
            type="button"
            onClick={undoWaterEntry}
            aria-label={t("Undo the last water you added")}
            className={`-ms-3.5 mt-1 inline-flex min-h-11 items-center rounded-full px-3.5 text-[0.9375rem] font-bold text-accent transition hover:bg-accent-soft active:scale-95 ${canUndo ? "" : "invisible"}`}
          >
            {t("Undo")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => guard(() => setOpen(true))}
          aria-label={t("Add water")}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-strong transition active:scale-95 hover:bg-accent-soft hover:text-accent"
        >
          <PlusIcon aria-hidden className="h-6 w-6" />
        </button>
      </div>
      <AddWaterSheet
        open={open}
        onClose={() => setOpen(false)}
        onAdd={(amount) => {
          addWaterEntry(amount);
          setOpen(false);
        }}
      />
    </section>
  );
}
