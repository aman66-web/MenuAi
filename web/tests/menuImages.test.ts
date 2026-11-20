import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Chain } from "../lib/mm/types";

// Every dish photo a published menu names must exist (the 20 November 2026 audit, known leftover (h): nothing caught a menu item image with no file, which
// shows a broken tile). The full photo lives in public/menu-images/<chain id>/<file>.webp and its small copy in public/menu-images/thumbs/<chain id>/
// (lib/mm/images.ts). A chain whose photos are deliberately taken down (public/logos/hidden.json lists its id, CLAUDE.md rule 2) may have had its folder
// deleted while its menu still names the files: it is skipped.

const pub = (path: string) => fileURLToPath(new URL(`../public/${path}`, import.meta.url));
const menus = readdirSync(pub("menus")).filter((f) => f.startsWith("chain-") && f.endsWith(".json"));
const hidden = new Set<string>((JSON.parse(readFileSync(pub("logos/hidden.json"), "utf8")) as { hidden?: string[] }).hidden ?? []);

describe("menu photos", () => {
  it("reads the published menus", () => {
    expect(menus.length).toBeGreaterThan(200);
  });
  it("every photo a published menu names has its file, and its small copy where any exist", () => {
    const missing: string[] = [];
    const missingThumbs: string[] = [];
    for (const f of menus) {
      const chain = JSON.parse(readFileSync(pub(`menus/${f}`), "utf8")) as Chain;
      if (hidden.has(chain.id)) continue;
      const thumbsFolder = existsSync(pub(`menu-images/thumbs/${chain.id}`));
      for (const item of chain.items) {
        if (!item.image) continue;
        if (!existsSync(pub(`menu-images/${item.image}`))) missing.push(`${chain.id}: ${item.name} → ${item.image}`);
        else if (thumbsFolder && !existsSync(pub(`menu-images/thumbs/${item.image}`))) missingThumbs.push(`${chain.id}: ${item.image}`);
      }
    }
    expect(missing).toEqual([]);
    expect(missingThumbs).toEqual([]);
  });
  it("names photos only in the form the app reads (<chain id>/<file>.webp, inside that chain's own folder)", () => {
    const odd: string[] = [];
    for (const f of menus) {
      const chain = JSON.parse(readFileSync(pub(`menus/${f}`), "utf8")) as Chain;
      for (const item of chain.items) {
        if (item.image && !new RegExp(`^${chain.id.replace(/[-]/g, "\\-")}/[a-z0-9]+(?:-[a-z0-9]+)*\\.webp$`).test(item.image)) odd.push(`${chain.id}: ${item.image}`);
      }
    }
    expect(odd).toEqual([]);
  });
});
