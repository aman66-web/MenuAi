"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { addToCompare, COMPARE_MAX, compareRows, inCompare, mixedBasis, removeFromCompare, type CompareItem, type CompareKind, type CompareRow } from "@/lib/mm/compare";
import { formatPrice, photoSources, searchProducts, type ListedProduct } from "@/lib/mm/groceries";
import { search } from "@/lib/mm/search";
import { compareStore } from "@/lib/mm/stores";
import { ChevronLeftIcon, CompareIcon, PlusIcon, SearchIcon } from "../_components/icons";
import { ItemThumb } from "../_components/ItemPhoto";
import { Spinner } from "../_components/ui";
import { compareDish, compareFoodFromListed } from "../_lib/compare";
import { useGroceryCatalogue } from "../_lib/groceries";
import { useHydrated, useSearchIndex, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { menuClient } from "../_lib/menu";
import { PhotoTile } from "../groceries/ProductPhoto";

// Compare (founder 2026-10-11: "compare various versions of products like beans to see the nutrient difference ... stuff like this too"): groceries per
// 100 g or ml, restaurant dishes per serving, never mixed. Each nutrient is one block with a bar per item, so it reads on a phone with up to six items;
// "Highest" and "Lowest" are the only marks (CLAUDE.md rule 3: never good or bad).

const TABS: ReadonlyArray<{ value: CompareKind; label: string }> = [
  { value: "food", label: "Groceries" },
  { value: "dish", label: "Restaurant dishes" },
];

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
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">{t("Compare")}</h1>
      <p className="mt-2 text-base text-muted">{t("Pick a few products or dishes and see their numbers side by side.")}</p>

      <div role="tablist" aria-label={t("Compare")} className="glass mt-5 grid grid-cols-2 gap-1 rounded-3xl p-1">
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
              className={`min-h-14 rounded-[1.25rem] px-2 text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-foreground text-background shadow-sm" : "text-muted hover:text-foreground"}`}
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
            {items.length === 1 && <p className="mt-4 rounded-3xl bg-soft px-4 py-3 text-base">{t("Add at least one more to see them side by side.")}</p>}
            {items.length === 0 && (
              <div className="glass mt-4 rounded-[1.75rem] px-5 py-6 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent"><CompareIcon className="h-7 w-7" /></span>
                <p className="mt-3 text-lg font-bold">{tab === "food" ? t("Nothing to compare yet") : t("No dishes to compare yet")}</p>
                <p className="mt-1 text-base text-muted">
                  {tab === "food"
                    ? t("Search above, for example “baked beans”, and add two or more. You can also tap “Compare” on any product.")
                    : t("Search above, for example “chicken burger”, and add two or more. You can also tap “Compare” on any dish.")}
                </p>
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
  return (
    <>
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={item.key} className="glass flex min-h-20 items-center gap-3 rounded-3xl p-2.5 pe-2">
            <Num n={i + 1} />
            {item.kind === "dish" ? <ItemThumb image={item.photo?.replace(/^\/menu-images\//, "")} /> : <PhotoTile sources={item.photo ? [{ src: item.photo, from: "retailer", shop: item.fromId }] : []} />}
            <Link href={item.href} className="min-w-0 flex-1 py-1">
              <span className="block text-base font-bold leading-snug [overflow-wrap:break-word]">{item.name}</span>
              <span className="app-numbers block text-sm text-muted">
                {item.from}
                {item.price !== undefined && ` · ${formatPrice(item.price)}`}
                {item.note && ` · ${item.note}`}
              </span>
            </Link>
            <button type="button" onClick={() => compareStore.update((l) => removeFromCompare(l, item.key))} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-bold text-muted transition hover:bg-soft-strong hover:text-foreground">
              {t("Remove")}<span className="sr-only"> {item.name}</span>
            </button>
          </li>
        ))}
      </ol>
      {items.length > 1 && (
        <div className="mt-2 text-end">
          <button type="button" onClick={() => compareStore.update((l) => l.filter((x) => x.kind !== items[0]!.kind))} className="min-h-11 px-2 text-sm font-semibold text-accent underline underline-offset-2">{t("Clear all")}</button>
        </div>
      )}
    </>
  );
}

const Num = ({ n }: { n: number }) => (
  <span aria-hidden className="app-numbers grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-sm font-extrabold text-background">{n}</span>
);

function SideBySide({ items, kind }: { items: readonly CompareItem[]; kind: CompareKind }) {
  const t = useT();
  const rows = useMemo(() => compareRows(items), [items]);
  const basis = kind === "dish" ? t("Per serving, as each restaurant publishes it.") : items.every((i) => i.basis === "ml") ? t("Per 100 ml, as each label prints it.") : t("Per 100 g, as each label prints it.");
  return (
    <section aria-labelledby="side-heading" className="mt-6">
      <h2 id="side-heading" className="text-xl font-extrabold tracking-tight">{t("Side by side")}</h2>
      <p className="mt-1 text-base text-muted">{basis}</p>
      {kind === "food" && mixedBasis(items) && <p className="mt-2 rounded-2xl bg-soft px-3 py-2 text-sm">{t("Some of these labels are per 100 ml or for the cooked food, so compare those with care.")}</p>}
      <div className="mt-3 space-y-3">
        {rows.map((row) => {
          const max = Math.max(0, ...row.values.map((v) => v ?? 0));
          return (
            <div key={row.id} className={`glass rounded-[1.5rem] p-4 ${row.sub ? "ms-4" : ""}`}>
              <h3 className="text-base font-extrabold">{t(row.label)}</h3>
              <ul className="mt-2 space-y-2.5">
                {row.values.map((v, i) => {
                  const item = items[i]!;
                  const tag = row.highest.includes(i) ? t("Highest") : row.lowest.includes(i) ? t("Lowest") : null;
                  return (
                    <li key={item.key}>
                      <div className="flex items-center gap-2">
                        <Num n={i + 1} />
                        <span className="min-w-0 flex-1 truncate text-sm text-muted">{item.kind === "dish" ? `${item.name} · ${item.from}` : item.name}</span>
                        <span className="app-numbers shrink-0 text-base font-extrabold">{v === null ? <span className="text-sm font-semibold text-muted">{item.kind === "dish" ? t("not published") : t("not on the label")}</span> : figure(row, v)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 ps-9">
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft">
                          {v !== null && max > 0 && <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />}
                        </span>
                        {tag && <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs font-bold">{tag}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-sm text-muted">
        {kind === "food"
          ? t("Numbers as each product's label or page showed them when you added it. Price per kg is the shop's own; “Protein for £1” is that price worked out for the protein. Always check the pack.")
          : t("Numbers as each restaurant publishes them, per serving. Servings differ in size, so a bigger dish can have more of everything.")}
      </p>
    </section>
  );
}

function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <label className="relative mt-4 block">
      <span className="mb-1.5 block text-base font-bold">{label}</span>
      <span className="relative block">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search" autoComplete="off" className="glass min-h-14 w-full rounded-full ps-11 pe-4 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
      </span>
    </label>
  );
}

function AddButton({ added, onAdd, name, disabled }: { added: boolean; onAdd: () => void; name: string; disabled: boolean }) {
  const t = useT();
  return (
    <button type="button" onClick={onAdd} disabled={added || disabled} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-bold transition active:scale-95 disabled:cursor-default ${added ? "bg-accent-soft text-accent" : "bg-accent text-background hover:opacity-90 disabled:opacity-40"}`}>
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
  if (catalogue.status === "error") return <p className="mt-3 text-base text-muted">{t("Couldn't load the products. Check your connection.")}</p>;
  if (!results.length) return <p className="mt-3 text-base text-muted">{t("No products match.")}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {results.map((p: ListedProduct) => {
        const entry = compareFoodFromListed(p, prefer);
        const added = inCompare(items, entry.key);
        return (
          <li key={p.gtin} className="glass flex min-h-20 items-center gap-3 rounded-3xl p-2.5">
            <PhotoTile sources={photoSources(p, prefer)} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-snug">{entry.name}</span>
              <span className="app-numbers block text-sm text-muted">{t("{kcal} kcal · {protein}g protein per 100 {unit}", { kcal: Math.round(entry.numbers.kcal), protein: entry.numbers.protein ?? 0, unit: entry.basis })}</span>
              <span className="app-numbers block text-sm text-muted">{entry.from}{entry.price !== undefined ? ` · ${formatPrice(entry.price)}` : ""}</span>
            </span>
            <AddButton added={added} disabled={full} name={entry.name} onAdd={() => compareStore.update((l) => addToCompare(l, entry).list)} />
          </li>
        );
      })}
      {full && <li className="px-1 text-sm text-muted">{t("You can compare up to {n} at a time. Take one off first.", { n: COMPARE_MAX })}</li>}
    </ul>
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
  if (!hits.length) return <p className="mt-3 text-base text-muted">{t("No dishes match.")}</p>;
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
    <ul className="mt-3 space-y-2">
      {hits.map((h) => {
        const added = inCompare(items, `dish:${h.chainId}:${h.itemId}`);
        return (
          <li key={`${h.chainId}:${h.itemId}`} className="glass flex min-h-16 items-center gap-3 rounded-3xl py-2.5 pe-2.5 ps-4">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-snug">{h.name}</span>
              <span className="app-numbers block text-sm text-muted">{h.chainName} · {Math.round(h.calories).toLocaleString("en-GB")} kcal</span>
            </span>
            <AddButton added={added} disabled={full} name={h.name} onAdd={() => add(h.chainId, h.itemId)} />
          </li>
        );
      })}
      {failed && <li role="alert" className="px-1 text-sm font-semibold">{failed}</li>}
      {full && <li className="px-1 text-sm text-muted">{t("You can compare up to {n} at a time. Take one off first.", { n: COMPARE_MAX })}</li>}
    </ul>
  );
}
