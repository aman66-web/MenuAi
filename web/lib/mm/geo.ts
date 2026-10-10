// Nearby restaurants (founder's request 2026-10-06). Pure and unit-tested: nothing here reads the user's location itself.
// The phone gets its own position (or a typed area) and works out the nearest branches HERE, on the device, from one static
// file of branch positions (public/branches/branches.json, © OpenStreetMap contributors, ODbL). No coordinates are ever
// sent to us. Typed areas are looked up by postcodes.io (see geocode()); that sends only the text the user typed.

import { englishT, type T } from "./i18n";

export interface LatLng {
  lat: number;
  lng: number;
}

/** public/branches/branches.json: per chain id a flat [lat, lng, lat, lng, ...] array of its UK branches. */
export interface BranchesDoc {
  v: 1;
  generatedOn: string;
  source: string;
  chains: Record<string, number[]>;
}

export interface Branch extends LatLng {
  chainId: string;
  miles: number;
}

export const MILES_RADII = [0.5, 1, 2, 5, 10] as const;
export const DEFAULT_RADIUS_MILES = 2;
export const MAX_MAP_BRANCHES = 400; // pins drawn at once; further ones appear as the radius shrinks or the filters narrow

const EARTH_MILES = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0.3 mi", "1.2 mi", "12 mi": one decimal under 10 miles, whole miles above. Under 0.1 reads "<0.1 mi". */
export function formatMiles(miles: number, t: T = englishT): string {
  if (miles < 0.1) return t("<0.1 mi");
  if (miles < 10) return t("{miles} mi", { miles: (Math.round(miles * 10) / 10).toString() });
  return t("{miles} mi", { miles: Math.round(miles) });
}

export function isBranchesDoc(x: unknown): x is BranchesDoc {
  const d = x as BranchesDoc;
  return !!d && d.v === 1 && typeof d.chains === "object" && d.chains !== null && Object.values(d.chains).every((a) => Array.isArray(a) && a.length % 2 === 0);
}

/**
 * Every branch within `radiusMiles` of `origin` for the allowed chains (null = all), nearest first.
 * A cheap bounding box rejects most of the ~60,000 points before any trigonometry.
 */
export function nearbyBranches(doc: BranchesDoc, origin: LatLng, radiusMiles: number, allowed: ReadonlySet<string> | null = null): Branch[] {
  const dLat = radiusMiles / 69;
  const dLng = radiusMiles / (69.17 * Math.max(0.2, Math.cos(rad(origin.lat))));
  const out: Branch[] = [];
  for (const [chainId, flat] of Object.entries(doc.chains)) {
    if (allowed && !allowed.has(chainId)) continue;
    for (let i = 0; i < flat.length; i += 2) {
      const lat = flat[i]!;
      const lng = flat[i + 1]!;
      if (Math.abs(lat - origin.lat) > dLat || Math.abs(lng - origin.lng) > dLng) continue;
      const miles = distanceMiles(origin, { lat, lng });
      if (miles <= radiusMiles) out.push({ chainId, lat, lng, miles });
    }
  }
  return out.sort((a, b) => a.miles - b.miles || (a.chainId < b.chainId ? -1 : 1));
}

export interface NearbyChain {
  chainId: string;
  nearest: Branch;
  branches: number;
}

/** One row per chain: its nearest branch and how many of its branches are in range, nearest chain first. */
export function groupByChain(branches: readonly Branch[]): NearbyChain[] {
  const byChain = new Map<string, NearbyChain>();
  for (const b of branches) {
    const g = byChain.get(b.chainId);
    if (!g) byChain.set(b.chainId, { chainId: b.chainId, nearest: b, branches: 1 });
    else g.branches += 1;
  }
  return [...byChain.values()].sort((a, b) => a.nearest.miles - b.nearest.miles);
}

/** Opens the branch in the user's maps app (a plain link: nothing is sent until they tap it). */
export function directionsUrl(b: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
}

// ---------------------------------------------------------------- typed areas

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export type AreaQuery = { kind: "postcode"; value: string } | { kind: "outcode"; value: string } | { kind: "place"; value: string };

/** What the user typed: a full postcode (SW1A 1AA), a postcode district (SW1A) or a place name (Leeds, Brixton). */
export function classifyArea(raw: string): AreaQuery | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < 2) return null;
  const compact = text.replace(/\s/g, "");
  if (FULL_POSTCODE.test(text) || FULL_POSTCODE.test(compact)) return { kind: "postcode", value: compact.toUpperCase() };
  if (OUTCODE.test(compact) && compact.length <= 4) return { kind: "outcode", value: compact.toUpperCase() };
  return { kind: "place", value: text };
}

export interface Area extends LatLng {
  label: string;
}

const API = "https://api.postcodes.io";

export function geocodeUrl(q: AreaQuery): string {
  if (q.kind === "postcode") return `${API}/postcodes/${encodeURIComponent(q.value)}`;
  if (q.kind === "outcode") return `${API}/outcodes/${encodeURIComponent(q.value)}`;
  return `${API}/places?q=${encodeURIComponent(q.value)}&limit=5`;
}

interface PostcodesIo {
  status: number;
  result?: unknown;
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Turn a postcodes.io reply into places (empty when nothing matched). Only UK coordinates are accepted. */
export function parseGeocode(q: AreaQuery, body: unknown): Area[] {
  const b = body as PostcodesIo;
  if (!b || b.status !== 200 || !b.result) return [];
  const ok = (lat: unknown, lng: unknown): lat is number => num(lat) && num(lng) && lat > 49.5 && lat < 61.5 && (lng as number) > -9 && (lng as number) < 2.5;
  if (q.kind === "postcode") {
    const r = b.result as { postcode?: string; latitude?: number; longitude?: number };
    return ok(r.latitude, r.longitude) ? [{ lat: r.latitude as number, lng: r.longitude as number, label: r.postcode ?? q.value }] : [];
  }
  if (q.kind === "outcode") {
    const r = b.result as { outcode?: string; latitude?: number; longitude?: number };
    return ok(r.latitude, r.longitude) ? [{ lat: r.latitude as number, lng: r.longitude as number, label: r.outcode ?? q.value }] : [];
  }
  const list = b.result as Array<{ name_1?: string; county_unitary?: string | null; district_borough?: string | null; local_type?: string; latitude?: number; longitude?: number }>;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Area[] = [];
  for (const p of list) {
    if (!p.name_1 || !ok(p.latitude, p.longitude)) continue;
    const where = p.district_borough || p.county_unitary;
    const label = where && where !== p.name_1 ? `${p.name_1}, ${where}` : p.name_1;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ lat: p.latitude as number, lng: p.longitude as number, label });
  }
  return out;
}

/** Look a typed area up (postcode, district or place). `fetchFn` is injectable for tests. */
export async function geocode(raw: string, fetchFn: typeof fetch = fetch): Promise<Area[] | "invalid" | "failed"> {
  const q = classifyArea(raw);
  if (!q) return "invalid";
  try {
    const res = await fetchFn(geocodeUrl(q), { headers: { Accept: "application/json" } });
    if (res.status === 404) return [];
    if (!res.ok) return "failed";
    return parseGeocode(q, await res.json());
  } catch {
    return "failed";
  }
}
