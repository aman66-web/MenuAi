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
    it("ignores sample chains in the search file unless samples are enabled", async () => {
      const c = client(cdn().fetchFn, false);
      await c.ensureSearch();
      expect(search(c.getSnapshot().searchIndex, "chicken").items).toEqual([]);
    });
  });
});
