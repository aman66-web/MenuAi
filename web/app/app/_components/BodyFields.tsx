"use client";

import { useId, useState } from "react";
import { isPartNumber, readAge } from "@/lib/mm/bodyUnits";
import { tk } from "@/lib/mm/i18n";
import {
  heightCmOf, switchHeightUnit, switchWeightUnit, typeHeight, typeWeight, weightKgOf, type HeightAnswer, type WeightAnswer,
} from "@/lib/mm/onboardingPlan";
import { ACTIVITY_LABEL, planNoteText, type Activity, type PlanNote, type Sex } from "@/lib/mm/targets";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { PickTile } from "./DietPicker";
import { ShieldIcon } from "./icons";
import { NumberDone } from "./SearchDone";
import { Field, inputClass, radioKeyNav, Segmented } from "./ui";

// The questions that work out the daily targets (founder 2026-10-16): sex, age, weight, height and how active. One set of fields for the three
// onboarding screens before "Your daily targets" and for the single-screen form in Settings, so the two can't drift apart. Each field is a block with a
// small spaced-capitals label; the host puts it in a white card (onboarding) or in the card it already sits in (Settings).
//
// PRIVACY (CLAUDE.md rule 4): what is typed here lives in the host's React state and nowhere else: no storage, no address, no analytics, no request. The
// boxes switch the browser's own form memory off (`autoComplete="off"`).

/** The small spaced-capitals label of a block (Home's "CALORIES"). */
const CAPS = "text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted";
/** A white card for one block of fields on the grey page. */
export const BODY_CARD = "glass rounded-[1.25rem] p-4";
/** A calm line under a field that needs another look: plain, never red, and not a grey box that would read as one more field. */
const MESSAGE = "mt-3 text-[0.9375rem] font-medium leading-snug";

const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "male", label: tk("Male") },
  { value: "female", label: tk("Female") },
  { value: "unspecified", label: tk("Prefer not to say") },
];

/**
 * The label row of a block that has number boxes: the words at the start, and room above the boxes for the Done button (NumberDone) at the end. The row's
 * height plus the gap under it is the Done pill's height and the tap area stretched round it, so the pill never touches the control or its focus ring.
 */
function BlockLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return <div className="mb-2 flex h-6 items-start"><p id={id} className={`${CAPS} leading-4`}>{children}</p></div>;
}

/**
 * Whether the person has left a block of number boxes since they last typed in it. "That weight doesn't look right" is only said then: judged on every
 * key it would call the first digit of an ordinary 83 kg or 183 cm a mistake, and a screen reader would announce it. Going back into the block takes
 * the message away while the person is typing again; leaving it with the value still wrong brings it back.
 */
function useLeftBlock() {
  const [left, setLeft] = useState(false);
  return {
    left,
    reset: () => setLeft(false),
    handlers: {
      onBlur: (e: React.FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLeft(true); },
      onFocus: (e: React.FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLeft(false); },
    },
  };
}

export function SexTiles({ value, onChange }: { value: Sex; onChange: (s: Sex) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div>
      <BlockLabel id={id}>{t("Sex, to work out your numbers")}</BlockLabel>
      {/* Male and Female side by side, "Prefer not to say" on its own full-width tile under them; with large text the columns
          become one (the minimum column width is in rem, so it grows with the text) and no word is ever broken in two. */}
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2.5">
        {SEX_OPTIONS.map((o, i) => (
          <PickTile
            key={o.value}
            on={o.value === value}
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => radioKeyNav(e, i, SEX_OPTIONS.length, (n) => onChange(SEX_OPTIONS[n]!.value))}
            className={`text-[0.9375rem] font-semibold leading-snug ${i === SEX_OPTIONS.length - 1 ? "col-span-full" : ""}`}
          >
            {t(o.label)}
          </PickTile>
        ))}
      </div>
    </div>
  );
}

const BOX = `${inputClass} app-numbers text-[1.25rem] font-medium`;

export function AgeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const id = useId();
  // Under 18 is not a mistake here (the plan answers it: "Ask a doctor or dietitian for targets."), so only a number the plan can't use is pointed out.
  const bad = value.trim() !== "" && readAge(value).kind === "invalid";
  return (
    <div className="group/nums relative">
      <BlockLabel><label htmlFor={`${id}-age`}>{t("Age")}</label></BlockLabel>
      <input
        id={`${id}-age`}
        className={BOX}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-msg` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {bad && <p id={`${id}-msg`} role="alert" className={MESSAGE}>{t("Enter your age as a whole number from 18 to 100.")}</p>}
      <NumberDone />
    </div>
  );
}

export function WeightField({ value, onChange }: { value: WeightAnswer; onChange: (w: WeightAnswer) => void }) {
  const t = useT();
  const id = useId();
  const kg = value.unit === "kg";
  const typed = value.major.trim() !== "" || value.minor.trim() !== "";
  const part = value.unit === "st" && isPartNumber(value.major);
  const block = useLeftBlock();
  const off = block.left && typed && !part && weightKgOf(value) === undefined;
  const message = part ? t("Use the pounds box for part of a stone.") : off ? t("That weight doesn't look right. Please check it.") : null;
  return (
    <div role="group" aria-label={t("Weight")} className="relative" {...block.handlers}>
      <BlockLabel>{t("Weight")}</BlockLabel>
      <Segmented
        label={t("Weight unit")}
        value={value.unit}
        options={[{ value: "st", label: t("Stone and pounds") }, { value: "kg", label: t("Kilograms") }]}
        onChange={(unit) => { block.reset(); onChange(switchWeightUnit(value, unit)); }}
      />
      {/* the Done pill answers to the number boxes only (not to the unit choice above them), so it has its own group */}
      <div className="group/nums mt-3">
        <div className="grid grid-cols-2 gap-3">
          {kg ? (
            <div className="col-span-full">
              <Field label={t("Kilograms")}><input className={BOX} inputMode="decimal" autoComplete="off" aria-invalid={off || undefined} aria-describedby={message ? `${id}-msg` : undefined} value={value.major} onChange={(e) => onChange(typeWeight(value, { major: e.target.value }))} /></Field>
            </div>
          ) : (
            <>
              <Field label={t("Stone")}><input className={BOX} inputMode="numeric" autoComplete="off" aria-invalid={part || off || undefined} aria-describedby={message ? `${id}-msg` : undefined} value={value.major} onChange={(e) => onChange(typeWeight(value, { major: e.target.value }))} /></Field>
              <Field label={t("Pounds")}><input className={BOX} inputMode="decimal" autoComplete="off" aria-invalid={off || undefined} aria-describedby={message ? `${id}-msg` : undefined} value={value.minor} onChange={(e) => onChange(typeWeight(value, { minor: e.target.value }))} /></Field>
            </>
          )}
        </div>
        {message && <p id={`${id}-msg`} role="alert" className={MESSAGE}>{message}</p>}
        <NumberDone />
      </div>
    </div>
  );
}

export function HeightField({ value, onChange }: { value: HeightAnswer; onChange: (h: HeightAnswer) => void }) {
  const t = useT();
  const id = useId();
  const cm = value.unit === "cm";
  const typed = value.major.trim() !== "" || value.minor.trim() !== "";
  const part = value.unit === "ft" && isPartNumber(value.major);
  const block = useLeftBlock();
  const off = block.left && typed && !part && heightCmOf(value) === undefined;
  const message = part ? t("Use the inches box for part of a foot.") : off ? t("That height doesn't look right. Please check it.") : null;
  return (
    <div role="group" aria-label={t("Height")} className="relative" {...block.handlers}>
      <BlockLabel>{t("Height")}</BlockLabel>
      <Segmented
        label={t("Height unit")}
        value={value.unit}
        options={[{ value: "ft", label: t("Feet and inches") }, { value: "cm", label: t("Centimetres") }]}
        onChange={(unit) => { block.reset(); onChange(switchHeightUnit(value, unit)); }}
      />
      <div className="group/nums mt-3">
        <div className="grid grid-cols-2 gap-3">
          {cm ? (
            <div className="col-span-full">
              <Field label={t("Centimetres")}><input className={BOX} inputMode="decimal" autoComplete="off" aria-invalid={off || undefined} aria-describedby={message ? `${id}-msg` : undefined} value={value.major} onChange={(e) => onChange(typeHeight(value, { major: e.target.value }))} /></Field>
            </div>
          ) : (
            <>
              <Field label={t("Feet")}><input className={BOX} inputMode="numeric" autoComplete="off" aria-invalid={part || off || undefined} aria-describedby={message ? `${id}-msg` : undefined} value={value.major} onChange={(e) => onChange(typeHeight(value, { major: e.target.value }))} /></Field>
              <Field label={t("Inches")}><input className={BOX} inputMode="decimal" autoComplete="off" aria-invalid={off || undefined} aria-describedby={message ? `${id}-msg` : undefined} value={value.minor} onChange={(e) => onChange(typeHeight(value, { minor: e.target.value }))} /></Field>
            </>
          )}
        </div>
        {message && <p id={`${id}-msg`} role="alert" className={MESSAGE}>{message}</p>}
        <NumberDone />
      </div>
    </div>
  );
}

const ACTIVITIES = Object.keys(ACTIVITY_LABEL) as Activity[];

/** How active a normal week is: the four existing choices as tiles. `compact` is the two-by-two block for the Settings form; the onboarding's are big, one a row. */
export function ActivityTiles({ value, onChange, compact }: { value: Activity; onChange: (a: Activity) => void; compact?: boolean }) {
  const t = useT();
  const id = useId();
  return (
    <div>
      {compact && <BlockLabel id={id}>{t("Activity")}</BlockLabel>}
      <div role="radiogroup" aria-label={compact ? undefined : t("Activity")} aria-labelledby={compact ? id : undefined} className={compact ? "grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2.5" : "space-y-2.5"}>
        {ACTIVITIES.map((a, i) => (
          <PickTile
            key={a}
            on={a === value}
            tall={!compact}
            role="radio"
            aria-checked={a === value}
            tabIndex={a === value ? 0 : -1}
            onClick={() => onChange(a)}
            onKeyDown={(e) => radioKeyNav(e, i, ACTIVITIES.length, (n) => onChange(ACTIVITIES[n]!))}
            className={compact ? "text-[0.9375rem] font-semibold leading-snug" : "w-full text-[1.0625rem] font-bold leading-tight tracking-[-0.01em]"}
          >
            {t(ACTIVITY_LABEL[a])}
          </PickTile>
        ))}
      </div>
    </div>
  );
}

/** Says, truthfully, that the answers are not kept: they stay in this screen's memory, are used to work out the numbers and are never saved or sent. */
export function BodyPrivacyNote() {
  const t = useT();
  return (
    <p className="mt-4 flex items-start gap-2.5 text-[0.9375rem] leading-snug text-muted">
      <ShieldIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span>{t("Your answers are only used to work out your numbers. They aren't saved or sent anywhere.")}</span>
    </p>
  );
}

/** The lines under suggested targets (the plan's notes), calm and plain: check the measurements, the 1,200 floor, a doctor or dietitian first, the medicine plan, the diet's protein. */
export function PlanNotes({ notes, className = "" }: { notes: readonly PlanNote[]; className?: string }) {
  const t = useT();
  if (notes.length === 0) return null;
  return (
    <ul className={`space-y-2 ${className}`}>
      {notes.map((n) => (<li key={n} className="text-[0.9375rem] font-medium leading-snug">{planNoteText(n, t, site.name)}</li>))}
    </ul>
  );
}
