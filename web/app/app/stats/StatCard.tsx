import { Card } from "../_components/ui";

// One white card per measure, laid out like the founder's example screen (2026-11-20): the name at the top, the figure on the left sitting level with the
// bottom of the bars, the bars on the right. When the text is large (or the screen narrow) the bars move under the figure. `wide`: the bars take the card's
// full width under the figure (the four weeks, whose dates need the room).

export function StatCard({ title, dot, figure, chart, foot, wide = false }: {
  title: string;
  /** A small dot in the measure's own colour before its name (protein, carbs, fat). */
  dot?: string;
  figure: React.ReactNode;
  chart: React.ReactNode;
  /** Small lines under the chart (the target key, which days count). */
  foot?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Card className="px-4 pb-4 pt-4">
      <section aria-label={title}>
        <h2 className="flex items-center gap-2 text-[1.375rem] font-bold leading-tight">
          {dot && <span aria-hidden className={`dot ${dot}`} />}
          {title}
        </h2>
        {wide ? (
          <>
            <div className="mt-2">{figure}</div>
            <div className="mt-4">{chart}</div>
          </>
        ) : (
          // side by side once the card has room for 6.5rem of figure and 10rem of bars (so large text stacks them, figure first)
          <div className="mt-3 @container">
            <div className="flex flex-col gap-4 @min-[17.75rem]:flex-row @min-[17.75rem]:items-end @min-[17.75rem]:gap-5">
              {/* level with the bottom of the bars, above the day letters */}
              <div className="min-w-0 @min-[17.75rem]:flex-[1_1_6.5rem] @min-[17.75rem]:pb-8">{figure}</div>
              <div className="min-w-0 @min-[17.75rem]:flex-[1_1_10rem]">{chart}</div>
            </div>
          </div>
        )}
        {foot && <div className="mt-3.5 space-y-1 text-[0.875rem] leading-snug text-muted">{foot}</div>}
      </section>
    </Card>
  );
}

/** The card's main figure: the number big, what it is under it (as on Home's week card). */
export function Figure({ value, caption, extra, size = "big" }: { value: React.ReactNode; caption: React.ReactNode; extra?: React.ReactNode; size?: "big" | "small" }) {
  return (
    <p>
      <span className={`app-numbers block font-[800] leading-none tracking-[-0.02em] ${size === "big" ? "text-[1.75rem]" : "text-[1.375rem]"}`}>{value}</span>
      <span className="mt-1 block text-[0.9375rem] leading-snug text-muted">
        {caption}
        {extra && <span className="block">{extra}</span>}
      </span>
    </p>
  );
}
