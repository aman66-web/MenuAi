"use client";

import { useEffect, useState } from "react";
import { mayHavePhoto, orphanedPhotos, recipePhotos, type PhotoPosition } from "@/lib/mm/recipePhotos";
import { myRecipesStore } from "@/lib/mm/stores";

// The saved recipe's own photo (Make it at home), as a local address for <img>, or null. One object URL per id for the whole visit, shared by every card and page that
// shows it; a photo saved now reaches the cards already on screen. The first use in a visit also tidies away photos whose recipe is gone.
// Where the person moved their photo to (founder 2026-11-20: tap the photo, drag, Done) is kept the same way, so the recipe's page and its card agree at once.

const urls = new Map<string, string | null>();
const waiting = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();
const places = new Map<string, PhotoPosition | null>();
const placesWaiting = new Map<string, Promise<PhotoPosition | null>>();
let tidied = false;

function load(id: string): Promise<string | null> {
  if (urls.has(id)) return Promise.resolve(urls.get(id)!);
  const pending = waiting.get(id);
  if (pending) return pending;
  const p = recipePhotos.get(id).then(
    (blob) => { const url = blob ? URL.createObjectURL(blob) : null; urls.set(id, url); return url; },
    () => { urls.set(id, null); return null; },
  ).finally(() => waiting.delete(id));
  waiting.set(id, p);
  return p;
}

function loadPlace(id: string): Promise<PhotoPosition | null> {
  if (places.has(id)) return Promise.resolve(places.get(id)!);
  const pending = placesWaiting.get(id);
  if (pending) return pending;
  const p = recipePhotos.getPosition(id).then(
    (pos) => { if (!places.has(id)) places.set(id, pos); return places.get(id) ?? null; },
    () => { if (!places.has(id)) places.set(id, null); return places.get(id) ?? null; },
  ).finally(() => placesWaiting.delete(id));
  placesWaiting.set(id, p);
  return p;
}

async function tidy(): Promise<void> {
  if (tidied) return;
  tidied = true;
  try {
    const gone = orphanedPhotos(await recipePhotos.keys(), myRecipesStore.get().map((r) => r.id));
    for (const id of gone) await recipePhotos.delete(id);
  } catch { /* IndexedDB blocked: nothing to tidy */ }
}

/** Keep a saved recipe's photo (a small JPEG) and show it at once wherever the recipe appears. */
export async function keepRecipePhoto(id: string, blob: Blob): Promise<void> {
  try {
    await recipePhotos.put(id, blob);
    const old = urls.get(id);
    if (old) URL.revokeObjectURL(old);
    urls.set(id, URL.createObjectURL(blob));
    for (const l of listeners) l();
  } catch { /* storage blocked: the recipe keeps its drawing */ }
}

/** Keep which part of a recipe's photo shows: every card and page showing it follows at once; the photo itself is never changed. */
export function keepRecipePhotoPosition(id: string, pos: PhotoPosition): void {
  places.set(id, pos);
  for (const l of listeners) l();
  void recipePhotos.putPosition(id, pos).catch(() => { /* storage blocked: it holds for this visit */ });
}

/** Forget every kept photo (Settings > Clear data). */
export async function clearRecipePhotos(): Promise<void> {
  for (const url of urls.values()) if (url) URL.revokeObjectURL(url);
  urls.clear();
  places.clear();
  try { await recipePhotos.clear(); } catch { /* blocked */ }
  for (const l of listeners) l();
}

export function useRecipePhoto(id: string): string | null {
  const [url, setUrl] = useState<string | null>(() => (mayHavePhoto(id) ? urls.get(id) ?? null : null));
  useEffect(() => {
    if (!mayHavePhoto(id) || typeof indexedDB === "undefined") return;
    let live = true;
    const refresh = () => { if (live) setUrl(urls.get(id) ?? null); };
    listeners.add(refresh);
    void load(id).then((u) => { if (live) setUrl(u); });
    void tidy();
    return () => { live = false; listeners.delete(refresh); };
  }, [id]);
  return url;
}

/** Where the person moved a recipe's photo to (null: the middle, as it was taken). */
export function useRecipePhotoPosition(id: string): PhotoPosition | null {
  const [pos, setPos] = useState<PhotoPosition | null>(() => (mayHavePhoto(id) ? places.get(id) ?? null : null));
  useEffect(() => {
    if (!mayHavePhoto(id) || typeof indexedDB === "undefined") return;
    let live = true;
    const refresh = () => { if (live) setPos(places.get(id) ?? null); };
    listeners.add(refresh);
    void loadPlace(id).then((p) => { if (live) setPos(p); });
    return () => { live = false; listeners.delete(refresh); };
  }, [id]);
  return pos;
}
