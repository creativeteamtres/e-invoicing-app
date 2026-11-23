# Phase 5 — Invoice Workspace

**Status:** Frontend prototype implemented; no backend or legally issued invoices.

## Delivered

- `invoices.html`, `invoices.css`, `invoices.js`: invoice list, status and date filters, search, empty state, detail drawer, and draft editor.
- Draft creation/editing uses a customer from the Phase 4 browser demo data, captures dates/reference/one line item, calculates a display total, and saves to browser `localStorage`.
- The page explicitly says demo drafts are local to this browser and are not issued or sent. Existing rows and overview metrics are illustrative fixtures.
- The dashboard’s Invoices navigation now opens this workspace.

## Important boundary

Displayed arithmetic is for the prototype only. Production amounts must be validated and calculated on the backend with decimal-safe arithmetic and documented rounding rules. This prototype does not assign legal invoice numbers, preserve immutable issue history, create structured EN 16931 artifacts, run a validator, or send/receive invoices.

## Phase 5 acceptance

- A user can browse/search/filter sample invoices and open a detail view.
- A user can create and edit a local draft with one line item and see net, VAT, and gross totals.
- Empty, required-field, and responsive states are present.
- Demo data and unimplemented server actions are clearly disclosed.

## Next

**Phase 6 — Invoice generation and validation:** connect the canonical invoice model to replaceable XRechnung/ZUGFeRD format and KoSIT validation adapters. Show validation findings before an invoice can move into a sending flow.
