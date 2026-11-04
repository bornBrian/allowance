import "server-only";
import { bumpCounter } from "./db";
import { LimitReached } from "./errors";

// Rate limits, quotas and cost caps, all counted in SQLite so they hold across
// restarts. Each limit is a fixed window: "at most N in this minute / day".
//
// Limits apply per wallet (a browser) and per IP address. Clearing cookies gets
// a new wallet, so the IP limits and the global caps stay in place behind them.

interface Window {
  max: number;
  seconds: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Limits = { wallet?: Window[]; ip?: Window[] };

export const LIMITS = {
  // Each ask runs Claude and up to four Channel3 calls, so it has the tightest limits.
  ask: { wallet: [{ max: 3, seconds: MINUTE }, { max: 25, seconds: DAY }], ip: [{ max: 60, seconds: DAY }] },
  rules: { wallet: [{ max: 5, seconds: MINUTE }, { max: 30, seconds: DAY }], ip: [{ max: 100, seconds: DAY }] },
  paypal: { wallet: [{ max: 10, seconds: HOUR }], ip: [{ max: 40, seconds: HOUR }] },
  purchase: { wallet: [{ max: 20, seconds: MINUTE }], ip: [{ max: 60, seconds: MINUTE }] },
  verify: { ip: [{ max: 20, seconds: HOUR }] },
  newWallet: { ip: [{ max: 20, seconds: DAY }] },
  read: { ip: [{ max: 120, seconds: MINUTE }] },
} satisfies Record<string, Limits>;

export type Action = keyof typeof LIMITS;

export function limit(action: Action, who: { wallet?: string; ip: string }) {
  const rules: Limits = LIMITS[action];
  for (const [kind, id] of [
    ["ip", who.ip],
    ["wallet", who.wallet],
  ] as const) {
    if (!id) continue;
    for (const w of rules[kind] ?? []) take(`${action}:${kind}:${id}`, w);
  }
}

function take(key: string, w: Window) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - (now % w.seconds);
  const end = start + w.seconds;
  if (bumpCounter(`${key}:${w.seconds}:${start}`, end) > w.max) {
    const wait = end - now;
    throw new LimitReached(
      w.seconds >= DAY
        ? "You've reached today's limit for this demo. It resets at midnight UTC."
        : `That's a lot of requests in a short time. Please wait ${wait < 90 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.`,
      wait,
    );
  }
}

// Channel3's free plan has 1,000 calls a month. Stop a little before that so
// the demo fails politely instead of the API failing mid-purchase.
export function countChannel3Call() {
  const max = Number(process.env.CHANNEL3_MONTHLY_LIMIT ?? "900");
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000;
  if (bumpCounter(`channel3:${month}`, nextMonth) > max) {
    throw new LimitReached(
      "Product search has reached its limit for this month's demo.",
      Math.ceil(nextMonth - now.getTime() / 1000),
    );
  }
}
