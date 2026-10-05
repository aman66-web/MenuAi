"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CloseIcon } from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// ---- buttons (44 pt minimum tap targets everywhere) ----

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent font-semibold hover:opacity-90",
  secondary: "bg-soft text-foreground border border-line font-medium hover:border-muted",
  ghost: "text-accent font-medium hover:bg-accent-soft",
  danger: "bg-soft text-foreground border border-line font-medium hover:border-muted",
};
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-soft", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold", tone === "accent" ? "bg-accent-soft text-accent" : "bg-line text-muted")}>
      {children}
    </span>
  );
}

export function SampleBadge() {
  return <Badge>Sample data</Badge>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between">
      <h2 className="text-lg font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
      <p className="text-base font-semibold">{title}</p>
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
    <div role="alert" className="rounded-xl border border-line bg-soft px-4 py-5 text-center">
      <p className="text-sm">{message}</p>
      {onRetry && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function Chip({ selected, children, onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-background text-foreground hover:border-muted",
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
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1 rounded-xl border border-line bg-soft p-1">
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
            "min-h-11 rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent",
            o.value === value ? "bg-background shadow-sm text-foreground" : "text-muted",
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
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

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
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-visible rounded-t-2xl bg-transparent p-0 text-foreground backdrop:bg-black/50"
    >
      {open && (
        <div className="max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-line bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mb-2 flex items-center">
            <button type="button" onClick={onClose} aria-label="Close" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft">
              <CloseIcon />
            </button>
            <h2 className="flex-1 pr-9 text-center text-base font-semibold">{title}</h2>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
