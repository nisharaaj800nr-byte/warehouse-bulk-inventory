import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { hashPassword, validatePasswordPolicy } from '../auth/password.js';
import { ROLES, type Role } from '../auth/tokens.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

const createSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z
      .string()
      .min(10)
      .max(200)
      .refine((value) => validatePasswordPolicy(value) === null, {
        message: 'Password must be at least 10 characters and contain letters and numbers'
      }),
    role: z.enum(ROLES as [Role, ...Role[]])
  })
  .strict();

const updateSchema = z
  .object({
    role: z.enum(ROLES as [Role, ...Role[]]).optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

interface UserRow {
  id: number;
  email: string;
  role: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

function toUser(row: UserRow) {
  return {
    id: Number(row.id),
    email: row.email,
    role: row.role,
    isActive: Number(row.is_active) === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function usersRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);
  const admin = requireRole('ADMIN', 'OWNER');

  router.get('/users', auth, admin, (_req, res, next) => {
    try {
      const rows = db
        .prepare('SELECT id, email, role, is_active, last_login_at, created_at, updated_at FROM users ORDER BY email ASC')
        .all() as unknown as UserRow[];
      res.status(200).json({ ok: true, data: rows.map(toUser) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/users', auth, admin, async (req, res, next) => {
    try {
      const body = parseInput(createSchema, req.body);
      const actor = authContext(req).user;
      const email = body.email.toLowerCase();

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
      if (existing) throw fail.duplicate(`User ${email} already exists`, { email });

      const hash = await hashPassword(body.password);
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO users (email, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
           VALUES (?, ?, ?, 1, 0, NULL, NULL, ?, ?)`
        )
        .run(email, hash, body.role, now, now);

      const row = db
        .prepare('SELECT id, email, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as unknown as UserRow;

      writeAudit(db, {
        actorEmail: actor.email,
        action: 'USER_CREATED',
        entity: 'user',
        entityId: row.id,
        details: { email: row.email, role: row.role },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toUser(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/users/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(updateSchema, req.body);
      const actor = authContext(req).user;

      const existing = db
        .prepare('SELECT id, email, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?')
        .get(id) as UserRow | undefined;
      if (!existing) throw fail.notFound(`User ${id} not found`);
      if (id === actor.id && (body.isActive === false || (body.role !== undefined && body.role !== existing.role))) {
        throw fail.forbidden('You cannot deactivate or change the role of your own account');
      }

      db.prepare('UPDATE users SET role = ?, is_active = ?, updated_at = ? WHERE id = ?').run(
        body.role ?? existing.role,
        body.isActive === undefined ? Number(existing.is_active) : body.isActive ? 1 : 0,
        new Date().toISOString(),
        id
      );

      if (body.isActive === false) {
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
          new Date().toISOString(),
          id
        );
      }

      const row = db
        .prepare('SELECT id, email, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?')
        .get(id) as unknown as UserRow;

      writeAudit(db, {
        actorEmail: actor.email,
        action: 'USER_UPDATED',
        entity: 'user',
        entityId: id,
        details: { fields: Object.keys(body) },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: toUser(row) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
