"use client";

import { logoFor } from "@/lib/mm/logos";

// The welcome screen's moving wall (founder 2026-10-10: "have all the logos of the restaurants and grocery stores moving at the top").
// Restaurants show their own official logo file, unmodified, on its plain tile (CLAUDE.md rule 2: the founder's decision for this
// screen); supermarkets show their name in plain text, because we hold no logo files of theirs. Decorative: screen readers get one
// sentence instead (the caller's `label`). Rows drift slowly in alternating directions; with reduced motion they stand still.

export interface WallItem {
  id: string;
  name: string;
  kind: "restaurant" | "shop";
}

const ROWS = 4;

function Tile({ item }: { item: WallItem }) {
  const logo = item.kind === "restaurant" ? logoFor(item.id) : undefined;
  if (logo) {
    return (
      <span className={`block h-[4.75rem] w-[4.75rem] shrink-0 rounded-[1.35rem] p-2.5 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5 ${logo.tile === "dark" ? "bg-[#0b0b0b]" : "bg-white"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the chain's own logo file, unmodified, scaled to fit inside the tile (never cropped) */}
        <img src={logo.src} alt="" loading="eager" decoding="async" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span className="grid h-[4.75rem] min-w-[4.75rem] shrink-0 place-items-center rounded-[1.35rem] bg-white px-3 text-center text-[13px] font-extrabold leading-tight text-[#0b1a12] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
      {item.name}
    </span>
  );
}

export function LogoWall({ items, label }: { items: readonly WallItem[]; label: string }) {
  const rows: WallItem[][] = Array.from({ length: ROWS }, () => []);
  items.forEach((item, i) => rows[i % ROWS]!.push(item));
  return (
    <div role="img" aria-label={label} className="logo-wall pointer-events-none relative h-[19rem] overflow-hidden">
      {/* always laid out left to right, so the loop works the same in Urdu and Arabic */}
      <div aria-hidden dir="ltr" className="absolute inset-x-[-30%] top-[-12%] flex rotate-[-9deg] flex-col gap-3">
        {rows.map((row, r) => (
          <div key={r} className={`marquee flex w-max gap-3 pr-3 ${r % 2 ? "marquee-reverse" : ""}`} style={{ animationDuration: `${46 + r * 7}s` }}>
            {/* twice over, so the row loops without a seam */}
            {[...row, ...row].map((item, i) => (<Tile key={`${item.kind}-${item.id}-${i}`} item={item} />))}
          </div>
        ))}
      </div>
    </div>
  );
}
