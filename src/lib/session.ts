import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getWallet, walletExists, type Wallet } from "./db";
import { clientIp } from "./http";
import { limit } from "./limits";

// Each browser gets its own wallet, kept in a cookie. No sign-up for the demo.
// The id is a random UUID, so it can't be guessed. The cookie can't be read by
// scripts on the page, and isn't sent with requests from other sites.
const COOKIE = "allowance_wallet";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function currentWallet(): Promise<Wallet> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id && UUID.test(id) && walletExists(id)) return getWallet(id);

  // A new wallet. Counted per IP, so clearing cookies over and over doesn't get
  // around the per-wallet limits.
  limit("newWallet", { ip: await clientIp() });
  const fresh = randomUUID();
  jar.set(COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return getWallet(fresh);
}
