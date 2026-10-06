import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAIN_LOGOS, logoFor } from "../lib/mm/logos";

const pub = new URL("../public", import.meta.url).pathname;

describe("chain logos", () => {
  it("every listed logo exists, is ours to serve from /logos/, and has its source recorded", () => {
    const sources = readFileSync(`${pub}/logos/SOURCES.md`, "utf8");
    for (const [id, logo] of Object.entries(CHAIN_LOGOS)) {
      expect(logo.src).toMatch(new RegExp(`^/logos/${id}\\.(svg|png|webp|jpg)$`));
      expect(existsSync(pub + logo.src), `${logo.src} missing`).toBe(true);
      expect(existsSync(`${pub}/logos/${id}.source.txt`), `${id}.source.txt missing`).toBe(true);
      expect(sources).toContain(`| ${id} | installed |`);
    }
  });
  it("returns nothing for an unknown or missing chain", () => {
    expect(logoFor(undefined)).toBeUndefined();
    expect(logoFor("not-a-chain")).toBeUndefined();
  });
});
