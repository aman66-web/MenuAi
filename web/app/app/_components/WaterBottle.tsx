"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BOTTLE_FULL_ML, DRAG_STEP_ML, levelToMl, stepMl } from "@/lib/mm/water";

// Our own drawing of a water bottle (no photo, no brand): a cap, a neck, shoulders and a body, filled with flat lime water up to `level` (0 to 1).
// On Home it is small and only shows today's level. In the "Add water" sheet it is a slider (founder 2026-10-16: "a water bottle which you can move
// up"): drag the water up or down with a finger or the mouse, or use the arrow keys (50 ml a step, Page Up and Page Down 250 ml, Home and End for empty
// and full); `onChange` gets the amount in millilitres, snapped to DRAG_STEP_ML. The box is always 1 : 2 like the drawing, so a finger's height in the
// box is its height in the drawing; callers set only the width.

const VIEW_W = 60;
const VIEW_H = 120;
/** Where the water sits in the drawing: empty at the bottom of the body, full where the neck begins. */
const WATER_BOTTOM = 113;
const WATER_TOP = 24;
const BODY = "M24 11h12v10c0 5 8 8 8 16v68a8 8 0 01-8 8H24a8 8 0 01-8-8V37c0-8 8-11 8-16z";

export function WaterBottle({
  level,
  className = "",
  interactive = false,
  ml = 0,
  onChange,
  label,
  valueText,
}: {
  level: number;
  className?: string;
  /** A slider the person can drag. */
  interactive?: boolean;
  /** The amount now (interactive only): what a screen reader says and where the arrow keys start. */
  ml?: number;
  onChange?: (ml: number) => void;
  label?: string;
  valueText?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const shown = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  const travel = WATER_BOTTOM - WATER_TOP;
  const lift = (1 - shown) * travel; // how far the water sits below full, in drawing units

  const fromPointer = (e: PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.height === 0) return;
    const y = ((e.clientY - box.top) / box.height) * VIEW_H;
    onChange?.(levelToMl((WATER_BOTTOM - y) / travel));
  };

  const drawing = (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full overflow-visible" aria-hidden focusable="false">
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <path d={BODY} fill="var(--fill)" />
      <g clipPath={`url(#${id}-body)`}>
        <rect
          x={0}
          y={WATER_TOP}
          width={VIEW_W}
          height={travel + 4}
          fill="var(--bar)"
          style={{ transform: `translateY(${lift}px)`, transition: dragging ? "none" : "transform 600ms ease-out" }}
          className="motion-reduce:!transition-none"
        />
        {interactive &&
          [0.25, 0.5, 0.75].map((f) => (
            <path key={f} d={`M${VIEW_W - 22} ${WATER_BOTTOM - f * travel}h6`} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} strokeLinecap="round" />
          ))}
      </g>
      <path d={BODY} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
      <rect x={21} y={2} width={18} height={9} rx={2.5} fill="currentColor" />
    </svg>
  );

  if (!interactive) return <div aria-hidden className={`aspect-[1/2] text-foreground ${className}`}>{drawing}</div>;

  const onKey = (e: KeyboardEvent) => {
    const delta = ({ ArrowUp: DRAG_STEP_ML, ArrowRight: DRAG_STEP_ML, ArrowDown: -DRAG_STEP_ML, ArrowLeft: -DRAG_STEP_ML, PageUp: 5 * DRAG_STEP_ML, PageDown: -5 * DRAG_STEP_ML } as Record<string, number>)[e.key];
    if (delta !== undefined) onChange?.(stepMl(ml, delta));
    else if (e.key === "Home") onChange?.(0);
    else if (e.key === "End") onChange?.(BOTTLE_FULL_ML);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={BOTTLE_FULL_ML}
      aria-valuenow={Math.min(BOTTLE_FULL_ML, Math.max(0, ml))}
      aria-valuetext={valueText}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (dragging) fromPointer(e);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      className={`aspect-[1/2] touch-none select-none rounded-2xl text-foreground outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent ${dragging ? "cursor-grabbing" : "cursor-grab"} ${className}`}
    >
      {drawing}
    </div>
  );
}
