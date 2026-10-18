import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db/index.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { alertsRouter } from './routes/alerts.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { importsRouter } from './routes/imports.js';
import { insightsRouter } from './routes/insights.js';
import { inventoryRouter } from './routes/inventory.js';
import { legacyRouter } from './routes/legacy.js';
import { reportsRouter } from './routes/reports.js';
import { rulesRouter } from './routes/rules.js';
import { sourcesRouter } from './routes/sources.js';
import { usersRouter } from './routes/users.js';

export interface AppOptions {
  db: Db;
  sessionTtlHours: number;
  dbPath?: string;
}

/** Builds the Express app. Tests inject their own throw-away database. */
export function createApp({ db, sessionTtlHours, dbPath = ':memory:' }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  // Packaged desktop/mobile shells load the panel from file:// or a custom
  // scheme, so the API must accept those origins and text/plain bodies
  // (the panel avoids preflight by sending text/plain).
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.text({ type: 'text/plain', limit: '10mb' }));
  app.use(express.json({ limit: '5mb' }));

  app.use((req, _res, next) => {
    logger.debug('http_request', { method: req.method, path: req.originalUrl, ip: req.ip });
    next();
  });

  app.use('/api', healthRouter(db));
  app.use('/api', authRouter(db, sessionTtlHours));
  app.use('/api', usersRouter(db));
  app.use('/api', sourcesRouter(db));
  app.use('/api', rulesRouter(db));
  app.use('/api', importsRouter(db));
  app.use('/api', reportsRouter(db));
  app.use('/api', alertsRouter(db));
  app.use('/api', insightsRouter(db));
  app.use('/api', inventoryRouter(db));
  app.use('/api', legacyRouter(db, sessionTtlHours, dbPath));

  // The built React panel is served from the same origin, so the app is a
  // single process: UI at /, API at /api. No separate web server needed.
  const publicDir = fileURLToPath(new URL('../public', import.meta.url));
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
