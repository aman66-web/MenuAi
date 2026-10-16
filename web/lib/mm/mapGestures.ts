// Cooperative gestures (one finger scrolls the PAGE, two move the map) are right in the page and wrong in full screen. MapLibre's
// "use two fingers" hint hides itself 100 ms after a blocked gesture, and disable() deletes the node that timer uses: calling disable()
// inside that window throws an uncaught TypeError from the timer (reproduced). So disable waits until 140 ms after the last blocked gesture.
export const GESTURE_SAFE_GAP_MS = 140;

export interface CooperativeTarget {
  cooperativeGestures: { enable(): void; disable(): void; isEnabled(): boolean };
}
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}
export const browserClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

/** full: one finger moves the map. page: one finger scrolls the page, two move the map. Returns a canceller for a switch still waiting. */
export function applyGestureMode(map: CooperativeTarget, full: boolean, lastBlockedAt: () => number, clock: Clock = browserClock): () => void {
  let timer: number | null = null;
  let stopped = false;
  const attempt = () => {
    timer = null;
    if (stopped) return;
    const g = map.cooperativeGestures;
    if (!full) {
      if (!g.isEnabled()) g.enable(); // enable() has no timer hazard: immediate
      return;
    }
    if (!g.isEnabled()) return; // already off
    const quiet = clock.now() - lastBlockedAt();
    if (quiet < GESTURE_SAFE_GAP_MS) {
      timer = clock.setTimeout(attempt, GESTURE_SAFE_GAP_MS - quiet); // re-checked then: a new blocked gesture re-arms the wait
      return;
    }
    g.disable();
  };
  attempt();
  return () => {
    stopped = true;
    if (timer !== null) clock.clearTimeout(timer);
  };
}
