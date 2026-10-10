"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CloseIcon } from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// ---- buttons (44 pt minimum tap targets everywhere) ----

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "btn-sun glow-shadow text-on-accent font-bold active:scale-[0.97] hover:brightness-105",
  secondary: "glass text-foreground font-semibold active:scale-[0.97] hover:bg-soft-strong",
  ghost: "text-accent font-semibold hover:bg-accent-soft",
  danger: "glass text-foreground font-semibold active:scale-[0.97] hover:bg-soft-strong",
};
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
  return <div className={cx("rounded-3xl", hero ? "hero-card" : "glass", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tone === "accent" ? "bg-accent-soft text-accent" : "bg-soft-strong text-muted")}>
      {children}
    </span>
  );
}

export function SampleBadge() {
  return <Badge>Sample data</Badge>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-10 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
        <span aria-hidden className="bg-sun h-5 w-1.5 shrink-0 rounded-full" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="glass rounded-3xl px-5 py-10 text-center">
      <span aria-hidden className={`mx-auto mb-3 ${icon ? "inline-flex justify-center" : "icon-bubble-soft h-12 w-12"}`}>{icon ?? <span className="bg-sun h-3 w-3 rounded-full" />}</span>
      <p className="text-lg font-bold tracking-tight">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-10 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      {label}…
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass rounded-3xl px-4 py-6 text-center">
      <p className="text-sm">{message}</p>
      {onRetry && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function Chip({ selected, children, onClick, className, segment, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; segment?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected
          ? "border-transparent bg-foreground text-background shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]"
          : segment
            ? "border-transparent text-muted hover:text-foreground"
            : "border-line bg-soft text-foreground hover:bg-soft-strong",
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

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("glass grid gap-1 rounded-3xl p-1", options.length === 4 ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(6rem,1fr))]")}>
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
            "min-h-12 rounded-full px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            o.value === value ? "bg-foreground text-background shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-base">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-8 w-14 shrink-0 rounded-full border border-line bg-soft-strong transition-colors peer-checked:border-transparent peer-checked:[background:var(--sun)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-1 after:top-1 after:h-5.5 after:w-5.5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-6" />
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border border-line bg-soft px-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

// ---- bottom sheet on the native <dialog> element: focus trap, Escape and backdrop come for free ----

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-visible rounded-t-[2rem] bg-transparent p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="sheet-in max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-b-0 border-line bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-20px_60px_-20px_var(--brand-shadow)]">
          <div aria-hidden className="mx-auto mb-1 mt-1 h-1 w-10 rounded-full bg-line" />
          <div className="mb-2 flex items-center">
            <button type="button" onClick={onClose} aria-label="Close" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong">
              <CloseIcon />
            </button>
            <h2 className="flex-1 pr-9 text-center text-base font-bold tracking-tight">{title}</h2>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
