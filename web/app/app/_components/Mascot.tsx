"use client";

import { useId, type SVGProps } from "react";

// Pip, the app's own mascot: a round green buddy with a sprout, drawn for this app (not a food, not any restaurant's character,
// CLAUDE.md rule 2). Decorative: whatever Pip "says" is real text next to it, so the drawing is hidden from screen readers, except
// where a `label` is given (Pip's entrance on the welcome steps' step 1, so a VoiceOver user learns what Pip is).
// Pip never praises a goal, a lower number or a body measurement, and never comments on the age, height or weight someone types.
//
// Moods (onboarding review, 19 November 2026): 'wave' for hellos; 'listen' for questions and reactions; 'point' (down, at what is
// under him) or 'pointUp' at what he is talking about; 'think' only while he is working and for a caution; 'cheer' only for a finish.
// Sizes (the 20 November 2026 audit): 64 beside every speech bubble (PipSays: the welcome questions, sign-in, Make it at home, Cook with what you have),
// 96 alone on a full-screen state (the camera that can't open), 40 to 44 inline beside a line of text (the welcome cover's greeting), 56 in Pip's tips.
// Each mood's arms and eyebrows live in two tables (pipArms, pipBrows) that the drawing reads, so tests/mascot.test.ts can check the
// poses without rendering: hands clear of the body, eyebrows clear of the eyes, none on cheer.

export type PipMood = "wave" | "listen" | "think" | "point" | "pointUp" | "cheer";
export const PIP_MOODS: readonly PipMood[] = ["wave", "listen", "think", "point", "pointUp", "cheer"];

const INK = "#052e16";
const EDGE = "#065f46"; // the body's outline, and the edge round a hand held in front of him
const LIMB = "#15803d"; // arms and hands (about 5:1 on white, 4:1 on the lime circles)
const FOOT = "#047857";

/** The body circle, in the drawing's 140 × 150 units. */
export const PIP_BODY = { cx: 70, cy: 80, r: 44 } as const;
export const PIP_ARM_WIDTH = 11;
export const PIP_HAND_R = 7.5;
/** Thinner and shorter than the meeting's 4.5 (lead, 19 Nov: at 4.5 the brows made him look stern at 56 to 190 px). */
export const PIP_BROW_WIDTH = 3.2;
/** The top of the eye whites (cy 76, ry 10): an eyebrow keeps at least 3 units above it, stroke included. */
export const PIP_EYE_TOP = 66;

/** One arm: its path from inside the body out to the hand, and the hand's centre. `front`: drawn in front of the body, over a dark
 *  edge (think's hand at his chin); every other arm is drawn behind the body and joins under its outline. `wave`: swings (wave only). */
export type PipArm = { d: string; hand: { x: number; y: number }; front?: boolean; wave?: boolean };

const LEFT_DOWN: PipArm = { d: "M30 90 L18 104", hand: { x: 17, y: 105 } };
const ARMS: Record<PipMood, readonly PipArm[]> = {
  wave: [LEFT_DOWN, { d: "M108 78 L124 56", hand: { x: 125, y: 54 }, wave: true }],
  listen: [LEFT_DOWN, { d: "M110 90 L122 104", hand: { x: 123, y: 105 } }],
  think: [LEFT_DOWN, { d: "M112 96 Q106 108 90 105", hand: { x: 88, y: 104 }, front: true }],
  point: [LEFT_DOWN, { d: "M108 98 L124 118", hand: { x: 126, y: 120 } }],
  pointUp: [LEFT_DOWN, { d: "M108 72 L118 46", hand: { x: 119, y: 44 } }],
  cheer: [{ d: "M34 72 L16 50", hand: { x: 15, y: 48 } }, { d: "M106 72 L124 50", hand: { x: 125, y: 48 } }],
};
export function pipArms(mood: PipMood): readonly PipArm[] {
  return ARMS[mood] ?? ARMS.wave;
}

/** Eyebrow paths (INK, PIP_BROW_WIDTH wide, round caps), drawn outside the blinking eyes so a blink doesn't squash them. Cheer has
 *  none: its closed-eye arcs already read. */
const BROWS_OPEN = ["M50 59.5 Q56 55.5 62 58.5", "M78 58.5 Q84 55.5 90 59.5"] as const;
const BROWS: Record<PipMood, readonly string[]> = {
  wave: BROWS_OPEN,
  point: BROWS_OPEN,
  pointUp: BROWS_OPEN,
  listen: ["M50 59.5 Q56 56.5 62 59", "M78 59 Q84 56.5 90 59.5"],
  // one brow raised, the other gently arched: curious, never stern
  think: ["M49 55.5 Q55 51 61 54.5", "M79 58.5 Q85 56.5 91 58.5"],
  cheer: [],
};
export function pipBrows(mood: PipMood): readonly string[] {
  return BROWS[mood] ?? BROWS.wave;
}

/** The left pupil (the right one sits 28 units further right; each has a glint 2 up and 2 right), the mouth, the sprout's tilt
 *  (degrees for the right leaf; the left leaf turns the other way: cheer perks up, listen and think droop a little) and the lean. */
type Face = { pupil: { x: number; y: number; r: number } | null; mouth: string; leafTilt: number; lean?: string };
const SMILE = "M60 93 Q70 103 80 93";
const FACES: Record<PipMood, Face> = {
  wave: { pupil: { x: 57, y: 77, r: 5.2 }, mouth: SMILE, leafTilt: 0 },
  listen: { pupil: { x: 56, y: 77, r: 5.6 }, mouth: "M62 94 Q70 101 78 94", leafTilt: 8, lean: "rotate(-4 70 120)" },
  think: { pupil: { x: 59, y: 73, r: 5.2 }, mouth: "M64 97 Q70 99 76 96", leafTilt: 8 },
  point: { pupil: { x: 59, y: 80, r: 5.2 }, mouth: SMILE, leafTilt: 0 },
  pointUp: { pupil: { x: 58, y: 73, r: 5.2 }, mouth: SMILE, leafTilt: 0 },
  cheer: { pupil: null, mouth: "M57 92 Q70 110 83 92 Z", leafTilt: -15 },
};

export function Pip({ mood = "wave", size = 120, className = "", label }: { mood?: PipMood; size?: number; className?: string; label?: string }) {
  const uid = useId().replace(/:/g, "");
  const body = `pip-body-${uid}`, leaf = `pip-leaf-${uid}`, eyes = `pip-eyes-${uid}`;
  const face = FACES[mood] ?? FACES.wave;
  const arms = pipArms(mood);
  const brows = pipBrows(mood);
  const tilt = face.leafTilt;
  const a11y: SVGProps<SVGSVGElement> = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg viewBox="0 0 140 150" width={size} height={(size * 150) / 140} {...a11y} focusable="false" className={`pip shrink-0 overflow-visible ${className}`}>
      <defs>
        <linearGradient id={body} x1="0.15" y1="0.05" x2="0.85" y2="1">
          <stop offset="0" stopColor="#86efac" />
          <stop offset="0.45" stopColor="#4ade80" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={leaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bef264" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
        <clipPath id={eyes}>
          <ellipse cx="56" cy="76" rx="8.5" ry="10" />
          <ellipse cx="84" cy="76" rx="8.5" ry="10" />
        </clipPath>
      </defs>
      <ellipse className="pip-shadow" cx="70" cy="141" rx="32" ry="5.5" fill="rgba(0,0,0,0.14)" />
      <g className="pip-bob">
        {/* an inner group: the bob's CSS transform would override a transform attribute on .pip-bob itself */}
        <g transform={face.lean}>
          {/* sprout: leaves 25% bigger about their stem points, at a fixed angle per mood */}
          <path d="M70 36 C70 28 71 22 74 16" stroke="#15803d" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M73 19 C80 8 94 8 98 14 C92 22 80 24 73 19 Z" fill={`url(#${leaf})`} transform={`rotate(${tilt} 73 19) translate(73 19) scale(1.25) translate(-73 -19)`} />
          <path d="M72 22 C64 13 52 14 49 20 C55 27 66 27 72 22 Z" fill={`url(#${leaf})`} transform={`rotate(${-tilt} 72 22) translate(72 22) scale(1.25) translate(-72 -22)`} />
          {/* arms (behind the body) */}
          <Arms mood={mood} />
          {/* body */}
          <circle cx={PIP_BODY.cx} cy={PIP_BODY.cy} r={PIP_BODY.r} fill={`url(#${body})`} stroke={EDGE} strokeWidth="2.5" />
          <ellipse cx="54" cy="58" rx="16" ry="10" fill="#ffffff" opacity="0.38" transform="rotate(-24 54 58)" />
          {/* feet */}
          <ellipse cx="56" cy="124" rx="10" ry="5.5" fill={FOOT} />
          <ellipse cx="84" cy="124" rx="10" ry="5.5" fill={FOOT} />
          {/* a hand in front of the body (think's chin): a dark edge first, so green on green still shows */}
          {arms.filter((a) => a.front).map((a) => (
            <g key={a.d}>
              <Limb arm={a} edge />
              <Limb arm={a} />
            </g>
          ))}
          {/* face */}
          {face.pupil ? (
            <g className="pip-eyes">
              <ellipse cx="56" cy="76" rx="8.5" ry="10" fill="#ffffff" />
              <ellipse cx="84" cy="76" rx="8.5" ry="10" fill="#ffffff" />
              <g clipPath={`url(#${eyes})`}>
                <circle cx={face.pupil.x} cy={face.pupil.y} r={face.pupil.r} fill={INK} />
                <circle cx={face.pupil.x + 28} cy={face.pupil.y} r={face.pupil.r} fill={INK} />
                <circle cx={face.pupil.x + 2} cy={face.pupil.y - 2} r="1.8" fill="#ffffff" />
                <circle cx={face.pupil.x + 30} cy={face.pupil.y - 2} r="1.8" fill="#ffffff" />
              </g>
            </g>
          ) : (
            <g stroke={INK} strokeWidth="4.2" strokeLinecap="round" fill="none">
              <path d="M48 77 Q56 68 64 77" />
              <path d="M76 77 Q84 68 92 77" />
            </g>
          )}
          {brows.length > 0 && (
            <g stroke={INK} strokeWidth={PIP_BROW_WIDTH} strokeLinecap="round" fill="none">
              {brows.map((d) => <path key={d} d={d} />)}
            </g>
          )}
          <ellipse cx="45" cy="92" rx="6" ry="3.6" fill="#fda4af" opacity="0.9" />
          <ellipse cx="95" cy="92" rx="6" ry="3.6" fill="#fda4af" opacity="0.9" />
          {mood === "cheer" ? (
            <path d={face.mouth} fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          ) : (
            <path d={face.mouth} stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
          )}
        </g>
      </g>
    </svg>
  );
}

function Limb({ arm, edge = false }: { arm: PipArm; edge?: boolean }) {
  const colour = edge ? EDGE : LIMB;
  return (
    <>
      <path d={arm.d} stroke={colour} strokeWidth={edge ? PIP_ARM_WIDTH + 4 : PIP_ARM_WIDTH} strokeLinecap="round" fill="none" />
      <circle cx={arm.hand.x} cy={arm.hand.y} r={edge ? PIP_HAND_R + 2 : PIP_HAND_R} fill={colour} />
    </>
  );
}

/** The arms behind the body: cheer's both bounce, wave's right one swings, the others hold still. */
function Arms({ mood }: { mood: PipMood }) {
  const limbs = pipArms(mood).filter((a) => !a.front).map((a) => (a.wave ? <g key={a.d} className="pip-wave"><Limb arm={a} /></g> : <Limb key={a.d} arm={a} />));
  return <g className={mood === "cheer" ? "pip-cheer" : undefined}>{limbs}</g>;
}

/**
 * A bubble's words, with room kept for every line the screen can say (`reserve`), so the bubble never changes height when Pip reacts and the choices under it
 * never move under the person's finger (the 20 November 2026 audit). All the lines sit in one grid cell; the ones not being said are invisible and hidden from
 * screen readers, so only the line being said is read.
 */
export function BubbleWords({ reserve, children }: { reserve?: readonly React.ReactNode[]; children: React.ReactNode }) {
  if (!reserve?.length) return <>{children}</>;
  return (
    <span className="grid">
      {reserve.map((line, i) => <span key={i} aria-hidden className="invisible [grid-area:1/1]">{line}</span>)}
      <span className="[grid-area:1/1]">{children}</span>
    </span>
  );
}

/**
 * Pip with a speech bubble: the words are ordinary text, read by screen readers.
 * `lively` (onboarding, founder 2026-10-15): Pip hops in and the bubble pops up, and again whenever `pulse` changes (a reaction to
 * an answer). Nothing moves for reduced motion. `reserve`: every line this bubble can say on the screen (see BubbleWords).
 */
export function PipSays({ mood, children, size = 64, lively = false, pulse, reserve }: { mood?: PipMood; children: React.ReactNode; size?: number; lively?: boolean; pulse?: string | number; reserve?: readonly React.ReactNode[] }) {
  const bubble = "speech glass relative mb-3 min-w-0 flex-1 rounded-3xl rounded-es-md px-4 py-3 text-[15px] font-medium leading-snug";
  if (!lively) {
    return (
      <div className="flex items-end gap-3">
        <Pip mood={mood} size={size} />
        <p className={bubble}><BubbleWords reserve={reserve}>{children}</BubbleWords></p>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-3">
      <span key={`pip-${pulse ?? ""}`} className="pip-hop-sm inline-flex shrink-0"><Pip mood={mood} size={size} /></span>
      <p key={`says-${pulse ?? ""}`} className={`${bubble} bubble-pop`}><BubbleWords reserve={reserve}>{children}</BubbleWords></p>
    </div>
  );
}
