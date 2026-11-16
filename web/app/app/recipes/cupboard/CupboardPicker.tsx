"use client";

import { useMemo, useState } from "react";
import { addKind, addWords, COMMON_KINDS, hasPieces, isStaple, kindOf, LEVELS, qtyStart, qtyStep, removeItem, searchKinds, setLevel, setQty, STAPLE_KINDS, unitWord, type CupboardItem, type Level } from "@/lib/mm/cupboard";
import type { PantryKind } from "@/lib/mm/pantry";
import { requestPersistentStorage } from "@/lib/mm/persist";
import { normalizeForSearch } from "@/lib/mm/search";
import { tk } from "@/lib/mm/i18n";
import { cupboardItemsStore } from "@/lib/mm/stores";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon, PotIcon, SearchIcon } from "../../_components/icons";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { EmptyState } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { CARD, CHIP, CHIP_ON, HEADING, LABEL } from "../../groceries/PageBits";

// What the person has: big one-tap choices for the common things and the store cupboard, a search for anything else (words that match no kind can still be added,
// and are matched by name only), then each thing in the cupboard with a rough amount (a little / some / plenty) or a number in its own unit. Kept on this device only.

const LEVEL_WORDS: Record<Level, string> = { little: tk("A little"), some: tk("Some"), plenty: tk("Plenty") };
/** A round 44 px button with an icon (remove, less, more). */
const ROUND = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-strong transition active:scale-95 hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const update = (fn: (list: CupboardItem[]) => CupboardItem[]) => { cupboardItemsStore.update(fn); requestPersistentStorage(); };

/** One thing to tap: dark with a tick when it is in the cupboard. */
function Choice({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-[1.25rem] px-4 py-2.5 text-start text-[0.9375rem] font-semibold leading-snug transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "glass hover:bg-soft-strong"}`}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      {on && <CheckIcon aria-hidden className="h-5 w-5 shrink-0" />}
    </button>
  );
}

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-2.5";

function toggleKind(key: string) {
  update((list) => (list.some((i) => i.id === `k:${key}`) ? removeItem(list, `k:${key}`) : addKind(list, key)));
}

/** An exact amount: − and + buttons and a number box, in the kind's own unit (grams, millilitres, or whole eggs, wraps and so on). */
function Stepper({ item, kind }: { item: CupboardItem; kind: PantryKind }) {
  const t = useT();
  const pieces = !!item.pieces;
  const unit = unitWord(kind, pieces);
  const step = qtyStep(kind, pieces);
  const name = t(item.name);
  const qty = item.qty ?? 1;
  // what is being typed, while the box has the focus (so clearing it to type a new number doesn't jump back); otherwise the amount itself
  const [draft, setDraft] = useState<string | null>(null);
  const set = (n: number) => update((list) => setQty(list, item.id, n, pieces));
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" aria-label={t("Less {name}", { name })} disabled={qty <= 1} onClick={() => set(qty - step)} className={ROUND}><MinusIcon className="h-5 w-5" /></button>
      <label className="inline-flex items-center gap-2">
        <span className="sr-only">{t("Amount of {name} in {unit}", { name, unit })}</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={draft ?? String(qty)}
          onChange={(e) => { const digits = e.target.value.replace(/\D/g, "").slice(0, 4); setDraft(digits); if (digits !== "") set(Number(digits)); }}
          onBlur={() => setDraft(null)}
          className="glass app-numbers min-h-11 w-24 rounded-full px-4 text-center text-base focus-visible:outline-2 focus-visible:outline-accent"
        />
        <span className="text-[0.9375rem] font-semibold">{unit}</span>
      </label>
      <button type="button" aria-label={t("More {name}", { name })} onClick={() => set(qty + step)} className={ROUND}><PlusIcon className="h-5 w-5" /></button>
    </div>
  );
}

function ItemCard({ item }: { item: CupboardItem }) {
  const t = useT();
  const kind = kindOf(item);
  const staple = isStaple(kind);
  const name = kind ? t(item.name) : item.name;
  return (
    <li className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 pt-2.5 text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{name}</p>
        <button type="button" aria-label={t("Remove {name}", { name })} onClick={() => update((list) => removeItem(list, item.id))} className={`${ROUND} -me-1`}><CloseIcon className="h-5 w-5" /></button>
      </div>
      {!staple && (
        <>
          <div role="group" aria-label={t("How much {name}?", { name })} className="mt-2 flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button key={l} type="button" aria-pressed={item.level === l} onClick={() => update((list) => setLevel(list, item.id, l))} className={`${item.level === l ? CHIP_ON : CHIP} px-4`}>{t(LEVEL_WORDS[l])}</button>
            ))}
            {kind && item.qty === undefined && (
              <button type="button" onClick={() => update((list) => setQty(list, item.id, qtyStart(kind, hasPieces(kind)), hasPieces(kind)))} className={`${CHIP} px-4`}>{t("Type an amount")}</button>
            )}
          </div>
          {kind && item.qty !== undefined && <Stepper item={item} kind={kind} />}
          {!kind && <p className="mt-2 text-sm leading-snug text-muted">{t("Matched by its name only.")}</p>}
        </>
      )}
    </li>
  );
}

export function CupboardPicker({ items, kinds }: { items: readonly CupboardItem[]; kinds: readonly PantryKind[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const has = (id: string) => items.some((i) => i.id === id);
  const found = useMemo(() => searchKinds(q, kinds).slice(0, 8), [q, kinds]);
  const common = useMemo(() => kinds.filter((k) => COMMON_KINDS.includes(k.key) && !isStaple(k)), [kinds]);
  const staples = useMemo(() => STAPLE_KINDS.flatMap((key) => kinds.find((k) => k.key === key) ?? []), [kinds]);
  const typedId = `w:${normalizeForSearch(q)}`;
  const canType = q.length >= 2 && !has(typedId);

  return (
    <>
      <section aria-labelledby="have-heading" className="mt-6">
        <h2 id="have-heading" className={HEADING}>{t("What do you have?")}</h2>
        <div className="group/search relative mt-3">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
          {/* 16 px text: smaller text makes iPhone Safari zoom into the field */}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search, e.g. chicken or rice")} aria-label={t("Search, e.g. chicken or rice")} maxLength={40} {...DONE_KEY} autoComplete="off" className={`glass min-h-[3.25rem] w-full rounded-full ps-12 pe-4 ${DONE_ROOM} text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent`} />
          <SearchDone />
        </div>

        {q ? (
          <div className="mt-3">
            <p role="status" className="sr-only">{found.length ? t("{n} found", { n: found.length }) : t("Nothing in our list matches.")}</p>
            {found.length > 0 ? (
              <ul className={GRID}>
                {found.map((k) => (<li key={k.key} className="min-w-0"><Choice label={t(k.label)} on={has(`k:${k.key}`)} onClick={() => toggleKind(k.key)} /></li>))}
              </ul>
            ) : (
              <p className="px-1 text-[0.9375rem] leading-snug text-muted">{t("Nothing in our list matches.")}</p>
            )}
            {canType && (
              <button type="button" onClick={() => { update((list) => addWords(list, q)); setQuery(""); }} className={`${CHIP} mt-3 min-h-12 px-5 text-[0.9375rem] [overflow-wrap:anywhere]`}>
                <PlusIcon className="me-2 h-5 w-5 shrink-0" />{t("Add “{words}” anyway", { words: q })}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className={`mt-5 ${LABEL}`}>{t("Common things")}</p>
            <ul className={`mt-2.5 ${GRID}`}>
              {common.map((k) => (<li key={k.key} className="min-w-0"><Choice label={t(k.label)} on={has(`k:${k.key}`)} onClick={() => toggleKind(k.key)} /></li>))}
            </ul>
            <p className={`mt-6 ${LABEL}`}>{t("Store cupboard")}</p>
            <p className="mt-1 px-0.5 text-sm leading-snug text-muted">{t("Salt, oil and spices. No amount needed.")}</p>
            <ul className={`mt-2.5 ${GRID}`}>
              {staples.map((k) => (<li key={k.key} className="min-w-0"><Choice label={t(k.label)} on={has(`k:${k.key}`)} onClick={() => toggleKind(k.key)} /></li>))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="cupboard-heading" className="mt-8">
        <h2 id="cupboard-heading" className={HEADING}>{t("Your cupboard")}{items.length > 0 && <span className="app-numbers font-semibold text-muted"> · {items.length}</span>}</h2>
        {items.length === 0 ? (
          <div className="mt-3"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("Nothing here yet.")} body={t("Tap the things you have above.")} /></div>
        ) : (
          <>
            <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("A little is enough for 1 person, some for 2, and plenty for everyone.")}</p>
            <ul className="mt-3 space-y-3">
              {items.map((item) => (<ItemCard key={item.id} item={item} />))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
