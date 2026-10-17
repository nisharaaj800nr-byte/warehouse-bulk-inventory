import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

const ageRuleSchema = z
  .object({
    minAge: z.number().int().min(0).max(10000000),
    maxAge: z.number().int().min(0).max(10000000),
    bucket: z.string().trim().min(1).max(100),
    priority: z.string().trim().min(1).max(20),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((value) => value.maxAge >= value.minAge, { message: 'maxAge must be >= minAge', path: ['maxAge'] });

const statusRuleSchema = z
  .object({
    rawStatus: z.string().trim().min(1).max(100),
    bucket: z.string().trim().min(1).max(100),
    marking: z.string().trim().max(100).nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const locationRuleSchema = z
  .object({
    pattern: z.string().trim().min(1).max(100),
    bucket: z.string().trim().min(1).max(100),
    condition: z.string().trim().max(100).nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const prioritySchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(50),
            sourceType: z.enum(['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER']),
            rank: z.number().int().min(1).max(1000)
          })
          .strict()
      )
      .max(200)
  })
  .strict();

interface AgeRow {
  id: number;
  min_age: number;
  max_age: number;
  bucket: string;
  priority: string;
  is_active: number;
}

interface StatusRow {
  id: number;
  raw_status: string;
  bucket: string;
  marking: string | null;
  is_active: number;
}

interface LocationRow {
  id: number;
  pattern: string;
  bucket: string;
  condition: string | null;
  is_active: number;
}

function toAge(row: AgeRow) {
  return {
    id: Number(row.id),
    minAge: Number(row.min_age),
    maxAge: Number(row.max_age),
    bucket: row.bucket,
    priority: row.priority,
    isActive: Number(row.is_active) === 1
  };
}

function toStatus(row: StatusRow) {
  return {
    id: Number(row.id),
    rawStatus: row.raw_status,
    bucket: row.bucket,
    marking: row.marking,
    isActive: Number(row.is_active) === 1
  };
}

function toLocation(row: LocationRow) {
  return {
    id: Number(row.id),
    pattern: row.pattern,
    bucket: row.bucket,
    condition: row.condition,
    isActive: Number(row.is_active) === 1
  };
}

export function rulesRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);
  const admin = requireRole('ADMIN', 'OWNER');

  /* ---------------- age rules ---------------- */

  router.get('/rules/age', auth, (_req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM age_rules ORDER BY min_age ASC').all() as unknown as AgeRow[];
      res.status(200).json({ ok: true, data: rows.map(toAge) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rules/age', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(ageRuleSchema, req.body);
      const { user } = authContext(req);
      const result = db
        .prepare('INSERT INTO age_rules (min_age, max_age, bucket, priority, is_active) VALUES (?, ?, ?, ?, ?)')
        .run(body.minAge, body.maxAge, body.bucket, body.priority, body.isActive === false ? 0 : 1);
      const row = db.prepare('SELECT * FROM age_rules WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as AgeRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'AGE_RULE_CREATED',
        entity: 'age_rule',
        entityId: row.id,
        details: { bucket: row.bucket },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toAge(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/rules/age/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(ageRuleSchema, req.body);
      const existing = db.prepare('SELECT * FROM age_rules WHERE id = ?').get(id) as AgeRow | undefined;
      if (!existing) throw fail.notFound(`Age rule ${id} not found`);

      db.prepare('UPDATE age_rules SET min_age = ?, max_age = ?, bucket = ?, priority = ?, is_active = ? WHERE id = ?').run(
        body.minAge,
        body.maxAge,
        body.bucket,
        body.priority,
        body.isActive === false ? 0 : 1,
        id
      );
      const row = db.prepare('SELECT * FROM age_rules WHERE id = ?').get(id) as unknown as AgeRow;
      res.status(200).json({ ok: true, data: toAge(row) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/rules/age/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const result = db.prepare('DELETE FROM age_rules WHERE id = ?').run(id);
      if (Number(result.changes) === 0) throw fail.notFound(`Age rule ${id} not found`);
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  /* ---------------- status rules ---------------- */

  router.get('/rules/status', auth, (_req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM status_rules ORDER BY raw_status ASC').all() as unknown as StatusRow[];
      res.status(200).json({ ok: true, data: rows.map(toStatus) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rules/status', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(statusRuleSchema, req.body);
      const { user } = authContext(req);
      const duplicate = db.prepare('SELECT id FROM status_rules WHERE raw_status = ?').get(body.rawStatus) as
        | { id: number }
        | undefined;
      if (duplicate) throw fail.duplicate(`Status rule for ${body.rawStatus} already exists`);

      const result = db
        .prepare('INSERT INTO status_rules (raw_status, bucket, marking, is_active) VALUES (?, ?, ?, ?)')
        .run(body.rawStatus, body.bucket, body.marking ?? null, body.isActive === false ? 0 : 1);
      const row = db.prepare('SELECT * FROM status_rules WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as StatusRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'STATUS_RULE_CREATED',
        entity: 'status_rule',
        entityId: row.id,
        details: { rawStatus: row.raw_status },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toStatus(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/rules/status/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(statusRuleSchema, req.body);
      const existing = db.prepare('SELECT * FROM status_rules WHERE id = ?').get(id) as StatusRow | undefined;
      if (!existing) throw fail.notFound(`Status rule ${id} not found`);

      db.prepare('UPDATE status_rules SET raw_status = ?, bucket = ?, marking = ?, is_active = ? WHERE id = ?').run(
        body.rawStatus,
        body.bucket,
        body.marking ?? null,
        body.isActive === false ? 0 : 1,
        id
      );
      const row = db.prepare('SELECT * FROM status_rules WHERE id = ?').get(id) as unknown as StatusRow;
      res.status(200).json({ ok: true, data: toStatus(row) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/rules/status/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const result = db.prepare('DELETE FROM status_rules WHERE id = ?').run(id);
      if (Number(result.changes) === 0) throw fail.notFound(`Status rule ${id} not found`);
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  /* ---------------- location rules ---------------- */

  router.get('/rules/location', auth, (_req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM location_rules ORDER BY id ASC').all() as unknown as LocationRow[];
      res.status(200).json({ ok: true, data: rows.map(toLocation) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rules/location', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(locationRuleSchema, req.body);
      const { user } = authContext(req);
      const result = db
        .prepare('INSERT INTO location_rules (pattern, bucket, condition, is_active) VALUES (?, ?, ?, ?)')
        .run(body.pattern, body.bucket, body.condition ?? null, body.isActive === false ? 0 : 1);
      const row = db.prepare('SELECT * FROM location_rules WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as LocationRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'LOCATION_RULE_CREATED',
        entity: 'location_rule',
        entityId: row.id,
        details: { pattern: row.pattern },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toLocation(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/rules/location/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(locationRuleSchema, req.body);
      const existing = db.prepare('SELECT * FROM location_rules WHERE id = ?').get(id) as LocationRow | undefined;
      if (!existing) throw fail.notFound(`Location rule ${id} not found`);

      db.prepare('UPDATE location_rules SET pattern = ?, bucket = ?, condition = ?, is_active = ? WHERE id = ?').run(
        body.pattern,
        body.bucket,
        body.condition ?? null,
        body.isActive === false ? 0 : 1,
        id
      );
      const row = db.prepare('SELECT * FROM location_rules WHERE id = ?').get(id) as unknown as LocationRow;
      res.status(200).json({ ok: true, data: toLocation(row) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/rules/location/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const result = db.prepare('DELETE FROM location_rules WHERE id = ?').run(id);
      if (Number(result.changes) === 0) throw fail.notFound(`Location rule ${id} not found`);
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  /* ---------------- priority rules ---------------- */

  router.get('/rules/priority', auth, (_req, res, next) => {
    try {
      const rows = db
        .prepare('SELECT * FROM priority_rules ORDER BY field ASC, rank ASC')
        .all() as unknown as Array<{ id: number; field: string; source_type: string; rank: number }>;
      res.status(200).json({
        ok: true,
        data: rows.map((row) => ({ id: Number(row.id), field: row.field, sourceType: row.source_type, rank: Number(row.rank) }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/rules/priority', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(prioritySchema, req.body);
      const { user } = authContext(req);

      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM priority_rules').run();
        const insert = db.prepare('INSERT INTO priority_rules (field, source_type, rank) VALUES (?, ?, ?)');
        for (const rule of body.rules) insert.run(rule.field, rule.sourceType, rule.rank);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      writeAudit(db, {
        actorEmail: user.email,
        action: 'PRIORITY_RULES_REPLACED',
        entity: 'priority_rule',
        details: { rules: body.rules.length },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: { replaced: body.rules.length } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
