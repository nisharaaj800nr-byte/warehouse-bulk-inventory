import type { Db } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { issueSession, type Role } from '../auth/tokens.js';
import { writeAudit } from '../lib/audit.js';

function readSettings(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function googleClientId(db: Db): string {
  return readSettings(db)['GOOGLE_CLIENT_ID'] ?? process.env.GOOGLE_CLIENT_ID ?? '';
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Verifies a Google ID token with Google's tokeninfo endpoint and returns the
 * profile. Network + client id are required, so callers must treat failures as
 * authentication errors rather than falling back to a weaker path.
 */
export async function verifyGoogleIdToken(idToken: string, expectedAudience: string): Promise<GoogleProfile> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Google token verification failed');
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (String(payload['aud'] ?? '') !== expectedAudience) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Google token audience mismatch');
  }

  const verified = payload['email_verified'] === true || payload['email_verified'] === 'true';
  const email = String(payload['email'] ?? '').trim().toLowerCase();
  if (!email || !verified) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Google account email is not verified');
  }

  return { email, emailVerified: verified, name: payload['name'] ? String(payload['name']) : undefined };
}

/**
 * Signs a Google user in. Existing local users keep their role; unknown emails
 * are rejected unless GOOGLE_AUTO_CREATE is ON, in which case they get VIEWER.
 */
export async function authenticateWithGoogle(
  db: Db,
  idToken: string,
  ttlHours: number,
  ip?: string
): Promise<{ token: string; expiresAt: string; email: string; role: Role }> {
  const clientId = googleClientId(db);
  if (!clientId) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Google login is not configured. Set GOOGLE_CLIENT_ID in Settings (OAuth Client ID from Google Cloud Console).'
    );
  }

  const profile = await verifyGoogleIdToken(idToken, clientId);
  const user = db.prepare('SELECT id, email, role, is_active FROM users WHERE email = ?').get(profile.email) as
    | { id: number; email: string; role: Role; is_active: number }
    | undefined;

  if (!user) {
    const settings = readSettings(db);
    if ((settings['GOOGLE_AUTO_CREATE'] ?? '').toUpperCase() !== 'ON') {
      throw new ApiError(403, 'FORBIDDEN', `No local account for ${profile.email}. Ask an admin to create it first.`);
    }

    const now = new Date().toISOString();
    const inserted = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
         VALUES (?, ?, 'VIEWER', 1, 0, NULL, NULL, ?, ?)`
      )
      .run(profile.email, `google-oauth:${now}`, now, now);

    const role: Role = 'VIEWER';
    const session = issueSession(db, { id: Number(inserted.lastInsertRowid), email: profile.email, role }, ttlHours);
    writeAudit(db, { actorEmail: profile.email, action: 'LOGIN_OK', entity: 'user', details: { via: 'google' }, ip });
    return { token: session.token, expiresAt: session.expiresAt, email: profile.email, role };
  }

  if (Number(user.is_active) !== 1) {
    throw new ApiError(403, 'FORBIDDEN', 'This account is disabled');
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(nowIso, nowIso, user.id);
  const session = issueSession(db, { id: Number(user.id), email: user.email, role: user.role }, ttlHours);
  writeAudit(db, { actorEmail: user.email, action: 'LOGIN_OK', entity: 'user', entityId: user.id, details: { via: 'google' }, ip });

  return { token: session.token, expiresAt: session.expiresAt, email: user.email, role: user.role };
}
