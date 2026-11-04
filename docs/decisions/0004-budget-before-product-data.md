# 4. Choose the budget before reading any product data

Date: 2026-11-03

## Status

Accepted

## Context

Budgets differ by category: $60 a week on groceries, $40 per gift. If the category were chosen after the model had read product pages, a product could describe itself as "groceries" to fall under a roomier budget.

## Decision

Before the agent runs, a separate, short Claude call classifies the request into one of the person's categories, using only the person's request text. That category is fixed for the request and passed to the guard. Nothing the agent reads later can change it.

## Consequences

- A product can't move itself into a different budget. Tested in `tests/purchase.test.ts`.
- If the classifier picks a category no rule covers, the guard asks the person rather than paying.
- One extra, inexpensive model call per request (low effort, small output).
