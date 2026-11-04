import "server-only";
import { randomUUID } from "node:crypto";
import type { Wallet } from "./db";
import { UserError } from "./errors";

// Cloudflare Turnstile: a check that a visitor is a person, usually without a
// puzzle. Each browser passes it once before anything that costs money (Claude,
// Channel3, PayPal). It's off unless both keys are set.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const CAPTCHA_ACTION = "start";

export function captchaSiteKey(): string | null {
  return (process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY) || null;
}

export function requireHuman(wallet: Wallet) {
  if (captchaSiteKey() && !wallet.verified) throw new UserError("Please confirm you're a person first.", 403);
}

// Asks Cloudflare whether the token from the widget is genuine. Tokens work
// once and expire after five minutes.
export async function verifyHuman(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  const body = new URLSearchParams({ secret, response: token, idempotency_key: randomUUID() });
  if (ip !== "local") body.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean; action?: string };
    return data.success === true && (!data.action || data.action === CAPTCHA_ACTION);
  } catch (err) {
    console.error("Turnstile check failed", err);
    return false;
  }
}
