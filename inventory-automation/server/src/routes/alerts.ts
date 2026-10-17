import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const ALERT_TYPES = ['AGE_OVER', 'STATUS_BUCKET_COUNT', 'MISSING_FIELD'] as const;
const MISSING_FIELDS = ['model', 'brand', 'status', 'location', 'bin_bucket', 'age_bucket', 'status_bucket'] as const;

const filtersSchema = z
  .object({
    brand: z.string().trim().max(200).optional(),
    status: z.string().trim().max(100).optional(),
    statusBucket: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional(),
    field: z.enum(MISSING_FIELDS).optional(),
    bucket: z.string().trim().max(100).optional()
  })
  .strict()
  .nullable()
  .optional();

const alertSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(ALERT_TYPES),
    thresholdValue: z.number().int().min(0).max(1000000),
    filters: filtersSchema,
    isActive: z.boolean().optional()
  })
  .strict();

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

interface AlertRow {
  id: number;
  name: string;
  type: string;
  threshold_value: number;
  filters_json: string | null;
  is_active: number;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

function toAlert(row: AlertRow) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    thresholdValue: Number(row.threshold_value),
    filters: row.filters_json ? JSON.parse(row.filters_json) : null,
    isActive: Number(row.is_active) === 1,
    lastFiredAt: row.last_fired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface AlertFilters {
  brand?: string;
  status?: string;
  statusBucket?: string;
  location?: string;
  field?: (typeof MISSING_FIELDS)[number];
  bucket?: string;
}

function baseWhere(filters: AlertFilters | null): { clauses: string[]; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filters?.brand) {
    clauses.push('brand = ?');
    params.push(filters.brand);
  }
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.statusBucket) {
    clauses.push('status_bucket = ?');
    params.push(filters.statusBucket);
  }
  if (filters?.location) {
    clauses.push('location = ?');
    params.push(filters.location);
  }
  return { clauses, params };
}

function evaluateAlert(db: Db, row: AlertRow): { firing: boolean; value: number; detail: string } {
  const filters = (row.filters_json ? JSON.parse(row.filters_json) : null) as AlertFilters | null;
  const threshold = Number(row.threshold_value);

  if (row.type === 'AGE_OVER') {
    const { clauses, params } = baseWhere(filters);
    clauses.push('stock_age IS NOT NULL AND stock_age >= ?');
    params.push(String(threshold));
    const result = db
      .prepare(`SELECT COUNT(*) AS count FROM inventory WHERE ${clauses.join(' AND ')}`)
      .get(...params) as { count: number };
    const value = Number(result.count);
    return { firing: value > 0, value, detail: `${value} devices at or above ${threshold} days` };
  }

  if (row.type === 'STATUS_BUCKET_COUNT') {
    const { clauses, params } = baseWhere(filters);
    const bucket = filters?.bucket ?? filters?.statusBucket ?? '';
    clauses.push('status_bucket = ?');
    params.push(bucket);
    const result = db
      .prepare(`SELECT COUNT(*) AS count FROM inventory WHERE ${clauses.join(' AND ')}`)
      .get(...params) as { count: number };
    const value = Number(result.count);
    return { firing: value >= threshold, value, detail: `${value} devices in bucket ${bucket || '(unspecified)'}` };
  }

  const field = filters?.field;
  if (!field) return { firing: false, value: 0, detail: 'MISSING_FIELD alert requires filters.field' };

  const { clauses, params } = baseWhere(filters);
  clauses.push(`(${field} IS NULL OR TRIM(${field}) = '')`);
  const result = db
    .prepare(`SELECT COUNT(*) AS count FROM inventory WHERE ${clauses.join(' AND ')}`)
    .get(...params) as { count: number };
  const value = Number(result.count);
  return { firing: value >= threshold, value, detail: `${value} devices missing ${field}` };
}

export function alertsRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);
  const admin = requireRole('ADMIN', 'OWNER');

  router.get('/alerts', auth, (_req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM alerts ORDER BY name ASC').all() as unknown as AlertRow[];
      res.status(200).json({ ok: true, data: rows.map(toAlert) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/alerts', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(alertSchema, req.body);
      const { user } = authContext(req);
      const duplicate = db.prepare('SELECT id FROM alerts WHERE name = ?').get(body.name) as { id: number } | undefined;
      if (duplicate) throw fail.duplicate(`Alert ${body.name} already exists`);

      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO alerts (name, type, threshold_value, filters_json, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          body.name,
          body.type,
          body.thresholdValue,
          body.filters ? JSON.stringify(body.filters) : null,
          body.isActive === false ? 0 : 1,
          now,
          now
        );

      const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as AlertRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'ALERT_CREATED',
        entity: 'alert',
        entityId: row.id,
        details: { name: row.name, type: row.type },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toAlert(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/alerts/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(alertSchema, req.body);
      const existing = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined;
      if (!existing) throw fail.notFound(`Alert ${id} not found`);

      db.prepare(
        'UPDATE alerts SET name = ?, type = ?, threshold_value = ?, filters_json = ?, is_active = ?, updated_at = ? WHERE id = ?'
      ).run(
        body.name,
        body.type,
        body.thresholdValue,
        body.filters ? JSON.stringify(body.filters) : null,
        body.isActive === false ? 0 : 1,
        new Date().toISOString(),
        id
      );

      const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as unknown as AlertRow;
      res.status(200).json({ ok: true, data: toAlert(row) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/alerts/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const result = db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
      if (Number(result.changes) === 0) throw fail.notFound(`Alert ${id} not found`);
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/alerts/check', auth, (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM alerts WHERE is_active = 1 ORDER BY id ASC').all() as unknown as AlertRow[];
      const results = rows.map((row) => {
        const evaluation = evaluateAlert(db, row);
        if (evaluation.firing) {
          db.prepare('UPDATE alerts SET last_fired_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
        }
        return {
          id: Number(row.id),
          name: row.name,
          type: row.type,
          firing: evaluation.firing,
          value: evaluation.value,
          thresholdValue: Number(row.threshold_value),
          detail: evaluation.detail
        };
      });

      res.status(200).json({
        ok: true,
        data: { checked: results.length, firing: results.filter((result) => result.firing).length, results }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
