"use client";

import Link from "next/link";
import { chainHref } from "@/lib/mm/routes";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { orderAllergens } from "@/lib/mm/allergens";
import { loggedGaps, loggedToday, remainingToday } from "@/lib/mm/budget";
import type { ChainIndex } from "@/lib/mm/chain-index";
import { formatCalories, lowerFirst } from "@/lib/mm/format";
import type { T } from "@/lib/mm/i18n";
import {
  addComponent, addableComponents, afterThis, afterThisText, describeOrder, GROUP_LABEL, isOrderAvailable, lineFromItem, lineNutrients,
  linesFromCombination, lineName, orderName, orderNutrients, removeComponent, setComponentQty, setItemQty, sortedComponents, swapComponent,
  swapOptions, toggleModifier, validateOrder, type ComponentLine, type ItemLine, type OrderLine, type Result,
} from "@/lib/mm/order";
import { addLogEntry, addSavedOrder, countProAction, logStore, savedStore, updateSavedOrder } from "@/lib/mm/stores";
import type { LogSource, SavedOrder } from "@/lib/mm/user-data";
import { anyDietFilter, passesDiet } from "@/lib/mm/menu-view";
import { passesPreferences } from "@/lib/mm/ranking";
import type { MenuComponent } from "@/lib/mm/types";
import { AllergenSection } from "../_components/Allergens";
import { useGate } from "../_components/Paywall";
import { ChevronLeftIcon, LockIcon, MinusIcon, PlusIcon, SwapIcon, TrashIcon } from "../_components/icons";
import { MacroSummary, SMALL_LABEL } from "../_components/Nutrition";
import { ShareButton } from "../_components/ShareButton";
import { Button, Card, Chip, ErrorBox, Field, inputClass, Sheet, Spinner } from "../_components/ui";
import { useChain, useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// SPEC §6.5 and §7.6: customise any order with live totals (Pro).
// Look (founder 2026-10-15, Home's language): a compact heavy title, white cards with 20 px corners, each ingredient group as a quiet
// grey list on the card with its label in small spaced capitals and the portion and calories in DM Mono, "Double" a white pill lit in
// the brand lime when it's on, and the totals as a floating white card that stays in reach above the tab bar.

const TITLE = "text-[1.75rem] font-[800] leading-none tracking-[-0.02em]";
/** The quiet list on a card: ingredient rows, modifiers, the picker's choices. */
const INSET_LIST = "inset-card divide-y divide-line overflow-hidden rounded-2xl";
/** A sheet's list of choices: one light grey block with fine lines between the rows (no shadow: it sits on the white sheet). */
const SHEET_LIST = "divide-y divide-line overflow-hidden rounded-2xl bg-[var(--fill)]";
/** A round 44 px icon button in a row. */
const ICON_BUTTON = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-soft-strong hover:text-foreground disabled:opacity-40";

type Start = { kind: "item" | "pick" | "saved"; lines: OrderLine[]; savedName?: string; savedId?: string; source: LogSource } | { kind: "error"; message: string } | { kind: "unavailable"; saved: SavedOrder };

function resolveStart(ix: ChainIndex, props: { itemId?: string; pickId?: string; savedId?: string }, saved: SavedOrder[], t: T): Start {
  if (props.savedId) {
    const s = saved.find((o) => o.id === props.savedId);
    if (!s) return { kind: "error", message: t("That saved order no longer exists.") };
    if (!isOrderAvailable(ix, s.lines)) return { kind: "unavailable", saved: s };
    return { kind: "saved", lines: s.lines.map((l) => structuredClone(l)), savedName: s.name, savedId: s.id, source: "savedOrder" };
  }
  if (props.pickId) {
    const combo = ix.combinations.get(props.pickId);
    if (combo) {
      const lines = linesFromCombination(ix, combo);
      return lines ? { kind: "pick", lines, source: "combination" } : { kind: "error", message: t("Something in that order is no longer on the menu.") };
    }
    const line = lineFromItem(ix, props.pickId);
    return line ? { kind: "pick", lines: [line], source: "item" } : { kind: "error", message: t("That item is no longer on the menu.") };
  }
  if (props.itemId) {
    const line = lineFromItem(ix, props.itemId);
    return line ? { kind: "item", lines: [line], source: "item" } : { kind: "error", message: t("That item is no longer on the menu.") };
  }
  return { kind: "error", message: t("Choose an item to customise first.") };
}

export function BuilderScreen(props: { chainId: string; itemId?: string; pickId?: string; savedId?: string }) {
  const t = useT();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const { status, index, error, retry } = useChain(props.chainId);
  const saved = useStore(savedStore);

  const back = (
    <Link href={props.chainId ? chainHref(props.chainId) : "/app/eat-out"} aria-label={t("Back")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
  );
  if (!hydrated || status === "loading") return (<div>{back}<Spinner label={t("Loading")} /></div>);
  if (!pro) {
    return (
      <div>
        {back}
        <h1 className={`mt-5 ${TITLE}`}>{t("Order builder")}</h1>
        <Card className="mt-5 flex flex-col items-center gap-3 p-6 text-center">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--fill)]"><LockIcon className="h-6 w-6 text-muted" /></span>
          <p className="text-base font-semibold">{t("Customise any order with live totals")}</p>
          <p className="text-[0.9375rem] text-muted">{t("The order builder is part of Pro.")}</p>
          <Button onClick={() => showPaywall("orderBuilder")}>{t("See Pro")}</Button>
        </Card>
      </div>
    );
  }
  if (status === "error" || !index) return (<div>{back}<ErrorBox message={error ? t(error) : t("Couldn't load this menu.")} onRetry={retry} /></div>);

  if (index.chain.nutritionLevel === "calories") {
    return (
      <div>
        {back}
        <h1 className={`mt-5 ${TITLE}`}>{t("Order builder")}</h1>
        <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("{chain} publishes calories only, so there are no protein, carbs or fat totals to build an order from.", { chain: index.chain.name })}</p>
      </div>
    );
  }
  const start = resolveStart(index, props, saved, t);
  if (start.kind === "error") return (<div>{back}<ErrorBox message={start.message} /></div>);
  if (start.kind === "unavailable") {
    return (
      <div>
        {back}
        <h1 className={`mt-5 ${TITLE} [overflow-wrap:anywhere]`}>{start.saved.name}</h1>
        <p className="mt-3 text-[0.9375rem] font-semibold">{t("No longer on the menu")}</p>
        <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Something in this order was removed from the menu, so it can't be edited. Your saved numbers are kept.")}</p>
        <Card className="mt-4 p-4"><MacroSummary nutrients={start.saved.nutrients} /></Card>
      </div>
    );
  }
  return <Builder key={`${props.itemId}|${props.pickId}|${props.savedId}`} ix={index} start={start} />;
}

function Builder({ ix, start }: { ix: ChainIndex; start: Extract<Start, { lines: OrderLine[] }> }) {
  const t = useT();
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
  const valid = validateOrder(lines, t);
  const defaultName = orderName(ix, lines);
  const name = customName ?? defaultName;
  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  // "Protein left today" is left out when a meal was typed in without its protein: that meal's protein is unknown, not 0.
  const left = remainingToday(profile, loggedToday(log, now));
  const remaining = loggedGaps(log, now).protein > 0 ? { calories: left.calories } : left;
  const after = total ? afterThisText(afterThis(remaining, total)) : "";

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
        <button type="button" onClick={() => router.back()} aria-label={t("Back")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></button>
      </div>
      <p className="kicker mt-5">{chain.name}</p>
      <h1 className={`mt-1.5 ${TITLE}`}>{t("Build your order")}</h1>

      <div className="mt-5 space-y-3.5">
        {lines.map((line, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-[800] leading-snug tracking-[-0.01em]">{lineName(ix, line)}</h2>
              {lines.length > 1 && (
                <button type="button" aria-label={t("Remove {name} from the order", { name: ix.items.get(line.itemId)?.name ?? t("item") })} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className={`-me-2 -mt-1.5 ${ICON_BUTTON}`}>
                  <TrashIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            {line.kind === "components" ? (
              <ComponentLineEditor
                ix={ix}
                line={line}
                onDouble={(id, on) => change("double", setComponentQty(ix, line, id, on ? 2 : 1, t), i)}
                onRemove={(id) => change("remove", removeComponent(line, id, t), i)}
                onSwap={(id) => setPicker({ type: "swap", lineIndex: i, componentId: id })}
                onAdd={() => setPicker({ type: "add", lineIndex: i })}
              />
            ) : (
              <ItemLineEditor
                ix={ix}
                line={line}
                onQty={(q) => change("modifier", setItemQty(line, q, t), i)}
                onToggle={(id) => change("modifier", toggleModifier(ix, line, id, t), i)}
              />
            )}
          </Card>
        ))}
      </div>

      <Button variant="secondary" full className="mt-3.5" onClick={() => setPicker({ type: "item" })}>
        <PlusIcon className="h-5 w-5" /> {t("Add item")}
      </Button>

      {/* Empty (and no height) until there's something to say; it stays in the page so a screen reader hears it. */}
      <p role="alert" className="mt-3 px-1 text-sm font-semibold text-accent empty:mt-0">{notice}</p>

      <div className="mt-5"><AllergenSection chain={ix.chain} allergens={allergens?.allergens} changesNotCovered={allergens?.changesNotCovered} title={t("Allergens in this order")} /></div>

      <div className="glass mt-3.5 rounded-[1.25rem] p-4">
        <Field label={t("Order name")}>
          <input className={inputClass} value={name} maxLength={120} onChange={(e) => setCustomName(e.target.value)} />
        </Field>
      </div>

      {/* Sticky summary (SPEC §7.6): totals and actions stay in reach while the lines scroll. Pinned only while it takes under 40% of the screen, so large text or zoom never leaves no room for the order itself. */}
      {/* `glass`: a white card that floats above the tab bar like the bar itself, and the secondary buttons on it take the grey fill
          (globals.css) so they keep their edges. While it floats, a hairline and a soft shadow above and below give it an edge, so the
          white cards scrolling under it read as passing beneath a card, not as cut off. */}
      <div ref={summaryRef} className={`glass @container z-10 mt-5 rounded-[1.25rem] p-4 ${pinned ? "sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] ring-1 ring-[var(--line)] shadow-[0_-12px_28px_-18px_rgba(17,24,20,0.30),0_16px_40px_-16px_rgba(17,24,20,0.35)]" : ""}`}>
        {total && valid.ok ? (
          <>
            <div aria-live="polite"><MacroSummary compact nutrients={total} label={t("Order total: {kcal}, {protein} grams protein", { kcal: formatCalories(total.calories), protein: Math.round(total.protein ?? 0) })} /></div>
            <p className="app-numbers mt-2.5 text-[0.9375rem] leading-snug text-muted">{after}</p>
            {/* Three pills across (a little less padding than usual so "Share" keeps its icon and word on one line); at large text Save and
                Log side by side and Share under them, full width. (ShareButton's button sits in a `display: contents` wrapper.) */}
            <div className="mt-3.5 grid grid-cols-2 gap-2 [&_button]:px-3 [&>div:last-child>button]:col-span-2 @min-[21rem]:grid-cols-3 @min-[21rem]:[&>div:last-child>button]:col-span-1">
              <Button
                full
                onClick={() => {
                  const entry = { chainId: chain.id, chainName: chain.name, name: name.trim() || defaultName, lines, nutrients: total, dataVersionAtSave: menu.dataVersion ?? 0 };
                  if (start.savedId) {
                    // Editing a saved order: update it in place (no duplicate, and it never counts against the free limit).
                    updateSavedOrder(start.savedId, { name: entry.name, lines, nutrients: total, dataVersionAtSave: entry.dataVersionAtSave });
                    router.push("/app/meals?tab=restaurant");
                    return;
                  }
                  gate("saveLimit", () => {
                    addSavedOrder(entry);
                    analytics.track({ name: "orderSaved" });
                    countProAction();
                    setNotice(null);
                    router.push("/app/meals?tab=restaurant");
                  });
                }}
              >
                {start.savedId ? t("Save changes") : t("Save")}
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
                {t("Log")}
              </Button>
              <ShareButton full chainName={chain.name} orderName={name} description={describeOrder(ix, lines)} nutrients={total} />
            </div>
          </>
        ) : (
          <p className="text-[0.9375rem] leading-snug text-muted">{valid.ok ? t("Something in this order is no longer on the menu.") : valid.error}</p>
        )}
      </div>

      <PickerSheets ix={ix} picker={picker} lines={lines} onClose={() => setPicker(null)} onPickComponent={(id) => {
        if (picker?.type === "add") change("add", addComponent(ix, lines[picker.lineIndex] as ComponentLine, id, t), picker.lineIndex);
        if (picker?.type === "swap") change("swap", swapComponent(ix, lines[picker.lineIndex] as ComponentLine, picker.componentId, id, t), picker.lineIndex);
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
  const t = useT();
  const rows = sortedComponents(ix, line);
  const groups = [...new Set(rows.map((r) => r.comp.group))];
  return (
    <div className="mt-3.5">
      {groups.map((group) => (
        <section key={group} aria-label={t(GROUP_LABEL[group])} className="mt-4 first:mt-0">
          <h3 className={`mb-2 ${SMALL_LABEL}`}>{t(GROUP_LABEL[group])}</h3>
          <ul className={INSET_LIST}>
            {rows.filter((r) => r.comp.group === group).map(({ ref, comp }) => (
              <li key={comp.id} className="flex min-h-[3.75rem] flex-wrap items-center gap-x-2 gap-y-1 py-1.5 ps-3.5 pe-1">
                <div className="min-w-0 flex-1 basis-[5.5rem] py-1">
                  <div className="text-base font-semibold leading-snug">{ref.qty === 2 ? t("Double {name}", { name: lowerFirst(comp.name) }) : comp.name}</div>
                  {/* the portion and the calories each stay on one line; the line breaks between them, after the "·" */}
                  <div className="app-numbers mt-0.5 font-mono text-[0.75rem] leading-snug text-muted">
                    {[comp.portion && (ref.qty === 2 ? `2 × ${comp.portion}` : comp.portion), formatCalories(comp.nutrients.calories * ref.qty)].filter(Boolean).map((part, k, all) => (
                      <Fragment key={k}><span className="whitespace-nowrap">{part}{k < all.length - 1 && " ·"}</span>{k < all.length - 1 && " "}</Fragment>
                    ))}
                  </div>
                </div>
                <div className="ms-auto flex shrink-0 items-center">
                  {comp.allowDouble && (
                    <button type="button" aria-pressed={ref.qty === 2} aria-label={t("Double {name}", { name: lowerFirst(comp.name) })} onClick={() => onDouble(comp.id, ref.qty !== 2)} className={`me-0.5 min-h-9 rounded-full px-3.5 text-sm font-bold transition ${ref.qty === 2 ? "bg-sun text-on-accent" : "bg-white text-foreground hover:bg-soft-strong"} relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']`}>{t("Double")}</button>
                  )}
                  {swapOptions(ix, line, comp.id).length > 0 && (
                    <button type="button" aria-label={t("Swap {name}", { name: comp.name })} onClick={() => onSwap(comp.id)} className={ICON_BUTTON}><SwapIcon className="h-5 w-5" /></button>
                  )}
                  <button type="button" aria-label={t("Remove {name}", { name: comp.name })} disabled={line.components.length === 1} onClick={() => onRemove(comp.id)} className={ICON_BUTTON}><MinusIcon className="h-5 w-5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {addableComponents(ix, line).size > 0 && (
        <Button variant="ghost" className="mt-2 -ms-3" onClick={onAdd}><PlusIcon className="h-5 w-5" /> {t("Add ingredient")}</Button>
      )}
    </div>
  );
}

function ItemLineEditor({ ix, line, onQty, onToggle }: { ix: ChainIndex; line: ItemLine; onQty: (q: number) => void; onToggle: (id: string) => void }) {
  const t = useT();
  const item = ix.items.get(line.itemId);
  if (!item) return null;
  const total = lineNutrients(ix, line);
  return (
    <div className="mt-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="app-numbers font-mono text-[0.8125rem] text-muted">{total ? formatCalories(total.calories) : ""}</span>
        <div className="flex items-center gap-1" role="group" aria-label={t("Quantity")}>
          <button type="button" aria-label={t("Decrease quantity")} disabled={line.qty <= 1} onClick={() => onQty(line.qty - 1)} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40"><MinusIcon className="h-5 w-5" /></button>
          <span className="app-numbers w-8 text-center text-lg font-semibold" aria-live="polite">{line.qty}</span>
          <button type="button" aria-label={t("Increase quantity")} onClick={() => onQty(line.qty + 1)} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95"><PlusIcon className="h-5 w-5" /></button>
        </div>
      </div>
      {item.modifiers.length > 0 && (
        <ul className={`mt-3.5 ${INSET_LIST}`}>
          {item.modifiers.map((m) => {
            const on = line.modifierIds.includes(m.id);
            return (
              <li key={m.id}>
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3.5 py-2">
                  <span>
                    <span className="block text-base font-semibold leading-snug">{m.label}</span>
                    <span className="app-numbers mt-0.5 block font-mono text-[0.75rem] text-muted">{m.kind === "remove" ? "−" : "+"}{formatCalories(m.nutrients.calories)}</span>
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
  const t = useT();
  // The diet settings (Settings › Diet) apply to what can be added, as on the restaurant's page; one tap shows everything.
  const prefs = useSettings().preferences;
  const [dietOn, setDietOn] = useState(true);
  const diet = anyDietFilter(prefs) && dietOn;
  const dietChip = anyDietFilter(prefs) ? <div className="mb-3"><Chip selected={dietOn} onClick={() => setDietOn((v) => !v)}>{t("Fits my diet")}</Chip></div> : null;
  const line = picker && picker.type !== "item" ? (lines[picker.lineIndex] as ComponentLine | undefined) : undefined;
  const optionGroups: Array<{ title: string; items: MenuComponent[] }> = [];
  const fitComponent = (c: MenuComponent) => !diet || passesPreferences(c.tags, prefs);
  if (picker?.type === "add" && line?.kind === "components") {
    for (const [group, list] of addableComponents(ix, line)) optionGroups.push({ title: t(GROUP_LABEL[group] ?? group), items: list.filter(fitComponent) });
  }
  if (picker?.type === "swap" && line?.kind === "components") {
    const list = swapOptions(ix, line, picker.componentId).filter(fitComponent);
    optionGroups.push({ title: t("Swap {name} for", { name: ix.components.get(picker.componentId)?.name ?? "" }), items: list });
  }
  // The choices are white rows on the sheet, each a full-width button with the portion under the name and the calories at the end.
  const choice = "app-numbers flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start transition hover:bg-soft-strong active:bg-soft-strong";
  return (
    <>
      <Sheet open={picker?.type === "add" || picker?.type === "swap"} onClose={onClose} title={picker?.type === "swap" ? t("Swap ingredient") : t("Add ingredient")}>
        {dietChip}
        {optionGroups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.title} className="mb-5">
            <h3 className={`mb-2 ${SMALL_LABEL}`}>{g.title}</h3>
            <ul className={SHEET_LIST}>
              {g.items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onPickComponent(c.id)} className={choice}>
                    <span className="min-w-0"><span className="block text-base font-semibold leading-snug">{c.name}</span>{c.portion && <span className="mt-0.5 block font-mono text-[0.75rem] text-muted">{c.portion}</span>}</span>
                    <span className="shrink-0 font-mono text-[0.8125rem] text-muted">{formatCalories(c.nutrients.calories)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Sheet>
      <Sheet open={picker?.type === "item"} onClose={onClose} title={t("Add item")}>
        {dietChip}
        {ix.chain.categories.map((cat) => {
          const items = ix.chain.items.filter((i) => i.category === cat && (!diet || passesDiet(i, prefs)));
          return items.length === 0 ? null : (
            <section key={cat} className="mb-5">
              <h3 className={`mb-2 ${SMALL_LABEL}`}>{cat}</h3>
              <ul className={SHEET_LIST}>
                {items.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => onPickItem(i.id)} className={choice}>
                      <span className="min-w-0 text-base font-semibold leading-snug">{i.name}</span>
                      <span className="shrink-0 font-mono text-[0.8125rem] text-muted">{formatCalories(i.nutrients.calories)}</span>
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
