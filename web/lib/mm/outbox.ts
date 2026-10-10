import { API_BASE, APP_VERSION } from "./config";
import { tk } from "./i18n";
import type { Store } from "./persist";

// SPEC §12: every submission is saved locally first, then sent, so nothing is lost offline.
//  - Send immediately; on success mark `sent`.
//  - Network error, 429 or 5xx: keep `pending`, retry when the app is next active (at most once per 10 minutes),
//    5 attempts max, then `failed`.
//  - 400/413 (and other 4xx) mean an app bug: mark `failed` right away, no retry.
// Request bodies match docs/BACKEND.md exactly.

export type OutboxKind = "report" | "chainRequest" | "support";
export type OutboxStatus = "pending" | "sent" | "failed";

export interface OutboxItem {
  id: string;
  createdAt: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  hasPhoto: boolean;
  status: OutboxStatus;
  attempts: number;
  lastAttemptAt?: string;
  serverId?: string;
  failureReason?: string;
}

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_RETRY_MS = 10 * 60 * 1000;
export const OUTBOX_TIMEOUT_MS = 20_000;
/** After the network returns, a network-failed item is retried at once, but never more often than this. */
export const OUTBOX_RECONNECT_MIN_MS = 60_000;
/** Sent items are only bookkeeping; they are dropped after a day. */
export const OUTBOX_SENT_KEEP_MS = 24 * 60 * 60 * 1000;

const PATH: Record<OutboxKind, string> = { report: "reports", chainRequest: "chain-requests", support: "support" };

// ---- payload builders (docs/BACKEND.md) ----

export const REPORT_FIELDS = [
  { value: "calories", label: tk("Calories") },
  { value: "protein", label: tk("Protein") },
  { value: "carbs", label: tk("Carbs") },
  { value: "fat", label: tk("Fat") },
  { value: "saturatedFat", label: tk("Saturated fat") },
  { value: "sodium", label: tk("Sodium") },
  { value: "sugar", label: tk("Sugar") },
  { value: "fiber", label: tk("Fibre") },
  { value: "other", label: tk("Other") },
] as const;
export type ReportField = (typeof REPORT_FIELDS)[number]["value"];

export function reportPayload(input: {
  chainId: string;
  itemId: string;
  itemName?: string;
  field: ReportField;
  shownValue?: number;
  reportedValue?: number;
  note?: string;
  dataVersion?: number;
  hasPhoto: boolean;
}): Record<string, unknown> {
  const { hasPhoto, note, itemName, ...rest } = input;
  return {
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    ...(itemName ? { itemName } : {}),
    ...(note?.trim() ? { note: note.trim() } : {}),
    appVersion: APP_VERSION,
    ...(hasPhoto ? { photoContentType: "image/jpeg" } : {}),
  };
}

export const chainRequestPayload = (name: string) => ({ name: name.trim(), appVersion: APP_VERSION });

export const supportPayload = (message: string, email?: string) => ({
  message: message.trim(),
  ...(email?.trim() ? { email: email.trim() } : {}),
  source: "web" as const,
  appVersion: APP_VERSION,
});

export const REPORT_THANKS = tk("Thanks — we'll check within 48 hours.");
export const REQUEST_THANKS = tk("Thanks — the most-requested chains get added first.");
export const SUPPORT_THANKS = tk("Thanks — if you left an email, we'll reply soon.");

// ---- sending ----

export interface PhotoStore {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
  delete(id: string): Promise<void>;
}

export interface OutboxDeps {
  store: Store<OutboxItem[]>;
  fetch: typeof fetch;
  now: () => number;
  photos: PhotoStore;
  baseUrl?: string;
  newId?: () => string;
}

export function newOutboxId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class OutboxSender {
  private sending = new Set<string>();
  private readonly baseUrl: string;

  constructor(private deps: OutboxDeps) {
    this.baseUrl = deps.baseUrl ?? API_BASE;
  }

  private patch(id: string, change: Partial<OutboxItem>) {
    this.deps.store.update((items) => items.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }

  /** Save locally first (the user sees the confirmation now), then try to send. */
  async enqueue(kind: OutboxKind, payload: Record<string, unknown>, photo?: Blob): Promise<OutboxItem> {
    const id = (this.deps.newId ?? newOutboxId)();
    const item: OutboxItem = {
      id,
      createdAt: new Date(this.deps.now()).toISOString(),
      kind,
      payload,
      hasPhoto: !!photo,
      status: "pending",
      attempts: 0,
    };
    if (photo) {
      try {
        await this.deps.photos.put(id, photo);
      } catch {
        item.hasPhoto = false;
        delete item.payload.photoContentType; // storage refused the photo: send the report without it
      }
    }
    this.deps.store.update((items) => [...items, item]);
    void this.attempt(id);
    return item;
  }

  /**
   * Retry pending items that are due. Called when the app becomes active (at most once per 10 minutes per item) and
   * when the network comes back: an item that failed because it never reached the server (a network error) is
   * retried at once then, since nothing was rejected.
   */
  async flush(options: { force?: boolean; afterReconnect?: boolean } = {}): Promise<void> {
    const now = this.deps.now();
    this.deps.store.update((items) => {
      const kept = items.filter((i) => !(i.status === "sent" && now - Date.parse(i.createdAt) > OUTBOX_SENT_KEEP_MS));
      return kept.length === items.length ? items : kept;
    });
    const due = this.deps.store
      .get()
      .filter(
        (i) =>
          i.status === "pending" &&
          (options.force ||
            !i.lastAttemptAt ||
            now - Date.parse(i.lastAttemptAt) >= OUTBOX_RETRY_MS ||
            (options.afterReconnect && i.failureReason === "network" && now - Date.parse(i.lastAttemptAt) >= OUTBOX_RECONNECT_MIN_MS)),
      );
    await Promise.all(due.map((i) => this.attempt(i.id)));
  }

  async attempt(id: string): Promise<OutboxStatus | undefined> {
    const item = this.deps.store.get().find((i) => i.id === id);
    if (!item || item.status !== "pending" || this.sending.has(id)) return item?.status;
    this.sending.add(id);
    try {
      return await this.send(item);
    } finally {
      this.sending.delete(id);
    }
  }

  private async send(item: OutboxItem): Promise<OutboxStatus> {
    const attempts = item.attempts + 1;
    const lastAttemptAt = new Date(this.deps.now()).toISOString();
    const retryLater = (reason: string): OutboxStatus => {
      const status: OutboxStatus = attempts >= OUTBOX_MAX_ATTEMPTS ? "failed" : "pending";
      this.patch(item.id, { attempts, lastAttemptAt, status, failureReason: reason });
      if (status === "failed") void this.deps.photos.delete(item.id).catch(() => undefined);
      return status;
    };

    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OUTBOX_TIMEOUT_MS);
    try {
      response = await this.deps.fetch(this.baseUrl + PATH[item.kind], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
        signal: controller.signal,
      });
    } catch {
      return retryLater("network");
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429 || response.status === 408 || response.status >= 500) return retryLater(`http_${response.status}`);
    if (response.status >= 400) {
      // 400/413: an app bug, never retried. Other 4xx are treated the same way.
      this.patch(item.id, { attempts, lastAttemptAt, status: "failed", failureReason: `http_${response.status}` });
      void this.deps.photos.delete(item.id).catch(() => undefined);
      return "failed";
    }

    let body: { id?: string; photoUpload?: { url: string; method: string; headers: Record<string, string> } } = {};
    try {
      body = await response.json();
    } catch {
      // a 2xx without JSON still counts as sent
    }
    // A sent item keeps no content: the message, email and notes are not left behind in this browser.
    this.patch(item.id, { attempts, lastAttemptAt, status: "sent", payload: {}, ...(body.id ? { serverId: body.id } : {}), failureReason: undefined });
    await this.uploadPhoto(item, body.photoUpload);
    return "sent";
  }

  /** The report is saved either way: a failed photo upload never re-sends the report. */
  private async uploadPhoto(item: OutboxItem, upload?: { url: string; method: string; headers: Record<string, string> }) {
    if (!item.hasPhoto) return;
    try {
      const blob = await this.deps.photos.get(item.id);
      if (blob && upload) {
        await this.deps.fetch(upload.url, { method: upload.method || "PUT", headers: upload.headers, body: blob });
      }
    } catch {
      // ignore: the report itself was delivered
    } finally {
      await this.deps.photos.delete(item.id).catch(() => undefined);
    }
  }

  /** Forget everything (Settings › Clear data on this device), photos included. */
  clear() {
    for (const i of this.deps.store.get()) void this.deps.photos.delete(i.id).catch(() => undefined);
    this.deps.store.reset();
  }

  remove(id: string) {
    this.deps.store.update((items) => items.filter((i) => i.id !== id));
    void this.deps.photos.delete(id).catch(() => undefined);
  }
}

export function sanitizeOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is OutboxItem =>
      typeof i === "object" && i !== null && typeof (i as OutboxItem).id === "string" &&
      ["report", "chainRequest", "support"].includes((i as OutboxItem).kind) &&
      ["pending", "sent", "failed"].includes((i as OutboxItem).status) &&
      typeof (i as OutboxItem).payload === "object",
  );
}

/** "Email instead" for failed items (SPEC §12): a mailto link with the same content. */
export function mailtoFor(item: OutboxItem, supportEmail: string): string {
  const p = item.payload as Record<string, unknown>;
  const lines =
    item.kind === "report"
      ? [`Report a number — ${p.itemName ?? p.itemId} (${p.chainId})`, `Field: ${p.field}`, `Shown: ${p.shownValue ?? "-"}`, `Correct: ${p.reportedValue ?? "-"}`, `Note: ${p.note ?? ""}`]
      : item.kind === "chainRequest"
        ? [`Please add this chain: ${p.name}`]
        : [String(p.message ?? ""), p.email ? `Reply to: ${p.email}` : ""];
  const subject = item.kind === "report" ? "Report a number" : item.kind === "chainRequest" ? "Chain request" : "Support";
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.filter(Boolean).join("\n"))}`;
}
