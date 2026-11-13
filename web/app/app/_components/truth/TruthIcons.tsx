import type { SVGProps } from "react";

// Three plain pictograms for "What that looks like" (generic shapes, never a picture of a food or a product: CLAUDE.md rule 2). They take the text colour
// for their outline so they work on the light card and on the dark one.

const base = { viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function SugarCubeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M16 4 27 10v12l-11 6L5 22V10z" fill="var(--soft-strong)" />
      <path d="M5 10l11 6 11-6M16 16v12" />
    </svg>
  );
}

export function ButterIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="11" width="24" height="12" rx="3" fill="#fde68a" stroke="#6b5200" />
      <path d="M4 15h24" stroke="#6b5200" />
    </svg>
  );
}

export function EggIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M16 4c-5 0-9 8.5-9 14a9 9 0 0 0 18 0c0-5.500-4-14-9-14z" fill="#ffffff" stroke="#3f3f46" />
    </svg>
  );
}

export function WhatsAppShareIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M4 27l2-6.5A11.500 11.500 0 1 1 11 25z" />
      <path d="M12 12c0 5 4 9 9 9l1.500-2-3-1.500-1.500 1c-1.500-.5-3-2-3.500-3.500l1-1.500L14.500 11z" />
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
