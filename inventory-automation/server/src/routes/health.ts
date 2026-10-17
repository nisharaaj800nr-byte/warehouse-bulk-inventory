import { Router } from 'express';
import type { Db } from '../db/index.js';

const startedAt = Date.now();

export function healthRouter(db: Db): Router {
  const router = Router();

  router.get('/health', (_req, res, next) => {
    try {
      const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
      if (!row || Number(row.ok) !== 1) {
        throw new Error('Database health probe returned an unexpected result');
      }
      const versionRow = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as
        | { version: number | null }
        | undefined;

      res.status(200).json({
        ok: true,
        data: {
          status: 'ok',
          db: 'connected',
          schemaVersion: versionRow?.version ?? null,
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          time: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
