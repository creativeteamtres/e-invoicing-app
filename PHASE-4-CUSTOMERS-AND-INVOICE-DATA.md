# Phase 4 — Customers and Invoice Data

**Status:** Customer directory prototype and domain contract documented. No backend persistence yet.

## Delivered

- `customers.html`, `customers.css`, `customers.js`: customer directory, search, sort, responsive table, add/edit drawer, required-field validation, empty state, and seeded illustrative records.
- Customer edits persist in browser `localStorage` for this demo only. The page displays a warning so demo records are not mistaken for a secure shared account database.
- Dashboard customer navigation opens the customer directory.

## Canonical domain model

Keep business data independent of any target XML syntax. A proposed first model:

```json
{
  "id": "uuid",
  "organizationId": "uuid",
  "invoiceNumber": null,
  "type": "invoice",
  "status": "draft",
  "issueDate": "2026-11-23",
  "dueDate": "2026-12-23",
  "currency": "EUR",
  "sellerPartyId": "uuid",
  "buyerPartyId": "uuid",
  "buyerReference": null,
  "lines": [{
    "id": "uuid",
    "description": "Consulting services",
    "quantity": "1",
    "unitCode": "C62",
    "unitPrice": "100.00",
    "taxCategory": "S",
    "taxRate": "19.00"
  }],
  "totals": {
    "lineNet": "100.00",
    "taxTotal": "19.00",
    "payable": "119.00"
  },
  "paymentTerms": null,
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp"
}
```

Use decimal-safe arithmetic in the backend; the string amounts above represent decimal values and should not be calculated with binary floating point. Specify rounding rules, allowed tax categories, units, and required data per invoice type against the chosen EN 16931 profile before generating official documents. Invoice number assignment and issued-document history belong on the server, not the browser.

### Party/customer record

Suggested fields: stable ID, organization/tenant ID, legal name, address (country, postal code, city, street), country code, contact email, optional tax identifiers, optional electronic endpoint identifier with scheme, and timestamps. Validate identifiers by type and scheme; do not treat them as unstructured text when routing or generating documents.

## Future API boundary

- `GET /api/v1/customers?query=&cursor=` — list/filter tenant-owned customers.
- `POST /api/v1/customers` — create a customer in the active organization.
- `GET /api/v1/customers/{id}` — retrieve one authorized record.
- `PATCH /api/v1/customers/{id}` — update editable customer details.
- `POST /api/v1/invoices` — create a draft using the canonical invoice model.
- `GET /api/v1/invoices/{id}` and `PATCH /api/v1/invoices/{id}` — retrieve/update a draft.

All customer and invoice routes must derive tenant scope from the authenticated session and enforce authorization server-side. Do not accept organization ID from the browser as proof of access.

## Known boundaries

- The directory is a frontend prototype, not production customer management. Browser storage is local to one browser profile and is not encrypted multi-tenant storage.
- Invoice creation, official totals, tax determination, numbering, EN 16931 validation, XML generation, and legal compliance are not implemented in this phase.
- Example dashboard/customer figures are illustrative and should be replaced by API data later.

## Next

**Phase 5 — Invoice dashboard and creation flow:** build the invoice list, filters, detail view, and draft editor against this canonical model; retain the backend boundary for persistence and numbering.
