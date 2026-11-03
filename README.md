# Allowance

Give your shopping agent an allowance, not your wallet.

AI agents can now find and buy things for us, but most people won't hand one their payment details. An agent can overspend, buy the wrong thing, or be talked into a bad purchase by a product page. Allowance is the missing piece in between: you set spending rules in your own words, link PayPal once, and the agent can only spend inside those rules. Anything outside them comes back to you for a one-tap yes or no, and anything suspicious is stopped with the reason shown.

## How it works

1. **You write your rules** in plain words, for example: "$60 a week on groceries. Gifts up to $40 each. Ask me before using a shop you haven't used before. No subscriptions." Claude turns them into a structured rule set, and the page shows back exactly what it understood.
2. **You link PayPal once**, in PayPal's own window. Allowance never sees your login or card. PayPal gives the server a saved payment token (PayPal Vault).
3. **You ask for something**: "a birthday gift for my mum, she loves gardening".
4. **The agent shops.** Claude searches real products across real shops with Channel3, compares price, ratings and fit, and asks to buy one.
5. **The guard decides.** Before any money moves, plain code checks the purchase against your rules and returns one of three answers:
   - **Pay**: everything passes, and PayPal charges your linked account straight away.
   - **Ask you**: something is outside your rules (over a limit, a new shop, a budget running low). You get Approve or Decline.
   - **Block**: something looks wrong (the price went up at checkout, the link goes to a different shop, it's a subscription you banned). Nothing is paid, and you see why.
6. **Every attempt is recorded** in the spending list: what was asked, what the agent chose and why, each check and its result, and the PayPal order. Paid purchases can be refunded from there.

## Why the AI can't talk its way past your rules

The model never holds a payment tool. It has two tools: `search_products` and `buy(product_id)`. Whether money moves is decided by [lib/guard.ts](lib/guard.ts), which is ordinary, tested TypeScript with no AI in it.

- **The budget is chosen before any shop data is read.** Which budget a request counts against (groceries, gifts, ...) is decided from your words alone, before the agent sees a single product page. A product description can't move itself into a bigger budget.
- **The agent can only buy by id.** It picks from products it actually found. It can't invent a price, a shop or a link.
- **The price is checked again right before paying.** Channel3 looks the product up a second time. If the price went up, or the item went out of stock, the purchase is blocked.
- **The link has to go to the shop it claims.** `target.com.evil.example` is not `target.com`.
- **Shop text is treated as information, never instructions.**
- **One purchase per request**, and PayPal requests carry an idempotency key, so a retry can't charge twice. Approving is an atomic database update, so a double tap can't pay twice either.

The guard has 17 unit tests covering each of these cases: `npm test`.

## How it uses PayPal

| What | PayPal API |
| --- | --- |
| Link PayPal once, without the person sharing anything | **Vault v3**: setup token → buyer approves in PayPal's window (JS SDK v6 `PayPalSavePaymentButton`) → payment token |
| The agent pays while you're not there | **Orders v2** with `payment_source.paypal.vault_id` and `stored_credential` (merchant-initiated, unscheduled). The order completes in one call. |
| No double charges | `PayPal-Request-Id` set to the purchase id |
| Return a purchase | **Payments v2** refund on the capture |
| Unlink | Vault payment token deleted |

Server calls use PayPal's official [`@paypal/paypal-server-sdk`](https://www.npmjs.com/package/@paypal/paypal-server-sdk). The browser button uses [`@paypal/react-paypal-js`](https://www.npmjs.com/package/@paypal/react-paypal-js) on PayPal's v6 web SDK.

**Why not the PayPal Agent Toolkit?** The Agent Toolkit gives the model PayPal tools directly, so the model itself can create and capture payments. Allowance takes the opposite position on purpose: the model can only propose a purchase, and deterministic code holds the payment. That separation is the product.

## How it uses AI

Claude (`claude-opus-5-5`, through the official Anthropic SDK) does three jobs:

- Turns plain-word rules into a structured rule set (structured outputs with a zod schema).
- Decides which budget a request belongs to, from the request text only.
- Runs the shopping agent: searches, compares and proposes one purchase, then explains the outcome in two or three sentences.

The hosted demo has a daily cap on what it spends on Claude (`DAILY_AI_BUDGET_USD`).

## How it uses Channel3

[Channel3](https://trychannel3.com) provides product search across real online shops: `products.search` for the agent's searches (in-stock only, with a price ceiling), and `products.lookup` to re-check price and stock just before paying.

## Run it locally

You need Node 24 or newer.

```sh
git clone https://github.com/bornBrian/allowance.git
cd allowance
npm install
cp .env.example .env   # then fill in the keys; each line says where to get it
npm run dev
```

Open http://localhost:3000. In the PayPal developer dashboard, the sandbox app needs **Save payment methods** turned on, so linking PayPal works.

Data is kept in a single SQLite file (`data/allowance.db`), using the SQLite built into Node.

```sh
npm test          # guard tests
npm run typecheck
npm run build
```

## Project layout

```
lib/guard.ts      the rules check: pay, ask or block (no AI)
lib/agent.ts      the shopping agent and its two tools
lib/claude.ts     rules parsing, request classification, daily AI cost cap
lib/paypal.ts     Vault, orders, refunds
lib/channel3.ts   product search and the checkout re-check
lib/db.ts         wallets, purchases, the spending list
app/              the web page and API routes
tests/            guard tests
```

## Built with

Next.js 16, React 19, TypeScript, PayPal Vault, Orders v2 and Payments v2, PayPal JS SDK v6, Claude Opus 5.5, Channel3, SQLite (built into Node 24), hosted on Render.

## Licence

MIT. See [LICENSE](LICENSE).
