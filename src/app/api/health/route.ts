import { healthy } from "@/lib/db";

// For the host's health check and uptime monitoring: is the app up, and can it
// read its database? Says nothing about the person or their data.
export async function GET() {
  const ok = healthy();
  // Which commit is running (Render sets RENDER_GIT_COMMIT), so a deploy can be confirmed from outside.
  const version = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null;
  return Response.json({ ok, version }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
