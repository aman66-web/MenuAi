import { barcodeLookup } from "@/lib/barcodeLookup";
import { preflight, withCors, type CorsOptions } from "@/lib/cors";
import { ipHash } from "@/lib/http";

// A barcode none of our lists holds, looked up at Open Food Facts through our server (lib/barcodeLookup.ts): Add food's "Scan a barcode" asks here only after our own
// shop lists and barcode catalogue have nothing for it. Only the barcode is in the request and only it goes on to Open Food Facts; the caller's salted IP hash is
// counted so one caller can't spend the whole server's allowance (lib/barcodeLookup.ts PER_CALLER_PER_MINUTE; the meeting of 21 November 2026, Umar). The
// iPhone app asks from its own origin (lib/cors.ts).

const GET_ONLY: CorsOptions = { methods: "GET, OPTIONS", headers: "Content-Type" };

export function OPTIONS(request: Request) {
  return preflight(request, GET_ONLY);
}

export async function GET(request: Request, route: { params: Promise<{ code: string }> }) {
  const { code } = await route.params;
  let res: Response;
  try {
    const result = await barcodeLookup(code, caller(request));
    // an answer (found or not) may be kept by this browser for a day, as the server keeps it; a failure never is
    res = Response.json(result.body, { status: result.status, headers: { "Cache-Control": result.status === 200 ? "private, max-age=86400" : "no-store" } });
  } catch (error) {
    console.error(error);
    res = Response.json({ error: "server_error", message: "Something went wrong. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return withCors(request, res, GET_ONLY);
}

/** The caller's salted IP hash, or none (no address, or the server's settings missing): then only the server's own total counts. */
function caller(request: Request): string | undefined {
  try {
    return ipHash(request) ?? undefined;
  } catch {
    return undefined;
  }
}
