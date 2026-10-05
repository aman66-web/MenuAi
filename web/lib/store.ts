// The storage interface the API handlers depend on. The real implementation talks to Supabase
// (lib/store-supabase.ts); tests use an in-memory fake. Handlers never import Supabase directly.

export type Table = "waitlist" | "number_reports" | "chain_requests" | "support_messages";

export interface Store {
  /** Rows inserted into `table` by this caller (ip hash) since `sinceIso`. */
  countRecent(table: Table, ipHash: string, sinceIso: string): Promise<number>;
  /** Insert one row and return its id. */
  insert(table: Table, row: Record<string, unknown>): Promise<{ id: string }>;
  /** Insert a waitlist email; silently does nothing if it is already there. */
  insertWaitlist(row: { email: string; source: string | null; ip_hash: string | null }): Promise<void>;
  /** Record where a report's photo will be uploaded. */
  setReportPhotoPath(reportId: string, path: string): Promise<void>;
  /** A short-lived URL the app can PUT a photo to (private bucket). */
  createPhotoUploadUrl(path: string): Promise<{ signedUrl: string }>;
  /** Clear ip_hash on rows older than `beforeIso`; returns how many rows changed. */
  clearIpHashes(table: Table, beforeIso: string): Promise<number>;
}

export const TABLES: Table[] = ["waitlist", "number_reports", "chain_requests", "support_messages"];
export const REPORT_PHOTO_BUCKET = "report-photos";
