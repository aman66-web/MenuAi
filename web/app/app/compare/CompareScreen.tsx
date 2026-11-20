"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { addToCompare, COMPARE_MAX, compareRows, inCompare, mixedBasis, notAllLabels, removeFromCompare, shownFigure, sourceLabel, trafficLightFor, type CompareItem, type CompareKind, type CompareRow } from "@/lib/mm/compare";
import { formatPrice, retailerName, type PhotoSource } from "@/lib/mm/groceries";
import { searchShopProducts, shopPhotoSources } from "@/lib/mm/shopProducts";
import { normalizeForSearch } from "@/lib/mm/search";
import { COMPARE_PICK_ENABLED } from "@/lib/mm/comparePick";
import { itemImageUrl } from "@/lib/mm/images";
import { isTakenDown } from "@/lib/mm/logos";
import { search } from "@/lib/mm/search";
import { compareStore } from "@/lib/mm/stores";
import { BasketIcon, CheckIcon, CompareIcon, ForkIcon, InfoIcon, PlusIcon, SearchIcon } from "../_components/icons";
import { ItemThumb } from "../_components/ItemPhoto";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../_components/SearchDone";
import { Button, Chip, ChoiceMark, EmptyState, ErrorBox, inputClass, Spinner } from "../_components/ui";
import { compareDish, compareFoodFromShop } from "../_lib/compare";
import { labelShops } from "../_components/addfood/ProductPick";
import { useShopLists, useShopManifest } from "../_lib/shopProducts";
import { PageHeader } from "../_components/PageHeader";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useHydrated, useSearchIndex, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { menuClient } from "../_lib/menu";
import { PhotoTile, usePhotoSource } from "../groceries/ProductPhoto";
import { compareOverview, type OverviewEntry } from "@/lib/mm/compareOverview";
import { PipsPick } from "./PipsPick";

// Compare (founder 2026-10-11: "compare various versions of products like beans to see the nutrient difference ... stuff like this too"): groceries per
// 100 g or ml, restaurant dishes per serving, never mixed. "Highest" and "Lowest" are the only marks (CLAUDE.md rule 3: never good or bad).
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): Home's compact title and white 20 px cards, figures in DM Mono.
// Layout (founder 2026-10-15, on the nutrient-by-nutrient blocks: "I think like a side by side table works better instead"): one table, a column per
// item and a row per nutrient, the nutrient names kept in view (sticky) while the columns scroll sideways when there are more than fit.

const TABS: ReadonlyArray<{ value: CompareKind; label: string }> = [
  { value: "food", label: "Groceries" },
  { value: "dish", label: "Restaurant dishes" },
];

/** A list is one white card with a hairline between its rows (fewer boxes, like the entries on Today's meals). A row: a picture, the words,
 *  and the action at the end. The picture steps aside when the row is narrow (large text), so the name keeps room to read; the numbers
 *  and the action matter more. */
const listClass = "glass divide-y divide-line overflow-hidden rounded-[1.25rem]";
const rowClass = "@container flex min-h-20 items-center gap-3 px-3 py-3";
const thumbClass = "hidden shrink-0 @[20rem]:block";

/** A figure as its number and its unit, so the table can set the unit smaller ("91" "kcal", "12.5" "g", "0.58" "g", "£1.35" with none).
 *  Grams as the label prints them (at most 2 decimals), so the table agrees with the product's page; the marks are judged on the same figures. */
function figureParts(row: CompareRow, v: number): { n: string; unit: string } {
  if (row.unit === "kcal") return { n: shownFigure(row, v).toLocaleString("en-GB"), unit: "kcal" };
  if (row.unit === "£") return { n: formatPrice(v), unit: "" };
  return { n: shownFigure(row, v).toLocaleString("en-GB", { maximumFractionDigits: 2 }), unit: "g" };
}

export function CompareScreen({ tab: asked }: { tab: CompareKind | null }) {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const all = useStore(compareStore);
  useHiddenLogos(); // the pictures below follow the taken-down list (public/logos/hidden.json), also when it arrives after the page opened
  const [picked, setPicked] = useState<CompareKind | null>(null);
  const foods = all.filter((i) => i.kind === "food");
  const dishes = all.filter((i) => i.kind === "dish");
  const tab: CompareKind = picked ?? asked ?? (foods.length === 0 && dishes.length > 0 ? "dish" : "food");
  const items = tab === "food" ? foods : dishes;
  const choose = (v: CompareKind) => {
    setPicked(v);
    router.replace(`/app/compare?tab=${v}`, { scroll: false });
  };

  return (
    <div>
      {/* the header every page has (colour meeting, 19 November 2026): Back goes to the page before (a product, a dish, Groceries, Eat out...) when there is
          one in the app, else the list the open tab compares from; the Shopping list pill while comparing foods (they are things to buy); the Settings cog */}
      <PageHeader
        back={tab === "dish" ? { href: "/app/eat-out", label: t("Back to restaurants") } : { href: "/app/groceries", label: t("Back to groceries") }}
        list={tab === "food"}
        title={t("Compare")}
      />
      {/* no intro: the tabs, "Add a product" and the empty card say what to do (the words pass, 20 November 2026) */}

      <div role="tablist" aria-label={t("Compare")} className="mt-5 grid grid-cols-2 gap-1 rounded-full border-[1.5px] border-edge bg-background p-1">
        {TABS.map((o, i) => {
          const on = o.value === tab;
          const n = o.value === "food" ? foods.length : dishes.length;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              id={`tab-${o.value}`}
              aria-selected={on}
              aria-controls="compare-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => choose(o.value)}
              onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); choose(TABS[(i + 1) % 2]!.value); } }}
              className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3 text-[0.9375rem] leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-transparent font-semibold text-foreground hover:bg-card"}`}
            >
              {/* the open tab is lime with the dark green edge and a tick, like every chosen thing (colour meeting, 19 November 2026), never ink */}
              {on && <ChoiceMark on />}
              <span>{t(o.label)}{hydrated && n > 0 && <span className="app-numbers whitespace-nowrap font-semibold"> · {n}</span>}</span>
            </button>
          );
        })}
      </div>

      <div id="compare-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        <h2 className="sr-only">{tab === "food" ? t("Groceries") : t("Restaurant dishes")}</h2>
        {!hydrated ? null : (
          <>
            {items.length > 0 && <Chosen items={items} />}
            {tab === "food" ? <FoodAdder items={all} /> : <DishAdder items={all} />}
            {items.length === 1 && <p className="glass mt-4 rounded-[1.25rem] px-4 py-3.5 text-[0.9375rem] leading-snug">{t("Add at least one more to see them side by side.")}</p>}
            {items.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={<CompareIcon />}
                  title={tab === "food" ? t("Nothing to compare yet") : t("No dishes to compare yet")}
                  body={tab === "food"
                    ? t("Add two or more above, or tap “Compare” on any product.")
                    : t("Add two or more above, or tap “Compare” on any dish.")}
                />
              </div>
            )}
            {items.length >= 2 && (<><SideBySide items={items} kind={tab} /><Overview items={items} /></>)}
          </>
        )}
      </div>
    </div>
  );
}

function Chosen({ items }: { items: readonly CompareItem[] }) {
  const t = useT();
  // When some rows have a picture, a row without one keeps the picture's width for its number, so every name starts at the same place.
  const slot = items.some((it) => pictureOf(it)) ? (items[0]?.kind === "dish" ? "@[20rem]:w-14" : "@[20rem]:w-16") : "";
  return (
    <>
      <ol className={listClass}>
        {items.map((item, i) => {
          const picture = pictureOf(item);
          return (
            <li key={item.key} className={rowClass}>
              {/* With a picture, its number sits on the picture's corner, so the name keeps the room; without one (or when the row is
                  narrow and the picture steps aside) the number stands on its own. */}
              <span className={`grid shrink-0 place-items-center ${picture ? "@[20rem]:hidden" : slot}`}><Num n={i + 1} /></span>
              {picture && (
                <span className={thumbClass}>
                  <span className={`relative block ${item.kind === "dish" ? "h-14 w-14" : "h-16 w-16"}`}>
                    {item.kind === "dish" ? <ItemThumb image={picture} /> : <PhotoTile sources={foodPhotoSources(item)} />}
                    <span className="absolute -start-1.5 -top-1.5 rounded-full ring-2 ring-card"><Num n={i + 1} small /></span>
                  </span>
                </span>
              )}
              <Link href={item.href} className="min-w-0 flex-1 py-1">
                <span className="block text-base font-bold leading-snug [overflow-wrap:break-word]">{item.name}</span>
                <span className="app-numbers mt-1 block text-[0.875rem] leading-snug text-muted">
                  {item.from}
                  {item.price !== undefined && ` · ${formatPrice(item.price)}`}
                  {item.note && ` · ${item.note}`}
                </span>
              </Link>
              <button type="button" onClick={() => compareStore.update((l) => removeFromCompare(l, item.key))} className="inline-flex min-h-11 shrink-0 items-center rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft px-3.5 text-[0.8125rem] font-bold text-foreground transition active:scale-95 hover:bg-[var(--fill)]">
                {t("Remove")}<span className="sr-only"> {item.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {items.length > 1 && (
        <div className="mt-2.5 flex justify-end">
          <Button variant="secondary" onClick={() => compareStore.update((l) => l.filter((x) => x.kind !== items[0]!.kind))}>{t("Clear all")}</Button>
        </div>
      )}
    </>
  );
}

/** The picture a chosen item shows: a dish's photo path for ItemThumb (none if its chain's photos are off or taken down), or a product's (none if the shop the
 *  photo is from has been taken down: the item keeps the photo address from when it was added, so the taken-down list is checked here, every time it is shown). */
function pictureOf(item: CompareItem): string | undefined {
  if (item.kind === "dish") {
    const image = item.photo?.replace(/^\/menu-images\//, "");
    return itemImageUrl(image) ? image : undefined;
  }
  return foodPhotoSources(item)[0]?.src;
}

/** Whose picture a stored product photo is: our copy of a shop's photo (/grocery-images/<shop>/...), or a supermarket's own image server, or Open Food Facts (no shop). */
const PHOTO_HOST_SHOP: Readonly<Record<string, string>> = {
  "assets.sainsburys-groceries.co.uk": "sainsburys", "asdagroceries.scene7.com": "asda", "dm.emea.cms.aldi.cx": "aldi", "imgproxy-retcat.assets.schwarz": "lidl",
  "digitalcontent.api.tesco.com": "tesco", "ecom-su-static-prod.wtrecom.com": "waitrose", "groceries.morrisons.com": "morrisons", "assets.iceland.co.uk": "iceland",
  "assets.digitalcontent.marksandspencer.app": "marks-and-spencer", "images.openfoodfacts.org": "",
};
function photoShop(src: string, fallback: string): string {
  const stored = /^\/grocery-images\/([a-z0-9-]+)\//.exec(src);
  if (stored) return stored[1]!;
  try {
    return PHOTO_HOST_SHOP[new URL(src).hostname] ?? fallback;
  } catch {
    return fallback;
  }
}

/** A product's picture as a photo source, or none when its shop (the one the photo is from, or the one it was added from) is on the taken-down list. */
function foodPhotoSources(item: CompareItem): PhotoSource[] {
  if (item.kind !== "food" || !item.photo) return [];
  const shop = photoShop(item.photo, item.fromId);
  if (isTakenDown(`shop:${item.fromId}`) || (shop && isTakenDown(`shop:${shop}`))) return [];
  return [{ src: item.photo, from: item.photo.startsWith("/") ? "stored" : shop ? "retailer" : "off", shop }];
}

/** A column's picture: the shop's own photo of the product (on white, whole) or the restaurant's own photo of the dish; a quiet tile when there is none,
 *  so the columns line up. Decorative: the name under it is the column's heading. */
function HeaderPicture({ item }: { item: CompareItem }) {
  const picture = pictureOf(item);
  const food = usePhotoSource(foodPhotoSources(item));
  const [dishFailed, setDishFailed] = useState(false);
  const src = item.kind === "dish" ? (dishFailed ? undefined : itemImageUrl(picture)) : food.current?.src;
  return (
    <span aria-hidden className={`grid aspect-square w-full max-w-[7.5rem] place-items-center overflow-hidden rounded-[1rem] ${src ? "bg-card ring-1 ring-line" : "bg-[var(--fill)] text-muted"}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the shop's or restaurant's own photo, already a small file
        <img src={src} alt="" width={120} height={120} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={item.kind === "dish" ? () => setDishFailed(true) : food.fail} className={`h-full w-full ${item.kind === "dish" ? "object-cover" : "object-contain p-1.5"}`} />
      ) : item.kind === "dish" ? <ForkIcon className="h-7 w-7" /> : <BasketIcon className="h-7 w-7" />}
    </span>
  );
}

const Num = ({ n, small }: { n: number; small?: boolean }) => (
  <span aria-hidden className={`app-numbers grid shrink-0 place-items-center rounded-full bg-ink font-[800] text-on-ink ${small ? "h-6 w-6 text-[0.75rem]" : "h-7 w-7 text-[0.8125rem]"}`}>{n}</span>
);

/**
 * The comparison table: a column per item (its number, name and shop or restaurant) and a row per nutrient, the "of which" rows (sugars, saturates)
 * indented under theirs. The figure is in DM Mono with its unit smaller; the highest and lowest of a row say so in small capitals under the figure
 * (words only: neither is "better"). The nutrient names stay in view while the item columns scroll sideways, which they do once more than two fit
 * on the screen.
 */
function SideBySide({ items, kind }: { items: readonly CompareItem[]; kind: CompareKind }) {
  const t = useT();
  const rows = useMemo(() => compareRows(items), [items]);
  const lights = useMemo(() => rows.some((r) => items.some((it, i) => r.values[i] !== null && trafficLightFor(it, r.id) !== null)), [rows, items]);
  const pictures = items.some((it) => pictureOf(it));
  // when the columns don't all fit, say so in words (usability test 2026-11-19: the second dish's column was cut off and no one thought to swipe sideways)
  const scroller = useRef<HTMLDivElement>(null);
  const [wider, setWider] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setWider(el.scrollWidth > el.clientWidth + 4 && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, [items]);
  // not every food's figures are a shop's label: the basis line and the footnote say so, and each column names its source (2026-11-20)
  const others = kind === "food" && notAllLabels(items);
  const basis = kind === "dish" ? t("Per serving, as each restaurant publishes it.")
    : others ? (items.every((i) => i.basis === "ml") ? t("Per 100 ml. Not all from a shop's label: each column says.") : t("Per 100 g. Not all from a shop's label: each column says."))
    : items.every((i) => i.basis === "ml") ? t("Per 100 ml, as each label prints it.") : t("Per 100 g, as each label prints it.");
  return (
    <section aria-labelledby="side-heading" className="mt-8">
      <h2 id="side-heading" className="text-xl font-[800] tracking-[-0.01em]">{t("Side by side")}</h2>
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{basis}</p>
      {kind === "food" && mixedBasis(items) && <p className="glass mt-3 rounded-[1.25rem] px-4 py-3 text-[0.9375rem] leading-snug">{t("Some are per 100 ml or for the cooked food: compare with care.")}</p>}
      {wider && <p className="mt-3 text-[0.9375rem] font-semibold leading-snug">{t("Swipe sideways for more →")}</p>}
      <div className="glass mt-3.5 overflow-hidden rounded-[1.25rem]">
        {/* focusable so the keyboard can scroll it sideways */}
        <div ref={scroller} role="group" aria-label={basis} tabIndex={0} className="overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
          <table aria-labelledby="side-heading" className="w-full min-w-full border-separate border-spacing-0 text-start">
            <thead>
              <tr>
                <th scope="col" className={`${labelCell} border-b-0 pb-3 pt-4`}><span className="sr-only">{t("Side by side")}</span></th>
                {items.map((item, i) => (
                  <th key={item.key} scope="col" className="min-w-[6.5rem] px-2.5 pb-3 pt-4 text-start align-top font-normal">
                    {/* founder 2026-11-17: the product's picture on top, so it's clear which is which without reading the name; its number sits on the corner */}
                    {pictures ? (
                      <span className="relative block">
                        <HeaderPicture item={item} />
                        <span className="absolute -start-1 -top-1"><Num n={i + 1} small /></span>
                      </span>
                    ) : <Num n={i + 1} small />}
                    <span className="mt-2 block text-[0.8125rem] font-bold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden [overflow-wrap:anywhere]">{item.name}</span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted [overflow-wrap:anywhere]">{item.from}</span>
                    {item.kind === "food" && <span className="mt-0.5 block text-[0.8125rem] font-semibold leading-snug [overflow-wrap:anywhere]">{sourceLabel(item, t)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={`${labelCell} border-t border-line ${row.sub ? "ps-5 font-medium text-muted" : "font-semibold"}`}>{t(row.label)}</th>
                  {row.values.map((v, i) => {
                    const tag = row.highest.includes(i) ? t("Highest") : row.lowest.includes(i) ? t("Lowest") : null;
                    const f = v === null ? null : figureParts(row, v);
                    return (
                      <td key={items[i]!.key} className="border-t border-line px-2.5 py-3 align-top">
                        {f ? (
                          <span className="app-numbers font-mono text-base leading-none">{f.n}{f.unit && <span className="font-sans text-[0.75rem] text-muted"> {f.unit}</span>}</span>
                        ) : (
                          <span className="block text-[0.8125rem] leading-snug text-muted">{items[i]!.kind === "dish" ? t("not published") : row.id === "perKg" || row.id === "proteinPound" ? (items[i]!.basis === "ml" ? t("no price per litre") : t("no price per kg")) : t("not on the label")}</span>
                        )}
                        {/* founder 2026-11-17: the UK traffic-light colour of fat, saturates, sugars and salt (foods per 100 g only; the word as well as the colour) */}
                        {(() => { const light = f ? trafficLightFor(items[i]!, row.id) : null; return light ? <span className="mt-1.5 block"><span className="inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-bold leading-tight text-[var(--tl-ink)]" style={{ background: `var(--tl-${light})` }}>{t(LIGHT_WORD[light])}</span></span> : null; })()}
                        {tag && <span className="mt-1.5 block text-[0.8125rem] font-semibold leading-tight text-muted">{tag}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {COMPARE_PICK_ENABLED && <PipsPick items={items} picture={(i) => <HeaderPicture item={i} />} />}
      <p className="mt-5 text-[0.9375rem] leading-snug text-muted">
        {kind === "food"
          ? t("Numbers from when you added each product. “Protein for £1” is worked out from the shop's own price per kg. Always check the pack.")
            + (others ? " " + t("Some figures are Open Food Facts (community data) or UK government figures for loose fruit and veg, as each column says.") : "")
            + (lights ? " " + t("Colours are the UK Food Standards Agency's traffic-light bands for fat, saturates, sugars and salt per 100 g.") : "")
          : t("Servings differ in size, so a bigger dish can have more of everything.")}
      </p>
    </section>
  );
}

/**
 * The overview under the table (founder 2026-11-17: "best for price, best for protein, best for whatever"): which item leads on each figure, worked out from the
 * numbers above with no AI (lib/mm/compareOverview.ts). One figure at a time and only the leader's name and figure: it never says food is good or bad (rule 3).
 */
function Overview({ items }: { items: readonly CompareItem[] }) {
  const t = useT();
  const { entries, mixed } = useMemo(() => compareOverview(items), [items]);
  if (items.length < 2) return null;
  const dishes = items.every((i) => i.kind === "dish");
  const per = dishes ? t("per serving") : items.every((i) => i.basis === "ml") ? t("per 100 ml") : t("per 100 g");
  const figure = (e: OverviewEntry): string => {
    const n = e.value.toLocaleString("en-GB");
    switch (e.id) {
      case "price": return `${formatPrice(e.value)} ${items.every((i) => i.basis === "ml") ? t("per litre") : t("per kg")}`;
      case "protein": return `${n} g ${per}`;
      case "proteinMoney": return t("{n} g protein for £1", { n });
      case "proteinCalories": return t("{n} g protein per 100 kcal", { n });
      case "calories": return `${n} kcal ${per}`;
      default: return `${n} g ${per}`;
    }
  };
  return (
    <section aria-labelledby="overview-heading" className="mt-8">
      <h2 id="overview-heading" className="text-xl font-[800] tracking-[-0.01em]">{t("Overview")}</h2>
      {mixed ? (
        <p className="glass mt-3 rounded-[1.25rem] px-4 py-3 text-[0.9375rem] leading-snug">{t("Some are per 100 g and some per 100 ml, so there's no overview.")}</p>
      ) : entries.length === 0 ? (
        <p className="glass mt-3 rounded-[1.25rem] px-4 py-3 text-[0.9375rem] leading-snug">{t("These match on every figure, or too few figures are published, so no one leads.")}</p>
      ) : (
        <>
          <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Which one leads on each figure.")}</p>
          <ul className="glass mt-3.5 divide-y divide-[var(--line)] overflow-hidden rounded-[1.25rem]">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5">
                <span className="min-w-[8.5rem] flex-1 basis-[8.5rem] text-[0.9375rem] font-bold leading-snug">{t(e.label)}</span>
                <span className="min-w-0 flex-[2] basis-[12rem]">
                  {e.winners.map((i) => (
                    <span key={items[i]!.key} className="flex items-start gap-2 py-0.5">
                      <Num n={i + 1} small />
                      <span className="min-w-0 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{items[i]!.name}</span>
                    </span>
                  ))}
                  <span className="app-numbers mt-0.5 block text-[0.8125rem] leading-snug text-muted">{figure(e)}{e.winners.length > 1 ? ` · ${t("tied")}` : ""}{e.notLabel ? ` · ${t("not from a shop label")}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] leading-snug text-muted">{t("What suits each person differs; this isn't advice.")}</p>
        </>
      )}
    </section>
  );
}

const LIGHT_WORD = { green: "Low", amber: "Medium", red: "High" } as const;

/** The nutrient names column: stays at the start while the item columns scroll under it. */
const labelCell = "sticky start-0 z-10 w-[7.25rem] min-w-[7.25rem] max-w-[7.25rem] border-e border-line bg-card px-2.5 py-3 text-start align-top text-[0.8125rem] leading-snug [overflow-wrap:break-word]";

function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  const id = useId();
  return (
    <div className="mt-7">
      <label htmlFor={id} className="mb-3 block text-xl font-[800] tracking-[-0.01em]">{label}</label>
      <div className="group/search relative">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...DONE_KEY} autoComplete="off" className={`${inputClass} min-h-13 ps-11 pe-4 ${DONE_ROOM} [&::-webkit-search-cancel-button]:appearance-none`} />
        <SearchDone />
      </div>
    </div>
  );
}

function AddButton({ added, onAdd, name, disabled }: { added: boolean; onAdd: () => void; name: string; disabled: boolean }) {
  const t = useT();
  return (
    // "+ Add" is the ink add pill (every add is ink); once added it is the chosen lime with the dark green edge and a tick (colour meeting, 19 November 2026)
    <button type="button" onClick={onAdd} disabled={added || disabled} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border-[1.5px] px-3.5 text-[0.875rem] font-bold transition active:scale-95 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${added ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-ink bg-ink text-on-ink hover:not-disabled:bg-ink-pressed disabled:border-transparent disabled:bg-soft-strong disabled:text-muted"}`}>
      {added ? (<><CheckIcon aria-hidden className="h-4 w-4" strokeWidth={2.6} />{t("Added")}</>) : (<><PlusIcon aria-hidden className="h-4 w-4" />{t("Add")}</>)}
      <span className="sr-only"> {name}</span>
    </button>
  );
}

function FoodAdder({ items }: { items: readonly CompareItem[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  return (
    <div>
      <SearchBox value={query} onChange={setQuery} label={t("Add a product")} placeholder={t("Type a product, e.g. baked beans")} />
      {deferred.trim().length >= 2 && <FoodResults query={deferred.trim()} items={items} />}
    </div>
  );
}

/** A full list says what to do once, under the results (as a button's reason does), never a row of greyed buttons on their own. */
function FullNote() {
  const t = useT();
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[0.9375rem] font-semibold leading-snug">
      <InfoIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
      <span className="min-w-0">{t("You can compare up to {n} at a time. Remove one to add another.", { n: COMPARE_MAX })}</span>
    </p>
  );
}

/** Products to add, from the supermarkets' own lists (2026-11-20: as Add food searches them; it searched only the older catalogue's community numbers): the
 *  person's own shops, or one shop they pick; only products we have numbers for, each saying where its numbers come from once added. */
function FoodResults({ query, items }: { query: string; items: readonly CompareItem[] }) {
  const t = useT();
  const mine = useSettings().shops ?? [];
  const mineKey = mine.join(",");
  const manifest = useShopManifest();
  const shops = useMemo(() => labelShops(manifest, mineKey ? mineKey.split(",") : []), [manifest, mineKey]);
  const own = shops.filter((s) => mine.includes(s));
  const [scope, setScope] = useState<string | null>(null);
  const ids = scope ? [scope] : own.length > 0 ? own.slice(0, 3) : shops.slice(0, 1);
  const [retry, setRetry] = useState(0);
  const idsKey = ids.join(",");
  const lists = useShopLists(manifest ? ids : [], retry);
  const results = useMemo(() => {
    if (lists.status !== "ready") return [];
    const out: CompareItem[] = [];
    for (const id of idsKey.split(",")) {
      const l = lists.loaded.find((x) => x.file.retailer === id);
      if (!l) continue;
      const found = searchShopProducts(l.products, { query, nutrition: true }).map((p) => ({ p, len: normalizeForSearch(p.name).length }));
      found.sort((a, b) => a.len - b.len);
      for (const { p } of found.slice(0, 8)) {
        const entry = compareFoodFromShop(l.file, p);
        if (entry) out.push(entry);
      }
    }
    return out.slice(0, 8);
  }, [lists, query, idsKey]);
  const files = new Map((lists.status === "ready" ? lists.loaded : []).map((l) => [l.file.retailer, l]));
  const full = items.filter((i) => i.kind === "food").length >= COMPARE_MAX;
  return (
    <>
      {shops.length > 1 && (
        <div role="group" aria-label={t("Supermarket")} className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {own.length > 0 && <Chip selected={scope === null} onClick={() => setScope(null)}>{t("My shops")}</Chip>}
          {shops.map((id) => (<Chip key={id} selected={scope === id || (scope === null && own.length === 0 && ids[0] === id)} onClick={() => setScope(id)}>{retailerName(id)}</Chip>))}
        </div>
      )}
      {!manifest || lists.status === "loading" ? (
        <Spinner label={t("Loading products")} />
      ) : lists.loaded.length === 0 && lists.failed.length > 0 ? (
        <div className="mt-3"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : results.length === 0 ? (
        <p className="mt-3 text-[0.9375rem] text-muted">{t("No products with their numbers match.")}</p>
      ) : (
        <ul className={`mt-3 ${listClass}`}>
          {results.map((entry) => {
            const added = inCompare(items, entry.key);
            const l = files.get(entry.fromId);
            const p = l?.products.find((x) => entry.key === `food:${entry.fromId}:${x.id}`);
            const sources = l && p ? shopPhotoSources(l.file, p) : [];
            return (
              <li key={entry.key} className={rowClass}>
                {sources.length > 0 && <span className={thumbClass}><PhotoTile sources={sources} /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-snug">{entry.name}</span>
                  <span className="app-numbers mt-1 block text-[0.875rem] leading-snug text-muted [text-wrap:balance]">{t("{kcal} kcal · {protein} protein per 100 {unit}", { kcal: Math.round(entry.numbers.kcal), protein: `${Math.round((entry.numbers.protein ?? 0) * 10) / 10}\u00a0g`, unit: entry.basis })}</span>
                  <span className="app-numbers block text-[0.875rem] leading-snug text-muted">{entry.from}{entry.price !== undefined ? ` · ${formatPrice(entry.price)}` : ""}{entry.source !== "label" ? ` · ${sourceLabel(entry, t)}` : ""}</span>
                </span>
                <AddButton added={added} disabled={full} name={entry.name} onAdd={() => compareStore.update((l) => addToCompare(l, entry).list)} />
              </li>
            );
          })}
        </ul>
      )}
      {full && <FullNote />}
    </>
  );
}

function DishAdder({ items }: { items: readonly CompareItem[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  return (
    <div>
      <SearchBox value={query} onChange={setQuery} label={t("Add a dish")} placeholder={t("Type a dish or restaurant, e.g. chicken burger")} />
      {deferred.trim().length >= 2 && <DishResults query={deferred.trim()} items={items} />}
    </div>
  );
}

function DishResults({ query, items }: { query: string; items: readonly CompareItem[] }) {
  const t = useT();
  const { searchIndex } = useSearchIndex();
  const [failed, setFailed] = useState<string | null>(null);
  const hits = useMemo(() => (searchIndex ? search(searchIndex, query, 8).items : []), [searchIndex, query]);
  const full = items.filter((i) => i.kind === "dish").length >= COMPARE_MAX;
  if (!searchIndex) return <Spinner label={t("Loading restaurants")} />;
  if (!hits.length) return <p className="mt-3 text-[0.9375rem] text-muted">{t("No dishes match.")}</p>;
  const add = (chainId: string, itemId: string) => {
    setFailed(null);
    menuClient.loadChain(chainId).then(
      (ix) => {
        const item = ix.items.get(itemId);
        if (item) compareStore.update((l) => addToCompare(l, compareDish(ix.chain, item)).list);
      },
      () => setFailed(t("Couldn't load this menu.")),
    );
  };
  return (
    <>
      <ul className={`mt-3 ${listClass}`}>
        {hits.map((h) => {
          const added = inCompare(items, `dish:${h.chainId}:${h.itemId}`);
          return (
            <li key={`${h.chainId}:${h.itemId}`} className="flex min-h-16 items-center gap-3 py-3 pe-3 ps-4">
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-snug">{h.name}</span>
                <span className="app-numbers mt-1 block text-[0.875rem] leading-snug text-muted">{h.chainName} · {Math.round(h.calories).toLocaleString("en-GB")} kcal</span>
              </span>
              <AddButton added={added} disabled={full} name={h.name} onAdd={() => add(h.chainId, h.itemId)} />
            </li>
          );
        })}
      </ul>
      {failed && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold">{failed}</p>}
      {full && <FullNote />}
    </>
  );
}
