import type { SVGProps } from "react";

// Three plain pictograms for "What that looks like" (generic shapes, never a picture of a food or a product: CLAUDE.md rule 2). They take the text colour
// for their outline so they work on the light card and on the dark one, and the page fill inside (colour meeting, 19 November 2026: no colour of their own,
// so a picture never colours food).

const base = { viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function SugarCubeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M16 4 27 10v12l-11 6L5 22V10z" fill="var(--fill)" />
      <path d="M5 10l11 6 11-6M16 16v12" />
    </svg>
  );
}

export function ButterIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="11" width="24" height="12" rx="3" fill="var(--fill)" />
      <path d="M4 15h24" />
    </svg>
  );
}

export function EggIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M16 4c-5 0-9 8.5-9 14a9 9 0 0 0 18 0c0-5.500-4-14-9-14z" fill="var(--fill)" />
    </svg>
  );
}

/** A plain speech bubble for "Share to WhatsApp": a generic message shape, never WhatsApp's own logo or a redrawing of it (CLAUDE.md rule 2, App Review 5.2.1). */
export function WhatsAppShareIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M6 7h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14l-6 5v-5H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M10 13h12M10 17h8" />
    </svg>
  );
}

export function ImageDownIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="4" width="24" height="24" rx="4" />
      <path d="M16 10v10m-4-4 4 4 4-4" />
    </svg>
  );
}
