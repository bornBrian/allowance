import "server-only";
import { headers } from "next/headers";
import { LimitReached, UserError } from "./errors";

// The visitor's IP address, for per-IP limits. On Render, requests come through
// its proxy, which puts the real address first in X-Forwarded-For. Locally there
// is no proxy, and every request counts as "local".
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("true-client-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  return forwarded?.trim().slice(0, 64) || "local";
}

// Reads a small JSON object from the request body, refusing anything large or malformed.
export async function readJson(req: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new UserError("That's too long.", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new UserError("That's too long.", 413);
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {}
  throw new UserError("That request wasn't understood.");
}

// Turns an error into a response the page can show. Only messages written for
// people reach the browser; everything else is logged and replaced.
export function failure(err: unknown, fallback: string) {
  if (err instanceof LimitReached) {
    return Response.json(
      { error: err.message },
      { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
    );
  }
  if (err instanceof UserError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: fallback }, { status: 500 });
}

// Where PayPal sends the person back to. Set APP_URL when hosted, because
// behind a proxy the request's own address can be an internal one.
export function appUrl(req: Request): string {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}
