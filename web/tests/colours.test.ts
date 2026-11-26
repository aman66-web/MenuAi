import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { COLOUR_SCHEMES, DEFAULT_COLOUR_SCHEME } from "../lib/mm/colourSchemes";

// The colour meeting's enforcement (19 November 2026, approved by the founder that day: "Do whatever you think is best"). Two promises, checked on every
// .ts and .tsx file under app/app and lib/mm:
//  1. Every colour comes from a token in app/globals.css. No raw hex, no rgb()/rgba()/hsl(), no Tailwind palette colour (bg-white, text-white/75,
//     bg-black/60, text-zinc-500 and so on), no bg-[#…]/text-[#…], no named colour (white, black) in an arbitrary value or a colour attribute, and the
//     body's text colour never as a fill (bg-foreground: ink is the one dark fill). Only the allow-list below may hold a raw colour, and each entry says why.
//     Comments are not read (the source is parsed, so only real strings, class names and attributes count).
//  2. Every pair is readable: each text token reads at 4.5:1 or more on every surface it is meant for, each edge, ring, tick or progress colour stands out
//     at 3:1 or more against what is next to it, and every text-and-fill pair written together in the code (one class string, the same state) reads at
//     4.5:1 too. A token the code uses as text or as an edge that isn't in the tables below fails, so a new pair is checked the day it appears.
// tests/colourTokens.test.ts checks the tokens' own values; this file checks how the code uses them.

const CSS = readFileSync("app/globals.css", "utf8");

/** The custom properties declared in every top-level rule whose selector is exactly `selector`, later ones winning. */
function declared(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const m of CSS.matchAll(new RegExp(`^${escaped} \\{([\\s\\S]*?)^\\}`, "gm"))) {
    for (const d of m[1]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  }
  return out;
}

const ROOT = declared(":root");
const APP = { ...ROOT, ...declared(":root:has(.app-surface)") };
const DARK = { ...APP, ...declared(".truth-dark") };
type Theme = Record<string, string>;

/** Tailwind's colour names (bg-ink, text-on-sun, border-edge …) and the token each one reads, from the @theme block. */
const THEME_BLOCK = /@theme inline \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
const UTILITY_TOKEN = new Map([...THEME_BLOCK.matchAll(/--color-([\w-]+):\s*var\((--[\w-]+)\)/g)].map((m) => [m[1]!, m[2]!]));

/** A token's value, following var() references within the same theme; null when it isn't one solid #rrggbb (a translucent scrim, a photo chip). */
function solid(theme: Theme, name: string, seen = new Set<string>()): string | null {
  const v = theme[name];
  if (!v) throw new Error(`${name} is not declared in globals.css`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) {
    if (seen.has(ref[1]!)) throw new Error(`${name}: a loop`);
    seen.add(ref[1]!);
    return solid(theme, ref[1]!, seen);
  }
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}
function colour(theme: Theme, name: string): string {
  const c = solid(theme, name);
  if (!c) throw new Error(`${name} is ${theme[name]}, not a solid #rrggbb`);
  return c;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The source files, parsed (so comments never count), with every string a colour could hide in.

const ROOTS = ["app/app", "lib/mm"];
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}
const FILES = ROOTS.flatMap((r) => sources(r));

type Str = { text: string; line: number; attr?: string; prop?: string };
const STRINGS = new Map<string, Str[]>();
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Str[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const s: Str = { text: node.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 };
      const p = node.parent;
      if (p && ts.isJsxAttribute(p)) s.attr = p.name.getText(sf);
      if (p && ts.isPropertyAssignment(p) && p.initializer === node) s.prop = p.name.getText(sf).replace(/^["']|["']$/g, "");
      out.push(s);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  STRINGS.set(file, out);
}

/** The utility part of one class (`hover:bg-ink!` → `bg-ink`, `[&>span]:bg-card` → `bg-card`), a colon inside brackets kept. */
function utility(cls: string): { variant: string; util: string } {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) cut = i;
  }
  const variant = cut < 0 ? "" : cls.slice(0, cut + 1);
  const util = cls.slice(cut + 1).replace(/^!|!$/g, "").replace(/^-/, "");
  return { variant, util };
}
const classesOf = (s: string) => s.split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1. No raw colours outside the allow-list.

/**
 * The only places a raw colour may be written, and why. `any`: fixed art that a token sweep must never touch. `values`: exactly these platform colours.
 * `tokenValues`: places CSS variables can't reach (a canvas, MapLibre's paint, the page's theme-colour metadata), which may write a colour only as the
 * value a token has in globals.css, so nothing off the palette gets in there either.
 */
const ALLOWED: Record<string, { why: string; any?: true; values?: string[]; tokenValues?: true }> = {
  "app/app/_components/Mascot.tsx": { why: "Pip is fixed brand art (colour meeting: never touched by a token sweep)", any: true },
  "app/app/_components/WaterBottle.tsx": { why: "the water bottle drawing in water's own blues and its glass", any: true },
  "app/app/_components/AddWaterSheet.tsx": { why: "water's blue inside the glass and bottle glyphs", values: ["#38b6ef"] },
  "app/app/_components/SignIn.tsx": {
    why: "Sign in with Apple's black button with white words, and Google's white button with its #1f1f1f words and four-colour G (both companies' rules)",
    values: ["#ea4335", "#4285f4", "#fbbc05", "#34a853", "#1f1f1f", "bg-black", "text-white", "bg-white"],
  },
  "app/app/map/MapView.tsx": { why: "MapLibre's paint and the logo tiles drawn on a canvas take literal colours; the 'you' dot is the platform's blue", values: ["#3b82f6"], tokenValues: true },
  "app/app/_lib/share-card.ts": { why: "the share card is drawn on a canvas", tokenValues: true },
  "app/app/_lib/truth-card.ts": { why: "the saved Truth image is drawn on a canvas (the FSA lights are --tl-* tokens)", tokenValues: true },
  "app/app/layout.tsx": { why: "the page's theme-colour metadata", tokenValues: true },
};

/** Every value a token has anywhere in globals.css (any theme), lower case and without spaces: what a tokenValues file may write. */
const TOKEN_VALUES = new Set([...CSS.matchAll(/(--[\w-]+):\s*([^;{}]+);/g)].map((m) => m[2]!.trim().toLowerCase().replace(/\s+/g, "")));

const HEX = /(?<![A-Za-z0-9&#])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const COLOUR_FN = /(?<![A-Za-z0-9-])(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\([^)]*\)/gi;
const PALETTE = "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTILITY = "bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|divide|decoration|placeholder|from|to|via|caret|accent|shadow|inset-shadow|drop-shadow";
const PALETTE_CLASS = new RegExp(`^(?:${COLOUR_UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/[\\d.]+)?$`);
const NAMED = "white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|maroon|olive|teal|aqua|fuchsia|lime";
const NAMED_IN_BRACKETS = new RegExp(`\\[[^\\]]*(?<![A-Za-z0-9-])(?:${NAMED})(?![A-Za-z0-9-])[^\\]]*\\]`, "i");
const NAMED_VALUE = new RegExp(`^(?:${NAMED})$`, "i");
const COLOUR_ATTRS = new Set(["fill", "stroke", "color", "stopColor", "floodColor", "lightingColor"]);
const COLOUR_PROPS = new Set(["color", "background", "backgroundColor", "borderColor", "outlineColor", "fill", "stroke", "caretColor", "accentColor", "textDecorationColor", "stopColor", "fillStyle", "strokeStyle", "shadowColor"]);
const TEXT_AS_FILL = /^(?:bg|from|via|to)-foreground(?:\/[\d.]+)?$/;

/** Every raw colour in one file that its allow-list entry doesn't cover, as "line: what". */
function rawColours(file: string): string[] {
  const allow = ALLOWED[file];
  if (allow?.any) return [];
  const ok = (value: string) => {
    const v = value.toLowerCase().replace(/\s+/g, "");
    return Boolean(allow?.values?.includes(v) || (allow?.tokenValues && TOKEN_VALUES.has(v)));
  };
  const found: string[] = [];
  for (const s of STRINGS.get(file) ?? []) {
    for (const m of s.text.matchAll(HEX)) if (!ok(m[0])) found.push(`${s.line}: raw hex ${m[0]}`);
    for (const m of s.text.matchAll(COLOUR_FN)) if (!ok(m[0])) found.push(`${s.line}: raw ${m[0]}`);
    if ((s.attr && COLOUR_ATTRS.has(s.attr)) || (s.prop && COLOUR_PROPS.has(s.prop))) {
      if (NAMED_VALUE.test(s.text.trim()) && !ok(s.text)) found.push(`${s.line}: the named colour "${s.text}" in ${s.attr ?? s.prop}`);
    }
    for (const cls of classesOf(s.text)) {
      const { util } = utility(cls);
      if (PALETTE_CLASS.test(util) && !ok(util)) found.push(`${s.line}: Tailwind palette colour ${cls}`);
      else if (NAMED_IN_BRACKETS.test(util) && !ok(util)) found.push(`${s.line}: a named colour in ${cls}`);
      if (TEXT_AS_FILL.test(util)) found.push(`${s.line}: the body's text colour as a fill (${cls}): use bg-ink with text-on-ink`);
    }
  }
  return found;
}

describe("every colour comes from a token", () => {
  it("finds the files (app/app and lib/mm)", () => {
    expect(FILES.length).toBeGreaterThan(200);
    for (const f of Object.keys(ALLOWED)) expect(FILES, `allow-list entry ${f}`).toContain(f);
  });

  for (const file of FILES) {
    it(`${file}: no raw hex, rgb(), Tailwind palette colour or named colour`, () => {
      expect(rawColours(file)).toEqual([]);
    });
  }

  it("the scanner catches what it should (and leaves comments, words and anchors alone)", () => {
    const probe = (text: string) => {
      STRINGS.set("probe.tsx", [{ text, line: 1 }]);
      try { return rawColours("probe.tsx").length; } finally { STRINGS.delete("probe.tsx"); }
    };
    for (const bad of ["bg-white", "hover:text-white/75", "bg-black/60", "text-zinc-500", "bg-[#111]", "text-[#1f1f1f]", "#fff", "#d6efa0", "shadow-[0_1px_2px_rgba(0,0,0,0.1)]", "rgba(0, 0, 0, 0.5)", "hsl(0 0% 0%)", "bg-[color-mix(in_srgb,var(--ink)_80%,white)]", "bg-foreground text-background", "[&>span]:bg-white"]) {
      expect(probe(bad), bad).toBeGreaterThan(0);
    }
    for (const fine of ["bg-card text-foreground border-edge", "bg-ink/60", "text-[0.9375rem]", "bg-[var(--fill)]", "#add-food", "Rank #1", "white bread", "text-white-space", "&#123;"]) {
      expect(probe(fine), fine).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2. Every pair is readable.

const LIGHT = ["--background", "--card", "--tint-plan", "--tint-cook"];
const ON_INK = ["--ink"];

/** Each text token and the surfaces it is meant to sit on (the colour meeting's palette roles), all at 4.5:1 or more. */
const TEXT_ON: Record<string, string[]> = {
  "--foreground": [...LIGHT, "--line", "--soft-strong", "--note-bg", "--danger-bg", "--sun", "--tl-green", "--tl-amber", "--tl-red", "--tl-grey"],
  "--muted": [...LIGHT, "--line", "--soft-strong"],
  "--ink": [...LIGHT, "--line", "--sun"],
  "--accent": ["--background", "--card"],
  "--danger": ["--background", "--card", "--danger-bg"],
  "--placeholder": ["--card"],
  "--note-edge": ["--note-bg", "--card"],
  "--on-sun": ["--sun"],
  "--on-accent": ["--sun"],
  "--on-danger": ["--danger"],
  "--on-ink": [...ON_INK, "--ink-pressed"],
  "--on-ink-2": ON_INK,
  "--sun": ON_INK,
  "--tl-ink": ["--tl-green", "--tl-amber", "--tl-red", "--tl-grey"],
};

/** Each colour used as an edge, a ring, a tick or a focus outline, and what is next to it, all at 3:1 or more (WCAG 1.4.11). */
const EDGE_ON: Record<string, string[]> = {
  "--edge": LIGHT,
  "--on-sun": [...LIGHT, "--sun"],
  "--on-accent": [...LIGHT, "--sun"],
  "--ink": LIGHT,
  "--foreground": LIGHT,
  "--accent": ["--background", "--card"],
  "--danger": ["--background", "--card", "--danger-bg"],
  "--note-edge": ["--note-bg", "--card"],
  "--on-ink": ON_INK,
  "--on-ink-2": ON_INK,
  "--sun": ON_INK,
  "--ring-track": ON_INK,
};

/** Lines that only group or separate (a card's 1px line, the white gap round a stacked picture): not a control's edge, so no 3:1 is owed. */
const STRUCTURAL = new Set(["--line", "--soft-strong", "--card", "--background", "--fill", "--soft", "--tint-cook", "--tint-plan"]);

/** Progress and its track (colour meeting: lime on mid grey on ink, sun-deep on line on light surfaces). */
const PROGRESS: [fill: string, next: string][] = [["--bar", "--line"], ["--bar", "--card"], ["--bar", "--background"], ["--sun", "--ring-track"], ["--ring-track", "--ink"]];

function checkPairs(theme: Theme, table: Record<string, string[]>, min: number) {
  const failing: string[] = [];
  for (const [fore, backs] of Object.entries(table)) {
    for (const back of backs) {
      const r = ratio(colour(theme, fore), colour(theme, back));
      if (r < min) failing.push(`${fore} on ${back}: ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  }
  return failing;
}

/** A colour class's token (`text-on-sun` → --on-sun, `border-[color:var(--edge)]` → --edge), or null for a size, an alignment or a palette colour. */
function tokenOf(util: string, prefix: RegExp): { token: string; alpha: boolean } | null {
  const m = new RegExp(`^(?:${prefix.source})-(.+?)(\\/[\\d.]+)?$`).exec(util);
  if (!m) return null;
  const name = m[1]!;
  const arbitrary = /^\[(?:color:)?var\((--[\w-]+)(?:,[^)]*)?\)\]$/.exec(name);
  const token = arbitrary ? arbitrary[1]! : UTILITY_TOKEN.get(name);
  return token ? { token, alpha: Boolean(m[2]) } : null;
}
const TEXT = /text/;
const FILL = /bg/;
const EDGE = /border(?:-[xytrblse])?|ring|outline|divide/;

/** Every text-and-fill pair written in one class string, per state (a hover or a pressed state falls back on the plain one), as [text, fill, where]. */
function codePairs(): [string, string, string][] {
  const pairs: [string, string, string][] = [];
  for (const [file, strings] of STRINGS) {
    for (const s of strings) {
      const states = new Map<string, { text?: string; fill?: string; skip?: boolean }>();
      for (const cls of classesOf(s.text)) {
        const { variant, util } = utility(cls);
        const st = states.get(variant) ?? {};
        const text = tokenOf(util, TEXT);
        const fill = tokenOf(util, FILL);
        if (text) { if (text.alpha) st.skip = true; st.text = text.token; }
        if (fill) { if (fill.alpha) st.skip = true; st.fill = fill.token; }
        states.set(variant, st);
      }
      const base = states.get("") ?? {};
      for (const [variant, st] of states) {
        const text = st.text ?? base.text;
        const fill = st.fill ?? base.fill;
        if (!text || !fill || st.skip || base.skip) continue;
        if (variant && !st.text && !st.fill) continue;
        pairs.push([text, fill, `${file}:${s.line} ${variant}`]);
      }
    }
  }
  return pairs;
}

/** Every token the code uses as text, and every token it uses as an edge, with where. */
function usedAs(prefix: RegExp): Map<string, string> {
  const used = new Map<string, string>();
  for (const [file, strings] of STRINGS) {
    for (const s of strings) {
      for (const cls of classesOf(s.text)) {
        const t = tokenOf(utility(cls).util, prefix);
        if (t && !used.has(t.token)) used.set(t.token, `${file}:${s.line} (${cls})`);
      }
    }
  }
  return used;
}

describe("every pair is readable (the app's light theme)", () => {
  it("each text token reads at 4.5:1 or more on every surface it is meant for", () => {
    expect(checkPairs(APP, TEXT_ON, 4.5)).toEqual([]);
  });

  it("each edge, ring, tick and focus colour stands out at 3:1 or more against what is next to it", () => {
    expect(checkPairs(APP, EDGE_ON, 3)).toEqual([]);
  });

  it("progress stands out at 3:1 or more against its track and the surface round it", () => {
    const failing = PROGRESS.map(([a, b]) => [a, b, ratio(colour(APP, a), colour(APP, b))] as const).filter(([, , r]) => r < 3);
    expect(failing.map(([a, b, r]) => `${a} next to ${b}: ${r.toFixed(2)}:1`)).toEqual([]);
  });

  it("every token the code writes words in is in the text table (so its surfaces are checked)", () => {
    const unknown = [...usedAs(TEXT)].filter(([token]) => !TEXT_ON[token]).map(([token, where]) => `${token}, first at ${where}`);
    expect(unknown).toEqual([]);
  });

  it("every token the code draws an edge, ring or outline in is in the edge table or is a structural line", () => {
    const unknown = [...usedAs(EDGE)].filter(([token]) => !EDGE_ON[token] && !STRUCTURAL.has(token)).map(([token, where]) => `${token}, first at ${where}`);
    expect(unknown).toEqual([]);
  });

  it("finds the pairs written in the code, and would catch a bad one", () => {
    expect(codePairs().length).toBeGreaterThan(100);
    STRINGS.set("probe.tsx", [{ text: "bg-ink text-on-ink disabled:bg-line hover:bg-ink-pressed", line: 1 }]);
    try {
      const probe = codePairs().filter(([, , where]) => where.startsWith("probe.tsx"));
      expect(probe.map(([text, fill, where]) => `${where.trim()} ${text} ${fill}`)).toEqual([
        "probe.tsx:1 --on-ink --ink",
        "probe.tsx:1 disabled: --on-ink --line",
        "probe.tsx:1 hover: --on-ink --ink-pressed",
      ]);
      expect(ratio(colour(APP, "--on-ink"), colour(APP, "--line"))).toBeLessThan(4.5); // so the check below would fail on it
    } finally {
      STRINGS.delete("probe.tsx");
    }
  });

  it("every text-and-fill pair written together in the code reads at 4.5:1 or more", () => {
    const failing: string[] = [];
    for (const [text, fill, where] of codePairs()) {
      const a = solid(APP, text);
      const b = solid(APP, fill);
      if (!a || !b) continue; // a translucent fill (scrim, photo chip): what shows through decides, checked by eye
      const r = ratio(a, b);
      if (r < 4.5) failing.push(`${where}: ${text} on ${fill} is ${r.toFixed(2)}:1`);
    }
    expect(failing).toEqual([]);
  });
});

// Every colour scheme (founder 2026-11-26; lib/mm/colourSchemes.ts) over the app's own colours: the same tables and every pair written in the code.
describe("every pair is readable in every colour scheme", () => {
  for (const id of COLOUR_SCHEMES.filter((x) => x !== DEFAULT_COLOUR_SCHEME)) {
    const theme: Theme = { ...APP, ...declared(`:root[data-scheme="${id}"]:has(.app-surface), .scheme-${id}`) };
    it(`${id}: text 4.5:1, edges and progress 3:1, and every text-and-fill pair in the code 4.5:1`, () => {
      expect(theme["--sun"], `${id} has its own rule`).not.toBe(APP["--sun"]);
      expect(checkPairs(theme, TEXT_ON, 4.5)).toEqual([]);
      expect(checkPairs(theme, EDGE_ON, 3)).toEqual([]);
      expect(PROGRESS.filter(([a, b]) => ratio(colour(theme, a), colour(theme, b)) < 3)).toEqual([]);
      const failing: string[] = [];
      for (const [text, fill, where] of codePairs()) {
        const a = solid(theme, text);
        const b = solid(theme, fill);
        if (!a || !b) continue;
        const r = ratio(a, b);
        if (r < 4.5) failing.push(`${where}: ${text} on ${fill} is ${r.toFixed(2)}:1`);
      }
      expect(failing).toEqual([]);
    });
  }
});

describe("every pair is readable (the Truth card's ink theme, .truth-dark)", () => {
  it("words read at 4.5:1 or more and edges stand out at 3:1 or more", () => {
    const surfaces = ["--background", "--fill", "--card"];
    expect(checkPairs(DARK, { "--foreground": surfaces, "--muted": surfaces, "--accent": surfaces, "--on-ink": ["--ink"], "--on-sun": ["--sun"] }, 4.5)).toEqual([]);
    expect(checkPairs(DARK, { "--edge": ["--background", "--card"], "--line": ["--background", "--card"], "--accent": ["--background", "--fill"] }, 3)).toEqual([]);
  });

  it("the Truth card's own text-and-fill pairs read there too", () => {
    const failing: string[] = [];
    for (const [text, fill, where] of codePairs().filter(([, , w]) => w.includes("/truth/"))) {
      const a = solid(DARK, text);
      const b = solid(DARK, fill);
      if (!a || !b) continue;
      const r = ratio(a, b);
      if (r < 4.5) failing.push(`${where}: ${text} on ${fill} is ${r.toFixed(2)}:1`);
    }
    expect(failing).toEqual([]);
  });
});
