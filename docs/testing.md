# Test plan

The structure follows the test plan sections of **ISO/IEC/IEEE 29119-3** (context, risks, strategy, criteria, environment, traceability), shortened to fit a project this size. Results of the manual tests are recorded at the end.

## 1. Context

**Test items:** the Allowance web app at the current `main` commit: the guard, the purchase path, the API routes, the PayPal, Channel3 and Claude clients, and the page.

**In scope:** whether money moves only when it should, whether limits and caps hold, and whether input from people and shops is handled safely.

**Out of scope:** PayPal's, Channel3's, Anthropic's and Cloudflare's own services; load testing beyond the rate limits; browsers other than current Chromium-based ones and Safari.

## 2. Risks that drive the testing

Tests are weighted by what it costs if something is wrong. Money first.

| Risk | Impact | Tested by |
| --- | --- | --- |
| A payment happens that the rules don't allow | High | Guard and purchase unit tests; manual sandbox tests |
| A payment happens twice | High | Idempotency check against the sandbox; atomic status changes |
| A product page steers the agent into paying | High | Purchase tests with injected text |
| The wrong amount is charged | High | Checkout price tests (higher, lower, unconfirmed) |
| Budgets are counted wrongly across weeks or months | Medium | Period and budget tests |
| A public demo is drained by scripts | Medium | Limit tests |
| Hidden characters or bad links get through | Medium | Sanitisation tests |
| The page breaks on a phone or in dark mode | Low | Screenshot review |

## 3. Strategy

### Levels

| Level | What | How |
| --- | --- | --- |
| Unit | Guard decisions, period maths, text cleaning, rate limits | Vitest, no network |
| Component | The whole purchase path (second look, guard, record, charge) | Vitest with an in-memory SQLite database and fakes for Channel3 and PayPal |
| System | The running app with real sandbox services | Manual, scripted where possible (section 6) |
| Static | Types, dependency vulnerabilities | `tsc --noEmit`, `npm audit` |

### Techniques

- **Equivalence partitioning and boundary values** for amounts: within the limit, at it, one cent over; budgets with spending from this week and last week.
- **State transitions** for the purchase lifecycle (see the state diagram in [architecture.md](architecture.md#purchase-lifecycle)): waiting → paying → paid, waiting → declined, paid → refunded, and the transitions that must be refused.
- **Error guessing / adversarial inputs** for prompt injection, spoofed shop domains (`target.com.evil.example`), full-width look-alikes, zero-width and direction-override characters, `javascript:` and credential-carrying links.

### Entry and exit criteria

- **Entry:** the code typechecks.
- **Exit (every push to `main` and every pull request):** all automated tests pass, the production build succeeds, and `npm audit` reports no high or critical issues in production dependencies. Enforced by [.github/workflows/ci.yml](../.github/workflows/ci.yml).
- **Release (hosted demo):** the exit criteria, plus the manual system tests in section 6 passing against the deployed URL.

### Environment

- Node 24, Ubuntu (CI) and Windows 11 (development).
- SQLite in memory for automated tests; a file for manual runs.
- PayPal sandbox with a US business (merchant) account and a US personal (buyer) account.

## 4. Running the tests

```sh
npm test            # all automated tests
npm run typecheck   # types
npm run build       # production build
```

## 5. Traceability

| Requirement | Tests |
| --- | --- |
| Pays within the rules | `guard: pays for a gift within the limit from a trusted shop`, `purchase: pays within the rules, once, for the agreed amount` |
| Asks outside the rules | `guard: asks when a gift is over the per-item limit`, `asks before a shop that hasn't been used and isn't trusted`, `asks when the weekly groceries budget would be passed`, `asks when no rule covers the category`, `asks before buying the same thing twice in a week`, `purchase: asks the person instead of paying when it's over their limit`, `counts what was already paid this week` |
| Blocks what looks wrong | `guard: blocks when the price goes up at checkout`, `blocks when out of stock`, `blocks subscriptions`, `blocks a link that goes somewhere other than the shop`, `blocks non-dollar prices`, `purchase: blocks when the price went up at checkout`, `blocks a link that leads somewhere other than the shop`, `blocks a subscription when the rules say no subscriptions` |
| Never pays more than shown | `guard: charges the lower price when it drops at checkout`, `asks when the price can't be confirmed`, `purchase: pays the lower price if it came down at checkout` |
| Resists prompt injection | `purchase: ignores instructions written into a product page`, `can't be moved into a bigger budget by the product` |
| No double charges | `purchase: uses the purchase id as PayPal's request id`, manual test M2 |
| Honest failure | `purchase: records a failed payment without claiming it was paid` |
| Budget periods | `guard: ignores spending from last week`, `periodStart: starts weeks on Monday`, `starts months on the 1st` |
| Safe text and links | `sanitize: *` (20 tests) |
| Limits and caps | `limits: *` (6 tests) |

## 6. Manual tests against the sandbox

| Id | Test | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| M1 | Link PayPal | Click the PayPal button, log in as the US personal sandbox account, agree | "Linked to" the buyer's email | Passed, 4 Nov 2026 |
| M2 | Charge without the buyer present, then retry | Server charges $1.00 with the saved payment token; repeats the call with the same purchase id | First call `COMPLETED` in one request; second call returns the same order id | Passed, 4 Nov 2026: order `3J605957GA467625Y` returned both times, ~4 s |
| M3 | Refund | Refund the capture from M2 | Refund succeeds | Passed, 4 Nov 2026 |
| M4 | Cross-site write | `POST /api/rules` with `Origin: https://evil.example`, and with no `Origin` | 403 both times | Passed, 3 Nov 2026 |
| M5 | Content Security Policy | Load the page; read the console | PayPal button renders; no CSP violations | Passed, 3 Nov 2026 |
| M6 | Setup token from another wallet | Exchange a setup token from wallet A while using wallet B | Refused | Covered by code review; to be scripted |
| M7 | Full agent run within the rules | Rules as in the README; ask for a gift under $40 | Paid; checks listed | Pending Channel3 and Claude keys |
| M8 | Agent run over the limit, then approve | Ask for a gift over $40; approve | Waiting, then paid at the current price | Pending |
| M9 | Rate limit | Ask four times within a minute | Fourth gets a 429 with a wait time | Pending |
| M10 | Layout | Phone width and desktop, light and dark | Readable, no overflow | Passed, 3 Nov 2026 (screenshots) |
