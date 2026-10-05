import type { ReactNode } from "react";

/**
 * A progress ring in the sunset gradient. It is one neutral colour for every state (never red or green: we don't
 * judge food or days), and the number it shows is only "how much of the target is used". The ring is the
 * progressbar for assistive tech; the SVG itself is decorative.
 */
export function Ring({ fraction, label, size = 104, stroke = 9, children, id }: { fraction: number; label: string; size?: number; stroke?: number; children?: ReactNode; id: string }) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const r = 50 - stroke / 2;
  const c = 2 * Math.PI * r;
  const gradient = `ring-grad-${id}`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(f * 100)}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden focusable="false">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd27a" />
            <stop offset="0.55" stopColor="#f7a04b" />
            <stop offset="1" stopColor="#ee5a2a" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#${gradient})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${f * c} ${c}`}
          style={{ transition: "stroke-dasharray 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
