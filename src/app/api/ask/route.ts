import { runAgent, type AgentEvent } from "@/lib/agent";
import { requireHuman } from "@/lib/captcha";
import { UserError } from "@/lib/errors";
import { clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { cleanLine } from "@/lib/sanitize";
import { currentActor, type Actor } from "@/lib/session";

export const maxDuration = 120;
const MAX_REQUEST_LENGTH = 500;

// Wallets with an agent run in progress. One at a time each: a second tab
// can't start a parallel run that spends the same budget twice.
const running = new Set<string>();

// Runs the agent and streams its progress to the page, one JSON object per line.
export async function POST(req: Request) {
  let walletId: string;
  let request: string;
  let actor: Actor;
  try {
    actor = await currentActor();
    walletId = actor.wallet.id;
    requireHuman(actor.wallet);
    request = cleanLine((await readJson(req)).request);
    if (!request) throw new UserError("Say what you'd like the agent to buy.");
    if (request.length > MAX_REQUEST_LENGTH) throw new UserError(`Please keep it under ${MAX_REQUEST_LENGTH} characters.`);
    if (running.has(walletId)) throw new UserError("The agent is still working on your last request.", 409);
    limit("ask", { wallet: walletId, ip: await clientIp() });
  } catch (err) {
    return failure(err, "Something went wrong. Please try again.");
  }

  running.add(walletId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(actor, request, emit);
      } catch (err) {
        if (!(err instanceof UserError)) console.error(err);
        emit({ type: "error", text: err instanceof UserError ? err.message : "Something went wrong. Please try again." });
      } finally {
        running.delete(walletId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
