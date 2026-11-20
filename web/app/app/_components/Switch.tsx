"use client";

import type { ReactNode } from "react";
import { useT } from "../_lib/i18n";

/**
 * A switch with its state in words (colour meeting, 19 November 2026; approved by the founder that day: older testers couldn't tell which way a switch was).
 * Off: a white track with the 1.5 px edge of every control you can tap, a mid-grey knob and "Off" in the secondary grey. On: a lime track with the 2 px dark
 * green edge (a 1.5 px border plus a half-pixel ring, so nothing moves when it flips), the knob in that dark green (11.86:1) and "On". The word sits just
 * before the track, right-aligned, so the track never moves; it is hidden from screen readers, which hear the switch's own on/off state. The whole row is
 * the label, at least 44 px tall. Can't be switched (`disabled`): the line fill with a grey knob, never faded.
 */
export function Switch({ checked, onChange, label, description, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; className?: string }) {
  const t = useT();
  return (
    <label className={`flex min-h-11 items-center justify-between gap-4 py-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className ?? ""}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug">{label}</span>
        {description && <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{description}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span aria-hidden className={`min-w-[2.5em] text-end text-[0.875rem] font-semibold leading-none ${checked && !disabled ? "text-foreground" : "text-muted"}`}>{checked ? t("On") : t("Off")}</span>
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className="relative h-8 w-14 shrink-0 rounded-full border-[1.5px] border-edge bg-card transition-colors after:absolute after:start-[calc(0.25rem_-_1.5px)] after:top-[calc(0.25rem_-_1.5px)] after:h-6 after:w-6 after:rounded-full after:bg-edge after:transition-[inset-inline-start,background-color] peer-checked:border-on-sun peer-checked:bg-sun peer-checked:shadow-[0_0_0_0.5px_var(--on-sun)] peer-checked:after:start-[calc(100%_-_1.75rem_+_1.5px)] peer-checked:after:bg-on-sun peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:border-transparent peer-disabled:bg-soft-strong peer-disabled:shadow-none peer-disabled:after:bg-muted"
        />
      </span>
    </label>
  );
}
