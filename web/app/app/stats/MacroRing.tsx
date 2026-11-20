import type { MacroKey } from "@/lib/mm/stats";

// The week's split of protein, carbs and fat as a ring (the Stats screen, founder 2026-11-20), in their own colours (green, blue, purple: labels only, never
// good or bad) and always in that order from the top, clockwise, with a small gap between them; the words and grams beside it say the same, so nothing
// depends on the colour. Drawn only (the list beside it is what a screen reader hears). Its size is in rem, so the words in its middle always fit when the
// text is large; the empty ring is the same light grey as the bars' tracks.

const ORDER: ReadonlyArray<[MacroKey, string]> = [["protein", "var(--protein)"], ["carbs", "var(--carbs)"], ["fat", "var(--fat)"]];

export function MacroRing({ shares, size = 8, children }: { shares: Record<MacroKey, number> | null; /** In rem. */ size?: number; children?: React.ReactNode }) {
  const stroke = 13;
  const r = 50 - stroke / 2;
  const parts = shares ? ORDER.filter(([k]) => shares[k] > 0) : [];
  const gap = parts.length > 1 ? 1.6 : 0;
  let start = 0;
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: `${size}rem`, height: `${size}rem` }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" focusable="false">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--soft-strong)" strokeWidth={stroke} />
        {shares &&
          parts.map(([k, colour]) => {
            const length = Math.max(0, shares[k] - gap);
            const offset = start;
            start += shares[k];
            return <circle key={k} cx="50" cy="50" r={r} fill="none" stroke={colour} strokeWidth={stroke} pathLength={100} strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-offset} />;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
