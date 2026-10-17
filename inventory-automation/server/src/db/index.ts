import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * `node:sqlite` is a Node built-in that some bundlers used in the test runner
 * cannot resolve directly. Loading it through createRequire keeps the exact
 * same runtime module while remaining resolution-agnostic.
 */
const require = createRequire(import.meta.url);
const sqlite = require('node:sqlite') as typeof import('node:sqlite');

export type Db = DatabaseSync;

const PRAGMAS = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA synchronous = NORMAL'
];

/**
 * Opens (and creates when needed) the SQLite database used by the server.
 * WAL is enabled for file-backed databases so reads never block writes.
 */
export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new sqlite.DatabaseSync(dbPath);
  for (const pragma of PRAGMAS) db.exec(pragma);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  return db;
}
