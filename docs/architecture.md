# Architecture

This document follows the [arc42](https://arc42.org) template, trimmed to the sections that carry weight for a project this size. Diagrams use the [C4 model](https://c4model.com)'s levels (context, containers, components), drawn in Mermaid so GitHub renders them.

## 1. Goals

Allowance lets an AI agent buy things with a person's PayPal account, but only within rules the person set in plain words. See [concept.md](concept.md) for the problem and the people it's for.

Quality goals, in priority order:

| # | Goal | What it means here |
| --- | --- | --- |
| 1 | Money safety | No payment happens unless code, not the model, decided it should. No double charges. |
| 2 | Correct decisions | Budgets, limits and price checks are exact, in integer cents, and tested. |
| 3 | Explainability | Every decision is recorded with the checks that led to it, in plain sentences. |
| 4 | Cost control | A public demo can't run up unbounded AI, search or payment API usage. |
| 5 | Simplicity | One process, one database file, few moving parts. |

## 2. Constraints

- PayPal **sandbox** only (hackathon rule). No real money moves.
- The hosted demo must stay up and free to use until judging ends (15 Dec 2026).
- Channel3's free plan: 1,000 API calls a month.
- One developer, about ten days.

## 3. Context

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart TB
    person(["<b>Person</b><br/>Sets rules, asks for things,<br/>approves or declines"])
    allowance["<b>Allowance</b><br/>Web app: agent, guard,<br/>spending record"]
    paypal["<b>PayPal</b> (sandbox)<br/>Vault, Orders v2, Payments v2"]
    channel3["<b>Channel3</b><br/>Product search across real shops"]
    claude["<b>Claude API</b><br/>Claude Opus 5.5"]
    turnstile["<b>Cloudflare Turnstile</b><br/>Human check"]

    person -->|"uses, in a browser"| allowance
    person -->|"links account once,<br/>in PayPal's window"| paypal
    allowance -->|"saves payment token,<br/>charges, refunds"| paypal
    allowance -->|"searches, re-checks price"| channel3
    allowance -->|"reads rules, classifies,<br/>runs the shopping agent"| claude
    allowance -->|"verifies tokens"| turnstile

    classDef system fill:#1d1d1f,color:#fff,stroke:#1d1d1f
    classDef external fill:#f5f5f7,color:#1d1d1f,stroke:#c7c7cc
    class allowance system
    class paypal,channel3,claude,turnstile external
```

## 4. Solution strategy

| Problem | Approach |
| --- | --- |
| The model could be wrong or manipulated | **The model proposes, code decides.** The model has two tools, `search_products` and `buy(product_id)`. It has no payment tool. [lib/guard.ts](../lib/guard.ts) decides pay, ask or block. ([ADR 0001](decisions/0001-model-proposes-code-decides.md)) |
| The agent has to pay while the person is away | **PayPal Vault** saves the person's PayPal as a payment token; charges are merchant-initiated Orders v2 calls that complete in one request. ([ADR 0002](decisions/0002-paypal-vault-merchant-initiated-payments.md)) |
| A product page could try to change the budget | **The budget is chosen from the person's words before any product is read.** ([ADR 0004](decisions/0004-budget-before-product-data.md)) |
| Prices change | **Look again before money moves**, both for automatic purchases and when the person approves later. ([ADR 0005](decisions/0005-recheck-before-paying.md)) |
| A public demo can be abused | **Limits per wallet and per IP, global cost caps, and a human check**, all counted in the same database. ([ADR 0007](decisions/0007-limits-and-cost-caps.md), [ADR 0008](decisions/0008-human-check.md)) |
| Keep it small | **One Next.js process and SQLite built into Node.** ([ADR 0006](decisions/0006-sqlite-in-node.md)) |

## 5. Building blocks

### Containers

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart TB
    browser["<b>Web page</b><br/>React 19, PayPal JS SDK v6 button,<br/>Turnstile widget"]
    server["<b>Server</b><br/>Next.js 16 route handlers on Node 24"]
    db[("<b>SQLite</b><br/>wallets, purchases,<br/>counters, AI spend")]
    browser -->|"JSON over HTTPS,<br/>agent progress as NDJSON stream"| server
    server -->|"node:sqlite"| db
```

### Components (inside the server)

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart LR
    routes["API routes<br/><i>app/api</i>"]
    proxy["Proxy<br/><i>proxy.ts</i><br/>CSP, same-origin"]
    agent["Agent<br/><i>lib/agent.ts</i>"]
    purchase["Purchase<br/><i>lib/purchase.ts</i>"]
    guard["Guard<br/><i>lib/guard.ts</i>"]
    claudeC["Claude client<br/><i>lib/claude.ts</i>"]
    c3["Channel3 client<br/><i>lib/channel3.ts</i>"]
    pp["PayPal client<br/><i>lib/paypal.ts</i>"]
    limits["Limits<br/><i>lib/limits.ts</i>"]
    clean["Sanitize<br/><i>lib/sanitize.ts</i>"]
    db["Data<br/><i>lib/db.ts</i>"]

    proxy --> routes
    routes --> limits
    routes --> clean
    routes --> agent
    routes --> pp
    agent --> claudeC
    agent --> c3
    agent --> purchase
    purchase --> c3
    purchase --> guard
    purchase --> pp
    purchase --> db
    limits --> db
    c3 --> limits
    claudeC --> db
```

| Component | File | Responsibility |
| --- | --- | --- |
| Proxy | [proxy.ts](../proxy.ts) | Per-request Content Security Policy with a nonce; refuses API writes from other origins |
| API routes | [app/api](../app/api) | Validate input, apply limits, call the domain code, return the page's state |
| Agent | [lib/agent.ts](../lib/agent.ts) | Runs Claude with two tools; only lets it buy products it found itself |
| Purchase | [lib/purchase.ts](../lib/purchase.ts) | Second look at the shop, guard decision, record, PayPal charge |
| Guard | [lib/guard.ts](../lib/guard.ts) | Pure function: proposal + checkout + rules + history → pay / ask / block with reasons |
| Claude client | [lib/claude.ts](../lib/claude.ts) | Parses rules, classifies requests, records token cost, enforces the daily AI budget |
| Channel3 client | [lib/channel3.ts](../lib/channel3.ts) | Search and lookup; cleans every field a shop wrote |
| PayPal client | [lib/paypal.ts](../lib/paypal.ts) | Vault setup and payment tokens, merchant-initiated orders, refunds |
| Limits | [lib/limits.ts](../lib/limits.ts) | Rate limits, quotas and the Channel3 monthly cap |
| Sanitize | [lib/sanitize.ts](../lib/sanitize.ts) | Removes control, zero-width and direction-override characters; https-only links |
| Data | [lib/db.ts](../lib/db.ts) | SQLite schema and queries; atomic status changes |

## 6. Runtime

### Linking PayPal

```mermaid
%%{init: {"theme": "neutral"}}%%
sequenceDiagram
    autonumber
    actor P as Person
    participant B as Web page
    participant S as Server
    participant PP as PayPal
    P->>B: Click the PayPal button
    B->>S: POST /api/paypal/setup-token
    S->>PP: Create vault setup token (usage: merchant, unscheduled)
    PP-->>S: setup token id
    S->>S: Remember it for this wallet
    S-->>B: setup token id
    B->>PP: Open PayPal's window with the token
    P->>PP: Log in and agree
    PP-->>B: Approved
    B->>S: POST /api/paypal/payment-token
    S->>S: Is this the token this wallet started? If not, refuse
    S->>PP: Exchange setup token for payment token
    PP-->>S: payment token id, payer email
    S-->>B: Linked to payer email
```

### Asking for something

```mermaid
%%{init: {"theme": "neutral"}}%%
sequenceDiagram
    autonumber
    actor P as Person
    participant S as Server
    participant C as Claude
    participant C3 as Channel3
    participant G as Guard
    participant PP as PayPal
    P->>S: "A birthday gift for my mum, she loves gardening"
    S->>C: Which budget is this? (request text only)
    C-->>S: gifts, search "gardening gift"
    S->>C: Run agent with search_products and buy
    C->>S: search_products("gardening gift set")
    S->>C3: Search, in stock, USD
    C3-->>S: Products (cleaned)
    S-->>C: Products with ids
    C->>S: buy(product_id, why)
    S->>S: Only ids from its own search results
    S->>C3: Look the product up again
    C3-->>S: Current price and stock
    S->>G: decide(proposal, checkout, rules, history)
    G-->>S: pay / ask / block, with checks
    alt pay
        S->>PP: Create order, vault id, stored credential, request id = purchase id
        PP-->>S: COMPLETED, capture id
    end
    S-->>C: What happened, in a sentence
    C-->>S: Two or three sentence reply
    S-->>P: Steps, options, result and checks (streamed)
```

### Approving a purchase that waited

```mermaid
%%{init: {"theme": "neutral"}}%%
sequenceDiagram
    autonumber
    actor P as Person
    participant S as Server
    participant C3 as Channel3
    participant PP as PayPal
    P->>S: Approve
    S->>S: Move waiting → paying, only if still waiting
    S->>C3: Look the product up again
    alt price went up or out of stock
        S->>S: Mark blocked, record why
        S-->>P: Not paid, and why
    else price same or lower
        S->>PP: Charge the lower of approved and current price
        PP-->>S: COMPLETED
        S-->>P: Paid
    end
```

## 7. Deployment

Planned for the hosted demo:

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart LR
    user(["Browser"]) -->|HTTPS| render["Render web service<br/>Node 24, next start"]
    render --> disk[("Render persistent disk<br/>DATABASE_PATH=/var/data/allowance.db")]
    render --> ext["PayPal sandbox, Channel3,<br/>Claude API, Turnstile"]
```

Secrets are set as Render environment variables, never in the repository. A single instance keeps the in-process "one agent run per wallet" lock and the SQLite counters exact.

## 8. Crosscutting concepts

### Data

```mermaid
%%{init: {"theme": "neutral"}}%%
erDiagram
    WALLET ||--o{ PURCHASE : makes
    WALLET {
        text id PK "random UUID, in an httpOnly cookie"
        text rules_text "the person's own words"
        text rules_json "structured rules"
        text paypal_token_id "PayPal Vault payment token"
        text paypal_email
        text paypal_setup_token "link attempt in progress"
        text verified_at "passed the human check"
    }
    PURCHASE {
        text id PK "also the PayPal request id"
        text wallet_id FK
        text request "what the person asked"
        text product_id
        text title
        text shop
        text url
        text category "chosen from the request"
        int amount_cents
        text status
        text why "the agent's reason"
        text checks_json "every guard check"
        text paypal_order_id
        text paypal_capture_id
    }
    COUNTER {
        text key PK "action, who, window"
        int count
        int expires_at
    }
    AI_SPEND {
        text day PK
        int micro_usd
    }
```

### Purchase lifecycle

```mermaid
%%{init: {"theme": "neutral"}}%%
stateDiagram-v2
    [*] --> paying: guard says pay
    [*] --> waiting: guard says ask
    [*] --> blocked: guard says block
    paying --> paid: PayPal COMPLETED
    paying --> failed: PayPal refused
    waiting --> paying: person approves, price holds
    waiting --> blocked: person approves, price rose or sold out
    waiting --> declined: person declines
    paid --> refunded: person refunds
    paid --> paid: refund failed (reverted)
```

Every move out of a state is a single `UPDATE … WHERE status = ?`, so two taps, two tabs or a retry can't take the same path twice.

### Money

Amounts are integer cents everywhere past the edges. The guard compares cents; PayPal receives a string with two decimals. Only US dollars are accepted.

### Errors

Errors meant for the person (`UserError`, `LimitReached`) carry their own message and HTTP status. Anything else is logged on the server and replaced with a general message, so internal details never reach the browser.

### Idempotency

The purchase id is sent to PayPal as `PayPal-Request-Id`. PayPal returns the same order for the same id, so a retry after a timeout cannot charge twice. Verified against the sandbox: see [testing.md](testing.md#manual-tests-against-the-sandbox).

## 9. Decisions

See [decisions/](decisions/README.md).

## 10. Quality scenarios

| Scenario | Expected response | Where |
| --- | --- | --- |
| A product page tells the agent the item is pre-approved | The guard still asks the person; no charge | `tests/purchase.test.ts` |
| The price rises between search and payment | Blocked, with old and new price | `tests/guard.test.ts`, `tests/purchase.test.ts` |
| The person taps Approve twice | One charge; the second tap gets "already dealt with" | `claimStatus` in `lib/db.ts` |
| The PayPal call times out and is retried | Same order returned; one charge | Manual sandbox test |
| Someone scripts the ask endpoint | Limited per wallet, per IP, and by the daily AI budget | `tests/limits.test.ts` |
| Claude calls `buy` twice in one turn | Only the first counts | `lib/agent.ts` |

## 11. Risks and technical debt

| Risk | Current state | Next step |
| --- | --- | --- |
| A server crash between "paying" and PayPal's answer leaves a purchase stuck in `paying` | Rare; the PayPal request id makes a retry safe | A start-up job that asks PayPal about `paying` orders and settles them |
| Wallets live in a cookie, with no account | Fine for a demo; losing the cookie loses the wallet | Sign-in, so a wallet can be shared across devices |
| The agent lock is in memory | Correct for one instance | Move it to the database if the app ever runs on several instances |
| Classification is done by the model | A misread category falls back to "ask" when no rule covers it | Let the person correct the category on the result |

## 12. Glossary

| Term | Meaning |
| --- | --- |
| Wallet | One person's allowance: their rules, linked PayPal and purchases |
| Guard | The plain-code check that decides pay, ask or block |
| Vault | PayPal's service for saving a payment method for later charges |
| Setup token / payment token | PayPal Vault's two steps: a token the buyer approves, then a long-lived token to charge |
| Merchant-initiated | A charge made by the merchant without the buyer present, using a saved payment token |
| Turnstile | Cloudflare's check that a visitor is a person |
