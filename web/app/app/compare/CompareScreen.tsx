"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { addToCompare, COMPARE_MAX, compareRows, inCompare, mixedBasis, removeFromCompare, type CompareItem, type CompareKind, type CompareRow } from "@/lib/mm/compare";
import { formatPrice, photoSources, searchProducts, type ListedProduct } from "@/lib/mm/groceries";
import { itemImageUrl } from "@/lib/mm/images";
import { search } from "@/lib/mm/search";
import { compareStore } from "@/lib/mm/stores";
import { ChevronLeftIcon, CompareIcon, PlusIcon, SearchIcon } from "../_components/icons";
import { ItemThumb } from "../_components/ItemPhoto";
import { EmptyState, Spinner } from "../_components/ui";
import { compareDish, compareFoodFromListed } from "../_lib/compare";
import { useGroceryCatalogue } from "../_lib/groceries";
import { useHydrated, useSearchIndex, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { menuClient } from "../_lib/menu";
import { PhotoTile } from "../groceries/ProductPhoto";

// Compare (founder 2026-10-11: "compare various versions of products like beans to see the nutrient difference ... stuff like this too"): groceries per
// 100 g or ml, restaurant dishes per serving, never mixed. Each nutrient is one block with a bar per item, so it reads on a phone with up to six items;
// "Highest" and "Lowest" are the only marks (CLAUDE.md rule 3: never good or bad).
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): Home's compact title, white 20 px cards, each nutrient block
// headed by a small spaced-capital label with the figures in DM Mono and thin lime bars, like Home's macro rows.

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

function figure(row: CompareRow, v: number): string {
  if (row.unit === "kcal") return `${Math.round(v).toLocaleString("en-GB")} kcal`;
  if (row.unit === "£") return formatPrice(v);
  const g = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${g}g`;
}

export function CompareScreen({ tab: asked }: { tab: CompareKind | null }) {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const all = useStore(compareStore);
  const [picked, setPicked] = useState<CompareKind | null>(null);
  const foods = all.filter((i) => i.kind === "food");
  const dishes = all.filter((i) => i.kind === "dish");
  const tab: CompareKind = picked ?? asked ?? (foods.length === 0 && dishes.length > 0 ? "dish" : "food");
  const items = tab === "food" ? foods : dishes;
  const choose = (v: CompareKind) => {
    setPicked(v);
    router.replace(`/app/compare?tab=${v}`, { scroll: false });
  };
  const back = tab === "dish" ? "/app/eat-out" : "/app/groceries";

  return (
    <div>
      <Link href={back} aria-label={tab === "dish" ? t("Back to restaurants") : t("Back to groceries")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Compare")}</h1>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Pick a few products or dishes and see their numbers side by side.")}</p>

      <div role="tablist" aria-label={t("Compare")} className="glass mt-5 grid grid-cols-2 gap-1 rounded-full p-1">
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
              className={`min-h-12 rounded-full px-3 text-[0.9375rem] font-bold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {t(o.label)}{hydrated && n > 0 && <span className="app-numbers whitespace-nowrap font-semibold"> · {n}</span>}
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
                    ? t("Search above, for example “baked beans”, and add two or more. You can also tap “Compare” on any product.")
                    : t("Search above, for example “chicken burger”, and add two or more. You can also tap “Compare” on any dish.")}
                />
              </div>
            )}
            {items.length >= 2 && <SideBySide items={items} kind={tab} />}
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
                    {item.kind === "dish" ? <ItemThumb image={picture} /> : <PhotoTile sources={[{ src: picture, from: "retailer", shop: item.fromId }]} />}
                    <span className="absolute -start-1.5 -top-1.5 rounded-full ring-2 ring-white"><Num n={i + 1} small /></span>
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
              <button type="button" onClick={() => compareStore.update((l) => removeFromCompare(l, item.key))} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-soft-strong px-3.5 text-[0.8125rem] font-bold text-foreground transition active:scale-95 hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
                {t("Remove")}<span className="sr-only"> {item.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {items.length > 1 && (
        <div className="mt-1.5 flex justify-end">
          <button type="button" onClick={() => compareStore.update((l) => l.filter((x) => x.kind !== items[0]!.kind))} className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-semibold text-accent transition hover:bg-soft-strong active:scale-95">{t("Clear all")}</button>
        </div>
      )}
    </>
  );
}

/** The picture a chosen item shows: a dish's photo path for ItemThumb (none if its chain's photos are off or taken down), or a product's. */
function pictureOf(item: CompareItem): string | undefined {
  if (item.kind === "dish") {
    const image = item.photo?.replace(/^\/menu-images\//, "");
    return itemImageUrl(image) ? image : undefined;
  }
  return item.photo;
}

const Num = ({ n, small }: { n: number; small?: boolean }) => (
  <span aria-hidden className={`app-numbers grid shrink-0 place-items-center rounded-full bg-foreground font-[800] text-background ${small ? "h-6 w-6 text-[0.75rem]" : "h-7 w-7 text-[0.8125rem]"}`}>{n}</span>
);

/** A nutrient and the "of which" rows under it (sugars under carbohydrate, saturates under fat) go in one card. */
function groupRows(rows: readonly CompareRow[]): CompareRow[][] {
  const groups: CompareRow[][] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (row.sub && last) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

/**
 * One nutrient: a small spaced-capital label, then a row per item, like Home's macro rows: the item's number and full name, the figure in
 * DM Mono at the end with the "Highest" or "Lowest" mark in small grey capitals under it, and a thin bar under the row. Every bar in a
 * block spans the same width, so their lengths compare honestly.
 */
function NutrientBlock({ row, items }: { row: CompareRow; items: readonly CompareItem[] }) {
  const t = useT();
  const max = Math.max(0, ...row.values.map((v) => v ?? 0));
  return (
    <div>
      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t(row.label)}</h3>
      <ul className="mt-3.5 space-y-4">
        {row.values.map((v, i) => {
          const item = items[i]!;
          const tag = row.highest.includes(i) ? t("Highest") : row.lowest.includes(i) ? t("Lowest") : null;
          return (
            <li key={item.key}>
              <div className="flex items-start gap-2.5">
                <Num n={i + 1} small />
                <span className="min-w-0 flex-1 pt-0.5 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{item.kind === "dish" ? `${item.name} · ${item.from}` : item.name}</span>
                {/* the figure, and the mark (if any) always right under it, so every row in a block lines up the same way */}
                <span className="flex shrink-0 flex-col items-end gap-1 pt-[0.2rem] text-end">
                  <span className="app-numbers font-mono text-[0.8125rem] font-normal leading-snug">{v === null ? <span className="font-sans text-muted">{item.kind === "dish" ? t("not published") : t("not on the label")}</span> : figure(row, v)}</span>
                  {tag && <span className="whitespace-nowrap text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.12em] text-muted">{tag}</span>}
                </span>
              </div>
              <span className="ms-[2.125rem] mt-2 block h-1 overflow-hidden rounded-full bg-[var(--ring-track)]">
                {v !== null && max > 0 && <span className="block h-full rounded-full bg-[var(--bar)]" style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SideBySide({ items, kind }: { items: readonly CompareItem[]; kind: CompareKind }) {
  const t = useT();
  const groups = useMemo(() => groupRows(compareRows(items)), [items]);
  const basis = kind === "dish" ? t("Per serving, as each restaurant publishes it.") : items.every((i) => i.basis === "ml") ? t("Per 100 ml, as each label prints it.") : t("Per 100 g, as each label prints it.");
  return (
    <section aria-labelledby="side-heading" className="mt-8">
      <h2 id="side-heading" className="text-xl font-[800] tracking-[-0.01em]">{t("Side by side")}</h2>
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{basis}</p>
      {kind === "food" && mixedBasis(items) && <p className="glass mt-3 rounded-[1.25rem] px-4 py-3 text-[0.9375rem] leading-snug">{t("Some of these labels are per 100 ml or for the cooked food, so compare those with care.")}</p>}
      <div className="mt-3.5 space-y-3.5">
        {groups.map((group) => (
          <div key={group[0]!.id} className="glass rounded-[1.25rem] p-4">
            {group.map((row, gi) => (
              <div key={row.id} className={gi > 0 ? "mt-5 border-t border-line pt-4" : ""}>
                <NutrientBlock row={row} items={items} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-5 text-[0.9375rem] leading-snug text-muted">
        {kind === "food"
          ? t("Numbers as each product's label or page showed them when you added it. Price per kg is the shop's own; “Protein for £1” is that price worked out for the protein. Always check the pack.")
          : t("Numbers as each restaurant publishes them, per serving. Servings differ in size, so a bigger dish can have more of everything.")}
      </p>
    </section>
  );
}

function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <label className="relative mt-7 block">
      <span className="mb-3 block text-xl font-[800] tracking-[-0.01em]">{label}</span>
      <span className="relative block">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search" autoComplete="off" className="glass min-h-13 w-full rounded-full ps-11 pe-4 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:appearance-none" />
      </span>
    </label>
  );
}

function AddButton({ added, onAdd, name, disabled }: { added: boolean; onAdd: () => void; name: string; disabled: boolean }) {
  const t = useT();
  return (
    <button type="button" onClick={onAdd} disabled={added || disabled} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3.5 text-[0.8125rem] font-bold transition active:scale-95 disabled:cursor-default ${added ? "bg-sun text-on-accent" : "bg-soft-strong text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--soft-strong))] disabled:opacity-40"}`}>
      {added ? t("Added") : (<><PlusIcon className="h-4 w-4" />{t("Add")}</>)}
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

function FoodResults({ query, items }: { query: string; items: readonly CompareItem[] }) {
  const t = useT();
  const catalogue = useGroceryCatalogue(null);
  const prefer = useSettings().shops?.[0] ?? null;
  const results = useMemo(() => searchProducts(catalogue.products, { query, sort: "name" }).slice(0, 8), [catalogue.products, query]);
  const full = items.filter((i) => i.kind === "food").length >= COMPARE_MAX;
  if (catalogue.status === "loading") return <Spinner label={t("Loading products")} />;
  if (catalogue.status === "error") return <p className="mt-3 text-[0.9375rem] text-muted">{t("Couldn't load the products. Check your connection.")}</p>;
  if (!results.length) return <p className="mt-3 text-[0.9375rem] text-muted">{t("No products match.")}</p>;
  return (
    <>
      <ul className={`mt-3 ${listClass}`}>
        {results.map((p: ListedProduct) => {
          const entry = compareFoodFromListed(p, prefer);
          const added = inCompare(items, entry.key);
          const sources = photoSources(p, prefer);
          return (
            <li key={p.gtin} className={rowClass}>
              {sources.length > 0 && <span className={thumbClass}><PhotoTile sources={sources} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-snug">{entry.name}</span>
                <span className="app-numbers mt-1 block text-[0.875rem] leading-snug text-muted [text-wrap:balance]">{t("{kcal} kcal · {protein}g protein per 100 {unit}", { kcal: Math.round(entry.numbers.kcal), protein: entry.numbers.protein ?? 0, unit: entry.basis })}</span>
                <span className="app-numbers block text-[0.875rem] leading-snug text-muted">{entry.from}{entry.price !== undefined ? ` · ${formatPrice(entry.price)}` : ""}</span>
              </span>
              <AddButton added={added} disabled={full} name={entry.name} onAdd={() => compareStore.update((l) => addToCompare(l, entry).list)} />
            </li>
          );
        })}
      </ul>
      {full && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("You can compare up to {n} at a time. Take one off first.", { n: COMPARE_MAX })}</p>}
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
      {full && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("You can compare up to {n} at a time. Take one off first.", { n: COMPARE_MAX })}</p>}
    </>
  );
}
