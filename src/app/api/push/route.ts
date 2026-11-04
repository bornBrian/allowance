import { savePushSubscription } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { allowedPushEndpoint } from "@/lib/notify";
import { currentPayer } from "@/lib/session";

// The payer turns on approval notifications for this device.
export async function POST(req: Request) {
  try {
    const wallet = await currentPayer();
    limit("people", { wallet: wallet.id, ip: await clientIp() });
    const { endpoint, keys } = await readJson(req);
    const k = (keys ?? {}) as { p256dh?: unknown; auth?: unknown };
    if (typeof endpoint !== "string" || !allowedPushEndpoint(endpoint)) {
      throw new UserError("This browser's notification service isn't supported.");
    }
    if (typeof k.p256dh !== "string" || typeof k.auth !== "string" || k.p256dh.length > 200 || k.auth.length > 100) {
      throw new UserError("That notification setup wasn't understood.");
    }
    savePushSubscription(wallet.id, { endpoint, p256dh: k.p256dh, auth: k.auth });
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err, "Couldn't turn on notifications.");
  }
}
