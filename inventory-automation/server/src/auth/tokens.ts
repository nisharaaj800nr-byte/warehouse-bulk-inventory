import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/index.js';

export type Role = 'VIEWER' | 'OPERATOR' | 'MANAGER' | 'ADMIN' | 'OWNER';
export const ROLES: Role[] = ['VIEWER', 'OPERATOR', 'MANAGER', 'ADMIN', 'OWNER'];

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueSession(
  db: Db,
  user: SessionUser,
  ttlHours: number
): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, role, created_at, expires_at, last_seen_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(hashToken(token), user.id, user.role, now.toISOString(), expiresAt, now.toISOString());

  return { token, expiresAt };
}

/**
 * Resolves a bearer token to a live session. Rejects revoked, expired and
 * sessions whose user was deactivated. Updates last_seen_at on success.
 */
export function resolveSession(db: Db, token: string): SessionUser | null {
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.revoked_at, u.id AS user_id, u.email, u.role, u.is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | { session_id: number; expires_at: string; revoked_at: string | null; user_id: number; email: string; role: Role; is_active: number }
    | undefined;

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (Number(row.is_active) !== 1) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.session_id);
  return { id: Number(row.user_id), email: row.email, role: row.role };
}

export function revokeSession(db: Db, token: string): boolean {
  const result = db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), hashToken(token));
  return Number(result.changes) > 0;
}

export function revokeOtherSessions(db: Db, userId: number, keepToken: string): number {
  const result = db
    .prepare(
      `UPDATE sessions SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?`
    )
    .run(new Date().toISOString(), userId, hashToken(keepToken));
  return Number(result.changes);
}
