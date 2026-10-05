import { describe, expect, it } from "vitest";
import { builderHref, chainHref, itemHref } from "../lib/mm/routes";

describe("app URLs (static shells read ids from the query string)", () => {
  it("builds chain, item and builder links", () => {
    expect(chainHref("bowl-and-co")).toBe("/app/chain?id=bowl-and-co");
    expect(itemHref("cluck-house", "waffle-fries")).toBe("/app/item?chain=cluck-house&item=waffle-fries");
    expect(builderHref({ chain: "bowl-and-co", pick: "var-chicken-bowl-310d0919" })).toBe("/app/builder?chain=bowl-and-co&pick=var-chicken-bowl-310d0919");
    expect(builderHref({ chain: "a", saved: "3f2c-uuid" })).toBe("/app/builder?chain=a&saved=3f2c-uuid");
  });
  it("encodes unusual characters and drops empty parts", () => {
    expect(chainHref("a b&c")).toBe("/app/chain?id=a%20b%26c");
    expect(builderHref({ chain: "x", item: "", pick: undefined })).toBe("/app/builder?chain=x");
  });
});
