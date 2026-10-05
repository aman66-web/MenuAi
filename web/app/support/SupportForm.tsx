"use client";

import { useState, type FormEvent } from "react";

export function SupportForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/v1/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          message: form.get("message"),
          website: form.get("website"),
          source: "web",
        }),
      });
      if (res.ok) return setState("done");
      setState("error");
      setError(res.status === 429 ? "Too many messages. Please try again in an hour." : "Please check your message (at least 5 characters) and email.");
    } catch {
      setState("error");
      setError("Couldn't connect. Please try again.");
    }
  }

  if (state === "done") {
    return <p role="status" className="rounded-xl bg-accent-soft px-4 py-3 font-medium">Thanks! If you left an email, we&apos;ll reply soon.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email (optional, so we can reply)</label>
        <input id="email" name="email" type="email" autoComplete="email"
          className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 outline-none focus:border-accent" />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium">Message</label>
        <textarea id="message" name="message" required minLength={5} maxLength={4000} rows={6}
          className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 outline-none focus:border-accent" />
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <button type="submit" disabled={state === "sending"}
        className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Send"}
      </button>
      {state === "error" && <p className="text-sm text-muted" aria-live="polite">{error}</p>}
    </form>
  );
}
