import { requireHuman } from "@/lib/captcha";
import { parseRules } from "@/lib/claude";
import { saveRules } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { cleanText } from "@/lib/sanitize";
import { currentActor, currentPayer } from "@/lib/session";
import { appState } from "@/lib/state";

const MAX_RULES_LENGTH = 1000;

export async function POST(req: Request) {
  try {
    const wallet = await currentPayer();
    requireHuman(wallet);
    limit("rules", { wallet: wallet.id, ip: await clientIp() });
    const text = cleanText((await readJson(req)).text);
    if (!text) throw new UserError("Write your rules in a sentence or two.");
    if (text.length > MAX_RULES_LENGTH) throw new UserError(`Please keep your rules under ${MAX_RULES_LENGTH} characters.`);
    saveRules(wallet.id, text, await parseRules(text));
    return Response.json(appState(await currentActor()));
  } catch (err) {
    return failure(err, "Couldn't save those rules. Please try again.");
  }
}
