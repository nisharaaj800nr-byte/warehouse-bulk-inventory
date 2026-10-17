import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { authContext, requireAuth } from '../auth/middleware.js';
import { issueSession, resolveSession, revokeOtherSessions, revokeSession, ROLES, type Role } from '../auth/tokens.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

const loginSchema = z
  .object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(200) })
  .strict();

const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(8).max(200) })
  .strict();

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  is_active: number;
  failed_attempts: number;
  locked_until: string | null;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export function authRouter(db: Db, ttlHours: number): Router {
  const router = Router();
  const rateBuckets = new Map<string, RateBucket>();

  function enforceRateLimit(key: string): void {
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }

    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw fail.rateLimited('Too many login attempts', { retryAfterSeconds: retryAfter });
    }
  }

  function findUserByEmail(email: string): UserRow | undefined {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  router.post('/auth/login', async (req, res, next) => {
    try {
      const body = parseInput(loginSchema, req.body);
      const ip = req.ip ?? 'unknown';
      enforceRateLimit(`${ip}:${body.email.toLowerCase()}`);

      const user = findUserByEmail(body.email);
      if (!user || Number(user.is_active) !== 1) {
        writeAudit(db, {
          actorEmail: body.email,
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

      const passwordOk = await verifyPassword(body.password, user.password_hash);
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

      const { token, expiresAt } = issueSession(db, { id: Number(user.id), email: user.email, role: user.role }, ttlHours);
      writeAudit(db, {
        actorEmail: user.email,
        action: 'LOGIN_OK',
        entity: 'user',
        entityId: user.id,
        details: { role: user.role },
        ip
      });

      res.status(200).json({
        ok: true,
        data: {
          token,
          expiresAt,
          user: { id: Number(user.id), email: user.email, role: user.role }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/logout', requireAuth(db), (req, res, next) => {
    try {
      const { user, token } = authContext(req);
      revokeSession(db, token);
      writeAudit(db, { actorEmail: user.email, action: 'LOGOUT', entity: 'user', entityId: user.id, ip: req.ip });
      res.status(200).json({ ok: true, data: { loggedOut: true } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/auth/whoami', requireAuth(db), (req, res, next) => {
    try {
      const { user } = authContext(req);
      res.status(200).json({ ok: true, data: { user } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/change-password', requireAuth(db), async (req, res, next) => {
    try {
      const { user, token } = authContext(req);
      const body = parseInput(changePasswordSchema, req.body);

      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow | undefined;
      if (!row) throw fail.unauthorized('User no longer exists');

      const currentOk = await verifyPassword(body.currentPassword, row.password_hash);
      if (!currentOk) {
        writeAudit(db, {
          actorEmail: user.email,
          action: 'PASSWORD_CHANGE_FAILED',
          entity: 'user',
          entityId: user.id,
          details: { reason: 'wrong_current_password' },
          ip: req.ip
        });
        throw fail.unauthorized('Current password is incorrect');
      }

      const newHash = await hashPassword(body.newPassword);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        newHash,
        new Date().toISOString(),
        user.id
      );
      const revoked = revokeOtherSessions(db, user.id, token);
      writeAudit(db, {
        actorEmail: user.email,
        action: 'PASSWORD_CHANGED',
        entity: 'user',
        entityId: user.id,
        details: { otherSessionsRevoked: revoked },
        ip: req.ip
      });

      res.status(200).json({ ok: true, data: { changed: true, otherSessionsRevoked: revoked } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export { ROLES };
