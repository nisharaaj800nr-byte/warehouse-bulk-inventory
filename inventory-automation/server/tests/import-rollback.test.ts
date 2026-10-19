import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let token: string;

beforeEach(async () => {
  ctx = await createTestContext();
  token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
});

afterEach(() => {
  ctx.cleanup();
});

function gas(action: string, params: Record<string, unknown> = {}) {
  return request(ctx.app).post('/api/gas').send({ action, params });
}

const CSV = [
  'Barcode,Model,Brand,Status,Age,Location',
  'RB-1,Updated Model,Acme,NEW_STATUS,45,L9',
  'RB-2,Fresh Item,Beta,READY,10,L1'
].join('\n');

describe('import rollback', () => {
  it('restores updated rows and removes rows created by the import', async () => {
    await gas('inventory.save', {
      token,
      item: { BARCODE: 'RB-1', MODEL: 'Original Model', BRAND: 'Acme', STATUS: 'OLD_STATUS', LOCATION: 'A1' }
    });

    const staged = await gas('import.fileB64', {
      token,
      fileName: 'rollback.csv',
      b64: Buffer.from(CSV, 'utf8').toString('base64')
    });
    expect(staged.body.status).toBe('ok');

    const commit = await gas('import.commit', { token, staging: staged.body.data.staging });
    expect(commit.body.status).toBe('ok');
    expect(commit.body.data.imported).toBe(2);
    const jobId = Number(commit.body.data.jobId);
    expect(jobId).toBeGreaterThan(0);

    const afterCommit = await gas('inventory.list', { token, q: 'RB-1' });
    expect(afterCommit.body.data.rows[0][3]).toBe('NEW_STATUS');

    const rollback = await gas('import.rollback', { token, jobId });
    expect(rollback.body.status).toBe('ok');
    expect(rollback.body.data.restored).toBe(1);
    expect(rollback.body.data.removed).toBe(1);

    const restored = await gas('inventory.list', { token, q: 'RB-1' });
    expect(restored.body.data.rows[0][1]).toBe('Original Model');
    expect(restored.body.data.rows[0][3]).toBe('OLD_STATUS');
    expect(restored.body.data.rows[0][8]).toBe('A1');

    const removed = await gas('inventory.list', { token, q: 'RB-2' });
    expect(removed.body.data.total).toBe(0);
  });

  it('rejects a second rollback for the same job', async () => {
    const staged = await gas('import.fileB64', {
      token,
      fileName: 'once.csv',
      b64: Buffer.from(CSV, 'utf8').toString('base64')
    });
    const commit = await gas('import.commit', { token, staging: staged.body.data.staging });
    const jobId = Number(commit.body.data.jobId);

    const first = await gas('import.rollback', { token, jobId });
    expect(first.body.status).toBe('ok');

    const second = await gas('import.rollback', { token, jobId });
    expect(second.body.status).toBe('error');
    expect(String(second.body.message)).toMatch(/already rolled back/i);
  });
});
