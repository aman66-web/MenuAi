"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/mm/config";
import { cleanPhrases, helpQuery, SEARCH_HELP_ENABLED } from "@/lib/mm/searchHelp";

/**
 * Pip's search help on the phone (lib/mm/searchHelp.ts): when `ask` is true (the search found nothing, not even a close match), the typed words are sent once
 * the person stops typing for a moment, and the suggestions come back as words. Nothing is sent while offline, for a search that finds something, or twice for
 * the same words in a visit.
 */
const asked = new Map<string, string[]>();

export function useSearchHelp(typed: string, ask: boolean): { phrases: string[]; looking: boolean } {
  const q = helpQuery(typed);
  const key = q?.toLowerCase() ?? "";
  const [state, setState] = useState<{ key: string; phrases: string[] } | null>(null);
  const [looking, setLooking] = useState(false);
  const cached = asked.get(key);
  useEffect(() => {
    if (!SEARCH_HELP_ENABLED || !ask || !q || q.replace(/\s/g, "").length < 3 || asked.has(key)) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLooking(true);
      try {
        const res = await fetch(`${API_BASE}search/help`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }), signal: abort.signal });
        const body = res.ok ? ((await res.json()) as { phrases?: unknown }) : null;
        const phrases = cleanPhrases(body?.phrases, q);
        asked.set(key, phrases);
        setState({ key, phrases });
      } catch {
        // offline, too many, or the AI couldn't answer: the screen stays as it is
      } finally {
        if (!abort.signal.aborted) setLooking(false);
      }
    }, 700);
    return () => { clearTimeout(timer); abort.abort(); setLooking(false); };
  }, [ask, q, key]);
  return { phrases: !ask ? [] : cached ?? (state?.key === key ? state.phrases : []), looking: ask && looking && !cached };
}
