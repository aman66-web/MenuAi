import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOUR_SCHEMES, DEFAULT_COLOUR_SCHEME } from "../lib/mm/colourSchemes";

// The colour system (colour meeting, 19 November 2026; approved by the founder that day): every colour is a token in app/globals.css, and every pair the
// app draws is readable: words 4.5:1 or more on each surface they sit on, edges, ticks and progress 3:1 or more against what is next to them. Light
// appearance only; the Truth card's ink theme (.truth-dark) is checked too. The shared pieces (ui.tsx and the header, note, toast, switch and badge
// components) take their colours from the tokens only, never a raw value.

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

/** A token's colour as #rrggbb, following var() references within the same theme. */
function colour(theme: Record<string, string>, name: string, seen = new Set<string>()): string {
  const v = theme[name];
  if (!v) throw new Error(`${name} is not declared`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) {
    if (seen.has(ref[1]!)) throw new Error(`${name}: a loop`);
    seen.add(ref[1]!);
    return colour(theme, ref[1]!, seen);
  }
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is ${v}, not a solid #rrggbb`);
  return v.toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

type Pair = [fore: string, back: string];
function check(theme: Record<string, string>, pairs: Pair[], min: number) {
  for (const [fore, back] of pairs) {
    const r = ratio(colour(theme, fore), colour(theme, back));
    expect(r, `${fore} on ${back}: ${r.toFixed(2)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  }
}

const LIGHT_SURFACES = ["--background", "--card", "--tint-plan", "--tint-cook"];

/** Every pair of words and what they sit on, at 4.5:1 or more (Lime and every colour scheme). */
const WORDS: Pair[] = [
  ...LIGHT_SURFACES.flatMap((s): Pair[] => [["--foreground", s], ["--muted", s]]),
  ["--foreground", "--note-bg"], ["--foreground", "--danger-bg"], ["--muted", "--soft-strong"], ["--foreground", "--soft-strong"],
  ["--placeholder", "--card"],
  ["--accent", "--card"], ["--accent", "--background"],
  ["--on-ink", "--ink"], ["--on-ink", "--ink-pressed"], ["--on-ink-2", "--ink"], ["--sun", "--ink"],
  ["--on-sun", "--sun"], ["--on-accent", "--sun"],
  ["--danger", "--card"], ["--danger", "--danger-bg"], ["--on-danger", "--danger"],
  ["--ink", "--card"], ["--ink", "--tint-plan"],
];
/** Every edge, tick and progress colour and what is next to it, at 3:1 or more. */
const EDGES: Pair[] = [
  ...LIGHT_SURFACES.map((s): Pair => ["--edge", s]),
  ["--on-sun", "--card"], ["--on-sun", "--background"], ["--on-sun", "--tint-plan"],
  ["--bar", "--line"], ["--bar", "--card"], ["--bar", "--background"],
  ["--ring-track", "--ink"], ["--sun", "--ring-track"],
  ["--note-edge", "--note-bg"], ["--note-edge", "--card"],
  ["--danger", "--card"],
  // the macro colours' bars and dots on a white card
  ["--protein", "--card"], ["--carbs", "--card"], ["--fat", "--card"],
];

describe("the app's colours (light)", () => {
  it("declares every token of the colour meeting", () => {
    // the macro colours (protein, carbs, fat: labels only, never good or bad) are shown again since 20 November 2026
    for (const t of ["--ink", "--ink-pressed", "--on-ink", "--on-ink-2", "--edge", "--line", "--card", "--muted", "--placeholder", "--bar", "--ring-track", "--sun", "--on-sun", "--accent", "--tint-plan", "--tint-cook", "--note-bg", "--note-edge", "--danger", "--danger-bg", "--on-danger", "--protein", "--carbs", "--fat"]) {
      expect(() => colour(APP, t), t).not.toThrow();
    }
    expect(colour(APP, "--line")).toBe("#d9dedb");
    expect(colour(APP, "--muted")).toBe("#4a4f4c");
    expect(colour(APP, "--ring-track")).toBe("#6b716e");
    expect(colour(APP, "--bar")).toBe("#4d7c0f");
    expect(colour(APP, "--fill")).toBe(colour(APP, "--background"));
    expect(colour(APP, "--soft-strong")).toBe(colour(APP, "--line"));
  });

  it("words read at 4.5:1 or more on every surface they sit on", () => {
    check(APP, WORDS, 4.5);
  });

  it("edges, ticks and progress stand out at 3:1 or more", () => {
    check(APP, EDGES, 3);
  });

  it("a press on an ink button shows (ink-pressed is a visible step from ink)", () => {
    expect(ratio(colour(APP, "--ink"), colour(APP, "--ink-pressed"))).toBeGreaterThanOrEqual(1.5);
  });

  it("the FSA pills' words read on all three lights", () => {
    check(ROOT, [["--tl-ink", "--tl-green"], ["--tl-ink", "--tl-amber"], ["--tl-ink", "--tl-red"], ["--tl-ink", "--tl-grey"]], 4.5);
  });
});

// The colour schemes (founder 2026-11-26: "make the color schemes quite nice and cool"; lib/mm/colourSchemes.ts): Lime is the app's own colours above; each
// other scheme is one rule, `:root[data-scheme="x"]:has(.app-surface), .scheme-x`, and .scheme-lime draws Lime inside the picker's previews.
const SCHEME_TOKENS = ["--sun", "--on-sun", "--on-accent", "--accent", "--accent-soft", "--bar", "--ink", "--ink-pressed", "--on-ink-2", "--ring-track", "--tint-plan", "--tint-cook"];
const schemeRule = (id: string) => (id === DEFAULT_COLOUR_SCHEME ? `.scheme-${id}` : `:root[data-scheme="${id}"]:has(.app-surface), .scheme-${id}`);
const SCHEMES = COLOUR_SCHEMES.map((id) => ({ id, own: declared(schemeRule(id)), theme: { ...APP, ...declared(schemeRule(id)) } }));

describe("the colour schemes", () => {
  it("has a rule for every scheme the app offers, and none it doesn't", () => {
    expect(COLOUR_SCHEMES[0]).toBe("lime");
    expect(DEFAULT_COLOUR_SCHEME).toBe("lime");
    expect(COLOUR_SCHEMES.length).toBeGreaterThanOrEqual(5);
    const inCss = [...CSS.matchAll(/^:root\[data-scheme="([a-z]+)"\]/gm)].map((m) => m[1]);
    expect(inCss.sort()).toEqual(COLOUR_SCHEMES.filter((s) => s !== DEFAULT_COLOUR_SCHEME).sort());
  });

  it("each sets exactly the brand colours, nothing else (the page, cards, lines, words, macro colours, note and errors stay)", () => {
    for (const s of SCHEMES) expect(Object.keys(s.own).sort(), s.id).toEqual([...SCHEME_TOKENS].sort());
  });

  it("Lime's preview is the app's own colours exactly", () => {
    const lime = SCHEMES.find((s) => s.id === DEFAULT_COLOUR_SCHEME)!;
    for (const t of SCHEME_TOKENS) expect(lime.own[t], t).toBe(APP[t]);
  });

  it("no two schemes share their bright or their dark colour", () => {
    for (const t of ["--sun", "--ink", "--accent"]) expect(new Set(SCHEMES.map((s) => colour(s.theme, t))).size, t).toBe(SCHEMES.length);
  });

  for (const s of SCHEMES) {
    it(`${s.id}: words read at 4.5:1 or more, edges, ticks and progress stand out at 3:1 or more, and a press on ink shows`, () => {
      check(s.theme, WORDS, 4.5);
      check(s.theme, EDGES, 3);
      expect(ratio(colour(s.theme, "--ink"), colour(s.theme, "--ink-pressed"))).toBeGreaterThanOrEqual(1.5);
    });
  }
});

describe("the Truth card's ink theme (.truth-dark)", () => {
  it("is ink, sun and white", () => {
    expect(colour(DARK, "--background")).toBe("#1d2320");
    expect(colour(DARK, "--accent")).toBe("#d6efa0");
  });
  it("stays lime in every colour scheme (the card people share and film)", () => {
    const own = declared(".truth-dark");
    expect([own["--sun"], own["--on-sun"]]).toEqual(["#d6efa0", "#052e16"]);
  });
  it("words read at 4.5:1 or more, edges at 3:1 or more", () => {
    check(DARK, [["--foreground", "--background"], ["--muted", "--background"], ["--foreground", "--fill"], ["--muted", "--fill"], ["--accent", "--background"], ["--on-ink", "--ink"], ["--on-sun", "--sun"]], 4.5);
    check(DARK, [["--edge", "--background"], ["--line", "--background"]], 3);
  });
});

describe("the shared pieces use the tokens only", () => {
  // Water's own blues (the allow-list) are the only raw colours allowed here, inside the water drawings.
  const WATER = ["#a6e6fa", "#5ccaf3", "#38b6ef", "#2c9fe8"];
  const FILES = [
    "app/app/_components/ui.tsx", "app/app/_components/PageHeader.tsx", "app/app/_components/TopActions.tsx", "app/app/_components/Switch.tsx",
    "app/app/_components/Note.tsx", "app/app/_components/Toast.tsx", "app/app/_components/PremiumBadge.tsx", "app/app/_components/CommunityBadge.tsx",
    "app/app/_components/AddWaterSheet.tsx", "app/app/_components/PersonSheet.tsx", "app/app/_components/ReminderSheet.tsx", "app/app/_components/UsernameSheet.tsx",
    "app/app/groceries/PageBits.tsx",
    // the welcome steps rebuilt by the onboarding redesign meeting (20 November 2026, build list 4) and Home's one-time Start here card
    "app/app/welcome/Frame.tsx", "app/app/welcome/Cover.tsx", "app/app/welcome/QuestionSteps.tsx", "app/app/welcome/FeatureSteps.tsx",
    "app/app/welcome/ShowcaseWindow.tsx", "app/app/welcome/RecipeChoice.tsx", "app/app/welcome/WeekShowcase.tsx",
    "app/app/welcome/BodySteps.tsx", "app/app/_components/StartHere.tsx",
    // the seven-screen onboarding (20 November 2026): Your plan and its restaurant row
    "app/app/welcome/PlanStep.tsx", "app/app/welcome/RestaurantRow.tsx",
    "app/app/welcome/parts.tsx", "app/app/welcome/page.tsx",
    // Pip's AI permission sheet and the screens the 20 November 2026 audit reworked
    "app/app/_components/AiConsentSheet.tsx", "app/app/_components/FeaturePreviews.tsx", "app/app/_components/Shortcut.tsx", "app/app/_components/BodyFields.tsx",
    "app/app/scan/page.tsx", "app/app/recipes/fridge/page.tsx",
    // the Premium sheet redesigned on 20 November 2026 (founder: "This has got to look more interesting")
    "app/app/_components/PremiumPictures.tsx", "app/app/_components/PremiumOffer.tsx", "app/app/_components/AppStorePlans.tsx", "app/app/_components/TrialOffer.tsx",
  ];
  for (const f of FILES) {
    it(`${f} has no raw colour, Tailwind palette colour or opacity fade`, () => {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      const hex = (src.match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter((h) => !WATER.includes(h.toLowerCase()));
      expect(hex, "raw hex").toEqual([]);
      expect(src.match(/rgba?\(|hsla?\(/g) ?? [], "raw rgb()").toEqual([]);
      expect(src.match(/\b(?:bg|text|border|ring|outline|from|to|via|fill|stroke)-(?:white|black|zinc|gray|slate|neutral|stone|red|rose|amber|yellow|green|emerald|lime|teal|sky|blue)\b/g) ?? [], "Tailwind palette colour").toEqual([]);
      expect(src.match(/\bopacity-\d+/g) ?? [], "an opacity fade").toEqual([]);
    });
  }
});
