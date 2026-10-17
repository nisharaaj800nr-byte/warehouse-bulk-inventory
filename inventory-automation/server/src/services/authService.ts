import type { Db } from '../db/index.js';
import { verifyPassword } from '../auth/password.js';
import { issueSession, type Role, type SessionUser } from '../auth/tokens.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  is_active: number;
  failed_attempts: number;
  locked_until: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string | null;
}

export interface LoginOutput {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

/**
 * Single place where credentials are checked, lockout is applied and a session
 * is issued. Both the REST route and the panel-compatibility bridge use it, so
 * the security rules can never drift between the two API surfaces.
 */
export async function authenticate(db: Db, input: LoginInput, ttlHours: number): Promise<LoginOutput> {
  const email = input.email.trim();
  const ip = input.ip ?? null;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!user || Number(user.is_active) !== 1) {
    writeAudit(db, {
      actorEmail: email,
      action: 'LOGIN_FAILED',
      entity: 'user',
      details: { reason: 'unknown_or_inactive' },
      ip
    });
    throw fail.unauthorized('Invalid email or password');
  }

  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(user.locked_until) - Date.now()) / 1000));
    writeAudit(db, {
      actorEmail: user.email,
      action: 'LOGIN_BLOCKED_LOCKED',
      entity: 'user',
      entityId: user.id,
      details: { retryAfterSeconds: retryAfter },
      ip
    });
    throw fail.locked('Account is temporarily locked', { retryAfterSeconds: retryAfter });
  }

  const passwordOk = await verifyPassword(input.password, user.password_hash);
  if (!passwordOk) {
    const attempts = Number(user.failed_attempts) + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MS).toISOString() : null;
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?').run(
      attempts,
      lockedUntil,
      new Date().toISOString(),
      user.id
    );
    writeAudit(db, {
      actorEmail: user.email,
      action: lockedUntil ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
      entity: 'user',
      entityId: user.id,
      details: { attempts, lockedUntil },
      ip
    });
    throw fail.unauthorized('Invalid email or password');
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?'
  ).run(nowIso, nowIso, user.id);

  const sessionUser: SessionUser = { id: Number(user.id), email: user.email, role: user.role };
  const { token, expiresAt } = issueSession(db, sessionUser, ttlHours);

  writeAudit(db, {
    actorEmail: user.email,
    action: 'LOGIN_OK',
    entity: 'user',
    entityId: user.id,
    details: { role: user.role, surface: 'api' },
    ip
  });

  return { token, expiresAt, user: sessionUser };
}
