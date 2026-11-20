"use client";

import { useState } from "react";
import { logoFor, shopLogoFor, tileArt } from "@/lib/mm/logos";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useT } from "../_lib/i18n";

// The welcome screen's moving wall (founder 2026-10-10: "have all the logos of the restaurants and grocery stores moving at the top").
// Restaurants and supermarkets show their own official logo file, unmodified, on its plain tile (CLAUDE.md rule 2: the founder's
// decisions of 2026-10-10 and 2026-10-11); a supermarket whose file we don't hold shows its name in plain text. Decorative: screen readers get one
// sentence instead (the caller's `label`). Rows drift slowly in alternating directions; with reduced motion they stand still.
// `namesOnly` (the iPhone app, founder 2026-10-12: logo safeguards for the App Store): every tile shows the plain-text name, no logo files,
// because this first screen is the one place logos could read as promotion rather than just identifying a restaurant.
// The tiles follow the colour meeting (19 November 2026): the file on a white tile with the card line (an ink tile for white artwork), padding in proportion to
// the tile and the rounded corners on the tile only, so the file itself is never clipped.
// Pause (the onboarding meeting of 19 November, question 13, approved that day; WCAG 2.2.2): the wall moves for about 50 s a pass and never stops by itself, beside
// text, so a 44 pt "Pause" button sits at its corner. The wall keeps moving until someone taps it (the founder's moving wall); "Play" starts it again. With
// reduced motion the wall stands still and the button isn't shown.

export interface WallItem {
  id: string;
  name: string;
  kind: "restaurant" | "shop";
}

const ROWS = 4;

/** A tile of the wall: 76 px, 12% padding (9 px), the radius on the tile only, a faint shadow. */
const TILE = "h-[4.75rem] shrink-0 rounded-[1.35rem] border border-line shadow-[var(--card-shadow)]";

function Tile({ item, namesOnly }: { item: WallItem; namesOnly?: boolean }) {
  const logo = namesOnly ? undefined : item.kind === "restaurant" ? logoFor(item.id) : shopLogoFor(item.id);
  if (logo) {
    // the chain's square icon if it has one, else its logo file, contained on the plain tile (white, or ink for white artwork); never cropped
    const art = tileArt(logo);
    return (
      <span data-reinvert className={`${TILE} block w-[4.75rem] p-[9px] ${art.tile === "dark" ? "bg-ink" : "bg-card"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the chain's own file, unmodified, scaled to fit inside the tile (never cropped) */}
        <img src={art.src} alt="" loading="eager" decoding="async" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span className={`${TILE} grid min-w-[4.75rem] place-items-center bg-card px-3 text-center text-[13px] font-extrabold leading-tight text-foreground`}>
      {item.name}
    </span>
  );
}

const PauseGlyph = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
const PlayGlyph = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" /></svg>
);

/**
 * `hero`: the wall as the picture over the welcome headline, fading in at the top as well as out at the bottom. Its height is what a 390×844 phone has left
 * once the cover's words, Get started, "Already have an account? Sign in" (2.75rem, back on the cover since the onboarding meeting of 19 November) and the
 * footer are in, so the cover doesn't scroll; never under 7.5rem or over 19rem. The Pause button sits over its bottom corner, so it adds no height.
 */
export function LogoWall({ items, label, namesOnly, hero }: { items: readonly WallItem[]; label: string; namesOnly?: boolean; hero?: boolean }) {
  useHiddenLogos();
  const t = useT();
  const [paused, setPaused] = useState(false);
  const rows: WallItem[][] = Array.from({ length: ROWS }, () => []);
  items.forEach((item, i) => rows[i % ROWS]!.push(item));
  return (
    <div className="relative">
      <div role="img" aria-label={label} className={`logo-wall pointer-events-none relative overflow-hidden ${hero ? "wall-hero h-[clamp(7.5rem,calc(100dvh-39.25rem),19rem)]" : "h-[19rem]"}`}>
        {/* always laid out left to right, so the loop works the same in Urdu and Arabic */}
        <div aria-hidden dir="ltr" className="absolute inset-x-[-30%] top-[-12%] flex rotate-[-9deg] flex-col gap-3">
          {rows.map((row, r) => (
            <div key={r} className={`marquee flex w-max gap-3 pr-3 ${r % 2 ? "marquee-reverse" : ""}`} style={{ animationDuration: `${46 + r * 7}s`, animationPlayState: paused ? "paused" : undefined }}>
              {/* twice over, so the row loops without a seam */}
              {[...row, ...row].map((item, i) => (<Tile key={`${item.kind}-${item.id}-${i}`} item={item} namesOnly={namesOnly} />))}
            </div>
          ))}
        </div>
      </div>
      {/* at the bottom corner on the reading side (the labels over the wall sit higher up), white with the control edge; its spoken name starts with its word */}
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? t("Play the moving logos") : t("Pause the moving logos")}
        className="absolute bottom-1 start-3 z-[1] inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-edge bg-card px-3.5 text-[0.9375rem] font-semibold text-foreground shadow-[var(--photo-chip-shadow)] transition active:scale-[0.97] active:bg-background hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hidden"
      >
        {paused ? <PlayGlyph /> : <PauseGlyph />}
        {paused ? t("Play") : t("Pause")}
      </button>
    </div>
  );
}
