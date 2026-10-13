import { handleDeleteAccount } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";

// "Delete my account" (App Store guideline 5.1.1(v)): deletes the account and every synced row at once. Body: { "confirm": true }.
export const OPTIONS = authPreflight;

export async function DELETE(request: Request) {
  return authRoute(request, async (ctx) => {
    const read = await readJson(request);
    return "result" in read ? read.result : handleDeleteAccount(read.body, request.headers, ctx);
  });
}
