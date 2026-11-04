# 2. PayPal Vault with merchant-initiated payments

Date: 2026-11-03

## Status

Accepted

## Context

The point of an agent is that it acts while the person is busy. A standard PayPal checkout needs the buyer to approve each payment in PayPal's window, which defeats that. The app must also never hold the person's PayPal login or card.

## Decision

Use **PayPal Vault (v3)**. The person links PayPal once: the server creates a setup token (`usage_type: MERCHANT`, `usage_pattern: UNSCHEDULED_PREPAID`), the person approves it in PayPal's window through the JS SDK v6 `PayPalSavePaymentButton`, and the server exchanges it for a payment token.

Later charges are **Orders v2** requests with `payment_source.paypal.vault_id` and `stored_credential` (`payment_initiator: MERCHANT`, `usage: SUBSEQUENT`, `usage_pattern: UNSCHEDULED_PREPAID`). These complete in one call, with no buyer present. Each carries `PayPal-Request-Id` set to the purchase id. Refunds use Payments v2. Unlinking deletes the payment token.

Server calls use the official `@paypal/paypal-server-sdk`.

## Consequences

- The agent can pay immediately when the guard allows it. In the sandbox a charge completes in about four seconds.
- The person can revoke access from Allowance (unlink) or from their PayPal account.
- The setup token is remembered per wallet, and the exchange only accepts that token, so one person can't attach their PayPal to another's wallet.
- Vault must be switched on for the PayPal app ("Save payment methods"), and availability depends on the merchant's country. The demo uses a US sandbox merchant.
