# Phase 8 — Archive and Accounting Exports

**Status:** Archive/export workspace prototype implemented; persistent records and real exports are not connected.

## Delivered

- `archive.html`, `archive.css`, `archive.js`: archive and export tabs, record search, illustrative history drawer, integrity digest display explicitly marked as illustrative, export history, and DATEV workflow notice.
- No files are stored in immutable storage. No hash is computed. No DATEV file is generated or downloaded.

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
