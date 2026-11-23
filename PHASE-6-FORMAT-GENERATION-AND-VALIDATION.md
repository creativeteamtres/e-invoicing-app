# Phase 6 — Format Generation and Validation

**Status:** Validation experience prototype implemented; real XML generation and KoSIT validation are not connected.

## Delivered

- `validation.html`, `validation.css`, `validation.js`: validation dashboard, format filter, demo report drawer, clear severity presentation, and responsive navigation.
- Dashboard navigation opens the validation workspace.
- Reports and counts are explicitly illustrative. The UI states that no official KoSIT validation has been performed.

## Production adapter contract

Generation and validation should be backend capabilities, separate from the browser and from each other:

1. `POST /api/v1/invoices/{id}/artifacts` — generate an artifact for a draft using an explicit format/profile/version (e.g., XRechnung UBL, XRechnung CII, or a selected ZUGFeRD profile). Return artifact ID and generation metadata.
2. `POST /api/v1/artifacts/{id}/validations` — validate a generated XML artifact against a pinned official ruleset bundle. Return a durable validation run ID and status.
3. `GET /api/v1/validations/{id}` — report generator/validator build, ruleset release, input hash, timestamp, processing status, and findings (rule ID, severity, business term/location, plain-language explanation, correction hint).
4. Block delivery when validation returns errors; warnings should follow a documented policy and user-visible acknowledgement where appropriate.

Use versioned adapters (`InvoiceModel -> FormatAdapter -> artifact`, `artifact -> ValidatorAdapter -> findings`) so format libraries, validators, and vendor services can be replaced. Store the exact generated artifact and its validation evidence together. Do not infer successful validation from XML schema parsing alone.

## Current official reference check

As checked on 23 November 2026, the XStandards Einkauf page says XRechnung 3.0 remains in force through at least 31 July 2027 and points to the centrally operated technical bundles. The official KoSIT validator configuration release dated 31 August 2026 is compatible with XRechnung 3.0 and includes KoSIT Validator 1.6.3 and CEN validation artifacts 1.3.16. Pin and record the applicable bundle version at implementation/deployment time; do not hard-code "latest" without controlled updates.

Sources: [XRechnung standard and versions](https://xeinkauf.de/xrechnung/), [KoSIT XRechnung validator configuration releases](https://github.com/itplr-kosit/validator-configuration-xrechnung/releases), [official configuration usage instructions](https://github.com/itplr-kosit/validator-configuration-xrechnung/blob/master/docs/usage.md).

## Known boundary

This phase does **not** output XRechnung or ZUGFeRD documents and does **not** run KoSIT. No row or report in the prototype is proof of compliance. The XRechnung validator bundle alone does not implement all ZUGFeRD PDF/A-3 packaging or profile behavior; that requires a separate generation/parsing adapter and its own verification path.

## Next

**Phase 7 — Sending and receiving:** implement the channel orchestration UI and backend contracts, beginning with email/API and keeping Peppol behind an independent provider adapter. Only validated generated artifacts should enter outbound delivery.
