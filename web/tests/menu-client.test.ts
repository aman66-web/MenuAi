import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dataVersionDate, MenuClient, webCryptoSha256, type MenuSource } from "../lib/mm/menu-client";
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
  it("is ready-but-empty when offline with nothing cached, and refuses unknown chains", async () => {
    const online = cdn();
    const c = client(online.fetchFn);
    await c.ensureManifest();
    const offline = new MenuClient({ sources, includeSamples: true, fetch: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, sha256: webCryptoSha256 });
    await offline.ensureManifest();
    expect(offline.getSnapshot().status).toBe("ready");
    expect(offline.getSnapshot().chains).toEqual([]);
    await expect(c.loadChain("nope")).rejects.toThrow(/isn't available/);
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
});
