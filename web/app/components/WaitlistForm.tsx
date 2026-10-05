"use client";

import { useState, type FormEvent } from "react";

type State = "idle" | "sending" | "done" | "error";

export function WaitlistForm() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

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
      <p role="status" className="rounded-3xl bg-accent-soft px-5 py-4 font-semibold">
        You&apos;re on the list. We&apos;ll email you once, on launch day.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="min-h-12 flex-1 rounded-full border border-line bg-background px-5 text-base outline-none placeholder:text-muted focus:border-accent"
        />
        {/* Honeypot: hidden from people, tempting to bots. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn-sun glow-shadow min-h-12 rounded-full px-6 font-bold text-on-accent transition active:scale-[0.97] disabled:opacity-60"
        >
          {state === "sending" ? "Joining…" : "Get early access"}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {state === "error" ? message : "One email when we launch. No spam, unsubscribe any time."}
      </p>
    </form>
  );
}
