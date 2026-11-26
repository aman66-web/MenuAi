"use client";

// A picture of the app on a phone (founder 2026-11-26: people took the onboarding's example meal plan for their own and kept tapping it: "show it within a phone
// because it helps"). A plain phone outline drawn here, no device or brand: a rounded dark body with a thin bezel and a small pill at the top, the screen in the
// page's grey, and the bottom of the screen fading out as a screenshot would. What is drawn inside is the app made small (its own small sizes), so it reads as a
// picture, not the app: nothing in it can be tapped, focused or selected (inert, no pointer events), and a screen reader meets the whole of it as one image named
// by `label` (role img), so only the real buttons outside it (Continue, Back, Change) do anything.

export function PhoneFrame({ label, children, screen = "h-[25rem]", className = "" }: {
  /** The image's name for a screen reader, e.g. "Example of a meal plan". */
  label: string;
  children: React.ReactNode;
  /** The screen's height (a Tailwind class): what doesn't fit fades out at the bottom. */
  screen?: string;
  className?: string;
}) {
  return (
    <figure role="img" aria-label={label} className={`mx-auto w-full max-w-[17.5rem] ${className}`}>
      <div inert className="pointer-events-none select-none rounded-[2.25rem] bg-ink p-[7px] shadow-[var(--card-shadow)]">
        <div className={`relative overflow-hidden rounded-[1.8rem] bg-background ${screen}`}>
          <span className="absolute left-1/2 top-2 z-10 h-[0.95rem] w-16 -translate-x-1/2 rounded-full bg-ink" />
          <div className="px-3 pt-8">{children}</div>
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
        </div>
      </div>
    </figure>
  );
}
