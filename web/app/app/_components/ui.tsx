"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { useT } from "../_lib/i18n";
import { CloseIcon } from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// The primitives follow Home's language (founder 2026-10-15: "the rest of the app should match that elegance"): white cards with
// 20 px corners on the light grey page, one black pill for the main action, light grey fills for anything sitting on a white card,
// lime only for what is selected or on, and no gradients, tints or coloured shadows. Every role, name and prop is unchanged.
// Text sizes are in rem, never px, so the Large and Extra large text settings (which scale the root font size) reach every control.

// ---- buttons (44 pt minimum tap targets everywhere) ----

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  // The main action is a black pill, like Home's "Open"; the lime is kept for what is selected or highlighted.
  primary: "bg-foreground text-background font-bold active:scale-[0.97] hover:not-disabled:bg-[color-mix(in_srgb,var(--foreground)_86%,white)] disabled:bg-soft-strong disabled:text-muted",
  // Secondary actions are white pills on the page and light grey pills inside a card or a sheet (globals.css and the Sheet do the
  // fill); inside a grey card in a sheet, or an inset list, they are white again so they still show.
  secondary: "glass text-foreground font-semibold active:scale-[0.97] hover:not-disabled:bg-soft-strong disabled:text-muted [.sheet-panel_:is(.glass,.hero-card)_&]:bg-white [.app-surface_.inset-card_&]:bg-white",
  // A quiet text action ("Cancel"): the accent green, with a neutral grey wash on hover rather than a green tint.
  ghost: "text-accent font-semibold hover:not-disabled:bg-soft-strong disabled:text-muted",
  // A destructive action is never the dark pill: a quiet grey one, with the words doing the work.
  danger: "bg-soft-strong text-foreground font-bold active:scale-[0.97] hover:not-disabled:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--soft-strong))] disabled:text-muted",
};
// Unavailable (disabled) is a quiet grey pill with muted words, never a faded one: no opacity, so the words keep AA contrast (muted
// on --soft-strong is 5.1:1), like iOS. `hover:not-disabled:` rather than `enabled:`, which a LinkButton (an <a>) never matches.
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] leading-snug transition duration-150 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Button({ variant = "primary", full, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  return <button type="button" className={cx(buttonBase, variants[variant], full && "w-full", className)} {...rest} />;
}

export function LinkButton({ href, variant = "primary", full, className, children }: { href: string; variant?: Variant; full?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(buttonBase, variants[variant], full && "w-full", className)}>
      {children}
    </Link>
  );
}

// ---- small pieces ----

export function Card({ children, className, hero }: { children: ReactNode; className?: string; hero?: boolean }) {
  return <div className={cx("rounded-[1.25rem]", hero ? "hero-card" : "glass", className)}>{children}</div>;
}

/**
 * A small label in spaced capitals ("LIMITED TIME", a category), like the small labels inside Home's cards: grey with muted text.
 * The accent tone ("NEW") is the one highlight, so it takes the lime with dark text (11.9:1) instead of a green tint.
 */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.1em]", tone === "accent" ? "bg-sun text-on-accent" : "bg-soft-strong text-muted")}>
      {children}
    </span>
  );
}

export function SampleBadge() {
  const t = useT();
  return <Badge>{t("Sample data")}</Badge>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-xl font-[800] tracking-[-0.01em]">
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * "Nothing here yet": a white card with a round grey icon, a heading and one quiet line. A bare icon handed in (a PotIcon, say) is
 * drawn in the same grey circle as an EmptyIcon; Pip (the svg with the class `pip`) is left as he is.
 */
export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="glass rounded-[1.25rem] px-6 py-10 text-center">
      <span
        aria-hidden
        className={cx(
          "mx-auto mb-4 inline-flex items-center justify-center",
          icon
            ? "[&>svg:not(.pip)]:h-16 [&>svg:not(.pip)]:w-16 [&>svg:not(.pip)]:rounded-full [&>svg:not(.pip)]:bg-soft-strong [&>svg:not(.pip)]:p-[1.125rem]"
            : "h-16 w-16 rounded-full bg-soft-strong",
        )}
      >
        {icon ?? <span className="bg-sun h-3.5 w-3.5 rounded-full" />}
      </span>
      <p className="text-xl font-[800] leading-snug tracking-[-0.01em]">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-base leading-snug text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** A big round icon for an empty state ("nothing here yet"): a light grey circle, like Home's round actions. */
export function EmptyIcon({ children }: { children: ReactNode }) {
  return <span className="grid h-16 w-16 place-items-center rounded-full bg-soft-strong text-foreground [&>svg]:h-7 [&>svg]:w-7">{children}</span>;
}

/**
 * A page's loading line. Inside a button (sign-in's "Sending…") it takes the button's own words, size and colour, with no page
 * padding and a smaller ring, so the pill keeps its height; a label that already ends in an ellipsis doesn't get a second one.
 */
export function Spinner({ label }: { label?: string }) {
  const t = useT();
  const text = label ?? t("Loading");
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-10 text-[0.9375rem] font-medium text-muted [button_&]:gap-2 [button_&]:py-0 [button_&]:[font:inherit] [button_&]:text-inherit">
      <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-[rgba(17,24,20,0.1)] border-t-[var(--bar)] [button_&]:h-[1.125rem] [button_&]:w-[1.125rem] [button_&]:border-2 [button_&]:border-current/25 [button_&]:border-t-current" aria-hidden />
      {/(…|\.\.\.)$/.test(text) ? text : `${text}…`}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="glass rounded-[1.25rem] px-5 py-7 text-center">
      <p className="text-base leading-snug">{message}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>{t("Try again")}</Button>
        </div>
      )}
    </div>
  );
}

/**
 * An outlined pill that fills dark when selected (the founder's reference pictures: a fine grey outline, medium-weight words, the
 * chosen one solid); `segment` is the quiet, borderless kind. The weight stays the same when selected so a row never shifts.
 */
export function Chip({ selected, children, onClick, className, segment, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; segment?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 max-w-full shrink-0 items-center rounded-full border px-4 py-2 text-start text-base font-medium leading-snug transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected
          ? "border-transparent bg-foreground text-background"
          : segment
            ? "border-transparent text-muted hover:text-foreground"
            : "border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] bg-transparent text-foreground hover:bg-soft-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Arrow-key navigation for a radio group (WAI-ARIA): moves the selection and focus to the neighbouring option. */
export function radioKeyNav(e: React.KeyboardEvent<HTMLElement>, index: number, count: number, select: (i: number) => void) {
  const delta = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
  if (!delta) return;
  e.preventDefault();
  const next = (index + delta + count) % count;
  select(next);
  (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
}

// ---- segmented control ----

/** How a segmented control lays out its options: the calmest arrangement in which every label stays on one line. */
type SegmentFit = "equal" | "content" | "grid" | "stack";

let labelCanvas: CanvasRenderingContext2D | null | undefined;
function labelWidth(text: string, font: string): number {
  if (labelCanvas === undefined) labelCanvas = document.createElement("canvas").getContext("2d");
  if (!labelCanvas) return NaN;
  labelCanvas.font = font;
  return labelCanvas.measureText(text).width;
}

/**
 * Measures the labels in the options' own font (so it holds in every language, script and text size) and picks: one row of equal
 * segments; else one row sized to the words; else (an even count of four or more) a 2 x 2 block; else a list, one option per line.
 */
function segmentFit(track: HTMLElement, labels: readonly string[]): SegmentFit {
  const option = track.firstElementChild as HTMLElement | null;
  if (!option || labels.length === 0) return "equal";
  const o = getComputedStyle(option);
  const s = getComputedStyle(track);
  const font = `${o.fontStyle} ${o.fontWeight} ${o.fontSize} ${o.fontFamily}`;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const pad = 1.5 * rem + 6; // the options' px-3 on both sides, and a little air so a word never touches its pill's edge
  const tight = 1 * rem + 4; // the one-row-by-words layout draws px-2 (see the options' classes), plus 2 px of air on each side
  const raw = labels.map((l) => labelWidth(l, font));
  if (raw.some((w) => !Number.isFinite(w))) return "equal";
  const widths = raw.map((w) => w + pad);
  const gap = parseFloat(s.columnGap) || 0;
  const room = track.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0);
  const n = widths.length;
  const widest = Math.max(...widths);
  const gaps = gap * (n - 1);
  if (widest * n + gaps <= room) return "equal";
  if (raw.reduce((a, w) => a + w + tight, 0) + gaps <= room) return "content";
  if (n >= 4 && n % 2 === 0 && widest * 2 + gap <= room) return "grid";
  return "stack";
}

/**
 * A segmented control, like the founder's recipe picture's Ingredients / Directions switch: a white track on the page (light grey
 * inside a card) with the chosen option as a black pill, like Home's "Open". The options share one round row while their words fit
 * on one line; when they don't (a long translation, Extra large text, a narrow card) they become a 2 x 2 block or a short list rather
 * than breaking words over two lines or bulging the pill. The layout is measured before the first paint and set as `data-fit` on the
 * track (outside React's render, so nothing re-renders); before that, and without script, it is the plain one-row version.
 */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const labels = options.map((o) => o.label).join("\u0000");
  useLayoutEffect(() => {
    const track = ref.current;
    if (!track) return;
    const list = labels.split("\u0000");
    const fit = () => {
      track.dataset.fit = segmentFit(track, list);
    };
    fit();
    let width = track.clientWidth;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (track.clientWidth === width) return;
      width = track.clientWidth;
      fit();
    });
    resize?.observe(track);
    let live = true;
    document.fonts?.ready.then(() => { if (live) fit(); });
    return () => {
      live = false;
      resize?.disconnect();
    };
    // `value` too: choosing a text size here changes the root font size, so the words are measured again at the new size.
  }, [labels, value]);

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className="glass group/seg flex gap-1 rounded-full p-1 [.sheet-panel_:is(.glass,.hero-card)_&]:bg-white data-[fit=grid]:grid data-[fit=grid]:grid-cols-2 data-[fit=grid]:rounded-[1.25rem] data-[fit=stack]:flex-col data-[fit=stack]:rounded-[1.25rem]"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => radioKeyNav(e, i, options.length, (n) => onChange(options[n]!.value))}
          className={cx(
            "min-h-11 min-w-0 flex-[1_1_0%] rounded-full px-3 py-2 text-center text-[0.9375rem] font-semibold leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            "group-data-[fit=content]/seg:flex-auto group-data-[fit=content]/seg:px-2 group-data-[fit=grid]/seg:rounded-2xl group-data-[fit=stack]/seg:flex-none group-data-[fit=stack]/seg:rounded-2xl",
            // In one row the unchosen words are grey, like iOS; stacked or in a block they are in ink so they read as live choices.
            o.value === value ? "bg-foreground text-background" : "text-muted hover:bg-soft-strong hover:text-foreground group-data-[fit=stack]/seg:text-foreground group-data-[fit=grid]/seg:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A switch: a grey track with a white knob; on, the track is lime and the knob dark, like the open tab in the tab bar. */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug">{label}</span>
        {description && <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-8 w-14 shrink-0 rounded-full bg-soft-strong transition-colors peer-checked:[background:var(--sun)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(17,24,20,0.25)] after:transition-[transform,background-color] peer-checked:after:translate-x-6 peer-checked:after:bg-foreground peer-checked:after:shadow-none" />
    </label>
  );
}

/** A labelled field: the label above in the body's ink, the hint below in muted running text (not small print). */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-[0.9375rem] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

/**
 * A surface's colour alternates with depth so a thing is always seen against what it sits on: a white input with a quiet border on
 * the grey page; the light grey fill on a white card or sheet; white again inside a grey card in a sheet or an inset list.
 */
const ON_WHITE = "[:is(.glass,.hero-card,.sheet-panel)_&]:border-transparent [:is(.glass,.hero-card,.sheet-panel)_&]:bg-[var(--fill)]";
const ON_FILL = "[.sheet-panel_:is(.glass,.hero-card)_&]:bg-white [.app-surface_.inset-card_&]:border-transparent [.app-surface_.inset-card_&]:bg-white";

/**
 * A <select> drawn with inputClass gets our own chevron (the ChevronRightIcon turned down, in muted grey) 16 px from its end, in line
 * with the text inset, instead of the browser's arrow jammed against the edge. A select that already has its own chevron icon right
 * after it (Submit.tsx's SelectField) is left alone, so it never shows two.
 */
const SELECT = "[&:is(select):not(:has(+svg))]:appearance-none [&:is(select):not(:has(+svg))]:pe-11 [&:is(select):not(:has(+svg))]:bg-no-repeat [&:is(select):not(:has(+svg))]:bg-[length:1.25rem] [&:is(select):not(:has(+svg))]:bg-[position:right_1rem_center] rtl:[&:is(select):not(:has(+svg))]:bg-[position:left_1rem_center] [&:is(select):not(:has(+svg))]:bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%235f6361%27%20stroke-width=%271.8%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E)]";

export const inputClass = `min-h-12 w-full rounded-2xl border border-line bg-soft px-4 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${ON_WHITE} ${ON_FILL} ${SELECT}`;

// ---- bottom sheet on the native <dialog> element: focus trap, Escape and backdrop come for free ----

// Inside the white sheet every "soft" surface (an input, a card, a tile, a secondary button, a picker's unselected buttons) takes the
// light grey fill instead of white, flat with no shadow, the same way globals.css treats things sitting on a white card.
const sheetSurface = { "--soft": "var(--fill)", "--tile": "var(--fill)", "--card-shadow": "none" } as CSSProperties;

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // A dialog inside this one (the camera, a second sheet) reports its own close up through React's tree: only this dialog's own counts.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-visible rounded-t-[1.75rem] bg-transparent p-0 text-foreground backdrop:bg-[rgba(17,24,20,0.42)] backdrop:backdrop-blur-[3px]"
    >
      {open && (
        <div
          style={sheetSurface}
          className="sheet-panel sheet-in max-h-[92dvh] scroll-pt-24 overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-white px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-20px_rgba(17,24,20,0.35)]"
        >
          {/* The grab handle and the title stay at the top while a long sheet scrolls, so Close is always in reach. */}
          <div className="sticky top-0 z-10 -mx-5 bg-white px-5 pb-4 pt-2.5">
            <div aria-hidden className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-soft-strong" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 flex-1 text-xl font-[800] leading-tight tracking-[-0.01em]">{title}</h2>
              <button type="button" onClick={onClose} aria-label={t("Close")} className="group -me-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"><CloseIcon className="h-[1.125rem] w-[1.125rem]" /></span>
              </button>
            </div>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
