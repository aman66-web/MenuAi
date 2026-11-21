import { indexChain, type ChainIndex } from "./chain-index";
import { tk } from "./i18n";
import { buildNumbersIndex, type CompactNumbersChain, type NumbersIndex } from "./numbers";
import { buildSearchIndex, buildSearchIndexFromCompact, type CompactSearchChain, type SearchIndex } from "./search";
import type { Chain, Manifest, ManifestChain } from "./types";

// Loads menu data (docs/DATA.md): a manifest per source, then chain files on demand. On the web the CDN
// and the service worker do the caching; here we verify each chain file against the manifest's SHA-256, so a
// manifest and chain files from two different deploys are never mixed (we refetch the manifest once, then give up).

export const SUPPORTED_SCHEMA_VERSION = 1;

export interface MenuSource {
  id: "live" | "release" | "sample";
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
  /** True once the compact search file has been loaded: search then covers every chain without loading their menus. */
  searchReady: boolean;
  /**
   * The numbers file, paired with the compact search index (lib/mm/numbers.ts), once somebody asks for it ("Find a restaurant by my numbers").
   * "unavailable" = this source has none, it couldn't be fetched or verified, or search fell back to loading whole menus.
   */
  numbers: NumbersIndex | null;
  numbersStatus: "idle" | "loading" | "ready" | "unavailable";
  /**
   * The last look at the manifests reached every source (each answered with a manifest or with none published). False when one couldn't be reached (offline,
   * the website too slow): Settings' Refresh menus then says it couldn't reach the menus, never "New menus loaded." (the meeting of 21 November 2026, Rosa).
   */
  reachedAll: boolean;
  error?: string;
}

export interface MenuClientOptions {
  sources: ReadonlyArray<MenuSource>;
  includeSamples: boolean;
  fetch: typeof fetch;
  /** Hex SHA-256 of the bytes, or null when the platform can't (non-secure context): verification is skipped then. */
  sha256?: ((bytes: ArrayBuffer) => Promise<string>) | null;
  /** How long to wait for the website ("live" source) before using the copy packed with the app, in ms. The packed copy is never timed. */
  liveTimeouts?: { manifest: number; file: number };
}

export class MenuLoadError extends Error {}

export async function webCryptoSha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY_SEARCH = buildSearchIndex([]);
// Lists sort case-insensitively ("sweetgreen" sits with the S's). Ranking tie-breaks stay code-unit, as the spec requires.
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en-US");

/** The website's manifest gets 3.5 s and each file 8 s before the app opens its own packed copy (the 20 November 2026 audit: no limit at all before). */
export const LIVE_TIMEOUTS = { manifest: 3500, file: 8000 } as const;

type CompactEntry = { baseUrl: string; file: string; sha256: string };
/** What a request gave: the bytes (for a 2xx), or why not. "unreachable" = no network, a timeout or a 5xx; "missing" = any other answer. */
type Fetched = { kind: "ok"; bytes: ArrayBuffer } | { kind: "unreachable" } | { kind: "missing" };

export class MenuClient {
  private state: MenuState = { status: "idle", chains: [], dataVersion: null, indexes: new Map(), searchIndex: EMPTY_SEARCH, searchReady: false, numbers: null, numbersStatus: "idle", reachedAll: true };
  private listeners = new Set<() => void>();
  private manifestPromise: Promise<void> | null = null;
  private chainPromises = new Map<string, Promise<ChainIndex>>();
  private allPromise: Promise<void> | null = null;
  private searchPromise: Promise<void> | null = null;
  private searchEntries: CompactEntry[] = [];
  private numbersEntries: CompactEntry[] = [];
  private numbersPromise: Promise<void> | null = null;
  /** For each chain, the same chain in the later sources (the copy packed with the app, then the samples): opened when the first can't be reached. */
  private alternates = new Map<string, CatalogChain[]>();
  /** For each chain in the compact search index, the source whose search file it came from (its numbers must come from the same source). */
  private compactFrom = new Map<string, string>();
  private searchFellBack = false;
  private onlineHooked = false;
  /** Counts the search and numbers reads begun: a read that a newer one has replaced (a new manifest, the signal back) stops there and changes nothing. */
  private searchReads = 0;
  private numbersReads = 0;

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

  // ---- requests
  private isLive(baseUrl: string): boolean {
    return this.opts.sources.some((s) => s.id === "live" && s.baseUrl === baseUrl);
  }
  private isRelease(baseUrl: string): boolean {
    return this.opts.sources.some((s) => s.id === "release" && s.baseUrl === baseUrl);
  }

  /** One request, its body read too; the website's within its time limit (a request that never answers counts as unreachable). */
  private async request(url: string, live: boolean, limit: number, init?: RequestInit): Promise<Fetched> {
    const go = async (signal?: AbortSignal): Promise<Fetched> => {
      const res = await this.opts.fetch(url, signal ? { ...init, signal } : init);
      if (!res.ok) return res.status >= 500 ? { kind: "unreachable" } : { kind: "missing" };
      return { kind: "ok", bytes: await res.arrayBuffer() };
    };
    try {
      if (!live) return await go();
      const ctl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<Fetched>((resolve) => {
        timer = setTimeout(() => {
          ctl.abort();
          resolve({ kind: "unreachable" });
        }, limit);
      });
      try {
        return await Promise.race([go(ctl.signal), late]);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { kind: "unreachable" };
    }
  }

  private async digest(bytes: ArrayBuffer): Promise<string | null> {
    return this.opts.sha256 === undefined ? await safeDigest(bytes) : this.opts.sha256 ? await this.opts.sha256(bytes) : null;
  }

  private limits() {
    return this.opts.liveTimeouts ?? LIVE_TIMEOUTS;
  }

  /**
   * After a file was taken from the packed copy because the website couldn't be reached: look at the website again when the phone comes back online, and read
   * the search file again after it whenever search had been read or was being read (the meeting of 21 November 2026, Violet #20: only a search that had fallen
   * back was read again, so one under way on the weak signal stayed on the packed copy), unless the new manifest has already begun its own read.
   */
  private refreshWhenOnline() {
    const target = globalThis as { addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void };
    if (this.onlineHooked || typeof target.addEventListener !== "function") return;
    this.onlineHooked = true;
    target.addEventListener("online", () => {
      this.onlineHooked = false;
      const hadSearch = this.searchFellBack || this.compactIndex !== null || this.searchPromise !== null;
      const reads = this.searchReads;
      void this.ensureManifest(true).then(() => {
        if (!hadSearch || this.searchReads !== reads) return;
        this.searchPromise = null;
        void this.ensureSearch();
      });
    }, { once: true });
  }

  // ---- manifests
  ensureManifest(force = false): Promise<void> {
    if (force) this.manifestPromise = null;
    this.manifestPromise ??= this.loadManifests();
    return this.manifestPromise;
  }

  /** A manifest, "absent" (not published, or a version we can't read: not an error), or "unreachable" (no network, or the website too slow). */
  private async fetchManifest(source: MenuSource): Promise<Manifest | "absent" | "unreachable"> {
    const got = await this.request(`${source.baseUrl}menus-manifest.json`, source.id === "live", this.limits().manifest, { cache: "no-cache" });
    if (got.kind === "unreachable") return "unreachable";
    if (got.kind === "missing") return "absent"; // 404 before the first publish is normal
    try {
      const manifest = JSON.parse(new TextDecoder().decode(got.bytes)) as Manifest;
      if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION || !Array.isArray(manifest.chains)) return "absent";
      return manifest;
    } catch {
      return "unreachable";
    }
  }

  private async loadManifests(): Promise<void> {
    // "loading" only while nothing is listed yet: a second look (the signal back, Refresh menus) keeps the restaurants on screen meanwhile (the meeting of
    // 21 November 2026, Violet #20: getting signal back put Eat out and Near me behind a spinner)
    if (this.state.chains.length === 0) this.set({ status: "loading", error: undefined });
    const results = await Promise.all(this.opts.sources.map(async (s) => [s, await this.fetchManifest(s)] as const));
    const merged = new Map<string, CatalogChain>();
    const alternates = new Map<string, CatalogChain[]>();
    const searchEntries: CompactEntry[] = [];
    const numbersEntries: CompactEntry[] = [];
    let dataVersion: number | null = null;
    let unreachable = false;
    for (const [source, manifest] of results) {
      if (manifest === "unreachable") unreachable = true;
      if (typeof manifest === "string") continue;
      if (manifest.search) searchEntries.push({ baseUrl: source.baseUrl, ...manifest.search });
      if (manifest.numbers) numbersEntries.push({ baseUrl: source.baseUrl, ...manifest.numbers });
      let contributed = false;
      for (const c of manifest.chains) {
        if (c.sample && !this.opts.includeSamples) continue; // samples never show unless explicitly enabled
        const entry: CatalogChain = { ...c, baseUrl: source.baseUrl };
        const earlier = merged.get(c.id);
        if (!earlier) merged.set(c.id, entry); // earlier sources win...
        else if (source.id === "release" && this.isLive(earlier.baseUrl) && earlier.sha256 === c.sha256) {
          // ...except that a chain the website hasn't changed (the same SHA-256, so the same bytes) opens from the copy packed with the app: no download
          merged.set(c.id, entry);
          alternates.set(c.id, [earlier, ...(alternates.get(c.id) ?? [])]);
        } else alternates.set(c.id, [...(alternates.get(c.id) ?? []), entry]);
        contributed = true;
      }
      // An empty placeholder manifest is not a publish: "Menus updated" only reflects manifests that list chains.
      if (contributed) dataVersion = Math.max(dataVersion ?? 0, manifest.dataVersion);
    }
    if (merged.size === 0 && unreachable && this.state.chains.length === 0) {
      // We couldn't reach the menus and have nothing earlier: say so, never present it as "no menus exist".
      this.manifestPromise = null; // let the next ensureManifest() try again
      this.set({ status: "error", chains: [], dataVersion: null, reachedAll: false, error: tk("Couldn't reach the menus. Check your connection and try again.") });
      return;
    }
    if (merged.size === 0 && unreachable) {
      this.manifestPromise = null;
      this.set({ status: "ready", reachedAll: false, error: undefined }); // keep what we already had
      return;
    }
    // The website didn't answer in time and only an older copy did (the menus packed with the app): keep the newer menus already here, as above, rather than
    // swap in older ones (the meeting of 21 November 2026, Rosa: Refresh menus on a slow connection did that and said "New menus loaded.").
    if (unreachable && dataVersion !== null && this.state.dataVersion !== null && dataVersion < this.state.dataVersion) {
      this.manifestPromise = null;
      if (results.some(([s, m]) => s.id === "live" && m === "unreachable")) this.refreshWhenOnline();
      this.set({ status: "ready", reachedAll: false, error: undefined });
      return;
    }
    if (unreachable && results.some(([s, m]) => s.id === "live" && m === "unreachable")) this.refreshWhenOnline();
    this.alternates = alternates;
    // A new manifest may mean new search files: a search that had been read (or was being read) is read again from them, and the index from the old ones
    // stays in use until then (the meeting of 21 November 2026, Violet #20: it was dropped and never read again, so search covered only the menus opened).
    // Not on the first load: a search request already waiting on this manifest must stand.
    let searchAgain = false;
    if (JSON.stringify(searchEntries) !== JSON.stringify(this.searchEntries)) {
      if (this.searchEntries.length > 0) {
        searchAgain = this.compactIndex !== null || this.searchPromise !== null;
        this.searchPromise = null;
      }
      this.searchEntries = searchEntries;
    }
    // ...and the numbers paired with it. When the search is read again its new index reads them again too (loadSearch); otherwise they are read again here.
    let numbersAgain = false;
    let numbersPatch: Partial<MenuState> = {};
    if (JSON.stringify(numbersEntries) !== JSON.stringify(this.numbersEntries)) {
      if (this.numbersEntries.length > 0 && !searchAgain) {
        numbersAgain = this.forgetNumbers();
        if (numbersAgain) numbersPatch = { numbers: null, numbersStatus: "idle" };
      }
      this.numbersEntries = numbersEntries;
    }
    this.set({ status: "ready", chains: [...merged.values()].sort(byName), dataVersion, reachedAll: !unreachable, error: undefined, ...numbersPatch, searchReady: this.compactIndex !== null, ...(this.compactIndex ? { searchIndex: this.compactIndex } : {}) });
    if (searchAgain) void this.ensureSearch();
    if (numbersAgain) void this.ensureNumbers();
  }

  /**
   * The numbers are paired with the compact search index dish by dish, so they are forgotten whenever that index is replaced: a read still under way stops
   * (it would sit the numbers against the wrong dishes). True when they had been read or were being read, so the caller reads them again.
   */
  private forgetNumbers(): boolean {
    const wanted = this.state.numbers !== null || this.numbersPromise !== null;
    this.numbersPromise = null;
    this.numbersReads++;
    return wanted;
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
    if (this.state.status === "error") this.manifestPromise = null; // a retry should look for the menus again
    await this.ensureManifest();
    if (this.state.status === "error") throw new MenuLoadError(this.state.error ?? tk("Couldn't load this menu."));
    for (let attempt = 0; attempt < 2; attempt++) {
      const entry = this.state.chains.find((c) => c.id === id);
      if (!entry) throw new MenuLoadError(tk("That restaurant isn't available."));
      // the chain's own source first, then the same chain in a later source: the website unreachable (offline, too slow, down) opens the packed copy
      const candidates = [entry, ...(this.alternates.get(id) ?? [])];
      let offline = false;
      let stale = false;
      for (const [n, c] of candidates.entries()) {
        const got = await this.request(c.baseUrl + c.file, this.isLive(c.baseUrl), this.limits().file);
        if (got.kind !== "ok") {
          offline ||= got.kind === "unreachable";
          continue;
        }
        const digest = await this.digest(got.bytes);
        if (digest !== null && digest !== c.sha256) {
          // The manifest and the file come from different publishes (or a cache is stale)
          if (n === 0) stale = true;
          continue;
        }
        const chain = JSON.parse(new TextDecoder().decode(got.bytes)) as Chain;
        if (chain.schemaVersion !== SUPPORTED_SCHEMA_VERSION) throw new MenuLoadError(tk("This menu needs a newer version of the app."));
        if (n > 0 && this.isLive(entry.baseUrl)) this.refreshWhenOnline();
        const index = indexChain(chain);
        const indexes = new Map(this.state.indexes);
        indexes.set(id, index);
        // With the compact search index loaded it already covers every chain; otherwise search what has been loaded.
        this.set({ indexes, ...(this.compactIndex ? {} : { searchIndex: buildSearchIndex([...indexes.values()].map((i) => i.chain)) }) });
        return index;
      }
      if (stale && attempt === 0) {
        await this.ensureManifest(true); // refresh once
        continue;
      }
      // Offline, the copy kept from an earlier visit is the only one, and waiting won't bring the newer one: say what will (the meeting of 21 November 2026,
      // Violet #25: a saved menu that changed in a newer publish said "Menus are updating")
      const noSignal = typeof navigator !== "undefined" && navigator.onLine === false;
      if (stale && noSignal) throw new MenuLoadError(tk("Couldn't load this menu. Check your connection and try again."));
      if (stale) throw new MenuLoadError(tk("Menus are updating. Please try again in a moment."));
      throw new MenuLoadError(offline ? tk("Couldn't load this menu. Check your connection and try again.") : tk("Couldn't load this menu. Please try again."));
    }
    throw new MenuLoadError(tk("Menus are updating. Please try again in a moment."));
  }

  /**
   * Load the compact search file (one small download listing every chain and item name) so search covers the whole
   * catalogue. If a source has no search file, or it can't be fetched or verified, fall back to loading each chain's
   * menu in the background (the old behaviour), so search still works, just with more data.
   */
  ensureSearch(): Promise<void> {
    this.searchPromise ??= this.loadSearch();
    return this.searchPromise;
  }

  /** Waits for the search to be read, and for a newer read a new manifest began meanwhile: the numbers are paired with the newest index. */
  private async searchSettled(): Promise<void> {
    let p: Promise<void> | null = this.ensureSearch();
    while (p) {
      await p;
      p = this.searchPromise !== p ? this.searchPromise : null;
    }
  }

  private compactIndex: SearchIndex | null = null;

  /** One compact file (search or numbers), verified against its manifest entry, as its chains by id in the file's order; null when it can't be used. */
  private async readCompactFile<C extends { id: string }>(entry: CompactEntry): Promise<Map<string, C> | null> {
    const got = await this.request(entry.baseUrl + entry.file, this.isLive(entry.baseUrl), this.limits().file);
    if (got.kind !== "ok") return null;
    const digest = await this.digest(got.bytes);
    if (digest !== null && digest !== entry.sha256) return null;
    try {
      const doc = JSON.parse(new TextDecoder().decode(got.bytes)) as { schemaVersion: number; chains: C[] };
      if (doc.schemaVersion !== SUPPORTED_SCHEMA_VERSION || !Array.isArray(doc.chains)) return null;
      return new Map(doc.chains.map((c) => [c.id, c]));
    } catch {
      return null;
    }
  }

  /**
   * The compact entries (search or numbers) for every chain in the catalogue, each from the file of the source `baseOf` names for it. Only the files a listed
   * chain needs are read; two sources whose files are identical (the same SHA-256) are read once, from the copy packed with the app; and when the website's
   * file can't be read, its chains come from the packed copy's file instead. Null when a needed file can't be read at all.
   */
  private async readCompact<C extends { id: string }>(entries: readonly CompactEntry[], baseOf: (c: CatalogChain) => string): Promise<{ chains: C[]; from: Map<string, string>; fellBack: boolean } | null> {
    const pick = new Map<string, CompactEntry>(); // sha256 -> the copy to read
    for (const e of entries) {
      const cur = pick.get(e.sha256);
      if (!cur || (this.isLive(cur.baseUrl) && !this.isLive(e.baseUrl))) pick.set(e.sha256, e);
    }
    const files = new Map<string, Promise<Map<string, C> | null>>();
    const load = (e: CompactEntry) => {
      const use = pick.get(e.sha256) ?? e;
      let f = files.get(use.sha256);
      if (!f) files.set(use.sha256, (f = this.readCompactFile<C>(use)));
      return f.then((doc) => (doc ? { doc, base: use.baseUrl } : null));
    };
    const groups = new Map<string, Set<string>>(); // source -> the chain ids it serves
    for (const c of this.state.chains) {
      const b = baseOf(c);
      if (!groups.has(b)) groups.set(b, new Set());
      groups.get(b)!.add(c.id);
    }
    const chains: C[] = [];
    const from = new Map<string, string>();
    let fellBack = false;
    for (const [base, ids] of groups) {
      const own = entries.find((e) => e.baseUrl === base);
      let got = own ? await load(own) : null;
      if (!got && this.isLive(base)) {
        const packed = entries.find((e) => this.isRelease(e.baseUrl));
        got = packed ? await load(packed) : null;
        fellBack ||= got !== null;
      }
      if (!got) return null;
      for (const [id, c] of got.doc) {
        if (!ids.has(id) || from.has(id)) continue; // only what the catalogue lists from this source
        chains.push(c);
        from.set(id, got.base);
      }
    }
    return { chains, from, fellBack };
  }

  private async loadSearch(): Promise<void> {
    const read = ++this.searchReads;
    await this.ensureManifest();
    const got = this.state.chains.length > 0 ? await this.readCompact<CompactSearchChain>(this.searchEntries, (c) => c.baseUrl) : null;
    if (read !== this.searchReads) return; // a newer read has begun (a new manifest, the signal back): that one stands
    if (!got || got.chains.length === 0) {
      this.searchPromise = null; // a later visit may succeed
      if (this.compactIndex) {
        // the index from the menus before, kept while this was read: it doesn't match the new menus, so search covers what is loaded, as on a first look,
        // and the numbers paired with it go too
        const hadNumbers = this.forgetNumbers();
        this.compactIndex = null;
        this.compactFrom = new Map();
        this.set({ searchReady: false, searchIndex: buildSearchIndex([...this.state.indexes.values()].map((i) => i.chain)), ...(hadNumbers ? { numbers: null, numbersStatus: "unavailable" as const } : {}) });
      }
      return this.loadAll();
    }
    this.searchFellBack = got.fellBack;
    if (got.fellBack) this.refreshWhenOnline();
    // replacing an index read before: the numbers paired with it go in the same step (never shown against the new index's dishes) and are read again
    const numbersAgain = this.compactIndex !== null && this.forgetNumbers();
    this.compactFrom = got.from;
    this.compactIndex = buildSearchIndexFromCompact(got.chains);
    this.set({ searchIndex: this.compactIndex, searchReady: true, ...(numbersAgain ? { numbers: null, numbersStatus: "idle" as const } : {}) });
    if (numbersAgain) void this.ensureNumbers();
  }

  /**
   * Load the numbers file (calories, protein, carbs and fat of every item) and pair it with the compact search index, for "Find a restaurant by
   * my numbers". Needs the compact search index (the numbers are listed in its order); without one, or when the file can't be fetched or
   * verified, the state says "unavailable" and the caller says so: nothing is estimated and nothing else depends on it.
   */
  ensureNumbers(): Promise<void> {
    this.numbersPromise ??= this.loadNumbers();
    return this.numbersPromise;
  }

  private async loadNumbers(): Promise<void> {
    const read = ++this.numbersReads;
    this.set({ numbersStatus: "loading" });
    await this.searchSettled();
    if (read !== this.numbersReads) return; // a newer read has begun (a new search index): that one stands
    const compact = this.compactIndex;
    if (!compact || this.numbersEntries.length === 0) {
      this.numbersPromise = null; // a later visit may find the search file
      this.set({ numbersStatus: "unavailable" });
      return;
    }
    // each chain's numbers from the source its search entry came from (they are paired item by item); every source that lists chains must give its
    // numbers: a list built from some of them would quietly leave restaurants out
    const got = await this.readCompact<CompactNumbersChain>(this.numbersEntries, (c) => this.compactFrom.get(c.id) ?? c.baseUrl);
    if (read !== this.numbersReads || compact !== this.compactIndex) return; // ...and never paired with an index they weren't read for
    if (!got || got.chains.length === 0) {
      this.numbersPromise = null;
      this.set({ numbersStatus: "unavailable" });
      return;
    }
    this.set({ numbers: buildNumbersIndex(got.chains, compact), numbersStatus: "ready" });
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
    this.searchPromise = null;
    this.numbersPromise = null;
    this.compactIndex = null;
    this.compactFrom = new Map();
    this.chainPromises.clear();
    this.set({ indexes: new Map(), searchIndex: EMPTY_SEARCH, searchReady: false, numbers: null, numbersStatus: "idle" });
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
