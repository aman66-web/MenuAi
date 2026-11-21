import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dataVersionDate, MenuClient, webCryptoSha256, type MenuSource } from "../lib/mm/menu-client";
import { search } from "../lib/mm/search";
import type { Manifest } from "../lib/mm/types";

const samples = fileURLToPath(new URL("../public/menus-sample/", import.meta.url));
const manifestText = readFileSync(samples + "menus-manifest.json", "utf8");

/** A fake CDN serving the real sample files; `overrides` replaces any path. */
function cdn(overrides: Record<string, string | (() => string) | null> = {}) {
  const hits: string[] = [];
  const fetchFn = (async (input: string) => {
    const url = String(input);
    hits.push(url);
    const o = overrides[url];
    if (o === null) return new Response("not found", { status: 404 });
    if (o !== undefined) return new Response(typeof o === "function" ? o() : o, { status: 200 });
    const m = /^\/menus-sample\/(.+)$/.exec(url);
    if (!m) return new Response("not found", { status: 404 }); // /menus/ (real) has nothing published yet
    try {
      return new Response(readFileSync(samples + m[1]), { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }) as unknown as typeof fetch;
  return { fetchFn, hits };
}
const sources: MenuSource[] = [{ id: "release", baseUrl: "/menus/" }, { id: "sample", baseUrl: "/menus-sample/" }];
const client = (f: typeof fetch, includeSamples = true, sourceList = sources) =>
  new MenuClient({ sources: sourceList, includeSamples, fetch: f, sha256: webCryptoSha256 });

describe("MenuClient", () => {
  it("lists both sample chains (sorted by name) when samples are enabled; real source 404 is not an error", async () => {
    const c = client(cdn().fetchFn);
    await c.ensureManifest();
    const s = c.getSnapshot();
    expect(s.status).toBe("ready");
    expect(s.chains.map((x) => x.id)).toEqual(["bowl-and-co", "cluck-house"]);
    expect(s.chains.every((x) => x.sample)).toBe(true);
    expect(s.dataVersion).toBe((JSON.parse(manifestText) as Manifest).dataVersion);
  });
  it("hides sample chains unless samples are enabled (never in a production release)", async () => {
    const c = client(cdn().fetchFn, false);
    await c.ensureManifest();
    expect(c.getSnapshot().chains).toEqual([]);
    expect(c.getSnapshot().status).toBe("ready");
  });
  it("loads a chain, verifies its SHA-256, and indexes it", async () => {
    const c = client(cdn().fetchFn);
    const ix = await c.loadChain("bowl-and-co");
    expect(ix.chain.name).toBe("Bowl & Co.");
    expect(ix.items.get("chicken-bowl")?.nutrients.calories).toBe(655);
    expect(c.getSnapshot().indexes.has("bowl-and-co")).toBe(true);
  });
  it("fetches a chain only once", async () => {
    const { fetchFn, hits } = cdn();
    const c = client(fetchFn);
    await Promise.all([c.loadChain("cluck-house"), c.loadChain("cluck-house")]);
    await c.loadChain("cluck-house");
    expect(hits.filter((h) => h.endsWith("chain-cluck-house.json"))).toHaveLength(1);
  });
  it("rejects a chain file whose SHA-256 doesn't match the manifest (after refreshing the manifest once)", async () => {
    const tampered = readFileSync(samples + "chain-cluck-house.json", "utf8").replace('"Classic chicken sandwich"', '"Classic chicken sandwich!"');
    const { fetchFn, hits } = cdn({ "/menus-sample/chain-cluck-house.json": tampered });
    const c = client(fetchFn);
    await expect(c.loadChain("cluck-house")).rejects.toThrow(/updating/);
    expect(hits.filter((h) => h.endsWith("menus-manifest.json") && h.includes("sample")).length).toBeGreaterThanOrEqual(2); // refreshed once
    expect(c.getSnapshot().indexes.has("cluck-house")).toBe(false);
  });
  it("recovers when a stale manifest is replaced during the retry", async () => {
    const stale = JSON.parse(manifestText) as Manifest;
    stale.chains.find((x) => x.id === "cluck-house")!.sha256 = "0".repeat(64);
    let manifestCalls = 0;
    const { fetchFn } = cdn({ "/menus-sample/menus-manifest.json": () => (manifestCalls++ === 0 ? JSON.stringify(stale) : manifestText) });
    const c = client(fetchFn);
    const ix = await c.loadChain("cluck-house");
    expect(ix.chain.id).toBe("cluck-house");
  });
  it("offline with nothing cached is an ERROR with a retry, never shown as 'no menus exist'", async () => {
    const offline = new MenuClient({ sources, includeSamples: true, fetch: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, sha256: webCryptoSha256 });
    await offline.ensureManifest();
    expect(offline.getSnapshot().status).toBe("error");
    expect(offline.getSnapshot().error).toMatch(/Couldn't reach the menus/);
    await expect(offline.loadChain("bowl-and-co")).rejects.toThrow(/Couldn't reach the menus/);
  });
  it("recovers when the network comes back (ensureManifest retries after an error)", async () => {
    let online = false;
    const { fetchFn } = cdn();
    const flaky = (async (input: string, init?: RequestInit) => { if (!online) throw new TypeError("offline"); return fetchFn(input, init); }) as unknown as typeof fetch;
    const c = client(flaky);
    await c.ensureManifest();
    expect(c.getSnapshot().status).toBe("error");
    online = true;
    await c.ensureManifest();
    expect(c.getSnapshot().status).toBe("ready");
    expect(c.getSnapshot().chains.map((x) => x.id)).toEqual(["bowl-and-co", "cluck-house"]);
    expect(c.getSnapshot().error).toBeUndefined();
  });
  it("a 5xx from the host counts as unreachable; a 404 means nothing is published (empty, not an error)", async () => {
    const down = cdn({ "/menus-sample/menus-manifest.json": null });
    const notPublished = client(down.fetchFn, true, [{ id: "sample", baseUrl: "/menus-sample/" }]);
    await notPublished.ensureManifest();
    expect(notPublished.getSnapshot().status).toBe("ready");
    expect(notPublished.getSnapshot().chains).toEqual([]);
    const broken = (async () => new Response("oops", { status: 503 })) as unknown as typeof fetch;
    const c = client(broken);
    await c.ensureManifest();
    expect(c.getSnapshot().status).toBe("error");
  });
  it("an empty placeholder manifest is not a publish: no 'Menus updated' date until chains exist", async () => {
    const empty = JSON.stringify({ schemaVersion: 1, dataVersion: 20000101000000, generatedAt: "2000-01-01T00:00:00Z", chains: [] });
    const c = client(cdn({ "/menus/menus-manifest.json": empty, "/menus-sample/menus-manifest.json": null }).fetchFn);
    await c.ensureManifest();
    expect(c.getSnapshot().status).toBe("ready");
    expect(c.getSnapshot().chains).toEqual([]);
    expect(c.getSnapshot().dataVersion).toBeNull();
  });
  it("refuses chains that are not in the catalogue", async () => {
    const online = cdn();
    const c = client(online.fetchFn);
    await c.ensureManifest();
    const offline = new MenuClient({ sources, includeSamples: true, fetch: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, sha256: webCryptoSha256 });
    await expect(c.loadChain("nope")).rejects.toThrow(/isn't available/);
    void offline;
  });
  it("builds a search index from loaded chains and ignores unsupported schema versions", async () => {
    const c = client(cdn().fetchFn);
    await c.loadAll();
    expect(c.getSnapshot().searchIndex.items.length).toBeGreaterThan(15);
    const future = JSON.stringify({ ...JSON.parse(manifestText), schemaVersion: 2 });
    const c2 = client(cdn({ "/menus-sample/menus-manifest.json": future }).fetchFn);
    await c2.ensureManifest();
    expect(c2.getSnapshot().chains).toEqual([]);
  });
  it("release chains win over sample chains with the same id", async () => {
    const release = JSON.parse(manifestText) as Manifest;
    release.chains = release.chains.filter((x) => x.id === "bowl-and-co").map((x) => ({ ...x, name: "Real Bowl", sample: false }));
    const c = client(cdn({ "/menus/menus-manifest.json": JSON.stringify(release) }).fetchFn);
    await c.ensureManifest();
    const bowlEntry = c.getSnapshot().chains.find((x) => x.id === "bowl-and-co")!;
    expect(bowlEntry.baseUrl).toBe("/menus/");
    expect(bowlEntry.name).toBe("Real Bowl");
  });
  it("formats the data version as a date", () => {
    expect(dataVersionDate(20261005150948)).toBe("2026-10-05");
    expect(dataVersionDate(5)).toBe("");
  });

  describe("compact search index", () => {
    it("searches every chain from one small file, without downloading any menu", async () => {
      const { fetchFn, hits } = cdn();
      const c = client(fetchFn);
      await c.ensureSearch();
      await c.ensureSearch();
      const s = c.getSnapshot();
      expect(s.searchReady).toBe(true);
      expect(hits.filter((h) => h.endsWith("menus-search.json"))).toHaveLength(1);
      expect(hits.filter((h) => /chain-.*\.json$/.test(h))).toHaveLength(0);
      const found = search(s.searchIndex, "chicken bowl");
      expect(found.items.map((i) => `${i.chainId}/${i.itemId}`)).toContain("bowl-and-co/chicken-bowl");
      expect(search(s.searchIndex, "cluck").chains.map((x) => x.chainId)).toEqual(["cluck-house"]);
    });
    it("keeps the compact index when a single menu is opened later", async () => {
      const c = client(cdn().fetchFn);
      await c.ensureSearch();
      await c.loadChain("cluck-house");
      expect(c.getSnapshot().searchReady).toBe(true);
      expect(search(c.getSnapshot().searchIndex, "chicken bowl").items.length).toBeGreaterThan(0); // still covers the chain NOT opened
    });
    it("falls back to loading each menu when the search file is missing", async () => {
      const { fetchFn, hits } = cdn({ "/menus-sample/menus-search.json": null });
      const c = client(fetchFn);
      await c.ensureSearch();
      expect(c.getSnapshot().searchReady).toBe(false);
      expect(c.getSnapshot().indexes.size).toBe(2);
      expect(hits.filter((h) => /chain-.*\.json$/.test(h))).toHaveLength(2);
      expect(search(c.getSnapshot().searchIndex, "nuggets").items.length).toBeGreaterThan(0);
    });
    it("falls back when the search file doesn't match the manifest's SHA-256 (never trusts a stale mix)", async () => {
      const real = readFileSync(samples + "menus-search.json", "utf8");
      const c = client(cdn({ "/menus-sample/menus-search.json": real.replace("Chicken bowl", "Chicken bowl!") }).fetchFn);
      await c.ensureSearch();
      expect(c.getSnapshot().searchReady).toBe(false);
      expect(c.getSnapshot().indexes.size).toBe(2);
    });
    it("loads the numbers file once, verified, and pairs it with the search index", async () => {
      const { fetchFn, hits } = cdn();
      const c = client(fetchFn);
      expect(c.getSnapshot().numbersStatus).toBe("idle");
      await c.ensureNumbers();
      await c.ensureNumbers();
      const s = c.getSnapshot();
      expect(s.numbersStatus).toBe("ready");
      expect([...s.numbers!.keys()].sort()).toEqual(["bowl-and-co", "cluck-house"]);
      expect(hits.filter((h) => h.endsWith("menus-numbers.json"))).toHaveLength(1);
      expect(hits.filter((h) => /chain-.*\.json$/.test(h))).toHaveLength(0);
    });
    it("says the numbers are unavailable when the file is missing, doesn't match the manifest, or search fell back to whole menus", async () => {
      const missing = client(cdn({ "/menus-sample/menus-numbers.json": null }).fetchFn);
      await missing.ensureNumbers();
      expect(missing.getSnapshot().numbersStatus).toBe("unavailable");
      expect(missing.getSnapshot().numbers).toBeNull();
      const real = readFileSync(samples + "menus-numbers.json", "utf8");
      const tampered = client(cdn({ "/menus-sample/menus-numbers.json": real.replace("[", "[0,") }).fetchFn);
      await tampered.ensureNumbers();
      expect(tampered.getSnapshot().numbersStatus).toBe("unavailable");
      const noSearch = client(cdn({ "/menus-sample/menus-search.json": null }).fetchFn);
      await noSearch.ensureNumbers();
      expect(noSearch.getSnapshot().numbersStatus).toBe("unavailable");
    });
    it("ignores sample chains in the search file unless samples are enabled", async () => {
      const c = client(cdn().fetchFn, false);
      await c.ensureSearch();
      expect(search(c.getSnapshot().searchIndex, "chicken").items).toEqual([]);
    });
  });

  // The iPhone app asks the website first and keeps a packed copy (lib/mm/config.ts MENU_SOURCES): the 20 November 2026 audit found it downloading every menu
  // the app already holds, waiting with no limit, and never recovering offline.
  describe("the website first, the packed copy when it's the same or can't be reached", () => {
    const LIVE = "https://live.example/menus/";
    const both: MenuSource[] = [{ id: "live", baseUrl: LIVE }, { id: "release", baseUrl: "/menus-sample/" }];
    const sampleManifest = () => JSON.parse(manifestText) as Manifest;
    const make = (f: typeof fetch, limits = { manifest: 200, file: 200 }) => new MenuClient({ sources: both, includeSamples: true, fetch: f, sha256: webCryptoSha256, liveTimeouts: limits });
    const enc = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
    const changedCluck = readFileSync(samples + "chain-cluck-house.json", "utf8").replace('"Classic chicken sandwich"', '"Classic chicken sandwich (new)"');
    async function liveWithChangedCluck() {
      const live = sampleManifest();
      live.chains = live.chains.map((c) => (c.id === "cluck-house" ? { ...c, sha256: "" } : c));
      live.chains.find((c) => c.id === "cluck-house")!.sha256 = await webCryptoSha256(enc(changedCluck));
      return live;
    }

    it("opens a chain the website hasn't changed (same SHA-256) from the packed copy, without downloading it", async () => {
      const { fetchFn, hits } = cdn({ [`${LIVE}menus-manifest.json`]: manifestText });
      const c = make(fetchFn);
      await c.loadChain("bowl-and-co");
      expect(c.getSnapshot().chains.every((x) => x.baseUrl === "/menus-sample/")).toBe(true);
      expect(hits.filter((h) => h.startsWith(LIVE) && /chain-/.test(h))).toEqual([]);
    });
    it("opens a chain the website has changed from the website", async () => {
      const live = await liveWithChangedCluck();
      const { fetchFn, hits } = cdn({ [`${LIVE}menus-manifest.json`]: JSON.stringify(live), [`${LIVE}chain-cluck-house.json`]: changedCluck });
      const c = make(fetchFn);
      const ix = await c.loadChain("cluck-house");
      expect(c.getSnapshot().chains.find((x) => x.id === "cluck-house")!.baseUrl).toBe(LIVE);
      expect(c.getSnapshot().chains.find((x) => x.id === "bowl-and-co")!.baseUrl).toBe("/menus-sample/");
      expect(ix.chain.items.some((i) => i.name === "Classic chicken sandwich (new)")).toBe(true);
      expect(hits).toContain(`${LIVE}chain-cluck-house.json`);
    });
    it("reads the search file once when the website's is the same as the packed one", async () => {
      const { fetchFn, hits } = cdn({ [`${LIVE}menus-manifest.json`]: manifestText });
      const c = make(fetchFn);
      await c.ensureSearch();
      expect(c.getSnapshot().searchReady).toBe(true);
      expect(hits.filter((h) => h.endsWith("menus-search.json"))).toEqual(["/menus-sample/menus-search.json"]);
      await c.ensureNumbers();
      expect(c.getSnapshot().numbersStatus).toBe("ready");
      expect(hits.filter((h) => h.endsWith("menus-numbers.json"))).toEqual(["/menus-sample/menus-numbers.json"]);
    });
    it("a website that never answers falls back to the packed copy within the time limit", async () => {
      const { fetchFn } = cdn();
      const hanging = (async (input: string, init?: RequestInit) => (String(input).startsWith(LIVE) ? new Promise<Response>(() => {}) : fetchFn(input, init))) as unknown as typeof fetch;
      const c = make(hanging, { manifest: 50, file: 50 });
      const started = Date.now();
      const ix = await c.loadChain("cluck-house");
      expect(ix.chain.id).toBe("cluck-house");
      expect(Date.now() - started).toBeLessThan(1500);
      expect(c.getSnapshot().status).toBe("ready");
    });
    it("the website's manifest loads but its chain file can't be reached: the packed copy opens", async () => {
      const live = await liveWithChangedCluck();
      const { fetchFn } = cdn({ [`${LIVE}menus-manifest.json`]: JSON.stringify(live) });
      const flaky = (async (input: string, init?: RequestInit) => {
        if (String(input) === `${LIVE}chain-cluck-house.json`) throw new TypeError("offline");
        return fetchFn(input, init);
      }) as unknown as typeof fetch;
      const c = make(flaky);
      const ix = await c.loadChain("cluck-house");
      expect(ix.chain.items.some((i) => i.name === "Classic chicken sandwich")).toBe(true); // the packed copy's own words
    });
    it("the website's search file can't be reached: the packed search file is used for its chains", async () => {
      const live = await liveWithChangedCluck();
      live.search = { file: "menus-search.json", sha256: "f".repeat(64) };
      const { fetchFn, hits } = cdn({ [`${LIVE}menus-manifest.json`]: JSON.stringify(live), [`${LIVE}menus-search.json`]: null });
      const down = (async (input: string, init?: RequestInit) => (String(input) === `${LIVE}menus-search.json` ? new Response("down", { status: 503 }) : fetchFn(input, init))) as unknown as typeof fetch;
      const c = make(down);
      await c.ensureSearch();
      expect(c.getSnapshot().searchReady).toBe(true);
      expect(search(c.getSnapshot().searchIndex, "cluck").chains.map((x) => x.chainId)).toEqual(["cluck-house"]);
      expect(search(c.getSnapshot().searchIndex, "chicken bowl").items.map((i) => i.itemId)).toContain("chicken-bowl");
      expect(hits.filter((h) => /chain-.*\.json$/.test(h))).toEqual([]); // no menu downloaded to search
    });
    // The meeting of 21 November 2026 (Rosa): Settings' Refresh menus on a slow connection swapped the website's newer menus for the older packed ones and
    // said "New menus loaded."
    it("Refresh with the website unreachable and only an older packed copy keeps the newer menus, and says not every source answered", async () => {
      const live = await liveWithChangedCluck();
      live.dataVersion = sampleManifest().dataVersion + 1;
      let down = false;
      const { fetchFn } = cdn({ [`${LIVE}menus-manifest.json`]: JSON.stringify(live) });
      const flaky = (async (input: string, init?: RequestInit) => (down && String(input).startsWith(LIVE) ? new Response("down", { status: 503 }) : fetchFn(input, init))) as unknown as typeof fetch;
      const c = make(flaky);
      await c.ensureManifest();
      const before = c.getSnapshot();
      expect(before.dataVersion).toBe(live.dataVersion);
      expect(before.reachedAll).toBe(true);
      down = true;
      c.invalidate();
      await c.ensureManifest(true);
      const after = c.getSnapshot();
      expect(after.status).toBe("ready");
      expect(after.dataVersion).toBe(live.dataVersion);
      expect(after.chains).toEqual(before.chains);
      expect(after.chains.find((x) => x.id === "cluck-house")!.baseUrl).toBe(LIVE);
      expect(after.reachedAll).toBe(false);
      // back online: the next look reaches every source again
      down = false;
      await c.ensureManifest(true);
      expect(c.getSnapshot().reachedAll).toBe(true);
    });
    it("a first look with the website unreachable still opens the packed copy (nothing newer to keep), and says not every source answered", async () => {
      const { fetchFn } = cdn();
      const down = (async (input: string, init?: RequestInit) => (String(input).startsWith(LIVE) ? new Response("down", { status: 503 }) : fetchFn(input, init))) as unknown as typeof fetch;
      const c = make(down);
      await c.ensureManifest();
      expect(c.getSnapshot().chains.map((x) => x.id)).toEqual(["bowl-and-co", "cluck-house"]);
      expect(c.getSnapshot().reachedAll).toBe(false);
    });
  });
});
