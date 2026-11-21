"use client";

import { API_BASE } from "@/lib/mm/config";
import type { PlanAiAnswer, PlanAiRequest } from "@/lib/mm/planAi";
import { paidStore } from "@/lib/mm/stores";

/** How long the phone waits for Pip's week before keeping its own (the route itself stops at 120 s). */
export const PLAN_AI_WAIT_MS = 100_000;

/**
 * Asks POST /api/v1/plan/ai for Pip's week (lib/planAiHandler.ts) with the person's Premium token. Null for anything but a week: offline, no Premium on the
 * server's check, too many, the AI busy or slow, an answer that can't be read. The caller keeps its own week then (lib/mm/planAiWeek.ts checks a week that
 * does come back).
 */
export async function askPipForWeek(req: PlanAiRequest, signal?: AbortSignal): Promise<PlanAiAnswer | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PLAN_AI_WAIT_MS);
  const onAbort = () => stop.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const token = paidStore.get().token;
  try {
    const res = await fetch(`${API_BASE}plan/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(req),
      signal: stop.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { plan?: { ids?: unknown; why?: unknown } } | null;
    const plan = body?.plan;
    if (!plan || !Array.isArray(plan.ids)) return null;
    return { ids: plan.ids as PlanAiAnswer["ids"], why: typeof plan.why === "string" ? plan.why : "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
