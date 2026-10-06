"use client";

import Link from "next/link";
import { chainHref } from "@/lib/mm/routes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { orderAllergens } from "@/lib/mm/allergens";
import { loggedToday, remainingToday } from "@/lib/mm/budget";
import type { ChainIndex } from "@/lib/mm/chain-index";
import { formatCalories, lowerFirst } from "@/lib/mm/format";
import {
  addComponent, addableComponents, afterThis, afterThisText, describeOrder, GROUP_LABEL, isOrderAvailable, lineFromItem, lineNutrients,
  linesFromCombination, lineName, orderName, orderNutrients, removeComponent, setComponentQty, setItemQty, sortedComponents, swapComponent,
  swapOptions, toggleModifier, validateOrder, type ComponentLine, type ItemLine, type OrderLine, type Result,
} from "@/lib/mm/order";
import { addLogEntry, addSavedOrder, countProAction, logStore, savedStore, updateSavedOrder } from "@/lib/mm/stores";
import type { LogSource, SavedOrder } from "@/lib/mm/user-data";
import type { MenuComponent } from "@/lib/mm/types";
import { AllergenSection } from "../_components/Allergens";
import { useGate } from "../_components/Paywall";
import { ChevronLeftIcon, LockIcon, MinusIcon, PlusIcon, SwapIcon, TrashIcon } from "../_components/icons";
import { MacroSummary } from "../_components/Nutrition";
import { ShareButton } from "../_components/ShareButton";
import { Button, Card, ErrorBox, Field, inputClass, Sheet, Spinner } from "../_components/ui";
import { useChain, useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "../_lib/hooks";

// SPEC §6.5 and §7.6: customise any order with live totals (Pro).

type Start = { kind: "item" | "pick" | "saved"; lines: OrderLine[]; savedName?: string; savedId?: string; source: LogSource } | { kind: "error"; message: string } | { kind: "unavailable"; saved: SavedOrder };

function resolveStart(ix: ChainIndex, props: { itemId?: string; pickId?: string; savedId?: string }, saved: SavedOrder[]): Start {
  if (props.savedId) {
    const s = saved.find((o) => o.id === props.savedId);
    if (!s) return { kind: "error", message: "That saved order no longer exists." };
    if (!isOrderAvailable(ix, s.lines)) return { kind: "unavailable", saved: s };
    return { kind: "saved", lines: s.lines.map((l) => structuredClone(l)), savedName: s.name, savedId: s.id, source: "savedOrder" };
  }
  if (props.pickId) {
    const combo = ix.combinations.get(props.pickId);
    if (combo) {
      const lines = linesFromCombination(ix, combo);
      return lines ? { kind: "pick", lines, source: "combination" } : { kind: "error", message: "Something in that order is no longer on the menu." };
    }
    const line = lineFromItem(ix, props.pickId);
    return line ? { kind: "pick", lines: [line], source: "item" } : { kind: "error", message: "That item is no longer on the menu." };
  }
  if (props.itemId) {
    const line = lineFromItem(ix, props.itemId);
    return line ? { kind: "item", lines: [line], source: "item" } : { kind: "error", message: "That item is no longer on the menu." };
  }
  return { kind: "error", message: "Choose an item to customise first." };
}

export function BuilderScreen(props: { chainId: string; itemId?: string; pickId?: string; savedId?: string }) {
  const hydrated = useHydrated();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const { status, index, error, retry } = useChain(props.chainId);
  const saved = useStore(savedStore);

  const back = (
    <Link href={props.chainId ? chainHref(props.chainId) : "/app"} aria-label="Back" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
  );
  if (!hydrated || status === "loading") return (<div>{back}<Spinner label="Loading" /></div>);
  if (!pro) {
    return (
      <div>
        {back}
        <h1 className="text-4xl font-extrabold tracking-tight">Order builder</h1>
        <Card className="mt-6 flex flex-col items-center gap-3 p-6 text-center">
          <LockIcon className="h-8 w-8 text-muted" />
          <p className="font-semibold">Customise any order with live totals</p>
          <p className="text-sm text-muted">The order builder is part of Pro.</p>
          <Button onClick={() => showPaywall("orderBuilder")}>See Pro</Button>
        </Card>
      </div>
    );
  }
  if (status === "error" || !index) return (<div>{back}<ErrorBox message={error ?? "Couldn't load this menu."} onRetry={retry} /></div>);

  const start = resolveStart(index, props, saved);
  if (start.kind === "error") return (<div>{back}<ErrorBox message={start.message} /></div>);
  if (start.kind === "unavailable") {
    return (
      <div>
        {back}
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{start.saved.name}</h1>
        <p className="mt-2 text-sm font-medium">No longer on the menu</p>
        <p className="mt-1 text-sm text-muted">Something in this order was removed from the menu, so it can&apos;t be edited. Your saved numbers are kept.</p>
        <div className="mt-4"><MacroSummary nutrients={start.saved.nutrients} /></div>
      </div>
    );
  }
  return <Builder key={`${props.itemId}|${props.pickId}|${props.savedId}`} ix={index} start={start} />;
}

function Builder({ ix, start }: { ix: ChainIndex; start: Extract<Start, { lines: OrderLine[] }> }) {
  const router = useRouter();
  const { gate } = useGate();
  const menu = useMenu();
  const settings = useSettings();
  const log = useStore(logStore);
  const now = useNow();
  const { chain } = ix;

  const [lines, setLines] = useState<OrderLine[]>(start.lines);
  const [customName, setCustomName] = useState<string | null>(start.savedName ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | { type: "add"; lineIndex: number } | { type: "swap"; lineIndex: number; componentId: string } | { type: "item" }>(null);

  useEffect(() => {
    analytics.track({ name: "builderOpened", origin: start.kind });
  }, [start.kind]);

  const summaryRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    const check = () => setPinned(el.offsetHeight <= window.innerHeight * 0.4);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  const total = useMemo(() => orderNutrients(ix, lines), [ix, lines]);
  const allergens = useMemo(() => orderAllergens(ix, lines), [ix, lines]);
  const valid = validateOrder(lines);
  const defaultName = orderName(ix, lines);
  const name = customName ?? defaultName;
  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  const after = total ? afterThisText(afterThis(remainingToday(profile, loggedToday(log, now)), total)) : "";

  function change(kind: "add" | "remove" | "double" | "swap" | "modifier", result: Result<OrderLine>, lineIndex: number) {
    if (!result.ok) return setNotice(result.error);
    setNotice(null);
    setLines((ls) => ls.map((l, i) => (i === lineIndex ? result.value : l)));
    analytics.track({ name: "builderChanged", kind });
  }

  function currentSource(): LogSource {
    if (start.source === "savedOrder") return "savedOrder";
    if (start.source === "combination" && defaultName === start.lines.map((l) => lineName(ix, l)).join(" + ")) return "combination";
    return lines.length === 1 && start.source === "item" && defaultName === lineName(ix, start.lines[0]!) ? "item" : "custom";
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></button>
      </div>
      <p className="kicker mt-5">{chain.name}</p>
      <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Build your order</h1>

      <div className="mt-4 space-y-4">
        {lines.map((line, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold leading-snug tracking-tight">{lineName(ix, line)}</h2>
              {lines.length > 1 && (
                <button type="button" aria-label={`Remove ${ix.items.get(line.itemId)?.name ?? "item"} from the order`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft-strong">
                  <TrashIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            {line.kind === "components" ? (
              <ComponentLineEditor
                ix={ix}
                line={line}
                onDouble={(id, on) => change("double", setComponentQty(ix, line, id, on ? 2 : 1), i)}
                onRemove={(id) => change("remove", removeComponent(line, id), i)}
                onSwap={(id) => setPicker({ type: "swap", lineIndex: i, componentId: id })}
                onAdd={() => setPicker({ type: "add", lineIndex: i })}
              />
            ) : (
              <ItemLineEditor
                ix={ix}
                line={line}
                onQty={(q) => change("modifier", setItemQty(line, q), i)}
                onToggle={(id) => change("modifier", toggleModifier(ix, line, id), i)}
              />
            )}
          </Card>
        ))}
      </div>

      <Button variant="secondary" full className="mt-4" onClick={() => setPicker({ type: "item" })}>
        <PlusIcon className="h-5 w-5" /> Add item
      </Button>

      <p role="alert" className="mt-3 min-h-5 text-sm font-medium text-accent">{notice}</p>

      <div className="mt-2"><AllergenSection chain={ix.chain} allergens={allergens?.allergens} changesNotCovered={allergens?.changesNotCovered} title="Allergens in this order" /></div>

      <div className="mt-2">
        <Field label="Order name">
          <input className={inputClass} value={name} maxLength={120} onChange={(e) => setCustomName(e.target.value)} />
        </Field>
      </div>

      {/* Sticky summary (SPEC §7.6): totals and actions stay in reach while the lines scroll. Pinned only while it takes under 40% of the screen, so large text or zoom never leaves no room for the order itself. */}
      <div ref={summaryRef} className={`z-10 -mx-5 mt-4 rounded-t-3xl border-t border-line bg-background/92 px-5 pb-3 pt-4 shadow-[0_-12px_30px_-18px_rgba(0,0,0,0.5)] backdrop-blur-xl ${pinned ? "sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))]" : ""}`}>
        {total && valid.ok ? (
          <>
            <div aria-live="polite"><MacroSummary compact nutrients={total} label={`Order total: ${formatCalories(total.calories)}, ${Math.round(total.protein)} grams protein`} /></div>
            <p className="app-numbers mt-1 text-sm text-muted">{after}</p>
            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
              <Button
                full
                onClick={() => {
                  const entry = { chainId: chain.id, chainName: chain.name, name: name.trim() || defaultName, lines, nutrients: total, dataVersionAtSave: menu.dataVersion ?? 0 };
                  if (start.savedId) {
                    // Editing a saved order: update it in place (no duplicate, and it never counts against the free limit).
                    updateSavedOrder(start.savedId, { name: entry.name, lines, nutrients: total, dataVersionAtSave: entry.dataVersionAtSave });
                    router.push("/app/saved");
                    return;
                  }
                  gate("saveLimit", () => {
                    addSavedOrder(entry);
                    analytics.track({ name: "orderSaved" });
                    countProAction();
                    setNotice(null);
                    router.push("/app/saved");
                  });
                }}
              >
                {start.savedId ? "Save changes" : "Save"}
              </Button>
              <Button
                variant="secondary"
                full
                onClick={() =>
                  gate("log", () => {
                    addLogEntry({ chainId: chain.id, chainName: chain.name, name: name.trim() || defaultName, nutrients: total, source: currentSource() });
                    analytics.track({ name: "mealLogged" });
                    countProAction();
                    router.push("/app/today");
                  })
                }
              >
                Log
              </Button>
              <ShareButton full chainName={chain.name} orderName={name} description={describeOrder(ix, lines)} nutrients={total} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{valid.ok ? "Something in this order is no longer on the menu." : valid.error}</p>
        )}
      </div>

      <PickerSheets ix={ix} picker={picker} lines={lines} onClose={() => setPicker(null)} onPickComponent={(id) => {
        if (picker?.type === "add") change("add", addComponent(ix, lines[picker.lineIndex] as ComponentLine, id), picker.lineIndex);
        if (picker?.type === "swap") change("swap", swapComponent(ix, lines[picker.lineIndex] as ComponentLine, picker.componentId, id), picker.lineIndex);
        setPicker(null);
      }} onPickItem={(itemId) => {
        const line = lineFromItem(ix, itemId);
        if (line) {
          setLines((ls) => [...ls, line]);
          analytics.track({ name: "builderChanged", kind: "add" });
        }
        setPicker(null);
      }} />
    </div>
  );
}

function ComponentLineEditor({ ix, line, onDouble, onRemove, onSwap, onAdd }: {
  ix: ChainIndex; line: ComponentLine; onDouble: (id: string, on: boolean) => void; onRemove: (id: string) => void; onSwap: (id: string) => void; onAdd: () => void;
}) {
  const rows = sortedComponents(ix, line);
  const groups = [...new Set(rows.map((r) => r.comp.group))];
  return (
    <div className="mt-3">
      {groups.map((group) => (
        <section key={group} aria-label={GROUP_LABEL[group]} className="mt-3 first:mt-0">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">{GROUP_LABEL[group]}</h3>
          <ul className="inset-card divide-y divide-line overflow-hidden rounded-2xl">
            {rows.filter((r) => r.comp.group === group).map(({ ref, comp }) => (
              <li key={comp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1 basis-32">
                  <div className="font-medium">{ref.qty === 2 ? `Double ${lowerFirst(comp.name)}` : comp.name}</div>
                  <div className="app-numbers text-sm text-muted">{[comp.portion && (ref.qty === 2 ? `2 × ${comp.portion}` : comp.portion), formatCalories(comp.nutrients.calories * ref.qty)].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex flex-wrap items-center">
                  {comp.allowDouble && (
                    <button type="button" aria-pressed={ref.qty === 2} aria-label={`Double ${lowerFirst(comp.name)}`} onClick={() => onDouble(comp.id, ref.qty !== 2)} className={`min-h-11 rounded-full px-3.5 text-sm font-bold ${ref.qty === 2 ? "bg-accent-soft text-accent" : "text-muted hover:bg-soft-strong"}`}>Double</button>
                  )}
                  {swapOptions(ix, line, comp.id).length > 0 && (
                    <button type="button" aria-label={`Swap ${comp.name}`} onClick={() => onSwap(comp.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-soft-strong"><SwapIcon className="h-5 w-5" /></button>
                  )}
                  <button type="button" aria-label={`Remove ${comp.name}`} disabled={line.components.length === 1} onClick={() => onRemove(comp.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-soft-strong disabled:opacity-40"><MinusIcon className="h-5 w-5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {addableComponents(ix, line).size > 0 && (
        <Button variant="ghost" className="mt-3" onClick={onAdd}><PlusIcon className="h-5 w-5" /> Add ingredient</Button>
      )}
    </div>
  );
}

function ItemLineEditor({ ix, line, onQty, onToggle }: { ix: ChainIndex; line: ItemLine; onQty: (q: number) => void; onToggle: (id: string) => void }) {
  const item = ix.items.get(line.itemId);
  if (!item) return null;
  const total = lineNutrients(ix, line);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="app-numbers text-sm text-muted">{total ? formatCalories(total.calories) : ""}</span>
        <div className="flex items-center gap-1" role="group" aria-label="Quantity">
          <button type="button" aria-label="Decrease quantity" disabled={line.qty <= 1} onClick={() => onQty(line.qty - 1)} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"><MinusIcon className="h-5 w-5" /></button>
          <span className="app-numbers w-8 text-center text-lg font-semibold" aria-live="polite">{line.qty}</span>
          <button type="button" aria-label="Increase quantity" onClick={() => onQty(line.qty + 1)} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><PlusIcon className="h-5 w-5" /></button>
        </div>
      </div>
      {item.modifiers.length > 0 && (
        <ul className="mt-3 inset-card divide-y divide-line overflow-hidden rounded-2xl">
          {item.modifiers.map((m) => {
            const on = line.modifierIds.includes(m.id);
            return (
              <li key={m.id}>
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="block font-medium">{m.label}</span>
                    <span className="app-numbers block text-sm text-muted">{m.kind === "remove" ? "−" : "+"}{formatCalories(m.nutrients.calories)}</span>
                  </span>
                  <input type="checkbox" checked={on} onChange={() => onToggle(m.id)} className="h-5 w-5 accent-[var(--accent)]" />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PickerSheets({ ix, picker, lines, onClose, onPickComponent, onPickItem }: {
  ix: ChainIndex; picker: null | { type: "add"; lineIndex: number } | { type: "swap"; lineIndex: number; componentId: string } | { type: "item" };
  lines: OrderLine[]; onClose: () => void; onPickComponent: (id: string) => void; onPickItem: (id: string) => void;
}) {
  const line = picker && picker.type !== "item" ? (lines[picker.lineIndex] as ComponentLine | undefined) : undefined;
  const optionGroups: Array<{ title: string; items: MenuComponent[] }> = [];
  if (picker?.type === "add" && line?.kind === "components") {
    for (const [group, list] of addableComponents(ix, line)) optionGroups.push({ title: GROUP_LABEL[group] ?? group, items: list });
  }
  if (picker?.type === "swap" && line?.kind === "components") {
    const list = swapOptions(ix, line, picker.componentId);
    optionGroups.push({ title: `Swap ${ix.components.get(picker.componentId)?.name ?? ""} for`, items: list });
  }
  return (
    <>
      <Sheet open={picker?.type === "add" || picker?.type === "swap"} onClose={onClose} title={picker?.type === "swap" ? "Swap ingredient" : "Add ingredient"}>
        {optionGroups.map((g) => (
          <section key={g.title} className="mb-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
            <ul className="inset-card divide-y divide-line overflow-hidden rounded-2xl">
              {g.items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onPickComponent(c.id)} className="app-numbers flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-soft-strong">
                    <span><span className="block font-medium">{c.name}</span>{c.portion && <span className="block text-sm text-muted">{c.portion}</span>}</span>
                    <span className="text-sm text-muted">{formatCalories(c.nutrients.calories)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Sheet>
      <Sheet open={picker?.type === "item"} onClose={onClose} title="Add item">
        {ix.chain.categories.map((cat) => {
          const items = ix.chain.items.filter((i) => i.category === cat);
          return items.length === 0 ? null : (
            <section key={cat} className="mb-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h3>
              <ul className="inset-card divide-y divide-line overflow-hidden rounded-2xl">
                {items.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => onPickItem(i.id)} className="app-numbers flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-soft-strong">
                      <span className="font-medium">{i.name}</span>
                      <span className="text-sm text-muted">{formatCalories(i.nutrients.calories)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Sheet>
    </>
  );
}
