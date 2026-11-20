"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useT } from "../_lib/i18n";
import { AlertCircleIcon, CheckIcon, CloseIcon, InfoIcon, PlusIcon } from "./icons";
import { Note } from "./Note";
import { Switch } from "./Switch";
import "../_lib/inputModality"; // focus rings only after a keyboard is used (no box after a tap)
import "../_lib/statusBar"; // a page-coloured strip behind the clock once the page has scrolled (iPhone)

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// The primitives follow Home's language (founder 2026-10-15: "the rest of the app should match that elegance"): white cards with 20 px corners on the light
// grey page, no gradients, tints or coloured shadows. The colour meeting (19 November 2026, approved by the founder that day; tokens in globals.css) sets
// the meaning of each colour: ink is the one dark fill and means "do this"; every other control you can tap is white with the 1.5 px edge; lime means only
// chosen (with a 2 px dark green edge and a tick, so it reads without colour), today, done or progress on ink; the line colour as a fill means only "can't
// press yet", with the reason written; red only for errors and for deleting things. Every role, name and prop of the earlier primitives still works.
// Text sizes are in rem, never px, so the Large and Extra large text settings (which scale the root font size) reach every control.

// ---- buttons (44 pt minimum tap targets everywhere) ----

/**
 * - primary: the main action, ink with white words (16:1); pressed or hovered it lightens to ink-pressed (1.64:1 from ink, a change you can see) as it shrinks
 *   a touch. At most one full-width ink button in view.
 * - secondary (and ghost, its old name for a quiet action such as Cancel): white with the 1.5 px edge (testers said grey pills looked broken), ink words;
 *   pressed or hovered, the page's grey. Never green words (green words mean a link).
 * - danger: destructive (Clear list, Delete my account): white with a red edge and red words (6.57:1), placed last and apart.
 * - dangerFilled: the confirm sheet's Delete, red with white words (6.57:1); Cancel beside it is secondary.
 * - onInk: the main button on an ink surface (the paywall's top, the Make it at home card): white with ink words, because ink on ink would vanish and lime is
 *   never an action.
 * Can't be pressed yet (disabled): the line fill with the secondary grey words (6.13:1), never faded, and the reason written above it (`reason`).
 */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerFilled" | "onInk";
const DISABLED = "disabled:border-transparent disabled:bg-soft-strong disabled:text-muted disabled:shadow-none";
const FOCUS_LIGHT = "focus-visible:outline-accent";
const SECONDARY = `border-[1.5px] border-edge bg-card text-foreground font-semibold active:scale-[0.97] hover:not-disabled:bg-background active:not-disabled:bg-background ${FOCUS_LIGHT} ${DISABLED}`;
const variants: Record<Variant, string> = {
  primary: `bg-ink text-on-ink font-bold active:scale-[0.97] hover:not-disabled:bg-ink-pressed active:not-disabled:bg-ink-pressed ${FOCUS_LIGHT} ${DISABLED}`,
  secondary: SECONDARY,
  ghost: SECONDARY,
  danger: `border-[1.5px] border-danger bg-card text-danger font-bold active:scale-[0.97] hover:not-disabled:bg-danger-bg active:not-disabled:bg-danger-bg ${FOCUS_LIGHT} ${DISABLED}`,
  dangerFilled: `bg-danger text-on-danger font-bold active:scale-[0.97] hover:not-disabled:brightness-90 active:not-disabled:brightness-90 ${FOCUS_LIGHT} ${DISABLED}`,
  // its ring falls on the ink round it: lime (12.72:1 against ink)
  onInk: `bg-card text-ink font-bold active:scale-[0.97] hover:not-disabled:bg-background active:not-disabled:bg-background focus-visible:outline-sun ${DISABLED}`,
};
// `hover:not-disabled:` rather than `enabled:`, which a LinkButton (an <a>) never matches.
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full leading-snug transition duration-150 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2";
/**
 * "lg" is the chunky size of the Truth screens (viral upgrade, Nov 2026: "a 75-year-old wearing reading glasses"): 48 px tall (3rem, so it also grows with the
 * text size) and 16 px words. The two sizes never share a min-height class, so which one applies never depends on stylesheet order.
 */
export type ControlSize = "md" | "lg";
const buttonSize: Record<ControlSize, string> = { md: "min-h-11 px-5 text-[0.9375rem]", lg: "min-h-12 px-6 text-base" };

/** The white spinner inside a busy button: the button's own word colour on a faint ring of it. */
function ButtonSpinner() {
  return <span aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current" />;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: ControlSize;
  full?: boolean;
  /**
   * Working on it: the button keeps its colours (ink stays ink, never grey: testers thought a greyed busy button was broken), shows a spinner and "Working…"
   * (or `busyLabel`, such as "Making your plan…"), says aria-busy, and a second tap (or Enter in its form) does nothing.
   */
  busy?: boolean;
  busyLabel?: string;
  /** Why it can't be pressed yet ("Pick at least one shop."): written above it with an info icon while `disabled`, and read out with the button. */
  reason?: ReactNode;
  /** Classes for the box that holds the reason and the button (drawn only while the reason shows); `className` always stays on the button itself. */
  wrapClassName?: string;
};

export function Button({ variant = "primary", size = "md", full, className, busy, busyLabel, reason, wrapClassName, children, onClick, disabled, type = "button", "aria-describedby": describedBy, "aria-busy": ariaBusy, "aria-disabled": ariaDisabled, ...rest }: ButtonProps) {
  const t = useT();
  const reasonId = useId();
  const showReason = !!disabled && !busy && reason != null && reason !== false && reason !== "";
  const button = (
    <button
      {...rest}
      type={type}
      disabled={busy ? undefined : disabled}
      aria-busy={busy || ariaBusy}
      aria-disabled={busy || ariaDisabled}
      aria-describedby={cx(describedBy, showReason && reasonId) || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cx(buttonBase, buttonSize[size], variants[variant], busy && "cursor-progress", full && "w-full", className)}
    >
      {busy ? (
        <>
          <ButtonSpinner />
          {busyLabel ?? t("Working…")}
        </>
      ) : (
        children
      )}
    </button>
  );
  if (!showReason) return button;
  return (
    <div className={cx("flex flex-col gap-2", full ? "w-full" : "items-start", wrapClassName)}>
      <p id={reasonId} className="flex items-start gap-1.5 text-[0.9375rem] font-semibold leading-snug text-foreground">
        <InfoIcon className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
        <span className="min-w-0">{reason}</span>
      </p>
      {button}
    </div>
  );
}

/** `onClick` runs first (a Back button takes the browser's own Back there); `replace` swaps the current history entry for the page instead of adding one (a "Back to ..." button on a page that was opened by address, so the page it leaves is not left behind to be Backed into). */
export function LinkButton({ href, variant = "primary", size = "md", full, className, children, onClick, replace }: { href: string; variant?: Variant; size?: ControlSize; full?: boolean; className?: string; children: ReactNode; onClick?: (e: MouseEvent<HTMLElement>) => void; replace?: boolean }) {
  return (
    <Link href={href} onClick={onClick} replace={replace} className={cx(buttonBase, buttonSize[size], variants[variant], full && "w-full", className)}>
      {children}
    </Link>
  );
}

// ---- small pieces ----

const TINTS = { plan: "bg-tint-plan", cook: "bg-tint-cook" } as const;

/**
 * A white card with the 1px line and a faint shadow (a card inside a card takes the page fill with no edge: globals.css). `tint` is a feature's own colour,
 * the same on every card of that feature: "plan" for the Meal plan, "cook" for every "cook with what you have" card. Nothing lime ever sits on a tint.
 */
export function Card({ children, className, hero, tint }: { children: ReactNode; className?: string; hero?: boolean; tint?: keyof typeof TINTS }) {
  return <div className={cx("rounded-[1.25rem]", hero ? "hero-card" : "glass", tint && TINTS[tint], className)}>{children}</div>;
}

/**
 * A small tag that can't be tapped ("Limited time", "New", "Sample data", a category): 6 px corners and no chevron so it never looks like a button, words in
 * the body's ink, sentence case. White with the card line on the page; the page fill with no edge inside a card or a sheet. The "accent" tone ("New") is
 * bold, never lime (lime means chosen).
 */
export function Badge({ children, tone = "neutral", icon }: { children: ReactNode; tone?: "neutral" | "accent"; icon?: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-[0.375rem] border border-line bg-card px-2 py-1 text-[0.8125rem] leading-none text-foreground [:is(.glass,.hero-card,.inset-card,.sheet-panel)_&]:border-transparent [:is(.glass,.hero-card,.inset-card,.sheet-panel)_&]:bg-fill [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0", tone === "accent" ? "font-bold" : "font-semibold")}>
      {icon}
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
 * "Nothing here yet": a white card with an icon in a page-fill well, a heading, one quiet line and at most one action. A bare icon handed in (a PotIcon,
 * say) is drawn in the same well as an EmptyIcon; Pip (the svg with the class `pip`) is left as he is, bare. With no icon there is no well (no lime dot:
 * lime is never decoration).
 */
export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="glass rounded-[1.25rem] px-6 py-10 text-center">
      {icon && (
        <span
          aria-hidden
          className="mx-auto mb-4 inline-flex items-center justify-center [&>svg:not(.pip)]:h-16 [&>svg:not(.pip)]:w-16 [&>svg:not(.pip)]:rounded-full [&>svg:not(.pip)]:bg-fill [&>svg:not(.pip)]:p-[1.125rem]"
        >
          {icon}
        </span>
      )}
      <p className="text-xl font-[800] leading-snug tracking-[-0.01em]">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-base leading-snug text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** A big round icon for an empty state ("nothing here yet"): an ink icon in a page-fill well. */
export function EmptyIcon({ children }: { children: ReactNode }) {
  return <span className="grid h-16 w-16 place-items-center rounded-full bg-fill text-foreground [&>svg]:h-7 [&>svg]:w-7">{children}</span>;
}

/**
 * A page's loading line: an ink ring on a line-coloured track (no colour of its own for waiting). Inside a button (sign-in's "Sending…") it takes the
 * button's own words, size and colour, with no page padding and a smaller ring, so the pill keeps its height; a label that already ends in an ellipsis
 * doesn't get a second one.
 */
export function Spinner({ label }: { label?: string }) {
  const t = useT();
  const text = label ?? t("Loading");
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-10 text-[0.9375rem] font-medium text-muted [button_&]:gap-2 [button_&]:py-0 [button_&]:[font:inherit] [button_&]:text-inherit">
      <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink [button_&]:h-[1.125rem] [button_&]:w-[1.125rem] [button_&]:border-2 [button_&]:border-current/25 [button_&]:border-t-current" aria-hidden />
      {/(…|\.\.\.)$/.test(text) ? text : `${text}…`}
    </div>
  );
}

/**
 * Something failed to load (no connection, a server error): the app's error banner (colour meeting, 19 November 2026), the pale red fill with a 4 px red
 * bar at its start and the circle-!, the words in the body's ink, and "Try again" as a secondary button. Red only for failures, never on food or a figure.
 */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex gap-3 rounded-[1.25rem] border-s-4 border-danger bg-danger-bg p-4">
      <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug text-foreground [overflow-wrap:anywhere]">{message}</p>
        {onRetry && (
          <div className="mt-3">
            <Button variant="secondary" onClick={onRetry}>{t("Try again")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The one allergy note (colour meeting, 19 November 2026), the same on every screen: a pale amber fill, a full 2 px amber edge, a triangle and the words in
 * the body's ink (17.3:1). Amber is kept for the person's or household's own allergies, Contains matches and "not checked for your diet", at most one per
 * screen view, so people keep noticing it. The caller's words go inside; `heading` adds a bold first line (Note.tsx draws it: `<Note kind="allergy">`
 * gives the "Allergy" heading by itself).
 */
export function AllergyNote({ children, className, heading = null }: { children: ReactNode; className?: string; heading?: ReactNode }) {
  return <Note kind="allergy" heading={heading} className={className}>{children}</Note>;
}

// ---- choices ----

/**
 * The mark of a choice (colour meeting, 19 November 2026), drawn in the words' colour so it reads without colour:
 * - "tick" (a chip, a tile, a quick answer): off, an empty 16 px ring in the 1.5 px edge grey (it also keeps the words from jumping when ticked); on, a
 *   16 px tick with a 2 px stroke in the dark green of the words on lime (11.86:1).
 * - "plus" (a "+ eggs" chip you add): off, an ink +; on, the tick.
 * - "dot" (a day, "where you are" on a jump bar): nothing when off; on, a small dark green dot.
 * - "radio" (a goal, one of a list): a 20 px circle with a 2 px grey ring; on, lime with a 2 px dark green edge and a dark green dot.
 * - "circle" (a shopping-list tick, "I have this", the plan's Meat and Meals rows): a 24 px circle with a 2 px grey ring; on, lime with a 2 px dark green
 *   edge and a dark green tick. Give its button a 44 px target.
 */
export type ChoiceMarkKind = "tick" | "plus" | "dot" | "radio" | "circle";
export function ChoiceMark({ on, kind = "tick", className }: { on: boolean; kind?: ChoiceMarkKind; className?: string }) {
  if (kind === "radio") {
    return (
      <span aria-hidden className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-on-sun bg-sun" : "border-edge bg-card", className)}>
        {on && <span className="h-2 w-2 rounded-full bg-on-sun" />}
      </span>
    );
  }
  if (kind === "circle") {
    return (
      <span aria-hidden className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", on ? "border-on-sun bg-sun text-on-sun" : "border-edge bg-card", className)}>
        {on && <CheckIcon strokeWidth={3.2} className="h-4 w-4" />}
      </span>
    );
  }
  if (on) {
    return kind === "dot"
      ? <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full bg-current", className)} />
      : <CheckIcon aria-hidden strokeWidth={3} className={cx("h-4 w-4 shrink-0", className)} />;
  }
  if (kind === "dot") return null;
  if (kind === "plus") return <PlusIcon aria-hidden strokeWidth={2.4} className={cx("h-4 w-4 shrink-0 text-ink", className)} />;
  return <span aria-hidden className={cx("h-4 w-4 shrink-0 rounded-full border-[1.5px] border-edge", className)} />;
}

/** Chosen lime: the fill, a 2 px dark green edge (a 1.5 px border plus a half-pixel ring, so the box is the same size as an unchosen one) and bold dark green words. */
const CHOSEN = "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]";

/**
 * A chip. As a choice (`selected` true or false) it shows its mark: unchosen, white with the 1.5 px edge and an empty tick ring (`mark="plus"`: an ink +;
 * `"dot"`: nothing); chosen, lime with the 2 px dark green edge, the tick (or dot) and bold dark green words. Without `selected` it is a plain chip you tap
 * (a recent search), white with the edge and no mark. `segment` is the quiet, borderless kind inside a track. The edge's width stays the same when it is
 * chosen so a row never shifts.
 */
export function Chip({ selected, children, onClick, className, segment, size = "md", mark = "tick", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; segment?: boolean; size?: ControlSize; mark?: "tick" | "plus" | "dot" | "none" }) {
  const choice = typeof selected === "boolean";
  const markEl =
    !choice || mark === "none" ? null
    : selected ? <ChoiceMark on kind={mark === "dot" ? "dot" : "tick"} />
    : segment || mark === "dot" ? null
    : <ChoiceMark on={false} kind={mark === "plus" ? "plus" : "tick"} />;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border-[1.5px] py-2 text-start text-base leading-snug transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:active:scale-100",
        size === "lg" ? "min-h-12 px-5" : "min-h-11 px-4",
        selected
          ? CHOSEN
          : segment
            ? "border-transparent font-semibold text-foreground hover:bg-background"
            : "border-edge bg-card font-semibold text-foreground hover:bg-background disabled:border-transparent disabled:bg-soft-strong disabled:text-muted",
        className,
      )}
      {...rest}
    >
      {markEl}
      {children}
    </button>
  );
}

/** Arrow-key navigation for a radio group (WAI-ARIA): moves the selection and focus to the neighbouring option. */
export function radioKeyNav(e: React.KeyboardEvent<HTMLElement>, index: number, count: number, select: (i: number) => void) {
  // In a right-to-left language (Arabic, Urdu) the next option is to the left, so the arrows go the way the options are laid out.
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
  const delta = ({ ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1 } as Record<string, number>)[e.key];
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
 * Measures the labels in the chosen option's own font (bold, so any option fits once chosen; this holds in every language, script and text size) and picks:
 * one row of equal segments; else one row sized to the words; else (an even count of four or more) a 2 x 2 block; else a list, one option per line. Each
 * option also makes room for the chosen tick and the edge.
 */
function segmentFit(track: HTMLElement, labels: readonly string[]): SegmentFit {
  const option = (track.querySelector('[aria-checked="true"]') ?? track.firstElementChild) as HTMLElement | null;
  if (!option || labels.length === 0) return "equal";
  const o = getComputedStyle(option);
  const s = getComputedStyle(track);
  const font = `${o.fontStyle} ${o.fontWeight} ${o.fontSize} ${o.fontFamily}`;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const mark = 1.375 * rem + 3; // the tick (1 rem) and its gap (0.375 rem), and the 1.5 px edge on both sides
  const pad = 1.5 * rem + 6 + mark; // the options' px-3 on both sides, and a little air so a word never touches its pill's edge
  const tight = 1 * rem + 4 + mark; // the one-row-by-words layout draws px-2 (see the options' classes), plus 2 px of air on each side
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
 * A segmented control (e.g. "Which meal?"): a page-fill track with the 1.5 px edge, unchosen words in ink, the chosen option lime with the 2 px dark green
 * edge, a tick and bold dark green words (colour meeting, 19 November 2026: an edgeless track was 1.14:1 on white). The options share one round row while
 * their words fit on one line; when they don't (a long translation, Extra large text, a narrow card) they become a 2 x 2 block or a short list rather than
 * breaking words over two lines or bulging the pill. The layout is measured before the first paint and set as `data-fit` on the track (outside React's
 * render, so nothing re-renders); before that, and without script, it is the plain one-row version.
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
      className="group/seg flex gap-1 rounded-full border-[1.5px] border-edge bg-background p-1 data-[fit=grid]:grid data-[fit=grid]:grid-cols-2 data-[fit=grid]:rounded-[1.25rem] data-[fit=stack]:flex-col data-[fit=stack]:rounded-[1.25rem]"
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => radioKeyNav(e, i, options.length, (n) => onChange(options[n]!.value))}
            className={cx(
              "inline-flex min-h-11 min-w-0 flex-[1_1_0%] items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3 py-2 text-center text-[0.9375rem] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              "group-data-[fit=content]/seg:flex-auto group-data-[fit=content]/seg:px-2 group-data-[fit=grid]/seg:rounded-2xl group-data-[fit=stack]/seg:flex-none group-data-[fit=stack]/seg:rounded-2xl",
              on ? CHOSEN : "border-transparent font-semibold text-foreground hover:bg-card",
            )}
          >
            {on && <ChoiceMark on />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A switch with "On" or "Off" written beside it (Switch.tsx draws it: off, a white track with the edge and a grey knob; on, lime with the 2 px dark green edge
 * and a dark green knob). Kept under its old name; new screens can use Switch directly.
 */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return <Switch checked={checked} onChange={onChange} label={label} description={description} />;
}

/**
 * A labelled field: the label above in the body's ink, the hint below in muted running text (not small print). `error` is written under it in red with the
 * circle-! (give the input aria-invalid too: inputClass then draws its 2 px red edge, which stays while it is focused).
 */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-[0.9375rem] leading-snug text-muted">{hint}</span>}
      {error && (
        <span className="mt-2 flex items-start gap-1.5 text-[0.9375rem] font-semibold leading-snug text-danger">
          <AlertCircleIcon className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
          <span className="min-w-0">{error}</span>
        </span>
      )}
    </label>
  );
}

/**
 * A field you type in or choose from (colour meeting, 19 November 2026): white with the 1.5 px edge of every control you can tap, on the page, on a card or in
 * a sheet alike; typed words in ink; the placeholder in the mid grey (4.99:1, only ever on white); focused, a 2 px link-green ring with a 2 px gap. Marked
 * aria-invalid, it gets a 2 px red edge (a 1.5 px border plus a half-pixel ring, so nothing moves) that stays while focused. A <select> gets our own ink
 * chevron 16 px from its end (globals.css select.field-select) unless an icon already follows it (Submit.tsx's SelectField), so it never shows two.
 */
const SELECT_ROOM = "[&:is(select):not(:has(+svg))]:pe-11";
export const inputClass = `field-select min-h-12 w-full rounded-2xl border-[1.5px] border-edge bg-card px-4 text-base text-foreground placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[0_0_0_0.5px_var(--danger)] ${SELECT_ROOM}`;

/**
 * Classes for a control floating on a food photo (Back, Settings, expand, the heart): globals.css .photo-chip, near-white with a soft shadow and the 1px
 * control edge, ink words, 44 px tall. PHOTO_TAG is a pill you can't tap (the kcal pill), with the card line instead.
 */
export const PHOTO_CHIP = "photo-chip inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[0.9375rem] font-bold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const PHOTO_TAG = "photo-tag inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.8125rem] font-bold leading-none";

// ---- bottom sheet on the native <dialog> element: focus trap, Escape and backdrop come for free ----

// Inside the white sheet every "soft" surface (a card, a tile, a picker's unselected buttons) takes the light grey fill instead of white, flat with no edge or
// shadow, the same way globals.css treats things sitting on a white card. Buttons and fields stay white with their edge (--card).
// Behind the sheet, the neutral scrim (rgba(0,0,0,0.5)), so food photos don't turn olive. There is no grab handle: the sheet doesn't drag (colour meeting:
// a handle only where it really drags), and Close is always at the top.
const sheetSurface = { "--soft": "var(--fill)", "--tile": "var(--fill)", "--card-shadow": "none" } as CSSProperties;

/** `dark`: the ink card theme of the Truth screens (globals.css .truth-dark), for filming; every colour inside follows its variables. */
export function Sheet({ open, onClose, title, children, dark }: { open: boolean; onClose: () => void; title: string; children: ReactNode; dark?: boolean }) {
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
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-visible rounded-t-[1.75rem] bg-transparent p-0 text-foreground backdrop:bg-scrim backdrop:backdrop-blur-[3px]"
    >
      {open && (
        <div
          style={sheetSurface}
          className={`sheet-panel sheet-in ${dark ? "truth-dark " : ""}max-h-[92dvh] scroll-pt-24 overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[1.75rem] bg-card px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)]`}
        >
          {/* The title stays at the top while a long sheet scrolls, so Close is always in reach. */}
          <div className="sheet-head sticky top-0 z-20 -mx-5 bg-card px-5 pb-4 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h2 tabIndex={-1} className="min-w-0 flex-1 text-xl font-[800] leading-tight tracking-[-0.01em] outline-none">{title}</h2>
              <button type="button" onClick={onClose} aria-label={t("Close")} className="group -me-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition-colors group-hover:bg-background group-active:bg-background"><CloseIcon className="h-[1.125rem] w-[1.125rem]" /></span>
              </button>
            </div>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
