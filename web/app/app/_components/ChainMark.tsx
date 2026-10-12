"use client";

import { useState, type ReactNode } from "react";
import { logoFor, shopLogoFor, tileArt, type ChainLogo } from "@/lib/mm/logos";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { BakeryGlyph, BasketIcon, BurgerGlyph, ChickenGlyph, CoffeeGlyph, ForkIcon, PizzaGlyph, SandwichGlyph, TacoGlyph } from "./icons";

// A small square tile that tells restaurants (and supermarkets) apart at a glance. If the chain's own official files are installed (see
// lib/mm/logos.ts) its square icon is shown (edge to edge when it fills its square), else its logo file contained on a plain tile:
// always UNMODIFIED, only to identify the restaurant. Otherwise it is one of our own cuisine glyphs. The name is always plain text next
// to it, so the tile is decorative (aria-hidden).

const GLYPHS: Array<[RegExp, (className: string) => ReactNode]> = [
  [/burger/i, (c) => <BurgerGlyph className={c} />],
  [/chicken|wing/i, (c) => <ChickenGlyph className={c} />],
  [/pizza/i, (c) => <PizzaGlyph className={c} />],
  [/coffee|cafe|café|tea/i, (c) => <CoffeeGlyph className={c} />],
  [/sandwich|sub/i, (c) => <SandwichGlyph className={c} />],
  [/bakery|bread|pastr/i, (c) => <BakeryGlyph className={c} />],
  [/mexican|taco|burrito/i, (c) => <TacoGlyph className={c} />],
];

function glyphFor(cuisine: string | undefined, className: string): ReactNode {
  const match = GLYPHS.find(([re]) => re.test(cuisine ?? ""));
  return match ? match[1](className) : <ForkIcon className={className} />;
}

type Size = "xs" | "sm" | "md" | "lg" | "xl";
const BOX: Record<Size, string> = { xs: "h-7 w-7 rounded-lg", sm: "h-9 w-9 rounded-xl", md: "h-12 w-12 rounded-2xl", lg: "h-16 w-16 rounded-3xl", xl: "h-20 w-20 rounded-[1.6rem]" };
const GLYPH: Record<Size, string> = { xs: "h-4 w-4", sm: "h-5 w-5", md: "h-6 w-6", lg: "h-8 w-8", xl: "h-10 w-10" };
const PAD: Record<Size, string> = { xs: "p-0.5", sm: "p-1", md: "p-1.5", lg: "p-1.5", xl: "p-2.5" };

/** The official file on its square tile (shared by restaurants and supermarkets); `fallback` when there is no file or it fails to load. */
function LogoTile({ logo, size, fallback }: { logo: ChainLogo | undefined; size: Size; fallback: ReactNode }) {
  // 0: the square icon (or the logo file), 1: the logo file after the square icon failed to load, 2: the fallback
  const [failed, setFailed] = useState(0);
  const art = logo ? tileArt(logo) : undefined;
  const src = art ? (failed === 0 ? art.src : failed === 1 ? art.fallback : undefined) : undefined;
  const full = !!art && failed === 0 && art.full;
  const dark = failed === 0 ? art?.tile === "dark" : logo?.tile === "dark";
  if (!src) return <>{fallback}</>;
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-line shadow-[0_6px_14px_-8px_rgba(0,0,0,0.35)] ${full ? "" : `${PAD[size]} ${dark ? "bg-[#111]" : "bg-white"}`} ${BOX[size]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the official file, used as published: no resizing pipeline, no recolouring */}
      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailed((f) => (f === 0 && art?.fallback ? 1 : 2))} />
    </span>
  );
}

function GlyphTile({ size, children }: { size: Size; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center border border-line text-accent shadow-[0_6px_14px_-8px_var(--brand-shadow)] ${BOX[size]}`}
      style={{ background: "linear-gradient(150deg, rgba(134, 239, 172, 0.35), rgba(163, 230, 53, 0.08) 60%, transparent), var(--soft)" }}
    >
      {children}
    </span>
  );
}

export function ChainMark({ chainId, cuisine, size = "md" }: { chainId?: string; cuisine?: string; size?: Size }) {
  useHiddenLogos();
  return <LogoTile key={chainId} logo={logoFor(chainId)} size={size} fallback={<GlyphTile size={size}>{glyphFor(cuisine, GLYPH[size])}</GlyphTile>} />;
}

/** A supermarket's own logo on its tile (founder 2026-10-11), or a basket when we hold no file of theirs. Decorative: the name is always beside it. */
export function ShopMark({ shopId, size = "sm" }: { shopId: string; size?: Size }) {
  useHiddenLogos();
  return <LogoTile key={shopId} logo={shopLogoFor(shopId)} size={size} fallback={<GlyphTile size={size}><BasketIcon className={GLYPH[size]} /></GlyphTile>} />;
}
