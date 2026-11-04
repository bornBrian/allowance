import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getMember, getWallet, walletExists, type Member, type Wallet } from "./db";
import { UserError } from "./errors";
import { clientIp } from "./http";
import { limit } from "./limits";

// Two kinds of people use Allowance:
// - the payer, who links PayPal, sets the rules and approves; their browser holds the wallet cookie;
// - people they look after, who joined from an invite; their browser holds a member cookie.
// Both ids are random UUIDs in cookies that page scripts can't read and other sites don't send.
const WALLET_COOKIE = "allowance_wallet";
const MEMBER_COOKIE = "allowance_member";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Actor = { role: "payer"; wallet: Wallet } | { role: "member"; wallet: Wallet; member: Member };

const cookieOptions = (days: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * days,
  path: "/",
});

export async function currentActor(): Promise<Actor> {
  const jar = await cookies();
  const memberId = jar.get(MEMBER_COOKIE)?.value;
  if (memberId && UUID.test(memberId)) {
    const member = getMember(memberId);
    if (member) return { role: "member", wallet: getWallet(member.walletId), member };
  }
  return { role: "payer", wallet: await currentWallet() };
}

// For anything only the payer may do: rules, PayPal, approvals, refunds, people.
export async function currentPayer(): Promise<Wallet> {
  const actor = await currentActor();
  if (actor.role !== "payer") throw new UserError("Only the person who pays can do that.", 403);
  return actor.wallet;
}

// The payer's own wallet, created on first visit.
export async function currentWallet(): Promise<Wallet> {
  const jar = await cookies();
  const id = jar.get(WALLET_COOKIE)?.value;
  if (id && UUID.test(id) && walletExists(id)) return getWallet(id);

  // A new wallet. Counted per IP, so clearing cookies over and over doesn't get
  // around the per-wallet limits.
  limit("newWallet", { ip: await clientIp() });
  const fresh = randomUUID();
  jar.set(WALLET_COOKIE, fresh, cookieOptions(90));
  return getWallet(fresh);
}

// The payer's wallet id if this browser already has one, without creating it.
export async function existingWalletId(): Promise<string | null> {
  const id = (await cookies()).get(WALLET_COOKIE)?.value;
  return id && UUID.test(id) && walletExists(id) ? id : null;
}

export async function rememberMember(memberId: string) {
  (await cookies()).set(MEMBER_COOKIE, memberId, cookieOptions(180));
}

export async function forgetMember() {
  (await cookies()).delete(MEMBER_COOKIE);
}
