"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { addToList, customItem, CUSTOM_RETAILER, formatPrice, groupName, itemCode, itemsOnList, knownLists, listAsText, listOf, listTotals, MAIN_LIST, newShoppingList, sameEntry, setQty, swapItem, toggleDone, type ShoppingItem } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { nextToBuy } from "@/lib/mm/listRecipes";
import { decodePayload, encodeEntries, payloadFrom, SHARE_PROBLEM, SHARED_APP_PATH, shareUrl, toEntries } from "@/lib/mm/shareList";
import { settingsStore, shoppingStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { ArrowRightIcon, BasketIcon, CheckIcon, CopyIcon, MinusIcon, PlusIcon, PotIcon, SearchIcon, ShareIcon, SwapIcon, TrashIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { SendToFriend } from "../../_components/SendToFriend";
import { Button, EmptyIcon, EmptyState, LinkButton, Sheet, Spinner } from "../../_components/ui";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { useListPhotos } from "../../_lib/listPhotos";
import { addedNote, addMissing, useListRecipes } from "../../_lib/listRecipes";
import { useShopManifest } from "../../_lib/shopProducts";
import { Rich } from "../../_lib/Rich";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { BackLink, CARD, LABEL, PILL_INPUT, TITLE } from "../PageBits";
import { ListThumb } from "../ProductPhoto";
import { ProductMini } from "../ProductMini";
import { RecipeThumb, RecipeThumbStack, hasRecipePicture } from "../../recipes/RecipeThumb";
import { shopPhotoSources } from "@/lib/mm/shopProducts";
import { listHref } from "../ListChoice";
import { NewListSheet } from "./NewListSheet";
import { ChooseSheet } from "./ChooseSheet";
import { SwapSheet } from "./SwapSheet";

// "Shopping list" (founder 2026-10-10, renamed from "My groceries" 2026-10-11): the shopping list, on this device only. Type anything in ("Milk"), or add products from Groceries and
// recipes; tick things off as they go in the basket. At the top: the recipes this list can make, and what one of them still needs. Share or
// copy it as text. Shelf prices are noted when products are added (a guide: never kept up to date).
// Looks follow Home (founder 2026-10-15): the compact title, a white pill to type in with a black Add pill, "What can I cook with this?" as the
// one lime tile on the screen, each shop's items under a small capital label in one white card (rows divided by a fine line, like a recipe's
// ingredients), each with a round tick and grey round − and + buttons.
// More than one list (founder 2026-11-18: "an option to create multiple shopping lists ... for different shops ... and multiple of the same shop itself"): the
// main "Shopping list" is every item with no list of its own, for any shop, exactly as before; "+ New list" asks which shop and makes a list for it ("M&S",
// "M&S 2"). With any extra list, big chips at the top pick the list shown (kept in the address, ?l=<id>). A list for one shop shows its items, its total and
// "Add more from {shop}", and can be deleted. Each product row has "Swap" (founder 2026-11-18: swap something you can't find at the supermarket).
// "Select" (founder 2026-11-18: "a way to select all the products in your shopping basket and remove them all together"): the rows' ticks become select boxes,
// with "Select all" and "Remove", which takes the chosen items off this list at once (Undo for 8 seconds, like Clear list).

export default function ShoppingListPage() {
  // the list shown comes from ?l=, so one cached page opens any of them
  return (
    <Suspense fallback={<Spinner />}>
      <ShoppingListScreen />
    </Suspense>
  );
}

function ShoppingListScreen() {
  const t = useT();
  const poss = usePossessive();
  const router = useRouter();
  const hydrated = useHydrated();
  const all = useStore(shoppingStore);
  const settings = useSettings();
  const asked = useSearchParams().get("l");
  const lists = useMemo(() => knownLists(settings.shoppingLists, all), [settings.shoppingLists, all]);
  /** The id of the extra list shown, or "" for the main "Shopping list" (also when ?l= names a list that no longer exists). */
  const listId = asked && lists.some((l) => l.id === asked) ? asked : "";
  const current = lists.find((l) => l.id === listId) ?? null;
  const list = useMemo(() => itemsOnList(all, listId), [all, listId]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [swapping, setSwapping] = useState<ShoppingItem | null>(null);
  // "Choose a product" for something typed in (usability test 2026-11-19): which item, at the list's own shop, else the person's shops (else every shop)
  const [choosing, setChoosing] = useState<ShoppingItem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  // Undo after Clear list, Remove ticked and the last − (each still takes effect at once, so no question first): the list as it was, what went, and the message
  const [undo, setUndo] = useState<{ before: ShoppingItem[]; removed: ShoppingItem[]; key: string; values?: Record<string, string> } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);
  const { state, matches } = useListRecipes(list);
  const photosOf = useListPhotos(list);
  const manifest = useShopManifest();
  /** Where "Add more from {shop}" goes: that shop's own list of products, or (a shop with no list) the page that asks which shop. */
  const shopHref = (retailer: string) => (manifest && !manifest.retailers.some((r) => r.id === retailer) ? "/app/groceries" : `/app/groceries/shop?r=${encodeURIComponent(retailer)}`);
  const chooseShops = useMemo(() => {
    const all = manifest?.retailers ?? [];
    const mine = all.filter((r) => (current ? r.id === current.shop : (settings.shops ?? []).includes(r.id)));
    return (mine.length ? mine : all).map((r) => ({ id: r.id, name: r.name }));
  }, [manifest, current, settings.shops]);
  /** Swap needs the shop's own list of products: every shop product, unless the shops' list says this shop has none. */
  const canSwap = (i: ShoppingItem) => !i.custom && i.retailer !== CUSTOM_RETAILER && (!manifest || manifest.retailers.some((r) => r.id === i.retailer));
  // the main list by shop, as before; a list for one shop is one card under its name (anything typed onto it included)
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of list) {
    const key = current ? current.shop : i.retailer;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const ticked = list.filter((i) => i.done).length;
  // Select: which items are chosen (by code, shop), only ever among the ones on the list shown
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const pickKey = (i: ShoppingItem) => `${itemCode(i)}|${i.retailer}`;
  const pickedNow = list.filter((i) => picked.has(pickKey(i)));
  const allPicked = list.length > 0 && pickedNow.length === list.length;
  const flipPick = (i: ShoppingItem) => setPicked((p) => { const n = new Set(p); if (n.has(pickKey(i))) n.delete(pickKey(i)); else n.add(pickKey(i)); return n; });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  // what was just ticked off and removed (bought) is not suggested again straight away (usability test 2026-11-19: Joan removed the ham she'd put in her
  // basket, and "You might also need" offered it back)
  const [bought, setBought] = useState<ReadonlySet<string>>(new Set());
  const suggestion = matches && !current
    ? nextToBuy(matches.map((m) => ({ ...m, missing: m.missing.filter((i) => { const pr = m.resolved.picks[i]?.product; return !pr || !bought.has(pr.gtin || pr.id); }) })))
    : null;
  const removeTicked = () => {
    setBought((b) => new Set([...b, ...list.filter((x) => x.done).map((x) => x.gtin || x.shopId || "").filter(Boolean)]));
    withUndo(tk("Ticked items removed."), undefined, () => shoppingStore.update((l) => l.filter((x) => listOf(x) !== listId || !x.done)));
    setNote(null);
  };

  /**
   * What is sent (founder 2026-10-15: a friend gets a link that opens the list, and says to get the app): a line saying whose list, the items as plain words
   * (so it reads in any message), then the link. The link holds the list itself after the "#", so nothing is stored anywhere (lib/mm/shareList.ts).
   */
  const message = (): { text: string; cut: { n: number; total: number } | null } => {
    const items = listAsText(list, t);
    const enc = encodeEntries(toEntries(list));
    const link = enc ? shareUrl(site.url, enc.payload) : null;
    const text = [t("My shopping list on {app}", { app: site.name }), "", items, ...(link ? ["", t("Open it in {app} to see the products and prices:", { app: site.name }), link] : [])].join("\n");
    return { text, cut: enc && enc.included < enc.total ? { n: enc.included, total: enc.total } : null };
  };
  const tellIfCut = (cut: { n: number; total: number } | null) => setNote(cut ? t("The link holds the first {n} of your {total} items. The list in the message has them all.", { n: cut.n, total: cut.total }) : null);
  const share = async () => {
    const { text, cut } = message();
    if (hasNative()) {
      const r = await nativeCall("share", { title: t("Shopping list"), text }); // the iPhone's own share sheet
      if (r.done) tellIfCut(cut);
      if (r.done || r.error === "cancelled") return;
    }
    try {
      if (navigator.share) { await navigator.share({ title: t("Shopping list"), text }); tellIfCut(cut); }
      else { await navigator.clipboard.writeText(text); setNote(cut ? t("The link holds the first {n} of your {total} items. The list in the message has them all.", { n: cut.n, total: cut.total }) : t("Copied.")); }
    } catch { /* cancelled */ }
  };
  const copy = async () => {
    const { text, cut } = message();
    try { await navigator.clipboard.writeText(text); setNote(cut ? t("The link holds the first {n} of your {total} items. The list in the message has them all.", { n: cut.n, total: cut.total }) : t("Copied.")); } catch { setNote(t("Couldn't copy.")); }
  };
  // "Got a list from a friend?": the link (or just its code) pasted in, for someone who has installed the app after being sent one
  const [opening, setOpening] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pastedProblem, setPastedProblem] = useState<string | null>(null);
  const openPasted = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = payloadFrom(pasted);
    const decoded = payload ? decodePayload(payload) : null;
    if (!payload || !decoded?.ok) { setPastedProblem(t(SHARE_PROBLEM[decoded && !decoded.ok ? decoded.reason : "unreadable"], { app: site.name })); return; }
    setOpening(false);
    setPasted("");
    router.push(`${SHARED_APP_PATH}#${payload}`);
  };
  const addTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const item = customItem(typed);
    if (!item) return;
    shoppingStore.update((l) => addToList(l, { ...item, list: listId || undefined })); // onto the list shown
    setTyped("");
    setNote(t("Added “{name}”.", { name: item.name }));
  };
  /** The same item: its code, its shop and its list. */
  const sameItem = sameEntry;
  /** "+ New list": a list for the shop chosen, named after it ("M&S", then "M&S 2"), opened at once. */
  const createList = (shop: { id: string; name: string }) => {
    const made = newShoppingList(lists, shop.id, shop.name);
    if (!made) return;
    settingsStore.update((s) => ({ ...s, shoppingLists: [...(s.shoppingLists ?? []), made] }));
    setCreating(false);
    setNote(t("Made a new list: {list}.", { list: made.name }));
    router.replace(listHref(made.id), { scroll: false });
  };
  /** "Delete this list": the list and everything on it (asked first), then the main list. */
  const deleteList = () => {
    if (!current) return;
    const { id, name } = current;
    shoppingStore.update((l) => l.filter((x) => listOf(x) !== id));
    settingsStore.update((s) => {
      const rest = (s.shoppingLists ?? []).filter((l) => l.id !== id);
      return { ...s, shoppingLists: rest.length ? rest : undefined };
    });
    setDeleting(false);
    setNote(t("Deleted {list}.", { list: name }));
    router.replace(listHref(), { scroll: false });
  };
  /** Swap: the chosen product takes the item's place on the same list, with the same quantity, not ticked. */
  const swapTo = (to: Omit<ShoppingItem, "qty" | "addedAt" | "list">) => {
    const from = swapping;
    setSwapping(null);
    if (!from) return;
    shoppingStore.update((l) => swapItem(l, from, to));
    setNote(t("Swapped for “{name}”.", { name: to.name }));
  };
  /** Choose a product: the product takes the typed item's place on the same list, with the same quantity, not ticked. */
  const chooseTo = (to: Omit<ShoppingItem, "qty" | "addedAt" | "list">) => {
    const from = choosing;
    setChoosing(null);
    if (!from) return;
    shoppingStore.update((l) => swapItem(l, from, to));
    setNote(t("Chose “{name}”.", { name: to.name }));
  };
  /** Runs `apply` and, when it took items off the list, offers Undo for 8 seconds. */
  const withUndo = (key: string, values: Record<string, string> | undefined, apply: () => void) => {
    const before = shoppingStore.get();
    apply();
    const now = shoppingStore.get();
    const removed = before.filter((b) => !now.some((n) => sameItem(n, b)));
    if (removed.length === 0) return;
    setUndo({ before, removed, key, values });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => { undoTimer.current = null; setUndo(null); }, 8000);
  };
  /** Puts the removed items back where they were, keeping the current version of every item still on the list and anything added since. */
  const undoRemove = () => {
    if (!undo) return;
    shoppingStore.update((now) => {
      const back = undo.before.filter((b) => undo.removed.some((r) => sameItem(r, b)) || now.some((n) => sameItem(n, b))).map((b) => now.find((n) => sameItem(n, b)) ?? b);
      return [...back, ...now.filter((n) => !undo.before.some((b) => sameItem(b, n)))];
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  };
  /** Select › Remove: the chosen items off this list at once, with Undo. */
  const removePicked = () => {
    const keys = new Set(pickedNow.map(pickKey));
    if (!keys.size) return;
    withUndo(keys.size === 1 ? tk("Removed 1 item from your list.") : tk("Removed {n} items from your list."), { n: String(keys.size) }, () => shoppingStore.update((l) => l.filter((x) => listOf(x) !== listId || !keys.has(pickKey(x)))));
    stopSelecting();
    setNote(null);
  };
  /** A round − or + : a 44 px tap area holding a 36 px grey circle, like Home's round actions. */
  const qtyButton = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95";
  const qtyCircle = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";

  return (
    <div>
      <BackLink href="/app" label={t("Back to home")} />
      <h1 className={`mt-5 ${TITLE}`}>{t("Shopping list")}</h1>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Your shopping list. Tick things off as they go in your basket.")}</p>

      {/* the lists (only once there is more than the main one): big chips that wrap at large text; "+ New list" is always there */}
      {hydrated && (
        <nav aria-label={t("Your shopping lists")} className="mt-5 flex flex-wrap gap-2">
          {lists.length > 0 && (
            <>
              <Link href={listHref()} replace scroll={false} aria-current={!current ? "page" : undefined} className={listChip(!current)}>
                <BasketIcon className="h-5 w-5 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{t("Shopping list")}</span>
              </Link>
              {lists.map((l) => (
                <Link key={l.id} href={listHref(l.id)} replace scroll={false} aria-current={current?.id === l.id ? "page" : undefined} className={listChip(current?.id === l.id)}>
                  <ShopMark shopId={l.shop} size="xs" /><span className="min-w-0 [overflow-wrap:anywhere]">{l.name}</span>
                </Link>
              ))}
            </>
          )}
          <button type="button" onClick={() => setCreating(true)} className="glass inline-flex min-h-12 max-w-full items-center gap-2 rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold transition active:scale-[0.97] hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span aria-hidden className="bg-sun inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-accent"><PlusIcon className="h-4 w-4" strokeWidth={3} /></span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{t("New list")}</span>
          </button>
        </nav>
      )}

      {/* the field takes the row and Add sits beside it; at large text, when both no longer fit, Add moves under the field across its width */}
      <form onSubmit={addTyped} className="mt-5 flex flex-wrap gap-2.5">
        <label className="min-w-0 flex-[999_1_13rem]">
          <span className="sr-only">{t("Add something to your list")}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("Add something, e.g. milk")} maxLength={60} enterKeyHint="done" autoComplete="off" className={`${PILL_INPUT} min-h-[3.25rem]`} />
        </label>
        <Button type="submit" className="min-h-[3.25rem] flex-[1_0_auto] px-5 disabled:bg-soft-strong disabled:text-muted disabled:opacity-100!" disabled={!typed.trim()}><PlusIcon className="h-5 w-5" />{t("Add")}</Button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 ps-1 text-sm font-medium text-accent">{note}</p>
      <button type="button" onClick={() => { setPastedProblem(null); setOpening(true); }} className="-ms-1 inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-accent underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[3px] transition active:scale-[0.97]">{t("Got a list from a friend? Open it")}</button>

      {!hydrated ? null : list.length === 0 && current ? (
        <div className="mt-2"><EmptyState icon={<EmptyIcon><BasketIcon /></EmptyIcon>} title={t("Nothing on {list} yet.", { list: current.name })} body={t("Add products from {shop}, or type what you need above.", { shop: groupName(current.shop, t) })} action={current.shop !== CUSTOM_RETAILER ? <Link href={shopHref(current.shop)} className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[15px] font-bold text-background transition active:scale-[0.97]">{t("Add products from {shop}", { shop: groupName(current.shop, t) })}</Link> : undefined} /></div>
      ) : list.length === 0 ? (
        <div className="mt-2"><EmptyState icon={<EmptyIcon><BasketIcon /></EmptyIcon>} title={t("Your list is empty.")} body={t("Type what you need above, or add products from Groceries and recipes.")} action={<div className="flex flex-wrap justify-center gap-2.5"><Link href="/app/groceries" className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[15px] font-bold text-background transition active:scale-[0.97]">{t("Browse groceries")}</Link><Link href="/app/recipes" className="glass inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold transition active:scale-[0.97] hover:bg-soft-strong">{t("See recipes")}</Link></div>} /></div>
      ) : (
        <>
          {/* At the top, as asked: what this list can make (its own products, matched by the recipes' rules). The one lime tile on the screen. */}
          {/* at large text the round pot steps aside (a container query) so the words keep their room */}
          {/* for the list shown (with lists of their own, the main list alone is ?l=main) */}
          <Link href={lists.length > 0 ? `/app/groceries/list/recipes?l=${encodeURIComponent(current ? current.id : MAIN_LIST)}` : "/app/groceries/list/recipes"} className="bg-sun lift group @container mt-2 flex min-h-[4.75rem] items-center gap-3.5 rounded-[1.25rem] p-3.5 text-on-accent">
            {/* the pictures of the first recipes it finds (founder 2026-11-17: "Use images please when possible"); the pot while it looks, or when none matches */}
            {matches && matches.some((m) => hasRecipePicture(m.recipe.id))
              ? <span className="hidden @[19rem]:inline-flex"><RecipeThumbStack recipes={matches.slice(0, 3).map((m) => m.recipe)} ring="ring-[color:var(--sun)]" moreClass="hidden @[22rem]:block" /></span>
              : <span aria-hidden className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-on-accent @[19rem]:inline-flex"><PotIcon className="h-6 w-6" /></span>}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-[1.0625rem] font-[800] leading-snug tracking-[-0.01em]">{t("What can I cook with this?")}</span>
              <span className="app-numbers mt-0.5 block text-[0.9375rem] leading-snug">
                {matches === null ? (state?.status === "error" ? t("See recipes that use what's on your list.") : t("Looking through the recipes…")) : matches.length === 0 ? t("No recipe uses these yet. See all recipes.") : matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}
              </span>
            </span>
            <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
          </Link>

          {/* Select, then Select all / Done; the count is said as it changes */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            {selecting ? (
              <>
                <button type="button" onClick={() => setPicked(allPicked ? new Set() : new Set(list.map(pickKey)))} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong">
                  <CheckIcon aria-hidden className="h-4 w-4" />{allPicked ? t("Deselect all") : t("Select all")}
                </button>
                <span role="status" aria-live="polite" className="app-numbers text-[0.9375rem] font-semibold text-muted">{t("{n} selected", { n: pickedNow.length })}</span>
                <button type="button" onClick={stopSelecting} className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-bold text-accent transition active:scale-95">{t("Done")}</button>
              </>
            ) : (
              <>
                <span className="app-numbers ps-1 text-[0.9375rem] font-semibold text-muted">{list.length === 1 ? t("1 item") : t("{n} items", { n: list.length })}{ticked > 0 ? ` · ${t("{n} in the basket", { n: ticked })}` : ""}</span>
                <button type="button" onClick={() => { setSelecting(true); setPicked(new Set()); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong">
                  <CheckIcon aria-hidden className="h-4 w-4" />{t("Select")}
                </button>
              </>
            )}
          </div>

          {[...groups.entries()].map(([retailer, items]) => {
            const totals = listTotals(items);
            const sorted = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
            const heading = current ? current.name : groupName(retailer, t);
            return (
              <section key={retailer} aria-label={heading} className="mt-8">
                <h2 className="kicker mb-3 flex min-h-7 items-center gap-2.5 ps-1 [overflow-wrap:anywhere]">{retailer !== CUSTOM_RETAILER && <ShopMark shopId={retailer} size="xs" />}{heading}</h2>
                <ul className={`${CARD} overflow-hidden`}>
                  {sorted.map((i) => {
                    const code = itemCode(i);
                    const href = i.custom ? null : i.gtin ? `/app/groceries/product?code=${i.gtin}&r=${i.retailer}` : `/app/groceries/shop/item?r=${i.retailer}&id=${encodeURIComponent(i.shopId ?? "")}`;
                    // no barcode number here (usability test 2026-11-19: "meaningless clutter", and cut off at large text)
                    const detail = [i.brand, i.size, i.price !== undefined ? formatPrice(i.price) : ""].filter(Boolean).join(" · ");
                    const body = (
                      <>
                        <span className={`block text-base font-semibold leading-snug [overflow-wrap:anywhere] ${i.done ? "text-muted line-through decoration-1" : ""}`}>{i.name}</span>
                        {detail && <span className="app-numbers mt-0.5 block text-sm text-muted [overflow-wrap:anywhere]">{detail}</span>}
                      </>
                    );
                    const thumb = <ListThumb sources={photosOf(i)} />;
                    return (
                      <li key={`${code}|${i.retailer}`} className="relative flex min-h-[4.5rem] items-start gap-x-1.5 px-2 py-2 pe-2.5 before:pointer-events-none before:absolute before:end-0 before:start-[3.25rem] before:top-0 before:h-px before:bg-[var(--line)] first:before:hidden">
                        {selecting ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={picked.has(pickKey(i))}
                            aria-label={t("Select {name}", { name: i.name })}
                            onClick={() => flipPick(i)}
                            className="mt-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                          >
                            <span aria-hidden className={`inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-[0.5rem] border-2 transition ${picked.has(pickKey(i)) ? "border-transparent bg-foreground text-background" : "border-[color-mix(in_srgb,var(--foreground)_40%,transparent)]"}`}>{picked.has(pickKey(i)) && <CheckIcon className="h-[15px] w-[15px]" strokeWidth={3} />}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={!!i.done}
                            aria-label={i.done ? t("{name}: in the basket", { name: i.name }) : t("{name}: still to get", { name: i.name })}
                            onClick={() => shoppingStore.update((l) => toggleDone(l, code, i.retailer, listId))}
                            className="mt-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                          >
                            <span aria-hidden className={`inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full border-2 transition ${i.done ? "bg-sun border-transparent text-on-accent" : "border-[color-mix(in_srgb,var(--foreground)_28%,transparent)]"}`}>{i.done && <CheckIcon className="h-[15px] w-[15px]" strokeWidth={3} />}</span>
                          </button>
                        )}
                        {/* the picture sits beside the name; what's left of the row under it is the quantity (a long name no longer squeezes against − and +) */}
                        <div className="flex min-w-0 flex-1 items-start gap-3 py-1">
                          {/* the picture opens the product too; the name beside it is the link a screen reader and the keyboard use */}
                          {href ? <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">{thumb}</Link> : thumb}
                          <div className="min-w-0 flex-1">
                            {href ? <Link href={href} className="block py-0.5">{body}</Link> : <div className="py-0.5">{body}</div>}
                            {/* "Swap" (a shop's product only: something similar at the same shop takes its place) at the start, − and + at the end; at large text they wrap */}
                            <div className={`mt-1 flex-wrap items-center justify-end gap-x-1 gap-y-1 ${selecting ? "hidden" : "flex"}`}>
                              {i.custom && chooseShops.length > 0 && (
                                <button type="button" onClick={() => setChoosing(i)} aria-label={t("Choose a product for {name}", { name: i.name })} className="me-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--fill)] px-3.5 text-[0.9375rem] font-semibold transition active:scale-95 hover:bg-soft-strong">
                                  <SearchIcon className="h-4 w-4" />{t("Choose a product")}
                                </button>
                              )}
                              {canSwap(i) && (
                                <button type="button" onClick={() => setSwapping(i)} aria-label={t("Swap {name}", { name: i.name })} className="me-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--fill)] px-3.5 text-[0.9375rem] font-semibold transition active:scale-95 hover:bg-soft-strong">
                                  <SwapIcon className="h-4 w-4" />{t("Swap")}
                                </button>
                              )}
                              <div className="flex items-center">
                                <button type="button" aria-label={t("One fewer {name}", { name: i.name })} onClick={() => (i.qty <= 1 ? withUndo(tk("Removed “{name}” from your list."), { name: i.name }, () => shoppingStore.update((l) => setQty(l, code, i.retailer, 0, listId))) : shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty - 1, listId)))} className={qtyButton}><span aria-hidden className={qtyCircle}><MinusIcon className="h-[18px] w-[18px]" /></span></button>
                                <span className="app-numbers w-7 text-center font-mono text-base" aria-label={t("Quantity {n}", { n: i.qty })}>{i.qty}</span>
                                <button type="button" aria-label={t("One more {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty + 1, listId))} className={qtyButton}><span aria-hidden className={qtyCircle}><PlusIcon className="h-[18px] w-[18px]" /></span></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {/* as the last row of each shop's card, like "New reminder" at the foot of a list: more from the same shop (founder 2026-10-15) */}
                  {retailer !== CUSTOM_RETAILER && (
                    <li className="relative before:pointer-events-none before:absolute before:end-0 before:start-[3.25rem] before:top-0 before:h-px before:bg-[var(--line)]">
                      <Link href={shopHref(retailer)} className="flex min-h-14 items-center gap-1.5 px-2 pe-3 transition hover:bg-[var(--fill)] active:bg-soft-strong">
                        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center"><span className="bg-sun inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full text-on-accent"><PlusIcon className="h-[15px] w-[15px]" strokeWidth={3} /></span></span>
                        <span className="min-w-0 flex-1 py-2 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t("Add more from {shop}", { shop: groupName(retailer, t) })}</span>
                      </Link>
                    </li>
                  )}
                </ul>
                {retailer !== CUSTOM_RETAILER && totals.priced > 0 && (
                  <p className="app-numbers mt-3 px-1 text-sm leading-relaxed text-muted">
                    <Rich
                      text={totals.priced === totals.count
                        ? (totals.oldest
                          ? t("{total} for the items with a price, at {shopPossessive} prices checked {date}. Prices change: check in store.", { shopPossessive: poss(groupName(retailer, t)), date: formatDate(totals.oldest, t) })
                          : t("{total} for the items with a price, at {shopPossessive} prices. Prices change: check in store.", { shopPossessive: poss(groupName(retailer, t)) }))
                        : (totals.oldest
                          ? t("{total} for the {priced} of {count} items with a price, at {shopPossessive} prices checked {date}. Prices change: check in store.", { priced: totals.priced, count: totals.count, shopPossessive: poss(groupName(retailer, t)), date: formatDate(totals.oldest, t) })
                          : t("{total} for the {priced} of {count} items with a price, at {shopPossessive} prices. Prices change: check in store.", { priced: totals.priced, count: totals.count, shopPossessive: poss(groupName(retailer, t)) }))}
                      values={{ total: <span className="font-bold text-foreground">{formatPrice(totals.total)}</span> }}
                    />
                  </p>
                )}
              </section>
            );
          })}
          {/* while selecting, Remove stays in view above the tab bar */}
          {selecting && (
            <div className="sticky bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-10 mt-4">
              <Button full className="min-h-14 text-lg shadow-lg" disabled={!pickedNow.length} onClick={removePicked}>
                <TrashIcon className="h-5 w-5" />{pickedNow.length === 1 ? t("Remove 1 item") : t("Remove {n} items", { n: pickedNow.length })}
              </Button>
            </div>
          )}
          {/* and a way to another shop: the page that asks "Which shop?" (not on a list for one shop) */}
          {!current && <LinkButton href="/app/groceries" variant="secondary" full className="mt-8 min-h-12"><BasketIcon className="h-5 w-5" />{[...groups.keys()].some((r) => r !== CUSTOM_RETAILER) ? t("Add from another shop") : t("Add products from a shop")}</LinkButton>}
          {/* the ticked things off the list, as the main button once something is ticked (usability test 2026-11-19: it was a quiet button at the very bottom) */}
          {ticked > 0 && <Button full className={`${current ? "mt-8" : "mt-3"} min-h-14 text-lg`} onClick={removeTicked}><TrashIcon className="h-5 w-5" />{t("Remove ticked ({n})", { n: ticked })}</Button>}
          <div className={`${ticked > 0 ? "mt-3" : current ? "mt-8" : "mt-3"} grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2.5`}>
            <Button className="min-h-12" onClick={share}><ShareIcon className="h-5 w-5" />{t("Share list")}</Button>
            <Button variant="secondary" className="min-h-12" onClick={copy}><CopyIcon className="h-5 w-5" />{t("Copy")}</Button>
            {/* to a friend who has the app (Community, founder 2026-10-16): lands in their Shared with you; needs an account, the rest of this page does not */}
            <SendToFriend list={list} onSent={setNote} />
            <Button variant="ghost" className="col-span-full min-h-12" onClick={() => { withUndo(tk("List cleared."), undefined, () => shoppingStore.update((l) => l.filter((x) => listOf(x) !== listId))); setNote(null); }}>{t("Clear list")}</Button>
          </div>
          <p className="mt-3 px-1 text-sm leading-snug text-muted">{t("Sharing sends a link that holds your list, so anyone who has it can see it.")}</p>
          {suggestion && state?.status === "ready" && (
            <section aria-labelledby="suggest-heading" className={`${CARD} mt-8 p-5`}>
              <h2 id="suggest-heading" className={LABEL}>{t("You might also need")}</h2>
              {/* the recipe's picture before the sentence; it opens the recipe too (the name in the sentence is the link a screen reader and the keyboard use), and sits above the words where the card is narrow */}
              <div className="@container mt-2">
                <div className="flex flex-col gap-3 @[16rem]:flex-row @[16rem]:items-center @[16rem]:gap-3.5">
                  <Link href={`/app/recipes/view?id=${suggestion.recipe.id}&r=${state.file.retailer}`} tabIndex={-1} aria-hidden className="shrink-0 self-start @[16rem]:self-center"><RecipeThumb id={suggestion.recipe.id} name={suggestion.recipe.name} meal={suggestion.recipe.meal} /></Link>
                  <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
                    <Rich text={t("To make {recipe}, you'd also need:")} values={{ recipe: <Link href={`/app/recipes/view?id=${suggestion.recipe.id}&r=${state.file.retailer}`} className="font-bold text-accent underline underline-offset-4">{t(suggestion.recipe.name)}</Link> }} />
                  </p>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {suggestion.missing.map((i) => {
                  const pick = suggestion.resolved.picks[i];
                  const label = pick?.spec.label ?? suggestion.recipe.ingredients[i]!.label;
                  // each with the photo of the product "Add them to my list" adds (the recipe's own pick at the shop)
                  return pick
                    ? <li key={i} className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] py-1 pe-3.5 ps-1.5 text-sm font-medium"><ProductMini sources={shopPhotoSources(state.file, pick.product)} />{t(label)}</li>
                    : <li key={i} className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] px-3.5 py-1.5 text-sm font-medium">{t(label)}</li>;
                })}
              </ul>
              <Button variant="secondary" className="mt-4" onClick={() => { const n = addMissing(suggestion, state.file); const { text, values } = addedNote(suggestion, n, state.file); setSuggestNote(t(text, values)); }}>
                <PlusIcon className="h-5 w-5" />{suggestion.missing.length === 1 ? t("Add it to my list") : t("Add them to my list")}
              </Button>
              <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-accent empty:mt-0">{suggestNote}</p>
            </section>
          )}

        </>
      )}

      {/* a quiet way to delete a list of the person's own, at the foot (asked first: it says how many items go with it) */}
      {hydrated && current && (
        <div className="mt-8 flex justify-center">
          <Button variant="ghost" className="min-h-12" onClick={() => setDeleting(true)}><TrashIcon className="h-5 w-5" />{t("Delete this list")}</Button>
        </div>
      )}

      {undo && (
        // Outside the empty-list branch (Clear list empties it), and at the top, clear of the rows' − and + and the tab bar, like Home's "Added" bar
        <div role="status" className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[1.75rem] bg-foreground py-1.5 ps-5 pe-2 text-background shadow-lg">
          <span className="min-w-0 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{t(undo.key, undo.values)}</span>
          <button type="button" className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-[var(--sun)] transition hover:bg-white/10" onClick={undoRemove}>{t("Undo")}</button>
        </div>
      )}

      <Sheet open={opening} onClose={() => setOpening(false)} title={t("Open a shared list")}>
        <form onSubmit={openPasted} className="space-y-4 pb-2 pt-1">
          <p className="text-[0.9375rem] leading-snug text-muted">{t("Paste the link your friend sent, and the list opens.")}</p>
          <label className="block">
            <span className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{t("The link or code")}</span>
            <input value={pasted} onChange={(e) => { setPasted(e.target.value); setPastedProblem(null); }} placeholder={t("Paste it here")} enterKeyHint="go" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={pastedProblem ? true : undefined} className={PILL_INPUT} />
          </label>
          {pastedProblem && <p role="alert" className="text-[0.9375rem] font-semibold leading-snug">{pastedProblem}</p>}
          <Button type="submit" full className="min-h-12 text-base" disabled={!pasted.trim()}>{t("Open the list")}</Button>
        </form>
      </Sheet>

      <NewListSheet open={creating} onClose={() => setCreating(false)} onPick={createList} lists={lists} />
      <SwapSheet item={swapping} onClose={() => setSwapping(null)} onSwap={swapTo} moreHref={shopHref} />
      <ChooseSheet item={choosing} shops={chooseShops} onClose={() => setChoosing(null)} onChoose={chooseTo} />
      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t("Delete this list?")}>
        {current && (
          <div className="space-y-4 pb-2 pt-1">
            <p className="text-base leading-snug [overflow-wrap:anywhere]">
              {list.length === 0 ? t("{list} has nothing on it. Deleting it can't be undone.", { list: current.name })
                : list.length === 1 ? t("This deletes {list} and the 1 item on it. It can't be undone.", { list: current.name })
                : t("This deletes {list} and the {n} items on it. It can't be undone.", { list: current.name, n: list.length })}
            </p>
            <div className="grid gap-2.5">
              <Button variant="danger" full className="min-h-12 text-base" onClick={deleteList}><TrashIcon className="h-5 w-5" />{t("Delete the list")}</Button>
              <Button variant="secondary" full className="min-h-12 text-base" onClick={() => setDeleting(false)}>{t("Keep it")}</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** A list's chip at the top: big (48 px), wrapping its words at large text; the one shown is the dark one. */
function listChip(on: boolean): string {
  return `inline-flex min-h-12 max-w-full items-center gap-2 rounded-full border ps-2.5 pe-4 text-[0.9375rem] font-semibold leading-snug transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background" : "border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] bg-transparent hover:bg-soft-strong"}`;
}
