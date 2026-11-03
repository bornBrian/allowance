import { savePaypal } from "@/lib/db";
import { clientIp, failure } from "@/lib/http";
import { limit } from "@/lib/limits";
import { forgetPaymentToken } from "@/lib/paypal";
import { currentWallet } from "@/lib/session";
import { appState } from "@/lib/state";

// Removes the saved PayPal account from PayPal's vault and from here.
export async function POST() {
  try {
    const wallet = await currentWallet();
    limit("paypal", { wallet: wallet.id, ip: await clientIp() });
    if (wallet.paypalTokenId) {
      try {
        await forgetPaymentToken(wallet.paypalTokenId);
      } catch (err) {
        // Forget it here regardless; the person asked for it to be gone.
        console.error("PayPal token delete failed", err);
      }
      savePaypal(wallet.id, null, null);
    }
    return Response.json(appState(await currentWallet()));
  } catch (err) {
    return failure(err, "Couldn't unlink PayPal.");
  }
}
