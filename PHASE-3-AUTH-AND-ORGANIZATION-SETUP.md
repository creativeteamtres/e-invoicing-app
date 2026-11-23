# Phase 3 — Authentication and Organization Setup

**Status:** Frontend prototype implemented; backend authentication and persistence remain unimplemented.

## Delivered

- `auth.html`, `auth.css`, and `auth.js`: responsive sign-in page with email/password, show/hide password, remember option, Google SSO entry point, forgot-password entry point, validation feedback, and mobile layout.
- `onboarding.html`, `onboarding.css`, and `onboarding.js`: responsive business profile step with legal name, country, legal form, address, required-field feedback, progress indicator, and sign-in return link.
- The forms do not claim to authenticate a user or save profile data. Submitting valid sample details explicitly reports that the backend is not connected.

## Backend boundary for the next implementation

The future frontend should call a separately deployed backend through versioned endpoints. Initial contract candidates:

- `POST /api/v1/auth/sessions` — authenticate and establish a secure session.
- `DELETE /api/v1/auth/sessions/current` — sign out.
- `POST /api/v1/auth/password-resets` — request a recovery flow without exposing account existence.
- `GET /api/v1/me` — return the authenticated user and available organizations.
- `POST /api/v1/organizations` — create an organization and its initial owner membership.
- `GET /api/v1/organizations/current` and `PATCH /api/v1/organizations/current` — read/update the active organization profile.

The backend must enforce organization-level authorization on every business record. Session, password, email verification, recovery, rate-limit, audit, and data-protection behavior must be implemented server-side before production use. Choose a backend framework and identity provider before wiring these contracts.

## Known boundary

This remains a static frontend prototype with no API, database, password handling, SSO integration, validation of German tax identifiers, or tenant security. Country selection and legal-form options are illustrative and need product/legal review before real use.

## Next

**Phase 4 — Customers and invoice data:** define and implement the first persistent domain models and API contracts. Connect authentication/organization scope before storing real customer or invoice data.
