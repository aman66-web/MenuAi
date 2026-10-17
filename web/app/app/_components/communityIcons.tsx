import type { SVGProps } from "react";

// The few drawings Community needs that the shared set (icons.tsx) doesn't have: our own, same stroke and size as the others.
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false, ...p,
});

/** A tray with an arrow dropping into it: lists sent to you. */
export const InboxIcon = (p: P) => (<svg {...base(p)}><path d="M12 3.5v8.5M8.5 8.5L12 12l3.5-3.5" /><path d="M3.5 13.5l2-6.2a2 2 0 011.9-1.3h1.1M20.5 13.5l-2-6.2a2 2 0 00-1.9-1.3h-1.1" /><path d="M3.5 13.5V18a2 2 0 002 2h13a2 2 0 002-2v-4.5h-5.2a2.3 2.3 0 01-2.3 2h-2a2.3 2.3 0 01-2.3-2z" /></svg>);
/** A paper plane: send. */
export const SendIcon = (p: P) => (<svg {...base(p)}><path d="M21 3L10.5 13.5" /><path d="M21 3l-6.5 18-4-7.5L3 9.5z" /></svg>);
/** A flag: report. */
export const FlagIcon = (p: P) => (<svg {...base(p)}><path d="M5 21V4" /><path d="M5 4.5h12.5l-2.2 4 2.2 4H5" /></svg>);
/** A circle with a slash: block. */
export const BlockIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>);
/** A head and a plus: add a friend. */
export const UserPlusIcon = (p: P) => (<svg {...base(p)}><circle cx="9.5" cy="8" r="3.3" /><path d="M3 20.5c0-3.7 2.9-6.2 6.5-6.2 1.4 0 2.7.4 3.7 1" /><path d="M18 14v6M15 17h6" /></svg>);
/** Two links of a chain: copy the invite link. */
export const LinkIcon = (p: P) => (<svg {...base(p)}><path d="M10 14a4.2 4.2 0 005.9 0l3-3a4.2 4.2 0 00-5.9-5.9l-1 1" /><path d="M14 10a4.2 4.2 0 00-5.9 0l-3 3a4.2 4.2 0 005.9 5.9l1-1" /></svg>);
