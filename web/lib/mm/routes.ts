// URLs inside the web app. Chain, item and builder pages are static shells that read their ids from the query
// string, so one cached shell (public/sw.js) opens every restaurant and item offline.

const q = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined && e[1] !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

export const chainHref = (chainId: string) => `/app/chain?${q({ id: chainId })}`;
export const itemHref = (chainId: string, itemId: string) => `/app/item?${q({ chain: chainId, item: itemId })}`;
export const builderHref = (o: { chain: string; item?: string; pick?: string; saved?: string }) => `/app/builder?${q(o)}`;
