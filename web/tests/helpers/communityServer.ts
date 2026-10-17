import { makeLimit } from "../../lib/auth/limiter";
import {
  handleBlock, handleDeleteInboxItem, handleFriendRequest, handleFriendRespond, handleGetBlocks, handleGetFriends, handleGetInbox, handleGetMe, handleMarkRead,
  handlePutMe, handleRemoveFriend, handleReport, handleSendList, handleUnblock, type CommunityCtx,
} from "../../lib/community/handlers";
import { memoryCommunityStore } from "./communityMemory";

// The Community API, in process: the REAL handlers (lib/community/handlers.ts) on the in-memory tables, behind the same routes as app/api/v1/community/*. The app's
// client tests (tests/communityClient.test.ts) call it as `request`, and the browser test (e2e/community-friends.mjs) answers the page's requests from it, so what the
// pages see is what the server would say: the username rules, the one neutral answer for a code that can't be added, the limits, who may send to whom.

export interface World {
  /** One request as one signed-in person: `path` is what follows /api/v1/ ("community/me"). */
  handle(userId: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
  ctx: CommunityCtx;
  mem: ReturnType<typeof memoryCommunityStore>;
  /** Move the clock (milliseconds since 1970). */
  setNow(ms: number): void;
  now(): number;
}

export function communityWorld(start = Date.UTC(2026, 9, 16, 12, 0, 0)): World {
  let now = start;
  const clock = () => now;
  const mem = memoryCommunityStore({ clock });
  const ctx: CommunityCtx = { store: mem.store, limit: makeLimit(clock), now: clock };

  async function handle(userId: string, method: string, path: string, body?: unknown) {
    const p = path.replace(/^\/+|\/+$/g, "");
    const out = (r: { status: number; body?: unknown }) => ({ status: r.status, body: r.body ?? null });
    const at = (re: RegExp) => re.exec(p)?.[1];
    const key = `${method} ${p}`;
    switch (key) {
      case "GET community/me": return out(await handleGetMe(userId, ctx));
      case "PUT community/me": return out(await handlePutMe(userId, body, ctx));
      case "GET community/friends": return out(await handleGetFriends(userId, ctx));
      case "POST community/friends/request": return out(await handleFriendRequest(userId, body, ctx));
      case "POST community/friends/respond": return out(await handleFriendRespond(userId, body, ctx));
      case "GET community/blocks": return out(await handleGetBlocks(userId, ctx));
      case "POST community/blocks": return out(await handleBlock(userId, body, ctx));
      case "POST community/report": return out(await handleReport(userId, body, ctx));
      case "POST community/send-list": return out(await handleSendList(userId, body, ctx));
      case "GET community/inbox": return out(await handleGetInbox(userId, ctx));
    }
    const friend = at(/^community\/friends\/([^/]+)$/);
    if (method === "DELETE" && friend) return out(await handleRemoveFriend(userId, friend, ctx));
    const block = at(/^community\/blocks\/([^/]+)$/);
    if (method === "DELETE" && block) return out(await handleUnblock(userId, block, ctx));
    const read = at(/^community\/inbox\/([^/]+)\/read$/);
    if (method === "POST" && read) return out(await handleMarkRead(userId, read, ctx));
    const item = at(/^community\/inbox\/([^/]+)$/);
    if (method === "DELETE" && item) return out(await handleDeleteInboxItem(userId, item, ctx));
    return { status: 404, body: { error: "not_found" } };
  }
  return { handle, ctx, mem, setNow: (ms) => { now = ms; }, now: () => now };
}
