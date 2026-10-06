import { isBranchesDoc, type BranchesDoc } from "@/lib/mm/geo";

// One static file of branch positions (public/branches/branches.json), fetched when the Nearby screen opens and kept for
// the session. The service worker keeps the last copy for offline use (public/sw.js).
let pending: Promise<BranchesDoc> | null = null;

export function loadBranches(): Promise<BranchesDoc> {
  pending ??= fetch("/branches/branches.json")
    .then((r) => {
      if (!r.ok) throw new Error(`branches ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((d) => {
      if (!isBranchesDoc(d)) throw new Error("branches file is not valid");
      return d;
    })
    .catch((e: unknown) => {
      pending = null; // let "Try again" fetch again
      throw e;
    });
  return pending;
}
