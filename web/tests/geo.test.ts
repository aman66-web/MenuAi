import { describe, expect, it } from "vitest";
import { classifyArea, directionsUrl, distanceMiles, formatMiles, geocode, geocodeUrl, groupByChain, isBranchesDoc, nearbyBranches, parseGeocode, type BranchesDoc } from "../lib/mm/geo";

const doc: BranchesDoc = {
  v: 1,
  generatedOn: "2026-10-06",
  source: "test",
  chains: {
    kfc: [51.5007, -0.1246, 51.52, -0.1, 53.8, -1.55], // Westminster, Islington, Leeds
    greggs: [51.5014, -0.1419, 51.5, -0.12],
  },
};
const westminster = { lat: 51.5007, lng: -0.1246 };

describe("distance", () => {
  it("measures great-circle miles (London to Leeds is about 169 miles)", () => {
    expect(distanceMiles({ lat: 51.5072, lng: -0.1276 }, { lat: 53.8008, lng: -1.5491 })).toBeGreaterThan(165);
    expect(distanceMiles({ lat: 51.5072, lng: -0.1276 }, { lat: 53.8008, lng: -1.5491 })).toBeLessThan(173);
    expect(distanceMiles(westminster, westminster)).toBe(0);
  });
  it("formats short distances with one decimal and long ones whole", () => {
    expect(formatMiles(0.04)).toBe("<0.1 mi");
    expect(formatMiles(0.26)).toBe("0.3 mi");
    expect(formatMiles(2)).toBe("2 mi");
    expect(formatMiles(12.4)).toBe("12 mi");
  });
});

describe("nearby branches", () => {
  it("returns only branches inside the radius, nearest first", () => {
    const near = nearbyBranches(doc, westminster, 2);
    expect(near.length).toBe(4); // Westminster KFC, both Greggs, Islington KFC (about 1.6 miles)
    expect(near[0]).toMatchObject({ chainId: "kfc", miles: 0 });
    expect(near.map((b) => b.miles)).toEqual([...near.map((b) => b.miles)].sort((a, b) => a - b));
    expect(near.some((b) => b.lat === 53.8)).toBe(false); // Leeds is far away
    expect(nearbyBranches(doc, westminster, 1).length).toBe(3);
  });
  it("respects the radius and the chain filter", () => {
    expect(nearbyBranches(doc, westminster, 0.1).length).toBe(1);
    expect(nearbyBranches(doc, westminster, 5, new Set(["greggs"])).every((b) => b.chainId === "greggs")).toBe(true);
    expect(nearbyBranches(doc, westminster, 5, new Set())).toEqual([]);
  });
  it("groups to one row per chain with its nearest branch and the count in range", () => {
    const rows = groupByChain(nearbyBranches(doc, westminster, 5));
    expect(rows.map((r) => [r.chainId, r.branches])).toEqual([["kfc", 2], ["greggs", 2]]); // Leeds is out of range
    expect(rows[0]!.nearest.miles).toBe(0);
  });
  it("accepts only well-formed branch files", () => {
    expect(isBranchesDoc(doc)).toBe(true);
    expect(isBranchesDoc({ v: 1, chains: { a: [1, 2, 3] } })).toBe(false);
    expect(isBranchesDoc(null)).toBe(false);
  });
  it("builds a plain directions link", () => {
    expect(directionsUrl({ lat: 51.5, lng: -0.12 })).toBe("https://www.google.com/maps/dir/?api=1&destination=51.50000,-0.12000");
  });
});

describe("typed areas", () => {
  it("tells postcodes, districts and places apart", () => {
    expect(classifyArea("sw1a 1aa")).toEqual({ kind: "postcode", value: "SW1A1AA" });
    expect(classifyArea("M1 1AE")).toEqual({ kind: "postcode", value: "M11AE" });
    expect(classifyArea("LS6")).toEqual({ kind: "outcode", value: "LS6" });
    expect(classifyArea("  Brixton ")).toEqual({ kind: "place", value: "Brixton" });
    expect(classifyArea("Leeds city centre")).toEqual({ kind: "place", value: "Leeds city centre" });
    expect(classifyArea("x")).toBeNull();
    expect(classifyArea("   ")).toBeNull();
  });
  it("builds the lookup url from only what was typed", () => {
    expect(geocodeUrl({ kind: "postcode", value: "SW1A1AA" })).toBe("https://api.postcodes.io/postcodes/SW1A1AA");
    expect(geocodeUrl({ kind: "place", value: "St Ives" })).toBe("https://api.postcodes.io/places?q=St%20Ives&limit=5");
  });
  it("reads postcodes.io replies and drops anything outside the UK", () => {
    expect(parseGeocode({ kind: "postcode", value: "X" }, { status: 200, result: { postcode: "SW1A 1AA", latitude: 51.50101, longitude: -0.141563 } })).toEqual([{ lat: 51.50101, lng: -0.141563, label: "SW1A 1AA" }]);
    expect(parseGeocode({ kind: "postcode", value: "X" }, { status: 200, result: { postcode: "X", latitude: 40, longitude: 2 } })).toEqual([]);
    const places = parseGeocode({ kind: "place", value: "Leeds" }, { status: 200, result: [
      { name_1: "Leeds", district_borough: "Leeds", latitude: 53.8, longitude: -1.55 },
      { name_1: "Leeds", district_borough: "Maidstone", latitude: 51.25, longitude: 0.63 },
      { name_1: "Leeds", district_borough: "Maidstone", latitude: 51.25, longitude: 0.63 },
    ] });
    expect(places.map((p) => p.label)).toEqual(["Leeds", "Leeds, Maidstone"]);
  });
  it("geocode() reports invalid input, not-found and failures distinctly", async () => {
    expect(await geocode("x")).toBe("invalid");
    const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await geocode("ZZ99 9ZZ", reply(404, { status: 404 }))).toEqual([]);
    expect(await geocode("Leeds", reply(500, {}))).toBe("failed");
    expect(await geocode("Leeds", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("failed");
    expect(await geocode("SW1A 1AA", reply(200, { status: 200, result: { postcode: "SW1A 1AA", latitude: 51.5, longitude: -0.14 } }))).toEqual([{ lat: 51.5, lng: -0.14, label: "SW1A 1AA" }]);
  });
});
