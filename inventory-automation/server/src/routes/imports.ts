import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authContext, requireAuth, requireRole } from '../auth/middleware.js';
import { writeAudit } from '../lib/audit.js';
import { fail } from '../lib/errors.js';
import { parseInput } from '../lib/validate.js';
import { loadMappings, mapRow, mergeSources, upsertInventory } from '../services/importService.js';
import { parseWorkbookToRows } from '../services/fileImport.js';
import { stageUpload } from '../services/staging.js';
import { loadRules, type MappedRow } from '../services/rulesEngine.js';

const idSchema = z.object({ id: z.coerce.number().int().min(1) }).strict();

const rawRowSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

const uploadSchema = z
  .object({
    sourceId: z.number().int().min(1),
    filename: z.string().trim().max(200).nullable().optional(),
    rows: z.array(rawRowSchema).min(1).max(5000)
  })
  .strict();

const mergeSchema = z
  .object({
    batches: z
      .array(
        z
          .object({
            sourceId: z.number().int().min(1),
            rows: z.array(rawRowSchema).min(1).max(5000)
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict();

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    status: z.enum(['UPLOADED', 'COMPLETE', 'PARTIAL_FAILURE', 'DISCARDED']).optional()
  })
  .strict();

const previewQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50)
  })
  .strict();

interface JobRow {
  id: number;
  kind: string;
  source_id: number | null;
  status: string;
  filename: string | null;
  rows_total: number;
  rows_ok: number;
  rows_failed: number;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

function toJob(row: JobRow) {
  return {
    id: Number(row.id),
    kind: row.kind,
    sourceId: row.source_id === null ? null : Number(row.source_id),
    status: row.status,
    filename: row.filename,
    rowsTotal: Number(row.rows_total),
    rowsOk: Number(row.rows_ok),
    rowsFailed: Number(row.rows_failed),
    createdBy: row.created_by,
    createdAt: row.created_at,
    finishedAt: row.finished_at
  };
}

export function importsRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);
  const operator = requireRole('ADMIN', 'OWNER', 'MANAGER', 'OPERATOR');

const uploadFileSchema = z
  .object({
    sourceId: z.number().int().min(1),
    filename: z.string().trim().min(1).max(200),
    contentBase64: z.string().min(1).max(40000000)
  })
  .strict();

  router.post('/imports/upload', auth, operator, (req, res, next) => {
    try {
      const body = parseInput(uploadSchema, req.body);
      const { user } = authContext(req);

      const result = stageUpload(db, {
        sourceId: body.sourceId,
        filename: body.filename ?? null,
        rows: body.rows as Array<Record<string, unknown>>,
        createdBy: user.email
      });

      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(result.jobId) as unknown as JobRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'IMPORT_UPLOADED',
        entity: 'import_job',
        entityId: result.jobId,
        details: { rows: result.rowsTotal, ok: result.rowsOk, failed: result.rowsFailed },
        ip: req.ip
      });
      res.status(201).json({ ok: true, data: toJob(job) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/imports/upload-file', auth, operator, (req, res, next) => {
    try {
      const body = parseInput(uploadFileSchema, req.body);
      const { user } = authContext(req);

      const buffer = Buffer.from(body.contentBase64, 'base64');
      const parsed = parseWorkbookToRows(body.filename, buffer);

      const result = stageUpload(db, {
        sourceId: body.sourceId,
        filename: body.filename,
        rows: parsed.rows,
        createdBy: user.email
      });

      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(result.jobId) as unknown as JobRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'IMPORT_FILE_UPLOADED',
        entity: 'import_job',
        entityId: result.jobId,
        details: { filename: body.filename, sheet: parsed.sheetName, headers: parsed.headers, rows: result.rowsTotal },
        ip: req.ip
      });

      res.status(201).json({
        ok: true,
        data: { job: toJob(job), sheet: parsed.sheetName, headers: parsed.headers, rowsParsed: parsed.rows.length }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/imports', auth, (req, res, next) => {
    try {
      const query = parseInput(listQuerySchema, req.query);
      const where = query.status ? 'WHERE status = ?' : '';
      const params = query.status ? [query.status] : [];

      const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM import_jobs ${where}`).get(...params) as
        | { total: number }
        | undefined;
      const rows = db
        .prepare(`SELECT * FROM import_jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as unknown as JobRow[];

      const total = Number(totalRow?.total ?? 0);
      res.status(200).json({
        ok: true,
        data: {
          items: rows.map(toJob),
          page: query.page,
          pageSize: query.pageSize,
          total,
          pages: total === 0 ? 0 : Math.ceil(total / query.pageSize)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/imports/:id', auth, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as JobRow | undefined;
      if (!job) throw fail.notFound(`Import job ${id} not found`);

      const errors = db
        .prepare('SELECT row_number, barcode, field, message FROM import_errors WHERE job_id = ? ORDER BY row_number ASC, id ASC LIMIT 200')
        .all(id) as unknown as Array<{ row_number: number; barcode: string | null; field: string; message: string }>;

      res.status(200).json({
        ok: true,
        data: {
          job: toJob(job),
          errors: errors.map((row) => ({
            row: Number(row.row_number),
            barcode: row.barcode,
            field: row.field,
            message: row.message
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/imports/:id/preview', auth, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const query = parseInput(previewQuerySchema, req.query);
      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as JobRow | undefined;
      if (!job) throw fail.notFound(`Import job ${id} not found`);

      const totalRow = db.prepare('SELECT COUNT(*) AS total FROM import_rows WHERE job_id = ?').get(id) as
        | { total: number }
        | undefined;
      const rows = db
        .prepare('SELECT row_number, barcode, mapped_json, error FROM import_rows WHERE job_id = ? ORDER BY row_number ASC LIMIT ? OFFSET ?')
        .all(id, query.pageSize, (query.page - 1) * query.pageSize) as unknown as Array<{
        row_number: number;
        barcode: string | null;
        mapped_json: string | null;
        error: string | null;
      }>;

      const total = Number(totalRow?.total ?? 0);
      res.status(200).json({
        ok: true,
        data: {
          job: toJob(job),
          rows: rows.map((row) => ({
            row: Number(row.row_number),
            barcode: row.barcode,
            mapped: row.mapped_json ? JSON.parse(row.mapped_json) : null,
            error: row.error
          })),
          page: query.page,
          pageSize: query.pageSize,
          total,
          pages: total === 0 ? 0 : Math.ceil(total / query.pageSize)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/imports/:id/commit', auth, operator, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const { user } = authContext(req);
      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as JobRow | undefined;
      if (!job) throw fail.notFound(`Import job ${id} not found`);
      if (job.status !== 'UPLOADED') {
        throw fail.duplicate(`Import job ${id} is ${job.status} and cannot be committed again`);
      }

      const rules = loadRules(db);
      const rows = db
        .prepare('SELECT id, row_number, mapped_json FROM import_rows WHERE job_id = ? AND mapped_json IS NOT NULL ORDER BY row_number ASC')
        .all(id) as unknown as Array<{ id: number; row_number: number; mapped_json: string }>;

      let inserted = 0;
      let updated = 0;

      db.exec('BEGIN');
      try {
        for (const row of rows) {
          const mapped = JSON.parse(row.mapped_json) as MappedRow;
          const { action } = upsertInventory(db, mapped, rules);
          if (action === 'inserted') inserted += 1;
          else updated += 1;
        }

        const status = Number(job.rows_failed) > 0 ? 'PARTIAL_FAILURE' : 'COMPLETE';
        db.prepare('UPDATE import_jobs SET status = ?, finished_at = ? WHERE id = ?').run(
          status,
          new Date().toISOString(),
          id
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const updatedJob = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as unknown as JobRow;
      writeAudit(db, {
        actorEmail: user.email,
        action: 'IMPORT_COMMITTED',
        entity: 'import_job',
        entityId: id,
        details: { inserted, updated, status: updatedJob.status },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: { job: toJob(updatedJob), inserted, updated } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/imports/:id/discard', auth, operator, (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const { user } = authContext(req);
      const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as JobRow | undefined;
      if (!job) throw fail.notFound(`Import job ${id} not found`);
      if (job.status !== 'UPLOADED') throw fail.duplicate(`Import job ${id} is already ${job.status}`);

      db.prepare('UPDATE import_jobs SET status = ?, finished_at = ? WHERE id = ?').run(
        'DISCARDED',
        new Date().toISOString(),
        id
      );
      db.prepare('DELETE FROM import_rows WHERE job_id = ?').run(id);

      writeAudit(db, {
        actorEmail: user.email,
        action: 'IMPORT_DISCARDED',
        entity: 'import_job',
        entityId: id,
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: { discarded: true, id } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/imports/merge', auth, operator, (req, res, next) => {
    try {
      const body = parseInput(mergeSchema, req.body);
      const { user } = authContext(req);
      const now = new Date().toISOString();

      const result = mergeSources(
        db,
        body.batches.map((batch) => ({ sourceId: batch.sourceId, rows: batch.rows as Array<Record<string, unknown>> }))
      );

      const totalRows = body.batches.reduce((sum, batch) => sum + batch.rows.length, 0);
      const jobResult = db
        .prepare(
          `INSERT INTO import_jobs (kind, source_id, status, filename, rows_total, rows_ok, rows_failed, created_by, created_at, finished_at)
           VALUES ('MULTI', NULL, ?, NULL, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          result.errors.length > 0 ? 'PARTIAL_FAILURE' : 'COMPLETE',
          totalRows,
          result.devices,
          result.errors.length,
          user.email,
          now,
          new Date().toISOString()
        );

      writeAudit(db, {
        actorEmail: user.email,
        action: 'IMPORT_MERGED',
        entity: 'import_job',
        entityId: Number(jobResult.lastInsertRowid),
        details: { batches: body.batches.length, ...result },
        ip: req.ip
      });

      res.status(200).json({
        ok: true,
        data: {
          jobId: Number(jobResult.lastInsertRowid),
          devices: result.devices,
          inserted: result.inserted,
          updated: result.updated,
          conflicts: result.conflicts,
          errors: result.errors
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conflicts', auth, (_req, res, next) => {
    try {
      const rows = db
        .prepare('SELECT * FROM data_conflicts ORDER BY created_at DESC, id DESC LIMIT 500')
        .all() as unknown as Array<{
        id: number;
        barcode: string;
        field: string;
        source_a: string;
        value_a: string | null;
        source_b: string;
        value_b: string | null;
        final_value: string | null;
        rule: string;
        created_at: string;
      }>;

      res.status(200).json({
        ok: true,
        data: rows.map((row) => ({
          id: Number(row.id),
          barcode: row.barcode,
          field: row.field,
          sourceA: row.source_a,
          valueA: row.value_a,
          sourceB: row.source_b,
          valueB: row.value_b,
          finalValue: row.final_value,
          rule: row.rule,
          createdAt: row.created_at
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/conflicts/clear', auth, requireRole('ADMIN', 'OWNER'), (req, res, next) => {
    try {
      const { user } = authContext(req);
      const result = db.prepare('DELETE FROM data_conflicts').run();
      writeAudit(db, {
        actorEmail: user.email,
        action: 'CONFLICTS_CLEARED',
        entity: 'data_conflict',
        details: { deleted: Number(result.changes) },
        ip: req.ip
      });
      res.status(200).json({ ok: true, data: { deleted: Number(result.changes) } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
