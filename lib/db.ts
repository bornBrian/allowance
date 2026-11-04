import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Check, PastPurchase } from "./guard";
import type { Rules } from "./rules";

// One small SQLite file, using the SQLite built into Node. A "wallet" is one
// person's allowance: their rules, their linked PayPal and their purchases.
// In the demo each browser gets its own.

let opened: DatabaseSync | null = null;

// Opened on first use rather than on import, so building the app never touches it.
function conn(): DatabaseSync {
  if (opened) return opened;
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "allowance.db");
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    rules_text TEXT,
    rules_json TEXT,
    paypal_token_id TEXT,
    paypal_email TEXT
  );
  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL REFERENCES wallets(id),
    created_at TEXT NOT NULL,
    request TEXT NOT NULL,
    product_id TEXT NOT NULL,
    title TEXT NOT NULL,
    image TEXT,
    shop TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    why TEXT,
    checks_json TEXT NOT NULL,
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    decided_at TEXT
  );
  CREATE INDEX IF NOT EXISTS purchases_wallet ON purchases(wallet_id, created_at);
  CREATE TABLE IF NOT EXISTS ai_spend (
    day TEXT PRIMARY KEY,
    micro_usd INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);
  // Columns added after the first version; SQLite has no "ADD COLUMN IF NOT EXISTS".
  const have = new Set((db.prepare("PRAGMA table_info(wallets)").all() as unknown as { name: string }[]).map((c) => c.name));
  for (const [name, type] of [
    ["paypal_setup_token", "TEXT"],
    ["verified_at", "TEXT"],
  ]) {
    if (!have.has(name)) db.exec(`ALTER TABLE wallets ADD COLUMN ${name} ${type}`);
  }
  opened = db;
  return db;
}

// paying: PayPal call in progress. paid: money moved. waiting: the person has to
// approve. declined: they said no. blocked: the guard stopped it.
// refunded: paid then returned. failed: PayPal refused.
export type Status = "paying" | "paid" | "waiting" | "declined" | "blocked" | "refunded" | "failed";

export interface Wallet {
  id: string;
  rulesText: string | null;
  rules: Rules | null;
  paypalTokenId: string | null;
  paypalEmail: string | null;
  paypalSetupToken: string | null; // the link attempt this browser started, if any
  verified: boolean; // passed the human check
}

export interface Purchase {
  id: string;
  createdAt: string;
  request: string;
  productId: string;
  title: string;
  image: string | null;
  shop: string;
  url: string;
  category: string;
  amountCents: number;
  status: Status;
  why: string | null;
  checks: Check[];
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
}

interface WalletRow {
  id: string;
  rules_text: string | null;
  rules_json: string | null;
  paypal_token_id: string | null;
  paypal_email: string | null;
  paypal_setup_token: string | null;
  verified_at: string | null;
}

interface PurchaseRow {
  id: string;
  created_at: string;
  request: string;
  product_id: string;
  title: string;
  image: string | null;
  shop: string;
  url: string;
  category: string;
  amount_cents: number;
  status: Status;
  why: string | null;
  checks_json: string;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
}

export function walletExists(id: string): boolean {
  return conn().prepare("SELECT 1 FROM wallets WHERE id = ?").get(id) !== undefined;
}

export function getWallet(id: string): Wallet {
  conn().prepare("INSERT OR IGNORE INTO wallets (id, created_at) VALUES (?, ?)").run(id, new Date().toISOString());
  const row = conn().prepare("SELECT * FROM wallets WHERE id = ?").get(id) as unknown as WalletRow;
  return {
    id: row.id,
    rulesText: row.rules_text,
    rules: row.rules_json ? (JSON.parse(row.rules_json) as Rules) : null,
    paypalTokenId: row.paypal_token_id,
    paypalEmail: row.paypal_email,
    paypalSetupToken: row.paypal_setup_token,
    verified: row.verified_at !== null,
  };
}

export function saveRules(walletId: string, text: string, rules: Rules) {
  conn().prepare("UPDATE wallets SET rules_text = ?, rules_json = ? WHERE id = ?").run(text, JSON.stringify(rules), walletId);
}

export function savePaypal(walletId: string, tokenId: string | null, email: string | null) {
  conn()
    .prepare("UPDATE wallets SET paypal_token_id = ?, paypal_email = ?, paypal_setup_token = NULL WHERE id = ?")
    .run(tokenId, email, walletId);
}

export function saveSetupToken(walletId: string, setupToken: string) {
  conn().prepare("UPDATE wallets SET paypal_setup_token = ? WHERE id = ?").run(setupToken, walletId);
}

export function markVerified(walletId: string) {
  conn().prepare("UPDATE wallets SET verified_at = ? WHERE id = ?").run(new Date().toISOString(), walletId);
}

function toPurchase(r: PurchaseRow): Purchase {
  return {
    id: r.id,
    createdAt: r.created_at,
    request: r.request,
    productId: r.product_id,
    title: r.title,
    image: r.image,
    shop: r.shop,
    url: r.url,
    category: r.category,
    amountCents: r.amount_cents,
    status: r.status,
    why: r.why,
    checks: JSON.parse(r.checks_json) as Check[],
    paypalOrderId: r.paypal_order_id,
    paypalCaptureId: r.paypal_capture_id,
  };
}

export function listPurchases(walletId: string): Purchase[] {
  const rows = conn()
    .prepare("SELECT * FROM purchases WHERE wallet_id = ? ORDER BY created_at DESC")
    .all(walletId) as unknown as PurchaseRow[];
  return rows.map(toPurchase);
}

export function getPurchase(walletId: string, id: string): Purchase | null {
  const row = conn().prepare("SELECT * FROM purchases WHERE wallet_id = ? AND id = ?").get(walletId, id) as unknown as
    | PurchaseRow
    | undefined;
  return row ? toPurchase(row) : null;
}

// What the guard counts against the budget: money that actually moved and stayed.
export function paidHistory(walletId: string): PastPurchase[] {
  return listPurchases(walletId)
    .filter((p) => p.status === "paid")
    .map((p) => ({
      productId: p.productId,
      category: p.category,
      shop: p.shop,
      amountCents: p.amountCents,
      at: new Date(p.createdAt),
    }));
}

export interface NewPurchase {
  id: string;
  walletId: string;
  request: string;
  productId: string;
  title: string;
  image: string | null;
  shop: string;
  url: string;
  category: string;
  amountCents: number;
  status: Status;
  why: string;
  checks: Check[];
}

export function addPurchase(p: NewPurchase) {
  conn().prepare(
    `INSERT INTO purchases (id, wallet_id, created_at, request, product_id, title, image, shop, url, category,
       amount_cents, status, why, checks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.walletId,
    new Date().toISOString(),
    p.request,
    p.productId,
    p.title,
    p.image,
    p.shop,
    p.url,
    p.category,
    p.amountCents,
    p.status,
    p.why,
    JSON.stringify(p.checks),
  );
}

export function setStatus(
  id: string,
  status: Status,
  paypal?: { orderId: string | null; captureId: string | null },
) {
  conn().prepare(
    `UPDATE purchases SET status = ?, decided_at = ?,
       paypal_order_id = COALESCE(?, paypal_order_id), paypal_capture_id = COALESCE(?, paypal_capture_id)
     WHERE id = ?`,
  ).run(status, new Date().toISOString(), paypal?.orderId ?? null, paypal?.captureId ?? null, id);
}

export function setAmount(id: string, amountCents: number) {
  conn().prepare("UPDATE purchases SET amount_cents = ? WHERE id = ?").run(amountCents, id);
}

// Adds a check to a purchase's record, e.g. the second price check when the person approves.
export function addCheck(id: string, check: Check) {
  const row = conn().prepare("SELECT checks_json FROM purchases WHERE id = ?").get(id) as unknown as
    | { checks_json: string }
    | undefined;
  if (!row) return;
  const checks = [...(JSON.parse(row.checks_json) as Check[]), check];
  conn().prepare("UPDATE purchases SET checks_json = ? WHERE id = ?").run(JSON.stringify(checks), id);
}

// Moves a purchase out of one status only if it is still in it, so two taps
// on "Approve" can't pay twice. Returns false if someone got there first.
export function claimStatus(id: string, from: Status, to: Status): boolean {
  return conn().prepare("UPDATE purchases SET status = ? WHERE id = ? AND status = ?").run(to, id, from).changes === 1;
}

export function healthy(): boolean {
  try {
    return conn().prepare("SELECT 1 AS ok").get() !== undefined;
  } catch {
    return false;
  }
}

// Daily cap on what the hosted demo spends on Claude.
export function aiSpentToday(): number {
  const row = conn().prepare("SELECT micro_usd FROM ai_spend WHERE day = ?").get(today()) as unknown as
    | { micro_usd: number }
    | undefined;
  return (row?.micro_usd ?? 0) / 1_000_000;
}

export function addAiSpend(usd: number) {
  conn().prepare(
    `INSERT INTO ai_spend (day, micro_usd) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET micro_usd = micro_usd + excluded.micro_usd`,
  ).run(today(), Math.round(usd * 1_000_000));
}

// Adds one to a counter and returns the new count, in a single statement so
// two requests at once can't both read the old value.
export function bumpCounter(key: string, expiresAt: number): number {
  const db = conn();
  if (Math.random() < 0.01) db.prepare("DELETE FROM counters WHERE expires_at < ?").run(Math.floor(Date.now() / 1000));
  const row = db
    .prepare(
      `INSERT INTO counters (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .get(key, expiresAt) as unknown as { count: number };
  return row.count;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
