"use client";

import { useId } from "react";

// Pip, the app's own mascot: a round green buddy with a sprout, drawn for this app (not a food, not any restaurant's character,
// CLAUDE.md rule 2). Decorative: whatever Pip "says" is real text next to it, so the drawing is hidden from screen readers.

export type PipMood = "wave" | "think" | "point" | "cheer";

const INK = "#052e16";

export function Pip({ mood = "wave", size = 120, className = "" }: { mood?: PipMood; size?: number; className?: string }) {
  const happy = mood === "cheer";
  const uid = useId().replace(/:/g, "");
  const body = `pip-body-${uid}`, leaf = `pip-leaf-${uid}`;
  return (
    <svg viewBox="0 0 140 150" width={size} height={(size * 150) / 140} aria-hidden focusable="false" className={`pip shrink-0 overflow-visible ${className}`}>
      <defs>
        <linearGradient id={body} x1="0.15" y1="0.05" x2="0.85" y2="1">
          <stop offset="0" stopColor="#d9f99d" />
          <stop offset="0.45" stopColor="#4ade80" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={leaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bef264" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <ellipse className="pip-shadow" cx="70" cy="141" rx="32" ry="5.5" fill="rgba(0,0,0,0.14)" />
      <g className="pip-bob">
        {/* sprout */}
        <path d="M70 36 C70 28 71 22 74 16" stroke="#15803d" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M73 19 C80 8 94 8 98 14 C92 22 80 24 73 19 Z" fill={`url(#${leaf})`} />
        <path d="M72 22 C64 13 52 14 49 20 C55 27 66 27 72 22 Z" fill={`url(#${leaf})`} />
        {/* arms (behind the body) */}
        <Arms mood={mood} />
        {/* body */}
        <circle cx="70" cy="80" r="44" fill={`url(#${body})`} />
        <ellipse cx="54" cy="58" rx="16" ry="10" fill="#ffffff" opacity="0.38" transform="rotate(-24 54 58)" />
        {/* feet */}
        <ellipse cx="56" cy="124" rx="10" ry="5.5" fill="#047857" />
        <ellipse cx="84" cy="124" rx="10" ry="5.5" fill="#047857" />
        {/* face */}
        {happy ? (
          <g stroke={INK} strokeWidth="4.2" strokeLinecap="round" fill="none">
            <path d="M48 77 Q56 68 64 77" />
            <path d="M76 77 Q84 68 92 77" />
          </g>
        ) : (
          <g className="pip-eyes">
            <ellipse cx="56" cy="76" rx="8.5" ry="10" fill="#ffffff" />
            <ellipse cx="84" cy="76" rx="8.5" ry="10" fill="#ffffff" />
            <circle cx={mood === "think" ? 54 : mood === "point" ? 59 : 57} cy={mood === "think" ? 72 : 77} r="5.2" fill={INK} />
            <circle cx={mood === "think" ? 82 : mood === "point" ? 87 : 85} cy={mood === "think" ? 72 : 77} r="5.2" fill={INK} />
            <circle cx={mood === "think" ? 56 : mood === "point" ? 61 : 59} cy={mood === "think" ? 70 : 75} r="1.8" fill="#ffffff" />
            <circle cx={mood === "think" ? 84 : mood === "point" ? 89 : 87} cy={mood === "think" ? 70 : 75} r="1.8" fill="#ffffff" />
          </g>
        )}
        <ellipse cx="45" cy="92" rx="6.5" ry="4" fill="#fb7185" opacity="0.5" />
        <ellipse cx="95" cy="92" rx="6.5" ry="4" fill="#fb7185" opacity="0.5" />
        {happy ? (
          <path d="M57 92 Q70 110 83 92 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        ) : mood === "think" ? (
          <path d="M64 96 Q70 99 76 96" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M60 93 Q70 103 80 93" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        )}
      </g>
    </svg>
  );
}

function Arms({ mood }: { mood: PipMood }) {
  const arm = { stroke: "#047857", strokeWidth: 9, strokeLinecap: "round" as const, fill: "none" };
  const hand = { fill: "#047857" };
  if (mood === "cheer") {
    return (
      <g className="pip-cheer">
        <path d="M34 72 L16 50" {...arm} /><circle cx="15" cy="48" r="6.5" {...hand} />
        <path d="M106 72 L124 50" {...arm} /><circle cx="125" cy="48" r="6.5" {...hand} />
      </g>
    );
  }
  const left = <><path d="M30 90 L18 104" {...arm} /><circle cx="17" cy="105" r="6.5" {...hand} /></>;
  if (mood === "think") {
    return (<g>{left}<path d="M108 92 L96 106" {...arm} /><circle cx="94" cy="107" r="6.5" {...hand} /></g>);
  }
  if (mood === "point") {
    return (<g>{left}<path d="M110 82 L132 76" {...arm} /><circle cx="134" cy="75" r="6.5" {...hand} /></g>);
  }
  return (
    <g>
      {left}
      <g className="pip-wave"><path d="M108 78 L124 56" {...arm} /><circle cx="125" cy="54" r="6.5" {...hand} /></g>
    </g>
  );
}

/** Pip with a speech bubble: the words are ordinary text, read by screen readers. */
export function PipSays({ mood, children, size = 92 }: { mood?: PipMood; children: React.ReactNode; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <Pip mood={mood} size={size} />
      <p className="speech glass relative mb-3 min-w-0 flex-1 rounded-3xl rounded-es-md px-4 py-3 text-[15px] font-medium leading-snug">{children}</p>
    </div>
  );
}
