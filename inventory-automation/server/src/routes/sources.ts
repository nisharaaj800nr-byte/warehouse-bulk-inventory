import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';

const SOURCE_TYPES = ['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'] as const;

const sourceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    sourceType: z.enum(SOURCE_TYPES),
    sheetName: z.string().trim().max(200).nullable().optional(),
    joinKey: z.string().trim().min(1).max(50).optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const sourceUpdateSchema = sourceSchema.partial().strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

const mappingItemSchema = z
  .object({
    sourceColumn: z.string().trim().min(1).max(100),
    targetField: z.string().trim().min(1).max(50),
    isRequired: z.boolean().optional(),
    outputOrder: z.number().int().min(0).max(1000).nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const mappingPayloadSchema = z.object({ mappings: z.array(mappingItemSchema).max(200) }).strict();

interface SourceRow {
  id: number;
  name: string;
  source_type: string;
  sheet_name: string | null;
  join_key: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface MappingRow {
  id: number;
  source_id: number;
  source_column: string;
  target_field: string;
  is_required: number;
  output_order: number | null;
  is_active: number;
}

function toSource(row: SourceRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    name: row.name,
    sourceType: row.source_type,
    sheetName: row.sheet_name,
    joinKey: row.join_key,
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMapping(row: MappingRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    sourceId: Number(row.source_id),
    sourceColumn: row.source_column,
    targetField: row.target_field,
    isRequired: Number(row.is_required) === 1,
    outputOrder: row.output_order === null ? null : Number(row.output_order),
    isActive: Number(row.is_active) === 1
  };
}

export function sourcesRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);
  const admin = requireRole('ADMIN', 'OWNER');

  router.get('/sources/types', auth, (_req, res) => {
    res.status(200).json({ ok: true, data: SOURCE_TYPES });
  });

  router.get('/sources', auth, (_req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM sources ORDER BY name ASC').all() as unknown as SourceRow[];
      res.status(200).json({ ok: true, data: rows.map(toSource) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sources', auth, admin, (req, res, next) => {
    try {
      const body = parseInput(sourceSchema, req.body);
      const { user } = authContext(req);

      const existing = db.prepare('SELECT id FROM sources WHERE name = ?').get(body.name) as { id: number } | undefined;
      if (existing) throw fail.duplicate(`Source ${body.name} already exists`, { name: body.name });

      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO sources (name, source_type, sheet_name, join_key, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          body.name,
          body.sourceType,
          body.sheetName ?? null,
          body.joinKey ?? 'barcode',
          body.isActive === false ? 0 : 1,
          now,
          now
        );

      const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as SourceRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'SOURCE_CREATED',
        entity: 'source',
        entityId: row.id,
        details: { name: row.name, sourceType: row.source_type },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toSource(row) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/sources/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(sourceUpdateSchema, req.body);
      const { user } = authContext(req);

      const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
      if (!existing) throw fail.notFound(`Source ${id} not found`);

      if (body.name !== undefined && body.name !== existing.name) {
        const duplicate = db.prepare('SELECT id FROM sources WHERE name = ?').get(body.name) as { id: number } | undefined;
        if (duplicate) throw fail.duplicate(`Source ${body.name} already exists`, { name: body.name });
      }

      db.prepare(
        `UPDATE sources SET name = ?, source_type = ?, sheet_name = ?, join_key = ?, is_active = ?, updated_at = ? WHERE id = ?`
      ).run(
        body.name ?? existing.name,
        body.sourceType ?? existing.source_type,
        body.sheetName === undefined ? existing.sheet_name : body.sheetName,
        body.joinKey ?? existing.join_key,
        body.isActive === undefined ? Number(existing.is_active) : body.isActive ? 1 : 0,
        new Date().toISOString(),
        id
      );

      const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as unknown as SourceRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'SOURCE_UPDATED',
        entity: 'source',
        entityId: id,
        details: { fields: Object.keys(body) },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: toSource(row) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/sources/:id', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const { user } = authContext(req);

      const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
      if (!existing) throw fail.notFound(`Source ${id} not found`);

      db.prepare('DELETE FROM sources WHERE id = ?').run(id);
      writeAudit(db, {
        actorEmail: user.email,
        action: 'SOURCE_DELETED',
        entity: 'source',
        entityId: id,
        details: { name: existing.name },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: { deleted: true, id } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sources/:id/mapping', auth, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const source = db.prepare('SELECT id FROM sources WHERE id = ?').get(id) as { id: number } | undefined;
      if (!source) throw fail.notFound(`Source ${id} not found`);

      const rows = db
        .prepare('SELECT * FROM field_mappings WHERE source_id = ? ORDER BY output_order ASC, id ASC')
        .all(id) as unknown as MappingRow[];
      res.status(200).json({ ok: true, data: rows.map(toMapping) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/sources/:id/mapping', auth, admin, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const body = parseInput(mappingPayloadSchema, req.body);
      const { user } = authContext(req);

      const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
      if (!source) throw fail.notFound(`Source ${id} not found`);

      const columns = new Set<string>();
      for (const mapping of body.mappings) {
        const key = mapping.sourceColumn.toLowerCase();
        if (columns.has(key)) throw fail.duplicate(`Duplicate mapping for column ${mapping.sourceColumn}`, { column: mapping.sourceColumn });
        columns.add(key);
      }

      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM field_mappings WHERE source_id = ?').run(id);
        const insert = db.prepare(
          `INSERT INTO field_mappings (source_id, source_column, target_field, is_required, output_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const mapping of body.mappings) {
          insert.run(
            id,
            mapping.sourceColumn,
            mapping.targetField,
            mapping.isRequired ? 1 : 0,
            mapping.outputOrder ?? null,
            mapping.isActive === false ? 0 : 1
          );
        }
        db.prepare('UPDATE sources SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const rows = db
        .prepare('SELECT * FROM field_mappings WHERE source_id = ? ORDER BY output_order ASC, id ASC')
        .all(id) as unknown as MappingRow[];
      writeAudit(db, {
        actorEmail: user.email,
        action: 'MAPPING_REPLACED',
        entity: 'source',
        entityId: id,
        details: { mappings: rows.length },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: rows.map(toMapping) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export { SOURCE_TYPES };
