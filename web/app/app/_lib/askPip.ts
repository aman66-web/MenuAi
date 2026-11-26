"use client";

import { AI_MESSAGES, aiFailureMessage } from "@/lib/mm/aiConsent";
import { historyFor, parseEvent, DIET_WORDS, type AboutMe, type AskPipRequest, type ChatMessage, type MyDay, type MyPlan, type PipEvent, type PlanHandoff } from "@/lib/mm/askPip";
import { entryMeal, isSameLocalDay, loggedToday } from "@/lib/mm/budget";
import { API_BASE } from "@/lib/mm/config";
import type { Store } from "@/lib/mm/persist";
import { logStore, mealPlanStore, paidStore, pipChatStore, savedRecipesStore, settingsStore } from "@/lib/mm/stores";
import { macroTargets } from "@/lib/mm/targets";
import { ALLERGEN_KEYS, type AllergenKey, type Preferences } from "@/lib/mm/types";

// Ask Pip on the phone (lib/mm/askPip.ts has the shared rules): sends a question with the newest turns of the conversation and what Pip needs to know about the
// person, and writes his streamed answer into the conversation as it comes. Kept outside any screen, so an answer carries on if the chat is closed or the tab
// changes. Only what the chat needs is sent: targets, diet, allergies, supermarkets and the time with every question; today's diary, saved recipes and the
// meal plan go to our server with it, and from there to the AI only when Pip looks them up. Never a name, email or account id.

/** How long the phone waits for a whole answer (the route itself stops at 60 s). */
export const ASK_PIP_WAIT_MS = 70_000;

function memoryStore<T>(initial: T): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  const set = (next: T) => {
    if (Object.is(next, current)) return;
    current = next;
    for (const l of listeners) l();
  };
  return {
    get: () => current,
    getServerSnapshot: () => initial,
    set,
    update: (fn) => set(fn(current)),
    reset: () => set(initial),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Pip is answering: what he is looking at ("doing"), or null while he is thinking. */
export const pipBusyStore = memoryStore<{ doing: Extract<PipEvent, { t: "doing" }> | null } | null>(null);
/** Messages left today, as the server last said (null until it has). */
export const pipLeftStore = memoryStore<number | null>(null);
/** The chat is open (the Pip button on each tab opens the one sheet). */
export const pipOpenStore = memoryStore<boolean>(false);
/** A meal plan Pip set up, waiting for the Meal plan screen to make it (plan/page.tsx takes it once). */
export const pipPlanHandoffStore = memoryStore<PlanHandoff | null>(null);

let inFlight: AbortController | null = null;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ----------------------------------------------------------------------------------------------------------------------- what goes with a question

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The person's diet: the filters they set and what they told us at sign-up, together (Pip warns for both). */
export function dietOf(prefs: Preferences, told?: Preferences): { diet: AboutMe["diet"]; avoid: AllergenKey[] } {
  const on = (k: (typeof DIET_WORDS)[number]) => (prefs as unknown as Record<string, unknown>)[k] === true || (told as unknown as Record<string, unknown> | undefined)?.[k] === true;
  const avoid = new Set([...(prefs.avoidAllergens ?? []), ...(told?.avoidAllergens ?? [])]);
  return { diet: DIET_WORDS.filter(on), avoid: ALLERGEN_KEYS.filter((k) => avoid.has(k)) };
}

export function aboutMe(now = new Date()): AboutMe {
  const s = settingsStore.get();
  const m = macroTargets(s);
  const { diet, avoid } = dietOf(s.preferences, s.toldUs);
  return {
    goal: s.goal,
    kcal: s.dailyCalories,
    protein: m.protein,
    ...(s.dailyCarbs ? { carbs: s.dailyCarbs } : {}),
    ...(s.dailyFat ? { fat: s.dailyFat } : {}),
    ...(s.goal === "glp1" ? { mealCap: s.glp1MealCap } : {}),
    diet,
    avoid,
    shops: (s.shops ?? []).slice(0, 12),
    now: `${WEEKDAY.format(now)} ${TIME.format(now)}`,
  };
}

/** Today's food diary as Home shows it: each entry's logged figures, the day's totals, and what's left of the targets. */
export function myDay(now = new Date()): MyDay | null {
  const s = settingsStore.get();
  const today = logStore.get().filter((e) => isSameLocalDay(new Date(e.loggedAt), now));
  if (!today.length) return null;
  const total = loggedToday(today, now);
  const protein = macroTargets(s).protein;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    entries: today.slice(0, 60).map((e) => ({
      name: e.name.slice(0, 160), meal: entryMeal(e), kcal: Math.round(e.nutrients.calories),
      protein: e.nutrients.protein ?? null, carbs: e.nutrients.carbs ?? null, fat: e.nutrients.fat ?? null, ...(e.estimate ? { estimate: true } : {}),
    })),
    total: { kcal: Math.round(total.calories), protein: r1(total.protein), carbs: r1(total.carbs), fat: r1(total.fat) },
    left: { kcal: Math.round(s.dailyCalories - total.calories), protein: r1(protein - total.protein) },
  };
}

function myPlan(): MyPlan | null {
  const p = mealPlanStore.get();
  if (!p) return null;
  return { start: p.start, slots: (p.slots ?? ["breakfast", "lunch", "dinner"]).slice(0, 6), days: p.ids.slice(0, 14).map((d) => d.slice(0, 6).map((x) => (typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x) ? x : null))) };
}

export function pipRequest(chat: readonly ChatMessage[], now = new Date()): AskPipRequest {
  return {
    messages: historyFor(chat),
    me: aboutMe(now),
    day: myDay(now),
    saved: savedRecipesStore.get().map((r) => r.id).filter((id) => /^[a-z0-9-]{1,80}$/.test(id)).slice(0, 400),
    plan: myPlan(),
  };
}

// ----------------------------------------------------------------------------------------------------------------------- asking

const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) => pipChatStore.update((list) => list.map((m) => (m.id === id ? fn(m) : m)));

/** Asks Pip: the question goes into the conversation, then his answer, written in as it streams. */
export async function askPip(question: string): Promise<void> {
  const text = question.trim().slice(0, 500);
  if (!text || pipBusyStore.get()) return;
  const mine: ChatMessage = { id: newId(), role: "user", text, cards: [], at: Date.now() };
  const reply: ChatMessage = { id: newId(), role: "pip", text: "", cards: [], at: Date.now() };
  pipChatStore.update((list) => [...list, mine]);
  const req = pipRequest(pipChatStore.get());
  pipChatStore.update((list) => [...list, reply]);
  pipBusyStore.set({ doing: null });
  inFlight?.abort();
  const stop = new AbortController();
  inFlight = stop;
  const timer = setTimeout(() => stop.abort(), ASK_PIP_WAIT_MS);
  const fail = (message: string) => patch(reply.id, (m) => ({ ...m, text: m.text ? m.text : message, failed: !m.text && !m.cards.length ? true : m.failed }));
  try {
    const token = paidStore.get().token;
    const res = await fetch(`${API_BASE}pip/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(req),
      signal: stop.signal,
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
      if (res.status === 429 && /today/.test(String(body?.message ?? ""))) pipLeftStore.set(0);
      fail(aiFailureMessage({ status: res.status, ...(typeof body?.message === "string" ? { message: body.message } : {}) }, AI_MESSAGES.busy, navigator.onLine !== false));
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handle(reply.id, parseEvent(line), fail);
      }
      if (done) break;
    }
    if (buffer.trim()) handle(reply.id, parseEvent(buffer.trim()), fail);
    // a stream that ended with nothing in it
    const now = pipChatStore.get().find((m) => m.id === reply.id);
    if (now && !now.text && !now.cards.length) fail(AI_MESSAGES.busy);
  } catch {
    // a cleared chat has no reply left to write into (patch does nothing then)
    fail(aiFailureMessage({ status: 0 }, AI_MESSAGES.busy, navigator.onLine !== false));
  } finally {
    clearTimeout(timer);
    if (inFlight === stop) {
      inFlight = null;
      pipBusyStore.set(null);
    }
  }
}

function handle(id: string, e: PipEvent | null, fail: (message: string) => void): void {
  if (!e) return;
  switch (e.t) {
    case "say": patch(id, (m) => ({ ...m, text: m.text + e.text })); pipBusyStore.set({ doing: null }); break;
    case "doing": pipBusyStore.set({ doing: e }); break;
    case "card": patch(id, (m) => ({ ...m, cards: [...m.cards, e.card] })); break;
    case "end": pipLeftStore.set(e.left); break;
    case "fail": fail(e.message); break;
  }
}

/** Starts the conversation again (and stops an answer on its way). */
export function clearPipChat(): void {
  inFlight?.abort();
  inFlight = null;
  pipBusyStore.set(null);
  pipChatStore.reset();
}
