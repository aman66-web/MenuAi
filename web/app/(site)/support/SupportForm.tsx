"use client";

import { useState, type FormEvent } from "react";
import { API_BASE } from "@/lib/mm/config";
import { ArrowRightIcon, CheckIcon } from "@/app/app/_components/icons";

// The form sits in a light grey card (like a Home card, on the website's white page): white fields with no outline, the one main
// action as a black pill with a small lime knob (the onboarding's "Get started" shape). No words changed.
const FILL = "bg-[#f4f5f6]";
const field = "mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-foreground shadow-[0_1px_2px_rgba(17,24,20,0.04)] placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function SupportForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const res = await fetch(`${API_BASE}support`, {
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
    return (
      <p role="status" className={`${FILL} flex items-center gap-3.5 self-start rounded-[1.25rem] p-[20px] text-base font-semibold leading-snug`}>
        <span aria-hidden className="bg-sun grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-accent"><CheckIcon className="h-5 w-5" strokeWidth={2.4} /></span>
        <span>Thanks! If you left an email, we&apos;ll reply soon.</span>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={`${FILL} flex flex-col gap-4 rounded-[1.25rem] p-[20px]`}>
      <div>
        <label htmlFor="email" className="block text-[0.9375rem] font-semibold">Email (optional, so we can reply)</label>
        <input id="email" name="email" type="email" autoComplete="email" className={field} />
      </div>
      <div className="flex flex-1 flex-col">
        <label htmlFor="message" className="block text-[0.9375rem] font-semibold">Message</label>
        <textarea id="message" name="message" required minLength={5} maxLength={4000} rows={6} className={`${field} min-h-[9rem] flex-1 resize-none sm:resize-y`} />
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <button
        type="submit"
        disabled={state === "sending"}
        className="group flex min-h-11 w-full items-center rounded-full bg-foreground p-1 pe-4 text-[0.9375rem] font-bold text-background transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden className="bg-sun grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-accent transition-transform duration-300 group-active:translate-x-1 rtl:group-active:-translate-x-1">
          <ArrowRightIcon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1 whitespace-nowrap px-2 text-center">{state === "sending" ? "Sending…" : "Send"}</span>
      </button>
      {state === "error" && <p className="text-[0.9375rem] font-semibold leading-snug" aria-live="polite">{error}</p>}
    </form>
  );
}
