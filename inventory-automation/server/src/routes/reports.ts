import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const GROUPABLE = ['status', 'brand', 'age_bucket', 'status_bucket', 'location', 'bin_bucket', 'model'] as const;
type Groupable = (typeof GROUPABLE)[number];

const filtersSchema = z
  .object({
    status: z.string().trim().max(100).optional(),
    brand: z.string().trim().max(200).optional(),
    ageBucket: z.string().trim().max(100).optional(),
    statusBucket: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional()
  })
  .strict()
  .optional();

const runSchema = z
  .object({
    groupBy: z.enum(GROUPABLE),
    filters: filtersSchema
  })
  .strict();

const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    config: z
      .object({
        groupBy: z.enum(GROUPABLE),
        filters: filtersSchema
      })
      .strict()
  })
  .strict();

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

const COLUMN_BY_GROUP: Record<Groupable, string> = {
  status: 'status',
  brand: 'brand',
  age_bucket: 'age_bucket',
  status_bucket: 'status_bucket',
  location: 'location',
  bin_bucket: 'bin_bucket',
  model: 'model'
};

function buildWhere(filters: z.infer<typeof filtersSchema>): { where: string; params: Array<string> } {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.brand) {
    clauses.push('brand = ?');
    params.push(filters.brand);
  }
  if (filters?.ageBucket) {
    clauses.push('age_bucket = ?');
    params.push(filters.ageBucket);
  }
  if (filters?.statusBucket) {
    clauses.push('status_bucket = ?');
    params.push(filters.statusBucket);
  }
  if (filters?.location) {
    clauses.push('location = ?');
    params.push(filters.location);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function reportsRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);
  const admin = requireRole('ADMIN', 'OWNER');

  router.get('/reports/groups', auth, (_req, res) => {
    res.status(200).json({ ok: true, data: GROUPABLE });
  });

  router.post('/reports/run', auth, (req, res, next) => {
    try {
      const body = parseInput(runSchema, req.body);
      const column = COLUMN_BY_GROUP[body.groupBy];
      const { where, params } = buildWhere(body.filters);

      const groups = db
        .prepare(
          `SELECT COALESCE(${column}, '(empty)') AS key, COUNT(*) AS count
           FROM inventory ${where}
           GROUP BY key ORDER BY count DESC, key ASC`
        )
        .all(...params) as unknown as Array<{ key: string; count: number }>;

      const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM inventory ${where}`).get(...params) as
        | { total: number }
        | undefined;

      res.status(200).json({
        ok: true,
        data: {
          groupBy: body.groupBy,
          total: Number(totalRow?.total ?? 0),
          groups: groups.map((group) => ({ key: group.key, count: Number(group.count) }))
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/export.csv', auth, (req, res, next) => {
    try {
      const query = parseInput(
        z
          .object({
            groupBy: z.enum(GROUPABLE),
            status: z.string().trim().max(100).optional(),
            brand: z.string().trim().max(200).optional(),
            ageBucket: z.string().trim().max(100).optional(),
            statusBucket: z.string().trim().max(100).optional(),
            location: z.string().trim().max(100).optional()
          })
          .strict(),
        req.query
      );

      const column = COLUMN_BY_GROUP[query.groupBy];
      const { where, params } = buildWhere(query);
      const groups = db
        .prepare(
          `SELECT COALESCE(${column}, '(empty)') AS key, COUNT(*) AS count
           FROM inventory ${where}
           GROUP BY key ORDER BY count DESC, key ASC`
        )
        .all(...params) as unknown as Array<{ key: string; count: number }>;

      const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
      const lines = ['group_key,count', ...groups.map((group) => `${escape(String(group.key))},${Number(group.count)}`)];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="report-${query.groupBy}.csv"`);
      res.status(200).send(lines.join('\r\n') + '\r\n');
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/templates', auth, (_req, res, next) => {
    try {
      const rows = db
        .prepare('SELECT * FROM report_templates ORDER BY name ASC')
        .all() as unknown as Array<{
        id: number;
        name: string;
        config_json: string;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      res.status(200).json({
        ok: true,
        data: rows.map((row) => ({
          id: Number(row.id),
          name: row.name,
          config: JSON.parse(row.config_json),
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reports/templates', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(templateSchema, req.body);
      const { user } = authContext(req);
      const duplicate = db.prepare('SELECT id FROM report_templates WHERE name = ?').get(body.name) as
        | { id: number }
        | undefined;
      if (duplicate) throw fail.duplicate(`Report template ${body.name} already exists`);

      const now = new Date().toISOString();
      const result = db
        .prepare(
          'INSERT INTO report_templates (name, config_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(body.name, JSON.stringify(body.config), user.email, now, now);

      res.status(201).json({
        ok: true,
        data: { id: Number(result.lastInsertRowid), name: body.name, config: body.config, createdAt: now }
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/reports/templates/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(templateSchema, req.body);
      const existing = db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as
        | { id: number; name: string }
        | undefined;
      if (!existing) throw fail.notFound(`Report template ${id} not found`);

      db.prepare('UPDATE report_templates SET name = ?, config_json = ?, updated_at = ? WHERE id = ?').run(
        body.name,
        JSON.stringify(body.config),
        new Date().toISOString(),
        id
      );
      res.status(200).json({ ok: true, data: { id, name: body.name, config: body.config } });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/reports/templates/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const result = db.prepare('DELETE FROM report_templates WHERE id = ?').run(id);
      if (Number(result.changes) === 0) throw fail.notFound(`Report template ${id} not found`);
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
