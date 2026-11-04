# 5. Look at the shop again before money moves

Date: 2026-11-04

## Status

Accepted

## Context

Search results can be minutes old, and a purchase that waits for the person's approval can be hours old. Prices change; items sell out. A changed price at checkout is also a classic sign of a bait-and-switch.

## Decision

Right before any payment, look the product up again with Channel3 (`products.lookup`):

- When the agent asks to buy: a higher price, a currency change or no stock blocks the purchase; a price that can't be confirmed sends it to the person.
- When the person approves a waiting purchase: a higher price or no stock blocks it; otherwise the lower of the approved and current price is charged.

Every second look is added to the purchase's recorded checks.

## Consequences

- The person never pays more than the amount they saw.
- One extra Channel3 call per purchase, counted against the monthly cap.
