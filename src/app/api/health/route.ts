import { healthy } from "@/lib/db";

// For the host's health check and uptime monitoring: is the app up, and can it
// read its database? Says nothing about the person or their data.
export async function GET() {
  const ok = healthy();
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
