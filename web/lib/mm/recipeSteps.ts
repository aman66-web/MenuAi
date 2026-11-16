// How a recipe step is shown (founder 2026-11-16, on a recipe app they like: "make it into clear steps for the person to do"; readers include
// uni students). A step in the book is written "Short title: instruction." (tests/recipeBook.test.ts checks every one), so the recipe page can show
// the title in bold above the instruction, with the step's cooking time beside it. Steps saved before titles existed (and Pip's) have none and show
// as plain text, so nothing here needs a migration.

export interface StepParts {
  /** The step's short title ("Soften the onion"), when it has one. */
  title?: string;
  /** What to do. */
  text: string;
}

// A title is 1 to 5 words, starts with a capital letter, and holds no digit, full stop or colon: "Make the sauce:" splits, "Note: 200 g" doesn't.
const TITLED = /^([A-Z][^:.\d]{0,44}?): ([A-Z0-9][\s\S]*)$/;

export function splitStep(step: string): StepParts {
  const m = TITLED.exec(step.trim());
  if (!m) return { text: step };
  const words = m[1].trim().split(/\s+/).length;
  return words >= 1 && words <= 5 ? { title: m[1].trim(), text: m[2] } : { text: step };
}

// The first time a step names, shown as a small chip ("5 min", "8–10 min", "30 sec", "1 hr", "Overnight"). Taken from the words themselves, so it
// always matches what the step says; "a minute" or "a few minutes" give none (no number to show).
const UNIT: Array<[RegExp, string]> = [[/^(?:hours?|hrs?)$/i, "hr"], [/^(?:minutes?|mins?)$/i, "min"], [/^(?:seconds?|secs?)$/i, "sec"]];
const TIME = /\b(\d{1,3})(?:\s*(?:to|-|–)\s*(\d{1,3}))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i;

// "About 12 minutes before the sauce is ready" says when to start, not how long the step takes: those are skipped.
const LEAD = /^\s*(?:before|after|later|earlier|in advance|ahead)\b/i;
const TIMES = new RegExp(TIME.source, "gi");

export function stepTime(text: string): string | null {
  const m = [...text.matchAll(TIMES)].find((x) => !LEAD.test(text.slice((x.index ?? 0) + x[0].length)));
  if (m) {
    const unit = UNIT.find(([re]) => re.test(m[3]))?.[1] ?? "min";
    return m[2] ? `${m[1]}–${m[2]} ${unit}` : `${m[1]} ${unit}`;
  }
  return /\bovernight\b/i.test(text) ? "Overnight" : null;
}
