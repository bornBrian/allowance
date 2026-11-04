# 8. An optional human check with Cloudflare Turnstile

Date: 2026-11-04

## Status

Accepted

## Context

Rate limits slow a script down but don't stop many slow scripts. A CAPTCHA adds friction for people, and some send data to ad networks.

## Decision

Use Cloudflare Turnstile in managed mode. Each wallet passes it once, before the first action that costs money (saving rules, asking, linking PayPal). The server verifies the token with Cloudflare's `siteverify`, checks the expected action, and marks the wallet. It's off unless both keys are set, so local development needs no Cloudflare account.

## Consequences

- Most people see a small check that completes by itself.
- Turnstile's script and frame are allowed in the Content Security Policy.
- If Cloudflare is unreachable, verification fails closed: the person sees "the check didn't pass".
