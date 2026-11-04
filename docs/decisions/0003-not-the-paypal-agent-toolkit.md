# 3. Not using the PayPal Agent Toolkit for payments

Date: 2026-11-03

## Status

Accepted

## Context

PayPal's Agent Toolkit exposes PayPal operations (create order, capture, refund and more) as tools a model can call directly. It's the quickest way to give an agent PayPal access.

## Decision

Don't give the model PayPal tools. Call PayPal from server code, after the guard has decided ([ADR 0001](0001-model-proposes-code-decides.md)).

## Consequences

- The separation between "the model suggests" and "code pays" is structural, not a matter of prompting.
- PayPal calls are written by hand with the official server SDK, which is more code than the toolkit.
- The toolkit would fit well in a different role, such as an assistant that answers questions about past orders, where no money moves.
