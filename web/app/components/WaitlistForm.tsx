"use client";

import { useState, type FormEvent } from "react";
import { CheckIcon, ChevronsRightIcon } from "@/app/app/_components/icons";

type State = "idle" | "sending" | "done" | "error";

// `tone` is the card the form sits on: "light" (a white or light grey card) or "dark" (the landing page's black card). The words,
// fields and states are the same in both; only the colours change so everything keeps its contrast.
export function WaitlistForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const dark = tone === "dark";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams(window.location.search);
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          website: form.get("website"), // honeypot
          source: params.get("ref") ?? params.get("utm_source") ?? undefined,
        }),
      });
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
        setMessage(res.status === 429 ? "Too many tries. Please try again in an hour." : "Check the email address and try again.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't connect. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="flex items-center gap-3 rounded-[1.25rem] bg-white px-4 py-3.5 text-base font-semibold text-foreground">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun text-on-accent"><CheckIcon className="h-5 w-5" strokeWidth={2.4} /></span>
        <span>You&apos;re on the list. We&apos;ll email you once, on launch day.</span>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div className="flex flex-wrap gap-2">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={`min-h-14 min-w-0 flex-1 basis-[14rem] rounded-full bg-white px-[20px] text-base text-foreground outline-none placeholder:text-muted focus:ring-2 ${dark ? "focus:ring-[var(--sun)]" : "border border-line focus:border-accent focus:ring-accent"}`}
        />
        {/* Honeypot: hidden from people, tempting to bots. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button
          type="submit"
          disabled={state === "sending"}
          // The knob is an icon and the paddings frame it, so they are px-sized: at 200% text the words still get the room to wrap whole.
          className={`group inline-flex min-h-14 min-w-0 grow items-center gap-[12px] rounded-full p-[6px] pe-[24px] text-base font-semibold transition active:scale-[0.98] disabled:opacity-60 ${dark ? "bg-white text-foreground focus-visible:outline-[var(--sun)]" : "bg-foreground text-background hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)]"}`}
        >
          <span aria-hidden className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-sun text-on-accent transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"><ChevronsRightIcon className="h-5 w-5" strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1 text-center">{state === "sending" ? "Joining…" : "Get early access"}</span>
        </button>
      </div>
      <p className={`mt-3 text-sm font-medium leading-relaxed ${state === "error" ? (dark ? "font-semibold text-white" : "font-semibold text-foreground") : dark ? "text-[#c9d1cc]" : "text-muted"}`} aria-live="polite">
        {state === "error" ? message : "One email when we launch. No spam, unsubscribe any time."}
      </p>
    </form>
  );
}
