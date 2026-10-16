/** A restaurant's actions: even tiles with the icon over the word (the minimum width is in rem, so at large text a tile drops to the next
    row and widens to fill it). Shared by the list rows and the selected restaurant's card, on the page and in full screen. */
export const ACTIONS = "flex flex-wrap gap-2";
const ACTION = "flex min-h-[3.75rem] min-w-0 grow basis-[6.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-[0.875rem] font-semibold leading-tight transition active:scale-[0.97] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0";
export const ACTION_MAIN = `${ACTION} bg-foreground text-background hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)]`;
export const ACTION_SOFT = `${ACTION} bg-soft-strong text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]`;
