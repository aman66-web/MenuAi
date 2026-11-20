"use client";

import { useState } from "react";
import { BasketIcon, ForkIcon } from "../icons";
import type { EntryPicture } from "./entryPictureSources";

// The picture of something logged, beside it on Home's meal rows and on Today (founder 2026-11-17, "use images please when possible"): the
// chain's own photo of the dish (or of the first dish in the order that has one), our recipe's picture, or the supermarket's own photo of the
// product, as kept on the entry when it was logged (LogEntry image / recipeId / photo). Nothing new is downloaded or stored: small copies
// first (menu-images/thumbs, recipe-images/thumbs), then the full picture; in the iPhone app pictures come from the website the first time they
// are shown (lib/mm/config.ts assetUrl), so when none loads (offline before it was ever seen) Home leaves it out and Today shows its plain tile.
// Decorative everywhere: the entry's name is always written beside it. Where the picture comes from: entryPictureSources.ts.

export { entryPicture, legacyImage, linesImage, type EntryPicture } from "./entryPictureSources";

/** The first of `srcs` that loads: `next` moves on when one fails; null when none is left. A new list starts again from the first. */
function useFirstThatLoads(srcs: readonly string[]): { src: string; next: () => void } | null {
  const key = srcs.join("\n");
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const n = failed.key === key ? failed.n : 0;
  const src = srcs[n];
  return src ? { src, next: () => setFailed({ key, n: n + 1 }) } : null;
}

/** The picture itself, filling a round box: a dish or recipe covers it; a product's pack is shown whole on white, inset so the circle never cuts it. */
function PictureImg({ src, kind, px, onError }: { src: string; kind: EntryPicture["kind"]; px: number; onError: () => void }) {
  const product = kind === "product";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized files (or the supermarket's own picture); decorative, the name is beside it
    <img
      src={src}
      alt=""
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      referrerPolicy={product ? "no-referrer" : undefined}
      onError={onError}
      className={`h-full w-full rounded-full bg-card ${product ? "object-contain p-1.5" : "object-cover"}`}
    />
  );
}

/** One of Home's overlapping 36 px circles; `gone` when none of its sources loads. */
function Avatar({ picture, gone }: { picture: EntryPicture; gone: () => void }) {
  const chain = useFirstThatLoads(picture.srcs);
  if (!chain) return null;
  return (
    <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-background bg-card">
      <PictureImg key={chain.src} src={chain.src} kind={picture.kind} px={36} onError={() => (picture.srcs.indexOf(chain.src) >= picture.srcs.length - 1 ? gone() : chain.next())} />
    </span>
  );
}

/**
 * Home's meal row: up to two different pictures, overlapping round 36 px avatars; one that doesn't load is left out of the stack (the next one,
 * if any, takes its place), and nothing is shown when none loads. The names of what was eaten stay beside it either way.
 */
export function EntryAvatars({ pictures }: { pictures: readonly EntryPicture[] }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const shown = pictures.filter((p, i) => !failed.has(p.key) && pictures.findIndex((q) => q.key === p.key) === i).slice(0, 2);
  if (shown.length === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0 -space-x-2.5">
      {shown.map((p) => <Avatar key={p.key} picture={p} gone={() => setFailed((f) => new Set(f).add(p.key))} />)}
    </span>
  );
}

/** Today's 44 px round picture of something eaten; when there is none, or none loads, a plain tile: the basket for a product, a fork for anything else. */
export function EatenThumb({ picture, product }: { picture: EntryPicture | undefined; product: boolean }) {
  const chain = useFirstThatLoads(picture?.srcs ?? []);
  if (!picture || !chain) {
    return (
      <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-ink">
        {product ? <BasketIcon className="h-5 w-5" /> : <ForkIcon className="h-5 w-5" />}
      </span>
    );
  }
  return (
    <span aria-hidden className="block h-11 w-11 shrink-0 overflow-hidden rounded-full border border-line bg-card">
      <PictureImg key={chain.src} src={chain.src} kind={picture.kind} px={44} onError={chain.next} />
    </span>
  );
}
