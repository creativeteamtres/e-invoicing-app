import { createHash, randomUUID } from 'node:crypto';
import { db, id, now } from './db.mjs';

export function appendAudit({ workspaceId, actorId, eventType, subjectId, details = {} }) {
  const created = now();
  const previous = db.prepare('SELECT event_hash FROM audit_events WHERE workspace_id=? ORDER BY rowid DESC LIMIT 1').get(workspaceId)?.event_hash || '';
  const data = JSON.stringify({ workspaceId, actorId, eventType, subjectId, details, created, previous });
  const eventHash = createHash('sha256').update(data).digest('hex');
  db.prepare(`INSERT INTO audit_events(id,workspace_id,actor_user_id,event_type,subject_id,details_json,created_at,previous_hash,event_hash)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(id(),workspaceId,actorId,eventType,subjectId,JSON.stringify(details),created,previous,eventHash);
  return eventHash;
}

export function storeArchive({ workspaceId, actorId, documentNumber, direction, filename, mimeType, format, payload, validationId = null, documentDate = null }) {
  if (!Buffer.isBuffer(payload) || payload.length === 0 || payload.length > 10 * 1024 * 1024) throw Object.assign(new Error('Document must be between 1 byte and 10 MB.'), { status: 413 });
  const created = now(), recordId = randomUUID();
  const years = Math.max(1,Math.min(30,Number(process.env.LEDGERLY_RETENTION_YEARS)||8));
  const dateMatch=String(documentDate||'').match(/^(\d{4})-\d{2}-\d{2}$/);
  const startYear=dateMatch?Number(dateMatch[1]):new Date(created).getUTCFullYear();
  const retention = new Date(Date.UTC(startYear + years,11,31,23,59,59,999));
  const digest = createHash('sha256').update(payload).digest('hex');
  const tx = db;
  try {
    tx.exec('BEGIN');
    tx.prepare(`INSERT INTO archive_records(id,workspace_id,document_number,direction,filename,mime_type,format,payload,payload_sha256,retention_until,validation_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(recordId,workspaceId,documentNumber,direction,filename,mimeType,format,payload,digest,retention.toISOString(),validationId,created);
    const previous = tx.prepare('SELECT event_hash FROM audit_events WHERE workspace_id=? ORDER BY rowid DESC LIMIT 1').get(workspaceId)?.event_hash || '';
    const event = { workspaceId, actorId, eventType: 'archive.document.stored', subjectId: recordId, details: { filename, digest, direction }, created, previous };
    const eventHash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    tx.prepare(`INSERT INTO audit_events(id,workspace_id,actor_user_id,event_type,subject_id,details_json,created_at,previous_hash,event_hash)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(id(),workspaceId,actorId,event.eventType,recordId,JSON.stringify(event.details),created,previous,eventHash);
    tx.exec('COMMIT');
  } catch (error) { try { tx.exec('ROLLBACK'); } catch {} throw error; }
  return { id: recordId, documentNumber, filename, format, sha256: digest, retentionUntil: retention.toISOString(), createdAt: created, validationId };
}

export function listArchive(workspaceId, limit = 100) {
  return db.prepare(`SELECT id,document_number AS documentNumber,direction,filename,mime_type AS mimeType,format,payload_sha256 AS sha256,retention_until AS retentionUntil,validation_id AS validationId,created_at AS createdAt
    FROM archive_records WHERE workspace_id=? ORDER BY created_at DESC LIMIT ?`).all(workspaceId, Math.min(Math.max(Number(limit) || 100,1),200));
}
export function getArchive(workspaceId, recordId) {
  return db.prepare('SELECT * FROM archive_records WHERE workspace_id=? AND id=?').get(workspaceId,recordId) || null;
}

export function verifyArchiveChain(workspaceId) {
  const rows = db.prepare('SELECT event_type,subject_id,details_json,created_at,previous_hash,event_hash,actor_user_id FROM audit_events WHERE workspace_id=? ORDER BY rowid').all(workspaceId);
  let previous = '';
  for (const row of rows) {
    if ((row.previous_hash || '') !== previous) return { valid: false, checked: rows.length };
    const data = JSON.stringify({ workspaceId, actorId: row.actor_user_id, eventType: row.event_type, subjectId: row.subject_id, details: JSON.parse(row.details_json), created: row.created_at, previous });
    const hash = createHash('sha256').update(data).digest('hex');
    if (hash !== row.event_hash) return { valid: false, checked: rows.length };
    previous = hash;
  }
  return { valid: true, checked: rows.length };
}
