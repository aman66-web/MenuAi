"use client";

import { useEffect, useMemo, useState } from "react";
import { APP_BUILD } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { itemImageUrl, itemThumbUrl } from "@/lib/mm/images";
import { PHOTO_CHAINS, photoDishes, type PhotoDish } from "@/lib/mm/showcase";
import type { Chain, Goal, Preferences } from "@/lib/mm/types";
import type { FirstDish } from "@/lib/mm/welcomeSteps";
import { ChainMark } from "../_components/ChainMark";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useMenu } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { menuClient } from "../_lib/menu";
import { PhoneFrame } from "./PhoneFrame";

// Your plan's row of restaurant dishes (founder, 20 November 2026): one dish at each of a few chains, in the chain's own photo with its own calories, then
// "{n} restaurants, their own figures". Chains with photos first (McDonald's, Nando's, Pret, Greggs, Caffè Nero; never Costa, which has none: lib/mm/showcase.ts
// PHOTO_CHAINS), each dish from the list that fits the person's goal, with their diet and allergies applied (showcase.ts photoDish).
// - CLAUDE.md rule 2: the chain's own photo, shown whole (resized only, never cropped), captioned "Photo from the {chain} website" under it; the chain's name
//   in plain text with its small official logo beside it where logos are on; a chain on the taken-down list (public/logos/hidden.json) loses its photos and is
//   left out; with photos switched off in the build, nothing has a photo, so the row isn't shown, only the line. "Not affiliated with" is said under the row.
// - Rule 1: every figure is the restaurant's own, read from its menu when the screen draws. Nothing can be tapped, logged or favourited here: since 26 November
//   2026 (founder: people tapped the onboarding's examples, "show it within a phone because it helps") the dishes are drawn as a small Eat out screen inside a
//   phone that can't be tapped (PhoneFrame.tsx), the first three as rows; a screen reader hears them in the picture's name.
// - The first dish is the navigation hint for Home's Start here card (never logged, never favourited).

/** How long the website waits for the menus before leaving the row out (they need a connection the first time). */
const MENU_WAIT_MS = 4000;

/** Starts loading the row's menus (about 100 KB each on the website), as soon as the person is past the shops. */
export function preloadRestaurantRow(): void {
  void menuClient.ensureManifest().then(() => {
    for (const id of PHOTO_CHAINS) void menuClient.loadChain(id).catch(() => undefined);
  }).catch(() => undefined);
}

/** A photo may be shown (photos switched on in this build, the chain not taken down: lib/mm/images.ts). */
const showable = (image: string): boolean => !!itemImageUrl(image);

/** How many dishes the phone shows (the rest would be under its fade). */
const IN_PHONE = 3;

/** One dish as a row of the small Eat out screen: the chain's own photo whole, the dish, its calories, the chain, and the photo's caption (CLAUDE.md rule 2). */
function DishRow({ dish }: { dish: PhotoDish }) {
  const t = useT();
  // the full photo (at most 640 px), then its small copy, then nothing (the row stays, with the restaurant's mark in its place)
  const [failed, setFailed] = useState(0);
  const src = failed === 0 ? itemImageUrl(dish.image) : failed === 1 ? itemThumbUrl(dish.image) : undefined;
  return (
    <li className="flex gap-2.5 rounded-xl border border-line bg-card p-2">
      <span className="block aspect-[4/3] w-[4.75rem] shrink-0 overflow-hidden rounded-lg bg-card">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- the chain's own photo, already resized and WebP-encoded by the pipeline
          <img key={src} src={src} alt="" width={320} height={240} loading="lazy" decoding="async" onError={() => setFailed((f) => f + 1)} className="h-full w-full object-contain" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-fill"><ChainMark chainId={dish.chainId} size="sm" /></span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-[0.75rem] font-semibold leading-tight [overflow-wrap:anywhere]">{dish.name}</span>
        <span className="app-numbers text-[0.75rem] font-bold leading-tight">{t("{kcal} kcal", { kcal: formatInt(dish.kcal) })}</span>
        <span className="flex min-w-0 items-center gap-1 text-[0.6875rem] font-bold leading-tight">
          <ChainMark chainId={dish.chainId} size="xs" />
          <span className="min-w-0 truncate">{dish.chainName}</span>
        </span>
        {src && <span className="text-[0.625rem] leading-tight text-muted">{t("Photo from the {chain} website", { chain: dish.chainName })}</span>}
      </span>
    </li>
  );
}

export function RestaurantRow({ goal, prefs, onDish }: { goal: Goal | null; prefs: Preferences; onDish?: (dish: FirstDish | null) => void }) {
  const t = useT();
  const menu = useMenu();
  const hidden = useHiddenLogos();
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [waited, setWaited] = useState(false);
  const real = useMemo(() => menu.chains.filter((c) => !c.sample), [menu.chains]);
  const menuFor = (id: string): Chain | null | undefined => menu.indexes.get(id)?.chain ?? (failed.has(id) ? null : undefined);
  const { dishes, pending } = menu.status === "ready" ? photoDishes(menu.chains, menuFor, goal, prefs, showable, hidden) : { dishes: [], pending: [...PHOTO_CHAINS] };
  const pendingKey = menu.status === "ready" ? pending.join("|") : "";

  useEffect(() => {
    for (const id of pendingKey ? pendingKey.split("|") : []) menuClient.loadChain(id).catch(() => setFailed((f) => new Set([...f, id])));
  }, [pendingKey]);
  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), MENU_WAIT_MS);
    return () => window.clearTimeout(id);
  }, []);

  // the first dish: Home's Start here hint
  const hint = dishes[0] ? `${dishes[0].chainId}|${dishes[0].itemId}` : "";
  useEffect(() => {
    if (!onDish) return;
    const [chainId, itemId] = hint ? hint.split("|") : [];
    onDish(chainId && itemId ? { chainId, itemId } : null);
  }, [hint]); // eslint-disable-line react-hooks/exhaustive-deps -- reports the dish only when it changes

  // the row keeps its place while the menus load (the iPhone app has them inside; the website waits a few seconds)
  const loading = dishes.length === 0 && pending.length > 0 && (APP_BUILD || !waited) && menu.status !== "error";
  if (real.length === 0 && !loading) return null;

  return (
    <section aria-label={t("Restaurants")} className="mt-8">
      {real.length > 0 && <h2 className="text-[1.25rem] font-bold leading-snug tracking-[-0.01em]">{t("{n} restaurants, their own figures", { n: formatInt(real.length) })}</h2>}
      {(dishes.length > 0 || loading) && (
        // the dishes as a picture of Eat out on a phone (nothing in it can be tapped); a screen reader hears each dish in the picture's name
        <PhoneFrame
          className="mt-3"
          screen="h-[19.5rem]"
          label={[t("Example of restaurant dishes in the app."), ...dishes.slice(0, IN_PHONE).map((d) => t("{dish} at {chain}: {kcal} calories.", { dish: d.name, chain: d.chainName, kcal: formatInt(d.kcal) }))].join(" ")}
        >
          <p className="mb-2 text-[1rem] font-[800] leading-tight">{t("Eat out")}</p>
          <ul className="space-y-2">
            {dishes.length > 0
              ? dishes.slice(0, IN_PHONE).map((d) => <DishRow key={d.chainId} dish={d} />)
              : [0, 1, 2].map((i) => <li key={i} className="h-[4.75rem] rounded-xl border border-line bg-card" />)}
          </ul>
        </PhoneFrame>
      )}
      {dishes.length > 0 && <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{t("Not affiliated with any restaurant or shop shown.")}</p>}
    </section>
  );
}
