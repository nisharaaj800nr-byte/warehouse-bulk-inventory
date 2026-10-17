import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { logger } from './lib/logger.js';

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const applied = migrate(db);

  const app = createApp({ db, sessionTtlHours: config.sessionTtlHours });
  const server = app.listen(config.port, config.host, () => {
    logger.info('server_started', {
      host: config.host,
      port: config.port,
      dbPath: config.dbPath,
      sessionTtlHours: config.sessionTtlHours,
      migrationsApplied: applied
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server_stopping', { signal });
    server.close(() => {
      try {
        db.close();
      } catch (error) {
        logger.error('db_close_failed', { message: (error as Error).message });
      }
      logger.info('server_stopped', { signal });
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
