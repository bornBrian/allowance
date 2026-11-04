import { randomUUID } from "node:crypto";
import { addMember, peekInvite, redeemInvite } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { existingWalletId, rememberMember } from "@/lib/session";

// Someone opens their invite link and joins the payer's allowance on their own device.
export async function POST(req: Request) {
  try {
    limit("join", { ip: await clientIp() });
    const { token } = await readJson(req);
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new UserError("That invite link isn't valid.");

    // The payer opening their own link would turn their browser into the other person's.
    // Checked before the link is used up, so it still works on their phone afterwards.
    const preview = peekInvite(token);
    if (preview && preview.walletId === (await existingWalletId())) {
      throw new UserError("This is your own invite. Open it on their phone instead.");
    }
    const invite = redeemInvite(token);
    if (!invite) throw new UserError("This invite has expired or was already used. Ask for a new one.", 404);

    const id = randomUUID();
    addMember({ id, walletId: invite.walletId, name: invite.name });
    await rememberMember(id);
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err, "Couldn't join. Please try the link again.");
  }
}
