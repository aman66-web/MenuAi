"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { addToList, customItem, CUSTOM_RETAILER, formatPrice, groupName, itemCode, itemsOnList, knownLists, listAsText, listOf, listTotals, MAIN_LIST, MAX_QTY, MAX_SHOPPING_ITEMS, newShoppingList, sameEntry, setQty, swapItem, toggleDone, type ShoppingItem } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { nextToBuy, withoutWhatTheyHave } from "@/lib/mm/listRecipes";
import { decodePayload, encodeEntries, payloadFrom, SHARE_PROBLEM, SHARED_APP_PATH, shareUrl, toEntries } from "@/lib/mm/shareList";
import { cupboardStore, settingsStore, shoppingStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { PageHeader } from "../../_components/PageHeader";
import { AlertCircleIcon, ArrowRightIcon, BasketIcon, CheckIcon, CopyIcon, MinusIcon, PlusIcon, PotIcon, SearchIcon, ShareIcon, SwapIcon, TrashIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { SendToFriend } from "../../_components/SendToFriend";
import { Toast } from "../../_components/Toast";
import { Button, EmptyIcon, EmptyState, LinkButton, Sheet, Spinner } from "../../_components/ui";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { useListPhotos } from "../../_lib/listPhotos";
import { addedNote, addMissing, useListRecipes } from "../../_lib/listRecipes";
import { rememberList } from "../../_components/TopActions";
import { useShopManifest } from "../../_lib/shopProducts";
import { Rich } from "../../_lib/Rich";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { CARD, LABEL, PILL_INPUT, TITLE } from "../PageBits";
import { ListThumb } from "../ProductPhoto";
import { ProductMini } from "../ProductMini";
import { RecipeThumb, RecipeThumbStack, hasRecipePicture } from "../../recipes/RecipeThumb";
import { listAddOutcome, shopPhotoSources } from "@/lib/mm/shopProducts";
import { listHref } from "../ListChoice";
import { NewListSheet } from "./NewListSheet";
import { ChooseSheet } from "./ChooseSheet";
import { SwapSheet } from "./SwapSheet";

// "Shopping list" (founder 2026-10-10, renamed from "My groceries" 2026-10-11): the shopping list, on this device only. Type anything in ("Milk"), or add products from Groceries and
// recipes; tick things off as they go in the basket. At the top: the recipes this list can make, and what one of them still needs. Share or
// copy it as text. Shelf prices are noted when products are added (a guide: never kept up to date).
// Looks follow Home (founder 2026-10-15) and the colour meeting (19 November 2026, approved by the founder that day): the compact title, a labelled white
// field with an ink Add pill (always on: with nothing typed it puts the cursor in the field), "What can I cook with this?" on the cream tint of every "cook with
// what you have" card, each shop's items under its logo and name in one white card (rows divided by a fine line, like a recipe's ingredients), each with a
// round tick (an empty grey ring; ticked lime with the dark green edge and a tick) and the − and + as one white control with the edge. The list you're on is
// lime with a tick; adds are ink; Clear list is the red-edged destructive button, last and apart; Undo is in the one toast.
// More than one list (founder 2026-11-18: "an option to create multiple shopping lists ... for different shops ... and multiple of the same shop itself"): the
// main "Shopping list" is every item with no list of its own, for any shop, exactly as before; "+ New list" asks which shop and makes a list for it ("M&S",
// "M&S 2"). With any extra list, big chips at the top pick the list shown (kept in the address, ?l=<id>). A list for one shop shows its items, its total and
// "Add more from {shop}", and can be deleted. Each product row has "Swap" (founder 2026-11-18: swap something you can't find at the supermarket).
// "Select" (founder 2026-11-18: "a way to select all the products in your shopping basket and remove them all together"): the rows' ticks become select boxes,
// with "Select all" and "Remove", which takes the chosen items off this list at once (Undo for 8 seconds, like Clear list). While selecting, everything else
// that acts on the list steps aside (two different Removes at once confused testers), and switching list leaves Select.
// In the shop the list itself comes first (the meeting's finding, 20 November 2026: the first tick sat below the fold): no subtitle repeating the title, the
// lists' chips only when there are lists of one's own (else "New list" sits small beside the count), and "Got a list from a friend?" with Share and Copy.

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
  const [undo, setUndo] = useState<{ before: ShoppingItem[]; removed: ShoppingItem[]; key: string; values?: Record<string, string>; n: number } | null>(null);
  const typedBox = useRef<HTMLInputElement>(null);
  // "What can I cook with this?" from the list's own shop first, when it is one in recipes (lib _lib/listRecipes.ts)
  const { state, matches } = useListRecipes(list, current?.shop ?? null);
  // the Shopping list pill at the top of every page opens the list last looked at while it still has things to get
  useEffect(() => { if (hydrated) rememberList(listId); }, [hydrated, listId]);
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
  // Select: which items are chosen (by code, shop), only ever among the ones on the list shown; Select belongs to the list it began on, so switching list
  // with the chips leaves it
  const [selectingOn, setSelectingOn] = useState<string | null>(null);
  const selecting = selectingOn === listId;
  const setSelecting = (on: boolean) => setSelectingOn(on ? listId : null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // switching list ends Select for good, so coming back to the list it began on doesn't find it still on (the 30-person meeting, 21 November 2026, Leo); set while
  // rendering, as React advises for state that follows a value, so no frame shows the old Select
  const [shownList, setShownList] = useState(listId);
  if (shownList !== listId) {
    setShownList(listId);
    setSelectingOn(null);
    setPicked(new Set());
  }
  const pickKey = (i: ShoppingItem) => `${itemCode(i)}|${i.retailer}`;
  const pickedNow = list.filter((i) => picked.has(pickKey(i)));
  const allPicked = list.length > 0 && pickedNow.length === list.length;
  const flipPick = (i: ShoppingItem) => setPicked((p) => { const n = new Set(p); if (n.has(pickKey(i))) n.delete(pickKey(i)); else n.add(pickKey(i)); return n; });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  // what was just ticked off and removed (bought) is not suggested again straight away (usability test 2026-11-19: Joan removed the ham she'd put in her
  // basket, and "You might also need" offered it back)
  const [bought, setBought] = useState<ReadonlySet<string>>(new Set());
  // nor what the person has said they have (cupboard kinds they keep, a recipe's ingredients ticked "I have this": withoutWhatTheyHave)
  const cupboard = useStore(cupboardStore);
  const suggestion = matches && !current
    ? nextToBuy(withoutWhatTheyHave(matches, new Set(cupboard)).map((m) => ({ ...m, missing: m.missing.filter((i) => { const pr = m.resolved.picks[i]?.product; return !pr || !bought.has(pr.gtin || pr.id); }) })))
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
    // what was typed onto a shop's own list goes under that shop
    const items = listAsText(list, t, current?.shop);
    const enc = encodeEntries(toEntries(list));
    const link = enc ? shareUrl(site.url, enc.payload) : null;
    const text = [t("My shopping list on {app}", { app: site.name }), "", items, ...(link ? ["", t("Open it in {app} to see the products and prices:", { app: site.name }), link] : [])].join("\n");
    return { text, cut: enc && enc.included < enc.total ? { n: enc.included, total: enc.total } : null };
  };
  const tellIfCut = (cut: { n: number; total: number } | null) => setNote(cut ? t("The link holds the first {n} of your {total} items. The list in the message has them all.", { n: cut.n, total: cut.total }) : null);
  const share = async () => {
    const { text, cut } = message();
    if (hasNative()) {
      // the iPhone's own share sheet, open as long as the person likes (15 minutes, as buying a plan; the meeting of 21 November 2026, Will #29)
      const r = await nativeCall("share", { title: t("Shopping list"), text }, 15 * 60_000);
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
    if (!item) { typedBox.current?.focus(); return; } // Add is always on: with nothing typed, it puts the cursor in the field
    const entry = { ...item, list: listId || undefined }; // onto the list shown
    let outcome = "added" as ReturnType<typeof listAddOutcome>; // set inside update, which runs at once
    shoppingStore.update((l) => {
      const next = addToList(l, entry);
      outcome = listAddOutcome(l, next, entry);
      return next;
    });
    // an add that changed nothing says why, never "Added" (the 30-person meeting, 21 November 2026, Leo)
    if (outcome === "full") { setNote(t("Added {n} of {total}: your lists are full ({max} items). Remove ticked things to make room.", { n: 0, total: 1, max: MAX_SHOPPING_ITEMS })); return; }
    setTyped("");
    setNote(outcome === "most" ? t("{n} is the most for one item.", { n: MAX_QTY }) : t("Added “{name}”.", { name: item.name }));
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
    setUndo((was) => ({ before, removed, key, values, n: (was?.n ?? 0) + 1 })); // the toast closes itself after 8 seconds (longer while touched)
  };
  /** Puts the removed items back where they were, keeping the current version of every item still on the list and anything added since. */
  const undoRemove = () => {
    if (!undo) return;
    shoppingStore.update((now) => {
      const back = undo.before.filter((b) => undo.removed.some((r) => sameItem(r, b)) || now.some((n) => sameItem(n, b))).map((b) => now.find((n) => sameItem(n, b)) ?? b);
      return [...back, ...now.filter((n) => !undo.before.some((b) => sameItem(b, n)))];
    });
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
  /** The − and + : one white control with the 1.5 px edge holding the two 44 px buttons and the quantity between them, ink icons (two grey circles looked
   *  alike and both looked switched off). */
  const qtyButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition active:scale-95 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:text-muted disabled:active:scale-100";
  // each list's things still to get, said on its chip; and the list with things to get when this one is empty
  const toGet = (id: string) => all.filter((x) => listOf(x) === id && !x.done).length;
  const elsewhere = !current && list.length === 0 ? lists.find((l) => toGet(l.id) > 0) ?? null : null;
  // nothing left to share once everything is ticked off (Share and Copy are switched off, with the reason)
  const nothingToShare = list.every((i) => i.done);
  const newListButton = (
    <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[0.9375rem] font-bold text-foreground underline-offset-4 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink"><PlusIcon className="h-3.5 w-3.5" strokeWidth={3} /></span>{t("New list")}
    </button>
  );
  const friendButton = <Button variant="secondary" className="min-h-12" onClick={() => { setPastedProblem(null); setOpening(true); }}>{t("Got a list from a friend? Open it")}</Button>;

  return (
    <div>
      <PageHeader back={{ href: "/app", label: t("Back to home") }} />
      {/* an extra list is titled with its own name; the main list's line only once it has things on it (it repeated the title) */}
      <h1 className={`mt-5 ${TITLE} [overflow-wrap:anywhere]`}>{current ? current.name : t("Shopping list")}</h1>
      {/* how to use it, once the list has things on it; an extra list's own name says what it is (the words pass, 20 November 2026) */}
      {hydrated && list.length > 0 && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Tick things off as you shop.")}</p>}

      {/* the lists (only once there is more than the main one): big chips that wrap at large text, each with how many things it still has to get, and
          "+ New list"; with no list of one's own, "New list" is a small link beside the count instead */}
      {hydrated && lists.length > 0 && (
        <nav aria-label={t("Your shopping lists")} className="mt-4 flex flex-wrap gap-2">
          <Link href={listHref()} replace scroll={false} aria-current={!current ? "page" : undefined} className={listChip(!current)}>
            {!current && <CheckIcon aria-hidden strokeWidth={3} className="h-4 w-4 shrink-0" />}<BasketIcon aria-hidden className="h-5 w-5 shrink-0" /><ChipLabel name={t("Shopping list")} n={toGet("")} />
          </Link>
          {lists.map((l) => (
            <Link key={l.id} href={listHref(l.id)} replace scroll={false} aria-current={current?.id === l.id ? "page" : undefined} className={listChip(current?.id === l.id)}>
              {current?.id === l.id && <CheckIcon aria-hidden strokeWidth={3} className="h-4 w-4 shrink-0" />}<ShopMark shopId={l.shop} size="xs" /><ChipLabel name={l.name} n={toGet(l.id)} />
            </Link>
          ))}
          <button type="button" onClick={() => setCreating(true)} className="border-[1.5px] border-edge bg-card text-foreground inline-flex min-h-12 max-w-full items-center gap-2 rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold transition active:scale-[0.97] hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink"><PlusIcon className="h-4 w-4" strokeWidth={3} /></span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{t("New list")}</span>
          </button>
        </nav>
      )}

      {/* a visible label over the field (testers were stuck at boxes with none); the field takes the row and Add sits beside it; at large text, when both no
          longer fit, Add moves under the field across its width. Add is always on: with nothing typed, it puts the cursor in the field. Hidden while
          selecting. */}
      <form onSubmit={addTyped} className={`mt-4 ${selecting ? "hidden" : ""}`}>
        <label htmlFor="list-add" className="mb-2 block ps-1 text-[0.9375rem] font-semibold leading-snug">{t("Add something to your list")}</label>
        <div className="flex flex-wrap gap-2.5">
          <input id="list-add" ref={typedBox} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("e.g. milk")} maxLength={60} enterKeyHint="done" autoComplete="off" className={`${PILL_INPUT} min-h-[3.25rem] min-w-0 flex-[999_1_13rem]`} />
          <Button type="submit" className="min-h-[3.25rem] flex-[1_0_auto] px-5"><PlusIcon className="h-5 w-5" />{t("Add")}</Button>
        </div>
      </form>
      {/* takes no room until there is something to say (the list itself comes first) */}
      <p role="status" aria-live="polite" className="mt-2 ps-1 text-sm font-medium text-foreground empty:mt-0">{note}</p>

      {!hydrated ? null : list.length === 0 && current ? (
        <div className="mt-2">
          <EmptyState icon={<EmptyIcon><BasketIcon /></EmptyIcon>} title={t("Nothing on {list} yet.", { list: current.name })} action={current.shop !== CUSTOM_RETAILER ? <LinkButton href={shopHref(current.shop)}>{t("Add products from {shop}", { shop: groupName(current.shop, t) })}</LinkButton> : undefined} />
          <div className="mt-4 flex justify-center">{friendButton}</div>
        </div>
      ) : list.length === 0 && elsewhere ? (
        // the main list is empty but another isn't (the pill counted things on every list): say where they are, with the way there
        <div className={`${CARD} mt-3 p-4`}>
          <p className="text-base font-semibold leading-snug">{toGet(elsewhere.id) === 1 ? t("Nothing on Shopping list. {list} has 1 thing to get.", { list: elsewhere.name }) : t("Nothing on Shopping list. {list} has {n} things to get.", { list: elsewhere.name, n: toGet(elsewhere.id) })}</p>
          <LinkButton href={listHref(elsewhere.id)} replace className="mt-3 min-h-12"><ShopMark shopId={elsewhere.shop} size="xs" />{t("Open {list}", { list: elsewhere.name })}</LinkButton>
          <div className="mt-4 flex flex-wrap items-center gap-2">{friendButton}</div>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-2">
          <EmptyState icon={<EmptyIcon><BasketIcon /></EmptyIcon>} title={t("Your list is empty.")} action={<div className="flex flex-wrap justify-center gap-2.5"><LinkButton href="/app/groceries">{t("Browse groceries")}</LinkButton><LinkButton href="/app/recipes" variant="secondary">{t("See recipes")}</LinkButton></div>} />
          <div className="mt-4 flex flex-wrap justify-center gap-2">{friendButton}{lists.length === 0 && newListButton}</div>
        </div>
      ) : (
        <>
          {/* At the top, as asked: what this list can make (its own products, matched by the recipes' rules), on the cream tint of every "cook with what you
              have" card (a full lime card read as selected), ink words and an ink arrow. */}
          {/* at large text the round pot steps aside (a container query) so the words keep their room */}
          {/* for the list shown (with lists of their own, the main list alone is ?l=main) */}
          <Link href={lists.length > 0 ? `/app/groceries/list/recipes?l=${encodeURIComponent(current ? current.id : MAIN_LIST)}` : "/app/groceries/list/recipes"} className={`lift group @container mt-2 min-h-[4.75rem] items-center gap-3.5 rounded-[1.25rem] border border-line bg-tint-cook p-3.5 text-foreground ${selecting ? "hidden" : "flex"}`}>
            {/* the pictures of the first recipes it finds (founder 2026-11-17: "Use images please when possible"); the pot while it looks, or when none matches */}
            {matches && matches.some((m) => hasRecipePicture(m.recipe.id))
              ? <span className="hidden @[19rem]:inline-flex"><RecipeThumbStack recipes={matches.slice(0, 3).map((m) => m.recipe)} ring="ring-tint-cook" moreClass="hidden @[22rem]:block" /></span>
              : <span aria-hidden className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink @[19rem]:inline-flex"><PotIcon className="h-6 w-6" /></span>}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-[1.0625rem] font-[800] leading-snug tracking-[-0.01em]">{t("What can I cook with this?")}</span>
              <span className="app-numbers mt-0.5 block text-[0.9375rem] leading-snug">
                {/* no recipe shop (or the shops' list couldn't load) is said like a failure, never "Looking…" for ever (the 30-person meeting, 21 November 2026, Leo) */}
                {matches === null ? (state === null || state.status === "error" ? t("See recipes that use what's on your list.") : t("Looking through the recipes…")) : matches.length === 0 ? t("No recipe uses these yet. See all recipes.") : matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}
              </span>
            </span>
            <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
          </Link>

          {/* Select, then Select all / Done; the count is said as it changes */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            {selecting ? (
              <>
                <button type="button" onClick={() => setPicked(allPicked ? new Set() : new Set(list.map(pickKey)))} className="inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-edge bg-card px-4 text-[0.9375rem] font-semibold text-foreground transition active:scale-[0.97] hover:bg-background">
                  <CheckIcon aria-hidden className="h-4 w-4" />{allPicked ? t("Deselect all") : t("Select all")}
                </button>
                <span role="status" aria-live="polite" className="app-numbers text-[0.9375rem] font-semibold text-muted">{t("{n} selected", { n: pickedNow.length })}</span>
                <Button onClick={stopSelecting} className="px-5">{t("Done")}</Button>
              </>
            ) : (
              <>
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="app-numbers ps-1 text-[0.9375rem] font-semibold text-muted">{list.length === 1 ? t("1 item") : t("{n} items", { n: list.length })}{ticked > 0 ? ` · ${t("{n} in the basket", { n: ticked })}` : ""}</span>
                  {lists.length === 0 && newListButton}
                </span>
                <button type="button" onClick={() => { setSelecting(true); setPicked(new Set()); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-edge bg-card px-4 text-[0.9375rem] font-semibold text-foreground transition active:scale-[0.97] hover:bg-background">
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
              <section key={retailer} aria-label={heading} className="mt-4">
                {/* the shopper's anchor in the aisle: the shop's logo and its name, bold, in the body's ink */}
                <h2 className="mb-3 flex min-h-7 items-center gap-2.5 ps-1 text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{retailer !== CUSTOM_RETAILER && <ShopMark shopId={retailer} size="xs" />}{heading}</h2>
                <ul className={`${CARD} overflow-hidden`}>
                  {sorted.map((i) => {
                    const code = itemCode(i);
                    // the shop's own product page when we know its id there (it always exists; the barcode page only when the Groceries list has that barcode:
                    // usability test 2026-11-19, Joan's Birds Eye peas opened "That barcode isn't in our list yet")
                    const href = i.custom ? null : i.shopId ? `/app/groceries/shop/item?r=${i.retailer}&id=${encodeURIComponent(i.shopId)}` : `/app/groceries/product?code=${i.gtin}&r=${i.retailer}`;
                    // no barcode number here (usability test 2026-11-19: "meaningless clutter", and cut off at large text); the price in the body's ink
                    const detail = [i.brand, i.size].filter(Boolean).join(" · ");
                    // the price is a pack's: "2 × £2.44" when there are two, so it never reads as the row's total
                    const price = i.price === undefined ? null : i.qty > 1 ? t("{qty} × {price}", { qty: i.qty, price: formatPrice(i.price) }) : formatPrice(i.price);
                    const body = (
                      <>
                        <span className={`block text-base font-semibold leading-snug [overflow-wrap:anywhere] ${i.done ? "text-muted line-through decoration-1" : ""}`}>{i.name}</span>
                        {(detail || i.price !== undefined) && (
                          <span className="app-numbers mt-0.5 block text-sm [overflow-wrap:anywhere]">
                            {detail && <span className="text-muted">{detail}</span>}
                            {detail && i.price !== undefined && <span className="text-muted"> · </span>}
                            {price !== null && <span className="font-semibold text-foreground">{price}</span>}
                          </span>
                        )}
                      </>
                    );
                    // 48 px here (ListThumb's own 56 px made Swap and the − / + wrap onto two lines on a 375-390 px iPhone)
                    const thumb = <span className="block [&>span]:h-12 [&>span]:w-12"><ListThumb sources={photosOf(i)} /></span>;
                    // one id per row with no spaces (aria-describedby is a list of ids split at spaces: a typed "oat milk" pointed at nothing); encodeURIComponent
                    // never writes ":", so swapping its "%" for ":" keeps every row's id its own (the 30-person meeting, 21 November 2026, Leo)
                    const mostId = `most-${i.retailer}-${encodeURIComponent(code).replace(/%/g, ":")}`;
                    return (
                      <li key={`${code}|${i.retailer}`} className="relative flex min-h-[4.5rem] items-start gap-x-1.5 px-2 py-2 pe-2.5 before:pointer-events-none before:absolute before:end-0 before:start-[3.25rem] before:top-0 before:h-px before:bg-line first:before:hidden">
                        {selecting ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={picked.has(pickKey(i))}
                            aria-label={t("Select {name}", { name: i.name })}
                            onClick={() => flipPick(i)}
                            className="mt-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                          >
                            <span aria-hidden className={`inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-[0.5rem] border-2 transition ${picked.has(pickKey(i)) ? "border-on-sun bg-sun text-on-sun" : "border-edge bg-card"}`}>{picked.has(pickKey(i)) && <CheckIcon className="h-[15px] w-[15px]" strokeWidth={3} />}</span>
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
                            <span aria-hidden className={`inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full border-2 transition ${i.done ? "border-on-sun bg-sun text-on-sun" : "border-edge bg-card"}`}>{i.done && <CheckIcon className="h-[15px] w-[15px]" strokeWidth={3} />}</span>
                          </button>
                        )}
                        {/* the picture sits beside the name; what's left of the row under it is the quantity (a long name no longer squeezes against − and +) */}
                        <div className="flex min-w-0 flex-1 items-start gap-2.5 py-1">
                          {/* the picture opens the product too; the name beside it is the link a screen reader and the keyboard use. While selecting, neither opens
                              anything: a tap on the row picks it, as its box does (the 30-person meeting, 21 November 2026, Leo: tapping a name opened the product and
                              lost the selection) */}
                          {href && !selecting ? <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">{thumb}</Link> : thumb}
                          <div className="min-w-0 flex-1">
                            {selecting ? <button type="button" tabIndex={-1} aria-hidden onClick={() => flipPick(i)} className="block w-full py-0.5 text-start">{body}</button>
                              : href ? <Link href={href} className="block py-0.5">{body}</Link> : <div className="py-0.5">{body}</div>}
                            {/* "Swap" (a shop's product only: something similar at the same shop takes its place) at the start, − and + at the end; at large text they wrap */}
                            <div className={`mt-1 flex-wrap items-center justify-end gap-x-1 gap-y-1 ${selecting ? "hidden" : "flex"}`}>
                              {i.custom && chooseShops.length > 0 && (
                                <button type="button" onClick={() => setChoosing(i)} aria-label={t("Choose a product for {name}", { name: i.name })} className="me-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-edge bg-card px-3 text-[0.9375rem] font-semibold text-foreground transition active:scale-[0.97] hover:bg-background">
                                  <SearchIcon className="h-4 w-4 text-ink" />{t("Choose a product")}
                                </button>
                              )}
                              {canSwap(i) && (
                                <button type="button" onClick={() => setSwapping(i)} aria-label={t("Swap {name}", { name: i.name })} className="me-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border-[1.5px] border-edge bg-card px-2.5 text-[0.9375rem] font-semibold text-foreground transition active:scale-[0.97] hover:bg-background">
                                  <SwapIcon className="h-4 w-4 text-ink" />{t("Swap")}
                                </button>
                              )}
                              <div className="flex items-center rounded-full border-[1.5px] border-edge bg-card">
                                <button type="button" aria-label={t("One fewer {name}", { name: i.name })} onClick={() => (i.qty <= 1 ? withUndo(tk("Removed “{name}” from your list."), { name: i.name }, () => shoppingStore.update((l) => setQty(l, code, i.retailer, 0, listId))) : shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty - 1, listId)))} className={qtyButton}><MinusIcon aria-hidden className="h-[18px] w-[18px]" /></button>
                                {/* the figure is drawn; a screen reader hears "Quantity 2" (aria-label on a plain span is not read) */}
                                <span className="app-numbers w-7 text-center font-mono text-base"><span aria-hidden>{i.qty}</span><span className="sr-only">{t("Quantity {n}", { n: i.qty })}</span></span>
                                <button type="button" aria-label={t("One more {name}", { name: i.name })} disabled={i.qty >= MAX_QTY} aria-describedby={i.qty >= MAX_QTY ? mostId : undefined} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty + 1, listId))} className={qtyButton}><PlusIcon aria-hidden className="h-[18px] w-[18px]" /></button>
                              </div>
                            </div>
                            {i.qty >= MAX_QTY && !selecting && <p id={mostId} className="mt-1 text-end text-[0.8125rem] leading-snug text-muted">{t("{n} is the most for one item.", { n: MAX_QTY })}</p>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {/* as the last row of each shop's card, like "New reminder" at the foot of a list: more from the same shop (founder 2026-10-15) */}
                  {retailer !== CUSTOM_RETAILER && !selecting && (
                    <li className="relative before:pointer-events-none before:absolute before:end-0 before:start-[3.25rem] before:top-0 before:h-px before:bg-line">
                      <Link href={shopHref(retailer)} className="flex min-h-14 items-center gap-1.5 px-2 pe-3 transition hover:bg-background active:bg-background">
                        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center"><span className="inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full bg-ink text-on-ink"><PlusIcon className="h-[15px] w-[15px]" strokeWidth={3} /></span></span>
                        <span className="min-w-0 flex-1 py-2 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t("Add more from {shop}", { shop: groupName(retailer, t) })}</span>
                      </Link>
                    </li>
                  )}
                </ul>
                {retailer !== CUSTOM_RETAILER && totals.priced > 0 && (
                  <p className="app-numbers mt-3 px-1 text-[0.9375rem] leading-relaxed text-muted">
                    <Rich
                      text={totals.priced === totals.count
                        ? (totals.oldest
                          ? t("{total} at {shopPossessive} prices checked {date}. Prices change: check in store.", { shopPossessive: poss(groupName(retailer, t)), date: formatDate(totals.oldest, t) })
                          : t("{total} at {shopPossessive} prices. Prices change: check in store.", { shopPossessive: poss(groupName(retailer, t)) }))
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
          {/* while selecting, Remove stays in view above the tab bar once something is picked (nothing else acts on the list meanwhile) */}
          {selecting && pickedNow.length > 0 && (
            <div className="sticky bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-10 mt-4">
              <Button full wrapClassName="rounded-[1.25rem] bg-background p-2" className="min-h-14 text-lg shadow-[var(--shadow-lift)]" onClick={removePicked}>
                <TrashIcon className="h-5 w-5" />{pickedNow.length === 1 ? t("Remove 1 item") : t("Remove {n} items", { n: pickedNow.length })}
              </Button>
            </div>
          )}
          {/* "You might also need", before the buttons that send, share or clear the list (it sat after the red Clear list) */}
          {suggestion && state?.status === "ready" && !selecting && (
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
                    ? <li key={i} className="inline-flex items-center gap-2 rounded-[0.375rem] bg-fill py-1 pe-3 ps-1 text-[0.9375rem] font-medium"><ProductMini sources={shopPhotoSources(state.file, pick.product)} />{t(label)}</li>
                    : <li key={i} className="rounded-[0.375rem] bg-fill px-3 py-1.5 text-[0.9375rem] font-medium">{t(label)}</li>;
                })}
              </ul>
              <Button className="mt-4" onClick={() => { const placed = addMissing(suggestion, state.file, settings.shoppingLists, listId); const { text, values } = addedNote(placed, (id) => (id ? lists.find((l) => l.id === id)?.name ?? t("Shopping list") : t("Shopping list"))); setSuggestNote(t(text, values)); }}>
                <PlusIcon className="h-5 w-5" />{suggestion.missing.length === 1 ? t("Add it to my list") : t("Add them to my list")}
              </Button>
              <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-foreground empty:mt-0">{suggestNote}</p>
            </section>
          )}
          {!selecting && (
            <>
              {/* and a way to another shop: the page that asks "Which shop?" (not on a list for one shop) */}
              {!current && <LinkButton href="/app/groceries" variant="secondary" full className="mt-8 min-h-12"><BasketIcon className="h-5 w-5" />{[...groups.keys()].some((r) => r !== CUSTOM_RETAILER) ? t("Add from another shop") : t("Add products from a shop")}</LinkButton>}
              {/* the ticked things off the list, as the main button once something is ticked (usability test 2026-11-19: it was a quiet button at the very bottom) */}
              {ticked > 0 && <Button full className={`${current ? "mt-8" : "mt-3"} min-h-14 text-lg`} onClick={removeTicked}><TrashIcon className="h-5 w-5" />{t("Remove ticked ({n})", { n: ticked })}</Button>}
              {/* nothing to send once everything is ticked off: Share and Copy are switched off, with the reason once above them */}
              {nothingToShare && <p className="mt-4 flex items-start gap-1.5 px-1 text-[0.9375rem] font-semibold leading-snug">{t("All ticked off: nothing to share.")}</p>}
              <div className={`${ticked > 0 || nothingToShare ? "mt-3" : current ? "mt-8" : "mt-3"} grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2.5`}>
                <Button variant="secondary" className="min-h-12" disabled={nothingToShare} onClick={share}><ShareIcon className="h-5 w-5" />{t("Share list")}</Button>
                <Button variant="secondary" className="min-h-12" disabled={nothingToShare} onClick={copy}><CopyIcon className="h-5 w-5" />{t("Copy")}</Button>
                {/* to a friend who has the app (Community, founder 2026-10-16): lands in their Shared with you; needs an account, the rest of this page does not */}
                <SendToFriend list={list} onSent={setNote} />
              </div>
              <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("Anyone with the link can see your list.")}</p>
              {/* a list somebody sent: opened here, with the other ways a list travels (it sat above the list and pushed it below the fold) */}
              <div className="mt-3">{friendButton}</div>
              {/* destructive, last and apart (Joan nearly hit Clear list): white with a red edge and red words; Undo in the toast */}
              <Button variant="danger" full className="mt-6 min-h-12" onClick={() => { withUndo(tk("List cleared."), undefined, () => shoppingStore.update((l) => l.filter((x) => listOf(x) !== listId))); setNote(null); }}><TrashIcon aria-hidden className="h-5 w-5" />{t("Clear list")}</Button>
            </>
          )}
        </>
      )}

      {/* a quiet way to delete a list of the person's own, at the foot (asked first: it says how many items go with it) */}
      {/* not while selecting: nothing else acts on the list then (the 30-person meeting, 21 November 2026, Leo) */}
      {hydrated && current && !selecting && (
        <div className="mt-8 flex justify-center">
          <Button variant="danger" className="min-h-12" onClick={() => setDeleting(true)}><TrashIcon className="h-5 w-5" />{t("Delete this list")}</Button>
        </div>
      )}

      {/* Outside the empty-list branch (Clear list empties it), and at the top, clear of the rows' − and + and the tab bar, like Home's "Added" toast */}
      {/* the focus goes to Undo as the toast appears, so the keyboard and VoiceOver don't drop to the top when the row they were on goes (the 30-person meeting,
          21 November 2026, Sam), as Today's Remove does */}
      {undo && <Toast key={undo.n} focusUndo onClose={() => setUndo(null)} onUndo={undoRemove}>{t(undo.key, undo.values)}</Toast>}

      <Sheet open={opening} onClose={() => setOpening(false)} title={t("Open a shared list")}>
        <form onSubmit={openPasted} className="space-y-4 pb-2 pt-1">
          <label className="block">
            <span className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{t("The link or code")}</span>
            <input value={pasted} onChange={(e) => { setPasted(e.target.value); setPastedProblem(null); }} placeholder={t("Paste it here")} enterKeyHint="go" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={pastedProblem ? true : undefined} className={PILL_INPUT} />
          </label>
          {pastedProblem && <p role="alert" className="flex items-start gap-1.5 text-[0.9375rem] font-semibold leading-snug text-danger"><AlertCircleIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" /><span className="min-w-0">{pastedProblem}</span></p>}
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
            {/* Keep it first (secondary, on the left), then the red Delete on the right; stacked when the text is large */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2.5">
              <Button variant="secondary" full className="min-h-12 text-base" onClick={() => setDeleting(false)}>{t("Keep it")}</Button>
              <Button variant="dangerFilled" full className="min-h-12 text-base" onClick={deleteList}><TrashIcon className="h-5 w-5" />{t("Delete the list")}</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/**
 * A chip's words: the list's name, and how many things it still has to get, drawn "Sainsbury's · 2" and heard "Sainsbury's, 2 things to pick up" (the 30-person
 * meeting, 21 November 2026, Leo: VoiceOver read the dot and a bare number), as the Shopping list pill at the top says it.
 */
function ChipLabel({ name, n }: { name: string; n: number }) {
  const t = useT();
  return (
    <span className="min-w-0 [overflow-wrap:anywhere]">
      {name}
      {n > 0 && <><span aria-hidden>{` · ${n}`}</span><span className="sr-only">, {n === 1 ? t("1 thing to pick up") : t("{n} things to pick up", { n })}</span></>}
    </span>
  );
}

/** A list's chip at the top: big (48 px), wrapping its words at large text; the one shown is lime with the 2 px dark green edge and a tick, the others white with the edge. */
function listChip(on: boolean): string {
  return `inline-flex min-h-12 max-w-full items-center gap-2 rounded-full border-[1.5px] ps-2.5 pe-4 text-[0.9375rem] leading-snug transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card font-semibold text-foreground hover:bg-background"}`;
}
