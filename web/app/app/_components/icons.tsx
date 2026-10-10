import type { SVGProps } from "react";

// Small inline icons (no icon library: the web app adds no dependencies).
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false, ...p,
});

export const HomeIcon = (p: P) => (<svg {...base(p)}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
export const BookmarkIcon = (p: P) => (<svg {...base(p)}><path d="M6 3h12v18l-6-4-6 4z" /></svg>);
export const TodayIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const GearIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></svg>);
export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (<svg {...base(p)} fill={filled ? "currentColor" : "none"}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>);
export const ChevronRightIcon = (p: P) => (<svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>);
export const ChevronLeftIcon = (p: P) => (<svg {...base(p)}><path d="M15 6l-6 6 6 6" /></svg>);
export const SearchIcon = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>);
export const CloseIcon = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const PlusIcon = (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const MinusIcon = (p: P) => (<svg {...base(p)}><path d="M5 12h14" /></svg>);
export const LockIcon = (p: P) => (<svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>);
export const ShareIcon = (p: P) => (<svg {...base(p)}><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v8h14v-8" /></svg>);
export const TrashIcon = (p: P) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const CheckIcon = (p: P) => (<svg {...base(p)}><path d="M5 12l5 5 9-10" /></svg>);
export const SwapIcon = (p: P) => (<svg {...base(p)}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>);
export const ListIcon = (p: P) => (<svg {...base(p)}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>);
export const ForkIcon = (p: P) => (<svg {...base(p)}><path d="M7 3v8a3 3 0 006 0V3M10 3v18M17 3c-2 2-2 6 0 8v10" /></svg>);
export const PencilIcon = (p: P) => (<svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>);
export const ArrowRightIcon = (p: P) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const BoltIcon = (p: P) => (<svg {...base(p)}><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg>);

// ---- cuisine glyphs for ChainMark: drawn for this app (simple shapes, no brand artwork) ----
export const BurgerGlyph = (p: P) => (<svg {...base(p)}><path d="M4 10.5C4 7 7.6 4.5 12 4.5s8 2.5 8 6z" /><path d="M3.5 13.5h17" /><path d="M5 16.5c1.2 1 2.3-1 3.5 0s2.3 1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0" /><path d="M5 19h14a1 1 0 011 1 1 1 0 01-1 1H5a1 1 0 01-1-1 1 1 0 011-1z" /></svg>);
export const ChickenGlyph = (p: P) => (<svg {...base(p)}><ellipse cx="14.5" cy="9.5" rx="6.2" ry="4.7" transform="rotate(-45 14.5 9.5)" /><path d="M10.6 13.4L6.3 17.7" /><circle cx="5.3" cy="18.2" r="1.5" /><circle cx="6.8" cy="19.8" r="1.5" /></svg>);
export const PizzaGlyph = (p: P) => (<svg {...base(p)}><path d="M12 21.5L3.8 6.2a14.5 14.5 0 0116.4 0z" /><path d="M5 8.4a13 13 0 0114 0" /><circle cx="10" cy="10.6" r="1.1" /><circle cx="14.2" cy="12.4" r="1.1" /><circle cx="11.6" cy="16" r="1.1" /></svg>);
export const CoffeeGlyph = (p: P) => (<svg {...base(p)}><path d="M4 8.5h12.5V14a5 5 0 01-5 5H9a5 5 0 01-5-5z" /><path d="M16.5 10.5h1.2a2.4 2.4 0 010 4.8h-1.2" /><path d="M8 3.5v2M12 3.5v2" /></svg>);
export const SandwichGlyph = (p: P) => (<svg {...base(p)}><path d="M3.5 11.5a8.5 5 0 0117 0z" /><path d="M4.5 14.5c1.6 1.2 2.6-1.2 4.2 0s2.6 1.2 4.2 0 2.6 1.2 4.2 0 2.2-.6 2.4 0" /><path d="M4 17.5h16a0 0 0 010 0 2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5z" /></svg>);
export const BakeryGlyph = (p: P) => (<svg {...base(p)}><path d="M5 20.5V11a7 7 0 0114 0v9.5z" /><path d="M9 12.5l1.6-2.4M13.4 12.5L15 10.1" /></svg>);
export const TacoGlyph = (p: P) => (<svg {...base(p)}><path d="M3 19a9 9 0 0118 0z" /><path d="M6.2 12.6c1-1.7 2.1-1.7 3 0 1-1.8 2.2-1.8 3.1 0 1-1.7 2.1-1.7 3 0 .5-.8 1.2-1.2 2.2-1.1" /><path d="M8 16.5a4.5 4.5 0 018 0" /></svg>);
export const InfoIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></svg>);
export const ArrowUpIcon = (p: P) => (<svg {...base(p)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>);
export const ExternalIcon = (p: P) => (<svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>);
export const PinIcon = (p: P) => (<svg {...base(p)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>);
export const LocateIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>);
export const DirectionsIcon = (p: P) => (<svg {...base(p)}><path d="M12 3l9 9-9 9-9-9z" /><path d="M8.5 12.5V11a1.5 1.5 0 011.5-1.5h5m0 0l-1.8-1.8m1.8 1.8l-1.8 1.8" /></svg>);
export const BasketIcon = (p: P) => (<svg {...base(p)}><path d="M3.5 9.5h17l-1.6 9a1.6 1.6 0 01-1.6 1.3H6.7a1.6 1.6 0 01-1.6-1.3z" /><path d="M8 9.5L11 4M16 9.5L13 4" /><path d="M9.5 13v3.5M14.5 13v3.5" /></svg>);
export const ScanIcon = (p: P) => (<svg {...base(p)}><path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16" /><path d="M8 8v8M11 8v8M14 8v8M17 8v8" /></svg>);
export const CopyIcon = (p: P) => (<svg {...base(p)}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M5.5 15.5V6.5a2 2 0 012-2h9" /></svg>);
