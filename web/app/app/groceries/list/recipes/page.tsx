"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { isListId, itemsOnList, knownLists, MAIN_LIST, retailerName, type ShoppingList } from "@/lib/mm/groceries";
import { shopPhotoSources } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { InfoLine } from "../../../_components/Note";
import { PageHeader } from "../../../_components/PageHeader";
import { CheckIcon, ChevronRightIcon, PlusIcon, PotIcon } from "../../../_components/icons";
import { Button, EmptyState, ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { useBack } from "../../../_lib/backNav";
import { useHydrated, useSettings, useStore } from "../../../_lib/hooks";
import { useT } from "../../../_lib/i18n";
import { addedNote, addMissing, fileForProduct, useListRecipes, type ListMatch } from "../../../_lib/listRecipes";
import { Rich } from "../../../_lib/Rich";
import { CARD, LABEL } from "../../PageBits";
import { ProductMini } from "../../ProductMini";
import { listHref } from "../../ListChoice";
import { RecipeThumb } from "../../../recipes/RecipeThumb";

// "What can I cook with this?" (founder 2026-10-10): recipes that use something on the shopping list, the ones needing least else first.
// Each says what the list already covers and what is still to buy, with one tap to add the rest (the recipe's own picks, each at its own shop: the recipes come
// from every one of the person's recipe shops, like the Recipes page).
// Looks follow Home (founder 2026-10-15): white cards with 20 px corners, a thin lime bar for how much of the recipe the list covers, the
// ingredients already on the list as lime chips with a tick (like a ticked item on the list) and the rest as outlined chips.
// Opened from one of the person's own lists (?l=), the recipes come from that list's shop first, and "Add the other n" puts the products on that list
// (_lib/listRecipes.ts targetList: the list looked at, else the shop's own list, else the main list), the note naming the real list with "See list".

const PAGE = 12;

function MatchCard({ m, lists, viewing }: { m: ListMatch; lists: readonly ShoppingList[]; viewing: string | undefined }) {
  const t = useT();
  const settings = useSettings();
  const [added, setAdded] = useState<{ text: string; list: string | null } | null>(null);
  const total = m.recipe.ingredients.length;
  const label = (i: number) => t(m.resolved.picks[i]?.spec.label ?? m.recipe.ingredients[i]!.label);
  const file = m.files[0]!;
  const add = () => {
    const placed = addMissing(m, file, settings.shoppingLists, viewing);
    const { text, values, list } = addedNote(placed, (id) => (id ? lists.find((l) => l.id === id)?.name ?? t("Shopping list") : t("Shopping list")));
    setAdded({ text: t(text, values), list });
  };
  return (
    <li className={`${CARD} p-5`}>
      {/* the recipe's own picture beside its name (founder 2026-11-17: "Use images please when possible"); where the card is narrow (large text) it sits above the name */}
      <Link href={`/app/recipes/view?id=${m.recipe.id}&r=${file.retailer}`} className="group @container -m-1 block rounded-2xl p-1">
        <span className="flex flex-col gap-3 @[18rem]:flex-row @[18rem]:items-center @[18rem]:gap-3.5">
          <RecipeThumb id={m.recipe.id} name={m.recipe.name} meal={m.recipe.meal} />
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-[800] leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-4">{t(m.recipe.name)}</span>
              <span className="app-numbers mt-0.5 block text-[0.9375rem] font-semibold text-foreground">{t("You have {have} of {total} ingredients", { have: m.have.length, total })}</span>
            </span>
            <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-ink" />
          </span>
        </span>
      </Link>
      <div aria-hidden className="mt-4 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-bar" style={{ width: `${(m.have.length / total) * 100}%` }} /></div>
      <p className="sr-only">{t("On your list:")} {m.have.map(label).join(", ")}</p>
      <ul aria-hidden className="mt-4 flex flex-wrap gap-2">
        {m.have.map((i) => (<li key={i} className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-on-sun bg-sun py-1.5 pe-3.5 ps-2.5 text-[0.9375rem] font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]"><CheckIcon className="h-4 w-4" strokeWidth={3} />{label(i)}</li>))}
      </ul>
      {m.missing.length > 0 ? (
        <>
          <p className={`mt-5 ${LABEL}`}>{t("Still to buy")}</p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {/* each with the photo of the product "Add the other n" puts on the list (the recipe's own pick at the shop); the words stay the label */}
            {m.missing.map((i) => {
              const pick = m.resolved.picks[i];
              const own = pick ? fileForProduct(m.files, pick.product) : undefined;
              return pick && own
                ? <li key={i} className="inline-flex items-center gap-2 rounded-[0.375rem] bg-fill py-1 pe-3 ps-1 text-[0.9375rem] font-medium"><ProductMini sources={shopPhotoSources(own, pick.product)} />{label(i)}</li>
                : <li key={i} className="rounded-[0.375rem] bg-fill px-3 py-1.5 text-[0.9375rem] font-medium">{label(i)}</li>;
            })}
          </ul>
          {/* every add is ink */}
          <Button className="mt-5" onClick={add}>
            <PlusIcon className="h-5 w-5" />{m.missing.length === 1 ? t("Add the last one to my list") : t("Add the other {n} to my list", { n: m.missing.length })}
          </Button>
        </>
      ) : (
        <p className="mt-5 text-[0.9375rem] font-semibold leading-snug">{t("Your list has everything this recipe uses.")}</p>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-[0.9375rem] font-semibold text-foreground empty:mt-0">
        {added && <>{added.text}{added.list !== null && <> <Link href={listHref(added.list)} className="font-bold text-accent underline underline-offset-4">{t("See list")}</Link></>}</>}
      </p>
    </li>
  );
}

export default function ListRecipesPage() {
  // ?l= is the list it was opened from (one of the person's own lists); without it, every list
  return (
    <Suspense fallback={<Spinner />}>
      <ListRecipesScreen />
    </Suspense>
  );
}

function ListRecipesScreen() {
  const t = useT();
  const hydrated = useHydrated();
  const all = useStore(shoppingStore);
  // ?l=<id>: one of the person's own lists; ?l=main: the main "Shopping list" alone; nothing: every list together (the Recipes page's card)
  const asked = useSearchParams().get("l");
  const from = asked === MAIN_LIST ? "" : asked && isListId(asked) ? asked : null;
  const list = useMemo(() => (from === null ? all : itemsOnList(all, from)), [all, from]);
  const settings = useSettings();
  const lists = useMemo(() => knownLists(settings.shoppingLists, all), [settings.shoppingLists, all]);
  // the list it was opened from, when it is one of the person's own (its shop's recipes first, and its name in the title)
  const own = from ? lists.find((l) => l.id === from) ?? null : null;
  const { state, matches, usesOther, shop } = useListRecipes(list, own?.shop ?? null);
  const [limit, setLimit] = useState(PAGE);
  const back = listHref(from);
  const listNav = useBack(back); // for the empty-state button: the page before when there is one in the app, else the list in this page's place

  return (
    <div>
      <PageHeader back={{ href: back, label: t("Back to shopping list") }} />
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.08] tracking-[-0.02em] [overflow-wrap:anywhere]">{own ? t("Cook with your {list} list", { list: own.name }) : <Rich text={t("Cook with your {list}")} values={{ list: <span>{t("shopping list")}</span> }} />}</h1>
      {/* no intro: the title and the count below say what this is, and each card what is still to buy (the words pass, 20 November 2026) */}
      {/* a list for a shop that isn't in recipes yet: which shop the recipes use instead */}
      {usesOther && shop && <p className="mt-2 text-[0.9375rem] leading-snug text-foreground">{t("{left} isn't in recipes yet, so these use {shop}.", { left: retailerName(usesOther), shop: retailerName(shop) })}</p>}

      {!hydrated ? null : list.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("Your list is empty.")} body={t("Add a few things and we'll find recipes that use them.")} action={<LinkButton href={listNav.href} onClick={listNav.onClick} replace variant="secondary">{t("Back to shopping list")}</LinkButton>} /></div>
      ) : state === null ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
      ) : state.status === "error" ? (
        <div className="mt-5"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => window.location.reload()} /></div>
      ) : state.status === "loading" || matches === null ? (
        <Spinner label={t("Loading recipes")} />
      ) : matches.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipe uses these yet.")} body={t("Try adding a main ingredient, like chicken, rice or eggs.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} /></div>
      ) : (
        <>
          <p role="status" className="app-numbers mt-7 ps-1 text-[0.9375rem] font-semibold text-muted">{matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}</p>
          <ul className="mt-3 space-y-3.5">
            {matches.slice(0, limit).map((m) => (<MatchCard key={m.recipe.id} m={m} lists={lists} viewing={from ?? undefined} />))}
          </ul>
          {matches.length > limit && <div className="mt-4"><Button full variant="secondary" className="min-h-12 text-[0.9375rem]" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: matches.length - limit })}</Button></div>}
          <InfoLine heading={null} className="mt-6">{t("Matched by product names and chosen for your diet by ingredients: check each pack.")}</InfoLine>
        </>
      )}
    </div>
  );
}
