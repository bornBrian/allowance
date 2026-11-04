# Architecture decision records

Each file records one decision: the situation, what was decided, and what follows from it. The format is Michael Nygard's [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-model-proposes-code-decides.md) | The model proposes, code decides | Accepted |
| [0002](0002-paypal-vault-merchant-initiated-payments.md) | PayPal Vault with merchant-initiated payments | Accepted |
| [0003](0003-not-the-paypal-agent-toolkit.md) | Not using the PayPal Agent Toolkit for payments | Accepted |
| [0004](0004-budget-before-product-data.md) | Choose the budget before reading any product data | Accepted |
| [0005](0005-recheck-before-paying.md) | Look at the shop again before money moves | Accepted |
| [0006](0006-sqlite-in-node.md) | One process with the SQLite built into Node | Accepted |
| [0007](0007-limits-and-cost-caps.md) | Limits and cost caps counted in the database | Accepted |
| [0008](0008-human-check.md) | An optional human check with Cloudflare Turnstile | Accepted |
