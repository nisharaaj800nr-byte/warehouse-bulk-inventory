import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { logger } from './lib/logger.js';
import { runBackup } from './services/backup.js';
import { runDueReports } from './services/scheduledReports.js';

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const applied = migrate(db);

  const app = createApp({ db, sessionTtlHours: config.sessionTtlHours, dbPath: config.dbPath });
  const server = app.listen(config.port, config.host, () => {
    logger.info('server_started', {
      host: config.host,
      port: config.port,
      dbPath: config.dbPath,
      sessionTtlHours: config.sessionTtlHours,
      migrationsApplied: applied
    });
  });

  // Automatic local backups: once after boot, then every 6 hours. Keeps the
  // newest 7 files next to the database so a bad day is always recoverable.
  const backupEveryMs = 6 * 60 * 60 * 1000;
  const backupTimer = setTimeout(() => {
    void runBackup(db, config.dbPath).catch((error) =>
      logger.error('backup_failed', { message: (error as Error).message })
    );
  }, 5000);
  const backupInterval = setInterval(() => {
    void runBackup(db, config.dbPath).catch((error) =>
      logger.error('backup_failed', { message: (error as Error).message })
    );
  }, backupEveryMs);
  backupTimer.unref?.();
  backupInterval.unref?.();

  // Scheduled reports: check every 30 minutes. Each schedule tracks its own
  // last_run_at, so a restart never double-sends a due report.
  const scheduleTimer = setTimeout(() => {
    void runDueReports(db)
      .then((results) => {
        for (const result of results) {
          logger.info(result.ok ? 'scheduled_report_sent' : 'scheduled_report_failed', { ...result });
        }
      })
      .catch((error) => logger.error('scheduled_reports_failed', { message: (error as Error).message }));
  }, 15000);
  const scheduleInterval = setInterval(() => {
    void runDueReports(db)
      .then((results) => {
        for (const result of results) {
          logger.info(result.ok ? 'scheduled_report_sent' : 'scheduled_report_failed', { ...result });
        }
      })
      .catch((error) => logger.error('scheduled_reports_failed', { message: (error as Error).message }));
  }, 30 * 60 * 1000);
  scheduleTimer.unref?.();
  scheduleInterval.unref?.();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server_stopping', { signal });
    clearTimeout(backupTimer);
    clearInterval(backupInterval);
    clearTimeout(scheduleTimer);
    clearInterval(scheduleInterval);
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
