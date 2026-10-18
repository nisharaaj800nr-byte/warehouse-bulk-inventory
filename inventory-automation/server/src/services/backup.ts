import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Db } from '../db/index.js';
import { logger } from '../lib/logger.js';

// Loaded through createRequire so bundlers used by the test runner do not try
// to resolve the built-in module (same approach as src/db/index.ts).
const require = createRequire(import.meta.url);
const sqlite = require('node:sqlite') as typeof import('node:sqlite');
const sqliteBackup = sqlite.backup;

export interface BackupResult {
  file: string;
  bytes: number;
  pruned: number;
}

/**
 * Takes an online SQLite backup (safe while the server is running) into a
 * `backups` folder next to the database and keeps only the newest `keep` files.
 */
export async function runBackup(db: Db, dbPath: string, keep = 7): Promise<BackupResult> {
  if (dbPath === ':memory:') {
    return { file: '', bytes: 0, pruned: 0 };
  }

  const dir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `bulkrepair-${stamp}.db`);

  await sqliteBackup(db, file);

  const size = fs.existsSync(file) ? fs.statSync(file).size : 0;

  const existing = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('bulkrepair-') && name.endsWith('.db'))
    .map((name) => ({ name, time: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  let pruned = 0;
  for (const entry of existing.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, entry.name));
      pruned += 1;
    } catch (error) {
      logger.warn('backup_prune_failed', { file: entry.name, message: (error as Error).message });
    }
  }

  logger.info('backup_created', { file, bytes: size, pruned });
  return { file, bytes: size, pruned };
}

export function listBackups(dbPath: string): Array<{ name: string; bytes: number; at: string }> {
  if (dbPath === ':memory:') return [];
  const dir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, bytes: stat.size, at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
