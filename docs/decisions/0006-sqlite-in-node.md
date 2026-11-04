# 6. One process with the SQLite built into Node

Date: 2026-11-03

## Status

Accepted

## Context

The app needs a small amount of durable state: wallets, purchases, counters. The hosted demo must run until 15 December. Render's free Postgres expires after 30 days. Native SQLite drivers need a compiler on some machines.

## Decision

Use `node:sqlite` (built into Node 24) with one database file, in WAL mode, opened on first use. Run a single Next.js process.

## Consequences

- No database server, no native build, nothing to expire.
- Status changes and counters use single SQL statements, so they're atomic.
- Scaling past one instance would need a shared database and a shared agent lock. Not needed for the demo.
