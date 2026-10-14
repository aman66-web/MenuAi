"use client";

import { logoFor, shopLogoFor, tileArt } from "@/lib/mm/logos";
import { useHiddenLogos } from "../_lib/hiddenLogos";

// The welcome screen's moving wall (founder 2026-10-10: "have all the logos of the restaurants and grocery stores moving at the top").
// Restaurants and supermarkets show their own official logo file, unmodified, on its plain tile (CLAUDE.md rule 2: the founder's
// decisions of 2026-10-10 and 2026-10-11); a supermarket whose file we don't hold shows its name in plain text. Decorative: screen readers get one
// sentence instead (the caller's `label`). Rows drift slowly in alternating directions; with reduced motion they stand still.
// `namesOnly` (the iPhone app, founder 2026-10-12: logo safeguards for the App Store): every tile shows the plain-text name, no logo files,
// because this first screen is the one place logos could read as promotion rather than just identifying a restaurant.

export interface WallItem {
  id: string;
  name: string;
  kind: "restaurant" | "shop";
}

const ROWS = 4;

function Tile({ item, namesOnly }: { item: WallItem; namesOnly?: boolean }) {
  const logo = namesOnly ? undefined : item.kind === "restaurant" ? logoFor(item.id) : shopLogoFor(item.id);
  if (logo) {
    // the chain's square icon edge to edge when it fills its square, else its file on the plain tile
    const art = tileArt(logo);
    return (
      <span className={`block h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-[1.35rem] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5 ${art.full ? "" : `p-2.5 ${art.tile === "dark" ? "bg-[#0b0b0b]" : "bg-white"}`}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the chain's own file, unmodified, scaled to fit inside the tile (never cropped) */}
        <img src={art.src} alt="" loading="eager" decoding="async" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span className="grid h-[4.75rem] min-w-[4.75rem] shrink-0 place-items-center rounded-[1.35rem] bg-white px-3 text-center text-[13px] font-extrabold leading-tight text-[#0b1a12] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
      {item.name}
    </span>
  );
}

/** `hero`: the wall as the picture under the welcome headline, fading in at the top as well as out at the bottom. */
export function LogoWall({ items, label, namesOnly, hero }: { items: readonly WallItem[]; label: string; namesOnly?: boolean; hero?: boolean }) {
  useHiddenLogos();
  const rows: WallItem[][] = Array.from({ length: ROWS }, () => []);
  items.forEach((item, i) => rows[i % ROWS]!.push(item));
  return (
    <div role="img" aria-label={label} className={`logo-wall pointer-events-none relative overflow-hidden ${hero ? "wall-hero h-[clamp(11rem,34dvh,19rem)]" : "h-[19rem]"}`}>
      {/* always laid out left to right, so the loop works the same in Urdu and Arabic */}
      <div aria-hidden dir="ltr" className="absolute inset-x-[-30%] top-[-12%] flex rotate-[-9deg] flex-col gap-3">
        {rows.map((row, r) => (
          <div key={r} className={`marquee flex w-max gap-3 pr-3 ${r % 2 ? "marquee-reverse" : ""}`} style={{ animationDuration: `${46 + r * 7}s` }}>
            {/* twice over, so the row loops without a seam */}
            {[...row, ...row].map((item, i) => (<Tile key={`${item.kind}-${item.id}-${i}`} item={item} namesOnly={namesOnly} />))}
          </div>
        ))}
      </div>
    </div>
  );
}
