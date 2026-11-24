import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, id, now } from './db.mjs';
const scrypt = promisify(scryptCallback);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const hashToken = token => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw Object.assign(new Error('Password must be 12–256 characters.'), { status: 400 });
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${Buffer.from(derived).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [, n, r, p, salt, expected] = String(stored).split('$');
  if (!salt || !expected) return false;
  const actual = Buffer.from(await scrypt(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) }));
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
export function issueSession(userId, remember = true) {
  const token = randomBytes(32).toString('base64url');
  const created = now();
  const lifetime = remember ? SESSION_MS : 12 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(hashToken(token), userId, created, new Date(Date.now() + lifetime).toISOString());
  return token;
}
export function readSession(token) {
  if (!token) return null;
  const session = db.prepare(`SELECT u.id AS user_id,u.email,w.id AS workspace_id,w.name AS workspace_name,m.role,s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=u.id
    JOIN workspaces w ON w.id=m.workspace_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).get(hashToken(token), now());
  return session || null;
}
export function revokeSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
}
export async function register({ email, password, businessName, country, address }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  const passwordHash = await hashPassword(password);
  const userId = id(), workspaceId = id(), createdAt = now();
  const tx = db;
  try {
    tx.exec('BEGIN');
    tx.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(userId,email,passwordHash,createdAt);
    tx.prepare('INSERT INTO workspaces(id,name,country,address_json,created_at) VALUES(?,?,?,?,?)')
      .run(workspaceId,String(businessName || 'My workspace').trim().slice(0,160),String(country || 'DE').slice(0,2),JSON.stringify(address || {}),createdAt);
    tx.prepare("INSERT INTO memberships(user_id,workspace_id,role) VALUES(?,?,'owner')").run(userId,workspaceId);
    tx.prepare('INSERT INTO subscriptions(workspace_id,plan,status,billing_interval,updated_at) VALUES(?,?,?,?,?)')
      .run(workspaceId,'starter','active','month',createdAt);
    tx.exec('COMMIT');
  } catch (error) { try { tx.exec('ROLLBACK'); } catch {} throw error; }
  return { userId, workspaceId, email };
}
export async function login(email, password) {
  const user = db.prepare('SELECT id,email,password_hash FROM users WHERE email=? COLLATE NOCASE').get(String(email || '').trim());
  const ok = user ? await verifyPassword(String(password || ''), user.password_hash) : false;
  if (!ok) throw Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
  return { id: user.id, email: user.email };
}
