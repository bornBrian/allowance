import { verifyHuman } from "@/lib/captcha";
import { markVerified } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { currentWallet } from "@/lib/session";
import { appState } from "@/lib/state";

// The human check's answer from the browser, confirmed with Cloudflare.
export async function POST(req: Request) {
  try {
    const ip = await clientIp();
    limit("verify", { ip });
    const wallet = await currentWallet();
    const { token } = await readJson(req);
    if (typeof token !== "string" || !token || token.length > 2048) throw new UserError("The check didn't finish.");
    if (!(await verifyHuman(token, ip))) throw new UserError("The check didn't pass. Please try again.", 403);
    markVerified(wallet.id);
    return Response.json(appState(await currentWallet()));
  } catch (err) {
    return failure(err, "Couldn't complete the check.");
  }
}
