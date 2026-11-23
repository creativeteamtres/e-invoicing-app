# Phase 1 — Product Scope and Architecture

**Status:** Complete as the product baseline for the next phases  
**Product direction:** Germany-first, subscription-based e-invoicing SaaS for small and midsize businesses

## 1. Product goal

Help businesses create, validate, send, receive, view, and retain structured business invoices through a clear web application. Start with German e-invoicing needs and keep country rules, invoice formats, delivery channels, and accounting exports modular so other markets can be added later.

The product should make compliance-related work understandable to a business user. It must show invoice status and validation problems in plain language, while preserving the underlying structured invoice and its audit history.

## 2. Initial customer and release focus

### Initial customer

German small and midsize B2B businesses that issue and receive invoices, including suppliers that need to invoice public-sector customers. The first release should optimize for a small finance or operations team rather than a large enterprise procurement department.

### First release (MVP)

- Organization profile and customer records.
- Create and manage invoice drafts and issued invoices.
- German invoice data model designed around EN 16931 concepts.
- Generate and parse XRechnung and ZUGFeRD through replaceable format adapters.
- Run schema and business-rule validation through a replaceable validation adapter; display actionable results.
- Begin with download and email delivery/receipt workflows. Keep Peppol integration behind a separate delivery module and add it when the first customer scope requires it.
- Preserve invoice originals, versions, events, and export history in an auditable archive design.
- Provide an initial accounting export path; confirm exact DATEV export requirements with target users before committing its format and scope.
- Subscription account and plan foundations, with plan enforcement introduced after core invoice workflows.

### Explicitly later

- Additional national e-invoice regimes and local tax rules.
- Peppol Access Point connectivity, unless selected as an MVP requirement by initial customers.
- Advanced ERP/DATEV integrations, automated reconciliation, procurement workflows, and large-enterprise controls.
- Automated legal interpretations or claims that the software alone guarantees compliance.

## 3. Architecture principles

1. **Independent frontend:** A web client communicates with backend capabilities through versioned APIs. UI screens do not directly own compliance or invoice-generation rules.
2. **Independent backend:** The server owns authentication, permissions, business rules, persistence, API contracts, and orchestration. It can be deployed separately from the frontend.
3. **Independent feature modules:** Invoice management, parties, formats, validation, delivery, archive, exports, and subscription billing have explicit boundaries and contracts. A capability can be replaced or scaled without coupling it to every other feature.
4. **Start deployable, keep separable:** Begin with a modular backend and separate background workers where useful, rather than splitting every feature into networked microservices on day one. Extract a module into its own service when load, team ownership, or operational needs justify it.
5. **Adapters for changing external rules and vendors:** Format generators, validators, Peppol providers, email services, storage, and accounting exports sit behind interfaces. Vendor or rule updates should not require rewriting invoice screens.
6. **Auditability by design:** Record important actions and invoice lifecycle events. Treat issued invoice originals as retained records; corrections should create traceable revisions or credit notes rather than silently overwriting history.
7. **Tenant isolation and least privilege:** Every business-owned record is scoped to an organization, with authorization checked by the backend.
8. **Accessible, responsive UI:** Core invoice tasks should work on desktop and tablet, with clear focus states, readable status, and useful empty, loading, and error states.

## 4. Suggested logical modules

| Module | Owns | Boundary / integration |
|---|---|---|
| Web app | Navigation, forms, tables, previews, user feedback | Calls versioned backend APIs |
| Identity and organizations | Users, organizations, roles, tenant context | Provides authenticated organization context |
| Parties | Seller and buyer profiles, addresses, identifiers | Referenced by invoice records |
| Invoice domain | Drafts, line items, totals, lifecycle, numbering | Canonical internal invoice representation |
| Format adapters | XRechnung UBL/CII and ZUGFeRD document creation/parsing | Consume/produce the canonical invoice representation and files |
| Validation | Schema and business-rule validation, findings | Replaceable ruleset/validator adapter; retain version and result |
| Delivery | Email/API initially; Peppol as a separate connector | Receives a validated invoice package and returns delivery events |
| Archive and audit | Original files, metadata, hashes, events, retrieval/export | Storage provider adapter; retention/security requirements to be verified |
| Accounting exports | DATEV-oriented and later other exports | Maps canonical invoice data to versioned export formats |
| Subscription | Plans, entitlements, usage, payment provider integration | Entitlements checked by backend modules |

## 5. Main invoice flow

1. User creates an invoice draft in the web app.
2. Backend validates permissions and business data, calculates totals, and stores the draft.
3. Format adapter generates the selected structured invoice/document.
4. Validation adapter checks it and returns findings linked to the ruleset/version used.
5. User reviews results and chooses a permitted delivery method.
6. Delivery module records its attempt and outcome.
7. Archive module retains the issued original and lifecycle/audit events according to the configured retention policy.
8. Recipient invoice files can be parsed into a reviewable draft; the user confirms before it becomes an accepted business record or accounting export.

## 6. Key data and API decisions

- Maintain one canonical invoice model internally; do not make a single XML syntax the database model.
- Keep money as decimal values with explicit currency and rounding rules; keep tax categories/rates and document-level allowances/charges explicit.
- Store buyer/seller electronic addresses and public-sector routing identifiers as typed identifiers, not free-form notes.
- Give invoices stable internal IDs and separately managed legal invoice numbers.
- Version API contracts and record the generator/validator version used for each issued artifact.
- Keep generated files, parsed source files, validation reports, delivery events, and audit events distinguishable and linked to the invoice.
- Make background work idempotent so retrying generation, validation, or delivery does not duplicate business actions.

## 7. Product experience direction

The primary navigation should map to user tasks: **Dashboard, Invoices, Customers, Incoming, Exports, and Settings**. The dashboard should emphasize what needs action (drafts, validation errors, overdue/unpaid invoices, incoming invoices awaiting review, and delivery failures) rather than decorative metrics. Status labels should be consistent across list, detail, and activity history.

Use a calm, professional visual system with clear hierarchy, predictable forms, visible validation feedback, responsive tables, and confirmation for consequential actions. Keep technical validation codes available in a details view while presenting a plain-language summary first.

## 8. Risks and assumptions to verify

- Confirm the first paying customer segment and whether public-sector/Leitweg-ID sending is required in the first release.
- Confirm the chosen generation/validation libraries or service and their current support for the target XRechnung/ZUGFeRD versions.
- Confirm exact archive retention, immutability, access, export, and deletion requirements with qualified German tax/legal advice before representing the service as GoBD-compliant.
- Confirm DATEV export format and customer workflow with target accountants/users.
- Confirm delivery channel requirements, including whether the platform will operate a Peppol Access Point itself or integrate with a provider.
- International expansion requires country-specific rules and formats; it is not achieved by translation alone.

## 9. Phase 1 acceptance criteria

- Product goal, initial customer, MVP boundaries, and later capabilities are written down.
- Frontend, backend, and feature boundaries are explicit.
- Invoice lifecycle and adapter-based compliance approach are documented.
- Unverified legal, commercial, and integration assumptions are called out rather than presented as settled facts.
- Later phases can implement against this baseline and record scope changes explicitly.

## 10. Recommended next phase

**Phase 2 — App foundation and design system:** establish the frontend shell, navigation, responsive layout, component conventions, visual tokens, and accessible interaction patterns before implementing invoice workflows.
