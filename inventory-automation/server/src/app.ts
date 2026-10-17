import express, { type Express } from 'express';
import type { Db } from './db/index.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { inventoryRouter } from './routes/inventory.js';

export interface AppOptions {
  db: Db;
  sessionTtlHours: number;
}

/** Builds the Express app. Tests inject their own throw-away database. */
export function createApp({ db, sessionTtlHours }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  app.use((req, _res, next) => {
    logger.debug('http_request', { method: req.method, path: req.originalUrl, ip: req.ip });
    next();
  });

  app.use('/api', healthRouter(db));
  app.use('/api', authRouter(db, sessionTtlHours));
  app.use('/api', inventoryRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
