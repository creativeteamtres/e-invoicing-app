# Phase 7 — Sending and Receiving

**Status:** Channel workflow prototype implemented; no documents are transmitted or parsed.

## Delivered

- `delivery.html`, `delivery.css`, `delivery.js`: separate outbound and incoming tabs, email/API/EDI/Peppol channel cards, delivery history table, receiving-file selection/drop UI, and invoice workflow detail drawer.
- No API, email, Peppol access point, EDI connection, or inbound parser is configured. File selection does not upload or retain the file. Status rows are illustrative and marked as demo states.

## Production workflow boundary

Outbound: choose invoice and recipient → verify a generated artifact exists → require a successful validation run for the pinned ruleset → submit to a channel adapter → persist provider message/reference and timestamps → process asynchronous acceptance, rejection, and delivery events idempotently.

Inbound: receive through an adapter or authenticated upload → quarantine and inspect file type/size → parse structured data with format adapters → retain original and parse provenance → validate → show extracted fields and findings for human review → only then allow acceptance/accounting export.

Proposed backend contracts:

- `POST /api/v1/invoices/{id}/deliveries` with channel and artifact ID.
- `GET /api/v1/deliveries/{id}` for state, provider reference, and event history.
- `POST /api/v1/provider-events/{provider}` for authenticated, replay-safe provider callbacks.
- `POST /api/v1/inbound-files` for controlled upload intake; return a processing job ID.
- `GET /api/v1/inbound-files/{id}` for parse/validation state and review data.
- `POST /api/v1/inbound-files/{id}/accept` after an authorized user review.

## Next

**Phase 8 — Archive and accounting exports:** add the archive/audit history experience and export workflow UI. Real retention immutability and DATEV export remain backend/integration work and must be verified before compliance claims.
