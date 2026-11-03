import { requireHuman } from "@/lib/captcha";
import { saveSetupToken } from "@/lib/db";
import { appUrl, clientIp, failure } from "@/lib/http";
import { limit } from "@/lib/limits";
import { createSetupToken } from "@/lib/paypal";
import { currentWallet } from "@/lib/session";

// Step 1 of linking PayPal: the button opens this setup token in PayPal's window.
// The token is remembered for this browser, and step 2 accepts no other.
export async function POST(req: Request) {
  try {
    const wallet = await currentWallet();
    requireHuman(wallet);
    limit("paypal", { wallet: wallet.id, ip: await clientIp() });
    const vaultSetupToken = await createSetupToken(appUrl(req));
    saveSetupToken(wallet.id, vaultSetupToken);
    return Response.json({ vaultSetupToken });
  } catch (err) {
    return failure(err, "Couldn't start linking PayPal.");
  }
}
