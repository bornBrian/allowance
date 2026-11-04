import "server-only";
import { randomUUID } from "node:crypto";
import { recheck as channel3Recheck, type Product } from "./channel3";
import { addPurchase, getPurchase, paidHistory, setStatus, type Purchase, type Wallet } from "./db";
import { cents, decide, money } from "./guard";
import { notifyPayer, type ApprovalNotice } from "./notify";
import { charge as paypalCharge } from "./paypal";

// What happens when the agent asks to buy a product:
// look at the shop again, let the guard decide, record the attempt, and pay
// only if the guard said pay. The agent gets back a plain-text answer.

export interface PurchaseRequest {
  wallet: Wallet & { rules: NonNullable<Wallet["rules"]>; paypalTokenId: string };
  request: string; // what the person asked for
  product: Product; // from the agent's own search results, never from the model's words
  category: string; // decided from the person's words before any product was seen
  maxPrice?: number | null; // a price in dollars the person named in the request
  why: string; // the agent's reason, shown to the person
  member?: { id: string; name: string } | null; // someone the payer looks after, or null for the payer
  compared?: { title: string; priceCents: number }[]; // the other products the agent looked at
}

// The outside world, swappable in tests.
export interface Services {
  recheck: typeof channel3Recheck;
  charge: typeof paypalCharge;
  status: (text: string) => void;
  notify: (walletId: string, notice: ApprovalNotice) => Promise<void>;
}

const live: Services = { recheck: channel3Recheck, charge: paypalCharge, status: () => {}, notify: notifyPayer };

export async function proposePurchase(
  { wallet, request, product, category, maxPrice, why, member, compared }: PurchaseRequest,
  services: Partial<Services> = {},
): Promise<{ purchase: Purchase; result: string }> {
  const { recheck, charge, status, notify } = { ...live, ...services };

  status(`Checking ${product.shop} for the current price`);
  const checkout = await recheck(product);

  status("Checking your rules");
  const decision = decide({
    proposal: { ...product, productId: product.id, category },
    checkout,
    rules: wallet.rules,
    history: paidHistory(wallet.id),
    now: new Date(),
    requestMaxCents: maxPrice ? cents(maxPrice) : null,
    compared,
  });

  const id = randomUUID();
  addPurchase({
    id,
    walletId: wallet.id,
    request,
    productId: product.id,
    title: product.title,
    image: product.image,
    shop: product.shop,
    url: product.url,
    category,
    amountCents: decision.amountCents,
    status: decision.verdict === "pay" ? "paying" : decision.verdict === "ask" ? "waiting" : "blocked",
    why,
    checks: decision.checks,
    memberId: member?.id ?? null,
  });

  let result: string;
  if (decision.verdict === "pay") {
    status("Paying with PayPal");
    try {
      const paid = await charge({
        paymentTokenId: wallet.paypalTokenId,
        purchaseId: id,
        amountCents: decision.amountCents,
        title: product.title,
        shop: product.shop,
        url: product.url,
      });
      setStatus(id, paid.paid ? "paid" : "failed", { orderId: paid.orderId, captureId: paid.captureId });
      result = paid.paid
        ? `Paid ${money(decision.amountCents)} with PayPal. Every rule passed.`
        : `PayPal didn't complete the payment (status ${paid.status}). Nothing was charged.`;
    } catch (err) {
      console.error("PayPal charge failed", err);
      setStatus(id, "failed");
      result = "PayPal declined the payment. Nothing was charged.";
    }
  } else if (decision.verdict === "ask") {
    if (member) {
      // The payer may be anywhere: their phone gets the request with Approve and Decline on it.
      await notify(wallet.id, {
        purchaseId: id,
        title: `${member.name} wants ${money(decision.amountCents)} at ${product.shop}`,
        body: `${product.title}. ${decision.reasons[0] ?? ""}`.trim(),
      });
      result = `Not paid yet. ${wallet.ownerName ?? "The payer"} has been asked to approve it, because: ${decision.reasons.join(" ")}`;
    } else {
      result = `Not paid yet. The person has been asked to approve it, because: ${decision.reasons.join(" ")}`;
    }
  } else {
    result = `Blocked. Nothing was paid, because: ${decision.reasons.join(" ")}`;
  }

  return { purchase: getPurchase(wallet.id, id)!, result };
}
