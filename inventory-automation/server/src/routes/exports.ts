import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import { parseInput } from '../lib/validate.js';
import { GROUPABLE, toPdfBuffer, toXlsxBuffer } from '../services/reportExport.js';

const querySchema = z
  .object({
    groupBy: z.enum(['status', 'brand', 'age_bucket', 'status_bucket', 'location', 'bin_bucket', 'model']),
    status: z.string().trim().max(100).optional(),
    brand: z.string().trim().max(200).optional(),
    ageBucket: z.string().trim().max(100).optional(),
    statusBucket: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional()
  })
  .strict();

function filtersFrom(query: z.infer<typeof querySchema>) {
  return {
    status: query.status,
    brand: query.brand,
    ageBucket: query.ageBucket,
    statusBucket: query.statusBucket,
    location: query.location
  };
}

export function exportsRouter(db: Db): Router {
  const router = Router();
  const auth = requireAuth(db);

  router.get('/reports/export.xlsx', auth, (req, res, next) => {
    try {
      const query = parseInput(querySchema, req.query);
      if (!GROUPABLE[query.groupBy]) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Unknown groupBy' } });
        return;
      }

      const buffer = toXlsxBuffer(db, query.groupBy, filtersFrom(query));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="inventory-${query.groupBy}.xlsx"`);
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/export.pdf', auth, async (req, res, next) => {
    try {
      const query = parseInput(querySchema, req.query);
      const buffer = await toPdfBuffer(db, query.groupBy, filtersFrom(query));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="inventory-${query.groupBy}.pdf"`);
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
