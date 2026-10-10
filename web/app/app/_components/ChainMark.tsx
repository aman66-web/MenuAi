"use client";

import { useState, type ReactNode } from "react";
import { logoFor } from "@/lib/mm/logos";
import { BakeryGlyph, BurgerGlyph, ChickenGlyph, CoffeeGlyph, ForkIcon, PizzaGlyph, SandwichGlyph, TacoGlyph } from "./icons";

// A small tile that tells restaurants apart at a glance. If the chain's own official logo file is installed (see
// lib/mm/logos.ts) it is shown UNMODIFIED, contained on a plain light tile, only to identify the restaurant. Otherwise
// it is one of our own cuisine glyphs. The name is always plain text next to it, so the tile is decorative (aria-hidden).

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

export function ChainMark({ chainId, cuisine, size = "md" }: { chainId?: string; cuisine?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = logoFailed ? undefined : logoFor(chainId);
  const box = size === "xl" ? "h-20 w-20 rounded-[1.6rem]" : size === "lg" ? "h-16 w-16 rounded-3xl" : size === "sm" ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-2xl";
  const glyph = size === "xl" ? "h-10 w-10" : size === "lg" ? "h-8 w-8" : size === "sm" ? "h-5 w-5" : "h-6 w-6";
  if (logo) {
    return (
      <span aria-hidden className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-line shadow-[0_6px_14px_-8px_rgba(0,0,0,0.35)] ${size === "sm" ? "p-1" : size === "xl" ? "p-2.5" : "p-1.5"} ${logo.tile === "dark" ? "bg-[#111]" : "bg-white"} ${box}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the official file, used as published: no resizing pipeline, no recolouring */}
        <img src={logo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setLogoFailed(true)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center border border-line text-accent shadow-[0_6px_14px_-8px_var(--brand-shadow)] ${box}`}
      style={{ background: "linear-gradient(150deg, rgba(134, 239, 172, 0.35), rgba(163, 230, 53, 0.08) 60%, transparent), var(--soft)" }}
    >
      {glyphFor(cuisine, glyph)}
    </span>
  );
}
