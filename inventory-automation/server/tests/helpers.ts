import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import type { Role } from '../src/auth/tokens.js';
import { openDb, type Db } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';

export interface TestContext {
  db: Db;
  app: Express;
  dbFile: string;
  cleanup: () => void;
}

export async function createTestContext(): Promise<TestContext> {
  const dbFile = path.join(os.tmpdir(), `bulkrepair-test-${randomUUID()}.db`);
  const db = openDb(dbFile);
  migrate(db);
  const app = createApp({ db, sessionTtlHours: 168, dbPath: dbFile });

  return {
    db,
    app,
    dbFile,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(`${dbFile}${suffix}`);
        } catch {
          /* file may not exist */
        }
      }
    }
  };
}

export async function seedUser(
  ctx: TestContext,
  options: { email: string; password: string; role?: Role }
): Promise<number> {
  const role = options.role ?? 'ADMIN';
  const passwordHash = await hashPassword(options.password);
  const now = new Date().toISOString();
  const result = ctx.db
    .prepare(
      `INSERT INTO users (email, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, NULL, NULL, ?, ?)`
    )
    .run(options.email, passwordHash, role, now, now);
  return Number(result.lastInsertRowid);
}

export async function loginAs(ctx: TestContext, email: string, password: string): Promise<string> {
  const response = await request(ctx.app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.token as string;
}

export async function seedAndLogin(
  ctx: TestContext,
  options: { email: string; password: string; role?: Role }
): Promise<string> {
  await seedUser(ctx, options);
  return loginAs(ctx, options.email, options.password);
}
