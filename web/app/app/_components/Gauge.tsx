import type { ReactNode } from "react";

/**
 * A three-quarter dial in the brand gradient, open at the bottom (Home's calories card). Like Ring it is one neutral colour for every
 * state and only says how much of the target is used; the dial is the progressbar for assistive tech and the SVG is decorative.
 */
export function Gauge({ fraction, label, size = 132, stroke = 10, children, id }: { fraction: number; label: string; size?: number; stroke?: number; children?: ReactNode; id: string }) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const r = 50 - stroke / 2;
  // From 135° (lower left) clockwise round the top to 45° (lower right): 270° of arc.
  const at = (deg: number) => `${(50 + r * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(50 + r * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
  const d = `M ${at(135)} A ${r} ${r} 0 1 1 ${at(45)}`;
  const gradient = `gauge-grad-${id}`;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden focusable="false">
        <defs>
          <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#a3e635" />
            <stop offset="0.55" stopColor="#34d399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} strokeLinecap="round" pathLength={100} />
        {f > 0 && <path d={d} fill="none" stroke={`url(#${gradient})`} strokeWidth={stroke} strokeLinecap="round" pathLength={100} strokeDasharray={`${f * 100} 100`} className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none" />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
