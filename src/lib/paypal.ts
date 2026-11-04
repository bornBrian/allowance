import "server-only";
import { randomUUID } from "node:crypto";
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  ItemCategory,
  OrdersController,
  PaymentInitiator,
  PaymentsController,
  PaypalPaymentTokenUsageType,
  StoredPaymentSourceUsageType,
  UsagePattern,
  VaultController,
  VaultTokenRequestType,
  VaultUserAction,
} from "@paypal/paypal-server-sdk";

// How money moves:
// 1. Once, the person links PayPal: we make a setup token, they approve it in
//    PayPal's own window, and PayPal gives us a payment token. We never see
//    their login or card.
// 2. When the guard says "pay", we charge that payment token with Orders v2.
//    The order completes straight away, without the person present, because
//    they agreed to it in step 1.
// Everything runs in the PayPal sandbox, so no real money moves.

let client: Client | null = null;

function paypal(): Client {
  if (!client) {
    const oAuthClientId = process.env.PAYPAL_CLIENT_ID;
    const oAuthClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!oAuthClientId || !oAuthClientSecret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
    client = new Client({
      clientCredentialsAuthCredentials: { oAuthClientId, oAuthClientSecret },
      environment: Environment.Sandbox,
      timeout: 20_000,
    });
  }
  return client;
}

// The public half of the keys, for the browser button. Null until it's set.
export function paypalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID || null;
}

// Step 1a: ask PayPal for a setup token the browser button can open.
export async function createSetupToken(appUrl: string): Promise<string> {
  const { result } = await new VaultController(paypal()).createSetupToken({
    paypalRequestId: randomUUID(),
    body: {
      paymentSource: {
        paypal: {
          description: "Allowance: purchases your agent makes within the rules you set",
          usagePattern: UsagePattern.UnscheduledPrepaid,
          usageType: PaypalPaymentTokenUsageType.Merchant,
          permitMultiplePaymentTokens: false,
          experienceContext: {
            brandName: "Allowance",
            returnUrl: `${appUrl}/`,
            cancelUrl: `${appUrl}/`,
            userAction: VaultUserAction.Continue,
          },
        },
      },
    },
  });
  if (!result.id) throw new Error("PayPal returned no setup token");
  return result.id;
}

// Step 1b: after the person approves, swap the setup token for a payment token.
export async function createPaymentToken(setupTokenId: string) {
  const { result } = await new VaultController(paypal()).createPaymentToken({
    paypalRequestId: randomUUID(),
    body: { paymentSource: { token: { id: setupTokenId, type: VaultTokenRequestType.SetupToken } } },
  });
  if (!result.id) throw new Error("PayPal returned no payment token");
  return {
    paymentTokenId: result.id,
    customerId: result.customer?.id ?? null,
    email: result.paymentSource?.paypal?.emailAddress ?? null,
  };
}

export async function forgetPaymentToken(paymentTokenId: string): Promise<void> {
  await new VaultController(paypal()).deletePaymentToken(paymentTokenId);
}

export interface Charge {
  paymentTokenId: string;
  purchaseId: string;
  amountCents: number;
  title: string;
  shop: string;
  url: string;
}

// Step 2: charge the saved PayPal account for one approved purchase.
export async function charge(c: Charge) {
  const value = (c.amountCents / 100).toFixed(2);
  const { result } = await new OrdersController(paypal()).createOrder({
    paypalRequestId: c.purchaseId, // retrying the same purchase can never charge twice
    prefer: "return=representation",
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          referenceId: c.purchaseId,
          customId: c.purchaseId,
          description: `${c.title} from ${c.shop}`.slice(0, 127),
          softDescriptor: "ALLOWANCE",
          amount: {
            currencyCode: "USD",
            value,
            breakdown: { itemTotal: { currencyCode: "USD", value } },
          },
          items: [
            {
              name: c.title.slice(0, 127),
              quantity: "1",
              unitAmount: { currencyCode: "USD", value },
              url: c.url,
              category: ItemCategory.PhysicalGoods,
            },
          ],
        },
      ],
      paymentSource: {
        paypal: {
          vaultId: c.paymentTokenId,
          storedCredential: {
            paymentInitiator: PaymentInitiator.Merchant,
            usage: StoredPaymentSourceUsageType.Subsequent,
            usagePattern: UsagePattern.UnscheduledPrepaid,
          },
        },
      },
    },
  });

  const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
  return {
    orderId: result.id ?? null,
    captureId: capture?.id ?? null,
    status: result.status ?? null,
    paid: result.status === "COMPLETED" && capture?.status === "COMPLETED",
  };
}

export async function refund(captureId: string, purchaseId: string) {
  const { result } = await new PaymentsController(paypal()).refundCapturedPayment({
    captureId,
    paypalRequestId: `refund-${purchaseId}`,
  });
  return { refundId: result.id ?? null, status: result.status ?? null };
}
