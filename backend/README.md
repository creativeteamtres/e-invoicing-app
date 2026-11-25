# Ledgerly API

The backend is a separate Node service from the HTML frontend. It uses Node 24's built-in SQLite module so the prototype can run locally without a database service. The database file is kept on the API host in `data/ledgerly.sqlite`; browser storage is not the source of truth for authentication, subscriptions, invoice drafts, validation runs, or archived originals.

## Start locally

1. In the project root, run `npm run setup:kosit` to install and hash-verify KoSIT Validator 1.6.3 and the official XRechnung 3.0.2 ruleset.
2. Run `npm run setup:mustang` to install and hash-verify Mustang CLI 2.26.0 for ZUGFeRD PDF/A-3 creation and incoming PDF extraction.
3. Run `npm run setup:secrets` to create a local SMTP credential-encryption key in the ignored `.env` file.
4. Run `npm run start:kosit` to start the local KoSIT daemon.
5. In separate terminals run `npm run api` and `python -m http.server 8000`.
6. Open `http://localhost:8000/onboarding.html`, create a workspace, and sign in.
7. Run `npm run test:kosit` to verify KoSIT accepts the generated invoice fixture and rejects the deliberately invalid one.
The API listens on `127.0.0.1:3001`. Set `LEDGERLY_DB_PATH` to move its SQL file. Back up that file securely; archive rows are append-only through this API and their source bytes are stored in SQL.

## Independent invoice workflows

Each stage has a backend module and API boundary so providers and runtimes can be replaced without coupling the UI to a vendor:

- **Intake and normalization:** `workflows/parser.mjs` parses UBL 2.1 and UN/CEFACT CII with a bounded, entity-rejecting XML tokenizer. Incoming ZUGFeRD PDFs use Mustang to extract embedded XML. Intake stores exact received bytes, parses and validates them, then creates an incoming record for review.
- **Manual records and counterparties:** `/api/customers`, `/api/workspace/profile`, and `/api/invoices` persist workspace data in SQL. Drafts stay separate from generated artifacts.
- **Format generation:** `workflows/model.mjs` maps a draft and party profiles to XRechnung UBL 2.1 or EN 16931 CII. `POST /api/invoices/:id/artifacts` saves the output and validation result. XRechnung generation checks the structured data required by the configured KoSIT profile, including electronic addresses, buyer reference, seller contact/telephone, and payment details. ZUGFeRD needs a human-readable PDF source plus Mustang CLI to combine and validate the final PDF/A-3.
- **Validation:** `validator.mjs` calls the local KoSIT HTTP daemon and retains its XML report and pinned ruleset ID. Only HTTP 200 with an unambiguous KoSIT accept report can be accepted. Rejected, unavailable, and inconclusive results block delivery.
- **Delivery:** `workflows/email.mjs` sends MIME attachments through SMTP using Node's built-in networking/TLS modules. Workspace owners configure their own SMTP host, sender, TLS mode, and credentials under Settings → Delivery & SMTP. Passwords are AES-256-GCM encrypted in workspace SQL with a server-side key. API email delivery requires workspace-specific SMTP settings and never falls back to shared server-wide SMTP credentials. `/api/deliveries` still requires an accepted artifact and records success/failure. Peppol and API/EDI are separate future adapters.
- **Accounting export:** `workflows/datev.mjs` generates DATEV EXTF Buchungsstapel output using explicit client, account, framework, date-period and VAT-key mappings. `POST /api/exports/datev` creates a saved export job and download. Have the customer’s tax advisor confirm mappings before import.
- **Archive:** `archive.mjs` stores exact inbound files and accepted outbound artifacts with SHA-256 and audit-chain events in workspace SQL.

## Service boundaries

- `auth.mjs`: scrypt password hashing, server-side sessions, workspace membership, and tenant lookup.
- `server.mjs`: versioned HTTP API, access checks, subscriptions, and service orchestration.
- `validator.mjs`: KoSIT daemon adapter. It never substitutes demo rules for official validation. Missing engine/rules or stopped daemon returns `unavailable`; only KoSIT acceptance can unlock delivery.
- `secrets.mjs`: authenticated AES-256-GCM encryption for per-workspace SMTP passwords.
- `archive.mjs`: exact original bytes, SHA-256 digests, configurable retention targets, and a per-workspace chained audit log.
- `db.mjs`: SQL schema and constraints.

API routes include `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/subscription`, `/api/subscription/checkout`, `/api/subscription/portal`, `/api/settings/smtp`, `/api/settings/integrations`, `/api/invoices`, `/api/validation`, `/api/archive`, `/api/archive/:id/download`, and `/api/audit/verify`.

Workspace Settings exposes a live owner/admin integration status panel. It does not return secrets or permit arbitrary URL/path edits from the browser. Per-workspace business details and SMTP credentials are managed in the UI; DATEV mappings are entered per export. Host-level KoSIT, Mustang, Stripe, database, and retention settings are centralized in the API `.env` deployment configuration. Peppol and API/EDI are explicitly shown as unavailable until their adapters are implemented.

## KoSIT install and test

The install script downloads the standalone validator from Maven Central and the configuration bundle from the official KoSIT GitHub release. It verifies both pinned SHA-256 digests before extraction. Java 11 or newer is required (Java 21 recommended). The exact engine/ruleset versions are visible on the Validation page and at `/api/health`.

`npm run test:kosit` requires the daemon to be running. It submits a complete generated XRechnung invoice and expects an accepted result, then removes the required buyer reference and expects a KoSIT rejection. Any different outcome fails the command. Run the service only on a private interface: the stock KoSIT daemon does not provide authentication.

For another deployment, set `KOSIT_URL` on the API and install/pin the matching engine and scenario bundle there. Keep the unexposed daemon private. Do not claim KoSIT acceptance as a government certification.

## Mustang and SMTP

`npm run setup:mustang` downloads and SHA-256 verifies Mustang CLI 2.26.0. By default, the API uses `tools/mustang/Mustang-CLI-2.26.0.jar`; set `MUSTANG_CLI_JAR` only when deploying another pinned build. Java 11 or newer is required. This enables embedded ZUGFeRD XML extraction, PDF/A-3 combination, and final-document validation. ZUGFeRD generation also needs its human-readable PDF source.

Each workspace owner configures SMTP in Settings → Delivery & SMTP. `npm run setup:secrets` creates the local `LEDGERLY_ENCRYPTION_KEY`; production deployments must keep the key in a secret manager and back it up securely. Password values are not returned from the API. SMTP delivery requires STARTTLS or implicit SSL/TLS and a KoSIT-accepted invoice artifact.

## Stripe setup

Set a server-side test or live secret, webhook signing secret, and the four price IDs in the environment. Register `/api/stripe/webhook` with Stripe and subscribe to Checkout completion plus subscription created/updated/deleted events. Until configured, paid-plan checkout and billing portal endpoints return an explicit unavailable error. No card or Stripe secret is stored in the browser.

## Production boundary

This is a single-process development backend. SQLite is appropriate for a local prototype, not a horizontally scaled SaaS deployment. Before production, move the repository interface to managed PostgreSQL, add encrypted object-locked storage and tested backups, deploy the API behind TLS, configure email verification and recovery, secure secrets, add CSRF/origin policy for the real domains, and complete threat-model and load reviews. The SQL archive's append-only API, hash, and audit chain do not by themselves establish GoBD compliance or tamper-proof/WORM storage.

Invoice retention is configurable. The default is eight calendar years for invoices; other record classes may have different periods and exceptions. Confirm each customer's applicable retention class and legal holds with a German tax/legal professional before production.
