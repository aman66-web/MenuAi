// Uptime check: GET /api/health → {"ok":true}. Doesn't touch the database.
export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
