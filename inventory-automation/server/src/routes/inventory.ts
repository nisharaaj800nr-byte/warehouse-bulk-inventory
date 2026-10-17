import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const createSchema = z
  .object({
    barcode: z.string().trim().min(1).max(64),
    model: nullableText(200),
    brand: nullableText(200),
    status: nullableText(100),
    stockAge: z.number().int().min(0).max(100000).nullable().optional(),
    ageBucket: nullableText(100),
    priority: nullableText(20),
    statusBucket: nullableText(100),
    location: nullableText(100),
    binBucket: nullableText(100),
    sourceType: nullableText(50)
  })
  .strict();

const updateSchema = z
  .object({
    model: nullableText(200),
    brand: nullableText(200),
    status: nullableText(100),
    stockAge: z.number().int().min(0).max(100000).nullable().optional(),
    ageBucket: nullableText(100),
    priority: nullableText(20),
    statusBucket: nullableText(100),
    location: nullableText(100),
    binBucket: nullableText(100),
    sourceType: nullableText(50)
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    q: z.string().trim().max(200).optional(),
    status: z.string().trim().max(100).optional(),
    ageBucket: z.string().trim().max(100).optional(),
    statusBucket: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional(),
    sort: z.enum(['barcode', 'updated_at', 'created_at', 'stock_age', 'id']).default('updated_at'),
    dir: z.enum(['asc', 'desc']).default('desc')
  })
  .strict();

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

interface InventoryRow {
  id: number;
  barcode: string;
  model: string | null;
  brand: string | null;
  status: string | null;
  stock_age: number | null;
  age_bucket: string | null;
  priority: string | null;
  status_bucket: string | null;
  location: string | null;
  bin_bucket: string | null;
  source_type: string | null;
  created_at: string;
  updated_at: string;
}

function toApi(row: InventoryRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    barcode: row.barcode,
    model: row.model,
    brand: row.brand,
    status: row.status,
    stockAge: row.stock_age === null ? null : Number(row.stock_age),
    ageBucket: row.age_bucket,
    priority: row.priority,
    statusBucket: row.status_bucket,
    location: row.location,
    binBucket: row.bin_bucket,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

type Filters = { where: string; params: Array<string | number> };

function buildFilters(query: {
  q?: string;
  status?: string;
  ageBucket?: string;
  statusBucket?: string;
  location?: string;
}): Filters {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.q) {
    clauses.push('(barcode LIKE ? OR model LIKE ? OR brand LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  if (query.status) {
    clauses.push('status = ?');
    params.push(query.status);
  }
  if (query.ageBucket) {
    clauses.push('age_bucket = ?');
    params.push(query.ageBucket);
  }
  if (query.statusBucket) {
    clauses.push('status_bucket = ?');
    params.push(query.statusBucket);
  }
  if (query.location) {
    clauses.push('location = ?');
    params.push(query.location);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const CSV_COLUMNS: Array<keyof InventoryRow> = [
  'barcode',
  'model',
  'brand',
  'status',
  'stock_age',
  'age_bucket',
  'priority',
  'status_bucket',
  'location',
  'bin_bucket',
  'source_type',
  'created_at',
  'updated_at'
];

export function inventoryRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);

  router.get('/inventory', auth, (req, res, next) => {
    try {
      const query = parseInput(listSchema, req.query);
      const { where, params } = buildFilters(query);

      const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM inventory ${where}`).get(...params) as
        | { total: number }
        | undefined;
      const total = Number(totalRow?.total ?? 0);
      const pages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
      const offset = (query.page - 1) * query.pageSize;

      const rows = db
        .prepare(
          `SELECT * FROM inventory ${where} ORDER BY ${query.sort} ${query.dir.toUpperCase()} LIMIT ? OFFSET ?`
        )
        .all(...params, query.pageSize, offset) as unknown as InventoryRow[];

      res.status(200).json({
        ok: true,
        data: { items: rows.map(toApi), page: query.page, pageSize: query.pageSize, total, pages }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/inventory/export.csv', auth, (req, res, next) => {
    try {
      const query = parseInput(listSchema, { ...req.query, page: 1, pageSize: 200 });
      const { where, params } = buildFilters(query);

      const rows = db
        .prepare(`SELECT * FROM inventory ${where} ORDER BY ${query.sort} ${query.dir.toUpperCase()}`)
        .all(...params) as unknown as InventoryRow[];

      const header = CSV_COLUMNS.join(',');
      const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
      const csv = [header, ...lines].join('\r\n') + '\r\n';

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="inventory-${stamp}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  });

  router.get('/inventory/:id', auth, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as InventoryRow | undefined;
      if (!row) throw fail.notFound(`Inventory item ${id} not found`);
      res.status(200).json({ ok: true, data: toApi(row) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/inventory', auth, requireRole('ADMIN', 'OWNER'), (req, res, next) => {
    try {
      const { user } = authContext(req);
      const body = parseInput(createSchema, req.body);
      const existing = db.prepare('SELECT id FROM inventory WHERE barcode = ?').get(body.barcode) as
        | { id: number }
        | undefined;
      if (existing) throw fail.duplicate(`Barcode ${body.barcode} already exists`, { barcode: body.barcode });

      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO inventory
            (barcode, model, brand, status, stock_age, age_bucket, priority, status_bucket, location, bin_bucket, source_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          body.barcode,
          body.model ?? null,
          body.brand ?? null,
          body.status ?? null,
          body.stockAge ?? null,
          body.ageBucket ?? null,
          body.priority ?? null,
          body.statusBucket ?? null,
          body.location ?? null,
          body.binBucket ?? null,
          body.sourceType ?? null,
          now,
          now
        );

      const row = db
        .prepare('SELECT * FROM inventory WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as unknown as InventoryRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'INVENTORY_CREATED',
        entity: 'inventory',
        entityId: row.id,
        details: { barcode: row.barcode },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toApi(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/inventory/:id', auth, requireRole('ADMIN', 'OWNER'), (req, res, next) => {
    try {
      const { user } = authContext(req);
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(updateSchema, req.body);

      const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as InventoryRow | undefined;
      if (!existing) throw fail.notFound(`Inventory item ${id} not found`);

      const columnMap: Record<string, string> = {
        model: 'model',
        brand: 'brand',
        status: 'status',
        stockAge: 'stock_age',
        ageBucket: 'age_bucket',
        priority: 'priority',
        statusBucket: 'status_bucket',
        location: 'location',
        binBucket: 'bin_bucket',
        sourceType: 'source_type'
      };

      const sets: string[] = [];
      const params: Array<string | number | null> = [];
      for (const [field, column] of Object.entries(columnMap)) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          sets.push(`${column} = ?`);
          const value = (body as Record<string, unknown>)[field];
          params.push(value === undefined ? null : (value as string | number | null));
        }
      }

      sets.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      db.prepare(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as unknown as InventoryRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'INVENTORY_UPDATED',
        entity: 'inventory',
        entityId: id,
        details: { fields: Object.keys(body) },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: toApi(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/inventory/:id', auth, requireRole('ADMIN', 'OWNER'), (req, res, next) => {
    try {
      const { user } = authContext(req);
      const { id } = parseInput(idSchema, req.params);
      const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as InventoryRow | undefined;
      if (!existing) throw fail.notFound(`Inventory item ${id} not found`);

      db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
      writeAudit(db, {
        actorEmail: user.email,
        action: 'INVENTORY_DELETED',
        entity: 'inventory',
        entityId: id,
        details: { barcode: existing.barcode },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
