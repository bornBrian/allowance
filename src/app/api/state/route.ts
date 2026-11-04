import { clientIp, failure } from "@/lib/http";
import { limit } from "@/lib/limits";
import { currentWallet } from "@/lib/session";
import { appState } from "@/lib/state";

export async function GET() {
  try {
    limit("read", { ip: await clientIp() });
    return Response.json(appState(await currentWallet()));
  } catch (err) {
    return failure(err, "Couldn't load your allowance.");
  }
}
