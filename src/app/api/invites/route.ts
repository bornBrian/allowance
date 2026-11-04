import { randomBytes } from "node:crypto";
import { createInvite, setOwnerName } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { appUrl, clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { cleanLine } from "@/lib/sanitize";
import { currentPayer } from "@/lib/session";

const INVITE_DAYS = 7;

// The payer invites someone they look after. The link works once, for a week,
// and is meant to be sent privately (a message, WhatsApp, a text).
export async function POST(req: Request) {
  try {
    const wallet = await currentPayer();
    limit("invite", { wallet: wallet.id, ip: await clientIp() });
    const body = await readJson(req);
    const name = cleanLine(body.name, 40);
    const ownerName = cleanLine(body.ownerName, 40);
    if (!name) throw new UserError("Who is the allowance for?");
    if (!ownerName && !wallet.ownerName) throw new UserError("Add your own name, so they know who it's from.");
    if (ownerName) setOwnerName(wallet.id, ownerName);

    const token = randomBytes(24).toString("base64url");
    createInvite({ token, walletId: wallet.id, name, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) });
    return Response.json({ url: `${appUrl(req)}/join/${token}`, name, days: INVITE_DAYS });
  } catch (err) {
    return failure(err, "Couldn't create the invite.");
  }
}
