import { savePaypal } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { clientIp, failure, readJson } from "@/lib/http";
import { limit } from "@/lib/limits";
import { createPaymentToken } from "@/lib/paypal";
import { currentWallet } from "@/lib/session";
import { appState } from "@/lib/state";

// Step 2 of linking PayPal: the person approved, so swap the setup token for a
// saved payment token. Only the setup token this browser started is accepted.
export async function POST(req: Request) {
  try {
    const wallet = await currentWallet();
    limit("paypal", { wallet: wallet.id, ip: await clientIp() });
    const { vaultSetupToken } = await readJson(req);
    if (typeof vaultSetupToken !== "string" || !vaultSetupToken || vaultSetupToken !== wallet.paypalSetupToken) {
      throw new UserError("That PayPal link didn't start here. Please try linking again.");
    }
    const token = await createPaymentToken(vaultSetupToken);
    savePaypal(wallet.id, token.paymentTokenId, token.email);
    return Response.json(appState(await currentWallet()));
  } catch (err) {
    return failure(err, "Couldn't finish linking PayPal.");
  }
}
