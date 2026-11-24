# Phase 8 — Archive and Accounting Exports

**Status:** Workspace SQL archiving and DATEV EXTF Buchungsstapel file export are implemented. SQL append-only controls and hashes do not equal WORM/GoBD certification.

## Delivered

- Original inbound files and accepted outbound artifacts are stored in tenant SQL with SHA-256 digests, retention targets, downloads, and a chained audit record.
- The Exports tab creates and downloads DATEV EXTF files using customer-supplied account and tax-key mappings.
- DATEV output is not transmitted to DATEV, and exported account mappings must be confirmed by the customer’s tax advisor.

## Production archive requirements to implement

- Store the original structured invoice and the human-readable representation as linked, versioned artifacts with access controls.
- Record cryptographic hashes over exact bytes, creation time, retention policy, access/export events, and relevant validation/delivery evidence.
- Apply controlled retention and deletion rules, backup/restore, tenant scoping, legal holds where required, and auditable administrative access.
- Treat corrections as new linked records and preserve the history of issued artifacts.
- Select and verify storage controls and the required German tax retention period with qualified legal/tax advice before making GoBD claims.

## Export integration boundary

DATEV output must be scoped to the target DATEV product, import route, field mapping, account framework, tax keys, and the customer’s advisor configuration. Implement a versioned export adapter, validation/preview, export manifest, and reproducible job record. The demo lists example DATEV formats only and does not establish that they are supported for a given customer.

## Next

**Phase 9 — Subscription and billing:** add plan selection, usage/entitlement experience, subscription settings, and billing states. Payment processing and entitlements must be backed by a trusted server integration.
