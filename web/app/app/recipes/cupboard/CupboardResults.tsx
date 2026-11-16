"use client";

import Link from "next/link";
import { useState } from "react";
import { countable, recipeHref, toBuy, type CupboardItem, type CupboardMatch } from "@/lib/mm/cupboard";
import type { ShopFile, ShopProduct } from "@/lib/mm/shopProducts";
import { CheckIcon, ChevronRightIcon, PlusIcon } from "../../_components/icons";
import { Button, EmptyState, ErrorBox, LinkButton, Spinner } from "../../_components/ui";
import { addCupboardMissing, useCupboardRecipes } from "../../_lib/cupboardRecipes";
import { useT } from "../../_lib/i18n";
import { CARD, HEADING, LABEL, NOTE } from "../../groceries/PageBits";
import { PANTRY } from "@/lib/mm/pantry";

// The recipes the cupboard can make, the best cover first: for each, how many people it feeds, what you have, what is still to buy (one tap puts it on the
// shopping list), the swaps where you have something instead, and the store-cupboard things to check. Opening a recipe starts it at those people and swaps.

const PAGE = 6;

function MatchCard({ m, best, shop, file, products }: { m: CupboardMatch; best: boolean; shop: string; file: ShopFile; products: readonly ShopProduct[] }) {
  const t = useT();
  const [added, setAdded] = useState<string | null>(null);
  const total = countable(m);
  const label = (i: number) => t(m.recipe.ingredients[i]!.label);
  const buy = toBuy(m);
  const checkThese = m.ingredients.filter((x) => x.state === "staple" && !x.ticked).map((x) => label(x.index));
  const href = recipeHref(m, shop);
  return (
    <li className={`${CARD} p-5`}>
      {best && <p className={`mb-2 ${LABEL}`}>{t("Best match")}</p>}
      <Link href={href} className="group -m-1 flex items-center gap-3.5 rounded-2xl p-1">
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-[800] leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-4">{t(m.recipe.name)}</span>
          <span className="app-numbers mt-0.5 block text-sm font-semibold text-accent">
            {t("You have {have} of {total} ingredients", { have: m.have.length, total })} · {t("Serves {n}", { n: m.servings })}
          </span>
        </span>
        <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
      </Link>
      <div aria-hidden className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--ring-track)]"><div className="h-full rounded-full bg-[var(--bar)]" style={{ width: `${total ? (m.have.length / total) * 100 : 0}%` }} /></div>
      {m.have.length > 0 && (
        <>
          <p className="sr-only">{t("In your cupboard:")} {m.have.map(label).join(", ")}</p>
          <ul aria-hidden className="mt-4 flex flex-wrap gap-2">
            {m.have.map((i) => (<li key={i} className="bg-sun inline-flex items-center gap-1.5 rounded-full py-1.5 pe-3.5 ps-2.5 text-sm font-semibold text-on-accent"><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />{label(i)}</li>))}
          </ul>
        </>
      )}
      {m.swaps.map((s) => (
        <p key={s.index} className="mt-3 text-[0.9375rem] font-semibold leading-snug">{t("Instead of {x} you have {y}.", { x: label(s.index), y: t(PANTRY.get(s.sub)?.label ?? s.sub) })}</p>
      ))}
      {buy.length > 0 ? (
        <>
          <p className={`mt-5 ${LABEL}`}>{t("Still to buy")}</p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {buy.map((i) => (
              <li key={i} className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] px-3.5 py-1.5 text-sm font-medium">
                {label(i)}{m.short.includes(i) ? ` ${t("(you have some)")}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-5 text-[0.9375rem] font-semibold leading-snug">{t("Your cupboard has everything this recipe uses.")}</p>
      )}
      {checkThese.length > 0 && <p className="mt-3 text-sm leading-snug text-muted">{t("Store cupboard: {items}. Check you have them.", { items: checkThese.join(", ") })}</p>}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <LinkButton href={href} variant={buy.length > 0 ? "ghost" : "primary"}>{t("See the recipe")}</LinkButton>
        {buy.length > 0 && (
          <Button variant="secondary" onClick={() => { const n = addCupboardMissing(m, products, file); setAdded(n === 1 ? t("Added 1 product to your {shop} list.", { shop: file.name }) : t("Added {n} products to your {shop} list.", { n, shop: file.name })); }}>
            <PlusIcon className="h-5 w-5" />{buy.length === 1 ? t("Add the last one to my list") : t("Add the other {n} to my list", { n: buy.length })}
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-accent empty:mt-0">{added}</p>
    </li>
  );
}

export function CupboardResults({ items, icon }: { items: readonly CupboardItem[]; icon: React.ReactNode }) {
  const t = useT();
  const { shop, state, result } = useCupboardRecipes(items);
  const [limit, setLimit] = useState(PAGE);
  if (items.length === 0) return null;
  const matches = result?.matches ?? null;
  return (
    <section aria-labelledby="results-heading" className="mt-8">
      <h2 id="results-heading" className={HEADING}>{t("Recipes you can make")}</h2>
      {state === null ? (
        <div className="mt-3"><EmptyState icon={icon} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
      ) : state.status === "error" ? (
        <div className="mt-3"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => window.location.reload()} /></div>
      ) : state.status === "loading" || matches === null || !shop ? (
        <Spinner label={t("Loading recipes")} />
      ) : matches.length === 0 ? (
        <div className="mt-3"><EmptyState icon={icon} title={t("No recipe uses these yet.")} body={t("Try adding a main ingredient, like chicken, rice or eggs.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} /></div>
      ) : (
        <>
          <p role="status" className="app-numbers mt-1.5 text-[0.9375rem] font-semibold leading-snug text-muted">{matches.length === 1 ? t("1 recipe uses something in your cupboard") : t("{n} recipes use something in your cupboard", { n: matches.length })}</p>
          <ul className="mt-3 space-y-3.5">
            {matches.slice(0, limit).map((m, i) => (<MatchCard key={m.recipe.id} m={m} best={i === 0} shop={shop} file={(state as { file: ShopFile }).file} products={(state as { products: readonly ShopProduct[] }).products} />))}
          </ul>
          {matches.length > limit && <div className="mt-4"><Button full variant="secondary" className="min-h-12 text-[0.9375rem]" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: matches.length - limit })}</Button></div>}
          {result!.leftOut > 0 && <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{result!.leftOut === 1 ? t("1 recipe is left out for your diet.") : t("{n} recipes are left out for your diet.", { n: result!.leftOut })}</p>}
          <p className={`mt-6 ${NOTE}`}>{t("Recipes are chosen for your diet by their ingredients, and the number of people is worked out from what you told me. Check each pack.")}</p>
        </>
      )}
    </section>
  );
}
