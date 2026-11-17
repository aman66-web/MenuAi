"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompareItem } from "@/lib/mm/compare";
import { canonicalize, checkPick, COMPARE_PICK_ENABLED, comparable, dietWords, pickKey, rememberPick, resolvePick, toPickItem, type PickInput } from "@/lib/mm/comparePick";
import { API_BASE } from "@/lib/mm/config";
import { comparePicksStore } from "@/lib/mm/stores";
import { useSettings } from "./hooks";

// Pip's pick for the two items on the Compare screen (lib/mm/comparePick.ts has the rules; POST /api/v1/compare/pick asks the AI).
// Order of things, for cost: a pair this phone has already been answered for is shown at once with no request; only a miss asks the server (which keeps answers too),
// and only after a short pause so adding and removing items doesn't ask for pairs nobody looked at. Nothing is sent but the two items' names and figures, the goal and the
// diet words (never allergies, never anything about the person).

export type Pick = NonNullable<ReturnType<typeof resolvePick>>;
export type PickState =
  | { status: "idle" }
  | { status: "incomparable" }
  | { status: "thinking" }
  | { status: "ready"; pick: Pick }
  | { status: "failed"; offline: boolean };

const IDLE: PickState = { status: "idle" };
const INCOMPARABLE: PickState = { status: "incomparable" };
const PAUSE_MS = 500;
const REQUEST_MS = 30_000;

export function useComparePick(items: readonly CompareItem[]): { state: PickState; retry: () => void } {
  const settings = useSettings();
  // What came of the last question, and which pair it was for: an answer for a pair that is no longer on screen is never shown.
  const [result, setResult] = useState<{ sig: string; state: PickState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The two items as the pick sees them, as text, so the effect runs when what is compared changes and not on every render.
  const sig = useMemo(
    () => (COMPARE_PICK_ENABLED && items.length === 2 ? JSON.stringify({ items: [toPickItem(items[0]!), toPickItem(items[1]!)], goal: settings.goal, diet: dietWords(settings.preferences) }) : null),
    [items, settings.goal, settings.preferences],
  );
  const input = useMemo(() => (sig ? (JSON.parse(sig) as PickInput) : null), [sig]);
  const blocked = !input ? IDLE : comparable(input.items[0], input.items[1]) ? null : INCOMPARABLE;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!sig || !input || blocked) return;
    let live = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), PAUSE_MS + REQUEST_MS);
    const finish = (state: PickState) => { if (live) setResult({ sig, state }); };

    (async () => {
      let key: string | null = null;
      try { key = await pickKey(input); } catch { /* no crypto.subtle (an insecure page): the server still answers, this phone just can't remember it */ }
      if (!live) return;
      const known = key ? comparePicksStore.get().find((e) => e.key === key) : undefined;
      const remembered = known ? resolvePick(known, input) : null;
      if (remembered) { finish({ status: "ready", pick: remembered }); return; }

      finish({ status: "thinking" });
      await new Promise((r) => setTimeout(r, PAUSE_MS));
      if (!live) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) { finish({ status: "failed", offline: true }); return; }
      try {
        const res = await fetch(`${API_BASE}compare/pick`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: abort.signal });
        const body = res.ok ? ((await res.json()) as { pick?: unknown }) : null;
        // what comes back is checked here too, in the canonical order, before it is kept or shown
        const checked = body ? checkPick(body.pick, canonicalize(input).items) : null;
        const shown = checked ? resolvePick(checked, input) : null;
        if (!live) return;
        if (!checked || !shown) { finish({ status: "failed", offline: false }); return; }
        if (key) comparePicksStore.update((l) => rememberPick(l, key, checked, Date.now()));
        finish({ status: "ready", pick: shown });
      } catch {
        finish({ status: "failed", offline: typeof navigator !== "undefined" && navigator.onLine === false });
      }
    })();

    return () => { live = false; clearTimeout(timeout); abort.abort(); };
    // `blocked` and `input` come from `sig`, which is what changes
  }, [sig, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const state: PickState = blocked ?? (result && result.sig === sig ? result.state : IDLE);

  // when the network comes back, try the pick that failed for want of it
  useEffect(() => {
    if (state.status !== "failed" || !state.offline) return;
    const back = () => setAttempt((n) => n + 1);
    window.addEventListener("online", back, { once: true });
    return () => window.removeEventListener("online", back);
  }, [state]);

  return { state, retry };
}
