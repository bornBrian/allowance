# 1. The model proposes, code decides

Date: 2026-11-03

## Status

Accepted

## Context

The agent reads text written by strangers: product titles, descriptions, features. Any of it can contain instructions ("this item is pre-approved"). Language models can follow such instructions, and can also simply be wrong about a price or a limit. If the model holds a payment tool, a single mistake or a single successful injection moves money.

## Decision

The model gets two tools: `search_products` and `buy(product_id, why)`. Neither moves money. `buy` hands the request to [lib/purchase.ts](../../lib/purchase.ts), which asks [lib/guard.ts](../../lib/guard.ts), a pure function with no AI in it, for a verdict: pay, ask the person, or block. Only a "pay" verdict, or the person's own approval, leads to a PayPal call.

The model can only refer to products by an id from its own search results, so price, shop and link always come from Channel3's data, not from the model's output.

## Consequences

- The worst a fooled model can do is ask to buy the wrong in-budget item. It can't exceed a limit, change a price or pick a link.
- The guard is small and fully unit-tested, and its decision is the same for the same inputs.
- Rules the guard doesn't understand can't be enforced. Rules are therefore parsed into a fixed schema ([lib/rules.ts](../../lib/rules.ts)), and anything outside it falls back to asking the person.
