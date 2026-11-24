import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const file = resolve(process.env.LEDGERLY_DB_PATH || './data/ledgerly.sqlite');
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'DE',
 address_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
 user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
 PRIMARY KEY(user_id,workspace_id)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), plan TEXT NOT NULL DEFAULT 'starter',
 status TEXT NOT NULL DEFAULT 'trialing', billing_interval TEXT NOT NULL DEFAULT 'month',
 provider TEXT NOT NULL DEFAULT 'none', provider_customer_id TEXT, provider_subscription_id TEXT,
 period_ends_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 document_number TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),
 format TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,document_number,direction)
);
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', customer_number TEXT NOT NULL DEFAULT '',
 country TEXT NOT NULL DEFAULT 'DE', street TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '', endpoint TEXT NOT NULL DEFAULT '', endpoint_scheme TEXT NOT NULL DEFAULT '',
 vat_id TEXT NOT NULL DEFAULT '', tax_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_number_unique ON customers(workspace_id,customer_number) WHERE customer_number<>'';
CREATE TABLE IF NOT EXISTS validation_runs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 filename TEXT NOT NULL, format TEXT NOT NULL, outcome TEXT NOT NULL,
 ruleset TEXT, report TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoice_artifacts (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), invoice_id TEXT NOT NULL REFERENCES invoices(id),
 format TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, payload BLOB NOT NULL,
 payload_sha256 TEXT NOT NULL, validation_id TEXT REFERENCES validation_runs(id), validation_outcome TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS export_jobs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), format TEXT NOT NULL,
 filename TEXT NOT NULL, payload BLOB NOT NULL, row_count INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_jobs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), artifact_id TEXT NOT NULL REFERENCES invoice_artifacts(id),
 channel TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, provider_reference TEXT,
 error TEXT, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS smtp_settings (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 host TEXT NOT NULL, port INTEGER NOT NULL, username TEXT NOT NULL DEFAULT '', password_ciphertext TEXT NOT NULL DEFAULT '',
 sender TEXT NOT NULL, tls_mode TEXT NOT NULL CHECK(tls_mode IN ('starttls','ssl')), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_records (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 document_number TEXT NOT NULL, direction TEXT NOT NULL, filename TEXT NOT NULL,
 mime_type TEXT NOT NULL, format TEXT NOT NULL, payload BLOB NOT NULL,
 payload_sha256 TEXT NOT NULL, retention_until TEXT NOT NULL,
 validation_id TEXT REFERENCES validation_runs(id), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS archive_workspace_created ON archive_records(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 actor_user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL,
 subject_id TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL,
 previous_hash TEXT, event_hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS archive_no_update BEFORE UPDATE ON archive_records
 BEGIN SELECT RAISE(ABORT,'Archive records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS archive_no_delete BEFORE DELETE ON archive_records
 BEGIN SELECT RAISE(ABORT,'Archive records are append-only'); END;
`);

export const now = () => new Date().toISOString();
export const id = () => randomUUID();
