import type { ReactNode } from "react";

/**
 * A three-quarter dial in one flat colour (--bar, the app's lime), open at the bottom (Home's calories card). Like Ring it is one neutral colour for every
 * state and only says how much of the target is used; the dial is the progressbar for assistive tech and the SVG is decorative.
 * `disc` puts a plain grey circle behind the figure in the middle, with a white ring between it and the track, and opens the dial a little
 * wider at the bottom (280° of arc), like the founder's Home picture (2026-10-15, "exactly like image 2").
 */
export function Gauge({ fraction, label, size = 132, stroke = 10, disc = false, className = "", children, id }: { fraction: number; label: string; size?: number; stroke?: number; disc?: boolean; className?: string; children?: ReactNode; id: string }) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const r = 50 - stroke / 2;
  // From the lower left clockwise round the top to the lower right: 270° of arc (280° with the picture's disc).
  const [from, to] = disc ? [130, 50] : [135, 45];
  const at = (deg: number) => `${(50 + r * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(50 + r * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
  const d = `M ${at(from)} A ${r} ${r} 0 1 1 ${at(to)}`;
  void id; // kept so callers stay the same; the dial no longer needs its own gradient id
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden focusable="false">
        {disc && <circle cx="50" cy="50" r={(r - stroke / 2) * 0.66} fill="var(--ring-track)" />}
        <path d={d} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} strokeLinecap="round" pathLength={100} />
        {f > 0 && <path d={d} fill="none" stroke="var(--bar)" strokeWidth={stroke} strokeLinecap="round" pathLength={100} strokeDasharray={`${f * 100} 100`} className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none" />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
