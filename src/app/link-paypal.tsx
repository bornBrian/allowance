"use client";

import { PayPalProvider, PayPalSavePaymentButton } from "@paypal/react-paypal-js/sdk-v6";
import type { AppState } from "@/lib/state";

// PayPal's own button. It opens PayPal, the person logs in and agrees, and
// PayPal hands back a setup token that the server swaps for a saved payment token.
export function LinkPayPal({
  clientId,
  onLinked,
  onError,
}: {
  clientId: string;
  onLinked: (state: AppState) => void;
  onError: (message: string | null) => void;
}) {
  return (
    <PayPalProvider clientId={clientId} environment="sandbox" components={["paypal-payments"]} pageType="checkout">
      <div style={{ maxWidth: 320 }}>
        <PayPalSavePaymentButton
          createVaultToken={async () => {
            onError(null);
            const res = await fetch("/api/paypal/setup-token", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return { vaultSetupToken: data.vaultSetupToken as string };
          }}
          onApprove={async ({ vaultSetupToken }) => {
            const res = await fetch("/api/paypal/payment-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vaultSetupToken }),
            });
            const data = await res.json();
            if (!res.ok) return onError(data.error ?? "Couldn't finish linking PayPal.");
            onLinked(data as AppState);
          }}
          onCancel={() => onError("Linking was cancelled.")}
          onError={() => onError("PayPal couldn't link your account. Please try again.")}
        />
      </div>
    </PayPalProvider>
  );
}
