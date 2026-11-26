"use client";

import { BODY_FAT_DRAWINGS, type BodySet } from "@/lib/mm/bodyGoal";
import { useT } from "../_lib/i18n";

// The body-fat drawings (founder 2026-11-26: "maybe you could show a visual of different body fats if they're not sure ... like a drawing"; "they should only come
// up if someone clicks what body fat am I ... and maybe it just says choose one"). Our own simple outlines, drawn from numbers (no photos, no AI pictures): a
// head, arms and a torso whose waist and hips widen with each step, with a hint of muscle lines on the leanest. Six steps for women (15 to 40%) and men (10 to
// 35%), the steps the usual published guides use. Each is a big tile named "About 25%"; the outline is decoration for a screen reader.

interface Build {
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  arm: number;
}

/** The outline's half-widths for a step (0 the leanest, 1 the highest). */
function build(set: BodySet, t: number): Build {
  return set === "male"
    ? { shoulder: 25 + 4 * t, chest: 22 + 7 * t, waist: 15 + 18 * t, hip: 18 + 13 * t, arm: 6 + 5 * t }
    : { shoulder: 20 + 4 * t, chest: 20 + 9 * t, waist: 12 + 18 * t, hip: 22 + 14 * t, arm: 5 + 5 * t };
}

const C = 50;

/** The torso, shoulders to hips, mirrored about the middle. */
function torso(b: Build): string {
  const { shoulder: s, chest: c, waist: w, hip: h } = b;
  return [
    `M${C - s},36`,
    `C${C - s},46 ${C - c},48 ${C - c},55`,
    `C${C - c},63 ${C - w},66 ${C - w},74`,
    `C${C - w},82 ${C - h},84 ${C - h},94`,
    `L${C + h},94`,
    `C${C + h},84 ${C + w},82 ${C + w},74`,
    `C${C + w},66 ${C + c},63 ${C + c},55`,
    `C${C + c},48 ${C + s},46 ${C + s},36`,
    `Q${C},29 ${C - s},36Z`,
  ].join(" ");
}

export function BodyFigure({ set, step, className = "" }: { set: BodySet; step: number; className?: string }) {
  const t = step / 5;
  const b = build(set, t);
  const legW = b.hip - 3;
  return (
    <svg viewBox="0 0 100 142" aria-hidden className={className}>
      <g fill="var(--fill)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round">
        {/* arms first, so the torso's edge sits over them */}
        <rect x={C - b.shoulder - b.arm + 2} y={38} width={b.arm} height={52} rx={b.arm / 2} />
        <rect x={C + b.shoulder - 2} y={38} width={b.arm} height={52} rx={b.arm / 2} />
        <rect x={C - b.hip + 1} y={90} width={legW} height={48} rx={legW / 2.5} />
        <rect x={C + 2} y={90} width={legW} height={48} rx={legW / 2.5} />
        <path d={torso(b)} />
        <rect x={C - 4} y={25} width={8} height={9} rx={3} />
        <circle cx={C} cy={16} r={10} />
      </g>
      {/* the leanest two show a hint of muscle lines */}
      {step <= 1 && (
        <g stroke="var(--edge)" strokeWidth="1" strokeLinecap="round" opacity={step === 0 ? 0.8 : 0.45}>
          {set === "male" ? (
            <>
              <path d={`M${C},58 L${C},84`} />
              {[62, 69, 76].map((y) => <path key={y} d={`M${C - 6},${y} L${C + 6},${y}`} />)}
            </>
          ) : (
            <path d={`M${C},62 L${C},82`} />
          )}
        </g>
      )}
    </svg>
  );
}

/** The six drawings as tiles: "Choose the one closest to you." */
export function BodyFatPicker({ set, value, onPick }: { set: BodySet; value: number | undefined; onPick: (bodyFat: number) => void }) {
  const t = useT();
  const steps = BODY_FAT_DRAWINGS[set];
  return (
    <div role="radiogroup" aria-label={t("Choose the one closest to you")} className="grid grid-cols-3 gap-2">
      {steps.map((pct, i) => {
        const on = value === pct;
        return (
          <button
            key={pct}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(pct)}
            className={`flex min-h-[8.75rem] flex-col items-center justify-end rounded-[1.25rem] border-[1.5px] px-1 pb-2 pt-2 transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card text-foreground"}`}
          >
            <BodyFigure set={set} step={i} className="h-[6.25rem] w-auto" />
            <span className="app-numbers mt-1 text-[0.9375rem] font-bold leading-tight">{t("About {pct}%", { pct: String(pct) })}</span>
          </button>
        );
      })}
    </div>
  );
}
