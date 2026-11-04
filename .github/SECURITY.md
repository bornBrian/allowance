# Security policy

Allowance moves money on someone's behalf, so security reports are welcome and taken seriously.

## Reporting a problem

Please don't open a public issue for a security problem. Use GitHub's private reporting instead: the **Security** tab of this repository → **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply within three days.

## Scope

This is a hackathon project that runs against the PayPal **sandbox**. No real money moves. The demo is in scope; PayPal, Channel3, Anthropic, Cloudflare and Render are not (report to them directly).

## How Allowance is protected

The security requirements are in the [Software Requirements Specification](../docs/srs.pdf) (section 3.8.3) and the controls by layer in the [Software Architecture Document](../docs/sad.pdf) (section 10).
