"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatInt } from "@/lib/mm/format";
import { BOTTLE_FULL_ML, DRAG_STEP_ML, levelToMl, stepMl } from "@/lib/mm/water";

// Our own drawing of a clear water bottle (no photo, no brand): a soft rounded body with a little sheen down one side, a dark cap and a faint
// shadow under it, holding blue water up to `level` (0 to 1). The water's surface moves: two waves drift sideways at different speeds and a few
// bubbles rise now and then; when the level changes it glides there with a soft spring and the surface sloshes for a moment (founder 2026-11-17,
// on the "Add water" sheet: "It could look so much more better. So make it better"). Everything moves with CSS transforms on the SVG (no script
// loop), and nothing drifts, rises or sloshes for reduced motion (globals.css, "Water bottle").
//
// On Home it is small and calm: today's level only. In the "Add water" sheet it is a slider (founder 2026-10-16: "a water bottle which you can move
// up"): drag the water up or down with a finger or the mouse, or use the arrow keys (50 ml a step, Page Up and Page Down 250 ml, Home and End for
// empty and full); `onChange` gets the amount in millilitres, snapped to DRAG_STEP_ML. There it also has a measuring scale (250, 500, 750 ml and
// 1 litre), a lime handle on the water line and, while it is dragged or moved with the keyboard, the amount in a small label beside the handle. The box
// is always 1 : 2 like the drawing, so a finger's height in the box is its height in the drawing; callers set only the width.
// The colour meeting (19 November 2026, approved by the founder that day): the water keeps its own blues (they are only 1.4 to 2.9:1 on white), so the bottle
// and the water's level line carry a 1.5 px outline in the control edge grey (--edge, 3.99:1 on white), the same width at any size (non-scaling strokes);
// the handle, a lime "where you are" mark, has the 2 px dark-green edge, and the amount beside it is the ink tag of the toasts.

const VIEW_W = 60;
const VIEW_H = 120;
/** Where the water sits in the drawing: empty at the bottom of the body, full where the shoulders begin. */
const WATER_BOTTOM = 113;
const WATER_TOP = 24;
const TRAVEL = WATER_BOTTOM - WATER_TOP;
/** The bottle's left and right sides in the drawing (the scale's words sit just outside the right one). */
const SIDE_L = 9;
const SIDE_R = 51;
const BODY = `M23 9.5H37V12.5C37 16.5 ${SIDE_R} 16 ${SIDE_R} 26V104A9 9 0 01${SIDE_R - 9} 113H${SIDE_L + 9}A9 9 0 01${SIDE_L} 104V26C${SIDE_L} 16 23 16.5 23 12.5Z`;

/** One wavelength of the surface, in drawing units; the waves drift by exactly this much (globals.css, water-drift), so the loop has no seam. */
const WAVE = 24;
/** A wave along y = 0 from x = -48 to 120 (seven wavelengths, wider than the bottle wherever it has drifted to), filled down below the bottle. */
function wave(amp: number, phase = 0): { fill: string; crest: string } {
  const half = WAVE / 2;
  let crest = `M${-48 + phase} 0`;
  for (let x = -48 + phase, up = true; x < 120 + phase; x += half, up = !up) crest += `Q${x + half / 2} ${up ? -amp : amp} ${x + half} 0`;
  return { crest, fill: `${crest}V150H${-48 + phase}Z` };
}
const FRONT = wave(2.5);
const BACK = wave(2.1, WAVE / 4);

/** The scale on the sheet's bottle, in millilitres: long marks with words, short ones between. */
const MARKS = [250, 500, 750, 1000];
const MINOR = [125, 375, 625, 875];
const markY = (ml: number) => WATER_BOTTOM - (ml / BOTTLE_FULL_ML) * TRAVEL;

/** A few bubbles: where they start (below the surface, which is y = 0 here) and how they rise; each stops a little under the surface. */
const BUBBLES = [
  { x: 20, from: 84, r: 1.3, s: "5.6s", d: "0.4s" },
  { x: 36, from: 66, r: 0.9, s: "4.4s", d: "1.9s" },
  { x: 27, from: 88, r: 1.5, s: "6.8s", d: "3.2s" },
  { x: 42, from: 58, r: 1, s: "5.2s", d: "4.5s" },
];

const SPRING = "transform 720ms cubic-bezier(0.28, 1.3, 0.5, 1)";
const FOLLOW = "transform 140ms ease-out";

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
  // The sheet's bottle fills up from empty once it has slid in; Home's shows today's level straight away.
  const [filled, setFilled] = useState(!interactive);
  useEffect(() => {
    if (filled) return;
    const t = window.setTimeout(() => setFilled(true), 180);
    return () => window.clearTimeout(t);
  }, [filled]);

  const target = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  const shown = filled ? target : 0;
  const lift = (1 - shown) * TRAVEL; // how far the water sits below full, in drawing units

  // The surface sloshes once each time the level moves (not while a finger is moving it: then the waves just rise higher), by switching between two
  // identical animations, which restarts it without restarting the drifting waves inside.
  const [seen, setSeen] = useState(shown);
  const [sloshes, setSloshes] = useState(0);
  if (seen !== shown) {
    setSeen(shown);
    if (!dragging) setSloshes(sloshes + 1);
  }
  const slosh = sloshes === 0 ? "" : sloshes % 2 ? "water-slosh-a" : "water-slosh-b";
  const transition = dragging ? FOLLOW : SPRING;

  const fromPointer = (e: PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.height === 0) return;
    const y = ((e.clientY - box.top) / box.height) * VIEW_H;
    onChange?.(levelToMl((WATER_BOTTOM - y) / TRAVEL));
  };

  const drawing = (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full overflow-visible" aria-hidden focusable="false">
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={BODY} />
        </clipPath>
        {/* Clear plastic: a little tint at the edges, brighter in the middle. */}
        <linearGradient id={`${id}-glass`} x1={SIDE_L} x2={SIDE_R} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d7e7ee" />
          <stop offset="0.22" stopColor="#f9fcfd" />
          <stop offset="0.6" stopColor="#eef5f8" />
          <stop offset="1" stopColor="#cfe1e9" />
        </linearGradient>
        {/* The water: light aqua at the surface (y = 0 here, it moves with the water) to a deeper blue at the bottom of a full bottle. */}
        <linearGradient id={`${id}-water`} x1={0} x2={0} y1={-2} y2={TRAVEL} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9ce6fa" />
          <stop offset="0.07" stopColor="#5ccaf3" />
          <stop offset="0.45" stopColor="#2c9fe8" />
          <stop offset="1" stopColor="#1867cf" />
        </linearGradient>
        {/* Roundness: the sides of the bottle a shade darker than the middle, over the glass and the water alike. */}
        <linearGradient id={`${id}-round`} x1={SIDE_L} x2={SIDE_R} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0a3550" stopOpacity="0.16" />
          <stop offset="0.24" stopColor="#0a3550" stopOpacity="0" />
          <stop offset="0.7" stopColor="#0a3550" stopOpacity="0" />
          <stop offset="1" stopColor="#0a3550" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1={0} x2={0} y1={30} y2={104} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.75" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1={0} x2={0} y1={1} y2={10} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a4842" />
          <stop offset="1" stopColor="#0b1a12" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`} cx={0.5} cy={0.5} r={0.5}>
          <stop offset="0" stopColor="#0b1a12" stopOpacity="0.22" />
          <stop offset="1" stopColor="#0b1a12" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={30} cy={115.2} rx={21} ry={3.4} fill={`url(#${id}-shadow)`} />
      <path d={BODY} fill={`url(#${id}-glass)`} />

      <g clipPath={`url(#${id}-body)`}>
        <g data-water-level="" style={{ transform: `translateY(${lift}px)`, transition }} className="motion-reduce:!transition-none">
          {/* No water at all is drawn as none: the waves' crests would otherwise show a sliver at the bottom of an empty bottle. */}
          <g transform={`translate(30 ${WATER_TOP})`} style={{ opacity: shown > 0 ? 1 : 0 }} className="transition-opacity duration-300">
            <g className={slosh}>
              <g className="water-amp" style={{ transform: dragging ? "scaleY(1.9)" : undefined }}>
                <g transform="translate(-30 0)">
                  <g className={interactive ? "water-wave-back" : "water-wave-back water-calm"}>
                    <path d={BACK.fill} transform="translate(0 -2)" fill="#a6e6fa" fillOpacity={0.85} />
                  </g>
                  <g className={interactive ? "water-wave" : "water-wave water-calm"}>
                    <path d={FRONT.fill} fill={`url(#${id}-water)`} />
                    <path d={FRONT.crest} fill="none" stroke="var(--edge)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </g>
                </g>
              </g>
            </g>
            {interactive && (
              <g transform="translate(-30 0)">
                {BUBBLES.map((b) => (
                  <circle
                    key={b.x}
                    className="water-bubble"
                    cx={b.x}
                    cy={b.from}
                    r={b.r}
                    fill="#fff"
                    fillOpacity={0.55}
                    stroke="#fff"
                    strokeOpacity={0.9}
                    strokeWidth={0.4}
                    style={{ ["--rise" as string]: b.from - 5, ["--bubble-s" as string]: b.s, ["--bubble-d" as string]: b.d }}
                  />
                ))}
              </g>
            )}
          </g>
        </g>
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={`url(#${id}-round)`} />
        {interactive && (
          <g strokeLinecap="round">
            {MINOR.map((m) => (
              <path key={m} d={`M${SIDE_R - 5} ${markY(m)}h3.5`} stroke="var(--muted)" strokeOpacity={0.45} strokeWidth={0.8} />
            ))}
            {MARKS.map((m) => (
              <path key={m} d={`M${SIDE_R - 8} ${markY(m)}h6.5`} stroke="var(--muted)" strokeOpacity={0.7} strokeWidth={1} />
            ))}
          </g>
        )}
        {/* The sheen: a soft white stripe down the left side and a short one at the right shoulder. */}
        <path d={`M14.2 32C13.4 46 13.4 88 14.2 102`} fill="none" stroke={`url(#${id}-sheen)`} strokeWidth={3.2} strokeLinecap="round" />
        <path d="M15.5 22.5C17 20.5 19 19.3 21 18.6" fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.3} strokeLinecap="round" />
      </g>

      <path d={BODY} fill="none" stroke="var(--edge)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {/* The cap: a ring at the neck, then the cap with a few ridges and a highlight. */}
      <rect x={22} y={8.4} width={16} height={2.4} rx={1} fill="#c3d4dc" />
      <rect x={20.5} y={1} width={19} height={8.6} rx={2.8} fill={`url(#${id}-cap)`} />
      <path d="M24.5 3v5M28.2 3v5M31.8 3v5M35.5 3v5" stroke="#000" strokeOpacity={0.28} strokeWidth={0.8} />
      <rect x={21.5} y={1.6} width={17} height={1.6} rx={0.8} fill="#fff" fillOpacity={0.16} />
    </svg>
  );

  if (!interactive) return <div aria-hidden className={`aspect-[1/2] ${className}`}>{drawing}</div>;

  const onKey = (e: KeyboardEvent) => {
    const delta = ({ ArrowUp: DRAG_STEP_ML, ArrowRight: DRAG_STEP_ML, ArrowDown: -DRAG_STEP_ML, ArrowLeft: -DRAG_STEP_ML, PageUp: 5 * DRAG_STEP_ML, PageDown: -5 * DRAG_STEP_ML } as Record<string, number>)[e.key];
    if (delta !== undefined) onChange?.(stepMl(ml, delta));
    else if (e.key === "Home") onChange?.(0);
    else if (e.key === "End") onChange?.(BOTTLE_FULL_ML);
    else return;
    e.preventDefault();
  };

  const stop = () => {
    if (!dragging) return;
    setDragging(false);
    setSloshes((n) => n + 1);
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
      onPointerUp={stop}
      onPointerCancel={stop}
      data-dragging={dragging || undefined}
      className={`water-slider relative aspect-[1/2] touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"} ${className}`}
    >
      {drawing}
      {/* The scale's words, the handle and the amount beside it (a screen reader hears the slider's own value instead). */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {MARKS.map((m) => (
          <span
            key={m}
            style={{ top: `${(markY(m) / VIEW_H) * 100}%`, left: `calc(${(SIDE_R / VIEW_W) * 100}% + 0.4rem)` }}
            className="app-numbers absolute -translate-y-1/2 whitespace-nowrap text-[0.75rem] font-semibold leading-none text-muted"
          >
            {m === BOTTLE_FULL_ML ? "1 litre" : `${formatInt(m)} ml`}
          </span>
        ))}
        <div className="absolute inset-0 motion-reduce:!transition-none" style={{ transform: `translateY(${((WATER_TOP + lift) / VIEW_H) * 100}%)`, transition }}>
          <span className={`water-handle absolute left-1/2 top-0 flex h-[0.8rem] w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded-full border-2 border-on-sun bg-sun shadow-[var(--photo-chip-shadow)] transition-[scale] duration-150 ${dragging ? "scale-115" : ""}`}>
            <i className="h-[0.35rem] w-px rounded-full bg-on-sun" />
            <i className="h-[0.35rem] w-px rounded-full bg-on-sun" />
            <i className="h-[0.35rem] w-px rounded-full bg-on-sun" />
          </span>
          <span
            style={{ right: `calc(${100 - (SIDE_L / VIEW_W) * 100}% + 0.6rem)` }}
            className={`water-tip app-numbers absolute top-0 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[0.8125rem] font-bold leading-tight text-on-ink shadow-[var(--shadow-lift)] transition-opacity duration-150 after:absolute after:-right-[3px] after:top-1/2 after:h-2 after:w-2 after:-translate-y-1/2 after:rotate-45 after:rounded-[1px] after:bg-ink after:content-[''] ${dragging ? "opacity-100" : "opacity-0"}`}
          >
            {valueText}
          </span>
        </div>
      </div>
    </div>
  );
}
