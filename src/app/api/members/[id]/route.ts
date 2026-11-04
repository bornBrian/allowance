import { removeMember } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure } from "@/lib/http";
import { limit } from "@/lib/limits";
import { currentActor, currentPayer } from "@/lib/session";
import { appState } from "@/lib/state";

// The payer stops someone spending from their allowance. Their past purchases stay on record.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const wallet = await currentPayer();
    limit("people", { wallet: wallet.id, ip: await clientIp() });
    if (!removeMember(wallet.id, id)) throw new UserError("Not found.", 404);
    return Response.json(appState(await currentActor()));
  } catch (err) {
    return failure(err, "Couldn't remove them.");
  }
}
