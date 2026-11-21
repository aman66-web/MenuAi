"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { site } from "@/site.config";
import { formatInt } from "@/lib/mm/format";
import { itemImageUrl } from "@/lib/mm/images";
import { itemHref } from "@/lib/mm/routes";
import type { Chain, MenuItem } from "@/lib/mm/types";
import { FSA_SOURCE, type Light, type LightResult } from "@/lib/mm/truth/fsaLights";
import { calorieCalloutParts, itemTruth, type ItemTruth, type ReferenceRow } from "@/lib/mm/truth/itemTruth";
import type { HouseholdEquivalent } from "@/lib/mm/truth/household";
import { PROTEIN_SCORE_HOW, SCORE_LABELS } from "@/lib/mm/truth/proteinScore";
import { REFERENCE_INTAKE_SOURCE } from "@/lib/mm/truth/referenceIntake";
import { imageFileName, shareMessage, whatsappUrl } from "@/lib/mm/truth/shareTruth";
import { swapFacts, type SwapSuggestion } from "@/lib/mm/truth/swap";
import { useHiddenLogos } from "../../_lib/hiddenLogos";
import { useT } from "../../_lib/i18n";
import { setLastTruthMessage } from "../../_lib/lastTruth";
import { deliverImage } from "../../_lib/share-card";
import { renderTruthCard } from "../../_lib/truth-card";
import { ChainMark } from "../ChainMark";
import { ItemThumb } from "../ItemPhoto";
import { MenuSourcesLink } from "../MenuSourcesLink";
import { Button } from "../ui";
import { ButterIcon, EggIcon, ImageDownIcon, SugarCubeIcon, WhatsAppShareIcon } from "./TruthIcons";
import { useCountUp } from "./useCountUp";

// The "Truth" card for one menu item (founder's brief, 13 Nov 2026): the Protein score, the official traffic lights for fat, saturates, sugars and salt,
// the calories as a share of the 2,000 kcal reference intake, what the figures look like as everyday things, and the Smart Swap. Everything is worked out from the
// figures the restaurant publishes (lib/mm/truth/*); a figure it doesn't publish is not shown, never estimated. Big figures (32 to 72 px), 16 px words and
// 48 px buttons, so it reads for a 75-year-old with reading glasses and from a phone's camera. Colours (colour meeting, 19 November 2026, approved by the
// founder that day): the FSA pills are the only red, amber and green on food, always with Low, Medium or High printed in them; the Protein score is ink dots
// on a line track; the Smart Swap is a card with the line (never a lime banner); the main button is ink (white with ink words on the dark card); labels in
// sentence case.
// Photos (founder 2026-11-17, "use images please when possible"): the chain's own photo of the dish beside the chain's name at the top, and of each dish in the
// Smart Swap card, on screen only. Never in the saved image card (renderTruthCard draws no photo: CLAUDE.md rule 2, never in the share card) and never on
// the dark card: Creator View (no photo is rendered) or the "Dark card" chip (the sheet's .truth-dark, also made for filming: hidden by CSS), since a
// filmed screen gets posted (rule 2: never in marketing).

/** The site's address for a shared link: the real one, even when the app is being tried on localhost. */
export function shareOrigin(): string {
  try {
    const u = new URL(site.url);
    return u.host.startsWith("localhost") ? "https://numbite.com" : `${u.protocol}//${u.host}`;
  } catch {
    return "https://numbite.com";
  }
}

const LIGHT_FILL: Record<Light, string> = { green: "bg-[var(--tl-green)]", amber: "bg-[var(--tl-amber)]", red: "bg-[var(--tl-red)]" };
const LIGHT_WORD: Record<Light, string> = { green: "Low", amber: "Medium", red: "High" };
const LIGHT_NAME: Record<LightResult["key"], string> = { fat: "Fat", saturatedFat: "Saturates", sugar: "Sugars", salt: "Salt" };
const gramsText = (n: number, digits = 1) => `${Number.isInteger(n) ? n : n.toFixed(digits)} g`;

function LightPill({ r, percent, index }: { r: LightResult; percent?: number; index: number }) {
  const t = useT();
  const coloured = r.light !== undefined;
  const name = t(LIGHT_NAME[r.key]);
  return (
    <li
      style={{ "--i": index } as React.CSSProperties}
      className={`truth-drop rounded-[1.25rem] px-3.5 py-3 ${coloured ? `text-[var(--tl-ink)] ${LIGHT_FILL[r.light as Light]}` : "border border-line bg-fill text-foreground"}`}
    >
      <p className="text-base font-bold leading-tight">{name}{coloured && <span className="font-semibold"> · {t(LIGHT_WORD[r.light as Light])}</span>}</p>
      {r.grams === undefined ? (
        <p className="mt-1 text-lg font-bold leading-snug">{t("Not published")}</p>
      ) : (
        <>
          <p className="app-numbers mt-1 text-3xl font-extrabold leading-none tracking-tight">{gramsText(r.grams, r.key === "salt" ? 2 : 1)}</p>
          {percent !== undefined && <p className={`app-numbers mt-1.5 text-[0.9375rem] font-semibold leading-snug ${coloured ? "" : "text-muted"}`}>{t("{n}% of a day", { n: percent })}</p>}
        </>
      )}
    </li>
  );
}

function Lights({ truth, chain }: { truth: ItemTruth; chain: Chain }) {
  const t = useT();
  const pct = (key: string) => truth.reference.find((r: ReferenceRow) => r.key === key)?.percent;
  const published = truth.lights.filter((l) => l.grams !== undefined);
  if (truth.kind === "drink" && published.length === 0) return null;
  // none of the four published (a calories-only restaurant): one plain line, not four "Not published" tiles (the 20 November 2026 audit)
  if (published.length === 0) {
    return (
      <section aria-labelledby="truth-lights" className="mt-6">
        <h3 id="truth-lights" className="text-xl font-extrabold leading-snug tracking-tight">{t("Traffic lights")}</h3>
        <p className="mt-2 text-base leading-snug text-muted">{t("{chain} doesn't publish fat, saturates, sugars or salt for this dish.", { chain: chain.name })}</p>
      </section>
    );
  }
  const anyUncoloured = truth.lights.some((l) => l.basis === "no-weight");
  return (
    <section aria-labelledby="truth-lights" className="mt-6">
      <h3 id="truth-lights" className="text-xl font-extrabold leading-snug tracking-tight">{t("Traffic lights")}</h3>
      <ul className="mt-3 grid grid-cols-2 gap-2.5">
        {truth.lights.map((r, i) => (
          <LightPill key={r.key} r={r} index={i} percent={pct(r.key)} />
        ))}
      </ul>
      <div className="mt-3 space-y-2 text-base leading-snug text-muted">
        {truth.kind === "drink" ? (
          <p>{t("Drinks aren't coloured here: the official scheme measures them per 100 ml.")}</p>
        ) : anyUncoloured ? (
          <p>{t("No colour: {chain} doesn't publish the dish's weight.", { chain: chain.name })}</p>
        ) : null}
        <p>
          {t("Colours follow the official UK scheme.")}{" "}
          <a href={FSA_SOURCE.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">
            {t("See the guidance")}<span className="sr-only"> {t("(opens in a new tab)")}</span>
          </a>
        </p>
      </div>
    </section>
  );
}

function Household({ rows, replay }: { rows: HouseholdEquivalent[]; replay: number }) {
  const t = useT();
  if (rows.length === 0) return null;
  const Icon = { sugar: SugarCubeIcon, fat: ButterIcon, protein: EggIcon } as const;
  const label = { sugar: "Sugar", fat: "Fat", protein: "Protein" } as const;
  return (
    <section aria-labelledby="truth-inside" className="mt-6">
      <h3 id="truth-inside" className="text-xl font-extrabold leading-snug tracking-tight">{t("What that looks like")}</h3>
      <ul className="mt-3 space-y-3">
        {rows.map((h) => {
          const I = Icon[h.kind];
          return (
            <li key={`${h.kind}-${replay}`} className="glass rounded-[1.25rem] p-4">
              <p className="text-base font-semibold text-muted">{t(label[h.kind])}: <span className="app-numbers">{gramsText(h.grams)}</span></p>
              <p aria-hidden className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: h.icons }, (_, i) => (
                  <I key={i} style={{ "--i": i } as React.CSSProperties} className="truth-drop h-9 w-9" />
                ))}
              </p>
              <p className="mt-2 text-2xl font-extrabold leading-snug tracking-tight">= {t(h.text)}</p>
              <details className="mt-1">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[0.9375rem] font-semibold text-accent underline underline-offset-4 [&::-webkit-details-marker]:hidden">{t("How we worked it out")}</summary>
                <p className="pb-1 text-base leading-snug text-muted">
                  {t(h.basis)}{" "}
                  <a href={h.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">
                    {t("Source")}<span className="sr-only"> {t("(opens in a new tab)")}</span>
                  </a>
                </p>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The score as five bars on the ink tile: lime for each point on the mid-grey track, like Home's bars on its ink cards. */
function ScoreDots({ score }: { score: number }) {
  return (
    <span aria-hidden className="mt-3 flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ "--i": n } as React.CSSProperties} className={`truth-drop h-2.5 flex-1 rounded-full ${n <= score ? "bg-[var(--bar)]" : "bg-[var(--ring-track)]"}`} />
      ))}
    </span>
  );
}

/** A share of the day as a lime bar on the ink tile (full at 100% or more). */
function DayBar({ percent }: { percent: number }) {
  return (
    <span aria-hidden className="mt-2.5 block h-2 overflow-hidden rounded-full bg-[var(--ring-track)]">
      <span className="block h-full rounded-full bg-[var(--bar)]" style={{ width: `${Math.min(100, Math.max(3, percent))}%` }} />
    </span>
  );
}

/**
 * The dish's own photo from the chain's website, big at the top (founder 2026-11-21: "you need a photo of the dish on it too"), shown whole (never cropped or
 * stretched: CLAUDE.md rule 2) with the chain's logo and name on a chip over it and the credit under it. Never on the dark card or in Creator View (filmed).
 */
function DishPhoto({ chain, image, onFail }: { chain: Chain; image: string | undefined; onFail: () => void }) {
  const t = useT();
  const src = itemImageUrl(image);
  if (!src) return null;
  return (
    <figure className="[.truth-dark_&]:hidden">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-line bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py */}
        <img src={src} alt="" width={640} height={480} decoding="async" onError={onFail} className="mx-auto block h-auto max-h-[min(16rem,32svh)] w-full object-contain" />
        <span className="absolute start-2.5 top-2.5 inline-flex max-w-[calc(100%-1.25rem)] items-center gap-2 rounded-full bg-[var(--photo-chip)] py-1 ps-1 pe-3.5 text-[0.9375rem] font-bold text-foreground shadow-[var(--photo-chip-shadow)]">
          <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="xs" />
          <span className="min-w-0 truncate">{chain.name}</span>
        </span>
      </div>
      <figcaption className="px-1 pt-1.5 text-[0.8125rem] font-medium leading-snug text-muted">{t("Photo from the {chain} website", { chain: chain.name })}</figcaption>
    </figure>
  );
}

/** `photo`: the card shows the dish's photo (or the grey fork tile when it has none, so the two cards line up); it steps aside when the card is narrow. */
function MiniDish({ item, heading, tone, photo }: { item: MenuItem; heading: string; tone: "plain" | "swap"; photo: boolean }) {
  const t = useT();
  const tr = itemTruth(item);
  return (
    <div className={`glass rounded-[1.25rem] p-4 ${tone === "swap" ? "border-2 border-edge" : ""}`}>
      <div className={photo ? "@container flex items-start gap-3.5" : undefined}>
        {photo && <span className="hidden shrink-0 @[14rem]:block [.truth-dark_&]:hidden"><ItemThumb image={item.image} placeholder /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-muted">{heading}</p>
          <p className="mt-1 text-xl font-extrabold leading-snug [overflow-wrap:anywhere]">{item.name}</p>
        </div>
      </div>
      <p className="app-numbers mt-2 text-3xl font-extrabold leading-none tracking-tight">{formatInt(item.nutrients.calories)} <span className="text-lg font-bold text-muted">kcal</span></p>
      {item.nutrients.protein !== undefined && <p className="app-numbers mt-1.5 text-xl font-bold">{gramsText(item.nutrients.protein)} <span className="text-base font-semibold text-muted">{t("protein")}</span></p>}
      {tr.score && <p className="app-numbers mt-1.5 text-lg font-bold">{t("Protein score")} {tr.score.score} / 5</p>}
    </div>
  );
}

/** The split card: your pick above, the swap below, and what the swap saves across the middle, in numbers only. */
function SwapCard({ chain, item, swap, photos }: { chain: Chain; item: MenuItem; swap: SwapSuggestion; photos: boolean }) {
  const t = useT();
  const facts = swapFacts(swap);
  const photo = photos && (itemImageUrl(item.image) !== undefined || itemImageUrl(swap.item.image) !== undefined);
  const banner =
    facts.moreProtein !== undefined
      ? t("Save {kcal} kcal and get {protein} g more protein in 1 swap", { kcal: formatInt(facts.saves), protein: facts.moreProtein })
      : t("Save {kcal} kcal in 1 swap", { kcal: formatInt(facts.saves) });
  return (
    <section aria-labelledby="truth-swap" className="mt-6">
      <h3 id="truth-swap" className="text-xl font-extrabold leading-snug tracking-tight">{t("Smart Swap")}</h3>
      <div className="mt-3 space-y-2.5">
        <MiniDish item={item} heading={t("Your pick")} tone="plain" photo={photo} />
        <p className="truth-bounce glass rounded-[1.25rem] px-4 py-4 text-center text-3xl font-extrabold leading-tight tracking-tight text-foreground">{banner}</p>
        <MiniDish item={swap.item} heading={t("Smart Swap at {chain}", { chain: chain.name })} tone="swap" photo={photo} />
      </div>
      <p className="mt-3 text-base leading-snug text-muted">
        {/* a calorie-only swap also happens where the restaurant publishes protein but not for this dish (Tenpin, Chozen): "doesn't publish protein" is said
            only of a calories-only restaurant (the 21 November 2026 meeting) */}
        {swap.tier === "protein-first"
          ? t("Same restaurant, same part of the menu, with at least as much protein and fewer calories. Your diet and allergy settings are applied.")
          : chain.nutritionLevel === "calories"
            ? t("Same restaurant, same part of the menu, with fewer calories. {chain} doesn't publish protein, so only calories are compared.", { chain: chain.name })
            : t("Same restaurant, same part of the menu, with fewer calories.")}
      </p>
      <Link href={itemHref(chain.id, swap.item.id)} className="mt-1 inline-flex min-h-12 items-center font-bold text-accent underline underline-offset-4">{t("See the swap's full numbers")}</Link>
    </section>
  );
}

export interface TruthBodyProps {
  chain: Chain;
  item: MenuItem;
  swap: SwapSuggestion | null;
  /** Creator View: even bigger figures. */
  creator?: boolean;
  /** Bumping this plays the opening animation again (Creator View's Replay button). */
  replay?: number;
  /** Called when the person taps Share to WhatsApp (the share-to-unlock note, once paid access exists). */
  onWhatsApp?: () => void;
}

export function TruthBody({ chain, item, swap, creator = false, replay = 0, onWhatsApp }: TruthBodyProps) {
  const t = useT();
  const truth = useMemo(() => itemTruth(item), [item]);
  const calories = useCountUp(Math.round(item.nutrients.calories), 300, replay);
  const scoreShown = useCountUp(truth.score?.score ?? 0, 300, replay);
  const [saved, setSaved] = useState<string | null>(null);
  const callout = calorieCalloutParts(truth.caloriePercent);
  const caloriesOnly = chain.nutritionLevel === "calories" || item.nutrients.protein === undefined;
  const message = shareMessage({ chainId: chain.id, chainName: chain.name, item, swap, origin: shareOrigin() });
  useHiddenLogos(); // re-render when the taken-down list arrives: itemImageUrl reads it
  const photos = !creator; // never in Creator View (filmed and posted)
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = photos && !photoFailed && itemImageUrl(item.image) !== undefined;
  const protein = item.nutrients.protein;
  const proteinPercent = truth.reference.find((r) => r.key === "protein")?.percent ?? 0;
  useEffect(() => { setLastTruthMessage(message); }, [message]);

  const saveImage = async () => {
    try {
      const blob = await renderTruthCard({ chainName: chain.name, itemName: item.name, nutrients: item.nutrients, truth, swap: swap ? { name: swap.item.name, kcal: swap.item.nutrients.calories, facts: swapFacts(swap) } : null, t });
      const r = await deliverImage(blob, { fileName: imageFileName(chain.name, item.name), title: t("{item} at {chain}", { item: item.name, chain: chain.name }), text: message });
      setSaved(r === "cancelled" ? null : r === "downloaded" ? t("Image saved to your downloads.") : t("Image ready to share."));
    } catch {
      setSaved(t("Couldn't make the image. Try again."));
    }
  };

  return (
    <div key={replay} className="pb-4">
      {/* the dish (its photo, the chain's logo and name on it); with no photo, or on the dark card, the chain's name (and logo) as a line */}
      {hasPhoto && <DishPhoto chain={chain} image={item.image} onFail={() => setPhotoFailed(true)} />}
      <p className={`items-center gap-2 text-base font-semibold text-muted [overflow-wrap:anywhere] ${hasPhoto ? "hidden [.truth-dark_&]:flex" : "flex"}`}>
        {photos && <span className="shrink-0 [.truth-dark_&]:hidden"><ChainMark chainId={chain.id} cuisine={chain.cuisine} size="sm" /></span>}
        <span className="min-w-0">{chain.name}</span>
      </p>

      {/* the numbers on ink tiles, as Home shows a day (founder 2026-11-21: "more colour ... too much wording"): calories and protein side by side, each with
          its share of the UK reference intake as a lime bar; the tiles stack when the text is large */}
      <div className={`truth-bounce mt-3 grid gap-2.5 ${protein !== undefined ? "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]" : ""}`}>
        <section aria-labelledby="truth-calories" className="truth-tile on-ink rounded-[1.25rem] p-4">
          <h3 id="truth-calories" className="truth-tile-sub text-[0.9375rem] font-semibold">{t("Calories")}</h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span aria-hidden className={`app-numbers font-extrabold leading-none tracking-tight ${creator ? "text-6xl" : "text-5xl"}`}>{formatInt(calories)}</span>
            <span className="sr-only">{formatInt(item.nutrients.calories)}</span>
            <span className="truth-tile-sub text-lg font-bold">kcal</span>
          </p>
          {callout && (
            <>
              <DayBar percent={callout.percent} />
              <p className="truth-tile-sub app-numbers mt-1.5 text-[0.9375rem] font-semibold leading-snug">{t("{percent}% of a 2,000 kcal day", { percent: callout.percent })}</p>
            </>
          )}
        </section>
        {protein !== undefined && (
          <section aria-labelledby="truth-protein" className="truth-tile on-ink rounded-[1.25rem] p-4">
            <h3 id="truth-protein" className="truth-tile-sub text-[0.9375rem] font-semibold">{t("Protein")}</h3>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <span className={`app-numbers font-extrabold leading-none tracking-tight ${creator ? "text-6xl" : "text-5xl"}`}>{gramsText(protein).replace(" g", "")}</span>
              <span className="truth-tile-sub text-lg font-bold">g</span>
            </p>
            <DayBar percent={proteinPercent} />
            <p className="truth-tile-sub app-numbers mt-1.5 text-[0.9375rem] font-semibold leading-snug">{t("{n}% of 50 g a day", { n: proteinPercent })}</p>
          </section>
        )}
      </div>

      {/* App Review 1.4.1: where the reference intakes, the traffic lights, "What that looks like" and the Protein score come from, at the top of the card,
          above the Protein score. */}
      <MenuSourcesLink className="mt-1" chain={chain} />

      {truth.score ? (
        <section aria-labelledby="truth-score" className="truth-tile on-ink truth-bounce mt-1 rounded-[1.25rem] p-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h3 id="truth-score" className="truth-tile-sub text-[0.9375rem] font-semibold">{t("Protein score")}</h3>
              <p className="mt-0.5 text-xl font-extrabold leading-snug">{t(SCORE_LABELS[truth.score.score])}</p>
            </div>
            <p className="flex items-baseline gap-1">
              <span aria-hidden className={`app-numbers font-extrabold leading-none tracking-tight ${creator ? "text-7xl" : "text-6xl"}`}>{scoreShown}</span>
              <span aria-hidden className="truth-tile-sub text-2xl font-bold">/ 5</span>
              <span className="sr-only">{t("{score} out of 5", { score: truth.score.score })}</span>
            </p>
          </div>
          <ScoreDots score={truth.score.score} />
          {/* how the score works, one tap away (the words stay, out of the way) */}
          <details className="group mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-[0.9375rem] font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
              {t("How it's scored")}
            </summary>
            <p className="truth-tile-sub pb-1 text-[0.9375rem] leading-snug">{t(PROTEIN_SCORE_HOW)}</p>
          </details>
        </section>
      ) : caloriesOnly && truth.kind !== "drink" ? (
        <p className="mt-3 rounded-[1.25rem] bg-fill p-4 text-base leading-snug">{t("{chain} publishes calories only for this dish, so there is no protein score.", { chain: chain.name })}</p>
      ) : null}

      <Lights truth={truth} chain={chain} />
      <Household rows={truth.household} replay={replay} />
      {swap && <SwapCard chain={chain} item={item} swap={swap} photos={photos} />}

      <div className="mt-7 space-y-2.5">
        <a
          href={whatsappUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onWhatsApp?.()}
          // the main button: ink with white words (on the dark card, white with ink words: .truth-dark swaps the two); never a messaging app's brand colour
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-bold text-on-ink transition active:scale-[0.97] hover:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <WhatsAppShareIcon className="h-6 w-6" />
          <span>{t("Share to WhatsApp")}</span>
          <span className="sr-only">{t("(opens in a new tab)")}</span>
        </a>
        <Button size="lg" full variant="secondary" onClick={() => void saveImage()}>
          <ImageDownIcon className="h-6 w-6" />
          {t("Save image card")}
        </Button>
        <p role="status" aria-live="polite" className="text-center text-base font-semibold text-foreground empty:hidden">{saved}</p>
      </div>

      <p className="mt-5 text-base leading-snug text-muted">
        {t("Not affiliated with {chain}.", { chain: chain.name })} {t("Percentages use the UK reference intakes.")}{" "}
        <a href={REFERENCE_INTAKE_SOURCE.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">
          {t("Source")}<span className="sr-only"> {t("(opens in a new tab)")}</span>
        </a>
      </p>
    </div>
  );
}
