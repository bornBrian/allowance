import { claimStatus, getPurchase, setStatus } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure } from "@/lib/http";
import { limit } from "@/lib/limits";
import { charge, refund } from "@/lib/paypal";
import { currentWallet } from "@/lib/session";
import { appState } from "@/lib/state";

// The person's answer to a purchase: approve, decline, or refund one already paid.
// Each answer moves the purchase out of one status atomically, so a double tap
// or two open tabs can't pay or refund twice.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { id, action } = await ctx.params;
    const wallet = await currentWallet();
    limit("purchase", { wallet: wallet.id, ip: await clientIp() });
    // Only this wallet's purchases are found, so ids from elsewhere do nothing.
    const purchase = getPurchase(wallet.id, id);
    if (!purchase) throw new UserError("Purchase not found.", 404);

    if (action === "decline") {
      if (!claimStatus(id, "waiting", "declined")) throw conflict();
    } else if (action === "approve") {
      if (!wallet.paypalTokenId) throw new UserError("Link PayPal first.");
      if (!claimStatus(id, "waiting", "paying")) throw conflict();
      try {
        const paid = await charge({
          paymentTokenId: wallet.paypalTokenId,
          purchaseId: id,
          amountCents: purchase.amountCents,
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

    return Response.json(appState(await currentWallet()));
  } catch (err) {
    return failure(err, "Something went wrong with that purchase.");
  }
}

function conflict() {
  return new UserError("This purchase has already been dealt with.", 409);
}
