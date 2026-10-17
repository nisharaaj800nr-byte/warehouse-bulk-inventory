import { MIGRATIONS } from './migrations.js';
import type { Db } from './index.js';

const VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

/**
 * Applies every migration that has not been applied yet, in ascending order.
 * Idempotent: safe to call on every boot.
 */
export function migrate(db: Db): number {
  db.exec(VERSION_TABLE);

  const appliedRows = db.prepare('SELECT version FROM schema_version').all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => Number(row.version)));

  let count = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString()
      );
      db.exec('COMMIT');
      count += 1;
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${(error as Error).message}`);
    }
  }

  return count;
}
