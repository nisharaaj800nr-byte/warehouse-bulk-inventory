import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import { parseInput } from '../lib/validate.js';

const trendsQuerySchema = z
  .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
  .strict();

function groupCounts(db: Db, column: string, limit: number): Array<{ key: string; count: number }> {
  const rows = db
    .prepare(
      `SELECT COALESCE(${column}, '(empty)') AS key, COUNT(*) AS count
       FROM inventory GROUP BY key ORDER BY count DESC, key ASC LIMIT ?`
    )
    .all(limit) as unknown as Array<{ key: string; count: number }>;
  return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
}

export function insightsRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);

  router.get('/dashboard', auth, (_req, res, next) => {
    try {
      const totalRow = db.prepare('SELECT COUNT(*) AS total FROM inventory').get() as { total: number };
      const jobs = db
        .prepare(
          `SELECT id, kind, status, rows_total, rows_ok, rows_failed, created_at
           FROM import_jobs ORDER BY created_at DESC LIMIT 5`
        )
        .all() as unknown as Array<{
        id: number;
        kind: string;
        status: string;
        rows_total: number;
        rows_ok: number;
        rows_failed: number;
        created_at: string;
      }>;
      const alertsFiring = db
        .prepare("SELECT COUNT(*) AS count FROM alerts WHERE is_active = 1")
        .get() as { count: number };
      const conflicts = db.prepare('SELECT COUNT(*) AS count FROM data_conflicts').get() as { count: number };

      res.status(200).json({
        ok: true,
        data: {
          inventoryTotal: Number(totalRow.total),
          activeAlerts: Number(alertsFiring.count),
          openConflicts: Number(conflicts.count),
          byStatus: groupCounts(db, 'status', 10),
          byAgeBucket: groupCounts(db, 'age_bucket', 10),
          byStatusBucket: groupCounts(db, 'status_bucket', 10),
          topBrands: groupCounts(db, 'brand', 5),
          recentImports: jobs.map((job) => ({
            id: Number(job.id),
            kind: job.kind,
            status: job.status,
            rowsTotal: Number(job.rows_total),
            rowsOk: Number(job.rows_ok),
            rowsFailed: Number(job.rows_failed),
            createdAt: job.created_at
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/quality', auth, (_req, res, next) => {
    try {
      const totalRow = db.prepare('SELECT COUNT(*) AS total FROM inventory').get() as { total: number };
      const missing = (column: string): number => {
        const row = db
          .prepare(`SELECT COUNT(*) AS count FROM inventory WHERE ${column} IS NULL OR TRIM(${column}) = ''`)
          .get() as { count: number };
        return Number(row.count);
      };

      const total = Number(totalRow.total);
      const checks = {
        missingModel: missing('model'),
        missingBrand: missing('brand'),
        missingStatus: missing('status'),
        missingLocation: missing('location'),
        missingAgeBucket: missing('age_bucket'),
        missingBinBucket: missing('bin_bucket')
      };
      const missingValues = Object.values(checks).reduce((sum, value) => sum + value, 0);

      res.status(200).json({
        ok: true,
        data: {
          inventoryTotal: total,
          ...checks,
          score: total === 0 ? 100 : Math.max(0, Math.round(100 - (missingValues / (total * 6)) * 100))
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/trends', auth, (req, res, next) => {
    try {
      const query = parseInput(trendsQuerySchema, req.query);
      const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000).toISOString();
      const rows = db
        .prepare(
          `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
           FROM inventory WHERE created_at >= ?
           GROUP BY day ORDER BY day ASC`
        )
        .all(since) as unknown as Array<{ day: string; count: number }>;

      res.status(200).json({
        ok: true,
        data: {
          days: query.days,
          series: rows.map((row) => ({ day: row.day, count: Number(row.count) }))
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
