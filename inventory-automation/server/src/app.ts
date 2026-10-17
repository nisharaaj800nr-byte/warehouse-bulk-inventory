import express, { type Express } from 'express';
import type { Db } from './db/index.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { alertsRouter } from './routes/alerts.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { importsRouter } from './routes/imports.js';
import { insightsRouter } from './routes/insights.js';
import { inventoryRouter } from './routes/inventory.js';
import { reportsRouter } from './routes/reports.js';
import { rulesRouter } from './routes/rules.js';
import { sourcesRouter } from './routes/sources.js';
import { usersRouter } from './routes/users.js';

export interface AppOptions {
  db: Db;
  sessionTtlHours: number;
}

/** Builds the Express app. Tests inject their own throw-away database. */
export function createApp({ db, sessionTtlHours }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
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

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
