# Phase 9 — Subscription and Billing

**Status:** Subscription experience prototype implemented; no payment processor or subscription service connected.

## Delivered

- `billing.html`, `billing.css`, `billing.js`: account plan and billing screen, illustrative plan cards, monthly/yearly price display toggle, usage meters, current demo plan, and billing details entry point.
- All plan prices/features are explicitly labeled as placeholders for planning, not live offers.
- Actions do not start checkout or collect payment details.

## Production requirements

- Use a trusted payment provider; create checkout sessions on the backend and verify provider webhooks server-side.
- Keep subscription status and entitlements in server-managed records. Do not trust client-side plan selection to authorize features.
- Define trial, cancellation, renewal, proration, failed-payment, tax/VAT invoice, refund, and subscription update behavior before launch.
- Meter billable usage using idempotent server-side events and expose a customer-readable usage ledger.
- Protect payment methods through provider-hosted/tokenized flows; do not store raw card details.

## Next

**Phase 10 — Release readiness:** review navigation and cross-page consistency, responsive behavior, empty/error states, accessible interactions, and deployment setup. Production launch still depends on connecting and validating real backend services, security, compliance adapters, archive, integrations, and billing.
