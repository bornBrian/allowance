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
  -- People who spend from someone else's allowance (a teen, an elderly parent).
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL REFERENCES wallets(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS members_wallet ON members(wallet_id);
  -- Single-use invite links the payer sends to the person they look after.
  CREATE TABLE IF NOT EXISTS invites (
    token TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL REFERENCES wallets(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  -- The payer's devices that get approval requests as notifications.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL REFERENCES wallets(id),
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);
  // Columns added after the first version; SQLite has no "ADD COLUMN IF NOT EXISTS".
  for (const [table, name] of [
    ["wallets", "paypal_setup_token"],
    ["wallets", "verified_at"],
    ["wallets", "owner_name"],
    ["purchases", "member_id"],
  ]) {
    const have = (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]).map((c) => c.name);
    if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} TEXT`);
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
  ownerName: string | null; // how the people they look after see them, e.g. "Brian"
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
  memberId: string | null; // who asked: a member, or null for the payer
  memberName: string | null;
}

interface WalletRow {
  id: string;
  rules_text: string | null;
  rules_json: string | null;
  paypal_token_id: string | null;
  paypal_email: string | null;
  paypal_setup_token: string | null;
  verified_at: string | null;
  owner_name: string | null;
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
  member_id: string | null;
  member_name: string | null;
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
    ownerName: row.owner_name,
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

export function setOwnerName(walletId: string, name: string) {
  conn().prepare("UPDATE wallets SET owner_name = ? WHERE id = ?").run(name, walletId);
}

// ---------- People the payer looks after ----------

export interface Member {
  id: string;
  walletId: string;
  name: string;
  createdAt: string;
}

interface MemberRow {
  id: string;
  wallet_id: string;
  name: string;
  created_at: string;
}

const toMember = (r: MemberRow): Member => ({ id: r.id, walletId: r.wallet_id, name: r.name, createdAt: r.created_at });

export function getMember(id: string): Member | null {
  const row = conn().prepare("SELECT * FROM members WHERE id = ?").get(id) as unknown as MemberRow | undefined;
  return row ? toMember(row) : null;
}

export function listMembers(walletId: string): Member[] {
  const rows = conn().prepare("SELECT * FROM members WHERE wallet_id = ? ORDER BY created_at").all(walletId) as unknown as MemberRow[];
  return rows.map(toMember);
}

export function addMember(m: { id: string; walletId: string; name: string }) {
  conn()
    .prepare("INSERT INTO members (id, wallet_id, name, created_at) VALUES (?, ?, ?, ?)")
    .run(m.id, m.walletId, m.name, new Date().toISOString());
}

// Removing someone keeps their purchases on record; they just can't ask any more.
export function removeMember(walletId: string, id: string): boolean {
  return conn().prepare("DELETE FROM members WHERE wallet_id = ? AND id = ?").run(walletId, id).changes === 1;
}

export function createInvite(i: { token: string; walletId: string; name: string; expiresAt: Date }) {
  conn()
    .prepare("INSERT INTO invites (token, wallet_id, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(i.token, i.walletId, i.name, new Date().toISOString(), i.expiresAt.toISOString());
}

export interface Invite {
  walletId: string;
  name: string;
  ownerName: string | null;
}

// Looks at an invite without using it, for the join page.
export function peekInvite(token: string): Invite | null {
  const row = conn()
    .prepare(
      `SELECT i.wallet_id, i.name, w.owner_name FROM invites i JOIN wallets w ON w.id = i.wallet_id
       WHERE i.token = ? AND i.used_at IS NULL AND i.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as unknown as
    | { wallet_id: string; name: string; owner_name: string | null }
    | undefined;
  return row ? { walletId: row.wallet_id, name: row.name, ownerName: row.owner_name } : null;
}

// Uses an invite once, atomically: two people opening the same link can't both join.
export function redeemInvite(token: string): Invite | null {
  const invite = peekInvite(token);
  if (!invite) return null;
  const now = new Date().toISOString();
  const used =
    conn()
      .prepare("UPDATE invites SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?")
      .run(now, token, now).changes === 1;
  return used ? invite : null;
}

// ---------- Approval notifications ----------

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function savePushSubscription(walletId: string, sub: PushSubscriptionRow) {
  conn()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, wallet_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET wallet_id = excluded.wallet_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(sub.endpoint, walletId, sub.p256dh, sub.auth, new Date().toISOString());
}

export function listPushSubscriptions(walletId: string): PushSubscriptionRow[] {
  return conn()
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE wallet_id = ?")
    .all(walletId) as unknown as PushSubscriptionRow[];
}

export function removePushSubscription(endpoint: string) {
  conn().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
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
    memberId: r.member_id,
    memberName: r.member_name,
  };
}

const PURCHASE_SELECT = "SELECT p.*, m.name AS member_name FROM purchases p LEFT JOIN members m ON m.id = p.member_id";

// All of a wallet's purchases, or only one member's when memberId is given.
export function listPurchases(walletId: string, memberId?: string): Purchase[] {
  const rows = (
    memberId
      ? conn()
          .prepare(PURCHASE_SELECT + " WHERE p.wallet_id = ? AND p.member_id = ? ORDER BY p.created_at DESC")
          .all(walletId, memberId)
      : conn().prepare(PURCHASE_SELECT + " WHERE p.wallet_id = ? ORDER BY p.created_at DESC").all(walletId)
  ) as unknown as PurchaseRow[];
  return rows.map(toPurchase);
}

export function getPurchase(walletId: string, id: string): Purchase | null {
  const row = conn().prepare(PURCHASE_SELECT + " WHERE p.wallet_id = ? AND p.id = ?").get(walletId, id) as unknown as
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
  memberId?: string | null;
}

export function addPurchase(p: NewPurchase) {
  conn().prepare(
    `INSERT INTO purchases (id, wallet_id, created_at, request, product_id, title, image, shop, url, category,
       amount_cents, status, why, checks_json, member_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    p.memberId ?? null,
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

export function aiSpentTotal(): number {
  const row = conn().prepare("SELECT COALESCE(SUM(micro_usd), 0) AS total FROM ai_spend").get() as unknown as {
    total: number;
  };
  return row.total / 1_000_000;
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
