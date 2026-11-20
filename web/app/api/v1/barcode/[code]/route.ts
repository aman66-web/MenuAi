import { barcodeLookup } from "@/lib/barcodeLookup";
import { preflight, withCors, type CorsOptions } from "@/lib/cors";

// A barcode none of our lists holds, looked up at Open Food Facts through our server (lib/barcodeLookup.ts): Add food's "Scan a barcode" asks here only after our own
// shop lists and barcode catalogue have nothing for it. Only the barcode is in the request; nothing about the person is read or kept. The iPhone app asks from its
// own origin (lib/cors.ts).

const GET_ONLY: CorsOptions = { methods: "GET, OPTIONS", headers: "Content-Type" };

export function OPTIONS(request: Request) {
  return preflight(request, GET_ONLY);
}

export async function GET(request: Request, route: { params: Promise<{ code: string }> }) {
  const { code } = await route.params;
  let res: Response;
  try {
    const result = await barcodeLookup(code);
    // an answer (found or not) may be kept by this browser for a day, as the server keeps it; a failure never is
    res = Response.json(result.body, { status: result.status, headers: { "Cache-Control": result.status === 200 ? "private, max-age=86400" : "no-store" } });
  } catch (error) {
    console.error(error);
    res = Response.json({ error: "server_error", message: "Something went wrong. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return withCors(request, res, GET_ONLY);
}
