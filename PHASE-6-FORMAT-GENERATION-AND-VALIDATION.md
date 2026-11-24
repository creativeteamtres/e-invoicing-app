# Phase 6 — Format Generation and Validation

**Status:** XRechnung UBL generation and KoSIT 1.6.3 validation with the pinned XRechnung 3.0.2 ruleset are installed and smoke-tested. ZUGFeRD PDF/A-3 and embedded CII handling require a separately installed Mustang CLI.

## Delivered

- The validation page uploads XML and shows workspace validation history/reports.
- The invoice workspace generates XRechnung UBL 2.1 XML. ZUGFeRD PDF/A-3 generation is enabled by the independent Mustang adapter after its CLI is installed and configured.
- Validation status, report, ruleset ID, and artifact are stored in workspace SQL; non-accepted outcomes block delivery.

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

This development workspace does not have official validator bundles configured. Generated files are not marked accepted until KoSIT or Mustang returns an accepted result. ZUGFeRD also requires a human-readable PDF source and a pinned Mustang CLI.

## Next

**Current next steps:** configure the external validators and SMTP credentials, then add API/EDI and Peppol adapters behind their own provider modules.
