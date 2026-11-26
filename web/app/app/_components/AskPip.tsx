"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { aiAllowed, aiConsentStore, withAiAllowed } from "@/lib/mm/aiConsent";
import { ASK_PIP_ENABLED, ASK_PIP_STARTERS, MAX_ASK_CHARS, type ChatMessage, type PipCard, type PipEvent } from "@/lib/mm/askPip";
import { formatInt } from "@/lib/mm/format";
import { formatPrice } from "@/lib/mm/groceries";
import { itemHref } from "@/lib/mm/routes";
import { pipChatStore, savedRecipesStore, toggleSavedRecipe } from "@/lib/mm/stores";
import { askPip, clearPipChat, pipBusyStore, pipLeftStore, pipOpenStore, pipPlanHandoffStore } from "../_lib/askPip";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { RecipeThumb } from "../recipes/RecipeThumb";
import { AiConsentSheet, OfflineBanner, useOnline } from "./AiConsentSheet";
import { ArrowUpIcon, CalendarIcon, CloseIcon, HeartIcon, WarningIcon } from "./icons";
import { Pip } from "./Mascot";
import { useGate } from "./Paywall";

// Ask Pip (lib/mm/askPip.ts has the rules; founder 2026-11-26): the Pip button in the top bar of Home, My recipes, Groceries and Eat out, and the chat it opens.
// The chat is a tall sheet: the conversation (kept on this phone only), Pip's typing line ("Pip is reading the menu at Nando's…"), the first questions to tap,
// and his cards: recipes with Save, restaurant dishes with what clashes with the person's diet, supermarket products, and View meal plan. Every figure on a
// card is the app's own (the server builds the cards from the menus, labels and recipe code; CLAUDE.md rule 1). Premium (the usual upgrade sheet otherwise),
// and Pip's one AI permission before the first question is sent.

const BUBBLE = "max-w-[85%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[1.0625rem] leading-snug";
const CARD = "mt-2 overflow-hidden rounded-2xl border border-line bg-card";

/** The Pip button's face: Pip in the 1.5 px edge circle every top-bar control has. Also drawn in the welcome screens' "Tap Pip to ask anything" picture
 *  (app/app/welcome/AskPipStep.tsx), so the two always look the same. */
export function AskPipFace() {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-edge bg-card transition-colors group-hover:bg-background">
      <Pip mood="wave" size={34} className="-mb-1.5" />
    </span>
  );
}

/** The Pip button: Pip's face in the 1.5 px edge circle every top-bar control has, in a 44 pt target, named "Ask Pip". Hidden while the chat is switched off. */
export function AskPipButton() {
  const t = useT();
  const { gate } = useGate();
  if (!ASK_PIP_ENABLED) return null;
  return (
    <>
      <button type="button" onClick={() => gate("askPip", () => pipOpenStore.set(true))} aria-label={t("Ask Pip")} aria-haspopup="dialog" className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <AskPipFace />
      </button>
      <AskPipSheet />
    </>
  );
}

function doingWords(t: ReturnType<typeof useT>, d: Extract<PipEvent, { t: "doing" }> | null): string {
  if (!d) return t("Pip is thinking…");
  switch (d.what) {
    case "menu": return d.name ? t("Pip is reading the menu at {name}…", { name: d.name }) : t("Pip is reading the menu…");
    case "recipes": return t("Pip is looking through our recipes…");
    case "products": return t("Pip is looking through the supermarket…");
    case "day": return t("Pip is checking your day…");
    case "plan": return t("Pip is checking your meal plan…");
    case "saved": return t("Pip is checking your saved recipes…");
    case "places": return t("Pip is looking for restaurants…");
  }
}

/** The chat sheet (one, opened by any tab's Pip button). A native dialog, so focus stays inside and Escape closes it. */
function AskPipSheet() {
  const t = useT();
  const open = useStore(pipOpenStore);
  const chat = useStore(pipChatStore);
  const busy = useStore(pipBusyStore);
  const left = useStore(pipLeftStore);
  const online = useOnline();
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const consentAnswered = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // the newest message in view as it grows
  const last = chat[chat.length - 1];
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, last?.text, last?.cards.length, busy, open]);

  const close = () => pipOpenStore.set(false);
  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    // Pip's one permission (lib/mm/aiConsent.ts) before anything is sent
    if (!aiAllowed(aiConsentStore.get(), "askPip")) { consentAnswered.current = false; setAsking(q); return; }
    setDraft("");
    void askPip(q);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(draft); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); }
  };

  return (
    <dialog
      ref={ref}
      aria-label={t("Ask Pip")}
      onClose={(e) => { if (e.target === e.currentTarget) close(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto h-[92dvh] max-h-[92dvh] w-full max-w-md overflow-visible rounded-t-[1.75rem] bg-transparent p-0 text-foreground backdrop:bg-scrim backdrop:backdrop-blur-[3px]"
    >
      {open && (
        <div className="sheet-panel sheet-in flex h-full flex-col overflow-hidden rounded-t-[1.75rem] bg-background shadow-[var(--shadow-lift)]">
          {/* the head: Pip, the name and what he is, Start again, Close */}
          <div className="flex items-center gap-2.5 border-b border-line bg-card px-4 pb-3 pt-3.5">
            <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sun"><Pip mood="wave" size={42} className="-mb-2" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-[800] leading-tight">{t("Ask Pip")}</h2>
              <p className="truncate text-[0.875rem] leading-snug text-muted">{t("Your food guide and nutrition coach")}</p>
            </div>
            {chat.length > 0 && (
              <button type="button" onClick={clearPipChat} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-[0.9375rem] font-semibold text-foreground underline underline-offset-4 transition active:scale-95">
                {t("Start again")}
              </button>
            )}
            <button type="button" onClick={close} aria-label={t("Close")} className="group -me-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition-colors group-hover:bg-background"><CloseIcon className="h-[1.125rem] w-[1.125rem]" /></span>
            </button>
          </div>

          {/* the conversation */}
          <div ref={list} role="log" aria-label={t("Your chat with Pip")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
            {!online && <OfflineBanner className="mb-3" />}
            {chat.length === 0 ? (
              <Welcome onAsk={send} />
            ) : (
              <ol className="space-y-4">
                {chat.map((m) => <Message key={m.id} m={m} pending={!!busy && m === last} onNavigate={close} />)}
              </ol>
            )}
            {busy && (
              <p role="status" className="mt-3 flex items-center gap-2 ps-11 text-[0.9375rem] font-semibold text-muted">
                <span aria-hidden className="inline-flex gap-1">
                  {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-ink motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />)}
                </span>
                {doingWords(t, busy.doing)}
              </p>
            )}
          </div>

          {/* the box to type in */}
          <form onSubmit={submit} className="border-t border-line bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
            {left !== null && left <= 5 && (
              <p className="mb-1.5 px-1 text-[0.875rem] text-muted">{left === 1 ? t("1 question left today") : t("{n} questions left today", { n: left })}</p>
            )}
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t("Your question for Pip")}</span>
                <textarea
                  ref={box}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  maxLength={MAX_ASK_CHARS}
                  enterKeyHint="send"
                  placeholder={t("Ask Pip anything about food")}
                  className="block max-h-32 min-h-12 w-full resize-none rounded-3xl border-[1.5px] border-edge bg-card px-4 py-3 text-[1.0625rem] leading-snug [field-sizing:content] placeholder:text-muted focus:outline-2 focus:outline-accent"
                />
              </label>
              <button type="submit" disabled={!draft.trim() || !!busy || !online} aria-label={t("Send")} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink transition active:scale-95 disabled:bg-line disabled:text-muted">
                <ArrowUpIcon className="h-5 w-5" strokeWidth={2.4} />
              </button>
            </div>
          </form>
        </div>
      )}
      <AiConsentSheet
        open={asking !== null}
        feature="askPip"
        onAllow={() => {
          if (consentAnswered.current) return;
          consentAnswered.current = true;
          aiConsentStore.update((l) => withAiAllowed(l, "askPip"));
          const q = asking;
          setAsking(null);
          if (q) { setDraft(""); void askPip(q); }
        }}
        onClose={() => { consentAnswered.current = true; setAsking(null); }}
      />
    </dialog>
  );
}

/** An empty chat: Pip says hello, the first questions to tap, and what he isn't. */
function Welcome({ onAsk }: { onAsk: (q: string) => void }) {
  const t = useT();
  return (
    <div>
      <div className="flex items-end gap-2">
        <Pip mood="wave" size={56} />
        <p className={`${BUBBLE} mb-2 rounded-es-md bg-card`}>{t("Hi, I'm Pip. Ask me anything about food: eating out, cooking, shopping or your day.")}</p>
      </div>
      <p className="mt-5 text-[0.9375rem] font-bold">{t("Try asking")}</p>
      <ul className="mt-2 grid gap-2">
        {ASK_PIP_STARTERS.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => onAsk(t(q))} className="flex min-h-12 w-full items-center rounded-2xl border-[1.5px] border-edge bg-card px-4 py-2.5 text-start text-[1rem] font-semibold leading-snug transition active:scale-[0.98]">
              {t(q)}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[0.875rem] leading-snug text-muted">{t("Pip is a food guide, not a doctor or dietitian. For medical questions, ask your GP.")}</p>
    </div>
  );
}

function Message({ m, pending, onNavigate }: { m: ChatMessage; pending: boolean; onNavigate: () => void }) {
  if (m.role === "user") {
    return <li className="flex justify-end"><p className={`${BUBBLE} rounded-ee-md bg-ink text-on-ink`}>{m.text}</p></li>;
  }
  if (!m.text && !m.cards.length) return null;
  // Pip beside his own words only; the cards, with their figures, go across under them (Pip never stands beside a figure: tests/mascot.test.ts)
  return (
    <li aria-busy={pending || undefined}>
      {m.text && (
        <div className="flex items-start gap-2">
          <span aria-hidden className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sun"><Pip mood={m.failed ? "think" : "listen"} size={34} className="-mb-1.5" /></span>
          <p className={`${BUBBLE} rounded-es-md bg-card ${m.failed ? "text-muted" : ""}`}>{m.text.trim()}</p>
        </div>
      )}
      {m.cards.map((c, i) => <PipCardView key={i} card={c} onNavigate={onNavigate} />)}
    </li>
  );
}

// ----------------------------------------------------------------------------------------------------------------------- the cards

function PipCardView({ card, onNavigate }: { card: PipCard; onNavigate: () => void }) {
  switch (card.kind) {
    case "recipes": return <RecipesCard card={card} onNavigate={onNavigate} />;
    case "dishes": return <DishesCard card={card} onNavigate={onNavigate} />;
    case "products": return <ProductsCard card={card} onNavigate={onNavigate} />;
    case "plan": return <PlanCard card={card} onNavigate={onNavigate} />;
  }
}

const grams = (n: number) => formatInt(n);

function Clash({ lines }: { lines: string[] }) {
  const t = useT();
  if (!lines.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {lines.map((l) => (
        <li key={l} className="flex items-start gap-1.5 text-[0.875rem] font-semibold leading-snug text-foreground">
          <WarningIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
          <span>{t(l)}</span>
        </li>
      ))}
    </ul>
  );
}

function RecipesCard({ card, onNavigate }: { card: Extract<PipCard, { kind: "recipes" }>; onNavigate: () => void }) {
  const t = useT();
  const saved = useStore(savedRecipesStore);
  return (
    <div className={CARD}>
      <ul className="divide-y divide-line">
        {card.items.map((r) => {
          const isSaved = saved.some((s) => s.id === r.id);
          return (
            <li key={r.id} className="flex items-center gap-3 p-3">
              <Link href={`/app/recipes/view?id=${encodeURIComponent(r.id)}&r=${encodeURIComponent(card.shop.id)}`} onClick={onNavigate} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                <RecipeThumb id={r.id} name={r.name} size="md" />
                <span className="min-w-0">
                  <span className="block font-bold leading-snug">{r.name}</span>
                  <span className="app-numbers block text-[0.875rem] leading-snug text-muted">
                    {t("{kcal} kcal · {protein} g protein", { kcal: formatInt(r.kcal), protein: grams(r.protein) })}
                    {r.cost !== null ? ` · ${t("{price} a serving", { price: formatPrice(r.cost) })}` : ""}
                  </span>
                </span>
              </Link>
              <button type="button" onClick={() => toggleSavedRecipe(r.id)} aria-pressed={isSaved} aria-label={isSaved ? t("Saved: {name}", { name: r.name }) : t("Save {name}", { name: r.name })} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-bold transition active:scale-95 ${isSaved ? "bg-ink text-on-ink" : "border-[1.5px] border-edge bg-card text-foreground"}`}>
                <HeartIcon aria-hidden filled={isSaved} className="h-[18px] w-[18px]" />
                {isSaved ? t("Saved") : t("Save")}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-3 py-2 text-[0.8125rem] leading-snug text-muted">{t("One serving as written, with {shop} products.", { shop: card.shop.name })}</p>
    </div>
  );
}

function DishesCard({ card, onNavigate }: { card: Extract<PipCard, { kind: "dishes" }>; onNavigate: () => void }) {
  const t = useT();
  const figures = (n: { kcal: number; protein: number | null }) =>
    n.protein === null ? t("{kcal} kcal · protein not published", { kcal: formatInt(n.kcal) }) : t("{kcal} kcal · {protein} g protein", { kcal: formatInt(n.kcal), protein: grams(n.protein) });
  return (
    <div className={CARD}>
      <p className="px-3 pt-2.5 text-[0.9375rem] font-bold">{card.chain.name}</p>
      <ul className="divide-y divide-line">
        {card.items.map((d) => (
          <li key={d.id} className="p-3">
            <Link href={itemHref(card.chain.id, d.id)} onClick={onNavigate} className="flex min-h-11 flex-col justify-center">
              <span className="font-bold leading-snug">{d.name}</span>
              <span className="app-numbers text-[0.875rem] leading-snug text-muted">{figures(d)}</span>
            </Link>
            <Clash lines={d.clash} />
          </li>
        ))}
      </ul>
      {card.total && (
        <p className="app-numbers border-t border-line bg-fill px-3 py-2 text-[0.9375rem] font-bold">{t("Together: {figures}", { figures: figures(card.total) })}</p>
      )}
      <p className="border-t border-line px-3 py-2 text-[0.8125rem] leading-snug text-muted">{t("As {chain} publishes it. Not affiliated with {chain}.", { chain: card.chain.name })}</p>
    </div>
  );
}

function ProductsCard({ card, onNavigate }: { card: Extract<PipCard, { kind: "products" }>; onNavigate: () => void }) {
  const t = useT();
  return (
    <div className={CARD}>
      <p className="px-3 pt-2.5 text-[0.9375rem] font-bold">{card.shop.name}</p>
      <ul className="divide-y divide-line">
        {card.items.map((p) => (
          <li key={p.id} className="p-3">
            <Link href={`/app/groceries/shop/item?r=${encodeURIComponent(card.shop.id)}&id=${encodeURIComponent(p.id)}`} onClick={onNavigate} className="flex min-h-11 flex-col justify-center">
              <span className="font-bold leading-snug">{p.name}</span>
              <span className="app-numbers text-[0.875rem] leading-snug text-muted">
                {p.per === "ml" ? t("Per 100 ml: {kcal} kcal · {protein} g protein", { kcal: formatInt(p.kcal), protein: grams(p.protein) }) : t("Per 100 g: {kcal} kcal · {protein} g protein", { kcal: formatInt(p.kcal), protein: grams(p.protein) })}
                {` · ${p.price !== null ? formatPrice(p.price) : t("Price in store")}`}
              </span>
            </Link>
            <Clash lines={p.clash} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanCard({ card, onNavigate }: { card: Extract<PipCard, { kind: "plan" }>; onNavigate: () => void }) {
  const t = useT();
  const router = useRouter();
  return (
    <div className={`${CARD} p-3`}>
      <p className="flex items-center gap-2 font-bold"><CalendarIcon aria-hidden className="h-5 w-5 text-ink" />{t("Your meal plan with Pip")}</p>
      <button
        type="button"
        onClick={() => {
          pipPlanHandoffStore.set(card.handoff);
          onNavigate();
          router.push("/app/plan");
        }}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-[1.0625rem] font-bold text-on-ink transition active:scale-[0.98]"
      >
        {t("View meal plan")}
      </button>
    </div>
  );
}
