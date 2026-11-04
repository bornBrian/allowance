# 7. Limits and cost caps counted in the database

Date: 2026-11-04

## Status

Accepted

## Context

A public demo calls paid APIs. Without limits, one script could exhaust the Channel3 free plan or run up the Claude bill. Wallets are cookies, so clearing cookies gives a fresh wallet.

## Decision

Fixed-window counters in SQLite ([lib/limits.ts](../../lib/limits.ts)), applied in layers:

| Layer | Limits |
| --- | --- |
| Per wallet | Ask: 3 a minute, 25 a day. Rules: 5 a minute, 30 a day. PayPal linking: 10 an hour. Purchase actions: 20 a minute. |
| Per IP | Ask: 60 a day. Rules: 100 a day. PayPal: 40 an hour. Purchase actions: 60 a minute. Human check: 20 an hour. New wallets: 20 a day. Page state: 120 a minute. |
| Per wallet, at once | One agent run at a time. |
| Global | Claude spending: `DAILY_AI_BUDGET_USD` (default $5). Channel3 calls: `CHANNEL3_MONTHLY_LIMIT` (default 900). |

A reached limit returns HTTP 429 with `Retry-After` and a plain message.

## Consequences

- Clearing cookies doesn't escape the limits: new wallets are counted per IP, and global caps sit behind everything.
- Fixed windows can allow a short burst at a window boundary (up to twice the limit). Acceptable here.
- IP addresses come from the hosting proxy's `X-Forwarded-For`; outside a trusted proxy they could be spoofed, which is why per-wallet and global limits exist too.
