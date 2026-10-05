import { indexChain, type ChainIndex } from "./chain-index";
import { buildSearchIndex, type SearchIndex } from "./search";
import type { Chain, Manifest, ManifestChain } from "./types";

// Loads menu data (docs/DATA.md): a manifest per source, then chain files on demand. On the web the CDN
// and the service worker do the caching; here we verify each chain file against the manifest's SHA-256, so a
// manifest and chain files from two different deploys are never mixed (we refetch the manifest once, then give up).

export const SUPPORTED_SCHEMA_VERSION = 1;

export interface MenuSource {
  id: "release" | "sample";
  baseUrl: string;
}

export interface CatalogChain extends ManifestChain {
  baseUrl: string;
}

export interface MenuState {
  status: "idle" | "loading" | "ready" | "error";
  chains: CatalogChain[]; // sorted by name
  dataVersion: number | null;
  indexes: ReadonlyMap<string, ChainIndex>; // loaded chains
  searchIndex: SearchIndex;
  error?: string;
}

export interface MenuClientOptions {
  sources: ReadonlyArray<MenuSource>;
  includeSamples: boolean;
  fetch: typeof fetch;
  /** Hex SHA-256 of the bytes, or null when the platform can't (non-secure context): verification is skipped then. */
  sha256?: ((bytes: ArrayBuffer) => Promise<string>) | null;
}

export class MenuLoadError extends Error {}

export async function webCryptoSha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY_SEARCH = buildSearchIndex([]);
const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export class MenuClient {
  private state: MenuState = { status: "idle", chains: [], dataVersion: null, indexes: new Map(), searchIndex: EMPTY_SEARCH };
  private listeners = new Set<() => void>();
  private manifestPromise: Promise<void> | null = null;
  private chainPromises = new Map<string, Promise<ChainIndex>>();
  private allPromise: Promise<void> | null = null;

  constructor(private opts: MenuClientOptions) {}

  // ---- observable state (for useSyncExternalStore)
  getSnapshot = (): MenuState => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(patch: Partial<MenuState>) {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  // ---- manifests
  ensureManifest(force = false): Promise<void> {
    if (force) this.manifestPromise = null;
    this.manifestPromise ??= this.loadManifests();
    return this.manifestPromise;
  }

  private async fetchManifest(source: MenuSource): Promise<Manifest | null> {
    try {
      const res = await this.opts.fetch(`${source.baseUrl}menus-manifest.json`, { cache: "no-cache" });
      if (!res.ok) return null; // 404 before the first publish: not an error
      const manifest = (await res.json()) as Manifest;
      if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION || !Array.isArray(manifest.chains)) return null;
      return manifest;
    } catch {
      return null;
    }
  }

  private async loadManifests(): Promise<void> {
    this.set({ status: "loading", error: undefined });
    const results = await Promise.all(this.opts.sources.map(async (s) => [s, await this.fetchManifest(s)] as const));
    const merged = new Map<string, CatalogChain>();
    let dataVersion: number | null = null;
    let anyManifest = false;
    for (const [source, manifest] of results) {
      if (!manifest) continue;
      anyManifest = true;
      dataVersion = Math.max(dataVersion ?? 0, manifest.dataVersion);
      for (const c of manifest.chains) {
        if (c.sample && !this.opts.includeSamples) continue; // samples never show unless explicitly enabled
        if (!merged.has(c.id)) merged.set(c.id, { ...c, baseUrl: source.baseUrl }); // earlier sources win
      }
    }
    if (!anyManifest && this.opts.sources.length > 0 && this.state.chains.length === 0) {
      // Nothing published AND nothing reachable. If offline with no cache we land here; show an empty-but-honest state.
      this.set({ status: "ready", chains: [], dataVersion: null });
      return;
    }
    this.set({ status: "ready", chains: [...merged.values()].sort(byName), dataVersion });
  }

  // ---- chains
  loadChain(id: string): Promise<ChainIndex> {
    const cached = this.state.indexes.get(id);
    if (cached) return Promise.resolve(cached);
    let p = this.chainPromises.get(id);
    if (!p) {
      p = this.fetchChain(id).finally(() => this.chainPromises.delete(id));
      this.chainPromises.set(id, p);
    }
    return p;
  }

  private async fetchChain(id: string): Promise<ChainIndex> {
    await this.ensureManifest();
    for (let attempt = 0; attempt < 2; attempt++) {
      const entry = this.state.chains.find((c) => c.id === id);
      if (!entry) throw new MenuLoadError("That restaurant isn't available.");
      let res: Response;
      try {
        res = await this.opts.fetch(entry.baseUrl + entry.file);
      } catch {
        throw new MenuLoadError("Couldn't load this menu. Check your connection and try again.");
      }
      if (!res.ok) throw new MenuLoadError("Couldn't load this menu. Please try again.");
      const bytes = await res.arrayBuffer();
      const digest = this.opts.sha256 === undefined ? await safeDigest(bytes) : this.opts.sha256 ? await this.opts.sha256(bytes) : null;
      if (digest !== null && digest !== entry.sha256) {
        // The manifest and the file come from different publishes (or a cache is stale): refresh once.
        if (attempt === 0) {
          await this.ensureManifest(true);
          continue;
        }
        throw new MenuLoadError("Menus are updating. Please try again in a moment.");
      }
      const chain = JSON.parse(new TextDecoder().decode(bytes)) as Chain;
      if (chain.schemaVersion !== SUPPORTED_SCHEMA_VERSION) throw new MenuLoadError("This menu needs a newer version of the app.");
      const index = indexChain(chain);
      const indexes = new Map(this.state.indexes);
      indexes.set(id, index);
      this.set({ indexes, searchIndex: buildSearchIndex([...indexes.values()].map((i) => i.chain)) });
      return index;
    }
    throw new MenuLoadError("Menus are updating. Please try again in a moment.");
  }

  /** Background-load every chain so item search covers the whole menu set. Failures are ignored (works offline). */
  loadAll(): Promise<void> {
    this.allPromise ??= (async () => {
      await this.ensureManifest();
      for (const c of this.state.chains) {
        try {
          await this.loadChain(c.id);
        } catch {
          // keep going: search covers whatever loaded
        }
      }
    })();
    return this.allPromise;
  }

  /** Forget cached chains and manifest so the next read refetches (after "Refresh menus"). */
  invalidate() {
    this.manifestPromise = null;
    this.allPromise = null;
    this.chainPromises.clear();
    this.set({ indexes: new Map(), searchIndex: EMPTY_SEARCH });
  }
}

async function safeDigest(bytes: ArrayBuffer): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null; // insecure origin: skip verification
    return await webCryptoSha256(bytes);
  } catch {
    return null;
  }
}

/** dataVersion is a UTC build time YYYYMMDDHHMMSS → "2026-10-05". */
export function dataVersionDate(version: number): string {
  const s = String(version);
  return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "";
}
