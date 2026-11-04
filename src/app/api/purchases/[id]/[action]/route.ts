import { recheck } from "@/lib/channel3";
import { addCheck, claimStatus, getPurchase, setAmount, setStatus } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { money } from "@/lib/guard";
import { clientIp, failure } from "@/lib/http";
import { limit } from "@/lib/limits";
import { charge, refund } from "@/lib/paypal";
import { currentActor } from "@/lib/session";
import { appState } from "@/lib/state";

// The person's answer to a purchase: approve, decline, or refund one already paid.
// Each answer moves the purchase out of one status atomically, so a double tap
// or two open tabs can't pay or refund twice.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { id, action } = await ctx.params;
    const actor = await currentActor();
    const { wallet } = actor;
    limit("purchase", { wallet: wallet.id, ip: await clientIp() });
    // Only this wallet's purchases are found, so ids from elsewhere do nothing.
    const purchase = getPurchase(wallet.id, id);
    if (!purchase) throw new UserError("Purchase not found.", 404);
    // People the payer looks after can cancel their own requests; only the payer approves or refunds.
    if (actor.role === "member") {
      if (action !== "decline" || purchase.memberId !== actor.member.id) {
        throw new UserError(`Only ${wallet.ownerName ?? "the person who pays"} can do that.`, 403);
      }
    }

    if (action === "decline") {
      if (!claimStatus(id, "waiting", "declined")) throw conflict();
    } else if (action === "approve") {
      if (!wallet.paypalTokenId) throw new UserError("Link PayPal first.");
      if (!claimStatus(id, "waiting", "paying")) throw conflict();
      // Time has passed since the agent asked. Look at the shop again: approving
      // an amount is not approving a higher one.
      const now = await recheck(purchase);
      const changed =
        now.inStock === false
          ? "It's out of stock now."
          : now.priceCents !== null && now.priceCents > purchase.amountCents
            ? `The price went up from ${money(purchase.amountCents)} to ${money(now.priceCents)} since the agent asked.`
            : null;
      if (changed) {
        addCheck(id, { label: "At approval", outcome: "block", detail: changed });
        setStatus(id, "blocked");
        throw new UserError(`Not paid. ${changed}`, 409);
      }
      // If the price came down, pay the lower one.
      const amount = now.priceCents !== null ? Math.min(now.priceCents, purchase.amountCents) : purchase.amountCents;
      if (amount !== purchase.amountCents) setAmount(id, amount);
      addCheck(id, {
        label: "At approval",
        outcome: now.priceCents === null ? "ask" : "ok",
        detail:
          now.priceCents === null
            ? "The current price couldn't be confirmed; you approved the amount shown."
            : `Price confirmed at ${money(amount)}.`,
      });
      try {
        const paid = await charge({
          paymentTokenId: wallet.paypalTokenId,
          purchaseId: id,
          amountCents: amount,
          title: purchase.title,
          shop: purchase.shop,
          url: purchase.url,
        });
        setStatus(id, paid.paid ? "paid" : "failed", { orderId: paid.orderId, captureId: paid.captureId });
      } catch (err) {
        console.error("PayPal charge failed", err);
        setStatus(id, "failed");
      }
    } else if (action === "refund") {
      if (!purchase.paypalCaptureId || !claimStatus(id, "paid", "refunded")) throw conflict();
      try {
        await refund(purchase.paypalCaptureId, id);
      } catch (err) {
        console.error("PayPal refund failed", err);
        setStatus(id, "paid");
        throw new UserError("PayPal couldn't refund this purchase.", 502);
      }
    } else {
      throw new UserError("Unknown action.", 404);
    }

    return Response.json(appState(await currentActor()));
  } catch (err) {
    return failure(err, "Something went wrong with that purchase.");
  }
}

function conflict() {
  return new UserError("This purchase has already been dealt with.", 409);
}
